"""PDF 추출 처리 함수(BullMQ Worker에 넘김): 봉투 검사 → 자식 → 프레임 → 결과 전송 → 수신 확인 조회 예약.

10월 분석 처리 함수(`app.consumer.parent.RequestProcessor`)와 같은 원칙이되 다른 점은 둘이다.
봉투 검사 실패는 결과 없이 작업 실패(BR3.6, `PDF_REQUEST_INVALID`)이고, 자식의 시간·메모리 제한 초과·비정상
종료는 작업 실패가 아니라 FAILED(UNREADABLE_FILE) 결과를 보내 자료를 10분 시한보다 일찍 확정한다(NFR4.3·4.18).
결과는 `worker-messages` 큐에 `PdfExtractionResult`·작업 ID = `message-pdf-{id}-result`로 한 번만 넣고,
수신 확인은 기록만 한다(거부·미관측이어도 재발송·재추출 없음, NFR4.15).

오류별 확정(팀장 결정 2026-11-10, #420 issuecomment-6759834176 질문 2, 승인 문서는 고치지 않음):
즉시 FAILED — 파일 오류(자식 결과), 메모리 부족·시간 초과, 원인 모를 자식 종료(종결 프레임을 다 받기 전에 끝이
닫히고 자식이 실제로 끝남: 프레임 사이 EOF·본문 도중 끝남).
결과 없이 작업 실패(시한 대기) — S3 저장소 장애·자식 코드 결함(defect 프레임), 내부 결과 메시지 손상(완전히 받은
프레임의 해석 불가·16 MiB 초과·종결 아닌 프레임·규격에 맞지 않는 결과 — 자식 종료 여부와 무관), 끝은 닫혔는데
자식이 살아 있음. 정상 결과를 받아 검사한 뒤의 비정상 종료는 받은 결과를 보낸다.
"""

import asyncio
import json
import logging
import os
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

from app.consumer import queues
from app.consumer.children import ChildRun, ChildTarget, Signal
from app.consumer.frames import Frame
from app.consumer.receipts import ReceiptWatcher
from app.consumer.settings import ChildSettings
from app.pdf_extraction.child import PdfChildInput, pdf_child_main
from app.pdf_extraction.envelope import (
    PdfRequest,
    build_result,
    check_request,
    failed_result,
    is_valid_result,
)
from app.pdf_extraction.settings import PdfChildSettings

logger = logging.getLogger(__name__)

PdfAbortCode = Literal[
    "PDF_REQUEST_INVALID",
    "WORKER_DEFECT",
    "WORKER_STOPPING",
    "RESULT_DISPATCH_UNKNOWN",
    "COMPLETION_RECORD_FAILED",
]
# 자식 쪽 한계: 결과 FAILED(UNREADABLE_FILE)로 바꾼다.
_ChildLimit = Literal["TIME_LIMIT_EXCEEDED", "CHILD_EXITED"]


class PdfProcessingAborted(Exception):
    """큐 작업을 실패로 끝낸다. BullMQ가 str(err)를 실패 사유로 저장하므로 문구는 코드뿐이다."""

    def __init__(self, code: PdfAbortCode) -> None:
        super().__init__(code)
        self.code = code


class OutputQueue(Protocol):
    async def add(
        self, name: str, data: dict[str, Any], opts: dict[str, Any]
    ) -> Any: ...


class PdfJob(Protocol):
    id: Any
    name: Any
    data: Any
    opts: Any


@dataclass(frozen=True)
class _Stop:
    """종료 신호로 처리를 끊는다."""


_TIMEOUT = object()
_STOPPED = _Stop()


def _rfc3339(moment: datetime) -> str:
    return (
        moment.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
    )


class PdfExtractionProcessor:
    """BullMQ Worker에 넘기는 처리 함수. 작업마다 자식 하나를 띄운다."""

    def __init__(
        self,
        settings: ChildSettings,
        pdf: PdfChildSettings,
        output: OutputQueue,
        receipts: ReceiptWatcher,
        *,
        child_target: ChildTarget = pdf_child_main,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        # settings.limits.total은 PDF 자식 시간 제한이어야 한다(child.pdf_child_settings).
        self._settings = settings
        self._limits = settings.limits
        self._pdf = pdf
        self._output = output
        self._receipts = receipts
        self._target = child_target
        self._now = now
        self._monotonic = monotonic
        self._stopping = False
        self._stop_events: dict[str, asyncio.Event] = {}
        self._runs: dict[str, ChildRun] = {}
        self.spawned = 0

    @property
    def stopping(self) -> bool:
        return self._stopping

    @property
    def active(self) -> int:
        return len(self._stop_events)

    def begin_stop(self) -> None:
        self._stopping = True

    def abort_active(self) -> None:
        for event in self._stop_events.values():
            event.set()

    def kill_all(self) -> None:
        for run in list(self._runs.values()):
            if run.launched:
                run.kill_now()
            else:
                run.abandon(self._limits.kill_wait)

    async def __call__(self, job: PdfJob, token: str) -> dict[str, str]:
        if isinstance(job.opts, dict):
            job.opts["stackTraceLimit"] = 0
        _fixed_failure_reason(job)
        outcome = await self._handle(job)
        if isinstance(outcome, str):
            raise PdfProcessingAborted(outcome)
        return outcome

    async def _handle(self, job: PdfJob) -> dict[str, str] | PdfAbortCode:
        if self._stopping:
            logger.warning("종료 중이라 자식을 띄우지 않음: jobId=%s", _safe_id(job.id))
            return "WORKER_STOPPING"
        request = check_request(job.name, job.id, job.data)
        if request is None:
            # 결과 없이 작업 실패. 자료는 시한으로 FAILED가 된다(BR3.6).
            logger.warning("PDF 요청 봉투 이상: jobId=%s", _safe_id(job.id))
            return "PDF_REQUEST_INVALID"
        try:
            return await self._run(job, request)
        except Exception as error:
            logger.error(
                "PDF 처리 함수 결함: pdfMaterialId=%s error=%s",
                request.pdf_material_id,
                type(error).__name__,
            )
            return "WORKER_DEFECT"

    async def _run(
        self, job: PdfJob, request: PdfRequest
    ) -> dict[str, str] | PdfAbortCode:
        pdf_id = request.pdf_material_id
        deadline = self._monotonic() + self._limits.total
        child_input = PdfChildInput(
            job_id=pdf_id,
            job_data=json.dumps(dict(job.data), ensure_ascii=False, allow_nan=False),
            picked_at=_rfc3339(self._now()),
            settings=self._settings,
            parent_pid=os.getpid(),
            pdf=self._pdf,
        )
        stop = asyncio.Event()
        self._stop_events[pdf_id] = stop
        run = ChildRun.create(self._target, child_input, self._limits.frame_max_bytes)
        self._runs[pdf_id] = run
        try:
            launch_failed = await self._launch(run, stop, deadline)
            if launch_failed == "WORKER_STOPPING":
                logger.warning("자식을 띄우는 중 종료: pdfMaterialId=%s", pdf_id)
                return "WORKER_STOPPING"
            if launch_failed is not None:
                return await self._limit_failed(run, request, launch_failed)
            self.spawned += 1
            logger.info("PDF 추출 시작: pdfMaterialId=%s pid=%s", pdf_id, run.pid)
            terminal = await self._watch(run, stop, deadline)
            if terminal == "WORKER_STOPPING":
                exit_code = await run.stop(
                    self._limits.terminate_wait, self._limits.kill_wait
                )
                logger.warning(
                    "PDF 추출 중단(종료): pdfMaterialId=%s exit=%s", pdf_id, exit_code
                )
                return "WORKER_STOPPING"
            if terminal == "WORKER_DEFECT":
                await run.stop(self._limits.terminate_wait, self._limits.kill_wait)
                return "WORKER_DEFECT"
            if not isinstance(terminal, Frame):
                return await self._limit_failed(run, request, terminal)
            exit_code = await run.wait_exit(self._limits.child_exit_wait)
            if run.is_alive():
                exit_code = await run.stop(
                    self._limits.terminate_wait, self._limits.kill_wait
                )
            if exit_code != 0:
                logger.warning(
                    "종결 뒤 자식 종료 코드: pdfMaterialId=%s exit=%s",
                    pdf_id,
                    exit_code,
                )
            return await self._finish(terminal, request)
        finally:
            self._stop_events.pop(pdf_id, None)
            self._runs.pop(pdf_id, None)
            if run.launched:
                run.kill_now()
                run.release()
            else:
                run.abandon(self._limits.kill_wait)

    async def _limit_failed(
        self, run: ChildRun, request: PdfRequest, cause: _ChildLimit
    ) -> dict[str, str] | PdfAbortCode:
        """자식 제한 초과·비정상 종료: 자식만 끝내고 FAILED(UNREADABLE_FILE)를 보고한다(NFR4.3·4.18)."""
        exit_code = await run.stop(self._limits.terminate_wait, self._limits.kill_wait)
        logger.warning(
            "PDF 추출 중단(UNREADABLE_FILE로 보고): pdfMaterialId=%s cause=%s exit=%s",
            request.pdf_material_id,
            cause,
            exit_code,
        )
        return await self._deliver(failed_result(request, "UNREADABLE_FILE"), request)

    async def _launch(
        self, run: ChildRun, stop: asyncio.Event, deadline: float
    ) -> Literal["WORKER_STOPPING", "TIME_LIMIT_EXCEEDED"] | None:
        started = run.launch()
        stopped = asyncio.ensure_future(stop.wait())
        waiters: set[asyncio.Future[Any]] = {started, stopped}
        try:
            done, _ = await asyncio.wait(
                waiters,
                timeout=max(0.0, deadline - self._monotonic()),
                return_when=asyncio.FIRST_COMPLETED,
            )
        finally:
            stopped.cancel()
        if started in done:
            started.result()  # 띄우기 실패는 예외로 올라가 결함(WORKER_DEFECT)이 된다
            return None
        return "WORKER_STOPPING" if stopped in done else "TIME_LIMIT_EXCEEDED"

    async def _next(
        self, run: ChildRun, stop: asyncio.Event, timeout: float
    ) -> Frame | Signal | _Stop | object:
        if stop.is_set():
            return _STOPPED
        get = asyncio.ensure_future(run.items.get())
        stopped = asyncio.ensure_future(stop.wait())
        try:
            done, _ = await asyncio.wait(
                {get, stopped}, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            stopped.cancel()
            if not get.done():
                get.cancel()
        if get in done:
            return get.result()
        if stopped in done:
            return _STOPPED
        return _TIMEOUT

    async def _watch(
        self, run: ChildRun, stop: asyncio.Event, deadline: float
    ) -> Frame | _ChildLimit | Literal["WORKER_STOPPING", "WORKER_DEFECT"]:
        remaining = deadline - self._monotonic()
        if remaining <= 0:
            return "TIME_LIMIT_EXCEEDED"
        item = await self._next(run, stop, remaining)
        if item is _TIMEOUT:
            return "TIME_LIMIT_EXCEEDED"
        if item is _STOPPED:
            return "WORKER_STOPPING"
        if item is Signal.EOF or item is Signal.TRUNCATED:
            # 종결 프레임을 다 받기 전에 자식 쪽 끝이 닫혔다(프레임 사이 EOF, 본문 도중 끝남). 자식이 실제로 끝났으면
            # 원인 모를 종료 → 즉시 FAILED(UNREADABLE_FILE). 끝은 닫혔는데 자식이 살아 있으면 통신 결함이다.
            await run.wait_exit(self._limits.child_exit_wait)
            if run.is_alive():
                return "WORKER_DEFECT"
            return "CHILD_EXITED"
        if item is Signal.CORRUPT:
            # 받은 프레임을 해석할 수 없거나 프레임 상한(16 MiB)을 넘었다: 내부 결과 메시지 손상 → 결과 없이
            # 작업 실패(시한 대기). 팀장 결정 2026-11-10(#420 issuecomment-6759834176) 질문 2의 표.
            return "WORKER_DEFECT"
        if not isinstance(item, Frame) or not item.terminal:
            # PDF 자식은 진행 알림을 보내지 않는다. 다른 프레임은 결함이다.
            return "WORKER_DEFECT"
        return item

    async def _finish(
        self, terminal: Frame, request: PdfRequest
    ) -> dict[str, str] | PdfAbortCode:
        pdf_id = request.pdf_material_id
        if terminal.kind != "result" or terminal.message is None:
            # defect(예외·저장소 장애)·그 밖 종결: 결과 없이 작업 실패. 자료는 시한으로 FAILED가 된다.
            logger.error(
                "PDF 자식 결함: pdfMaterialId=%s kind=%s error=%s",
                pdf_id,
                terminal.kind,
                terminal.error_type,
            )
            return "WORKER_DEFECT"
        result = build_result(request, terminal.message)
        if not is_valid_result(result):
            logger.error(
                "만든 결과가 규격에 맞지 않아 보내지 않음: pdfMaterialId=%s", pdf_id
            )
            return "WORKER_DEFECT"
        return await self._deliver(result, request)

    async def _deliver(
        self, result: dict[str, Any], request: PdfRequest
    ) -> dict[str, str] | PdfAbortCode:
        sent = await self._send_result(result, request.pdf_material_id)
        # 보냈는지 모를 때도 수신 확인 조회는 한다(기록만).
        self._receipts.watch(result)
        if not sent:
            return "RESULT_DISPATCH_UNKNOWN"
        return {"handled": "RESULT_SENT", "outcome": str(result["outcome"])}

    async def _send_result(self, result: Mapping[str, Any], pdf_id: str) -> bool:
        opts = {**queues.PDF_RESULT_JOB_OPTIONS, "jobId": result["messageId"]}
        try:
            await asyncio.wait_for(
                self._output.add(queues.PDF_RESULT_JOB, dict(result), opts),
                self._limits.result_send,
            )
        except Exception as error:
            # 보냈는지 모른다. 다시 넣지 않는다.
            logger.error(
                "PDF 결과 전송 모름(다시 넣지 않음): pdfMaterialId=%s error=%s",
                pdf_id,
                type(error).__name__,
            )
            return False
        logger.info(
            "PDF 결과 전송: pdfMaterialId=%s outcome=%s pages=%s",
            pdf_id,
            result["outcome"],
            len(result["pages"]) if isinstance(result.get("pages"), list) else 0,
        )
        return True


def _fixed_failure_reason(job: PdfJob) -> None:
    """완료 기록(moveToCompleted) 실패 때 그 예외 원문 대신 고정 코드를 실패 사유로 남긴다(parent.py와 같은 이유)."""
    original = getattr(job, "moveToFailed", None)
    if not callable(original):
        return
    job_id = _safe_id(job.id)

    async def move_to_failed(
        err: BaseException, token: str, fetchNext: bool = False
    ) -> Any:
        if not isinstance(err, PdfProcessingAborted):
            logger.error(
                "PDF 요청 작업 완료 기록 실패: jobId=%s error=%s",
                job_id,
                type(err).__name__,
            )
            err = PdfProcessingAborted("COMPLETION_RECORD_FAILED")
        return await original(err, token, fetchNext)

    job.moveToFailed = move_to_failed  # type: ignore[attr-defined]


def _safe_id(value: object) -> str:
    """로그에 남길 작업 ID. 형식이 틀린 ID는 값을 남기지 않는다."""
    if isinstance(value, str) and queues.is_uuid(value):
        return value
    return "<형식 오류>"
