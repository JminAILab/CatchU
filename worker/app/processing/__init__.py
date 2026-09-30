"""분석 요청 검사와 제공자 비종속 생성 결과의 처리 경계."""

from app.processing.fake_generator import SCENARIOS, FakeGenerator
from app.processing.generation import (
    DraftOutcome,
    EligibleCandidate,
    EvidenceItem,
    ExecutionUnknown,
    GenerationFailure,
    GenerationOutput,
    Generator,
    NotProvided,
    ReflectionOutcome,
    StageFailure,
)
from app.processing.pipeline import (
    ContractViolation,
    Finished,
    ProcessingOutcome,
    Uncertain,
    process_request,
)
from app.processing.request_check import (
    AcceptedContext,
    CheckedRequest,
    Rejected,
    RejectReason,
    check_request,
)
from app.processing.result import compose_result, outcome_for
from app.processing.synthetic import synthetic_accepted_context, synthetic_request

__all__ = [
    "SCENARIOS",
    "AcceptedContext",
    "CheckedRequest",
    "ContractViolation",
    "DraftOutcome",
    "EligibleCandidate",
    "EvidenceItem",
    "ExecutionUnknown",
    "FakeGenerator",
    "Finished",
    "GenerationFailure",
    "GenerationOutput",
    "Generator",
    "NotProvided",
    "ProcessingOutcome",
    "ReflectionOutcome",
    "RejectReason",
    "Rejected",
    "StageFailure",
    "Uncertain",
    "check_request",
    "compose_result",
    "outcome_for",
    "process_request",
    "synthetic_accepted_context",
    "synthetic_request",
]
