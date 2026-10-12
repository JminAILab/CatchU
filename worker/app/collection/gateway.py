"""GitHub API 호출이 지나는 유일한 곳.

호출마다 자격정보 만료·호출 수·수집 시간을 확인하고, 받은 크기를 총량에 더한 뒤 응답
상태를 해석한다. 200이 아닌 응답(빈 Git 저장소의 커밋 목록 409는 빼고)·시간 초과·연결 오류·
우회 이동은 다시 부르지 않고 수집을 멈춘다. 관계 조회의 404·409·422도 다른 호출과 같다.
응답은 JSON으로 받는다(`get`). 커밋의 파일 모드를 볼 때만 같은 경로를 diff 형식으로 받아
본문을 해석하지 않은 바이트로 넘긴다(`get_diff`). 두 호출의 상한·상태 해석은 같다.

연결 PR 묶음 조회(#267)만 GraphQL로 부른다(`post_graphql`). 주소는 `/graphql` 하나이고 쿼리는
graphql.py의 틀로 만든 것만 받는다. 호출 수·시간·크기·자격정보 통제는 REST 호출과 같고, POST 한
번이 호출 1회다. GraphQL 점수(`rateLimit.cost`)는 호출 수에 더하지 않고 따로 센다.
"""

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import cast

from app.collection import normalize
from app.collection.api_paths import ApiPath
from app.collection.budget import CollectionBudget
from app.collection.credentials import AccessToken
from app.collection.failures import (
    CollectionFailure,
    CollectionStopped,
    FailureCode,
    stop,
)
from app.collection.graphql import GRAPHQL_PATH, GraphQLRequest
from app.collection.limits import CollectionLimits
from app.collection.transport import (
    GITHUB_API_HOST,
    HttpResponse,
    Transport,
    TransportError,
    TransportTimeout,
)

_FIXED_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "CatchU-worker",
}
# 커밋 경로를 git diff 모양의 글로 받는 형식. 커밋 상세(JSON)에 없는 파일 모드 줄이 있다.
DIFF_MEDIA_TYPE = "application/vnd.github.diff"
# GraphQL 호출의 머리글. REST 판본 머리글(X-GitHub-Api-Version)은 REST에만 쓴다.
_GRAPHQL_HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": _FIXED_HEADERS["User-Agent"],
}
# 묶음 조회 본문의 최대 크기. 틀과 커밋 100개의 변수만 실으므로 이보다 커지면 만드는 쪽의 잘못이다.
_MAX_GRAPHQL_BODY = 64 * 1024


@dataclass(frozen=True)
class Fetched:
    data: object
    # Link 헤더에 다음 쪽이 있다는 표시만 본다. 그 주소는 쓰지 않는다.
    has_next_page: bool


@dataclass(frozen=True)
class GraphQLFetched:
    """오류 없이 받은 GraphQL 응답의 `data`. 모양 검사는 받는 쪽이 한다."""

    data: object


@dataclass(frozen=True)
class GraphQLUsage:
    """요청 한 건의 GraphQL 사용. 호출 수 상한에는 calls만 든다(REST 호출과 합산)."""

    # 보낸 POST 수(실패한 호출 포함).
    calls: int = 0
    # 응답이 알려 준 점수(`rateLimit.cost`)의 합.
    observed_cost: int = 0
    # 점수를 알 수 없었던 호출 수(보낸 뒤 전송·HTTP 오류·최상위 errors로 실패, 크기 초과, `rateLimit`
    # 누락). 0점으로 세지 않는다.
    unobserved_calls: int = 0


@dataclass(frozen=True)
class Oversized:
    """단일 응답 크기 상한을 넘어 본문을 버렸다. 실패가 아니라 그 항목의 한계다."""


OVERSIZED = Oversized()


def has_next_page(link_header: str | None) -> bool:
    if not link_header:
        return False
    for part in link_header.split(","):
        for parameter in part.split(";")[1:]:
            name, _, value = parameter.strip().partition("=")
            if name.strip().lower() == "rel" and "next" in value.strip('" ').split():
                return True
    return False


# GitHub가 빈 Git 저장소의 커밋 목록에 409와 함께 주는 문구.
EMPTY_REPOSITORY_MESSAGE = "Git Repository is empty."


def is_empty_repository(response: HttpResponse) -> bool:
    """빈 Git 저장소라는 409 응답인가. 문구가 다르거나 본문을 읽을 수 없으면 아니다."""
    if response.status != 409 or response.body is None:
        return False
    try:
        data = json.loads(response.body)
    except (ValueError, RecursionError):
        return False
    return isinstance(data, dict) and data.get("message") == EMPTY_REPOSITORY_MESSAGE


def failure_for(response: HttpResponse) -> CollectionFailure | None:
    """성공(200)이 아닌 응답의 실패. 원인이 다른 응답은 다른 코드로 둔다."""
    status, headers = response.status, response.headers
    if status == 200:
        return None
    if 300 <= status < 400:
        return CollectionFailure(
            FailureCode.COLLECTION_FETCH_FAILED,
            f"우회 이동 응답(HTTP {status})을 따라가지 않고 수집을 멈췄다",
        )
    if status == 401:
        return CollectionFailure(
            FailureCode.CREDENTIAL_REJECTED,
            "GitHub가 자격정보를 받아들이지 않아 수집을 멈췄다",
        )
    # 보조 호출 한도는 한도 머리글 없이 403과 안내 문구만 줄 때가 있다.
    rate_limited = status == 429 or (
        status == 403
        and (
            headers.get("x-ratelimit-remaining") == "0"
            or "retry-after" in headers
            or b"rate limit" in (response.body or b"").lower()
        )
    )
    if rate_limited:
        return CollectionFailure(
            FailureCode.RATE_LIMITED,
            f"GitHub 호출 한도 응답(HTTP {status})을 받아 다시 부르지 않고 수집을 멈췄다",
        )
    if status in (403, 404):
        return CollectionFailure(
            FailureCode.REPOSITORY_UNREACHABLE,
            f"저장소 자료에 접근하지 못해(HTTP {status}) 수집을 멈췄다",
        )
    return CollectionFailure(
        FailureCode.COLLECTION_FETCH_FAILED,
        f"GitHub 조회가 실패해(HTTP {status}) 다시 부르지 않고 수집을 멈췄다",
    )


# GitHub가 1차·2차 호출 한도에 걸린 응답에 쓰는 문구. 응답의 오류 문구에서만 찾는다.
_LIMIT_PHRASES = ("rate limit", "abuse detection")
# GitHub가 1차 한도 오류에 붙이는 종류 값. 공식 문서가 정한 값이 아니라서 이것 하나에만 기대지 않는다.
_LIMIT_TYPES = frozenset({"RATE_LIMITED"})


def _limit_headers(headers: Mapping[str, str]) -> bool:
    return headers.get("x-ratelimit-remaining") == "0" or "retry-after" in headers


def _mentions_limit(text: object) -> bool:
    return isinstance(text, str) and any(
        phrase in text.casefold() for phrase in _LIMIT_PHRASES
    )


def _limit_errors(top: Mapping[str, object]) -> bool:
    """최상위 message·errors가 한도 오류를 알리는가. data 안의 글(PR 제목·본문)은 보지 않는다."""
    if _mentions_limit(top.get("message")):
        return True
    errors = top.get("errors")
    if not isinstance(errors, list):
        return False
    return any(
        isinstance(error, Mapping)
        and (_limit_type(error) or _mentions_limit(error.get("message")))
        for error in errors
    )


def _limit_type(error: Mapping[str, object]) -> bool:
    # 종류가 글자가 아니면(목록·객체 등) 한도 종류로 보지 않는다.
    kind = error.get("type")
    return isinstance(kind, str) and kind in _LIMIT_TYPES


def _json_object(body: bytes | None) -> Mapping[str, object] | None:
    if body is None:
        return None
    try:
        data = json.loads(body)
    except (ValueError, RecursionError):
        return None
    return cast(Mapping[str, object], data) if isinstance(data, dict) else None


def graphql_outcome(
    response: HttpResponse,
) -> CollectionFailure | Mapping[str, object] | Oversized:
    """GraphQL 응답의 실패, 크기 초과, 또는 오류 없는 최상위 객체.

    자격정보·전송·HTTP 오류는 REST와 같은 코드다(401·한도와 무관한 403/404·429·3xx·5xx). 403과
    errors가 있는 200은 머리글과 최상위 message·errors로 한도 오류를 가린다. errors가 없는 200도
    최상위 message가 한도를 알리면 한도 오류다. 그 밖의 errors 없는 200은 남은 점수가 0이어도
    정상이다. 200이라도 errors가 있으면(부분 data가
    함께 와도) 실패이고, 한도 오류가 섞였으면 한도 오류로 둔다.
    """
    status, headers = response.status, response.headers
    if status == 200 and response.body is None:
        return OVERSIZED
    top = _json_object(response.body)
    if status == 403:
        limited = _limit_headers(headers) or (
            _limit_errors(top)
            if top is not None
            # JSON이 아닌 본문에는 PR 글이 들어 있지 않다. REST 403과 같이 본문 문구를 본다.
            else b"rate limit" in (response.body or b"").lower()
        )
        if limited:
            return CollectionFailure(
                FailureCode.RATE_LIMITED,
                "GitHub 호출 한도 응답(HTTP 403)을 받아 다시 부르지 않고 수집을 멈췄다",
            )
        return CollectionFailure(
            FailureCode.REPOSITORY_UNREACHABLE,
            "저장소 자료에 접근하지 못해(HTTP 403) 수집을 멈췄다",
        )
    failure = failure_for(response)
    if failure is not None:
        return failure
    # 여기부터 HTTP 200이다.
    if top is None:
        return CollectionFailure(
            FailureCode.COLLECTION_FETCH_FAILED,
            "GitHub 응답을 해석하지 못해 수집을 멈췄다",
        )
    if _mentions_limit(top.get("message")):
        # errors 없이 최상위 message로만 한도를 알린 응답(2차 한도는 200으로도 온다). data는 보지 않는다.
        return CollectionFailure(
            FailureCode.RATE_LIMITED,
            "GitHub GraphQL 호출 한도 오류를 받아 다시 부르지 않고 수집을 멈췄다",
        )
    if "errors" in top:
        if _limit_errors(top) or _limit_headers(headers):
            return CollectionFailure(
                FailureCode.RATE_LIMITED,
                "GitHub GraphQL 호출 한도 오류를 받아 다시 부르지 않고 수집을 멈췄다",
            )
        return CollectionFailure(
            FailureCode.COLLECTION_FETCH_FAILED,
            "GitHub GraphQL 조회가 오류를 돌려줘 그 묶음 결과를 쓰지 않고 수집을 멈췄다",
        )
    return top


class GitHubGateway:
    def __init__(
        self,
        transport: Transport,
        *,
        token: AccessToken,
        expires_at: datetime,
        budget: CollectionBudget,
        clock: Callable[[], datetime],
        limits: CollectionLimits,
    ) -> None:
        if transport.host != GITHUB_API_HOST:
            raise ValueError("수집 연결은 api.github.com으로만 연다")
        self._transport = transport
        self._token: AccessToken | None = token
        self._expires_at = expires_at
        self._budget = budget
        self._clock = clock
        self._limits = limits
        self._graphql_calls = 0
        self._graphql_cost = 0
        self._graphql_unobserved = 0
        # 마지막 GraphQL 호출이 알려 준 점수. 알 수 없었으면 None.
        self._quota: normalize.RateLimitObservation | None = None

    def get(
        self, path: ApiPath, *, allow_empty_repository: bool = False
    ) -> Fetched | Oversized:
        """allow_empty_repository면 빈 Git 저장소 응답을 실패가 아닌 빈 목록으로 돌려준다."""
        response = self._send(path, {**_FIXED_HEADERS})
        if allow_empty_repository and is_empty_repository(response):
            return Fetched([], has_next_page=False)
        failure = failure_for(response)
        if failure is not None:
            raise CollectionStopped(failure)
        if response.body is None:
            return OVERSIZED
        try:
            data = json.loads(response.body)
        except (ValueError, RecursionError):
            raise stop(
                FailureCode.COLLECTION_FETCH_FAILED,
                "GitHub 응답을 해석하지 못해 수집을 멈췄다",
            ) from None
        return Fetched(data, has_next_page(response.headers.get("link")))

    def get_diff(self, path: ApiPath) -> bytes | Oversized:
        """같은 경로를 diff 형식으로 받은 본문(바이트). 크기 상한을 넘으면 OVERSIZED.

        호출 수·시간·크기 상한과 응답 상태 해석은 get과 같다. 200이 아니면 다시 부르지 않고
        멈춘다. 본문은 여기서 해석하지 않는다.
        """
        response = self._send(path, {**_FIXED_HEADERS, "Accept": DIFF_MEDIA_TYPE})
        failure = failure_for(response)
        if failure is not None:
            raise CollectionStopped(failure)
        if response.body is None:
            return OVERSIZED
        return response.body

    def post_graphql(self, request: GraphQLRequest) -> GraphQLFetched | Oversized:
        """묶음 조회 POST 하나. 크기 상한을 넘으면 OVERSIZED(그 묶음의 한계)다.

        실패 응답은 다시 부르지 않고 멈춘다(`graphql_outcome`). 앞선 정상 응답이 점수를 다
        썼다고 알렸고 그 점수가 아직 다시 차지 않았으면, 보내지 않고 한도 실패로 멈춘다(호출로
        세지 않는다). 점수는 같은 응답의 `rateLimit`만 쓰고 확인용 호출을 따로 하지 않는다.
        """
        quota = self._quota
        if (
            quota is not None
            and quota.remaining == 0
            and self._clock() < quota.reset_at
        ):
            raise stop(
                FailureCode.RATE_LIMITED,
                "GitHub GraphQL 호출 한도를 다 써 남은 묶음 조회를 보내지 않고 수집을 멈췄다",
            )
        body = json.dumps(
            {"query": request.query, "variables": dict(request.variables)},
            separators=(",", ":"),
        ).encode("ascii")
        if len(body) > _MAX_GRAPHQL_BODY:
            raise ValueError("묶음 조회 본문이 크기 상한을 넘었다")
        sent = self._graphql_calls
        try:
            response = self._send(GRAPHQL_PATH, {**_GRAPHQL_HEADERS}, body=body)
        except CollectionStopped:
            if self._graphql_calls > sent:
                # 보낸 뒤 실패했다(시간 초과·연결 오류 등). 소비한 점수는 알 수 없다.
                self._observe_cost(None)
            raise
        outcome = graphql_outcome(response)
        if not isinstance(outcome, Mapping):
            self._observe_cost(None)
            if isinstance(outcome, CollectionFailure):
                raise CollectionStopped(outcome)
            return outcome
        data = outcome.get("data")
        self._observe_cost(normalize.graphql_rate_limit(data))
        return GraphQLFetched(data)

    def _observe_cost(self, quota: normalize.RateLimitObservation | None) -> None:
        self._quota = quota
        if quota is None:
            self._graphql_unobserved += 1
        else:
            self._graphql_cost += quota.cost

    @property
    def graphql_usage(self) -> GraphQLUsage:
        return GraphQLUsage(
            self._graphql_calls, self._graphql_cost, self._graphql_unobserved
        )

    def _send(
        self, path: ApiPath, headers: dict[str, str], *, body: bytes | None = None
    ) -> HttpResponse:
        """호출 하나. 자격정보 만료·호출 수·시간을 확인하고 받은 크기를 총량에 더한다.

        body가 있으면 POST(GraphQL), 없으면 GET이다. 둘 다 호출 1회다.
        """
        if self._token is None:
            raise RuntimeError("닫힌 수집 연결")
        if self._clock() >= self._expires_at:
            raise stop(
                FailureCode.CREDENTIAL_EXPIRED,
                "수집 중 자격정보가 만료돼 갱신하지 않고 수집을 멈췄다",
            )
        remaining = self._budget.start_call()
        headers["Authorization"] = f"Bearer {self._token.reveal()}"
        connect_timeout = min(self._limits.connect_timeout, remaining)
        read_timeout = min(self._limits.read_timeout, remaining)
        max_bytes = self._limits.max_response_bytes
        try:
            if body is None:
                response = self._transport.get(
                    path,
                    headers=headers,
                    connect_timeout=connect_timeout,
                    read_timeout=read_timeout,
                    max_bytes=max_bytes,
                )
            else:
                self._graphql_calls += 1
                response = self._transport.post(
                    path,
                    body=body,
                    headers=headers,
                    connect_timeout=connect_timeout,
                    read_timeout=read_timeout,
                    max_bytes=max_bytes,
                )
        except TransportTimeout:
            # 대기 시간을 남은 수집 시간으로 줄였다면 수집 시간 상한에 걸린 것이다.
            if self._budget.time_exhausted():
                raise stop(
                    FailureCode.TIME_LIMIT_EXCEEDED,
                    "수집 시간 상한에 걸려 수집을 멈췄다",
                ) from None
            raise stop(
                FailureCode.COLLECTION_FETCH_FAILED,
                "GitHub 응답 대기 시간을 넘어 다시 부르지 않고 수집을 멈췄다",
            ) from None
        except TransportError:
            raise stop(
                FailureCode.COLLECTION_FETCH_FAILED,
                "GitHub 연결 오류로 다시 부르지 않고 수집을 멈췄다",
            ) from None
        self._budget.add_received(response.received_bytes)
        self._budget.raise_if_past_deadline()
        return response

    def raise_if_time_exhausted(self) -> None:
        """수집 시간 마감에 이미 닿았으면 시간 상한 실패로 멈춘다. 호출로 세지 않는다.

        부르지 않고 건너뛰는 선택 조회가 이미 지난 마감을 자료 범위 한계로 숨기지 않게 한다.
        """
        if self._budget.time_exhausted():
            raise stop(
                FailureCode.TIME_LIMIT_EXCEEDED,
                "수집 시간 상한에 걸려 수집을 멈췄다",
            )

    def remaining_calls(self) -> int:
        """남은 호출 수. 선택적 조회를 상한 전에 멈출 때 본다(호출로 세지 않는다)."""
        return self._budget.remaining_calls()

    def remaining_seconds(self) -> float:
        return self._budget.remaining_seconds()

    def remaining_bytes(self) -> int:
        return self._budget.remaining_bytes()

    def close(self) -> None:
        """자격정보를 놓고 연결을 닫는다. 성공·실패·중단 모두 부른다."""
        self._token = None
        self._transport.close()
