"""수집 실패의 코드와 모양.

코드는 결과의 `Failure.code`(계약에서 자유 문자열)에 담긴다. 이름은 #116 문서 「상한을 넘거나
실패했을 때」의 제안을 따르고, 원인이 달라 나눠야 했던 셋(SELECTION_UNRESOLVED·
SELECTION_UNSUPPORTED·CREDENTIAL_REJECTED)을 더했다. message는 고정 문구만 쓰며 자격정보
참조·토큰·응답 원문·요청 경로를 넣지 않는다.
"""

from dataclasses import dataclass
from enum import StrEnum

from app.processing.generation import StageFailure


class FailureCode(StrEnum):
    # 첫 GitHub 호출 전 검사(호출 0회로 끝난다).
    NO_ALLOWED_RESOURCE_TYPE = "NO_ALLOWED_RESOURCE_TYPE"
    SELECTION_UNRESOLVED = "SELECTION_UNRESOLVED"
    SELECTION_UNSUPPORTED = "SELECTION_UNSUPPORTED"
    SCOPE_INCONSISTENT = "SCOPE_INCONSISTENT"
    CREDENTIAL_REFERENCE_UNRESOLVED = "CREDENTIAL_REFERENCE_UNRESOLVED"
    CREDENTIAL_SCOPE_MISMATCH = "CREDENTIAL_SCOPE_MISMATCH"
    CREDENTIAL_EXPIRED = "CREDENTIAL_EXPIRED"
    # GitHub 호출 중.
    CREDENTIAL_REJECTED = "CREDENTIAL_REJECTED"
    REPOSITORY_UNREACHABLE = "REPOSITORY_UNREACHABLE"
    RATE_LIMITED = "RATE_LIMITED"
    COLLECTION_FETCH_FAILED = "COLLECTION_FETCH_FAILED"
    # 요청 전체 상한.
    BUDGET_EXCEEDED = "BUDGET_EXCEEDED"
    TIME_LIMIT_EXCEEDED = "TIME_LIMIT_EXCEEDED"


@dataclass(frozen=True)
class CollectionFailure:
    code: FailureCode
    message: str

    def as_stage_failure(self) -> StageFailure:
        """결과 조합(`GenerationOutput.failures`)에 넣을 수집 단계 실패."""
        return StageFailure("COLLECTION", self.code, self.message)


class CollectionStopped(Exception):
    """수집을 멈춘다. 그때까지 모은 자료는 버리지 않고, 이 실패 하나를 남긴다.

    다시 부르지 않는다(자동 재시도 없음).
    """

    def __init__(self, failure: CollectionFailure) -> None:
        super().__init__(failure.code)
        self.failure = failure


def stop(code: FailureCode, message: str) -> CollectionStopped:
    return CollectionStopped(CollectionFailure(code, message))
