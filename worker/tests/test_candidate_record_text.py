"""기록의 글(CR1 기능 설계 BR2.1~BR2.7, 시나리오 S3~S7·S17·S19~S22·S29, 2,000/2,001자 경계).

기대값은 기능 설계 3절의 시나리오 표와 rules.md의 규칙에서 정했다. 코드를 읽어 맞추지 않았다. 실패 조건:
가리기에 걸린 글이 제목·작업 사실에 나가면, 기록의 글이 잘리면, 작업 사실이 3줄 이상이면, 둘째 줄과 기록의
글 칸이 서로 다른 판단을 쓰면 실패다.

- 순수 함수 시험은 `app.candidates.record_text`의 고르기·첫 줄·부실 판단을 바로 부른다.
- 후보 시험은 수집 관측을 직접 만든 후보 판정(`build_candidates`)으로 작업 사실 둘째 줄과 기록의 글 칸을 본다.
  관측을 만드는 도우미는 후보 묶음 시험(`test_candidate_grouping`)의 것을 함께 쓴다.

가짜 비밀값은 소스에 통째로 두지 않고 실행 중에 조각을 이어 붙여 만든다.
"""

from dataclasses import replace

import pytest
from github_synthetic import MEMBER, OTHER, sha
from test_candidate_grouping import (
    REQ,
    ROOT,
    commit,
    empty,
    lookup,
    outcome,
    picked,
    pull,
)

from app.candidates import build_candidates, group
from app.candidates.record_text import (
    WEAK_TEXTS,
    choose_record_text,
    earliest_own_commit,
    first_line,
    is_weak,
    pull_request_title,
)
from app.collection import Lookup
from app.processing.generation import EligibleCandidate, RecordText


def _join(*parts: str) -> str:
    """가짜 값을 실행 중에 이어 붙인다(소스 검사에 통째로 걸리지 않게)."""
    return "".join(parts)


TOKEN_LINE = _join("배포 키 ", "ghp", "_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8")
EMAIL_LINE = _join("문의는 dev", "@", "example", ".com으로")


def only(candidates: tuple[EligibleCandidate, ...]) -> EligibleCandidate:
    (candidate,) = candidates
    return candidate


def own_pull_request(
    *messages: str, title: str = "로그인 오류 수정"
) -> EligibleCandidate:
    """연동 계정이 연 병합된 PR #3. 커밋 목록을 끝까지 받았고 커밋은 모두 본인 커밋이다."""
    extra = [
        commit(31 + index, message=message, paths=(f"f{index}.py",))
        for index, message in enumerate(messages)
    ]
    numbers = [31 + index for index in range(len(messages))]
    return only(
        build_candidates(
            REQ, outcome(extra=extra, pulls=[pull(3, numbers, merged=60, title=title)])
        ).candidates
    )


def direct_commit(message: str) -> EligibleCandidate:
    """PR·병합 없이 기본 브랜치에 들어간 본인 커밋 하나(커밋 묶음)."""
    window = [commit(60, [1], message=message), ROOT]
    return only(
        build_candidates(REQ, outcome(window=window, lookups=empty(60))).candidates
    )


def assert_consistent(candidate: EligibleCandidate) -> None:
    """작업 사실 둘째 줄은 기록의 글 칸 하나만 본다(BR2.7). 1~2줄이다(BR4.5)."""
    assert 1 <= len(candidate.work_facts) <= 2
    record = candidate.record_text
    if record is None or record.weak:
        assert len(candidate.work_facts) == 1
    else:
        label = "PR 제목" if record.source == "PR_TITLE" else "본인 커밋 메시지 첫 줄"
        assert candidate.work_facts[1] == f'{label}: "{record.text}"'


# 1. 첫 줄 잡기(BR2.3)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("로그인 오류 수정", "로그인 오류 수정"),
        ("  로그인 오류 수정  \n\n본문 둘째 줄", "로그인 오류 수정"),
        ("로그인 오류 수정\r\n본문", "로그인 오류 수정"),
        ("\n뒤에만 글", ""),
        ("   ", ""),
        ("", ""),
    ],
    ids=["plain", "strip-and-body", "crlf", "blank-first", "spaces", "empty"],
)
def test_first_line_takes_text_before_the_first_line_break(
    raw: str, expected: str
) -> None:
    assert first_line(raw) == expected


def test_record_text_is_never_cut_at_2000_and_dropped_at_2001_characters() -> None:
    """한 글 검사의 2,000자 규칙 때문에 2,000자 첫 줄은 기록의 글이고(자르지 않음), 2,001자는 없다."""
    longest = commit(60, [1], message="가" * 2000 + "\n본문")
    too_long = commit(61, [1], message="가" * 2001)

    kept = choose_record_text(None, [longest])
    assert kept == RecordText("COMMIT_FIRST_LINE", "가" * 2000, weak=False)
    assert choose_record_text(None, [too_long]) is None


# 2. 부실 판단(BR2.5·BR2.6)


def test_weak_list_is_the_fixed_thirty_five_entries() -> None:
    assert len(WEAK_TEXTS) == 35
    assert {"fix", "wip", "수정", "커밋", "initial commit", "add files via upload"} <= (
        WEAK_TEXTS
    )
    # 편집기 기본 문구는 넣지 않는다.
    assert "update readme.md" not in WEAK_TEXTS


@pytest.mark.parametrize(
    "text",
    [
        "fix",
        "FIX:",
        "  Fixes.  ",
        "[WIP]",
        "Initial commit",
        "initial   commit",
        "Add files via upload",
        "수정",
        "오타.",
        "ok",
        "a1",
        "!!",
        "#12",
        "가",
    ],
    ids=[
        "fix",
        "upper-colon",
        "edge-punct",
        "brackets",
        "S17-initial-commit",
        "inner-spaces",
        "github-upload",
        "korean",
        "korean-punct",
        "two-letters",
        "letter-digit",
        "punct-only",
        "number-only",
        "one-letter",
    ],
)
def test_weak_texts(text: str) -> None:
    assert is_weak(text)


@pytest.mark.parametrize(
    "text",
    [
        "로그인 오류 메시지 수정",
        "Update README.md",
        "fix login redirect",
        "수정 사항 반영",
        "abc",
        "fix: typo",
    ],
)
def test_usable_texts(text: str) -> None:
    assert not is_weak(text)


# 3. 고르기(BR2.1·BR2.2·BR2.4)


def test_pull_request_title_needs_own_pull_request_without_other_accounts() -> None:
    own, _ = pull(3, title="로그인 오류 수정")
    others, _ = pull(4, title="로그인 오류 수정", author=OTHER)
    unknown, _ = pull(5, title="로그인 오류 수정", author=None)

    assert pull_request_title(own, MEMBER, True) == "로그인 오류 수정"
    # 다른 계정 커밋이 있거나 있는지 모르면 쓰지 않는다(S20·S4).
    assert pull_request_title(own, MEMBER, False) is None
    # 다른 계정이 열었거나 연 계정을 모르면 쓰지 않는다(S19).
    assert pull_request_title(others, MEMBER, True) is None
    assert pull_request_title(unknown, MEMBER, True) is None
    assert pull_request_title(own, None, True) is None


def test_earliest_own_commit_skips_merge_commits_and_breaks_ties_by_sha() -> None:
    merge = commit(10, [1, 2])
    late = commit(30)
    # 작성 시각이 같은(20분) 두 커밋. SHA 사전순으로 앞선 것을 고른다.
    tie_low = replace(commit(20), sha=sha(19))
    tie_high = replace(commit(20), sha=sha(21))

    assert earliest_own_commit([late, tie_high, merge, tie_low]) == tie_low
    # 병합 커밋뿐이면 없다(S21).
    assert earliest_own_commit([merge]) is None
    assert choose_record_text(None, [merge]) is None


@pytest.mark.parametrize("line", [TOKEN_LINE, EMAIL_LINE], ids=["token", "email"])
def test_masked_first_line_is_not_a_record_text(line: str) -> None:
    """S5: 가리기에 걸리면 기록의 글이 없다. 다음 커밋으로 바꿔 고르지 않는다(BR2.4)."""
    earliest = commit(10, message=f"{line}\n본문")
    later = commit(20, message="로그인 오류 수정")

    assert choose_record_text(None, [later, earliest]) is None


def test_masked_or_empty_pull_request_title_does_not_fall_back_to_a_commit() -> None:
    usable = commit(10, message="로그인 오류 수정")

    assert choose_record_text(TOKEN_LINE, [usable]) is None
    assert choose_record_text("   ", [usable]) is None


def test_blank_first_line_of_the_earliest_commit_gives_no_record_text() -> None:
    """S22: 가장 이른 커밋의 첫 줄이 비었으면 다음 커밋으로 넘어가지 않는다."""
    earliest = commit(10, message="   \n본문만 있음")
    later = commit(20, message="로그인 오류 수정")

    assert choose_record_text(None, [later, earliest]) is None


# 4. 후보의 기록의 글 칸과 작업 사실 둘째 줄(BR2.7·BR4.2)


def test_s3_own_pull_request_uses_its_title() -> None:
    candidate = own_pull_request("wip", "로그인 화면 손봄", title="로그인 오류 수정")

    assert candidate.record_text == RecordText(
        "PR_TITLE", "로그인 오류 수정", weak=False
    )
    assert candidate.work_facts == ("PR #3, 상태 병합됨", 'PR 제목: "로그인 오류 수정"')
    # 후보 판정은 제목을 정하지 않는다. 제목은 생성 단계가 이 칸으로 정한다(BR3.1).
    assert candidate.title is None
    assert_consistent(candidate)


def test_s3_pull_request_title_is_used_even_when_its_commits_are_weak() -> None:
    candidate = own_pull_request("fix", "wip", title="결제 실패 알림 추가")

    assert candidate.work_facts[1] == 'PR 제목: "결제 실패 알림 추가"'


def test_s6_weak_first_line_keeps_only_the_kind_line() -> None:
    candidate = direct_commit("fix")

    assert candidate.record_text == RecordText("COMMIT_FIRST_LINE", "fix", weak=True)
    assert candidate.work_facts == ("PR·병합 없이 들어간 본인 커밋",)
    assert_consistent(candidate)


def test_s7_usable_first_line_becomes_the_second_line() -> None:
    candidate = direct_commit("로그인 오류 메시지 수정\n\n자세한 본문")

    assert candidate.work_facts == (
        "PR·병합 없이 들어간 본인 커밋",
        '본인 커밋 메시지 첫 줄: "로그인 오류 메시지 수정"',
    )
    assert_consistent(candidate)


def test_s17_initial_commit_is_weak() -> None:
    candidate = direct_commit("Initial commit")

    assert candidate.record_text is not None and candidate.record_text.weak
    assert len(candidate.work_facts) == 1


@pytest.mark.parametrize("line", [TOKEN_LINE, EMAIL_LINE], ids=["token", "email"])
def test_s5_masked_line_reaches_neither_work_facts_nor_record_text(line: str) -> None:
    candidate = direct_commit(line)

    assert candidate.record_text is None
    assert candidate.work_facts == ("PR·병합 없이 들어간 본인 커밋",)
    assert all(line not in fact for fact in candidate.work_facts)


def test_s19_other_accounts_pull_request_uses_the_earliest_own_commit() -> None:
    extra = [
        commit(32, message="로그인 화면 정리", paths=("b.py",)),
        commit(31, message="로그인 오류 수정", paths=("a.py",)),
    ]
    output = build_candidates(
        REQ,
        outcome(
            extra=extra,
            pulls=[pull(3, [31, 32], merged=60, author=OTHER, title="다른 사람 PR")],
        ),
    )

    candidate = only(output.candidates)
    assert candidate.work_facts == (
        "PR #3, 상태 병합됨",
        '본인 커밋 메시지 첫 줄: "로그인 오류 수정"',
    )
    assert_consistent(candidate)


def test_s20_other_account_commit_in_own_pull_request_blocks_the_title() -> None:
    extra = [
        commit(31, message="로그인 오류 수정", paths=("a.py",)),
        commit(32, author=OTHER, message="리뷰 반영", paths=("b.py",)),
    ]
    output = build_candidates(
        REQ,
        outcome(extra=extra, pulls=[pull(3, [31, 32], merged=60, title="내 PR 제목")]),
    )

    candidate = only(output.candidates)
    assert candidate.record_text == RecordText(
        "COMMIT_FIRST_LINE", "로그인 오류 수정", weak=False
    )
    assert not any("기록되지 않은" in fact for fact in candidate.work_facts)
    assert "내 PR 제목" not in "".join(candidate.work_facts)


def test_s21_merge_unit_whose_own_commit_is_only_the_merge_commit() -> None:
    """본인 커밋이 병합 커밋뿐인 단위는 후보가 되지 않거나, 되더라도 기록의 글이 없다. 병합 커밋만
    본인이고 들인 커밋은 다른 계정이면 본인 기여가 없어 후보가 아니다(병합 커밋은 변경으로 세지 않는다).
    그래서 기록의 글 고르기에서 병합 커밋을 빼는지는 순수 함수 시험이 본다."""
    window = [commit(20, [1, 11]), commit(11, [1], author=OTHER), ROOT]

    assert (
        build_candidates(REQ, outcome(window=window, lookups=empty(20))).candidates
        == ()
    )


def test_s29_own_commit_assigned_from_elsewhere_is_not_chosen() -> None:
    """같은 변경으로 다른 곳(PR #31)에서 이 단위(PR #30)에 배정한 더 이른 본인 커밋(311)은 고르지 않고
    단위 안 본인 커밋(402)의 첫 줄을 고른다(BR2.2의 「단위 안」)."""
    extra = [
        commit(301, author=OTHER),
        commit(311, message=picked(301)),
        commit(402, message="목록 화면 정리", paths=("b.py",)),
    ]
    data = outcome(
        extra=extra,
        pulls=[
            pull(30, [301, 402], merged=500, author=OTHER),
            pull(31, [311], merged=600),
        ],
    )

    candidate = only(build_candidates(REQ, data).candidates)
    unit = group(data).units[0]
    assert any(sha(311) in change.own_commits for change in unit.changes)
    assert candidate.record_text == RecordText(
        "COMMIT_FIRST_LINE", "목록 화면 정리", weak=False
    )
    assert_consistent(candidate)


def test_record_text_is_the_same_on_a_second_run() -> None:
    """NFR4.1: 같은 수집 결과면 기록의 글과 작업 사실이 같다."""
    window = [
        commit(62, [61], message="둘째 커밋"),
        commit(61, [1], message="첫 커밋 메시지"),
        ROOT,
    ]
    data = outcome(
        window=window, lookups=[lookup(61, Lookup.EMPTY), lookup(62, Lookup.EMPTY)]
    )

    first = build_candidates(REQ, data)
    second = build_candidates(REQ, data)

    assert first == second
    assert (
        only(first.candidates).work_facts[1]
        == '본인 커밋 메시지 첫 줄: "첫 커밋 메시지"'
    )
