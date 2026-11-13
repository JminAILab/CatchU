"""PDF 추출 Worker의 서비스 연결(계획 7.2)과 분석 Worker와의 독립 기동(W-10, BR3.7).

앞 절은 Redis 없이 돈다: 환경 설정이 `ConsumerSettings.pdf`로 이어지는지, 소비자를 끈 환경과 큐 서버에 아직
붙지 못한 환경에서 PDF Worker가 어떻게 만들어지고 끝나는지. 뒤 절(`requires_redis`)은 실제 Redis가 있어야
돈다(`CATCHU_TEST_REDIS_URL`, 없으면 건너뜀): 정상 기동·PDF 결과 전송, 분석 작업이 도는 동안 PDF 추출이
기다리지 않음(W-10), 종료 순서에서 PDF 자식이 멈춰 있을 때의 처리.

PDF 결과 크기 한도(16 MiB) 초과와 내부 통신 손상의 결과 분류는 미결이라 여기서 기대값을 정하지 않는다.
"""

import asyncio
import json
import time
import urllib.error
import urllib.request
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import asynccontextmanager, suppress
from dataclasses import replace
from pathlib import Path
from typing import Any, NoReturn

import consumer_children
import pdf_children
import pytest
import redis.asyncio as redis_asyncio
from bullmq import Job, Queue
from consumer_support import FAST, REDIS_URL, mock_request, new_attempt, requires_redis
from pdf_synthetic import pdf_bytes, pdf_request, place

from app.consumer import queues
from app.consumer.service import ConsumerService
from app.consumer.settings import ConsumerSettings, QueueUrl, SettingsError
from app.pdf_extraction.envelope import is_valid_result
from app.pdf_extraction.settings import LocalSource, PdfLimits, PdfSettings, S3Source

# Windows spawn·커버리지 계측을 감안한 정상 사례의 PDF 자식 시간 제한(test_pdf_consumer.py와 같은 값).
GENEROUS = 60
PDF_JOB_OPTS = {
    "attempts": 1,
    "removeOnComplete": {"age": 7200},
    "removeOnFail": {"age": 7200},
    "stackTraceLimit": 0,
}


def _free_port() -> int:
    import socket

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port: int = sock.getsockname()[1]
        return port


def _no_hard_exit(code: int) -> NoReturn:
    raise AssertionError(f"종료 상한을 넘겨 강제 종료하려 함: {code}")


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


async def _wait_until_serving(service: ConsumerService) -> None:
    for _ in range(200):
        if service.server is not None and service.server.started:
            return
        await asyncio.sleep(0.05)
    raise AssertionError("상태 확인 서버가 뜨지 않음")


async def _wait_state(service: ConsumerService, state: str, timeout: float) -> None:
    end = time.monotonic() + timeout
    while service.state() != state:
        assert time.monotonic() < end, service.state()
        await asyncio.sleep(0.05)


def _pdf_settings(root: Path, child_timeout: float = GENEROUS) -> PdfSettings:
    return PdfSettings(
        source=LocalSource(str(root)),
        limits=PdfLimits(child_timeout=child_timeout, child_grace=2),
    )


def _settings(
    prefix: str, pdf: PdfSettings | None, url: str | None = REDIS_URL
) -> ConsumerSettings:
    return ConsumerSettings(
        environment="test",
        queue_url=QueueUrl(url) if url else None,
        prefix=prefix,
        concurrency=1,
        mock_enabled=True,
        limits=FAST,
        pdf=pdf,
    )


# 설정 연결(Redis 없음) -----------------------------------------------------------------


def test_environment_without_pdf_source_has_no_pdf_worker() -> None:
    assert ConsumerSettings.from_environment({"NODE_ENV": "test"}).pdf is None


def test_environment_pdf_source_reaches_consumer_settings(tmp_path: Path) -> None:
    local = ConsumerSettings.from_environment(
        {"NODE_ENV": "test", "PDF_FILE_ROOT": str(tmp_path)}
    ).pdf
    assert local is not None
    assert local.source == LocalSource(str(tmp_path.resolve()))
    assert local.concurrency == 1

    s3 = ConsumerSettings.from_environment(
        {"NODE_ENV": "test", "FILE_STORAGE_S3_BUCKET": "catchu-dev"}
    ).pdf
    assert s3 is not None and s3.source == S3Source("catchu-dev")


def test_environment_invalid_pdf_settings_stop_startup(tmp_path: Path) -> None:
    with pytest.raises(SettingsError):
        ConsumerSettings.from_environment(
            {
                "NODE_ENV": "test",
                "PDF_FILE_ROOT": str(tmp_path),
                "FILE_STORAGE_S3_BUCKET": "catchu-dev",
            }
        )


def test_pdf_settings_do_not_reach_analysis_child(tmp_path: Path) -> None:
    # 분석 자식에 넘기는 설정에는 PDF 읽기 경로가 없다(분석 자식 입력은 그대로).
    settings = _settings("p", _pdf_settings(tmp_path), url=None)
    assert not hasattr(settings.for_child(), "pdf")


# 서비스 생성·종료(Redis 없음) ------------------------------------------------------------


def test_disabled_consumer_does_not_start_pdf_worker(tmp_path: Path) -> None:
    async def go() -> None:
        service = ConsumerService(
            _settings("p", _pdf_settings(tmp_path), url=None),
            port=_free_port(),
            install_signals=False,
            hard_exit=_no_hard_exit,
        )
        async with _running(service) as task:
            await _wait_until_serving(service)
            assert await _get(service.port) == (
                200,
                {"status": "ok", "consumer": "disabled"},
            )
            assert service.pdf_worker is None and service.pdf_processor is None
            service.request_stop()
            assert await asyncio.wait_for(task, 10) == 0

    asyncio.run(go())


def test_pdf_worker_is_separate_and_its_unexpected_end_stops_service(
    tmp_path: Path,
) -> None:
    # 큐 서버에 아직 붙지 못한 상태(닫힌 포트): 두 Worker가 다른 큐·다른 인스턴스로 만들어지고, 둘 다
    # running이 아니므로 starting으로 답한다. PDF Worker 실행 작업이 예상 밖으로 끝나면 분석 Worker와
    # 같은 규칙으로 서비스 종료를 요청한다(종료 코드 1).
    # 닫힌 포트에서 request_stop만 하면 PDF가 없을 때도 close()가 연결 재시도를 기다려 종료 상한에 걸린다
    # (2026-11-10 확인, 기존 동작). 그래서 기존 test_health_states처럼 실행 작업을 끝내 정리 순서를 밟게 한다.
    async def go() -> None:
        service = ConsumerService(
            replace(
                _settings(
                    "p",
                    _pdf_settings(tmp_path),
                    url=f"redis://127.0.0.1:{_free_port()}",
                ),
                limits=replace(FAST, shutdown=3),
            ),
            port=_free_port(),
            install_signals=False,
            hard_exit=_no_hard_exit,
        )
        async with _running(service) as task:
            await _wait_until_serving(service)
            for _ in range(100):
                if service.pdf_worker is not None:
                    break
                await asyncio.sleep(0.05)
            assert service.worker is not None and service.pdf_worker is not None
            assert service.worker is not service.pdf_worker
            assert service.worker.name == queues.REQUEST_QUEUE
            assert service.pdf_worker.name == queues.PDF_REQUEST_QUEUE
            assert service.pdf_worker.opts["concurrency"] == 1
            assert service.pdf_processor is not None and service.processor is not None
            assert service.state() == "starting"
            assert await _get(service.port) == (
                503,
                {"status": "unavailable", "consumer": "starting"},
            )
            assert service._pdf_run_task is not None and service._run_task is not None
            service._pdf_run_task.cancel()
            for _ in range(100):
                if service.state() == "stopping":
                    break
                await asyncio.sleep(0.05)
            assert service.state() == "stopping"
            service._run_task.cancel()
            assert await asyncio.wait_for(task, 15) == 1
            assert service.pdf_processor.stopping and service.processor is not None
            assert service.processor.stopping

    asyncio.run(go())


# 실제 Redis --------------------------------------------------------------------------


@pytest.fixture
def prefix() -> Iterator[str]:
    name = f"catchu-test-{uuid.uuid4().hex[:12]}"
    yield name
    if not REDIS_URL:
        return

    async def clean() -> None:
        client = redis_asyncio.from_url(REDIS_URL)
        keys = [key async for key in client.scan_iter(match=f"{name}:*", count=500)]
        if keys:
            await client.delete(*keys)
        await client.aclose()

    asyncio.run(clean())


def _queue(prefix: str, name: str) -> Queue:
    return Queue(name, {"connection": REDIS_URL, "prefix": prefix})


async def _add_pdf(prefix: str, message: dict[str, Any]) -> None:
    queue = _queue(prefix, queues.PDF_REQUEST_QUEUE)
    await queue.add(
        queues.PDF_REQUEST_JOB,
        message,
        {"jobId": message["pdfMaterialId"], **PDF_JOB_OPTS},
    )
    await queue.close()


async def _add_request(prefix: str, message: dict[str, Any]) -> None:
    queue = _queue(prefix, queues.REQUEST_QUEUE)
    await queue.add(
        queues.REQUEST_JOB, message, {"jobId": message["attemptId"], **PDF_JOB_OPTS}
    )
    await queue.close()


async def _job(prefix: str, name: str, job_id: str) -> tuple[str, Any]:
    queue = _queue(prefix, name)
    state = await queue.getJobState(job_id)
    job = await Job.fromId(queue, job_id)
    await queue.close()
    return state, job


async def _wait_job(
    prefix: str, name: str, job_id: str, timeout: float
) -> tuple[str, Any]:
    end = time.monotonic() + timeout
    while True:
        state, job = await _job(prefix, name, job_id)
        if job is not None:
            return state, job
        assert time.monotonic() < end, f"{name}:{job_id} 작업이 생기지 않음"
        await asyncio.sleep(0.1)


async def _until(condition: Callable[[], bool], timeout: float, what: str) -> None:
    end = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < end, f"{what}: {timeout}초 안에 일어나지 않음"
        await asyncio.sleep(0.05)


@asynccontextmanager
async def _running(service: ConsumerService) -> AsyncIterator["asyncio.Task[int]"]:
    """서비스를 띄우고, 시험이 실패해도 종료 요청·대기·취소로 정리한다."""
    task = asyncio.create_task(service.run())
    try:
        yield task
    finally:
        if not task.done():
            service.request_stop()
            try:
                await asyncio.wait_for(asyncio.shield(task), 30)
            except BaseException:
                task.cancel()
                with suppress(BaseException):
                    await task


@requires_redis
def test_service_runs_pdf_worker_and_sends_result(prefix: str, tmp_path: Path) -> None:
    async def go() -> None:
        service = ConsumerService(
            _settings(prefix, _pdf_settings(tmp_path)),
            port=_free_port(),
            install_signals=False,
            hard_exit=_no_hard_exit,
        )
        async with _running(service) as task:
            await _wait_state(service, "running", 20)
            assert await _get(service.port) == (
                200,
                {"status": "ok", "consumer": "running"},
            )

            message = pdf_request()
            place(tmp_path, message, pdf_bytes(["Service page", None]))
            await _add_pdf(prefix, message)
            result_id = queues.pdf_result_message_id(message["pdfMaterialId"])
            _, result = await _wait_job(prefix, queues.OUTPUT_QUEUE, result_id, 60)
            assert result.name == queues.PDF_RESULT_JOB
            assert is_valid_result(result.data)
            assert result.data["outcome"] == "SUCCEEDED"
            assert [page["readable"] for page in result.data["pages"]] == [True, False]
            assert "Service page" in result.data["pages"][0]["text"]

            service.request_stop()
            assert await asyncio.wait_for(task, 30) == 0
        state, request = await _job(
            prefix, queues.PDF_REQUEST_QUEUE, message["pdfMaterialId"]
        )
        assert state == "completed"
        assert request.returnvalue == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}

    asyncio.run(go())


@requires_redis
def test_pdf_extraction_does_not_wait_for_running_analysis(
    prefix: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # W-10(BR3.7): 분석 자식이 일하는 동안 넣은 PDF 작업의 결과가 분석이 끝나기 전에 나온다.
    # 분석 자식은 합성(consumer_children.work_for_seconds: 30초 기다린 뒤 MOCK 처리), PDF는 로컬 뿌리의 합성 PDF.
    monkeypatch.setenv("SLOW_CHILD_SECONDS", "30")

    async def go() -> None:
        service = ConsumerService(
            _settings(prefix, _pdf_settings(tmp_path)),
            port=_free_port(),
            install_signals=False,
            child_target=consumer_children.work_for_seconds,
            hard_exit=_no_hard_exit,
        )
        async with _running(service) as task:
            await _wait_state(service, "running", 20)

            analysis = mock_request(new_attempt())
            await _add_request(prefix, analysis)
            await _until(
                lambda: service.processor is not None and service.processor.spawned > 0,
                20,
                "분석 자식 시작",
            )

            message = pdf_request()
            place(tmp_path, message, pdf_bytes(["Independent page"]))
            await _add_pdf(prefix, message)
            result_id = queues.pdf_result_message_id(message["pdfMaterialId"])
            _, result = await _wait_job(prefix, queues.OUTPUT_QUEUE, result_id, 25)
            assert result.data["outcome"] == "SUCCEEDED"
            assert "Independent page" in result.data["pages"][0]["text"]
            analysis_state, _ = await _job(
                prefix, queues.REQUEST_QUEUE, analysis["attemptId"]
            )
            assert analysis_state == "active"

            service.request_stop()
            assert await asyncio.wait_for(task, 30) == 0

    asyncio.run(go())


@requires_redis
def test_stop_while_pdf_child_hangs_fails_job_without_result(
    prefix: str, tmp_path: Path
) -> None:
    async def go() -> None:
        service = ConsumerService(
            _settings(prefix, _pdf_settings(tmp_path)),
            port=_free_port(),
            install_signals=False,
            pdf_child_target=pdf_children.hang,
            hard_exit=_no_hard_exit,
        )
        message = pdf_request()
        async with _running(service) as task:
            await _wait_state(service, "running", 20)
            place(tmp_path, message, pdf_bytes(["x"]))
            await _add_pdf(prefix, message)
            await _until(
                lambda: (
                    service.pdf_processor is not None
                    and service.pdf_processor.spawned > 0
                ),
                20,
                "PDF 자식 시작",
            )

            service.request_stop()
            assert await asyncio.wait_for(task, 30) == 0
        state, job = await _job(
            prefix, queues.PDF_REQUEST_QUEUE, message["pdfMaterialId"]
        )
        assert (state, job.failedReason) == ("failed", "WORKER_STOPPING")
        result_id = queues.pdf_result_message_id(message["pdfMaterialId"])
        assert (await _job(prefix, queues.OUTPUT_QUEUE, result_id))[1] is None

    asyncio.run(go())


def test_replace_keeps_pdf_settings(tmp_path: Path) -> None:
    # 시험 도구가 쓰는 dataclasses.replace가 pdf 필드를 보존한다(설정 복사 회귀 방지).
    settings = _settings("p", _pdf_settings(tmp_path), url=None)
    assert replace(settings, prefix="q").pdf == settings.pdf
