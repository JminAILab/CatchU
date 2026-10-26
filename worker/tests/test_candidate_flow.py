"""후보 판정 연결(#118): 수집(관계 조회) → 후보 판정 → 결과 조합이 계약대로 이어지는지 본다.

사례별 판정은 `test_candidate_cases.py`가 본다. 여기서는 판정과 무관하게 지켜야 할 연결을 본다.
- 네 종결값(SUCCEEDED·EMPTY·PARTIAL_FAILED·FAILED) 모두 결과가 메시지 계약 v1을 통과한다.
- 근거의 판본은 관측한 SHA·PR 머리 커밋이고, 수집의 한계(coverageLimits)를 잃지 않는다.
- 적합성은 모두 참이고 초안·질문은 만들지 않는다(NOT_GENERATED, 본문 null).
- 토큰·저장소 글자(제목·본문·메시지·파일 경로)는 결과와 로그에 나가지 않고, 보류 로그는 건수만 남긴다.
- 수집 실패는 한 번만 그대로 옮긴다. 합성(MOCK) 경로의 알려진 결과는 그대로다.
"""

import json
import logging
from collections.abc import Mapping
from dataclasses import replace
from datetime import timedelta
from typing import Any

import pytest
from candidate_scenarios import (
    FINISHED_AT,
    LIVE,
    ROOT,
    WEB,
    CaseRun,
    Pull,
    Scenario,
    bundle_identity,
    change,
    collect_case,
    commit,
    commit_url,
    identities,
    merge_commit,
    named,
    open_pull_with_direct_commit,
    pull_identity,
    root_commit,
    run_case,
)
from github_synthetic import (
    EVIL,
    MEMBER,
    OTHER,
    TOKEN,
    FakeClock,
    detail_path,
    sha,
    status_only,
)

import app.candidates as candidates
from app.collection import (
    CollectionLimits,
    CollectionOutcome,
    CommitRecord,
    PullRequestRecord,
)
from app.contract import FIXTURE_DIR, fill_template
from app.processing import (
    FakeGenerator,
    Finished,
    compose_result,
    process_request,
    synthetic_accepted_context,
    synthetic_request,
)

# 결과·로그에 나가면 안 되는 저장소 글자.
TITLE = "제목표식-가나다"
BODY = "본문표식-라마바"
MESSAGE = "메시지표식-사아자"
PATH = "경로표식/app.py"
DIRECT = sha(1101)
COMMIT_PREFIX = f"{WEB}/commit/"
PULL_PREFIX = f"{WEB}/pull/"


def succeeded_scenario() -> Scenario:
    """회원 PR #3(커밋 둘, 하나는 이진 파일 포함)과 PR 밖 직접 커밋 하나."""
    first = commit(
        sha(1001),
        MEMBER,
        parents=(ROOT,),
        message=MESSAGE,
        minute=2,
        files=[
            change(PATH),
            change("assets/logo.png", additions=0, deletions=0, with_patch=False),
        ],
    )
    second = commit(sha(1002), MEMBER, parents=(first.sha,), message=MESSAGE, minute=3)
    merged = merge_commit(sha(1003), ROOT, second.sha, minute=4)
    direct = commit(
        DIRECT,
        MEMBER,
        parents=(merged.sha,),
        message=MESSAGE,
        minute=5,
        files=[change(PATH)],
    )
    return Scenario(
        default_branch=(direct, merged, second, first, root_commit()),
        pulls=(
            Pull(
                3,
                MEMBER,
                (first, second),
                created=2,
                merged=4,
                merge_commit=merged.sha,
                title=TITLE,
                body=BODY,
            ),
        ),
        lookups={DIRECT: ()},
    )


def empty_scenario() -> Scenario:
    """회원의 작업이 없는 저장소: 다른 계정의 직접 커밋과 다른 계정이 연 PR뿐이다."""
    theirs = commit(sha(1201), OTHER, parents=(ROOT,), message=MESSAGE, minute=2)
    later = commit(sha(1202), OTHER, parents=(theirs.sha,), minute=3)
    proposed = commit(sha(1203), OTHER, parents=(ROOT,), minute=4)
    return Scenario(
        default_branch=(later, theirs, root_commit()),
        pulls=(
            Pull(
                5, OTHER, (proposed,), state="open", created=4, title=TITLE, body=BODY
            ),
        ),
    )


def run_outcome(kind: str) -> CaseRun:
    if kind == "SUCCEEDED":
        return run_case(succeeded_scenario())
    if kind == "EMPTY":
        return run_case(empty_scenario())
    if kind == "PARTIAL_FAILED":
        # PR #3 커밋의 변경 내용을 받은 뒤 PR 밖 커밋 ffff의 변경 내용 조회가 429다. 연결 PR 조회에서
        # 멈추면 변경 내용을 하나도 받지 못해 적합 후보가 없다.
        return run_case(
            replace(
                open_pull_with_direct_commit(lookup=()),
                overrides={detail_path(named("f")): status_only(429)},
            )
        )
    assert kind == "FAILED"
    # 호출마다 10초. 목록 넷(40초)을 받은 뒤 ffff를 묻는 연결 PR 묶음 조회 POST 전에 시간 상한에 닿는다.
    return run_case(
        open_pull_with_direct_commit(lookup=(), with_pull=False),
        limits=CollectionLimits(max_collection_time=timedelta(seconds=40)),
        clock=FakeClock(),
        seconds_per_call=10.0,
    )


OUTCOMES = ["SUCCEEDED", "EMPTY", "PARTIAL_FAILED", "FAILED"]


def all_evidence(result: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [each for entry in result["candidates"] for each in entry["evidence"]]


def observed_records(
    outcome: CollectionOutcome,
) -> tuple[dict[str, CommitRecord], dict[int, PullRequestRecord]]:
    assert outcome.relations is not None
    commits = {r.sha: r for r in (*outcome.commits, *outcome.relations.commits)}
    pulls = {
        r.number: r
        for r in (*outcome.pull_requests, *outcome.relations.pull_requests_from_lookups)
    }
    return commits, pulls


# 종결값과 계약


@pytest.mark.parametrize("kind", OUTCOMES)
def test_every_outcome_passes_the_contract_and_keeps_request_context(
    kind: str,
) -> None:
    run = run_outcome(kind)  # run_case가 메시지 계약 v1 통과를 확인한다.

    result = run.result
    assert result["outcome"] == kind
    assert result["sourceMode"] == "LIVE"
    for key, value in {
        "requestId": LIVE.request_id,
        "attemptId": LIVE.attempt_id,
        "memberId": LIVE.member_id,
        "repositoryId": LIVE.repository_id,
        "consentId": LIVE.consent_id,
        "scopeRevision": LIVE.scope_revision,
    }.items():
        assert result[key] == value
    if kind == "SUCCEEDED":
        assert sorted(identities(result)) == sorted(
            [pull_identity(3), bundle_identity(DIRECT)]
        )
    if kind == "EMPTY":
        # 회원의 작업이 없으면 정상 0건이다. 미제공·실패도 없다.
        assert result["candidates"] == []
        assert result["notProvided"] == []
        assert result["failures"] == []


@pytest.mark.parametrize("kind", ["SUCCEEDED", "PARTIAL_FAILED"])
def test_evidence_revision_is_the_observed_sha_or_pull_request_head(
    kind: str,
) -> None:
    run = run_outcome(kind)

    evidence = all_evidence(run.result)
    assert evidence
    for each in evidence:
        url = each["sourceUrl"]
        if url.startswith(COMMIT_PREFIX):
            assert each["sourceRevision"] == url.removeprefix(COMMIT_PREFIX)
        else:
            assert url.startswith(PULL_PREFIX)
            number = int(url.removeprefix(PULL_PREFIX))
            assert each["sourceRevision"] == run.scenario.pull(number).head_sha


def test_coverage_limits_from_collection_are_kept_in_evidence() -> None:
    # 변경 내용 조회 개수를 1건으로 줄여, 한 커밋은 범위 밖(공유 한계)이 되게 한다. 두 커밋을 한
    # PR에 두어, 변경 내용을 확인한 newer 덕분에 후보가 되고 older도 근거에 남게 한다(변경 내용을
    # 확인한 본인 커밋이 없는 단위는 후보가 아니다).
    older = commit(sha(1300), MEMBER, parents=(ROOT,), minute=2)
    newer = commit(
        sha(1302),
        MEMBER,
        parents=(older.sha,),
        minute=4,
        files=[
            change("app/a.py"),
            change("assets/icon.png", additions=0, deletions=0, with_patch=False),
        ],
    )
    joined = merge_commit(sha(1303), ROOT, newer.sha, minute=5)
    scenario = Scenario(
        default_branch=(joined, newer, older, root_commit()),
        pulls=(
            Pull(
                13,
                OTHER,
                (older, newer),
                created=2,
                merged=5,
                merge_commit=joined.sha,
            ),
        ),
    )

    run = run_case(scenario, limits=CollectionLimits(max_commit_details=1))

    shared = run.outcome.shared_limits("COMMIT")
    assert shared
    commits, _ = observed_records(run.outcome)
    assert commits[older.sha].changes is None
    evidence = [
        each
        for each in all_evidence(run.result)
        if each["sourceUrl"].startswith(COMMIT_PREFIX)
    ]
    assert {each["sourceUrl"] for each in evidence} == {
        commit_url(newer.sha),
        commit_url(older.sha),
    }
    for each in evidence:
        record = commits[each["sourceUrl"].removeprefix(COMMIT_PREFIX)]
        basis = run.outcome.evidence_for(record)
        assert set(basis.coverage_limits) <= set(each["coverageLimits"])
        assert set(basis.observed_facts) <= set(each["representedFacts"])
        assert set(shared) <= set(each["coverageLimits"])


def test_pull_request_evidence_keeps_collection_facts_and_limits() -> None:
    run = run_outcome("SUCCEEDED")

    commits, pulls = observed_records(run.outcome)
    checked = 0
    for each in all_evidence(run.result):
        url = each["sourceUrl"]
        record: CommitRecord | PullRequestRecord
        if url.startswith(COMMIT_PREFIX):
            record = commits[url.removeprefix(COMMIT_PREFIX)]
        else:
            record = pulls[int(url.removeprefix(PULL_PREFIX))]
        basis = run.outcome.evidence_for(record)
        assert set(basis.coverage_limits) <= set(each["coverageLimits"])
        assert set(basis.observed_facts) <= set(each["representedFacts"])
        checked += 1
    assert checked >= 3


@pytest.mark.parametrize("kind", ["SUCCEEDED", "PARTIAL_FAILED"])
def test_own_records_never_carry_not_linked_account_limits(kind: str) -> None:
    # 관계 조회가 정한 상태를 기록에 되돌려 써야 한다. 본인 기록에 "연동 계정이 … 아니라"는 거짓이다.
    # 문구는 2026-10-08 팀장 결정대로 '작성자로 기록된'이고, 옛 문구도 나오지 않는지 함께 본다.
    run = run_outcome(kind)

    for each in all_evidence(run.result):
        for limit in each["coverageLimits"]:
            assert "연동 계정이 작성자로 기록된 커밋이 아니라" not in limit
            assert "연동 계정이 작성한 커밋이 아니라" not in limit
            assert "연동 계정이 연 PR이 아니라" not in limit


@pytest.mark.parametrize("kind", ["SUCCEEDED", "PARTIAL_FAILED"])
def test_candidates_are_eligible_and_drafts_are_not_generated(kind: str) -> None:
    run = run_outcome(kind)

    assert run.result["candidates"]
    for entry in run.result["candidates"]:
        assert entry["eligibility"] == {
            "workFactsVerified": True,
            "contributionVerified": True,
            "independentOfFailures": True,
        }
        assert entry["draft"] == {"status": "NOT_GENERATED", "content": None}
        assert entry["reflection"] == {"status": "NOT_GENERATED", "questions": []}
        assert entry["title"] is None
        assert entry["workFacts"]
        assert entry["subjectContribution"].strip()
        assert entry["groupingBasis"].strip()
        assert entry["workIdentity"].startswith("wi1:")
        assert len(entry["workIdentity"]) == 68


# 토큰·저장소 글자·보류 로그


def repository_texts(scenario: Scenario) -> set[str]:
    """사례가 GitHub 응답에 담은 저장소 글자: PR 제목·본문, 병합 아닌 커밋의 메시지·파일 경로.

    병합 커밋의 메시지('병합')는 결과 문장에도 쓰는 낱말이라 넣지 않는다.
    """
    texts = {TITLE, BODY, MESSAGE, PATH}
    for pull in (*scenario.pulls, *scenario.lookup_pulls):
        item = pull.item()
        texts.update(value for value in (item["title"], item["body"]) if value)
    for each in scenario.all_commits().values():
        if each.detail is None:
            continue
        texts.add(each.item["commit"]["message"])
        texts.update(entry["filename"] for entry in each.detail["files"])
    return texts


@pytest.mark.parametrize("kind", OUTCOMES)
def test_token_and_repository_text_stay_out_of_result_and_logs(
    caplog: pytest.LogCaptureFixture, kind: str
) -> None:
    """네 종결값 모두에서 본다."""
    caplog.set_level(logging.DEBUG)

    run = run_outcome(kind)

    text = json.dumps(run.result, ensure_ascii=False)
    assert TOKEN not in text
    assert EVIL not in text
    # 사실·제목·근거는 구조 값으로만 만든다. 제목·본문·메시지·파일 경로를 옮기지 않는다.
    for marker in repository_texts(run.scenario):
        assert marker not in text
        assert marker not in caplog.text
    assert TOKEN not in caplog.text
    # 토큰은 Authorization 머리글에만 싣는다. 경로·다른 머리글·연결 PR 묶음 조회 본문에는 없다.
    posted = [call for call in run.transport.calls if call.method == "POST"]
    assert bool(posted) == (kind in ("SUCCEEDED", "PARTIAL_FAILED"))
    for call in run.transport.calls:
        assert TOKEN not in call.path
        assert call.headers["Authorization"] == f"Bearer {TOKEN}"
        others = [v for k, v in call.headers.items() if k != "Authorization"]
        assert all(TOKEN not in value for value in others)
        assert call.body is None or TOKEN.encode() not in call.body


def _decision_log(caplog: pytest.LogCaptureFixture) -> str:
    found = [
        record.getMessage()
        for record in caplog.records
        if "후보 판정 종료" in record.getMessage()
    ]
    assert len(found) == 1
    return found[0]


@pytest.mark.parametrize(
    ("kind", "undetermined", "held_after_stop"),
    # C27은 연결 PR 조회에서 멈춰 ffff 보류 1과, 변경 내용을 받지 못한 PR #3 1이다.
    [("C16", 1, 0), ("C27", 0, 2)],
)
def test_hold_log_has_counts_only(
    caplog: pytest.LogCaptureFixture,
    kind: str,
    undetermined: int,
    held_after_stop: int,
) -> None:
    caplog.set_level(logging.DEBUG)
    if kind == "C16":
        run = run_case(open_pull_with_direct_commit())
    else:
        run = run_case(
            open_pull_with_direct_commit(lookup=()),
            limits=CollectionLimits(max_calls=5),
        )

    # C16은 ffff 하나를 연결 PR 묶음 조회로 묻는다. C27은 그 POST를 보내기 전에 호출 수 상한에 걸린다.
    assert run.transport.batches == ([(named("f"),)] if kind == "C16" else [])
    line = _decision_log(caplog)
    # 조회 완료 뒤 보류(C16)와 확인 중단 보류(C27~C29)를 나눠 건수만 남긴다.
    assert f"requestId={LIVE.request_id}" in line
    assert f"undetermined={undetermined}" in line
    assert f"heldAfterStop={held_after_stop}" in line
    assert named("f") in run.scenario.all_commits()
    for value in run.scenario.all_commits():
        assert value not in caplog.text
        assert value[:12] not in caplog.text
    pull = run.scenario.pull(3).item()
    for text in (pull["title"], pull["body"], "합성 커밋"):
        assert text not in caplog.text
    assert TOKEN not in caplog.text


# 실패 전달


def test_collection_failure_is_passed_through_once() -> None:
    run = run_outcome("PARTIAL_FAILED")

    assert run.output.failures == run.outcome.stage_failures()
    assert run.result["failures"] == [
        {
            "stage": "COLLECTION",
            "code": "RATE_LIMITED",
            "message": run.outcome.failures[0].message,
        }
    ]


def test_refused_before_first_call_gives_failed_result_without_candidates() -> None:
    request = replace(LIVE, allowed_resource_types=frozenset())
    outcome, transport = collect_case(Scenario(), request=request)
    assert outcome.repository is None
    assert transport.calls == []

    output = candidates.build_candidates(request, outcome)
    result = compose_result(request, output, finished_at=FINISHED_AT, id_label="case")

    assert output.candidates == ()
    assert output.not_provided == ()
    assert output.failures == outcome.stage_failures()
    assert result["outcome"] == "FAILED"


def test_candidate_decision_requires_the_relation_phase() -> None:
    # 관계 조회 없이 모은 결과로는 소속을 확인할 수 없다. 조용히 0건으로 만들지 않는다.
    outcome, _ = collect_case(succeeded_scenario())
    without_relations = replace(outcome, relations=None)

    with pytest.raises(ValueError):
        candidates.build_candidates(LIVE, without_relations)


# 합성(MOCK) 경로


@pytest.mark.parametrize(
    "scenario", ["succeeded-one-candidate", "two-candidates-same-work"]
)
def test_mock_path_keeps_the_known_synthetic_results(scenario: str) -> None:
    # #103·#113 합성 경로는 wi1 함수를 쓰지 않고 알려진 합성 값을 그대로 쓴다.
    accepted = synthetic_accepted_context()
    events: list[dict[str, Any]] = []

    outcome = process_request(
        synthetic_request(accepted),
        accepted=accepted,
        generator=FakeGenerator(scenario),
        emit=events.append,
        clock=lambda: FINISHED_AT,
        id_label=scenario,
    )

    assert isinstance(outcome, Finished)
    context = json.loads((FIXTURE_DIR / "context.sample.json").read_text("utf-8"))
    template = json.loads(
        (FIXTURE_DIR / "results" / f"{scenario}.json").read_text("utf-8")
    )
    assert outcome.result == fill_template(
        template, {**context["values"], "caseId": scenario}
    )
    for entry in outcome.result["candidates"]:
        assert entry["workIdentity"].startswith(f"synthetic-work-{scenario}-")
