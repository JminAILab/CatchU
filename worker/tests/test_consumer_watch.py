"""큐에서 일을 가져오고 있는지 보는 감시(#603). 실제 큐와 이은 확인은 test_consumer_redis.py에 있다."""

import asyncio
from typing import Any

import pytest

from app.consumer.watch import FetchWatch, stalled_watch


class _Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


class _Worker:
    """BullMQ Worker의 가져오기 면만 흉내 낸다."""

    def __init__(self, name: str = "analysis-requests") -> None:
        self.name = name
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


def test_stalled_queue_waits_for_work_in_progress_on_another_queue() -> None:
    """프로세스를 끝내면 모든 큐의 처리 중인 작업이 끊기므로, 다른 큐의 작업이 끝날 때까지 미룬다."""
    clock = _Clock()
    analysis, pdf = _Processor(), _Processor()
    watches = [
        FetchWatch(_Worker(), analysis, clock),
        FetchWatch(_Worker("pdf-extraction-requests"), pdf, clock),
    ]

    analysis.active = 1  # 분석은 처리 중이고, PDF 큐는 가져오기가 응답을 받지 못한다
    clock.now += 400
    assert stalled_watch(watches, 300) is None
    analysis.active = 0  # 분석이 끝나면 멈춘 큐를 이유로 끝낸다
    stalled = stalled_watch(watches, 300)
    assert stalled is not None
    assert stalled.queue_name == "pdf-extraction-requests"


def test_fetch_is_held_while_the_process_is_ending_for_a_stall() -> None:
    """끝내는 중이라는 답이면 다음 일을 가져오지 않는다. 가져오면 종료 순서가 그 작업을 끊는다."""
    worker, clock = _Worker(), _Clock()
    answers = iter([False, True])
    watch = FetchWatch(worker, _Processor(), clock, hold_fetch=lambda: next(answers))

    assert asyncio.run(worker.getNextJob("token-1")) is None
    assert worker.calls == ["token-1"]
    clock.now += 7
    # 붙잡힌 시도는 큐에 묻지 않으며, 응답을 받은 것으로 세지도 않는다.
    assert asyncio.run(worker.getNextJob("token-2")) is None
    assert worker.calls == ["token-1"]
    assert watch.quiet_seconds() == 7


def test_no_queue_is_stalled_below_the_limit() -> None:
    clock = _Clock()
    watches = [FetchWatch(_Worker(), _Processor(), clock)]

    clock.now += 299
    assert stalled_watch(watches, 300) is None
    clock.now += 1
    assert stalled_watch(watches, 300) is watches[0]
