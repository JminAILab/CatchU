"""GitHub API 호출이 지나는 유일한 곳.

호출마다 자격정보 만료·호출 수·수집 시간을 확인하고, 받은 크기를 총량에 더한 뒤 응답
상태를 해석한다. 429·5xx·시간 초과·연결 오류·우회 이동은 다시 부르지 않고 수집을 멈춘다.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from app.collection.api_paths import ApiPath
from app.collection.budget import CollectionBudget
from app.collection.credentials import AccessToken
from app.collection.failures import (
    CollectionFailure,
    CollectionStopped,
    FailureCode,
    stop,
)
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


@dataclass(frozen=True)
class Fetched:
    data: object
    # Link 헤더에 다음 쪽이 있다는 표시만 본다. 그 주소는 쓰지 않는다.
    has_next_page: bool


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

    def get(
        self, path: ApiPath, *, allow_empty_repository: bool = False
    ) -> Fetched | Oversized:
        """allow_empty_repository면 빈 Git 저장소 응답을 실패가 아닌 빈 목록으로 돌려준다."""
        if self._token is None:
            raise RuntimeError("닫힌 수집 연결")
        if self._clock() >= self._expires_at:
            raise stop(
                FailureCode.CREDENTIAL_EXPIRED,
                "수집 중 자격정보가 만료돼 갱신하지 않고 수집을 멈췄다",
            )
        remaining = self._budget.start_call()
        try:
            response = self._transport.get(
                path,
                headers={
                    **_FIXED_HEADERS,
                    "Authorization": f"Bearer {self._token.reveal()}",
                },
                connect_timeout=min(self._limits.connect_timeout, remaining),
                read_timeout=min(self._limits.read_timeout, remaining),
                max_bytes=self._limits.max_response_bytes,
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

    def close(self) -> None:
        """자격정보를 놓고 연결을 닫는다. 성공·실패·중단 모두 부른다."""
        self._token = None
        self._transport.close()
