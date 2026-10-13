"""생성 입력의 patch 해석과 온전성 검사(#120): `parse_patch`·`new_position`·`line_at_old`.

기대값은 #120 본문(완료 기준 08·18·21), 2026-10-12 결정 6·11·17, 생성 계획의 「후보 하나의 처리
순서」 2번과 「첫 범위의 검사」 2번에서 정했다. 줄은 `\\n`으로만 나누고 끝의 빈 요소 하나만 버리며
줄 끝 \\r은 내용으로 남긴다. hunk 머리글의 줄 수와 내용 줄(' '·'-'·'+'), '+'·'-' 줄 수와 GitHub의
additions·deletions가 맞아야 온전하고, `\\ ` 표시 줄은 세지 않으며, UTF-8로 인코딩할 수 없으면 온전하지
않다. 모델이 지목하는 줄 순서(patch 안 줄 순서, 1부터, 머리글 포함 — 구현 요약의 값)와 제목 전후 비교에
쓰는 이전·이후 줄 위치는 따로 두고, 삭제 줄과 추가 줄의 순서나 번호가 같다고 같은 위치로 보지 않는다.
patch 코드를 읽어 기대값을 맞추지 않았다.

손으로 쓴 합성 patch 말고도 실제 git(`git_synthetic.GitRepo`)으로 만든 patch를 이전·이후 파일 내용과
줄마다 대조한다. `content_patch_id`와의 대조는 같은 판정을 다른 구현과 맞춰 보는 보조 시험이며 운영
판정에는 쓰지 않는다.
"""

from collections.abc import Callable, Mapping
from typing import Any

import pytest
from candidate_scenarios import change
from git_synthetic import GitRepo, commit_changes, python_module, requires_git
from github_synthetic import file_json, line_counts

from app.candidates.same_change import content_patch_id
from app.generation.patch import ParsedPatch, PatchLine, parse_patch

# (patch 안 줄 순서, 종류, 내용, 이전 줄 위치, 이후 줄 위치)
Row = tuple[int, str, str, int | None, int | None]

# 두 hunk짜리 정상 patch. 앞 hunk가 줄을 하나 늘려 뒤 hunk의 이후 위치가 이전 위치보다 1 크다.
TWO_HUNKS = "\n".join(
    [
        "@@ -2,3 +2,4 @@ def handler():",
        " b",
        "-c",
        "+C",
        "+C2",
        " d",
        "@@ -20,2 +21,2 @@",
        " t",
        "-u",
        "+U",
    ]
)
TWO_HUNKS_ROWS: list[Row] = [
    (2, " ", "b", 2, 2),
    (3, "-", "c", 3, None),
    (4, "+", "C", None, 3),
    (5, "+", "C2", None, 4),
    (6, " ", "d", 4, 5),
    (8, " ", "t", 20, 21),
    (9, "-", "u", 21, None),
    (10, "+", "U", None, 22),
]

# str.splitlines()가 줄 경계로 보는 글자 가운데 \n 말고 모두. patch 줄 안에 있어도 한 줄이다.
LINE_BREAKING_CHARACTERS = [
    "\r",
    "\x0b",
    "\x0c",
    "\x1c",
    "\x1d",
    "\x1e",
    "\x85",
    "\u2028",
    "\u2029",
]


def _intact(patch: str, additions: int, deletions: int) -> ParsedPatch:
    parsed = parse_patch(patch, additions, deletions)
    assert parsed is not None, "온전한 patch를 온전하지 않다고 판정했다"
    return parsed


def _row(line: PatchLine) -> Row:
    return (line.index, line.kind, line.text, line.old_no, line.new_no)


def _rows(parsed: ParsedPatch) -> list[Row]:
    """hunk의 내용 줄 전부(문맥 줄 포함). 머리글·`\\ ` 표시 줄은 내용 줄이 아니다."""
    return [_row(line) for hunk in parsed.hunks for line in hunk.lines]


def _changed_rows(parsed: ParsedPatch) -> list[Row]:
    return [_row(line) for line in parsed.changed]


def _counted(patch: str) -> ParsedPatch | None:
    """additions·deletions를 GitHub처럼 patch의 '+'·'-' 줄 수로 주고 해석한다."""
    additions, deletions = line_counts(patch)
    return parse_patch(patch, additions, deletions)


# 정상 patch와 줄 나누기


def test_two_hunk_patch_keeps_patch_order_and_file_positions() -> None:
    """정상 patch는 온전하고, 내용 줄마다 patch 안 줄 순서와 이전·이후 줄 위치를 따로 남긴다(계획 2)."""
    parsed = _intact(TWO_HUNKS, 3, 2)
    assert len(parsed.hunks) == 2
    assert _rows(parsed) == TWO_HUNKS_ROWS
    assert _changed_rows(parsed) == [row for row in TWO_HUNKS_ROWS if row[1] != " "]


def test_line_index_is_the_line_number_inside_the_patch() -> None:
    """줄 순서는 머리글을 1로 센 patch 안 줄 번호라 그 번호의 patch 줄이 곧 그 내용 줄이다."""
    parsed = _intact(TWO_HUNKS, 3, 2)
    raw = TWO_HUNKS.split("\n")
    for line in (line for hunk in parsed.hunks for line in hunk.lines):
        assert raw[line.index - 1] == line.kind + line.text
    # 뒤 hunk의 줄 순서는 파일 위치와 다르다: 'U'는 patch 10번째 줄, 이후 파일 22번째 줄이다.
    last = parsed.changed[-1]
    assert (last.index, last.new_no) == (10, 22)


def test_header_without_count_means_one_line() -> None:
    """머리글의 줄 수를 생략하면 1줄이다(`@@ -7 +7 @@`는 이전·이후 모두 7번째 줄 하나)."""
    parsed = _intact("@@ -7 +7 @@\n-a\n+b", 1, 1)
    assert _rows(parsed) == [(2, "-", "a", 7, None), (3, "+", "b", None, 7)]


def test_header_section_heading_is_allowed() -> None:
    """git이 머리글 뒤에 붙이는 함수 이름 글자는 머리글 모양 오류가 아니다."""
    patch = "@@ -3,2 +3,2 @@ def handler(request):\n x\n-y\n+z"
    assert _rows(_intact(patch, 1, 1)) == [
        (2, " ", "x", 3, 3),
        (3, "-", "y", 4, None),
        (4, "+", "z", None, 4),
    ]


@pytest.mark.parametrize(
    "character", LINE_BREAKING_CHARACTERS, ids=lambda c: f"U+{ord(c):04X}"
)
def test_line_breaking_characters_stay_inside_one_line(character: str) -> None:
    """\\x0c·\\x85·\\u2028 같은 글자가 든 줄도 \\n으로만 나눠 한 줄로 남는다(계획 2: splitlines 금지)."""
    patch = (
        f"@@ -1,2 +1,2 @@\n a{character}b\n-c{character}d\n+e{character}f"
        f"\n@@ -9 +9 @@ g{character}h\n-i\n+j{character}"
    )
    parsed = _intact(patch, 2, 2)
    assert _rows(parsed) == [
        (2, " ", f"a{character}b", 1, 1),
        (3, "-", f"c{character}d", 2, None),
        (4, "+", f"e{character}f", None, 2),
        (6, "-", "i", 9, None),
        (7, "+", f"j{character}", None, 9),
    ]


def test_crlf_keeps_carriage_return_as_line_content() -> None:
    """CRLF 파일의 patch는 줄 끝 \\r을 내용으로 남긴 채 온전하다(계획 2)."""
    patch = "@@ -1,3 +1,3 @@\n one\r\n-two\r\n+TWO\r\n three\r"
    assert _rows(_intact(patch, 1, 1)) == [
        (2, " ", "one\r", 1, 1),
        (3, "-", "two\r", 2, None),
        (4, "+", "TWO\r", None, 2),
        (5, " ", "three\r", 3, 3),
    ]


def test_only_one_trailing_empty_element_is_dropped() -> None:
    """patch 끝의 줄바꿈 하나는 빈 줄로 세지 않지만, 그 뒤에 남는 빈 요소는 hunk 밖의 줄이다."""
    assert _rows(_intact(TWO_HUNKS + "\n", 3, 2)) == TWO_HUNKS_ROWS
    assert parse_patch(TWO_HUNKS + "\n\n", 3, 2) is None


@pytest.mark.parametrize(
    ("patch", "additions", "deletions", "rows"),
    [
        pytest.param(
            "@@ -1,2 +1,2 @@\n first\n-last\n+LAST\n\\ No newline at end of file",
            1,
            1,
            [
                (2, " ", "first", 1, 1),
                (3, "-", "last", 2, None),
                (4, "+", "LAST", None, 2),
            ],
            id="end",
        ),
        pytest.param(
            "@@ -1,2 +1,3 @@\n first\n-last\n\\ No newline at end of file"
            "\n+last\n+more",
            2,
            1,
            [
                (2, " ", "first", 1, 1),
                (3, "-", "last", 2, None),
                (5, "+", "last", None, 2),
                (6, "+", "more", None, 3),
            ],
            id="middle",
        ),
        pytest.param(
            "@@ -1,2 +1,2 @@\n first\n-last\n\\ No newline at end of file"
            "\n+LAST\n\\ No newline at end of file",
            1,
            1,
            [
                (2, " ", "first", 1, 1),
                (3, "-", "last", 2, None),
                (5, "+", "LAST", None, 2),
            ],
            id="both",
        ),
        pytest.param(
            "@@ -0,0 +1,2 @@\n+first\n+last\n\\ No newline at end of file",
            2,
            0,
            [(2, "+", "first", None, 1), (3, "+", "last", None, 2)],
            id="added-file",
        ),
    ],
)
def test_no_newline_marker_is_not_counted(
    patch: str, additions: int, deletions: int, rows: list[Row]
) -> None:
    """`\\ No newline at end of file` 표시 줄은 hunk·추가·삭제 줄 수에 세지 않지만 patch 줄 순서는 차지한다."""
    assert _rows(_intact(patch, additions, deletions)) == rows


def test_content_lines_that_look_like_headers_are_changed_lines() -> None:
    """내용이 `---`·`+++`·`@@`로 시작하는 줄도 앞 글자로 종류를 정한 내용 줄이다."""
    patch = "@@ -1,2 +1,3 @@\n--- a/x\n+++ b/x\n+@@ -9 +9 @@\n kept"
    assert _rows(_intact(patch, 2, 1)) == [
        (2, "-", "-- a/x", 1, None),
        (3, "+", "++ b/x", None, 1),
        (4, "+", "@@ -9 +9 @@", None, 2),
        (5, " ", "kept", 2, 3),
    ]


def test_added_and_removed_file_patches_are_intact() -> None:
    """새 파일(`-0,0`)과 지운 파일(`+0,0`)의 patch는 온전하고, 없는 쪽 위치는 None이다."""
    added = _intact("@@ -0,0 +1,2 @@\n+a\n+b", 2, 0)
    assert _rows(added) == [(2, "+", "a", None, 1), (3, "+", "b", None, 2)]
    removed = _intact("@@ -1,2 +0,0 @@\n-a\n-b", 0, 2)
    assert _rows(removed) == [(2, "-", "a", 1, None), (3, "-", "b", 2, None)]
    assert [removed.new_position(n) for n in (1, 2)] == [None, None]


def test_empty_patch_is_intact_only_without_changed_lines() -> None:
    """빈 patch는 추가·삭제가 0/0일 때만 온전하고(hunk 없음), 그 밖에는 온전하지 않다."""
    parsed = _intact("", 0, 0)
    assert parsed.hunks == ()
    assert parsed.changed == ()
    assert parsed.new_position(5) == 5
    assert parse_patch("", 1, 0) is None
    assert parse_patch("", 0, 1) is None
    assert parse_patch("", 3, 2) is None


def test_default_change_patch_of_the_scenario_tool_is_intact() -> None:
    """후보 사례 도구 `change()`의 기본 patch는 정상 patch다(생성 시험의 정상 재료)."""
    entry = change("src/app.py")
    parsed = _intact(entry["patch"], entry["additions"], entry["deletions"])
    assert _rows(parsed) == [
        (2, "-", "old src/app.py", 1, None),
        (3, "+", "new src/app.py", None, 1),
    ]


# 온전하지 않은 patch


def test_header_only_patch_from_file_json_default_is_not_intact() -> None:
    """`file_json`의 기본 patch `@@ -1 +1 @@`는 머리글만 있어 줄 수가 맞지 않는다(계획 「시험 도구」)."""
    entry = file_json("app.py", 1, 1)
    assert entry["patch"] == "@@ -1 +1 @@"
    assert parse_patch(entry["patch"], entry["additions"], entry["deletions"]) is None
    assert parse_patch("@@ -1 +1 @@", 0, 0) is None
    counted = change("app.py", patch="@@ -1 +1 @@")
    assert (counted["additions"], counted["deletions"]) == (0, 0)
    assert parse_patch(counted["patch"], 0, 0) is None


@pytest.mark.parametrize(
    "patch",
    [
        pytest.param("@@ -1,3 +1,3 @@\n a\n-b\n+B", id="hunk-cut-short"),
        pytest.param("@@ -1 +1 @@\n-a\n+b\n c", id="extra-context-line"),
        pytest.param("@@ -1 +1 @@\n-a\n+b\n+c", id="extra-added-line"),
        pytest.param("@@ -1,2 +1 @@\n-a\n+b", id="fewer-old-lines"),
        pytest.param("@@ -1 +1,2 @@\n-a\n-b\n+x\n+y", id="old-side-overflows"),
        pytest.param(
            "@@ -1,2 +1,2 @@\n-a\n+A\n b\n@@ -10,2 +10,2 @@\n-x",
            id="last-hunk-cut-short",
        ),
        pytest.param(
            "@@ -1,2 +1,2 @@\n-a\n+A\n b\n@@ -10 +10 @@", id="last-hunk-header-only"
        ),
    ],
)
def test_hunk_line_counts_must_match_header(patch: str) -> None:
    """hunk 머리글의 줄 수와 내용 줄 수가 다르면 온전하지 않다(additions·deletions는 맞춰 둠)."""
    assert _counted(patch) is None


@pytest.mark.parametrize(
    ("additions", "deletions"),
    [(2, 2), (4, 2), (3, 1), (3, 3), (2, 1), (2, 3), (0, 0), (5, 4)],
)
def test_additions_and_deletions_must_match_changed_lines(
    additions: int, deletions: int
) -> None:
    """hunk가 맞아도 '+'·'-' 줄 수가 GitHub의 additions·deletions와 다르면 온전하지 않다."""
    # TWO_HUNKS는 '+' 3줄·'-' 2줄이다(같을 때 온전함은 맨 앞 시험이 본다).
    assert parse_patch(TWO_HUNKS, additions, deletions) is None


def test_whole_trailing_hunk_missing_is_not_intact() -> None:
    """뒤 hunk가 통째로 빠져 머리글과는 맞는 patch도 GitHub 줄 수와 대조해 온전하지 않다."""
    first_hunk = TWO_HUNKS.split("\n@@ -20")[0]
    assert _rows(_intact(first_hunk, 2, 1)) == TWO_HUNKS_ROWS[:5]
    assert parse_patch(first_hunk, 3, 2) is None


@pytest.mark.parametrize(
    "header",
    [
        "@@ -1 +1",
        "@@ -1 +1 @",
        "@@ -1 +1@@",
        "@@ -a +1 @@",
        "@@ -1, +1 @@",
        "@@ -1,1,1 +1 @@",
        "@@ 1 1 @@",
        "@@ +1 -1 @@",
        "@@ --1 +1 @@",
        "@@ -1 +-1 @@",
        "@@  -1 +1 @@",
        "@@@ -1 -1 +1 @@@",
    ],
)
def test_malformed_header_is_not_intact(header: str) -> None:
    """`@@ -a[,b] +c[,d] @@` 모양이 아닌 머리글이면 온전하지 않다."""
    assert parse_patch(f"{header}\n-a\n+b", 1, 1) is None
    # 뒤 hunk의 머리글만 어긋나도 같다.
    assert parse_patch(f"@@ -1 +1 @@\n-a\n+b\n{header}\n-c\n+d", 2, 2) is None


@pytest.mark.parametrize(
    "patch",
    [
        pytest.param("-a\n+b", id="changed-lines-only"),
        pytest.param(" a\n@@ -1 +1 @@\n-a\n+b", id="context-before-header"),
        pytest.param("diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b", id="git-header"),
        pytest.param("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b", id="file-names"),
        pytest.param("\n@@ -1 +1 @@\n-a\n+b", id="leading-empty-line"),
        pytest.param(
            "\\ No newline at end of file\n@@ -1 +1 @@\n-a\n+b", id="leading-marker"
        ),
    ],
)
def test_first_line_must_be_a_hunk_header(patch: str) -> None:
    """GitHub patch는 첫 `@@` 머리글부터라, 첫 줄이 머리글이 아니면 온전하지 않다."""
    assert parse_patch(patch, 1, 1) is None


@pytest.mark.parametrize("surrogate", ["\ud800", "\udbff", "\udc80", "\udfff"])
@pytest.mark.parametrize(
    "template",
    [
        pytest.param("@@ -1,2 +1,2 @@\n a\n-b\n+c{s}", id="added-line"),
        pytest.param("@@ -1,2 +1,2 @@\n a\n-b{s}\n+c", id="removed-line"),
        pytest.param("@@ -1,2 +1,2 @@\n a{s}\n-b\n+c", id="context-line"),
        pytest.param("@@ -1,2 +1,2 @@ f{s}\n a\n-b\n+c", id="header-heading"),
    ],
)
def test_unpaired_surrogate_is_not_intact(template: str, surrogate: str) -> None:
    """짝 없는 대리 문자가 있어 UTF-8로 인코딩할 수 없는 patch는 온전하지 않다(계획 2)."""
    assert parse_patch(template.format(s=""), 1, 1) is not None
    assert parse_patch(template.format(s=surrogate), 1, 1) is None


@pytest.mark.parametrize(
    "patch",
    [
        pytest.param("@@ -10 +10 @@\n-x\n+y\n@@ -1 +1 @@\n-a\n+b", id="reversed"),
        pytest.param("@@ -1 +1 @@\n-a\n+b\n@@ -1 +1 @@\n-a\n+b", id="repeated"),
        pytest.param(
            "@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n@@ -3,2 +3,2 @@\n c\n-d\n+D",
            id="old-side-overlap",
        ),
        pytest.param(
            "@@ -1,2 +1,4 @@\n a\n+x\n+y\n b\n@@ -5 +3 @@\n-e\n+E",
            id="new-side-overlap",
        ),
    ],
)
def test_overlapping_or_reversed_hunks_are_not_intact(patch: str) -> None:
    """hunk가 앞 hunk와 겹치거나 순서가 뒤집히면 위치를 이어 셀 수 없어 온전하지 않다."""
    assert _counted(patch) is None


# 줄 순서와 이전·이후 위치


def test_removed_and_added_line_with_same_number_are_not_one_position() -> None:
    """같은 글자의 삭제 줄과 추가 줄이 같은 번호(5)여도 이전 5번째 줄은 지워진 것이다(결정 17)."""
    parsed = _intact("@@ -5 +5 @@\n-same\n+same", 1, 1)
    assert _rows(parsed) == [(2, "-", "same", 5, None), (3, "+", "same", None, 5)]
    assert parsed.new_position(5) is None
    removed = parsed.line_at_old(5)
    assert removed is not None and removed.kind == "-"
    assert (parsed.new_position(4), parsed.new_position(6)) == (4, 6)


def test_same_index_in_two_commits_is_not_the_same_position() -> None:
    """두 커밋에서 줄 순서·글자가 같은 추가·삭제 줄도 위치로만 같은 줄인지 가린다(결정 17)."""
    # 앞 커밋: [a, b, x, c] → [a, x, b, x, c]. 이후 2번째 줄에 x를 넣었다(patch 3번째 줄).
    earlier = _intact("@@ -1,2 +1,3 @@\n a\n+x\n b", 1, 0)
    (added,) = earlier.changed
    assert (added.index, added.kind, added.text, added.new_no) == (3, "+", "x", 2)
    assert added.new_no is not None

    # 뒤 커밋 하나: 이전 4번째 줄의 다른 x를 지웠다(patch 3번째 줄). 앞에서 넣은 x는 그대로 2번째 줄이다.
    other_place = _intact("@@ -3,3 +3,2 @@\n b\n-x\n c", 0, 1)
    (removed,) = other_place.changed
    assert (removed.index, removed.kind, removed.text) == (3, "-", "x")
    assert removed.old_no == 4
    assert other_place.line_at_old(added.new_no) is None
    assert other_place.new_position(added.new_no) == 2

    # 뒤 커밋 둘: 이전 2번째 줄, 곧 앞에서 넣은 그 x를 지웠다.
    same_place = _intact("@@ -1,3 +1,2 @@\n a\n-x\n b", 0, 1)
    (removed,) = same_place.changed
    assert (removed.index, removed.kind, removed.text) == (3, "-", "x")
    assert removed.old_no == added.new_no
    assert same_place.line_at_old(added.new_no) == removed
    assert same_place.new_position(added.new_no) is None


def test_new_position_before_inside_between_and_after_hunks() -> None:
    """이후 위치는 hunk 앞은 그대로, hunk 안 문맥 줄은 그 줄의 이후 위치, 지운 줄은 None, 뒤는 늘어난 만큼 옮긴다."""
    parsed = _intact(TWO_HUNKS, 3, 2)
    expected = {
        1: 1,  # 첫 hunk 앞
        2: 2,  # 첫 hunk의 문맥 줄
        3: None,  # 지운 줄
        4: 5,  # 두 줄을 넣은 뒤의 문맥 줄
        5: 6,  # hunk 사이
        19: 20,
        20: 21,  # 뒤 hunk의 문맥 줄
        21: None,  # 지운 줄
        22: 23,  # 마지막 hunk 뒤
        100: 101,
    }
    assert {n: parsed.new_position(n) for n in expected} == expected


@pytest.mark.parametrize(
    ("patch", "expected"),
    [
        pytest.param(
            "@@ -3,0 +4,2 @@\n+x\n+y", {1: 1, 3: 3, 4: 6, 10: 12}, id="no-context"
        ),
        pytest.param(
            "@@ -2,2 +2,4 @@\n b\n+x\n+y\n c", {1: 1, 2: 2, 3: 5, 4: 6}, id="context"
        ),
        pytest.param("@@ -0,0 +1,2 @@\n+x\n+y", {1: 3, 2: 4}, id="before-first-line"),
    ],
)
def test_new_position_with_insert_only_hunk(
    patch: str, expected: Mapping[int, int | None]
) -> None:
    """넣기만 한 hunk: 넣은 자리 앞 줄은 그대로, 그 뒤 줄은 넣은 줄 수만큼 뒤로 간다."""
    parsed = _intact(patch, 2, 0)
    assert {n: parsed.new_position(n) for n in expected} == expected
    assert all(line.old_no is None for line in parsed.changed)
    # 이전 파일 쪽에서 patch에 든 줄은 문맥 줄뿐이다.
    found = [parsed.line_at_old(n) for n in range(1, 12)]
    assert all(line is None or line.kind == " " for line in found)


@pytest.mark.parametrize(
    ("patch", "expected"),
    [
        pytest.param(
            "@@ -3,2 +2,0 @@\n-c\n-d",
            {1: 1, 2: 2, 3: None, 4: None, 5: 3, 9: 7},
            id="no-context",
        ),
        pytest.param(
            "@@ -2,4 +2,2 @@\n b\n-c\n-d\n e",
            {1: 1, 2: 2, 3: None, 4: None, 5: 3, 6: 4},
            id="context",
        ),
    ],
)
def test_new_position_with_delete_only_hunk(
    patch: str, expected: Mapping[int, int | None]
) -> None:
    """지우기만 한 hunk: 지운 줄은 None, 그 뒤 줄은 지운 줄 수만큼 앞으로 온다."""
    parsed = _intact(patch, 0, 2)
    assert {n: parsed.new_position(n) for n in expected} == expected
    assert all(line.new_no is None for line in parsed.changed)
    for n in (3, 4):
        removed = parsed.line_at_old(n)
        assert removed is not None and removed.kind == "-"


def test_line_at_old_returns_only_lines_of_the_previous_file() -> None:
    """이전 위치로 찾는 줄은 그 위치의 문맥·삭제 줄이고, patch에 없는 위치나 추가 줄은 나오지 않는다."""
    parsed = _intact(TWO_HUNKS, 3, 2)
    found = {n: parsed.line_at_old(n) for n in range(1, 30)}
    assert {n: _row(line) for n, line in found.items() if line is not None} == {
        2: (2, " ", "b", 2, 2),
        3: (3, "-", "c", 3, None),
        4: (6, " ", "d", 4, 5),
        20: (8, " ", "t", 20, 21),
        21: (9, "-", "u", 21, None),
    }


# 실제 git으로 만든 patch


def _file_lines(text: str | None) -> list[str]:
    """git이 세는 파일 줄: `\\n`으로만 나누고, 끝 줄바꿈 뒤의 빈 요소는 줄이 아니다."""
    if not text:
        return []
    lines = text.split("\n")
    if lines[-1] == "":
        lines.pop()
    return lines


def _assert_matches_files(
    entry: Mapping[str, Any], before: str | None, after: str | None
) -> None:
    """git이 만든 patch가 온전하고, 줄 순서·이전·이후 위치가 실제 파일 내용과 맞는지 본다."""
    path = entry["filename"]
    patch = entry["patch"]
    assert isinstance(patch, str)
    parsed = parse_patch(patch, entry["additions"], entry["deletions"])
    assert parsed is not None, f"{path!r}: git이 만든 patch를 온전하지 않다고 판정했다"
    raw = patch.split("\n")
    old_lines, new_lines = _file_lines(before), _file_lines(after)
    lines = [line for hunk in parsed.hunks for line in hunk.lines]
    by_old: dict[int, PatchLine] = {}
    for line in lines:
        assert raw[line.index - 1] == line.kind + line.text, path
        if line.old_no is not None:
            assert old_lines[line.old_no - 1] == line.text, path
            by_old[line.old_no] = line
        if line.new_no is not None:
            assert new_lines[line.new_no - 1] == line.text, path
    assert [line.kind for line in lines].count("+") == entry["additions"]
    assert [line.kind for line in lines].count("-") == entry["deletions"]
    # 이전 파일의 줄마다 이후 위치로 옮기고, 넣은 줄을 그 이후 위치에 채우면 이후 파일이 된다.
    rebuilt: list[str | None] = [None] * len(new_lines)
    gone: list[int] = []
    previous = 0
    for old_no, text in enumerate(old_lines, start=1):
        assert parsed.line_at_old(old_no) == by_old.get(old_no), (path, old_no)
        moved = parsed.new_position(old_no)
        if moved is None:
            gone.append(old_no)
            continue
        assert previous < moved <= len(new_lines), (path, old_no, moved)
        previous = moved
        rebuilt[moved - 1] = text
    for line in parsed.changed:
        if line.kind == "+":
            assert line.new_no is not None
            assert rebuilt[line.new_no - 1] is None, (path, line.new_no)
            rebuilt[line.new_no - 1] = line.text
    assert rebuilt == new_lines, path
    assert gone == [line.old_no for line in parsed.changed if line.kind == "-"], path


def _apply(
    repo: GitRepo,
    state: Mapping[str, str],
    changes: Mapping[str, str | None],
    message: str,
) -> tuple[str, dict[str, str]]:
    """작업 트리를 바꿔 커밋하고 (SHA, 커밋 뒤 파일 내용)을 돌려준다. None은 파일 삭제다."""
    after = dict(state)
    for path, text in changes.items():
        if text is None:
            repo.remove(path)
            del after[path]
        else:
            repo.write(path, text)
            after[path] = text
    return repo.commit(message), after


def _numbered(count: int) -> list[str]:
    return [f"line {n}" for n in range(1, count + 1)]


def _joined(lines: list[str]) -> str:
    return "\n".join(lines) + "\n"


# 실제 git 사례의 파일 내용. 특수 글자 파일은 첫 줄이 git hunk 머리글 뒤의 함수 이름 글자로 붙는다.
SPECIAL_BEFORE = [
    "head\x85line\u2028x",
    # 영문자로 시작하지 않는 줄은 git이 함수 이름으로 고르지 않는다.
    *(f"#{n} filler" for n in range(1, 7)),
    "page\x0cbreak",
    "next\x85line",
    "sep\u2028arator",
    "para\u2029graph",
    "unit\x1fsep\x1c\x1d\x1e",
    "vt\x0bx",
    "old\rmac",
    *(f"tail {n}" for n in range(1, 4)),
]
SPECIAL_AFTER = [
    {
        "next\x85line": "NEXT\x85line",
        "sep\u2028arator": "SEP\u2028arator",
        "old\rmac": "new\rmac",
    }.get(line, line)
    for line in SPECIAL_BEFORE
]
LOOKS_BEFORE = "--- a/x\n+++ b/x\n@@ -1 +1 @@\nplain\n"
LOOKS_AFTER = "--- a/y\n+++ b/y\n@@ -2 +2 @@\nplain\n"


def _long_v2() -> list[str]:
    """앞·가운데·뒤 여러 곳을 고쳐 hunk가 여러 개 나오는 내용."""
    lines = _numbered(60)
    lines[2] = "LINE 3"
    lines[19:19] = ["inserted A", "inserted B"]
    del lines[41:43]
    lines[-5] = "LINE 56"
    return lines


def _long_v3() -> list[str]:
    """v2에서 가운데 세 줄만 지운 내용(지우기만 한 hunk)."""
    lines = _long_v2()
    del lines[9:12]
    return lines


def _git_history(repo: GitRepo) -> list[tuple[str, dict[str, str], dict[str, str]]]:
    """(SHA, 커밋 전 내용, 커밋 뒤 내용)의 목록. 첫 커밋은 모든 파일을 더한다."""
    history: list[tuple[str, dict[str, str], dict[str, str]]] = []
    state: dict[str, str] = {}
    steps: list[tuple[str, dict[str, str | None]]] = [
        (
            "기준",
            {
                "app.py": python_module("value = 1", "limit = 3"),
                "long.txt": _joined(_numbered(60)),
                "win.txt": "one\r\ntwo\r\nthree\r\nfour\r\n",
                "ctl.txt": _joined(SPECIAL_BEFORE),
                "end.txt": "first\nlast",
                "gone.txt": "a\nb\nc\n",
                "looks.txt": LOOKS_BEFORE,
            },
        ),
        (
            "여러 파일 수정",
            {
                "app.py": python_module("value = 2", "limit = 3"),
                "long.txt": _joined(_long_v2()),
                "win.txt": "one\r\nTWO\r\nthree\r\nfour\r\n",
                "ctl.txt": _joined(SPECIAL_AFTER),
                "end.txt": "first\nLAST",
                "gone.txt": None,
                "new.md": "# title\n\nbody\n",
                "looks.txt": LOOKS_AFTER,
            },
        ),
        (
            "넣기만·지우기만",
            {
                "app.py": python_module("value = 2", "extra = 0", "limit = 3"),
                "long.txt": _joined(_long_v3()),
                "end.txt": "first\nLAST\nmore\n",
            },
        ),
    ]
    for message, changes in steps:
        sha, after = _apply(repo, state, changes, message)
        history.append((sha, state, after))
        state = after
    return history


def _hunk_count(patch: str) -> int:
    return sum(1 for line in patch.split("\n") if line.startswith("@@ "))


@requires_git
def test_git_patches_are_intact_and_positions_match_file_contents(
    repo: GitRepo,
) -> None:
    """실제 git이 만든 patch(추가·수정·삭제, CRLF·특수 글자·끝 줄바꿈 없음·여러 hunk)는 모두 온전하고 위치가 파일과 맞는다."""
    patches: dict[tuple[int, str], Mapping[str, Any]] = {}
    for number, (sha, before, after) in enumerate(_git_history(repo), start=1):
        for entry in repo.github_files(sha):
            path = entry["filename"]
            _assert_matches_files(entry, before.get(path), after.get(path))
            patches[(number, path)] = entry
    # 사례가 의도한 모양으로 만들어졌는지 확인한다.
    assert {entry["status"] for entry in patches.values()} == {
        "added",
        "modified",
        "removed",
    }
    assert patches[(2, "gone.txt")]["status"] == "removed"
    assert patches[(2, "new.md")]["status"] == "added"
    assert _hunk_count(patches[(2, "long.txt")]["patch"]) >= 3
    assert "\n+TWO\r\n" in patches[(2, "win.txt")]["patch"]
    special = patches[(2, "ctl.txt")]["patch"]
    assert "\n+NEXT\x85line\n" in special
    assert special.split("\n")[0].endswith(" @@ head\x85line\u2028x")
    assert "\n+new\rmac\n" in special
    for number in (1, 2, 3):
        assert "\\ No newline at end of file" in patches[(number, "end.txt")]["patch"]
    assert "\n---- a/x\n" in patches[(2, "looks.txt")]["patch"]
    assert "\n++++ b/y\n" in patches[(2, "looks.txt")]["patch"]
    long_deleted = patches[(3, "long.txt")]
    assert (long_deleted["additions"], long_deleted["deletions"]) == (0, 3)
    app_inserted = patches[(3, "app.py")]
    assert (app_inserted["additions"], app_inserted["deletions"]) == (1, 0)


# content_patch_id와의 대조(보조 시험, 운영 판정에는 쓰지 않음)

Variant = Callable[[str, int, int], tuple[str, int, int]]


def _cut_last_content_line(
    patch: str, additions: int, deletions: int
) -> tuple[str, int, int]:
    """마지막 내용 줄부터 끝까지 잘렸다(GitHub 줄 수는 그대로)."""
    lines = patch.split("\n")
    last = max(i for i, line in enumerate(lines) if line[:1] in (" ", "-", "+"))
    return "\n".join(lines[:last]), additions, deletions


def _first_header_only(
    patch: str, additions: int, deletions: int
) -> tuple[str, int, int]:
    return patch.split("\n")[0], additions, deletions


def _more_additions(patch: str, additions: int, deletions: int) -> tuple[str, int, int]:
    return patch, additions + 1, deletions


def _more_deletions(patch: str, additions: int, deletions: int) -> tuple[str, int, int]:
    return patch, additions, deletions + 1


def _broken_header(patch: str, additions: int, deletions: int) -> tuple[str, int, int]:
    return patch.replace("@@ -", "@@ -x", 1), additions, deletions


def _git_preamble(patch: str, additions: int, deletions: int) -> tuple[str, int, int]:
    return "diff --git a/f b/f\n" + patch, additions, deletions


def _surrogate_in_first_line(
    patch: str, additions: int, deletions: int
) -> tuple[str, int, int]:
    lines = patch.split("\n")
    lines[1] = lines[1][:1] + "\udc80" + lines[1][1:]
    return "\n".join(lines), additions, deletions


def _unknown_prefix(patch: str, additions: int, deletions: int) -> tuple[str, int, int]:
    lines = patch.split("\n")
    lines[1] = "?" + lines[1][1:]
    return "\n".join(lines), additions, deletions


def _trailing_newline(
    patch: str, additions: int, deletions: int
) -> tuple[str, int, int]:
    return patch + "\n", additions, deletions


# GitHub patch가 잘렸거나 모양이 어긋난 변형. 두 판정 모두 온전하지 않다고 봐야 한다.
BROKEN: list[Variant] = [
    _cut_last_content_line,
    _first_header_only,
    _more_additions,
    _more_deletions,
    _broken_header,
    _git_preamble,
    _surrogate_in_first_line,
    _unknown_prefix,
]


def _content_patch_id_of(
    entry: Mapping[str, Any], patch: str, additions: int, deletions: int
) -> str | None:
    return content_patch_id(
        commit_changes(
            [{**entry, "patch": patch, "additions": additions, "deletions": deletions}]
        )
    )


def _single_file_edits() -> list[tuple[str, dict[str, str]]]:
    """기준 커밋 뒤에 파일 하나만 고치는 커밋들(모두 수정 상태)."""
    return [
        ("값 수정", {"app.py": python_module("value = 2", "limit = 3")}),
        ("여러 곳 수정", {"long.txt": _joined(_long_v2())}),
        ("CRLF 줄 수정", {"win.txt": "one\r\nTWO\r\nthree\r\nfour\r\n"}),
        ("특수 글자 줄 수정", {"ctl.txt": _joined(SPECIAL_AFTER)}),
        ("끝 줄바꿈 없는 끝 줄 수정", {"end.txt": "first\nLAST"}),
        ("끝에 줄 추가", {"end.txt": "first\nLAST\nmore\n"}),
        ("가운데 줄 삭제", {"long.txt": _joined(_long_v3())}),
        (
            "가운데 줄 추가",
            {"app.py": python_module("value = 2", "extra = 0", "limit = 3")},
        ),
        ("머리글처럼 보이는 줄 수정", {"looks.txt": LOOKS_AFTER}),
    ]


@requires_git
def test_single_file_commit_agrees_with_content_patch_id(repo: GitRepo) -> None:
    """파일 하나짜리 수정 커밋에서 온전성 판정이 content_patch_id의 None 여부와 같다(보조 대조)."""
    state: dict[str, str] = {}
    _, state = _apply(
        repo,
        state,
        {
            "app.py": python_module("value = 1", "limit = 3"),
            "long.txt": _joined(_numbered(60)),
            "win.txt": "one\r\ntwo\r\nthree\r\nfour\r\n",
            "ctl.txt": _joined(SPECIAL_BEFORE),
            "end.txt": "first\nlast",
            "looks.txt": LOOKS_BEFORE,
        },
        "기준",
    )
    checked = 0
    for message, changes in _single_file_edits():
        sha, state = _apply(repo, state, changes, message)
        (entry,) = repo.github_files(sha)
        assert entry["status"] == "modified", message
        original = (entry["patch"], entry["additions"], entry["deletions"])
        for variant in [None, _trailing_newline, *BROKEN]:
            patch, additions, deletions = (
                original if variant is None else variant(*original)
            )
            intact = parse_patch(patch, additions, deletions) is not None
            identified = (
                _content_patch_id_of(entry, patch, additions, deletions) is not None
            )
            expected = variant is None or variant is _trailing_newline
            name = "원본" if variant is None else variant.__name__
            assert (intact, identified) == (expected, expected), (message, name)
            checked += 1
        if _hunk_count(entry["patch"]) > 1:
            # 뒤 hunk가 통째로 빠진 patch: 머리글과는 맞지만 GitHub 줄 수와 다르다.
            cut = entry["patch"][: entry["patch"].rindex("\n@@ ")]
            assert parse_patch(cut, entry["additions"], entry["deletions"]) is None
            assert (
                _content_patch_id_of(entry, cut, entry["additions"], entry["deletions"])
                is None
            )
            checked += 1
    assert checked > len(_single_file_edits()) * (len(BROKEN) + 2)


@pytest.mark.parametrize(
    "marker",
    ["\\x", "\\", "\\No newline at end of file"],
    ids=["backslash-x", "backslash-only", "no-space"],
)
def test_backslash_line_that_is_not_a_marker_is_not_intact(marker: str) -> None:
    """`\\ `로 시작하는 표시 줄만 세지 않는다. `\\`로 시작하지만 표시 줄이 아니면 온전하지 않다."""
    for patch in (
        f"@@ -1 +1 @@\n-a\n{marker}\n+b",
        f"@@ -1 +1 @@\n-a\n+b\n{marker}",
    ):
        assert _counted(patch) is None


@pytest.mark.parametrize(
    "patch",
    [
        "@@ -1 +1 @@\n-a\n+b\n@@ -10 +20 @@\n-c\n+d",
        "@@ -1,2 +1 @@\n-a\n b\n@@ -10 +10 @@\n-c\n+d",
        "@@ -1 +1,2 @@\n-a\n+b\n+c\n@@ -10,0 +10 @@\n+d",
    ],
    ids=["jump", "lost-deleted-line", "insert-misplaced"],
)
def test_hunk_positions_must_follow_earlier_line_count_changes(patch: str) -> None:
    """뒤 hunk 머리글의 이후 위치는 앞 hunk들이 늘리거나 줄인 줄 수만큼만 밀린다. 어긋나면(사이 hunk가
    빠졌거나 위치가 틀림) 위치를 이어 셀 수 없어 온전하지 않다."""
    assert _counted(patch) is None


def test_consistent_hunk_positions_after_insert_and_delete_are_intact() -> None:
    """앞 hunk가 줄을 늘리고 줄인 만큼 뒤 hunk 이후 위치가 밀리면 온전하다(넣기만·지우기만 hunk 포함)."""
    patch = "\n".join(
        [
            "@@ -2,0 +3,2 @@",
            "+x",
            "+y",
            "@@ -5,2 +6,0 @@",
            "-p",
            "-q",
            "@@ -9 +9 @@",
            "-r",
            "+s",
        ]
    )

    parsed = _counted(patch)

    assert parsed is not None
    assert [hunk.new_start for hunk in parsed.hunks] == [3, 6, 9]
    assert parsed.new_position(4) == 6
    assert parsed.new_position(8) == 8


def test_header_number_longer_than_nine_digits_is_not_intact() -> None:
    """머리글의 위치·줄 수가 9자리를 넘으면 숫자로 바꾸지 않고 온전하지 않은 patch로 본다(처리 전체를
    멈추는 예외를 내지 않는다)."""
    for header in (
        "@@ -" + "1" * 4_301 + " +1 @@",
        "@@ -1 +1," + "9" * 10 + " @@",
    ):
        assert _counted(f"{header}\n-a\n+b") is None


@pytest.mark.parametrize(
    "header",
    ["@@ -0 +0 @@", "@@ -0 +1 @@", "@@ -1 +0 @@"],
    ids=["both-zero", "old-zero", "new-zero"],
)
def test_zero_start_with_lines_is_not_intact(header: str) -> None:
    """줄이 있는 쪽의 시작 위치는 1 이상이다. 0은 빈 쪽(새 파일·지운 파일)에서만 쓴다."""
    assert _counted(f"{header}\n-limit = 5\n+limit = 10") is None


def test_gap_and_anchor_of_zero_context_hunks_point_at_the_next_line() -> None:
    """-U0 hunk에서 지운 줄의 자리는 그 뒤에 처음 남은 줄의 위치이고, 넣은 줄의 자리는 이전 파일에서
    바로 뒤에 오는 줄의 위치다(빈 쪽 시작 위치는 그 자리 앞 줄이다)."""
    deleted = _counted("@@ -2 +1,0 @@ alpha\n-limit = 5")
    inserted = _counted("@@ -5,0 +6,2 @@\n+x = 1\n+y = 2")

    assert deleted is not None and inserted is not None
    (removed,) = deleted.changed
    assert (removed.gap, removed.gap_end) == (2, 2)
    assert [line.anchor for line in inserted.changed] == [6, 6]
    assert deleted.gap_start(2) == 2
    assert inserted.gap_start(6) == 6
    assert inserted.gap_end(6) == 8


def test_gap_end_skips_lines_added_in_the_same_block() -> None:
    """지운 줄과 같은 변경 덩어리에서 더한 줄은 그 자리에 들어선 줄이다. 덩어리 다음에 처음 남은 줄의
    위치가 자리의 끝이다."""
    parsed = _counted("@@ -3,3 +3,4 @@\n a\n-limit = 5\n+limit = 6\n+extra = 1\n b")

    assert parsed is not None
    removed = next(line for line in parsed.changed if line.kind == "-")
    assert (removed.gap, removed.gap_end) == (4, 6)
