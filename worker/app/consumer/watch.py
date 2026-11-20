"""큐에서 일을 가져오고 있는지 지켜본다(#603).

BullMQ Worker의 실행 작업은 살아 있는데 큐에서 일을 꺼내 가지 않는 멈춤이 있다. 큐 노드가 조용히
사라져 기다리기 명령이 응답을 받지 못하거나, 다시 붙은 곳이 쓰기를 받지 않는 노드인 경우다. 실행
작업의 상태만으로는 이것을 볼 수 없으므로, 가져오기 시도(`getNextJob`)가 마지막으로 응답을 받은
시각을 남기고 처리 중이 아닌데 그 시각이 오래되면 멈춘 것으로 본다.

가져오기는 일이 없어도 몇 초마다(기다리기 명령의 서버 쪽 상한, 최대 10초) 빈 응답으로 돌아온다.
처리 중에는 가져오지 않으므로(동시 수 1) 처리 중인 시간은 멈춤으로 세지 않는다.

멈춤을 보면 프로세스를 끝내는데, 종료 순서는 모든 큐의 처리 중인 작업을 끊는다. 그래서 한 큐가 멈췄어도
다른 큐에 처리 중인 작업이 있으면 그 작업이 끝날 때까지 미룬다(`stalled_watch`).

미룬 종료는 그 작업이 끝난 직후에 해야 한다. 다른 큐에 일이 밀려 있으면 작업과 작업 사이의 틈이 아주
짧아 주기 확인으로는 맞추지 못한다. 그래서 Worker가 다음 일을 가져오기 직전에 서비스에 한 번 더 묻고
(`hold_fetch`), 끝내는 중이라는 답이면 가져오지 않는다.
"""

import asyncio
import time
from collections.abc import Callable, Sequence
from typing import Any, Protocol

# 가져오기를 붙잡는 동안 BullMQ의 실행 작업이 쉬지 않고 다시 묻지 않게 두는 짧은 쉼(초).
HOLD_SECONDS = 0.1


class _Processor(Protocol):
    @property
    def active(self) -> int: ...


class FetchWatch:
    """Worker 하나의 가져오기 시도를 감싸 마지막 응답 시각을 남긴다."""

    def __init__(
        self,
        worker: Any,
        processor: _Processor,
        clock: Callable[[], float] = time.monotonic,
        hold_fetch: Callable[[], bool] = lambda: False,
    ) -> None:
        self.queue_name: str = worker.name
        self._processor = processor
        self._clock = clock
        self._alive_at = clock()
        fetch = worker.getNextJob

        async def tracked(token: str) -> Any:
            # 다음 일을 가져오기 직전은 작업과 작업 사이의 틈이다. 멈춘 큐 때문에 프로세스를 끝내는
            # 중이면 새 일을 가져오지 않는다. 가져오면 종료 순서가 그 작업을 끊는다.
            if hold_fetch():
                await asyncio.sleep(HOLD_SECONDS)
                return None
            # 예외로 끝난 시도(접속 오류·거부)는 응답으로 세지 않는다.
            job = await fetch(token)
            self._alive_at = self._clock()
            return job

        # 실행 작업은 가져올 때마다 `self.getNextJob`을 부르므로 인스턴스에서 바꿔 끼운다.
        worker.getNextJob = tracked

    @property
    def busy(self) -> bool:
        """이 큐에 처리 중인 작업이 있다."""
        return self._processor.active > 0

    def quiet_seconds(self) -> float:
        """처리 중이 아닌 채로, 가져오기 시도가 응답을 받지 못한 시간."""
        now = self._clock()
        if self.busy:
            self._alive_at = now
        return now - self._alive_at


def stalled_watch(watches: Sequence[FetchWatch], limit: float) -> FetchWatch | None:
    """프로세스를 끝낼 만큼 멈춘 큐의 감시. 어느 큐든 처리 중인 작업이 있으면 없다고 답한다."""
    # 처리 중인 큐의 시각이 갱신되도록 모든 감시에 먼저 묻는다.
    quiet = [(watch.quiet_seconds(), watch) for watch in watches]
    if any(watch.busy for watch in watches):
        return None
    return next((watch for seconds, watch in quiet if seconds >= limit), None)
