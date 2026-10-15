"""수신 확인 조회: 넣은 결과 작업의 반환값(ResultReceipt)을 뒤에서 몇 분 동안 다시 읽어 기록한다.

기록만 한다. 받지 못했거나(미관측) 거부(REJECTED)여도 결과를 다시 보내거나 분석을 다시 하지
않는다. ACCEPTED는 E가 결과를 받았다는 뜻이지 회원 화면에 반영됐다는 뜻이 아니다. 읽은 뒤에는 그
결과 작업을 지워 회원 결과 본문이 큐에 오래 남지 않게 한다(지우기에 실패하면 30분 보관이 받친다).
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol

from app.consumer.settings import Limits
from app.contract import IDENTIFYING_FIELDS, Verdict, check_message

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ResultJobView:
    """결과 작업에서 읽은 것. finished가 아니면 아직 처리 중이거나 기다리는 중이다."""

    finished: bool
    failed: bool
    return_value: object


class ResultJobs(Protocol):
    async def load(self, job_id: str) -> ResultJobView | None: ...

    async def remove(self, job_id: str) -> None: ...


class ReceiptKind(StrEnum):
    RECEIVED = "RECEIVED"  # 형식·식별자가 맞는 수신 확인(disposition에 ACCEPTED·DUPLICATE·REJECTED)
    NULL = "NULL"  # E가 식별할 수 없다고 판정해 수신 확인을 만들지 않았다
    INVALID = "INVALID"  # 반환값이 수신 확인 형식이 아니다
    ID_MISMATCH = "ID_MISMATCH"  # 수신 확인의 식별자가 보낸 결과와 다르다
    JOB_FAILED = "JOB_FAILED"  # E 소비자가 결과 작업을 실패로 끝냈다
    UNOBSERVED = "UNOBSERVED"  # 조회 기간 안에 끝난 결과 작업을 보지 못했다


@dataclass(frozen=True)
class ReceiptRecord:
    kind: ReceiptKind
    disposition: str | None = None
    code: str | None = None
    last_seen: str | None = (
        None  # 미관측일 때 마지막으로 본 상태(missing·pending·skipped)
    )


def classify(view: ResultJobView, sent: Mapping[str, Any]) -> ReceiptRecord:
    if view.failed:
        return ReceiptRecord(ReceiptKind.JOB_FAILED)
    receipt = view.return_value
    if receipt is None:
        return ReceiptRecord(ReceiptKind.NULL)
    if check_message("ResultReceipt", receipt).verdict is not Verdict.VALID or not (
        isinstance(receipt, Mapping)
    ):
        return ReceiptRecord(ReceiptKind.INVALID)
    if any(receipt[field] != sent[field] for field in IDENTIFYING_FIELDS):
        return ReceiptRecord(ReceiptKind.ID_MISMATCH)
    return ReceiptRecord(
        ReceiptKind.RECEIVED, disposition=receipt["disposition"], code=receipt["code"]
    )


class ReceiptWatcher:
    """결과마다 조회 작업을 하나 띄우고, 종료할 때 남은 조회를 취소한다(미관측으로 기록)."""

    def __init__(
        self,
        jobs: ResultJobs,
        limits: Limits,
        *,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._jobs = jobs
        self._limits = limits
        self._sleep = sleep
        self._clock = clock
        self._tasks: set[asyncio.Task[ReceiptRecord]] = set()

    def watch(self, result: Mapping[str, Any]) -> "asyncio.Task[ReceiptRecord]":
        sent = {field: result[field] for field in ("messageId", *IDENTIFYING_FIELDS)}
        task = asyncio.create_task(self._watch(sent), name="receipt-watch")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    @property
    def pending(self) -> int:
        return len(self._tasks)

    async def cancel_all(self) -> None:
        tasks = list(self._tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _load(self, job_id: str) -> ResultJobView | None | str:
        try:
            return await asyncio.wait_for(
                self._jobs.load(job_id), self._limits.receipt_poll_once
            )
        except Exception as error:  # 그 회차만 건너뛴다
            logger.warning("수신 확인 조회 회차 건너뜀: %s", type(error).__name__)
            return "skipped"

    async def _remove(self, job_id: str) -> None:
        try:
            await asyncio.wait_for(
                self._jobs.remove(job_id), self._limits.receipt_remove
            )
        except Exception as error:
            logger.warning(
                "결과 작업을 지우지 못함(보관 기간이 지나면 정리됨): %s",
                type(error).__name__,
            )

    async def _watch(self, sent: Mapping[str, str]) -> ReceiptRecord:
        message_id = sent["messageId"]
        end = self._clock() + self._limits.receipt_window
        last_seen = "missing"
        try:
            while True:
                await self._sleep(self._limits.receipt_interval)
                view = await self._load(message_id)
                if isinstance(view, ResultJobView) and view.finished:
                    record = classify(view, sent)
                    self._log(sent, record)
                    await self._remove(message_id)
                    return record
                last_seen = (
                    view if isinstance(view, str) else "pending" if view else "missing"
                )
                if self._clock() >= end:
                    break
        except asyncio.CancelledError:
            record = ReceiptRecord(ReceiptKind.UNOBSERVED, last_seen="cancelled")
            self._log(sent, record)
            raise
        record = ReceiptRecord(ReceiptKind.UNOBSERVED, last_seen=last_seen)
        self._log(sent, record)
        return record

    @staticmethod
    def _log(sent: Mapping[str, str], record: ReceiptRecord) -> None:
        ids = (sent["messageId"], sent["attemptId"])
        if record.kind is ReceiptKind.RECEIVED:
            # ACCEPTED는 E 수신이지 반영 완료가 아니다. 반영은 E/B가 판단한다.
            logger.info(
                "수신 확인: messageId=%s attemptId=%s disposition=%s code=%s",
                *ids,
                record.disposition,
                record.code,
            )
        elif record.kind is ReceiptKind.UNOBSERVED:
            logger.warning(
                "수신 확인 미관측(재전송·재분석하지 않음): messageId=%s attemptId=%s last=%s",
                *ids,
                record.last_seen,
            )
        else:
            logger.warning(
                "수신 확인 이상(재전송하지 않음): messageId=%s attemptId=%s kind=%s",
                *ids,
                record.kind,
            )
