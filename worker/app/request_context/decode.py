"""신뢰할 수 없는 내부 HTTP 응답을 기존 수집 타입으로 검사·변환한다."""

import json
import re
from datetime import UTC, datetime
from typing import cast

from app.collection.credentials import AccessToken, CredentialContext
from app.collection.identifiers import GitHubAccount, RepositoryCoordinates
from app.collection.selection import SelectedRange

_UUID = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")
_STAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)")


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


def decode_context(
    body: bytes, *, request_id: str, attempt_id: str
) -> tuple[CredentialContext, SelectedRange]:
    """누락·추가·중복 키, 타입 손상, 응답 시도/요청 불일치는 거부한다."""
    value: object = json.loads(body, object_pairs_hook=_unique_object)
    root = _object(value, {"requestId", "attemptId", "credential", "selection"})
    if root["requestId"] != request_id or root["attemptId"] != attempt_id:
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
    return (
        CredentialContext(
            member_id=_text(credential["memberId"]),
            repository_id=_text(credential["repositoryId"]),
            scope_revision=_text(credential["scopeRevision"]),
            repository=RepositoryCoordinates(
                _text(repository["owner"]), _text(repository["name"])
            ),
            linked_account=GitHubAccount(_text(account["login"]), int(external_id)),
            access_token=AccessToken(_text(credential["accessToken"])),
            expires_at=datetime.fromisoformat(expires).astimezone(UTC),
        ),
        SelectedRange(
            repository_id=_text(selected["repositoryId"]),
            whole_repository=selected["wholeRepository"],
        ),
    )


def decode_unavailable(body: bytes) -> None:
    """공통 RESOURCE_UNAVAILABLE만 해석 실패로 받는다. 다른 404 본문은 손상이다."""
    value: object = json.loads(body, object_pairs_hook=_unique_object)
    if not isinstance(value, dict) or set(value) not in (
        {"code", "message"},
        {"code", "message", "details"},
    ):
        raise ValueError
    if value["code"] != "RESOURCE_UNAVAILABLE" or not isinstance(value["message"], str):
        raise ValueError
