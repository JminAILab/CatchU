"""요청 한 건의 호출 수·수집 시간·수집 총량 계산.

시계는 수집 시작 시각 하나를 기준으로 둔다. 개별 호출 대기가 짧아도 총 수집 시간이 넘으면
멈춘다. 상한을 넘은 것은 수집 실패다(정상 0건이나 조회 개수 범위의 한계가 아니다).
"""

from collections.abc import Callable
from datetime import datetime

from app.collection.failures import FailureCode, stop
from app.collection.limits import CollectionLimits


class CollectionBudget:
    def __init__(
        self,
        limits: CollectionLimits,
        *,
        clock: Callable[[], datetime],
        started_at: datetime,
    ) -> None:
        self._limits = limits
        self._clock = clock
        self._deadline = started_at + limits.max_collection_time
        self._calls = 0
        self._received_bytes = 0

    @property
    def calls(self) -> int:
        return self._calls

    @property
    def received_bytes(self) -> int:
        return self._received_bytes

    def start_call(self) -> float:
        """호출 하나를 센다. 남은 수집 시간(초)을 돌려주고, 상한이면 멈춘다."""
        if self._calls >= self._limits.max_calls:
            raise stop(
                FailureCode.BUDGET_EXCEEDED,
                "요청당 GitHub 호출 수 상한에 걸려 수집을 멈췄다",
            )
        remaining = (self._deadline - self._clock()).total_seconds()
        if remaining <= 0:
            raise stop(
                FailureCode.TIME_LIMIT_EXCEEDED,
                "수집 시간 상한에 걸려 수집을 멈췄다",
            )
        self._calls += 1
        return remaining

    def time_exhausted(self) -> bool:
        return self._clock() >= self._deadline

    def raise_if_past_deadline(self) -> None:
        """마감 뒤에 끝난 호출의 응답은 쓰지 않는다(연결 단계가 대기를 늘릴 수 있다)."""
        if self._clock() > self._deadline:
            raise stop(
                FailureCode.TIME_LIMIT_EXCEEDED,
                "수집 시간 상한에 걸려 수집을 멈췄다",
            )

    def add_received(self, size: int) -> None:
        self._received_bytes += size
        if self._received_bytes > self._limits.max_total_bytes:
            raise stop(
                FailureCode.BUDGET_EXCEEDED,
                "요청당 수집 총량 상한에 걸려 수집을 멈췄다",
            )
