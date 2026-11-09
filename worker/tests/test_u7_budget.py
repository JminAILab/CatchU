"""C4/I8 현행 상한의 합성 경계. 실제 GitHub·모델·DB 실측을 대신하지 않는다."""

import json
from datetime import timedelta

import pytest
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

from app.collection import CollectionLimits, DetailStatus, FailureCode
from app.collection.budget import CollectionBudget
from app.collection.failures import CollectionStopped
from app.consumer.frames import Frame, decode, encode
from app.consumer.settings import Limits
from app.generation import run_generation
from app.processing import compose_result


@pytest.mark.parametrize(("count", "details"), [(500, 500), (1501, 1500)])
def test_lists_details_relations_generation_and_frame(count: int, details: int) -> None:
    commits = tuple(
        commit(
            sha(n + 10),
            MEMBER,
            parents=(ROOT,),
            minute=n,
            files=[change(f"src/synthetic_{n}.py")],
        )
        for n in range(count)
    )
    scenario = Scenario(
        default_branch=(*commits, root_commit()), lookups={c.sha: () for c in commits}
    )
    run = run_case(scenario)
    # 현재 목록 3000건 안에는 타인 뿌리 커밋도 들어가지만 본인 관측 수에는 넣지 않는다.
    assert len(run.outcome.commits) == count + 1
    assert run.outcome.relations is not None
    assert len(run.outcome.relations.associated) == count
    assert (
        sum(c.changes_status is DetailStatus.FETCHED for c in run.outcome.commits)
        == details
    )
    assert run.output.observed_own_commit_count == count
    assert len(run.output.candidates) == details
    assert bool(run.output.collection_limit_notes) is (count > details)
    clock = FakeClock()
    provider = ScriptedProvider(naive)
    generated = run_generation(
        run.request,
        run.outcome,
        run.output,
        provider=provider,
        clock=clock,
        deadline=clock()
        + timedelta(seconds=Limits().total - Limits().generation_margin),
    )
    assert generated.report.generation_calls == 300
    assert generated.report.budget_skipped == details - 300
    result = compose_result(
        run.request, generated.output, finished_at=FINISHED_AT, id_label="u7-budget"
    )
    assert len(result["candidates"]) == details
    assert result["observedOwnCommitCount"] == count
    assert result["outcome"] == "PARTIAL_FAILED"
    assert sum(c["draft"]["status"] == "GENERATED" for c in result["candidates"]) == 300
    assert (
        sum(c["draft"]["status"] == "NOT_GENERATED" for c in result["candidates"])
        == details - 300
    )
    frame = encode(Frame("result", message=result))
    assert len(frame) < Limits().frame_max_bytes
    assert decode(frame).message == result
    assert run.outcome.calls <= CollectionLimits().max_calls
    assert run.outcome.received_bytes <= CollectionLimits().max_total_bytes
    assert len(json.dumps(result, ensure_ascii=False).encode()) < len(frame)


def test_default_call_and_collection_time_boundaries() -> None:
    clock = FakeClock()
    calls = CollectionBudget(CollectionLimits(), clock=clock, started_at=clock())
    for _ in range(2500):
        assert calls.start_call() == 1800
    with pytest.raises(CollectionStopped) as stopped:
        calls.start_call()
    assert stopped.value.failure.code is FailureCode.BUDGET_EXCEEDED
    assert calls.calls == 2500

    timed = CollectionBudget(CollectionLimits(), clock=clock, started_at=clock())
    clock.advance(1799)
    assert timed.start_call() == 1
    clock.advance(1)
    with pytest.raises(CollectionStopped) as expired:
        timed.start_call()
    assert expired.value.failure.code is FailureCode.TIME_LIMIT_EXCEEDED
    assert timed.calls == 1


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
