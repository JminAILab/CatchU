"""PDF 글 추출(extract)·원본 읽기(reader)·설정(settings) 단위 시험. 합성 PDF 바이트만 쓴다(계획 7.3)."""

import base64
import io
import json
import logging
import socket
import threading
import time
import zlib
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from pdf_synthetic import (
    aes256_pdf_bytes,
    new_id,
    pdf_bytes,
    pdf_request,
    place,
    text_pages,
)
from pypdf import PageObject, PdfReader
from pypdf.errors import DependencyError, PdfReadError

from app.consumer.settings import SettingsError
from app.pdf_extraction.envelope import storage_key
from app.pdf_extraction.extract import extract_pages, normalize_page_text
from app.pdf_extraction.reader import (
    S3_READ_THREAD_NAME,
    FileUnreadable,
    S3Client,
    SourceUnavailable,
    default_s3_client,
    read_pdf,
    s3_client_config,
)
from app.pdf_extraction.settings import (
    DEFAULT_CHILD_TIMEOUT,
    S3_CONNECT_TIMEOUT,
    S3_MAX_ATTEMPTS,
    S3_READ_TIMEOUT,
    S3_REQUEST_GIVE_UP_SECONDS,
    S3_TOTAL_BUDGET_RATIO,
    LocalSource,
    S3Source,
    pdf_settings_from_environment,
    s3_total_budget,
)

MB = 1024 * 1024

# extract -----------------------------------------------------------------------------------


def test_multi_page_text_is_extracted_in_order() -> None:
    result = extract_pages(pdf_bytes(["Hello page one", "Second (page) two"]))

    assert result["outcome"] == "SUCCEEDED"
    pages = result["pages"]
    assert [page["pageNumber"] for page in pages] == [1, 2]
    assert all(page["readable"] for page in pages)
    assert "Hello page one" in pages[0]["text"]
    assert "Second (page) two" in pages[1]["text"]


def test_blank_page_is_unreadable_with_empty_text() -> None:
    result = extract_pages(pdf_bytes(["Text page", None]))

    assert result["outcome"] == "SUCCEEDED"
    assert result["pages"][1] == {"pageNumber": 2, "readable": False, "text": ""}


def test_encrypted_pdf_fails_as_encrypted() -> None:
    data = pdf_bytes(["Secret"], password="pw")

    assert extract_pages(data) == {"outcome": "FAILED", "failureCode": "ENCRYPTED"}


def test_aes256_pdf_fails_as_encrypted_not_unreadable(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """#521 리뷰: AES-256으로 잠긴 PDF는 여는 단계에서 pypdf가 DependencyError를 낸다. 잠긴 파일로 안내한다."""
    data = aes256_pdf_bytes()
    # 전제: 이 PDF는 pypdf가 여는 단계에서 DependencyError를 낸다(암호 라이브러리가 없는 worker와 같은 조건).
    with pytest.raises(DependencyError):
        PdfReader(io.BytesIO(data), strict=False)

    with caplog.at_level(logging.INFO, logger="app.pdf_extraction.extract"):
        result = extract_pages(data)

    assert result == {"outcome": "FAILED", "failureCode": "ENCRYPTED"}
    assert "pages" not in result
    assert "PDF 파싱 실패" not in caplog.text


def test_open_stage_errors_other_than_dependency_stay_unreadable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """여는 단계의 다른 예외(손상 등)는 ENCRYPTED로 바뀌지 않는다. DependencyError만 잠긴 파일로 본다."""

    def broken(*_args: object, **_kwargs: object) -> None:
        raise PdfReadError("synthetic damage")

    monkeypatch.setattr("app.pdf_extraction.extract.PdfReader", broken)
    assert extract_pages(pdf_bytes(["Text"])) == {
        "outcome": "FAILED",
        "failureCode": "UNREADABLE_FILE",
    }

    def needs_library(*_args: object, **_kwargs: object) -> None:
        raise DependencyError("cryptography>=3.1 is required for AES algorithm")

    monkeypatch.setattr("app.pdf_extraction.extract.PdfReader", needs_library)
    assert extract_pages(pdf_bytes(["Text"])) == {
        "outcome": "FAILED",
        "failureCode": "ENCRYPTED",
    }


@pytest.mark.parametrize(
    "data",
    [b"not a pdf at all", b"%PDF-1.7\n\x00\x01garbage", b""],
    ids=["text", "broken-header", "empty"],
)
def test_garbage_bytes_fail_as_unreadable(data: bytes) -> None:
    assert extract_pages(data) == {
        "outcome": "FAILED",
        "failureCode": "UNREADABLE_FILE",
    }


def test_zero_page_pdf_fails_as_unreadable() -> None:
    assert extract_pages(pdf_bytes([])) == {
        "outcome": "FAILED",
        "failureCode": "UNREADABLE_FILE",
    }


def test_page_limit_is_fifty() -> None:
    fifty = extract_pages(pdf_bytes(text_pages(50)))
    assert fifty["outcome"] == "SUCCEEDED" and len(fifty["pages"]) == 50

    assert extract_pages(pdf_bytes(text_pages(51))) == {
        "outcome": "FAILED",
        "failureCode": "PAGE_LIMIT_EXCEEDED",
    }


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("a\x00b", ("ab", True)),
        ("\x00\x00", ("", False)),
        (" \n\t\r ", ("", False)),
        ("\x01\x07\x1f\x7f \n", ("", False)),
        ("", ("", False)),
        ("  keep  spacing \n", ("  keep  spacing \n", True)),
    ],
    ids=["nul-removed", "nul-only", "whitespace-only", "control-only", "empty", "kept"],
)
def test_normalize_page_text(raw: str, expected: tuple[str, bool]) -> None:
    assert normalize_page_text(raw) == expected


def test_nul_is_removed_from_extracted_page(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(PageObject, "extract_text", lambda self, *a, **k: "x\x00y")

    result = extract_pages(pdf_bytes(["ignored"]))

    assert result["pages"] == [{"pageNumber": 1, "readable": True, "text": "xy"}]


def _fail_on_call(
    monkeypatch: pytest.MonkeyPatch, failing_call: int, error: BaseException
) -> None:
    original = PageObject.extract_text
    calls = {"count": 0}

    def flaky(self: PageObject, *args: Any, **kwargs: Any) -> str:
        calls["count"] += 1
        if calls["count"] == failing_call:
            raise error
        return original(self, *args, **kwargs)

    monkeypatch.setattr(PageObject, "extract_text", flaky)


@pytest.mark.parametrize("failing_call", [1, 2, 3], ids=["first", "middle", "last"])
def test_page_extract_error_fails_whole_file(
    monkeypatch: pytest.MonkeyPatch, failing_call: int
) -> None:
    # D25(담당자 결정 2026-11-10): 정상 쪽 + 추출 예외 쪽 → 파일 전체 FAILED(UNREADABLE_FILE), pages 없음.
    _fail_on_call(monkeypatch, failing_call, ValueError("broken content stream"))

    result = extract_pages(pdf_bytes(["Page A", "Page B", "Page C"]))

    assert result == {"outcome": "FAILED", "failureCode": "UNREADABLE_FILE"}


def test_text_and_blank_pages_still_succeed() -> None:
    # D25와 구분: 정상 쪽 + 빈 쪽(예외 없음) → SUCCEEDED, 빈 쪽만 readable=false·''.
    result = extract_pages(pdf_bytes(["Page A", None, "Page C"]))

    assert result["outcome"] == "SUCCEEDED"
    assert [page["readable"] for page in result["pages"]] == [True, False, True]
    assert result["pages"][1]["text"] == ""


def test_page_memory_error_is_not_swallowed(monkeypatch: pytest.MonkeyPatch) -> None:
    # 메모리 부족은 자식(child.py)의 기존 분류를 따르도록 그대로 올라간다.
    _fail_on_call(monkeypatch, 2, MemoryError())

    with pytest.raises(MemoryError):
        extract_pages(pdf_bytes(["Page A", "Page B"]))


# reader: 로컬 ------------------------------------------------------------------------------


def test_local_read_returns_bytes(tmp_path: Path) -> None:
    message = pdf_request()
    data = pdf_bytes(["Local"])
    place(tmp_path, message, data)

    assert read_pdf(LocalSource(str(tmp_path)), message["storageKey"], 20 * MB) == data


def test_local_missing_file_is_unreadable(tmp_path: Path) -> None:
    with pytest.raises(FileUnreadable) as caught:
        read_pdf(LocalSource(str(tmp_path)), pdf_request()["storageKey"], 20 * MB)
    assert caught.value.reason == "missing"


def test_local_file_over_limit_is_too_large(tmp_path: Path) -> None:
    message = pdf_request()
    place(tmp_path, message, b"0" * (20 * MB + 1))

    with pytest.raises(FileUnreadable) as caught:
        read_pdf(LocalSource(str(tmp_path)), message["storageKey"], 20 * MB)
    assert caught.value.reason == "too-large"


@pytest.mark.parametrize(
    "key",
    [
        "../members/x.pdf",
        f"members/{new_id()}/materials/{new_id()}.PDF",
        f"members/{new_id().upper()}/materials/{new_id()}.pdf",
        f"/members/{new_id()}/materials/{new_id()}.pdf",
        f"members/{new_id()}/materials/..\\{new_id()}.pdf",
        f"members/{new_id()}/other/{new_id()}.pdf",
    ],
    ids=["dotdot", "upper-ext", "upper-uuid", "absolute", "backslash", "other-dir"],
)
def test_key_shape_is_checked_before_reading(tmp_path: Path, key: str) -> None:
    with pytest.raises(FileUnreadable) as caught:
        read_pdf(LocalSource(str(tmp_path)), key, 20 * MB)
    assert caught.value.reason == "invalid-key"


def test_local_symlink_outside_root_is_refused(tmp_path: Path) -> None:
    root = tmp_path / "root"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    message = pdf_request()
    secret = outside / "secret.pdf"
    secret.write_bytes(pdf_bytes(["Outside"]))
    link = root.joinpath(*message["storageKey"].split("/"))
    link.parent.mkdir(parents=True)
    try:
        link.symlink_to(secret)
    except OSError:
        pytest.skip("이 환경에서 심볼릭 링크를 만들 수 없음(Windows 권한)")

    with pytest.raises(FileUnreadable) as caught:
        read_pdf(LocalSource(str(root)), message["storageKey"], 20 * MB)
    assert caught.value.reason == "outside-root"


# reader: S3(가짜 클라이언트) ---------------------------------------------------------------


class FakeS3:
    def __init__(self, *, body: bytes = b"", error: Exception | None = None) -> None:
        self.body = body
        self.error = error
        self.calls: list[tuple[str, str]] = []

    def get_object(self, *, Bucket: str, Key: str) -> Mapping[str, Any]:
        self.calls.append((Bucket, Key))
        if self.error is not None:
            raise self.error
        return {"Body": io.BytesIO(self.body)}


def _client_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "x"}}, "GetObject")


def _read_s3(fake: FakeS3, key: str | None = None) -> bytes:
    def factory() -> S3Client:
        return fake

    key = key or storage_key(new_id(), new_id())
    return read_pdf(S3Source("catchu-test"), key, 20 * MB, s3_client_factory=factory)


def test_s3_read_returns_body_and_uses_get_object_only() -> None:
    data = pdf_bytes(["S3"])
    fake = FakeS3(body=data)
    key = storage_key(new_id(), new_id())

    assert _read_s3(fake, key) == data
    assert fake.calls == [("catchu-test", key)]


def test_s3_no_such_key_is_unreadable() -> None:
    with pytest.raises(FileUnreadable) as caught:
        _read_s3(FakeS3(error=_client_error("NoSuchKey")))
    assert caught.value.reason == "missing"


@pytest.mark.parametrize(
    ("error", "error_type"),
    [
        (_client_error("AccessDenied"), "ClientError:AccessDenied"),
        (EndpointConnectionError(endpoint_url="https://s3"), "EndpointConnectionError"),
    ],
    ids=["access-denied", "network"],
)
def test_s3_storage_failure_is_source_unavailable(
    error: Exception, error_type: str
) -> None:
    with pytest.raises(SourceUnavailable) as caught:
        _read_s3(FakeS3(error=error))
    assert caught.value.error_type == error_type


# reader: S3 시간 제한(#521 리뷰 3) -----------------------------------------------------------
# 먼저 정한 기대: S3가 막혀도 자식 시간 제한(120초)보다 먼저 포기하고, 그 포기는 파일 실패가 아니라 저장소 장애
# (SourceUnavailable → 자식 defect → 결과 없이 작업 실패 → 10분 시한 대기)로 분류된다.
# 실패 조건: boto3 기본값(60초·5회)이 남음, 시간 초과가 FileUnreadable로 분류됨, 재시도가 정한 횟수를 넘음.
# 보완(2026-11-11): 연결·읽기 시간 제한과 시도 횟수는 요청 단계만 묶는다. 본문이 읽기 시간 제한보다 짧은 간격으로
# 조금씩 계속 오면 그 셋으로는 끝나지 않으므로, 읽기 전체에 시간 예산을 두고 넘으면 저장소 장애로 끝낸다.


def test_default_s3_client_gives_up_before_child_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-northeast-2")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "synthetic")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "synthetic")

    config = default_s3_client().meta.config  # type: ignore[attr-defined]

    assert config.connect_timeout == S3_CONNECT_TIMEOUT == 5
    assert config.read_timeout == S3_READ_TIMEOUT == 15
    assert config.retries == {"mode": "standard", "total_max_attempts": S3_MAX_ATTEMPTS}
    assert S3_MAX_ATTEMPTS == 2
    # 응답이 아예 오지 않을 때 요청을 포기하기까지의 상한이다(시도마다 연결·읽기 상한을 다 쓰고 재시도 대기까지).
    # 본문 내려받기 전체의 상한이 아니다. 그것은 아래 전체 시간 예산이 묶는다.
    assert S3_REQUEST_GIVE_UP_SECONDS == 41
    # 전체 시간 예산은 자식 제한의 60%라 설정으로 자식 제한을 바꿔도 언제나 그보다 먼저 끝난다.
    assert s3_total_budget(DEFAULT_CHILD_TIMEOUT) == 72
    assert S3_REQUEST_GIVE_UP_SECONDS < s3_total_budget(DEFAULT_CHILD_TIMEOUT)
    for child_timeout in (1, 30, 120, 600):
        assert s3_total_budget(child_timeout) < child_timeout
    assert 0 < S3_TOTAL_BUDGET_RATIO < 1


class _SilentServer:
    """연결은 받지만 한 바이트도 답하지 않는 로컬 서버(S3가 응답하지 않는 상황의 대역)."""

    def __init__(self) -> None:
        self._listener = socket.socket()
        self._listener.bind(("127.0.0.1", 0))
        self._listener.listen(8)
        self._listener.settimeout(0.2)
        self.port = self._listener.getsockname()[1]
        self.accepted = 0
        self._held: list[socket.socket] = []
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def _serve(self) -> None:
        while not self._stop.is_set():
            try:
                connection, _ = self._listener.accept()
            except OSError:
                continue
            self.accepted += 1
            self._held.append(connection)

    def close(self) -> None:
        self._stop.set()
        self._thread.join(timeout=2)
        for connection in self._held:
            connection.close()
        self._listener.close()


def _real_s3_client(endpoint: str, *, timeout: float, attempts: int) -> S3Client:
    import boto3

    client: S3Client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name="ap-northeast-2",
        aws_access_key_id="synthetic",
        aws_secret_access_key="synthetic",
        config=s3_client_config(timeout, timeout, attempts),
    )
    return client


def test_unresponsive_s3_times_out_as_storage_failure_within_bound() -> None:
    """실제 boto3·실제 소켓: 응답 없는 저장소는 정한 횟수만 시도한 뒤 저장소 장애로 끝난다(시간 값만 줄인다)."""
    server = _SilentServer()
    timeout, attempts = 1.0, 2
    try:
        client = _real_s3_client(
            f"http://127.0.0.1:{server.port}", timeout=timeout, attempts=attempts
        )
        started = time.monotonic()
        with pytest.raises(SourceUnavailable) as caught:
            read_pdf(
                S3Source("catchu-test"),
                storage_key(new_id(), new_id()),
                20 * MB,
                s3_client_factory=lambda: client,
            )
        elapsed = time.monotonic() - started
    finally:
        server.close()

    assert caught.value.error_type == "ReadTimeoutError"
    assert server.accepted == attempts, "정한 시도 횟수만큼만 연결한다"
    # 시도 2회 × 읽기 1초 + 재시도 대기 최대 1초. 여유 2초를 더해도 기본값(60초·5회)과는 구분된다.
    assert attempts * timeout <= elapsed < attempts * (timeout + timeout) + 1 + 2


def test_unreachable_s3_is_storage_failure_not_file_failure() -> None:
    """연결 자체가 안 되는 저장소(닫힌 포트)도 파일 실패가 아니라 저장소 장애다."""
    probe = socket.socket()
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()
    client = _real_s3_client(f"http://127.0.0.1:{port}", timeout=1.0, attempts=2)

    with pytest.raises(SourceUnavailable) as caught:
        read_pdf(
            S3Source("catchu-test"),
            storage_key(new_id(), new_id()),
            20 * MB,
            s3_client_factory=lambda: client,
        )

    assert caught.value.error_type in {"EndpointConnectionError", "ConnectTimeoutError"}
    assert "catchu-test" not in str(caught.value)


class _BodyServer:
    """S3 GetObject 응답을 흉내 내는 로컬 서버. 본문을 한꺼번에 주거나 정한 간격으로 조금씩 계속 준다."""

    def __init__(
        self,
        body: bytes,
        *,
        piece: int | None = None,
        interval: float = 0.0,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        self._headers = dict(headers or {})
        self._body = body
        self._piece = piece
        self._interval = interval
        self._listener = socket.socket()
        self._listener.bind(("127.0.0.1", 0))
        self._listener.listen(8)
        self._listener.settimeout(0.2)
        self.port = self._listener.getsockname()[1]
        self.sent = 0
        self.peer_closed = threading.Event()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def _serve(self) -> None:
        while not self._stop.is_set():
            try:
                connection, _ = self._listener.accept()
            except OSError:
                continue
            threading.Thread(
                target=self._answer, args=(connection,), daemon=True
            ).start()

    def _answer(self, connection: socket.socket) -> None:
        try:
            connection.recv(65536)
            head = (
                "HTTP/1.1 200 OK\r\nContent-Type: application/pdf\r\n"
                + "".join(
                    f"{name}: {value}\r\n" for name, value in self._headers.items()
                )
                + f"Content-Length: {len(self._body)}\r\n\r\n"
            )
            connection.sendall(head.encode("ascii"))
            if self._piece is None:
                connection.sendall(self._body)
                self.sent = len(self._body)
                return
            for start in range(0, len(self._body), self._piece):
                if self._stop.is_set():
                    return
                connection.sendall(self._body[start : start + self._piece])
                self.sent = start + self._piece
                time.sleep(self._interval)
        except OSError:
            # 받는 쪽이 연결을 놓았다(시간 예산을 넘겨 응답 본문을 닫은 경우).
            self.peer_closed.set()
        finally:
            connection.close()

    def close(self) -> None:
        self._stop.set()
        self._thread.join(timeout=2)
        self._listener.close()


def _s3_read_threads() -> list[threading.Thread]:
    return [t for t in threading.enumerate() if t.name == S3_READ_THREAD_NAME]


def test_trickling_s3_body_ends_as_storage_failure_at_total_budget() -> None:
    """#521 리뷰 보완: 본문이 개별 읽기 시간 제한보다 짧은 간격으로 조금씩 계속 와도 전체 시간 예산에서 끝난다.

    개별 읽기 제한 1초, 조각 간격 0.2초(제한에 걸리지 않음), 전체 예산 1.5초. 다 받으려면 20초가 넘게 걸린다.
    기대: 예산 직후 SourceUnavailable("TotalTimeout") — 파일 실패(FileUnreadable)도, 끝없는 읽기도 아니다.

    두 시점을 따로 잰다.
    - 부른 쪽이 돌아온 시점: 예산 직후. 정리를 기다리지 않는다.
    - 읽는 스레드와 응답이 정리된 시점: 그 뒤. 진행 중인 소켓 읽기 한 번이 끝나면(다음 조각, 0.2초 안) 줄어든 소켓
      시간 제한으로 곧 끝나고 스레드가 응답을 닫는다. 서버는 그때 연결 끊김을 본다.
    """
    read_timeout, interval, budget = 1.0, 0.2, 1.5
    body = b"0" * (100 * 1024)
    server = _BodyServer(body, piece=1024, interval=interval)
    try:
        client = _real_s3_client(
            f"http://127.0.0.1:{server.port}", timeout=read_timeout, attempts=1
        )
        started = time.monotonic()
        with pytest.raises(SourceUnavailable) as caught:
            read_pdf(
                S3Source("catchu-test"),
                storage_key(new_id(), new_id()),
                20 * MB,
                s3_client_factory=lambda: client,
                total_timeout=budget,
            )
        returned = time.monotonic()
        elapsed = returned - started
        alive_at_return = len(_s3_read_threads())
        # 정리는 부른 쪽이 돌아온 뒤에 읽는 스레드가 한다.
        deadline = returned + read_timeout + 2
        while _s3_read_threads() and time.monotonic() < deadline:
            time.sleep(0.01)
        cleanup = time.monotonic() - returned
        leftover = _s3_read_threads()
        peer_closed = server.peer_closed.wait(timeout=read_timeout + 2)
        sent = server.sent
    finally:
        server.close()

    assert caught.value.error_type == "TotalTimeout"
    assert budget <= elapsed < budget + 1.0, (
        "예산 직후에 끝난다(조각을 다 기다리지 않는다)"
    )
    assert interval < read_timeout, (
        "전제: 조각 간격이 개별 읽기 제한보다 짧아 그 제한에는 걸리지 않는다"
    )
    assert 0 < sent < len(body), "본문을 받는 도중에 끊었다"
    assert alive_at_return == 1, (
        "부른 쪽이 돌아온 순간에는 읽는 스레드가 아직 살아 있다(정리를 기다리지 않았다)"
    )
    assert leftover == [], "그 뒤 읽는 스레드가 스스로 끝난다"
    assert cleanup < read_timeout, (
        "정리는 진행 중인 소켓 읽기 한 번(다음 조각까지)과 줄어든 소켓 시간 제한 안에 끝난다"
    )
    assert peer_closed, "스레드가 응답 본문을 닫아 서버가 연결 끊김을 본다"
    print(
        f"[시점] 부른 쪽 반환 {elapsed:.2f}초(예산 {budget}초), 그 뒤 정리까지 {cleanup:.2f}초"
    )


def test_normal_s3_download_succeeds_within_total_budget() -> None:
    """같은 예산·같은 클라이언트로 정상 응답은 그대로 받는다(예산이 정상 내려받기를 막지 않는다)."""
    data = pdf_bytes(["Real socket download"]) + b"0" * (2 * MB)
    server = _BodyServer(data)
    try:
        client = _real_s3_client(
            f"http://127.0.0.1:{server.port}", timeout=1.0, attempts=1
        )
        result = read_pdf(
            S3Source("catchu-test"),
            storage_key(new_id(), new_id()),
            20 * MB,
            s3_client_factory=lambda: client,
            total_timeout=5.0,
        )
    finally:
        server.close()

    assert result == data
    assert _s3_read_threads() == []


def _crc32_header(data: bytes) -> str:
    """S3가 응답에 싣는 CRC32 체크섬 머리 값(4바이트 big-endian의 base64)."""
    return base64.b64encode(zlib.crc32(data).to_bytes(4, "big")).decode("ascii")


@pytest.mark.parametrize("total_timeout", [None, 5.0], ids=["no-budget", "with-budget"])
def test_s3_body_with_wrong_checksum_is_storage_failure_not_pdf_bytes(
    total_timeout: float | None,
) -> None:
    """#521 리뷰 보완: 응답 체크섬이 본문과 다르면 그 바이트를 정상 PDF로 돌려주지 않고 저장소 장애로 끝낸다.

    SDK의 공개 본문 읽기(`StreamingBody.read`)가 하는 무결성 검사를 건너뛰지 않는지 본다. 내려받는 동안 바뀐 본문을
    파일 문제(UNREADABLE_FILE)로 확정하거나 그대로 추출하면 안 된다.
    """
    sent = pdf_bytes(["Tampered in transit"])
    declared = pdf_bytes(["What S3 says it stored"])
    assert sent != declared
    server = _BodyServer(
        sent, headers={"x-amz-checksum-crc32": _crc32_header(declared)}
    )
    try:
        client = _real_s3_client(
            f"http://127.0.0.1:{server.port}", timeout=1.0, attempts=1
        )
        with pytest.raises(SourceUnavailable) as caught:
            read_pdf(
                S3Source("catchu-test"),
                storage_key(new_id(), new_id()),
                20 * MB,
                s3_client_factory=lambda: client,
                total_timeout=total_timeout,
            )
    finally:
        server.close()

    assert caught.value.error_type == "FlexibleChecksumError"
    assert _s3_read_threads() == []


def test_s3_body_with_matching_checksum_is_returned() -> None:
    """체크섬이 맞는 응답은 그대로 받는다(검사가 정상 내려받기를 막지 않는다)."""
    data = pdf_bytes(["Checksum matches"]) + b"0" * (300 * 1024)
    server = _BodyServer(data, headers={"x-amz-checksum-crc32": _crc32_header(data)})
    try:
        client = _real_s3_client(
            f"http://127.0.0.1:{server.port}", timeout=1.0, attempts=1
        )
        result = read_pdf(
            S3Source("catchu-test"),
            storage_key(new_id(), new_id()),
            20 * MB,
            s3_client_factory=lambda: client,
            total_timeout=5.0,
        )
    finally:
        server.close()

    assert result == data


def test_s3_body_shorter_than_declared_length_is_storage_failure() -> None:
    """선언한 길이보다 짧게 끊긴 응답도 받은 만큼을 PDF로 돌려주지 않는다(SDK의 길이 검사)."""

    class _ShortServer(_BodyServer):
        def _answer(self, connection: socket.socket) -> None:
            try:
                connection.recv(65536)
                head = f"HTTP/1.1 200 OK\r\nContent-Length: {len(self._body) + 4096}\r\n\r\n"
                connection.sendall(head.encode("ascii") + self._body)
            finally:
                connection.close()

    server = _ShortServer(pdf_bytes(["Cut short"]))
    try:
        client = _real_s3_client(
            f"http://127.0.0.1:{server.port}", timeout=1.0, attempts=1
        )
        with pytest.raises(SourceUnavailable) as caught:
            read_pdf(
                S3Source("catchu-test"),
                storage_key(new_id(), new_id()),
                20 * MB,
                s3_client_factory=lambda: client,
                total_timeout=5.0,
            )
    finally:
        server.close()

    assert caught.value.error_type in {"IncompleteReadError", "ResponseStreamingError"}


def test_total_budget_keeps_original_classification_of_other_failures() -> None:
    """예산 안에서 난 실패는 원래 분류 그대로다: 없는 키는 파일 실패, 권한·메모리는 각자의 분류."""
    with pytest.raises(FileUnreadable) as missing:
        read_pdf(
            S3Source("catchu-test"),
            storage_key(new_id(), new_id()),
            20 * MB,
            s3_client_factory=lambda: FakeS3(error=_client_error("NoSuchKey")),
            total_timeout=5.0,
        )
    assert missing.value.reason == "missing"

    with pytest.raises(SourceUnavailable) as denied:
        read_pdf(
            S3Source("catchu-test"),
            storage_key(new_id(), new_id()),
            20 * MB,
            s3_client_factory=lambda: FakeS3(error=_client_error("AccessDenied")),
            total_timeout=5.0,
        )
    assert denied.value.error_type == "ClientError:AccessDenied"

    class _OutOfMemory:
        def get_object(self, *, Bucket: str, Key: str) -> Mapping[str, Any]:
            raise MemoryError

    with pytest.raises(MemoryError):
        read_pdf(
            S3Source("catchu-test"),
            storage_key(new_id(), new_id()),
            20 * MB,
            s3_client_factory=lambda: _OutOfMemory(),
            total_timeout=5.0,
        )


def test_s3_body_over_limit_is_too_large() -> None:
    with pytest.raises(FileUnreadable) as caught:
        _read_s3(FakeS3(body=b"0" * (20 * MB + 1)))
    assert caught.value.reason == "too-large"


class _FailingBody:
    def __init__(self, error: BaseException) -> None:
        self.error = error
        self.closed = False

    def read(self, size: int = -1) -> bytes:
        raise self.error

    def close(self) -> None:
        self.closed = True


class _BodyS3(FakeS3):
    def __init__(self, body: _FailingBody) -> None:
        super().__init__()
        self.failing_body = body

    def get_object(self, *, Bucket: str, Key: str) -> Mapping[str, Any]:
        self.calls.append((Bucket, Key))
        return {"Body": self.failing_body}


def test_s3_body_memory_error_is_not_storage_failure() -> None:
    # R-MEM: 본문 읽기 중 메모리 부족은 SourceUnavailable로 바꾸지 않고 올려 자식의 메모리 제한 분류를 따른다.
    body = _FailingBody(MemoryError())

    with pytest.raises(MemoryError):
        _read_s3(_BodyS3(body))
    assert body.closed


def test_s3_body_other_error_stays_source_unavailable() -> None:
    # 다른 본문 읽기 오류의 분류는 그대로다.
    body = _FailingBody(ConnectionResetError("reset"))

    with pytest.raises(SourceUnavailable) as caught:
        _read_s3(_BodyS3(body))
    assert caught.value.error_type == "ConnectionResetError"
    assert body.closed


def test_s3_invalid_key_never_calls_client() -> None:
    fake = FakeS3(body=b"x")
    with pytest.raises(FileUnreadable):
        _read_s3(fake, "members/../secret.pdf")
    assert fake.calls == []


# settings ----------------------------------------------------------------------------------


def test_no_source_means_no_pdf_worker() -> None:
    assert pdf_settings_from_environment({}) is None


def test_local_root_and_bucket_settings(tmp_path: Path) -> None:
    local = pdf_settings_from_environment({"PDF_FILE_ROOT": str(tmp_path)})
    assert local is not None and isinstance(local.source, LocalSource)
    assert local.concurrency == 1

    s3 = pdf_settings_from_environment({"FILE_STORAGE_S3_BUCKET": "catchu-dev"})
    assert s3 is not None and s3.source == S3Source("catchu-dev")
    assert s3.for_child().source == S3Source("catchu-dev")


@pytest.mark.parametrize(
    "values",
    [
        {"PDF_FILE_ROOT": "<root>", "FILE_STORAGE_S3_BUCKET": "catchu-dev"},
        {"PDF_FILE_ROOT": "<root>", "CATCHU_WORKER_PDF_CONCURRENCY": "2"},
        {"FILE_STORAGE_S3_BUCKET": "Bad_Bucket"},
        {"PDF_FILE_ROOT": "relative/path"},
        {"CATCHU_WORKER_PDF_CONCURRENCY": "1"},
        {"PDF_FILE_ROOT": "<root>", "CATCHU_WORKER_PDF_CHILD_TIMEOUT_SECONDS": "0"},
    ],
    ids=[
        "both",
        "concurrency-2",
        "bad-bucket",
        "relative-root",
        "option-without-source",
        "timeout-zero",
    ],
)
def test_invalid_settings_raise(tmp_path: Path, values: dict[str, str]) -> None:
    resolved = {
        key: (str(tmp_path) if value == "<root>" else value)
        for key, value in values.items()
    }
    with pytest.raises(SettingsError):
        pdf_settings_from_environment(resolved)


# 쪽 글 합계 상한(팀장 결정 2026-11-10, #420 issuecomment-6759834176) ----------------------


def _pages_returning(monkeypatch: pytest.MonkeyPatch, texts: list[str]) -> list[int]:
    """쪽마다 정해진 글을 돌려주게 하고, 몇 번째 쪽까지 추출했는지 기록한다."""
    calls: list[int] = []

    def fake(self: PageObject, *args: Any, **kwargs: Any) -> str:
        calls.append(len(calls) + 1)
        return texts[len(calls) - 1]

    monkeypatch.setattr(PageObject, "extract_text", fake)
    return calls


@pytest.mark.parametrize(
    ("texts", "outcome"),
    [
        (["가" * 60_000], "SUCCEEDED"),
        (["가" * 60_001], "TEXT_LIMIT_EXCEEDED"),
        (["a" * 20_000, "b" * 20_000, "c" * 20_000], "SUCCEEDED"),
        (["a" * 20_000, "b" * 20_000, "c" * 20_001], "TEXT_LIMIT_EXCEEDED"),
        (["😀" * 60_000], "SUCCEEDED"),  # 4바이트·UTF-16 2단위 문자도 1자로 센다
        (["😀" * 60_001], "TEXT_LIMIT_EXCEEDED"),
        (["x" * 60_000, " \n\t", "\x00\x00"], "SUCCEEDED"),  # 읽을 수 없는 쪽은 0자
        (["x" * 59_999 + "\x00\x00y"], "SUCCEEDED"),  # NUL은 빼고 센다
    ],
    ids=[
        "60000-one-page",
        "60001-one-page",
        "60000-three-pages",
        "60001-three-pages",
        "emoji-60000",
        "emoji-60001",
        "blank-pages-count-zero",
        "nul-not-counted",
    ],
)
def test_text_limit_counts_code_points_across_pages(
    monkeypatch: pytest.MonkeyPatch, texts: list[str], outcome: str
) -> None:
    _pages_returning(monkeypatch, texts)

    result = extract_pages(pdf_bytes(["p"] * len(texts)))

    if outcome == "SUCCEEDED":
        assert result["outcome"] == "SUCCEEDED"
        assert len(result["pages"]) == len(texts)
        assert sum(len(page["text"]) for page in result["pages"]) <= 60_000
    else:
        # 부분 pages 없이 실패만 돌려준다.
        assert result == {"outcome": "FAILED", "failureCode": "TEXT_LIMIT_EXCEEDED"}


def test_text_limit_stops_extraction_at_exceeding_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _pages_returning(monkeypatch, ["a" * 40_000, "b" * 30_000, "c", "d"])

    result = extract_pages(pdf_bytes(["p"] * 4))

    assert result == {"outcome": "FAILED", "failureCode": "TEXT_LIMIT_EXCEEDED"}
    assert calls == [1, 2]  # 넘은 쪽에서 멈추고 뒤 쪽은 뽑지 않는다


def test_largest_allowed_result_is_small_and_valid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 상한 안에서 가장 큰 결과(4바이트 문자 60,000자를 50쪽에 나눔)도 1 MiB 안이고 결과 규격을 지킨다.
    from app.consumer.frames import Frame, encode
    from app.pdf_extraction.envelope import PdfRequest, build_result, is_valid_result

    _pages_returning(monkeypatch, ["😀" * 1_200] * 50)
    outcome = extract_pages(pdf_bytes(["p"] * 50))
    assert outcome["outcome"] == "SUCCEEDED"

    frame_bytes = len(encode(Frame("result", message=outcome)))
    assert frame_bytes < 1024 * 1024
    request = PdfRequest(new_id(), new_id(), "members/x", "pdf-extract-x")
    result = build_result(request, outcome)
    assert is_valid_result(result)
    assert len(json.dumps(result, ensure_ascii=False).encode("utf-8")) < 1024 * 1024


@pytest.mark.parametrize(
    ("total", "valid"),
    [(60_000, True), (60_001, False)],
    ids=["60000", "60001"],
)
def test_result_self_check_applies_text_limit(total: int, valid: bool) -> None:
    from app.consumer import queues
    from app.pdf_extraction.envelope import is_valid_result

    pdf_id = new_id()
    half = total // 2
    result = {
        "schemaVersion": "2",
        "messageId": queues.pdf_result_message_id(pdf_id),
        "pdfMaterialId": pdf_id,
        "memberId": new_id(),
        "outcome": "SUCCEEDED",
        "pages": [
            {"pageNumber": 1, "readable": True, "text": "😀" * half},
            {"pageNumber": 2, "readable": True, "text": "a" * (total - half)},
        ],
    }
    assert is_valid_result(result) is valid


def test_failed_text_limit_result_passes_self_check() -> None:
    from app.consumer import queues
    from app.pdf_extraction.envelope import is_valid_result

    pdf_id = new_id()
    result = {
        "schemaVersion": "2",
        "messageId": queues.pdf_result_message_id(pdf_id),
        "pdfMaterialId": pdf_id,
        "memberId": new_id(),
        "outcome": "FAILED",
        "failureCode": "TEXT_LIMIT_EXCEEDED",
    }
    assert is_valid_result(result)


def test_text_limit_with_real_pypdf_extraction() -> None:
    # 대역 없이 실제 pypdf가 뽑은 글로 센다: 50쪽 x 1,000자는 받고, 50쪽 x 1,250자(62,500자)는 상한 초과다.
    under = extract_pages(pdf_bytes(["A" * 1_000] * 50))
    assert under["outcome"] == "SUCCEEDED"
    assert sum(len(page["text"]) for page in under["pages"]) <= 60_000

    assert extract_pages(pdf_bytes(["A" * 1_250] * 50)) == {
        "outcome": "FAILED",
        "failureCode": "TEXT_LIMIT_EXCEEDED",
    }
