"""생성 결과를 메시지 계약 v1의 종결 결과(Result)로 조합한다."""

from datetime import UTC, datetime
from typing import Any, Literal

from app.processing.generation import EligibleCandidate, GenerationOutput
from app.processing.request_check import CheckedRequest, UnverifiedRequest

Outcome = Literal["SUCCEEDED", "EMPTY", "PARTIAL_FAILED", "FAILED"]


def outcome_for(candidate_count: int, failure_count: int) -> Outcome:
    """후보·실패 수의 조합으로 종결값을 정한다(worker 규칙 BR3.3)."""
    if candidate_count:
        return "PARTIAL_FAILED" if failure_count else "SUCCEEDED"
    return "FAILED" if failure_count else "EMPTY"


def rfc3339(moment: datetime) -> str:
    if moment.tzinfo is None:
        raise ValueError("시각에는 시간대가 있어야 한다")
    return moment.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _failure(
    stage: str, code: str, message: str, candidate_id: str | None = None
) -> dict[str, str]:
    failure = {"stage": stage, "code": code, "message": message}
    if candidate_id is not None:
        failure["candidateId"] = candidate_id
    return failure


def _candidate(
    candidate: EligibleCandidate, candidate_id: str, evidence_prefix: str
) -> dict[str, Any]:
    title = candidate.title
    if title is None or not title.strip():
        # #118은 제목을 만들지 않아 title이 None이다. 지금 계약과 B·C·E는 빈 제목을 받지 않으므로
        # workFacts 첫 항목을 넣는다. 계약 정정과 B·C·E 수정이 병합되기 전까지의 임시 동작이며, 그
        # 뒤 뺀다(2026-10-08 결정 문서 「담당과 순서」 ③).
        title = candidate.work_facts[0]
    return {
        "candidateId": candidate_id,
        "title": title,
        "workIdentity": candidate.work_identity,
        "workFacts": list(candidate.work_facts),
        "subjectContribution": candidate.subject_contribution,
        "groupingBasis": candidate.grouping_basis,
        "groupingLimitations": list(candidate.grouping_limitations),
        "eligibility": {
            "workFactsVerified": True,
            "contributionVerified": True,
            "independentOfFailures": True,
        },
        "evidence": [
            {
                "evidenceId": f"{evidence_prefix}-{index}",
                "sourceUrl": evidence.source_url,
                "sourceRevision": evidence.source_revision,
                "representedFacts": list(evidence.represented_facts),
                "contributionScope": evidence.contribution_scope,
                "coverageLimits": list(evidence.coverage_limits),
            }
            for index, evidence in enumerate(candidate.evidence, start=1)
        ],
        "draft": {"status": candidate.draft.status, "content": candidate.draft.content},
        "reflection": {
            "status": candidate.reflection.status,
            "questions": list(candidate.reflection.questions),
        },
    }


def _envelope(
    request: CheckedRequest | UnverifiedRequest, id_label: str
) -> dict[str, Any]:
    """식별자와 요청 맥락. ID는 `<종류>-<id_label>-<attemptId>` 모양으로 결정적으로 만든다."""
    prefix = f"{id_label}-{request.attempt_id}"
    return {
        "schemaVersion": "1",
        "messageId": f"message-{prefix}-result",
        "resultId": f"result-{prefix}",
        "requestId": request.request_id,
        "attemptId": request.attempt_id,
        "memberId": request.member_id,
        "repositoryId": request.repository_id,
        "consentId": request.consent_id,
        "scopeRevision": request.scope_revision,
        "sourceMode": request.source_mode,
    }


def compose_result(
    request: CheckedRequest,
    output: GenerationOutput,
    *,
    finished_at: datetime,
    id_label: str,
) -> dict[str, Any]:
    """요청 맥락을 그대로 옮기고, 초안·질문 실패는 후보를 두고 failures에 더한다.

    합성 실행은 id_label에 사례 ID를 넣어 M1 합성 결과 세트와 같은 ID를 만든다.
    """
    prefix = f"{id_label}-{request.attempt_id}"
    candidates: list[dict[str, Any]] = []
    failures = [_failure(f.stage, f.code, f.message) for f in output.failures]
    for number, candidate in enumerate(output.candidates, start=1):
        candidate_id = f"candidate-{prefix}-{number}"
        candidates.append(
            _candidate(candidate, candidate_id, f"evidence-{prefix}-{number}")
        )
        for stage, failure in (
            ("DRAFT", candidate.draft.failure),
            ("REFLECTION", candidate.reflection.failure),
        ):
            if failure is not None:
                failures.append(
                    _failure(stage, failure.code, failure.message, candidate_id)
                )

    return {
        **_envelope(request, id_label),
        "outcome": outcome_for(len(candidates), len(failures)),
        "candidates": candidates,
        "notProvided": [
            {"reason": item.reason, "count": item.count} for item in output.not_provided
        ],
        "failures": failures,
        "finishedAt": rfc3339(finished_at),
    }


def compose_unresolved_result(
    request: UnverifiedRequest,
    *,
    code: str,
    message: str,
    finished_at: datetime,
    id_label: str,
) -> dict[str, Any]:
    """요청 정보 조회가 모름·실패인 요청의 결과: 수집하지 않은 FAILED, 수집 단계 실패 1건(#121).

    맥락 값은 대조하지 못한 메시지 값이다. 같은 시도의 다른 결과와 같은 ID 규칙을 쓴다.
    """
    return {
        **_envelope(request, id_label),
        "outcome": "FAILED",
        "candidates": [],
        "notProvided": [],
        "failures": [_failure("COLLECTION", code, message)],
        "finishedAt": rfc3339(finished_at),
    }
