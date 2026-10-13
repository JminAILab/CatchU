"""연결 PR 묶음 조회(#267): 계획 순서의 묶음, 묶음 단위 적용, 단계 분리, 점수 소진.

관계 조회 전체(`collect(..., relations=RelationOptions())`)를 합성 GitHub 응답으로 돌려 확인한다.
따로 적지 않으면 제안 상한(PROPOSED_LIMITS, 묶음 100개)이다. 실제 GitHub GraphQL 연결은 검증하지
않았다.
"""

from collections import Counter
from collections.abc import Callable, Iterable, Sequence
from dataclasses import replace
from typing import Any

import pytest
from github_synthetic import (
    BASE,
    LISTED_COMMITS,
    LISTED_PULLS,
    MEMBER,
    OMIT,
    OTHER,
    REPOSITORY,
    FakeClock,
    FakeTransport,
    Reply,
    StaticCredentials,
    StaticSelections,
    associated_key,
    detail_path,
    detail_reply,
    graph_commit_json,
    graphql_pull_node,
    graphql_reply,
    graphql_route,
    pull_commits_path,
    relation_pull_json,
    relation_repository_json,
    request_with,
    respond,
    sha,
    standard_rate_limit,
)

from app.collection import (
    PROPOSED_LIMITS,
    CollectionLimits,
    CollectionOutcome,
    DetailStatus,
    FailureCode,
    Lookup,
    RelationObservations,
    RelationOptions,
    collect,
)
from app.collection.gateway import GraphQLUsage

# 이슈는 묶음 조회와 무관하므로 커밋·PR만 허용한 요청으로 돈다.
REQUEST = request_with("COMMIT", "PULL_REQUEST")
SECOND_PAGE = f"{BASE}/commits?per_page=100&page=2"


def _run(
    routes: dict[str, Reply],
    *,
    limits: CollectionLimits = PROPOSED_LIMITS,
    rate_limit: Callable[[int], Any] | None = None,
) -> tuple[CollectionOutcome, FakeTransport, RelationObservations]:
    clock = FakeClock()
    transport = FakeTransport(routes, clock=clock)
    if rate_limit is not None:
        transport.rate_limit = rate_limit
    outcome = collect(
        REQUEST,
        credentials=StaticCredentials(),
        selections=StaticSelections(),
        open_transport=lambda: transport,
        clock=clock,
        limits=limits,
        relations=RelationOptions(),
    )
    assert outcome.relations is not None
    return outcome, transport, outcome.relations


def _codes(outcome: CollectionOutcome) -> list[FailureCode]:
    return [failure.code for failure in outcome.failures]


def _lookups(relations: RelationObservations) -> list[tuple[str, Lookup]]:
    return [(entry.sha, entry.status) for entry in relations.associated]


def _shas(numbers: Iterable[int]) -> tuple[str, ...]:
    return tuple(sha(number) for number in numbers)


def _listed(items: Sequence[dict[str, Any]]) -> dict[str, Reply]:
    """기본 브랜치 커밋 목록 응답(100건씩 쪽을 나눈다)."""
    pages = [items[start : start + 100] for start in range(0, len(items), 100)]
    return {
        f"{BASE}/commits?per_page=100&page={index}": respond(
            list(page), next_page=index < len(pages)
        )
        for index, page in enumerate(pages, start=1)
    }


def _own_chain(count: int) -> list[dict[str, Any]]:
    """회원 커밋 c{count}…c1 직선(최근 것부터). c1은 뿌리 커밋이라 창이 모든 이력을 담는다."""
    return [
        graph_commit_json(n, MEMBER, parents=(n - 1,) if n > 1 else ())
        for n in range(count, 0, -1)
    ]


def _routes(items: Sequence[dict[str, Any]], own: Iterable[int]) -> dict[str, Reply]:
    """PR 없는 저장소. own 커밋마다 연결 PR 0건과 변경 내용 응답을 둔다."""
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_PULLS: respond([]),
        **_listed(items),
    }
    for number in own:
        routes[associated_key(number)] = respond([])
        routes[detail_path(number)] = detail_reply(number, MEMBER)
    return routes


def _chain_routes(count: int) -> dict[str, Reply]:
    return _routes(_own_chain(count), range(1, count + 1))


def _details(transport: FakeTransport) -> list[str]:
    return [path for path in transport.paths if path.startswith(f"{BASE}/commits/")]


# 1. 계획 순서의 묶음


def test_own_commits_are_looked_up_in_list_order_batches_before_details() -> None:
    """설명되지 않은 회원 커밋 150건은 목록 순서로 100건·50건 두 POST다. 그다음 변경 내용(REST)이다."""
    outcome, transport, relations = _run(_chain_routes(150))
    listed = _shas(range(150, 0, -1))

    assert outcome.completed
    assert transport.batches == [listed[:100], listed[100:]]
    assert transport.paths[:6] == [
        BASE,
        LISTED_COMMITS,
        SECOND_PAGE,
        LISTED_PULLS,
        graphql_route(*listed[:100]),
        graphql_route(*listed[100:]),
    ]
    # 묶음 조회 뒤에는 커밋마다 한 번씩 변경 내용만 부른다.
    assert sorted(transport.paths[6:]) == sorted(detail_path(s) for s in listed)
    assert _lookups(relations) == [(s, Lookup.EMPTY) for s in listed]
    assert outcome.graphql == GraphQLUsage(calls=2, observed_cost=2)
    assert outcome.calls == len(transport.calls) == 6 + 150


def test_no_lookup_post_without_targets() -> None:
    """설명되지 않은 회원 커밋도 PR 없는 병합 후보도 없으면 묶음 조회를 보내지 않는다."""
    routes = _routes(
        [
            graph_commit_json(2, OTHER, parents=(1,)),
            graph_commit_json(1, MEMBER, parents=()),
        ],
        own=[1],
    )
    del routes[associated_key(1)]
    # c1은 회원 PR #10의 커밋 목록으로 설명된다.
    routes[LISTED_PULLS] = respond([relation_pull_json(10, MEMBER, head=1)])
    routes[pull_commits_path(10)] = respond([graph_commit_json(1, MEMBER, parents=())])

    outcome, transport, relations = _run(routes)

    assert outcome.completed
    assert transport.batches == []
    assert not any(path.startswith("POST") for path in transport.paths)
    assert relations.associated == ()
    assert outcome.graphql == GraphQLUsage()


def test_same_commit_listed_twice_is_posted_once() -> None:
    """목록 쪽이 밀려 같은 커밋이 두 번 와도 한 번만 묻는다. 묶음 경계에 걸쳐도 같다."""
    items = _own_chain(101)
    # 둘째 쪽 첫 항목이 첫 쪽 마지막 커밋(c2)과 같다.
    items.insert(100, items[99])
    routes = _routes(items, range(1, 102))

    outcome, transport, relations = _run(routes)
    listed = _shas(range(101, 0, -1))

    assert outcome.completed
    assert transport.batches == [listed[:100], listed[100:]]
    assert set(Counter(transport.looked_up).values()) == {1}
    assert set(Counter(transport.paths).values()) == {1}
    assert [entry.sha for entry in relations.associated] == list(listed)


# 2. 묶음 단위로 받거나 버린다


# 본선 m900(PR 없는 병합, 다른 계정)이 작업 커밋 c901(회원)을 들였다. 본선의 회원 커밋은 c149…c1이다.
# 설명되지 않은 회원 커밋은 목록 순서로 c901·c149…c1의 150건이고, c901을 들인 m900이 병합 후보다.
MERGE_ITEMS = [
    graph_commit_json(900, OTHER, parents=(149, 901)),
    graph_commit_json(901, MEMBER, parents=(149,)),
    *_own_chain(149),
]
STAGE_ONE = _shas([901, *range(149, 0, -1)])


def _merge_routes() -> dict[str, Reply]:
    routes = _routes(MERGE_ITEMS, [901, *range(1, 150)])
    routes[associated_key(900)] = respond([])
    return routes


def test_merge_window_completes_with_a_separate_stage_two_post() -> None:
    """대조: 실패가 없으면 커밋 두 묶음 뒤 병합 후보를 따로 묻는다."""
    outcome, transport, relations = _run(_merge_routes())

    assert outcome.completed
    assert transport.batches == [STAGE_ONE[:100], STAGE_ONE[100:], (sha(900),)]
    assert _lookups(relations)[-1] == (sha(900), Lookup.EMPTY)


def test_failed_second_batch_keeps_the_first_and_leaves_the_rest_not_reached() -> None:
    """둘째 묶음이 HTTP 200과 errors로 실패하면 그 묶음 결과는 부분 data까지 쓰지 않는다.

    첫 묶음 결과(EMPTY)는 남고, 둘째 묶음과 뒤에 계획한 병합 후보는 확인 중단(NOT_REACHED)이다.
    다시 부르지 않고 나눠 묻지도 않는다.
    """
    routes = _merge_routes()
    second = STAGE_ONE[100:]
    # errors와 함께 온 data는 모양이 온전하다. 둘째 묶음 첫 커밋에는 이 저장소 PR #77이 있다고 왔다.
    # errors를 무시했다면 이 data로 묶음을 받아들였을 것이다.
    pulls = {0: [graphql_pull_node(relation_pull_json(77, MEMBER))]}
    commits = {
        f"c{index}": {
            "__typename": "Commit",
            "oid": commit,
            "associatedPullRequests": {
                "pageInfo": {"hasNextPage": False},
                "nodes": pulls.get(index, []),
            },
        }
        for index, commit in enumerate(second)
    }
    routes[graphql_route(*second)] = graphql_reply(
        {
            "rateLimit": standard_rate_limit(),
            "repository": {"nameWithOwner": REPOSITORY.full_name, **commits},
        },
        errors=[{"message": "Something went wrong while executing your query."}],
    )

    outcome, transport, relations = _run(routes)

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert relations.stopped_during == "LOOKUPS"
    assert transport.batches == [STAGE_ONE[:100], second]
    assert transport.paths[-1] == graphql_route(*second)
    assert _lookups(relations) == [
        *((s, Lookup.EMPTY) for s in STAGE_ONE[:100]),
        *((s, Lookup.NOT_REACHED) for s in second),
        (sha(900), Lookup.NOT_REACHED),
    ]
    assert relations.pull_requests_from_lookups == ()
    assert 77 not in {entry.number for entry in relations.pull_request_commits}
    # 실패한 POST도 호출로 세고, 그 점수는 알 수 없는 것으로 센다.
    assert outcome.graphql == GraphQLUsage(calls=2, observed_cost=1, unobserved_calls=1)
    assert outcome.calls == len(transport.calls)
    assert _details(transport) == []


# 3. 병합 후보는 커밋 묶음 뒤 따로 묻는다


# 본선 m60 ← m70 ← c71(뿌리). m60은 회원 커밋 c62를, m70은 회원 커밋 c73·c72를 들였다. 둘 다 PR 목록에
# 없는 병합이다. 커밋 묶음(c62·c73·c72)에서 c73의 연결 PR #90을 새로 알면, #90의 병합 커밋 m70은
# PR로 설명되어 병합 후보에서 빠진다. 들인 c72가 EMPTY(PR 밖)여도 묻지 않는다.
STAGE_TWO_ITEMS = [
    graph_commit_json(60, OTHER, parents=(70, 62)),
    graph_commit_json(62, MEMBER, parents=(70,)),
    graph_commit_json(70, OTHER, parents=(71, 73)),
    graph_commit_json(73, MEMBER, parents=(72,)),
    graph_commit_json(72, MEMBER, parents=(71,)),
    graph_commit_json(71, OTHER, parents=()),
]


@pytest.mark.parametrize(
    ("found", "merges"),
    [(True, (60,)), (False, (60, 70))],
    ids=["found-pull-request", "no-pull-request"],
)
def test_merge_lookups_follow_the_commit_batch_and_its_new_merge_commits(
    found: bool, merges: tuple[int, ...]
) -> None:
    routes = _routes(STAGE_TWO_ITEMS, [62, 73, 72])
    for merge in merges:
        routes[associated_key(merge)] = respond([])
    if found:
        routes[associated_key(73)] = respond(
            [relation_pull_json(90, MEMBER, merge_commit=70, head=73)]
        )

    outcome, transport, relations = _run(routes)

    assert outcome.completed
    stage_one = _shas([62, 73, 72])
    assert transport.batches == [stage_one, _shas(merges)]
    # 두 단계는 한 POST로 합치지 않고, 커밋 묶음을 받은 뒤 병합 묶음을 보낸다. 변경 내용은 그 뒤다.
    assert transport.paths[3:5] == [
        graphql_route(*stage_one),
        graphql_route(*merges),
    ]
    assert all(path.startswith(f"{BASE}/commits/") for path in transport.paths[5:])
    assert set(Counter(transport.looked_up).values()) == {1}
    assert [entry.sha for entry in relations.associated] == [
        *stage_one,
        *_shas(merges),
    ]
    if found:
        (pull,) = relations.pull_requests_from_lookups
        assert (pull.number, pull.merge_commit_sha) == (90, sha(70))
        assert sha(70) not in transport.looked_up


# 4. 응답이 알려 준 점수 소진


def _remaining(*exhausted: int, reset_minutes: int = 60) -> Callable[[int], Any]:
    """exhausted 순번의 POST 응답만 남은 점수 0(재설정 시각 reset_minutes 뒤)이다."""

    def rate(index: int) -> Any:
        if index in exhausted:
            return standard_rate_limit(remaining=0, reset_minutes=reset_minutes)
        return standard_rate_limit()

    return rate


ONE_PER_BATCH = replace(PROPOSED_LIMITS, max_lookup_batch=1)


def test_exhausted_quota_before_reset_stops_without_sending_the_next_batch() -> None:
    """앞 묶음 응답이 남은 점수 0과 아직 오지 않은 재설정 시각을 알리면 다음 묶음을 보내지 않는다."""
    outcome, transport, relations = _run(
        _chain_routes(2), limits=ONE_PER_BATCH, rate_limit=_remaining(0)
    )

    assert _codes(outcome) == [FailureCode.RATE_LIMITED]
    assert relations.stopped_during == "LOOKUPS"
    assert transport.batches == [(sha(2),)]
    # 보내지 않은 묶음은 호출로 세지 않는다.
    assert outcome.calls == len(transport.calls) == 4
    assert outcome.graphql == GraphQLUsage(calls=1, observed_cost=1)
    assert _lookups(relations) == [
        (sha(2), Lookup.EMPTY),
        (sha(1), Lookup.NOT_REACHED),
    ]
    assert _details(transport) == []
    assert {c.changes_status for c in outcome.commits} == {DetailStatus.NOT_REACHED}


@pytest.mark.parametrize("reset_minutes", [-1, 0], ids=["past", "now"])
def test_exhausted_quota_after_its_reset_time_sends_the_next_batch(
    reset_minutes: int,
) -> None:
    outcome, transport, relations = _run(
        _chain_routes(2),
        limits=ONE_PER_BATCH,
        rate_limit=_remaining(0, reset_minutes=reset_minutes),
    )

    assert outcome.completed
    assert transport.batches == [(sha(2),), (sha(1),)]
    assert _lookups(relations) == [(sha(2), Lookup.EMPTY), (sha(1), Lookup.EMPTY)]
    assert outcome.graphql == GraphQLUsage(calls=2, observed_cost=2)


def test_exhausted_quota_on_the_last_batch_does_not_stop_rest_calls() -> None:
    """마지막 묶음이 점수 0을 알려도 REST 호출(변경 내용)은 그대로 부르고 수집을 마친다."""
    outcome, transport, relations = _run(
        _chain_routes(2), limits=ONE_PER_BATCH, rate_limit=_remaining(1)
    )

    assert outcome.completed
    assert transport.batches == [(sha(2),), (sha(1),)]
    assert sorted(_details(transport)) == sorted(detail_path(n) for n in (2, 1))
    assert transport.paths.index(graphql_route(1)) < transport.paths.index(
        _details(transport)[0]
    )
    assert _lookups(relations) == [(sha(2), Lookup.EMPTY), (sha(1), Lookup.EMPTY)]
    assert {c.changes_status for c in outcome.commits} == {DetailStatus.FETCHED}


def test_exhausted_quota_on_the_commit_batch_stops_the_merge_batch() -> None:
    """점수 소진은 단계와 무관하게 다음 묶음 조회에 적용된다. 병합 후보는 확인 중단이다."""
    routes = _routes(STAGE_TWO_ITEMS, [62, 73, 72])

    outcome, transport, relations = _run(routes, rate_limit=_remaining(0))

    assert _codes(outcome) == [FailureCode.RATE_LIMITED]
    assert transport.batches == [_shas([62, 73, 72])]
    assert _lookups(relations) == [
        *((s, Lookup.EMPTY) for s in _shas([62, 73, 72])),
        (sha(60), Lookup.NOT_REACHED),
        (sha(70), Lookup.NOT_REACHED),
    ]
    assert outcome.calls == len(transport.calls)


@pytest.mark.parametrize("value", [OMIT, None], ids=["omitted", "null"])
def test_missing_rate_limit_is_unobserved_and_collection_completes(
    value: object,
) -> None:
    """응답에 점수가 없거나 null이면 0점이 아니라 알 수 없는 호출로 세고 관계 자료는 그대로 쓴다."""
    outcome, transport, relations = _run(_chain_routes(2), rate_limit=lambda _: value)

    assert outcome.completed
    assert transport.batches == [(sha(2), sha(1))]
    assert _lookups(relations) == [(sha(2), Lookup.EMPTY), (sha(1), Lookup.EMPTY)]
    assert outcome.graphql == GraphQLUsage(calls=1, unobserved_calls=1)
