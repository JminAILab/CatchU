"""관계 조회(#118): 같은 수집 연결로 PR 커밋 목록·연결 PR·비교·변경 내용을 모은다.

모두 합성 GitHub 응답으로 확인한다. 실제 GitHub 연결·호출 순서는 검증하지 않았다.
"""

import itertools
import logging
import re
import tracemalloc
from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import replace
from datetime import timedelta
from typing import Any

import pytest
from github_synthetic import (
    BASE,
    DEFAULT_BRANCH,
    LISTED_COMMITS,
    LISTED_ISSUES,
    LISTED_PULLS,
    MEMBER,
    OTHER,
    REFERENCE,
    REPOSITORY,
    REQUEST,
    STANDARD_ORDER,
    TOKEN,
    FakeClock,
    FakeTransport,
    Reply,
    StaticCredentials,
    StaticSelections,
    branch_commits_path,
    commit_detail_json,
    commit_pulls_path,
    compare_json,
    compare_path,
    detail_diff_path,
    detail_path,
    detail_reply,
    diff_reply,
    diff_text,
    file_json,
    graph_commit_json,
    issue_json,
    issue_listing_pull_json,
    oversized,
    pull_commits_path,
    pull_detail_json,
    pull_path,
    relation_pull_json,
    relation_repository_json,
    repository_json,
    request_with,
    respond,
    sha,
    standard_routes,
    status_only,
)

from app.collection import (
    PROPOSED_LIMITS,
    AssociatedPulls,
    BaseBranchLine,
    CollectionLimits,
    CollectionOutcome,
    CommitRecord,
    DetailStatus,
    FailureCode,
    Lookup,
    MergeBoundary,
    PullRequestCommits,
    RelationObservations,
    RelationOptions,
    collect,
    normalize,
)
from app.collection.graph import BroughtIn, WindowGraph
from app.collection.relations import (
    BaseChain,
    base_line_chains,
    default_resubmission,
    lookup_targets,
    merge_lookup_targets,
    pull_request_precedence,
    resubmission_shape,
)
from app.collection.transport import HttpResponse, TransportTimeout
from app.processing import CheckedRequest


def _run(
    routes: dict[str, Reply],
    request: CheckedRequest = REQUEST,
    *,
    limits: CollectionLimits = PROPOSED_LIMITS,
    options: RelationOptions | None = None,
    clock: FakeClock | None = None,
    seconds_per_call: float = 0.0,
) -> tuple[CollectionOutcome, FakeTransport]:
    clock = clock or FakeClock()
    transport = FakeTransport(routes, clock=clock, seconds_per_call=seconds_per_call)
    outcome = collect(
        request,
        credentials=StaticCredentials(),
        selections=StaticSelections(),
        open_transport=lambda: transport,
        clock=clock,
        limits=limits,
        relations=options or RelationOptions(),
    )
    return outcome, transport


def _relations(outcome: CollectionOutcome) -> RelationObservations:
    assert outcome.relations is not None
    return outcome.relations


def _pull_commits(
    relations: RelationObservations, number: int
) -> PullRequestCommits | None:
    return next(
        (entry for entry in relations.pull_request_commits if entry.number == number),
        None,
    )


def _lookup(relations: RelationObservations, number: int) -> AssociatedPulls | None:
    return next(
        (entry for entry in relations.associated if entry.sha == sha(number)), None
    )


def _commit_status(outcome: CollectionOutcome, number: int) -> DetailStatus:
    records = (*outcome.commits, *_relations(outcome).commits)
    return next(r.changes_status for r in records if r.sha == sha(number))


def _codes(outcome: CollectionOutcome) -> list[FailureCode]:
    return [failure.code for failure in outcome.failures]


# 회원이 읽는 관계 조회의 한계 문구에 쓰지 않는 조회 방식의 말(API 이름, 목록의 쪽).
_JARGON = ("API", "쪽", "연결 PR 조회")


def _plain(limits: Iterable[str]) -> bool:
    return bool(limits) and not any(word in item for item in limits for word in _JARGON)


# 기본 저장소: 기본 브랜치 커밋 7건(직선), PR 4건, 이슈 1건.
#  c1 회원 — 회원 PR #10의 커밋 목록에 있다.        c2 다른 계정
#  c3 회원 — PR #12의 merge_commit_sha(squash).     c4 회원 — 연결 PR 없음(직접 push)
#  c5 회원 — 연결 PR 조회로만 아는 PR #40.         c6 회원 — 다른 계정이 연 PR #11에 있다
#  c7 회원 — 연결 PR 조회에 다른 저장소 기준 PR만 있다.
# PR 목록 순서(만든 순서 최근부터)는 #13·#12·#11·#10이고, 먼저 병합된 순서는 #12·#10·#11, 열린 #13.
# PR마다 PR 목록에서 본 머리 커밋은 그 PR 커밋 목록의 끝 커밋이다(판본이 맞는다).

PRECEDENCE = [12, 10, 11, 13]
# 연결 PR 조회는 기본 브랜치 목록 순서(최근 것부터)로 부른다.
LOOKED_UP = [7, 5, 4]
# 변경 내용: 단위마다 첫 기여 커밋(목록 #13·#12·#11·#10의 c22·c21·c6·c1, 연결 PR #40의 c5)을 최근
# 것부터, 그다음 PR 밖 본인 커밋(c7·c4), 나머지 본인 커밋(c3)이다.
UNIT_FIRST = [22, 21, 6, 5, 1]
DETAILS = [*UNIT_FIRST, 7, 4, 3]


def relation_routes() -> dict[str, Reply]:
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond(
            [
                graph_commit_json(7, MEMBER, parents=(6,)),
                graph_commit_json(6, MEMBER, parents=(5,)),
                graph_commit_json(5, MEMBER, parents=(4,)),
                graph_commit_json(4, MEMBER, parents=(3,)),
                graph_commit_json(3, MEMBER, parents=(2,)),
                graph_commit_json(2, OTHER, parents=(1,)),
                graph_commit_json(1, MEMBER, parents=(999,)),
            ]
        ),
        LISTED_PULLS: respond(
            [
                relation_pull_json(13, OTHER, state="open", head=22),
                relation_pull_json(
                    12, MEMBER, merged_minute=1, merge_commit=3, head=21
                ),
                relation_pull_json(11, OTHER, merged_minute=3, head=20),
                relation_pull_json(10, MEMBER, merged_minute=2, head=1),
            ]
        ),
        LISTED_ISSUES: respond([issue_json(30, MEMBER)]),
        pull_commits_path(12): respond([graph_commit_json(21, MEMBER, parents=(999,))]),
        pull_commits_path(10): respond([graph_commit_json(1, MEMBER, parents=(999,))]),
        pull_commits_path(11): respond(
            [
                graph_commit_json(6, MEMBER, parents=(5,)),
                graph_commit_json(20, OTHER, parents=(6,)),
            ]
        ),
        pull_commits_path(13): respond([graph_commit_json(22, MEMBER, parents=(7,))]),
        commit_pulls_path(4): respond([]),
        commit_pulls_path(5): respond(
            [
                relation_pull_json(40, MEMBER, merge_commit=5),
                relation_pull_json(41, OTHER, base_repository="someone-else/fork"),
            ]
        ),
        commit_pulls_path(7): respond(
            [relation_pull_json(42, OTHER, base_repository="someone-else/other")]
        ),
    }
    for number in DETAILS:
        routes[detail_path(number)] = detail_reply(number, MEMBER)
    return routes


RELATION_ORDER = [
    BASE,
    LISTED_COMMITS,
    LISTED_PULLS,
    LISTED_ISSUES,
    *(pull_commits_path(number) for number in PRECEDENCE),
    *(commit_pulls_path(number) for number in LOOKED_UP),
    *(detail_path(number) for number in DETAILS),
]


# 1. 관계 조회를 요청하지 않으면 #117 동작 그대로다


def test_default_path_never_calls_relation_endpoints() -> None:
    transport = FakeTransport(standard_routes())
    outcome = collect(
        REQUEST,
        credentials=StaticCredentials(),
        selections=StaticSelections(),
        open_transport=lambda: transport,
        clock=FakeClock(),
    )

    assert outcome.completed
    assert outcome.relations is None
    assert transport.paths == STANDARD_ORDER
    for path in transport.paths:
        assert "/compare/" not in path
        assert "?sha=" not in path
        assert not re.search(r"/commits/[0-9a-f]{40}/pulls", path)


def test_default_path_does_not_read_the_default_branch() -> None:
    routes = standard_routes()
    routes[BASE] = respond(repository_json(default_branch=123))

    transport = FakeTransport(routes)
    outcome = collect(
        REQUEST,
        credentials=StaticCredentials(),
        selections=StaticSelections(),
        open_transport=lambda: transport,
        clock=FakeClock(),
    )

    assert outcome.completed
    assert transport.paths == STANDARD_ORDER


# 2. 관계 조회의 순서와 같은 연결의 재사용


def test_relation_phase_reuses_the_connection_in_planned_order() -> None:
    outcome, transport = _run(relation_routes())
    relations = _relations(outcome)

    assert outcome.completed
    assert transport.paths == RELATION_ORDER
    # 같은 경로를 두 번 부르지 않는다(상세도 다시 받지 않는다).
    assert set(Counter(transport.paths).values()) == {1}
    # 모든 호출이 같은 토큰을 머리글로만 실은 같은 연결을 지났다.
    assert {call.headers["Authorization"] for call in transport.calls} == {
        f"Bearer {TOKEN}"
    }
    # 소속 판정이 쓰는 merge_commit_sha는 API 판본 2026-03-10에서 빠졌다. 판본을 고정한다.
    assert {call.headers["X-GitHub-Api-Version"] for call in transport.calls} == {
        "2022-11-28"
    }
    assert transport.closed
    assert relations.default_branch == DEFAULT_BRANCH
    assert relations.stopped_during is None


def test_pull_request_commit_lists_include_other_peoples_pull_requests() -> None:
    outcome, _ = _run(relation_routes())
    relations = _relations(outcome)

    numbers = [entry.number for entry in relations.pull_request_commits]
    assert numbers == [*PRECEDENCE, 40]
    for entry in relations.pull_request_commits[:4]:
        assert entry.status is DetailStatus.FETCHED
        assert entry.complete and not entry.full_list_via_compare
        # 250건 미만은 비교하지 않으므로 비교 근거가 없다.
        assert (entry.compared_from, entry.merge_base, entry.total_commits) == (
            None,
            None,
            None,
        )
    other_pull = _pull_commits(relations, 11)
    assert other_pull is not None
    assert other_pull.commits == (sha(6), sha(20))
    # 관측 판본은 PR 목록에서 본 머리 커밋이고, 그 커밋이 목록의 끝이다.
    assert other_pull.observed_at == sha(20)
    for pull in outcome.pull_requests:
        assert pull.commits_status is DetailStatus.FETCHED
        assert not pull.commits_truncated
    assert {pull.number: pull.commits for pull in outcome.pull_requests}[13] == (
        sha(22),
    )


def test_relation_path_reads_every_pull_request_list_regardless_of_list_count() -> None:
    # #117의 PR 커밋 목록 개수(연동 계정 PR 최근 N건)는 관계 조회에서 쓰지 않는다.
    limits = replace(
        PROPOSED_LIMITS, max_pull_request_commit_lists=1, max_commit_details=1
    )

    outcome, transport = _run(relation_routes(), limits=limits)

    assert outcome.completed
    for number in PRECEDENCE:
        assert pull_commits_path(number) in transport.paths
    assert outcome.shared_limits("PULL_REQUEST") == ()


def test_own_commit_in_another_accounts_pull_request_keeps_its_author() -> None:
    outcome, _ = _run(relation_routes())
    relations = _relations(outcome)

    # 기본 브랜치에 없는 커밋만 관계 기록으로 남고, 기본 브랜치 커밋과 겹치지 않는다.
    assert [record.sha for record in relations.commits] == [sha(21), sha(20), sha(22)]
    assert not {r.sha for r in relations.commits} & {r.sha for r in outcome.commits}
    by_sha = {record.sha: record for record in relations.commits}
    # PR 작성자(다른 계정)와 커밋 작성자(회원)를 따로 본다.
    assert by_sha[sha(22)].author == MEMBER
    assert by_sha[sha(22)].parents == (sha(7),)
    assert by_sha[sha(20)].author == OTHER
    open_pull = next(pull for pull in outcome.pull_requests if pull.number == 13)
    assert open_pull.author == OTHER


def test_only_unexplained_own_default_branch_commits_are_looked_up() -> None:
    outcome, transport = _run(relation_routes())
    relations = _relations(outcome)

    looked_up = [
        path
        for path in transport.paths
        if path.endswith("/pulls?per_page=100&page=1") and "/commits/" in path
    ]
    assert looked_up == [commit_pulls_path(number) for number in LOOKED_UP]
    # PR 커밋 목록(c1·c6), merge_commit_sha(c3), 다른 계정(c2)은 조회하지 않는다.
    for number in (1, 2, 3, 6):
        assert commit_pulls_path(number) not in transport.paths
    assert relations.associated == (
        AssociatedPulls(sha(7), Lookup.EMPTY, (), 1),
        AssociatedPulls(sha(5), Lookup.FOUND, (40,), 1),
        AssociatedPulls(sha(4), Lookup.EMPTY, (), 0),
    )
    assert _lookup(relations, 5) == relations.associated[1]


def test_lookup_only_pull_request_is_kept_and_foreign_base_is_ignored() -> None:
    outcome, _ = _run(relation_routes())
    relations = _relations(outcome)

    (only,) = relations.pull_requests_from_lookups
    assert only.number == 40
    assert only.merge_commit_sha == sha(5)
    assert only.commits_status is DetailStatus.BEYOND_RANGE
    entry = _pull_commits(relations, 40)
    assert entry is not None and entry.status is DetailStatus.BEYOND_RANGE
    # 이유는 PR 기록의 근거 한 곳에만 적는다(상세 조회 개수 범위 문구를 쓰지 않는다).
    assert entry.limits == ()
    assert outcome.evidence_for(only).coverage_limits == (
        "최근 PR 목록 밖의 PR이라 이 PR에 담긴 커밋 전체는 확인하지 않았다",
    )
    # 다른 저장소 기준 PR(#41·#42)은 어디에도 남지 않는다.
    numbers = {pull.number for pull in (*outcome.pull_requests, only)}
    assert not numbers & {41, 42}


@pytest.mark.parametrize("status", [409, 422])
def test_lookup_refusal_stops_collection_without_retry(status: int) -> None:
    """조회 오류는 수집 실패(작업 동일성 기준 2026-09-30): 연결 PR 조회 409·422는 자료 범위 한계가 아니라 수집 실패다."""
    routes = relation_routes()
    routes[commit_pulls_path(5)] = status_only(status)

    outcome, transport = _run(routes)
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert relations.stopped_during == "LOOKUPS"
    assert transport.paths[-1] == commit_pulls_path(5)
    assert set(Counter(transport.paths).values()) == {1}
    assert [(a.sha, a.status) for a in relations.associated] == [
        (sha(7), Lookup.EMPTY),
        (sha(5), Lookup.NOT_REACHED),
        (sha(4), Lookup.NOT_REACHED),
    ]
    assert relations.pull_requests_from_lookups == ()


def test_lookup_with_unknown_base_repository_is_limited() -> None:
    """기준 저장소를 알 수 없는 연결 PR은 이 저장소 PR일 수 있어 LIMITED다."""
    routes = relation_routes()
    routes[commit_pulls_path(7)] = respond(
        [
            relation_pull_json(42, OTHER, base_repository=None),
            relation_pull_json(43, OTHER, base_repository="someone-else/other"),
        ]
    )
    no_repo = relation_pull_json(44, OTHER)
    del no_repo["base"]["repo"]
    routes[commit_pulls_path(4)] = respond([no_repo])

    outcome, _ = _run(routes)
    relations = _relations(outcome)

    assert outcome.completed
    assert _lookup(relations, 7) == AssociatedPulls(sha(7), Lookup.LIMITED, (), 1, 1)
    assert _lookup(relations, 4) == AssociatedPulls(sha(4), Lookup.LIMITED, (), 0, 1)
    # 다른 저장소 기준으로 확인된 PR만 있으면 정상 부재다(기본 사례의 c7).
    outcome, _ = _run(relation_routes())
    assert _lookup(_relations(outcome), 7) == AssociatedPulls(
        sha(7), Lookup.EMPTY, (), 1
    )


def test_full_first_lookup_page_of_foreign_pull_requests_is_limited() -> None:
    """첫 쪽이 다른 저장소 PR로만 차도 다음 쪽이 있으면 이 저장소 PR이 남았을 수 있다."""
    routes = relation_routes()
    routes[commit_pulls_path(7)] = respond(
        [
            relation_pull_json(100 + n, OTHER, base_repository="someone-else/other")
            for n in range(100)
        ],
        next_page=True,
    )

    outcome, transport = _run(routes)
    relations = _relations(outcome)

    assert outcome.completed
    assert not any(
        path.endswith("/pulls?per_page=100&page=2") for path in transport.paths
    )
    assert _lookup(relations, 7) == AssociatedPulls(sha(7), Lookup.LIMITED, (), 100)
    assert relations.pull_requests_from_lookups[0].number == 40


def test_lookup_not_found_still_stops_collection() -> None:
    routes = relation_routes()
    routes[commit_pulls_path(5)] = status_only(404)

    outcome, _ = _run(routes)

    assert _codes(outcome) == [FailureCode.REPOSITORY_UNREACHABLE]
    assert _lookup(_relations(outcome), 5) == AssociatedPulls(
        sha(5), Lookup.NOT_REACHED
    )


def test_oversized_or_multi_page_lookup_is_a_range_limit() -> None:
    routes = relation_routes()
    routes[commit_pulls_path(7)] = oversized()
    routes[commit_pulls_path(5)] = respond(
        [relation_pull_json(100 + n, OTHER) for n in range(100)], next_page=True
    )

    outcome, transport = _run(routes)
    relations = _relations(outcome)

    assert outcome.completed
    # 둘째 쪽은 부르지 않는다.
    assert not any(
        path.endswith("/pulls?per_page=100&page=2") for path in transport.paths
    )
    statuses = {entry.sha: entry.status for entry in relations.associated}
    assert statuses == {
        sha(7): Lookup.LIMITED,
        sha(5): Lookup.LIMITED,
        sha(4): Lookup.EMPTY,
    }
    # PR 밖으로 확인되지 않았으므로 선택 1이 아니라 선택 2로 상세를 받는다.
    assert relations.detail_tiers.outside_pull_requests == (sha(4),)


def test_detail_tiers_fetch_unit_first_then_outside_then_evidence_commits() -> None:
    """단위마다 기여 커밋 하나를 PR 밖 커밋·나머지 커밋보다 먼저 받는다."""
    outcome, _ = _run(relation_routes())
    relations = _relations(outcome)

    tiers = relations.detail_tiers
    assert tiers.needed == ()
    # PR 목록마다 가장 최근 본인 커밋, 목록 밖 PR #40은 연결 PR 조회로 정해질 본인 커밋.
    assert tiers.unit_first == tuple(sha(n) for n in UNIT_FIRST)
    assert tiers.outside_pull_requests == (sha(7), sha(4))
    # squash 커밋 c3은 어느 PR 목록에도 없어 마지막이다.
    assert tiers.evidence == (sha(3),)
    for number in DETAILS:
        assert _commit_status(outcome, number) is DetailStatus.FETCHED
    # 다른 계정 커밋은 변경 내용을 조회하지 않는다.
    assert _commit_status(outcome, 2) is DetailStatus.NOT_REQUESTED
    assert _commit_status(outcome, 20) is DetailStatus.NOT_REQUESTED
    assert outcome.coverage_limits == ()


def test_optional_details_stop_before_the_call_limit() -> None:
    """단위 첫 커밋을 먼저 받는 순서와 2026-10-08 팀장 결정(건너뛴 수 대신 '일부')에 맞췄다."""
    calls_before_details = len(RELATION_ORDER) - len(DETAILS)
    limits = replace(PROPOSED_LIMITS, max_calls=calls_before_details + 3)

    outcome, transport = _run(relation_routes(), limits=limits)

    assert outcome.completed
    assert outcome.failures == ()
    assert transport.paths == RELATION_ORDER[: calls_before_details + 3]
    for number in DETAILS[:3]:
        assert _commit_status(outcome, number) is DetailStatus.FETCHED
    for number in DETAILS[3:]:
        assert _commit_status(outcome, number) is DetailStatus.BEYOND_RANGE
    assert outcome.shared_limits("COMMIT") == (SKIPPED_DETAILS,)


# 건너뛴 본인 커밋 수는 CatchU가 센 수라 쓰지 않고 정해 둔 상한 값만 쓴다(2026-10-08 팀장 결정 「수신자에게
# 나가는 숫자와 근거 순서」).
SKIPPED_DETAILS = (
    "연동 계정이 작성자로 기록된 커밋 일부는 상세 조회 개수(200건)나 남은 호출·시간·총량 "
    "여유 밖이라 변경 내용을 조회하지 않았다"
)


def test_skipped_details_limit_names_the_cap_not_the_skipped_count() -> None:
    """2026-10-08 팀장 결정(본인 기여의 뜻, 숫자): '작성자로 기록된', 건너뛴 수 대신 '일부'."""
    limits = replace(PROPOSED_LIMITS, max_commit_details=3)

    outcome, _ = _run(relation_routes(), limits=limits)

    skipped = len(DETAILS) - 3
    (limit,) = outcome.shared_limits("COMMIT")
    assert limit == SKIPPED_DETAILS.replace("200건", "3건")
    assert f"{skipped}건" not in limit
    assert "작성한" not in limit


def test_unit_first_commit_comes_before_outside_commits() -> None:
    """상세 조회 개수가 하나뿐이면 PR 밖 커밋보다 단위의 첫 기여 커밋을 받는다."""
    limits = replace(PROPOSED_LIMITS, max_commit_details=1)

    outcome, transport = _run(relation_routes(), limits=limits)

    assert outcome.completed
    assert transport.paths[-1] == detail_path(UNIT_FIRST[0])
    assert _commit_status(outcome, UNIT_FIRST[0]) is DetailStatus.FETCHED
    for number in (7, 4):
        assert _commit_status(outcome, number) is DetailStatus.BEYOND_RANGE


def test_optional_details_respect_the_detail_count() -> None:
    limits = replace(PROPOSED_LIMITS, max_commit_details=2)

    outcome, _ = _run(relation_routes(), limits=limits)

    assert outcome.completed
    assert [_commit_status(outcome, n) for n in DETAILS] == [
        DetailStatus.FETCHED,
        DetailStatus.FETCHED,
        *[DetailStatus.BEYOND_RANGE] * 6,
    ]
    assert len(outcome.shared_limits("COMMIT")) == 1


@pytest.mark.parametrize(
    ("spare", "fetched"),
    [
        # 연결·응답 대기 합(20초)보다는 길지만 그 두 배(40초)보다 짧다. 호출 하나가 대기 합보다
        # 오래 걸릴 수 있으므로 부르지 않는다.
        (30, 0),
        (40, 0),
        # 하나를 부르면(10초) 남은 시간이 40초가 되어 다음은 부르지 않는다.
        (50, 1),
    ],
)
def test_optional_details_leave_twice_the_call_wait_before_the_time_limit(
    spare: int, fetched: int
) -> None:
    calls_before_details = len(RELATION_ORDER) - len(DETAILS)
    limits = replace(
        PROPOSED_LIMITS,
        max_collection_time=timedelta(seconds=calls_before_details * 10 + spare),
    )

    outcome, transport = _run(relation_routes(), limits=limits, seconds_per_call=10)

    assert outcome.completed
    assert len(transport.calls) == calls_before_details + fetched
    assert [_commit_status(outcome, n) for n in DETAILS] == [
        *[DetailStatus.FETCHED] * fetched,
        *[DetailStatus.BEYOND_RANGE] * (len(DETAILS) - fetched),
    ]


def test_deadline_already_passed_before_optional_details_is_a_time_failure() -> None:
    """선택 상세를 건너뛰려는 때 마감이 이미 지났으면 범위 한계로 숨기지
    않고 시간 상한 실패로 멈춘다. 마감 전의 여유 부족은 위 시험처럼 범위 밖(BEYOND_RANGE)이다."""
    calls_before_details = len(RELATION_ORDER) - len(DETAILS)
    limits = replace(
        PROPOSED_LIMITS,
        max_collection_time=timedelta(seconds=calls_before_details * 10),
    )

    outcome, transport = _run(relation_routes(), limits=limits, seconds_per_call=10)
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.TIME_LIMIT_EXCEEDED]
    assert relations.stopped_during == "DETAILS"
    # 마감을 확인하는 것은 호출이 아니다.
    assert len(transport.calls) == calls_before_details
    for number in DETAILS:
        assert _commit_status(outcome, number) is DetailStatus.NOT_REACHED
    assert outcome.shared_limits("COMMIT") == ()


# 3. PR 커밋 목록 판본 확인과 250건에 닿은 PR


def _short_list_routes(head: int, pages: list[list[int]]) -> dict[str, Reply]:
    """PR #10 하나. 커밋 목록 쪽마다 커밋 번호를 적고, 각 커밋의 부모는 바로 앞 번호다.

    커밋은 다른 계정이 작성해 변경 내용을 조회하지 않는다.
    """
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond([]),
        LISTED_PULLS: respond([relation_pull_json(10, MEMBER, head=head)]),
    }
    for page, numbers in enumerate(pages, 1):
        routes[pull_commits_path(10, page)] = respond(
            [graph_commit_json(n, OTHER, parents=(n - 1,)) for n in numbers],
            next_page=page < len(pages),
        )
    return routes


@pytest.mark.parametrize(
    ("head", "pages"),
    [
        # PR 목록에서 본 머리 커밋이 목록에 없다(강제 푸시 등).
        (2010, [[3000, 3001]]),
        # 머리 커밋 뒤에 커밋이 더 있다(PR 목록을 본 뒤 커밋이 더해졌다).
        (3000, [[3000, 3001]]),
        # 첫 쪽은 머리 커밋까지, 둘째 쪽은 그 뒤 판본을 받았다(쪽이 섞였다).
        (3100, [list(range(3001, 3101)), [3101]]),
    ],
    ids=["head-missing", "head-not-last", "mixed-pages"],
)
def test_short_list_that_does_not_end_at_the_observed_head_is_discarded(
    head: int, pages: list[list[int]]
) -> None:
    """250건 미만 목록은 관측한 머리 커밋이 끝일 때만 그 판본의 목록이다."""
    outcome, transport = _run(_short_list_routes(head, pages), COMMITS_AND_PULLS)
    relations = _relations(outcome)

    assert outcome.completed
    (entry,) = relations.pull_request_commits
    assert entry.status is DetailStatus.REVISION_MISMATCH
    assert entry.commits == () and not entry.complete
    assert entry.observed_at == sha(head)
    # 그 목록의 커밋은 소속 근거로 쓰지 않으므로 관계 기록에 남기지 않고 다시 부르지 않는다.
    assert relations.commits == ()
    assert set(Counter(transport.paths).values()) == {1}
    pull = outcome.pull_requests[0]
    assert pull.commits is None
    assert pull.commits_status is DetailStatus.REVISION_MISMATCH
    assert outcome.evidence_for(pull).coverage_limits == (
        "조회하는 동안 PR이 바뀌어 커밋 목록을 관측한 판본과 맞출 수 없었다",
    )


def test_short_list_that_ends_at_the_observed_head_is_used() -> None:
    outcome, _ = _run(
        _short_list_routes(3100, [list(range(3001, 3101))]), COMMITS_AND_PULLS
    )

    (entry,) = _relations(outcome).pull_request_commits
    assert entry.status is DetailStatus.FETCHED and entry.complete
    assert entry.commits == tuple(sha(n) for n in range(3001, 3101))


@pytest.mark.parametrize(
    ("head", "base_ref", "whole"),
    [
        # PR 목록에서 본 머리 커밋이 PR 응답의 기준 커밋(c9999)과 같다.
        (9999, DEFAULT_BRANCH, True),
        # 기본 브랜치 대상 PR의 머리 커밋이 이미 기본 브랜치 목록에 있다.
        (500, DEFAULT_BRANCH, True),
        # 머리 커밋이 기본 브랜치 목록에 있어도 다른 브랜치가 대상이면 0건인지 모른다.
        (500, "release", False),
        # 머리 커밋이 기준 쪽에 있는지 모른다. PR 목록을 본 뒤 PR이 바뀌었을 수 있다.
        (2010, DEFAULT_BRANCH, False),
    ],
    ids=["head-is-base", "head-on-default-branch", "other-base-branch", "unknown-head"],
)
def test_empty_list_is_whole_only_when_the_observed_head_adds_no_commits(
    head: int, base_ref: str, whole: bool
) -> None:
    """빈 커밋 목록은 머리 커밋이 없어 끝을 맞출 수 없다. 관측한 머리 커밋이 이미 기준 쪽에 있어 그
    판본의 PR 커밋이 0건일 때만 끝까지 받은 목록이다. 아니면 지금처럼 판본 불일치로 버린다."""
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond([graph_commit_json(500, OTHER, parents=(499,))]),
        LISTED_PULLS: respond(
            [
                relation_pull_json(
                    10, OTHER, state="closed", head=head, base_ref=base_ref
                )
            ]
        ),
        pull_commits_path(10): respond([]),
    }

    outcome, transport = _run(routes, COMMITS_AND_PULLS)

    assert outcome.completed
    (entry,) = _relations(outcome).pull_request_commits
    assert entry.commits == ()
    if whole:
        assert entry.status is DetailStatus.FETCHED and entry.complete
        assert outcome.pull_requests[0].commits == ()
    else:
        assert entry.status is DetailStatus.REVISION_MISMATCH and not entry.complete
    # 판본을 맞추려고 더 부르지 않는다.
    assert transport.paths.count(pull_commits_path(10)) == 1
    assert set(Counter(transport.paths).values()) == {1}


# PR #10은 기준 커밋 c2999에서 갈라진 직선 c3000~c3299다. 커밋 목록은 앞의 250건(c3000~c3249)을 주고,
# PR 목록에서 본 머리 커밋(관측 판본)은 전체의 끝 c3299다.
CAPPED_HEAD = 3299


def _capped_routes(
    pull: dict[str, object], *, count: int | None = 300
) -> dict[str, Reply]:
    """PR #10의 커밋 목록이 250건(100·100·50)에 닿는다. count는 PR API의 전체 커밋 수다."""
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond([]),
        LISTED_PULLS: respond([pull]),
    }
    for page, (start, size) in enumerate(((3000, 100), (3100, 100), (3200, 50)), 1):
        routes[pull_commits_path(10, page)] = respond(
            [
                graph_commit_json(start + n, OTHER, parents=(start + n - 1,))
                for n in range(size)
            ],
            next_page=page < 3,
        )
    if count is not None:
        routes[pull_path(10)] = respond(pull_detail_json(dict(pull), count))
    return routes


def _compare_page(
    page: int, total: int = 300, *, next_page: bool, size: int = 100
) -> Reply:
    start = 3000 + (page - 1) * 100
    return respond(
        compare_json(
            total,
            2999,
            [
                graph_commit_json(start + n, OTHER, parents=(start + n - 1,))
                for n in range(size)
            ],
        ),
        next_page=next_page,
    )


def _compare_path(page: int, head: int = CAPPED_HEAD) -> str:
    return compare_path(2999, head, page)


CAPPED_PULL = relation_pull_json(10, MEMBER, base_commit=2999, head=CAPPED_HEAD)
COMMITS_AND_PULLS = request_with("COMMIT", "PULL_REQUEST")
LISTED_250 = tuple(sha(3000 + n) for n in range(250))


def _capped_entry(outcome: CollectionOutcome) -> PullRequestCommits:
    (entry,) = _relations(outcome).pull_request_commits
    return entry


def _assert_only_listed_250(outcome: CollectionOutcome) -> PullRequestCommits:
    """비교 결과를 모두 버리고 PR 커밋 목록 250건만 썼다(완료 아님, 한계 하나)."""
    entry = _capped_entry(outcome)
    assert entry.status is DetailStatus.FETCHED
    assert not entry.complete and not entry.full_list_via_compare
    assert len(entry.limits) == 1 and _plain(entry.limits)
    assert entry.commits == LISTED_250
    # 비교 API로만 본 커밋은 PR 커밋 목록에도 관계 기록에도 넣지 않는다.
    assert {r.sha for r in _relations(outcome).commits} == set(LISTED_250)
    return entry


def test_capped_pull_request_list_is_completed_by_compare_total() -> None:
    routes = _capped_routes(CAPPED_PULL)
    for page in (1, 2, 3):
        routes[_compare_path(page)] = _compare_page(page, next_page=page < 3)

    outcome, transport = _run(routes, COMMITS_AND_PULLS)
    entry = _capped_entry(outcome)

    assert outcome.completed
    assert transport.paths[-4:] == [
        pull_path(10),
        *(_compare_path(p) for p in (1, 2, 3)),
    ]
    assert entry.complete and entry.full_list_via_compare
    assert entry.commits == tuple(sha(3000 + n) for n in range(300))
    assert entry.limits == ()
    # 다 읽었다고 본 근거: 비교 경계(시작 커밋)와 PR API의 전체 커밋 수, 그리고 머리 판본.
    assert (entry.compared_from, entry.merge_base, entry.total_commits) == (
        sha(2999),
        sha(2999),
        300,
    )
    assert entry.observed_at == sha(CAPPED_HEAD)
    pull = outcome.pull_requests[0]
    assert pull.commits is not None and len(pull.commits) == 300
    assert not pull.commits_truncated
    assert len(_relations(outcome).commits) == 300


def test_pull_request_api_with_another_head_skips_compare() -> None:
    """2026-10-08 결정(커밋 250개 넘는 PR): PR API의 머리 커밋이 관측 판본과 다르면 비교하지 않고 250건만 쓴다."""
    moved = {**CAPPED_PULL, "head": {**CAPPED_PULL["head"], "sha": sha(3300)}}
    routes = _capped_routes(CAPPED_PULL)
    routes[pull_path(10)] = respond(pull_detail_json(moved, 301))

    outcome, transport = _run(routes, COMMITS_AND_PULLS)

    assert outcome.completed
    assert transport.paths[-1] == pull_path(10)
    assert not any("/compare/" in path for path in transport.paths)
    entry = _assert_only_listed_250(outcome)
    assert entry.limits == (
        "PR이 조회 중에 바뀌어 PR 커밋 250건 밖의 커밋은 확인하지 않았다",
    )
    assert entry.observed_at == sha(CAPPED_HEAD)


def test_compare_that_does_not_finish_within_its_pages_is_a_limit() -> None:
    routes = _capped_routes(CAPPED_PULL)
    for page in (1, 2):
        routes[_compare_path(page)] = _compare_page(page, next_page=True)
    limits = replace(PROPOSED_LIMITS, max_compare_pages=2)

    outcome, transport = _run(routes, COMMITS_AND_PULLS, limits=limits)
    entry = _capped_entry(outcome)

    assert outcome.completed
    assert _compare_path(3) not in transport.paths
    assert not entry.complete and not entry.full_list_via_compare
    assert len(entry.limits) == 1 and "200건" in entry.limits[0]
    assert _plain(entry.limits)
    assert entry.commits == LISTED_250
    pull = outcome.pull_requests[0]
    assert pull.commits_truncated
    assert "PR 커밋 목록 API가 돌려주는 250건까지만 확인했다" in (
        outcome.evidence_for(pull).coverage_limits
    )


def test_partial_compare_that_covers_the_list_adds_its_commits() -> None:
    # 비교 범위의 전체 커밋 수가 PR과 같고 PR 커밋 목록 250건을 모두 담았으면, 끝까지 읽지
    # 못했어도 그 범위에서 읽은 커밋은 PR 커밋으로 더한다.
    routes = _capped_routes(CAPPED_PULL, count=400)
    for page in (1, 2, 3):
        routes[_compare_path(page)] = _compare_page(page, total=400, next_page=True)
    limits = replace(PROPOSED_LIMITS, max_compare_pages=3)

    outcome, _ = _run(routes, COMMITS_AND_PULLS, limits=limits)
    entry = _capped_entry(outcome)

    assert not entry.complete
    assert entry.commits == tuple(sha(3000 + n) for n in range(300))
    assert len(_relations(outcome).commits) == 300


def test_compare_total_that_changes_on_a_later_page_discards_compare_commits() -> None:
    """2026-10-08 결정(커밋 250개 넘는 PR): 뒤쪽에서 수가 어긋나면 앞쪽에서 모은 비교 커밋도 버린다."""
    routes = _capped_routes(CAPPED_PULL, count=400)
    for page in (1, 2, 3):
        routes[_compare_path(page)] = _compare_page(page, total=400, next_page=True)
    routes[_compare_path(4)] = _compare_page(4, total=401, next_page=True)

    outcome, transport = _run(routes, COMMITS_AND_PULLS)

    assert outcome.completed
    assert _compare_path(5) not in transport.paths
    _assert_only_listed_250(outcome)


def test_compare_that_ends_before_the_total_discards_compare_commits() -> None:
    """2026-10-08 결정(커밋 250개 넘는 PR): 전체 수 전에 다음 쪽 없이 끝나면 비교 커밋을 버린다."""
    routes = _capped_routes(CAPPED_PULL, count=400)
    for page in (1, 2, 3):
        routes[_compare_path(page)] = _compare_page(page, total=400, next_page=page < 3)

    outcome, transport = _run(routes, COMMITS_AND_PULLS)

    assert outcome.completed
    assert _compare_path(4) not in transport.paths
    _assert_only_listed_250(outcome)


def test_compare_without_the_observed_head_discards_compare_commits() -> None:
    """2026-10-08 결정(커밋 250개 넘는 PR): 수가 같아도 관측한 머리 커밋이 비교 결과에 없으면 판본이 다르다."""
    pull = relation_pull_json(10, MEMBER, base_commit=2999, head=3300)
    routes = _capped_routes(pull)
    for page in (1, 2, 3):
        routes[_compare_path(page, head=3300)] = _compare_page(page, next_page=page < 3)

    outcome, _ = _run(routes, COMMITS_AND_PULLS)

    assert outcome.completed
    _assert_only_listed_250(outcome)


def test_compare_whose_total_differs_from_the_pull_request_is_not_trusted() -> None:
    # 비교 범위가 PR보다 넓으면(기준 커밋이 오래됨) 기준 브랜치 커밋이 섞일 수 있다.
    routes = _capped_routes(CAPPED_PULL)
    routes[_compare_path(1)] = respond(
        compare_json(
            320,
            2999,
            [graph_commit_json(2900 + n, OTHER) for n in range(100)],
        ),
        next_page=True,
    )

    outcome, transport = _run(routes, COMMITS_AND_PULLS)
    entry = _assert_only_listed_250(outcome)

    assert outcome.completed
    assert _compare_path(2) not in transport.paths
    # 비교 범위의 전체 커밋 수(320)가 PR API의 수(300)와 달랐다는 근거를 남긴다.
    assert (entry.compared_from, entry.total_commits) == (sha(2999), 300)


def test_compare_that_misses_listed_commits_is_not_trusted() -> None:
    routes = _capped_routes(CAPPED_PULL, count=250)
    routes[_compare_path(1)] = respond(
        compare_json(
            250, 2999, [graph_commit_json(4000 + n, OTHER) for n in range(100)]
        ),
        next_page=True,
    )
    routes[_compare_path(2)] = respond(
        compare_json(
            250, 2999, [graph_commit_json(4100 + n, OTHER) for n in range(100)]
        ),
        next_page=True,
    )
    routes[_compare_path(3)] = respond(
        compare_json(250, 2999, [graph_commit_json(4200 + n, OTHER) for n in range(50)])
    )

    outcome, _ = _run(routes, COMMITS_AND_PULLS)

    _assert_only_listed_250(outcome)


def test_pull_request_count_below_the_list_skips_compare() -> None:
    outcome, transport = _run(_capped_routes(CAPPED_PULL, count=249), COMMITS_AND_PULLS)

    assert outcome.completed
    assert transport.paths[-1] == pull_path(10)
    _assert_only_listed_250(outcome)


def test_empty_next_compare_page_is_not_proof_of_completion() -> None:
    """2026-10-08 결정(커밋 250개 넘는 PR): 빈 쪽은 끝의 증거가 아니다. 전체 수 전에 끝난 것으로 보고 비교 커밋을 버린다."""
    routes = _capped_routes(CAPPED_PULL)
    routes[_compare_path(1)] = _compare_page(1, next_page=True)
    routes[_compare_path(2)] = respond(compare_json(300, 2999, []), next_page=True)

    outcome, transport = _run(routes, COMMITS_AND_PULLS)

    assert outcome.completed
    assert _compare_path(2) in transport.paths
    assert _compare_path(3) not in transport.paths
    _assert_only_listed_250(outcome)


def test_short_capped_list_without_next_page_is_still_checked_by_compare() -> None:
    # 셋째 쪽 50건에 다음 쪽 표시가 없어도 250건이면 경계를 증명하지 못했다. 이 PR은 커밋이
    # 250건뿐이라 머리 커밋이 c3249다.
    pull = relation_pull_json(10, MEMBER, base_commit=2999, head=3249)
    routes = _capped_routes(pull, count=250)
    routes[_compare_path(1, head=3249)] = _compare_page(1, 250, next_page=True)
    routes[_compare_path(2, head=3249)] = _compare_page(2, 250, next_page=True)
    routes[_compare_path(3, head=3249)] = _compare_page(
        3, 250, next_page=False, size=50
    )

    outcome, transport = _run(routes, COMMITS_AND_PULLS)
    entry = _capped_entry(outcome)

    assert pull_path(10) in transport.paths
    assert entry.complete and entry.full_list_via_compare
    assert entry.commits == LISTED_250


@pytest.mark.parametrize(
    ("pull", "checked"),
    [
        (
            relation_pull_json(10, MEMBER, fork=True, base_commit=2999),
            COMMITS_AND_PULLS,
        ),
        (relation_pull_json(10, MEMBER, base_commit=None), COMMITS_AND_PULLS),
        # 비교 API는 커밋 자료라 커밋 조회가 허용되지 않은 요청에서는 부르지 않는다.
        (CAPPED_PULL, request_with("PULL_REQUEST")),
    ],
    ids=["fork", "no-base", "pull-requests-only"],
)
def test_capped_list_is_not_compared_without_a_usable_boundary(
    pull: dict[str, object], checked: CheckedRequest
) -> None:
    routes = _capped_routes(pull, count=None)

    outcome, transport = _run(routes, checked)
    entry = _capped_entry(outcome)

    assert outcome.completed
    assert not any("/compare/" in path for path in transport.paths)
    assert pull_path(10) not in transport.paths
    assert not entry.complete
    assert len(entry.limits) == 1 and _plain(entry.limits)
    assert entry.commits == LISTED_250


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (404, FailureCode.REPOSITORY_UNREACHABLE),
        (422, FailureCode.COLLECTION_FETCH_FAILED),
    ],
)
def test_compare_refusal_stops_collection_without_retry(
    status: int, code: FailureCode
) -> None:
    """2026-10-08 결정(커밋 250개 넘는 PR): 비교 조회 거절(404·422)은 한계가 아니라 수집 실패다."""
    routes = _capped_routes(CAPPED_PULL)
    routes[_compare_path(1)] = status_only(status)

    outcome, transport = _run(routes, COMMITS_AND_PULLS)
    relations = _relations(outcome)

    assert _codes(outcome) == [code]
    assert relations.stopped_during == "PULL_REQUEST_COMMITS"
    assert transport.paths.count(_compare_path(1)) == 1
    assert transport.paths[-1] == _compare_path(1)
    assert _capped_entry(outcome).status is DetailStatus.NOT_REACHED
    assert outcome.pull_requests[0].commits_status is DetailStatus.NOT_REACHED
    # 다 읽지 못한 PR에서 본 커밋은 소속 근거가 없으므로 관계 기록에 남기지 않는다.
    assert relations.commits == ()


def test_compare_rate_limit_still_stops_collection() -> None:
    routes = _capped_routes(CAPPED_PULL)
    routes[_compare_path(1)] = status_only(429)

    outcome, _ = _run(routes, COMMITS_AND_PULLS)

    assert _codes(outcome) == [FailureCode.RATE_LIMITED]
    assert _relations(outcome).stopped_during == "PULL_REQUEST_COMMITS"
    assert outcome.pull_requests[0].commits_status is DetailStatus.NOT_REACHED
    assert _capped_entry(outcome).status is DetailStatus.NOT_REACHED
    # 다 읽지 못한 PR에서 본 커밋은 소속 근거가 없으므로 관계 기록에 남기지 않는다.
    assert _relations(outcome).commits == ()


def test_oversized_compare_or_list_is_a_limit_not_a_failure() -> None:
    """2026-10-08 결정(커밋 250개 넘는 PR): 비교 응답 크기 초과는 비교 쪽수 상한처럼 받은 데까지만 쓴다."""
    # 비교 응답 크기 상한은 비교 쪽수 상한처럼 정해 둔 범위에 닿은 것이다. 250건을 모두 담은 앞쪽
    # 비교 커밋은 PR 커밋으로 더한다(2026-10-08 결정, 커밋 250개 넘는 PR).
    routes = _capped_routes(CAPPED_PULL, count=400)
    for page in (1, 2, 3):
        routes[_compare_path(page)] = _compare_page(page, total=400, next_page=True)
    routes[_compare_path(4)] = oversized()

    outcome, transport = _run(routes, COMMITS_AND_PULLS)
    entry = _capped_entry(outcome)
    assert outcome.completed and not entry.complete and _plain(entry.limits)
    assert _compare_path(5) not in transport.paths
    assert len(entry.limits) == 1 and "크기 상한" in entry.limits[0]
    assert entry.commits == tuple(sha(3000 + n) for n in range(300))

    routes = _capped_routes(CAPPED_PULL)
    routes[_compare_path(1)] = oversized()
    outcome, _ = _run(routes, COMMITS_AND_PULLS)
    _assert_only_listed_250(outcome)

    routes = _capped_routes(CAPPED_PULL)
    routes[pull_path(10)] = oversized()
    outcome, transport = _run(routes, COMMITS_AND_PULLS)
    assert outcome.completed
    assert not any("/compare/" in path for path in transport.paths)
    _assert_only_listed_250(outcome)

    routes = _capped_routes(CAPPED_PULL, count=None)
    routes[pull_commits_path(10, 2)] = oversized()
    outcome, _ = _run(routes, COMMITS_AND_PULLS)
    entry = _capped_entry(outcome)
    assert outcome.completed
    assert entry.status is DetailStatus.OVERSIZED and entry.commits == ()
    assert outcome.pull_requests[0].commits_status is DetailStatus.OVERSIZED
    # 일부 쪽만 받은 목록의 커밋은 관계 기록으로 남기지 않는다.
    assert _relations(outcome).commits == ()


# 4. 멈춤: 계획한 조회는 NOT_REACHED, 실패는 하나, 연결은 닫힌다


def test_call_limit_during_lookups_keeps_planned_targets_as_not_reached(
    caplog: pytest.LogCaptureFixture,
) -> None:
    calls_before_lookups = 4 + len(PRECEDENCE)
    limits = replace(PROPOSED_LIMITS, max_calls=calls_before_lookups + 1)

    with caplog.at_level(logging.DEBUG, logger="app.collection"):
        outcome, transport = _run(relation_routes(), limits=limits)
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert relations.stopped_during == "LOOKUPS"
    assert transport.paths == RELATION_ORDER[: calls_before_lookups + 1]
    assert transport.closed
    assert [(a.sha, a.status) for a in relations.associated] == [
        (sha(7), Lookup.EMPTY),
        (sha(5), Lookup.NOT_REACHED),
        (sha(4), Lookup.NOT_REACHED),
    ]
    # 본인 커밋 상세는 확인 중단, 다른 계정 커밋은 원래 조회하지 않는다.
    for number in DETAILS:
        assert _commit_status(outcome, number) is DetailStatus.NOT_REACHED
    assert _commit_status(outcome, 2) is DetailStatus.NOT_REQUESTED
    assert _commit_status(outcome, 20) is DetailStatus.NOT_REQUESTED
    # 이미 받은 PR 커밋 목록은 그대로 둔다.
    assert all(
        e.status is DetailStatus.FETCHED for e in relations.pull_request_commits[:4]
    )
    assert TOKEN not in repr(outcome)
    assert TOKEN not in caplog.text and REFERENCE not in caplog.text
    assert BASE not in caplog.text and sha(7) not in caplog.text
    assert "관계 조회 종료" in caplog.text
    # 다른 저장소를 기준으로 연 PR은 버리고 수만 남긴다(c7의 조회가 하나를 돌려줬다).
    assert "foreignBaseIgnored=1" in caplog.text


def test_time_limit_during_lookups_is_a_failure() -> None:
    calls_before_lookups = 4 + len(PRECEDENCE)
    limits = replace(
        PROPOSED_LIMITS,
        max_collection_time=timedelta(seconds=(calls_before_lookups + 2) * 10),
    )

    outcome, transport = _run(relation_routes(), limits=limits, seconds_per_call=10)
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.TIME_LIMIT_EXCEEDED]
    assert relations.stopped_during == "LOOKUPS"
    assert len(transport.calls) == calls_before_lookups + 2
    assert [a.status for a in relations.associated] == [
        Lookup.EMPTY,
        Lookup.FOUND,
        Lookup.NOT_REACHED,
    ]


def test_rate_limit_on_a_lookup_stops_without_retry() -> None:
    routes = relation_routes()
    routes[commit_pulls_path(5)] = status_only(429, {"retry-after": "60"})

    outcome, transport = _run(routes)
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.RATE_LIMITED]
    assert relations.stopped_during == "LOOKUPS"
    assert transport.paths[-1] == commit_pulls_path(5)
    assert set(Counter(transport.paths).values()) == {1}
    assert transport.closed
    assert [a.status for a in relations.associated] == [
        Lookup.EMPTY,
        Lookup.NOT_REACHED,
        Lookup.NOT_REACHED,
    ]


def test_stop_during_pull_request_lists_marks_unreached_lists() -> None:
    routes = relation_routes()
    routes[pull_commits_path(11)] = status_only(503)

    outcome, _ = _run(routes)
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert relations.stopped_during == "PULL_REQUEST_COMMITS"
    assert [(e.number, e.status) for e in relations.pull_request_commits] == [
        (12, DetailStatus.FETCHED),
        (10, DetailStatus.FETCHED),
        (11, DetailStatus.NOT_REACHED),
        (13, DetailStatus.NOT_REACHED),
    ]
    statuses = {pull.number: pull.commits_status for pull in outcome.pull_requests}
    assert statuses[11] is DetailStatus.NOT_REACHED
    assert statuses[13] is DetailStatus.NOT_REACHED
    # 연결 PR 조회는 계획 전이라 남기지 않는다.
    assert relations.associated == ()
    assert _commit_status(outcome, 4) is DetailStatus.NOT_REACHED


def test_stop_during_lists_has_relation_observations() -> None:
    routes = relation_routes()
    routes[LISTED_ISSUES] = status_only(500)

    outcome, _ = _run(routes)
    relations = _relations(outcome)

    assert relations.stopped_during == "LISTS"
    assert relations.default_branch == DEFAULT_BRANCH
    assert all(
        e.status is DetailStatus.NOT_REACHED for e in relations.pull_request_commits
    )
    assert all(
        pull.commits_status is DetailStatus.NOT_REACHED
        for pull in outcome.pull_requests
    )


# 5. 허용 자료 종류


def test_without_pull_request_permission_no_pull_request_calls_are_made() -> None:
    outcome, transport = _run(relation_routes(), request_with("COMMIT", "ISSUE"))
    relations = _relations(outcome)

    assert outcome.completed
    assert not any("/pulls" in path or "/compare/" in path for path in transport.paths)
    assert transport.paths == [
        BASE,
        LISTED_COMMITS,
        LISTED_ISSUES,
        *(detail_path(n) for n in (7, 6, 5, 4, 3, 1)),
    ]
    assert relations.pull_request_commits == ()
    assert relations.associated == ()
    # PR 소속을 볼 수 없으므로 본인 커밋을 모두 PR 밖으로 다룬다.
    assert relations.detail_tiers.outside_pull_requests == tuple(
        sha(n) for n in (7, 6, 5, 4, 3, 1)
    )


def test_without_commit_permission_pull_request_lists_are_still_read() -> None:
    outcome, transport = _run(relation_routes(), request_with("PULL_REQUEST", "ISSUE"))
    relations = _relations(outcome)

    assert outcome.completed
    assert transport.paths == [
        BASE,
        LISTED_PULLS,
        LISTED_ISSUES,
        *(pull_commits_path(number) for number in PRECEDENCE),
    ]
    assert outcome.commits == ()
    assert [r.sha for r in relations.commits] == [
        sha(21),
        sha(1),
        sha(6),
        sha(20),
        sha(22),
    ]
    assert all(
        r.changes_status is DetailStatus.NOT_REQUESTED for r in relations.commits
    )
    assert relations.associated == ()
    assert relations.base_branches == ()


def test_issue_listing_pull_request_items_are_still_dropped() -> None:
    routes = relation_routes()
    routes[LISTED_ISSUES] = respond(
        [issue_json(30, MEMBER), issue_listing_pull_json(10)]
    )

    outcome, _ = _run(routes)

    assert [issue.number for issue in outcome.issues] == [30]


# 6. 추가 기준 브랜치


def _branch_routes() -> dict[str, Reply]:
    return {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond([graph_commit_json(1, OTHER, parents=(999,))]),
        branch_commits_path("release%2F1.0"): respond(
            [
                graph_commit_json(80, OTHER, parents=(81,)),
                graph_commit_json(81, OTHER, parents=(999,)),
            ]
        ),
    }


def test_extra_base_branch_is_fetched_once_with_a_quoted_name() -> None:
    options = RelationOptions(("release/1.0", DEFAULT_BRANCH, "release/1.0"))

    outcome, transport = _run(_branch_routes(), request_with("COMMIT"), options=options)
    relations = _relations(outcome)

    assert outcome.completed
    assert transport.paths == [
        BASE,
        LISTED_COMMITS,
        branch_commits_path("release%2F1.0"),
    ]
    (line,) = relations.base_branches
    assert (line.name, line.head, line.complete) == ("release/1.0", sha(80), True)
    assert [record.sha for record in line.commits] == [sha(80), sha(81)]
    # 끝까지 받았으므로 기준 브랜치 한계를 남기지 않는다.
    assert outcome.shared_limits("COMMIT") == ()


BASE_BRANCH_CUT = (
    "따로 지정한 기준 브랜치 가운데 커밋을 끝까지 받지 못한 브랜치가 있어, 그 브랜치를 "
    "받아온 병합을 작업과 구별하지 못했을 수 있다"
)


@pytest.mark.parametrize("cut", ["count", "size"])
def test_extra_base_branch_cut_leaves_a_shared_limit(cut: str) -> None:
    """개수 상한(다음 쪽 있음)이나 응답 크기 상한으로 기준 브랜치를 끝까지 받지 못했다.

    브랜치 이름과 개수는 문구에 넣지 않는다. 두 브랜치가 잘려도 한계는 하나다.
    """
    limits = replace(PROPOSED_LIMITS, max_base_branch_commits=1)
    routes = _branch_routes()
    for name in ("release%2F1.0", "release%2F2.0"):
        routes[branch_commits_path(name, per_page=1)] = (
            respond([graph_commit_json(80, OTHER, parents=(81,))], next_page=True)
            if cut == "count"
            else oversized()
        )

    outcome, transport = _run(
        routes,
        request_with("COMMIT"),
        limits=limits,
        options=RelationOptions(("release/1.0", "release/2.0")),
    )
    relations = _relations(outcome)

    assert outcome.completed
    assert transport.paths.count(branch_commits_path("release%2F1.0", per_page=1)) == 1
    assert [line.complete for line in relations.base_branches] == [False, False]
    assert outcome.shared_limits("COMMIT").count(BASE_BRANCH_CUT) == 1
    assert _plain([BASE_BRANCH_CUT])
    assert "release" not in BASE_BRANCH_CUT


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (404, FailureCode.REPOSITORY_UNREACHABLE),
        (422, FailureCode.COLLECTION_FETCH_FAILED),
    ],
)
def test_missing_extra_base_branch_stops_collection(
    status: int, code: FailureCode
) -> None:
    """추가 기준 브랜치 조회 404·422도 다른 조회 오류처럼 수집 실패다."""
    routes = _branch_routes()
    routes[branch_commits_path("release%2F1.0")] = status_only(status)

    outcome, transport = _run(
        routes, request_with("COMMIT"), options=RelationOptions(("release/1.0",))
    )
    relations = _relations(outcome)

    assert _codes(outcome) == [code]
    assert relations.stopped_during == "BASE_BRANCHES"
    assert transport.paths.count(branch_commits_path("release%2F1.0")) == 1
    assert relations.base_branches == ()
    assert outcome.shared_limits("COMMIT") == ()


def test_extra_base_branch_server_error_still_stops_collection() -> None:
    routes = _branch_routes()
    routes[branch_commits_path("release%2F1.0")] = status_only(500)

    outcome, _ = _run(
        routes, request_with("COMMIT"), options=RelationOptions(("release/1.0",))
    )

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert _relations(outcome).stopped_during == "BASE_BRANCHES"


@pytest.mark.parametrize(
    "name",
    ["", "../main", "a..b", "-x", "/x", "x/", "x.lock", "a b", "a//b", "x?y", "a#b"],
)
def test_invalid_extra_base_branch_names_are_rejected(name: str) -> None:
    with pytest.raises(ValueError, match="기준 브랜치"):
        RelationOptions((name,))


def test_extra_base_branches_must_be_a_tuple() -> None:
    with pytest.raises(ValueError, match="튜플"):
        RelationOptions(["release"])  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="튜플"):
        RelationOptions("release")  # type: ignore[arg-type]


# 7. 기본 브랜치 이름은 관계 조회에서만 읽는다


def test_relation_path_requires_the_default_branch() -> None:
    routes = relation_routes()
    routes[BASE] = respond(repository_json())

    outcome, transport = _run(routes)
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert transport.paths == [BASE]
    assert relations.default_branch is None
    assert relations.stopped_during == "LISTS"


def test_existing_repository_checks_come_before_the_default_branch() -> None:
    routes = relation_routes()
    routes[BASE] = respond(repository_json(private=True))

    outcome, _ = _run(routes)

    assert _codes(outcome) == [FailureCode.REPOSITORY_UNREACHABLE]


# PR 없는 병합과 흡수 병합


# m50이 실제로 들인 커밋(c51...m50 비교): 작업 커밋 c53, 흡수 병합 m52, m50 자신.
M50_BOUNDARY = [
    graph_commit_json(53, MEMBER, parents=(51,)),
    graph_commit_json(52, MEMBER, parents=(53, 51)),
    graph_commit_json(50, OTHER, parents=(51, 52)),
]


def _merge_routes(*, rooted: bool = False) -> dict[str, Reply]:
    # m50: 본선의 PR 없는 병합(작업 브랜치 m52를 들임). m52: 작업 브랜치가 본선 c51을 받아온 흡수 병합.
    # 창 맨 아래 c54의 부모 c999는 창 밖이라 m50의 첫 부모 쪽이 열려 있다. 그래서 m50이 들인 커밋을
    # 경계 비교로 확인한다. rooted면 c54가 뿌리 커밋이라 창이 모든 이력을 담는다.
    return {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond(
            [
                graph_commit_json(50, OTHER, parents=(51, 52)),
                graph_commit_json(52, MEMBER, parents=(53, 51)),
                graph_commit_json(53, MEMBER, parents=(51,)),
                graph_commit_json(51, OTHER, parents=(54,)),
                graph_commit_json(54, OTHER, parents=() if rooted else (999,)),
            ]
        ),
        LISTED_PULLS: respond([]),
        commit_pulls_path(53): respond([]),
        commit_pulls_path(50): respond([]),
        compare_path(51, 50, 1): respond(compare_json(3, 51, M50_BOUNDARY)),
        detail_path(53): detail_reply(53, MEMBER),
    }


def test_pr_less_merge_that_brought_outside_commits_is_looked_up() -> None:
    """첫 부모 쪽이 열린 연결 PR 조회 대상 병합은 연결 PR 조회 뒤 경계를 비교한다."""
    outcome, transport = _run(_merge_routes(), request_with("COMMIT", "PULL_REQUEST"))
    relations = _relations(outcome)

    assert outcome.completed
    assert transport.paths == [
        BASE,
        LISTED_COMMITS,
        LISTED_PULLS,
        commit_pulls_path(53),
        commit_pulls_path(50),
        compare_path(51, 50, 1),
        detail_path(53),
    ]
    assert [(a.sha, a.status) for a in relations.associated] == [
        (sha(53), Lookup.EMPTY),
        (sha(50), Lookup.EMPTY),
    ]
    # 흡수 병합 m52는 PR 없는 병합 후보가 아니므로 비교하지 않는다.
    assert relations.merge_boundaries == (
        MergeBoundary(sha(50), (sha(53), sha(52), sha(50)), True, DetailStatus.FETCHED),
    )
    # 경계 비교의 커밋은 관계 기록에 넣지 않는다(소속 근거가 아니다).
    assert relations.commits == ()
    # 병합 커밋은 변경 내용을 조회하지 않는다.
    assert _commit_status(outcome, 52) is DetailStatus.NOT_REQUESTED


def test_window_with_the_whole_history_needs_no_boundary_compare() -> None:
    routes = _merge_routes(rooted=True)
    del routes[compare_path(51, 50, 1)]

    outcome, transport = _run(routes, request_with("COMMIT", "PULL_REQUEST"))

    assert outcome.completed
    assert not any("/compare/" in path for path in transport.paths)
    assert _relations(outcome).merge_boundaries == ()


def test_stop_before_merge_lookups_records_planned_merges() -> None:
    limits = replace(PROPOSED_LIMITS, max_calls=3)

    outcome, _ = _run(
        _merge_routes(), request_with("COMMIT", "PULL_REQUEST"), limits=limits
    )
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert [(a.sha, a.status) for a in relations.associated] == [
        (sha(53), Lookup.NOT_REACHED),
        (sha(50), Lookup.NOT_REACHED),
    ]
    # 계획한 경계 비교도 닿지 못한 것으로 남는다.
    assert relations.merge_boundaries == (
        MergeBoundary(sha(50), (), False, DetailStatus.NOT_REACHED),
    )


def test_boundary_compare_counts_toward_the_call_limit() -> None:
    """경계 비교도 같은 요청의 호출 상한 안에서 부른다. 상한에 걸리면 멈추고 NOT_REACHED다."""
    limits = replace(PROPOSED_LIMITS, max_calls=5)

    outcome, transport = _run(
        _merge_routes(), request_with("COMMIT", "PULL_REQUEST"), limits=limits
    )
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert relations.stopped_during == "LOOKUPS"
    assert transport.paths[-1] == commit_pulls_path(50)
    assert compare_path(51, 50, 1) not in transport.paths
    assert relations.merge_boundaries == (
        MergeBoundary(sha(50), (), False, DetailStatus.NOT_REACHED),
    )


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (404, FailureCode.REPOSITORY_UNREACHABLE),
        (422, FailureCode.COLLECTION_FETCH_FAILED),
    ],
)
def test_boundary_compare_refusal_stops_collection_without_retry(
    status: int, code: FailureCode
) -> None:
    routes = _merge_routes()
    routes[compare_path(51, 50, 1)] = status_only(status)

    outcome, transport = _run(routes, request_with("COMMIT", "PULL_REQUEST"))
    relations = _relations(outcome)

    assert _codes(outcome) == [code]
    assert relations.stopped_during == "LOOKUPS"
    assert transport.paths.count(compare_path(51, 50, 1)) == 1
    assert transport.paths[-1] == compare_path(51, 50, 1)
    assert relations.merge_boundaries == (
        MergeBoundary(sha(50), (), False, DetailStatus.NOT_REACHED),
    )


def test_boundary_compare_page_limit_is_not_complete() -> None:
    limits = replace(PROPOSED_LIMITS, max_compare_pages=1)
    routes = _merge_routes()
    routes[compare_path(51, 50, 1)] = respond(
        compare_json(3, 51, M50_BOUNDARY[:2]), next_page=True
    )

    outcome, transport = _run(
        routes, request_with("COMMIT", "PULL_REQUEST"), limits=limits
    )

    assert outcome.completed
    assert transport.paths.count(compare_path(51, 50, 1)) == 1
    assert compare_path(51, 50, 2) not in transport.paths
    assert _relations(outcome).merge_boundaries == (
        MergeBoundary(sha(50), (sha(53), sha(52)), False, DetailStatus.FETCHED),
    )


@pytest.mark.parametrize(
    "reply",
    [
        # 응답 크기 상한.
        oversized(),
        # 전체 수 전에 끝났다(다음 쪽 없음).
        respond(compare_json(3, 51, M50_BOUNDARY[:2])),
        # 시작 커밋이 첫 부모가 아니다.
        respond(compare_json(3, 54, M50_BOUNDARY)),
        # 병합 커밋이 비교 범위에 없다.
        respond(
            compare_json(
                3,
                51,
                [*M50_BOUNDARY[:2], graph_commit_json(55, OTHER, parents=(52,))],
            )
        ),
    ],
    ids=["oversized", "ends-early", "other-base", "merge-missing"],
)
def test_boundary_compare_that_does_not_prove_the_range_is_not_complete(
    reply: Reply,
) -> None:
    routes = _merge_routes()
    routes[compare_path(51, 50, 1)] = reply

    outcome, transport = _run(routes, request_with("COMMIT", "PULL_REQUEST"))
    (boundary,) = _relations(outcome).merge_boundaries

    assert outcome.completed
    assert transport.paths.count(compare_path(51, 50, 1)) == 1
    assert not boundary.complete and not boundary.usable


def _run_boundary(compared: Reply) -> tuple[CollectionOutcome, list[str]]:
    routes = _merge_routes()
    routes[compare_path(51, 50, 1)] = compared
    outcome, transport = _run(routes, request_with("COMMIT", "PULL_REQUEST"))
    return outcome, transport.paths


@pytest.mark.parametrize(
    "reply",
    [
        respond(
            {
                key: value
                for key, value in compare_json(3, 51, M50_BOUNDARY).items()
                if key != "merge_base_commit"
            }
        ),
        respond(
            {**compare_json(3, 51, M50_BOUNDARY), "merge_base_commit": {"sha": "zz"}}
        ),
    ],
    ids=["base-missing", "base-malformed"],
)
def test_boundary_compare_without_a_start_commit_is_like_another_start(
    reply: Reply,
) -> None:
    """수가 맞고 병합 커밋이 있어도 시작 커밋이 없거나 형식이 틀리면 다른 시작 커밋과 같이 본다."""
    outcome, paths = _run_boundary(reply)
    other, other_paths = _run_boundary(respond(compare_json(3, 54, M50_BOUNDARY)))

    assert outcome.completed and other.completed
    assert _relations(outcome).merge_boundaries == (
        MergeBoundary(
            sha(50), tuple(sha(n) for n in (53, 52, 50)), False, DetailStatus.FETCHED
        ),
    )
    assert _relations(outcome) == _relations(other)
    assert paths == other_paths


def _window(*entries: tuple[int, tuple[int, ...]]) -> list[CommitRecord]:
    return [
        normalize.commit(
            graph_commit_json(n, OTHER, parents=p), DetailStatus.NOT_REQUESTED
        )
        for n, p in entries
    ]


def test_window_graph_definitions() -> None:
    window = _window((62, (61, 60)), (60, (63, 70)), (63, (61,)), (61, (999,)))
    graph = WindowGraph.of(window)

    assert graph.head == sha(62)
    assert graph.mainline == {sha(62), sha(61)}
    # 창 안 조상이 늘 앞선다.
    assert graph.parents_first() == {sha(61): 0, sha(63): 1, sha(60): 2, sha(62): 3}
    brought = graph.brought_in(sha(62))
    assert brought.commits == {sha(60), sha(63)}
    # m60의 둘째 부모 r70은 창 밖이라 m62가 들인 커밋을 다 보지 못했다.
    assert not brought.complete
    # 첫 부모 c61의 부모 c999도 창 밖이라 첫 부모가 이미 담은 커밋을 다 빼지 못했을 수 있다.
    assert brought.first_side_open
    assert graph.absorption_merges() == frozenset()
    # 뿌리까지 담은 창에서는 첫 부모 쪽이 닫혀 있다.
    rooted = WindowGraph.of(_window((9, (2, 3)), (3, (1,)), (2, (1,)), (1, ())))
    assert rooted.brought_in(sha(9)) == BroughtIn(frozenset({sha(3)}), True, False)

    line = BaseBranchLine(
        "release",
        sha(70),
        tuple(
            normalize.commit(
                graph_commit_json(n, OTHER, parents=p), DetailStatus.NOT_REQUESTED
            )
            for n, p in ((70, (71,)), (71, (999,)))
        ),
        complete=True,
    )
    chains = base_line_chains(graph, [line])
    assert chains == (BaseChain(frozenset({sha(70), sha(71)}), True),)
    # 브랜치를 끝까지 받지 못했어도 사슬이 받은 범위 안의 뿌리 커밋에서 끝나면 끝까지 따라간 것이다.
    rooted_line = replace(
        line,
        commits=(
            line.commits[0],
            normalize.commit(
                graph_commit_json(71, OTHER, parents=()), DetailStatus.NOT_REQUESTED
            ),
        ),
        complete=False,
    )
    assert base_line_chains(graph, [rooted_line])[0].complete
    assert not base_line_chains(graph, [replace(line, complete=False)])[0].complete
    # 추가 기준 브랜치를 받아온 병합은 흡수 병합이다.
    absorbed = graph.absorption_merges(chain.commits for chain in chains)
    assert absorbed == {sha(60)}
    # 흡수 병합 m60이 들인 커밋(창 밖 r70만 들였다).
    assert graph.absorbed_commits(chain.commits for chain in chains) == {
        sha(60): frozenset()
    }
    assert graph.candidate_merges(explained=(), absorbed=absorbed) == (sha(62),)
    assert graph.candidate_merges(explained=(sha(62),), absorbed=absorbed) == ()


def test_parents_first_orders_unrelated_commits_by_commit_time_then_sha() -> None:
    """조상 관계가 없는 커밋끼리는 목록 위치가 아니라 (커밋 시각, SHA)로 둔다."""
    early, late = _window((7, (1,)), (4, (1,)))
    # c7이 c4보다 SHA는 크지만 먼저 커밋됐다. c5는 c4와 시각이 같고 SHA가 크다.
    early = replace(early, committed_at=late.committed_at - timedelta(minutes=1))
    (same,) = _window((5, (1,)))
    same = replace(same, committed_at=late.committed_at)
    (root,) = _window((1, ()))
    commits = [early, late, same, root]
    expected = {sha(1): 0, sha(7): 1, sha(4): 2, sha(5): 3}

    for order in itertools.permutations(commits):
        assert WindowGraph.of(order).parents_first() == expected


def test_window_without_a_unique_head_confirms_no_merges() -> None:
    window = [
        normalize.commit(
            graph_commit_json(n, MEMBER, parents=p), DetailStatus.NOT_REQUESTED
        )
        for n, p in ((90, (92, 91)), (89, (92,)), (91, (92,)), (92, (999,)))
    ]
    graph = WindowGraph.of(window)

    assert graph.head is None
    assert graph.mainline == frozenset()
    assert (
        merge_lookup_targets(
            window,
            pull_request_commits=(),
            merge_commit_shas=(),
            base_lines=(),
            outside=frozenset({sha(91)}),
        )
        == ()
    )


def test_lookup_targets_skip_explained_merge_and_other_commits() -> None:
    window = [
        normalize.commit(graph_commit_json(n, a, parents=p), DetailStatus.NOT_REQUESTED)
        for n, a, p in (
            (5, MEMBER, (4, 3)),
            (4, MEMBER, (3,)),
            (3, OTHER, (2,)),
            (2, MEMBER, (1,)),
            (1, MEMBER, (999,)),
        )
    ]

    assert lookup_targets(
        window,
        MEMBER,
        pull_request_commits=[(sha(2),)],
        merge_commit_shas=[sha(1)],
    ) == (sha(4),)


def test_pull_request_precedence_puts_earliest_merged_first() -> None:
    pulls = [
        normalize.pull_request(item, REPOSITORY, DetailStatus.NOT_REQUESTED)
        for item in (
            relation_pull_json(5, MEMBER, state="open"),
            relation_pull_json(4, MEMBER, merged_minute=9),
            relation_pull_json(3, MEMBER, state="closed"),
            relation_pull_json(2, MEMBER, merged_minute=7),
            relation_pull_json(1, MEMBER, merged_minute=9),
        )
    ]

    assert [p.number for p in pull_request_precedence(pulls)] == [2, 1, 4, 3, 5]


# 같은 변경 확인·단위 나누기에 꼭 필요한 상세(필수 조회)

NEEDED = [31, 33, 21, 8, 9, 19]


def needed_routes() -> dict[str, Reply]:
    # c8은 c21의 cherry-pick, PR #32는 병합 없이 닫힌 #30을 가리키는 재제출,
    # PR #10의 본인 커밋은 서로 다른 이슈 두 개를 가리킨다.
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond(
            [
                graph_commit_json(
                    8,
                    MEMBER,
                    parents=(2,),
                    message=f"고침\n\n(cherry picked from commit {sha(21)})",
                ),
                graph_commit_json(2, OTHER, parents=(999,)),
            ]
        ),
        LISTED_PULLS: respond(
            [
                relation_pull_json(
                    32,
                    MEMBER,
                    created=40,
                    merged_minute=41,
                    body="#30을 기준 브랜치에 맞춰 다시 올립니다",
                    head=33,
                ),
                relation_pull_json(30, OTHER, state="closed", created=30, head=31),
                relation_pull_json(
                    12, MEMBER, merged_minute=13, merge_commit=99, head=21
                ),
                relation_pull_json(10, MEMBER, merged_minute=11, head=19),
            ]
        ),
        LISTED_ISSUES: respond([issue_json(70, OTHER), issue_json(71, OTHER)]),
        pull_commits_path(10): respond(
            [
                graph_commit_json(
                    9, MEMBER, parents=(2,), message="이슈 #70과 #71 작업"
                ),
                graph_commit_json(19, OTHER, parents=(9,)),
            ]
        ),
        pull_commits_path(12): respond([graph_commit_json(21, MEMBER, parents=(2,))]),
        pull_commits_path(32): respond([graph_commit_json(33, MEMBER, parents=(2,))]),
        pull_commits_path(30): respond([graph_commit_json(31, OTHER, parents=(2,))]),
        commit_pulls_path(8): respond([]),
    }
    for number in NEEDED:
        routes[detail_path(number)] = detail_reply(number, MEMBER)
    return routes


NEEDED_CALLS_BEFORE_DETAILS = 4 + 4 + 1


def test_relation_pairs_and_split_units_are_needed_details() -> None:
    outcome, transport = _run(needed_routes())
    relations = _relations(outcome)

    assert outcome.completed
    assert relations.detail_tiers.needed == tuple(sha(n) for n in NEEDED)
    assert relations.detail_tiers.outside_pull_requests == ()
    assert relations.detail_tiers.evidence == ()
    assert transport.paths[NEEDED_CALLS_BEFORE_DETAILS:] == [
        detail_path(n) for n in NEEDED
    ]
    # 단위 나누기를 보려고 다른 계정 커밋(c19·c31)의 변경 내용도 받는다.
    assert _commit_status(outcome, 19) is DetailStatus.FETCHED
    assert _commit_status(outcome, 2) is DetailStatus.NOT_REQUESTED


def test_needed_details_ignore_the_soft_guard_and_stop_at_the_hard_cap() -> None:
    limits = replace(PROPOSED_LIMITS, max_calls=NEEDED_CALLS_BEFORE_DETAILS + 2)

    outcome, transport = _run(needed_routes(), limits=limits)
    relations = _relations(outcome)

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert relations.stopped_during == "DETAILS"
    assert transport.paths[NEEDED_CALLS_BEFORE_DETAILS:] == [
        detail_path(31),
        detail_path(33),
    ]
    assert _commit_status(outcome, 31) is DetailStatus.FETCHED
    for number in (21, 8, 9, 19):
        assert _commit_status(outcome, number) is DetailStatus.NOT_REACHED
    assert _commit_status(outcome, 2) is DetailStatus.NOT_REQUESTED


# 같은 변경 비교 전의 파일 모드 확인(diff 형식 조회)

SAME_PATCH = "@@ -1 +1 @@\n-old\n+new"


def _detail_with(number: int, patch: str, path: str = "app.py") -> dict[str, Any]:
    return commit_detail_json(number, MEMBER, [file_json(path, 1, 1, patch)])


def mode_routes() -> dict[str, Reply]:
    """c8은 c21의 cherry-pick이고 내용이 같다. 재제출 #32·#30의 c33·c31은 내용이 다르다."""
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond(
            [
                graph_commit_json(
                    8,
                    MEMBER,
                    parents=(2,),
                    message=f"고침\n\n(cherry picked from commit {sha(21)})",
                ),
                graph_commit_json(2, OTHER, parents=(999,)),
            ]
        ),
        LISTED_PULLS: respond(
            [
                relation_pull_json(
                    32,
                    MEMBER,
                    created=40,
                    merged_minute=41,
                    body="#30을 다시 올립니다",
                    head=33,
                ),
                relation_pull_json(30, OTHER, state="closed", created=30, head=31),
                relation_pull_json(
                    12, MEMBER, merged_minute=13, merge_commit=99, head=21
                ),
            ]
        ),
        LISTED_ISSUES: respond([]),
        pull_commits_path(32): respond([graph_commit_json(33, MEMBER, parents=(2,))]),
        pull_commits_path(30): respond([graph_commit_json(31, OTHER, parents=(2,))]),
        pull_commits_path(12): respond([graph_commit_json(21, MEMBER, parents=(2,))]),
        commit_pulls_path(8): respond([]),
        detail_path(31): respond(_detail_with(31, "@@ -1 +1 @@\n-a\n+b", "b.py")),
        detail_path(33): respond(_detail_with(33, "@@ -1 +1 @@\n-a\n+c", "b.py")),
    }
    for number in (21, 8):
        detail = _detail_with(number, SAME_PATCH)
        routes[detail_path(number)] = respond(detail)
        routes[detail_diff_path(number)] = diff_reply(diff_text(detail["files"]))
    return routes


# 목록 4 + PR 커밋 목록 3 + 연결 PR 조회 1(c8).
MODE_CALLS_BEFORE_DETAILS = 4 + 3 + 1
MODE_DETAILS = [detail_path(n) for n in (31, 33, 21, 8)]


def _mode_checks(outcome: CollectionOutcome) -> list[tuple[str, DetailStatus, bool]]:
    return [
        (check.sha, check.status, check.matched)
        for check in _relations(outcome).mode_checks
    ]


def _mode_lines(outcome: CollectionOutcome, number: int) -> tuple[str, ...] | None:
    records = (*outcome.commits, *_relations(outcome).commits)
    record = next(r for r in records if r.sha == sha(number))
    assert record.changes is not None
    (entry,) = record.changes.files
    return entry.mode_lines


def test_mode_check_goes_only_to_related_pairs_with_the_same_content() -> None:
    outcome, transport = _run(mode_routes())

    assert outcome.completed
    assert _relations(outcome).detail_tiers.needed == tuple(
        sha(n) for n in (31, 33, 21, 8)
    )
    # 필수 상세 바로 뒤에, 내용이 같은 cherry-pick 쌍의 양쪽만 diff 형식으로 한 번씩 부른다.
    assert transport.paths[MODE_CALLS_BEFORE_DETAILS:] == [
        *MODE_DETAILS,
        detail_diff_path(21),
        detail_diff_path(8),
    ]
    accepts = [call.headers["Accept"] for call in transport.calls]
    assert accepts[-2:] == ["application/vnd.github.diff"] * 2
    assert set(accepts[:-2]) == {"application/vnd.github+json"}
    assert _mode_checks(outcome) == [
        (sha(21), DetailStatus.FETCHED, True),
        (sha(8), DetailStatus.FETCHED, True),
    ]
    assert _mode_lines(outcome, 21) == () and _mode_lines(outcome, 8) == ()
    # 내용이 다른 재제출 쌍은 모드를 보지 않는다.
    assert _mode_lines(outcome, 31) is None and _mode_lines(outcome, 33) is None


def test_mode_check_counts_toward_the_call_limit() -> None:
    limits = replace(PROPOSED_LIMITS, max_calls=MODE_CALLS_BEFORE_DETAILS + 5)

    outcome, transport = _run(mode_routes(), limits=limits)

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert _relations(outcome).stopped_during == "DETAILS"
    assert transport.paths[MODE_CALLS_BEFORE_DETAILS:] == [
        *MODE_DETAILS,
        detail_diff_path(21),
    ]
    assert _mode_checks(outcome) == [
        (sha(21), DetailStatus.FETCHED, True),
        (sha(8), DetailStatus.NOT_REACHED, False),
    ]
    assert _mode_lines(outcome, 8) is None


def test_stop_before_mode_checks_marks_the_received_side_unreached() -> None:
    """필수 상세를 다 받기 전에 멈추면, 받은 쪽은 끝까지 수집했다면 모드를 확인했을 수 있다."""
    limits = replace(PROPOSED_LIMITS, max_calls=MODE_CALLS_BEFORE_DETAILS + 3)

    outcome, transport = _run(mode_routes(), limits=limits)

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert transport.paths[MODE_CALLS_BEFORE_DETAILS:] == MODE_DETAILS[:3]
    assert _commit_status(outcome, 8) is DetailStatus.NOT_REACHED
    assert _mode_checks(outcome) == [(sha(21), DetailStatus.NOT_REACHED, False)]


def resubmission_mode_routes(
    old: Mapping[int, str], new: Mapping[int, str]
) -> dict[str, Reply]:
    """병합된 #32가 닫힌 #30을 다시 올렸다. 커밋 번호마다 app.py의 patch를 정한다(목록 순서)."""
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond([graph_commit_json(2, OTHER, parents=(999,))]),
        LISTED_PULLS: respond(
            [
                relation_pull_json(
                    32,
                    MEMBER,
                    created=40,
                    merged_minute=41,
                    body="#30을 다시 올립니다",
                    head=[*new][-1],
                ),
                relation_pull_json(
                    30, MEMBER, state="closed", created=30, head=[*old][-1]
                ),
            ]
        ),
        LISTED_ISSUES: respond([]),
    }
    for number, commits in ((32, new), (30, old)):
        routes[pull_commits_path(number)] = respond(
            [graph_commit_json(n, MEMBER, parents=(2,)) for n in commits]
        )
    for number, patch in (*old.items(), *new.items()):
        detail = _detail_with(number, patch)
        routes[detail_path(number)] = respond(detail)
        routes[detail_diff_path(number)] = diff_reply(diff_text(detail["files"]))
    return routes


# 목록 4 + PR 커밋 목록 2.
RESUBMISSION_CALLS_BEFORE_DETAILS = 4 + 2
OTHER_PATCH = "@@ -1 +1 @@\n-old\n+other"
THIRD_PATCH = "@@ -1 +1 @@\n-old\n+third"


def test_mode_checks_follow_each_earlier_commit_and_then_its_pairs() -> None:
    """재제출 양쪽에 커밋이 여럿이면 앞쪽 커밋 순이고, 그 바로 뒤에 값이 같은 뒤쪽 커밋을 둔다."""
    routes = resubmission_mode_routes(
        {41: SAME_PATCH, 42: OTHER_PATCH}, {43: OTHER_PATCH, 44: SAME_PATCH}
    )

    outcome, transport = _run(routes)

    assert outcome.completed
    order = (41, 44, 42, 43)
    assert transport.paths[RESUBMISSION_CALLS_BEFORE_DETAILS:] == [
        *(detail_path(n) for n in (41, 42, 43, 44)),
        *(detail_diff_path(n) for n in order),
    ]
    assert _mode_checks(outcome) == [
        (sha(n), DetailStatus.FETCHED, True) for n in order
    ]


def test_stop_before_mode_checks_keeps_the_order_of_earlier_commits() -> None:
    """필수 상세 도중에 멈추면, 받은 앞쪽 커밋마다 그 커밋과 값이 같은 뒤쪽 커밋을 바로 뒤에 둔다.

    55의 변경 내용을 받지 못해 52는 값이 같은 상대가 없어도 넣는다. 54는 값이 같은 앞쪽 커밋도,
    받지 못한 앞쪽 커밋도 없어 넣지 않는다.
    """
    routes = resubmission_mode_routes(
        {51: SAME_PATCH, 52: THIRD_PATCH},
        {53: SAME_PATCH, 54: OTHER_PATCH, 55: OTHER_PATCH},
    )
    limits = replace(PROPOSED_LIMITS, max_calls=RESUBMISSION_CALLS_BEFORE_DETAILS + 4)

    outcome, transport = _run(routes, limits=limits)

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert transport.paths[RESUBMISSION_CALLS_BEFORE_DETAILS:] == [
        detail_path(n) for n in (51, 52, 53, 54)
    ]
    assert _commit_status(outcome, 55) is DetailStatus.NOT_REACHED
    assert _mode_checks(outcome) == [
        (sha(n), DetailStatus.NOT_REACHED, False) for n in (51, 53, 52)
    ]


def test_stop_among_many_resubmissions_does_not_pair_every_commit() -> None:
    """닫힌 PR 10개를 병합된 PR 10개가 모두 다시 올렸다고 적었다(PR마다 커밋 200개).

    필수 상세 첫 조회 뒤 호출 상한에 걸려 멈춘다. 두 PR의 커밋 쌍을 모두 만들면 400만 쌍(약
    250 MiB)이라, 상한 실패 대신 작업 프로세스가 메모리 부족으로 끝날 수 있었다. 쌍을 만들지 않고
    받은 커밋 하나만 모드 확인 대상으로 남긴다.
    """
    closed, merged = range(1, 11), range(11, 21)
    commits = {
        number: [number * 1000 + i for i in range(200)] for number in (*closed, *merged)
    }
    references = " ".join(f"#{number}" for number in closed)
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond([graph_commit_json(2, OTHER, parents=(999,))]),
        LISTED_PULLS: respond(
            [
                *(
                    relation_pull_json(
                        number,
                        MEMBER,
                        created=100 + number,
                        merged_minute=200 + number,
                        body=f"다시 올립니다: {references}",
                        head=commits[number][-1],
                    )
                    for number in merged
                ),
                *(
                    relation_pull_json(
                        number,
                        MEMBER,
                        state="closed",
                        created=number,
                        head=commits[number][-1],
                    )
                    for number in closed
                ),
            ]
        ),
        LISTED_ISSUES: respond([]),
    }
    for number, numbers in commits.items():
        for page in (1, 2):
            routes[pull_commits_path(number, page)] = respond(
                [
                    graph_commit_json(n, MEMBER, parents=(2,))
                    for n in numbers[(page - 1) * 100 : page * 100]
                ],
                next_page=page == 1,
            )
    first = commits[1][0]
    routes[detail_path(first)] = respond(_detail_with(first, SAME_PATCH))
    # 목록 4 + PR 20개의 커밋 목록 두 쪽씩 + 필수 상세 하나.
    limits = replace(PROPOSED_LIMITS, max_calls=4 + 20 * 2 + 1)

    if tracemalloc.is_tracing():
        pytest.skip("이미 메모리를 추적 중이면 최고값에 앞선 할당이 섞인다")
    tracemalloc.start()
    try:
        outcome, transport = _run(routes, limits=limits)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert _relations(outcome).stopped_during == "DETAILS"
    assert transport.paths[-1] == detail_path(first)
    assert _mode_checks(outcome) == [(sha(first), DetailStatus.NOT_REACHED, False)]
    assert peak < 64 * 2**20


@pytest.mark.parametrize(
    "reply",
    [
        pytest.param(oversized(), id="oversized"),
        pytest.param(
            diff_reply(diff_text([file_json("other.py", 1, 1, SAME_PATCH)])),
            id="other-path",
        ),
        pytest.param(
            diff_reply(
                b"diff --git a/old.py b/app.py\nsimilarity index 90%\n"
                b"rename from old.py\nrename to app.py\n"
            ),
            id="rename",
        ),
        pytest.param(diff_reply(b"not a diff\n"), id="not-a-diff"),
    ],
)
def test_diff_that_cannot_be_matched_leaves_the_mode_unobserved(
    reply: Reply,
) -> None:
    routes = mode_routes()
    routes[detail_diff_path(8)] = reply

    outcome, transport = _run(routes)

    assert outcome.completed and outcome.failures == ()
    assert transport.paths.count(detail_diff_path(8)) == 1
    status = (
        DetailStatus.OVERSIZED
        if isinstance(reply, HttpResponse) and reply.oversized
        else DetailStatus.FETCHED
    )
    assert _mode_checks(outcome)[1] == (sha(8), status, False)
    assert _mode_lines(outcome, 8) is None
    assert _mode_lines(outcome, 21) == ()


@pytest.mark.parametrize(
    ("reply", "code"),
    [
        (status_only(429), FailureCode.RATE_LIMITED),
        (status_only(404), FailureCode.REPOSITORY_UNREACHABLE),
        (status_only(406), FailureCode.COLLECTION_FETCH_FAILED),
        # GitHub 문서상 큰 diff는 시간 초과로 5xx를 줄 수 있다. 다른 조회 오류처럼 수집 실패다.
        (status_only(502), FailureCode.COLLECTION_FETCH_FAILED),
        (
            TransportTimeout("합성: 응답 대기 시간 초과"),
            FailureCode.COLLECTION_FETCH_FAILED,
        ),
    ],
    ids=["429", "404", "406", "502", "timeout"],
)
def test_mode_check_error_stops_collection_without_retry(
    reply: Reply, code: FailureCode
) -> None:
    """파일 모드 확인(diff 형식 조회)의 오류 응답·시간 초과는 다시 부르지 않고 수집을 멈춘다.

    어느 상태 코드가 올지는 실제 GitHub에서 확인하지 않았다(#121 실측). 여기서는 200이 아닌 응답과
    시간 초과를 모두 같은 규칙으로 다루는지 본다.
    """
    routes = mode_routes()
    routes[detail_diff_path(21)] = reply

    outcome, transport = _run(routes)

    assert _codes(outcome) == [code]
    assert _relations(outcome).stopped_during == "DETAILS"
    assert transport.paths[MODE_CALLS_BEFORE_DETAILS:] == [
        *MODE_DETAILS,
        detail_diff_path(21),
    ]
    assert _mode_checks(outcome) == [
        (sha(21), DetailStatus.NOT_REACHED, False),
        (sha(8), DetailStatus.NOT_REACHED, False),
    ]


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        (b"", {}),
        (
            b"diff --git a/a.py b/a.py\nindex 1..2 100644\n--- a/a.py\n+++ b/a.py\n"
            b"@@ -1 +1 @@\n-diff --git a/x b/x\n+old mode 100644\n",
            {"a.py": ()},
        ),
        (
            b"diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n"
            b"diff --git a/new file.sh b/new file.sh\nnew file mode 100755\n"
            b"index 0000000..e69de29\n",
            {
                "run.sh": ("old mode 100644", "new mode 100755"),
                "new file.sh": ("new file mode 100755",),
            },
        ),
        (
            b'diff --git "a/\\355\\225\\234\\tx" "b/\\355\\225\\234\\tx"\n'
            b"deleted file mode 100644\n",
            {"한\tx": ("deleted file mode 100644",)},
        ),
    ],
    ids=["empty", "hunk-lines-are-not-read", "mode-only-and-empty-add", "quoted"],
)
def test_diff_file_modes_reads_only_file_headers(
    body: bytes, expected: dict[str, tuple[str, ...]]
) -> None:
    assert normalize.diff_file_modes(body) == expected


@pytest.mark.parametrize(
    "body",
    [
        b"index 1..2\ndiff --git a/a b/a\n",
        b"diff --git a/a b/b\n",
        b"diff --git a/a b/a\ndiff --git a/a b/a\n",
        b"diff --git a/a b/a\nnew file mode 10644\n",
        b"diff --git a/a b/a\nnew file mode 100644\r\n",
        b"diff --git a/a b/a\nBinary files /dev/null and b/a differ\n",
        b"diff --git a/a b/a\ndissimilarity index 80%\n",
        b'diff --git "a/a\\q" "b/a\\q"\n',
        b'diff --git "a/a\\400" "b/a\\400"\n',
        b'diff --git "a/a" b/a\n',
        b"diff --git a/\xff b/\xff\n",
        b"diff --git a/ b/\n",
    ],
    ids=[
        "leading-line",
        "two-paths",
        "duplicate",
        "short-mode",
        "crlf",
        "binary",
        "dissimilarity",
        "bad-escape",
        "octal-overflow",
        "mixed-quotes",
        "not-utf8",
        "empty-path",
    ],
)
def test_diff_file_modes_rejects_headers_it_cannot_match(body: bytes) -> None:
    assert normalize.diff_file_modes(body) is None


def test_pull_request_base_sha_is_optional() -> None:
    item = relation_pull_json(10, MEMBER)
    item["base"] = {**item["base"], "sha": "not-a-sha"}

    record = normalize.pull_request(item, REPOSITORY, DetailStatus.NOT_REQUESTED)

    assert record.base_sha is None
    assert normalize.pull_request(
        relation_pull_json(10, MEMBER, base_commit=7),
        REPOSITORY,
        DetailStatus.NOT_REQUESTED,
    ).base_sha == sha(7)


# 근거 문구: 연동 계정 기록에 "작성한 커밋이 아니라"를 쓰지 않는다


def _own_record_limits(outcome: CollectionOutcome) -> list[str]:
    records = (*outcome.commits, *_relations(outcome).commits)
    own = [r for r in records if MEMBER.same_account(r.author)]
    assert own
    return [
        limit
        for record in own
        for limit in outcome.evidence_for(record).coverage_limits
    ]


def test_own_merge_commit_evidence_does_not_say_it_is_someone_elses() -> None:
    outcome, _ = _run(_merge_routes(), request_with("COMMIT", "PULL_REQUEST"))

    merge = next(r for r in outcome.commits if r.sha == sha(52))
    assert merge.changes_status is DetailStatus.NOT_REQUESTED
    limits = _own_record_limits(outcome)
    assert not any("아니라" in limit for limit in limits)
    assert "병합 커밋이라 변경 내용을 조회하지 않았다" in (
        outcome.evidence_for(merge).coverage_limits
    )


def test_own_commits_without_commit_permission_do_not_say_someone_elses() -> None:
    """다른 계정 커밋의 문구는 2026-10-08 팀장 결정(본인 기여의 뜻)대로 '작성자로 기록된'이다."""
    outcome, _ = _run(relation_routes(), request_with("PULL_REQUEST", "ISSUE"))

    limits = _own_record_limits(outcome)
    assert not any("아니라" in limit for limit in limits)
    assert "커밋 조회가 허용되지 않은 요청이라 변경 내용을 조회하지 않았다" in limits
    # 다른 계정 커밋의 문구는 그대로다.
    other = next(r for r in _relations(outcome).commits if r.sha == sha(20))
    assert "연동 계정이 작성자로 기록된 커밋이 아니라 변경 내용을 조회하지 않았다" in (
        outcome.evidence_for(other).coverage_limits
    )


def test_own_commit_left_unplanned_never_says_someone_elses() -> None:
    """두 수집 경로는 본인 커밋을 늘 받았거나 범위 밖·수집 중단으로 표시한다. 표시가 빠진 기록이
    생겨도 근거가 "작성한 커밋이 아니라"라고 잘못 말하지 않는다."""
    outcome, _ = _run(relation_routes())
    own = next(r for r in outcome.commits if MEMBER.same_account(r.author))
    unplanned = replace(own, changes=None, changes_status=DetailStatus.NOT_REQUESTED)

    limits = outcome.evidence_for(unplanned).coverage_limits

    assert "변경 내용 조회 대상으로 정하지 않아 변경 내용을 조회하지 않았다" in limits
    assert not any("아니라" in limit for limit in limits)


def test_relation_outcome_own_records_never_carry_the_not_own_texts() -> None:
    outcome, _ = _run(relation_routes())

    assert not any("아니라" in limit for limit in _own_record_limits(outcome))
    for pull in (
        *outcome.pull_requests,
        *_relations(outcome).pull_requests_from_lookups,
    ):
        assert not any(
            "아니라" in limit for limit in outcome.evidence_for(pull).coverage_limits
        )


# 재제출 관계의 참조는 제목과 본문을 따로 읽는다


def test_default_resubmission_reads_title_and_body_separately() -> None:
    old, new = (
        normalize.pull_request(item, REPOSITORY, DetailStatus.NOT_REQUESTED)
        for item in (
            relation_pull_json(30, OTHER, state="closed", created=30),
            relation_pull_json(
                32,
                MEMBER,
                created=40,
                merged_minute=41,
                # 제목의 짝 없는 백틱을 본문과 이어 읽으면 #30이 코드 안으로 들어간다.
                title="파서 `고침",
                body="#30을 다시 올립니다 `x`",
            ),
        )
    )
    check = default_resubmission(REPOSITORY)

    assert check(old, new)
    assert not check(new, old)
    # 상태·순서 조건이 맞지 않으면 본문이 가리켜도 관계가 아니다.
    reopened = replace(old, state="open")
    assert not default_resubmission(REPOSITORY)(reopened, new)


@pytest.mark.parametrize(
    ("old_item", "new_item"),
    [
        # 병합되지 않은 PR이 병합된 PR보다 나중에 만들어졌다.
        (
            relation_pull_json(30, OTHER, state="closed", created=45),
            relation_pull_json(32, MEMBER, created=40, merged_minute=50),
        ),
        # 둘 다 병합되지 않았다.
        (
            relation_pull_json(30, OTHER, state="closed", created=30),
            relation_pull_json(32, MEMBER, state="closed", created=40),
        ),
        # 만든 시각이 같다(나중에 만들어진 것이 아니다).
        (
            relation_pull_json(30, OTHER, state="closed", created=40),
            relation_pull_json(32, MEMBER, created=40, merged_minute=41),
        ),
    ],
    ids=["unmerged-created-later", "both-unmerged", "same-creation-time"],
)
def test_resubmission_shape_needs_a_later_merged_pull_request(
    old_item: dict[str, object], new_item: dict[str, object]
) -> None:
    """작업 단위 문서: 둘 다 병합되지 않았거나 병합되지 않은 PR이 나중에 만들어졌으면 재제출이 아니다."""
    old, new = (
        normalize.pull_request(
            {**item, "body": "#30을 다시 올립니다"},
            REPOSITORY,
            DetailStatus.NOT_REQUESTED,
        )
        for item in (old_item, new_item)
    )

    assert not resubmission_shape(old, new)
    assert not default_resubmission(REPOSITORY)(old, new)
