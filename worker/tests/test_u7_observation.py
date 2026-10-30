"""C4 본인 커밋 관측: 후보 수와 분리한 실제 숫자 ID 기준 판정."""

from dataclasses import replace
from typing import Literal

import pytest
from candidate_scenarios import (
    ROOT,
    Pull,
    Scenario,
    commit,
    live_request,
    root_commit,
    run_case,
)
from github_synthetic import MEMBER, OTHER, oversized, pull_commits_path, respond, sha

from app.collection import CollectionOutcome, GitHubAccount
from app.collection.records import CoverageLimit, DetailStatus
from app.processing import GenerationOutput


def test_complete_no_own_commit_is_none() -> None:
    run = run_case(Scenario(default_branch=(root_commit(),)))
    assert run.result["ownCommitObservation"] == "NONE"
    assert run.result["observedOwnCommitCount"] == 0
    assert run.result["candidates"] == []


@pytest.mark.parametrize("known_own", [False, True])
@pytest.mark.parametrize(
    "status", [DetailStatus.OVERSIZED, DetailStatus.REVISION_MISMATCH]
)
def test_unread_pr_commits_preserve_uncertainty_and_confirmed_own_commits(
    status: DetailStatus, known_own: bool
) -> None:
    unread = commit(sha(2), MEMBER, parents=(ROOT,))
    known = commit(sha(4), MEMBER, parents=(ROOT,))
    unlinked = commit(sha(5), None, parents=(ROOT,))
    pull = Pull(
        10,
        OTHER,
        commits=(unread,),
        state="open",
        head=sha(3) if status is DetailStatus.REVISION_MISMATCH else None,
    )
    run = run_case(
        Scenario(
            default_branch=(
                (known, unlinked, root_commit())
                if known_own
                else (unlinked, root_commit())
            ),
            pulls=(pull,),
            lookups={known.sha: ()} if known_own else {},
            overrides=(
                {pull_commits_path(10): oversized()}
                if status is DetailStatus.OVERSIZED
                else {}
            ),
        ),
        request=live_request("COMMIT", "PULL_REQUEST"),
    )
    assert run.outcome.completed
    assert run.outcome.failures == ()
    assert run.outcome.coverage_limits == ()
    assert run.outcome.relations is not None
    (listing,) = run.outcome.relations.pull_request_commits
    assert listing.status is status
    assert not listing.complete
    assert listing.commits == ()
    assert run.result["ownCommitObservation"] == ("FOUND" if known_own else "UNKNOWN")
    assert run.result["observedOwnCommitCount"] == (1 if known_own else None)
    assert run.result["collectionLimitNotes"]
    assert (
        "작성자 계정을 확인하지 못한 커밋이 있습니다."
        not in run.result["collectionLimitNotes"]
    )


@pytest.mark.parametrize("known_own", [False, True])
def test_partial_pr_commits_keep_listing_limit_and_confirmed_own_commit(
    known_own: bool,
) -> None:
    # 포크 PR의 250건 상한: 받은 목록 안의 본인 커밋은 여전히 유효하다.
    commits = tuple(
        commit(
            sha(3000 + index),
            MEMBER if known_own and index == 0 else OTHER,
            parents=(ROOT if index == 0 else sha(2999 + index),),
        )
        for index in range(250)
    )
    run = run_case(
        Scenario(
            default_branch=(root_commit(),),
            pulls=(Pull(10, OTHER, commits=commits, state="open", fork=True),),
            overrides={
                pull_commits_path(10, page): respond(
                    [entry.item for entry in commits[start : start + 100]],
                    next_page=page < 3,
                )
                for page, start in enumerate(range(0, 250, 100), 1)
            },
        ),
        request=live_request("COMMIT", "PULL_REQUEST"),
    )
    assert run.outcome.completed
    assert run.outcome.failures == ()
    assert run.outcome.coverage_limits == ()
    assert run.outcome.relations is not None
    (listing,) = run.outcome.relations.pull_request_commits
    assert listing.status is DetailStatus.FETCHED
    assert not listing.complete
    assert listing.limits
    assert len(listing.commits) == 250
    assert run.result["ownCommitObservation"] == ("FOUND" if known_own else "UNKNOWN")
    assert run.result["observedOwnCommitCount"] == (1 if known_own else None)
    assert set(listing.limits) <= set(run.result["collectionLimitNotes"])


@pytest.mark.parametrize("empty_listing", [False, True])
def test_complete_pr_without_own_commits_is_none(empty_listing: bool) -> None:
    commits = () if empty_listing else (commit(sha(2), OTHER, parents=(ROOT,)),)
    run = run_case(
        Scenario(
            default_branch=(root_commit(),),
            pulls=(
                Pull(
                    10,
                    OTHER,
                    commits=commits,
                    state="open",
                    head=ROOT if empty_listing else None,
                    base_sha=ROOT,
                ),
            ),
        ),
        request=live_request("COMMIT", "PULL_REQUEST"),
    )
    assert run.outcome.relations is not None
    (listing,) = run.outcome.relations.pull_request_commits
    assert listing.status is DetailStatus.FETCHED
    assert listing.complete
    assert listing.limits == ()
    assert run.result["ownCommitObservation"] == "NONE"
    assert run.result["observedOwnCommitCount"] == 0
    assert run.result["collectionLimitNotes"] == []
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


@pytest.mark.parametrize("known_own", [False, True])
@pytest.mark.parametrize("unlinked_in_pull", [False, True])
def test_unlinked_author_does_not_block_complete_own_commit_observation(
    known_own: bool, unlinked_in_pull: bool
) -> None:
    unlinked = commit(sha(2), None, parents=(ROOT,))
    known = commit(sha(4), MEMBER, parents=(ROOT,))
    default_branch = (root_commit(),) if unlinked_in_pull else (unlinked, root_commit())
    if known_own:
        default_branch = (known, *default_branch)
    run = run_case(
        Scenario(
            default_branch=default_branch,
            pulls=(
                (Pull(10, OTHER, commits=(unlinked,), state="open", base_sha=ROOT),)
                if unlinked_in_pull
                else ()
            ),
            lookups={known.sha: ()} if known_own else {},
        ),
        request=live_request("COMMIT", "PULL_REQUEST"),
    )
    assert run.outcome.completed
    assert run.outcome.own_commits_checked
    assert run.outcome.relations is not None
    records = (*run.outcome.commits, *run.outcome.relations.commits)
    assert any(
        record.sha == unlinked.sha and record.author is None for record in records
    )
    assert run.result["ownCommitObservation"] == ("FOUND" if known_own else "NONE")
    assert run.result["observedOwnCommitCount"] == (1 if known_own else 0)
    assert run.result["collectionLimitNotes"] == []
    if not known_own:
        assert run.result["candidates"] == []


def test_found_survives_no_candidate_and_deduplicates_commit_sha() -> None:
    own = commit(sha(2), MEMBER, parents=(ROOT,))
    run = run_case(Scenario(default_branch=(own, root_commit()), lookups={own.sha: ()}))
    repeated = replace(run.outcome, commits=run.outcome.commits * 2)
    output = repeated.with_observation(GenerationOutput())
    assert output.candidates == ()
    assert output.own_commit_observation == "FOUND"
    assert output.observed_own_commit_count == 1


def test_generation_output_rejects_invalid_observation_combinations() -> None:
    cases: list[tuple[Literal["NONE", "FOUND", "UNKNOWN"], int | None]] = [
        ("NONE", None),
        ("FOUND", None),
        ("FOUND", 0),
        ("UNKNOWN", 0),
        ("NONE", True),
    ]
    for state, count in cases:
        with pytest.raises(ValueError):
            GenerationOutput(
                own_commit_observation=state, observed_own_commit_count=count
            )
