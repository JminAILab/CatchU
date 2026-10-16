"""제공자에 종속되지 않는 생성 인터페이스.

실제 수집·후보 판정·초안/질문 생성 모듈과 가짜 생성기가 같은 모양의 결과를
돌려준다. 제공자 이름·모델·API 키에 해당하는 값은 두지 않는다.
"""

from dataclasses import dataclass
from typing import Literal, Protocol, Self

from app.processing.request_check import CheckedRequest, SourceMode

GenerationStatus = Literal["GENERATED", "FAILED", "NOT_GENERATED"]
NotProvidedReason = Literal["INSUFFICIENT_EVIDENCE", "BELOW_CRITERIA", "UNDETERMINED"]
# 후보에 묶이지 않은 수집·분석 오류. 초안·질문 실패는 후보의 생성 상태로 전달한다.
GeneratorFailureStage = Literal["COLLECTION", "ANALYSIS"]


class ExecutionUnknown(Exception):
    """실행 여부나 결과를 확인하지 못했다(상태 조회 오류 등). 실패로 확정하지 않는다."""


@dataclass(frozen=True)
class GenerationFailure:
    code: str
    message: str


def _has_text(value: str | None) -> bool:
    return value is not None and value.strip() != ""


@dataclass(frozen=True)
class DraftOutcome:
    """설명 초안의 생성 상태. 본문은 GENERATED일 때만 있고, 그 밖에는 None이다."""

    status: GenerationStatus
    content: str | None = None
    failure: GenerationFailure | None = None

    def __post_init__(self) -> None:
        if self.status == "GENERATED" and not _has_text(self.content):
            raise ValueError("GENERATED 초안에는 비어 있지 않은 본문이 있어야 한다")
        if self.status != "GENERATED" and self.content is not None:
            # 빈 문자열·공백도 본문으로 전달되므로 None만 허용한다.
            raise ValueError("FAILED·NOT_GENERATED 초안의 본문은 None이어야 한다")
        if (self.status == "FAILED") != (self.failure is not None):
            raise ValueError("실패 정보는 FAILED일 때만 둔다")

    @classmethod
    def generated(cls, content: str) -> Self:
        return cls("GENERATED", content=content)

    @classmethod
    def failed(cls, code: str, message: str) -> Self:
        return cls("FAILED", failure=GenerationFailure(code, message))

    @classmethod
    def not_generated(cls) -> Self:
        return cls("NOT_GENERATED")


@dataclass(frozen=True)
class ReflectionOutcome:
    """본인용 최소 질문의 생성 상태. 질문은 GENERATED일 때만 있다."""

    status: GenerationStatus
    questions: tuple[str, ...] = ()
    failure: GenerationFailure | None = None

    def __post_init__(self) -> None:
        if self.status != "GENERATED" and self.questions:
            raise ValueError("질문은 GENERATED일 때만 둔다")
        if (self.status == "FAILED") != (self.failure is not None):
            raise ValueError("실패 정보는 FAILED일 때만 둔다")

    @classmethod
    def generated(cls, questions: tuple[str, ...]) -> Self:
        return cls("GENERATED", questions=questions)

    @classmethod
    def failed(cls, code: str, message: str) -> Self:
        return cls("FAILED", failure=GenerationFailure(code, message))

    @classmethod
    def not_generated(cls) -> Self:
        return cls("NOT_GENERATED")


@dataclass(frozen=True)
class EvidenceItem:
    source_url: str
    source_revision: str
    represented_facts: tuple[str, ...]
    contribution_scope: str
    coverage_limits: tuple[str, ...]


@dataclass(frozen=True)
class EligibleCandidate:
    """근거·본인 기여를 실패 영향과 분리해 확인한 후보.

    확인하지 못한 작업은 후보로 만들지 않고 NotProvided로 센다. #118은 제목을 만들지 않아
    title이 None이다. title이 None이거나 비어 있으면 결과 조합이 workFacts 첫 항목을 넣는다.
    계약 정정과 B·C·E 수정이 병합되기 전까지의 임시 동작이며, 그 뒤 뺀다(2026-10-08 결정 문서
    「담당과 순서」 ③).
    """

    work_identity: str
    title: str | None
    work_facts: tuple[str, ...]
    subject_contribution: str
    grouping_basis: str
    grouping_limitations: tuple[str, ...]
    evidence: tuple[EvidenceItem, ...]
    draft: DraftOutcome
    reflection: ReflectionOutcome

    def __post_init__(self) -> None:
        if not _has_text(self.work_identity):
            raise ValueError("후보에는 workIdentity가 있어야 한다")
        if not self.work_facts or not all(map(_has_text, self.work_facts)):
            raise ValueError("후보에는 확인된 작업 사실이 있어야 한다")
        if not _has_text(self.subject_contribution):
            raise ValueError("후보에는 본인 기여가 있어야 한다")
        if not _has_text(self.grouping_basis):
            raise ValueError("후보에는 묶음 이유가 있어야 한다")
        if not self.evidence:
            raise ValueError("후보에는 근거가 하나 이상 있어야 한다")


@dataclass(frozen=True)
class NotProvided:
    """후보로 제공하지 않은 작업 수. 오류가 아니다."""

    reason: NotProvidedReason
    count: int


@dataclass(frozen=True)
class StageFailure:
    stage: GeneratorFailureStage
    code: str
    message: str


@dataclass(frozen=True)
class GenerationOutput:
    candidates: tuple[EligibleCandidate, ...] = ()
    not_provided: tuple[NotProvided, ...] = ()
    failures: tuple[StageFailure, ...] = ()


class Generator(Protocol):
    """요청 하나의 수집·후보·초안·질문을 만든다.

    수집·생성 중 확인한 오류는 결과(failures, 후보의 생성 상태)로 돌려준다. 실행 여부를
    확인하지 못하면 ExecutionUnknown이나 TimeoutError를 낸다. 스스로 다시 시도하지 않는다.
    """

    @property
    def source_mode(self) -> SourceMode: ...

    def generate(self, request: CheckedRequest) -> GenerationOutput: ...
