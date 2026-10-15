"""부모의 처리 함수: 봉투 검사 → 자식 띄우기 → 프레임 처리 → 결과 전송 → 수신 확인 조회 예약.

자식이 정상적으로 끝낸 경우(처리 전 거부·결과·실행 불명)는 큐 작업을 완료로, 부모가 이상을 본
경우는 실패로 끝낸다. 실패는 고정 코드 예외(`ProcessingAborted`)를 except 블록 밖에서 올려
예외 연결 고리에 원문이 실리지 않게 한다. 부모는 스스로 진행 알림을 만들지 않는다(10/15 결정 2).
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
from app.consumer.child import ChildInput, child_main
from app.consumer.children import ChildRun, ChildTarget, Signal
from app.consumer.frames import Frame
from app.consumer.receipts import ReceiptWatcher
from app.consumer.settings import ChildSettings
from app.contract import Verdict, check_message

logger = logging.getLogger(__name__)

AbortCode = Literal[
    "REQUEST_JOB_INVALID",
    "WORKER_DEFECT",
    "TIME_LIMIT_EXCEEDED",
    "CHILD_EXITED",
    "WORKER_STOPPING",
    "RESULT_DISPATCH_UNKNOWN",
]


class ProcessingAborted(Exception):
    """큐 작업을 실패로 끝낸다. BullMQ가 str(err)를 실패 사유로 저장하므로 문구는 코드뿐이다."""

    def __init__(self, code: AbortCode) -> None:
        super().__init__(code)
        self.code = code


class OutputQueue(Protocol):
    async def add(
        self, name: str, data: dict[str, Any], opts: dict[str, Any]
    ) -> Any: ...


class RequestJob(Protocol):
    id: Any
    name: Any
    data: Any
    opts: Any


@dataclass(frozen=True)
class _Stop:
    """종료 신호로 분석을 끊는다."""


_TIMEOUT = object()
_STOPPED = _Stop()


def _rfc3339(moment: datetime) -> str:
    return (
        moment.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
    )


class RequestProcessor:
    """BullMQ Worker에 넘기는 처리 함수. 작업마다 자식 하나를 띄운다."""

    def __init__(
        self,
        settings: ChildSettings,
        output: OutputQueue,
        receipts: ReceiptWatcher,
        *,
        child_target: ChildTarget = child_main,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._settings = settings
        self._limits = settings.limits
        self._output = output
        self._receipts = receipts
        self._target = child_target
        self._now = now
        self._monotonic = monotonic
        self._stopping = False
        self._stop_events: dict[str, asyncio.Event] = {}
        self._runs: dict[str, ChildRun] = {}
        self.spawned = 0  # 띄운 자식 수(시험·기록용)

    @property
    def stopping(self) -> bool:
        return self._stopping

    @property
    def active(self) -> int:
        return len(self._stop_events)

    def begin_stop(self) -> None:
        """새 자식을 띄우지 않는다. 진행 중인 분석은 abort_active로 끊는다."""
        self._stopping = True

    def abort_active(self) -> None:
        for event in self._stop_events.values():
            event.set()

    def kill_all(self) -> None:
        for run in list(self._runs.values()):
            run.kill_now()

    async def __call__(self, job: RequestJob, token: str) -> dict[str, str]:
        if isinstance(job.opts, dict):
            # 요청 작업 옵션(#233)이 빠져도 실패 때 stacktrace를 저장하지 않게 한다.
            job.opts["stackTraceLimit"] = 0
        outcome = await self._handle(job)
        if isinstance(outcome, str):
            raise ProcessingAborted(outcome)
        return outcome

    async def _handle(self, job: RequestJob) -> dict[str, str] | AbortCode:
        if self._stopping:
            logger.warning("종료 중이라 자식을 띄우지 않음: jobId=%s", _safe_id(job.id))
            return "WORKER_STOPPING"
        if not queues.request_envelope_ok(job.name, job.id, job.data):
            logger.warning("요청 작업 봉투 이상: jobId=%s", _safe_id(job.id))
            return "REQUEST_JOB_INVALID"
        attempt_id: str = job.id
        try:
            return await self._run(job, attempt_id)
        except Exception as error:  # 부모 쪽 결함. 예외 종류 이름만 남긴다
            logger.error(
                "처리 함수 결함: attemptId=%s error=%s",
                attempt_id,
                type(error).__name__,
            )
            return "WORKER_DEFECT"

    async def _run(
        self, job: RequestJob, attempt_id: str
    ) -> dict[str, str] | AbortCode:
        data: Mapping[str, Any] = job.data
        picked_at = self._now()
        deadline = self._monotonic() + self._limits.total
        child_input = ChildInput(
            job_id=attempt_id,
            job_data=json.dumps(data, ensure_ascii=False, allow_nan=False),
            picked_at=_rfc3339(picked_at),
            settings=self._settings,
            parent_pid=os.getpid(),
        )
        stop = asyncio.Event()
        self._stop_events[attempt_id] = stop
        run: ChildRun | None = None
        try:
            run = await ChildRun.start(
                self._target, child_input, self._limits.frame_max_bytes
            )
            self.spawned += 1
            self._runs[attempt_id] = run
            logger.info("분석 시작: attemptId=%s pid=%s", attempt_id, run.pid)
            terminal = await self._watch(run, stop, deadline, data, attempt_id)
            if not isinstance(terminal, Frame):
                exit_code = await run.stop(
                    self._limits.terminate_wait, self._limits.kill_wait
                )
                logger.warning(
                    "분석 중단: attemptId=%s code=%s exit=%s",
                    attempt_id,
                    terminal,
                    exit_code,
                )
                return terminal
            # 종결 프레임을 받은 순간 20분 감시를 멈춘다. 그 뒤의 상한·종료는 결과를 바꾸지 않는다.
            exit_code = await run.wait_exit(self._limits.child_exit_wait)
            if run.is_alive():
                exit_code = await run.stop(
                    self._limits.terminate_wait, self._limits.kill_wait
                )
            if exit_code != 0:
                logger.warning(
                    "종결 뒤 자식 종료 코드: attemptId=%s exit=%s",
                    attempt_id,
                    exit_code,
                )
            return await self._finish(terminal, data, attempt_id)
        finally:
            self._stop_events.pop(attempt_id, None)
            self._runs.pop(attempt_id, None)
            if run is not None:
                run.kill_now()
                run.release()

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
        self,
        run: ChildRun,
        stop: asyncio.Event,
        deadline: float,
        data: Mapping[str, Any],
        attempt_id: str,
    ) -> Frame | AbortCode:
        while True:
            remaining = deadline - self._monotonic()
            if remaining <= 0:
                return "TIME_LIMIT_EXCEEDED"
            item = await self._next(run, stop, remaining)
            if item is _TIMEOUT:
                return "TIME_LIMIT_EXCEEDED"
            if item is _STOPPED:
                return "WORKER_STOPPING"
            if isinstance(item, Signal):
                # 종결 프레임 없이 끝났거나(EOF) 통신이 손상됐다.
                return "CHILD_EXITED"
            if not isinstance(item, Frame):
                return "WORKER_DEFECT"
            if item.terminal:
                return item
            if item.message is None or not await self._valid_event(
                item.message, data, attempt_id
            ):
                return "WORKER_DEFECT"
            # 앞 알림을 다 넣은 뒤 다음 프레임을 본다(진행 알림은 결과보다 먼저 들어간다).
            await self._send_event(item.message, attempt_id)

    async def _valid_event(
        self, event: Mapping[str, Any], data: Mapping[str, Any], attempt_id: str
    ) -> bool:
        mode = data.get("sourceMode")
        if mode not in ("MOCK", "LIVE"):
            return False
        expected = {
            queues.event_message_id(mode, attempt_id, state)
            for state in ("RECEIVED", "RUNNING", "UNCERTAIN")
        }
        checked = await asyncio.to_thread(check_message, "ProcessingEvent", event)
        return (
            checked.verdict is Verdict.VALID
            and event["messageId"] in expected
            and queues.is_safe_job_id(event["messageId"])
            and event["attemptId"] == attempt_id
            and event["requestId"] == data.get("requestId")
        )

    async def _send_event(self, event: Mapping[str, Any], attempt_id: str) -> None:
        message_id = event["messageId"]
        opts = {**queues.EVENT_JOB_OPTIONS, "jobId": message_id}
        try:
            await asyncio.wait_for(
                self._output.add(queues.EVENT_JOB, dict(event), opts),
                self._limits.event_send,
            )
        except Exception as error:
            # 보냈는지 모른다. 다시 넣지 않고 분석을 계속한다.
            logger.warning(
                "진행 알림 전송 모름: attemptId=%s state=%s error=%s",
                attempt_id,
                event["state"],
                type(error).__name__,
            )
            return
        logger.info("진행 알림 전송: attemptId=%s state=%s", attempt_id, event["state"])

    async def _finish(
        self, terminal: Frame, data: Mapping[str, Any], attempt_id: str
    ) -> dict[str, str] | AbortCode:
        if terminal.kind == "rejected":
            logger.warning(
                "처리 전 거부: attemptId=%s reason=%s at=%s",
                attempt_id,
                terminal.reason,
                terminal.fields,
            )
            return {"handled": "REJECTED", "reason": str(terminal.reason)}
        if terminal.kind == "uncertain":
            logger.warning("실행 불명(UNCERTAIN만 전송): attemptId=%s", attempt_id)
            return {"handled": "UNCERTAIN"}
        if terminal.kind == "defect" or terminal.message is None:
            logger.error(
                "자식 결함: attemptId=%s error=%s", attempt_id, terminal.error_type
            )
            return "WORKER_DEFECT"
        result = terminal.message
        if not await self._valid_result(result, data, attempt_id):
            logger.error(
                "만든 결과가 규격에 맞지 않아 보내지 않음: attemptId=%s", attempt_id
            )
            return "WORKER_DEFECT"
        sent = await self._send_result(result, attempt_id)
        # 보냈는지 모를 때도 수신 확인 조회는 한다(기록만).
        self._receipts.watch(result)
        if not sent:
            return "RESULT_DISPATCH_UNKNOWN"
        return {"handled": "RESULT_SENT", "outcome": str(result["outcome"])}

    async def _valid_result(
        self, result: Mapping[str, Any], data: Mapping[str, Any], attempt_id: str
    ) -> bool:
        mode = data.get("sourceMode")
        if mode not in ("MOCK", "LIVE"):
            return False
        checked = await asyncio.to_thread(check_message, "Result", result)
        return (
            checked.verdict is Verdict.VALID
            and result["messageId"] == queues.result_message_id(mode, attempt_id)
            and result["resultId"] == queues.result_id(mode, attempt_id)
            and queues.is_safe_job_id(result["messageId"])
            and result["attemptId"] == attempt_id
            and result["requestId"] == data.get("requestId")
            and result["sourceMode"] == mode
        )

    async def _send_result(self, result: Mapping[str, Any], attempt_id: str) -> bool:
        opts = {**queues.RESULT_JOB_OPTIONS, "jobId": result["messageId"]}
        try:
            await asyncio.wait_for(
                self._output.add(queues.RESULT_JOB, dict(result), opts),
                self._limits.result_send,
            )
        except Exception as error:
            # 보냈는지 모른다. 다시 넣지 않는다.
            logger.error(
                "결과 전송 모름(다시 넣지 않음): attemptId=%s error=%s",
                attempt_id,
                type(error).__name__,
            )
            return False
        logger.info("결과 전송: attemptId=%s outcome=%s", attempt_id, result["outcome"])
        return True


def _safe_id(value: object) -> str:
    """로그에 남길 작업 ID. 형식이 틀린 ID는 값을 남기지 않는다."""
    if isinstance(value, str) and queues.is_uuid(value):
        return value
    return "<형식 오류>"
