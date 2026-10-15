from dataclasses import replace
from typing import Any

import pytest

from app.contract import SchemaError
from app.processing import (
    CheckedRequest,
    Rejected,
    RejectReason,
    check_request,
    synthetic_accepted_context,
    synthetic_request,
)

ACCEPTED = synthetic_accepted_context()
OTHER_ID = "00000000-0000-4000-8000-000000000999"


def _parts(pointer: str) -> tuple[list[str], str]:
    *parents, last = pointer.strip("/").split("/")
    return parents, last


def _with(pointer: str, value: object) -> dict[str, Any]:
    request = synthetic_request(ACCEPTED)
    parents, last = _parts(pointer)
    target = request
    for part in parents:
        target = target[part]
    target[last] = value
    return request


def _without(pointer: str) -> dict[str, Any]:
    request = synthetic_request(ACCEPTED)
    parents, last = _parts(pointer)
    target = request
    for part in parents:
        target = target[part]
    del target[last]
    return request


def test_synthetic_request_matches_accepted_context() -> None:
    checked = check_request(synthetic_request(ACCEPTED), ACCEPTED)

    assert checked == CheckedRequest(
        request_id=ACCEPTED.request_id,
        attempt_id=ACCEPTED.attempt_id,
        member_id=ACCEPTED.member_id,
        repository_id=ACCEPTED.repository_id,
        consent_id=ACCEPTED.consent_id,
        scope_revision=ACCEPTED.scope_revision,
        allowed_resource_types=ACCEPTED.allowed_resource_types,
        selection_reference=ACCEPTED.selection_reference,
        source_mode="MOCK",
        credential_context_reference=ACCEPTED.attempt_id,
    )


@pytest.mark.parametrize(
    ("pointer", "value"),
    [
        ("/schemaVersion", "2"),
        ("/memberId", ""),
        ("/consentedAt", "2026-10-01 00:00:00Z"),
        ("/sourceMode", "REAL"),
        ("/credentialContextReference", ""),
        ("/allowedScope/allowedResourceTypes", ["COMMIT", "WIKI"]),
        ("/allowedScope/selectionReference", 1),
    ],
)
def test_malformed_field_is_rejected(pointer: str, value: object) -> None:
    rejected = check_request(_with(pointer, value), ACCEPTED)

    assert isinstance(rejected, Rejected)
    assert rejected.reason is RejectReason.SCHEMA_INVALID
    assert any(error.path.startswith(pointer) for error in rejected.schema_errors)


@pytest.mark.parametrize(
    ("pointer", "missing_at"),
    [
        ("/memberId", ""),
        ("/credentialContextReference", ""),
        ("/allowedScope", ""),
        ("/allowedScope/revision", "/allowedScope"),
    ],
)
def test_missing_field_is_rejected(pointer: str, missing_at: str) -> None:
    rejected = check_request(_without(pointer), ACCEPTED)

    assert isinstance(rejected, Rejected)
    assert rejected.reason is RejectReason.SCHEMA_INVALID
    assert SchemaError(path=missing_at, keyword="required") in rejected.schema_errors


def test_unknown_field_is_rejected() -> None:
    rejected = check_request(_with("/githubToken", "synthetic-value"), ACCEPTED)

    assert isinstance(rejected, Rejected)
    assert rejected.reason is RejectReason.SCHEMA_INVALID
    assert SchemaError(path="", keyword="additionalProperties") in (
        rejected.schema_errors
    )


@pytest.mark.parametrize("message", [None, [], "request", 1])
def test_non_object_is_rejected(message: object) -> None:
    rejected = check_request(message, ACCEPTED)

    assert isinstance(rejected, Rejected)
    assert rejected.reason is RejectReason.SCHEMA_INVALID


@pytest.mark.parametrize(
    ("pointer", "value"),
    [
        ("/requestId", OTHER_ID),
        ("/memberId", OTHER_ID),
        ("/repositoryId", "synthetic-repo-0002"),
        ("/consentId", OTHER_ID),
        ("/noticeRevision", OTHER_ID),
        ("/sourceMode", "LIVE"),
        ("/allowedScope/revision", OTHER_ID),
        ("/allowedScope/repositoryId", "synthetic-repo-0002"),
        ("/allowedScope/allowedResourceTypes", ["COMMIT"]),
        ("/allowedScope/selectionReference", "synthetic-selection-0002"),
    ],
)
def test_context_mismatch_is_rejected(pointer: str, value: object) -> None:
    rejected = check_request(_with(pointer, value), ACCEPTED)

    assert rejected == Rejected(RejectReason.CONTEXT_MISMATCH, (pointer,))
    assert str(value) not in repr(rejected)


def test_scope_wider_than_consent_is_rejected() -> None:
    accepted = replace(ACCEPTED, allowed_resource_types=frozenset({"COMMIT"}))

    rejected = check_request(synthetic_request(ACCEPTED), accepted)

    assert rejected == Rejected(
        RejectReason.CONTEXT_MISMATCH, ("/allowedScope/allowedResourceTypes",)
    )


def test_request_without_accepted_record_is_rejected() -> None:
    rejected = check_request(synthetic_request(ACCEPTED), None)

    assert rejected == Rejected(RejectReason.CONTEXT_MISMATCH, ("/requestId",))


def test_other_attempt_is_stale() -> None:
    rejected = check_request(_with("/attemptId", OTHER_ID), ACCEPTED)

    assert rejected == Rejected(RejectReason.STALE_ATTEMPT, ("/attemptId",))


def test_context_mismatch_is_reported_before_stale_attempt() -> None:
    request = _with("/attemptId", OTHER_ID)
    request["memberId"] = OTHER_ID

    rejected = check_request(request, ACCEPTED)

    assert rejected == Rejected(RejectReason.CONTEXT_MISMATCH, ("/memberId",))


def test_credential_reference_does_not_admit_mismatched_request() -> None:
    request = _with("/memberId", OTHER_ID)
    assert request["credentialContextReference"] == ACCEPTED.attempt_id

    rejected = check_request(request, ACCEPTED)

    assert rejected == Rejected(RejectReason.CONTEXT_MISMATCH, ("/memberId",))


def test_credential_reference_is_passed_on_without_interpretation() -> None:
    # 참조의 해석·대조는 실제 자격정보 연결에서 한다. 이 검사는 참조를 권한으로도,
    # 접수 기록을 찾는 열쇠로도 쓰지 않고 형식만 본다.
    checked = check_request(
        _with("/credentialContextReference", "synthetic-credential-context-0002"),
        ACCEPTED,
    )

    assert isinstance(checked, CheckedRequest)
    assert checked.credential_context_reference == "synthetic-credential-context-0002"
