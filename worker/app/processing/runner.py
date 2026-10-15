"""큐 소비자의 자식 프로세스가 부르는 요청 처리(#121).

조회 전 자체 검사 → MOCK은 요청 정보 조회 없이 `process_request`와 가짜 생성기로 처리하고, LIVE는
실제 조립(PR②) 전이라 처리 전에 거부한다. 메시지를 보내거나 저장하지 않으며, 진행 알림은 emit에
넘기고 종결은 돌려준다. 큐·BullMQ를 불러오지 않는다.
"""

import logging
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.contract import SchemaError, Verdict, check_message
from app.processing.fake_generator import FakeGenerator
from app.processing.pipeline import Clock, Emit, Finished, Uncertain, process_request
from app.processing.request_check import AcceptedContext, Rejected

logger = logging.getLogger(__name__)

_UUID_HEX = frozenset("0123456789abcdefABCDEF")


class RefusalReason(StrEnum):
    """처리 전 거부 사유. 큐 작업 반환값과 로그에만 쓰고 api로 보내지 않는다."""

    SCHEMA_INVALID = "SCHEMA_INVALID"
    SELF_CHECK_FAILED = "SELF_CHECK_FAILED"
    CONTEXT_MISMATCH = "CONTEXT_MISMATCH"
    STALE_ATTEMPT = "STALE_ATTEMPT"
    MOCK_NOT_ACCEPTED = "MOCK_NOT_ACCEPTED"
    LIVE_NOT_ASSEMBLED = "LIVE_NOT_ASSEMBLED"


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


def run_request(
    message: object,
    *,
    job_id: str,
    mock_enabled: bool,
    mock_scenario: str,
    emit: Emit,
    clock: Clock,
) -> RunOutcome:
    """요청 하나를 처리한다. 예외(결함)는 결과로 바꾸지 않고 그대로 올린다."""
    schema = check_message("Request", message)
    if schema.verdict is not Verdict.VALID or not isinstance(message, Mapping):
        return _refuse(RefusalReason.SCHEMA_INVALID, _schema_places(schema.errors))
    mismatched = self_check(message, job_id)
    if mismatched:
        return _refuse(RefusalReason.SELF_CHECK_FAILED, mismatched)
    if message["sourceMode"] == "LIVE":
        # 요청 정보 조회와 실제 수집·생성 조립은 PR②에서 연결한다.
        return _refuse(RefusalReason.LIVE_NOT_ASSEMBLED, ("/sourceMode",))
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
    if isinstance(outcome, Rejected):
        places = outcome.fields or _schema_places(outcome.schema_errors)
        return Refused(RefusalReason(outcome.reason.value), places)
    return outcome
