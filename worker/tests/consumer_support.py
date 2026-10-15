"""큐 소비자 시험 도구: 가짜 작업·가짜 출력 큐, 짧은 상한, 합성 요청, 실제 Redis 시험 준비."""

import asyncio
import os
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from typing import Any

import pytest

from app.consumer.receipts import ResultJobView
from app.consumer.settings import ChildSettings, Limits
from app.processing import synthetic_accepted_context, synthetic_request

# 실제 Redis 시험(계획의 ㉣). 값이 있으면 반드시 돌고(CI), 없으면 건너뛴다(로컬).
REDIS_URL = os.environ.get("CATCHU_TEST_REDIS_URL", "")
requires_redis = pytest.mark.skipif(
    not REDIS_URL, reason="CATCHU_TEST_REDIS_URL이 없어 실제 Redis 시험을 건너뜀"
)

# 정상 처리의 자식 띄우기가 느린 CI에서도 상한에 걸리지 않게 총 상한은 넉넉히 둔다.
FAST = Limits(
    total=15,
    child_grace=2,
    parent_watch_interval=0.2,
    event_send=0.5,
    result_send=0.5,
    receipt_poll_once=0.3,
    receipt_interval=0.05,
    receipt_window=0.5,
    receipt_remove=0.3,
    child_exit_wait=1,
    terminate_wait=1,
    kill_wait=1,
    pause=0.5,
    shutdown=8,
    lock_duration_ms=2000,
    stalled_interval_ms=1000,
)


def child_settings(
    *,
    mock_enabled: bool = True,
    scenario: str = "succeeded-one-candidate",
    limits: Limits = FAST,
) -> ChildSettings:
    return ChildSettings(
        environment="test",
        mock_enabled=mock_enabled,
        mock_scenario=scenario,
        limits=limits,
    )


def mock_request(attempt_id: str | None = None) -> dict[str, Any]:
    """두 참조가 시도 ID인 합성 MOCK 요청. attempt_id를 주면 시도 ID와 참조를 함께 바꾼다."""
    accepted = synthetic_accepted_context()
    if attempt_id is not None:
        accepted = replace(
            accepted, attempt_id=attempt_id, selection_reference=attempt_id
        )
    return synthetic_request(accepted)


def new_attempt() -> str:
    return str(uuid.uuid4())


@dataclass
class FakeJob:
    id: Any
    data: Any
    name: Any = "Request"
    opts: dict[str, Any] = field(default_factory=lambda: {"attempts": 1})


def request_job(message: dict[str, Any] | None = None) -> FakeJob:
    message = message or mock_request(new_attempt())
    return FakeJob(id=message["attemptId"], data=message)


@dataclass
class Added:
    name: str
    data: dict[str, Any]
    opts: dict[str, Any]


class FakeOutput:
    """넣은 작업을 기록한다. hang_on이 이름과 같으면 그 작업을 넣다가 멈춘다."""

    def __init__(self, hang_on: str | None = None, fail_on: str | None = None) -> None:
        self.added: list[Added] = []
        self.attempts: list[str] = []
        self.hang_on = hang_on
        self.fail_on = fail_on

    async def add(self, name: str, data: dict[str, Any], opts: dict[str, Any]) -> Any:
        self.attempts.append(name)
        if name == self.hang_on:
            await asyncio.sleep(3600)
        if name == self.fail_on:
            raise ConnectionError("가짜 큐 연결 오류 redis://:secret@host")
        self.added.append(Added(name, data, opts))
        return data.get("messageId")


class FakeResultJobs:
    """결과 작업 조회 대역. views는 조회 회차마다 돌려줄 값(마지막 값을 계속 쓴다)."""

    def __init__(
        self,
        views: list[ResultJobView | None | Exception] | None = None,
        remove_error: Exception | None = None,
    ) -> None:
        self.views = views or [None]
        self.loads = 0
        self.removed: list[str] = []
        self.remove_error = remove_error

    async def load(self, job_id: str) -> ResultJobView | None:
        view = self.views[min(self.loads, len(self.views) - 1)]
        self.loads += 1
        if isinstance(view, Exception):
            raise view
        return view

    async def remove(self, job_id: str) -> None:
        if self.remove_error is not None:
            raise self.remove_error
        self.removed.append(job_id)


@contextmanager
def env(values: dict[str, str]) -> Iterator[None]:
    saved = {key: os.environ.get(key) for key in values}
    os.environ.update(values)
    try:
        yield
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def wait_until(
    condition: Callable[[], bool], timeout: float, step: float = 0.05
) -> bool:
    import time

    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if condition():
            return True
        time.sleep(step)
    return condition()


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    # 좀비(회수 전)는 끝난 것으로 본다.
    try:
        with open(f"/proc/{pid}/stat", encoding="ascii") as stat:
            return stat.read().split()[2] != "Z"
    except OSError:
        import subprocess

        state = subprocess.run(
            ["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True
        ).stdout.strip()
        return bool(state) and not state.startswith("Z")
