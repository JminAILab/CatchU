"""실제 Redis(키트와 같은 Valkey 8.1.6)로 확인하는 큐 소비자 시험. 계획 「PR① 자동 시험」의 ㉣ 11~17.

CATCHU_TEST_REDIS_URL이 있으면 반드시 돌고(CI), 없으면 건너뛴다. 시험마다 다른 접두사를 쓰고 끝나면
그 접두사의 키를 지운다.
"""

import asyncio
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any, NoReturn

import consumer_children
import pytest
import redis.asyncio as redis_asyncio
from bullmq import Job, Queue, Worker
from consumer_support import (
    FAST,
    REDIS_URL,
    mock_request,
    new_attempt,
    requires_redis,
    wait_until,
)

from app.consumer import queues
from app.consumer.receipts import ReceiptKind, ReceiptWatcher
from app.consumer.service import BullOutput, BullResultJobs, ConsumerService
from app.consumer.settings import ConsumerSettings, Limits, QueueUrl

pytestmark = requires_redis

WORKER_DIR = Path(__file__).resolve().parents[1]
KIT_DIR = WORKER_DIR.parent / "docs/queue-verification"
REQUEST_OPTS = {
    "attempts": 1,
    "removeOnComplete": {"age": 7200},
    "removeOnFail": {"age": 7200},
    "stackTraceLimit": 0,
}


# 도구 ------------------------------------------------------------------------------------


@pytest.fixture
def prefix() -> Iterator[str]:
    name = f"catchu-test-{uuid.uuid4().hex[:12]}"
    yield name

    async def clean() -> None:
        client = redis_asyncio.from_url(REDIS_URL)
        keys = [key async for key in client.scan_iter(match=f"{name}:*", count=500)]
        if keys:
            await client.delete(*keys)
        await client.aclose()

    asyncio.run(clean())


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port: int = sock.getsockname()[1]
        return port


def _queue(prefix: str, name: str = queues.REQUEST_QUEUE) -> Queue:
    return Queue(name, {"connection": REDIS_URL, "prefix": prefix})


async def add_request(
    prefix: str, message: dict[str, Any], opts: dict[str, Any] | None = None
) -> None:
    queue = _queue(prefix)
    await queue.add(
        "Request", message, {"jobId": message["attemptId"], **(opts or REQUEST_OPTS)}
    )
    await queue.close()


async def load(
    prefix: str, job_id: str, name: str = queues.REQUEST_QUEUE
) -> tuple[str, Any]:
    queue = _queue(prefix, name)
    state = await queue.getJobState(job_id)
    job = await Job.fromId(queue, job_id)
    await queue.close()
    return state, job


def state_of(prefix: str, job_id: str, name: str = queues.REQUEST_QUEUE) -> str:
    return asyncio.run(load(prefix, job_id, name))[0]


def job_of(prefix: str, job_id: str, name: str = queues.REQUEST_QUEUE) -> Any:
    return asyncio.run(load(prefix, job_id, name))[1]


class Harness:
    """tests/consumer_harness.py service를 별도 프로세스로 띄운다."""

    def __init__(self, tmp_path: Path, prefix: str, **extra: str) -> None:
        self.port = free_port()
        self.marker = tmp_path / f"marker-{uuid.uuid4().hex[:6]}.txt"
        self.marker.touch()
        self.log_path = tmp_path / f"harness-{uuid.uuid4().hex[:6]}.log"
        self._log = self.log_path.open("w")
        env = {
            **os.environ,
            "CATCHU_TEST_REDIS_URL": REDIS_URL,
            "HARNESS_PREFIX": prefix,
            "HARNESS_PORT": str(self.port),
            "HARNESS_MARKER": str(self.marker),
            **extra,
        }
        self.process = subprocess.Popen(
            [sys.executable, str(WORKER_DIR / "tests/consumer_harness.py"), "service"],
            cwd=WORKER_DIR,
            env=env,
            stdout=self._log,
            stderr=subprocess.STDOUT,
        )

    def health(self) -> tuple[int, dict[str, Any]]:
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{self.port}/health", timeout=1
            ) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())
        except OSError:
            return 0, {}

    def wait_running(self, timeout: float = 20) -> None:
        assert wait_until(
            lambda: self.health() == (200, {"status": "ok", "consumer": "running"}),
            timeout,
        ), self.log()

    def lines(self, kind: str) -> list[str]:
        return [
            line.split()[1]
            for line in self.marker.read_text().splitlines()
            if line.startswith(kind)
        ]

    def terminate(self, timeout: float = 30) -> tuple[int, float]:
        started = time.monotonic()
        self.process.send_signal(signal.SIGTERM)
        code = self.process.wait(timeout)
        return code, time.monotonic() - started

    def kill(self) -> None:
        self.process.kill()
        self.process.wait(10)

    def log(self) -> str:
        self._log.flush()
        return self.log_path.read_text()

    def close(self) -> None:
        if self.process.poll() is None:
            self.kill()
        self._log.close()


@pytest.fixture
def harnesses() -> Iterator[list[Harness]]:
    started: list[Harness] = []
    yield started
    for harness in started:
        harness.close()


def settings_for(
    prefix: str, limits: Limits = FAST, url: str = REDIS_URL
) -> ConsumerSettings:
    return ConsumerSettings(
        environment="test",
        queue_url=QueueUrl(url),
        prefix=prefix,
        concurrency=1,
        mock_enabled=True,
        limits=limits,
    )


# 11. 종료 신호 경쟁 ---------------------------------------------------------------------------


def _output_has(prefix: str, message_id: str) -> bool:
    return job_of(prefix, message_id, queues.OUTPUT_QUEUE) is not None


@pytest.mark.parametrize(
    "moment", ["idle", "fetching", "analyzing", "sending", "receipts"]
)
def test_stop_signal_at_each_moment(
    moment: str, prefix: str, tmp_path: Path, harnesses: list[Harness]
) -> None:
    extra = {
        "idle": {},
        "fetching": {"HARNESS_TARGET": "hang"},
        "analyzing": {"HARNESS_TARGET": "hang", "HARNESS_TOTAL": "60"},
        "sending": {"HARNESS_RESULT_DELAY": "2", "HARNESS_RESULT_SEND": "5"},
        "receipts": {"HARNESS_RECEIPT_WINDOW": "60"},
    }[moment]
    harness = Harness(tmp_path, prefix, **extra)
    harnesses.append(harness)
    harness.wait_running()
    message = mock_request(new_attempt())
    attempt = message["attemptId"]
    result_id = queues.result_message_id("MOCK", attempt)
    if moment != "idle":
        asyncio.run(add_request(prefix, message))
    if moment == "analyzing":
        assert wait_until(lambda: harness.lines("child") == [attempt], 10)
    if moment == "sending":
        # 결과를 넣기 시작한 뒤(넣기 직전 표식)에 종료 신호를 준다.
        assert wait_until(lambda: harness.lines("sending") == [attempt], 15)
    if moment == "receipts":
        assert wait_until(lambda: state_of(prefix, attempt) == "completed", 10)

    code, elapsed = harness.terminate()

    assert code == 0, harness.log()
    assert elapsed < FAST.shutdown, harness.log()
    if moment == "idle":
        assert harness.lines("processor") == []
        return
    state, job = asyncio.run(load(prefix, attempt))
    if moment == "fetching":
        # 작업을 넣자마자 종료 신호를 준다. 꺼내는 시점과의 경쟁이라 둘 중 어느 쪽이든 맞다:
        # 꺼내기 전에 멈췄으면 대기로 남고, 꺼낸 뒤라면 새 분석 없이 실패로 기록된다.
        assert state in ("waiting", "failed"), state
        if state == "failed":
            assert job.failedReason == "WORKER_STOPPING"
        assert not _output_has(prefix, result_id)
    elif moment == "analyzing":
        assert state == "failed"
        assert job.failedReason == "WORKER_STOPPING"
        assert job.stacktrace == []
        assert not _output_has(prefix, result_id)
    elif moment == "sending":
        assert state == "completed", harness.log()
        assert job.returnvalue == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
        assert _output_has(prefix, result_id)
    else:
        assert "last=cancelled" in harness.log()
    assert len(harness.lines("child")) <= 1


def test_shutdown_over_budget_kills_itself_with_137(
    prefix: str, tmp_path: Path, harnesses: list[Harness]
) -> None:
    # 결과를 넣다가 종료 예산(시험값 8초)보다 오래 멈추면 스스로 SIGKILL로 끝난다.
    # 컨테이너 종료 코드 137이 되어 교체 절차가 정상 종료로 보지 않는다.
    harness = Harness(
        tmp_path, prefix, HARNESS_RESULT_DELAY="60", HARNESS_RESULT_SEND="120"
    )
    harnesses.append(harness)
    harness.wait_running()
    message = mock_request(new_attempt())
    asyncio.run(add_request(prefix, message))
    assert wait_until(lambda: harness.lines("sending") == [message["attemptId"]], 15)

    code, elapsed = harness.terminate()

    assert code == -signal.SIGKILL, harness.log()
    assert FAST.shutdown - 1 < elapsed < FAST.shutdown + 5
    assert "종료 상한" in harness.log()


# 12. 정체 복구 0회 --------------------------------------------------------------------------


def test_parent_killed_mid_analysis_fails_without_rerun(
    prefix: str, tmp_path: Path, harnesses: list[Harness]
) -> None:
    first = Harness(tmp_path, prefix, HARNESS_TARGET="hang", HARNESS_TOTAL="60")
    harnesses.append(first)
    first.wait_running()
    message = mock_request(new_attempt())
    attempt = message["attemptId"]
    asyncio.run(add_request(prefix, message))
    assert wait_until(lambda: first.lines("child") == [attempt], 10)
    first.kill()

    # 소비자가 없는 동안은 잠금이 끝나도 active로 남는다.
    time.sleep(FAST.lock_duration_ms / 1000 + 1)
    assert state_of(prefix, attempt) == "active"

    second = Harness(tmp_path, prefix)
    harnesses.append(second)
    second.wait_running()
    assert wait_until(lambda: state_of(prefix, attempt) == "failed", 15), second.log()
    job = job_of(prefix, attempt)
    assert "stalled" in job.failedReason
    assert second.lines("processor") == []  # 다시 받은 작업의 처리 함수를 부르지 않았다
    assert second.lines("child") == []


# 13. 잠금 갱신 ---------------------------------------------------------------------------


def test_lock_renewed_while_child_works(
    prefix: str, tmp_path: Path, harnesses: list[Harness]
) -> None:
    harness = Harness(
        tmp_path,
        prefix,
        HARNESS_TARGET="work_for_seconds",
        SLOW_CHILD_SECONDS="6",
        HARNESS_TOTAL="30",
    )
    harnesses.append(harness)
    harness.wait_running()
    first, second = mock_request(new_attempt()), mock_request(new_attempt())
    asyncio.run(add_request(prefix, first))
    asyncio.run(add_request(prefix, second))

    assert wait_until(
        lambda: state_of(prefix, second["attemptId"]) == "completed", 40
    ), harness.log()
    for message in (first, second):
        job = job_of(prefix, message["attemptId"])
        assert job.returnvalue == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
        assert job.stalledCounter == 0
    assert harness.lines("child") == [first["attemptId"], second["attemptId"]]


# 14. Node가 넣은 큐 옵션 -----------------------------------------------------------------


def _node_ready() -> bool:
    return (
        shutil.which("node") is not None and (KIT_DIR / "node_modules/bullmq").is_dir()
    )


def test_node_request_options_read_by_python_and_failure_not_retried(
    prefix: str, tmp_path: Path, harnesses: list[Harness]
) -> None:
    if not _node_ready():
        if os.environ.get("CATCHU_TEST_REQUIRE_NODE") == "1":
            pytest.fail(
                "Node 또는 키트 node_modules가 없다(docs/queue-verification에서 npm ci)"
            )
        pytest.skip("Node·키트 의존성이 없어 건너뜀")
    message = mock_request(new_attempt())
    attempt = message["attemptId"]
    subprocess.run(
        ["node", str(WORKER_DIR / "tests/node_add_request.cjs"), REDIS_URL, prefix],
        input=json.dumps(message),
        text=True,
        check=True,
        timeout=30,
    )
    job = job_of(prefix, attempt)
    assert job.opts["attempts"] == 1
    assert not job.opts.get("backoff")
    assert job.opts["removeOnComplete"] == {"age": 7200}
    assert job.opts["removeOnFail"] == {"age": 7200}
    assert job.opts["stackTraceLimit"] == 0

    harness = Harness(tmp_path, prefix, HARNESS_TARGET="hang", HARNESS_TOTAL="4")
    harnesses.append(harness)
    assert wait_until(lambda: state_of(prefix, attempt) == "failed", 20), harness.log()
    time.sleep(2)
    state, job = asyncio.run(load(prefix, attempt))
    assert state == "failed"
    assert job.failedReason == "TIME_LIMIT_EXCEEDED"
    assert job.attemptsMade == 1
    assert harness.lines("child") == [attempt]


# 15. 보관 정리 --------------------------------------------------------------------------


def test_events_removed_on_completion_and_result_kept_until_read(prefix: str) -> None:
    async def go() -> None:
        output_queue = _queue(prefix, queues.OUTPUT_QUEUE)
        output = BullOutput(output_queue)
        attempt = new_attempt()
        message = mock_request(attempt)
        events = [
            {
                "schemaVersion": "2",
                "messageId": queues.event_message_id("MOCK", attempt, state),
                "requestId": message["requestId"],
                "attemptId": attempt,
                "state": state,
                "observedAt": "2026-10-15T00:00:00Z",
            }
            for state in ("RECEIVED", "RUNNING")
        ]
        result = {
            "messageId": queues.result_message_id("MOCK", attempt),
            "resultId": queues.result_id("MOCK", attempt),
            "requestId": message["requestId"],
            "attemptId": attempt,
        }
        for event in events:
            await output.add(
                queues.EVENT_JOB,
                event,
                {**queues.EVENT_JOB_OPTIONS, "jobId": event["messageId"]},
            )
        await output.add(
            queues.RESULT_JOB,
            result,
            {**queues.RESULT_JOB_OPTIONS, "jobId": result["messageId"]},
        )

        async def e_role(job: Any, token: str) -> Any:
            if job.name != queues.RESULT_JOB:
                return None
            return {
                "schemaVersion": "2",
                "messageId": f"receipt-{job.data['resultId']}",
                "resultId": job.data["resultId"],
                "requestId": job.data["requestId"],
                "attemptId": job.data["attemptId"],
                "disposition": "ACCEPTED",
                "code": "OK",
            }

        e_worker = Worker(
            queues.OUTPUT_QUEUE, e_role, {"connection": REDIS_URL, "prefix": prefix}
        )
        for _ in range(100):
            if await output_queue.getJobState(result["messageId"]) == "completed":
                break
            await asyncio.sleep(0.05)
        late = {
            **events[1],
            "messageId": queues.event_message_id("MOCK", attempt, "UNCERTAIN"),
            "state": "UNCERTAIN",
        }
        await output.add(
            queues.EVENT_JOB,
            late,
            {**queues.EVENT_JOB_OPTIONS, "jobId": late["messageId"]},
        )
        for _ in range(100):
            if await Job.fromId(output_queue, late["messageId"]) is None:
                break
            await asyncio.sleep(0.05)
        await e_worker.close()

        for event in (*events, late):
            assert await Job.fromId(output_queue, event["messageId"]) is None
        kept = await Job.fromId(output_queue, result["messageId"])
        assert kept is not None and kept.finishedOn
        assert kept.returnvalue["disposition"] == "ACCEPTED"

        watcher = ReceiptWatcher(
            BullResultJobs(output_queue), replace(FAST, receipt_window=5)
        )
        record = await watcher.watch({**result, "messageId": result["messageId"]})
        assert record.kind is ReceiptKind.RECEIVED and record.disposition == "ACCEPTED"
        assert await Job.fromId(output_queue, result["messageId"]) is None
        await output_queue.close()

    asyncio.run(go())


# 16. 상태 확인 --------------------------------------------------------------------------


class _Proxy:
    """Redis 앞의 TCP 중계. cut()이면 연결을 모두 끊고 새 연결도 받지 않는다."""

    def __init__(self, host: str, port: int) -> None:
        self.host, self.port = host, port
        self.blocked = False
        self.writers: set[asyncio.StreamWriter] = set()
        self.server: asyncio.base_events.Server | None = None

    async def start(self) -> int:
        self.server = await asyncio.start_server(self._handle, "127.0.0.1", 0)
        port: int = self.server.sockets[0].getsockname()[1]
        return port

    async def _pipe(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            while data := await reader.read(65536):
                writer.write(data)
                await writer.drain()
        except (ConnectionError, OSError):
            pass
        finally:
            writer.close()

    async def _handle(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        if self.blocked:
            writer.close()
            return
        up_reader, up_writer = await asyncio.open_connection(self.host, self.port)
        self.writers |= {writer, up_writer}
        await asyncio.gather(
            self._pipe(reader, up_writer), self._pipe(up_reader, writer)
        )

    def cut(self) -> None:
        self.blocked = True
        for writer in self.writers:
            writer.close()
        self.writers.clear()

    async def close(self) -> None:
        self.cut()
        if self.server is not None:
            self.server.close()


async def _get(port: int) -> tuple[int, dict[str, Any]]:
    def call() -> tuple[int, dict[str, Any]]:
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/health", timeout=2
            ) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    return await asyncio.to_thread(call)


async def _wait_state(service: ConsumerService, state: str, timeout: float) -> None:
    end = time.monotonic() + timeout
    while service.state() != state:
        assert time.monotonic() < end, service.state()
        await asyncio.sleep(0.05)


def test_health_states(prefix: str) -> None:
    from urllib.parse import urlsplit

    target = urlsplit(REDIS_URL)

    async def go() -> None:
        disabled = ConsumerService(
            replace(settings_for(prefix), queue_url=None),
            port=free_port(),
            install_signals=False,
            hard_exit=_no_hard_exit,
        )
        task = asyncio.create_task(disabled.run())
        await _wait_until_serving(disabled)
        assert await _get(disabled.port) == (
            200,
            {"status": "ok", "consumer": "disabled"},
        )
        disabled.request_stop()
        assert await task == 0

        closed_port = free_port()
        starting = ConsumerService(
            settings_for(
                prefix,
                url=f"redis://127.0.0.1:{closed_port}",
                limits=replace(FAST, shutdown=3),
            ),
            port=free_port(),
            install_signals=False,
            hard_exit=_no_hard_exit,
        )
        task = asyncio.create_task(starting.run())
        await _wait_until_serving(starting)
        assert await _get(starting.port) == (
            503,
            {"status": "unavailable", "consumer": "starting"},
        )
        assert starting._run_task is not None
        # 소비 실행 작업이 예상 밖으로 끝나면 정리 순서를 밟아 종료 코드 1로 끝난다
        # (상태 확인만 살아 있으면 compose가 컨테이너를 다시 띄우지 않는다).
        starting._run_task.cancel()
        assert await asyncio.wait_for(task, 10) == 1

        proxy = _Proxy(target.hostname or "127.0.0.1", target.port or 6379)
        proxy_port = await proxy.start()
        running = ConsumerService(
            settings_for(prefix, url=f"redis://127.0.0.1:{proxy_port}"),
            port=free_port(),
            install_signals=False,
            worker_options={"runRetryDelay": 200},
            hard_exit=_no_hard_exit,
        )
        task = asyncio.create_task(running.run())
        await _wait_state(running, "running", 10)
        assert await _get(running.port) == (
            200,
            {"status": "ok", "consumer": "running"},
        )
        proxy.cut()  # 큐 서버에 못 붙는 동안에도 정상으로 답한다
        for _ in range(10):
            await asyncio.sleep(0.2)
            assert await _get(running.port) == (
                200,
                {"status": "ok", "consumer": "running"},
            )
        proxy.blocked = False
        running.request_stop()
        await task
        await proxy.close()

        # 종료 중: SIGTERM을 무시하는 자식을 끝내는 동안 503으로 답한다.
        stopping = ConsumerService(
            settings_for(prefix, limits=replace(FAST, total=60)),
            port=free_port(),
            install_signals=False,
            child_target=consumer_children.hang_ignoring_sigterm,
            hard_exit=_no_hard_exit,
        )
        task = asyncio.create_task(stopping.run())
        await _wait_state(stopping, "running", 10)
        message = mock_request(new_attempt())
        await add_request(prefix, message)
        while stopping.processor is None or stopping.processor.spawned == 0:
            await asyncio.sleep(0.05)
        stopping.request_stop()
        await _wait_state(stopping, "stopping", 5)
        assert await _get(stopping.port) == (
            503,
            {"status": "unavailable", "consumer": "stopping"},
        )
        assert await task == 0
        state, job = await load(prefix, message["attemptId"])
        assert (state, job.failedReason) == ("failed", "WORKER_STOPPING")

    asyncio.run(go())


def _no_hard_exit(code: int) -> NoReturn:
    raise AssertionError(f"종료 상한을 넘겨 강제 종료하려 함: {code}")


async def _wait_until_serving(service: ConsumerService) -> None:
    for _ in range(100):
        if service.server is not None and service.server.started:
            return
        await asyncio.sleep(0.05)
    raise AssertionError("상태 확인 서버가 뜨지 않음")


# 17. 실패 사유 --------------------------------------------------------------------------


def test_failed_reason_is_fixed_code_without_stacktrace(prefix: str) -> None:
    async def go() -> None:
        service = ConsumerService(
            settings_for(prefix, limits=replace(FAST, total=1.5)),
            port=free_port(),
            install_signals=False,
            child_target=consumer_children.hang,
            hard_exit=_no_hard_exit,
        )
        task = asyncio.create_task(service.run())
        await _wait_state(service, "running", 10)
        timed_out = mock_request(new_attempt())
        mismatched = mock_request(new_attempt())
        # 요청 작업 옵션에 stackTraceLimit가 빠져도 처리 함수가 저장하지 않게 한다.
        bare = {"attempts": 1}
        await add_request(prefix, timed_out, bare)
        queue = _queue(prefix)
        await queue.add("Request", mismatched, {"jobId": new_attempt(), **bare})
        for _ in range(200):
            jobs = await queue.getJobs(["failed"])
            if len(jobs) == 2:
                break
            await asyncio.sleep(0.05)
        reasons = sorted(job.failedReason for job in await queue.getJobs(["failed"]))
        stacks = [job.stacktrace for job in await queue.getJobs(["failed"])]
        await queue.close()
        service.request_stop()
        await task

        assert reasons == ["REQUEST_JOB_INVALID", "TIME_LIMIT_EXCEEDED"]
        assert stacks == [[], []]

    asyncio.run(go())
