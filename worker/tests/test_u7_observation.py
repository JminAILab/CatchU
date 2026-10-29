"""C4 본인 커밋 관측: 후보 수와 분리한 실제 숫자 ID 기준 판정."""

from dataclasses import replace

import pytest
from candidate_scenarios import ROOT, Scenario, commit, root_commit, run_case
from github_synthetic import MEMBER, OTHER, sha

from app.collection import CollectionOutcome, GitHubAccount
from app.collection.records import CoverageLimit
from app.processing import GenerationOutput


def test_complete_no_own_commit_is_none() -> None:
    run = run_case(Scenario(default_branch=(root_commit(),)))
    assert run.result["ownCommitObservation"] == "NONE"
    assert run.result["observedOwnCommitCount"] == 0
    assert run.result["candidates"] == []


def test_numeric_identity_finds_commit_even_after_login_rename() -> None:
    own = commit(sha(2), GitHubAccount("renamed", MEMBER.account_id), parents=(ROOT,))
    run = run_case(Scenario(default_branch=(own, root_commit()), lookups={own.sha: ()}))
    assert run.result["ownCommitObservation"] == "FOUND"
    assert run.result["observedOwnCommitCount"] == 1


def test_complete_zero_own_commits_drops_otherwise_eligible_candidates() -> None:
    own = commit(sha(2), MEMBER, parents=(ROOT,))
    with_candidate = run_case(
        Scenario(default_branch=(own, root_commit()), lookups={own.sha: ()})
    )
    assert with_candidate.output.candidates
    no_own = run_case(Scenario(default_branch=(root_commit(),)))
    output = no_own.outcome.with_observation(with_candidate.output)
    assert output.own_commit_observation == "NONE"
    assert output.candidates == ()


def test_same_login_with_different_numeric_id_is_not_own() -> None:
    other = commit(
        sha(2), GitHubAccount(MEMBER.login, OTHER.account_id), parents=(ROOT,)
    )
    run = run_case(Scenario(default_branch=(other, root_commit())))
    assert run.result["ownCommitObservation"] == "NONE"


def test_unverified_empty_collection_is_unknown() -> None:
    outcome = CollectionOutcome(frozenset({"COMMIT"}), "synthetic-selection")
    output = outcome.with_observation(GenerationOutput())
    assert output.own_commit_observation == "UNKNOWN"
    assert output.observed_own_commit_count is None
    assert output.collection_limit_notes


def test_collection_limit_makes_zero_unknown() -> None:
    run = run_case(Scenario(default_branch=(root_commit(),)))
    limited = replace(
        run.outcome, coverage_limits=(CoverageLimit("COMMIT", "목록 상한"),)
    )
    output = limited.with_observation(GenerationOutput())
    assert output.own_commit_observation == "UNKNOWN"
    assert output.observed_own_commit_count is None


def test_missing_author_makes_zero_unknown() -> None:
    run = run_case(Scenario(default_branch=(root_commit(),)))
    missing = replace(
        run.outcome, commits=(replace(run.outcome.commits[0], author=None),)
    )
    assert (
        missing.with_observation(GenerationOutput()).own_commit_observation == "UNKNOWN"
    )


def test_found_survives_no_candidate_and_deduplicates_commit_sha() -> None:
    own = commit(sha(2), MEMBER, parents=(ROOT,))
    run = run_case(Scenario(default_branch=(own, root_commit()), lookups={own.sha: ()}))
    repeated = replace(run.outcome, commits=run.outcome.commits * 2)
    output = repeated.with_observation(GenerationOutput())
    assert output.candidates == ()
    assert output.own_commit_observation == "FOUND"
    assert output.observed_own_commit_count == 1


def test_generation_output_rejects_invalid_observation_combinations() -> None:
    for state, count in [
        ("NONE", None),
        ("FOUND", None),
        ("FOUND", 0),
        ("UNKNOWN", 0),
        ("NONE", True),
    ]:
        with pytest.raises(ValueError):
            GenerationOutput(
                own_commit_observation=state, observed_own_commit_count=count
            )  # type: ignore[arg-type]
