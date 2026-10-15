"""자식 프로세스 진입점: 작업 하나를 처리하고 프레임을 보낸 뒤 끝난다.

spawn으로 뜨며 부모에게서 순수 자료(작업 ID, 작업 데이터 JSON, 꺼낸 시각, 비밀값 없는 설정)만
받는다. BullMQ·FastAPI·Redis 연결을 불러오지 않는다. 자식은 SIGINT를 무시해 종료 순서를 부모가
쥐고, 부모가 사라졌거나 자기 마감(꺼낸 시각 + 총 상한 + 유예)이 지나면 스스로 끝낸다.
"""

import json
import logging
import os
import signal
import sys
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from multiprocessing.connection import Connection
from typing import Any, Final

from app.consumer.frames import Frame, encode
from app.consumer.settings import ChildSettings
from app.processing.pipeline import Finished, Uncertain
from app.processing.runner import Refused, run_request

EXIT_PARENT_GONE: Final = 70
EXIT_SELF_DEADLINE: Final = 71

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ChildInput:
    """자식에 넘기는 값. 작업 데이터는 JSON 문자열로 넘긴다(큐·Redis 객체 없음)."""

    job_id: str
    job_data: str
    picked_at: str  # 부모가 작업을 받은 순간의 UTC 시각(RFC 3339)
    settings: ChildSettings
    # 자식이 뜨는 사이 부모가 죽으면 자식이 처음 읽는 부모 PID가 이미 바뀌어 있으므로 부모가 넘긴다.
    parent_pid: int


class _AttemptFilter(logging.Filter):
    def __init__(self, attempt_id: str) -> None:
        super().__init__()
        self.attempt_id = attempt_id

    def filter(self, record: logging.LogRecord) -> bool:
        record.attempt_id = self.attempt_id
        return True


def _configure_logging(attempt_id: str) -> None:
    # 자식 하나가 작업 하나라서 모든 로그 줄에 시도 ID를 붙여 요청과 잇는다.
    handler = logging.StreamHandler(sys.stderr)
    handler.addFilter(_AttemptFilter(attempt_id))
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s attemptId=%(attempt_id)s %(message)s"
        )
    )
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)


def _watch(parent_pid: int, deadline: float, interval: float) -> None:
    while True:
        if os.getppid() != parent_pid:
            # 부모가 죽었다. 분석을 이어 가며 비용을 더 쓰지 않는다.
            logger.error("부모 프로세스가 사라져 자식을 끝냄")
            os._exit(EXIT_PARENT_GONE)
        if time.time() >= deadline:
            logger.error("자식 자기 마감을 넘겨 끝냄")
            os._exit(EXIT_SELF_DEADLINE)
        time.sleep(interval)


def start_watchdog(child_input: ChildInput) -> None:
    limits = child_input.settings.limits
    picked_at = datetime.fromisoformat(child_input.picked_at).astimezone(UTC)
    deadline = picked_at + timedelta(seconds=limits.total + limits.child_grace)
    thread = threading.Thread(
        target=_watch,
        args=(
            child_input.parent_pid,
            deadline.timestamp(),
            limits.parent_watch_interval,
        ),
        name="parent-watch",
        daemon=True,
    )
    thread.start()


def _terminal(outcome: Refused | Finished | Uncertain) -> Frame:
    if isinstance(outcome, Refused):
        return Frame("rejected", reason=outcome.reason.value, fields=outcome.fields)
    if isinstance(outcome, Finished):
        return Frame("result", message=outcome.result)
    return Frame("uncertain")


def child_main(conn: Connection, child_input: ChildInput) -> None:
    """spawn 자식의 대상 함수. 종결 프레임 하나를 보내고 돌아오면 프로세스가 끝난다."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    start_watchdog(child_input)
    _configure_logging(child_input.job_id)

    def emit(event: dict[str, Any]) -> None:
        conn.send_bytes(encode(Frame("event", message=event)))

    settings = child_input.settings
    try:
        outcome = run_request(
            json.loads(child_input.job_data),
            job_id=child_input.job_id,
            mock_enabled=settings.mock_enabled,
            mock_scenario=settings.mock_scenario,
            emit=emit,
            clock=lambda: datetime.now(UTC),
        )
        payload = encode(_terminal(outcome))
    except Exception as error:  # 결함: 예외 종류 이름만 넘긴다(원문·값은 넘기지 않는다)
        logger.error("자식 처리 중 결함: %s", type(error).__name__)
        payload = encode(Frame("defect", error_type=type(error).__name__))
    conn.send_bytes(payload)
    conn.close()
