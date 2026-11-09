"""API 경계 시험이 stdin으로 보낸 v2 요청을 합성 외부 자료로 실행한다.

실제 GitHub/모델을 부르지 않는다. stdout은 결과와 안전한 개수 집계만 반환한다.
"""

import json
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

from candidate_scenarios import ROOT, Scenario, change, commit, root_commit
from generation_scenarios import ScriptedProvider, naive
from github_synthetic import MEMBER, FakeClock, FakeTransport, credential_context, sha

from app.candidates import build_candidates
from app.collection import (
    CredentialContext,
    DetailStatus,
    RelationOptions,
    SelectedRange,
    collect,
)
from app.consumer.settings import Limits
from app.contract import Verdict, check_message
from app.generation import run_generation
from app.processing import (
    AcceptedContext,
    CheckedRequest,
    check_request,
    compose_result,
)


def run(message: dict[str, Any], count: int) -> dict[str, Any]:
    scope = message["allowedScope"]
    accepted = AcceptedContext(
        request_id=message["requestId"],
        attempt_id=message["attemptId"],
        member_id=message["memberId"],
        repository_id=message["repositoryId"],
        consent_id=message["consentId"],
        notice_revision=message["noticeRevision"],
        scope_revision=scope["revision"],
        allowed_resource_types=frozenset(scope["allowedResourceTypes"]),
        selection_reference=scope["selectionReference"],
        source_mode="LIVE",
    )
    checked = check_request(message, accepted)
    assert isinstance(checked, CheckedRequest)
    request: CheckedRequest = checked
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
        default_branch=(*commits, root_commit()),
        lookups={record.sha: () for record in commits},
    )
    clock = FakeClock()

    class Credentials:
        def resolve(self, reference: str) -> CredentialContext | None:
            return (
                credential_context(
                    member_id=request.member_id,
                    repository_id=request.repository_id,
                    scope_revision=request.scope_revision,
                )
                if reference == request.attempt_id
                else None
            )

    class Selections:
        def resolve(self, reference: str) -> SelectedRange | None:
            return (
                SelectedRange(request.repository_id, True)
                if reference == request.attempt_id
                else None
            )

    transport = FakeTransport(scenario.routes(), clock=clock, seconds_per_call=0.001)
    outcome = collect(
        request,
        credentials=Credentials(),
        selections=Selections(),
        open_transport=lambda: transport,
        clock=clock,
        relations=RelationOptions(),
    )
    built = build_candidates(request, outcome)
    generation = run_generation(
        request,
        outcome,
        built,
        provider=ScriptedProvider(naive),
        clock=clock,
        deadline=clock()
        + timedelta(seconds=Limits().total - Limits().generation_margin),
    )
    result = compose_result(
        request, generation.output, finished_at=datetime.now(UTC), id_label="u7-chain"
    )
    assert check_message("Result", result).verdict is Verdict.VALID
    relations = outcome.relations
    metrics = {
        "listed": len(outcome.commits),
        "details": sum(
            record.changes_status is DetailStatus.FETCHED for record in outcome.commits
        ),
        "relations": 0 if relations is None else len(relations.associated),
        "candidates": len(built.candidates),
        "generationCalls": generation.report.generation_calls,
        "calls": outcome.calls,
        "receivedBytes": outcome.received_bytes,
        "elapsedSeconds": outcome.elapsed_seconds,
        "resultBytes": len(json.dumps(result, ensure_ascii=False).encode("utf-8")),
    }
    return {"result": result, "metrics": metrics}


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    print(json.dumps(run(payload["request"], payload["count"]), ensure_ascii=True))
