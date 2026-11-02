"""C4/I8 500개 합성 경계. 실제 GitHub·모델·DB 실측을 대신하지 않는다."""

import json
from datetime import timedelta

from candidate_scenarios import (
    FINISHED_AT,
    ROOT,
    Scenario,
    change,
    commit,
    root_commit,
    run_case,
)
from generation_scenarios import ScriptedProvider, naive
from github_synthetic import MEMBER, FakeClock, sha

from app.collection import CollectionLimits, DetailStatus
from app.consumer.frames import Frame, decode, encode
from app.consumer.settings import Limits
from app.generation import run_generation
from app.processing import compose_result


def test_five_hundred_lists_details_relations_generation_and_frame() -> None:
    commits = tuple(
        commit(
            sha(n + 10),
            MEMBER,
            parents=(ROOT,),
            minute=n,
            files=[change(f"src/synthetic_{n}.py")],
        )
        for n in range(500)
    )
    scenario = Scenario(
        default_branch=(*commits, root_commit()), lookups={c.sha: () for c in commits}
    )
    run = run_case(scenario)
    assert len(run.outcome.commits) == 500
    assert run.outcome.relations is not None
    assert len(run.outcome.relations.associated) == 500
    assert (
        sum(c.changes_status is DetailStatus.FETCHED for c in run.outcome.commits)
        == 200
    )
    assert run.output.observed_own_commit_count == 500
    assert len(run.output.candidates) == 200
    assert run.output.collection_limit_notes
    clock = FakeClock()
    provider = ScriptedProvider(naive)
    generated = run_generation(
        run.request,
        run.outcome,
        run.output,
        provider=provider,
        clock=clock,
        deadline=clock() + timedelta(minutes=19),
    )
    assert generated.report.generation_calls == 200
    result = compose_result(
        run.request, generated.output, finished_at=FINISHED_AT, id_label="u7-budget"
    )
    assert len(result["candidates"]) == 200
    assert result["observedOwnCommitCount"] == 500
    frame = encode(Frame("result", message=result))
    assert len(frame) < Limits().frame_max_bytes
    assert decode(frame).message == result
    assert run.outcome.calls <= CollectionLimits().max_calls
    assert run.outcome.received_bytes <= CollectionLimits().max_total_bytes
    assert len(json.dumps(result, ensure_ascii=False).encode()) < len(frame)


def test_call_budget_failure_keeps_found_records_and_limits() -> None:
    own = commit(sha(42), MEMBER, parents=(ROOT,))
    run = run_case(
        Scenario(default_branch=(own, root_commit()), lookups={own.sha: ()}),
        limits=CollectionLimits(max_calls=4),
    )
    assert run.result["outcome"] == "FAILED"
    assert run.result["ownCommitObservation"] == "FOUND"
    assert run.result["observedOwnCommitCount"] == 1
    assert run.result["collectionLimitNotes"]
    assert run.outcome.calls <= 4
