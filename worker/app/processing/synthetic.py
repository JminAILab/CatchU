"""합성 접수 맥락과 그에 맞는 합성 요청.

M1 합성 결과 세트의 `context.sample.json` 값을 쓰고, 표본에 없는 요청 필드(고지 판본·
허용 자료 종류·선정 참조·자격정보 맥락 참조·시각)만 여기서 채운다. 두 참조는 시도 ID와 같게
둔다(큐 소비자의 조회 전 자체 검사, 10/15 결정 1의 비교 규칙). 큐 검증 키트도 이 함수를 쓴다.
"""

import json
from typing import Any

from app.contract import FIXTURE_DIR
from app.processing.request_check import AcceptedContext

NOTICE_REVISION = "00000000-0000-4000-8000-000000000301"
ALLOWED_RESOURCE_TYPES = ("COMMIT", "PULL_REQUEST", "ISSUE")
SYNTHETIC_TIME = "2026-10-01T00:00:00Z"


def synthetic_accepted_context() -> AcceptedContext:
    sample = json.loads((FIXTURE_DIR / "context.sample.json").read_text("utf-8"))
    values, repository = sample["values"], sample["repository"]
    # 합성 선정 저장소가 접수 값과 같은 저장소·허용 범위 판본을 가리켜야 한다.
    if (repository["repositoryId"], repository["allowedScopeRevision"]) != (
        values["repositoryId"],
        values["scopeRevision"],
    ):
        raise ValueError("context.sample.json의 접수 값과 선정 저장소가 맞지 않음")
    return AcceptedContext(
        request_id=values["requestId"],
        attempt_id=values["attemptId"],
        member_id=values["memberId"],
        repository_id=values["repositoryId"],
        consent_id=values["consentId"],
        notice_revision=NOTICE_REVISION,
        scope_revision=values["scopeRevision"],
        allowed_resource_types=frozenset(ALLOWED_RESOURCE_TYPES),
        selection_reference=values["attemptId"],
        source_mode="MOCK",
    )


def synthetic_request(accepted: AcceptedContext) -> dict[str, Any]:
    """접수 맥락과 일치하는 합성 Request 메시지."""
    return {
        "schemaVersion": "2",
        "messageId": f"request-{accepted.attempt_id}",
        "requestId": accepted.request_id,
        "attemptId": accepted.attempt_id,
        "memberId": accepted.member_id,
        "repositoryId": accepted.repository_id,
        "consentId": accepted.consent_id,
        "noticeRevision": accepted.notice_revision,
        "consentedAt": SYNTHETIC_TIME,
        "allowedScope": {
            "revision": accepted.scope_revision,
            "repositoryId": accepted.repository_id,
            "allowedResourceTypes": [
                kind
                for kind in ALLOWED_RESOURCE_TYPES
                if kind in accepted.allowed_resource_types
            ],
            "selectionReference": accepted.selection_reference,
        },
        "credentialContextReference": accepted.attempt_id,
        "sourceMode": accepted.source_mode,
        "requestedAt": SYNTHETIC_TIME,
    }
