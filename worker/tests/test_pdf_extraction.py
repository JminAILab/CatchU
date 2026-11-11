"""PDF 글 추출(extract)·원본 읽기(reader)·설정(settings) 단위 시험. 합성 PDF 바이트만 쓴다(계획 7.3)."""

import io
import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from pdf_synthetic import new_id, pdf_bytes, pdf_request, place, text_pages
from pypdf import PageObject

from app.consumer.settings import SettingsError
from app.pdf_extraction.envelope import storage_key
from app.pdf_extraction.extract import extract_pages, normalize_page_text
from app.pdf_extraction.reader import (
    FileUnreadable,
    S3Client,
    SourceUnavailable,
    read_pdf,
)
from app.pdf_extraction.settings import (
    LocalSource,
    S3Source,
    pdf_settings_from_environment,
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
