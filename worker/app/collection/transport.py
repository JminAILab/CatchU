"""GitHub API로 나가는 HTTPS 연결.

연결은 만들 때 정한 호스트 하나에만 간다. 요청은 경로만 받으므로 다른 호스트·프로토콜로
보낼 방법이 없다. `http.client`는 우회 이동(redirect)을 따라가지 않으므로 3xx도 그대로
돌려준다. 응답 본문은 정한 크기까지만 읽는다. 호출마다 연결을 열고 닫아 호출 사이에 남는
연결이 없다. GET(REST)과 본문을 싣는 POST(GraphQL, #267)는 이 통제를 함께 쓴다.
"""

import http.client
import socket
import ssl
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol

GITHUB_API_HOST = "api.github.com"
_CHUNK = 64 * 1024


def _is_path(path: str) -> bool:
    """호스트를 바꿀 수 없는 경로·쿼리인가. `//host`·공백·제어 문자·조각(#)을 받지 않는다."""
    return (
        path.startswith("/")
        and not path.startswith("//")
        and all(0x20 < ord(c) < 0x7F for c in path)
        and "#" not in path
    )


@dataclass(frozen=True)
class HttpResponse:
    status: int
    # 헤더 이름은 소문자로 둔다.
    headers: Mapping[str, str]
    # 크기 상한을 넘으면 None이다. 넘은 본문은 끝까지 읽지 않는다.
    body: bytes | None
    # 실제로 받은 본문 바이트 수. 요청 전체 총량 상한에 더한다.
    received_bytes: int

    @property
    def oversized(self) -> bool:
        return self.body is None


class TransportTimeout(Exception):
    """연결·응답 대기 시간을 넘었다."""


class TransportError(Exception):
    """연결 오류. 메시지에 요청 헤더·주소를 넣지 않는다."""


class Transport(Protocol):
    @property
    def host(self) -> str: ...

    def get(
        self,
        path: str,
        *,
        headers: Mapping[str, str],
        connect_timeout: float,
        read_timeout: float,
        max_bytes: int,
    ) -> HttpResponse: ...

    def post(
        self,
        path: str,
        *,
        body: bytes,
        headers: Mapping[str, str],
        connect_timeout: float,
        read_timeout: float,
        max_bytes: int,
    ) -> HttpResponse: ...

    def close(self) -> None: ...


class _Connection(Protocol):
    sock: socket.socket | None

    def connect(self) -> None: ...

    def request(
        self, method: str, url: str, *, body: bytes | None, headers: Mapping[str, str]
    ) -> None: ...

    def getresponse(self) -> http.client.HTTPResponse: ...

    def close(self) -> None: ...


ConnectionFactory = Callable[[str, float], _Connection]


def _https_connection(host: str, timeout: float) -> _Connection:
    # 기본 SSL 문맥은 인증서와 호스트 이름을 검사한다.
    return http.client.HTTPSConnection(
        host, timeout=timeout, context=ssl.create_default_context()
    )


class HttpsTransport:
    """정한 호스트 하나로만 GET·POST를 보낸다. 실제 GitHub 연결은 아직 검증하지 않았다.

    소켓 대기는 받기 한 번마다 걸리므로, 조금씩 오래 보내는 응답을 막으려고 연결 뒤
    read_timeout이 지나면 감시 타이머가 소켓을 끊는다. 머리글·본문 모두 이 시간 안에 받아야 한다.
    """

    def __init__(
        self,
        host: str = GITHUB_API_HOST,
        *,
        connection_factory: ConnectionFactory = _https_connection,
    ) -> None:
        self._host = host
        self._connect = connection_factory

    @property
    def host(self) -> str:
        return self._host

    def get(
        self,
        path: str,
        *,
        headers: Mapping[str, str],
        connect_timeout: float,
        read_timeout: float,
        max_bytes: int,
    ) -> HttpResponse:
        return self._exchange(
            "GET", path, None, headers, connect_timeout, read_timeout, max_bytes
        )

    def post(
        self,
        path: str,
        *,
        body: bytes,
        headers: Mapping[str, str],
        connect_timeout: float,
        read_timeout: float,
        max_bytes: int,
    ) -> HttpResponse:
        """본문을 싣는 POST. 주소·우회 이동·크기·대기 통제는 GET과 같다."""
        return self._exchange(
            "POST", path, body, headers, connect_timeout, read_timeout, max_bytes
        )

    def _exchange(
        self,
        method: str,
        path: str,
        body: bytes | None,
        headers: Mapping[str, str],
        connect_timeout: float,
        read_timeout: float,
        max_bytes: int,
    ) -> HttpResponse:
        if not _is_path(path):
            raise ValueError("요청 경로는 '/'로 시작하는 경로·쿼리여야 한다")
        connection = self._connect(self._host, connect_timeout)
        expired = threading.Event()
        watchdog: threading.Timer | None = None
        # 오류는 except 밖에서 올려, 원래 예외(머리글 값이 담길 수 있음)를 잇지 않는다.
        error: Exception
        try:
            connection.connect()
            # 응답을 넘긴 뒤 연결 객체는 소켓 참조를 비울 수 있으므로 여기서 잡아 둔다.
            sock = connection.sock
            if sock is not None:
                sock.settimeout(read_timeout)
            watchdog = threading.Timer(read_timeout, _cut, (sock, expired))
            watchdog.daemon = True
            watchdog.start()
            connection.request(method, path, body=body, headers=headers)
            response = _read(connection.getresponse(), max_bytes)
            if not expired.is_set():
                return response
            error = TransportTimeout("응답 대기 시간 초과")
        except TimeoutError:
            error = TransportTimeout("응답 대기 시간 초과")
        except (OSError, http.client.HTTPException, ValueError) as caught:
            error = (
                TransportTimeout("응답 대기 시간 초과")
                if expired.is_set()
                else TransportError(type(caught).__name__)
            )
        finally:
            if watchdog is not None:
                watchdog.cancel()
            connection.close()
        raise error

    def close(self) -> None:
        # 호출마다 연결을 닫으므로 남은 연결이 없다.
        return None


def _cut(sock: socket.socket | None, expired: threading.Event) -> None:
    """호출 대기 시간이 지나면 소켓을 끊어 막혀 있는 받기를 끝낸다."""
    expired.set()
    if sock is not None:
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass


def _read(response: http.client.HTTPResponse, max_bytes: int) -> HttpResponse:
    headers = {name.lower(): value for name, value in response.getheaders()}
    declared = headers.get("content-length", "")
    if declared.isdigit() and int(declared) > max_bytes:
        return HttpResponse(response.status, headers, None, 0)
    body = bytearray()
    while len(body) <= max_bytes:
        # read1은 받기 한 번만 한다. 감시 타이머가 끊으면 빈 값이나 오류로 바로 돌아온다.
        chunk = response.read1(min(_CHUNK, max_bytes + 1 - len(body)))
        if not chunk:
            if response.length:
                # 알린 길이보다 일찍 끊겼다. 잘린 본문을 온전한 응답으로 넘기지 않는다.
                raise http.client.IncompleteRead(bytes(body), response.length)
            return HttpResponse(response.status, headers, bytes(body), len(body))
        body.extend(chunk)
    return HttpResponse(response.status, headers, None, len(body))
