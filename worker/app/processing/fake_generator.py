"""M1 합성 결과 세트의 템플릿으로 결과를 만드는 가짜 생성기.

외부 호출·제공자 SDK·API 키 없이 sourceMode=MOCK 결과만 만든다. 후보·근거 문구와
workIdentity는 합성 템플릿의 값을 그대로 쓰고, 템플릿의 종결값·ID는 쓰지 않는다
(결과 조합이 다시 정한다).
"""

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from typing import Any

from app.contract import FIXTURE_DIR, fill_template
from app.processing.generation import (
    DraftOutcome,
    EligibleCandidate,
    EvidenceItem,
    ExecutionUnknown,
    GenerationOutput,
    NotProvided,
    ReflectionOutcome,
    StageFailure,
)
from app.processing.request_check import CheckedRequest, SourceMode

# Failure.code는 계약에서 자유 문자열이다. 수집 실패 COLLECTION_FETCH_FAILED는 합성
# 결과 세트, DRAFT_FAILED는 E 수신 테스트가 쓰는 이름이고 질문 실패도 같은 모양으로 둔다.
DRAFT_FAILED = "DRAFT_FAILED"
REFLECTION_FAILED = "REFLECTION_FAILED"

Change = Callable[[GenerationOutput], GenerationOutput]


@dataclass(frozen=True)
class Scenario:
    template: str | None
    change: Change | None = None


def _first_candidate(
    change: Callable[[EligibleCandidate], EligibleCandidate],
) -> Change:
    def apply(output: GenerationOutput) -> GenerationOutput:
        first, *rest = output.candidates
        return replace(output, candidates=(change(first), *rest))

    return apply


_ONE_CANDIDATE = "results/succeeded-one-candidate.json"

SCENARIOS: Mapping[str, Scenario] = {
    "succeeded-one-candidate": Scenario(_ONE_CANDIDATE),
    "empty": Scenario("results/empty.json"),
    "partial-failed": Scenario("results/partial-failed.json"),
    "failed": Scenario("results/failed.json"),
    "two-candidates-same-work": Scenario("results/two-candidates-same-work.json"),
    "draft-failed": Scenario(
        _ONE_CANDIDATE,
        _first_candidate(
            lambda candidate: replace(
                candidate,
                draft=DraftOutcome.failed(
                    DRAFT_FAILED, "합성 실패: 설명 초안을 만들지 못했다"
                ),
            )
        ),
    ),
    "reflection-failed": Scenario(
        _ONE_CANDIDATE,
        _first_candidate(
            lambda candidate: replace(
                candidate,
                reflection=ReflectionOutcome.failed(
                    REFLECTION_FAILED, "합성 실패: 생각해볼 질문을 만들지 못했다"
                ),
            )
        ),
    ),
    "title-failed": Scenario(
        _ONE_CANDIDATE,
        _first_candidate(lambda candidate: replace(candidate, title=None)),
    ),
    "execution-unknown": Scenario(None),
}


def _draft(item: Mapping[str, Any]) -> DraftOutcome:
    if item["status"] == "GENERATED":
        return DraftOutcome.generated(item["content"])
    if item["status"] == "NOT_GENERATED":
        return DraftOutcome.not_generated()
    raise ValueError(f"합성 템플릿에 없는 초안 상태: {item['status']}")


def _reflection(item: Mapping[str, Any]) -> ReflectionOutcome:
    if item["status"] == "GENERATED":
        return ReflectionOutcome.generated(tuple(item["questions"]))
    if item["status"] == "NOT_GENERATED":
        return ReflectionOutcome.not_generated()
    raise ValueError(f"합성 템플릿에 없는 질문 상태: {item['status']}")


def _candidate(item: Mapping[str, Any]) -> EligibleCandidate:
    return EligibleCandidate(
        work_identity=item["workIdentity"],
        title=item["title"],
        work_facts=tuple(item["workFacts"]),
        subject_contribution=item["subjectContribution"],
        grouping_basis=item["groupingBasis"],
        grouping_limitations=tuple(item["groupingLimitations"]),
        evidence=tuple(
            EvidenceItem(
                source_url=evidence["sourceUrl"],
                source_revision=evidence["sourceRevision"],
                represented_facts=tuple(evidence["representedFacts"]),
                contribution_scope=evidence["contributionScope"],
                coverage_limits=tuple(evidence["coverageLimits"]),
            )
            for evidence in item["evidence"]
        ),
        draft=_draft(item["draft"]),
        reflection=_reflection(item["reflection"]),
        # 합성 수집 결과의 본인 커밋 SHA. 실제 방식과 같은 규칙으로 싣는다(CR2 BR2.1).
        own_commit_shas=tuple(item["ownCommitShas"]),
    )


def _output(parts: Mapping[str, Any]) -> GenerationOutput:
    return GenerationOutput(
        candidates=tuple(_candidate(item) for item in parts["candidates"]),
        not_provided=tuple(
            NotProvided(item["reason"], item["count"]) for item in parts["notProvided"]
        ),
        failures=tuple(
            StageFailure(item["stage"], item["code"], item["message"])
            for item in parts["failures"]
        ),
    )


class FakeGenerator:
    """정해진 합성 시나리오 하나의 결과를 만든다. 같은 요청에는 항상 같은 결과다."""

    def __init__(self, scenario: str) -> None:
        if scenario not in SCENARIOS:
            raise ValueError(f"알 수 없는 합성 시나리오: {scenario}")
        self.scenario = scenario

    @property
    def source_mode(self) -> SourceMode:
        return "MOCK"

    def generate(self, request: CheckedRequest) -> GenerationOutput:
        spec = SCENARIOS[self.scenario]
        if spec.template is None:
            raise ExecutionUnknown("합성 실행 불명: 실행 상태를 확인하지 못했다")
        template = json.loads((FIXTURE_DIR / spec.template).read_text("utf-8"))
        # 후보·미제공·실패 부분에는 사례 ID와 시도 ID 자리표시자만 있다.
        parts = fill_template(
            {key: template[key] for key in ("candidates", "notProvided", "failures")},
            {"caseId": self.scenario, "attemptId": request.attempt_id},
        )
        output = _output(parts)
        return spec.change(output) if spec.change else output
