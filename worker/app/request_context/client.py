"""내부 API 호출과 요청 하나에 묶인 resolver pair. 응답·참조를 기록하지 않는다."""

import http.client
import ssl
import threading
from types import TracebackType

from app.collection.credentials import CredentialContext, CredentialLookupError
from app.collection.selection import SelectedRange, SelectionLookupError
from app.collection.transport import HttpsTransport, TransportError, TransportTimeout
from app.processing.request_check import CheckedRequest
from app.request_context.decode import (
    decode_context,
    decode_unavailable,
    valid_reference,
)
from app.request_context.settings import ContextApiSettings

Context = tuple[CredentialContext, SelectedRange]


class RequestContextClient:
    """기동 설정만 보관한다. 요청 맥락과 GitHub 토큰의 장기 캐시는 없다."""

    def __init__(self, settings: ContextApiSettings) -> None:
        self._settings = settings

    def for_request(self, request: CheckedRequest) -> "RequestResolvers":
        return RequestResolvers(self, request)

    def _lookup(
        self, request_id: str, attempt_id: str
    ) -> tuple[Context | None, str | None]:
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
                return None, f"CONTEXT_HTTP_{response.status}"
            if response.body is None:
                return None, "CONTEXT_RESPONSE_TOO_LARGE"
            if (
                response.headers.get("content-type", "")
                .split(";", 1)[0]
                .strip()
                .lower()
                != "application/json"
            ):
                return None, "CONTEXT_RESPONSE_INVALID"
            if (
                response.headers.get("content-encoding", "identity").lower()
                != "identity"
            ):
                return None, "CONTEXT_RESPONSE_INVALID"
            if response.status == 404:
                decode_unavailable(response.body)
                return None, None
            return decode_context(
                response.body, request_id=request_id, attempt_id=attempt_id
            ), None
        except TransportTimeout:
            return None, "CONTEXT_TIMEOUT"
        except (TransportError, OSError, http.client.HTTPException):
            return None, "CONTEXT_TRANSPORT_FAILED"
        except (ValueError, TypeError, RecursionError):
            # JSON decode 예외에는 원문이 포함된다. 예외 객체·체인을 보존하지 않는다.
            return None, "CONTEXT_RESPONSE_INVALID"
        finally:
            transport.close()


class RequestResolvers:
    """반드시 요청마다 만들고 with로 수집 끝에 닫는다. 닫힌 pair는 재사용하지 않는다."""

    def __init__(self, client: RequestContextClient, request: CheckedRequest) -> None:
        self._client = client
        self._request_id: str | None = request.request_id
        self._attempt_id: str | None = request.attempt_id
        self._invalid = not (
            valid_reference(request.attempt_id)
            and valid_reference(request.request_id)
            and request.credential_context_reference == request.attempt_id
            and request.selection_reference == request.attempt_id
        )
        self._attempted = False
        self._closed = False
        self._context: Context | None = None
        self._error: str | None = None
        self._lock = threading.Lock()
        self.credentials = _Credentials(self)
        self.selections = _Selections(self)

    def __enter__(self) -> "RequestResolvers":
        if self._closed:
            raise ValueError("이미 닫힌 내부 맥락 조회다")
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()

    def close(self) -> None:
        with self._lock:
            self._context = None
            self._request_id = None
            self._attempt_id = None
            self._closed = True

    def _resolve(self, reference: str) -> tuple[Context | None, str | None]:
        with self._lock:
            if self._closed:
                return None, "CONTEXT_CLOSED"
            if self._invalid or reference != self._attempt_id:
                return None, "CONTEXT_REFERENCE_INVALID"
            if not self._attempted:
                # 실패·404도 시도했다는 상태를 남긴다. 다음 resolver는 다시 호출하지 않는다.
                self._attempted = True
                assert self._request_id is not None and self._attempt_id is not None
                self._context, self._error = self._client._lookup(
                    self._request_id, self._attempt_id
                )
            return self._context, self._error


class _Credentials:
    def __init__(self, state: RequestResolvers) -> None:
        self._state = state

    def resolve(self, reference: str) -> CredentialContext | None:
        context, error = self._state._resolve(reference)
        if error is not None:
            raise CredentialLookupError(error)
        return None if context is None else context[0]


class _Selections:
    def __init__(self, state: RequestResolvers) -> None:
        self._state = state

    def resolve(self, reference: str) -> SelectedRange | None:
        context, error = self._state._resolve(reference)
        if error is not None:
            raise SelectionLookupError(error)
        return None if context is None else context[1]
