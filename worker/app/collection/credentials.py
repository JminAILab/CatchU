"""A가 준 자격정보 맥락을 요청과 대조하는 F 경계(#116 문서 「F의 검사 순서와 거부」).

요청의 `credentialContextReference`는 토큰도 권한도 아니다. 이 참조로 A에 맥락을 물어 받고,
맥락이 요청과 모두 맞을 때만 첫 GitHub 호출로 넘어간다. 참조를 GitHub에 보내지 않고,
해석에 실패해도 다시 묻지 않는다.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from app.collection.failures import CollectionFailure, FailureCode
from app.collection.identifiers import GitHubAccount, RepositoryCoordinates
from app.collection.limits import CollectionLimits
from app.processing.request_check import CheckedRequest


class AccessToken:
    """GitHub 호출에만 쓰는 비밀값. 문자열 변환·repr에 값을 드러내지 않는다."""

    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        # 머리글에 그대로 실리므로 보이는 ASCII만 받는다. 거부할 때 값을 메시지에 넣지 않는다.
        if not value or not all(0x21 <= ord(c) <= 0x7E for c in value):
            raise ValueError("자격정보가 비었거나 머리글에 쓸 수 없는 문자가 있다")
        self._value = value

    def reveal(self) -> str:
        return self._value

    def __repr__(self) -> str:
        return "AccessToken(***)"

    __str__ = __repr__


@dataclass(frozen=True)
class CredentialContext:
    """참조가 가리키는 작업 맥락(#116 문서 「인계 내용 — A가 주는 것」 제안).

    접근 자격정보를 담으므로 저장·기록하지 않고 수집이 끝나면 버린다.
    """

    member_id: str
    repository_id: str
    scope_revision: str
    repository: RepositoryCoordinates
    linked_account: GitHubAccount
    access_token: AccessToken = field(repr=False)
    expires_at: datetime

    def __post_init__(self) -> None:
        if self.expires_at.tzinfo is None:
            raise ValueError("만료 시각에는 시간대가 있어야 한다")


class CredentialLookupError(Exception):
    """A에 맥락을 묻지 못했다(연결 오류·서버 오류 등). 다시 묻지 않는다."""


class CredentialResolver(Protocol):
    """A의 자격정보 맥락 조회. 실제 조회 지점은 #133 후속에서 A가 제공한다."""

    def resolve(self, reference: str) -> CredentialContext | None:
        """모르는 참조면 None, 조회 자체가 실패하면 CredentialLookupError."""
        ...


def _failure(code: FailureCode, message: str) -> CollectionFailure:
    return CollectionFailure(code, message)


def check_credential(
    request: CheckedRequest,
    resolver: CredentialResolver,
    *,
    now: datetime,
    limits: CollectionLimits,
) -> CredentialContext | CollectionFailure:
    """해석 → 회원 → 저장소 → 허용 범위 판본 → 만료 순으로 확인한다.

    범위가 어긋나면 좁은 쪽으로 맞추지 않고 거부한다. 만료는 수집 시간 상한이 끝날 때까지
    유효해야 통과한다.
    """
    try:
        context = resolver.resolve(request.credential_context_reference)
    except CredentialLookupError:
        return _failure(
            FailureCode.CREDENTIAL_REFERENCE_UNRESOLVED,
            "자격정보 맥락을 조회하지 못해 수집하지 않았다",
        )
    if context is None:
        return _failure(
            FailureCode.CREDENTIAL_REFERENCE_UNRESOLVED,
            "자격정보 참조를 해석하지 못해 수집하지 않았다",
        )
    # request.repository_id는 요청 검사에서 allowedScope.repositoryId와 같음을 확인했다.
    mismatched = [
        label
        for label, actual, expected in (
            ("회원", context.member_id, request.member_id),
            ("저장소", context.repository_id, request.repository_id),
            ("허용 범위 판본", context.scope_revision, request.scope_revision),
        )
        if actual != expected
    ]
    if mismatched:
        return _failure(
            FailureCode.CREDENTIAL_SCOPE_MISMATCH,
            f"자격정보 맥락이 요청과 달라 수집하지 않았다(다른 항목: {'·'.join(mismatched)})",
        )
    if context.expires_at <= now + limits.max_collection_time:
        return _failure(
            FailureCode.CREDENTIAL_EXPIRED,
            "자격정보가 만료됐거나 수집 시간 상한 안에 만료돼 수집하지 않았다",
        )
    return context
