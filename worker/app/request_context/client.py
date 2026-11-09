"""내부 API 조회 한 번과, 그 응답을 그대로 돌려주는 요청 하나 수명의 고정 resolver.

`lookup`은 찾음(`ContextFound`)·모름(`ContextUnknown`, 이유)·실패(`ContextLookupFailed`, 원인) 셋 중 하나를
돌려준다. 응답·토큰·참조를 기록하지 않는다.
"""

import http.client
import ssl
from dataclasses import dataclass
from types import TracebackType

from app.collection.credentials import CredentialContext, CredentialLookupError
from app.collection.selection import SelectedRange, SelectionLookupError
from app.collection.transport import HttpsTransport, TransportError, TransportTimeout
from app.processing.request_check import AcceptedContext
from app.request_context.decode import (
    DecodedContext,
    decode_context,
    decode_unavailable,
    valid_reference,
)
from app.request_context.reasons import UnresolvedReason
from app.request_context.settings import ContextApiSettings


@dataclass(frozen=True)
class ContextUnknown:
    """api가 404로 답했다(접수 기록이 없거나 지금 수집할 수 없음). 이유는 회원 실패 문구를 고르는 데만 쓴다."""

    reason: UnresolvedReason


@dataclass(frozen=True)
class ContextLookupFailed:
    """조회 자체가 실패했다. cause는 운영 로그용 고정 코드다(`CONTEXT_HTTP_<상태>` 등). 다시 묻지 않는다."""

    cause: str

    @property
    def reason(self) -> UnresolvedReason:
        return UnresolvedReason.REQUEST_CONTEXT_UNAVAILABLE


class ContextFound:
    """찾음. 접수 맥락과, 수집에 넘길 고정 resolver 한 쌍을 가진다.

    resolver는 조회로 받은 값을 그대로 돌려주므로 HTTP는 조회 한 번뿐이다. 반드시 with로 쓰고, 성공·거부·예외
    어느 쪽이든 끝나면 자격정보와 선택 범위를 놓는다. 닫힌 뒤에는 다시 돌려주지 않는다. Python 메모리를 안전하게
    덮어쓰는 기능을 보장하는 것은 아니다.
    """

    def __init__(self, decoded: DecodedContext) -> None:
        self.accepted: AcceptedContext = decoded.accepted
        # 소속 커밋 집합(CR2). 비밀값이 아니라 닫아도 지우지 않는다. 후보 판정과 생성 재료 찾기에 같은 값으로
        # 넘긴다(BR1.6).
        self.assigned_commits: frozenset[str] = decoded.assigned_commits
        self._attempt_id = decoded.accepted.attempt_id
        self._credential: CredentialContext | None = decoded.credential
        self._selection: SelectedRange | None = decoded.selection
        self._closed = False
        self.credentials = _FixedCredentials(self)
        self.selections = _FixedSelections(self)

    def __enter__(self) -> "ContextFound":
        if self._closed:
            raise ValueError("이미 닫힌 요청 정보다")
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()

    def close(self) -> None:
        self._credential = None
        self._selection = None
        self._closed = True

    def _held(self, reference: str) -> bool:
        """같은 시도 ID의 참조만 받은 값을 가리킨다. 다른 참조는 모름(None)이다."""
        return reference == self._attempt_id


class _FixedCredentials:
    def __init__(self, state: ContextFound) -> None:
        self._state = state

    def resolve(self, reference: str) -> CredentialContext | None:
        if self._state._closed:
            raise CredentialLookupError("CONTEXT_CLOSED")
        return self._state._credential if self._state._held(reference) else None


class _FixedSelections:
    def __init__(self, state: ContextFound) -> None:
        self._state = state

    def resolve(self, reference: str) -> SelectedRange | None:
        if self._state._closed:
            raise SelectionLookupError("CONTEXT_CLOSED")
        return self._state._selection if self._state._held(reference) else None


LookupResult = ContextFound | ContextUnknown | ContextLookupFailed


class RequestContextClient:
    """기동 설정만 보관한다. 요청 맥락과 GitHub 토큰의 장기 캐시는 없다."""

    def __init__(self, settings: ContextApiSettings) -> None:
        self._settings = settings

    def lookup(self, attempt_id: str) -> LookupResult:
        """시도 ID로 한 번 묻는다. redirect·재시도·자격정보 갱신은 하지 않는다."""
        if not valid_reference(attempt_id):
            # 경로에 넣기 전에 형식을 본다. 조회 전 자체 검사를 거친 요청이면 생기지 않는다.
            return ContextLookupFailed("CONTEXT_REFERENCE_INVALID")
        settings = self._settings

        def connect(host: str, timeout: float) -> http.client.HTTPConnection:
            if settings.scheme == "http":
                return http.client.HTTPConnection(host, timeout=timeout)
            return http.client.HTTPSConnection(
                host, timeout=timeout, context=ssl.create_default_context()
            )

        # 기존 전송 계층의 연결/응답 마감, 크기 상한, redirect 미추적을 함께 쓴다.
        transport = HttpsTransport(settings.authority, connection_factory=connect)
        try:
            response = transport.get(
                f"/v1/internal/analysis-attempts/{attempt_id}/context",
                headers={
                    "X-Worker-Key": settings.api_key.reveal(),
                    "Accept": "application/json",
                },
                connect_timeout=settings.connect_timeout,
                read_timeout=settings.read_timeout,
                max_bytes=settings.max_response_bytes,
            )
            if response.status not in {200, 404}:
                # 응답 메시지·Location 등은 읽거나 예외에 옮기지 않는다.
                return ContextLookupFailed(f"CONTEXT_HTTP_{response.status}")
            if response.body is None:
                return ContextLookupFailed("CONTEXT_RESPONSE_TOO_LARGE")
            if (
                response.headers.get("content-type", "")
                .split(";", 1)[0]
                .strip()
                .lower()
                != "application/json"
            ):
                return ContextLookupFailed("CONTEXT_RESPONSE_INVALID")
            if (
                response.headers.get("content-encoding", "identity").lower()
                != "identity"
            ):
                return ContextLookupFailed("CONTEXT_RESPONSE_INVALID")
            if response.status == 404:
                return ContextUnknown(decode_unavailable(response.body))
            return ContextFound(decode_context(response.body, attempt_id=attempt_id))
        except TransportTimeout:
            return ContextLookupFailed("CONTEXT_TIMEOUT")
        except (TransportError, OSError, http.client.HTTPException):
            return ContextLookupFailed("CONTEXT_TRANSPORT_FAILED")
        except (ValueError, TypeError, RecursionError):
            # JSON decode 예외에는 원문이 포함된다. 예외 객체·체인을 보존하지 않는다.
            return ContextLookupFailed("CONTEXT_RESPONSE_INVALID")
        finally:
            transport.close()
