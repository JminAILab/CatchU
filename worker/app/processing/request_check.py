"""분석 요청(Request) 검사: 메시지 스키마 v1과 E 접수 맥락 대조.

통과하지 못한 요청은 생성기를 부르기 전에 거부한다. 계약에는 요청 거부를 알리는
메시지가 없으므로 거부 결과는 호출부에 돌려주기만 한다.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

from app.contract import SchemaError, Verdict, check_message

SourceMode = Literal["MOCK", "LIVE"]


class RejectReason(StrEnum):
    """처리 전 거부 사유.

    수신 확인(ResultReceipt) code와 같은 이름을 쓰는 내부 판정값이며, 메시지로 보내지
    않는다.
    """

    SCHEMA_INVALID = "SCHEMA_INVALID"
    CONTEXT_MISMATCH = "CONTEXT_MISMATCH"
    STALE_ATTEMPT = "STALE_ATTEMPT"


@dataclass(frozen=True)
class Rejected:
    """처리 전 거부. 어긋난 위치(JSON Pointer)만 담고 요청의 값은 담지 않는다."""

    reason: RejectReason
    fields: tuple[str, ...] = ()
    schema_errors: tuple[SchemaError, ...] = ()


@dataclass(frozen=True)
class AcceptedContext:
    """E가 접수한 요청·현재 시도·회원·저장소·동의와 동의한 허용 범위."""

    request_id: str
    attempt_id: str
    member_id: str
    repository_id: str
    consent_id: str
    notice_revision: str
    scope_revision: str
    allowed_resource_types: frozenset[str]
    selection_reference: str
    source_mode: SourceMode


@dataclass(frozen=True)
class CheckedRequest:
    """스키마와 접수 맥락 검사를 통과한 요청."""

    request_id: str
    attempt_id: str
    member_id: str
    repository_id: str
    consent_id: str
    scope_revision: str
    allowed_resource_types: frozenset[str]
    selection_reference: str
    source_mode: SourceMode
    # A/F가 해석할 작업 맥락 참조. 이 검사는 해석하지 않고 권한으로도 쓰지 않는다.
    credential_context_reference: str


def check_request(
    message: object, accepted: AcceptedContext | None
) -> CheckedRequest | Rejected:
    """스키마 v1 → 접수 맥락 → 현재 시도 순서로 검사한다.

    accepted가 None이면 이 요청의 접수 기록이 없다는 뜻이다. 접수 기록 조회 자체가
    실패했다면 이 함수를 부르지 않는다(조회 오류를 불일치로 바꾸지 않는다).

    credentialContextReference는 형식만 검사한다. 이 문자열이 있어도 나머지 맥락이
    접수 기록과 모두 같아야 통과한다.
    """
    checked = check_message("Request", message)
    if checked.verdict is not Verdict.VALID or not isinstance(message, Mapping):
        return Rejected(RejectReason.SCHEMA_INVALID, schema_errors=checked.errors)
    if accepted is None:
        return Rejected(RejectReason.CONTEXT_MISMATCH, ("/requestId",))

    scope = message["allowedScope"]
    pairs: tuple[tuple[str, object, object], ...] = (
        ("/requestId", message["requestId"], accepted.request_id),
        ("/memberId", message["memberId"], accepted.member_id),
        ("/repositoryId", message["repositoryId"], accepted.repository_id),
        ("/consentId", message["consentId"], accepted.consent_id),
        ("/noticeRevision", message["noticeRevision"], accepted.notice_revision),
        ("/sourceMode", message["sourceMode"], accepted.source_mode),
        ("/allowedScope/revision", scope["revision"], accepted.scope_revision),
        ("/allowedScope/repositoryId", scope["repositoryId"], accepted.repository_id),
        (
            "/allowedScope/allowedResourceTypes",
            frozenset(scope["allowedResourceTypes"]),
            accepted.allowed_resource_types,
        ),
        (
            "/allowedScope/selectionReference",
            scope["selectionReference"],
            accepted.selection_reference,
        ),
    )
    mismatched = tuple(
        pointer for pointer, actual, expected in pairs if actual != expected
    )
    if mismatched:
        return Rejected(RejectReason.CONTEXT_MISMATCH, mismatched)
    if message["attemptId"] != accepted.attempt_id:
        return Rejected(RejectReason.STALE_ATTEMPT, ("/attemptId",))

    return CheckedRequest(
        request_id=accepted.request_id,
        attempt_id=accepted.attempt_id,
        member_id=accepted.member_id,
        repository_id=accepted.repository_id,
        consent_id=accepted.consent_id,
        scope_revision=accepted.scope_revision,
        allowed_resource_types=accepted.allowed_resource_types,
        selection_reference=accepted.selection_reference,
        source_mode=accepted.source_mode,
        credential_context_reference=message["credentialContextReference"],
    )
