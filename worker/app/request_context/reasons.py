"""요청 정보 조회가 모름·실패일 때 결과에 싣는 실패 코드와 회원 문구(#121, 2026-10-15 팀장 결정).

회원 화면은 실패 문구를 "실패한 부분: …"으로 그대로 보여 준다. 그래서 문구는 회원용 존댓말로 쓰고 다음 행동을
적는다. 이유가 무엇이든 처리는 하나다: 수집 없이, 진행 알림 없이 FAILED 결과 하나(`stage: COLLECTION`).
"""

from collections.abc import Mapping
from enum import StrEnum
from typing import Final


class UnresolvedReason(StrEnum):
    """앞의 다섯은 api가 404에 실어 고르고, 뒤의 둘은 worker가 정한다."""

    ATTEMPT_NOT_ACTIVE = "ATTEMPT_NOT_ACTIVE"
    MEMBER_INACTIVE = "MEMBER_INACTIVE"
    SCOPE_UNVERIFIED = "SCOPE_UNVERIFIED"
    GITHUB_NOT_CONNECTED = "GITHUB_NOT_CONNECTED"
    GITHUB_REAUTH_REQUIRED = "GITHUB_REAUTH_REQUIRED"
    # 404인데 이유가 없거나 모르는 값(조회 경로가 아직 등록되지 않은 api 포함).
    REQUEST_CONTEXT_UNRESOLVED = "REQUEST_CONTEXT_UNRESOLVED"
    # worker 쪽 실패: 404가 아닌 상태, 시간 초과, 연결 오류, 손상 응답.
    REQUEST_CONTEXT_UNAVAILABLE = "REQUEST_CONTEXT_UNAVAILABLE"


# 404 본문에서 그대로 읽는 값. 그 밖의 값은 REQUEST_CONTEXT_UNRESOLVED로 본다.
API_REASONS: Final = frozenset(
    {
        UnresolvedReason.ATTEMPT_NOT_ACTIVE,
        UnresolvedReason.MEMBER_INACTIVE,
        UnresolvedReason.SCOPE_UNVERIFIED,
        UnresolvedReason.GITHUB_NOT_CONNECTED,
        UnresolvedReason.GITHUB_REAUTH_REQUIRED,
    }
)

FAILURE_MESSAGES: Final[Mapping[UnresolvedReason, str]] = {
    # 대개 E가 이 결과를 거부해 화면에 나오지 않는다(닫힌 요청·지난 시도).
    UnresolvedReason.ATTEMPT_NOT_ACTIVE: (
        "이 분석 요청은 이미 끝났거나 새 요청으로 바뀌어 처리하지 않았습니다."
    ),
    UnresolvedReason.MEMBER_INACTIVE: "회원 상태를 확인할 수 없어 분석하지 않았습니다.",
    UnresolvedReason.SCOPE_UNVERIFIED: (
        "동의한 저장소 범위를 확인하지 못해 분석하지 않았습니다."
        " 다시 동의한 뒤 요청해 주세요."
    ),
    UnresolvedReason.GITHUB_NOT_CONNECTED: (
        "GitHub 연결이 없어 분석하지 않았습니다. GitHub를 연결한 뒤 다시 요청해 주세요."
    ),
    UnresolvedReason.GITHUB_REAUTH_REQUIRED: (
        "GitHub 연결을 다시 확인해야 해서 분석하지 않았습니다."
        " GitHub를 다시 연결한 뒤 요청해 주세요."
    ),
    UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED: (
        "분석 요청 정보를 확인하지 못해 분석하지 않았습니다."
    ),
    UnresolvedReason.REQUEST_CONTEXT_UNAVAILABLE: (
        "분석 요청 정보를 잠시 확인하지 못해 분석하지 않았습니다."
        " 잠시 후 다시 요청해 주세요."
    ),
}
