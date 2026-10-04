"""HTTPS 전송: 우회 이동을 따르지 않고, 크기 상한까지만 읽고, 호출 대기 안에 끝내고, 연결을 닫는다.

가짜 연결과 이 컴퓨터 안(127.0.0.1)의 시험 서버로 확인한다. 실제 api.github.com 연결·TLS는
검증하지 않는다.
"""

import http.client
import http.server
import socket
import threading
import time
from collections.abc import Iterator, Mapping
from typing import Any

import pytest

from app.collection.transport import (
    GITHUB_API_HOST,
    HttpsTransport,
    TransportError,
    TransportTimeout,
)


class FakeResponse:
    def __init__(
        self, status: int, headers: dict[str, str], body: bytes, chunk: int = 1 << 20
    ) -> None:
        self.status = status
        self._headers = headers
        self._body = body
        self._chunk = chunk
        self.read_sizes: list[int] = []
        self.length: int | None = None

    def getheaders(self) -> list[tuple[str, str]]:
        return list(self._headers.items())

    def read1(self, size: int) -> bytes:
        self.read_sizes.append(size)
        size = min(size, self._chunk)
        chunk, self._body = self._body[:size], self._body[size:]
        return chunk


class FakeConnection:
    def __init__(self, response: FakeResponse | Exception) -> None:
        self.sock: socket.socket | None = None
        self._response = response
        self.requests: list[tuple[str, str, Mapping[str, str]]] = []
        self.closed = False

    def connect(self) -> None:
        return None

    def request(self, method: str, url: str, *, headers: Mapping[str, str]) -> None:
        self.requests.append((method, url, headers))

    def getresponse(self) -> Any:
        if isinstance(self._response, Exception):
            raise self._response
        return self._response

    def close(self) -> None:
        self.closed = True


def _transport(
    connection: FakeConnection,
) -> tuple[HttpsTransport, list[tuple[str, float]]]:
    opened: list[tuple[str, float]] = []

    def factory(host: str, timeout: float) -> FakeConnection:
        opened.append((host, timeout))
        return connection

    return HttpsTransport(connection_factory=factory), opened


def _get(
    transport: HttpsTransport,
    path: str = "/repos/o/r",
    *,
    max_bytes: int = 100,
    read_timeout: float = 15.0,
    token: str = "synthetic",
) -> Any:
    return transport.get(
        path,
        headers={"Authorization": f"Bearer {token}"},
        connect_timeout=5.0,
        read_timeout=read_timeout,
        max_bytes=max_bytes,
    )


def test_request_goes_to_the_fixed_host_and_connection_closes() -> None:
    connection = FakeConnection(FakeResponse(200, {"Content-Type": "x"}, b"[]"))
    transport, opened = _transport(connection)

    response = _get(transport)

    assert opened == [(GITHUB_API_HOST, 5.0)]
    assert connection.requests == [
        ("GET", "/repos/o/r", {"Authorization": "Bearer synthetic"})
    ]
    assert (response.status, response.body, response.received_bytes) == (200, b"[]", 2)
    assert response.headers == {"content-type": "x"}
    assert connection.closed


@pytest.mark.parametrize(
    "path", ["https://evil.invalid/x", "//evil.invalid/x", "repos/o/r", "/x\r\nHost: e"]
)
def test_only_a_path_is_accepted(path: str) -> None:
    connection = FakeConnection(FakeResponse(200, {}, b"[]"))
    transport, opened = _transport(connection)

    with pytest.raises(ValueError):
        _get(transport, path)

    assert opened == []


def test_declared_oversized_body_is_not_read() -> None:
    response = FakeResponse(200, {"Content-Length": "101"}, b"x" * 101)
    connection = FakeConnection(response)
    transport, _ = _transport(connection)

    result = _get(transport)

    assert result.oversized and result.body is None
    assert result.received_bytes == 0
    assert response.read_sizes == []
    assert connection.closed


def test_streamed_body_is_cut_just_past_the_limit() -> None:
    connection = FakeConnection(FakeResponse(200, {}, b"x" * 1000, chunk=30))
    transport, _ = _transport(connection)

    result = _get(transport)

    assert result.oversized
    assert result.received_bytes == 101
    assert connection.closed


def test_body_at_the_limit_is_kept() -> None:
    connection = FakeConnection(FakeResponse(200, {}, b"x" * 100, chunk=30))
    transport, _ = _transport(connection)

    assert _get(transport).body == b"x" * 100


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (TimeoutError("synthetic"), TransportTimeout),
        (ConnectionResetError("secret-in-error"), TransportError),
        (http.client.RemoteDisconnected("secret-in-error"), TransportError),
        (ValueError("Invalid header value b'Bearer secret-in-error'"), TransportError),
    ],
)
def test_network_errors_are_mapped_without_their_message(
    error: Exception, expected: type[Exception]
) -> None:
    connection = FakeConnection(error)
    transport, _ = _transport(connection)

    with pytest.raises(expected) as raised:
        _get(transport)

    assert "secret" not in str(raised.value)
    # 원래 예외를 잇지 않아 트레이스백에도 그 메시지가 실리지 않는다.
    assert raised.value.__cause__ is None
    assert raised.value.__context__ is None
    assert connection.closed


# 이 컴퓨터 안의 시험 서버로 http.client의 실제 동작을 확인한다(TLS 제외).


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/moved":
            self.send_response(302)
            self.send_header("Location", "/secret-target")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path == "/secret-target":
            self.server.followed = True  # type: ignore[attr-defined]
        if self.path == "/cut-short":
            self.send_response(200)
            self.send_header("Content-Length", "1000")
            self.end_headers()
            self.wfile.write(b"[1,2,3")
            self.close_connection = True
            return
        if self.path == "/slow-body":
            self.send_response(200)
            self.send_header("Content-Length", "1000")
            self.end_headers()
            self._drip(b"z" * 1000)
            return
        if self.path == "/slow-headers":
            self.wfile.write(b"HTTP/1.1 200 OK\r\n")
            self._drip(b"X-Slow: " + b"a" * 1000 + b"\r\n")
            return
        body = b"y" * 500
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _drip(self, data: bytes) -> None:
        # 소켓 대기보다 짧은 간격으로 한 바이트씩 보낸다.
        try:
            for byte in data:
                self.wfile.write(bytes([byte]))
                self.wfile.flush()
                time.sleep(0.02)
        except OSError:
            return

    def log_message(self, format: str, *args: Any) -> None:
        return None


@pytest.fixture
def local_server() -> Iterator[http.server.ThreadingHTTPServer]:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.daemon_threads = True
    server.followed = False  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()


def _local(server: http.server.ThreadingHTTPServer) -> HttpsTransport:
    port = server.server_address[1]

    def factory(host: str, timeout: float) -> http.client.HTTPConnection:
        return http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)

    return HttpsTransport(connection_factory=factory)


def test_real_http_client_returns_redirect_without_following(
    local_server: http.server.ThreadingHTTPServer,
) -> None:
    response = _get(_local(local_server), "/moved")

    assert response.status == 302
    assert response.headers["location"] == "/secret-target"
    assert local_server.followed is False  # type: ignore[attr-defined]


def test_real_http_client_stops_at_declared_size(
    local_server: http.server.ThreadingHTTPServer,
) -> None:
    response = _get(_local(local_server), "/data", max_bytes=100)

    assert response.oversized
    assert response.received_bytes == 0


def test_body_shorter_than_its_declared_length_is_an_error(
    local_server: http.server.ThreadingHTTPServer,
) -> None:
    with pytest.raises(TransportError):
        _get(_local(local_server), "/cut-short", max_bytes=10_000)


@pytest.mark.parametrize("path", ["/slow-body", "/slow-headers"])
def test_dripping_response_is_cut_at_the_call_wait(
    local_server: http.server.ThreadingHTTPServer, path: str
) -> None:
    started = time.monotonic()

    with pytest.raises(TransportTimeout):
        _get(_local(local_server), path, max_bytes=10_000, read_timeout=0.5)

    # 한 바이트씩 20초 넘게 보내는 응답을 호출 대기(0.5초) 근처에서 끊는다.
    assert time.monotonic() - started < 3


def test_token_unfit_for_a_header_does_not_leak_through_errors(
    local_server: http.server.ThreadingHTTPServer,
) -> None:
    with pytest.raises(TransportError) as raised:
        _get(_local(local_server), token="secret-token\n")

    assert "secret-token" not in str(raised.value)
    assert raised.value.__cause__ is None
    assert raised.value.__context__ is None
