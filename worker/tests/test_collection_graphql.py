"""연결 PR 묶음 조회(#267): GraphQL 쿼리 틀·변수, 응답 해석, 실패 분류, 점수 기록.

쿼리는 정한 틀 하나로만 만들고 저장소 좌표·SHA는 변수로만 넘기는지, 응답을 별칭과 SHA로 맞춰
REST 연결 PR 조회와 같은 뜻의 기록으로 옮기는지, 오류 응답이면 그 묶음 결과를 하나도 쓰지 않고
다시 부르지 않는지, PR 제목·본문 같은 data 안의 글을 한도 신호로 쓰지 않는지, 점수를 호출 수와
따로 세는지 본다. 모두 합성 응답으로 확인한다. 실제 GitHub에는 연결하지 않았다.
"""

import json
import logging
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import replace
from datetime import timedelta
from typing import Any

import pytest
from github_synthetic import (
    BASE,
    EVIL,
    LISTED_COMMITS,
    LISTED_PULLS,
    MEMBER,
    MISSING_COMMIT,
    NAME,
    OMIT,
    OTHER,
    OWNER,
    REFERENCE,
    REPOSITORY,
    START,
    TOKEN,
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
    oversized,
    relation_pull_json,
    relation_repository_json,
    request_with,
    respond,
    sha,
    standard_rate_limit,
    status_only,
)

from app.collection import (
    PROPOSED_LIMITS,
    CollectionFailure,
    CollectionLimits,
    CollectionOutcome,
    DetailStatus,
    FailureCode,
    GitHubAccount,
    Lookup,
    RelationObservations,
    RelationOptions,
    RepositoryCoordinates,
    collect,
    normalize,
)
from app.collection.gateway import OVERSIZED, GraphQLUsage, graphql_outcome
from app.collection.graphql import (
    GRAPHQL_PATH,
    MAX_BATCH,
    alias,
    associated_pulls_request,
)
from app.collection.transport import (
    GITHUB_API_HOST,
    HttpResponse,
    TransportError,
    TransportTimeout,
)

# 이슈 목록은 연결 PR 조회와 무관해 뺀다. 연결 PR 조회는 커밋과 PR이 모두 허용될 때만 한다.
REQUEST = request_with("COMMIT", "PULL_REQUEST")
# 연결 PR 조회 전의 호출: 저장소 확인, 커밋 목록, PR 목록.
LISTS = [BASE, LISTED_COMMITS, LISTED_PULLS]
SECONDARY = (
    "You have exceeded a secondary rate limit. "
    "Please wait a few minutes before you try again."
)
NOT_FOUND = {
    "type": "NOT_FOUND",
    "path": ["repository"],
    "message": f"Could not resolve to a Repository with the name '{REPOSITORY.full_name}'.",
}


def _commit_items(own: Sequence[int]) -> list[dict[str, Any]]:
    """회원 커밋 own(최근 것부터)이 한 줄로 이어진 기본 브랜치 커밋 목록 항목."""
    parents = [*own[1:], 999]
    return [
        graph_commit_json(number, MEMBER, parents=(parent,))
        for number, parent in zip(own, parents, strict=True)
    ]


def _routes(
    *own: int,
    lookups: Mapping[int, Reply] | None = None,
    overrides: Mapping[str, Reply] | None = None,
) -> dict[str, Reply]:
    """기본 브랜치에 회원 커밋 own만 있고 PR 목록이 빈 저장소.

    lookups는 커밋마다의 연결 PR(associated_key), overrides는 묶음 전체의 응답(graphql_route)이다.
    """
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        LISTED_COMMITS: respond(_commit_items(own)),
        LISTED_PULLS: respond([]),
    }
    for number in own:
        routes[detail_path(number)] = detail_reply(number, MEMBER)
    for number, reply in (lookups or {}).items():
        routes[associated_key(number)] = reply
    routes.update(overrides or {})
    return routes


def _run(
    routes: dict[str, Reply],
    *,
    limits: CollectionLimits = PROPOSED_LIMITS,
    rate_limit: Callable[[int], Any] | None = None,
    reverse_aliases: bool = False,
) -> tuple[CollectionOutcome, FakeTransport]:
    clock = FakeClock()
    transport = FakeTransport(routes, clock=clock, reverse_aliases=reverse_aliases)
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
    return outcome, transport


def _relations(outcome: CollectionOutcome) -> RelationObservations:
    assert outcome.relations is not None
    return outcome.relations


def _codes(outcome: CollectionOutcome) -> list[FailureCode]:
    return [failure.code for failure in outcome.failures]


def _statuses(outcome: CollectionOutcome) -> list[tuple[str, Lookup]]:
    return [(entry.sha, entry.status) for entry in _relations(outcome).associated]


def _lookup_numbers(outcome: CollectionOutcome) -> list[int]:
    return [record.number for record in _relations(outcome).pull_requests_from_lookups]


# 손으로 만드는 묶음 응답. 실제 GitHub GraphQL 응답 모양 가운데 수집이 읽는 필드만 둔다.


def _node(number: int, **changes: Any) -> dict[str, Any]:
    """이 저장소를 기준으로 회원이 연 병합된 PR 한 건(GraphQL 모양). changes로 필드를 바꾼다."""
    node = graphql_pull_node(relation_pull_json(number, MEMBER))
    node.update(changes)
    return node


def _without(node: Mapping[str, Any], key: str) -> dict[str, Any]:
    return {name: value for name, value in node.items() if name != key}


def _commit(number: int, *nodes: object, next_page: object = False) -> dict[str, Any]:
    return {
        "__typename": "Commit",
        "oid": sha(number),
        "associatedPullRequests": {
            "pageInfo": {"hasNextPage": next_page},
            "nodes": list(nodes),
        },
    }


def _data(*commits: object, repository: str = REPOSITORY.full_name) -> dict[str, Any]:
    """요청 순서(c0, c1, …)의 커밋 결과로 만든 묶음 응답의 data."""
    return {
        "rateLimit": standard_rate_limit(),
        "repository": {
            "nameWithOwner": repository,
            **{alias(index): value for index, value in enumerate(commits)},
        },
    }


def _text_reply(status: int, text: bytes) -> HttpResponse:
    return HttpResponse(status, {"content-type": "text/html"}, text, len(text))


def _assert_batch_unused(
    outcome: CollectionOutcome,
    transport: FakeTransport,
    code: FailureCode,
    batch: Sequence[int],
) -> None:
    """묶음 하나를 한 번 보낸 뒤 그 결과를 하나도 쓰지 않고, 다시 부르거나 REST로 돌아가지 않고 멈췄다."""
    relations = _relations(outcome)
    assert _codes(outcome) == [code]
    assert relations.stopped_during == "LOOKUPS"
    assert transport.paths == [*LISTS, graphql_route(*batch)]
    assert _statuses(outcome) == [(sha(n), Lookup.NOT_REACHED) for n in batch]
    assert relations.pull_requests_from_lookups == ()
    assert outcome.graphql.calls == 1
    # 실패한 POST도 호출 수 상한에 쓴 호출이다(되돌리지 않는다).
    assert outcome.calls == len(transport.calls) == len(LISTS) + 1
    assert transport.closed
    message = outcome.failures[0].message
    assert TOKEN not in message
    assert not any(sha(n) in message for n in batch)


# A. 쿼리 틀과 변수


@pytest.mark.parametrize("count", [1, 2, MAX_BATCH])
def test_request_uses_one_fixed_template_with_values_only_in_variables(
    count: int,
) -> None:
    shas = [sha(number) for number in range(1, count + 1)]
    request = associated_pulls_request(REPOSITORY, shas)
    query = request.query

    assert request.shas == tuple(shas)
    assert dict(request.variables) == {
        "owner": OWNER,
        "name": NAME,
        **{f"s{index}": value for index, value in enumerate(shas)},
    }
    for value in request.variables.values():
        assert value not in query
    assert query.startswith("query AssociatedPulls(")
    assert "$owner: String!" in query and "$name: String!" in query
    for index in range(count):
        assert f"$s{index}: GitObjectID!" in query
    assert "followRenames: false" in query
    assert query.count("associatedPullRequests(") == 1
    assert "associatedPullRequests(first: 100)" in query
    for argument in ("after:", "before:", "last:"):
        assert argument not in query
    assert "mutation" not in query
    # 응답 해석이 읽는 필드를 모두 묻는다. 대역은 쿼리와 무관하게 채워 답하므로 여기서 고정한다.
    for selection in (
        "rateLimit { cost remaining resetAt }",
        "{ nameWithOwner ",
        "__typename oid",
        "pageInfo { hasNextPage }",
        "number title body state createdAt closedAt mergedAt mergeCommit { oid }",
        "headRefOid headRefName baseRefName baseRefOid",
        "headRepository { nameWithOwner } baseRepository { nameWithOwner }",
        "... on User { databaseId }",
        "... on Bot { databaseId }",
    ):
        assert selection in query, selection
    assert re.findall(r"(\w+): object\(oid: \$(\w+)\)", query) == [
        (alias(index), f"s{index}") for index in range(count)
    ]
    # 틀은 커밋 수로만 바뀐다. 다른 저장소·다른 SHA여도 같은 수면 같은 쿼리 문이다.
    other = associated_pulls_request(
        RepositoryCoordinates("other-owner", "other-repo"),
        [f"{number:040x}" for number in range(500, 500 + count)],
    )
    assert other.query == query


def test_request_lowercases_full_shas() -> None:
    request = associated_pulls_request(REPOSITORY, ["AB" * 20, "c" * 64])

    assert request.shas == ("ab" * 20, "c" * 64)
    assert request.variables["s0"] == "ab" * 20


@pytest.mark.parametrize(
    "shas",
    [
        pytest.param([], id="empty"),
        pytest.param([sha(n) for n in range(1, MAX_BATCH + 2)], id="101"),
        pytest.param([sha(1), sha(2), sha(1)], id="duplicate"),
        pytest.param(["ab" * 20, "AB" * 20], id="duplicate-by-case"),
        pytest.param(["abc1234"], id="short"),
        pytest.param(["g" * 40], id="not-hex"),
        pytest.param([1234], id="not-text"),
    ],
)
def test_request_rejects_batches_outside_template(shas: list[Any]) -> None:
    with pytest.raises(ValueError):
        associated_pulls_request(REPOSITORY, shas)


@pytest.mark.parametrize("size", [0, MAX_BATCH + 1])
def test_batch_size_limit_stays_within_1_to_100(size: int) -> None:
    assert MAX_BATCH == 100
    with pytest.raises(ValueError):
        CollectionLimits(max_lookup_batch=size)


def test_post_sends_only_query_and_variables_to_graphql_path() -> None:
    outcome, transport = _run(_routes(1, lookups={1: respond([])}))
    [post] = [call for call in transport.calls if call.method == "POST"]
    expected = associated_pulls_request(REPOSITORY, [sha(1)])

    assert outcome.completed
    assert transport.host == GITHUB_API_HOST == "api.github.com"
    assert post.path == GRAPHQL_PATH == "/graphql"
    assert post.body is not None
    assert json.loads(post.body) == {
        "query": expected.query,
        "variables": dict(expected.variables),
    }
    assert TOKEN not in post.body.decode("ascii")
    assert post.headers["Authorization"] == f"Bearer {TOKEN}"
    assert [name for name, value in post.headers.items() if TOKEN in value] == [
        "Authorization"
    ]
    assert post.headers["Content-Type"] == "application/json"
    assert post.headers["Accept"] == "application/json"
    assert post.headers["User-Agent"] == "CatchU-worker"
    # REST 판본 머리글은 GraphQL에 쓰지 않는다.
    assert "X-GitHub-Api-Version" not in post.headers
    assert post.max_bytes == PROPOSED_LIMITS.max_response_bytes
    assert post.connect_timeout == PROPOSED_LIMITS.connect_timeout
    assert post.read_timeout == PROPOSED_LIMITS.read_timeout
    assert all(TOKEN not in path for path in transport.paths)


def test_default_batch_holds_100_commits_and_sends_the_rest_next() -> None:
    numbers = list(range(101, 0, -1))
    items = _commit_items(numbers)
    routes = _routes(*numbers, lookups={n: respond([]) for n in numbers})
    # 기본 브랜치 커밋 목록은 100건씩 두 쪽이다.
    routes[LISTED_COMMITS] = respond(items[:100], next_page=True)
    routes[f"{BASE}/commits?per_page=100&page=2"] = respond(items[100:])

    outcome, transport = _run(routes)

    assert outcome.completed
    assert transport.batches == [
        tuple(sha(n) for n in numbers[:100]),
        (sha(1),),
    ]
    assert all(status is Lookup.EMPTY for _, status in _statuses(outcome))
    assert outcome.graphql == GraphQLUsage(calls=2, observed_cost=2)
    assert outcome.calls == len(transport.calls)


def test_smaller_batch_splits_lookups_in_plan_order() -> None:
    limits = replace(PROPOSED_LIMITS, max_lookup_batch=2)
    routes = _routes(3, 2, 1, lookups={3: respond([]), 2: respond([]), 1: respond([])})

    outcome, transport = _run(routes, limits=limits)

    assert outcome.completed
    assert transport.batches == [(sha(3), sha(2)), (sha(1),)]
    assert transport.looked_up == [sha(3), sha(2), sha(1)]


# B. 응답 해석


@pytest.mark.parametrize(
    "item",
    [
        pytest.param(relation_pull_json(40, MEMBER), id="merged"),
        pytest.param(relation_pull_json(40, MEMBER, state="closed"), id="closed"),
        pytest.param(relation_pull_json(40, MEMBER, state="open"), id="open"),
        pytest.param(relation_pull_json(40, MEMBER, fork=True), id="fork"),
        pytest.param(relation_pull_json(40, OTHER), id="other-author"),
        pytest.param(relation_pull_json(40, MEMBER, base_commit=None), id="no-base"),
    ],
)
def test_pull_request_means_the_same_as_rest_lookup(item: dict[str, Any]) -> None:
    """같은 PR을 REST 연결 PR 응답으로 받았을 때 정규화한 기록과 같다."""
    outcome, _ = _run(_routes(1, lookups={1: respond([item])}))

    assert outcome.completed
    assert _statuses(outcome) == [(sha(1), Lookup.FOUND)]
    assert _relations(outcome).pull_requests_from_lookups == (
        normalize.pull_request(item, REPOSITORY, DetailStatus.BEYOND_RANGE),
    )


def test_deleted_fork_is_from_fork() -> None:
    item = relation_pull_json(40, MEMBER)
    item["head"] = {**item["head"], "repo": None}
    outcome, _ = _run(_routes(1, lookups={1: respond([item])}))
    [record] = _relations(outcome).pull_requests_from_lookups

    assert record.from_fork
    assert record == normalize.pull_request(item, REPOSITORY, DetailStatus.BEYOND_RANGE)


def _found(node: Mapping[str, Any]) -> CollectionOutcome:
    """회원 커밋 c1 하나의 연결 PR이 node 하나인 묶음 응답으로 수집한다."""
    data = _data(_commit(1, node))
    outcome, _ = _run(_routes(1, overrides={graphql_route(1): respond({"data": data})}))
    assert outcome.completed
    assert _statuses(outcome) == [(sha(1), Lookup.FOUND)]
    return outcome


def test_merged_pull_request_keeps_merge_commit_and_time() -> None:
    [record] = _relations(_found(_node(40))).pull_requests_from_lookups

    assert record.state == "closed"
    assert record.merged_at is not None and record.closed_at is not None
    assert record.merge_commit_sha == sha(5040)
    assert record.base_sha == sha(9999)
    assert record.commits_status is DetailStatus.BEYOND_RANGE


@pytest.mark.parametrize(
    ("state", "closed"),
    [pytest.param("CLOSED", True, id="closed"), pytest.param("OPEN", False, id="open")],
)
def test_unmerged_pull_request_has_no_merge_commit(state: str, closed: bool) -> None:
    node = _node(
        40,
        state=state,
        mergedAt=None,
        closedAt=_node(40)["closedAt"] if closed else None,
        # 병합되지 않은 PR의 mergeCommit은 쓰지 않는다.
        mergeCommit={"oid": sha(70040)},
    )
    [record] = _relations(_found(node)).pull_requests_from_lookups

    assert record.state == ("closed" if closed else "open")
    assert record.merged_at is None
    assert record.merge_commit_sha is None
    assert (record.closed_at is not None) is closed


@pytest.mark.parametrize(
    ("author", "account"),
    [
        pytest.param(
            {"__typename": "User", "login": MEMBER.login, "databaseId": 1001},
            MEMBER,
            id="user",
        ),
        pytest.param(
            {"__typename": "Bot", "login": "dependabot", "databaseId": 49699333},
            GitHubAccount("dependabot", 49699333),
            id="bot",
        ),
        pytest.param(
            {"__typename": "Mannequin", "login": "imported-user", "databaseId": 77},
            GitHubAccount("imported-user", 77),
            id="mannequin",
        ),
    ],
)
def test_author_uses_login_and_database_id(
    author: dict[str, Any], account: GitHubAccount
) -> None:
    outcome = _found(_node(40, author=author))
    [record] = _relations(outcome).pull_requests_from_lookups
    contribution = outcome.evidence_for(record).contribution

    assert record.author == account
    assert contribution.linked_account_is_author is (account == MEMBER)


def test_null_author_is_unknown_author_with_limit() -> None:
    outcome = _found(_node(40, author=None))
    [record] = _relations(outcome).pull_requests_from_lookups
    evidence = outcome.evidence_for(record)

    assert record.author is None
    assert evidence.contribution.author is None
    assert any(
        "작성자를 확인하지 못했다" in limit for limit in evidence.coverage_limits
    )


def test_null_body_becomes_empty_text() -> None:
    [record] = _relations(_found(_node(40, body=None))).pull_requests_from_lookups

    assert record.body == ""


def test_repository_name_is_compared_without_case() -> None:
    upper = f"{OWNER.upper()}/{NAME.upper()}"
    node = _node(
        40,
        baseRepository={"nameWithOwner": upper},
        headRepository={"nameWithOwner": upper},
    )
    data = _data(_commit(1, node), repository=upper)
    outcome, _ = _run(_routes(1, overrides={graphql_route(1): respond({"data": data})}))
    [record] = _relations(outcome).pull_requests_from_lookups

    assert outcome.completed
    assert _statuses(outcome) == [(sha(1), Lookup.FOUND)]
    assert not record.from_fork


def test_unknown_base_repository_is_limited() -> None:
    lookups: dict[int, Reply] = {
        2: respond([relation_pull_json(40, MEMBER, base_repository=None)]),
        1: respond(
            [
                relation_pull_json(41, MEMBER),
                relation_pull_json(42, MEMBER, base_repository=None),
            ]
        ),
    }
    outcome, _ = _run(_routes(2, 1, lookups=lookups))
    associated = _relations(outcome).associated

    assert outcome.completed
    assert [(e.status, e.pull_requests, e.unknown_base) for e in associated] == [
        (Lookup.LIMITED, (), 1),
        (Lookup.LIMITED, (41,), 1),
    ]
    # 기준 저장소를 알 수 없는 PR은 기록하지 않고, 이 저장소 PR은 기록한다.
    assert _lookup_numbers(outcome) == [41]


def test_other_base_repository_is_ignored_and_empty() -> None:
    item = relation_pull_json(40, MEMBER, base_repository="someone-else/upstream")
    outcome, _ = _run(_routes(1, lookups={1: respond([item])}))
    [entry] = _relations(outcome).associated

    assert outcome.completed
    assert (entry.status, entry.pull_requests, entry.foreign_ignored) == (
        Lookup.EMPTY,
        (),
        1,
    )
    assert _lookup_numbers(outcome) == []


def test_next_page_is_limited_but_keeps_this_repository_pulls() -> None:
    reply = respond([relation_pull_json(40, MEMBER)], next_page=True)
    outcome, _ = _run(_routes(1, lookups={1: reply}))
    [entry] = _relations(outcome).associated

    assert outcome.completed
    assert (entry.status, entry.pull_requests) == (Lookup.LIMITED, (40,))
    assert _lookup_numbers(outcome) == [40]


def test_results_follow_alias_and_sha_not_field_order() -> None:
    lookups: dict[int, Reply] = {
        3: respond([relation_pull_json(40, MEMBER)]),
        2: respond([]),
        1: respond([relation_pull_json(41, MEMBER)], next_page=True),
    }
    ordered, _ = _run(_routes(3, 2, 1, lookups=lookups))
    reversed_, _ = _run(_routes(3, 2, 1, lookups=lookups), reverse_aliases=True)

    assert ordered.completed and reversed_.completed
    assert _statuses(reversed_) == [
        (sha(3), Lookup.FOUND),
        (sha(2), Lookup.EMPTY),
        (sha(1), Lookup.LIMITED),
    ]
    assert _relations(reversed_) == _relations(ordered)
    assert reversed_.commits == ordered.commits


def test_null_commit_stops_with_null_message() -> None:
    lookups: dict[int, Reply] = {
        2: respond([relation_pull_json(41, MEMBER)]),
        1: MISSING_COMMIT,
    }
    outcome, transport = _run(_routes(2, 1, lookups=lookups))

    _assert_batch_unused(
        outcome, transport, FailureCode.COLLECTION_FETCH_FAILED, [2, 1]
    )
    assert "null" in outcome.failures[0].message


def test_other_repository_in_reply_is_scope_inconsistent() -> None:
    data = _data(_commit(2, _node(41)), _commit(1), repository="someone-else/other")
    routes = _routes(2, 1, overrides={graphql_route(2, 1): respond({"data": data})})
    outcome, transport = _run(routes)

    _assert_batch_unused(outcome, transport, FailureCode.SCOPE_INCONSISTENT, [2, 1])


# 앞 커밋(c0 = 회원 커밋 2)은 이 저장소 PR #41이 있는 정상 결과다. 뒤 커밋이나 묶음 전체가
# 어긋나면 앞 커밋 결과도 쓰지 않는다.
_VALID = _commit(2, _node(41))
_MALFORMED: list[Any] = [
    pytest.param(_data(_VALID), id="missing-alias"),
    pytest.param(_data(_VALID, _commit(1), _commit(3)), id="extra-alias"),
    pytest.param(_data(_commit(1), _commit(2, _node(41))), id="sha-mismatch"),
    pytest.param(_data(_VALID, {**_commit(1), "__typename": "Tree"}), id="not-commit"),
    pytest.param(
        _data(_VALID, {**_commit(1), "associatedPullRequests": None}),
        id="connection-null",
    ),
    pytest.param(_data(_VALID, _commit(1, next_page="true")), id="next-page-text"),
    pytest.param(_data(_VALID, _commit(1, next_page=None)), id="next-page-null"),
    pytest.param(
        _data(_VALID, _commit(1, *(_node(100 + i) for i in range(101)))),
        id="over-100-pulls",
    ),
    pytest.param(_data(_VALID, _commit(1, None)), id="pull-null"),
    pytest.param(
        _data(_VALID, _commit(1, _without(_node(40), "baseRepository"))),
        id="base-repository-missing",
    ),
    pytest.param(
        _data(_VALID, _commit(1, _without(_node(40), "headRepository"))),
        id="head-repository-missing",
    ),
    pytest.param(
        _data(_VALID, _commit(1, _without(_node(40), "author"))), id="author-missing"
    ),
    pytest.param(
        _data(
            _VALID,
            _commit(
                1,
                _node(
                    40,
                    author={
                        "__typename": "EnterpriseUserAccount",
                        "login": "enterprise-user",
                    },
                ),
            ),
        ),
        id="author-without-number",
    ),
    *(
        pytest.param(
            _data(
                _VALID,
                _commit(
                    1,
                    _node(
                        40,
                        author={
                            "__typename": "User",
                            "login": "someone",
                            "databaseId": number,
                        },
                    ),
                ),
            ),
            id=f"author-number-{name}",
        )
        for name, number in (("text", "1001"), ("zero", 0), ("bool", True))
    ),
    pytest.param(
        _data(
            _VALID,
            _commit(1, _node(40, author={"__typename": "User", "databaseId": 1001})),
        ),
        id="author-without-login",
    ),
    pytest.param(
        _data(_VALID, _commit(1, _node(40, mergedAt=None))), id="merged-without-time"
    ),
    pytest.param(
        _data(_VALID, _commit(1, _node(40, state="OPEN"))), id="open-with-merge-time"
    ),
    pytest.param(
        _data(_VALID, _commit(1, _node(40, state="DRAFT"))), id="unknown-state"
    ),
    *(
        pytest.param(
            _data(_VALID, _commit(1, _node(40, state=value))), id=f"state-{name}"
        )
        for name, value in (("list", ["MERGED"]), ("object", {"v": "MERGED"}))
    ),
    pytest.param(
        {**_data(_VALID, _commit(1)), "viewer": {"login": "x"}}, id="extra-top-field"
    ),
    pytest.param(
        {"rateLimit": standard_rate_limit(), "repository": None},
        id="repository-null",
    ),
    pytest.param(None, id="data-null"),
]


@pytest.mark.parametrize("data", _MALFORMED)
def test_malformed_batch_is_not_used(data: object) -> None:
    routes = _routes(2, 1, overrides={graphql_route(2, 1): respond({"data": data})})
    outcome, transport = _run(routes)

    _assert_batch_unused(
        outcome, transport, FailureCode.COLLECTION_FETCH_FAILED, [2, 1]
    )


def test_batch_reader_raises_named_errors() -> None:
    request = associated_pulls_request(REPOSITORY, [sha(2), sha(1)])

    with pytest.raises(normalize.MissingCommit):
        normalize.associated_pulls_batch(_data(_VALID, None), request, REPOSITORY)
    with pytest.raises(normalize.RepositoryMismatch):
        normalize.associated_pulls_batch(
            _data(_VALID, _commit(1), repository="someone-else/other"),
            request,
            REPOSITORY,
        )
    with pytest.raises(normalize.MalformedResponse):
        normalize.associated_pulls_batch(_data(_VALID), request, REPOSITORY)
    found = normalize.associated_pulls_batch(
        _data(_VALID, _commit(1)), request, REPOSITORY
    )
    assert [(entry.sha, len(entry.found.records)) for entry in found] == [
        (sha(2), 1),
        (sha(1), 0),
    ]


# C. 실패 분류: 묶음 전체의 응답 하나. 한 번만 보내고 다시 부르지 않으며 그 묶음 결과를
# 쓰지 않는다.

_PARTIAL = _data(
    _commit(2, _node(41, title="API rate limit exceeded", body=SECONDARY)), None
)
_CLASSIFIED: list[Any] = [
    pytest.param(status_only(401), FailureCode.CREDENTIAL_REJECTED, id="401"),
    pytest.param(
        respond(
            {
                "message": "Resource not accessible by personal access token",
                "documentation_url": f"{EVIL}/docs",
            },
            status=403,
        ),
        FailureCode.REPOSITORY_UNREACHABLE,
        id="403-not-accessible",
    ),
    pytest.param(
        respond(
            {"message": "Forbidden"},
            status=403,
            headers={"x-ratelimit-remaining": "0"},
        ),
        FailureCode.RATE_LIMITED,
        id="403-remaining-zero",
    ),
    pytest.param(
        respond({"message": "Forbidden"}, status=403, headers={"retry-after": "60"}),
        FailureCode.RATE_LIMITED,
        id="403-retry-after",
    ),
    pytest.param(
        respond({"message": SECONDARY}, status=403),
        FailureCode.RATE_LIMITED,
        id="403-secondary-message",
    ),
    pytest.param(
        respond(
            {"message": "You have triggered an abuse detection mechanism."},
            status=403,
        ),
        FailureCode.RATE_LIMITED,
        id="403-abuse-message",
    ),
    pytest.param(
        _text_reply(403, b"<html>API rate limit exceeded</html>"),
        FailureCode.RATE_LIMITED,
        id="403-text-rate-limit",
    ),
    pytest.param(status_only(404), FailureCode.REPOSITORY_UNREACHABLE, id="404"),
    pytest.param(status_only(429), FailureCode.RATE_LIMITED, id="429"),
    pytest.param(
        graphql_reply(errors=[{"type": "RATE_LIMITED", "message": "x"}]),
        FailureCode.RATE_LIMITED,
        id="200-errors-limit-type",
    ),
    pytest.param(
        graphql_reply(errors=[{"message": SECONDARY}]),
        FailureCode.RATE_LIMITED,
        id="200-errors-secondary-message",
    ),
    pytest.param(
        graphql_reply(errors=[{"message": "API rate limit exceeded for user ID 1."}]),
        FailureCode.RATE_LIMITED,
        id="200-errors-primary-message",
    ),
    pytest.param(
        graphql_reply(errors=[NOT_FOUND], headers={"x-ratelimit-remaining": "0"}),
        FailureCode.RATE_LIMITED,
        id="200-not-found-with-limit-header",
    ),
    pytest.param(
        graphql_reply(
            errors=[NOT_FOUND, {"type": "RATE_LIMITED", "message": "limited"}]
        ),
        FailureCode.RATE_LIMITED,
        id="200-errors-mixed",
    ),
    # 저장소를 찾지 못한 GraphQL 응답(HTTP 200, NOT_FOUND, repository null)이다. REST 404의
    # REPOSITORY_UNREACHABLE과 다른 코드다. 이 차이는 2026-10-12 팀장 결정으로 받아들였다.
    pytest.param(
        graphql_reply(
            {"rateLimit": standard_rate_limit(), "repository": None},
            errors=[NOT_FOUND],
        ),
        FailureCode.COLLECTION_FETCH_FAILED,
        id="200-not-found-repository-null",
    ),
    # 부분 data의 PR 제목·본문에 한도 문구가 있어도 한도 신호가 아니다.
    pytest.param(
        graphql_reply(
            _PARTIAL,
            errors=[
                {
                    "type": "NOT_FOUND",
                    "path": ["repository", "c1"],
                    "message": "Could not resolve to a Commit.",
                }
            ],
        ),
        FailureCode.COLLECTION_FETCH_FAILED,
        id="200-partial-data-mentions-limit",
    ),
    pytest.param(
        graphql_reply(errors=[]),
        FailureCode.COLLECTION_FETCH_FAILED,
        id="200-errors-empty",
    ),
    pytest.param(
        respond({"errors": None, "data": _data(_VALID, _commit(1))}),
        FailureCode.COLLECTION_FETCH_FAILED,
        id="200-errors-null-with-data",
    ),
    pytest.param(
        _text_reply(200, b"<html>maintenance</html>"),
        FailureCode.COLLECTION_FETCH_FAILED,
        id="200-not-json",
    ),
    pytest.param(
        respond([]), FailureCode.COLLECTION_FETCH_FAILED, id="200-json-not-object"
    ),
    *(
        pytest.param(
            status_only(status, {"location": f"{EVIL}/graphql"}),
            FailureCode.COLLECTION_FETCH_FAILED,
            id=str(status),
        )
        for status in (301, 302)
    ),
    *(
        pytest.param(
            status_only(status), FailureCode.COLLECTION_FETCH_FAILED, id=str(status)
        )
        for status in (500, 502, 504)
    ),
    pytest.param(
        TransportTimeout("합성: 응답 대기 시간 초과"),
        FailureCode.COLLECTION_FETCH_FAILED,
        id="timeout",
    ),
    pytest.param(
        TransportError("합성: 연결 오류"),
        FailureCode.COLLECTION_FETCH_FAILED,
        id="connection-error",
    ),
]


@pytest.mark.parametrize(("reply", "code"), _CLASSIFIED)
def test_batch_failure_is_classified_and_not_retried(
    reply: Reply, code: FailureCode
) -> None:
    routes = _routes(2, 1, overrides={graphql_route(2, 1): reply})
    outcome, transport = _run(routes)

    _assert_batch_unused(outcome, transport, code, [2, 1])
    # 받지 못했거나 쓰지 않은 응답의 점수는 알 수 없다. 0점으로 세지 않는다.
    assert outcome.graphql == GraphQLUsage(calls=1, observed_cost=0, unobserved_calls=1)
    assert TOKEN not in repr(outcome)


def test_limit_words_in_pull_request_text_are_only_data() -> None:
    item = relation_pull_json(
        40, MEMBER, title="API rate limit exceeded", body=SECONDARY
    )
    outcome, _ = _run(_routes(1, lookups={1: respond([item])}))
    [record] = _relations(outcome).pull_requests_from_lookups

    assert outcome.completed
    assert _statuses(outcome) == [(sha(1), Lookup.FOUND)]
    assert (record.title, record.body) == ("API rate limit exceeded", SECONDARY)


_LIMIT_MESSAGE = "You have exceeded a secondary rate limit."


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"message": _LIMIT_MESSAGE}, id="message-only"),
        pytest.param(
            {"message": _LIMIT_MESSAGE, "data": _data(_VALID, _commit(1))},
            id="message-with-data",
        ),
    ],
)
def test_200_with_only_a_top_level_limit_message_is_rate_limited(
    body: dict[str, Any], caplog: pytest.LogCaptureFixture
) -> None:
    """HTTP 200·errors 없음·최상위 message의 2차 한도 문구만으로도 한도 실패다.

    응답을 직접 정해 대역이 errors 모양으로 바꾸지 않게 한다. 함께 온 정상 모양의 data(PR #41 포함)도
    쓰지 않는다. 그 묶음을 한 번만 보내고 재시도·재분할·REST 대체·변경 내용 조회가 없다.
    """
    routes = _routes(2, 1, overrides={graphql_route(2, 1): respond(body)})
    with caplog.at_level(logging.DEBUG, logger="app.collection"):
        outcome, transport = _run(routes)

    _assert_batch_unused(outcome, transport, FailureCode.RATE_LIMITED, [2, 1])
    assert transport.batches == [(sha(2), sha(1))]
    assert outcome.graphql == GraphQLUsage(calls=1, observed_cost=0, unobserved_calls=1)
    for text in (repr(outcome), caplog.text):
        assert TOKEN not in text
        assert _LIMIT_MESSAGE not in text


def test_200_with_an_unrelated_top_level_message_is_still_a_result() -> None:
    """errors 없는 HTTP 200에 한도와 무관한 최상위 message가 있어도 정상 결과를 쓴다."""
    body = {"message": "Notice: unrelated", "data": _data(_VALID, _commit(1))}
    routes = _routes(2, 1, overrides={graphql_route(2, 1): respond(body)})
    outcome, transport = _run(routes)

    assert outcome.completed
    assert _statuses(outcome) == [(sha(2), Lookup.FOUND), (sha(1), Lookup.EMPTY)]
    assert _lookup_numbers(outcome) == [41]
    assert transport.paths[: len(LISTS) + 1] == [*LISTS, graphql_route(2, 1)]
    assert detail_path(1) in transport.paths


def test_403_reads_only_top_level_errors() -> None:
    body = {
        "data": {"repository": {"c0": {"title": "API rate limit exceeded"}}},
        "errors": [{"type": "FORBIDDEN", "message": "Resource not accessible"}],
    }
    found = graphql_outcome(respond(body, status=403))

    assert isinstance(found, CollectionFailure)
    assert found.code is FailureCode.REPOSITORY_UNREACHABLE


def test_outcome_of_oversized_and_clean_replies() -> None:
    data = _data(_VALID)

    assert graphql_outcome(oversized(100)) is OVERSIZED
    assert graphql_outcome(respond({"data": data})) == {"data": data}
    # 마지막 점수를 쓴 정상 응답(머리글·본문 모두 남은 점수 0)은 오류가 아니다.
    used_up = {**data, "rateLimit": standard_rate_limit(remaining=0)}
    assert graphql_outcome(
        respond({"data": used_up}, headers={"x-ratelimit-remaining": "0"})
    ) == {"data": used_up}


@pytest.mark.parametrize("kind", [["RATE_LIMITED"], {"name": "RATE_LIMITED"}, 5])
@pytest.mark.parametrize(
    ("status", "message", "code"),
    [
        (200, "boom", FailureCode.COLLECTION_FETCH_FAILED),
        (403, "boom", FailureCode.REPOSITORY_UNREACHABLE),
        (200, "API rate limit exceeded", FailureCode.RATE_LIMITED),
        (403, "API rate limit exceeded", FailureCode.RATE_LIMITED),
    ],
)
def test_error_kind_that_is_not_text_is_not_a_limit_kind(
    kind: object, status: int, message: str, code: FailureCode
) -> None:
    """글자가 아닌 종류 값(목록·객체·숫자)도 예외 없이 분류한다. 한도 여부는 문구로만 정한다."""
    reply = respond({"errors": [{"type": kind, "message": message}]}, status=status)
    routes = _routes(2, 1, overrides={graphql_route(2, 1): reply})
    outcome, transport = _run(routes)

    _assert_batch_unused(outcome, transport, code, [2, 1])


def test_oversized_batch_is_limited_and_next_batch_is_sent() -> None:
    limits = replace(PROPOSED_LIMITS, max_lookup_batch=2)
    routes = _routes(
        3,
        2,
        1,
        lookups={1: respond([relation_pull_json(40, MEMBER)])},
        overrides={graphql_route(3, 2): oversized(PROPOSED_LIMITS.max_response_bytes)},
    )
    outcome, transport = _run(routes, limits=limits)

    assert outcome.completed
    assert transport.batches == [(sha(3), sha(2)), (sha(1),)]
    assert _statuses(outcome) == [
        (sha(3), Lookup.LIMITED),
        (sha(2), Lookup.LIMITED),
        (sha(1), Lookup.FOUND),
    ]
    assert _lookup_numbers(outcome) == [40]
    assert outcome.graphql == GraphQLUsage(calls=2, observed_cost=1, unobserved_calls=1)


def test_failed_batch_keeps_earlier_batches() -> None:
    limits = replace(PROPOSED_LIMITS, max_lookup_batch=2)
    routes = _routes(
        3,
        2,
        1,
        lookups={3: respond([relation_pull_json(40, MEMBER)]), 2: respond([])},
        overrides={graphql_route(1): status_only(502)},
    )
    outcome, transport = _run(routes, limits=limits)

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert _relations(outcome).stopped_during == "LOOKUPS"
    assert transport.paths == [*LISTS, graphql_route(3, 2), graphql_route(1)]
    assert _statuses(outcome) == [
        (sha(3), Lookup.FOUND),
        (sha(2), Lookup.EMPTY),
        (sha(1), Lookup.NOT_REACHED),
    ]
    assert _lookup_numbers(outcome) == [40]
    assert outcome.graphql == GraphQLUsage(calls=2, observed_cost=1, unobserved_calls=1)


# D. 점수 기록


def test_cost_is_summed_apart_from_call_count() -> None:
    limits = replace(PROPOSED_LIMITS, max_lookup_batch=1)
    routes = _routes(3, 2, 1, lookups={3: respond([]), 2: respond([]), 1: respond([])})
    outcome, transport = _run(
        routes,
        limits=limits,
        rate_limit=lambda index: standard_rate_limit(cost=index + 1),
    )
    rest = [call for call in transport.calls if call.method == "GET"]

    assert outcome.completed
    assert outcome.graphql == GraphQLUsage(calls=3, observed_cost=6, unobserved_calls=0)
    assert outcome.graphql.calls == len(transport.batches) == 3
    # 호출 수는 REST 호출과 POST를 1회씩 더한 값이다. 점수는 더하지 않는다.
    assert outcome.calls == len(rest) + 3 == len(transport.calls)


@pytest.mark.parametrize(
    "rate_limit",
    [
        pytest.param(OMIT, id="missing"),
        pytest.param(None, id="null"),
        pytest.param("1", id="text"),
        pytest.param({**standard_rate_limit(), "cost": "1"}, id="cost-text"),
        pytest.param({**standard_rate_limit(), "cost": -1}, id="cost-negative"),
        pytest.param({**standard_rate_limit(), "cost": True}, id="cost-bool"),
        pytest.param(_without(standard_rate_limit(), "resetAt"), id="no-reset"),
        pytest.param(
            {**standard_rate_limit(), "resetAt": "2026-10-01T01:00:00"},
            id="reset-without-zone",
        ),
    ],
)
def test_unknown_cost_keeps_data_and_counts_unobserved(rate_limit: object) -> None:
    routes = _routes(1, lookups={1: respond([relation_pull_json(40, MEMBER)])})
    outcome, _ = _run(routes, rate_limit=lambda index: rate_limit)

    assert outcome.completed
    assert _statuses(outcome) == [(sha(1), Lookup.FOUND)]
    assert _lookup_numbers(outcome) == [40]
    assert outcome.graphql == GraphQLUsage(calls=1, observed_cost=0, unobserved_calls=1)


def test_known_and_unknown_costs_are_counted_apart() -> None:
    limits = replace(PROPOSED_LIMITS, max_lookup_batch=1)
    routes = _routes(3, 2, 1, lookups={3: respond([]), 2: respond([]), 1: respond([])})
    outcome, _ = _run(
        routes,
        limits=limits,
        rate_limit=lambda index: OMIT if index == 1 else standard_rate_limit(cost=2),
    )

    assert outcome.completed
    assert outcome.graphql == GraphQLUsage(calls=3, observed_cost=4, unobserved_calls=1)


def test_used_up_score_stops_next_batch_before_sending() -> None:
    limits = replace(PROPOSED_LIMITS, max_lookup_batch=1)
    routes = _routes(
        2, 1, lookups={2: respond([relation_pull_json(40, MEMBER)]), 1: respond([])}
    )
    outcome, transport = _run(
        routes, limits=limits, rate_limit=lambda index: standard_rate_limit(remaining=0)
    )

    assert _codes(outcome) == [FailureCode.RATE_LIMITED]
    assert transport.batches == [(sha(2),)]
    assert _statuses(outcome) == [(sha(2), Lookup.FOUND), (sha(1), Lookup.NOT_REACHED)]
    assert _lookup_numbers(outcome) == [40]
    # 보내지 않은 묶음은 호출로 세지 않는다.
    assert outcome.graphql == GraphQLUsage(calls=1, observed_cost=1, unobserved_calls=0)
    assert outcome.calls == len(transport.calls) == len(LISTS) + 1


def test_used_up_score_after_reset_time_sends_next_batch() -> None:
    limits = replace(PROPOSED_LIMITS, max_lookup_batch=1)
    routes = _routes(2, 1, lookups={2: respond([]), 1: respond([])})
    outcome, transport = _run(
        routes,
        limits=limits,
        rate_limit=lambda index: standard_rate_limit(remaining=0, reset_minutes=0),
    )

    assert outcome.completed
    assert transport.batches == [(sha(2),), (sha(1),)]


def test_used_up_score_does_not_stop_rest_calls() -> None:
    routes = _routes(1, lookups={1: respond([])})
    outcome, transport = _run(
        routes, rate_limit=lambda index: standard_rate_limit(remaining=0)
    )

    assert outcome.completed
    # 연결 PR 조회 뒤의 커밋 상세(REST)는 GraphQL 점수와 무관하게 부른다.
    assert transport.paths[-1] == detail_path(1)


def test_rate_limit_reader_never_fails() -> None:
    assert normalize.graphql_rate_limit(
        {"rateLimit": standard_rate_limit(cost=3, remaining=10)}
    ) == normalize.RateLimitObservation(3, 10, START + timedelta(minutes=60))
    unknown: tuple[object, ...] = (
        None,
        [],
        {},
        {"rateLimit": None},
        {"rateLimit": {"cost": 1}},
    )
    for data in unknown:
        assert normalize.graphql_rate_limit(data) is None


def test_end_log_has_graphql_calls_and_cost_without_secrets(
    caplog: pytest.LogCaptureFixture,
) -> None:
    limits = replace(PROPOSED_LIMITS, max_lookup_batch=1)
    routes = _routes(3, 2, 1, lookups={3: respond([]), 2: respond([]), 1: respond([])})

    with caplog.at_level(logging.DEBUG, logger="app.collection"):
        outcome, transport = _run(
            routes,
            limits=limits,
            rate_limit=lambda index: OMIT if index == 0 else standard_rate_limit(),
        )
    [ended] = [
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith("수집 종료")
    ]

    assert outcome.completed
    assert f"calls={len(transport.calls)} " in ended
    assert "graphqlCalls=3 " in ended
    assert "graphqlCost=2 " in ended
    assert "graphqlCostUnobserved=1 " in ended
    assert TOKEN not in caplog.text and REFERENCE not in caplog.text
    assert not any(sha(n) in caplog.text for n in (1, 2, 3))
    assert BASE not in caplog.text
