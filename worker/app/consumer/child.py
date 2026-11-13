"""자식 프로세스 진입점: 작업 하나를 처리하고 프레임을 보낸 뒤 끝난다.

spawn으로 뜨며 부모에게서 순수 자료(작업 ID, 작업 데이터 JSON, 꺼낸 시각, 큐 접속 정보 없는 설정)만
받는다. LIVE 설정(요청 정보 조회·생성 키)은 그 설정 객체로만 받는다. BullMQ·FastAPI·Redis 연결을 불러오지
않는다. 자식은 SIGINT를 무시해 종료 순서를 부모가 쥐고, 부모가 사라졌거나 자기 마감(꺼낸 시각 + 총 상한 +
유예)이 지나면 스스로 끝낸다.
"""

import json
import logging
import os
import signal
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from multiprocessing.connection import Connection
from typing import Any, Final

from app.collection.transport import HttpsTransport
from app.consumer.frames import Frame, encode
from app.consumer.settings import ChildSettings, LiveSettings
from app.generation import GenerationProvider
from app.judgement.provider import JudgementProvider
from app.processing.live import LiveAssembly
from app.processing.pipeline import Finished, Uncertain
from app.processing.runner import Refused, run_request
from app.request_context import RequestContextClient

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


def live_assembly(settings: ChildSettings) -> LiveAssembly | None:
    """기동 때 검사한 설정으로 LIVE 부품을 만든다. 설정이 없으면(개발·시험) None이다.

    생성 제공자(Claude API)와 판정 공급자(CR3)는 후보가 있을 때 한 번 만든다. SDK도 그때 불러와 MOCK·후보 없는
    요청의 자식 기동을 늦추지 않는다. 키는 SDK 환경변수가 아니라 설정 객체로 넘긴다. AI 쪽이 꺼졌으면(공급자
    openai에 판정 키 없음) 판정 공급자를 넘기지 않는다(BR1.1).
    """
    live = settings.live
    if live is None:
        return None
    key = live.generation_key

    def claude() -> GenerationProvider:
        from app.generation.claude import ClaudeProvider

        return ClaudeProvider(key)

    return LiveAssembly(
        context_client=RequestContextClient(live.context_api),
        open_transport=HttpsTransport,
        provider_factory=claude,
        generation_budget=timedelta(
            seconds=settings.limits.total - settings.limits.generation_margin
        ),
        judge_factory=_judge_factory(live),
    )


def _judge_factory(live: LiveSettings) -> Callable[[], JudgementProvider] | None:
    """공급자와 키로 판정 공급자 만들기를 정한다. claude면 생성 키로, openai면 판정 키가 있을 때만."""
    if live.judgement_provider == "claude":
        generation_key = live.generation_key

        def claude_judge() -> JudgementProvider:
            from app.judgement.claude import ClaudeJudge

            return ClaudeJudge(generation_key)

        return claude_judge
    judgement_key = live.judgement_key
    if judgement_key is None:
        return None

    def openai_judge() -> JudgementProvider:
        from app.judgement.openai_judge import OpenAIJudge

        return OpenAIJudge(judgement_key)

    return openai_judge


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
            picked_at=datetime.fromisoformat(child_input.picked_at).astimezone(UTC),
            mock_enabled=settings.mock_enabled,
            mock_scenario=settings.mock_scenario,
            live=live_assembly(settings),
            emit=emit,
            clock=lambda: datetime.now(UTC),
        )
        payload = encode(_terminal(outcome))
    except Exception as error:  # 결함: 예외 종류 이름만 넘긴다(원문·값은 넘기지 않는다)
        logger.error("자식 처리 중 결함: %s", type(error).__name__)
        payload = encode(Frame("defect", error_type=type(error).__name__))
    conn.send_bytes(payload)
    conn.close()
