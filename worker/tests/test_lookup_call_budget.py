"""연결 PR 묶음 조회(#267)로 요청당 호출 상한 안에서 후보 판정까지 가는지.

합성 저장소 모양(`call_budget_shapes`)을 운영 제안 상한(PROPOSED_LIMITS) 그대로 수집 → 후보 판정 →
결과 조합까지 돌리고, 호출을 종류별로 센다. 같은 모양을 기준 판본(연결 PR을 커밋마다 REST로 조회)에서
돌린 호출 수는 worker/docs/associated-pr-lookup.md의 비교표에 있다. 상한을 시험에만 키우지 않는다.
"""

import math
import re
from collections import Counter

import pytest
from call_budget_shapes import SHAPES, Shape, build
from candidate_scenarios import run_case

from app.collection import PROPOSED_LIMITS, Lookup


def kind(key: str) -> str:
    """호출 열쇠(FakeTransport.paths)의 종류."""
    if key.startswith("POST /graphql"):
        return "lookup"
    if key.startswith("diff "):
        return "mode"
    if "/compare/" in key:
        return "compare"
    if re.search(r"/pulls/\d+/commits\?", key):
        return "pull_commits"
    if re.search(r"/pulls/\d+$", key):
        return "pull_api"
    if re.search(r"/commits/[0-9a-f]{40}$", key):
        return "detail"
    return "list"


# 모양마다 종류별 호출 수: 목록·PR 커밋 목록·연결 PR 묶음 POST·경계 비교·변경 내용.
EXPECTED = {
    "본인 500·PR 0": {"list": 8, "lookup": 6, "compare": 2, "detail": 200},
    "algo-problem 모양": {"list": 8, "lookup": 6, "compare": 3, "detail": 200},
    "Goose 모양": {"list": 8, "lookup": 2, "compare": 61, "detail": 85},
    "BEASTA-ZOO 모양": {"list": 8, "lookup": 2, "compare": 48, "detail": 58},
    "TheMe 모양": {"list": 8, "pull_commits": 2, "lookup": 3, "detail": 124},
    # 필수 호출(목록·PR 커밋 목록·묶음 조회·경계 비교) 114회 뒤 남은 호출을 선택 상세가 채운다.
    "PR 중심": {
        "list": 8,
        "pull_commits": 100,
        "lookup": 2,
        "compare": 4,
        "detail": 186,
    },
}


@pytest.mark.parametrize("shape", SHAPES, ids=[shape.name for shape in SHAPES])
def test_shape_finishes_collection_under_the_call_limit_and_reaches_decision(
    shape: Shape,
) -> None:
    built = build(shape)

    run = run_case(built.scenario, limits=PROPOSED_LIMITS)

    assert run.outcome.completed, run.outcome.failures
    assert run.outcome.calls <= PROPOSED_LIMITS.max_calls
    assert run.output.candidates, "후보 판정까지 가서 후보가 나와야 한다"
    counts = Counter(kind(key) for key in run.transport.paths)
    assert dict(counts) == EXPECTED[shape.name]
    assert sum(counts.values()) == run.outcome.calls
    # 묶음 조회는 단계마다 100개씩: 본인 커밋, 그다음 PR 없는 병합. 같은 SHA를 두 번 묻지 않는다.
    own = len(built.lookups) - len(shape.merges)
    assert counts["lookup"] == math.ceil(own / 100) + math.ceil(len(shape.merges) / 100)
    assert run.outcome.graphql.calls == counts["lookup"]
    assert sorted(run.transport.looked_up) == sorted(built.lookups)
    assert all(len(batch) <= 100 for batch in run.transport.batches)
    # 첫 부모 쪽이 창 밖으로 열린 PR 없는 병합의 경계 비교도 셌다.
    assert counts.get("compare", 0) == len(built.boundaries)
    assert run.result["outcome"] == "SUCCEEDED"
    relations = run.outcome.relations
    assert relations is not None
    assert {entry.status for entry in relations.associated} == {Lookup.EMPTY}


def test_five_hundred_own_commits_without_pull_requests_need_six_lookup_posts() -> None:
    """본인 커밋 500건(병합 2건 포함)·PR 0건: 커밋 498건을 5번, 병합 2건을 1번 묻는다.

    기준 판본은 커밋마다 연결 PR을 1회씩 불러 292번째 조회에서 호출 상한(300회)에 걸렸다(수집 실패,
    후보 0개). 묶음 조회로는 목록 8 + 묶음 6 + 경계 비교 2 + 변경 내용 200 = 216회로 끝난다.
    변경 내용은 빈 변경이 아니라 커밋마다 파일 하나를 고친 응답이다.
    """
    shape = SHAPES[0]
    built = build(shape)

    run = run_case(built.scenario, limits=PROPOSED_LIMITS)

    assert run.outcome.calls == 216
    assert [len(batch) for batch in run.transport.batches] == [
        100,
        100,
        100,
        100,
        98,
        2,
    ]
    # 병합은 본인 커밋 묶음을 모두 받은 뒤 따로 묻는다.
    assert run.transport.batches[-1] == built.lookups[-2:]
    assert len(built.boundaries) == 2
    details = [key for key in run.transport.paths if kind(key) == "detail"]
    assert len(details) == PROPOSED_LIMITS.max_commit_details
    assert run.result["outcome"] == "SUCCEEDED"
