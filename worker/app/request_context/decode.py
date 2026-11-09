"""신뢰할 수 없는 내부 HTTP 응답을 접수 맥락과 기존 수집 타입으로 검사·변환한다."""

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast

from app.collection.credentials import AccessToken, CredentialContext
from app.collection.identifiers import GitHubAccount, RepositoryCoordinates
from app.collection.selection import SelectedRange
from app.processing.request_check import AcceptedContext, SourceMode
from app.request_context.reasons import API_REASONS, UnresolvedReason

_UUID = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")
_STAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)")
# 계약 v1 Request의 allowedScope.allowedResourceTypes 값(worker-messages.yaml).
_RESOURCE_TYPES = frozenset({"COMMIT", "PULL_REQUEST", "ISSUE"})
_SOURCE_MODES: dict[object, SourceMode] = {"LIVE": "LIVE", "MOCK": "MOCK"}
_ROOT_KEYS = {
    "requestId",
    "attemptId",
    "consentId",
    "noticeRevision",
    "allowedResourceTypes",
    "sourceMode",
    "credential",
    "selection",
    "assignedCommitShas",
}
_SHA = re.compile(r"[0-9a-f]{40}")


@dataclass(frozen=True)
class DecodedContext:
    """응답 하나에서 읽은 접수 맥락·자격정보 맥락·선택 범위와 소속 커밋 집합."""

    accepted: AcceptedContext
    credential: CredentialContext
    selection: SelectedRange
    # 그 회원·저장소에서 이미 Catch에 속한 커밋 SHA(CR2 계약 C1). 없으면 빈 집합이다.
    assigned_commits: frozenset[str]


def valid_reference(value: str) -> bool:
    return _UUID.fullmatch(value) is not None


def _object(value: object, keys: set[str]) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError
    return cast(dict[str, object], value)


def _text(value: object) -> str:
    if not isinstance(value, str) or not value or not value.isprintable():
        raise ValueError
    return value


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError
        result[key] = value
    return result


def _resource_types(value: object) -> frozenset[str]:
    if not isinstance(value, list) or not all(
        item in _RESOURCE_TYPES for item in value
    ):
        raise ValueError
    return frozenset(cast(list[str], value))


def _assigned_commits(value: object) -> frozenset[str]:
    """소속 커밋 목록(CR2 BR2.3): 소문자 16진수 40자 SHA의 중복 없는 배열. 빈 배열은 정상이다."""
    if not isinstance(value, list) or not all(
        isinstance(item, str) and _SHA.fullmatch(item) for item in value
    ):
        raise ValueError
    shas = frozenset(cast(list[str], value))
    if len(shas) != len(value):
        raise ValueError
    return shas


def decode_context(body: bytes, *, attempt_id: str) -> DecodedContext:
    """누락·추가·중복 키, 타입 손상, 응답 시도 ID가 물은 시도 ID와 다름은 거부한다.

    요청 ID를 비롯한 접수 기록 값은 여기서 비교하지 않고 AcceptedContext에 옮긴다. 요청 메시지와의 대조는
    `check_request`가 하고, 어긋나면 진행 알림도 결과도 없이 거부한다. 선정 참조의 기대값은 시도 ID다(10/15
    결정 1의 비교 규칙).
    """
    value: object = json.loads(body, object_pairs_hook=_unique_object)
    root = _object(value, _ROOT_KEYS)
    if root["attemptId"] != attempt_id:
        raise ValueError
    source_mode = _SOURCE_MODES.get(root["sourceMode"])
    if source_mode is None:
        raise ValueError
    credential = _object(
        root["credential"],
        {
            "memberId",
            "repositoryId",
            "scopeRevision",
            "repository",
            "linkedAccount",
            "accessToken",
            "expiresAt",
        },
    )
    repository = _object(credential["repository"], {"owner", "name"})
    account = _object(credential["linkedAccount"], {"login", "externalAccountId"})
    selected = _object(root["selection"], {"repositoryId", "wholeRepository"})
    external_id = _text(account["externalAccountId"])
    if not re.fullmatch(r"[1-9][0-9]*", external_id):
        raise ValueError
    expires = _text(credential["expiresAt"])
    if not _STAMP.fullmatch(expires):
        raise ValueError
    if type(selected["wholeRepository"]) is not bool:
        raise ValueError
    member_id = _text(credential["memberId"])
    repository_id = _text(credential["repositoryId"])
    scope_revision = _text(credential["scopeRevision"])
    return DecodedContext(
        accepted=AcceptedContext(
            request_id=_text(root["requestId"]),
            attempt_id=attempt_id,
            member_id=member_id,
            repository_id=repository_id,
            consent_id=_text(root["consentId"]),
            notice_revision=_text(root["noticeRevision"]),
            scope_revision=scope_revision,
            allowed_resource_types=_resource_types(root["allowedResourceTypes"]),
            selection_reference=attempt_id,
            source_mode=source_mode,
        ),
        credential=CredentialContext(
            member_id=member_id,
            repository_id=repository_id,
            scope_revision=scope_revision,
            repository=RepositoryCoordinates(
                _text(repository["owner"]), _text(repository["name"])
            ),
            linked_account=GitHubAccount(_text(account["login"]), int(external_id)),
            access_token=AccessToken(_text(credential["accessToken"])),
            expires_at=datetime.fromisoformat(expires).astimezone(UTC),
        ),
        selection=SelectedRange(
            repository_id=_text(selected["repositoryId"]),
            whole_repository=selected["wholeRepository"],
        ),
        assigned_commits=_assigned_commits(root["assignedCommitShas"]),
    )


def _reason(details: object) -> UnresolvedReason:
    """api가 고른 이유를 허용 목록에서만 읽는다. 없거나 모양이 다르거나 모르는 값이면 UNRESOLVED다."""
    if isinstance(details, dict):
        violations = details.get("violations")
        if isinstance(violations, list) and len(violations) == 1:
            first = violations[0]
            if (
                isinstance(first, dict)
                and set(first) == {"field", "reason"}
                and first["field"] == "attemptId"
                and isinstance(first["reason"], str)
                and first["reason"] in API_REASONS
            ):
                return UnresolvedReason(first["reason"])
    return UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED


def decode_unavailable(body: bytes) -> UnresolvedReason:
    """공통 RESOURCE_UNAVAILABLE만 모름으로 받고 그 이유를 돌려준다. 다른 404 본문은 손상이다."""
    value: object = json.loads(body, object_pairs_hook=_unique_object)
    if not isinstance(value, dict) or set(value) not in (
        {"code", "message"},
        {"code", "message", "details"},
    ):
        raise ValueError
    if value["code"] != "RESOURCE_UNAVAILABLE" or not isinstance(value["message"], str):
        raise ValueError
    return _reason(value.get("details"))
