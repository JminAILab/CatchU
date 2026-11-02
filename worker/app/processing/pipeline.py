"""요청 한 건의 처리 경계: 요청 검사 → 진행 알림 → 생성 → 결과 조합.

실제 요청 수신·전송·결과 보존과 실제 수집·생성 모듈은 이 함수에 연결한다. 이 함수는
메시지를 보내거나 저장하지 않고, 진행 알림은 emit에 넘기고 결과는 돌려준다.
"""

import json
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from app.contract import Verdict, check_message
from app.processing.generation import ExecutionUnknown, Generator
from app.processing.request_check import (
    AcceptedContext,
    CheckedRequest,
    Rejected,
    RejectReason,
    UnverifiedRequest,
    check_request,
)
from app.processing.result import compose_result, compose_unresolved_result, rfc3339

logger = logging.getLogger(__name__)

EventState = Literal["RECEIVED", "RUNNING", "UNCERTAIN"]
Emit = Callable[[dict[str, Any]], None]
Clock = Callable[[], datetime]


@dataclass(frozen=True)
class Finished:
    """생성을 마치고 종결 결과를 만들었다.

    실제 분석 성공, E 수신, Catch 등록·열람 준비 완료를 뜻하지 않는다.
    """

    result: dict[str, Any]


@dataclass(frozen=True)
class Uncertain:
    """실행 여부나 결과를 확인하지 못했다. 실패로 확정하지 않고 결과를 만들지 않는다."""


ProcessingOutcome = Rejected | Finished | Uncertain


class ContractViolation(ValueError):
    """만든 메시지가 현행 스키마 v2에 맞지 않는다. 보내지 않는다."""


def _require_valid(schema_name: str, message: dict[str, Any]) -> None:
    checked = check_message(schema_name, message)
    if checked.verdict is not Verdict.VALID:
        places = ", ".join(f"{e.path or '/'}:{e.keyword}" for e in checked.errors)
        raise ContractViolation(f"{schema_name} 스키마 v2 위반: {places}")


def _event(
    request: CheckedRequest, state: EventState, observed_at: datetime, id_label: str
) -> dict[str, Any]:
    event = {
        "schemaVersion": "2",
        "messageId": f"event-{id_label}-{request.attempt_id}-{state.lower()}",
        "requestId": request.request_id,
        "attemptId": request.attempt_id,
        "state": state,
        "observedAt": rfc3339(observed_at),
    }
    _require_valid("ProcessingEvent", event)
    return event


def _reject(rejected: Rejected) -> Rejected:
    # 거부된 요청의 식별자는 확인되지 않은 입력이므로 사유와 위치만 남긴다.
    places = rejected.fields or tuple(
        f"{e.path or '/'}:{e.keyword}" for e in rejected.schema_errors
    )
    logger.warning("요청을 처리 전에 거부함: reason=%s at=%s", rejected.reason, places)
    return rejected


def process_request(
    message: object,
    *,
    accepted: AcceptedContext | None,
    generator: Generator,
    emit: Emit,
    clock: Clock,
    id_label: str,
) -> ProcessingOutcome:
    """요청을 검사하고, 통과하면 생성기를 한 번만 불러 종결 결과를 만든다.

    - 검사를 통과하지 못하면 진행 알림도 생성도 없이 Rejected를 돌려준다.
    - 생성기의 sourceMode가 요청과 다르면 거부한다. 가짜 생성기는 LIVE 요청에 답하지 않는다.
    - 생성기가 실행 여부를 확인하지 못하거나 시간이 초과되면 UNCERTAIN만 알리고
      Uncertain을 돌려준다. 실패로 확정하거나 다시 생성하지 않는다.
    - 그 밖의 예외는 결과로 바꾸지 않고 그대로 올린다.
    """
    checked = check_request(message, accepted)
    if isinstance(checked, Rejected):
        return _reject(checked)
    if checked.source_mode != generator.source_mode:
        return _reject(Rejected(RejectReason.CONTEXT_MISMATCH, ("/sourceMode",)))

    emit(_event(checked, "RECEIVED", clock(), id_label))
    started_at = clock()
    emit(_event(checked, "RUNNING", started_at, id_label))
    logger.info(
        "생성 시작: requestId=%s attemptId=%s sourceMode=%s",
        checked.request_id,
        checked.attempt_id,
        checked.source_mode,
    )
    try:
        output = generator.generate(checked)
    except (ExecutionUnknown, TimeoutError):
        emit(_event(checked, "UNCERTAIN", clock(), id_label))
        logger.warning(
            "실행 불명: requestId=%s attemptId=%s",
            checked.request_id,
            checked.attempt_id,
        )
        return Uncertain()

    finished_at = clock()
    result = compose_result(checked, output, finished_at=finished_at, id_label=id_label)
    _require_valid("Result", result)
    logger.info(
        "종결 결과 생성: requestId=%s attemptId=%s outcome=%s sourceMode=%s "
        "candidates=%d ownCommitObservation=%s observedOwnCommitCount=%s "
        "collectionLimitCount=%d resultBytes=%d elapsedSeconds=%.3f",
        checked.request_id,
        checked.attempt_id,
        result["outcome"],
        result["sourceMode"],
        len(output.candidates),
        output.own_commit_observation,
        output.observed_own_commit_count,
        len(output.collection_limit_notes),
        len(json.dumps(result, ensure_ascii=False).encode("utf-8")),
        max(0, (finished_at - started_at).total_seconds()),
    )
    return Finished(result)


def finish_unresolved(
    message: Mapping[str, Any],
    *,
    code: str,
    text: str,
    clock: Clock,
    id_label: str,
) -> Finished:
    """요청 정보 조회가 모름·실패인 요청을 수집 없이, 진행 알림 없이 FAILED 결과 하나로 끝낸다(#121).

    message는 스키마 v2와 조회 전 자체 검사를 통과한 값이다. 접수 기록과 대조하지 못했으므로
    `CheckedRequest`를 만들지 않는다. 결과를 받아들일지는 맥락 값을 접수 기록과 대조하는 E가 정한다.
    """
    request = UnverifiedRequest.from_message(message)
    result = compose_unresolved_result(
        request, code=code, message=text, finished_at=clock(), id_label=id_label
    )
    _require_valid("Result", result)
    # 메시지의 식별자는 대조하지 않은 값이라 로그에 싣지 않는다(큐 소비자 자식은 줄마다 작업 ID를 붙인다).
    logger.info(
        "종결 결과 생성(조회 모름·실패, 진행 알림 없음): outcome=%s code=%s sourceMode=%s",
        result["outcome"],
        code,
        result["sourceMode"],
    )
    return Finished(result)
