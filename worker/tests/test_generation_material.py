"""생성 재료(#120): 후보 입력 어댑터가 후보마다 고르는 본인 커밋과, 재료가 없을 때의 생성 흐름.

재료는 후보 근거가 가리키는 연동 계정 커밋의 바뀐 줄이다(#120 본문 「근거와 설명·질문」). 그래서
근거 주소가 커밋 화면 주소가 아닌 근거(PR·PR 없는 병합의 병합 커밋), 다른 계정 커밋, 근거 20건 상한 밖
커밋은 재료가 아니다. 재료가 없으면 원인과 관계없이 제공자를 부르지 않고 설명·질문
NOT_GENERATED, 제목 null, 새 실패 없음이며 기존 수집 실패·근거 한계·미제공 집계·다른 후보 결과는
그대로다(2026-10-12 결정 4·7·8, 완료 기준 09·10). 생성 순서는 근거에 든 본인 커밋의 가장 최근 작성
시각 → 그 SHA → 결과 순서다(결정 9·14, 완료 기준 15).

후보는 후보 판정 사례 도구(`candidate_scenarios`)의 합성 GitHub 응답으로 만들고, 재료는 어댑터
(`app.generation.material.gather`)의 결과와 합성 제공자가 받은 자료(보낸 파일 경로)로 본다. 기대값은
#120 본문·완료 기준과 결정 댓글에서 정했다. 어댑터 코드를 읽어 맞추지 않았다.
"""

import json
from collections.abc import Callable
from dataclasses import replace
from typing import Any

import pytest
from candidate_scenarios import (
    FINISHED_AT,
    LIVE,
    ROOT,
    Commit,
    Pull,
    Scenario,
    bundle_identity,
    change,
    commit,
    failure_codes,
    identities,
    identity,
    live_request,
    merge_commit,
    merge_identity,
    named,
    not_provided,
    pull_identity,
    root_commit,
    run_case,
    without_patch,
)
from generation_scenarios import (
    DEFAULT_DEADLINE,
    TRUNCATED,
    ScriptedProvider,
    assert_generated_text,
    assert_preserved,
    generation_case,
    naive,
    naive_ai,
    sent_files,
)
from github_synthetic import (
    MEMBER,
    OTHER,
    OWNER,
    FakeClock,
    detail_path,
    oversized,
    sha,
    status_only,
)

import app.generation.material as material_module
from app.candidates import build_candidates
from app.candidates.grouping import Grouping
from app.candidates.grouping import group as real_group
from app.candidates.identity import PullRequestUnit
from app.collection import CollectionOutcome, RepositoryCoordinates
from app.contract import Verdict, check_message
from app.generation import (
    GenerationLimits,
    GenerationRun,
    ProviderError,
    ProviderRequest,
    run_generation,
)
from app.generation.material import CandidateMaterial, gather
from app.generation.request import prepare
from app.judgement.provider import JudgementRequest, Question
from app.judgement.synthetic import SyntheticJudge, default_answer
from app.processing import (
    CheckedRequest,
    DraftOutcome,
    GenerationOutput,
    ReflectionOutcome,
    compose_result,
)

# 후보 하나에 담는 본인 커밋 근거 수(#118 「본인 커밋이 20건을 넘어 최근 20건만 근거로 담았다」).
EVIDENCE_CAP = 20


# 도구


def sent_paths(request: ProviderRequest) -> set[str]:
    """제공자에 보낸 파일 경로."""
    return {file["path"] for file in sent_files(request).values()}


def sent_commit_count(request: ProviderRequest) -> int:
    """생성 자료에 담긴 커밋 수(같은 커밋이 두 번 담기면 2다)."""
    data = json.loads(request.data)
    commits = data["commits"]
    assert isinstance(commits, list)
    return len(commits)


def material_shas(material: CandidateMaterial) -> list[str]:
    """재료 커밋(변경 내용을 받은 본인 커밋 근거)의 SHA, 근거 순서대로."""
    return [record.sha for record in material.commits]


def evidence_own_shas(material: CandidateMaterial) -> list[str]:
    return [record.sha for record in material.evidence_own]


def generate_on(
    request: CheckedRequest,
    outcome: CollectionOutcome,
    built: GenerationOutput,
    provider: ScriptedProvider,
) -> tuple[GenerationRun, dict[str, Any]]:
    """`generation_case`의 뒤쪽(생성 → 결과 조합 → 계약 검사 → 보존 검사)을 고친 수집 결과에 돌린다."""
    clock = FakeClock()
    run = run_generation(
        request,
        outcome,
        built,
        provider=provider,
        clock=clock,
        deadline=clock() + DEFAULT_DEADLINE,
    )
    result = compose_result(
        request,
        run.output,
        finished_at=FINISHED_AT,
        id_label="material",
    )
    checked = check_message("Result", result)
    assert checked.verdict is Verdict.VALID, checked.errors
    assert_preserved(built, run.output)
    assert_generated_text(run.output)
    return run, result


def open_pulls(*owns: Commit, number: int = 3) -> Scenario:
    """연동 계정이 연 열린 PR을 커밋마다 하나씩(번호 number부터). 기본 브랜치는 뿌리 커밋뿐이다."""
    return Scenario(
        default_branch=(root_commit(),),
        pulls=tuple(
            Pull(number + offset, MEMBER, (own,), state="open", created=offset + 1)
            for offset, own in enumerate(owns)
        ),
    )


def own_commit(
    number: int, path: str, *, minute: int = 3, parent: str = ROOT
) -> Commit:
    return commit(
        sha(number), MEMBER, parents=(parent,), minute=minute, files=[change(path)]
    )


def forbid_regrouping(monkeypatch: pytest.MonkeyPatch) -> list[CollectionOutcome]:
    """어댑터가 묶음을 다시 부르면 시험 실패로 만든다. 부른 수집 결과를 돌려줄 목록에 담는다."""
    calls: list[CollectionOutcome] = []

    def forbidden(outcome: CollectionOutcome) -> Grouping:
        calls.append(outcome)
        raise AssertionError("후보가 없는데 묶음을 다시 불렀다")

    monkeypatch.setattr(material_module, "group", forbidden)
    return calls


def assert_untouched(before: GenerationOutput, after: GenerationOutput) -> None:
    """재료가 없는 결과: 후보·미제공 집계·실패가 생성 전과 같다(설명·질문 NOT_GENERATED, 제목 null)."""
    assert after == before
    for each in after.candidates:
        assert each.title is None
        assert each.draft == DraftOutcome.not_generated()
        assert each.draft.content is None
        assert each.reflection == ReflectionOutcome.not_generated()
        assert each.reflection.questions == ()


# 후보와 단위 맞추기


def test_candidates_are_matched_to_units_by_work_identity_not_position() -> None:
    """후보가 되지 않은 단위가 앞에 있어도 후보를 workIdentity로 단위에 맞춰 자기 본인 커밋만 재료로
    쓴다(계획 「어댑터 규칙」, 본문 「근거와 설명·질문」).

    묶음 결과의 단위는 PR #12(다른 계정 커밋만, 후보 아님) → PR #13 → 커밋 묶음 순서이고 후보는
    PR #13 → 커밋 묶음이다. 순서로 맞추면 PR #13 후보가 PR #12의 커밋을 받는다.
    """
    theirs = commit(
        sha(411), OTHER, parents=(ROOT,), minute=2, files=[change("app/other.py")]
    )
    merged_12 = merge_commit(sha(412), ROOT, theirs.sha, minute=3)
    mine = commit(
        sha(421),
        MEMBER,
        parents=(merged_12.sha,),
        minute=4,
        files=[change("app/mine.py")],
    )
    merged_13 = merge_commit(sha(422), merged_12.sha, mine.sha, minute=5)
    direct = commit(
        sha(431),
        MEMBER,
        parents=(merged_13.sha,),
        minute=6,
        files=[change("app/direct.py")],
    )
    scenario = Scenario(
        default_branch=(direct, merged_13, mine, merged_12, theirs, root_commit()),
        pulls=(
            Pull(12, OTHER, (theirs,), created=2, merged=3, merge_commit=merged_12.sha),
            Pull(13, MEMBER, (mine,), created=4, merged=5, merge_commit=merged_13.sha),
        ),
        lookups={direct.sha: ()},
    )
    provider = ScriptedProvider(naive)

    case = generation_case(scenario, provider)

    # 사례 모양: 후보가 되지 않은 PR #12 단위가 묶음 결과의 맨 앞에 있다.
    units = real_group(case.before.outcome).units
    assert units[0].unit == PullRequestUnit(12)
    assert pull_identity(12) not in identities(case.result)
    assert identities(case.result) == [pull_identity(13), bundle_identity(direct.sha)]
    materials = gather(case.before.request, case.before.outcome, case.before.output)
    assert [each.candidate.work_identity for each in materials] == identities(
        case.result
    )
    assert [material_shas(each) for each in materials] == [[mine.sha], [direct.sha]]
    # 후보마다 자기 파일만 보낸다. 다른 계정 커밋의 파일은 어디에도 가지 않는다.
    sent = [sent_paths(each) for each in provider.generate_requests()]
    assert sorted(sent, key=sorted) == [{"app/direct.py"}, {"app/mine.py"}]
    for candidate in case.output.candidates:
        assert candidate.draft.status == "GENERATED"


# 커밋 근거만 재료: PR·병합 근거와 커밋 근거 구분


@pytest.mark.parametrize(
    "repository_name",
    [None, "commit"],
    ids=["usual-repository", "repository-named-commit"],
)
def test_pull_request_evidence_sharing_the_own_commit_sha_is_not_material(
    repository_name: str | None,
) -> None:
    """PR 근거의 판본(머리 SHA)이 본인 커밋 SHA와 같아도 PR 근거는 재료가 아니고 온전한 파일만 보낸다
    (계획 「어댑터 규칙」, 완료 기준 08).

    저장소 이름이 `commit`이면 PR 근거 주소에도 `/commit/`이 들어간다. 재료 커밋은 커밋 근거 한
    곳에서만 오고, 그 커밋은 한 번만 보낸다. 받은 변경 내용이 온전하지 않은 파일(줄 수 불일치)은
    보내지 않으며 그 한계 문구는 PR 근거가 아니라 커밋 근거 끝에 붙는다(결정 6).
    """
    mine = commit(
        sha(31),
        MEMBER,
        parents=(ROOT,),
        minute=3,
        files=[change("app/page.py"), change("app/broken.py", additions=3)],
    )
    before = run_case(open_pulls(mine))
    request, outcome, built = before.request, before.outcome, before.output
    if repository_name is not None:
        outcome = replace(
            outcome, repository=RepositoryCoordinates(OWNER, repository_name)
        )
        built = build_candidates(request, outcome)
    (candidate,) = built.candidates
    pull_evidence, commit_evidence = candidate.evidence
    # 사례 모양: PR 근거의 판본이 본인 커밋 SHA이고, 이름이 commit인 저장소는 PR 주소에도 /commit/이 있다.
    assert pull_evidence.source_revision == commit_evidence.source_revision == mine.sha
    assert pull_evidence.source_url.endswith("/pull/3")
    assert ("/commit/" in pull_evidence.source_url) == (repository_name == "commit")

    (material,) = gather(request, outcome, built)
    assert evidence_own_shas(material) == [mine.sha]
    assert material_shas(material) == [mine.sha]
    assert dict(material.evidence_index) == {mine.sha: 1}

    provider = ScriptedProvider(naive)
    run, _ = generate_on(request, outcome, built, provider)

    (call,) = provider.generate_requests()
    assert sent_commit_count(call) == 1
    assert sent_paths(call) == {"app/page.py"}
    (after,) = run.output.candidates
    assert after.draft.status == "GENERATED"
    assert after.evidence[0] == pull_evidence
    assert after.evidence[1].coverage_limits == (
        *commit_evidence.coverage_limits,
        TRUNCATED,
    )


def test_merge_commit_evidence_of_a_merge_without_pull_request_is_not_material() -> (
    None
):
    """PR 없는 병합 단위의 첫 근거(`/commit/{병합 SHA}`)는 병합 커밋이 연동 계정 것이어도 재료도 생성
    순서의 기준도 아니다(계획 「어댑터 규칙」, 결정 14, 완료 기준 15).

    PR 조회를 허용하지 않은 요청이라 PR #10의 병합은 PR 없는 병합 단위가 된다. 병합 커밋은 가장
    늦게 작성됐지만 본인 커밋 근거가 아니므로 생성 순서에도 쓰지 않는다. 그래서 커밋 묶음(가장 최근
    본인 커밋 5분)이 병합 단위(본인 커밋 2분)보다 먼저 생성된다.
    """
    feature = commit(
        sha(501), MEMBER, parents=(ROOT,), minute=2, files=[change("app/profile.py")]
    )
    # 회원이 병합 버튼을 누른 병합 커밋. 변경이 아니고 상세 조회 대상도 아니다.
    merged = merge_commit(sha(502), ROOT, feature.sha, author=MEMBER, minute=30)
    second = commit(
        sha(503),
        MEMBER,
        parents=(merged.sha,),
        minute=4,
        files=[change("app/settings.py"), change("app/menu.py")],
    )
    third = commit(
        sha(504),
        MEMBER,
        parents=(second.sha,),
        minute=5,
        files=[change("app/settings.py")],
    )
    scenario = Scenario(
        default_branch=(third, second, merged, feature, root_commit()),
        pulls=(
            Pull(10, MEMBER, (feature,), created=2, merged=3, merge_commit=merged.sha),
        ),
    )
    provider = ScriptedProvider(naive)

    case = generation_case(scenario, provider, request=live_request("COMMIT"))

    merge_value = merge_identity(merged.sha)
    bundle_value = bundle_identity(second.sha, third.sha)
    assert sorted(identities(case.result)) == sorted([merge_value, bundle_value])
    materials = {
        each.candidate.work_identity: each
        for each in gather(case.before.request, case.before.outcome, case.before.output)
    }
    merge_material = materials[merge_value]
    assert merge_material.candidate.evidence[0].source_revision == merged.sha
    assert evidence_own_shas(merge_material) == [feature.sha]
    assert merged.sha not in merge_material.evidence_index
    assert material_shas(merge_material) == [feature.sha]
    assert sorted(material_shas(materials[bundle_value])) == sorted(
        [second.sha, third.sha]
    )
    # 생성 순서: 커밋 묶음(5분) → 병합 단위(2분). 병합 커밋(30분)은 순서에 쓰지 않는다.
    assert [sent_paths(each) for each in provider.generate_requests()] == [
        {"app/settings.py", "app/menu.py"},
        {"app/profile.py"},
    ]


def test_other_account_commits_in_a_pull_request_are_not_material() -> None:
    """다른 계정이 연 PR에 섞인 다른 계정 커밋은 재료가 아니고 본인 커밋의 파일만 보낸다(본문 「근거와
    설명·질문」: 다른 계정 커밋을 확인 근거로 쓰지 않음)."""
    theirs = commit(
        sha(441), OTHER, parents=(ROOT,), minute=2, files=[change("app/theirs.py")]
    )
    mine = commit(
        sha(442),
        MEMBER,
        parents=(theirs.sha,),
        minute=3,
        files=[change("app/mine.py")],
    )
    merged = merge_commit(sha(443), ROOT, mine.sha, minute=4)
    scenario = Scenario(
        default_branch=(merged, mine, theirs, root_commit()),
        pulls=(
            Pull(
                11,
                OTHER,
                (theirs, mine),
                created=2,
                merged=4,
                merge_commit=merged.sha,
                fork=True,
            ),
        ),
    )
    provider = ScriptedProvider(naive)

    case = generation_case(scenario, provider)

    assert identities(case.result) == [pull_identity(11)]
    (material,) = gather(case.before.request, case.before.outcome, case.before.output)
    assert evidence_own_shas(material) == [mine.sha]
    assert material_shas(material) == [mine.sha]
    (call,) = provider.generate_requests()
    assert sent_paths(call) == {"app/mine.py"}
    assert "app/theirs.py" not in call.data


def long_pull(*, newest_without_patch: bool = False) -> tuple[Scenario, list[Commit]]:
    """본인 커밋 21건(근거 상한 20건 + 1)을 담은 열린 PR #40. 커밋마다 파일이 다르다.

    newest_without_patch면 최근 20건은 GitHub가 patch를 주지 않은 커밋이고, 가장 오래된 1건에만
    patch가 있다.
    """
    made: list[Commit] = []
    parent = ROOT
    for offset in range(EVIDENCE_CAP + 1):
        each = commit(
            sha(600 + offset),
            MEMBER,
            parents=(parent,),
            minute=2 + offset,
            files=[change(f"app/f{offset:02d}.py")],
        )
        if newest_without_patch and offset > 0:
            each = without_patch(each)
        made.append(each)
        parent = each.sha
    scenario = Scenario(
        default_branch=(root_commit(),),
        pulls=(Pull(40, MEMBER, tuple(made), state="open", created=1),),
    )
    return scenario, made


def test_own_commit_beyond_the_evidence_cap_is_not_material() -> None:
    """근거 20건 상한 밖(가장 오래된) 본인 커밋은 재료가 아니고 근거에 든 20건만 보낸다(계획 「어댑터
    규칙」: 재료는 후보 근거가 가리키는 커밋)."""
    scenario, made = long_pull()
    provider = ScriptedProvider(naive)

    case = generation_case(scenario, provider)

    oldest, newest_twenty = made[0], made[1:]
    (material,) = gather(case.before.request, case.before.outcome, case.before.output)
    assert sorted(material_shas(material)) == sorted(each.sha for each in newest_twenty)
    assert oldest.sha not in material_shas(material)
    assert oldest.sha not in material.evidence_index
    (call,) = provider.generate_requests()
    assert sent_paths(call) == {f"app/f{offset:02d}.py" for offset in range(1, 21)}
    assert "app/f00.py" not in call.data


# 나눈 부분 없음(CR1 BR1.1·BR7.2)


def test_every_file_of_a_material_commit_is_material_without_path_parts() -> None:
    """이슈 번호 나누기와 함께 경로 허용 목록을 지웠다. 재료 커밋의 파일은 모두 재료 후보다."""
    mine = commit(
        sha(451),
        MEMBER,
        parents=(ROOT,),
        minute=3,
        files=[change("app/a.py"), change("app/b.py")],
    )
    provider = ScriptedProvider(naive)

    case = generation_case(open_pulls(mine), provider)

    assert identities(case.result) == [identity(PullRequestUnit(3))]
    (material,) = gather(case.before.request, case.before.outcome, case.before.output)
    assert material_shas(material) == [mine.sha]
    assert not hasattr(material, "paths")
    (call,) = provider.generate_requests()
    assert sent_paths(call) == {"app/a.py", "app/b.py"}


# 재료 없음


def oversized_only() -> tuple[Scenario, CheckedRequest]:
    mine = own_commit(31, "app/page.py")
    return (
        replace(open_pulls(mine), overrides={detail_path(mine.sha): oversized()}),
        LIVE,
    )


def without_patch_only() -> tuple[Scenario, CheckedRequest]:
    mine = commit(
        sha(31),
        MEMBER,
        parents=(ROOT,),
        minute=3,
        files=[change("app/image.png"), change("app/data.bin")],
    )
    return open_pulls(without_patch(mine)), LIVE


def commit_lookup_not_allowed() -> tuple[Scenario, CheckedRequest]:
    first = own_commit(31, "app/page.py")
    second = own_commit(41, "app/list.py", minute=4)
    return open_pulls(first, second), live_request("PULL_REQUEST")


def patches_only_beyond_the_cap() -> tuple[Scenario, CheckedRequest]:
    scenario, _ = long_pull(newest_without_patch=True)
    return scenario, LIVE


@pytest.mark.parametrize(
    "make",
    [
        oversized_only,
        without_patch_only,
        commit_lookup_not_allowed,
        patches_only_beyond_the_cap,
    ],
    ids=["oversized", "no-patch", "commit-not-allowed", "patch-only-beyond-cap"],
)
def test_candidates_without_material_are_not_generated_and_add_no_failure(
    make: Callable[[], tuple[Scenario, CheckedRequest]],
) -> None:
    """재료가 0개인 후보는 제공자를 부르지 않고 설명·질문 NOT_GENERATED, 제목 null, 새 실패 없음이다
    (결정 4·8, 완료 기준 02·03·09).

    본인 커밋이 모두 응답 크기 초과, patch 없는 파일만, 커밋 조회 미허용(모든 후보), patch가 근거
    20건 상한 밖 커밋에만 있는 경우다. 후보는 그대로 남는다. 응답을 정하지 않은 합성 제공자라 한
    번이라도 부르면 시험이 실패한다.
    """
    scenario, request = make()
    provider = ScriptedProvider()

    case = generation_case(scenario, provider, request=request)

    assert case.before.output.candidates
    assert provider.requests == []
    assert_untouched(case.before.output, case.output)
    assert case.result["failures"] == case.before.result["failures"]
    assert case.result["outcome"] == case.before.result["outcome"] == "SUCCEEDED"
    for entry in case.result["candidates"]:
        assert entry["draft"] == {"status": "NOT_GENERATED", "content": None}
        assert entry["reflection"] == {"status": "NOT_GENERATED", "questions": []}
    assert case.run.report.generation_calls == 0
    assert case.run.report.rewrite_calls == 0
    assert case.run.report.no_material == len(case.output.candidates)


def stopped_with_other_candidates() -> Scenario:
    """수집 실패·미제공 집계·근거 한계가 있는 결과에 재료 있는 후보와 재료 없는 후보가 함께 있다.

    - PR #3: 본인 커밋 app/page.py(재료 있음)
    - PR #5: 본인 커밋의 변경 내용 응답이 크기 상한을 넘었다(재료 없음, 근거에 수집 한계가 있다)
    - PR #7: 본인 커밋이 빈 커밋이다(BELOW_CRITERIA 1)
    - 기본 브랜치의 본인 커밋 ffff: 변경 내용 조회가 429(COLLECTION RATE_LIMITED, 보류)
    """
    with_material = own_commit(31, "app/page.py")
    without_material = own_commit(51, "app/big.py", minute=5)
    empty = commit(named("e"), MEMBER, parents=(ROOT,), minute=6, files=[])
    direct = commit(
        named("f"), MEMBER, parents=(ROOT,), minute=7, files=[change("app/list.py")]
    )
    scenario = Scenario(
        default_branch=(direct, root_commit()),
        pulls=(
            Pull(3, MEMBER, (with_material,), state="open", created=2),
            Pull(5, MEMBER, (without_material,), state="open", created=4),
            Pull(7, MEMBER, (empty,), state="open", created=5),
        ),
        lookups={direct.sha: ()},
        overrides={
            detail_path(without_material.sha): oversized(),
            detail_path(direct.sha): status_only(429),
        },
    )
    return scenario


@pytest.mark.parametrize(
    "other_reply",
    ["failed", "generated"],
)
def test_no_material_keeps_failures_limits_counts_and_the_other_candidate(
    other_reply: str,
) -> None:
    """재료 없는 후보 처리에서 기존 수집 실패·근거 한계·미제공 집계와 다른 후보의 결과가 보존된다
    (결정 4, 완료 기준 02·09·10·13).

    다른 후보(PR #3)의 생성 호출이 실패하면 그 후보만 설명·질문 FAILED이고 DRAFT·REFLECTION 실패가
    1건씩 생긴다. 재료 없는 PR #5는 실패도 문구도 더하지 않는다.
    """
    scenario = stopped_with_other_candidates()
    reply = ProviderError() if other_reply == "failed" else naive
    provider = ScriptedProvider(reply)

    case = generation_case(scenario, provider)

    before = case.before
    assert identities(case.result) == [pull_identity(3), pull_identity(5)]
    assert failure_codes(before.result) == [("COLLECTION", "RATE_LIMITED")]
    assert not_provided(before.result) == {"BELOW_CRITERIA": 1}
    no_material = before.output.candidates[1]
    assert no_material.evidence[1].coverage_limits
    # 재료 있는 PR #3만 한 번 부른다.
    (call,) = provider.generate_requests()
    assert sent_paths(call) == {"app/page.py"}
    assert case.output.candidates[1] == no_material
    assert case.output.not_provided == before.output.not_provided
    assert case.output.failures == before.output.failures
    assert not_provided(case.result) == {"BELOW_CRITERIA": 1}
    first_id = case.result["candidates"][0]["candidateId"]
    if other_reply == "failed":
        assert failure_codes(case.result) == [
            ("COLLECTION", "RATE_LIMITED"),
            ("DRAFT", "GENERATION_CALL_FAILED"),
            ("REFLECTION", "GENERATION_CALL_FAILED"),
        ]
        assert [each.get("candidateId") for each in case.result["failures"]] == [
            None,
            first_id,
            first_id,
        ]
        assert case.output.candidates[0].draft.status == "FAILED"
        assert case.output.candidates[0].reflection.status == "FAILED"
    else:
        assert failure_codes(case.result) == [("COLLECTION", "RATE_LIMITED")]
        assert case.output.candidates[0].draft.status == "GENERATED"
    assert case.result["outcome"] == "PARTIAL_FAILED"


# 입구 경계


def test_missing_relations_with_candidates_is_a_defect() -> None:
    """후보가 있는데 관계 조회 결과가 없는 수집 결과는 입력 결함이라 ValueError다. 재료 0개로 숨기지
    않고 제공자도 부르지 않는다(계획 「어댑터 규칙」)."""
    before = run_case(open_pulls(own_commit(31, "app/page.py")))
    assert before.output.candidates
    without_relations = replace(before.outcome, relations=None)
    provider = ScriptedProvider()
    clock = FakeClock()

    with pytest.raises(ValueError):
        gather(before.request, without_relations, before.output)
    with pytest.raises(ValueError):
        run_generation(
            before.request,
            without_relations,
            before.output,
            provider=provider,
            clock=clock,
            deadline=clock() + DEFAULT_DEADLINE,
        )
    assert provider.requests == []


@pytest.mark.parametrize("relations", ["kept", "missing"])
def test_no_candidates_never_regroup(
    monkeypatch: pytest.MonkeyPatch, relations: str
) -> None:
    """후보가 0개면 어댑터는 묶음을 다시 부르지 않고 결과를 그대로 돌려준다. 관계 조회 결과가 없어도
    같다(계획 「어댑터 규칙」, 완료 기준 09·10)."""
    theirs = commit(sha(461), OTHER, parents=(ROOT,), minute=2)
    merged = merge_commit(sha(462), ROOT, theirs.sha, minute=3)
    scenario = Scenario(
        default_branch=(merged, theirs, root_commit()),
        pulls=(
            Pull(12, MEMBER, (theirs,), created=2, merged=3, merge_commit=merged.sha),
        ),
    )
    before = run_case(scenario)
    assert before.output.candidates == ()
    outcome = before.outcome
    if relations == "missing":
        outcome = replace(outcome, relations=None)
    calls = forbid_regrouping(monkeypatch)
    provider = ScriptedProvider()

    assert gather(before.request, outcome, before.output) == ()
    run, result = generate_on(before.request, outcome, before.output, provider)

    assert calls == []
    assert provider.requests == []
    assert run.output == before.output
    assert result["outcome"] == before.result["outcome"] == "EMPTY"
    assert run.report.candidates == 0


def test_collection_stopped_before_the_repository_check_passes_through(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """저장소 확인 전에 멈춘 수집(실패만 있는 결과)은 묶음·제공자를 부르지 않고 그대로 통과한다
    (완료 기준 10)."""
    request = replace(LIVE, allowed_resource_types=frozenset())
    calls = forbid_regrouping(monkeypatch)
    provider = ScriptedProvider()

    case = generation_case(Scenario(), provider, request=request)

    assert case.before.outcome.repository is None
    assert case.before.output.failures
    assert calls == []
    assert provider.requests == []
    assert case.output == case.before.output
    assert case.result["failures"] == case.before.result["failures"]
    assert case.result["outcome"] == "FAILED"


# 생성 순서


def test_generation_order_follows_the_newest_own_commit_then_its_sha() -> None:
    """생성은 근거에 든 본인 커밋의 가장 최근 작성 시각이 늦은 후보부터, 같으면 그 커밋 SHA순이고,
    결과의 후보·근거 순서는 그대로다(결정 9·14, 완료 기준 15).

    - PR #20: 본인 커밋 20분(SHA 큼). 다른 계정 커밋(40분)과 연동 계정의 병합 커밋(50분)은 본인 커밋
      근거가 아니라 순서에 쓰지 않는다.
    - 커밋 묶음 셋: 30분, 20분(SHA 작음), 5분.
    결과 순서는 PR #20이 맨 앞이지만 생성 순서는 30분 → 20분(작은 SHA) → PR #20 → 5분이다.
    """
    old = own_commit(805, "app/old.py", minute=5)
    low = own_commit(820, "app/low.py", minute=20, parent=old.sha)
    newest = own_commit(810, "app/newest.py", minute=30, parent=low.sha)
    mine = own_commit(900, "app/pull.py", minute=20)
    theirs = commit(
        sha(901),
        OTHER,
        parents=(mine.sha,),
        minute=40,
        files=[change("app/theirs.py")],
    )
    merged = merge_commit(sha(950), newest.sha, theirs.sha, author=MEMBER, minute=50)
    scenario = Scenario(
        default_branch=(merged, theirs, newest, mine, low, old, root_commit()),
        pulls=(
            Pull(
                20,
                MEMBER,
                (mine, theirs),
                created=2,
                merged=50,
                merge_commit=merged.sha,
            ),
        ),
        lookups={old.sha: (), low.sha: (), newest.sha: ()},
    )
    provider = ScriptedProvider(naive)

    case = generation_case(scenario, provider)

    expected_results = [
        pull_identity(20),
        bundle_identity(old.sha),
        bundle_identity(newest.sha),
        bundle_identity(low.sha),
    ]
    # 사례 모양: 결과 순서는 생성 순서와 다르다(PR #20이 맨 앞, 작은 SHA의 묶음이 맨 뒤).
    assert identities(case.before.result) == expected_results
    assert identities(case.result) == expected_results
    assert [sent_paths(each) for each in provider.generate_requests()] == [
        {"app/newest.py"},
        {"app/low.py"},
        {"app/pull.py"},
        {"app/old.py"},
    ]
    for before_entry, after_entry in zip(
        case.before.result["candidates"], case.result["candidates"], strict=True
    ):
        assert [each["sourceUrl"] for each in after_entry["evidence"]] == [
            each["sourceUrl"] for each in before_entry["evidence"]
        ]


def test_equal_newest_own_commit_falls_back_to_result_order() -> None:
    """가장 최근 본인 커밋(작성 시각·SHA)이 같으면 결과 순서로 정한다(결정 14, 완료 기준 15).

    한 결과 안에서 두 후보가 같은 본인 커밋을 근거로 가지는 사례를 합성 GitHub로 만들 수 없어,
    어댑터가 만든 재료의 결과 자리만 바꾼 사본으로 생성 순서 열쇠를 비교한다.
    """
    before = run_case(open_pulls(own_commit(31, "app/page.py")))
    (material,) = gather(before.request, before.outcome, before.output)
    later, earlier = replace(material, position=7), replace(material, position=2)

    ordered = sorted([later, earlier], key=lambda each: each.priority())

    assert [each.position for each in ordered] == [2, 7]


# 입구 경계의 결함과 값이 같은 단위


def test_candidate_without_a_matching_unit_is_a_defect() -> None:
    """후보에 맞는 묶음 단위가 없으면 후보 판정의 결함이라 ValueError다(재료 0개로 숨기지 않는다)."""
    before = run_case(open_pulls(own_commit(31, "app/page.py")))
    (candidate,) = before.output.candidates
    stray = replace(candidate, work_identity="wi1:" + "0" * 64)
    built = replace(before.output, candidates=(stray,))

    with pytest.raises(ValueError):
        gather(before.request, before.outcome, built)


def test_candidates_without_repository_or_account_are_a_defect() -> None:
    """후보가 있는데 수집 결과에 저장소·연동 계정이 없으면 ValueError다."""
    before = run_case(open_pulls(own_commit(31, "app/page.py")))
    assert before.output.candidates

    for outcome in (
        replace(before.outcome, repository=None),
        replace(before.outcome, linked_account=None),
    ):
        with pytest.raises(ValueError):
            gather(before.request, outcome, before.output)


def test_units_sharing_a_work_identity_join_their_own_commits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """값이 같은 단위가 둘이면(생기면 안 되지만) 두 단위의 본인 커밋을 합쳐 재료로 본다(계획 「어댑터 규칙」)."""
    first = own_commit(31, "app/a.py", minute=3)
    second = own_commit(32, "app/b.py", minute=4, parent=first.sha)
    scenario = Scenario(
        default_branch=(second, first, root_commit()),
        pulls=(Pull(3, MEMBER, (first, second), created=2),),
    )

    def doubled(
        outcome: CollectionOutcome, assigned: frozenset[str] = frozenset()
    ) -> Grouping:
        grouping = real_group(outcome, assigned)
        (unit,) = grouping.units
        halves = tuple(replace(unit, changes=(change,)) for change in unit.changes)
        return replace(grouping, units=halves)

    monkeypatch.setattr(material_module, "group", doubled)
    before = run_case(scenario)
    (material,) = gather(before.request, before.outcome, before.output)

    assert material.own_commits == frozenset({first.sha, second.sha})
    assert material_shas(material) == [second.sha, first.sha]


def test_unencodable_path_is_not_sent_and_counts_as_incomplete() -> None:
    """GitHub가 준 경로를 UTF-8로 보낼 수 없으면(짝 없는 대리 문자) 그 파일을 보내지 않고, 받은 자료가
    온전하지 않은 파일로 센다. 다른 파일은 그대로 재료다."""
    before = run_case(
        open_pulls(
            commit(
                sha(31),
                MEMBER,
                parents=(ROOT,),
                minute=3,
                files=[change("app/a.py"), change("app/b.py")],
            )
        )
    )
    (material,) = gather(before.request, before.outcome, before.output)
    (record,) = material.commits
    assert record.changes is not None
    broken = replace(record.changes.files[0], path="app/\ud800.py")
    changes = replace(record.changes, files=(broken, *record.changes.files[1:]))
    material = replace(material, commits=(replace(record, changes=changes),))

    prepared = prepare(material)

    assert [file.path for file in prepared.files] == ["app/b.py"]
    assert prepared.truncated == frozenset({record.sha})


# 재료 순서와 변경 묶음(CR1 BR5.2~BR5.6, S10·S12)


def sent_file_order(request: ProviderRequest) -> list[str]:
    """보낸 자료의 파일 경로를 자료 순서대로."""
    data = json.loads(request.data)
    return [file["path"] for commit in data["commits"] for file in commit["files"]]


def big_patch(stem: str, lines: int) -> str:
    body = [f"+{stem}_{index} = '{'y' * 80}'" for index in range(lines)]
    return f"@@ -0,0 +1,{lines} @@\n" + "\n".join(body)


def test_s10_code_lines_come_before_document_lines() -> None:
    """S10(AC3.2.1): 문서 파일이 앞, 코드 파일이 뒤인 PR에서도 코드 줄이 먼저 담긴다."""
    mine = commit(
        sha(461),
        MEMBER,
        parents=(ROOT,),
        minute=3,
        files=[
            change("docs/guide.md"),
            change("README.md"),
            change("tests/test_login.py"),
            change("app/login.py"),
        ],
    )
    provider = ScriptedProvider(naive)

    generation_case(open_pulls(mine), provider)

    (call,) = provider.generate_requests()
    assert sent_file_order(call) == [
        "app/login.py",
        "tests/test_login.py",
        "docs/guide.md",
        "README.md",
    ]


def test_s12_large_pull_request_keeps_both_folders_within_limits() -> None:
    """S12(AC3.2.3): 서로 다른 폴더 두 곳을 크게 고친 PR은 큰 후보다. 두 묶음 줄이 모두 재료에 들고, 한
    파일은 머리글을 포함해 6,000 B 이하, 전체는 자료 상한 안이다."""
    api = [
        change(
            f"api/module{index}.py", patch=big_patch(f"api{index}", 80), status="added"
        )
        for index in range(3)
    ]
    web = [
        change(
            f"web/page{index}.ts", patch=big_patch(f"web{index}", 80), status="added"
        )
        for index in range(3)
    ]
    mine = commit(sha(471), MEMBER, parents=(ROOT,), minute=3, files=[*api, *web])
    provider = ScriptedProvider(naive)

    case = generation_case(open_pulls(mine), provider)

    (call,) = provider.generate_requests()
    data = json.loads(call.data)
    files = [file for commit in data["commits"] for file in commit["files"]]
    folders = {file["path"].split("/")[0] for file in files}
    assert folders == {"api", "web"}
    for file in files:
        size = len(
            json.dumps(file, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        )
        assert size <= 6_000
    assert len(call.data.encode("utf-8")) <= 24_000
    # 크기로 뺀 줄이 있는 커밋에는 지금처럼 크기 제외 문구가 붙는다.
    assert case.run.report.size_limited_commits == 1


# CR3 재료 판정을 거친 생성(BR6.1·BR6.3·BR6.4, 시나리오 S13·S15·S29)

SMALL_DATA = GenerationLimits(max_data_bytes=700)
# 가리기 검사가 잡는 GitHub 토큰 꼴. 실행 중에 이어 붙여 만든다.
TOKEN = "".join(("gh", "p_", "Synthetic", "Leak", "0" * 30))


def big_pull() -> Scenario:
    """`web/`의 코드 파일 넷과 `api/schema.lock`(그 밖)을 고친 본인 커밋 하나의 열린 PR #6. 작은 자료 상한에서
    큰 후보다. schema.lock 앞 줄에 토큰 꼴 값이 있다."""
    files = [
        change(
            f"web/page{index}.ts",
            patch=f"@@ -1 +1 @@\n-page{index} = 1\n+page{index} = 2",
        )
        for index in range(4)
    ]
    files.append(
        change(
            "api/schema.lock",
            patch="@@ -0,0 +1,3 @@\n"
            f'+token = "{TOKEN}"\n+lockVersion = 3\n+lockHash = abc',
            status="added",
        )
    )
    own = commit(sha(61), MEMBER, parents=(ROOT,), minute=6, files=files)
    return Scenario(
        default_branch=(root_commit(),),
        pulls=(Pull(6, MEMBER, (own,), state="open", created=5),),
    )


def generated_paths(provider: ScriptedProvider) -> set[str]:
    (request,) = provider.generate_requests()
    return sent_paths(request)


def test_s13_generated_material_answer_leaves_the_file_out_of_generation() -> None:
    """S13: 합성 재료 판정이 schema.lock을 GENERATED로 답하면 그 파일의 줄은 생성 요청에 없다."""

    def answer(question: Question) -> object | None:
        if question.kind == "MATERIAL_KIND":
            return [0.0, 0.0, 1.0]
        return default_answer(question)

    without = ScriptedProvider(naive)
    generation_case(big_pull(), without, limits=SMALL_DATA)
    assert "api/schema.lock" in generated_paths(without)

    provider = ScriptedProvider(naive_ai)
    judge = SyntheticJudge(answer)
    generation_case(big_pull(), provider, limits=SMALL_DATA, judge=judge)

    assert "api/schema.lock" not in generated_paths(provider)
    (material,) = judge.material_requests()
    kinds = {(q.target, q.kind) for q in material.questions}
    assert ("api/schema.lock", "MATERIAL_KIND") in kinds


def test_s15_failed_material_judgement_keeps_the_rule_order() -> None:
    """S15: 재료 판정이 실패하면 재료는 CR1 규칙 순서이고 Catch 판정은 그대로 나간다. 실패 항목은 남지 않는다."""
    rule = ScriptedProvider(naive)
    generation_case(big_pull(), rule, limits=SMALL_DATA)
    calls = 0

    def fail_material(request: JudgementRequest) -> None:
        nonlocal calls
        calls += 1
        if request.purpose == "MATERIAL":
            raise TimeoutError("합성 재료 판정 시간 초과")

    provider = ScriptedProvider(naive_ai)
    judge = SyntheticJudge(before=fail_material)
    case = generation_case(big_pull(), provider, limits=SMALL_DATA, judge=judge)

    assert provider.generate_requests()[0].data == rule.generate_requests()[0].data
    assert calls == 2
    assert len(judge.catch_requests()) == 1
    assert case.run.report.material_judgement_reasons == {"JUDGEMENT_TIMEOUT": 1}
    assert failure_codes(case.result) == failure_codes(case.before.result)


def test_s29_masked_front_lines_are_not_in_the_material_judgement() -> None:
    """S29: 큰 후보 파일의 앞 5줄에 토큰 꼴 글이 있으면 그 줄은 재료 판정 요청에 없다(다음 줄은 그대로)."""
    judge = SyntheticJudge()
    generation_case(
        big_pull(), ScriptedProvider(naive_ai), limits=SMALL_DATA, judge=judge
    )

    (material,) = judge.material_requests()
    assert TOKEN not in material.data
    files = {entry["path"]: entry for entry in json.loads(material.data)["files"]}
    assert files["api/schema.lock"]["lines"] == ["+lockVersion = 3", "+lockHash = abc"]
    assert files["api/schema.lock"]["changedLines"] == 3
    assert set(json.loads(material.data)) == {"groups", "files"}
    assert set(files["api/schema.lock"]) == {
        "id",
        "path",
        "status",
        "changedLines",
        "lines",
    }
