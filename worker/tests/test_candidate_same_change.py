"""같은 변경 확인 재료: 공백을 무시한 diff 값·cherry-pick 표시·PR·이슈 번호 참조.

공백을 무시한 diff 값은 합성 git 저장소에서 만든 실제 커밋을 GitHub 커밋 상세 모양으로 옮기고,
파일 모드 줄은 같은 커밋의 diff 형식 출력(`git diff-tree -p`)을 수집과 같은 함수로 읽어 넣어
계산한다. 그 값을 같은 커밋의 `git patch-id --stable` 값과 대조한다. 사례 번호(C14·C20~C26)는
작업 동일성 판별 기준의 사례표를 따른다. 여기서는 diff 값과 관계 근거만 보고, 합칠지는 후보
묶음 시험이 본다.
"""

from dataclasses import replace

import pytest
from git_synthetic import (
    GitRepo,
    commit_changes,
    python_module,
    requires_git,
    two_branches,
)
from github_synthetic import MEMBER, NAME, OWNER, REPOSITORY, line_counts

from app.candidates.same_change import (
    cherry_pick_sources,
    content_patch_id,
    issue_references,
    pull_request_references,
    stable_patch_id,
)
from app.collection import normalize
from app.collection.records import ChangedFile, CommitChanges, DetailStatus

SHA_A = "a" * 40
SHA_B = "0123456789abcdef0123456789abcdef01234567"
SHA_256 = "b" * 64
PULL_URL = f"https://github.com/{OWNER}/{NAME}/pull"


def _modes(repo: GitRepo, sha: str) -> dict[str, tuple[str, ...]]:
    """diff 형식 출력에서 수집과 같은 함수로 읽은 파일별 모드 줄."""
    modes = normalize.diff_file_modes(repo.github_diff(sha))
    assert modes is not None
    return modes


def _observed(repo: GitRepo, sha: str) -> CommitChanges:
    """모드 줄까지 관측한 커밋 변경."""
    return commit_changes(repo.github_files(sha), modes=_modes(repo, sha))


def _ours(repo: GitRepo, sha: str) -> str | None:
    return stable_patch_id(_observed(repo, sha))


def _matching_git(repo: GitRepo, sha: str) -> str:
    value = _ours(repo, sha)
    assert value is not None
    assert value == repo.git_patch_id(sha)
    return value


def _patch(repo: GitRepo, sha: str, path: str) -> str:
    entry = next(f for f in repo.github_files(sha) if f["filename"] == path)
    patch = entry["patch"]
    assert isinstance(patch, str)
    return patch


def _changed_lines(patch: str) -> list[str]:
    return [line for line in patch.split("\n") if line[:1] in ("+", "-")]


# git patch-id --stable과 같은 값


@requires_git
def test_modified_file_matches_git(repo: GitRepo) -> None:
    repo.write("app.py", python_module('message = "old"'))
    repo.commit("기준")
    repo.write("app.py", python_module('message = "new"'))
    value = _matching_git(repo, repo.commit("수정"))
    assert len(value) == 40 and value == value.lower()


@requires_git
def test_several_files_match_git_in_any_order(repo: GitRepo) -> None:
    for path in ("a.txt", "dir/b.py", "z.md"):
        repo.write(path, "one\ntwo\nthree\n")
    repo.commit("기준")
    for path in ("a.txt", "dir/b.py", "z.md"):
        repo.write(path, f"one\n{path}\nthree\n")
    sha = repo.commit("세 파일 수정")
    files = repo.github_files(sha)
    assert len(files) == 3
    value = _matching_git(repo, sha)
    modes = _modes(repo, sha)
    assert stable_patch_id(commit_changes(list(reversed(files)), modes=modes)) == value
    assert (
        stable_patch_id(commit_changes([files[1], files[2], files[0]], modes=modes))
        == value
    )


@requires_git
def test_added_and_root_files_match_git(repo: GitRepo) -> None:
    repo.write("first.txt", "a\nb\n")
    root = repo.commit("첫 커밋")
    _matching_git(repo, root)
    repo.write("dir/new.py", "x = 1\n")
    added = repo.commit("파일 추가")
    assert [f["status"] for f in repo.github_files(added)] == ["added"]
    _matching_git(repo, added)


@requires_git
def test_removed_file_matches_git(repo: GitRepo) -> None:
    repo.write("keep.txt", "keep\n")
    repo.write("gone.txt", "a\nb\nc\n")
    repo.commit("기준")
    repo.remove("gone.txt")
    removed = repo.commit("파일 삭제")
    assert [f["status"] for f in repo.github_files(removed)] == ["removed"]
    _matching_git(repo, removed)


@requires_git
def test_missing_final_newline_matches_git(repo: GitRepo) -> None:
    repo.write("end.txt", "first\nlast")
    repo.commit("끝 줄바꿈 없음")
    repo.write("end.txt", "first\nLAST")
    changed_last = repo.commit("끝 줄 수정")
    assert "\\ No newline at end of file" in _patch(repo, changed_last, "end.txt")
    _matching_git(repo, changed_last)
    repo.write("end.txt", "first\nLAST\nmore\n")
    appended = repo.commit("끝에 줄 추가")
    patch = _patch(repo, appended, "end.txt")
    # 표시가 덩어리 가운데(뺀 줄 바로 뒤)에 온다.
    assert "-LAST\n\\ No newline at end of file\n+LAST" in patch
    _matching_git(repo, appended)


@requires_git
def test_crlf_lines_match_git(repo: GitRepo) -> None:
    repo.write("win.txt", "one\r\ntwo\r\nthree\r\n")
    repo.commit("CRLF 기준")
    repo.write("win.txt", "one\r\nTWO\r\nthree\r\n")
    sha = repo.commit("CRLF 수정")
    assert "+TWO\r" in _patch(repo, sha, "win.txt")
    _matching_git(repo, sha)


@requires_git
def test_vertical_tab_and_form_feed_are_not_removed_like_git(repo: GitRepo) -> None:
    repo.write("ctl.txt", "a\x0cb\nc\x0bd\n")
    repo.commit("제어 문자 기준")
    repo.write("ctl.txt", "a\x0cB\nc\x0bD\n")
    _matching_git(repo, repo.commit("제어 문자 줄 수정"))


@requires_git
def test_paths_git_quotes_or_keeps_match_git(repo: GitRepo) -> None:
    paths = ['q"uote.txt', "back\\slash.txt", "tab\there.txt", "띄어 쓴 이름.txt"]
    for path in paths:
        repo.write(path, "x\n")
    repo.commit("특수 문자 경로")
    for path in paths:
        repo.write(path, "y\n")
    sha = repo.commit("특수 문자 경로 수정")
    assert sorted(f["filename"] for f in repo.github_files(sha)) == sorted(paths)
    _matching_git(repo, sha)


@requires_git
def test_several_hunks_in_one_file_match_git(repo: GitRepo) -> None:
    lines = [f"line {n}" for n in range(1, 41)]
    repo.write("long.txt", "\n".join(lines) + "\n")
    repo.commit("긴 파일")
    lines[2] = "LINE 3"
    lines[30] = "LINE 31"
    repo.write("long.txt", "\n".join(lines) + "\n")
    sha = repo.commit("두 곳 수정")
    assert _patch(repo, sha, "long.txt").count("\n@@ ") == 1
    _matching_git(repo, sha)


# 사례: 공백을 무시한 diff가 같거나 다른 모양


@requires_git
def test_c21_space_inside_string_gives_same_value(repo: GitRepo) -> None:
    _, first, second = two_branches(
        repo,
        python_module('message = "old"'),
        python_module('message = "a b"'),
        python_module('message = "ab"'),
    )
    assert first != second
    assert _matching_git(repo, first) == _matching_git(repo, second)


@requires_git
def test_c22_indent_into_block_and_trailing_spaces_give_same_value(
    repo: GitRepo,
) -> None:
    _, first, second = two_branches(
        repo,
        python_module("if False:", "    pass", "y = 2"),
        python_module("if False:", "    pass", "    y = 2"),
        python_module("if False:", "    pass", "y = 2   "),
    )
    assert _patch(repo, first, "app.py") != _patch(repo, second, "app.py")
    assert _matching_git(repo, first) == _matching_git(repo, second)


@requires_git
def test_c23_formatter_whitespace_gives_same_value(repo: GitRepo) -> None:
    _, first, second = two_branches(
        repo,
        python_module("price = 3"),
        python_module("price = 3", "total=price*count+fee"),
        python_module("price = 3", "total = price * count + fee"),
    )
    assert _matching_git(repo, first) == _matching_git(repo, second)


@requires_git
def test_c14_same_change_on_moved_base_gives_same_value(repo: GitRepo) -> None:
    repo.write("app.py", python_module('message = "old"'))
    repo.commit("기준")
    repo.branch("pr-11")
    repo.checkout("pr-11")
    repo.write("app.py", python_module('message = "new"'))
    first = repo.commit("PR #11 변경")
    repo.checkout("main")
    # 고친 곳에서 먼 앞부분에 줄을 더해 줄 위치만 바뀐다.
    repo.write("app.py", "import os\nimport sys\n\n" + python_module('message = "old"'))
    repo.commit("기준 브랜치의 다른 변경")
    repo.write("app.py", "import os\nimport sys\n\n" + python_module('message = "new"'))
    second = repo.commit("PR #12 변경")
    first_patch = _patch(repo, first, "app.py")
    second_patch = _patch(repo, second, "app.py")
    assert first_patch.split("\n")[0] != second_patch.split("\n")[0]
    assert first_patch.split("\n")[1:] == second_patch.split("\n")[1:]
    assert _matching_git(repo, first) == _matching_git(repo, second)


@requires_git
def test_c24_reapplied_after_revert_gives_same_value(repo: GitRepo) -> None:
    repo.write("app.py", python_module("enabled = False"))
    repo.commit("기준")
    repo.write("app.py", python_module("enabled = True"))
    first = repo.commit("PR #40 변경")
    repo.revert(first)
    repo.write("app.py", python_module("enabled = True"))
    second = repo.commit("PR #45 변경")
    assert first != second
    assert _matching_git(repo, first) == _matching_git(repo, second)


@requires_git
def test_c26_changed_context_gives_different_value(repo: GitRepo) -> None:
    repo.write("app.py", python_module("before = 1", 'message = "old"'))
    repo.commit("기준")
    repo.branch("pr-11")
    repo.checkout("pr-11")
    repo.write("app.py", python_module("before = 1", 'message = "new"'))
    first = repo.commit("PR #11 변경")
    repo.checkout("main")
    # 고친 줄 바로 앞(문맥 줄)이 바뀐다.
    repo.write("app.py", python_module("before = 2", 'message = "old"'))
    repo.commit("기준 브랜치의 문맥 변경")
    repo.write("app.py", python_module("before = 2", 'message = "new"'))
    second = repo.commit("PR #12 변경")
    assert _changed_lines(_patch(repo, first, "app.py")) == _changed_lines(
        _patch(repo, second, "app.py")
    )
    assert _matching_git(repo, first) != _matching_git(repo, second)


@requires_git
def test_c20_cherry_pick_x_points_to_original_with_same_value(repo: GitRepo) -> None:
    repo.write("app.py", python_module('message = "old"'))
    repo.commit("기준")
    repo.branch("release")
    repo.write("app.py", python_module('message = "new"'))
    original = repo.commit("PR #30 변경")
    repo.checkout("release")
    repo.write("app.py", "# release\n\n" + python_module('message = "old"'))
    repo.commit("release 준비")
    picked = repo.cherry_pick_x(original)
    message = repo.message(picked)
    assert f"(cherry picked from commit {original})" in message
    assert cherry_pick_sources(message) == {original}
    assert cherry_pick_sources(repo.message(original)) == frozenset()
    assert picked != original
    assert _matching_git(repo, original) == _matching_git(repo, picked)


@requires_git
def test_c25_cherry_pick_then_space_edit_keeps_mark_and_value(repo: GitRepo) -> None:
    repo.write("app.py", python_module('message = "old"'))
    repo.commit("기준")
    repo.branch("release")
    repo.write("app.py", python_module('message = "a b"'))
    original = repo.commit("PR #32 변경")
    repo.checkout("release")
    repo.cherry_pick_x(original)
    repo.write("app.py", python_module('message = "ab"'))
    edited = repo.amend()
    assert cherry_pick_sources(repo.message(edited)) == {original}
    assert _matching_git(repo, original) == _matching_git(repo, edited)


@requires_git
def test_github_shaped_commit_passes_collection_normalization(repo: GitRepo) -> None:
    repo.write("app.py", python_module('message = "old"'))
    parent = repo.commit("기준")
    repo.write("app.py", python_module('message = "new"'))
    repo.write("dir/new.py", "x = 1\n")
    sha = repo.commit("수정과 추가\n\n#12 관련")
    detail = repo.commit_detail_json(sha, MEMBER)
    record = normalize.commit(detail, DetailStatus.NOT_REQUESTED)
    assert (record.sha, record.parents) == (sha, (parent,))
    assert record.message == "수정과 추가\n\n#12 관련"
    assert MEMBER.same_account(record.author)
    changes = normalize.commit_changes(detail, sha, files_truncated=False)
    assert (changes.additions, changes.deletions) == (2, 1)
    # 커밋 상세(JSON)만으로는 모드를 모르므로 값을 만들지 않는다.
    assert stable_patch_id(changes) is None
    assert content_patch_id(changes) == repo.git_patch_id(sha)
    modes = _modes(repo, sha)
    assert modes == {"app.py": (), "dir/new.py": ("new file mode 100644",)}
    observed = CommitChanges(
        tuple(replace(f, mode_lines=modes[f.path]) for f in changes.files),
        changes.additions,
        changes.deletions,
        changes.files_truncated,
    )
    assert stable_patch_id(observed) == repo.git_patch_id(sha)


@requires_git
def test_binary_file_without_patch_has_no_value(repo: GitRepo) -> None:
    repo.write("logo.bin", b"\x00\x01\x02")
    repo.write("text.txt", "a\n")
    sha = repo.commit("이진 파일과 글 파일 추가")
    assert ["patch" in f for f in repo.github_files(sha)] == [False, True]
    assert repo.git_patch_id(sha) is not None
    # diff 형식 출력의 이진 표시 줄은 모드 머리글로 읽지 않는다.
    assert normalize.diff_file_modes(repo.github_diff(sha)) is None
    assert stable_patch_id(commit_changes(repo.github_files(sha))) is None
    assert content_patch_id(commit_changes(repo.github_files(sha))) is None


def _skip_without_file_modes(repo: GitRepo) -> None:
    if not repo.records_file_mode():
        pytest.skip("이 파일 시스템은 실행 권한을 기록하지 않는다")


@requires_git
def test_observed_mode_makes_executable_add_match_git(repo: GitRepo) -> None:
    """모드를 관측하면 실행 파일 추가 값이 git patch-id와 같다."""
    _skip_without_file_modes(repo)
    repo.write("base.txt", "x\n")
    repo.commit("기준")
    repo.branch("plain")
    repo.write("run.sh", "echo hi\n")
    repo.chmod("run.sh", executable=True)
    executable = repo.commit("실행 파일 추가")
    repo.checkout("plain")
    repo.write("run.sh", "echo hi\n")
    repo.chmod("run.sh", executable=False)
    plain = repo.commit("일반 파일 추가")
    assert _modes(repo, executable) == {"run.sh": ("new file mode 100755",)}
    assert repo.git_patch_id(executable) != repo.git_patch_id(plain)

    assert _matching_git(repo, executable) != _matching_git(repo, plain)
    # 모드 없이 만든 값은 둘이 같다. 그래서 모드를 확인할 쌍을 고르는 데만 쓴다.
    executable_changes = commit_changes(repo.github_files(executable))
    plain_changes = commit_changes(repo.github_files(plain))
    assert content_patch_id(executable_changes) == content_patch_id(plain_changes)
    assert content_patch_id(plain_changes) == repo.git_patch_id(plain)


@requires_git
def test_content_and_mode_change_together_match_git(repo: GitRepo) -> None:
    _skip_without_file_modes(repo)
    repo.write("tool.sh", "echo old\n")
    repo.commit("기준")
    repo.branch("content-only")
    repo.write("tool.sh", "echo new\n")
    repo.chmod("tool.sh", executable=True)
    both = repo.commit("내용 수정과 실행 권한")
    repo.checkout("content-only")
    repo.write("tool.sh", "echo new\n")
    content_only = repo.commit("내용만 수정")
    assert _modes(repo, both) == {"tool.sh": ("old mode 100644", "new mode 100755")}
    assert _modes(repo, content_only) == {"tool.sh": ()}

    assert _matching_git(repo, both) != _matching_git(repo, content_only)
    assert content_patch_id(commit_changes(repo.github_files(both))) == (
        content_patch_id(commit_changes(repo.github_files(content_only)))
    )


@requires_git
def test_diff_paths_quoted_by_git_defaults_are_read(repo: GitRepo) -> None:
    paths = ["띄어 쓴 이름.txt", 'q"uote.txt', "tab\there.txt"]
    for path in paths:
        repo.write(path, "x\n")
    sha = repo.commit("특수 문자 경로 추가")
    quoted = repo.github_diff(sha, quote_path=True)
    assert b'"a/\\353' in quoted

    expected = {path: ("new file mode 100644",) for path in paths}
    assert normalize.diff_file_modes(quoted) == expected
    assert normalize.diff_file_modes(repo.github_diff(sha)) == expected
    _matching_git(repo, sha)


@pytest.mark.parametrize(
    ("status", "modes"),
    [
        pytest.param("added", None, id="added-unobserved"),
        pytest.param("removed", None, id="removed-unobserved"),
        pytest.param("modified", None, id="modified-unobserved"),
        pytest.param("added", (), id="added-without-mode"),
        pytest.param("added", ("old mode 100644", "new mode 100755"), id="added-old"),
        pytest.param("removed", ("new file mode 100644",), id="removed-new"),
        pytest.param("modified", ("new mode 100755",), id="modified-half"),
        pytest.param(
            "modified", ("new mode 100755", "old mode 100644"), id="modified-order"
        ),
        pytest.param(
            "modified", ("old mode 100644", "new mode 100644"), id="modified-same"
        ),
        pytest.param("added", ("new file mode 10644",), id="short-mode"),
        pytest.param("added", ("new file mode 100644 ",), id="trailing-space"),
    ],
)
def test_unobserved_or_mismatched_modes_have_no_value(
    status: str, modes: tuple[str, ...] | None
) -> None:
    entry = _file(status=status, modes=modes)
    assert stable_patch_id(_changes(entry)) is None
    # 모드 없이 만든 값은 그대로 만든다.
    assert content_patch_id(_changes(entry)) is not None


# 비교할 수 없는 변경


def _file(
    path: str = "app.py",
    status: str = "modified",
    patch: str | None = "@@ -1 +1 @@\n-a = 1\n+a = 2",
    previous_path: str | None = None,
    modes: tuple[str, ...] | None = (),
) -> ChangedFile:
    """GitHub처럼 파일의 추가·삭제 줄 수를 patch의 `+`·`-` 줄 수로 둔다.

    modes는 관측한 모드 줄이다. 기본값은 모드 바꿈이 없음을 확인한 수정 파일이다.
    """
    additions, deletions = line_counts(patch)
    return ChangedFile(path, status, additions, deletions, previous_path, patch, modes)


def _changes(*files: ChangedFile, truncated: bool = False) -> CommitChanges:
    return CommitChanges(files, len(files), len(files), truncated)


def test_value_ignores_whitespace_line_numbers_and_function_context() -> None:
    value = stable_patch_id(_changes(_file()))
    assert value is not None
    shifted = _file(patch="@@ -40 +41 @@ def main():\n-a=1\n+ a =\t2\r")
    assert stable_patch_id(_changes(shifted)) == value
    assert stable_patch_id(_changes(_file(path="other.py"))) != value
    assert (
        stable_patch_id(_changes(_file(patch="@@ -1 +1 @@\n-a = 1\n+a = 3"))) != value
    )


@pytest.mark.parametrize(
    "files",
    [
        pytest.param((), id="empty-file-list"),
        pytest.param((_file(), _file("logo.png", patch=None)), id="patch-missing"),
        pytest.param((_file(patch=""),), id="patch-empty"),
        pytest.param((_file(path=""),), id="path-empty"),
        pytest.param(
            (_file("new.py", "renamed", previous_path="old.py"),), id="renamed"
        ),
        pytest.param((_file("copy.py", "copied", previous_path="a.py"),), id="copied"),
        pytest.param((_file(status="changed"),), id="mode-changed"),
        pytest.param((_file(status="unchanged"),), id="unchanged"),
        pytest.param((_file(patch="-a = 1\n+a = 2"),), id="no-hunk-header"),
        pytest.param((_file(patch="@@ -x +1 @@\n-a\n+b"),), id="bad-hunk-header"),
        pytest.param(
            (_file(patch="@@ -1 +1 @@\n-a\n+b\n+c"),), id="lines-beyond-counts"
        ),
        pytest.param(
            (_file(patch="@@ -1,2 +1,2 @@\n-a\n+b"),), id="lines-short-of-counts"
        ),
        pytest.param((_file(patch="@@ -1 +1 @@\n-a\n-b"),), id="removed-beyond-count"),
        pytest.param(
            (_file(patch="@@ -1,2 +1,2 @@\nplain\n-a\n+b"),), id="no-line-mark"
        ),
        pytest.param((_file(patch="@@ -1 +1 @@\n-a\n\\x\n+b"),), id="short-backslash"),
        pytest.param((_file(patch="@@ -1 +1 @@\n-\udc80\n+b"),), id="not-encodable"),
    ],
)
def test_not_comparable_changes_have_no_value(files: tuple[ChangedFile, ...]) -> None:
    assert stable_patch_id(_changes(*files)) is None


@requires_git
def test_patch_cut_after_a_whole_hunk_has_no_value(repo: GitRepo) -> None:
    """둘째 hunk가 빠진 patch는 hunk 머리글과 맞아도 파일 줄 수와 다르다."""
    lines = [f"line {n}" for n in range(1, 41)]
    repo.write("long.txt", "\n".join(lines) + "\n")
    repo.commit("긴 파일")
    lines[2] = "LINE 3"
    lines[30] = "LINE 31"
    repo.write("long.txt", "\n".join(lines) + "\n")
    sha = repo.commit("두 곳 수정")
    (entry,) = repo.github_files(sha)
    assert (entry["additions"], entry["deletions"]) == (2, 2)
    second_hunk = entry["patch"].index("\n@@ ")
    cut = {**entry, "patch": entry["patch"][:second_hunk]}
    # 남은 첫 hunk만으로는 머리글의 줄 수가 맞는다.
    assert line_counts(cut["patch"]) == (1, 1)

    assert _ours(repo, sha) is not None
    assert stable_patch_id(commit_changes([cut], modes=_modes(repo, sha))) is None


def test_line_counts_must_match_the_patch() -> None:
    whole = _file()
    assert stable_patch_id(_changes(whole)) is not None
    for additions, deletions in ((2, 1), (1, 2), (0, 0)):
        miscounted = replace(whole, additions=additions, deletions=deletions)
        assert stable_patch_id(_changes(miscounted)) is None
    # `\ No newline at end of file` 표시 줄은 줄 수에 들지 않는다.
    marked = _file(patch="@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b")
    assert (marked.additions, marked.deletions) == (1, 1)
    assert stable_patch_id(_changes(marked)) is not None


def test_truncated_file_list_has_no_value() -> None:
    assert stable_patch_id(_changes(_file())) is not None
    assert stable_patch_id(_changes(_file(), truncated=True)) is None


# cherry-pick 표시


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        (f"수정\n\n(cherry picked from commit {SHA_A})", {SHA_A}),
        (f"수정\n\n(cherry picked from commit {SHA_B.upper()})", {SHA_B}),
        (f"수정\r\n\r\n(cherry picked from commit {SHA_A})\r\n", {SHA_A}),
        (
            f"수정\n\n(cherry picked from commit {SHA_A})\n"
            f"(cherry picked from commit {SHA_B})",
            {SHA_A, SHA_B},
        ),
        (f"수정\n\n(cherry picked from commit {SHA_256})", {SHA_256}),
        ("수정\n\n(cherry picked from commit abc1234)", set()),
        (f"수정\n\n(cherry picked from commit {SHA_A}0)", set()),
        (f"설명 (cherry picked from commit {SHA_A}) 참고", set()),
        (f"cherry picked from commit {SHA_A}", set()),
    ],
)
def test_cherry_pick_sources(message: str, expected: set[str]) -> None:
    assert cherry_pick_sources(message) == expected


# PR·이슈 번호 참조


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("#11", {11}),
        ("#11을 다시 올립니다", {11}),
        ("기준 브랜치에 맞춘 재제출 (#11)", {11}),
        ("PR #11.", {11}),
        ("#11\n본문", {11}),
        ("# 제목 #11", {11}),
        (f"{PULL_URL}/11", {11}),
        (f"{PULL_URL}/11/files", {11}),
        (f"https://github.com/{OWNER.upper()}/{NAME.upper()}/pull/11", {11}),
        (f"HTTPS://GitHub.com/{OWNER}/{NAME}/pull/11", {11}),
        (f"[이전 PR]({PULL_URL}/11#discussion_r1)", {11}),
        (f"#11, #12 그리고 {PULL_URL}/13", {11, 12, 13}),
        ("본문 첫 줄\n    #11", {11}),
        ("a ` b #11", {11}),
        ("`a\n\n#11`", {11}),
        ("`x` #11 `y`", {11}),
        ("<!-- 메모 -->#11", {11}),
        ("```\n#11\n```\n#12", {12}),
        ("````\n```\n#11\n````\n#12", {12}),
        ("~~~\n```\n#11\n~~~\n#12", {12}),
        ("```\r\n#11\r\n```\r\n#12", {12}),
        ("본문\n\n    코드 #11\n\n#12", {12}),
        ("> 이전 PR #11을 다시 올립니다", {11}),
        ("- #11 다시 올림", {11}),
        # 인용·목록 안의 코드 블록
        ("> ```\n> #11\n> ```\n#12", {12}),
        ("- ```\n  #11\n  ```\n#12", {12}),
        ("1. 항목\n    ```\n    #11\n    ```\n#12", {12}),
        ("1. 항목\n\n    ```\n   #11\n    ```\n#12", {12}),
        # 목록 밖 문단에서 4칸 들여 쓴 ```는 글이고, 뒤의 ```가 코드를 연다.
        ("본문\n\t```\n#11\n```\n#12", {11}),
        # 주소 토큰은 공백 앞에서 끝난다.
        ("https://example.invalid/review #11", {11}),
        ("www.example.invalid\n#11", {11}),
        # 같은 저장소 PR 주소는 주소 토큰을 지우기 전에 센다.
        (f"{PULL_URL}/11?ref=#12", {11}),
        # 줄 앞에서 연 HTML 주석 안의 펜스는 코드를 열지 않는다(인용 안도 같다).
        ("<!--\n```\n-->\n#11", {11}),
        ("> <!--\n> ```\n> -->\n#11", {11}),
        ("   <!-- 메모\n```\n-->\n#11", {11}),
        ("<code>a</code> #11 <pre>b</pre>", {11}),
    ],
)
def test_pull_request_references_counted(text: str, expected: set[int]) -> None:
    assert pull_request_references(text, REPOSITORY) == expected


@pytest.mark.parametrize(
    "text",
    [
        f"https://github.com/other-owner/{NAME}/pull/11",
        f"https://github.com/{OWNER}/other-repo/pull/11",
        f"http://github.com/{OWNER}/{NAME}/pull/11",
        f"https://github.com/{OWNER}/{NAME}/issues/11",
        f"{PULL_URL}/011",
        f"{PULL_URL}/11a",
        "other-owner/other-repo#11",
        f"{OWNER}/{NAME}#11",
        "owner/repo-#11",
        "abc#11",
        "가#11",
        "PR#11",
        "_#11",
        "#11a",
        "#011",
        "#0",
        "&#11;",
        "https://example.invalid/#11",
        "```\n#11\n```",
        "~~~ 설명\n#11\n~~~",
        "```python\n#11",
        "`#11`",
        "``a ` #11``",
        "<!-- #11 -->",
        "<!-- #11",
        "본문\n\n    #11",
        "    #11",
        "본문\n\n\t#11",
        "# 제목\n    #11",
        "> 인용\n>\n>     #11",
        "---\n    #11",
        "제목\n===\n    #11",
        "- 항목\n\n```\n코드\n```\n    #11",
        "```\n> ```\n#11\n```",
        "```\n    ```\n#11\n```",
        "#" + "1" * 11,
        "#" + "9" * 5000,
        # 다른 주소 안의 번호. 주소는 공백·`<`·`>`·따옴표 전까지다.
        "https://example.invalid/review?ref=#11",
        "HTTP://example.invalid/?ref=#11",
        "www.example.invalid/?ref=#11",
        f"https://github.com/other-owner/{NAME}/pull/5?ref=#11",
        "<https://example.invalid/x#11>",
        '"https://example.invalid/x#11"',
        # HTML 코드 요소 안(대소문자 무시, 닫히지 않으면 끝까지).
        "<pre><code>#11</code></pre>",
        "<CODE>#11</CODE>",
        '<pre class="x">\n#11\n</pre >',
        "<code>#11",
        # 문단 가운데서 연 주석 뒤의 펜스는 코드다.
        "text <!--\n```\n-->\n#11",
        # 한 줄에서 닫힌 주석 뒤의 펜스는 코드다.
        "<!-- a -->\n```\n#11",
    ],
)
def test_pull_request_references_ignored(text: str) -> None:
    assert pull_request_references(text, REPOSITORY) == frozenset()


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("#38 관련 작업", {38}),
        ("이슈 #38, #40을 고침", {38, 40}),
        ("abc#38 그리고 `#39`", set()),
        ("<!-- #38 -->\n```\n#39\n```", set()),
        (f"https://github.com/{OWNER}/{NAME}/issues/38", set()),
        (f"{PULL_URL}/38", set()),
        ("https://example.invalid/review?ref=#38", set()),
        ("https://example.invalid/review #38", {38}),
        ("<pre><code>#38</code></pre>", set()),
        ("<CODE>#38</CODE>", set()),
        ("<!--\n```\n-->\n#38", {38}),
        ("> <!--\n> ```\n> -->\n#38", {38}),
        ("text <!--\n```\n-->\n#38", set()),
        ("<!-- a -->\n```\n#38", set()),
    ],
)
def test_issue_references(text: str, expected: set[int]) -> None:
    assert issue_references(text) == expected


def test_long_text_with_many_code_spans_is_read_in_one_pass() -> None:
    # 코드 조각마다 문단 끝을 다시 찾으면 이 길이(1MB)에서 수십 초가 걸린다.
    text = "`a` " * 262144 + "#11"
    assert issue_references(text) == {11}
