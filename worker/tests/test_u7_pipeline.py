"""I4/C4 관측·실패·한계를 생성과 종결 메시지까지 보존한다."""

from dataclasses import replace

from candidate_scenarios import LIVE, ROOT, Scenario, commit, root_commit, run_case
from generation_scenarios import ScriptedProvider, generation_case, naive
from github_synthetic import MEMBER, sha

from app.contract import Verdict, check_message
from app.generation.provider import ProviderError


def scenario() -> Scenario:
    own = commit(sha(42), MEMBER, parents=(ROOT,))
    return Scenario(default_branch=(own, root_commit()), lookups={own.sha: ()})


def test_generation_keeps_found_observation() -> None:
    run = generation_case(scenario(), ScriptedProvider(naive))
    assert run.result["ownCommitObservation"] == "FOUND"
    assert run.result["observedOwnCommitCount"] == 1
    assert len(run.provider.generate_requests()) == 1


def test_generation_failure_keeps_observation_without_retry() -> None:
    run = generation_case(scenario(), ScriptedProvider(ProviderError("synthetic")))
    assert run.result["ownCommitObservation"] == "FOUND"
    assert run.result["observedOwnCommitCount"] == 1
    assert run.result["outcome"] == "PARTIAL_FAILED"
    assert len(run.provider.requests) == 1


def test_refused_before_collection_is_unknown_failed() -> None:
    run = run_case(
        Scenario(), request=replace(LIVE, allowed_resource_types=frozenset())
    )
    assert run.result["outcome"] == "FAILED"
    assert run.result["ownCommitObservation"] == "UNKNOWN"
    assert run.result["observedOwnCommitCount"] is None
    assert run.result["collectionLimitNotes"]


def test_v2_required_fields_and_invalid_combinations_match_api() -> None:
    valid = run_case(scenario()).result
    for field in (
        "ownCommitObservation",
        "observedOwnCommitCount",
        "collectionLimitNotes",
    ):
        bad = dict(valid)
        del bad[field]
        assert check_message("Result", bad).verdict is Verdict.SCHEMA_INVALID
    for patch in (
        {"schemaVersion": "1"},
        {"extra": True},
        {"observedOwnCommitCount": None},
        {"ownCommitObservation": "NONE", "observedOwnCommitCount": 0},
    ):
        assert (
            check_message("Result", {**valid, **patch}).verdict
            is Verdict.SCHEMA_INVALID
        )
