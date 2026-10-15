"""큐 소비자 시험용 별도 프로세스. 시험이 SIGTERM·SIGKILL을 실제로 보내 볼 때 쓴다.

orphan   멈추는 자식 하나를 띄우고 `<자식 PID> <자원 추적기 PID>`를 출력한 뒤 기다린다.
service  짧은 상한으로 소비자 서비스를 띄운다. 환경변수:
         CATCHU_TEST_REDIS_URL, HARNESS_PREFIX, HARNESS_PORT, HARNESS_TARGET(consumer_children의
         함수 이름 또는 child_main), HARNESS_MARKER(처리 함수 호출·자식 시작을 한 줄씩 적는 파일),
         HARNESS_RESULT_DELAY(결과를 넣기 전 기다릴 초), HARNESS_RESULT_SEND, HARNESS_TOTAL,
         HARNESS_RECEIPT_WINDOW
"""

import asyncio
import json
import os
import sys
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import consumer_children  # noqa: E402
from consumer_support import (  # noqa: E402
    FAST,
    child_settings,
    mock_request,
    new_attempt,
)

from app.consumer.child import ChildInput  # noqa: E402
from app.consumer.children import ChildRun  # noqa: E402
from app.consumer.parent import OutputQueue, RequestProcessor  # noqa: E402
from app.consumer.service import ConsumerService  # noqa: E402
from app.consumer.settings import ConsumerSettings, QueueUrl  # noqa: E402


async def orphan() -> None:
    from multiprocessing import resource_tracker

    settings = child_settings(limits=replace(FAST, total=600))
    child_input = ChildInput(
        job_id=new_attempt(),
        job_data=json.dumps(mock_request()),
        picked_at=datetime.now(UTC).isoformat(),
        settings=settings,
        parent_pid=os.getpid(),
    )
    run = await ChildRun.start(
        consumer_children.hang, child_input, FAST.frame_max_bytes
    )
    tracker = getattr(resource_tracker._resource_tracker, "_pid", None) or 0
    print(run.pid, tracker, flush=True)
    await asyncio.sleep(3600)


class _DelayedOutput:
    def __init__(self, inner: OutputQueue, delay: float) -> None:
        self._inner = inner
        self._delay = delay

    async def add(self, name: str, data: dict[str, Any], opts: dict[str, Any]) -> Any:
        if name == "Result":
            await asyncio.sleep(self._delay)
        return await self._inner.add(name, data, opts)


def _trace_processor(marker: Path) -> None:
    original = RequestProcessor.__call__

    async def traced(self: RequestProcessor, job: Any, token: str) -> dict[str, str]:
        with marker.open("a", encoding="utf-8") as stream:
            stream.write(f"processor {job.id}\n")
        return await original(self, job, token)

    RequestProcessor.__call__ = traced  # type: ignore[method-assign]


async def service() -> int:
    marker = Path(os.environ["HARNESS_MARKER"])
    _trace_processor(marker)
    limits = replace(
        FAST,
        total=float(os.environ.get("HARNESS_TOTAL", FAST.total)),
        result_send=float(os.environ.get("HARNESS_RESULT_SEND", FAST.result_send)),
        receipt_window=float(
            os.environ.get("HARNESS_RECEIPT_WINDOW", FAST.receipt_window)
        ),
    )
    settings = ConsumerSettings(
        environment="test",
        queue_url=QueueUrl(os.environ["CATCHU_TEST_REDIS_URL"]),
        prefix=os.environ["HARNESS_PREFIX"],
        concurrency=1,
        mock_enabled=True,
        limits=limits,
    )
    delay = float(os.environ.get("HARNESS_RESULT_DELAY", "0"))
    return await ConsumerService(
        settings,
        host="127.0.0.1",
        port=int(os.environ["HARNESS_PORT"]),
        child_target=consumer_children.marked,
        output_wrapper=(lambda inner: _DelayedOutput(inner, delay))
        if delay
        else (lambda o: o),
    ).run()


def main() -> int:
    import logging

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    if sys.argv[1] == "orphan":
        asyncio.run(orphan())
        return 0
    return asyncio.run(service())


if __name__ == "__main__":
    raise SystemExit(main())
