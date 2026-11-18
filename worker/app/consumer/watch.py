"""큐에서 일을 가져오고 있는지 지켜본다(#603).

BullMQ Worker의 실행 작업은 살아 있는데 큐에서 일을 꺼내 가지 않는 멈춤이 있다. 큐 노드가 조용히
사라져 기다리기 명령이 응답을 받지 못하거나, 다시 붙은 곳이 쓰기를 받지 않는 노드인 경우다. 실행
작업의 상태만으로는 이것을 볼 수 없으므로, 가져오기 시도(`getNextJob`)가 마지막으로 응답을 받은
시각을 남기고 처리 중이 아닌데 그 시각이 오래되면 멈춘 것으로 본다.

가져오기는 일이 없어도 몇 초마다(기다리기 명령의 서버 쪽 상한, 최대 10초) 빈 응답으로 돌아온다.
처리 중에는 가져오지 않으므로(동시 수 1) 처리 중인 시간은 멈춤으로 세지 않는다.
"""

import time
from collections.abc import Callable
from typing import Any, Protocol


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
    ) -> None:
        self.queue_name: str = worker.name
        self._processor = processor
        self._clock = clock
        self._alive_at = clock()
        fetch = worker.getNextJob

        async def tracked(token: str) -> Any:
            # 예외로 끝난 시도(접속 오류·거부)는 응답으로 세지 않는다.
            job = await fetch(token)
            self._alive_at = self._clock()
            return job

        # 실행 작업은 가져올 때마다 `self.getNextJob`을 부르므로 인스턴스에서 바꿔 끼운다.
        worker.getNextJob = tracked

    def quiet_seconds(self) -> float:
        """처리 중이 아닌 채로, 가져오기 시도가 응답을 받지 못한 시간."""
        now = self._clock()
        if self._processor.active > 0:
            self._alive_at = now
        return now - self._alive_at
