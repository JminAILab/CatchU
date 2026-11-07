"""분석 소비자 서비스: BullMQ Worker, 출력 Queue, 상태 확인 서버를 같은 이벤트 루프에서 돌린다.

앱이 Worker의 실행 작업(`autorun=False`)을 직접 쥐고 상태를 판정한다. 신호는 uvicorn이 아니라 앱이
받으며, 종료는 새 작업 멈춤 → 자식 끝내기·회수 → 실패 기록 → 결과 전송 마무리 → 수신 확인 조회
취소 → 정상 close() → 상태 확인 서버 종료 순서로 25초 안에 한다. 넘으면 남은 자식을 SIGKILL하고
프로세스를 끝낸다. `close(force=True)`는 실패 기록을 건너뛰므로 쓰지 않는다.
"""

import asyncio
import contextlib
import logging
import os
import signal
import time
from collections.abc import Awaitable, Callable, Iterator, Mapping
from typing import Any, NoReturn

import uvicorn
from bullmq import Job, Queue, Worker

from app.consumer import queues
from app.consumer.child import child_main
from app.consumer.children import ChildTarget
from app.consumer.health import ConsumerState, create_health_app
from app.consumer.parent import OutputQueue, ProcessingAborted, RequestProcessor
from app.consumer.receipts import ReceiptWatcher, ResultJobView
from app.consumer.settings import ConsumerSettings

logger = logging.getLogger(__name__)


class _HealthServer(uvicorn.Server):
    """신호를 가로채지 않는 uvicorn 서버. 종료 신호는 서비스가 직접 받는다."""

    @contextlib.contextmanager
    def capture_signals(self) -> Iterator[None]:
        yield


class BullOutput:
    """worker→api 큐에 작업을 넣는다."""

    def __init__(self, queue: Queue) -> None:
        self._queue = queue

    async def add(self, name: str, data: dict[str, Any], opts: dict[str, Any]) -> Any:
        return await self._queue.add(name, data, opts)


class BullResultJobs:
    """넣은 결과 작업을 작업 ID(= 결과 messageId)로 다시 읽고 지운다."""

    def __init__(self, queue: Queue) -> None:
        self._queue = queue

    async def load(self, job_id: str) -> ResultJobView | None:
        job = await Job.fromId(self._queue, job_id)
        if job is None:
            return None
        return ResultJobView(
            finished=bool(job.finishedOn),
            failed=bool(job.failedReason),
            return_value=job.returnvalue,
        )

    async def remove(self, job_id: str) -> None:
        await self._queue.remove(job_id)


class ConsumerService:
    def __init__(
        self,
        settings: ConsumerSettings,
        *,
        host: str = "0.0.0.0",
        port: int = 8000,
        child_target: ChildTarget = child_main,
        output_wrapper: Callable[[OutputQueue], OutputQueue] = lambda output: output,
        install_signals: bool = True,
        hard_exit: Callable[[int], NoReturn] | None = None,
        worker_options: Mapping[str, Any] | None = None,
    ) -> None:
        self._settings = settings
        self._limits = settings.limits
        self._host = host
        self.port = port
        self._child_target = child_target
        self._output_wrapper = output_wrapper
        self._install_signals = install_signals
        self._hard_exit = hard_exit or _kill_self
        # 시험에서만 쓴다(예: 재연결 대기를 줄임). 운영 값은 아래 Worker 옵션이다.
        self._worker_options = dict(worker_options or {})
        self._stop_requested = asyncio.Event()
        self._stopping = False
        self._consumer_failed = False
        self.worker: Worker | None = None
        self.processor: RequestProcessor | None = None
        self.receipts: ReceiptWatcher | None = None
        self._output_queue: Queue | None = None
        self._run_task: asyncio.Task[Any] | None = None
        self.server: _HealthServer | None = None

    def state(self) -> ConsumerState:
        if self._stopping:
            return "stopping"
        if not self._settings.consumer_enabled:
            return "disabled"
        worker, task = self.worker, self._run_task
        if worker is None or task is None:
            return "starting"
        if task.done() or worker.closing or worker.closed or worker.paused:
            return "stopped"
        # running은 첫 연결(클라이언트 이름 설정)에 성공한 뒤에 켜진다. 그 뒤 큐 서버에 잠시 못
        # 붙어 다시 시도하는 동안에도 켜져 있으므로 정상으로 답한다.
        if not worker.running:
            return "starting"
        return "running"

    def request_stop(self) -> None:
        self._stop_requested.set()

    def _start_consumer(self) -> None:
        url = self._settings.queue_url
        assert url is not None
        connection = {"connection": url.reveal(), "prefix": self._settings.prefix}
        self._output_queue = Queue(queues.OUTPUT_QUEUE, connection)
        self.receipts = ReceiptWatcher(BullResultJobs(self._output_queue), self._limits)
        self.processor = RequestProcessor(
            self._settings.for_child(),
            self._output_wrapper(BullOutput(self._output_queue)),
            self.receipts,
            child_target=self._child_target,
        )
        self.worker = Worker(
            queues.REQUEST_QUEUE,
            self.processor,
            {
                **connection,
                "autorun": False,
                "concurrency": self._settings.concurrency,
                "lockDuration": self._limits.lock_duration_ms,
                "stalledInterval": self._limits.stalled_interval_ms,
                # 정체 복구 0회: 잠금이 끊긴 작업을 다시 주지 않고 실패로 끝낸다.
                "maxStalledCount": 0,
                "removeOnComplete": dict(queues.REQUEST_KEEP),
                "removeOnFail": dict(queues.REQUEST_KEEP),
                **self._worker_options,
            },
        )
        self.worker.on("error", _log_worker_error)
        self.worker.on("failed", _log_job_failed)
        self._run_task = asyncio.create_task(self.worker.run(), name="request-worker")
        self._run_task.add_done_callback(self._run_finished)

    def _run_finished(self, task: "asyncio.Task[Any]") -> None:
        if self._stopping:
            return
        # 예상 밖 종료. 소비가 멈춘 채 상태 확인만 503으로 살아 있으면 compose(restart:
        # unless-stopped)는 컨테이너를 다시 띄우지 않으므로, 정리 순서를 밟아 종료 코드 1로 끝낸다.
        if task.cancelled():
            cause = "cancelled"
        else:
            error = task.exception()
            cause = "returned" if error is None else type(error).__name__
        logger.error("소비 실행 작업이 예상 밖으로 끝나 프로세스를 끝냄: %s", cause)
        self._consumer_failed = True
        self.request_stop()

    async def run(self) -> int:
        loop = asyncio.get_running_loop()
        if self._install_signals:
            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(sig, self.request_stop)
        config = uvicorn.Config(
            create_health_app(self.state),
            host=self._host,
            port=self.port,
            log_config=None,
            access_log=False,
            lifespan="off",
        )
        self.server = _HealthServer(config)
        server_task = asyncio.create_task(self.server.serve(), name="health-server")
        if self._settings.consumer_enabled:
            self._start_consumer()
        live = self._settings.live
        # 판정은 공급자 이름과 AI 쪽 켜짐 여부만 남긴다(키 값은 남기지 않는다, CR3 NFR5.2).
        logger.info(
            "분석 소비자 기동: consumer=%s prefix=%s concurrency=%s mock=%s "
            "judgementProvider=%s aiSide=%s",
            "enabled" if self._settings.consumer_enabled else "disabled",
            self._settings.prefix,
            self._settings.concurrency,
            self._settings.mock_enabled,
            "-" if live is None else live.judgement_provider,
            "on" if live is not None and live.ai_side else "off",
        )
        stop_wait = asyncio.create_task(self._stop_requested.wait())
        done, _ = await asyncio.wait(
            {server_task, stop_wait}, return_when=asyncio.FIRST_COMPLETED
        )
        exit_code = 1 if self._consumer_failed else 0
        if server_task in done and not self._stop_requested.is_set():
            logger.error("상태 확인 서버가 먼저 끝남")
            exit_code = 1
        stop_wait.cancel()
        return await self._shutdown(server_task, exit_code)

    async def _shutdown(self, server_task: asyncio.Task[Any], exit_code: int) -> int:
        started = time.monotonic()
        deadline = started + self._limits.shutdown

        def remaining() -> float:
            return max(0.0, deadline - time.monotonic())

        self._stopping = True
        logger.info("종료 시작")
        worker, processor = self.worker, self.processor
        if worker is not None and processor is not None:
            processor.begin_stop()
            await _bounded(
                worker.pause(do_not_wait_active=True),
                min(self._limits.pause, remaining()),
            )
            processor.abort_active()
            if not await _until(lambda: processor.active == 0, remaining()):
                return self._hard_stop()
            # close()는 부른 순간의 처리 작업만 기다린다. 멈추기 직전에 꺼낸 작업의 처리와 실패 기록
            # (WORKER_STOPPING)이 끝나기 전에 연결을 닫지 않도록, BullMQ의 진행 작업이 비기를 먼저 기다린다.
            if not await _until(lambda: _bullmq_idle(worker), remaining()):
                return self._hard_stop()
            if self.receipts is not None:
                await self.receipts.cancel_all()
            close = asyncio.create_task(worker.close())
            done, _ = await asyncio.wait({close}, timeout=remaining())
            if not done:
                return self._hard_stop()
            if self._run_task is not None:
                await asyncio.wait({self._run_task}, timeout=remaining())
            if self._output_queue is not None:
                await _bounded(self._output_queue.close(), remaining())
        if self.server is not None:
            self.server.should_exit = True
        done, _ = await asyncio.wait({server_task}, timeout=remaining())
        if not done:
            return self._hard_stop()
        logger.info("종료 완료: %.1f초", time.monotonic() - started)
        return exit_code

    def _hard_stop(self) -> int:
        logger.error(
            "종료 상한(%s초)을 넘겨 남은 자식을 강제 종료하고 끝냄",
            self._limits.shutdown,
        )
        if self.processor is not None:
            self.processor.kill_all()
        for handler in logging.getLogger().handlers:
            handler.flush()
        self._hard_exit(1)


def _bullmq_idle(worker: Worker) -> bool:
    """처리 중인 작업(완료·실패 기록 포함)이 없고, 가져오기 작업도 모두 끝났다.

    BullMQ Worker의 `jobs`는 processJob이 끝날 때(기록 뒤) 비고, `processing`은 가져오기·처리
    작업 묶음이다. 동시 수가 1이면 멈춘 뒤 새 작업이 들어오지 않는다.
    """
    return not worker.jobs and all(task.done() for task in worker.processing)


async def _bounded(awaitable: Awaitable[Any], timeout: float) -> None:
    try:
        await asyncio.wait_for(awaitable, timeout)
    except Exception as error:
        logger.warning("종료 단계 상한 초과·오류: %s", type(error).__name__)


async def _until(condition: Callable[[], bool], timeout: float) -> bool:
    end = time.monotonic() + timeout
    while not condition():
        if time.monotonic() >= end:
            return False
        await asyncio.sleep(0.05)
    return True


def _kill_self(code: int) -> NoReturn:
    """종료 상한을 넘기면 스스로 SIGKILL로 끝낸다. 컨테이너 종료 코드가 정지 유예 초과 강제 종료와
    같은 137이 되어, 교체 절차(replace-single.sh)가 정상 종료로 보지 않고 멈춘다."""
    os.kill(os.getpid(), signal.SIGKILL)
    os._exit(code)  # SIGKILL이 막힌 환경에서만 닿는다


def _log_worker_error(error: BaseException, *_: Any) -> None:
    logger.warning("큐 소비자 오류: %s", type(error).__name__)


def _log_job_failed(job: Any, error: BaseException) -> None:
    code = error.code if isinstance(error, ProcessingAborted) else type(error).__name__
    job_id = job.id if queues.is_uuid(getattr(job, "id", None)) else "<형식 오류>"
    logger.info("요청 작업 실패 기록: jobId=%s code=%s", job_id, code)
