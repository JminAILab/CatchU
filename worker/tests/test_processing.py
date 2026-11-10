import json
import logging
import socket
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from app.contract import FIXTURE_DIR, Verdict, check_message, fill_template
from app.processing import (
    SCENARIOS,
    CheckedRequest,
    DraftOutcome,
    EligibleCandidate,
    ExecutionUnknown,
    FakeGenerator,
    Finished,
    GenerationFailure,
    GenerationOutput,
    NotProvided,
    ProcessingOutcome,
    ReflectionOutcome,
    Rejected,
    RejectReason,
    StageFailure,
    Uncertain,
    check_request,
    compose_result,
    outcome_for,
    process_request,
    synthetic_accepted_context,
    synthetic_request,
)
from app.processing.__main__ import main
from app.processing.generation import GenerationStatus
from app.processing.request_check import AcceptedContext, SourceMode


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


ACCEPTED = synthetic_accepted_context()
CHECKED = check_request(synthetic_request(ACCEPTED), ACCEPTED)
assert isinstance(CHECKED, CheckedRequest)
# M1 합성 결과 세트의 접수 값과 사례표.
CONTEXT: dict[str, str] = _read_json(FIXTURE_DIR / "context.sample.json")["values"]
CASES: dict[str, Any] = _read_json(FIXTURE_DIR / "cases.json")
CASE_BY_ID = {case["caseId"]: case for case in CASES["cases"]}
# 합성 결과 세트의 결과 템플릿을 그대로 쓰는 시나리오.
SHARED_SCENARIOS = [
    "succeeded-one-candidate",
    "empty",
    "partial-failed",
    "failed",
    "two-candidates-same-work",
]
FINISHING_SCENARIOS = [name for name in SCENARIOS if name != "execution-unknown"]
FINISHED_AT = datetime(2026, 10, 1, 0, 30, tzinfo=UTC)
BASE_CANDIDATE = (
    FakeGenerator("succeeded-one-candidate").generate(CHECKED).candidates[0]
)


class StubGenerator:
    """정해진 출력이나 예외를 돌려주고 호출 횟수를 센다."""

    def __init__(
        self,
        output: GenerationOutput | None = None,
        error: BaseException | None = None,
        source_mode: SourceMode = "MOCK",
    ) -> None:
        self.output = output or GenerationOutput()
        self.error = error
        self._source_mode = source_mode
        self.calls = 0

    @property
    def source_mode(self) -> SourceMode:
        return self._source_mode

    def generate(self, request: CheckedRequest) -> GenerationOutput:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.output


def _run(
    generator: FakeGenerator | StubGenerator,
    *,
    message: object | None = None,
    accepted: AcceptedContext = ACCEPTED,
    label: str = "test",
) -> tuple[ProcessingOutcome, list[dict[str, Any]]]:
    events: list[dict[str, Any]] = []
    outcome = process_request(
        synthetic_request(accepted) if message is None else message,
        accepted=accepted,
        generator=generator,
        emit=events.append,
        clock=lambda: FINISHED_AT,
        id_label=label,
    )
    return outcome, events


def _finish(scenario: str) -> dict[str, Any]:
    outcome, _ = _run(FakeGenerator(scenario), label=scenario)
    assert isinstance(outcome, Finished)
    return outcome.result


def _result_of(output: GenerationOutput) -> dict[str, Any]:
    outcome, _ = _run(StubGenerator(output))
    assert isinstance(outcome, Finished)
    return outcome.result


def _states(events: list[dict[str, Any]]) -> list[str]:
    return [event["state"] for event in events]


# 요청 검사 · 요청 맥락 유지 · MOCK 표시


@pytest.mark.parametrize(
    "message",
    [
        {
            **synthetic_request(ACCEPTED),
            "memberId": "00000000-0000-4000-8000-000000000999",
        },
        {
            **synthetic_request(ACCEPTED),
            "attemptId": "00000000-0000-4000-8000-000000000999",
        },
        {**synthetic_request(ACCEPTED), "consentedAt": "2026-10-01"},
        [],
    ],
    ids=["context-mismatch", "stale-attempt", "schema-invalid", "not-object"],
)
def test_rejected_request_is_not_processed(message: object) -> None:
    generator = StubGenerator()

    outcome, events = _run(generator, message=message)

    assert isinstance(outcome, Rejected)
    assert events == []
    assert generator.calls == 0


def test_live_request_is_not_answered_by_mock_generator() -> None:
    accepted = replace(ACCEPTED, source_mode="LIVE")
    generator = StubGenerator(source_mode="MOCK")

    outcome, events = _run(generator, accepted=accepted)

    assert outcome == Rejected(RejectReason.CONTEXT_MISMATCH, ("/sourceMode",))
    assert events == []
    assert generator.calls == 0


@pytest.mark.parametrize("scenario", FINISHING_SCENARIOS)
def test_result_follows_contract_and_keeps_request_context(scenario: str) -> None:
    result = _finish(scenario)

    assert check_message("Result", result).verdict is Verdict.VALID
    for field, value in CONTEXT.items():
        assert result[field] == value
    assert result["sourceMode"] == "MOCK"


@pytest.mark.parametrize("scenario", SHARED_SCENARIOS)
def test_fake_result_matches_shared_synthetic_case(scenario: str) -> None:
    template = _read_json(FIXTURE_DIR / "results" / f"{scenario}.json")

    result = _finish(scenario)

    assert result == fill_template(template, {**CONTEXT, "caseId": scenario})
    expected = CASE_BY_ID[scenario]["messages"][0]["expected"]["processingAfter"]
    assert result["outcome"] == expected


@pytest.mark.parametrize("scenario", FINISHING_SCENARIOS)
def test_synthetic_result_is_version_three_with_own_commits(scenario: str) -> None:
    """합성(MOCK) 결과도 같은 규칙: 판본 "3", 후보마다 합성 수집 결과의 본인 커밋 SHA(CR2 BR2.1·BR2.2)."""
    result = _finish(scenario)

    assert result["schemaVersion"] == "3"
    for candidate in result["candidates"]:
        assert candidate["ownCommitShas"]


def test_composed_candidate_carries_own_commit_shas_in_order() -> None:
    template = _read_json(FIXTURE_DIR / "results" / "succeeded-one-candidate.json")
    shas = ("c" * 40, "a" * 40, "b" * 40)
    request = CHECKED
    assert isinstance(request, CheckedRequest)
    output = FakeGenerator("succeeded-one-candidate").generate(request)
    changed = replace(
        output, candidates=(replace(output.candidates[0], own_commit_shas=shas),)
    )
    result = compose_result(request, changed, finished_at=FINISHED_AT, id_label="x")
    assert result["candidates"][0]["ownCommitShas"] == list(shas)
    assert check_message("Result", result).verdict is Verdict.VALID
    assert template["candidates"][0]["ownCommitShas"] != list(shas)


# 종결값 · notProvided와 failures


@pytest.mark.parametrize(
    ("candidates", "failures", "outcome"),
    [
        (1, 0, "SUCCEEDED"),
        (2, 0, "SUCCEEDED"),
        (0, 0, "EMPTY"),
        (1, 1, "PARTIAL_FAILED"),
        (0, 1, "FAILED"),
        (0, 2, "FAILED"),
    ],
)
def test_outcome_follows_candidate_and_failure_counts(
    candidates: int, failures: int, outcome: str
) -> None:
    assert outcome_for(candidates, failures) == outcome


def test_insufficient_evidence_and_below_criteria_are_not_failures() -> None:
    result = _result_of(
        GenerationOutput(
            not_provided=(
                NotProvided("INSUFFICIENT_EVIDENCE", 1),
                NotProvided("BELOW_CRITERIA", 2),
            )
        )
    )

    assert result["outcome"] == "EMPTY"
    assert result["failures"] == []
    assert result["notProvided"] == [
        {"reason": "INSUFFICIENT_EVIDENCE", "count": 1},
        {"reason": "BELOW_CRITERIA", "count": 2},
    ]


def test_collection_error_is_a_failure_not_a_missing_candidate() -> None:
    result = _result_of(
        GenerationOutput(
            not_provided=(NotProvided("BELOW_CRITERIA", 1),),
            failures=(
                StageFailure(
                    "COLLECTION", "COLLECTION_FETCH_FAILED", "합성 실패: 수집 오류"
                ),
            ),
        )
    )

    assert result["outcome"] == "FAILED"
    assert result["failures"] == [
        {
            "stage": "COLLECTION",
            "code": "COLLECTION_FETCH_FAILED",
            "message": "합성 실패: 수집 오류",
        }
    ]
    assert result["notProvided"] == [{"reason": "BELOW_CRITERIA", "count": 1}]


# 적합 후보의 내용


@pytest.mark.parametrize("scenario", FINISHING_SCENARIOS)
def test_candidates_carry_evidence_facts_contribution_and_limits(scenario: str) -> None:
    result = _finish(scenario)

    for candidate in result["candidates"]:
        assert candidate["evidence"]
        assert candidate["workFacts"]
        assert candidate["subjectContribution"]
        assert candidate["groupingBasis"]
        assert candidate["groupingLimitations"]
        assert all(
            evidence["representedFacts"] and evidence["coverageLimits"]
            for evidence in candidate["evidence"]
        )
        assert candidate["eligibility"] == {
            "workFactsVerified": True,
            "contributionVerified": True,
            "independentOfFailures": True,
        }
        assert candidate["workIdentity"].startswith(f"synthetic-work-{scenario}-")
    candidate_ids = {candidate["candidateId"] for candidate in result["candidates"]}
    linked = {f["candidateId"] for f in result["failures"] if "candidateId" in f}
    assert linked <= candidate_ids


@pytest.mark.parametrize(
    "change",
    [
        {"evidence": ()},
        {"work_facts": ()},
        {"work_facts": (" ",)},
        {"subject_contribution": ""},
        {"grouping_basis": " "},
        {"work_identity": ""},
    ],
    ids=str,
)
def test_candidate_without_evidence_facts_or_contribution_cannot_be_made(
    change: dict[str, Any],
) -> None:
    with pytest.raises(ValueError):
        replace(BASE_CANDIDATE, **change)


# 초안·질문 실패와 null 초안


def test_draft_failure_keeps_candidate_with_null_draft() -> None:
    result = _finish("draft-failed")

    (candidate,) = result["candidates"]
    assert candidate["draft"] == {"status": "FAILED", "content": None}
    assert candidate["reflection"]["status"] == "GENERATED"
    assert result["failures"] == [
        {
            "stage": "DRAFT",
            "code": "DRAFT_FAILED",
            "message": "합성 실패: 설명 초안을 만들지 못했다",
            "candidateId": candidate["candidateId"],
        }
    ]
    assert result["outcome"] == "PARTIAL_FAILED"


def test_reflection_failure_keeps_candidate_without_questions() -> None:
    result = _finish("reflection-failed")

    (candidate,) = result["candidates"]
    assert candidate["reflection"] == {"status": "FAILED", "questions": []}
    assert candidate["draft"]["status"] == "GENERATED"
    assert [(f["stage"], f["candidateId"]) for f in result["failures"]] == [
        ("REFLECTION", candidate["candidateId"])
    ]
    assert result["outcome"] == "PARTIAL_FAILED"


def test_not_generated_draft_is_null_and_not_a_failure() -> None:
    result = _finish("two-candidates-same-work")

    first, second = result["candidates"]
    assert first["workIdentity"] == second["workIdentity"]
    assert second["draft"] == {"status": "NOT_GENERATED", "content": None}
    assert result["failures"] == []
    assert result["outcome"] == "SUCCEEDED"


DRAFT_FAILURE = GenerationFailure("DRAFT_FAILED", "합성 실패")


@pytest.mark.parametrize("content", [None, "", "   "])
def test_generated_draft_needs_text(content: str | None) -> None:
    with pytest.raises(ValueError):
        DraftOutcome("GENERATED", content=content)


@pytest.mark.parametrize("content", ["", "   ", "합성 본문"])
@pytest.mark.parametrize("status", ["FAILED", "NOT_GENERATED"])
def test_draft_without_generation_has_null_content(
    status: GenerationStatus, content: str
) -> None:
    failure = DRAFT_FAILURE if status == "FAILED" else None
    with pytest.raises(ValueError):
        DraftOutcome(status, content=content, failure=failure)


@pytest.mark.parametrize(
    ("draft", "status", "content"),
    [
        (DraftOutcome("GENERATED", content="합성 본문"), "GENERATED", "합성 본문"),
        (DraftOutcome("FAILED", failure=DRAFT_FAILURE), "FAILED", None),
        (DraftOutcome("NOT_GENERATED"), "NOT_GENERATED", None),
        (DraftOutcome.generated("합성 본문"), "GENERATED", "합성 본문"),
        (DraftOutcome.failed("DRAFT_FAILED", "합성 실패"), "FAILED", None),
        (DraftOutcome.not_generated(), "NOT_GENERATED", None),
    ],
)
def test_valid_draft_outcomes_are_kept(
    draft: DraftOutcome, status: str, content: str | None
) -> None:
    candidate = replace(BASE_CANDIDATE, draft=draft)

    result = _result_of(GenerationOutput(candidates=(candidate,)))

    assert result["candidates"][0]["draft"] == {"status": status, "content": content}


def test_failure_detail_belongs_only_to_failed_draft() -> None:
    with pytest.raises(ValueError):
        DraftOutcome("FAILED")
    with pytest.raises(ValueError):
        DraftOutcome("NOT_GENERATED", failure=DRAFT_FAILURE)
    with pytest.raises(ValueError):
        DraftOutcome("GENERATED", content="합성 본문", failure=DRAFT_FAILURE)


def test_questions_exist_only_when_generated() -> None:
    with pytest.raises(ValueError):
        ReflectionOutcome("NOT_GENERATED", questions=("합성 질문",))


# 제목


def test_title_failure_sends_null_title() -> None:
    result = _finish("title-failed")

    (candidate,) = result["candidates"]
    assert candidate["title"] is None
    assert result["failures"] == []
    assert result["outcome"] == "SUCCEEDED"


@pytest.mark.parametrize("title", [None, "", "   "])
def test_blank_title_is_sent_as_null(title: str | None) -> None:
    candidate: EligibleCandidate = replace(BASE_CANDIDATE, title=title)

    result = _result_of(GenerationOutput(candidates=(candidate,)))

    assert result["candidates"][0]["title"] is None


# 진행 관측과 실행 불명


def test_finished_processing_reports_received_then_running() -> None:
    outcome, events = _run(
        FakeGenerator("succeeded-one-candidate"), label="progress-events"
    )

    assert isinstance(outcome, Finished)
    assert _states(events) == ["RECEIVED", "RUNNING"]
    assert all(
        check_message("ProcessingEvent", event).verdict is Verdict.VALID
        for event in events
    )
    running = fill_template(
        _read_json(FIXTURE_DIR / "events/running.json"),
        {**CONTEXT, "caseId": "progress-events"},
    )
    assert {**events[1], "observedAt": running["observedAt"]} == running


@pytest.mark.parametrize(
    "error",
    [ExecutionUnknown("합성: 실행 상태 조회 오류"), TimeoutError("합성: 시간 초과")],
    ids=["lookup-error", "timeout"],
)
def test_unknown_execution_is_not_failed_or_retried(error: BaseException) -> None:
    generator = StubGenerator(error=error)

    outcome, events = _run(generator, label="progress-events")

    assert outcome == Uncertain()
    assert _states(events) == ["RECEIVED", "RUNNING", "UNCERTAIN"]
    assert generator.calls == 1
    uncertain = fill_template(
        _read_json(FIXTURE_DIR / "events/uncertain.json"),
        {**CONTEXT, "caseId": "progress-events"},
    )
    assert {**events[2], "observedAt": uncertain["observedAt"]} == uncertain


def test_fake_execution_unknown_scenario_gives_no_result() -> None:
    outcome, events = _run(FakeGenerator("execution-unknown"))

    assert outcome == Uncertain()
    assert _states(events)[-1] == "UNCERTAIN"


def test_unexpected_error_is_not_turned_into_a_result() -> None:
    generator = StubGenerator(error=RuntimeError("합성 결함"))
    events: list[dict[str, Any]] = []

    with pytest.raises(RuntimeError):
        process_request(
            synthetic_request(ACCEPTED),
            accepted=ACCEPTED,
            generator=generator,
            emit=events.append,
            clock=lambda: FINISHED_AT,
            id_label="test",
        )

    assert _states(events) == ["RECEIVED", "RUNNING"]
    assert generator.calls == 1


# 외부 호출 없음 · 로그 · 개발용 실행


@pytest.fixture
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*args: object, **kwargs: object) -> None:
        raise AssertionError("외부 연결 시도")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)


@pytest.mark.parametrize("scenario", list(SCENARIOS))
@pytest.mark.usefixtures("no_network")
def test_every_scenario_runs_without_network(scenario: str) -> None:
    outcome, _ = _run(FakeGenerator(scenario), label=scenario)

    assert isinstance(outcome, Finished | Uncertain)


def test_logs_leave_out_request_values(caplog: pytest.LogCaptureFixture) -> None:
    secret = "synthetic-do-not-log"
    with caplog.at_level(logging.INFO, logger="app.processing"):
        _run(
            StubGenerator(), message={**synthetic_request(ACCEPTED), "memberId": secret}
        )
        _run(
            StubGenerator(),
            message={
                **synthetic_request(ACCEPTED),
                "credentialContextReference": secret,
            },
        )

    assert "CONTEXT_MISMATCH" in caplog.text
    assert secret not in caplog.text


def test_cli_prints_events_and_mock_result(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["succeeded-one-candidate"]) == 0

    printed = json.loads(capsys.readouterr().out)
    assert _states(printed["events"]) == ["RECEIVED", "RUNNING"]
    assert printed["result"]["sourceMode"] == "MOCK"
    assert check_message("Result", printed["result"]).verdict is Verdict.VALID


def test_cli_prints_no_result_when_execution_is_unknown(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert main(["execution-unknown"]) == 0

    printed = json.loads(capsys.readouterr().out)
    assert _states(printed["events"])[-1] == "UNCERTAIN"
    assert printed["result"] is None


def test_unknown_scenario_is_refused() -> None:
    with pytest.raises(ValueError):
        FakeGenerator("not-a-scenario")
