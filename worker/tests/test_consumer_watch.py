"""큐에서 일을 가져오고 있는지 보는 감시(#603). 실제 큐와 이은 확인은 test_consumer_redis.py에 있다."""

import asyncio
from typing import Any

import pytest

from app.consumer.watch import FetchWatch


class _Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


class _Worker:
    """BullMQ Worker의 가져오기 면만 흉내 낸다."""

    name = "analysis-requests"

    def __init__(self) -> None:
        self.fail = False
        self.calls: list[str] = []

    async def getNextJob(self, token: str) -> Any:  # noqa: N802 (BullMQ 이름)
        self.calls.append(token)
        if self.fail:
            raise ConnectionError("queue down")
        return None


class _Processor:
    active = 0


def _watch() -> tuple[FetchWatch, _Worker, _Processor, _Clock]:
    worker, processor, clock = _Worker(), _Processor(), _Clock()
    return FetchWatch(worker, processor, clock), worker, processor, clock


def test_quiet_time_grows_until_a_fetch_gets_an_answer() -> None:
    watch, worker, _, clock = _watch()
    assert watch.queue_name == "analysis-requests"

    clock.now += 40
    assert watch.quiet_seconds() == 40
    # 일이 없다는 빈 응답도 응답이다. 실행 작업이 부르는 것은 바꿔 끼운 인스턴스 메서드다.
    assert asyncio.run(worker.getNextJob("token-1")) is None
    assert worker.calls == ["token-1"]
    assert watch.quiet_seconds() == 0
    clock.now += 3
    assert watch.quiet_seconds() == 3


def test_failed_fetch_is_not_an_answer() -> None:
    watch, worker, _, clock = _watch()
    worker.fail = True

    clock.now += 30
    with pytest.raises(ConnectionError):
        asyncio.run(worker.getNextJob("token-1"))
    assert watch.quiet_seconds() == 30


def test_time_spent_processing_is_not_quiet_time() -> None:
    watch, _, processor, clock = _watch()

    processor.active = 1
    clock.now += 3600  # 처리 중에는 가져오지 않는다(동시 수 1)
    assert watch.quiet_seconds() == 0
    processor.active = 0
    # 처리가 끝난 순간부터 다시 센다.
    clock.now += 12
    assert watch.quiet_seconds() == 12
