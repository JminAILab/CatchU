"""큐 소비자의 자식 프로세스가 부르는 요청 처리(#121).

조회 전 자체 검사를 거친 뒤 두 갈래다.

- MOCK: 개발·시험 설정에서만 요청 정보 조회 없이 `process_request`와 가짜 생성기로 처리한다.
- LIVE: 요청 정보를 한 번 조회한다. 찾으면 그 접수 기록으로 `process_request`가 요청을 대조하고(다르면 거부)
  실제 수집·후보·생성(`LiveGenerator`)을 부른다. 모름·실패면 수집 없이, 진행 알림 없이 FAILED 결과 하나로
  끝낸다(10/15 팀장 결정 질문 1·3).

메시지를 보내거나 저장하지 않으며, 진행 알림은 emit에 넘기고 종결은 돌려준다. 큐·BullMQ를 불러오지 않는다.
"""

import logging
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from app.contract import SchemaError, Verdict, check_message
from app.processing.fake_generator import FakeGenerator
from app.processing.live import LiveAssembly, LiveGenerator
from app.processing.pipeline import (
    Clock,
    Emit,
    Finished,
    Uncertain,
    finish_unresolved,
    process_request,
)
from app.processing.request_check import AcceptedContext, Rejected
from app.request_context import (
    FAILURE_MESSAGES,
    ContextFound,
    ContextLookupFailed,
    ContextUnknown,
)

logger = logging.getLogger(__name__)

_UUID_HEX = frozenset("0123456789abcdefABCDEF")


class RefusalReason(StrEnum):
    """처리 전 거부 사유. 큐 작업 반환값과 로그에만 쓰고 api로 보내지 않는다."""

    SCHEMA_INVALID = "SCHEMA_INVALID"
    SELF_CHECK_FAILED = "SELF_CHECK_FAILED"
    CONTEXT_MISMATCH = "CONTEXT_MISMATCH"
    STALE_ATTEMPT = "STALE_ATTEMPT"
    MOCK_NOT_ACCEPTED = "MOCK_NOT_ACCEPTED"
    # 개발·시험에서 LIVE 설정(요청 정보 조회·생성 키)을 넣지 않았다. 운영은 설정이 없으면 기동하지 않는다.
    LIVE_NOT_CONFIGURED = "LIVE_NOT_CONFIGURED"


@dataclass(frozen=True)
class Refused:
    """처리 전 거부. 사유와 어긋난 위치(JSON Pointer)만 담고 요청 값은 담지 않는다."""

    reason: RefusalReason
    fields: tuple[str, ...] = ()


RunOutcome = Refused | Finished | Uncertain


def _is_uuid(value: object) -> bool:
    if not isinstance(value, str) or len(value) != 36:
        return False
    groups = value.split("-")
    return [len(group) for group in groups] == [8, 4, 4, 4, 12] and all(
        set(group) <= _UUID_HEX for group in groups
    )


def _schema_places(errors: tuple[SchemaError, ...]) -> tuple[str, ...]:
    return tuple(f"{error.path or '/'}:{error.keyword}" for error in errors)


def self_check(message: Mapping[str, Any], job_id: str) -> tuple[str, ...]:
    """메시지 안에서 서로 비교할 수 있는 항목을 조회 전에 본다. 어긋난 위치를 돌려준다.

    스키마 v1을 통과한 메시지에만 부른다. 두 참조는 시도 ID와 같아야 한다(10/15 결정 1의 비교
    규칙), 허용 범위의 저장소 ID는 요청의 저장소 ID와 같아야 한다.
    """
    attempt_id = message["attemptId"]
    scope = message["allowedScope"]
    checks: tuple[tuple[str, bool], ...] = (
        ("/requestId", _is_uuid(message["requestId"])),
        ("/attemptId", _is_uuid(attempt_id) and attempt_id == job_id),
        (
            "/credentialContextReference",
            message["credentialContextReference"] == attempt_id,
        ),
        ("/allowedScope/selectionReference", scope["selectionReference"] == attempt_id),
        (
            "/allowedScope/repositoryId",
            scope["repositoryId"] == message["repositoryId"],
        ),
    )
    return tuple(pointer for pointer, ok in checks if not ok)


def _mock_context(message: Mapping[str, Any]) -> AcceptedContext:
    """MOCK은 조회하지 않으므로 자체 검사를 통과한 메시지 값으로 맥락을 만든다.

    개발·시험에서만 쓰는 가짜 생성기 경로다. 결과의 맥락 값은 E가 접수 기록과 다시 대조한다.
    """
    scope = message["allowedScope"]
    return AcceptedContext(
        request_id=message["requestId"],
        attempt_id=message["attemptId"],
        member_id=message["memberId"],
        repository_id=message["repositoryId"],
        consent_id=message["consentId"],
        notice_revision=message["noticeRevision"],
        scope_revision=scope["revision"],
        allowed_resource_types=frozenset(scope["allowedResourceTypes"]),
        selection_reference=message["attemptId"],
        source_mode="MOCK",
    )


def _refuse(reason: RefusalReason, fields: tuple[str, ...]) -> Refused:
    logger.warning("요청을 처리 전에 거부함: reason=%s at=%s", reason, fields)
    return Refused(reason, fields)


def _run_outcome(outcome: Rejected | Finished | Uncertain) -> RunOutcome:
    if isinstance(outcome, Rejected):
        places = outcome.fields or _schema_places(outcome.schema_errors)
        return Refused(RefusalReason(outcome.reason.value), places)
    return outcome


def _unresolved(
    message: Mapping[str, Any],
    looked_up: ContextUnknown | ContextLookupFailed,
    clock: Clock,
) -> Finished:
    # 이유·원인은 고정 코드만 남긴다. 응답 본문·토큰·원문은 남기지 않는다.
    if isinstance(looked_up, ContextLookupFailed):
        logger.warning("요청 정보 조회 실패: cause=%s", looked_up.cause)
    else:
        logger.warning("요청 정보 조회 모름: reason=%s", looked_up.reason)
    reason = looked_up.reason
    return finish_unresolved(
        message,
        code=reason.value,
        text=FAILURE_MESSAGES[reason],
        clock=clock,
        id_label="live",
    )


def _run_live(
    message: Mapping[str, Any],
    live: LiveAssembly,
    *,
    picked_at: datetime,
    emit: Emit,
    clock: Clock,
) -> RunOutcome:
    looked_up = live.context_client.lookup(message["attemptId"])
    if not isinstance(looked_up, ContextFound):
        return _unresolved(message, looked_up, clock)
    # 성공·거부·예외 어느 쪽이든 with가 끝나면 자격정보와 선택 범위를 놓는다.
    with looked_up as found:
        outcome = process_request(
            message,
            accepted=found.accepted,
            generator=LiveGenerator(found, live, picked_at=picked_at, clock=clock),
            emit=emit,
            clock=clock,
            id_label="live",
        )
    return _run_outcome(outcome)


def run_request(
    message: object,
    *,
    job_id: str,
    picked_at: datetime,
    mock_enabled: bool,
    mock_scenario: str,
    live: LiveAssembly | None,
    emit: Emit,
    clock: Clock,
) -> RunOutcome:
    """요청 하나를 처리한다. 예외(결함)는 결과로 바꾸지 않고 그대로 올린다.

    picked_at은 부모가 작업을 꺼낸 시각이다. LIVE의 수집 시계와 생성 마감이 여기서 시작한다.
    """
    schema = check_message("Request", message)
    if schema.verdict is not Verdict.VALID or not isinstance(message, Mapping):
        return _refuse(RefusalReason.SCHEMA_INVALID, _schema_places(schema.errors))
    mismatched = self_check(message, job_id)
    if mismatched:
        return _refuse(RefusalReason.SELF_CHECK_FAILED, mismatched)
    if message["sourceMode"] == "LIVE":
        if live is None:
            return _refuse(RefusalReason.LIVE_NOT_CONFIGURED, ("/sourceMode",))
        return _run_live(message, live, picked_at=picked_at, emit=emit, clock=clock)
    if not mock_enabled:
        return _refuse(RefusalReason.MOCK_NOT_ACCEPTED, ("/sourceMode",))

    outcome = process_request(
        message,
        accepted=_mock_context(message),
        generator=FakeGenerator(mock_scenario),
        emit=emit,
        clock=clock,
        id_label="mock",
    )
    return _run_outcome(outcome)
