"""PDF 추출 처리 함수와 실제 자식 프로세스(가짜 출력 큐·가짜 결과 작업 조회). 계획 7.3."""

import asyncio
import logging
import os
import re
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

import pdf_children
import pytest
from consumer_support import FAST, FakeOutput, FakeResultJobs, child_settings
from pdf_synthetic import PdfJob, new_id, pdf_bytes, pdf_job, pdf_request, place

from app.consumer import queues
from app.consumer.children import ChildTarget
from app.consumer.receipts import (
    ReceiptKind,
    ReceiptWatcher,
    ResultJobView,
)
from app.pdf_extraction.child import pdf_child_main, pdf_child_settings
from app.pdf_extraction.envelope import (
    PDF_IDENTIFYING_FIELDS,
    SCHEMA_VERSION,
    classify_receipt,
    is_valid_result,
)
from app.pdf_extraction.settings import LocalSource, PdfChildSettings, PdfLimits
from app.pdf_extraction.worker import PdfExtractionProcessor, PdfProcessingAborted

# Windows spawn은 자식 기동이 느리고, `pytest --cov`의 자식 계측은 pypdf·botocore 불러오기를 약 0.2초에서
# 약 11초로 늘린다(2026-11-10 측정). 정상 사례는 자식이 끝나는 즉시 돌아오므로 제한을 넉넉히 둬도 시험이
# 길어지지 않는다.
GENEROUS = 60.0
SHORT = 3.0


@dataclass
class Run:
    value: dict[str, str] | PdfProcessingAborted
    processor: PdfExtractionProcessor
    output: FakeOutput
    jobs: FakeResultJobs
    receipts_watched: int
    job: PdfJob


def run_job(
    job: PdfJob,
    root: Path,
    *,
    target: ChildTarget = pdf_child_main,
    timeout: float = GENEROUS,
    output: FakeOutput | None = None,
    jobs: FakeResultJobs | None = None,
    receipt_window: float = 60,
) -> Run:
    pdf = PdfChildSettings(
        source=LocalSource(str(root)),
        limits=PdfLimits(child_timeout=timeout, child_grace=2),
    )
    settings = pdf_child_settings(child_settings(limits=FAST), pdf)
    output = output or FakeOutput()
    jobs = jobs or FakeResultJobs()

    async def go() -> Run:
        watcher = ReceiptWatcher(
            jobs,
            replace(FAST, receipt_window=receipt_window),
            classifier=classify_receipt,
            identifying_fields=PDF_IDENTIFYING_FIELDS,
        )
        processor = PdfExtractionProcessor(
            settings, pdf, output, watcher, child_target=target
        )
        try:
            value: dict[str, str] | PdfProcessingAborted = await processor(job, "token")
        except PdfProcessingAborted as error:
            value = error
        watched = watcher.pending
        if receipt_window < 60:
            for _ in range(100):
                if watcher.pending == 0:
                    break
                await asyncio.sleep(0.05)
        await watcher.cancel_all()
        return Run(value, processor, output, jobs, watched, job)

    return asyncio.run(go())


def aborted(run: Run) -> str:
    assert isinstance(run.value, PdfProcessingAborted), run.value
    assert str(run.value) == run.value.code
    assert run.value.__cause__ is None and run.value.__context__ is None
    return run.value.code


def sent_result(run: Run) -> dict[str, Any]:
    assert isinstance(run.value, dict), run.value
    assert [added.name for added in run.output.added] == [queues.PDF_RESULT_JOB]
    added = run.output.added[0]
    pdf_id = run.job.data["pdfMaterialId"]
    assert added.opts["jobId"] == f"message-pdf-{pdf_id}-result"
    assert added.opts["attempts"] == 1
    assert is_valid_result(added.data)
    assert added.data["memberId"] == run.job.data["memberId"]
    assert run.receipts_watched == 1
    return added.data


def placed_job(root: Path, data: bytes) -> PdfJob:
    message = pdf_request()
    place(root, message, data)
    return pdf_job(message)


# 봉투 위반: 결과도 자식도 없이 작업 실패 ---------------------------------------------------


def _change_key(job: PdfJob) -> PdfJob:
    other = pdf_request(job.data["pdfMaterialId"])  # 다른 회원의 키
    return replace(job, data={**job.data, "storageKey": other["storageKey"]})


@pytest.mark.parametrize(
    "change",
    [
        lambda job: replace(job, name="Request"),
        lambda job: replace(job, id=new_id()),
        lambda job: replace(job, data={**job.data, "extra": "x"}),
        lambda job: replace(
            job,
            id=job.id.upper(),
            data={**job.data, "pdfMaterialId": job.id.upper()},
        ),
        _change_key,
        lambda job: replace(job, data={**job.data, "messageId": "pdf-extract-other"}),
        lambda job: replace(job, data={**job.data, "schemaVersion": "1"}),
        lambda job: replace(
            job,
            data={**job.data, "storageKey": "members/../../etc/passwd.pdf"},
        ),
        lambda job: replace(job, data=["not", "a", "mapping"]),
    ],
    ids=[
        "name",
        "id-mismatch",
        "extra-key",
        "upper-uuid",
        "other-member-key",
        "message-id",
        "schema-version",
        "traversal-key",
        "data-not-object",
    ],
)
def test_envelope_violation_fails_without_child_or_result(
    tmp_path: Path, change: Any
) -> None:
    run = run_job(change(pdf_job()), tmp_path)

    assert aborted(run) == "PDF_REQUEST_INVALID"
    assert run.processor.spawned == 0
    assert run.output.attempts == []
    assert run.receipts_watched == 0
    assert run.job.opts["stackTraceLimit"] == 0


# 정상·파일 실패 -----------------------------------------------------------------------------


def test_success_sends_pdf_result_once(tmp_path: Path) -> None:
    run = run_job(placed_job(tmp_path, pdf_bytes(["Alpha text", None])), tmp_path)

    assert run.value == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
    assert run.processor.spawned == 1
    result = sent_result(run)
    assert result["schemaVersion"] == SCHEMA_VERSION
    assert [page["readable"] for page in result["pages"]] == [True, False]
    assert "Alpha text" in result["pages"][0]["text"]


def test_encrypted_pdf_sends_failed_encrypted(tmp_path: Path) -> None:
    run = run_job(placed_job(tmp_path, pdf_bytes(["x"], password="pw")), tmp_path)

    assert run.value == {"handled": "RESULT_SENT", "outcome": "FAILED"}
    assert sent_result(run)["failureCode"] == "ENCRYPTED"


def test_missing_file_sends_failed_unreadable(tmp_path: Path) -> None:
    run = run_job(pdf_job(), tmp_path)

    assert sent_result(run)["failureCode"] == "UNREADABLE_FILE"


def test_page_extract_error_sends_failed_unreadable(tmp_path: Path) -> None:
    # D25: 쪽 추출 예외는 결함(WORKER_DEFECT)이 아니라 파일 전체 FAILED(UNREADABLE_FILE) 결과다.
    run = run_job(
        placed_job(tmp_path, pdf_bytes(["Page A", "Page B"])),
        tmp_path,
        target=pdf_children.page_extract_error,
    )

    assert run.value == {"handled": "RESULT_SENT", "outcome": "FAILED"}
    result = sent_result(run)
    assert result["failureCode"] == "UNREADABLE_FILE"
    assert "pages" not in result


# 자식 한계: FAILED(UNREADABLE_FILE)로 확정 ----------------------------------------------------


@pytest.mark.parametrize(
    ("target", "timeout", "log"),
    [
        (pdf_children.hang, SHORT, "cause=TIME_LIMIT_EXCEEDED"),
        (pdf_children.exit_without_frame, GENEROUS, "cause=CHILD_EXITED"),
        # 자식 stderr는 Windows에서 cp949로 나와 한글 문구 대신 ERROR 줄의 ASCII 부분을 본다.
        (
            pdf_children.memory_error,
            GENEROUS,
            r"ERROR app\.pdf_extraction\.child .*UNREADABLE_FILE",
        ),
    ],
    ids=["time-limit", "exit-without-frame", "memory-error"],
)
def test_child_limit_sends_failed_unreadable(
    tmp_path: Path,
    target: ChildTarget,
    timeout: float,
    log: str,
    caplog: pytest.LogCaptureFixture,
    capfd: pytest.CaptureFixture[str],
) -> None:
    caplog.set_level(logging.INFO)
    run = run_job(
        placed_job(tmp_path, pdf_bytes(["x"])), tmp_path, target=target, timeout=timeout
    )

    assert run.value == {"handled": "RESULT_SENT", "outcome": "FAILED"}
    assert sent_result(run)["failureCode"] == "UNREADABLE_FILE"
    assert re.search(log, caplog.text + capfd.readouterr().err)


def test_s3_body_memory_error_sends_failed_unreadable_once(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
    capfd: pytest.CaptureFixture[str],
) -> None:
    # R-MEM(합성): S3 본문 읽기 중 MemoryError → 결함(WORKER_DEFECT)이 아니라 FAILED(UNREADABLE_FILE) 1회.
    caplog.set_level(logging.INFO)
    run = run_job(pdf_job(), tmp_path, target=pdf_children.s3_body_memory_error)

    assert run.value == {"handled": "RESULT_SENT", "outcome": "FAILED"}
    assert run.output.attempts == [queues.PDF_RESULT_JOB]
    result = sent_result(run)
    assert result["failureCode"] == "UNREADABLE_FILE"
    assert "pages" not in result
    child_log = capfd.readouterr().err
    assert re.search(r"ERROR app\.pdf_extraction\.child .*UNREADABLE_FILE", child_log)
    assert "SourceUnavailable" not in caplog.text + child_log


@pytest.mark.skipif(
    sys.platform != "linux",
    reason="RLIMIT_AS 메모리 제한은 Linux에서만 걸린다(Windows는 시간 제한만)",
)
def test_real_memory_limit_sends_failed_unreadable_once(
    tmp_path: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    # 실제 제한(합성 MemoryError 아님): 기본 512 MB RLIMIT_AS 아래에서 자식이 메모리를 계속 잡으면
    # 할당이 실패하고, 승인 규칙(NFR4.3·NFR4.18)대로 FAILED(UNREADABLE_FILE)가 1회 전송 시도된다.
    run = run_job(
        placed_job(tmp_path, pdf_bytes(["x"])),
        tmp_path,
        target=pdf_children.allocate_until_limit,
    )

    assert run.value == {"handled": "RESULT_SENT", "outcome": "FAILED"}, run.value
    assert run.output.attempts == [queues.PDF_RESULT_JOB]
    result = sent_result(run)
    assert result["failureCode"] == "UNREADABLE_FILE"
    assert "pages" not in result
    child_log = capfd.readouterr().err
    assert re.search(r"ERROR app\.pdf_extraction\.child .*UNREADABLE_FILE", child_log)


# 결함: 결과 없이 작업 실패 -------------------------------------------------------------------


@pytest.mark.parametrize(
    "target",
    [pdf_children.raise_defect, pdf_children.source_unavailable],
    ids=["child-exception", "source-unavailable"],
)
def test_child_defect_fails_job_without_result(
    tmp_path: Path, target: ChildTarget
) -> None:
    run = run_job(placed_job(tmp_path, pdf_bytes(["x"])), tmp_path, target=target)

    assert aborted(run) == "WORKER_DEFECT"
    assert run.output.attempts == []
    assert run.receipts_watched == 0


def test_result_dispatch_failure_is_not_resent(tmp_path: Path) -> None:
    output = FakeOutput(fail_on=queues.PDF_RESULT_JOB)
    run = run_job(placed_job(tmp_path, pdf_bytes(["x"])), tmp_path, output=output)

    assert aborted(run) == "RESULT_DISPATCH_UNKNOWN"
    assert output.attempts == [queues.PDF_RESULT_JOB]
    assert run.receipts_watched == 1


# 수신 확인 ---------------------------------------------------------------------------------


def _receipt(pdf_id: str, **change: Any) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "messageId": queues.pdf_result_message_id(pdf_id),
        "pdfMaterialId": pdf_id,
        "disposition": "ACCEPTED",
        "code": "OK",
        **change,
    }


def test_receipt_is_read_and_result_job_removed(tmp_path: Path) -> None:
    job = placed_job(tmp_path, pdf_bytes(["x"]))
    pdf_id = job.data["pdfMaterialId"]
    jobs = FakeResultJobs([ResultJobView(True, False, _receipt(pdf_id))])

    run = run_job(job, tmp_path, jobs=jobs, receipt_window=0.5)

    sent_result(run)
    assert jobs.removed == [queues.pdf_result_message_id(pdf_id)]


@pytest.mark.parametrize(
    ("view", "kind"),
    [
        (ResultJobView(True, True, None), ReceiptKind.JOB_FAILED),
        (ResultJobView(True, False, None), ReceiptKind.NULL),
        (ResultJobView(True, False, {"bad": "shape"}), ReceiptKind.INVALID),
        ("other-id", ReceiptKind.ID_MISMATCH),
        ("duplicate", ReceiptKind.RECEIVED),
        ("rejected", ReceiptKind.RECEIVED),
        ("bad-code", ReceiptKind.INVALID),
    ],
    ids=[
        "job-failed",
        "null",
        "invalid",
        "id-mismatch",
        "duplicate",
        "rejected",
        "bad-code",
    ],
)
def test_classify_receipt_kinds(view: Any, kind: ReceiptKind) -> None:
    pdf_id = new_id()
    sent = {"messageId": queues.pdf_result_message_id(pdf_id), "pdfMaterialId": pdf_id}
    if view == "other-id":
        view = ResultJobView(True, False, _receipt(new_id()))
    elif view == "duplicate":
        view = ResultJobView(
            True,
            False,
            _receipt(pdf_id, disposition="DUPLICATE", code="ALREADY_RECEIVED"),
        )
    elif view == "rejected":
        view = ResultJobView(
            True, False, _receipt(pdf_id, disposition="REJECTED", code="STALE_ATTEMPT")
        )
    elif view == "bad-code":
        view = ResultJobView(True, False, _receipt(pdf_id, code="ALREADY_RECEIVED"))

    assert classify_receipt(view, sent).kind is kind


# 로그 --------------------------------------------------------------------------------------


def test_logs_hold_no_page_text_or_storage_key(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
    capfd: pytest.CaptureFixture[str],
) -> None:
    caplog.set_level(logging.INFO)
    job = placed_job(tmp_path, pdf_bytes(["Confidential page words"]))

    run = run_job(job, tmp_path)

    sent_result(run)
    text = caplog.text + capfd.readouterr().err
    assert "PDF 추출 시작" in caplog.text and "PDF 결과 전송" in caplog.text
    assert "Confidential" not in text
    assert job.data["storageKey"] not in text
    assert job.data["memberId"] not in text


# 팀장 결정 2026-11-10(#420 issuecomment-6759834176) — 글 상한·오류별 확정 ---------------------


def test_text_limit_sends_failed_without_pages(tmp_path: Path) -> None:
    run = run_job(
        placed_job(tmp_path, pdf_bytes(["p1", "p2"])),
        tmp_path,
        target=pdf_children.big_text,
    )

    assert run.value == {"handled": "RESULT_SENT", "outcome": "FAILED"}
    result = sent_result(run)
    assert result["failureCode"] == "TEXT_LIMIT_EXCEEDED"
    assert "pages" not in result


@pytest.mark.parametrize(
    "target",
    [
        pdf_children.corrupt_frame,
        pdf_children.oversized_frame,
        pdf_children.event_frame,
    ],
    ids=["undecodable-frame", "over-16MiB-frame", "non-terminal-frame"],
)
def test_internal_message_damage_fails_job_without_result(
    tmp_path: Path, target: ChildTarget
) -> None:
    # 내부 결과 메시지 손상: 결과 없이 작업 실패(시한 대기). corrupt_frame 자식은 보낸 뒤 정상 종료하지만
    # 자식 종료 여부와 상관없이 손상 메시지는 파일 실패로 바꾸지 않는다.
    run = run_job(placed_job(tmp_path, pdf_bytes(["x"])), tmp_path, target=target)

    assert aborted(run) == "WORKER_DEFECT"
    assert run.output.attempts == []
    assert run.receipts_watched == 0


@pytest.mark.skipif(
    sys.platform != "linux",
    reason="본문 도중 끝남을 OSError로 올리는 것은 Unix 파이프다(Windows는 EOFError)",
)
def test_cpython_truncated_frame_message_matches_reader_constant() -> None:
    # 공유 읽기(children.py)가 본문 도중 끝남을 TRUNCATED로 가르는 근거인 CPython 문구가 그대로인지 본다.
    import multiprocessing
    import struct

    from app.consumer.children import TRUNCATED_MESSAGE

    reader, writer = multiprocessing.Pipe(duplex=False)
    os.write(writer.fileno(), struct.pack("!i", 4096) + b'{"kind":')
    writer.close()
    with pytest.raises(OSError) as caught:
        reader.recv_bytes(1024 * 1024)
    reader.close()
    assert str(caught.value) == TRUNCATED_MESSAGE


def test_closed_pipe_with_live_child_is_defect_not_file_failure(tmp_path: Path) -> None:
    # 끝은 닫혔는데(불완전 프레임) 자식이 살아 있으면 원인 모를 종료가 아니라 통신 결함: 결과 없이 작업 실패.
    run = run_job(
        placed_job(tmp_path, pdf_bytes(["x"])),
        tmp_path,
        target=pdf_children.partial_frame_then_live,
    )

    assert aborted(run) == "WORKER_DEFECT"
    assert run.output.attempts == []


def test_cut_while_sending_is_unknown_exit(tmp_path: Path) -> None:
    # 보내는 도중 끊김은 원인 모를 자식 종료로 본다: 즉시 FAILED(UNREADABLE_FILE).
    run = run_job(
        placed_job(tmp_path, pdf_bytes(["x"])),
        tmp_path,
        target=pdf_children.partial_frame_then_die,
    )

    assert run.value == {"handled": "RESULT_SENT", "outcome": "FAILED"}
    assert sent_result(run)["failureCode"] == "UNREADABLE_FILE"


def test_bad_exit_after_result_keeps_result(tmp_path: Path) -> None:
    run = run_job(
        placed_job(tmp_path, pdf_bytes(["Kept page"])),
        tmp_path,
        target=pdf_children.exit_badly_after_result,
    )

    assert run.value == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
    assert "Kept page" in sent_result(run)["pages"][0]["text"]
