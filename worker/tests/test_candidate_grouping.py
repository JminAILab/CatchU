"""후보 묶음·후보 구성(#118): 수집 관측을 직접 만들어 배정·보류·나누기·집계·근거를 본다.

수집 결과(CollectionOutcome·RelationObservations)를 작은 도구로 바로 만든다. 판정은 모두 관측에서
나와야 하므로 결론(같은 작업 여부)을 넣는 입력은 없다. 실제 GitHub 응답·실제 git과의 대조는
수집·같은 변경 시험이 맡는다.
"""

import itertools
import json
import logging
import random
import re
from collections.abc import Iterable, Sequence
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from candidate_scenarios import assert_member_text
from github_synthetic import MEMBER, OTHER, REPOSITORY, REQUEST, sha

from app.candidates import EVIDENCE_COMMIT_CAP, Membership, build_candidates, group
from app.candidates.build import _merge_same_identity
from app.candidates.grouping import HoldReason, MembershipSource
from app.candidates.identity import (
    CommitsUnit,
    MergeUnit,
    Part,
    PullRequestUnit,
    WorkUnit,
    work_identity,
)
from app.collection import (
    AssociatedPulls,
    ChangedFile,
    CollectionFailure,
    CollectionOutcome,
    CommitChanges,
    CommitRecord,
    DetailStatus,
    FailureCode,
    GitHubAccount,
    IssueRecord,
    Lookup,
    MergeBoundary,
    ModeCheck,
    PullRequestCommits,
    PullRequestRecord,
    RelationObservations,
)
from app.collection.relations import Phase, newest_first
from app.contract import Verdict, check_message
from app.processing import (
    DraftOutcome,
    EligibleCandidate,
    EvidenceItem,
    GenerationOutput,
    ReflectionOutcome,
    compose_result,
)

REQ = replace(REQUEST, source_mode="LIVE")
T0 = datetime(2026, 9, 1, tzinfo=UTC)
FINISHED = datetime(2026, 10, 1, tzinfo=UTC)
FETCHED = DetailStatus.FETCHED
PullRequest = tuple[PullRequestRecord, PullRequestCommits]


def at(minute: int) -> datetime:
    return T0 + timedelta(minutes=minute)


def commit(
    number: int,
    parents: Sequence[int] = (),
    *,
    author: GitHubAccount | None = MEMBER,
    message: str = "합성 커밋",
    paths: Sequence[str] = ("a.py",),
    content: str = "",
    status: DetailStatus = FETCHED,
    modes: tuple[str, ...] | None = (),
) -> CommitRecord:
    """작성 시각은 번호(분)다. 병합 커밋(부모 둘 이상)은 변경 내용을 두지 않는다.

    modes는 파일마다 관측한 모드 줄이다. 기본값은 모드 바꿈이 없음을 확인한 것이고, None은
    모드를 관측하지 않은 것이다.
    """
    if len(parents) > 1 and status is FETCHED:
        status = DetailStatus.NOT_REQUESTED
    changes = None
    if status is FETCHED:
        changed = tuple(
            ChangedFile(
                path,
                "modified",
                1,
                1,
                None,
                f"@@ -1 +1 @@\n-old {path}{content}\n+new {path}{content}",
                modes,
            )
            for path in paths
        )
        changes = CommitChanges(changed, len(changed), len(changed), False)
    return CommitRecord(
        sha=sha(number),
        parents=tuple(sha(parent) for parent in parents),
        message=message,
        authored_at=at(number),
        committed_at=at(number),
        author=author,
        committer=author,
        changes=changes,
        changes_status=status,
    )


def pull(
    number: int,
    commits: Sequence[int] = (),
    *,
    merged: int | None = None,
    state: str = "closed",
    author: GitHubAccount | None = MEMBER,
    merge_commit: int | None = None,
    created: int | None = None,
    title: str = "합성 PR",
    body: str = "",
    status: DetailStatus = FETCHED,
    complete: bool = True,
    limits: tuple[str, ...] = (),
    base_ref: str = "main",
) -> PullRequest:
    head = sha(90000 + number)
    listed = tuple(sha(each) for each in commits) if status is FETCHED else None
    record = PullRequestRecord(
        number=number,
        title=title,
        body=body,
        state="closed"
        if merged is not None
        else ("open" if state == "open" else "closed"),
        created_at=at(created if created is not None else number),
        closed_at=at(merged) if merged is not None else None,
        merged_at=at(merged) if merged is not None else None,
        merge_commit_sha=sha(merge_commit) if merge_commit is not None else None,
        head_sha=head,
        base_ref=base_ref,
        head_ref=f"secret-branch-{number}",
        from_fork=False,
        author=author,
        commits=listed,
        commits_status=status,
        commits_truncated=status is FETCHED and not complete,
    )
    entry = PullRequestCommits(
        number,
        head,
        status,
        listed or (),
        complete=status is FETCHED and complete,
        limits=limits,
    )
    return record, entry


def lookup(number: int, status: Lookup, *pulls: int) -> AssociatedPulls:
    return AssociatedPulls(sha(number), status, tuple(pulls))


def empty(*numbers: int) -> list[AssociatedPulls]:
    return [lookup(number, Lookup.EMPTY) for number in numbers]


def issue(number: int) -> IssueRecord:
    return IssueRecord(number, "이슈", "", "open", at(1), at(1), None, OTHER)


def failure(code: FailureCode = FailureCode.BUDGET_EXCEEDED) -> CollectionFailure:
    return CollectionFailure(code, "합성: 수집 상한에 걸려 멈췄다")


def picked(source: int) -> str:
    """source를 cherry-pick -x로 옮긴 커밋의 메시지."""
    return f"옮김\n\n(cherry picked from commit {sha(source)})"


def outcome(
    *,
    window: Iterable[CommitRecord] = (),
    extra: Iterable[CommitRecord] = (),
    pulls: Iterable[PullRequest] = (),
    lookup_pulls: Iterable[PullRequest] = (),
    lookups: Iterable[AssociatedPulls] = (),
    issues: Iterable[IssueRecord] = (),
    allowed: Iterable[str] = ("COMMIT", "PULL_REQUEST"),
    failures: Iterable[CollectionFailure] = (),
    boundaries: Iterable[MergeBoundary] = (),
    mode_checks: Iterable[ModeCheck] = (),
) -> CollectionOutcome:
    """window는 기본 브랜치 목록(최근 것부터), extra는 PR 커밋 목록으로만 본 커밋이다.

    boundaries는 첫 부모 쪽이 창 밖으로 열린 병합의 경계 비교 관측, mode_checks는 계획한 파일
    모드 확인이다.
    """
    listed, found = list(pulls), list(lookup_pulls)
    return CollectionOutcome(
        allowed_resource_types=frozenset(allowed),  # type: ignore[arg-type]
        selection_reference=REQUEST.selection_reference,
        repository=REPOSITORY,
        linked_account=MEMBER,
        commits=tuple(window),
        pull_requests=tuple(record for record, _ in listed),
        issues=tuple(issues),
        failures=tuple(failures),
        relations=RelationObservations(
            default_branch="main",
            pull_request_commits=tuple(entry for _, entry in (*listed, *found)),
            pull_requests_from_lookups=tuple(record for record, _ in found),
            associated=tuple(lookups),
            commits=tuple(extra),
            merge_boundaries=tuple(boundaries),
            mode_checks=tuple(mode_checks),
        ),
    )


def identity(unit: WorkUnit, parts: Iterable[Part] = ()) -> str:
    return work_identity("LIVE", REQ.repository_id, unit, parts)


def identities(output: GenerationOutput) -> list[str]:
    return [candidate.work_identity for candidate in output.candidates]


def counts(output: GenerationOutput) -> list[tuple[str, int]]:
    return [(item.reason, item.count) for item in output.not_provided]


def result(output: GenerationOutput) -> dict[str, Any]:
    composed = compose_result(REQ, output, finished_at=FINISHED, id_label="grouping")
    assert check_message("Result", composed).verdict is Verdict.VALID
    return composed


ROOT = commit(1, author=OTHER)

# 다른 계정 커밋 섞임의 세 상태(2026-10-08 팀장 결정 「수신자에게 나가는 숫자와 근거 순서」).
_NOT_RECORDED = "연동 계정이 작성자로 기록되지 않은 커밋"
PULL_OTHERS = {
    "PRESENT": f"이 PR 커밋 목록에 {_NOT_RECORDED}이 있다",
    "ABSENT": f"이 PR 커밋 목록에 {_NOT_RECORDED}이 없다",
    "UNKNOWN": f"이 PR 커밋 목록에 {_NOT_RECORDED}이 있는지 알 수 없다"
    "(목록을 끝까지 확인하지 못함)",
}
MERGE_OTHERS = {
    "PRESENT": f"이 병합이 들인 커밋에 {_NOT_RECORDED}이 있다",
    "ABSENT": f"이 병합이 들인 커밋에 {_NOT_RECORDED}이 없다",
    "UNKNOWN": f"이 병합이 들인 커밋에 {_NOT_RECORDED}이 있는지 알 수 없다",
}


# 배정 우선순위


@pytest.mark.parametrize(
    ("pulls", "winner"),
    [
        # 먼저 병합된 PR이 번호보다 앞선다.
        (
            [
                pull(5, [100], merged=20),
                pull(3, [100], merged=30),
                pull(2, [100], state="open"),
            ],
            5,
        ),
        # 병합 시각이 같으면 작은 번호.
        ([pull(8, [100], merged=20), pull(6, [100], merged=20)], 6),
        # 병합된 PR이 없으면 가장 작은 번호.
        ([pull(4, [100], state="open"), pull(2, [100], state="open")], 2),
    ],
)
def test_shared_change_goes_to_merged_first_then_smallest_number(
    pulls: list[PullRequest], winner: int
) -> None:
    output = build_candidates(REQ, outcome(extra=[commit(100)], pulls=pulls))

    assert identities(output) == [identity(PullRequestUnit(winner))]
    # 배정받지 못한 PR은 후보도 집계도 없다.
    assert output.not_provided == ()


def test_stacked_pull_requests_keep_only_their_own_commits() -> None:
    """제목은 비우고 첫 작업 사실이 단위 이름이다(2026-10-08 팀장 결정 「Catch 제목」)."""
    extra = [commit(101), commit(102), commit(103, paths=("b.py",))]
    output = build_candidates(
        REQ,
        outcome(
            extra=extra,
            pulls=[pull(1, [101, 102], merged=10), pull(2, [101, 102, 103], merged=20)],
        ),
    )

    first, second = output.candidates
    assert first.work_identity == identity(PullRequestUnit(1))
    assert first.title is None
    assert first.work_facts == ("PR #1, 상태 병합됨", PULL_OTHERS["ABSENT"])
    assert second.work_identity == identity(PullRequestUnit(2))
    assert second.title is None
    assert second.work_facts == ("PR #2, 상태 병합됨", PULL_OTHERS["ABSENT"])
    assert "다른 PR에도 담겨" in second.grouping_basis
    assert [item.source_revision for item in second.evidence[1:]] == [sha(103)]


def test_stacked_pull_request_merged_first_takes_shared_commits() -> None:
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(101), commit(102)],
            pulls=[pull(1, [101], merged=20), pull(2, [101, 102], merged=10)],
        ),
    )

    assert identities(output) == [identity(PullRequestUnit(2))]


# 연결 PR 조회


def test_merged_pull_request_squash_and_rebase_commits_are_normal() -> None:
    """병합된 PR을 가리키는 새 SHA는 목록에 없어도 어긋남이 아니다. 기여 근거는 원래 커밋이다.

    문장은 센 숫자 없이 쓴다(2026-10-08 팀장 결정 「수신자에게 나가는 숫자와 근거 순서」).
    """
    window = [commit(30, [20]), commit(20, [1], author=OTHER), ROOT]
    extra = [commit(11, paths=("x.py",)), commit(12, paths=("y.py",))]
    data = outcome(
        window=window,
        extra=extra,
        pulls=[pull(7, [11, 12], merged=25, merge_commit=20, author=OTHER)],
        lookups=[lookup(30, Lookup.FOUND, 7)],
    )

    output = build_candidates(REQ, data)
    observations = group(data).observations

    assert identities(output) == [identity(PullRequestUnit(7))]
    assert output.not_provided == ()
    candidate = output.candidates[0]
    assert candidate.title is None
    # 다른 계정 커밋 20은 목록 밖 squash·rebase 커밋이라 섞임은 목록(11·12)으로만 본다.
    assert candidate.work_facts == ("PR #7, 상태 병합됨", PULL_OTHERS["ABSENT"])
    assert candidate.subject_contribution == (
        "연동 GitHub 계정이 작성자로 기록된 커밋(다른 계정이 연 PR에 담긴 본인 커밋)"
    )
    assert (
        "확인한 근거: PR 커밋 목록·병합된 PR이 기준 브랜치에 남긴 커밋·GitHub가 알려 준 "
        "커밋의 PR." in candidate.grouping_basis
    )
    assert [item.source_revision for item in candidate.evidence[1:]] == [
        sha(12),
        sha(11),
    ]
    assert observations[sha(30)].membership is Membership.ASSIGNED
    assert observations[sha(30)].pull_requests == (7,)
    assert observations[sha(20)].pull_requests == (7,)


def test_open_pull_request_lookup_contradicting_full_list_is_undetermined() -> None:
    """C16: 연결 PR 조회는 열린 PR #3을, 그 PR의 전체 커밋 목록은 다른 답을 낸다."""
    data = outcome(
        window=[commit(60, [1]), ROOT],
        extra=[commit(31)],
        pulls=[pull(3, [31], state="open")],
        lookups=[lookup(60, Lookup.FOUND, 3)],
    )

    output = build_candidates(REQ, data)
    composed = result(output)

    assert identities(output) == [identity(PullRequestUnit(3))]
    assert counts(output) == [("UNDETERMINED", 1)]
    assert composed["outcome"] == "SUCCEEDED"
    assert composed["failures"] == []
    assert group(data).observations[sha(60)].membership is Membership.CONFLICT


def test_open_pull_request_with_incomplete_list_takes_looked_up_commit() -> None:
    """다른 계정 커밋 섞임은 목록을 끝까지 받지 못했으므로 알 수 없다(2026-10-08 팀장 결정)."""
    data = outcome(
        window=[commit(60, [1], paths=("b.py",)), ROOT],
        extra=[commit(31)],
        pulls=[pull(3, [31], state="open", complete=False)],
        lookups=[lookup(60, Lookup.FOUND, 3)],
    )

    output = build_candidates(REQ, data)

    assert identities(output) == [identity(PullRequestUnit(3))]
    assert output.candidates[0].work_facts == (
        "PR #3, 상태 열림",
        PULL_OTHERS["UNKNOWN"],
    )
    assert output.not_provided == ()


def test_empty_lookup_contradicted_by_merge_commit_of_pull_request() -> None:
    """빈 목록인데 병합 커밋으로 합친 PR #5가 이 커밋을 들였다: 근거끼리 어긋난다."""
    window = [
        commit(20, [1, 12], author=OTHER),
        commit(12, [11], author=OTHER),
        commit(11, [1]),
        ROOT,
    ]
    data = outcome(
        window=window,
        pulls=[pull(5, [12], merged=20, merge_commit=20, author=OTHER)],
        lookups=empty(11),
    )

    output = build_candidates(REQ, data)

    assert output.candidates == ()
    assert counts(output) == [("UNDETERMINED", 1)]


@pytest.mark.parametrize(
    ("status", "expected", "membership"),
    [
        (Lookup.EMPTY, None, Membership.OUTSIDE),
        (Lookup.LIMITED, [("UNDETERMINED", 1)], Membership.RANGE_LIMITED),
    ],
)
def test_lookup_empty_and_limited(
    caplog: pytest.LogCaptureFixture,
    status: Lookup,
    expected: list[tuple[str, int]] | None,
    membership: Membership,
) -> None:
    """자료 범위 한계로 보류한 변경은 단위 미확정으로 세고, 운영 로그에서는 따로 센다."""
    data = outcome(window=[commit(60, [1]), ROOT], lookups=[lookup(60, status)])
    caplog.set_level(logging.INFO, logger="app.candidates.build")

    output = build_candidates(REQ, data)

    message = caplog.records[-1].getMessage()
    if expected is None:
        assert identities(output) == [identity(CommitsUnit((sha(60),)))]
        assert output.not_provided == ()
        assert "rangeLimited=0" in message
    else:
        assert output.candidates == ()
        assert counts(output) == expected
        assert result(output)["outcome"] == "EMPTY"
        assert "insufficient=0" in message and "undetermined=1" in message
        assert "rangeLimited=1" in message
    assert group(data).observations[sha(60)].membership is membership


# PR 없는 병합


def test_merge_without_pull_request_is_a_unit() -> None:
    """작업 사실은 단위 이름과 다른 계정 커밋 섞임만 쓴다(2026-10-08 팀장 결정, 센 숫자 없음)."""
    window = [
        commit(20, [1, 12]),
        commit(12, [11]),
        commit(11, [1], paths=("b.py",)),
        ROOT,
    ]
    output = build_candidates(REQ, outcome(window=window, lookups=empty(11, 12, 20)))

    candidate = output.candidates[0]
    assert identities(output) == [identity(MergeUnit(sha(20)))]
    assert candidate.work_facts == (
        f"PR 없이 병합한 병합 커밋 {sha(20)[:12]}",
        MERGE_OTHERS["ABSENT"],
    )
    assert candidate.subject_contribution == "연동 GitHub 계정이 작성자로 기록된 커밋"
    assert candidate.evidence[0].source_revision == sha(20)
    assert candidate.evidence[0].contribution_scope.startswith(
        "PR 없이 병합한 병합 커밋"
    )
    assert [item.source_revision for item in candidate.evidence[1:]] == [
        sha(12),
        sha(11),
    ]


def test_nested_merges_give_each_commit_to_the_innermost_merge() -> None:
    window = [
        commit(20, [1, 15]),
        commit(15, [11, 12]),
        commit(12, [1], paths=("g.py",)),
        commit(11, [1], paths=("f.py",)),
        ROOT,
    ]
    output = build_candidates(
        REQ, outcome(window=window, lookups=empty(11, 12, 15, 20))
    )

    assert identities(output) == [
        identity(MergeUnit(sha(15))),
        identity(MergeUnit(sha(20))),
    ]
    inner, outer = output.candidates
    assert [item.source_revision for item in inner.evidence[1:]] == [sha(12)]
    assert [item.source_revision for item in outer.evidence[1:]] == [sha(11)]
    assert "안쪽 병합이 먼저 들인 커밋 1건" in outer.grouping_basis


def test_same_change_in_two_merges_goes_to_the_ancestor_merge_in_any_list_order() -> (
    None
):
    """X를 들인 병합 35가 Y(X의 cherry-pick)를 들인 병합 40의 조상이다. 35가 먼저 들였다."""
    window = [
        commit(40, [35, 41]),
        commit(41, [35], message=picked(31)),
        commit(35, [1, 31]),
        commit(31, [1]),
        ROOT,
    ]
    expected = [identity(MergeUnit(sha(35)))]
    for order in itertools.permutations(window):
        output = build_candidates(
            REQ, outcome(window=order, lookups=empty(31, 35, 40, 41))
        )
        assert identities(output) == expected


def test_same_change_in_unrelated_merges_goes_to_the_earlier_committed_merge() -> None:
    """서로 조상이 아닌 병합 35·45가 같은 변경(31과 그 cherry-pick 41)을 들였다.

    목록 위치가 아니라 커밋 시각으로 먼저 들인 병합을 정한다. 45가 35보다 먼저 커밋됐으므로 SHA가
    더 큰 45에 배정하고, 커밋 입력의 어떤 순서에서도 workIdentity가 같다.
    """

    def timed(record: CommitRecord, minute: int) -> CommitRecord:
        return replace(record, authored_at=at(minute), committed_at=at(minute))

    window = [
        # 머리. 첫 부모 35는 본선, 45는 이 병합이 들였다.
        timed(commit(50, [35, 45], author=OTHER), 6),
        timed(commit(35, [1, 31], author=OTHER), 5),
        timed(commit(45, [1, 41], author=OTHER), 4),
        timed(commit(41, [1], message=picked(31)), 3),
        timed(commit(31, [1]), 2),
        ROOT,
    ]
    expected = [identity(MergeUnit(sha(45)))]
    for order in itertools.permutations(window):
        output = build_candidates(
            REQ, outcome(window=order, lookups=empty(31, 41, 35, 45, 50))
        )
        assert identities(output) == expected
        assert output.not_provided == ()


def test_absorption_merge_is_never_a_unit() -> None:
    """작업 브랜치가 기본 브랜치를 받아온 병합은 단위가 아니고, 들여온 커밋은 제 단위로 간다."""
    window = [
        commit(20, [5, 15]),
        commit(15, [11, 5]),
        commit(11, [1], paths=("f.py",)),
        commit(5, [1], paths=("m.py",)),
        ROOT,
    ]
    output = build_candidates(REQ, outcome(window=window, lookups=empty(5, 11, 20)))

    assert identities(output) == [
        identity(MergeUnit(sha(20))),
        identity(CommitsUnit((sha(5),))),
    ]
    assert [item.source_revision for item in output.candidates[0].evidence[1:]] == [
        sha(11)
    ]


def test_merge_boundary_outside_window_is_range_limited() -> None:
    window = [commit(20, [1, 12]), commit(12, [11]), ROOT]
    data = outcome(window=window, lookups=empty(12, 20))

    output = build_candidates(REQ, data)

    assert output.candidates == ()
    assert counts(output) == [("UNDETERMINED", 1)]
    assert group(data).observations[sha(12)].membership is Membership.RANGE_LIMITED


def test_merge_that_first_brought_a_change_keeps_it_after_a_branch_took_in_main() -> (
    None
):
    """흡수 병합이 들인 커밋은 그 흡수 병합을 들인 바깥 병합에서만 뺀다.

    30이 21을 기본 브랜치에 처음 들였고, 작업 브랜치가 그 뒤 기본 브랜치를 받아왔다(흡수 병합 40이
    30·21을 들임). 21은 30에 남고, 50에는 작업 커밋 22만 든다.
    """
    window = [
        commit(50, [30, 40], author=OTHER),
        commit(40, [22, 30]),
        commit(30, [2, 21], author=OTHER),
        commit(22, [2], paths=("w.py",)),
        commit(21, [2], paths=("f.py",)),
        commit(2, [1], author=OTHER),
        ROOT,
    ]
    output = build_candidates(
        REQ, outcome(window=window, lookups=empty(22, 21, 30, 50))
    )

    assert identities(output) == [
        identity(MergeUnit(sha(30))),
        identity(MergeUnit(sha(50))),
    ]
    first, outer = output.candidates
    assert [item.source_revision for item in first.evidence[1:]] == [sha(21)]
    assert [item.source_revision for item in outer.evidence[1:]] == [sha(22)]
    assert output.not_provided == ()


# 첫 부모 5의 부모 4가 창 밖이라 병합 20의 첫 부모 쪽이 열려 있다. 창만 보면 20이 11·12를 들였다.
OPEN_FIRST_SIDE = [
    commit(20, [5, 12], author=OTHER),
    commit(12, [11], paths=("b.py",)),
    commit(11, [1]),
    commit(5, [4], author=OTHER),
    ROOT,
]


def _boundary(
    commits: Sequence[int],
    *,
    complete: bool = True,
    status: DetailStatus = FETCHED,
) -> MergeBoundary:
    return MergeBoundary(sha(20), tuple(sha(n) for n in commits), complete, status)


def test_merge_with_open_first_side_uses_the_compared_range() -> None:
    """비교로 보니 11은 첫 부모 5가 이미 담은 커밋이다. 20에는 12만 들고 11은 묶음이다."""
    data = outcome(
        window=OPEN_FIRST_SIDE,
        lookups=empty(12, 11, 20),
        boundaries=[_boundary([12, 20])],
    )

    output = build_candidates(REQ, data)

    assert identities(output) == [
        identity(MergeUnit(sha(20))),
        identity(CommitsUnit((sha(11),))),
    ]
    assert [item.source_revision for item in output.candidates[0].evidence[1:]] == [
        sha(12)
    ]
    assert output.not_provided == ()
    # 비교 범위가 창 안 커밋만이면 지금처럼 판정한다(11·12를 모두 들였으면 둘 다 20).
    whole = build_candidates(
        REQ,
        outcome(
            window=OPEN_FIRST_SIDE,
            lookups=empty(12, 11, 20),
            boundaries=[_boundary([11, 12, 20])],
        ),
    )
    assert identities(whole) == [identity(MergeUnit(sha(20)))]


@pytest.mark.parametrize(
    "boundaries",
    [
        [],
        [_boundary([11], complete=False)],
        [_boundary([11], complete=False, status=DetailStatus.OVERSIZED)],
        # 비교 범위에 창 밖 커밋이 있다.
        [_boundary([11, 12, 13, 20])],
    ],
    ids=["no-compare", "page-limit", "oversized", "outside-window"],
)
def test_merge_with_unproven_first_side_is_range_limited(
    boundaries: list[MergeBoundary],
) -> None:
    """첫 부모 쪽 경계를 확인하지 못했으면 확정하지 않는다.

    자료 범위 한계로 보류하고 단위 미확정으로 센다(2026-09-30 집계 결정).
    """
    data = outcome(
        window=OPEN_FIRST_SIDE, lookups=empty(12, 11, 20), boundaries=boundaries
    )

    output = build_candidates(REQ, data)

    assert output.candidates == ()
    assert counts(output) == [("UNDETERMINED", 2)]
    observations = group(data).observations
    assert observations[sha(11)].membership is Membership.RANGE_LIMITED
    assert observations[sha(12)].membership is Membership.RANGE_LIMITED


def test_merge_whose_boundary_compare_was_not_reached_is_not_counted() -> None:
    """수집이 멈춰 경계 비교를 부르지 못했으면 확인 중단이다. 세지 않고 실패를 넘긴다."""
    data = outcome(
        window=OPEN_FIRST_SIDE,
        lookups=empty(12, 11, 20),
        boundaries=[_boundary([], complete=False, status=DetailStatus.NOT_REACHED)],
        failures=[failure()],
    )

    output = build_candidates(REQ, data)
    composed = result(output)

    assert output.candidates == ()
    assert output.not_provided == ()
    assert group(data).observations[sha(12)].membership is Membership.STOPPED
    assert composed["outcome"] == "FAILED"
    assert [f["code"] for f in composed["failures"]] == ["BUDGET_EXCEEDED"]


def test_window_without_single_head_confirms_no_merge() -> None:
    window = [
        commit(20, [1, 11]),
        commit(19, [1], paths=("z.py",)),
        commit(11, [1]),
        ROOT,
    ]
    output = build_candidates(REQ, outcome(window=window, lookups=empty(11, 19, 20)))

    assert identities(output) == [identity(CommitsUnit((sha(19),)))]
    assert counts(output) == [("UNDETERMINED", 1)]


@pytest.mark.parametrize(
    ("status", "expected", "failures"),
    [
        # 들인 커밋은 PR 밖인데 병합은 PR에 속한다고 나왔다.
        (Lookup.FOUND, [("UNDETERMINED", 1)], ()),
        (Lookup.LIMITED, [("UNDETERMINED", 1)], ()),
        (Lookup.NOT_REACHED, [], (failure(),)),
    ],
)
def test_merge_lookup_that_does_not_confirm_holds_its_commits(
    status: Lookup,
    expected: list[tuple[str, int]],
    failures: tuple[CollectionFailure, ...],
) -> None:
    window = [commit(20, [1, 11]), commit(11, [1]), ROOT]
    # FOUND는 알려진 PR을 돌려줘야 맞는 입력이다(병합 20을 연결 PR 조회로 안 PR #9).
    found = status is Lookup.FOUND
    output = build_candidates(
        REQ,
        outcome(
            window=window,
            lookup_pulls=[pull(9, merged=25, status=DetailStatus.BEYOND_RANGE)]
            if found
            else [],
            lookups=[
                lookup(11, Lookup.EMPTY),
                lookup(20, status, *([9] if found else [])),
            ],
            failures=failures,
        ),
    )

    assert output.candidates == ()
    assert counts(output) == expected


# 커밋 묶음(방법 B)


def _chain() -> list[CommitRecord]:
    return [
        commit(14, [13], paths=("b.py",)),
        commit(13, [12], paths=("b.py",)),
        commit(12, [11], paths=("a.py",)),
        commit(11, [1], paths=("a.py",)),
        ROOT,
    ]


def test_commit_bundles_follow_overlapping_parent_and_ignore_input_order() -> None:
    """첫 작업 사실은 센 수 대신 가장 최근 커밋으로 묶음을 가리킨다(2026-10-08 팀장 결정)."""
    expected = [
        identity(CommitsUnit((sha(11), sha(12)))),
        identity(CommitsUnit((sha(13), sha(14)))),
    ]
    shuffler = random.Random(118)
    for _ in range(8):
        window, lookups = _chain(), empty(11, 12, 13, 14)
        shuffler.shuffle(window)
        shuffler.shuffle(lookups)
        output = build_candidates(REQ, outcome(window=window, lookups=lookups))
        assert identities(output) == expected
    assert output.candidates[0].work_facts == (
        f"PR·병합에 속하지 않은 본인 커밋 묶음(가장 최근 커밋 {sha(12)[:12]})",
    )
    assert output.candidates[0].grouping_limitations == ()


def test_commit_without_details_is_not_joined_and_says_so() -> None:
    """13의 변경 내용을 조회 범위 밖이라 받지 못했다. 이웃과 잇지 않고 양쪽 묶음에 한계를 적는다.

    변경 내용을 확인한 본인 커밋이 없는 단위(13 하나)는 빈 커밋인지 몰라 후보로 내지
    않고 근거 부족으로 센다.
    """
    window = _chain()
    window[1] = commit(13, [12], status=DetailStatus.BEYOND_RANGE)
    output = build_candidates(
        REQ, outcome(window=window, lookups=empty(11, 12, 13, 14))
    )

    assert identities(output) == [
        identity(CommitsUnit((sha(11), sha(12)))),
        identity(CommitsUnit((sha(14),))),
    ]
    for candidate in output.candidates:
        assert "이웃 커밋과 묶을지 판단하지 않았다" in candidate.grouping_limitations[0]
    assert counts(output) == [("INSUFFICIENT_EVIDENCE", 1)]


@pytest.mark.parametrize(
    ("statuses", "expected", "failures"),
    [
        # 조회 범위 밖(BEYOND_RANGE)뿐이면 근거 부족이다.
        ((DetailStatus.BEYOND_RANGE,), [("INSUFFICIENT_EVIDENCE", 1)], ()),
        # 받았는데 빈 커밋이면 기준 미달이다.
        ((FETCHED,), [("BELOW_CRITERIA", 1)], ()),
        # 수집이 멈춰 받지 못했으면 세지 않고 실패를 넘긴다.
        ((DetailStatus.NOT_REACHED,), [], (failure(),)),
        # 빈 커밋과 받지 못한 커밋이 섞였으면 받지 못한 쪽의 이유를 따른다.
        ((FETCHED, DetailStatus.BEYOND_RANGE), [("INSUFFICIENT_EVIDENCE", 1)], ()),
        ((FETCHED, DetailStatus.NOT_REACHED), [], (failure(),)),
    ],
    ids=["beyond-range", "empty", "stopped", "empty-and-beyond", "empty-and-stopped"],
)
def test_unit_without_confirmed_changes_is_not_a_candidate(
    caplog: pytest.LogCaptureFixture,
    statuses: tuple[DetailStatus, ...],
    expected: list[tuple[str, int]],
    failures: tuple[CollectionFailure, ...],
) -> None:
    """본인 기여 커밋 가운데 변경 파일을 확인한 커밋이 없으면 후보가 아니다."""
    numbers = [31 + offset for offset in range(len(statuses))]
    extra = [
        commit(number, paths=() if state is FETCHED else ("a.py",), status=state)
        for number, state in zip(numbers, statuses, strict=True)
    ]
    caplog.set_level(logging.INFO, logger="app.candidates.build")
    output = build_candidates(
        REQ,
        outcome(
            extra=extra,
            pulls=[pull(3, numbers, merged=10, author=OTHER)],
            failures=failures,
        ),
    )

    assert output.candidates == ()
    assert counts(output) == expected
    stopped = DetailStatus.NOT_REACHED in statuses
    assert f"heldAfterStop={int(stopped)}" in caplog.records[-1].getMessage()
    assert result(output)["outcome"] == ("FAILED" if stopped else "EMPTY")


@pytest.mark.parametrize(
    "other",
    [DetailStatus.BEYOND_RANGE, DetailStatus.NOT_REACHED, DetailStatus.OVERSIZED],
)
def test_unit_with_one_confirmed_change_stays_a_candidate(other: DetailStatus) -> None:
    """변경 파일을 확인한 비지 않은 커밋이 하나라도 있으면 후보다. 응답이 커서
    받지 못한 커밋(OVERSIZED)도 변경이 있는 커밋이다."""
    failures = (failure(),) if other is DetailStatus.NOT_REACHED else ()
    alone = build_candidates(
        REQ,
        outcome(
            extra=[commit(31, status=other)],
            pulls=[pull(3, [31], merged=10, author=OTHER)],
            failures=failures,
        ),
    )
    mixed = build_candidates(
        REQ,
        outcome(
            extra=[commit(31, status=other), commit(32, paths=("b.py",))],
            pulls=[pull(3, [31, 32], merged=10, author=OTHER)],
            failures=failures,
        ),
    )

    oversized = other is DetailStatus.OVERSIZED
    assert identities(alone) == ([identity(PullRequestUnit(3))] if oversized else [])
    assert identities(mixed) == [identity(PullRequestUnit(3))]
    assert mixed.not_provided == ()


LISTS_INCOMPLETE_LIMIT = (
    "커밋 목록을 다 받지 못한 기본 브랜치 대상 PR이 있어, 그 PR에도 담긴 커밋일 수 있다"
)


@pytest.mark.parametrize(
    ("unseen", "held"),
    [
        # 기본 브랜치 대상의 병합된 PR이면 보류하지 않고 근거 한계만 적는다(한계 L13).
        (pull(8, merged=5, author=OTHER, status=DetailStatus.OVERSIZED), False),
        # 병합되지 않고 닫힌 PR의 받지 못한 커밋은 연결 PR 조회가 돌려주지 않는다.
        (pull(8, author=OTHER, status=DetailStatus.OVERSIZED), True),
        # 기본 브랜치가 아닌 곳을 대상으로 한 열린 PR의 250건 목록.
        (
            pull(
                8,
                [81],
                state="open",
                author=OTHER,
                complete=False,
                base_ref="release",
            ),
            True,
        ),
        (pull(8, author=OTHER, status=DetailStatus.REVISION_MISMATCH), True),
    ],
    ids=["merged-main-oversized", "closed-oversized", "open-release-250", "mismatch"],
)
@pytest.mark.parametrize("via_merge", [False, True], ids=["direct", "pr-less-merge"])
def test_outside_commit_notes_unseen_pull_request_lists_on_evidence(
    caplog: pytest.LogCaptureFixture,
    unseen: PullRequest,
    held: bool,
    via_merge: bool,
) -> None:
    """2026-10-09 팀장 결정 「커밋이 250개 넘는 PR」: 목록을 다 받지 못한 PR과 겹칠 수 있으면 PR 밖을
    확정하지 않고 보류해 UNDETERMINED로 센다(실패 없음). PR 없는 병합에 들어갈 커밋도 같다."""
    window = [commit(60, [1]), ROOT]
    lookups = empty(60)
    if via_merge:
        window = [commit(20, [1, 60], author=OTHER), *window]
        lookups = empty(60, 20)
    caplog.set_level(logging.INFO, logger="app.candidates.build")
    extra = [commit(81, author=OTHER)] if unseen[1].commits else []
    data = outcome(window=window, extra=extra, pulls=[unseen], lookups=lookups)

    output = build_candidates(REQ, data)
    composed = result(output)

    observation = group(data).observations[sha(60)]
    assert composed["failures"] == []
    if held:
        assert output.candidates == ()
        assert counts(output) == [("UNDETERMINED", 1)]
        assert composed["outcome"] == "EMPTY"
        assert observation.membership is Membership.CONFLICT
        assert observation.hold_reason is HoldReason.UNSEEN_PULL_REQUEST_COMMITS
        assert "heldByIncompleteLists=1" in caplog.records[-1].getMessage()
        return
    unit = MergeUnit(sha(20)) if via_merge else CommitsUnit((sha(60),))
    (candidate,) = output.candidates
    assert candidate.work_identity == identity(unit)
    assert candidate.grouping_limitations == ()
    assert LISTS_INCOMPLETE_LIMIT in candidate.evidence[0].coverage_limits
    assert observation.hold_reason is None
    assert output.not_provided == ()
    assert "heldByIncompleteLists=0" in caplog.records[-1].getMessage()


# 단위 나누기


def _split_case(
    *,
    messages: tuple[str, str, str] = (
        "로그인 오류 #5",
        "로그인 오류 #5",
        "설치 안내 #6",
    ),
    paths: tuple[str, str, str] = ("login.py", "login.py", "docs.md"),
    authors: tuple[GitHubAccount, GitHubAccount, GitHubAccount] = (
        MEMBER,
        MEMBER,
        MEMBER,
    ),
    statuses: tuple[DetailStatus, DetailStatus, DetailStatus] = (
        FETCHED,
        FETCHED,
        FETCHED,
    ),
    issues: tuple[int, ...] = (5, 6),
    allowed: tuple[str, ...] = ("COMMIT", "PULL_REQUEST", "ISSUE"),
    failures: tuple[CollectionFailure, ...] = (),
    window: tuple[CommitRecord, ...] = (),
    lookups: tuple[AssociatedPulls, ...] = (),
    stopped_during: Phase | None = None,
) -> GenerationOutput:
    """PR #20(병합됨)의 본인 커밋 21·22·23. window·lookups는 PR 밖 기본 브랜치 커밋과 그 조회다."""
    extra = [
        commit(21 + index, message=message, paths=(path,), author=author, status=state)
        for index, (message, path, author, state) in enumerate(
            zip(messages, paths, authors, statuses, strict=True)
        )
    ]
    data = outcome(
        window=window,
        extra=extra,
        pulls=[pull(20, [21, 22, 23], merged=30)],
        lookups=lookups,
        issues=[issue(number) for number in issues],
        allowed=allowed,
        failures=failures,
    )
    if stopped_during is not None:
        assert data.relations is not None
        data = replace(
            data,
            relations=replace(data.relations, stopped_during=stopped_during),
        )
    return build_candidates(REQ, data)


def test_unit_with_separate_issues_and_files_is_split() -> None:
    """나눈 부분은 가리키는 이슈로 서로 다른 첫 작업 사실을 갖고, 다른 계정 커밋 섞임은 PR 전체
    기준이다(2026-10-08 팀장 결정 「수신자에게 나가는 숫자와 근거 순서」)."""
    output = _split_case()

    assert identities(output) == [
        identity(PullRequestUnit(20), (Part(sha(21)), Part(sha(22)))),
        identity(PullRequestUnit(20), (Part(sha(23)),)),
    ]
    first, second = output.candidates
    assert first.work_facts == (
        "PR #20에서 나눈 부분(가리키는 이슈 #5)",
        "PR #20, 상태 병합됨",
        PULL_OTHERS["ABSENT"],
    )
    assert second.work_facts[0] == "PR #20에서 나눈 부분(가리키는 이슈 #6)"
    assert second.work_facts[1:] == first.work_facts[1:]
    assert first.evidence[0].source_url == second.evidence[0].source_url


def test_unit_without_split_signal_has_no_limitation() -> None:
    output = _split_case(messages=("로그인", "로그인 #5", "설치 안내 #5"))

    assert identities(output) == [identity(PullRequestUnit(20))]
    assert output.candidates[0].grouping_limitations == ()


@pytest.mark.parametrize(
    ("changes", "reason"),
    [
        # C15: 두 작업이 같은 파일을 번갈아 고쳤다.
        ({"paths": ("login.py", "login.py", "login.py")}, "같은 파일을 함께 고쳐"),
        # 수집이 멈춘 것만으로가 아니라 이 단위에 걸린 확인이 멈췄을 때다. 목록
        # 단계에서 멈췄으면 이슈 목록도 다 받지 못했을 수 있다.
        ({"failures": (failure(),), "stopped_during": "LISTS"}, "수집이 멈춰"),
        # 병합된 PR #20은 본인 커밋 60의 연결 PR 조회로 squash·rebase 커밋을 배정받을 수 있다.
        (
            {
                "failures": (failure(),),
                "window": (commit(60, [1], paths=("z.py",)), ROOT),
                "lookups": (lookup(60, Lookup.NOT_REACHED),),
            },
            "수집이 멈춰",
        ),
        (
            {"messages": ("로그인 #5", "로그인 #6", "설치 #6")},
            "이슈가 비었거나 서로 겹쳐",
        ),
        # 파일이 겹치지 않는 부분 하나(docs.md)에는 다른 계정 커밋만 있다(Q7 조건 1).
        (
            {
                "messages": ("로그인 #5", "로그인 정리 #6", "설치 안내 #7"),
                "authors": (MEMBER, MEMBER, OTHER),
                "issues": (5, 6, 7),
            },
            "본인 변경이 없는 부분이 있어",
        ),
        # 한 커밋의 변경 파일을 받지 못했다.
        (
            {"statuses": (FETCHED, FETCHED, DetailStatus.OVERSIZED)},
            "변경 파일을 모두 확인하지 못해",
        ),
    ],
)
def test_split_signal_without_conditions_stays_whole_with_reason(
    changes: dict[str, Any], reason: str
) -> None:
    output = _split_case(**changes)

    assert identities(output) == [identity(PullRequestUnit(20))]
    (limitation,) = output.candidates[0].grouping_limitations
    assert limitation.startswith("본인 커밋이 서로 다른 이슈 2개를 가리키지만")
    assert reason in limitation
    assert output.not_provided == ()


def test_unrelated_stop_does_not_change_the_split() -> None:
    """나누기는 요청 전체의 완료 여부가 아니라 그 단위에 걸린 확인으로 판단한다.

    PR 밖 커밋 60의 연결 PR 조회는 마쳤고 그 변경 내용 조회만 멈췄다. PR #20의 나누기 근거와는
    무관하다.
    """
    output = _split_case(
        failures=(failure(FailureCode.RATE_LIMITED),),
        window=(
            commit(60, [1], paths=("z.py",), status=DetailStatus.NOT_REACHED),
            ROOT,
        ),
        lookups=(lookup(60, Lookup.EMPTY),),
    )

    assert identities(output) == identities(_split_case())
    assert len(output.candidates) == 2
    assert output.not_provided == ()
    assert result(output)["outcome"] == "PARTIAL_FAILED"


@pytest.mark.parametrize(
    ("messages", "expected"),
    [
        # 결정의 기본 모양: 서로 다른 번호 둘(#5·#6).
        (("로그인 오류 #5", "로그인 오류 #5", "설치 안내 #6"), 2),
        # 그 PR 자신의 번호(#20)는 세지 않는다.
        (("로그인 오류 #20", "로그인 오류 #20", "설치 안내 #5"), None),
        # 번호가 하나뿐이다.
        (("로그인 오류 #5", "로그인 정리", "설치 안내 #5"), None),
        # 주소 안의 번호는 세지 않는다.
        (
            (
                "로그인 오류 #5",
                "참고 https://example.invalid/guide#6",
                "설치 안내 www.example.invalid/a?ref=#7",
            ),
            None,
        ),
        (("로그인 #5", "로그인 #6", "설치 #7"), 3),
    ],
    ids=["two", "own-pr-number", "one", "address", "three"],
)
def test_split_needs_issue_scope(
    messages: tuple[str, str, str], expected: int | None
) -> None:
    """2026-10-08 팀장 결정 「한 PR·병합 안의 서로 다른 번호」: 이슈 조회가 없으면 번호만으로 나누지
    않고 작성자가 묶은 PR 경계를 따른다. 서로 다른 번호(PR 번호 제외)가 둘 이상이면 그 사실을
    groupingLimitations에 남기고 notProvided에는 세지 않는다."""
    output = _split_case(messages=messages, allowed=("COMMIT", "PULL_REQUEST"))

    assert identities(output) == [identity(PullRequestUnit(20))]
    limitations = output.candidates[0].grouping_limitations
    if expected is None:
        assert limitations == ()
    else:
        assert limitations == (
            f"본인 커밋이 서로 다른 번호 {expected}개를 가리키지만, 작성자가 한 PR로 묶은 "
            "경계를 따라 한 작업으로 두었다",
        )
    assert output.not_provided == ()


def test_merge_without_issue_scope_keeps_the_author_boundary() -> None:
    """2026-10-08 팀장 결정: PR 없이 합친 병합도 같다. 문장은 '한 병합으로'다."""
    window = [
        commit(20, [1, 12], author=OTHER),
        commit(12, [11], message="설치 안내 #6", paths=("docs.md",)),
        commit(11, [1], message="로그인 오류 #5", paths=("login.py",)),
        ROOT,
    ]
    output = build_candidates(REQ, outcome(window=window, lookups=empty(11, 12, 20)))

    assert identities(output) == [identity(MergeUnit(sha(20)))]
    assert output.candidates[0].grouping_limitations == (
        "본인 커밋이 서로 다른 번호 2개를 가리키지만, 작성자가 한 병합으로 묶은 경계를 "
        "따라 한 작업으로 두었다",
    )
    assert output.not_provided == ()
    # 커밋 묶음에는 붙이지 않는다.
    bundle = build_candidates(
        REQ,
        outcome(
            window=[
                commit(12, [11], message="설치 안내 #6", paths=("a.py",)),
                commit(11, [1], message="로그인 오류 #5", paths=("a.py",)),
                ROOT,
            ],
            lookups=empty(11, 12),
        ),
    )
    assert identities(bundle) == [identity(CommitsUnit((sha(11), sha(12))))]
    assert bundle.candidates[0].grouping_limitations == ()


def _pull_request_list_not_whole(kind: str) -> CollectionOutcome:
    """PR #20의 본인 커밋 둘이 서로 다른 이슈·파일을 가리키는데 PR 커밋 목록을 다 보지 못했다."""
    first = commit(61, [1], message="로그인 #5", paths=("a.py",))
    second = commit(62, [61], message="설치 #6", paths=("b.py",))
    window: list[CommitRecord] = [second, first, ROOT]
    extra: list[CommitRecord] = []
    pulls: list[PullRequest] = []
    lookup_pulls: list[PullRequest] = []
    lookups = [lookup(61, Lookup.FOUND, 20), lookup(62, Lookup.FOUND, 20)]
    if kind == "lookup-only":
        # 최근 PR 목록 밖에서 연결 PR 조회로만 안 PR. 다른 계정 커밋은 조회하지 않는다.
        lookup_pulls = [pull(20, merged=70, status=DetailStatus.BEYOND_RANGE)]
    elif kind == "oversized":
        pulls = [pull(20, merged=70, status=DetailStatus.OVERSIZED)]
    else:
        # 250건에 닿았는데 비교 API로 전체를 확인하지 못한 목록.
        window, extra, lookups = [ROOT], [replace(first, parents=()), second], []
        pulls = [pull(20, [61, 62], merged=70, complete=False)]
    return outcome(
        window=window,
        extra=extra,
        pulls=pulls,
        lookup_pulls=lookup_pulls,
        lookups=lookups,
        issues=[issue(5), issue(6)],
        allowed=("COMMIT", "PULL_REQUEST", "ISSUE"),
    )


@pytest.mark.parametrize("kind", ["lookup-only", "oversized", "incomplete"])
def test_split_needs_the_whole_pull_request_list(kind: str) -> None:
    """Q7: 단위에 배정된 모든 변경이 한 부분에 속해야 한다. 보지 못한 커밋이 부분들을 이을 수 있다."""
    output = build_candidates(REQ, _pull_request_list_not_whole(kind))

    assert identities(output) == [identity(PullRequestUnit(20))]
    (limitation,) = output.candidates[0].grouping_limitations
    assert limitation == (
        "본인 커밋이 서로 다른 이슈 2개를 가리키지만 PR 커밋 목록을 모두 확인하지 못해 "
        "나누지 않고 한 작업으로 두었다"
    )
    assert output.not_provided == ()


# 같은 변경


def test_cherry_pick_with_equal_diff_is_one_change() -> None:
    picked = commit(311, message=f"옮김\n\n(cherry picked from commit {sha(301)})")
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(301), picked],
            pulls=[pull(30, [301], merged=10), pull(31, [311], merged=20)],
        ),
    )

    assert identities(output) == [identity(PullRequestUnit(30))]
    assert "하나로 셌다" in output.candidates[0].grouping_basis
    # 같은 변경을 #30에 내준 본인 PR #31은 배정받은 변경이 없어 단위가 아니다.
    # 근거 부족으로도 세지 않는다.
    assert output.not_provided == ()


def test_cherry_pick_with_oversized_details_keeps_both_with_limitation() -> None:
    """응답이 커서 변경 내용을 받지 못한 쪽은 조회를 마친 것이라 비교할 수 없는
    관계다. 보류하지 않고 두 후보와 양쪽 한계를 내며 실패는 없다(수집이 멈춘 경우와 다르다)."""
    output = build_candidates(
        REQ,
        outcome(
            extra=[
                commit(301),
                commit(311, message=picked(301), status=DetailStatus.OVERSIZED),
            ],
            pulls=[pull(30, [301], merged=10), pull(31, [311], merged=20)],
        ),
    )

    assert identities(output) == [
        identity(PullRequestUnit(30)),
        identity(PullRequestUnit(31)),
    ]
    for candidate in output.candidates:
        (limitation,) = candidate.grouping_limitations
        assert limitation.startswith(CHERRY_PICK_NOTE)
    composed = result(output)
    assert composed["failures"] == [] and composed["outcome"] == "SUCCEEDED"


def test_cherry_pick_with_different_diff_keeps_both_with_limitation() -> None:
    picked = commit(
        311, message=f"(cherry picked from commit {sha(301)})", content=" 문맥"
    )
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(301), picked],
            pulls=[pull(30, [301], merged=10), pull(31, [311], merged=20)],
        ),
    )

    assert identities(output) == [
        identity(PullRequestUnit(30)),
        identity(PullRequestUnit(31)),
    ]
    for candidate in output.candidates:
        assert candidate.grouping_limitations[0].startswith(
            "cherry-pick으로 옮긴 같은 변경일 수"
        )


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        # 뒤 PR이 앞 PR을 가리키는 재제출(C14 모양): 병합된 #12에만 배정한다.
        ("#11을 다시 올립니다", [12]),
        # 가리키지 않으면 상태·순서·diff가 같아도 다른 작업이다(C30 모양).
        ("같은 이슈를 고쳤습니다", [11, 12]),
        # 다른 저장소 주소 속 번호와 HTML 코드 속 번호는 가리킨 것이 아니다.
        ("참고: https://github.com/other-owner/other-repo/pull/3?ref=#11", [11, 12]),
        ("<pre><code>#11</code></pre>", [11, 12]),
    ],
)
def test_resubmission_needs_reference_and_equal_diff(
    body: str, expected: list[int]
) -> None:
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(111), commit(121)],
            pulls=[
                pull(11, [111], created=1),
                pull(12, [121], created=5, merged=9, body=body),
            ],
        ),
    )

    assert identities(output) == [identity(PullRequestUnit(n)) for n in expected]
    assert all(c.grouping_limitations == () for c in output.candidates)
    assert output.not_provided == ()


def cut_patch(record: CommitRecord) -> CommitRecord:
    """첫 파일의 patch가 온전한 hunk 뒤에서 잘린 커밋: 파일의 줄 수가 patch보다 하나씩 많다."""
    assert record.changes is not None
    first, *rest = record.changes.files
    longer = replace(
        first, additions=first.additions + 1, deletions=first.deletions + 1
    )
    return replace(record, changes=replace(record.changes, files=(longer, *rest)))


def test_resubmission_with_a_cut_patch_keeps_both_with_limitation() -> None:
    """잘린 patch는 비교하지 않으므로 재제출 관계가 있어도 두 후보와 양쪽 한계다."""
    body = "#11을 다시 올립니다"
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(111), cut_patch(commit(121))],
            pulls=[
                pull(11, [111], created=1),
                pull(12, [121], created=5, merged=9, body=body),
            ],
        ),
    )

    assert identities(output) == [identity(PullRequestUnit(n)) for n in (11, 12)]
    for candidate in output.candidates:
        (limitation,) = candidate.grouping_limitations
        assert limitation.startswith(RESUBMISSION_NOTE)
    assert output.not_provided == ()


MODE_CHANGED = ("old mode 100644", "new mode 100755")


def related_pair(kind: str, later_modes: tuple[str, ...] | None) -> CollectionOutcome:
    """관계 근거가 있고 모드 없이 만든 diff 값이 같은 두 PR의 커밋. 뒤 커밋의 모드만 정한다."""
    if kind == "resubmission":
        return outcome(
            extra=[commit(111), commit(121, modes=later_modes)],
            pulls=[
                pull(11, [111], created=1),
                pull(12, [121], created=5, merged=9, body="#11을 다시 올립니다"),
            ],
        )
    return outcome(
        extra=[commit(301), commit(311, message=picked(301), modes=later_modes)],
        pulls=[pull(30, [301], merged=10), pull(31, [311], merged=20)],
    )


RELATED = {"resubmission": ((11, 12), 12), "cherry-pick": ((30, 31), 30)}


@pytest.mark.parametrize("kind", ["resubmission", "cherry-pick"])
def test_related_changes_with_the_same_observed_modes_are_one_change(
    kind: str,
) -> None:
    output = build_candidates(REQ, related_pair(kind, ()))

    _, winner = RELATED[kind]
    assert identities(output) == [identity(PullRequestUnit(winner))]
    assert output.candidates[0].grouping_limitations == ()


@pytest.mark.parametrize("kind", ["resubmission", "cherry-pick"])
@pytest.mark.parametrize(
    "later_modes",
    [
        pytest.param(MODE_CHANGED, id="mode-differs"),
        pytest.param(None, id="unobserved"),
    ],
)
def test_related_changes_without_matching_modes_keep_both_with_limitation(
    kind: str, later_modes: tuple[str, ...] | None
) -> None:
    """내용이 같아도 모드가 다르거나 모드를 확인하지 못하면 두 후보와 양쪽 한계(C26)."""
    output = build_candidates(REQ, related_pair(kind, later_modes))

    numbers, _ = RELATED[kind]
    note = RESUBMISSION_NOTE if kind == "resubmission" else CHERRY_PICK_NOTE
    assert identities(output) == [identity(PullRequestUnit(n)) for n in numbers]
    for candidate in output.candidates:
        (limitation,) = candidate.grouping_limitations
        assert limitation.startswith(note)
    assert output.not_provided == ()


@pytest.mark.parametrize(
    "checked_first", [True, False], ids=["first-checked", "none-checked"]
)
def test_mode_check_stopped_by_budget_keeps_both_pull_requests_with_limitation(
    caplog: pytest.LogCaptureFixture, checked_first: bool
) -> None:
    """모드 확인에 닿지 못하면 같은 변경인지 비교하지 못한 쌍이다.

    두 커밋은 서로 다른 PR #30·#31에 소속을 확인했으므로 보류하지 않는다. 두 후보를 내고 양쪽에
    같은 변경 미확정 한계를 적으며, 실패는 그대로 넘긴다.
    """
    original = commit(301, modes=() if checked_first else None)
    moved = commit(311, message=picked(301), modes=None)
    first = (
        ModeCheck(sha(301), FETCHED, matched=True)
        if checked_first
        else ModeCheck(sha(301), DetailStatus.NOT_REACHED)
    )
    caplog.set_level(logging.INFO, logger="app.candidates.build")
    output = build_candidates(
        REQ,
        outcome(
            extra=[original, moved],
            pulls=[pull(30, [301], merged=10), pull(31, [311], merged=20)],
            failures=[failure()],
            mode_checks=[first, ModeCheck(sha(311), DetailStatus.NOT_REACHED)],
        ),
    )

    assert identities(output) == [
        identity(PullRequestUnit(30)),
        identity(PullRequestUnit(31)),
    ]
    for candidate in output.candidates:
        (limitation,) = candidate.grouping_limitations
        assert limitation.startswith(CHERRY_PICK_NOTE)
    assert output.not_provided == ()
    assert "heldAfterStop=0" in caplog.records[-1].getMessage()
    composed = result(output)
    assert [each["code"] for each in composed["failures"]] == [
        FailureCode.BUDGET_EXCEEDED.value
    ]
    assert composed["outcome"] == "PARTIAL_FAILED"


def test_mode_check_not_reached_with_other_content_is_not_held() -> None:
    """모드 확인에 닿지 못했어도 모드 없이 만든 값이 다르면 같은 변경일 수 없다."""
    output = build_candidates(
        REQ,
        outcome(
            extra=[
                commit(301, modes=None),
                commit(311, message=picked(301), content=" 문맥"),
            ],
            pulls=[pull(30, [301], merged=10), pull(31, [311], merged=20)],
            failures=[failure()],
            mode_checks=[ModeCheck(sha(301), DetailStatus.NOT_REACHED)],
        ),
    )

    assert identities(output) == [
        identity(PullRequestUnit(30)),
        identity(PullRequestUnit(31)),
    ]


@pytest.mark.parametrize(
    "pulls",
    [
        # 병합되지 않은 #15가 병합된 #12보다 나중에 만들어졌다.
        [
            pull(15, [111], created=25),
            pull(12, [121], created=20, merged=30, body="#15를 다시 올립니다"),
        ],
        # 둘 다 병합되지 않았다.
        [
            pull(11, [111], created=1),
            pull(12, [121], created=5, body="#11을 다시 올립니다"),
        ],
        # 만든 시각이 같다.
        [
            pull(11, [111], created=5),
            pull(12, [121], created=5, merged=9, body="#11을 다시 올립니다"),
        ],
    ],
    ids=["unmerged-created-later", "both-unmerged", "same-creation-time"],
)
def test_reference_and_equal_diff_without_resubmission_shape_stay_apart(
    pulls: list[PullRequest],
) -> None:
    """작업 단위 문서: PR 상태·만든 순서가 재제출 모양이 아니면 가리켜도 다른 작업이다."""
    output = build_candidates(
        REQ, outcome(extra=[commit(111), commit(121)], pulls=pulls)
    )

    numbers = sorted(record.number for record, _ in pulls)
    assert identities(output) == [identity(PullRequestUnit(n)) for n in numbers]
    assert all(c.grouping_limitations == () for c in output.candidates)


CHERRY_PICK_NOTE = "cherry-pick으로 옮긴 같은 변경일 수 있다"
RESUBMISSION_NOTE = "같은 작업을 다시 낸 것일 수 있다(PR #11·#12"


@pytest.mark.parametrize(
    ("extra", "pulls", "expected", "note"),
    [
        # Y(#31)는 X(#30)와 같은 변경으로 확인돼 #30에 배정됐다. Y를 옮긴 Z(#32)는 diff가 다르다.
        (
            [
                commit(301),
                commit(311, message=picked(301)),
                commit(321, message=picked(311), content=" 문맥"),
            ],
            [
                pull(30, [301], merged=10),
                pull(31, [311], merged=20),
                pull(32, [321], merged=30),
            ],
            [30, 32],
            CHERRY_PICK_NOTE,
        ),
        # 재제출 #12의 B는 C(#10)의 cherry-pick으로 #10에 배정됐다. 닫힌 #11의 A는 diff가 다르다.
        (
            [
                commit(101),
                commit(111, content=" 다름"),
                commit(121, message=picked(101)),
            ],
            [
                pull(10, [101], merged=4),
                pull(11, [111], created=1),
                pull(12, [121], created=5, merged=9, body="#11을 다시 올립니다"),
            ],
            [10, 11],
            RESUBMISSION_NOTE,
        ),
    ],
    ids=["cherry-pick-chain", "resubmission-moved"],
)
def test_unconfirmed_limitation_follows_each_change_to_its_candidate(
    extra: list[CommitRecord],
    pulls: list[PullRequest],
    expected: list[int],
    note: str,
) -> None:
    """같은 변경 미확정: 같은 작업일 수 있다는 점은 두 변경을 가진 두 후보 모두에 적는다."""
    output = build_candidates(REQ, outcome(extra=extra, pulls=pulls))

    assert identities(output) == [identity(PullRequestUnit(n)) for n in expected]
    for candidate in output.candidates:
        (limitation,) = candidate.grouping_limitations
        assert limitation.startswith(note)


def test_integration_pull_request_with_only_moved_changes_is_not_a_candidate() -> None:
    """C8: 통합 PR #12에는 병합 커밋만 남아 배정받은 변경이 없다."""
    extra = [
        commit(101),
        commit(111, paths=("b.py",)),
        commit(102, [1, 101], author=OTHER),
        commit(112, [102, 111], author=OTHER),
    ]
    output = build_candidates(
        REQ,
        outcome(
            extra=extra,
            pulls=[
                pull(10, [101], merged=10, author=OTHER),
                pull(11, [111], merged=11, author=OTHER),
                pull(12, [101, 102, 111, 112], merged=20),
            ],
        ),
    )

    assert identities(output) == [
        identity(PullRequestUnit(10)),
        identity(PullRequestUnit(11)),
    ]
    assert output.not_provided == ()


# 집계 단위


def test_not_provided_counting_units_and_order() -> None:
    window = [
        commit(54, [53], paths=("k2.py",)),
        commit(53, [52], paths=("k1.py",)),
        commit(52, [51], paths=("r2.py",)),
        commit(51, [1], paths=("r1.py",)),
        ROOT,
    ]
    extra = [
        commit(31),
        commit(81, author=OTHER),
        commit(91, status=DetailStatus.BEYOND_RANGE),
        commit(101, paths=()),
        commit(102, paths=()),
    ]
    output = build_candidates(
        REQ,
        outcome(
            window=window,
            extra=extra,
            pulls=[
                pull(3, [31], state="open"),
                # 연동 계정이 연 PR인데 본인 커밋이 없다. PR을 연 것은 기여가 아니므로 다른 계정
                # 커밋만 있는 단위처럼 세지 않는다(2026-10-09 팀장 결정).
                pull(8, [81], merged=4),
                # 본인 커밋의 변경 내용이 조회 범위 밖이다(근거 부족).
                pull(9, [91], merged=5, author=OTHER),
                # 본인 커밋이 모두 빈 커밋이다.
                pull(10, [101, 102], merged=6, author=OTHER),
            ],
            lookups=[
                # 자료 범위 한계(51·52)와 근거끼리 어긋남(53·54)은 모두 단위 미확정이다.
                lookup(51, Lookup.LIMITED),
                lookup(52, Lookup.LIMITED),
                lookup(53, Lookup.FOUND, 3),
                lookup(54, Lookup.FOUND, 3),
            ],
        ),
    )

    assert identities(output) == [identity(PullRequestUnit(3))]
    assert counts(output) == [
        ("INSUFFICIENT_EVIDENCE", 1),
        ("BELOW_CRITERIA", 1),
        ("UNDETERMINED", 4),
    ]


# 확인 중단과 실패 독립


def test_stopped_lookup_holds_change_without_counting() -> None:
    """멈춘 확인과 무관한 단위의 판정: PR #3은 변경 내용까지 확인을 마쳤고, 다른 본인 커밋의 연결
    PR 조회는 상한으로 멈췄다. #3은 후보이고 결과는 PARTIAL_FAILED다.

    관측을 직접 만든 모양이다. 실제 수집은 연결 PR 조회 뒤에 변경 내용을 받으므로 조회에서 멈추면
    #3의 변경 내용도 없어 Catch 0개·FAILED다(사례 문서 C27, test_candidate_cases의 C27 시험).
    """
    data = outcome(
        window=[commit(60, [1]), ROOT],
        extra=[commit(31)],
        pulls=[pull(3, [31], merged=10)],
        lookups=[lookup(60, Lookup.NOT_REACHED)],
        failures=[failure()],
    )

    output = build_candidates(REQ, data)
    composed = result(output)

    assert identities(output) == [identity(PullRequestUnit(3))]
    assert output.not_provided == ()
    assert composed["outcome"] == "PARTIAL_FAILED"
    assert [f["code"] for f in composed["failures"]] == ["BUDGET_EXCEEDED"]


def test_stopped_before_lookups_with_no_other_work_fails() -> None:
    """C28: 유일한 변경의 소속을 확인하기 전에 멈췄다."""
    output = build_candidates(
        REQ,
        outcome(
            window=[commit(60, [1]), ROOT],
            failures=[failure(FailureCode.TIME_LIMIT_EXCEEDED)],
        ),
    )

    composed = result(output)
    assert composed["outcome"] == "FAILED"
    assert composed["notProvided"] == []


@pytest.mark.parametrize(("stopped_parent", "survives"), [(61, False), (1, True)])
def test_bundle_next_to_stopped_commit_is_held(
    stopped_parent: int, survives: bool
) -> None:
    window = [commit(62, [stopped_parent]), commit(61, [1]), ROOT]
    output = build_candidates(
        REQ,
        outcome(
            window=window,
            lookups=[lookup(61, Lookup.EMPTY), lookup(62, Lookup.NOT_REACHED)],
            failures=[failure(FailureCode.RATE_LIMITED)],
        ),
    )

    expected = [identity(CommitsUnit((sha(61),)))] if survives else []
    assert identities(output) == expected
    assert output.not_provided == ()
    assert result(output)["outcome"] == ("PARTIAL_FAILED" if survives else "FAILED")


@pytest.mark.parametrize("known_by", ["list", "lookup"])
def test_unreached_list_of_earlier_pull_request_holds_later_unit(known_by: str) -> None:
    """먼저 병합된 #4의 커밋 목록을 수집이 멈춰 받지 못했다. #5의 변경이 #4에 갈 수 있다.

    #4를 PR 목록이 아니라 연결 PR 조회로 알았어도 같다.
    """
    earlier = pull(4, merged=10, status=DetailStatus.NOT_REACHED)
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(51)],
            pulls=[earlier, pull(5, [51], merged=20)]
            if known_by == "list"
            else [pull(5, [51], merged=20)],
            lookup_pulls=[earlier] if known_by == "lookup" else [],
            failures=[failure()],
        ),
    )

    assert output.candidates == ()
    assert output.not_provided == ()


EARLIER_LIST_LIMIT = "먼저 병합된 PR 가운데 커밋 목록을 다 받지 못한 PR이 있어, 그 PR에도 담긴 변경일 수 있다"


@pytest.mark.parametrize("list_state", ["oversized", "revision-mismatch", "incomplete"])
def test_incomplete_list_of_earlier_merged_pull_request_adds_limit_to_later_unit(
    list_state: str,
) -> None:
    """2026-10-09 팀장 결정: 먼저 병합된 #4의 커밋 목록을 정한 범위대로 조회했지만 다 받지 못했다
    (크기 상한·판본 불일치·250건에서 다 읽지 못함). #5의 변경 51이 #4에도 담겼을 수 있지만 보류하지
    않고 #5에 배정한다. #5의 PR 근거에 한계를 적고 집계와 실패는 바꾸지 않는다. 수집이 멈춰 받지
    못한 목록(NOT_REACHED)은 위 시험처럼 확인 중단이다."""
    if list_state == "incomplete":
        earlier = pull(4, [41], merged=10, complete=False)
        extra = [commit(41, author=OTHER), commit(51)]
    else:
        status = (
            DetailStatus.OVERSIZED
            if list_state == "oversized"
            else DetailStatus.REVISION_MISMATCH
        )
        earlier = pull(4, merged=10, status=status)
        extra = [commit(51)]
    output = build_candidates(
        REQ, outcome(extra=extra, pulls=[earlier, pull(5, [51], merged=20)])
    )
    composed = result(output)

    assert identities(output) == [identity(PullRequestUnit(5))]
    (candidate,) = output.candidates
    first, *rest = candidate.evidence
    assert EARLIER_LIST_LIMIT in first.coverage_limits
    assert all(EARLIER_LIST_LIMIT not in item.coverage_limits for item in rest)
    assert EARLIER_LIST_LIMIT not in candidate.grouping_limitations
    assert output.not_provided == ()
    assert composed["failures"] == []
    assert composed["outcome"] == "SUCCEEDED"


@pytest.mark.parametrize("case", ["merged-later", "not-merged", "own-list"])
def test_earlier_list_limit_needs_an_earlier_merged_pull_request(case: str) -> None:
    """한계는 배정한 PR보다 먼저 병합된 PR의 목록이 덜 받혔을 때만 붙는다(2026-10-09 팀장 결정).

    목록이 덜 받힌 #4가 #5보다 나중에 병합됐거나(merged-later), 병합되지 않았거나(not-merged), 덜
    받힌 목록이 #5 자신의 것이면(own-list) 붙이지 않는다. 마지막 경우는 #5 근거의 목록 한계가 이미
    알린다.
    """
    extra = [commit(51)]
    if case == "own-list":
        pulls = [pull(5, [51], merged=20, complete=False)]
    else:
        state = DetailStatus.OVERSIZED
        if case == "merged-later":
            earlier = pull(4, merged=30, status=state)
            later = pull(5, [51], merged=20)
        else:
            earlier = pull(4, state="open", status=state)
            later = pull(5, [51], state="open")
        pulls = [earlier, later]
    output = build_candidates(REQ, outcome(extra=extra, pulls=pulls))

    assert identities(output) == [identity(PullRequestUnit(5))]
    assert all(
        EARLIER_LIST_LIMIT not in item.coverage_limits
        for item in output.candidates[0].evidence
    )
    assert output.not_provided == ()


@pytest.mark.parametrize("with_other", [False, True], ids=["alone", "with-other"])
def test_unreached_details_of_relation_hold_only_the_later_side(
    caplog: pytest.LogCaptureFixture, with_other: bool
) -> None:
    """두 PR 목록은 완전하고 cherry-pick 쌍의 뒤쪽 상세 조회가 429로 멈췄다.

    두 커밋은 서로 다른 PR에 소속을 확인했으므로 같은 변경 비교를 못 했다는 이유로 보류하지 않고
    양쪽에 한계를 적는다. 다만 #31의 본인 커밋이 변경 내용을 받지 못한 311뿐이면 빈 커밋인지 몰라
    후보로 내지 않는다(세지 않음). 변경 내용을 확인한 커밋 312도 있으면 #31도 후보다.
    """
    picked = commit(
        311,
        message=f"(cherry picked from commit {sha(301)})",
        status=DetailStatus.NOT_REACHED,
    )
    extra = [commit(301), picked]
    later = [311]
    if with_other:
        extra.append(commit(312, [311], paths=("b.py",)))
        later.append(312)
    caplog.set_level(logging.INFO, logger="app.candidates.build")
    output = build_candidates(
        REQ,
        outcome(
            extra=extra,
            pulls=[pull(30, [301], merged=10), pull(31, later, merged=20)],
            failures=[failure(FailureCode.RATE_LIMITED)],
        ),
    )

    composed = result(output)
    numbers = [30, 31] if with_other else [30]
    assert identities(output) == [identity(PullRequestUnit(n)) for n in numbers]
    for candidate in output.candidates:
        (limitation,) = candidate.grouping_limitations
        assert limitation.startswith(CHERRY_PICK_NOTE)
    assert output.not_provided == ()
    assert f"heldAfterStop={int(not with_other)}" in caplog.records[-1].getMessage()
    assert [each["code"] for each in composed["failures"]] == ["RATE_LIMITED"]
    assert composed["outcome"] == "PARTIAL_FAILED"


@pytest.mark.parametrize(
    ("extra", "pulls", "expected"),
    [
        # X(#30)와 같은 변경으로 확인된 Y(#32)를 Z(#31)가 옮겼다. Z의 변경 내용을 받지 못해 비교하지
        # 못했다. #30은 한계와 함께 내고, Z만 남은 #31은 후보가 아니다.
        (
            [
                commit(301),
                commit(321, message=picked(301)),
                commit(311, message=picked(321), status=DetailStatus.NOT_REACHED),
            ],
            [
                pull(30, [301], merged=10),
                pull(31, [311], merged=15),
                pull(32, [321], merged=20),
            ],
            [30],
        ),
        # 닫힌 #11의 A는 C(#5)와 같은 변경으로 #5에 배정됐다. 재제출 #12의 B를 받지 못했다. #5는
        # 한계와 함께 내고, B만 남은 #12는 후보가 아니다.
        (
            [
                commit(51),
                commit(111, message=picked(51)),
                commit(121, status=DetailStatus.NOT_REACHED),
            ],
            [
                pull(5, [51], merged=4),
                pull(11, [111], created=1),
                pull(12, [121], created=5, merged=9, body="#11을 다시 올립니다"),
            ],
            [5],
        ),
        # 닫힌 #4의 e는 먼저 병합된 #5에도 있다. 재제출 #9의 b와 비교하지 못했다. #5에는 변경
        # 내용을 받지 못한 e뿐이라 후보가 아니고, #9는 소속을 확인했으므로 한계와 함께 낸다.
        (
            [commit(41, status=DetailStatus.NOT_REACHED), commit(91)],
            [
                pull(4, [41], created=1),
                pull(5, [41], merged=6, created=2),
                pull(9, [91], created=8, merged=12, body="#4 다시 올립니다"),
            ],
            [9],
        ),
    ],
    ids=["cherry-pick-chain", "resubmission-after-cherry-pick", "resubmission-shared"],
)
def test_stop_between_confirmed_pull_requests_keeps_them_with_limitation(
    extra: list[CommitRecord], pulls: list[PullRequest], expected: list[int]
) -> None:
    """비교하지 못한 쌍의 양쪽이 서로 다른 PR에 소속을 확인했으면 보류하지
    않고 양쪽에 같은 변경 미확정 한계를 적는다. 변경 내용을 받지 못한 커밋만 남은 PR은 빈 커밋인지
    몰라 후보가 아니다. 어느 쪽도 notProvided에 세지 않는다."""
    output = build_candidates(
        REQ, outcome(extra=extra, pulls=pulls, failures=[failure()])
    )

    assert identities(output) == [identity(PullRequestUnit(n)) for n in expected]
    for candidate in output.candidates:
        (limitation,) = candidate.grouping_limitations
        assert limitation.startswith(
            ("cherry-pick으로 옮긴 같은 변경일 수", "같은 작업을 다시 낸 것일 수")
        )
    assert output.not_provided == ()


@pytest.mark.parametrize("cut", [None, 62, 64], ids=["completed", "first", "second"])
def test_unconfirmed_cherry_pick_inside_commit_bundles_holds_both(
    cut: int | None,
) -> None:
    """같은 변경이면 두 커밋이 한 묶음이 되므로 비교하지 못했으면 어느 쪽 묶음도 내보내지 않는다."""

    def status(number: int) -> DetailStatus:
        return DetailStatus.NOT_REACHED if number == cut else FETCHED

    window = [
        commit(64, [63], message=picked(62), paths=("c.py",), status=status(64)),
        commit(63, [62], author=OTHER),
        commit(62, [1], paths=("c.py",), status=status(62)),
        ROOT,
    ]
    output = build_candidates(
        REQ,
        outcome(
            window=window,
            lookups=empty(62, 64),
            failures=[] if cut is None else [failure()],
        ),
    )

    if cut is None:
        assert identities(output) == [identity(CommitsUnit((sha(62), sha(64))))]
    else:
        assert output.candidates == ()
        assert result(output)["outcome"] == "FAILED"
    assert output.not_provided == ()


@pytest.mark.parametrize("stopped", [False, True], ids=["completed", "stopped"])
def test_cherry_picks_of_one_commit_are_held_together_through_it(
    stopped: bool,
) -> None:
    """65와 69가 다른 계정의 뿌리 커밋 1을 함께 cherry-pick했다. 멈추면 65의 연결 PR 조회와 모든
    변경 내용을 받지 못한다. 69의 묶음은 65와 같은 변경인지에 달렸으므로 내보내지 않는다."""
    status = DetailStatus.NOT_REACHED if stopped else FETCHED
    window = [
        commit(69, [67], message=picked(1), status=status),
        commit(67, [65], author=OTHER, paths=("z.py",)),
        commit(65, [1], message=picked(1), status=status),
        commit(
            1, author=OTHER, status=DetailStatus.NOT_REQUESTED if stopped else FETCHED
        ),
    ]
    lookups = [
        lookup(65, Lookup.NOT_REACHED if stopped else Lookup.EMPTY),
        lookup(69, Lookup.EMPTY),
    ]
    output = build_candidates(
        REQ,
        outcome(
            window=window, lookups=lookups, failures=[failure()] if stopped else []
        ),
    )

    expected = [] if stopped else [identity(CommitsUnit((sha(65), sha(69))))]
    assert identities(output) == expected
    assert output.not_provided == ()


@pytest.mark.parametrize(
    ("later_lookup", "stopped", "candidates", "expected"),
    [
        # 둘 다 연결 PR이 한 쪽보다 많아 보류했다. 같은 변경이면 1건, 아니면 2건을 센다.
        (Lookup.LIMITED, False, [], [("UNDETERMINED", 2)]),
        # 멈춰서 비교하지 못했으므로 몇 건인지 정할 수 없다. 둘 다 세지 않는다.
        (Lookup.LIMITED, True, [], []),
        # 한쪽만 보류했다. 같은 변경이든 아니든 보류한 변경은 1건이다.
        (Lookup.EMPTY, False, [75], [("UNDETERMINED", 1)]),
        # 75는 같은 변경이었다면 보류에 합쳐지므로 확인 중단으로 내보내지 않는다.
        (Lookup.EMPTY, True, [], [("UNDETERMINED", 1)]),
    ],
    ids=["both-held", "both-held-stopped", "one-held", "one-held-stopped"],
)
def test_uncompared_pair_of_held_changes_is_not_counted(
    later_lookup: Lookup,
    stopped: bool,
    candidates: list[int],
    expected: list[tuple[str, int]],
) -> None:
    """75는 72를 cherry-pick했고 diff가 다르다. 72는 연결 PR이 한 쪽보다 많아 소속을 확인하지
    못했다. 멈추면 75의 변경 내용을 받지 못해 두 커밋이 같은 변경인지 비교하지 못한다."""
    status = DetailStatus.NOT_REACHED if stopped else FETCHED
    window = [
        commit(75, [72], message=picked(72), content="다름", status=status),
        commit(72, [1]),
        ROOT,
    ]
    data = outcome(
        window=window,
        lookups=[lookup(72, Lookup.LIMITED), lookup(75, later_lookup)],
        failures=[failure()] if stopped else [],
    )

    output = build_candidates(REQ, data)

    assert identities(output) == [identity(CommitsUnit((sha(n),))) for n in candidates]
    assert counts(output) == expected
    if stopped:
        observations = group(data).observations
        assert observations[sha(75)].membership is Membership.STOPPED
        both = later_lookup is Lookup.LIMITED
        assert (observations[sha(72)].membership is Membership.STOPPED) is both


@pytest.mark.parametrize("case", ["one-already-held", "bundles"])
def test_uncompared_pairs_outside_confirmed_units_keep_the_hold_rules(
    caplog: pytest.LogCaptureFixture, case: str
) -> None:
    """보류하지 않는 예외(서로 다른 PR·병합)에 들지 않는 두 경우.

    one-already-held: 72는 연결 PR이 한 쪽보다 많아 이미 보류됐다(자료 범위 한계). 같은 변경이든
    아니든 그 보류는 한 번 세므로 그대로 두고, PR #31의 311은 같은 변경이었다면 72와 함께 보류되므로
    확인 중단으로 보류한다. bundles: 62와 64(62의 cherry-pick)는 다른 계정 커밋 63을 사이에 둔 서로
    다른 커밋 묶음이다. 같은 변경이면 한 묶음이 되므로 어느 쪽도 내지 않는다.
    """
    if case == "one-already-held":
        data = outcome(
            window=[commit(72, [1]), ROOT],
            extra=[commit(311, message=picked(72), modes=None)],
            pulls=[pull(31, [311], merged=20)],
            lookups=[lookup(72, Lookup.LIMITED)],
            failures=[failure()],
            mode_checks=[ModeCheck(sha(311), DetailStatus.NOT_REACHED)],
        )
        expected = [("UNDETERMINED", 1)]
    else:
        data = outcome(
            window=[
                commit(64, [63], message=picked(62), paths=("c.py",), modes=None),
                commit(63, [62], author=OTHER),
                commit(62, [1], paths=("c.py",)),
                ROOT,
            ],
            lookups=empty(62, 64),
            failures=[failure()],
            mode_checks=[ModeCheck(sha(64), DetailStatus.NOT_REACHED)],
        )
        expected = []
    caplog.set_level(logging.INFO, logger="app.candidates.build")

    output = build_candidates(REQ, data)

    assert output.candidates == ()
    assert counts(output) == expected
    observations = group(data).observations
    moved = sha(311) if case == "one-already-held" else sha(64)
    assert observations[moved].membership is Membership.STOPPED
    held_after_stop = 1 if case == "one-already-held" else 2
    assert f"heldAfterStop={held_after_stop}" in caplog.records[-1].getMessage()


@pytest.mark.parametrize(
    ("stop", "expected"),
    [
        (None, [("UNDETERMINED", 1)]),
        # 병합 21의 연결 PR 조회를 하지 못했다.
        ("lookup", []),
        # 기본 브랜치 목록을 다 받지 못해 창이 잘렸을 수 있다(PR 조회는 허용되지 않음).
        ("lists", []),
    ],
)
def test_change_in_two_side_by_side_merges_is_held_when_a_check_stopped(
    stop: str | None, expected: list[tuple[str, int]]
) -> None:
    """11을 서로 안쪽이 아닌 PR 없는 병합 20·21이 함께 들였다. 필요한 조회를 마쳤으면 단위
    미확정이고, 그 조회가 멈췄으면 확인 중단이라 세지 않는다."""
    window = [
        commit(30, [20, 21], author=OTHER),
        commit(21, [1, 11], author=OTHER),
        commit(20, [1, 11], author=OTHER),
        commit(11, [1]),
        ROOT,
    ]
    if stop == "lists":
        data = outcome(window=window, allowed=("COMMIT",), failures=[failure()])
        assert data.relations is not None
        data = replace(data, relations=replace(data.relations, stopped_during="LISTS"))
    else:
        merge_lookup = Lookup.NOT_REACHED if stop == "lookup" else Lookup.EMPTY
        data = outcome(
            window=window,
            lookups=[*empty(11, 20, 30), lookup(21, merge_lookup)],
            failures=[] if stop is None else [failure()],
        )

    output = build_candidates(REQ, data)

    assert output.candidates == ()
    assert counts(output) == expected
    membership = group(data).observations[sha(11)].membership
    assert membership is (Membership.CONFLICT if stop is None else Membership.STOPPED)
    if stop is not None:
        assert result(output)["outcome"] == "FAILED"


@pytest.mark.parametrize("stop", [None, "details", "list"])
def test_member_pull_request_is_not_counted_when_its_contribution_check_stopped(
    stop: str | None,
) -> None:
    """#2는 연동 계정이 연 재제출 PR이고 다른 계정 커밋 y만 담았다. 닫힌 #1의 본인 커밋 x와 같은
    변경이면 x가 #2의 본인 기여가 된다.

    y의 변경 내용을 받지 못했으면(details) x·y는 서로 다른 PR에 소속을
    확인한 비교 못 한 쌍이라 x를 보류하지 않는다. #1은 한계와 함께 후보가 된다. #1의 커밋 목록을
    받지 못했으면(list) 후보가 없다. 기여 근거가 없는 #2는 PR을 연 것이 기여가 아니므로 어느 경우든
    세지 않는다(2026-10-09 팀장 결정).
    """
    y_status = DetailStatus.NOT_REACHED if stop == "details" else FETCHED
    first_status = DetailStatus.NOT_REACHED if stop == "list" else FETCHED
    extra = [commit(21, author=OTHER, status=y_status)]
    if stop != "list":
        extra.append(commit(11))
    output = build_candidates(
        REQ,
        outcome(
            extra=extra,
            pulls=[
                pull(1, [11], created=1, status=first_status),
                pull(2, [21], created=5, merged=9, body="#1을 다시 올립니다"),
            ],
            failures=[] if stop is None else [failure()],
        ),
    )

    if stop is None:
        assert identities(output) == [identity(PullRequestUnit(2))]
    elif stop == "details":
        assert identities(output) == [identity(PullRequestUnit(1))]
        (limitation,) = output.candidates[0].grouping_limitations
        assert limitation.startswith("같은 작업을 다시 낸 것일 수 있다(PR #1·#2")
    else:
        assert output.candidates == ()
    assert output.not_provided == ()


@pytest.mark.parametrize("merged", [False, True], ids=["open", "merged"])
def test_member_pull_request_without_own_commit_is_not_counted_after_a_stop(
    merged: bool,
) -> None:
    """연동 계정이 연 PR #12에 다른 계정 커밋만 있다. PR을 연 것은 기여가 아니므로 세지 않는다
    (2026-10-09 팀장 결정).

    PR 밖 본인 커밋 60의 연결 PR 조회가 429로 멈췄어도, #12가 열렸든 병합됐든 건수는 없다. 본인
    PR #3은 후보이고 결과는 PARTIAL_FAILED다.
    """
    data = outcome(
        window=[commit(60, [1], paths=("z.py",)), ROOT],
        extra=[commit(31), commit(121, author=OTHER, paths=("b.py",))],
        pulls=[
            pull(3, [31], state="open"),
            pull(12, [121], merged=20 if merged else None, state="open"),
        ],
        lookups=[lookup(60, Lookup.NOT_REACHED)],
        failures=[failure(FailureCode.RATE_LIMITED)],
    )

    output = build_candidates(REQ, data)
    composed = result(output)

    assert identities(output) == [identity(PullRequestUnit(3))]
    assert counts(output) == []
    assert composed["outcome"] == "PARTIAL_FAILED"
    assert [each["code"] for each in composed["failures"]] == ["RATE_LIMITED"]


@pytest.mark.parametrize("cut", [False, True], ids=["completed", "stopped-in-lists"])
def test_stop_while_listing_holds_changes_at_the_window_edge(cut: bool) -> None:
    """목록 단계에서 멈추면 기본 브랜치 창이 잘렸을 수 있다.

    창 밖 부모를 둔 커밋의 묶음과 창 밖에 닿은 병합은 수집을 마쳤다면 달라질 수 있으므로 내보내지
    않고, 판단한 것이 아니므로 자료 범위 한계(단위 미확정)로도 세지 않는다.
    """
    status = DetailStatus.NOT_REACHED if cut else FETCHED
    window = [
        # 머리. 부모는 창 안의 병합이라 어느 묶음과도 이어지지 않는다.
        commit(50, [40], status=status),
        # PR 없는 병합. 들인 12의 부모 11은 창 밖이다.
        commit(40, [30, 12], author=OTHER),
        # 본선. 부모 5는 창 밖이다.
        commit(30, [5], status=status),
        commit(12, [11], status=status),
    ]
    data = outcome(
        window=window, allowed=("COMMIT",), failures=[failure()] if cut else []
    )
    if cut:
        assert data.relations is not None
        data = replace(data, relations=replace(data.relations, stopped_during="LISTS"))

    output = build_candidates(REQ, data)

    observations = group(data).observations
    if cut:
        # 50은 창 안에서 이웃이 정해져 PR 밖 커밋 묶음으로 갈 커밋이다. 다만 목록 단계에서 멈춰
        # 변경 내용을 받지 못했으므로 빈 커밋인지 몰라 후보로 내지 않는다.
        assert output.candidates == ()
        assert output.not_provided == ()
        assert observations[sha(50)].membership is Membership.OUTSIDE
        assert observations[sha(30)].membership is Membership.STOPPED
        assert observations[sha(12)].membership is Membership.STOPPED
        assert result(output)["outcome"] == "FAILED"
    else:
        assert identities(output) == [
            identity(CommitsUnit((sha(30),))),
            identity(CommitsUnit((sha(50),))),
        ]
        assert counts(output) == [("UNDETERMINED", 1)]
        assert observations[sha(12)].membership is Membership.RANGE_LIMITED


# PR 조회가 허용되지 않은 요청


def test_pull_requests_not_allowed_groups_without_holds() -> None:
    """커밋 묶음의 첫 작업 사실에는 커밋 수를 쓰지 않는다(2026-10-08 팀장 결정)."""
    window = [
        commit(20, [1, 12]),
        commit(12, [1], paths=("m.py",)),
        commit(72, [71]),
        commit(71, [1]),
        ROOT,
    ]
    output = build_candidates(REQ, outcome(window=window[2:], allowed=("COMMIT",)))

    assert identities(output) == [identity(CommitsUnit((sha(71), sha(72))))]
    candidate = output.candidates[0]
    assert output.not_provided == ()
    assert candidate.grouping_limitations == (
        "PR 조회가 허용되지 않아 PR 소속은 확인하지 않았다",
    )
    assert candidate.work_facts == (
        f"병합에 속하지 않은 본인 커밋 묶음(가장 최근 커밋 {sha(72)[:12]})",
    )

    merged = build_candidates(
        REQ, outcome(window=window[:2] + [ROOT], allowed=("COMMIT",))
    )
    assert identities(merged) == [identity(MergeUnit(sha(20)))]
    assert "PR 조회가 허용되지 않아" in merged.candidates[0].grouping_basis


# 같은 값의 후보


def test_candidates_with_equal_identity_are_merged_before_output(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """합친 근거는 단위 근거 먼저, 본인 커밋은 최근 것부터 다시 놓는다(2026-10-08
    팀장 결정 「수신자에게 나가는 숫자와 근거 순서」)."""
    monkeypatch.setattr(
        "app.candidates.build.work_identity", lambda *args: "wi1:" + "0" * 64
    )
    caplog.set_level(logging.INFO, logger="app.candidates.build")
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(31), commit(41, paths=("b.py",))],
            pulls=[pull(3, [31], merged=10), pull(4, [41], merged=20)],
        ),
    )

    (candidate,) = output.candidates
    assert candidate.work_facts == (
        "PR #3, 상태 병합됨",
        PULL_OTHERS["ABSENT"],
        "PR #4, 상태 병합됨",
    )
    assert [item.source_revision for item in candidate.evidence] == [
        sha(90003),
        sha(90004),
        sha(41),
        sha(31),
    ]
    (record,) = caplog.records
    assert record.levelno == logging.WARNING
    assert "sameIdentityMerged=1" in record.getMessage()


# 근거


def test_candidate_text_holds_structure_only() -> None:
    """구조 값만 쓰고 센 숫자(커밋 수·파일·줄 수 합계)는 쓰지 않는다(2026-10-08 팀장 결정 「수신자에게
    나가는 숫자와 근거 순서」). 커밋별 파일·줄 수는 근거의 관측 사실에 남는다."""
    marker = "XYZ"
    extra = [
        commit(31, message=f"메시지{marker} #1", paths=(f"src/secret{marker}.py",)),
        commit(32, message=f"둘째{marker}", paths=(f"src/secret{marker}.py",)),
    ]
    output = build_candidates(
        REQ,
        outcome(
            extra=extra,
            pulls=[
                pull(
                    3, [31, 32], merged=10, title=f"제목{marker}", body=f"본문{marker}"
                )
            ],
        ),
    )

    text = json.dumps(result(output)["candidates"], ensure_ascii=False)
    assert marker not in text
    assert "secret-branch" not in text
    candidate = output.candidates[0]
    assert candidate.work_facts == ("PR #3, 상태 병합됨", PULL_OTHERS["ABSENT"])
    assert (
        candidate.subject_contribution
        == "연동 GitHub 계정이 작성자로 기록된 커밋(연동 계정이 연 PR)"
    )
    pull_evidence, *own = candidate.evidence
    assert pull_evidence.contribution_scope == (
        "연동 계정이 연 PR(본인 기여는 이 PR의 본인 커밋에 한정)"
    )
    assert "PR 커밋 2건" in pull_evidence.represented_facts
    for item in own:
        assert "변경 파일 1개, 추가 1줄·삭제 1줄" in item.represented_facts
    assert candidate.draft.status == "NOT_GENERATED"
    assert candidate.reflection.status == "NOT_GENERATED"


def test_own_evidence_never_says_not_linked_account() -> None:
    """귀속 범위는 '작성자로 기록된'으로 쓰고 작업 사실에 파일·줄 수 합계를 쓰지 않는다(2026-10-08
    팀장 결정 「본인 기여의 뜻」·「수신자에게 나가는 숫자와 근거 순서」)."""
    extra = [
        commit(31, status=DetailStatus.BEYOND_RANGE),
        commit(32, status=DetailStatus.NOT_REACHED),
        commit(33),
    ]
    # 32는 수집이 멈춰 변경 내용을 받지 못했다. 멈춘 결과라야 맞는 입력이다.
    output = build_candidates(
        REQ,
        outcome(
            extra=extra,
            pulls=[pull(3, [31, 32, 33], merged=10, author=OTHER)],
            failures=[failure()],
        ),
    )

    candidate = output.candidates[0]
    pull_evidence, *own = candidate.evidence
    assert pull_evidence.contribution_scope == (
        "다른 계정이 연 PR(본인 기여는 이 PR의 본인 커밋에 한정)"
    )
    assert {item.contribution_scope for item in own} == {
        "연동 계정이 작성자로 기록된 커밋"
    }
    for item in candidate.evidence:
        assert not any("아니라" in limit for limit in item.coverage_limits)
    # 작업 사실에는 변경 파일·줄 수 합계를 쓰지 않는다(2026-10-08 팀장 결정).
    assert not any("변경 파일" in fact for fact in candidate.work_facts)
    assert "다른 계정이 연 PR에 담긴 본인 커밋" in candidate.subject_contribution


def test_evidence_keeps_newest_twenty_commits_and_says_so() -> None:
    """한계 문장은 센 본인 커밋 수 대신 정해 둔 상한 값을 쓴다(2026-10-08 팀장 결정)."""
    numbers = list(range(200, 225))
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(n, paths=(f"f{n}.py",)) for n in numbers],
            pulls=[pull(3, numbers, merged=300)],
        ),
    )

    unit, *own = output.candidates[0].evidence
    assert len(own) == EVIDENCE_COMMIT_CAP
    assert [item.source_revision for item in own] == [
        sha(n) for n in numbers[::-1][:20]
    ]
    assert (
        unit.coverage_limits[-1] == "본인 커밋이 20건을 넘어 최근 20건만 근거로 담았다"
    )
    assert not any("25" in limit for limit in unit.coverage_limits)


def test_lookup_only_pull_request_carries_its_coverage_limit() -> None:
    limit = "최근 PR 목록 밖의 PR이라 이 PR에 담긴 커밋 전체는 확인하지 않았다"
    output = build_candidates(
        REQ,
        outcome(
            window=[commit(60, [1]), ROOT],
            lookup_pulls=[pull(2, merged=5, status=DetailStatus.BEYOND_RANGE)],
            lookups=[lookup(60, Lookup.FOUND, 2)],
        ),
    )

    assert identities(output) == [identity(PullRequestUnit(2))]
    # 상세 조회 개수와 무관하므로 그 범위 밖이라는 문구를 쓰지 않고 이유를 한 번만 적는다.
    assert output.candidates[0].evidence[0].coverage_limits == (limit,)


def test_partially_compared_pull_request_list_states_what_was_read() -> None:
    # 250건 밖을 비교 API로 일부 더 읽은 PR: 사실(PR 커밋 300건)과 한계가 서로 어긋나지 않는다.
    reason = (
        "PR 커밋 250건 밖의 커밋을 받는 응답이 크기 상한을 넘어 그 커밋을 끝까지 확인하지 "
        "못했다"
    )
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(100)],
            pulls=[
                pull(9, range(100, 400), merged=10, complete=False, limits=(reason,))
            ],
        ),
    )

    (candidate,) = output.candidates
    unit = candidate.evidence[0]
    assert "PR 커밋 300건" in unit.represented_facts
    assert (
        "PR 커밋이 많아 300건까지만 확인했고 나머지는 확인하지 못했다"
        in unit.coverage_limits
    )
    assert not any("250건까지만" in limit for limit in unit.coverage_limits)
    assert not any("API" in limit for limit in unit.coverage_limits)
    assert reason in unit.coverage_limits


# 입구와 로그


def test_refused_collection_returns_failures_only() -> None:
    refused = CollectionOutcome(
        allowed_resource_types=frozenset(),
        selection_reference=REQUEST.selection_reference,
        failures=(
            CollectionFailure(
                FailureCode.NO_ALLOWED_RESOURCE_TYPE, "합성: 허용 종류 없음"
            ),
        ),
    )

    output = build_candidates(REQ, refused)

    assert output.candidates == () and output.not_provided == ()
    assert [f.code for f in output.failures] == ["NO_ALLOWED_RESOURCE_TYPE"]


def test_missing_relations_is_a_defect() -> None:
    with pytest.raises(ValueError):
        build_candidates(REQ, replace(outcome(), relations=None))


def test_log_line_has_counts_only(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="app.candidates.build")
    build_candidates(
        REQ,
        outcome(
            window=[commit(60, [1], paths=("secret/path.py",)), ROOT],
            extra=[commit(31, message="비밀 메시지")],
            pulls=[pull(3, [31], state="open", title="비밀 제목")],
            lookups=[lookup(60, Lookup.FOUND, 3)],
        ),
    )

    (record,) = caplog.records
    message = record.getMessage()
    assert record.levelno == logging.INFO
    assert message.startswith("후보 판정 종료: requestId=")
    assert "candidates=1" in message and "undetermined=1" in message
    counted = message.replace(REQ.request_id, "").replace(REQ.attempt_id, "")
    assert re.search(r"[0-9a-f]{7,}", counted) is None
    assert "secret" not in message and "비밀" not in message


# 수집 결과끼리 맞지 않는 입력은 결함으로 드러낸다


def _merge_with_own_commit(lookups: Iterable[AssociatedPulls]) -> CollectionOutcome:
    return outcome(window=[commit(20, [1, 11]), commit(11, [1]), ROOT], lookups=lookups)


def _stopped_without_failure() -> CollectionOutcome:
    data = outcome(window=[commit(60, [1]), ROOT], lookups=empty(60))
    assert data.relations is not None
    return replace(data, relations=replace(data.relations, stopped_during="DETAILS"))


@pytest.mark.parametrize(
    "data",
    [
        # 수집을 마쳤는데 PR 밖 본인 커밋의 연결 PR 조회 기록이 없다.
        outcome(window=[commit(60, [1]), ROOT]),
        # 수집을 마쳤는데 PR 밖 본인 커밋을 들인 병합의 연결 PR 조회 기록이 없다.
        _merge_with_own_commit(empty(11)),
        # 연결 PR 조회가 알려지지 않은 PR을 돌려줬다.
        outcome(window=[commit(60, [1]), ROOT], lookups=[lookup(60, Lookup.FOUND, 99)]),
        outcome(window=[commit(60, [1]), ROOT], lookups=[lookup(60, Lookup.FOUND)]),
        # 병합 커밋의 연결 PR 조회도 같다.
        _merge_with_own_commit([*empty(11), lookup(20, Lookup.FOUND, 99)]),
        _merge_with_own_commit([*empty(11), lookup(20, Lookup.FOUND)]),
        # 수집을 마쳤다는 결과에 멈춘 단계나 닿지 못한 조회가 있다.
        _stopped_without_failure(),
        outcome(
            window=[commit(60, [1]), ROOT], lookups=[lookup(60, Lookup.NOT_REACHED)]
        ),
        outcome(
            window=[commit(60, [1], status=DetailStatus.NOT_REACHED), ROOT],
            lookups=empty(60),
        ),
        outcome(pulls=[pull(4, status=DetailStatus.NOT_REACHED)]),
        # PR 커밋 목록으로만 본 커밋이 받은 목록에 없다.
        outcome(extra=[commit(61)]),
    ],
    ids=[
        "commit-lookup",
        "merge-lookup",
        "unknown-pr",
        "found-empty",
        "merge-unknown-pr",
        "merge-found-empty",
        "completed-but-stopped",
        "completed-lookup-unreached",
        "completed-detail-unreached",
        "completed-list-unreached",
        "extra",
    ],
)
def test_inconsistent_collection_is_a_defect_not_insufficient_evidence(
    data: CollectionOutcome,
) -> None:
    with pytest.raises(ValueError):
        build_candidates(REQ, data)


def test_list_of_unknown_pull_request_is_a_defect() -> None:
    data = outcome()
    assert data.relations is not None
    stray = PullRequestCommits(9, sha(90009), FETCHED, (), complete=True)
    with pytest.raises(ValueError):
        build_candidates(
            REQ,
            replace(
                data, relations=replace(data.relations, pull_request_commits=(stray,))
            ),
        )


def test_refused_collection_without_failure_is_a_defect() -> None:
    refused = CollectionOutcome(
        allowed_resource_types=frozenset({"COMMIT"}),
        selection_reference=REQUEST.selection_reference,
    )
    with pytest.raises(ValueError):
        build_candidates(REQ, refused)


def test_merge_without_own_commit_needs_no_lookup() -> None:
    """수집은 PR 밖 본인 커밋을 들인 병합만 조회한다. 다른 계정 커밋만 들인 병합은 결함이 아니다."""
    window = [
        commit(20, [12, 11]),
        commit(12, [1], paths=("m.py",)),
        commit(11, [1], author=OTHER),
        ROOT,
    ]
    output = build_candidates(REQ, outcome(window=window, lookups=empty(12)))

    assert identities(output) == [identity(CommitsUnit((sha(12),)))]
    assert output.not_provided == ()


# 정확성: 창이 잘린 머리, 안쪽 병합 수, 커밋 수


def test_window_cut_without_single_head_holds_without_counting() -> None:
    """목록 단계에서 멈춰 창이 잘렸으면 머리가 하나가 아닌 것도 다 받았을 때 달라질 수 있다."""
    window = [
        commit(20, [1, 11]),
        commit(19, [1], paths=("z.py",)),
        commit(11, [1]),
        ROOT,
    ]
    data = outcome(window=window, lookups=empty(11, 19, 20), failures=[failure()])
    assert data.relations is not None
    data = replace(data, relations=replace(data.relations, stopped_during="LISTS"))

    output = build_candidates(REQ, data)

    assert identities(output) == [identity(CommitsUnit((sha(19),)))]
    assert output.not_provided == ()
    assert group(data).observations[sha(11)].membership is Membership.STOPPED


def test_inner_merge_count_uses_the_final_assignment() -> None:
    """33은 안쪽 병합 35에 들었지만 같은 변경(31의 cherry-pick)을 따라 PR #5로 갔다."""
    window = [
        commit(40, [1, 35]),
        commit(35, [32, 33]),
        commit(33, [1], message=picked(31)),
        commit(32, [1], paths=("o.py",)),
        ROOT,
    ]
    output = build_candidates(
        REQ,
        outcome(
            window=window,
            extra=[commit(31)],
            pulls=[pull(5, [31], merged=10)],
            lookups=empty(32, 33, 35, 40),
        ),
    )

    assert identities(output) == [
        identity(PullRequestUnit(5)),
        identity(MergeUnit(sha(40))),
    ]
    assert "안쪽 병합" not in output.candidates[1].grouping_basis
    assert "하나로 셌다" in output.candidates[0].grouping_basis


def test_same_change_commits_in_one_pull_request_keep_both_commits_as_evidence() -> (
    None
):
    """PR 안에서 같은 변경으로 합친 본인 커밋 둘은 근거에 둘 다 남는다.

    제목·작업 사실·나의 기여에는 커밋 수를 쓰지 않는다(2026-10-08 팀장 결정 「수신자에게 나가는
    숫자와 근거 순서」). 그래서 수가 서로 맞는지 대신 근거에 두 커밋이 모두 있는지 본다.
    """
    output = build_candidates(
        REQ,
        outcome(
            extra=[commit(301), commit(302, message=picked(301))],
            pulls=[pull(30, [301, 302], merged=10)],
        ),
    )

    (candidate,) = output.candidates
    assert candidate.work_facts == ("PR #30, 상태 병합됨", PULL_OTHERS["ABSENT"])
    assert candidate.subject_contribution == (
        "연동 GitHub 계정이 작성자로 기록된 커밋(연동 계정이 연 PR)"
    )
    assert [item.source_revision for item in candidate.evidence[1:]] == [
        sha(302),
        sha(301),
    ]


# squash로 합친 PR(2026-10-08 팀장 결정 「본인 기여의 뜻」: GitHub가 squash로 새로 만든 커밋의
# 작성자는 그 안 변경의 명의로 보지 않는다)


def test_squash_merged_integration_pull_request_is_not_a_second_candidate() -> None:
    """C8을 squash로 합쳤다. 기본 브랜치에는 squash 커밋 130만 있고 #12의 목록에는 원래 커밋이 있다.

    원래 커밋은 먼저 병합된 #10·#11에 간다. squash 커밋은 #12에 배정되지만 원래 커밋 목록을 끝까지
    받았으므로 원래 커밋의 작성자로 판단한다(2026-10-08 팀장 결정 「본인 기여의 뜻」). 그래서 #12는
    후보가 아니다. 연동 계정이 연 PR이어도 PR을 연 것은 기여가 아니라 세지 않는다(2026-10-09 팀장
    결정).
    """
    data = outcome(
        window=[commit(130, [1], paths=("login.py", "join.py")), ROOT],
        extra=[
            commit(110, [1], paths=("login.py",)),
            commit(111, [1, 110]),
            commit(120, [1], paths=("join.py",)),
            commit(121, [111, 120]),
        ],
        pulls=[
            pull(10, [110], merged=3, merge_commit=111, created=2),
            pull(11, [120], merged=5, merge_commit=121, created=4),
            pull(12, [110, 111, 120, 121], merged=7, merge_commit=130, created=6),
        ],
    )

    output = build_candidates(REQ, data)

    assert identities(output) == [
        identity(PullRequestUnit(10)),
        identity(PullRequestUnit(11)),
    ]
    assert counts(output) == []
    squash = group(data).observations[sha(130)]
    assert squash.pull_requests == (12,)
    assert squash.pull_request_sources == {
        12: frozenset({MembershipSource.MERGE_COMMIT_SHA})
    }


@pytest.mark.parametrize("on_default_branch", [True, False])
def test_squash_commit_of_cherry_picked_pull_request_is_not_contribution(
    on_default_branch: bool,
) -> None:
    """C20을 squash로 합쳤다. 옮긴 커밋 41은 원본 31과 같은 변경이라 #30에 간다.

    squash 커밋 50이 기본 브랜치에 있으면 #31에 배정되지만, 원래 커밋 목록을 끝까지 받았으므로
    squash 커밋의 작성자를 명의로 보지 않는다(2026-10-08 팀장 결정 「본인 기여의 뜻」). #31은 후보가
    아니고, 연동 계정이 연 PR이어도 세지 않는다(2026-10-09 팀장 결정). release 같은 다른 브랜치에
    있으면 관측하지 않아 #31에는 배정된 변경이 없다. 어느 쪽이든 Catch는 하나이고 건수는 없다.
    """
    window = [commit(35, [1, 31]), commit(31, [1]), ROOT]
    if on_default_branch:
        window.insert(0, commit(50, [35], message="옮김(#31)"))
    data = outcome(
        window=window,
        extra=[commit(41, [1], message=picked(31))],
        pulls=[
            pull(30, [31], merged=20, merge_commit=35, created=10),
            pull(31, [41], merged=30, merge_commit=50, created=21),
        ],
    )

    output = build_candidates(REQ, data)

    assert identities(output) == [identity(PullRequestUnit(30))]
    assert counts(output) == []


@pytest.mark.parametrize("opener", [MEMBER, OTHER], ids=["member-pr", "other-pr"])
@pytest.mark.parametrize("list_state", ["incomplete", "oversized"])
def test_own_squash_commit_without_the_whole_list_is_insufficient_evidence(
    opener: GitHubAccount, list_state: str
) -> None:
    """2026-10-08 팀장 결정 「본인 기여의 뜻」: 원래 커밋 목록을 다 받지 못했으면 본인 squash 커밋의
    명의를 확인하지 못한 것이다. 후보로 내지 않고 PR 하나에 근거 부족 1을 센다(PR을 연 계정과
    무관하다). 조회는 정한 범위대로 마쳤으므로 실패가 아니다."""
    if list_state == "incomplete":
        listed = pull(
            5, [41], merged=20, merge_commit=50, author=opener, complete=False
        )
        extra = [commit(41, author=OTHER)]
    else:
        listed = pull(
            5,
            merged=20,
            merge_commit=50,
            author=opener,
            status=DetailStatus.OVERSIZED,
        )
        extra = []
    data = outcome(
        window=[commit(50, [1], message="합침(#5)"), ROOT], extra=extra, pulls=[listed]
    )

    output = build_candidates(REQ, data)
    composed = result(output)

    assert output.candidates == ()
    assert counts(output) == [("INSUFFICIENT_EVIDENCE", 1)]
    assert composed["failures"] == []
    assert composed["outcome"] == "EMPTY"
    assert group(data).observations[sha(50)].pull_requests == (5,)


def test_own_squash_commit_of_unreached_list_is_not_counted() -> None:
    """목록을 수집이 멈춰 받지 못했으면 확인 중단이다. 세지 않고 실패를 넘긴다."""
    output = build_candidates(
        REQ,
        outcome(
            window=[commit(50, [1]), ROOT],
            pulls=[
                pull(5, merged=20, merge_commit=50, status=DetailStatus.NOT_REACHED)
            ],
            failures=[failure()],
        ),
    )

    composed = result(output)
    assert output.candidates == ()
    assert output.not_provided == ()
    assert composed["outcome"] == "FAILED"


def test_rebase_commit_found_by_lookup_stays_contribution_without_the_whole_list() -> (
    None
):
    """rebase로 합친 PR #5의 목록이 크기 상한을 넘었다. merge_commit_sha가 가리키는 마지막 커밋 51은
    squash 커밋과 구분할 수 없어 기여 근거에서 빼지만, 연결 PR 조회로 배정된 50은 그대로 근거다."""
    data = outcome(
        window=[commit(51, [50], paths=("b.py",)), commit(50, [1]), ROOT],
        pulls=[
            pull(5, merged=20, merge_commit=51, status=DetailStatus.OVERSIZED),
        ],
        lookups=[lookup(50, Lookup.FOUND, 5)],
    )

    output = build_candidates(REQ, data)

    assert identities(output) == [identity(PullRequestUnit(5))]
    assert output.not_provided == ()
    assert [item.source_revision for item in output.candidates[0].evidence[1:]] == [
        sha(50)
    ]
    assert group(data).units[0].squash_unconfirmed


def test_merge_commit_only_changes_are_not_counted() -> None:
    """충돌 해결처럼 병합 커밋에만 생긴 변경은 어느 단위의 변경도 아니다(병합 커밋은 경계)."""
    window = [commit(20, [1, 11]), commit(11, [1], author=OTHER), ROOT]
    output = build_candidates(REQ, outcome(window=window, lookups=empty(20)))

    assert output.candidates == () and output.not_provided == ()


# 결정성과 회원용 문장


def test_split_does_not_depend_on_input_order() -> None:
    records = {
        21: commit(21, message="로그인 오류 #5", paths=("login.py",)),
        22: commit(22, message="로그인 오류 #5", paths=("login.py",)),
        23: commit(23, message="설치 안내 #6", paths=("docs.md",)),
    }
    expected = [
        identity(PullRequestUnit(20), (Part(sha(21)), Part(sha(22)))),
        identity(PullRequestUnit(20), (Part(sha(23)),)),
    ]
    for order in itertools.permutations(records):
        output = build_candidates(
            REQ,
            outcome(
                extra=[records[number] for number in order],
                pulls=[pull(20, order, merged=30)],
                issues=[issue(6), issue(5)] if order[0] == 23 else [issue(5), issue(6)],
                allowed=("COMMIT", "PULL_REQUEST", "ISSUE"),
            ),
        )
        assert identities(output) == expected


def test_titles_are_left_empty_and_texts_avoid_counts_and_query_jargon() -> None:
    """#118은 제목을 만들지 않고, 결과 조합의 임시 대체값(작업 사실 첫 항목)이 센 숫자 없는 단위
    이름이다. 문장에는 센 숫자·'작성한'·조회 방식의 말이 없다(2026-10-08 팀장 결정 「Catch 제목」·
    「수신자에게 나가는 숫자와 근거 순서」·「본인 기여의 뜻」, 결정 문서 「담당과 순서」 ③)."""
    merge_window = [
        commit(20, [1, 12]),
        commit(12, [11]),
        commit(11, [1], paths=("b.py",)),
        ROOT,
    ]
    outputs = [
        _split_case(),
        build_candidates(REQ, outcome(window=_chain(), lookups=empty(11, 12, 13, 14))),
        build_candidates(
            REQ, outcome(window=[commit(60, [1]), ROOT], lookups=empty(60))
        ),
        build_candidates(REQ, outcome(window=merge_window, lookups=empty(11, 12, 20))),
        build_candidates(REQ, outcome(window=_chain(), allowed=("COMMIT",))),
        build_candidates(
            REQ,
            outcome(
                extra=[commit(301), commit(311, message=picked(301))],
                pulls=[pull(30, [301], merged=10), pull(31, [311], merged=20)],
            ),
        ),
    ]

    single = outputs[2].candidates[0]
    assert single.title is None
    assert single.work_facts == (f"PR·병합에 속하지 않은 본인 커밋 {sha(60)[:12]}",)
    assert result(outputs[2])["candidates"][0]["title"] == single.work_facts[0]
    for output in outputs:
        assert output.candidates
        assert_member_text(output)


# 후보 문장: 다른 계정 커밋 섞임(2026-10-08 팀장 결정 「수신자에게 나가는 숫자와 근거 순서」)


@pytest.mark.parametrize(
    ("authors", "complete", "expected"),
    [
        ((MEMBER, OTHER), True, "PRESENT"),
        ((MEMBER, MEMBER), True, "ABSENT"),
        ((MEMBER, None), True, "PRESENT"),
        ((MEMBER, MEMBER), False, "UNKNOWN"),
        ((MEMBER, OTHER), False, "PRESENT"),
    ],
    ids=["other-account", "all-own", "no-account", "partial-all-own", "partial-other"],
)
def test_other_authors_follow_the_whole_pull_request_list(
    authors: tuple[GitHubAccount | None, GitHubAccount | None],
    complete: bool,
    expected: str,
) -> None:
    """PR 커밋 목록 전체를 본다. 작성자 계정이 없는 커밋은 '기록되지 않은' 쪽이다. 덜 받은 목록
    (250건 경로에서 다 읽지 못함)은 받은 커밋에 다른 계정 커밋이 있을 때만 있다고 쓰고, 없다고는 쓰지
    않는다."""
    extra = [
        commit(31, author=authors[0]),
        commit(32, author=authors[1], paths=("b.py",)),
    ]
    output = build_candidates(
        REQ,
        outcome(extra=extra, pulls=[pull(3, [31, 32], merged=10, complete=complete)]),
    )

    (candidate,) = output.candidates
    assert candidate.work_facts == ("PR #3, 상태 병합됨", PULL_OTHERS[expected])
    assert result(output)["candidates"][0]["title"] == "PR #3, 상태 병합됨"


@pytest.mark.parametrize(
    ("merge_author", "expected"),
    [(MEMBER, "ABSENT"), (OTHER, "PRESENT")],
    ids=["own-merge-commit", "other-merge-commit"],
)
def test_merge_commit_in_the_pull_request_list_counts_for_other_authors(
    merge_author: GitHubAccount, expected: str
) -> None:
    """PR 커밋 목록에 든 병합 커밋(작업 브랜치에 기본 브랜치를 받아온 커밋)도 범위에 든다."""
    extra = [commit(31), commit(32, [31, 1], author=merge_author)]
    output = build_candidates(
        REQ, outcome(extra=extra, pulls=[pull(3, [31, 32], merged=10)])
    )

    (candidate,) = output.candidates
    assert candidate.work_facts == ("PR #3, 상태 병합됨", PULL_OTHERS[expected])


@pytest.mark.parametrize("kind", ["oversized", "revision-mismatch", "lookup-only"])
def test_other_authors_are_unknown_without_the_pull_request_list(kind: str) -> None:
    """커밋 목록을 받지 못했거나(크기 상한·판본 불일치) 연결 PR 조회로만 안 PR은 섞였는지 알 수
    없다."""
    window = [commit(60, [1]), ROOT]
    lookups = [lookup(60, Lookup.FOUND, 3)]
    if kind == "lookup-only":
        data = outcome(
            window=window,
            lookup_pulls=[pull(3, merged=5, status=DetailStatus.BEYOND_RANGE)],
            lookups=lookups,
        )
        state = "병합됨"
    else:
        status = (
            DetailStatus.OVERSIZED
            if kind == "oversized"
            else DetailStatus.REVISION_MISMATCH
        )
        data = outcome(
            window=window,
            pulls=[pull(3, state="open", status=status)],
            lookups=lookups,
        )
        state = "열림"

    output = build_candidates(REQ, data)

    (candidate,) = output.candidates
    assert candidate.work_facts == (f"PR #3, 상태 {state}", PULL_OTHERS["UNKNOWN"])
    assert result(output)["outcome"] == "SUCCEEDED"


@pytest.mark.parametrize(
    ("middle", "merger", "expected"),
    [
        (MEMBER, MEMBER, "ABSENT"),
        (OTHER, MEMBER, "PRESENT"),
        (None, MEMBER, "PRESENT"),
        (MEMBER, OTHER, "ABSENT"),
    ],
    ids=["all-own", "other-account", "no-account", "merge-commit-by-other"],
)
def test_merge_other_authors_look_at_every_brought_commit(
    middle: GitHubAccount | None, merger: GitHubAccount, expected: str
) -> None:
    """test_merge_without_pull_request_is_a_unit의 변형. PR 없는 병합은 그 병합이 들인 커밋 전체를
    보고, 병합 커밋 자신의 작성자는 보지 않는다."""
    window = [
        commit(20, [1, 12], author=merger),
        commit(12, [11], author=middle),
        commit(11, [1], paths=("b.py",)),
        ROOT,
    ]
    looked_up = [11, 20, *([12] if middle == MEMBER else [])]
    output = build_candidates(REQ, outcome(window=window, lookups=empty(*looked_up)))

    assert identities(output) == [identity(MergeUnit(sha(20)))]
    (candidate,) = output.candidates
    assert candidate.work_facts == (
        f"PR 없이 병합한 병합 커밋 {sha(20)[:12]}",
        MERGE_OTHERS[expected],
    )


def test_commit_bundles_have_no_other_authors_sentence() -> None:
    """커밋 묶음은 본인 커밋만 묶으므로 섞임 문장을 두지 않는다."""
    data = outcome(window=_chain(), lookups=empty(11, 12, 13, 14))

    output = build_candidates(REQ, data)

    for candidate in output.candidates:
        assert len(candidate.work_facts) == 1
        assert "기록되지 않은" not in candidate.work_facts[0]
    assert {unit.other_authors for unit in group(data).units} == {None}


# 후보 문장: 기여 문맥


@pytest.mark.parametrize("mixed", [False, True], ids=["elsewhere-only", "mixed"])
def test_contribution_assigned_from_another_pull_request_says_so_without_counts(
    mixed: bool,
) -> None:
    """다른 계정이 작성자로 기록된 301을 회원이 cherry-pick한 311(PR #31)은 같은 변경으로 먼저 병합된
    PR #30에 간다. #30 목록 안에 본인 커밋이 없으면 '이 PR의 본인 커밋'으로 읽히지 않게 쓰고, 섞였으면
    둘을 함께 적는다. 수는 쓰지 않는다(2026-10-08 팀장 결정)."""
    extra = [commit(301, author=OTHER), commit(311, message=picked(301))]
    listed = [301]
    if mixed:
        extra.append(commit(302, paths=("b.py",)))
        listed.append(302)
    output = build_candidates(
        REQ,
        outcome(
            extra=extra,
            pulls=[
                pull(30, listed, merged=10, author=OTHER),
                pull(31, [311], merged=20),
            ],
        ),
    )

    (candidate,) = output.candidates
    assert candidate.work_identity == identity(PullRequestUnit(30))
    where = (
        "이 PR의 본인 커밋과 같은 변경으로 배정한 다른 곳의 본인 커밋"
        if mixed
        else "같은 변경으로 이 PR에 배정한 다른 곳의 본인 커밋"
    )
    assert candidate.subject_contribution == (
        f"연동 GitHub 계정이 작성자로 기록된 커밋({where})"
    )
    pull_evidence, *own = candidate.evidence
    assert pull_evidence.contribution_scope == (
        f"다른 계정이 연 PR(본인 기여는 {where}에 한정)"
    )
    scopes = {item.source_revision: item.contribution_scope for item in own}
    assert scopes[sha(311)] == (
        "연동 계정이 작성자로 기록된 커밋(같은 변경으로 확인해 이 작업에 배정)"
    )
    if mixed:
        assert scopes[sha(302)] == "연동 계정이 작성자로 기록된 커밋"
    assert candidate.work_facts == ("PR #30, 상태 병합됨", PULL_OTHERS["PRESENT"])
    assert output.not_provided == ()
    assert_member_text(output)


# 후보 문장: 커밋 묶음 설명은 쓴 근거만

_PARENT_LINK = (
    "본인 커밋 가운데 부모가 하나뿐이고 그 부모와 변경 파일이 겹치는 것을 이어 한 묶음으로 "
    "두었다."
)
_SAME_CHANGE_LINK = (
    "cherry-pick 표시가 있고 공백을 빼고 비교한 변경 내용이 같은 커밋을 같은 변경으로 보고 부모 "
    "관계와 관계없이 한 묶음에 두었다."
)
_NOT_LOOKED_AT = "작성 시각 차이와 메시지 비슷함은 보지 않았다."


@pytest.mark.parametrize(
    ("kind", "bundle", "links"),
    [
        ("cherry-pick-apart", (62, 64), {"same"}),
        ("adjacent-and-cherry-pick", (61, 62, 64), {"parent", "same"}),
        ("parent-only", (11, 12), {"parent"}),
    ],
)
def test_bundle_basis_names_only_the_links_it_used(
    kind: str, bundle: tuple[int, ...], links: set[str]
) -> None:
    """작성 시각과 메시지 비슷함은 보지 않았다는 문장 하나와, 실제로 이은 근거의 문장만 쓴다."""
    window: list[CommitRecord]
    if kind == "cherry-pick-apart":
        # 64는 62의 cherry-pick이고 사이에 다른 계정 커밋 63이 있어 부모로 잇지 않는다.
        window = [
            commit(64, [63], message=picked(62), paths=("c.py",)),
            commit(63, [62], author=OTHER),
            commit(62, [1], paths=("c.py",)),
            ROOT,
        ]
    elif kind == "adjacent-and-cherry-pick":
        # 62는 부모 61과 a.py가 겹친다. 64는 61의 cherry-pick이고 사이에 다른 계정 커밋 63이 있다.
        window = [
            commit(64, [63], message=picked(61), paths=("a.py",)),
            commit(63, [62], author=OTHER, paths=("z.py",)),
            commit(62, [61], paths=("a.py",), content=" 둘째"),
            commit(61, [1], paths=("a.py",)),
            ROOT,
        ]
    else:
        window = _chain()
    # 본인 커밋은 모두 연결 PR 조회가 빈 목록이다.
    lookups = [
        AssociatedPulls(record.sha, Lookup.EMPTY)
        for record in window
        if record.author == MEMBER
    ]
    output = build_candidates(REQ, outcome(window=window, lookups=lookups))

    candidate = next(
        each
        for each in output.candidates
        if each.work_identity
        == identity(CommitsUnit(tuple(sha(number) for number in bundle)))
    )
    basis = candidate.grouping_basis
    assert (_PARENT_LINK in basis) == ("parent" in links)
    assert (_SAME_CHANGE_LINK in basis) == ("same" in links)
    assert basis.count(_NOT_LOOKED_AT) == 1
    assert "커밋 메시지는 보지 않았다" not in basis
    newest = max(bundle)
    assert candidate.work_facts == (
        f"PR·병합에 속하지 않은 본인 커밋 묶음(가장 최근 커밋 {sha(newest)[:12]})",
    )


# 근거 순서와 같은 값 합치기


def test_evidence_order_is_unit_first_then_own_commits_newest_first() -> None:
    """2026-10-08 팀장 결정 「수신자에게 나가는 숫자와 근거 순서」: PR·병합 단위는 단위 근거 먼저,
    그다음 본인 커밋을 최근 것부터 놓는다. 작성 시각이 같으면 SHA순(newest_first와 같은 키)이다.
    커밋 묶음은 본인 커밋을 최근 것부터 놓는다."""
    timed = {31: 50, 33: 50, 34: 70, 35: 10}
    records = [
        replace(commit(number, paths=(f"f{number}.py",)), authored_at=at(minute))
        for number, minute in timed.items()
    ]
    output = build_candidates(
        REQ, outcome(extra=records, pulls=[pull(3, [35, 31, 34, 33], merged=100)])
    )

    unit, *own = output.candidates[0].evidence
    assert unit.source_revision == sha(90003)
    assert [item.source_revision for item in own] == [sha(n) for n in (34, 31, 33, 35)]
    assert [item.source_revision for item in own] == [
        record.sha for record in newest_first(records)
    ]

    bundles = build_candidates(
        REQ, outcome(window=_chain(), lookups=empty(11, 12, 13, 14))
    )
    assert [
        [item.source_revision for item in candidate.evidence]
        for candidate in bundles.candidates
    ] == [[sha(12), sha(11)], [sha(14), sha(13)]]


def _candidate_with(evidence: tuple[EvidenceItem, ...]) -> EligibleCandidate:
    return EligibleCandidate(
        work_identity="wi1:" + "0" * 64,
        title=None,
        work_facts=("PR #3, 상태 병합됨",),
        subject_contribution="연동 GitHub 계정이 작성자로 기록된 커밋",
        grouping_basis="PR #3 전체를 한 작업으로 묶었다.",
        grouping_limitations=(),
        evidence=evidence,
        draft=DraftOutcome.not_generated(),
        reflection=ReflectionOutcome.not_generated(),
    )


def test_merging_equal_identity_keeps_facts_scopes_and_limits_of_the_same_evidence() -> (
    None
):
    """같은 출처·판본 근거를 합칠 때 뒤 근거의 관측 사실·한계를 버리지 않고, 귀속
    범위가 다르면 첫 범위를 두고 그 사실을 한계로 남긴다. 합친 근거는 단위 근거 먼저, 본인 커밋은
    최근 것부터, 이슈 근거는 맨 뒤다. 정상 경로에서는 값이 같은 후보가 생기지 않으므로 합치기 함수에
    직접 넣는다."""
    own_scope = "연동 계정이 작성자로 기록된 커밋"
    elsewhere_scope = (
        "연동 계정이 작성자로 기록된 커밋(같은 변경으로 확인해 이 작업에 배정)"
    )
    pull_url = "https://github.com/o/r/pull/3"
    pull_first = EvidenceItem(
        pull_url,
        sha(90003),
        ("PR #3, 상태 병합됨",),
        "연동 계정이 연 PR(본인 기여는 이 PR의 본인 커밋에 한정)",
        ("한계 가",),
    )
    pull_second = EvidenceItem(
        pull_url,
        sha(90003),
        ("PR #3, 상태 병합됨", "PR 커밋 2건"),
        "연동 계정이 연 PR(본인 기여는 같은 변경으로 이 PR에 배정한 다른 곳의 본인 커밋에 한정)",
        ("한계 나", "한계 가"),
    )
    older = EvidenceItem(
        f"https://github.com/o/r/commit/{sha(31)}", sha(31), ("커밋 31",), own_scope, ()
    )
    older_again = replace(
        older,
        represented_facts=("커밋 31", "변경 파일 1개"),
        coverage_limits=("한계 다",),
    )
    newer = EvidenceItem(
        f"https://github.com/o/r/commit/{sha(41)}",
        sha(41),
        ("커밋 41",),
        elsewhere_scope,
        (),
    )

    issue_item = EvidenceItem(
        "https://github.com/o/r/issues/5",
        "2026-09-01T00:01:00Z",
        ("이슈 #5, 상태 열림",),
        "이 작업에서 연동 계정이 작성자로 기록된 커밋이 가리킨 이슈"
        "(이슈를 쓰거나 논의한 것은 본인 기여로 보지 않음)",
        (),
    )

    (merged,), count = _merge_same_identity(
        [
            _candidate_with((pull_first, older, issue_item)),
            _candidate_with((pull_second, newer, older_again)),
        ],
        {sha(31): commit(31), sha(41): commit(41)},
    )

    assert count == 1
    assert merged.evidence == (
        replace(
            pull_first,
            represented_facts=("PR #3, 상태 병합됨", "PR 커밋 2건"),
            coverage_limits=(
                "한계 가",
                "한계 나",
                "같은 근거를 다른 귀속 범위로도 담았다",
            ),
        ),
        newer,
        replace(
            older,
            represented_facts=("커밋 31", "변경 파일 1개"),
            coverage_limits=("한계 다",),
        ),
        issue_item,
    )
