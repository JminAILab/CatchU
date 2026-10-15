"""수신 확인 조회. 계획 「PR① 자동 시험」 10."""

import asyncio
import logging
from dataclasses import replace
from typing import Any

import pytest
from consumer_support import (
    FAST,
    FakeOutput,
    FakeResultJobs,
    child_settings,
    request_job,
)

from app.consumer.parent import RequestProcessor
from app.consumer.receipts import (
    ReceiptKind,
    ReceiptRecord,
    ReceiptWatcher,
    ResultJobView,
)

SENT = {
    "messageId": "message-mock-00000000-0000-4000-8000-000000000102-result",
    "resultId": "result-mock-00000000-0000-4000-8000-000000000102",
    "requestId": "00000000-0000-4000-8000-000000000101",
    "attemptId": "00000000-0000-4000-8000-000000000102",
}
LIMITS = replace(FAST, receipt_interval=0.01, receipt_window=0.3)


def receipt(disposition: str, code: str, **changes: str) -> dict[str, str]:
    return {
        "schemaVersion": "1",
        "messageId": "receipt-0001",
        "resultId": SENT["resultId"],
        "requestId": SENT["requestId"],
        "attemptId": SENT["attemptId"],
        "disposition": disposition,
        "code": code,
        **changes,
    }


def done(value: Any) -> ResultJobView:
    return ResultJobView(finished=True, failed=False, return_value=value)


def watch(jobs: FakeResultJobs) -> ReceiptRecord:
    async def go() -> ReceiptRecord:
        return await ReceiptWatcher(jobs, LIMITS).watch(SENT)

    return asyncio.run(go())


@pytest.mark.parametrize(
    ("disposition", "code"),
    [
        ("ACCEPTED", "OK"),
        ("DUPLICATE", "ALREADY_RECEIVED"),
        ("REJECTED", "STALE_ATTEMPT"),
    ],
)
def test_receipt_kinds_are_recorded_and_job_removed(
    disposition: str, code: str, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    pending = ResultJobView(finished=False, failed=False, return_value=None)
    jobs = FakeResultJobs([None, pending, done(receipt(disposition, code))])

    record = watch(jobs)

    assert record == ReceiptRecord(ReceiptKind.RECEIVED, disposition, code)
    assert jobs.removed == [SENT["messageId"]]
    assert f"disposition={disposition} code={code}" in caplog.text
    # ACCEPTED는 E 수신이지 반영 완료가 아니다.
    assert "반영 완료" not in caplog.text and "APPLIED" not in caplog.text


@pytest.mark.parametrize(
    ("view", "kind"),
    [
        (done(None), ReceiptKind.NULL),
        (done("ACCEPTED"), ReceiptKind.INVALID),
        (done({**receipt("ACCEPTED", "OK"), "code": "APPLIED"}), ReceiptKind.INVALID),
        (done(receipt("ACCEPTED", "OK", attemptId="other")), ReceiptKind.ID_MISMATCH),
        (done(receipt("ACCEPTED", "OK", resultId="other")), ReceiptKind.ID_MISMATCH),
        (
            ResultJobView(finished=True, failed=True, return_value=None),
            ReceiptKind.JOB_FAILED,
        ),
    ],
    ids=[
        "null",
        "not-object",
        "bad-code",
        "attempt-mismatch",
        "result-mismatch",
        "job-failed",
    ],
)
def test_unusable_receipts_are_recorded_not_resent(
    view: ResultJobView, kind: ReceiptKind
) -> None:
    jobs = FakeResultJobs([view])

    record = watch(jobs)

    assert record.kind is kind
    assert jobs.removed == [SENT["messageId"]]


def test_missing_or_pending_job_until_window_is_unobserved() -> None:
    missing = watch(FakeResultJobs([None]))
    pending = watch(
        FakeResultJobs([ResultJobView(finished=False, failed=False, return_value=None)])
    )

    assert missing == ReceiptRecord(ReceiptKind.UNOBSERVED, last_seen="missing")
    assert pending == ReceiptRecord(ReceiptKind.UNOBSERVED, last_seen="pending")


def test_failed_poll_rounds_are_skipped() -> None:
    jobs = FakeResultJobs(
        [ConnectionError("down"), TimeoutError(), done(receipt("ACCEPTED", "OK"))]
    )

    record = watch(jobs)

    assert record.kind is ReceiptKind.RECEIVED
    assert jobs.loads == 3


def test_remove_failure_keeps_record() -> None:
    jobs = FakeResultJobs(
        [done(receipt("ACCEPTED", "OK"))], remove_error=ConnectionError()
    )

    assert watch(jobs).kind is ReceiptKind.RECEIVED


def test_cancel_records_unobserved(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)

    async def go() -> None:
        watcher = ReceiptWatcher(
            FakeResultJobs([None]), replace(LIMITS, receipt_window=60)
        )
        task = watcher.watch(SENT)
        await asyncio.sleep(0.05)
        await watcher.cancel_all()
        assert task.cancelled()

    asyncio.run(go())
    assert "last=cancelled" in caplog.text


def test_rejected_receipt_does_not_resend_or_rerun_analysis() -> None:
    output = FakeOutput()
    job = request_job()
    attempt = job.data["attemptId"]
    rejected = done(
        {
            **receipt("REJECTED", "CONTEXT_MISMATCH"),
            "resultId": f"result-mock-{attempt}",
            "requestId": job.data["requestId"],
            "attemptId": attempt,
        }
    )
    jobs = FakeResultJobs([rejected])
    settings = child_settings(limits=LIMITS)

    async def go() -> tuple[Any, ReceiptRecord, int]:
        watcher = ReceiptWatcher(jobs, LIMITS)
        processor = RequestProcessor(settings, output, watcher)
        value = await processor(job, "token")
        records = [await task for task in list(watcher._tasks)]
        return value, records[0], processor.spawned

    value, record, spawned = asyncio.run(go())

    assert value == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
    assert record == ReceiptRecord(ReceiptKind.RECEIVED, "REJECTED", "CONTEXT_MISMATCH")
    assert [added.name for added in output.added].count("Result") == 1
    assert spawned == 1
