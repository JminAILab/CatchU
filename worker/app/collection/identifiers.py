"""GitHub 식별 값(저장소 좌표·계정·SHA·번호)의 검사.

API 경로와 근거 주소는 이 검사를 통과한 값으로만 만든다. 응답 본문의 주소나 글자에서
식별 값을 뽑지 않는다.
"""

import re
from dataclasses import dataclass

# GitHub 사용자·조직 이름: 영숫자와 하이픈, 39자 이하, 하이픈으로 시작·끝나지 않음.
_OWNER = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?")
# 저장소 이름: 영숫자와 `.`·`_`·`-`, 100자 이하. `.`·`..`는 경로 조작이 되므로 뺀다.
_NAME = re.compile(r"[A-Za-z0-9._-]{1,100}")
# 전체 길이 SHA만 쓴다(SHA-1 40자, SHA-256 저장소 64자). 짧은 SHA는 받지 않는다.
_SHA = re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}")


@dataclass(frozen=True)
class RepositoryCoordinates:
    """A가 자격정보 맥락으로 알려 준 대상 저장소 하나."""

    owner: str
    name: str

    def __post_init__(self) -> None:
        if not _OWNER.fullmatch(self.owner):
            raise ValueError("저장소 소유자 형식이 GitHub 이름 규칙에 맞지 않는다")
        if not _NAME.fullmatch(self.name) or self.name in {".", ".."}:
            raise ValueError("저장소 이름 형식이 GitHub 이름 규칙에 맞지 않는다")

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.name}"

    def same_as(self, full_name: str) -> bool:
        """GitHub는 소유자·이름의 대소문자를 구분하지 않는다."""
        return self.full_name.casefold() == full_name.casefold()


@dataclass(frozen=True)
class GitHubAccount:
    """GitHub 계정. 같은 계정인지는 바뀌지 않는 숫자 식별자로 본다.

    로그인은 표시용 관측 값이다. 경로·주소에 쓰지 않으므로 이름 규칙으로 거르지 않는다
    (봇 계정은 `dependabot[bot]`처럼 대괄호를 쓴다).
    """

    login: str
    account_id: int

    def __post_init__(self) -> None:
        if not self.login or len(self.login) > 100 or not self.login.isprintable():
            raise ValueError("GitHub 로그인이 비었거나 너무 길거나 제어 문자가 있다")
        require_number(self.account_id)

    def same_account(self, other: "GitHubAccount | None") -> bool:
        return other is not None and other.account_id == self.account_id


def normalize_sha(value: object) -> str:
    """전체 길이 16진수 SHA를 소문자로 돌려준다. 아니면 ValueError."""
    if not isinstance(value, str) or not _SHA.fullmatch(value.lower()):
        raise ValueError("전체 길이 16진수 SHA가 아니다")
    return value.lower()


def require_number(value: object) -> int:
    """PR·이슈 번호와 계정 식별자처럼 양의 정수여야 하는 값."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError("양의 정수가 아니다")
    return value
