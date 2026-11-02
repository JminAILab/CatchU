"""GitHub 호출 통제: 주소·우회 이동·상한·실패 응답.

모든 경우 다시 부르지 않고, 멈춘 것을 정상 0건으로 바꾸지 않으며, 그때까지 모은 자료를 남긴다.
"""

from dataclasses import replace
from datetime import timedelta

import pytest
from github_synthetic import (
    BASE,
    EVIL,
    MEMBER,
    REFERENCE,
    REPOSITORY,
    REQUEST,
    STANDARD_ORDER,
    START,
    TOKEN,
    FakeClock,
    FakeTransport,
    Reply,
    StaticCredentials,
    StaticSelections,
    associated_key,
    commit_detail_json,
    commit_json,
    credential_context,
    detail_path,
    detail_reply,
    empty_repository,
    file_json,
    graph_commit_json,
    graphql_route,
    issue_json,
    oversized,
    pull_json,
    relation_repository_json,
    repository_json,
    respond,
    sha,
    standard_routes,
    status_only,
)

from app.collection import (
    PROPOSED_LIMITS,
    AccessToken,
    CollectionLimits,
    CollectionOutcome,
    DetailStatus,
    FailureCode,
    Lookup,
    RelationObservations,
    RelationOptions,
    collect,
)
from app.collection.api_paths import ApiPath
from app.collection.budget import CollectionBudget
from app.collection.failures import CollectionStopped
from app.collection.gateway import GitHubGateway, GraphQLUsage, has_next_page
from app.collection.graphql import associated_pulls_request
from app.collection.transport import HttpResponse, TransportError, TransportTimeout

COMMITS = f"{BASE}/commits?per_page=100&page=1"
PULLS = f"{BASE}/pulls?state=all&sort=created&direction=desc&per_page=100&page=1"
ISSUES = f"{BASE}/issues?state=all&sort=created&direction=desc&per_page=100&page=1"


def _run(
    routes: dict[str, Reply],
    *,
    limits: CollectionLimits = PROPOSED_LIMITS,
    clock: FakeClock | None = None,
    seconds_per_call: float = 0.0,
    relations: RelationOptions | None = None,
) -> tuple[CollectionOutcome, FakeTransport]:
    clock = clock or FakeClock()
    transport = FakeTransport(routes, clock=clock, seconds_per_call=seconds_per_call)
    outcome = collect(
        REQUEST,
        credentials=StaticCredentials(),
        selections=StaticSelections(),
        open_transport=lambda: transport,
        clock=clock,
        limits=limits,
        relations=relations,
    )
    return outcome, transport


def _codes(outcome: CollectionOutcome) -> list[FailureCode]:
    return [failure.code for failure in outcome.failures]


# 관계 조회(#118·#267) 합성: 회원 커밋 c3·c2·c1(직선, c1이 뿌리), PR·이슈 없음. 회원 커밋은 모두
# PR로 설명되지 않아 연결 PR 묶음 조회(POST /graphql) 대상이다.
OWN = (3, 2, 1)
# 묶음 조회 전 REST 호출: 저장소·커밋·PR·이슈 목록.
BEFORE_LOOKUPS = [BASE, COMMITS, PULLS, ISSUES]


def _relation_routes() -> dict[str, Reply]:
    routes: dict[str, Reply] = {
        BASE: respond(relation_repository_json()),
        COMMITS: respond(
            [
                graph_commit_json(n, MEMBER, parents=(n - 1,) if n > 1 else ())
                for n in OWN
            ]
        ),
        PULLS: respond([]),
        ISSUES: respond([]),
    }
    for number in OWN:
        routes[associated_key(number)] = respond([])
        routes[detail_path(number)] = detail_reply(number, MEMBER)
    return routes


def _run_relations(
    routes: dict[str, Reply], *, limits: CollectionLimits = PROPOSED_LIMITS
) -> tuple[CollectionOutcome, FakeTransport, RelationObservations]:
    outcome, transport = _run(routes, limits=limits, relations=RelationOptions())
    assert outcome.relations is not None
    return outcome, transport, outcome.relations


def _lookups(relations: RelationObservations) -> list[tuple[str, Lookup]]:
    return [(entry.sha, entry.status) for entry in relations.associated]


def _received_before_lookups(routes: dict[str, Reply]) -> int:
    return sum(
        reply.received_bytes
        for path in BEFORE_LOOKUPS
        if isinstance(reply := routes[path], HttpResponse)
    )


# 주소·권한


def test_only_the_target_repository_on_api_github_com_is_called() -> None:
    outcome, transport = _run(standard_routes())

    assert outcome.completed
    assert transport.paths == STANDARD_ORDER
    assert all(path.startswith(f"{BASE}") for path in transport.paths)
    # 응답 본문·이슈 본문·Link 헤더의 주소, 포크 원본 저장소는 부르지 않는다.
    assert not any("evil" in path or "someone-else" in path for path in transport.paths)


def test_transport_bound_to_another_host_is_refused_before_any_call() -> None:
    transport = FakeTransport(standard_routes(), host="api.github.com.evil.invalid")

    with pytest.raises(ValueError, match="api.github.com"):
        collect(
            REQUEST,
            credentials=StaticCredentials(),
            selections=StaticSelections(),
            open_transport=lambda: transport,
            clock=FakeClock(),
        )

    assert transport.calls == []
    assert transport.closed


@pytest.mark.parametrize("status", [301, 302, 307, 308])
def test_redirect_is_not_followed(status: int) -> None:
    routes = standard_routes()
    routes[BASE] = status_only(status, {"location": f"{EVIL}/moved"})

    outcome, transport = _run(routes)

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert transport.paths == [BASE]


def test_next_page_address_from_link_header_is_not_used() -> None:
    routes = standard_routes()
    first = [commit_json(100 + n, None) for n in range(100)]
    second = [commit_json(300 + n, None) for n in range(3)]
    routes[f"{BASE}/commits?per_page=100&page=1"] = respond(first, next_page=True)
    routes[f"{BASE}/commits?per_page=100&page=2"] = respond(second)

    outcome, transport = _run(routes)

    assert outcome.completed
    assert f"{BASE}/commits?per_page=100&page=2" in transport.paths
    assert len(outcome.commits) == 103


def test_link_header_is_read_only_for_a_next_page_marker() -> None:
    assert has_next_page(f'<{EVIL}/x?page=2>; rel="next", <{EVIL}/y>; rel="last"')
    assert has_next_page('<https://api.github.com/x>; rel="prev next"')
    assert not has_next_page(f'<{EVIL}/y>; rel="last", <{EVIL}/z>; rel="prev"')
    assert not has_next_page(None)
    assert not has_next_page("")


# 실패 응답 — 다시 부르지 않음


@pytest.mark.parametrize(
    ("reply", "code"),
    [
        (status_only(429, {"retry-after": "60"}), FailureCode.RATE_LIMITED),
        (
            status_only(403, {"x-ratelimit-remaining": "0"}),
            FailureCode.RATE_LIMITED,
        ),
        (status_only(403, {"retry-after": "30"}), FailureCode.RATE_LIMITED),
        (
            respond(
                {"message": "You have exceeded a secondary rate limit."}, status=403
            ),
            FailureCode.RATE_LIMITED,
        ),
        (status_only(500), FailureCode.COLLECTION_FETCH_FAILED),
        (status_only(502), FailureCode.COLLECTION_FETCH_FAILED),
        (status_only(503), FailureCode.COLLECTION_FETCH_FAILED),
        (TransportTimeout("합성 시간 초과"), FailureCode.COLLECTION_FETCH_FAILED),
        (TransportError("합성 연결 오류"), FailureCode.COLLECTION_FETCH_FAILED),
        (status_only(401), FailureCode.CREDENTIAL_REJECTED),
        (status_only(403), FailureCode.REPOSITORY_UNREACHABLE),
        (status_only(404), FailureCode.REPOSITORY_UNREACHABLE),
        (status_only(422), FailureCode.COLLECTION_FETCH_FAILED),
    ],
)
def test_failed_call_stops_without_retry_and_keeps_collected_records(
    reply: Reply, code: FailureCode
) -> None:
    routes = standard_routes()
    routes[PULLS] = reply

    outcome, transport = _run(routes)

    assert _codes(outcome) == [code]
    assert not outcome.completed
    # 저장소·커밋 목록까지 부르고, 실패한 PR 목록은 한 번만 불렀다.
    assert transport.paths == STANDARD_ORDER[:3]
    assert transport.paths.count(PULLS) == 1
    # 먼저 모은 커밋은 남고, 회원 커밋의 변경 내용은 확인 중단으로 남는다.
    assert len(outcome.commits) == 3
    assert outcome.commits[0].changes_status is DetailStatus.NOT_REACHED
    assert outcome.pull_requests == ()
    limits = {(limit.resource_type, limit.message) for limit in outcome.coverage_limits}
    assert ("PULL_REQUEST", "수집이 멈춰 PR 목록을 확인하지 못했다") in limits
    assert ("ISSUE", "수집이 멈춰 이슈 목록을 확인하지 못했다") in limits


@pytest.mark.parametrize(
    ("route", "reply", "code"),
    [
        # 빈 저장소가 아닌 충돌, 문구가 다른 409, 본문을 읽을 수 없는 409.
        (COMMITS, status_only(409), FailureCode.COLLECTION_FETCH_FAILED),
        (
            COMMITS,
            empty_repository("Git Repository is empty"),
            FailureCode.COLLECTION_FETCH_FAILED,
        ),
        (
            COMMITS,
            HttpResponse(409, {}, b"Git Repository is empty.", 24),
            FailureCode.COLLECTION_FETCH_FAILED,
        ),
        (
            COMMITS,
            HttpResponse(409, {}, None, 0),
            FailureCode.COLLECTION_FETCH_FAILED,
        ),
        # 빈 저장소 응답을 받는 곳은 커밋 목록뿐이다.
        (PULLS, empty_repository(), FailureCode.COLLECTION_FETCH_FAILED),
        (ISSUES, empty_repository(), FailureCode.COLLECTION_FETCH_FAILED),
        # 커밋 목록의 다른 실패 응답은 그대로다.
        (COMMITS, status_only(429), FailureCode.RATE_LIMITED),
        (
            COMMITS,
            status_only(403, {"x-ratelimit-remaining": "0"}),
            FailureCode.RATE_LIMITED,
        ),
        (COMMITS, status_only(403), FailureCode.REPOSITORY_UNREACHABLE),
        (COMMITS, status_only(500), FailureCode.COLLECTION_FETCH_FAILED),
        (COMMITS, status_only(503), FailureCode.COLLECTION_FETCH_FAILED),
        (
            COMMITS,
            TransportTimeout("합성 시간 초과"),
            FailureCode.COLLECTION_FETCH_FAILED,
        ),
    ],
)
def test_other_conflicts_and_failures_still_stop_collection(
    route: str, reply: Reply, code: FailureCode
) -> None:
    routes = standard_routes()
    routes[route] = reply

    outcome, transport = _run(routes)

    assert _codes(outcome) == [code]
    assert transport.paths[-1] == route
    assert transport.paths.count(route) == 1


def test_empty_repository_reply_after_the_first_commit_page_still_stops() -> None:
    # 앞쪽에 커밋이 있었으면 빈 저장소가 아니다.
    routes = standard_routes()
    routes[COMMITS] = respond(
        [commit_json(100 + n, MEMBER) for n in range(100)], next_page=True
    )
    routes[f"{BASE}/commits?per_page=100&page=2"] = empty_repository()

    outcome, _ = _run(routes)

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert len(outcome.commits) == 100


def test_malformed_response_stops_collection() -> None:
    routes = standard_routes()
    routes[ISSUES] = respond({"message": "목록이 아님"})

    outcome, _ = _run(routes)

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert len(outcome.pull_requests) == 2


def test_response_for_another_repository_stops_collection() -> None:
    routes = standard_routes()
    routes[BASE] = respond({"full_name": "someone-else/other-repo"})

    outcome, transport = _run(routes)

    assert _codes(outcome) == [FailureCode.SCOPE_INCONSISTENT]
    assert transport.paths == [BASE]


def _metadata_without(key: str) -> dict[str, object]:
    data: dict[str, object] = repository_json()
    del data[key]
    return data


@pytest.mark.parametrize(
    "metadata",
    [
        repository_json(),
        # visibility는 GitHub 응답의 선택 항목이다. 필수 항목 private가 공개를 말한다.
        _metadata_without("visibility"),
    ],
)
def test_public_repository_is_collected(metadata: dict[str, object]) -> None:
    routes = standard_routes()
    routes[BASE] = respond(metadata)

    outcome, transport = _run(routes)

    assert outcome.completed
    assert transport.paths == STANDARD_ORDER


@pytest.mark.parametrize(
    ("metadata", "code"),
    [
        # 토큰으로 접근되더라도 비공개 저장소는 수집하지 않는다.
        (
            repository_json(private=True, visibility="private"),
            FailureCode.REPOSITORY_UNREACHABLE,
        ),
        (repository_json(private=True), FailureCode.REPOSITORY_UNREACHABLE),
        (repository_json(visibility="internal"), FailureCode.REPOSITORY_UNREACHABLE),
        (repository_json(visibility="private"), FailureCode.REPOSITORY_UNREACHABLE),
        # 공개 여부를 확인할 수 없으면 공개로 추정하지 않는다.
        (_metadata_without("private"), FailureCode.COLLECTION_FETCH_FAILED),
        (repository_json(private=None), FailureCode.COLLECTION_FETCH_FAILED),
        (repository_json(private="false"), FailureCode.COLLECTION_FETCH_FAILED),
        (repository_json(visibility=0), FailureCode.COLLECTION_FETCH_FAILED),
    ],
)
def test_repository_not_confirmed_public_stops_before_any_listing(
    metadata: dict[str, object], code: FailureCode
) -> None:
    routes = standard_routes()
    routes[BASE] = respond(metadata)

    outcome, transport = _run(routes)

    assert _codes(outcome) == [code]
    # 저장소 확인 뒤 커밋·PR·이슈의 목록·상세를 부르지 않았다.
    assert transport.paths == [BASE]
    assert (outcome.commits, outcome.pull_requests, outcome.issues) == ((), (), ())


def test_stop_on_a_later_page_keeps_the_pages_already_received() -> None:
    routes = standard_routes()
    routes[f"{BASE}/commits?per_page=100&page=1"] = respond(
        [commit_json(100 + n, MEMBER) for n in range(100)], next_page=True
    )
    routes[f"{BASE}/commits?per_page=100&page=2"] = status_only(503)

    outcome, transport = _run(routes)

    assert _codes(outcome) == [FailureCode.COLLECTION_FETCH_FAILED]
    assert transport.paths[-1] == f"{BASE}/commits?per_page=100&page=2"
    assert len(outcome.commits) == 100
    assert {c.changes_status for c in outcome.commits} == {DetailStatus.NOT_REACHED}
    limits = {(limit.resource_type, limit.message) for limit in outcome.coverage_limits}
    assert ("COMMIT", "수집이 멈춰 커밋 목록을 100건까지만 확인했다") in limits


# 요청 전체 상한


def test_call_limit_stops_collection_as_failure() -> None:
    outcome, transport = _run(
        standard_routes(), limits=replace(PROPOSED_LIMITS, max_calls=4)
    )

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert transport.paths == STANDARD_ORDER[:4]
    assert outcome.calls == 4
    # 목록은 모두 남고, 상세는 확인 중단이다.
    assert len(outcome.issues) == 1
    assert outcome.commits[0].changes_status is DetailStatus.NOT_REACHED
    assert outcome.pull_requests[0].commits_status is DetailStatus.NOT_REACHED


def test_full_count_range_with_own_records_fits_the_default_call_limit() -> None:
    """조회 개수를 다 채우고 모든 기록이 연동 계정 것이어도 기본 호출 상한에 걸리지 않는다.

    상세는 상세 조회 개수만큼만 부르고 나머지는 실패가 아니라 한계로 남는다.
    """
    routes = standard_routes()
    for page in range(1, 31):
        numbers = range(page * 1000, page * 1000 + 100)
        routes[f"{BASE}/commits?per_page=100&page={page}"] = respond(
            [commit_json(n, MEMBER) for n in numbers], next_page=True
        )
        for n in numbers:
            routes[f"{BASE}/commits/{sha(n)}"] = respond(
                commit_detail_json(n, MEMBER, [file_json("a.py", 1, 0)])
            )
    for page in range(1, 7):
        numbers = range((page - 1) * 100 + 1, page * 100 + 1)
        routes[PULLS.replace("&page=1", f"&page={page}")] = respond(
            [pull_json(n, MEMBER) for n in numbers], next_page=True
        )
    for number in range(1, 31):
        for page, count in ((1, 100), (2, 100), (3, 50)):
            routes[f"{BASE}/pulls/{number}/commits?per_page=100&page={page}"] = respond(
                [{"sha": sha(90000 + page * 1000 + n)} for n in range(count)],
                next_page=page < 3,
            )
    for page in range(1, 11):
        numbers = range((page - 1) * 100 + 1, page * 100 + 1)
        routes[ISSUES.replace("&page=1", f"&page={page}")] = respond(
            [issue_json(n, MEMBER) for n in numbers], next_page=True
        )

    outcome, transport = _run(routes)

    assert outcome.completed
    assert len(outcome.commits) == 3000
    assert len(outcome.pull_requests) == 600
    assert len(outcome.issues) == 1000
    # 관계 조회 없는 경로: 목록 47 + 상세 1500 + PR 목록 30 * 3.
    assert len(transport.calls) == 1637 <= PROPOSED_LIMITS.max_calls
    statuses = [c.changes_status for c in outcome.commits]
    assert (
        statuses == [DetailStatus.FETCHED] * 1500 + [DetailStatus.BEYOND_RANGE] * 1500
    )
    pulls = [p.commits_status for p in outcome.pull_requests]
    assert pulls == [DetailStatus.FETCHED] * 30 + [DetailStatus.BEYOND_RANGE] * 570
    limits = {(limit.resource_type, limit.message) for limit in outcome.coverage_limits}
    # 작성자 계정 기준은 유지하고 #424 후속 결정의 상세 1500건을 적용한다.
    assert (
        "COMMIT",
        "연동 계정이 작성자로 기록된 최근 커밋 1500건 밖은 변경 내용을 조회하지 않았다",
    ) in limits
    assert (
        "PULL_REQUEST",
        "연동 계정이 연 최근 PR 30건 밖은 커밋 목록을 조회하지 않았다",
    ) in limits
    assert "상세 조회 개수 범위 밖이라 변경 내용을 조회하지 않았다" in (
        outcome.evidence_for(outcome.commits[-1]).coverage_limits
    )


def test_total_size_limit_stops_collection_as_failure() -> None:
    routes = standard_routes()
    received = sum(
        reply.received_bytes
        for path in STANDARD_ORDER[:2]
        if isinstance(reply := routes[path], HttpResponse)
    )

    outcome, transport = _run(
        routes, limits=replace(PROPOSED_LIMITS, max_total_bytes=received)
    )

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert transport.paths == STANDARD_ORDER[:3]


SHORT_TIME = replace(PROPOSED_LIMITS, max_collection_time=timedelta(seconds=30))


def test_collection_time_limit_uses_one_clock_from_the_start() -> None:
    # 호출마다 15초가 걸린다. 두 번째 호출 뒤 30초가 지나 세 번째 호출 전에 멈춘다.
    outcome, transport = _run(standard_routes(), limits=SHORT_TIME, seconds_per_call=15)

    assert _codes(outcome) == [FailureCode.TIME_LIMIT_EXCEEDED]
    assert transport.paths == STANDARD_ORDER[:2]
    assert len(outcome.commits) == 3


def test_call_cut_by_remaining_collection_time_is_a_time_limit_failure() -> None:
    # 호출마다 12초가 걸린다. 세 번째 호출은 남은 6초로 대기가 줄어 그 안에 끝나지 못한다.
    outcome, transport = _run(standard_routes(), limits=SHORT_TIME, seconds_per_call=12)

    assert _codes(outcome) == [FailureCode.TIME_LIMIT_EXCEEDED]
    first, _, third = transport.calls
    assert (first.connect_timeout, first.read_timeout) == (5.0, 15.0)
    assert (third.connect_timeout, third.read_timeout) == (5.0, 6.0)
    assert first.max_bytes == PROPOSED_LIMITS.max_response_bytes
    assert len(outcome.commits) == 3


def test_response_finished_after_the_deadline_is_not_used() -> None:
    clock = FakeClock()
    routes = standard_routes()
    commits = routes[f"{BASE}/commits?per_page=100&page=1"]
    assert isinstance(commits, HttpResponse)

    def late() -> HttpResponse:
        # 연결 단계가 길어 수집 마감 뒤에야 응답을 다 받았다.
        clock.advance(31)
        return commits

    routes[f"{BASE}/commits?per_page=100&page=1"] = late

    outcome, transport = _run(routes, limits=SHORT_TIME, clock=clock)

    assert _codes(outcome) == [FailureCode.TIME_LIMIT_EXCEEDED]
    assert transport.paths == STANDARD_ORDER[:2]
    assert outcome.commits == ()


def test_credential_expiring_during_collection_stops_without_refresh() -> None:
    clock = FakeClock()
    transport = FakeTransport(standard_routes())
    budget = CollectionBudget(PROPOSED_LIMITS, clock=clock, started_at=START)
    gateway = GitHubGateway(
        transport,
        token=AccessToken(TOKEN),
        expires_at=START + timedelta(minutes=1),
        budget=budget,
        clock=clock,
        limits=PROPOSED_LIMITS,
    )
    gateway.get(ApiPath(BASE))
    clock.advance(60)

    with pytest.raises(CollectionStopped) as stopped:
        gateway.get(ApiPath(BASE))

    assert stopped.value.failure.code is FailureCode.CREDENTIAL_EXPIRED
    assert len(transport.calls) == 1


def test_credential_expiring_before_the_first_lookup_post_sends_nothing() -> None:
    """연결 PR 묶음 조회(POST)도 보내기 전에 만료를 확인한다. 만료면 보내지 않고 호출로 세지 않는다."""
    clock = FakeClock()
    transport = FakeTransport(standard_routes())
    budget = CollectionBudget(PROPOSED_LIMITS, clock=clock, started_at=START)
    gateway = GitHubGateway(
        transport,
        token=AccessToken(TOKEN),
        expires_at=START + timedelta(minutes=1),
        budget=budget,
        clock=clock,
        limits=PROPOSED_LIMITS,
    )
    gateway.get(ApiPath(BASE))
    clock.advance(60)

    with pytest.raises(CollectionStopped) as stopped:
        gateway.post_graphql(associated_pulls_request(REPOSITORY, [sha(1)]))

    assert stopped.value.failure.code is FailureCode.CREDENTIAL_EXPIRED
    assert transport.paths == [BASE]
    assert transport.batches == []
    assert budget.calls == 1
    assert gateway.graphql_usage == GraphQLUsage()


# 연결 PR 묶음 조회(#267)도 같은 요청 상한 안에서 부른다


def test_call_limit_right_before_the_lookup_post_leaves_lookups_not_reached() -> None:
    """목록 호출로 호출 수 상한에 닿으면 묶음 조회 POST를 보내지 않는다. 계획한 조회는 확인 중단이다."""
    limits = replace(PROPOSED_LIMITS, max_calls=len(BEFORE_LOOKUPS))

    outcome, transport, relations = _run_relations(_relation_routes(), limits=limits)

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert transport.paths == BEFORE_LOOKUPS
    assert transport.batches == []
    assert outcome.calls == len(BEFORE_LOOKUPS)
    assert outcome.graphql == GraphQLUsage()
    assert relations.stopped_during == "LOOKUPS"
    assert _lookups(relations) == [(sha(n), Lookup.NOT_REACHED) for n in OWN]
    assert {c.changes_status for c in outcome.commits} == {DetailStatus.NOT_REACHED}


def test_oversized_lookup_reply_past_the_total_size_is_a_failure_not_a_limit() -> None:
    """묶음 응답이 단일 응답 상한을 넘었어도, 받은 크기로 수집 총량을 넘었으면 한계(LIMITED)가
    아니라 총량 상한 실패다. 그 묶음은 확인 중단으로 남는다."""
    routes = _relation_routes()
    # 전송은 단일 응답 상한을 1바이트 넘겨 받은 뒤 읽기를 멈춘다.
    received = PROPOSED_LIMITS.max_response_bytes + 1
    routes[graphql_route(*OWN)] = oversized(received)
    limits = replace(
        PROPOSED_LIMITS,
        max_total_bytes=_received_before_lookups(routes) + received - 1,
    )

    outcome, transport, relations = _run_relations(routes, limits=limits)

    assert _codes(outcome) == [FailureCode.BUDGET_EXCEEDED]
    assert transport.paths == [*BEFORE_LOOKUPS, graphql_route(*OWN)]
    assert outcome.received_bytes > limits.max_total_bytes
    # 보낸 POST는 호출로 세고, 점수는 알 수 없는 호출로 센다.
    assert outcome.graphql == GraphQLUsage(calls=1, unobserved_calls=1)
    assert _lookups(relations) == [(sha(n), Lookup.NOT_REACHED) for n in OWN]
    assert {c.changes_status for c in outcome.commits} == {DetailStatus.NOT_REACHED}


def test_oversized_lookup_reply_within_the_total_size_limits_only_its_batch() -> None:
    """총량 안에서 단일 응답 상한을 넘은 묶음은 그 커밋 모두 LIMITED이고, 다음 묶음은 그대로 보낸다."""
    routes = _relation_routes()
    routes[graphql_route(3, 2)] = oversized(PROPOSED_LIMITS.max_response_bytes + 1)
    limits = replace(PROPOSED_LIMITS, max_lookup_batch=2)

    outcome, transport, relations = _run_relations(routes, limits=limits)

    assert outcome.completed
    assert transport.batches == [(sha(3), sha(2)), (sha(1),)]
    # 넘은 묶음을 나눠 다시 묻지 않는다.
    assert transport.looked_up == [sha(n) for n in OWN]
    assert _lookups(relations) == [
        (sha(3), Lookup.LIMITED),
        (sha(2), Lookup.LIMITED),
        (sha(1), Lookup.EMPTY),
    ]
    assert outcome.graphql == GraphQLUsage(calls=2, observed_cost=1, unobserved_calls=1)
    assert outcome.calls == len(transport.calls)
    # 묶음 조회 뒤 변경 내용(REST)도 부른다.
    assert {detail_path(n) for n in OWN} <= set(transport.paths)


# 자격정보는 호출 머리글에만


@pytest.mark.parametrize("relation", [False, True], ids=["lists", "relations"])
def test_token_is_sent_only_as_authorization_and_reference_never_leaves(
    relation: bool,
) -> None:
    if relation:
        # 관계 조회에는 연결 PR 묶음 조회 POST가 있다. 토큰은 그 본문에도 싣지 않는다.
        outcome, transport, _ = _run_relations(_relation_routes())
        assert outcome.completed
        assert transport.batches == [tuple(sha(n) for n in OWN)]
    else:
        _, transport = _run(standard_routes())

    for call in transport.calls:
        assert call.headers["Authorization"] == f"Bearer {TOKEN}"
        assert TOKEN not in call.path
        assert REFERENCE not in call.path
        assert not any(REFERENCE in value for value in call.headers.values())
        others = {k: v for k, v in call.headers.items() if k != "Authorization"}
        assert not any(TOKEN in value for value in others.values())
        if call.method == "POST":
            assert call.body is not None
            assert TOKEN.encode() not in call.body
            assert REFERENCE.encode() not in call.body
        else:
            assert call.body is None


def test_context_repr_hides_token() -> None:
    context = credential_context()

    assert TOKEN not in repr(context)
    assert TOKEN not in str(context.access_token)
