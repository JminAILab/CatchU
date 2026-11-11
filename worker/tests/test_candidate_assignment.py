"""소속 커밋 빼기(CR2): 이미 다른 Catch에 속한 커밋을 재분석 후보에서 뺀다.

기대값은 CR2 기능 명세 W1~W7·업무 규칙 BR1.x·BR2.1과 `unit-test-instructions.md`의 시나리오 표에서 정한다.
수집은 합성 GitHub 응답(`candidate_scenarios`)으로 돌리고, 소속 집합만 바꿔 같은 수집 결과로 후보 판정을 다시
한다. SHA는 합성 값만 쓴다.
"""

import logging
import re
from dataclasses import replace
from typing import Any

import pytest
from candidate_scenarios import (
    FINISHED_AT,
    LIVE,
    ROOT,
    Pull,
    Scenario,
    bundle_identity,
    change,
    collect_case,
    commit,
    identities,
    pull_identity,
    root_commit,
)
from github_synthetic import BASE, MEMBER, sha, status_only

from app.candidates import build_candidates, group
from app.candidates.grouping import AssignedChange, _without_assigned
from app.collection import CollectionOutcome
from app.contract import Verdict, check_message
from app.generation.material import gather
from app.processing import GenerationOutput, compose_result

# 소속 커밋을 뺀 커밋 묶음의 묶음 설명 고정 문장(BR1.8). 구현 상수를 읽지 않고 기능 명세에서 옮겼다.
VIA_ASSIGNED = "이미 다른 Catch에 속한 커밋을 거쳐 이어진 커밋도 한 묶음에 두었다."
PARENT_LINK = (
    "부모가 하나뿐이고 그 부모와 변경 파일이 겹치는 것을 이어 한 묶음으로 두었다."
)
HEX40 = re.compile(r"[0-9a-f]{40}")


def own(number: int, parent: str, path: str, minute: int) -> Any:
    return commit(
        sha(number), MEMBER, parents=(parent,), minute=minute, files=[change(path)]
    )


# 열린 PR #10에 본인 커밋 셋(c1 ← c2 ← c3). W3·W6에 쓴다.
C1 = own(41, ROOT, "app/login.py", 3)
C2 = own(42, C1.sha, "app/login.py", 4)
C3 = own(43, C2.sha, "app/retry.py", 5)
SAME_PULL = Scenario(
    default_branch=(root_commit(),),
    pulls=(Pull(10, MEMBER, (C1, C2, C3), state="open", created=2),),
)

# 통합 PR #20이 Unit PR의 커밋 다섯(u1~u5)과 새 커밋 하나(n1)를 담는다. W4에 쓴다.
UNIT = [own(51, ROOT, "app/unit.py", 3)]
for _number in range(52, 56):
    UNIT.append(own(_number, UNIT[-1].sha, "app/unit.py", _number - 48))
NEW = own(59, UNIT[-1].sha, "app/integration.py", 9)
INTEGRATION = Scenario(
    default_branch=(root_commit(),),
    pulls=(Pull(20, MEMBER, (*UNIT, NEW), state="open", created=2),),
)


def direct_chain(*commits: Any) -> Scenario:
    """PR 없이 기본 브랜치에 바로 들어간 본인 커밋(최근 것부터 기본 브랜치 목록). 연결 PR 조회는 빈 목록."""
    return Scenario(
        default_branch=(*reversed(commits), root_commit()),
        lookups={each.sha: () for each in commits},
    )


# 직접 커밋 d1 ← … ← d5(같은 파일). 지금 규칙이면 다섯이 한 커밋 묶음이다. W5에 쓴다.
DIRECT = [own(61, ROOT, "app/list.py", 3)]
for _number in range(62, 66):
    DIRECT.append(own(_number, DIRECT[-1].sha, "app/list.py", _number - 58))
LINEAR = direct_chain(*DIRECT)

# x1 ← y1 ← x2 ← y2: 남는 y1·y2를 잇던 연결이 모두 소속 커밋 x1·x2를 거친다(남은 연결이 빈다).
X1 = own(71, ROOT, "app/page.py", 3)
Y1 = own(72, X1.sha, "app/page.py", 4)
X2 = own(73, Y1.sha, "app/page.py", 5)
Y2 = own(74, X2.sha, "app/page.py", 6)
INTERLEAVED = direct_chain(X1, Y1, X2, Y2)


def collected(scenario: Scenario) -> CollectionOutcome:
    outcome, _ = collect_case(scenario)
    assert outcome.completed
    return outcome


def build(
    outcome: CollectionOutcome, assigned: set[str] | None = None
) -> GenerationOutput:
    output = build_candidates(
        LIVE, outcome, frozenset() if assigned is None else frozenset(assigned)
    )
    result = compose(output)
    checked = check_message("Result", result)
    assert checked.verdict is Verdict.VALID, checked.errors
    return output


def compose(output: GenerationOutput) -> dict[str, Any]:
    return compose_result(LIVE, output, finished_at=FINISHED_AT, id_label="cr2")


def own_shas(output: GenerationOutput) -> list[tuple[str, ...]]:
    return [each.own_commit_shas for each in output.candidates]


def judgement_log(caplog: pytest.LogCaptureFixture) -> str:
    lines = [
        r.getMessage() for r in caplog.records if "후보 판정 종료" in r.getMessage()
    ]
    assert lines
    return lines[-1]


# W1·BR2.1: 첫 분석(소속 없음)


def test_first_analysis_carries_every_own_commit_newest_first() -> None:
    """빈 집합이면 열쇠는 지금 그대로이고, 후보에 본인 커밋 전체가 최근 것부터 실린다."""
    output = build(collected(SAME_PULL))
    assert identities(compose(output)) == [pull_identity(10)]
    assert own_shas(output) == [(C3.sha, C2.sha, C1.sha)]
    assert compose(output)["candidates"][0]["ownCommitShas"] == [C3.sha, C2.sha, C1.sha]


# W3: 같은 PR에 새 커밋이 더해진 재분석(US1.2 AC1.2.1)


def test_new_commit_in_same_pull_keeps_the_key_and_carries_only_the_new_commit() -> (
    None
):
    output = build(collected(SAME_PULL), {C1.sha, C2.sha})
    assert identities(compose(output)) == [pull_identity(10)]
    assert own_shas(output) == [(C3.sha,)]
    # 근거·기여도 남은 변경으로만 정한다(BR1.5): 뺀 커밋은 근거에 없다.
    revisions = {item.source_revision for item in output.candidates[0].evidence}
    assert C3.sha in revisions and C1.sha not in revisions and C2.sha not in revisions


# W4: 통합 PR이 Unit PR 커밋을 다시 담는 재분석(US1.2 AC1.2.2)


def test_integration_pull_carries_only_its_new_commit() -> None:
    outcome = collected(INTEGRATION)
    assert own_shas(build(outcome)) == [
        (NEW.sha, *(each.sha for each in reversed(UNIT)))
    ]
    output = build(outcome, {each.sha for each in UNIT})
    assert identities(compose(output)) == [pull_identity(20)]
    assert own_shas(output) == [(NEW.sha,)], "옛 커밋은 이 Catch로 옮겨지지 않는다"


# W5: PR 없는 직접 커밋이 이어지는 재분석(US1.3 AC1.3.1, BR1.3·BR1.8)


def test_direct_commits_after_assigned_ones_get_a_new_bundle_key_and_fixed_sentence() -> (
    None
):
    outcome = collected(LINEAR)
    before = build(outcome)
    assert identities(compose(before)) == [bundle_identity(*(d.sha for d in DIRECT))]
    assert VIA_ASSIGNED not in before.candidates[0].grouping_basis

    output = build(outcome, {d.sha for d in DIRECT[:3]})
    assert identities(compose(output)) == [
        bundle_identity(DIRECT[3].sha, DIRECT[4].sha)
    ]
    assert own_shas(output) == [(DIRECT[4].sha, DIRECT[3].sha)]
    basis = output.candidates[0].grouping_basis
    # 두 끝이 남은 커밋인 연결(d4·d5)은 그대로 적고, 고정 문장을 더한다.
    assert PARENT_LINK in basis and VIA_ASSIGNED in basis


def test_bundle_whose_links_all_ran_through_assigned_commits_keeps_going() -> None:
    """남은 연결이 비어도 결함으로 멈추지 않고 고정 문장이 연결 근거의 전부다(BR1.8)."""
    output = build(collected(INTERLEAVED), {X1.sha, X2.sha})
    assert identities(compose(output)) == [bundle_identity(Y1.sha, Y2.sha)]
    basis = output.candidates[0].grouping_basis
    assert VIA_ASSIGNED in basis and PARENT_LINK not in basis
    assert "cherry-pick" not in basis


def test_single_remaining_commit_uses_the_single_commit_sentence() -> None:
    output = build(collected(LINEAR), {d.sha for d in DIRECT[:4]})
    assert identities(compose(output)) == [bundle_identity(DIRECT[4].sha)]
    assert "본인 커밋 하나를 한 작업으로 두었다." in output.candidates[0].grouping_basis
    assert VIA_ASSIGNED not in output.candidates[0].grouping_basis


# W6: 바뀐 것이 없는 재분석(BR1.4)


def test_nothing_new_gives_no_candidate_and_no_not_provided(
    caplog: pytest.LogCaptureFixture,
) -> None:
    outcome = collected(SAME_PULL)
    assigned = {C1.sha, C2.sha, C3.sha}
    with caplog.at_level(logging.INFO, logger="app.candidates.build"):
        output = build(outcome, assigned)
    assert output.candidates == ()
    assert output.not_provided == (), "버린 단위는 미제공으로 세지 않는다"
    assert compose(output)["outcome"] == "EMPTY"
    assert group(outcome, frozenset(assigned)).assigned_units == 1
    line = judgement_log(caplog)
    assert line.endswith("assignedShas=3 assignedUnits=1")
    assert "candidates=0 insufficient=0 belowCriteria=0 undetermined=0" in line
    assert not HEX40.search(line), "로그에 SHA를 남기지 않는다(NFR4.10)"


def test_early_stop_line_shows_zero_before_any_unit_is_decided(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """저장소를 확인하기 전에 멈춘 수집의 종료 줄은 둘 다 0이다(계산 전)."""
    stopped, _ = collect_case(Scenario(overrides={BASE: status_only(500)}))
    # 첫 호출에서 멈춰 저장소를 확인하지 못한 수집(수집 실패가 있다).
    outcome = replace(stopped, repository=None)
    assert outcome.stage_failures()
    with caplog.at_level(logging.INFO, logger="app.candidates.build"):
        output = build_candidates(LIVE, outcome, frozenset({C1.sha}))
    assert output.candidates == () and output.failures
    assert judgement_log(caplog).endswith("assignedShas=0 assignedUnits=0")


# BR1.1: 같은 변경의 SHA 가운데 하나라도 소속이면 그 변경 전체를 뺀다


def test_change_is_assigned_when_any_of_its_shas_is_assigned() -> None:
    kept = AssignedChange(commits=(sha(1),), contributing=True, own_commits=(sha(1),))
    # 다른 곳에 배정된 같은 변경의 SHA(본인 기여 커밋 쪽)만 소속이어도 변경 전체가 빠진다.
    picked = AssignedChange(
        commits=(sha(2), sha(3)), contributing=True, own_commits=(sha(4),)
    )
    members = ((sha(1),), (sha(2), sha(3), sha(4)))
    for assigned in ({sha(3)}, {sha(4)}):
        assert _without_assigned(members, (kept, picked), frozenset(assigned)) == (
            ((sha(1),),),
            (kept,),
        )
    # 뺀 뒤 기여 근거이면서 본인 커밋이 있는 변경이 없으면 단위를 버린다.
    assert (
        _without_assigned(members, (kept, picked), frozenset({sha(1), sha(2)})) is None
    )
    # 뺀 변경이 없으면 본인 기여가 없어도 그대로 둔다(미제공 판정은 지금대로).
    other = AssignedChange(commits=(sha(5),), contributing=False, own_commits=())
    assert _without_assigned(((sha(5),),), (other,), frozenset({sha(9)})) == (
        ((sha(5),),),
        (other,),
    )


# BR1.7·AC1.1.8: 빈 집합이나 관계없는 집합이면 지금과 같다


@pytest.mark.parametrize("scenario", [SAME_PULL, INTEGRATION, LINEAR, INTERLEAVED])
def test_empty_or_unrelated_set_changes_nothing(scenario: Scenario) -> None:
    outcome = collected(scenario)
    current = compose(build_candidates(LIVE, outcome))
    assert compose(build(outcome, set())) == current
    assert compose(build(outcome, {sha(999)})) == current
    assert group(outcome).assigned_units == 0


# NFR4.1·AC1.1.5: 같은 입력이면 몇 번을 돌려도 같은 열쇠·본인 커밋 목록


def test_same_input_gives_the_same_keys_and_own_commits() -> None:
    outcome = collected(LINEAR)
    shas = [d.sha for d in DIRECT[:3]]
    first = build(outcome, set(shas))
    second = build(outcome, set(reversed(shas)))
    assert identities(compose(first)) == identities(compose(second))
    assert own_shas(first) == own_shas(second)


# BR1.6·AC1.1.7: 생성 재료 찾기가 같은 집합으로 모든 후보의 단위를 찾는다


@pytest.mark.parametrize(
    ("scenario", "assigned"),
    [
        (LINEAR, {d.sha for d in DIRECT[:3]}),
        (INTERLEAVED, {X1.sha, X2.sha}),
        (INTEGRATION, {each.sha for each in UNIT}),
        (SAME_PULL, {C1.sha}),
    ],
)
def test_material_lookup_with_the_same_set_finds_every_candidate(
    scenario: Scenario, assigned: set[str]
) -> None:
    outcome = collected(scenario)
    built = build(outcome, assigned)
    materials = gather(LIVE, outcome, built, frozenset(assigned))
    assert len(materials) == len(built.candidates)
    for material in materials:
        assert material.own_commits == frozenset(material.candidate.own_commit_shas)
        assert not material.own_commits & assigned


def test_material_lookup_with_a_different_set_is_a_defect() -> None:
    """커밋 묶음은 집합이 다르면 열쇠가 달라 단위를 찾지 못한다. 0건으로 숨기지 않고 결함으로 멈춘다."""
    outcome = collected(LINEAR)
    built = build(outcome, {d.sha for d in DIRECT[:3]})
    with pytest.raises(ValueError):
        gather(LIVE, outcome, built, frozenset())
