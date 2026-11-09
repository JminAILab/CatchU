"""Catch 제목(#120): 위치 분류·파일 상태 대응·제목 표기와, 후보 안 본인 커밋마다 동작이 갈릴 때의 시작
전·끝 비교를 합성 제공자로 확인한다.

기대값은 #120 본문 「Catch 제목」과 완료 기준 11·16~22, 2026-10-12 결정 10·11·17에서 정했다. 이슈가
구현에 맡긴 위치 분류 목록·제목 표기(「{대상} {종류} {동작}」)·파일 상태 대응만 구현이 고른 값을 쓴다.
제목 판정 코드를 읽어 기대값을 맞추지 않았다.

- 합성 제공자는 제목 대상(줄과 코드 이름, 또는 파일)만 지목한다. 종류·동작·제목 글자는 생성 모듈이
  정한다. 제공자는 응답을 한 번만 주므로, 확인에 실패한 제목을 고쳐 쓰기로 다시 부르면 시험이 실패한다.
- 커밋마다 동작이 갈리는 사례는 합성 git 저장소의 실제 커밋으로 만든다. 그래서 hunk의 줄 위치가 실제
  diff와 같다. 같은 이력을 PR·PR 없는 병합·커밋 묶음 세 단위로 각각 돌린다(PR 조회를 허용하지 않은
  요청이면 PR 없는 병합과 커밋 묶음이 단위가 된다).
- 결과 조합이 제목을 그대로(None이면 null로) 내보내는 것은 이 파일의 대상이 아니다. 제목은 생성
  출력의 후보 값(None 포함)으로 본다.
"""

import inspect
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any, Literal

import pytest
from candidate_scenarios import (
    DEFAULT_MESSAGE,
    LIVE,
    ROOT,
    Commit,
    Pull,
    Scenario,
    bundle_identity,
    change,
    commit,
    commit_url,
    evidence_urls,
    failure_codes,
    git_commit,
    identities,
    live_request,
    merge_commit,
    merge_identity,
    pull_identity,
    root_commit,
    run_case,
)
from generation_scenarios import (
    DEFAULT_DEADLINE,
    ScriptedProvider,
    answer,
    code_title,
    file_fragment,
    file_id_of,
    file_question,
    file_title,
    generation_case,
    line_fragment,
    line_question,
    pick,
    sent_files,
    sent_lines,
)
from git_synthetic import GitRepo, python_module, requires_git
from github_synthetic import (
    MEMBER,
    OTHER,
    FakeClock,
    detail_path,
    oversized,
    pull_commits_path,
    respond,
    sha,
)

from app.collection import GitHubAccount
from app.generation import ProviderRequest, run_generation
from app.generation.request import PreparedFile, PreparedLine
from app.generation.response import Sent, ai_parts, written
from app.generation.title import classify
from app.processing import CheckedRequest

UnitKind = Literal["pull", "merge", "bundle"]
UNIT_KINDS: tuple[UnitKind, ...] = ("pull", "merge", "bundle")
PR_NUMBER = 5

DOC = "docs/install.md"
CODE = "app/limits.py"
OTHER_FILE = "app/other.py"
DOC_V0 = "# install\n\nstep zero\n"
DOC_V1 = "# install\n\nstep one\n"
DOC_V2 = "# install\n\nstep two\n"
# 같은 문자열이 다른 위치에 오는 사례에서 앞뒤 줄을 서로 다르게 두는 가운데 줄.
MIDDLE = ("alpha = 1", "beta = 2", "gamma = 3")

Step = Mapping[str, str | None]


# 제공자 응답: 제목 대상만 지목한다. 설명 조각·질문도 같은 대상으로 하나씩 둔다.


@dataclass(frozen=True)
class Target:
    """제목으로 지목할 대상. name이 있으면 그 파일의 줄에 든 코드 이름, 없으면 파일 이름."""

    path: str
    name: str | None = None


def target_reply(target: Target) -> Callable[[ProviderRequest], str]:
    def reply(request: ProviderRequest) -> str:
        if target.name is None:
            file_id = file_id_of(request, target.path)
            return answer(
                fragments=[file_fragment(file_id)],
                title=file_title(file_id),
                questions=[file_question("BACKGROUND", file_id)],
            )
        line = pick(request, contains=target.name, path=target.path)
        return answer(
            fragments=[line_fragment(line, target.name)],
            title=code_title(line, target.name),
            questions=[line_question("BACKGROUND", line, target.name)],
        )

    return reply


@dataclass(frozen=True)
class Unit:
    scenario: Scenario
    request: CheckedRequest
    identity: str


def generated_title(
    unit: Unit, reply: Callable[[ProviderRequest], str] | Target
) -> str | None:
    """생성 한 번을 돌려 후보 하나의 제목을 돌려준다. 생성 호출 한 번만 있었는지도 본다.

    제목은 설명과 같은 생성 호출에서 나온다(완료 기준 16). 확인 실패로 null이 된 제목은 고쳐 쓰지
    않으므로 제공자를 다시 부르지 않는다.
    """
    if isinstance(reply, Target):
        reply = target_reply(reply)
    provider = ScriptedProvider(reply, repeat=False)
    case = generation_case(unit.scenario, provider, request=unit.request)
    assert identities(case.result) == [unit.identity]
    assert [each.purpose for each in provider.requests] == ["GENERATE"]
    (candidate,) = case.output.candidates
    return candidate.title


# 합성 git 이력: 기준 커밋(다른 계정) 위에 작업 브랜치 커밋을 쌓고 병합 커밋으로 합친다.


@dataclass(frozen=True)
class History:
    root: str
    # 작업 브랜치 커밋(부모 → 자식 순서).
    work: tuple[str, ...]
    merged: str


def apply_step(repo: GitRepo, step: Step) -> None:
    for path, text in step.items():
        if text is None:
            repo.remove(path)
        else:
            repo.write(path, text)


def build_history(
    repo: GitRepo,
    base: Step,
    steps: Sequence[Step],
    *,
    minutes: Sequence[int] | None = None,
) -> History:
    """기준 → 작업 브랜치 커밋들 → 기준 브랜치로 병합(--no-ff). minutes는 작업 커밋의 작성 시각(분)."""
    apply_step(repo, base)
    root = repo.commit("기준")
    repo.branch("work")
    repo.checkout("work")
    made: list[str] = []
    for number, step in enumerate(steps, start=1):
        apply_step(repo, step)
        minute = None if minutes is None else minutes[number - 1]
        # 부실 목록의 메시지라 기록의 글이 제목이 되지 않고 조각 제목을 본다(CR1 BR3.2).
        made.append(repo.commit(DEFAULT_MESSAGE, minute=minute))
    repo.checkout("main")
    merged = repo.merge("work", "작업 병합", minute=None if minutes is None else 300)
    return History(root, tuple(made), merged)


def unit_of(
    repo: GitRepo,
    history: History,
    kind: UnitKind,
    *,
    authors: Sequence[GitHubAccount] | None = None,
    adjust: Mapping[int, Callable[[Commit], Commit]] | None = None,
) -> Unit:
    """같은 이력을 PR·PR 없는 병합·커밋 묶음 가운데 한 단위로 관측한 사례.

    authors는 작업 커밋마다의 작성 계정(기본은 모두 회원), adjust는 작업 커밋 순서 → 상세 응답 고치기.
    """
    accounts = list(authors or [MEMBER] * len(history.work))
    work: list[Commit] = []
    for index, (each, author) in enumerate(zip(history.work, accounts, strict=True)):
        made = git_commit(repo, each, author)
        if adjust is not None and index in adjust:
            made = adjust[index](made)
        work.append(made)
    root = git_commit(repo, history.root, OTHER)
    if kind == "pull":
        merged = git_commit(repo, history.merged, OTHER)
        scenario = Scenario(
            default_branch=(merged, *reversed(work), root),
            pulls=(
                Pull(
                    PR_NUMBER,
                    MEMBER,
                    tuple(work),
                    created=1,
                    merged=400,
                    merge_commit=history.merged,
                ),
            ),
        )
        return Unit(scenario, LIVE, pull_identity(PR_NUMBER))
    if kind == "merge":
        merged = git_commit(repo, history.merged, MEMBER)
        scenario = Scenario(default_branch=(merged, *reversed(work), root))
        return Unit(scenario, live_request("COMMIT"), merge_identity(history.merged))
    assert all(author == MEMBER for author in accounts), "커밋 묶음은 본인 커밋만"
    scenario = Scenario(default_branch=(*reversed(work), root))
    return Unit(
        scenario, live_request("COMMIT"), bundle_identity(*sorted(history.work))
    )


def without_file_patch(path: str) -> Callable[[Commit], Commit]:
    """상세 응답에서 그 파일의 patch만 뺀다(GitHub가 그 파일 patch를 주지 않은 경우)."""

    def edit(target: Commit) -> Commit:
        return _edit_file(target, path, lambda entry: entry.pop("patch"))

    return edit


def with_cut_patch(path: str) -> Callable[[Commit], Commit]:
    """그 파일의 추가 줄 수를 patch보다 하나 많게 둔다(받은 patch가 잘려 온전하지 않은 경우)."""

    def edit(target: Commit) -> Commit:
        def grow(entry: dict[str, Any]) -> None:
            entry["additions"] += 1
            entry["changes"] += 1

        return _edit_file(target, path, grow)

    return edit


def _edit_file(
    target: Commit, path: str, edit: Callable[[dict[str, Any]], object]
) -> Commit:
    assert target.detail is not None
    files: list[dict[str, Any]] = []
    found = False
    for entry in target.detail["files"]:
        copied = dict(entry)
        if copied["filename"] == path:
            edit(copied)
            found = True
        files.append(copied)
    assert found, f"커밋에 {path}가 없다"
    additions = sum(entry["additions"] for entry in files)
    deletions = sum(entry["deletions"] for entry in files)
    stats = {
        "additions": additions,
        "deletions": deletions,
        "total": additions + deletions,
    }
    return Commit(
        target.item, {**target.detail, "files": files, "stats": stats}, target.diff
    )


# 1. 위치 분류표(제안): 시험 → 문서 → 설정 → 코드, 겹치면 앞이 이기고 목록 밖은 null


@pytest.mark.parametrize(
    ("path", "kind"),
    [
        # 시험: 경로 조각 test/tests/__tests__/spec/e2e, test_*.py, *_test.*, *.test.*, *.spec.*
        ("tests/api.py", "시험"),
        ("test/helpers.js", "시험"),
        ("src/__tests__/button.js", "시험"),
        ("spec/models/user.rb", "시험"),
        ("e2e/login.ts", "시험"),
        ("app/test_login.py", "시험"),
        ("pkg/server_test.go", "시험"),
        ("web/src/button.test.tsx", "시험"),
        ("web/src/button.spec.ts", "시험"),
        # 문서: .md .mdx .rst .adoc, docs/·doc/ 아래 .txt, README·CHANGELOG(점 뒤 확장자 무관)
        ("docs/install.md", "문서"),
        ("guide.mdx", "문서"),
        ("index.rst", "문서"),
        ("manual.adoc", "문서"),
        ("docs/notes.txt", "문서"),
        ("doc/notes.txt", "문서"),
        ("README", "문서"),
        ("README.ko.md", "문서"),
        ("CHANGELOG", "문서"),
        # 설정: .toml .yaml .yml .ini .cfg, 알려진 설정 json, Dockerfile, docker-compose*, .github/ 아래,
        # *.config.{js,ts,mjs,cjs}
        ("pyproject.toml", "설정"),
        ("deploy/app.yaml", "설정"),
        ("ci.yml", "설정"),
        ("tox.ini", "설정"),
        ("setup.cfg", "설정"),
        ("package.json", "설정"),
        ("tsconfig.json", "설정"),
        ("tsconfig.build.json", "설정"),
        ("Dockerfile", "설정"),
        ("docker-compose.yml", "설정"),
        ("docker-compose.override.yaml", "설정"),
        (".github/CODEOWNERS", "설정"),
        (".github/workflows/ci.yml", "설정"),
        ("vite.config.ts", "설정"),
        ("next.config.mjs", "설정"),
        ("jest.config.js", "설정"),
        ("tailwind.config.cjs", "설정"),
        # 코드: 알려진 소스 확장자
        ("src/auth.ts", "코드"),
        ("web/src/App.tsx", "코드"),
        ("app/main.py", "코드"),
        ("server/Main.java", "코드"),
        ("cmd/run.go", "코드"),
        ("src/lib.rs", "코드"),
    ],
)
def test_location_rules_give_each_kind(path: str, kind: str) -> None:
    """위치 분류표: 경로 하나가 시험·문서·설정·코드 가운데 정해진 종류가 된다(완료 기준 16·18)."""
    assert classify(path) == kind


@pytest.mark.parametrize(
    ("path", "kind"),
    [
        # 시험이 문서·설정·코드를 이긴다.
        ("tests/README.md", "시험"),
        ("tests/fixtures/config.yaml", "시험"),
        ("e2e/playwright.config.ts", "시험"),
        ("docs/api.test.ts", "시험"),
        # 문서가 설정·코드를 이긴다.
        (".github/README.md", "문서"),
        ("docs/README.yaml", "문서"),
        # 설정이 코드를 이긴다.
        ("vite.config.js", "설정"),
        (".github/scripts/check.py", "설정"),
    ],
)
def test_overlapping_location_rules_take_the_earlier_kind(path: str, kind: str) -> None:
    """여러 규칙에 걸리면 시험 → 문서 → 설정 → 코드 순서의 앞이 이긴다(완료 기준 16)."""
    assert classify(path) == kind


@pytest.mark.parametrize(
    ("path", "kind"),
    [
        # S11(AC3.2.2): 파일 이름(확장자 앞)이 Test·Tests로 끝나는 꼴(대문자 T)은 시험이다.
        ("src/main/java/com/app/FooTest.java", "시험"),
        ("Sources/AppTests/LoginTests.swift", "시험"),
        ("app/src/main/kotlin/UserServiceTest.kt", "시험"),
        ("Test.java", "시험"),
        # 소문자 test로 끝나는 이름은 시험 꼴이 아니다(Contest·latest).
        ("src/Contest.java", "코드"),
        ("src/latest.py", "코드"),
        # Android androidTest 폴더, 이름이 Tests로 끝나는 폴더(iOS 앱Tests·앱UITests).
        ("app/src/androidTest/java/LoginScreen.kt", "시험"),
        ("MyAppTests/LoginViewModelSpecHelper.swift", "시험"),
        ("MyAppUITests/Launch.swift", "시험"),
        # 대문자 T가 아닌 폴더 이름은 그대로다.
        ("src/contests/Board.java", "코드"),
        # 모바일 설정 파일.
        ("app/src/main/AndroidManifest.xml", "설정"),
        ("build.gradle", "설정"),
        ("app/build.gradle.kts", "설정"),
        ("settings.gradle.kts", "설정"),
        ("MyApp/Info.plist", "설정"),
        ("Configs/Debug.xcconfig", "설정"),
        ("Podfile", "설정"),
        ("MyApp.xcodeproj/project.pbxproj", "설정"),
        # .kts만이면 코드다(Kotlin 스크립트).
        ("scripts/release.kts", "코드"),
        # 노트북은 코드다.
        ("notebooks/analysis.ipynb", "코드"),
        # 폴더 test·tests의 대소문자 무시는 그대로다.
        ("Test/helper.py", "시험"),
    ],
)
def test_cr1_mobile_test_and_notebook_kinds(path: str, kind: str) -> None:
    """CR1 BR5.1: 시험 → 문서 → 설정 → 코드 순서로 판정하고 모바일·노트북 꼴을 더했다."""
    assert classify(path) == kind


@pytest.mark.parametrize(
    "path",
    [
        "assets/logo.png",
        "assets/logo.svg",
        "uv.lock",
        "yarn.lock",
        "package-lock.json",
        "Makefile",
        "LICENSE",
        "bin/run",
        "notes.txt",
        "data/sample.csv",
        "data/fixtures.json",
    ],
)
def test_paths_outside_the_location_rules_have_no_kind(path: str) -> None:
    """목록 밖(이미지·잠금 파일·확장자 없음·알 수 없는 json 등)은 종류가 없다(완료 기준 18)."""
    assert classify(path) is None


# 2. 파일 상태 대응과 제목 표기: 커밋 하나의 커밋 묶음


def single_commit(*files: dict[str, Any], message: str = DEFAULT_MESSAGE) -> Unit:
    """기본 브랜치에 바로 올린 본인 커밋 하나(PR 조회를 허용하지 않은 요청의 커밋 묶음)."""
    one = commit(
        sha(4001), MEMBER, parents=(ROOT,), minute=2, message=message, files=files
    )
    return Unit(
        Scenario(default_branch=(one, root_commit())),
        live_request("COMMIT"),
        bundle_identity(one.sha),
    )


ADDED_PATCH = "@@ -0,0 +1,2 @@\n+# Install\n+run setup"
REMOVED_PATCH = "@@ -1,2 +0,0 @@\n-# Install\n-run setup"
MODIFIED_PATCH = "@@ -1,2 +1,2 @@\n # Install\n-run setup\n+run install"


def renamed(path: str, previous: str) -> dict[str, Any]:
    entry = change(path, patch=MODIFIED_PATCH, status="renamed")
    entry["previous_filename"] = previous
    return entry


@pytest.mark.parametrize(
    ("entry", "expected"),
    [
        (change(DOC, patch=ADDED_PATCH, status="added"), "install.md 문서 추가"),
        (change(DOC, patch=REMOVED_PATCH, status="removed"), "install.md 문서 삭제"),
        (change(DOC, patch=MODIFIED_PATCH, status="modified"), "install.md 문서 수정"),
        (renamed(DOC, "docs/setup.md"), "install.md 문서 이름 변경"),
        (change(DOC, patch=MODIFIED_PATCH, status="changed"), None),
        (change(DOC, patch=MODIFIED_PATCH, status="copied"), None),
    ],
    ids=["added", "removed", "modified", "renamed", "changed", "copied"],
)
def test_file_status_gives_the_action(
    entry: dict[str, Any], expected: str | None
) -> None:
    """파일 이름 제목의 동작은 GitHub 파일 상태를 따르고, 대응이 없는 상태면 null이다(완료 기준 16·18)."""
    assert generated_title(single_commit(entry), Target(DOC)) == expected


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("tests/test_login.py", "test_login.py 시험 수정"),
        ("docs/install.md", "install.md 문서 수정"),
        ("pyproject.toml", "pyproject.toml 설정 수정"),
        ("src/auth.ts", "auth.ts 코드 수정"),
        ("Makefile", None),
        ("uv.lock", None),
        ("package-lock.json", None),
        ("assets/logo.svg", None),
        # CR1 BR5.1: 판정이 바뀐 파일은 조각 제목의 종류도 바뀐다(기능 설계 8절 한계).
        ("app/build.gradle.kts", "build.gradle.kts 설정 수정"),
        ("src/test/java/FooTest.java", "FooTest.java 시험 수정"),
        ("notebooks/analysis.ipynb", "analysis.ipynb 코드 수정"),
    ],
)
def test_file_title_is_target_kind_action(path: str, expected: str | None) -> None:
    """파일 이름 제목은 「{파일 이름} {종류} {동작}」이고, 위치 분류 밖이면 null이다(완료 기준 16·18)."""
    entry = change(path, patch="@@ -1 +1 @@\n-value = 1\n+value = 2")
    assert generated_title(single_commit(entry), Target(path)) == expected


def code_patch(*changed: str) -> str:
    """앞뒤 문맥 줄 사이에 바뀐 줄을 둔 patch. 줄 수는 머리글에 맞춘다."""
    old = 2 + sum(1 for line in changed if line.startswith("-"))
    new = 2 + sum(1 for line in changed if line.startswith("+"))
    return "\n".join(
        [f"@@ -1,{old} +1,{new} @@", " const a = 1;", *changed, " const b = 2;"]
    )


@pytest.mark.parametrize(
    ("changed", "name", "expected"),
    [
        (("+const loginRateLimit = 5;",), "loginRateLimit", "loginRateLimit 코드 추가"),
        (("-const loginRateLimit = 5;",), "loginRateLimit", "loginRateLimit 코드 삭제"),
        (
            ("-const loginRateLimit = 5;", "+const loginRateLimit = 10;"),
            "loginRateLimit",
            "loginRateLimit 코드 수정",
        ),
        # 이름이 다른 이름에 묻은 줄(식별자 경계 밖)은 그 이름의 줄로 세지 않는다.
        (
            ("-const loginRateLimit = 3;", "+const limit = 5;"),
            "limit",
            "limit 코드 추가",
        ),
    ],
    ids=["added-only", "removed-only", "both", "embedded-name-not-counted"],
)
def test_code_name_action_follows_added_and_removed_lines(
    changed: tuple[str, ...], name: str, expected: str
) -> None:
    """코드 이름은 추가 줄에만 있으면 추가, 삭제 줄에만 있으면 삭제, 양쪽이면 수정이다(완료 기준 16)."""
    entry = change("src/auth.ts", patch=code_patch(*changed))
    assert (
        generated_title(single_commit(entry), Target("src/auth.ts", name)) == expected
    )


@pytest.mark.parametrize(
    ("removed", "added"),
    [
        ("const loginRateLimit = 5;", "const loginRateLimit=5;"),
        ("const loginRateLimit = 5;", "const loginRateLimit = 5;  "),
        ("const loginRateLimit = 5;", "    const loginRateLimit = 5;"),
    ],
    ids=["inner-space", "trailing-space", "indent"],
)
def test_whitespace_only_pair_is_an_ordinary_change(removed: str, added: str) -> None:
    """공백만 다른 줄 쌍은 정규화해 지우지 않고 보통 변경(수정)으로 본다(완료 기준 16)."""
    entry = change("src/auth.ts", patch=code_patch(f"-{removed}", f"+{added}"))
    assert generated_title(
        single_commit(entry), Target("src/auth.ts", "loginRateLimit")
    ) == ("loginRateLimit 코드 수정")


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("tests/test_auth.py", "loginRateLimit 시험 추가"),
        ("docs/README.md", "loginRateLimit 문서 추가"),
        ("config/app.yaml", "loginRateLimit 설정 추가"),
        ("src/auth.ts", "loginRateLimit 코드 추가"),
        ("Makefile", None),
        ("uv.lock", None),
    ],
)
def test_code_name_title_kind_follows_the_target_file(
    path: str, expected: str | None
) -> None:
    """코드 이름 제목의 종류는 지목한 줄이 든 파일의 위치로 정하고, 위치 분류 밖이면 null이다(완료 기준
    16·18)."""
    entry = change(path, patch=code_patch("+const loginRateLimit = 5;"))
    assert (
        generated_title(single_commit(entry), Target(path, "loginRateLimit"))
        == expected
    )


# 3. 설명 실패와 제목(결정 10)


@pytest.mark.parametrize(
    ("fragments", "code"),
    [
        ("unverified", "GENERATION_UNVERIFIED"),
        ("none", "GENERATION_RULE_VIOLATION"),
        ("malformed", "GENERATION_RULE_VIOLATION"),
    ],
)
def test_failed_description_keeps_a_verified_title(fragments: str, code: str) -> None:
    """설명 확인이 실패해도 같은 응답에서 확인된 제목·질문은 남고, 설명 실패만 1건이다(완료 기준 11)."""
    unit = single_commit(
        change("src/auth.ts", patch=code_patch("+const loginRateLimit = 5;"))
    )

    def reply(request: ProviderRequest) -> str:
        line = pick(request, contains="loginRateLimit")
        chosen: list[dict[str, str]] = {
            # 이름이 그 줄에 없다: 변경 내용과 대조해 확인하지 못한다.
            "unverified": [line_fragment(line, "sessionStore")],
            "none": [],
            # 이름 칸이 없는 조각뿐이다: 형식 위반으로 버려 남는 조각이 없다.
            "malformed": [{"kind": "ADDED_LINE_WITH", "line": line.id}],
        }[fragments]
        return answer(
            fragments=chosen,
            title=code_title(line, "loginRateLimit"),
            questions=[line_question("BACKGROUND", line, "loginRateLimit")],
        )

    provider = ScriptedProvider(reply, repeat=False)
    case = generation_case(unit.scenario, provider, request=unit.request)

    (candidate,) = case.output.candidates
    assert candidate.draft.status == "FAILED"
    assert candidate.draft.content is None
    assert candidate.title == "loginRateLimit 코드 추가"
    assert candidate.reflection.status == "GENERATED"
    assert len(candidate.reflection.questions) == 1
    assert failure_codes(case.result) == [("DRAFT", code)]
    assert len(provider.requests) == 1


# 4. 허용되지 않은 근거만 지목한 제목(문맥 줄·다른 계정 커밋·커밋 메시지·PR 글)


CONTEXT_PATCH = (
    "@@ -1,3 +1,4 @@\n"
    " const sessionTimeout = 30;\n"
    "+const loginRateLimit = 5;\n"
    " const a = 1;\n"
    " const b = 2;"
)


@pytest.mark.parametrize("pointer", ["context-line-id", "name-only-in-context"])
def test_title_pointing_at_a_context_line_is_null(pointer: str) -> None:
    """문맥 줄의 이름이나 문맥 줄 자체를 지목한 제목은 null이고 고쳐 쓰지 않는다(완료 기준 17)."""
    unit = single_commit(change("src/auth.ts", patch=CONTEXT_PATCH))

    def reply(request: ProviderRequest) -> str:
        added = pick(request, contains="loginRateLimit")
        # 문맥 줄은 보내지 않는다. 보낸 자료에 sessionTimeout이 든 줄이 없다.
        assert all("sessionTimeout" not in each.text for each in sent_lines(request))
        if pointer == "context-line-id":
            context_id = added.id.replace(":L3", ":L2")
            assert context_id != added.id
            title = code_title(context_id, "sessionTimeout")
        else:
            title = code_title(added, "sessionTimeout")
        return answer(
            fragments=[line_fragment(added, "loginRateLimit")],
            title=title,
            questions=[line_question("BACKGROUND", added, "loginRateLimit")],
        )

    assert generated_title(unit, reply) is None


def pull_with_other_account(
    *, message: str = DEFAULT_MESSAGE, title: str | None = None, body: str | None = None
) -> Unit:
    """회원 커밋 하나와 다른 계정 커밋 하나가 든 병합된 PR #5."""
    own = commit(
        sha(4101),
        MEMBER,
        parents=(ROOT,),
        minute=2,
        message=message,
        files=[change("src/auth.ts", patch=code_patch("+const loginRateLimit = 5;"))],
    )
    other = commit(
        sha(4102),
        OTHER,
        parents=(own.sha,),
        minute=3,
        files=[change("src/session.ts", patch=code_patch("+const sessionStore = {};"))],
    )
    merged = merge_commit(sha(4103), ROOT, other.sha, minute=4)
    scenario = Scenario(
        default_branch=(merged, other, own, root_commit()),
        pulls=(
            Pull(
                PR_NUMBER,
                MEMBER,
                (own, other),
                created=1,
                merged=4,
                merge_commit=merged.sha,
                title=title,
                body=body,
            ),
        ),
    )
    return Unit(scenario, LIVE, pull_identity(PR_NUMBER))


@pytest.mark.parametrize(
    "pointer", ["name-on-own-line", "unsent-line-id", "unsent-file-id"]
)
def test_title_pointing_at_another_accounts_commit_is_null(pointer: str) -> None:
    """다른 계정 커밋의 이름·줄·파일을 지목한 제목은 null이다(완료 기준 17)."""
    unit = pull_with_other_account()

    def reply(request: ProviderRequest) -> str:
        # 다른 계정 커밋의 변경은 보내지 않는다.
        assert {file["path"] for file in sent_files(request).values()} == {
            "src/auth.ts"
        }
        own = pick(request, contains="loginRateLimit")
        title = {
            "name-on-own-line": code_title(own, "sessionStore"),
            "unsent-line-id": code_title("c2f1:L3", "sessionStore"),
            "unsent-file-id": file_title("c2f1"),
        }[pointer]
        return answer(
            fragments=[line_fragment(own, "loginRateLimit")],
            title=title,
            questions=[line_question("BACKGROUND", own, "loginRateLimit")],
        )

    assert generated_title(unit, reply) is None


@pytest.mark.parametrize(
    ("unit", "name", "expected"),
    [
        # 커밋 메시지 첫 줄은 쓸 만한 기록의 글이라 그 글이 그대로 제목이다(CR1 BR3.1). 생성 요청에는
        # 들어가지 않고(NFR1.1), 모델이 지목한 조각 제목은 쓰이지 않는다.
        (
            pull_with_other_account(message="sessionCache 연결"),
            "sessionCache",
            "sessionCache 연결",
        ),
        # 다른 계정 커밋이 섞인 PR이라 PR 제목은 기록의 글이 아니다(BR2.1). 본인 커밋 첫 줄은 부실이다.
        (pull_with_other_account(title="cacheWarmup 정리"), "cacheWarmup", None),
        (pull_with_other_account(body="warmupQueue를 쓴다"), "warmupQueue", None),
    ],
    ids=["commit-message", "pull-request-title", "pull-request-body"],
)
def test_title_naming_only_message_or_pull_request_text_is_null(
    unit: Unit, name: str, expected: str | None
) -> None:
    """커밋 메시지·PR 제목·본문에만 있는 이름을 지목한 조각 제목은 null이다(완료 기준 17)."""

    def reply(request: ProviderRequest) -> str:
        assert name not in request.data
        own = pick(request, contains="loginRateLimit")
        return answer(
            fragments=[line_fragment(own, "loginRateLimit")],
            title=code_title(own, name),
            questions=[line_question("BACKGROUND", own, "loginRateLimit")],
        )

    assert generated_title(unit, reply) == expected


# 5. 동작이 갈릴 때 시작 전·끝 비교(결정 11·17): PR·PR 없는 병합·커밋 묶음 각각


@dataclass(frozen=True)
class Flow:
    base: Step
    steps: tuple[Step, ...]
    target: Target
    expected: str | None


FLOWS: dict[str, Flow] = {
    "file-added-then-modified": Flow(
        {OTHER_FILE: "x = 1\n"},
        ({DOC: DOC_V1}, {DOC: DOC_V2}),
        Target(DOC),
        "install.md 문서 추가",
    ),
    "file-added-then-removed": Flow(
        {OTHER_FILE: "x = 1\n"},
        ({DOC: DOC_V1}, {DOC: None}),
        Target(DOC),
        None,
    ),
    "file-modified-then-removed": Flow(
        {DOC: DOC_V0},
        ({DOC: DOC_V1}, {DOC: None}),
        Target(DOC),
        "install.md 문서 삭제",
    ),
    "code-line-added-then-removed-at-the-same-place": Flow(
        {CODE: python_module()},
        ({CODE: python_module("rate_window = 30")}, {CODE: python_module()}),
        Target(CODE, "rate_window"),
        None,
    ),
    "code-line-added-then-value-changed": Flow(
        {CODE: python_module()},
        ({CODE: python_module("limit = 5")}, {CODE: python_module("limit = 10")}),
        Target(CODE, "limit"),
        "limit 코드 추가",
    ),
}


@requires_git
@pytest.mark.parametrize("kind", UNIT_KINDS)
@pytest.mark.parametrize("flow", list(FLOWS), ids=list(FLOWS))
def test_diverging_actions_use_the_candidate_before_and_after(
    repo: GitRepo, kind: UnitKind, flow: str
) -> None:
    """커밋마다 동작이 갈리면 단위 종류와 관계없이 후보의 시작 전·끝을 비교한다(완료 기준 19)."""
    case = FLOWS[flow]
    history = build_history(repo, case.base, case.steps)

    assert generated_title(unit_of(repo, history, kind), case.target) == case.expected


# 6. 동작이 갈리는데 전후를 입증할 수 없으면 null(결정 11·17)


def added_then_modified(repo: GitRepo, *, with_other_file: bool = False) -> History:
    """install.md를 더한 커밋과 고친 커밋. with_other_file이면 둘째 커밋이 관계없는 파일도 고친다."""
    second: dict[str, str | None] = {DOC: DOC_V2}
    if with_other_file:
        second[OTHER_FILE] = "x = 2\n"
    return build_history(repo, {OTHER_FILE: "x = 1\n"}, [{DOC: DOC_V1}, second])


@requires_git
@pytest.mark.parametrize("kind", UNIT_KINDS)
@pytest.mark.parametrize(
    "damage", [without_file_patch, with_cut_patch], ids=["no-patch", "cut-patch"]
)
def test_diverging_target_with_missing_or_cut_patch_has_no_title(
    repo: GitRepo, kind: UnitKind, damage: Callable[[str], Callable[[Commit], Commit]]
) -> None:
    """대상 파일을 건드린 본인 커밋의 patch가 없거나 잘렸으면 제목은 null이다(완료 기준 18·21)."""
    history = added_then_modified(repo)
    unit = unit_of(repo, history, kind, adjust={1: damage(DOC)})

    assert generated_title(unit, Target(DOC)) is None


@requires_git
@pytest.mark.parametrize("kind", UNIT_KINDS)
@pytest.mark.parametrize(
    "damage", [without_file_patch, with_cut_patch], ids=["no-patch", "cut-patch"]
)
def test_unrelated_file_damage_keeps_the_intact_target_title(
    repo: GitRepo, kind: UnitKind, damage: Callable[[str], Callable[[Commit], Commit]]
) -> None:
    """관계없는 다른 파일의 patch가 없거나 잘린 것만으로 온전한 대상의 제목을 null로 두지 않는다(완료
    기준 18)."""
    history = added_then_modified(repo, with_other_file=True)
    unit = unit_of(repo, history, kind, adjust={1: damage(OTHER_FILE)})

    assert generated_title(unit, Target(DOC)) == "install.md 문서 추가"


@requires_git
@pytest.mark.parametrize("kind", UNIT_KINDS)
def test_code_target_touched_without_patch_has_no_title(
    repo: GitRepo, kind: UnitKind
) -> None:
    """대상 파일을 건드린 본인 커밋의 patch가 없으면 그 이름이 바뀌었는지 알 수 없어 null이다(완료
    기준 18)."""
    history = build_history(
        repo,
        {CODE: python_module(*MIDDLE)},
        [
            {CODE: python_module("limit = 5", *MIDDLE)},
            {CODE: python_module("limit = 5", "alpha = 9", "beta = 2", "gamma = 3")},
        ],
    )
    unit = unit_of(repo, history, kind, adjust={1: without_file_patch(CODE)})

    assert generated_title(unit, Target(CODE, "limit")) is None


UNFETCHED_PLACES: dict[str, tuple[tuple[Step, ...], int]] = {
    # 대상 파일을 더한 커밋과 고친 커밋 사이(부모 사슬 가운데)의 본인 커밋.
    "between": (
        ({DOC: DOC_V1}, {OTHER_FILE: "x = 2\n"}, {DOC: DOC_V2}),
        1,
    ),
    # 대상 파일을 고친 커밋 뒤의 본인 커밋. 그 커밋이 대상 파일을 건드렸는지 알 수 없다.
    "after": (
        ({DOC: DOC_V1}, {DOC: DOC_V2}, {OTHER_FILE: "x = 2\n"}),
        2,
    ),
}


def unit_with_unfetched_commit(repo: GitRepo, kind: UnitKind, place: str) -> Unit:
    """UNFETCHED_PLACES의 이력에서 본인 커밋 하나의 상세 응답이 크기 상한을 넘어 변경 내용을 받지 못했다."""
    steps, unfetched = UNFETCHED_PLACES[place]
    history = build_history(repo, {OTHER_FILE: "x = 1\n"}, steps)
    unit = unit_of(repo, history, kind)
    return replace(
        unit,
        scenario=replace(
            unit.scenario,
            overrides={detail_path(history.work[unfetched]): oversized()},
        ),
    )


@requires_git
@pytest.mark.parametrize("kind", ["pull", "merge"])
@pytest.mark.parametrize("place", list(UNFETCHED_PLACES), ids=list(UNFETCHED_PLACES))
def test_diverging_actions_with_an_unfetched_own_commit_have_no_title(
    repo: GitRepo, kind: UnitKind, place: str
) -> None:
    """동작이 갈리는데 단위의 본인 커밋 가운데 변경 내용을 받지 못한 것이 있으면, 그 커밋이 대상
    파일을 건드렸는지 알 수 없어 null이다(완료 기준 21). 받지 못한 변경을 없었던 것으로 보지 않는다."""
    unit = unit_with_unfetched_commit(repo, kind, place)

    assert generated_title(unit, Target(DOC)) is None


@requires_git
def test_unprovable_before_and_after_makes_no_new_github_call(repo: GitRepo) -> None:
    """전후를 입증할 변경이 빠졌어도 새 GitHub 조회로 채우지 않는다: 생성은 수집 결과만 받고, 생성 전후
    수집 호출 기록이 같으며 제목은 null이다(완료 기준 21, #120 본문 「Catch 제목」)."""
    unit = unit_with_unfetched_commit(repo, "pull", "between")
    before = run_case(unit.scenario, request=unit.request)
    calls = list(before.transport.paths)
    clock = FakeClock()
    provider = ScriptedProvider(target_reply(Target(DOC)), repeat=False)

    run = run_generation(
        before.request,
        before.outcome,
        before.output,
        provider=provider,
        clock=clock,
        deadline=clock() + DEFAULT_DEADLINE,
    )

    # 입구(구현 요약의 run_generation)에는 GitHub 연결·저장소 경로를 넘기는 자리가 없다.
    assert set(inspect.signature(run_generation).parameters) == {
        "request",
        "outcome",
        "built",
        "provider",
        "clock",
        "deadline",
        "limits",
        # CR3: 판정 공급자와 FR10 확인 명령의 관찰자. 둘 다 GitHub 연결이 아니다.
        "judge",
        "observe",
    }
    assert run.output.candidates[0].title is None
    assert before.transport.paths == calls
    assert [each.purpose for each in provider.requests] == ["GENERATE"]


# 7. 다른 계정 커밋(결정 11): 동작이 갈리면 null, 하나로 일정하면 기존 규칙


@requires_git
@pytest.mark.parametrize("kind", ["pull", "merge"])
def test_diverging_actions_with_another_account_commit_have_no_title(
    repo: GitRepo, kind: UnitKind
) -> None:
    """동작이 갈리는데 같은 단위에 다른 계정 커밋이 있으면 null이다(완료 기준 22).

    다른 계정 커밋은 본인 커밋들보다 앞에 두고 대상 파일도 건드리지 않는다. 본인 커밋끼리는 부모·
    자식으로 바로 이어지므로, null이 되는 이유는 다른 계정 커밋이 있다는 것 하나다.
    """
    history = build_history(
        repo,
        {OTHER_FILE: "x = 1\n"},
        [{OTHER_FILE: "x = 2\n"}, {DOC: DOC_V1}, {DOC: DOC_V2}],
    )
    unit = unit_of(repo, history, kind, authors=[OTHER, MEMBER, MEMBER])

    assert generated_title(unit, Target(DOC)) is None


@requires_git
@pytest.mark.parametrize("kind", ["pull", "merge"])
def test_diverging_actions_across_another_accounts_commit_have_no_title(
    repo: GitRepo, kind: UnitKind
) -> None:
    """동작이 갈리는 본인 커밋 사이에 다른 계정 커밋이 끼면 그 커밋의 변경을 알 수 없어 순서를 입증하지
    못하므로 null이다(완료 기준 21·22)."""
    history = build_history(
        repo,
        {OTHER_FILE: "x = 1\n"},
        [{DOC: DOC_V1}, {OTHER_FILE: "x = 2\n"}, {DOC: DOC_V2}],
    )
    unit = unit_of(repo, history, kind, authors=[MEMBER, OTHER, MEMBER])

    assert generated_title(unit, Target(DOC)) is None


@requires_git
@pytest.mark.parametrize("kind", ["pull", "merge"])
def test_uniform_action_with_another_account_commit_keeps_the_title(
    repo: GitRepo, kind: UnitKind
) -> None:
    """동작이 하나로 일정하면 다른 계정 커밋이 같은 파일을 고쳤어도 기존 규칙대로 제목이 나온다
    (결정 11, 완료 기준 22의 반대 경우)."""
    history = build_history(
        repo,
        {DOC: DOC_V0},
        [{DOC: DOC_V1}, {DOC: "# install\n\nstep other\n"}, {DOC: DOC_V2}],
    )
    unit = unit_of(repo, history, kind, authors=[MEMBER, OTHER, MEMBER])

    assert generated_title(unit, Target(DOC)) == "install.md 문서 수정"


def pull_with_unread_commit_list(repo: GitRepo, history: History) -> Unit:
    """PR 커밋 목록을 크기 상한으로 받지 못해 다른 계정 커밋이 있는지 알 수 없다. 본인 커밋의 PR
    소속은 연결 PR 조회로 안다."""
    unit = unit_of(repo, history, "pull")
    return replace(
        unit,
        scenario=replace(
            unit.scenario,
            overrides={pull_commits_path(PR_NUMBER): oversized()},
            lookups={each: (PR_NUMBER,) for each in history.work},
        ),
    )


@requires_git
def test_diverging_actions_with_unknown_other_accounts_have_no_title(
    repo: GitRepo,
) -> None:
    """동작이 갈리는데 다른 계정 커밋이 있는지 알 수 없으면(PR 커밋 목록 미수신) null이다(완료 기준 22)."""
    history = added_then_modified(repo)

    title = generated_title(pull_with_unread_commit_list(repo, history), Target(DOC))

    assert title is None


@requires_git
def test_uniform_action_with_unknown_other_accounts_keeps_the_title(
    repo: GitRepo,
) -> None:
    """동작이 하나로 일정하면 다른 계정 커밋이 있는지 몰라도 기존 규칙대로 제목이 나온다(결정 11)."""
    history = build_history(repo, {DOC: DOC_V0}, [{DOC: DOC_V1}, {DOC: DOC_V2}])

    title = generated_title(pull_with_unread_commit_list(repo, history), Target(DOC))

    assert title == "install.md 문서 수정"


# 8. 적용 순서는 확인된 부모·자식 관계로만(결정 17)


def child_with_sha_order(
    repo: GitRepo, step: Step, parent: str, *, minute: int, smaller: bool
) -> str:
    """부모 위에 커밋을 만들되 자식 SHA가 부모 SHA보다 작거나(smaller) 크게 될 때까지 메시지를 바꾼다.

    저장소 시각·작성자가 고정이라 같은 순서로 만들면 같은 SHA가 나온다(결정적).
    """
    for attempt in range(256):
        apply_step(repo, step)
        # 끝 문장 부호만 바꿔 SHA를 바꾼다. 앞뒤 문장 부호를 빼면 부실 목록의 낱말이다(BR2.5).
        child = repo.commit(f"{DEFAULT_MESSAGE}{'.' * attempt}", minute=minute)
        if (child < parent) == smaller:
            return child
        repo.git("reset", "-q", "--hard", parent)
    raise AssertionError("원하는 SHA 순서의 커밋을 만들지 못했다")


@requires_git
@pytest.mark.parametrize("kind", UNIT_KINDS)
@pytest.mark.parametrize(
    "child_earlier", [True, False], ids=["child-earlier", "child-later"]
)
@pytest.mark.parametrize(
    "child_sha_smaller", [True, False], ids=["sha-lower", "sha-higher"]
)
def test_application_order_follows_parents_not_time_sha_or_evidence(
    repo: GitRepo, kind: UnitKind, child_earlier: bool, child_sha_smaller: bool
) -> None:
    """전후 비교는 부모·자식 관계로만 순서를 정하고 작성 시각·SHA·근거 배열 순서를 쓰지 않는다(완료
    기준 20).

    자식(파일을 고친 커밋)의 작성 시각과 SHA를 부모(파일을 더한 커밋)보다 이르거나 늦게, 작거나 크게
    둔다. 근거는 본인 커밋을 작성 시각이 늦은 것부터 놓으므로 두 시각 경우에서 근거 배열 순서도
    서로 반대가 된다. 어느 경우든 파일은 「추가」, 값을 바꾼 코드 이름도 「추가」다.
    """
    apply_step(repo, {OTHER_FILE: "x = 1\n", CODE: python_module()})
    root = repo.commit("기준")
    repo.branch("work")
    repo.checkout("work")
    parent_minute, child_minute = (60, 30) if child_earlier else (30, 60)
    apply_step(repo, {DOC: DOC_V1, CODE: python_module("limit = 5")})
    parent = repo.commit(DEFAULT_MESSAGE, minute=parent_minute)
    child = child_with_sha_order(
        repo,
        {DOC: DOC_V2, CODE: python_module("limit = 10")},
        parent,
        minute=child_minute,
        smaller=child_sha_smaller,
    )
    repo.checkout("main")
    merged = repo.merge("work", "작업 병합", minute=300)
    history = History(root, (parent, child), merged)
    assert repo.parents(child) == (parent,)
    unit = unit_of(repo, history, kind)

    # 사례 모양: 근거의 본인 커밋 순서가 작성 시각을 따라 부모·자식 순서와 같거나 반대다.
    shown = evidence_urls(
        run_case(unit.scenario, request=unit.request).result["candidates"][0]
    )
    positions = (shown.index(commit_url(parent)), shown.index(commit_url(child)))
    assert (positions[0] < positions[1]) == child_earlier

    assert generated_title(unit, Target(DOC)) == "install.md 문서 추가"
    assert generated_title(unit, Target(CODE, "limit")) == "limit 코드 추가"


# 9. 같은 문자열의 다른 위치 변경(결정 17): 위치를 입증하면 대조, 입증할 수 없으면 null


@requires_git
@pytest.mark.parametrize("kind", UNIT_KINDS)
@pytest.mark.parametrize(
    "existing", ["limit = 5", "limit=5"], ids=["same-text", "whitespace-only-different"]
)
def test_same_text_at_another_place_is_not_cancelled(
    repo: GitRepo, kind: UnitKind, existing: str
) -> None:
    """앞 커밋이 아래에 더한 줄과 뒤 커밋이 위에서 지운 원래 줄은 글이 같거나 공백만 달라도 서로 지우지
    않는다. 부모 사슬로 위치를 입증했으므로 원래 줄 삭제 + 새 줄 추가 = 수정이다(완료 기준 21)."""
    history = build_history(
        repo,
        {CODE: python_module(existing, *MIDDLE)},
        [
            {CODE: python_module(existing, *MIDDLE, "limit = 5")},
            {CODE: python_module(*MIDDLE, "limit = 5")},
        ],
    )

    assert generated_title(unit_of(repo, history, kind), Target(CODE, "limit")) == (
        "limit 코드 수정"
    )


def picked_bundle(repo: GitRepo) -> Unit:
    """기본 브랜치에 바로 올린 이력: 본인이 아래에 limit 줄을 더함 → 다른 계정이 되돌림 → 본인이
    cherry-pick -x로 같은 변경을 다시 올림 → 본인이 위의 원래 limit 줄을 지움.

    처음 커밋과 cherry-pick 커밋은 부모·자식이 아니라 같은 변경으로만 이어져 한 커밋 묶음이 된다.
    그사이 다른 계정 커밋이 같은 파일을 고쳤다. 같은 문자열 `limit = 5`가 더해지고 지워졌지만 순서와
    위치를 입증할 수 없다.
    """
    apply_step(repo, {CODE: python_module("limit = 5", *MIDDLE)})
    root = repo.commit("기준")
    apply_step(repo, {CODE: python_module("limit = 5", *MIDDLE, "limit = 5")})
    # 메시지는 부실 목록의 낱말이다(기록의 글이 제목이 되지 않게, CR1 BR3.2).
    first = repo.commit(DEFAULT_MESSAGE)
    reverted = repo.revert(first)
    picked = repo.cherry_pick_x(first)
    apply_step(repo, {CODE: python_module(*MIDDLE, "limit = 5")})
    last = repo.commit(DEFAULT_MESSAGE)
    assert repo.parents(picked) == (reverted,)
    default_branch = (
        git_commit(repo, last, MEMBER),
        git_commit(repo, picked, MEMBER),
        git_commit(repo, reverted, OTHER),
        git_commit(repo, first, MEMBER),
        git_commit(repo, root, OTHER),
    )
    return Unit(
        Scenario(default_branch=default_branch),
        live_request("COMMIT"),
        bundle_identity(*sorted((first, picked, last))),
    )


@requires_git
def test_same_text_whose_order_and_place_cannot_be_proven_has_no_title(
    repo: GitRepo,
) -> None:
    """부모 관계 없이 같은 변경으로 묶였고 그사이 다른 계정 커밋이 같은 파일을 고친 묶음에서는 같은
    문자열의 추가·삭제를 상쇄하지 않고 순서·위치를 입증할 수 없어 null이다(완료 기준 21)."""
    unit = picked_bundle(repo)

    assert generated_title(unit, Target(CODE, "limit")) is None


# 검토에서 찾은 경계: 되살린 줄, 후보 안 이름 바꿈, 근거 20건 밖 본인 커밋


@pytest.mark.parametrize("kind", UNIT_KINDS)
def test_line_removed_then_restored_in_place_is_null(
    repo: GitRepo, kind: UnitKind
) -> None:
    """시작 전 줄을 지운 뒤 같은 자리에 같은 내용으로 되살리면 시작 전·끝이 같아 동작을 정할 수 없다(19)."""
    history = build_history(
        repo,
        {CODE: python_module("limit = 5", *MIDDLE)},
        [{CODE: python_module(*MIDDLE)}, {CODE: python_module("limit = 5", *MIDDLE)}],
    )

    assert generated_title(unit_of(repo, history, kind), Target(CODE, "limit")) is None


def _created_then_renamed(second_patch: str) -> Unit:
    """PR 안에서 첫 커밋이 src/limits.py를 만들고 다음 커밋이 src/rate.py로 이름을 바꾼 이력."""
    created = commit(
        sha(5001),
        MEMBER,
        parents=(ROOT,),
        minute=2,
        files=[
            change(
                "src/limits.py",
                patch="@@ -0,0 +1,2 @@\n+limit = 5\n+other = 1",
                status="added",
            )
        ],
    )
    renamed = change("src/rate.py", patch=second_patch, status="renamed")
    renamed["previous_filename"] = "src/limits.py"
    moved = commit(sha(5002), MEMBER, parents=(created.sha,), minute=3, files=[renamed])
    merged = merge_commit(sha(5003), ROOT, moved.sha, minute=4)
    scenario = Scenario(
        default_branch=(merged, moved, created, root_commit()),
        pulls=(
            Pull(
                PR_NUMBER,
                MEMBER,
                (created, moved),
                created=1,
                merged=4,
                merge_commit=merged.sha,
            ),
        ),
    )
    return Unit(scenario, LIVE, pull_identity(PR_NUMBER))


@pytest.mark.parametrize(
    "target",
    [Target("src/rate.py"), Target("src/rate.py", "limit")],
    ids=["file", "code"],
)
def test_file_created_then_renamed_in_the_candidate_is_null(target: Target) -> None:
    """후보 안에서 만든 파일을 뒤 커밋이 이름을 바꾸면, 앞 커밋도 같은 파일의 변경으로 보고 이름 바꿈이
    낀 흐름이라 null이다(「이름 변경」·「수정」으로 내지 않는다)."""
    unit = _created_then_renamed("@@ -1,2 +1,2 @@\n-limit = 5\n+limit = 6\n other = 1")

    assert generated_title(unit, target) is None


def _long_pull(last_patch: str, last_status: str) -> Unit:
    """본인 커밋 21개 PR. 첫 커밋이 docs/install.md를 만들고, 2~20번은 다른 파일만, 21번이 install.md를
    고친다. 근거에는 최근 20건만 들어 첫 커밋은 재료가 아니다."""
    first = commit(
        sha(6001),
        MEMBER,
        parents=(ROOT,),
        minute=1,
        files=[change(DOC, patch="@@ -0,0 +1 @@\n+limit = 5", status="added")],
    )
    made = [first]
    for number in range(2, 21):
        made.append(
            commit(
                sha(6000 + number),
                MEMBER,
                parents=(made[-1].sha,),
                minute=number,
                files=[
                    change(
                        OTHER_FILE,
                        patch=f"@@ -1 +1 @@\n-x = {number - 1}\n+x = {number}",
                    )
                ],
            )
        )
    made.append(
        commit(
            sha(6021),
            MEMBER,
            parents=(made[-1].sha,),
            minute=21,
            files=[change(DOC, patch=last_patch, status=last_status)],
        )
    )
    merged = merge_commit(sha(6100), ROOT, made[-1].sha, minute=30)
    scenario = Scenario(
        default_branch=(merged, *reversed(made), root_commit()),
        pulls=(
            Pull(
                PR_NUMBER,
                MEMBER,
                tuple(made),
                created=1,
                merged=30,
                merge_commit=merged.sha,
            ),
        ),
    )
    return Unit(scenario, LIVE, pull_identity(PR_NUMBER))


@pytest.mark.parametrize(
    ("last_patch", "last_status", "target"),
    [
        ("@@ -1 +1 @@\n-limit = 5\n+limit = 6", "modified", Target(DOC)),
        ("@@ -1 +1 @@\n-limit = 5\n+limit = 6", "modified", Target(DOC, "limit")),
        ("@@ -1 +0,0 @@\n-limit = 5", "removed", Target(DOC, "limit")),
    ],
    ids=["file-modified", "code-modified", "code-removed"],
)
def test_own_commit_beyond_the_evidence_cap_touching_the_target_makes_null(
    last_patch: str, last_status: str, target: Target
) -> None:
    """근거 20건 밖 본인 커밋이 대상 파일을 건드렸으면 그 커밋은 허용 근거가 아니어서 후보 전후를 확인할
    수 없다. 재료 커밋끼리 동작이 하나여도 제목은 null이다(19·21)."""
    assert generated_title(_long_pull(last_patch, last_status), target) is None


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("src/readme_parser.py", "코드"),
        ("src/ReadmeRenderer.tsx", "코드"),
        ("tools/changelog_writer.go", "코드"),
        ("README.txt", "문서"),
    ],
)
def test_readme_rule_covers_only_readme_and_changelog_names(
    path: str, expected: str
) -> None:
    """README·CHANGELOG 규칙은 점 앞 이름이 그 낱말인 파일만이다. 이름이 그 낱말로 시작하는 소스 파일은
    코드다."""
    assert classify(path) == expected


# 받은 커밋끼리 동작이 같아도, 대상 파일을 건드렸는지 모르는 본인 커밋이 있으면 제목 없음
# (2026-10-13 팀장 결정: 받지 못한 변경을 없었던 것으로 보지 않는다)

UNIFORM_STEPS: tuple[Step, ...] = ({DOC: DOC_V1}, {OTHER_FILE: "x = 2\n"})


def _uniform_unit(repo: GitRepo, kind: UnitKind, unclear: str | None) -> Unit:
    """첫 본인 커밋이 install.md를 만들고 둘째 본인 커밋은 다른 파일만 고친 이력. unclear가 있으면 둘째
    커밋의 변경 내용을 받지 못했거나(oversized) 파일 목록이 첫 쪽만 왔다(truncated)."""
    history = build_history(repo, {OTHER_FILE: "x = 1\n"}, UNIFORM_STEPS)
    unit = unit_of(repo, history, kind)
    if unclear is None:
        return unit
    other = history.work[1]
    detail = unit.scenario.all_commits()[other].detail
    assert detail is not None
    reply = oversized() if unclear == "oversized" else respond(detail, next_page=True)
    return replace(
        unit, scenario=replace(unit.scenario, overrides={detail_path(other): reply})
    )


@requires_git
@pytest.mark.parametrize("kind", ["pull", "merge"])
def test_uniform_action_keeps_the_title_when_every_own_commit_is_known(
    repo: GitRepo, kind: UnitKind
) -> None:
    """본인 커밋의 변경 파일을 모두 받았고 대상 파일을 건드린 커밋끼리 동작이 같으면 그 동작이다."""
    unit = _uniform_unit(repo, kind, None)

    assert generated_title(unit, Target(DOC)) == "install.md 문서 추가"


@requires_git
@pytest.mark.parametrize("kind", ["pull", "merge"])
@pytest.mark.parametrize("unclear", ["oversized", "truncated"])
def test_uniform_action_with_an_unclear_own_commit_has_no_title(
    repo: GitRepo, kind: UnitKind, unclear: str
) -> None:
    """받은 커밋끼리 동작이 같아도, 변경 내용을 받지 못했거나 파일 목록이 잘려 대상 파일을 건드렸는지
    모르는 본인 커밋이 있으면 제목은 null이다(2026-10-13 팀장 결정, 완료 기준 21의 원칙)."""
    unit = _uniform_unit(repo, kind, unclear)

    assert generated_title(unit, Target(DOC)) is None


@pytest.mark.parametrize(
    "path",
    ["src/widget.v2_test.py", "src/widget.test.d.ts", "src/widget.spec.helpers.ts"],
)
def test_test_name_patterns_match_the_whole_file_name(path: str) -> None:
    """시험 파일 꼴(`*_test.*`·`*.test.*`·`*.spec.*`)은 점이 여럿인 파일 이름에도 맞는다."""
    assert classify(path) == "시험"


@pytest.mark.parametrize("kind", UNIT_KINDS)
def test_line_restored_in_place_with_unrelated_lines_after_it_is_null(
    repo: GitRepo, kind: UnitKind
) -> None:
    """지운 시작 전 줄을 같은 자리에 되살리면서 관계없는 줄을 그 뒤에 더해도, 대상 이름이 든 줄은 시작
    전·끝이 같아 동작을 정할 수 없다(19·21)."""
    history = build_history(
        repo,
        {CODE: python_module("alpha = 1", "limit = 5", "beta = 2")},
        [
            {CODE: python_module("alpha = 1", "beta = 2")},
            {
                CODE: python_module(
                    "alpha = 1", "limit = 5", "extra_a = 3", "extra_b = 4", "beta = 2"
                )
            },
        ],
    )

    assert generated_title(unit_of(repo, history, kind), Target(CODE, "limit")) is None


def test_zero_context_restore_after_the_line_before_is_removed_is_null() -> None:
    """문맥 줄 없는(-U0) patch에서 지운 줄을 같은 자리에 되살리면 null이다. 지우기만 한 hunk의 자리
    위치를 한 줄 앞으로 잘못 세면 되살림을 놓친다(19·21)."""
    removed = commit(
        sha(7101),
        MEMBER,
        parents=(ROOT,),
        minute=2,
        files=[change(CODE, patch="@@ -2 +1,0 @@ alpha = 1\n-limit = 5")],
    )
    restored = commit(
        sha(7102),
        MEMBER,
        parents=(removed.sha,),
        minute=3,
        files=[change(CODE, patch="@@ -1,0 +2 @@ alpha = 1\n+limit = 5")],
    )
    merged = merge_commit(sha(7103), ROOT, restored.sha, minute=4)
    unit = Unit(
        Scenario(
            default_branch=(merged, restored, removed, root_commit()),
            pulls=(
                Pull(
                    PR_NUMBER,
                    MEMBER,
                    (removed, restored),
                    created=1,
                    merged=4,
                    merge_commit=merged.sha,
                ),
            ),
        ),
        LIVE,
        pull_identity(PR_NUMBER),
    )

    assert generated_title(unit, Target(CODE, "limit")) is None


# CR3 AI 쪽 제목 후보·설명 문장 읽기(BR3.1·BR5.1, 시나리오 S18·S30)


def _ai_sent() -> Sent:
    shown = PreparedLine(
        "c1f1:L2", "a" * 40, "c1f1", "+", "const loginRateLimit = 5;", False, 2
    )
    hidden = PreparedLine("c1f1:L3", "a" * 40, "c1f1", "+", "token = [MASKED]", True, 3)
    file = PreparedFile(
        "c1f1", "a" * 40, "src/auth.ts", "modified", None, (shown, hidden)
    )
    return Sent({shown.id: shown, hidden.id: hidden}, {file.id: file})


def test_s18_ai_title_candidates_over_40_chars_are_dropped() -> None:
    """S18: 40자를 넘는 후보는 버린다(고쳐 쓰지 않는다). 41자는 버리고 40자는 남는다. 3개까지 쓴다."""
    exact = "loginRateLimit " + "가" * 25
    over = exact + "나"
    assert (len(exact), len(over)) == (40, 41)
    part = written(
        [
            {"text": over, "lines": ["c1f1:L2"]},
            {"text": exact, "lines": ["c1f1:L2"]},
            {"text": "  둘째 후보  ", "lines": ["c1f1:L2", "c1f1:L2"]},
            {"text": "셋째", "lines": ["c1f1:L2"]},
            {"text": "넷째", "lines": ["c1f1:L2"]},
        ],
        _ai_sent(),
        prefix="t",
        high=3,
        max_chars=40,
    )
    assert part is not None
    assert [(item.id, item.text) for item in part.items] == [
        ("t1", exact),
        ("t2", "둘째 후보"),
        ("t3", "셋째"),
    ]
    assert [line.id for line in part.items[1].lines] == ["c1f1:L2"]
    assert part.notes == ("dropped:TOO_LONG", "over:COUNT")


@pytest.mark.parametrize(
    ("item", "note"),
    [
        ({"text": "근거 없음", "lines": []}, "dropped:ITEM_SHAPE"),
        ({"text": "가린 줄", "lines": ["c1f1:L3"]}, "dropped:MASKED_LINE"),
        ({"text": "없는 줄", "lines": ["c9f9:L1"]}, "dropped:UNKNOWN_LINE"),
        ({"text": "두\n줄", "lines": ["c1f1:L2"]}, "dropped:ITEM_SHAPE"),
        ({"text": "", "lines": ["c1f1:L2"]}, "dropped:ITEM_SHAPE"),
        ({"text": "키 더함", "lines": ["c1f1:L2"], "why": "x"}, "dropped:ITEM_SHAPE"),
        ("문장", "dropped:ITEM_SHAPE"),
    ],
)
def test_ai_items_without_valid_lines_are_dropped(item: object, note: str) -> None:
    """근거 줄이 없거나 가린 줄·보낸 자료에 없는 줄을 가리킨 글, 모양이 틀린 글은 버린다(BR3.1·BR5.1)."""
    part = written([item], _ai_sent(), prefix="s", high=3, max_chars=None)
    assert part is not None
    assert part.items == ()
    assert part.notes == (note,)


def test_s30_missing_sentences_make_the_response_unreadable() -> None:
    """S30: 문장 칸이 없거나 목록이 아니면 읽을 수 없는 응답(None)이다. 제목 후보 칸이 없으면 후보 0개다."""
    sent = _ai_sent()
    assert ai_parts({"titleCandidates": []}, sent, max_title_chars=40) is None
    assert ai_parts({"sentences": "문장"}, sent, max_title_chars=40) is None
    parts = ai_parts({"sentences": []}, sent, max_title_chars=40)
    assert parts is not None
    assert parts.titles.items == () and parts.titles.notes == ("dropped:SHAPE",)
    assert parts.sentences.items == ()
