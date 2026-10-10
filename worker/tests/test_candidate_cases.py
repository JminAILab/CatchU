"""후보 판정 사례(#118): 작업 동일성 판별 기준의 합성 사례를 수집부터 결과 조합까지 돌린다.

기대값은 판별 기준 문서(`docs/CatchU_work_identity_*.md`)의 작업 단위·판정 규칙·사례와 #118
명세에서 정했다. 후보 판정 코드를 읽어 맞추지 않았다. workIdentity 기대값은 wi1 함수로 따로
계산하고, 후보가 어느 단위에서 나왔는지는 그 값과 근거 출처 주소(`/pull/N`·`/commit/SHA`)로
본다. 같은 변경 사례(C14·C20~C26·C30)의 diff는 합성 git 저장소의 실제 커밋으로 만들고, 사례
모양이 맞는지 `git patch-id --stable`로 먼저 확인한다. 재제출 여부는 PR 자료(병합 여부·만든
순서·본문)를 합성해 붙인다. 모든 결과는 메시지 계약 v1을 통과해야 한다(`run_case`).

요청은 사례표처럼 LIVE다. C18·C19는 E 수신 시험의 몫이라 여기 없다.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import timedelta
from typing import Any

import pytest
from candidate_scenarios import (
    OTHER_REPOSITORY_ID,
    ROOT,
    WEB,
    CaseRun,
    Commit,
    Pull,
    PullState,
    Scenario,
    bundle_identity,
    candidate,
    change,
    commit,
    commit_url,
    commit_urls,
    evidence_urls,
    failure_codes,
    git_commit,
    identities,
    identity,
    live_request,
    merge_commit,
    merge_identity,
    named,
    not_provided,
    open_pull_with_direct_commit,
    pull_identity,
    pull_url,
    root_commit,
    run_case,
    without_patch,
)
from git_synthetic import GitRepo, python_module, requires_git, two_branches
from github_synthetic import (
    BASE,
    LISTED_COMMITS,
    LISTED_ISSUES,
    LISTED_PULLS,
    MEMBER,
    OTHER,
    REQUEST,
    FakeClock,
    Reply,
    branch_commits_path,
    commit_pulls_path,
    compare_json,
    compare_path,
    detail_diff_path,
    detail_path,
    oversized,
    pull_commits_path,
    pull_detail_json,
    pull_path,
    relation_pull_json,
    respond,
    sha,
    status_only,
)

from app.candidates import Membership
from app.candidates import group as group_outcome
from app.candidates.identity import CommitsUnit, IssueUnit, MergeUnit, Part
from app.collection import (
    PROPOSED_LIMITS,
    CollectionLimits,
    GitHubAccount,
    RelationOptions,
)

# 기본 브랜치의 뿌리 커밋(세 번째 계정). 사례마다 기본 브랜치의 맨 아래에 둔다.
B0 = ROOT
# 사례표의 `cccc…`·`dddd…`·`eeee…`·`ffff…`.
C, D, E, F = named("c"), named("d"), named("e"), named("f")


def assert_succeeded_without_holds(run: CaseRun) -> None:
    assert run.result["outcome"] == "SUCCEEDED"
    assert run.result["notProvided"] == []
    assert run.result["failures"] == []


# C6 · C7 · C8 · 쌓아 올린 PR: 저자가 연 단위와 배정


def c6_scenario(*, issue_pull_items: tuple[int, ...] = ()) -> Scenario:
    """PR #7(로그인)·#9(회원가입)가 같은 이슈 #5를 가리키고 같은 파일을 고쳤다."""
    a7 = commit(
        sha(71),
        MEMBER,
        parents=(B0,),
        message="로그인 요청 횟수 제한 (#5)",
        minute=2,
        files=[change("app/rate_limit.py")],
    )
    m7 = merge_commit(sha(72), B0, a7.sha, minute=3)
    a9 = commit(
        sha(91),
        MEMBER,
        parents=(m7.sha,),
        message="회원가입 요청 횟수 제한 (#5)",
        minute=4,
        files=[change("app/rate_limit.py")],
    )
    m9 = merge_commit(sha(92), m7.sha, a9.sha, minute=5)
    return Scenario(
        default_branch=(m9, a9, m7, a7, root_commit()),
        pulls=(
            Pull(7, MEMBER, (a7,), created=2, merged=3, merge_commit=m7.sha),
            Pull(9, MEMBER, (a9,), created=4, merged=5, merge_commit=m9.sha),
        ),
        issues=(5,),
        issue_pull_items=issue_pull_items,
    )


ISSUE_SCOPE = (
    "이 작업에서 연동 계정이 작성자로 기록된 커밋이 가리킨 이슈"
    "(이슈를 쓰거나 논의한 것은 본인 기여로 보지 않음)"
)


def issue_evidence(entry: dict[str, Any]) -> list[tuple[str, str, str]]:
    """후보 근거 가운데 이슈 근거의 (출처, 판본, 귀속 범위)."""
    return [
        (item["sourceUrl"], item["sourceRevision"], item["contributionScope"])
        for item in entry["evidence"]
        if "/issues/" in item["sourceUrl"]
    ]


def test_c6_pull_requests_sharing_issue_and_files_stay_two_works() -> None:
    run = run_case(c6_scenario())

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(7), pull_identity(9)]
    )
    assert pull_identity(7) != pull_identity(9)
    shared: list[list[tuple[str, str, str]]] = []
    for number in (7, 9):
        entry = candidate(run.result, pull_identity(number))
        assert pull_url(number) in evidence_urls(entry)
        # 겹친 것은 근거(이슈·파일)지 작업 단위가 아니다. 묶음 한계를 적을 일이 아니다.
        assert entry["groupingLimitations"] == []
        # 이슈 근거는 두 Catch에 각각 저장한다(사례 C6). 단위 근거·본인 커밋 근거 뒤에 온다.
        assert "/issues/" in entry["evidence"][-1]["sourceUrl"]
        shared.append(issue_evidence(entry))
    first, second = shared
    assert first == second
    ((url, _, scope),) = first
    assert url == f"{WEB}/issues/5"
    assert scope == ISSUE_SCOPE
    assert_succeeded_without_holds(run)


def test_issue_listing_pull_request_item_is_not_an_issue_unit() -> None:
    # 이슈 API가 준 항목이 PR이면 PR 단위로만 적고 이슈 단위로 적지 않는다.
    run = run_case(c6_scenario(issue_pull_items=(7,)))

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(7), pull_identity(9)]
    )
    assert identity(IssueUnit(7)) not in identities(run.result)


def c7_scenario() -> Scenario:
    """PR #20: cccc·dddd는 로그인 오류 수정(이슈 #5), eeee는 설치 안내 보완(이슈 #8)."""
    cc = commit(
        C,
        MEMBER,
        parents=(B0,),
        message="로그인 오류 수정 (#5)",
        minute=2,
        files=[change("app/login.py")],
    )
    dd = commit(
        D,
        MEMBER,
        parents=(C,),
        message="로그인 오류 시험 보완 (#5)",
        minute=3,
        files=[change("app/login.py"), change("tests/test_login.py")],
    )
    ee = commit(
        E,
        MEMBER,
        parents=(D,),
        message="설치 안내 보완 (#8)",
        minute=4,
        files=[change("docs/install.md")],
    )
    m20 = merge_commit(sha(2020), B0, E, minute=5)
    return Scenario(
        default_branch=(m20, ee, dd, cc, root_commit()),
        pulls=(
            Pull(20, MEMBER, (cc, dd, ee), created=2, merged=5, merge_commit=m20.sha),
        ),
        issues=(5, 8),
    )


def test_c7_pull_request_with_separately_shown_works_is_split_by_commits() -> None:
    run = run_case(c7_scenario())

    login, install = pull_identity(20, C, D), pull_identity(20, E)
    assert sorted(identities(run.result)) == sorted([login, install])
    assert pull_identity(20) not in identities(run.result)
    # 부분은 커밋 경계로 나눈 것이다. 같은 PR의 두 부분은 PR 근거를 함께 갖는다.
    for value in (login, install):
        assert pull_url(20) in evidence_urls(candidate(run.result, value))
    # 이슈 근거는 그 부분의 본인 커밋이 가리킨 이슈만이다.
    for value, number in ((login, 5), (install, 8)):
        assert [url for url, _, _ in issue_evidence(candidate(run.result, value))] == [
            f"{WEB}/issues/{number}"
        ]
    assert_succeeded_without_holds(run)


AUTHOR_BOUNDARY_PR = (
    "본인 커밋이 서로 다른 번호 2개를 가리키지만, 작성자가 한 PR로 묶은 경계를 따라 한 "
    "작업으로 두었다"
)


def test_c7_without_issue_permission_keeps_one_whole_pull_request() -> None:
    """2026-10-08 팀장 결정 「한 PR·병합 안의 서로 다른 번호」: 이슈 조회가 허용되지 않은 요청에서는
    본인 커밋이 서로 다른 번호(#5·#8)를 가리킨다는 것만으로 나누지 않고 작성자가 묶은 PR 경계를
    따른다(C7 10월 기대값 Catch 1개). 그 사실은 groupingLimitations에만 남기고 세지 않는다."""
    run = run_case(c7_scenario(), request=live_request("COMMIT", "PULL_REQUEST"))

    assert identities(run.result) == [pull_identity(20)]
    assert run.result["candidates"][0]["groupingLimitations"] == [AUTHOR_BOUNDARY_PR]
    # 이슈 조회가 허용되지 않았으므로 이슈 근거도 없다.
    assert issue_evidence(run.result["candidates"][0]) == []
    assert_succeeded_without_holds(run)


@pytest.mark.parametrize(
    ("override", "code"),
    [
        # 연결 PR 조회는 마친 PR 밖 본인 커밋의 변경 내용 조회가 500이다.
        ("direct", "COLLECTION_FETCH_FAILED"),
        # 다른 PR #99의 본인 커밋 변경 내용 조회가 429다.
        ("other-pull", "RATE_LIMITED"),
    ],
)
def test_c7_split_is_kept_when_an_unrelated_check_stops(
    override: str, code: str
) -> None:
    """나누기 근거를 모두 받았으면 무관한 조회가 멈춰도 두 부분과 같은
    workIdentity를 그대로 낸다. 멈춘 쪽 커밋은 변경 내용을 받지 못해 후보가 아니다."""
    base = c7_scenario()
    if override == "direct":
        extra = commit(
            F, MEMBER, parents=(sha(2020),), minute=9, files=[change("app/list.py")]
        )
        scenario = replace(
            base,
            default_branch=(extra, *base.default_branch),
            lookups={F: ()},
            overrides={detail_path(F): status_only(500)},
        )
    else:
        other = commit(
            sha(9901), MEMBER, parents=(B0,), minute=6, files=[change("app/other.py")]
        )
        scenario = replace(
            base,
            pulls=(
                *base.pulls,
                Pull(99, MEMBER, (other,), state="open", created=6),
            ),
            overrides={detail_path(other.sha): status_only(429)},
        )

    run = run_case(scenario)

    login, install = pull_identity(20, C, D), pull_identity(20, E)
    assert sorted(identities(run.result)) == sorted([login, install])
    assert run.result["notProvided"] == []
    assert failure_codes(run.result) == [("COLLECTION", code)]
    assert run.result["outcome"] == "PARTIAL_FAILED"


def c8_scenario() -> Scenario:
    """#10·#11을 통합 브랜치로 병합한 뒤 둘을 담은 #12를 기본 브랜치에 병합(모두 병합 커밋)."""
    a10 = commit(sha(110), MEMBER, parents=(B0,), message="로그인 요청 제한", minute=2)
    i10 = merge_commit(sha(111), B0, a10.sha, minute=3)
    a11 = commit(sha(120), MEMBER, parents=(B0,), message="가입 화면", minute=4)
    i11 = merge_commit(sha(121), i10.sha, a11.sha, minute=5)
    m12 = merge_commit(sha(130), B0, i11.sha, minute=7)
    integration = "integration"
    return Scenario(
        default_branch=(m12, i11, a11, i10, a10, root_commit()),
        pulls=(
            Pull(
                10,
                MEMBER,
                (a10,),
                created=2,
                merged=3,
                merge_commit=i10.sha,
                base_ref=integration,
            ),
            Pull(
                11,
                MEMBER,
                (a11,),
                created=4,
                merged=5,
                merge_commit=i11.sha,
                base_ref=integration,
            ),
            # 통합 PR의 커밋 목록에는 앞 PR의 커밋과 병합 커밋이 그대로 담긴다.
            Pull(
                12,
                MEMBER,
                (a10, i10, a11, i11),
                created=6,
                merged=7,
                merge_commit=m12.sha,
                head=i11.sha,
            ),
        ),
    )


def test_c8_integration_pull_request_has_no_assigned_change() -> None:
    run = run_case(c8_scenario())

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(10), pull_identity(11)]
    )
    assert pull_identity(12) not in identities(run.result)
    for entry in run.result["candidates"]:
        assert pull_url(12) not in evidence_urls(entry)
    # 배정받은 변경이 없는 단위는 후보도 미제공 수도 만들지 않는다.
    assert_succeeded_without_holds(run)


def stacked_scenario() -> tuple[Scenario, tuple[str, str, str]]:
    """#31은 #30의 브랜치 위에 쌓았다. #30이 먼저 병합됐다."""
    p1 = commit(
        sha(301), MEMBER, parents=(B0,), minute=2, files=[change("app/feed.py")]
    )
    p2 = commit(
        sha(302), MEMBER, parents=(p1.sha,), minute=3, files=[change("app/feed.py")]
    )
    p3 = commit(
        sha(311),
        MEMBER,
        parents=(p2.sha,),
        minute=4,
        files=[change("app/feed_page.py")],
    )
    m30 = merge_commit(sha(303), B0, p2.sha, minute=5)
    m31 = merge_commit(sha(313), m30.sha, p3.sha, minute=6)
    scenario = Scenario(
        default_branch=(m31, m30, p3, p2, p1, root_commit()),
        pulls=(
            Pull(30, MEMBER, (p1, p2), created=2, merged=5, merge_commit=m30.sha),
            Pull(31, MEMBER, (p1, p2, p3), created=3, merged=6, merge_commit=m31.sha),
        ),
    )
    return scenario, (p1.sha, p2.sha, p3.sha)


def test_stacked_pull_requests_give_shared_commits_to_earlier_merged_base() -> None:
    scenario, (p1, p2, p3) = stacked_scenario()

    run = run_case(scenario)

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(30), pull_identity(31)]
    )
    base = candidate(run.result, pull_identity(30))
    stacked = candidate(run.result, pull_identity(31))
    assert commit_urls(base) == {commit_url(p1), commit_url(p2)}
    # 뒤 PR은 자기 커밋만 갖는다. 같은 변경은 한 후보에만 속한다.
    assert commit_urls(stacked) == {commit_url(p3)}
    assert_succeeded_without_holds(run)


@pytest.mark.parametrize("list_state", ["oversized", "revision-mismatch"])
def test_stacked_commits_under_an_unread_earlier_list_carry_a_limit(
    list_state: str,
) -> None:
    """2026-10-09 팀장 결정: 먼저 병합된 #30의 커밋 목록이 크기 상한을 넘었거나 판본이 맞지 않았다.

    #30에도 든 p1·p2는 #31의 목록에서만 보이므로 #31에 배정하고 보류하지 않는다. 대신 #31의 PR
    근거에 「…그 PR에도 담긴 변경일 수 있다」를 적는다. 집계와 실패는 그대로다.
    """
    scenario, (p1, p2, p3) = stacked_scenario()
    if list_state == "oversized":
        scenario = replace(scenario, overrides={pull_commits_path(30): oversized()})
    else:
        # 관측한 머리 커밋이 받은 목록의 끝이 아니다(읽는 동안 PR이 바뀜).
        moved = replace(scenario.pull(30), head=sha(399))
        scenario = replace(scenario, pulls=(moved, scenario.pull(31)))

    run = run_case(scenario)

    assert run.outcome.relations is not None
    statuses = {
        entry.number: entry.status
        for entry in run.outcome.relations.pull_request_commits
    }
    assert statuses[30] == (
        "OVERSIZED" if list_state == "oversized" else "REVISION_MISMATCH"
    )
    assert identities(run.result) == [pull_identity(31)]
    stacked = candidate(run.result, pull_identity(31))
    assert commit_urls(stacked) == {commit_url(p1), commit_url(p2), commit_url(p3)}
    assert (
        "먼저 병합된 PR 가운데 커밋 목록을 다 받지 못한 PR이 있어, 그 PR에도 담긴 변경일 수 있다"
        in stacked["evidence"][0]["coverageLimits"]
    )
    assert_succeeded_without_holds(run)


# 같은 변경: 재제출(C14·C23·C26)


@dataclass(frozen=True)
class Resubmission:
    first: str
    second: str
    scenario: Scenario


def resubmission(
    repo: GitRepo,
    *,
    base: str,
    first: str,
    second: str,
    moved_base: str | None = None,
    body: str = "#11을 다시 올립니다",
    second_without_patch: bool = False,
) -> Resubmission:
    """PR #11(병합 없이 닫힘)의 변경을 나중에 만든 PR #12로 다시 내 병합 커밋으로 합쳤다.

    moved_base를 주면 그사이 기준 브랜치가 바뀌어 #12가 그 위에서 다시 만든 변경이다.
    """
    repo.write("app.py", base)
    root = repo.commit("기준")
    repo.branch("pr-11")
    repo.checkout("pr-11")
    repo.write("app.py", first)
    old = repo.commit("PR #11 변경")
    repo.checkout("main")
    moved = None
    if moved_base is not None:
        repo.write("app.py", moved_base)
        moved = repo.commit("기준 브랜치의 다른 변경")
    repo.branch("pr-12")
    repo.checkout("pr-12")
    repo.write("app.py", second)
    new = repo.commit("PR #12 변경")
    repo.checkout("main")
    merged = repo.merge("pr-12", "PR #12 병합")

    resubmitted = git_commit(repo, new, MEMBER)
    if second_without_patch:
        resubmitted = without_patch(resubmitted)
    main = [git_commit(repo, merged, OTHER), resubmitted]
    if moved is not None:
        main.append(git_commit(repo, moved, OTHER))
    main.append(git_commit(repo, root, OTHER))
    scenario = Scenario(
        default_branch=tuple(main),
        pulls=(
            Pull(
                11, MEMBER, (git_commit(repo, old, MEMBER),), state="closed", created=10
            ),
            Pull(
                12,
                MEMBER,
                (resubmitted,),
                created=20,
                merged=30,
                merge_commit=merged,
                body=body,
            ),
        ),
    )
    return Resubmission(old, new, scenario)


def c14(repo: GitRepo, **changes: Any) -> Resubmission:
    """rebase로 줄 위치만 바뀌고 앞뒤 문맥 줄까지 내용이 같다."""
    prefix = "import os\nimport sys\n\n"
    return resubmission(
        repo,
        base=python_module('message = "old"'),
        first=python_module('message = "new"'),
        moved_base=prefix + python_module('message = "old"'),
        second=prefix + python_module('message = "new"'),
        **changes,
    )


def c23(repo: GitRepo) -> Resubmission:
    """포매터로 연산자 주변 공백만 정리해 다시 냈다."""
    return resubmission(
        repo,
        base=python_module("price = 3"),
        first=python_module("price = 3", "total=price*count+fee"),
        second=python_module("price = 3", "total = price * count + fee"),
    )


def c26(repo: GitRepo) -> Resubmission:
    """그사이 고친 줄 바로 앞(문맥 줄)이 바뀌었다. 더하고 뺀 줄은 같다."""
    return resubmission(
        repo,
        base=python_module("before = 1", 'message = "old"'),
        first=python_module("before = 1", 'message = "new"'),
        moved_base=python_module("before = 2", 'message = "old"'),
        second=python_module("before = 2", 'message = "new"'),
    )


@requires_git
@pytest.mark.parametrize("build", [c14, c23], ids=["C14", "C23"])
def test_resubmitted_same_change_goes_to_the_merged_pull_request(
    repo: GitRepo, build: Callable[[GitRepo], Resubmission]
) -> None:
    case = build(repo)
    # 사례 모양: SHA는 다르고 공백을 무시한 diff는 같다.
    assert case.first != case.second
    assert repo.git_patch_id(case.first) == repo.git_patch_id(case.second)

    run = run_case(case.scenario)

    # 같은 변경으로 합치기 전에 두 커밋의 파일 모드를 diff 형식으로 확인했다.
    assert {detail_diff_path(case.first), detail_diff_path(case.second)} <= set(
        run.transport.paths
    )
    assert identities(run.result) == [pull_identity(12)]
    for entry in run.result["candidates"]:
        assert pull_url(11) not in evidence_urls(entry)
    assert commit_url(case.second) in commit_urls(run.result["candidates"][0])
    # 배정받지 못한 #11은 후보도 미제공 수도 만들지 않는다.
    assert_succeeded_without_holds(run)


@requires_git
def test_c26_relation_with_changed_context_keeps_both_with_limitation(
    repo: GitRepo,
) -> None:
    case = c26(repo)
    assert repo.git_patch_id(case.first) != repo.git_patch_id(case.second)

    run = run_case(case.scenario)

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(11), pull_identity(12)]
    )
    for entry in run.result["candidates"]:
        # 같은 작업을 다시 낸 것일 수 있다는 점을 두 후보 모두에 적는다.
        assert entry["groupingLimitations"]
    assert_succeeded_without_holds(run)


@requires_git
def test_c26_relation_without_patch_keeps_both_with_limitation(repo: GitRepo) -> None:
    # 내용은 같아도 한쪽 변경 내용(patch)이 빠지면 비교할 수 없으므로 확정하지 않는다.
    case = c14(repo, second_without_patch=True)
    assert repo.git_patch_id(case.first) == repo.git_patch_id(case.second)

    run = run_case(case.scenario)

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(11), pull_identity(12)]
    )
    for entry in run.result["candidates"]:
        assert entry["groupingLimitations"]
    assert_succeeded_without_holds(run)


# 같은 변경: cherry-pick 표시(C20·C25)


@requires_git
@pytest.mark.parametrize(
    ("numbers", "edited"),
    [((30, 31), False), ((32, 33), True)],
    ids=["C20", "C25"],
)
def test_cherry_picked_change_goes_to_the_earlier_merged_pull_request(
    repo: GitRepo, numbers: tuple[int, int], edited: bool
) -> None:
    original_number, picked_number = numbers
    repo.write("app.py", python_module('message = "old"'))
    root = repo.commit("기준")
    repo.branch("release")
    repo.branch("pr-original")
    repo.checkout("pr-original")
    repo.write("app.py", python_module('message = "a b"'))
    original = repo.commit(f"PR #{original_number} 변경")
    repo.checkout("main")
    merged = repo.merge("pr-original", f"PR #{original_number} 병합")
    repo.checkout("release")
    if not edited:
        # C20: release 브랜치의 앞부분이 달라 줄 위치만 바뀐다.
        repo.write("app.py", "# release\n\n" + python_module('message = "old"'))
        repo.commit("release 준비")
    repo.branch("pr-picked")
    repo.checkout("pr-picked")
    picked = repo.cherry_pick_x(original)
    if edited:
        # C25: 옮긴 뒤 문자열 안 공백을 고쳐 실행 결과가 달라졌다(감수한 한계 L11).
        repo.write("app.py", python_module('message = "ab"'))
        picked = repo.amend()
    repo.checkout("release")
    release_merge = repo.merge("pr-picked", f"PR #{picked_number} 병합")
    assert f"(cherry picked from commit {original})" in repo.message(picked)
    assert repo.git_patch_id(original) == repo.git_patch_id(picked)

    scenario = Scenario(
        default_branch=(
            git_commit(repo, merged, OTHER),
            git_commit(repo, original, MEMBER),
            git_commit(repo, root, OTHER),
        ),
        pulls=(
            Pull(
                original_number,
                MEMBER,
                (git_commit(repo, original, MEMBER),),
                created=10,
                merged=20,
                merge_commit=merged,
            ),
            Pull(
                picked_number,
                MEMBER,
                (git_commit(repo, picked, MEMBER),),
                created=21,
                merged=30,
                merge_commit=release_merge,
                base_ref="release",
            ),
        ),
    )

    run = run_case(scenario)

    assert {detail_diff_path(original), detail_diff_path(picked)} <= set(
        run.transport.paths
    )
    assert identities(run.result) == [pull_identity(original_number)]
    for entry in run.result["candidates"]:
        assert pull_url(picked_number) not in evidence_urls(entry)
    assert_succeeded_without_holds(run)


@requires_git
def test_cherry_pick_amended_to_change_only_the_file_mode_keeps_both_with_limitation(
    repo: GitRepo,
) -> None:
    """cherry-pick -x 뒤 amend로 실행 권한만 바꾼 PR은 같은 변경이 아니다.

    관계 근거(cherry-pick 표시)가 있고 `patch`도 같지만 git이 해시하는 파일 모드가 다르다.
    """
    if not repo.records_file_mode():
        pytest.skip("이 파일 시스템은 실행 권한을 기록하지 않는다")
    repo.write("base.txt", "x\n")
    root = repo.commit("기준")
    repo.branch("release")
    repo.branch("pr-original")
    repo.checkout("pr-original")
    repo.write("run.sh", "echo hi\n")
    repo.chmod("run.sh", executable=False)
    original = repo.commit("PR #30 변경")
    repo.checkout("main")
    merged = repo.merge("pr-original", "PR #30 병합")
    repo.checkout("release")
    repo.branch("pr-picked")
    repo.checkout("pr-picked")
    repo.cherry_pick_x(original)
    repo.chmod("run.sh", executable=True)
    picked = repo.amend()
    repo.checkout("release")
    release_merge = repo.merge("pr-picked", "PR #31 병합")
    # 사례 모양: 옮긴 표시가 있고 patch는 같으며 git patch-id는 모드 때문에 다르다.
    assert f"(cherry picked from commit {original})" in repo.message(picked)
    assert repo.github_files(original) == repo.github_files(picked)
    assert repo.git_patch_id(original) != repo.git_patch_id(picked)

    scenario = Scenario(
        default_branch=(
            git_commit(repo, merged, OTHER),
            git_commit(repo, original, MEMBER),
            git_commit(repo, root, OTHER),
        ),
        pulls=(
            Pull(
                30,
                MEMBER,
                (git_commit(repo, original, MEMBER),),
                created=10,
                merged=20,
                merge_commit=merged,
            ),
            Pull(
                31,
                MEMBER,
                (git_commit(repo, picked, MEMBER),),
                created=21,
                merged=30,
                merge_commit=release_merge,
                base_ref="release",
            ),
        ),
    )

    run = run_case(scenario)

    assert {detail_diff_path(original), detail_diff_path(picked)} <= set(
        run.transport.paths
    )
    assert sorted(identities(run.result)) == sorted(
        [pull_identity(30), pull_identity(31)]
    )
    for entry in run.result["candidates"]:
        (limitation,) = entry["groupingLimitations"]
        assert limitation.startswith("cherry-pick으로 옮긴 같은 변경일 수 있다")
    assert_succeeded_without_holds(run)


def picked_pull_scenario(**overrides: Reply) -> Scenario:
    """PR #30의 변경을 cherry-pick -x로 옮긴 PR #31(release 대상). patch는 같다."""
    original = commit(
        sha(301), MEMBER, parents=(B0,), minute=2, files=[change("app/feature.py")]
    )
    merged = merge_commit(sha(330), B0, original.sha, minute=3)
    picked = commit(
        sha(311),
        MEMBER,
        parents=(B0,),
        message=f"옮김\n\n(cherry picked from commit {original.sha})",
        minute=4,
        files=[change("app/feature.py")],
    )
    return Scenario(
        default_branch=(merged, original, root_commit()),
        pulls=(
            Pull(30, MEMBER, (original,), created=1, merged=3, merge_commit=merged.sha),
            Pull(31, MEMBER, (picked,), created=4, merged=6, base_ref="release"),
        ),
        overrides=overrides,
    )


def test_cherry_pick_whose_mode_diff_is_oversized_keeps_both_with_limitation() -> None:
    """모드를 담은 diff를 받을 수 없으면 비교할 수 없다(두 후보와 양쪽 한계, C26)."""
    assert identities(run_case(picked_pull_scenario()).result) == [pull_identity(30)]

    run = run_case(picked_pull_scenario(**{detail_diff_path(sha(311)): oversized()}))

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(30), pull_identity(31)]
    )
    for entry in run.result["candidates"]:
        (limitation,) = entry["groupingLimitations"]
        assert limitation.startswith("cherry-pick으로 옮긴 같은 변경일 수 있다")
    assert_succeeded_without_holds(run)


@pytest.mark.parametrize(
    ("refused", "last"),
    [
        (detail_diff_path(sha(311)), detail_diff_path(sha(301))),
        (detail_path(sha(311)), detail_path(sha(301))),
    ],
    ids=["mode-check", "details"],
)
def test_stop_before_the_mode_check_keeps_confirmed_pull_requests_with_limitation(
    refused: str, last: str
) -> None:
    """모드 확인에 닿지 못하면 같은 변경인지 비교하지 못한 쌍이다.

    #30·#31은 각자의 커밋 목록으로 소속을 확인했으므로 보류하지 않고 양쪽에 한계를 적는다.
    #31의 변경 내용을 받기 전에 멈췄으면 #31은 빈 커밋인지 몰라 후보로 내지 않는다.
    어느 쪽도 notProvided에 세지 않고 실패를 넘긴다.
    """
    full = run_case(picked_pull_scenario())
    limits = replace(PROPOSED_LIMITS, max_calls=full.transport.paths.index(refused))

    run = run_case(picked_pull_scenario(), limits=limits)

    assert run.transport.paths[-1] == last
    numbers = [30, 31] if refused == detail_diff_path(sha(311)) else [30]
    assert sorted(identities(run.result)) == sorted(pull_identity(n) for n in numbers)
    for entry in run.result["candidates"]:
        (limitation,) = entry["groupingLimitations"]
        assert limitation.startswith("cherry-pick으로 옮긴 같은 변경일 수 있다")
    assert run.result["notProvided"] == []
    assert failure_codes(run.result) == [("COLLECTION", "BUDGET_EXCEEDED")]
    assert run.result["outcome"] == "PARTIAL_FAILED"


# 관계 근거 없는 같은 diff(C21·C22·C24·C30)


def both_merged(
    repo: GitRepo, numbers: tuple[int, int], base: str, first: str, second: str
) -> Scenario:
    """두 PR이 모두 병합 커밋으로 병합됐다. 병합 커밋은 부모만 정한 합성 항목이다."""
    root, one, two = two_branches(repo, base, first, second)
    first_merge = merge_commit(sha(numbers[0] + 6000), root, one, minute=10)
    second_merge = merge_commit(sha(numbers[1] + 6000), first_merge.sha, two, minute=11)
    one_commit, two_commit = (
        git_commit(repo, one, MEMBER),
        git_commit(repo, two, MEMBER),
    )
    return Scenario(
        default_branch=(
            second_merge,
            first_merge,
            two_commit,
            one_commit,
            git_commit(repo, root, OTHER),
        ),
        pulls=(
            Pull(
                numbers[0],
                MEMBER,
                (one_commit,),
                created=5,
                merged=10,
                merge_commit=first_merge.sha,
            ),
            Pull(
                numbers[1],
                MEMBER,
                (two_commit,),
                created=6,
                merged=11,
                merge_commit=second_merge.sha,
            ),
        ),
    )


SameDiffCase = tuple[tuple[int, int], Scenario, tuple[str, str]]


def c21(repo: GitRepo) -> SameDiffCase:
    numbers = (20, 21)
    scenario = both_merged(
        repo,
        numbers,
        python_module('message = "old"'),
        python_module('message = "a b"'),
        python_module('message = "ab"'),
    )
    return numbers, scenario, _changed_pair(scenario)


def c22(repo: GitRepo) -> SameDiffCase:
    numbers = (22, 23)
    scenario = both_merged(
        repo,
        numbers,
        python_module("if False:", "    pass", "y = 2"),
        python_module("if False:", "    pass", "    y = 2"),
        python_module("if False:", "    pass", "y = 2   "),
    )
    return numbers, scenario, _changed_pair(scenario)


def c24(repo: GitRepo) -> SameDiffCase:
    """PR #40의 변경을 되돌린 뒤 같은 내용을 PR #45로 다시 넣었다. 둘 다 이슈 #38을 참고했다."""
    repo.write("app.py", python_module("enabled = False"))
    root = repo.commit("기준")
    repo.branch("pr-40")
    repo.checkout("pr-40")
    repo.write("app.py", python_module("enabled = True"))
    first = repo.commit("기능 켜기 (#38)")
    repo.checkout("main")
    first_merge = repo.merge("pr-40", "PR #40 병합")
    reverted = repo.revert(first)
    repo.branch("pr-45")
    repo.checkout("pr-45")
    repo.write("app.py", python_module("enabled = True"))
    second = repo.commit("기능 다시 켜기 (#38)")
    repo.checkout("main")
    second_merge = repo.merge("pr-45", "PR #45 병합")
    first_commit = git_commit(repo, first, MEMBER)
    second_commit = git_commit(repo, second, MEMBER)
    scenario = Scenario(
        default_branch=(
            git_commit(repo, second_merge, OTHER),
            second_commit,
            git_commit(repo, reverted, OTHER),
            git_commit(repo, first_merge, OTHER),
            first_commit,
            git_commit(repo, root, OTHER),
        ),
        pulls=(
            Pull(
                40,
                MEMBER,
                (first_commit,),
                created=10,
                merged=20,
                merge_commit=first_merge,
                body="이슈 #38 참고",
            ),
            Pull(
                45,
                MEMBER,
                (second_commit,),
                created=30,
                merged=40,
                merge_commit=second_merge,
                body="이슈 #38 참고",
            ),
        ),
        issues=(38,),
    )
    return (40, 45), scenario, (first, second)


def c30(repo: GitRepo) -> SameDiffCase:
    """#50은 병합 없이 닫혔고, 나중에 따로 만든 #51이 병합됐다. #51은 #50을 가리키지 않는다."""
    root, one, two = two_branches(
        repo,
        python_module('message = "old"'),
        python_module('message = "a b"'),
        python_module('message = "ab"'),
    )
    second_merge = merge_commit(sha(6051), root, two, minute=11)
    two_commit = git_commit(repo, two, MEMBER)
    scenario = Scenario(
        default_branch=(second_merge, two_commit, git_commit(repo, root, OTHER)),
        pulls=(
            Pull(
                50,
                MEMBER,
                (git_commit(repo, one, MEMBER),),
                state="closed",
                created=5,
                body="이슈 #38 참고",
            ),
            Pull(
                51,
                MEMBER,
                (two_commit,),
                created=6,
                merged=11,
                merge_commit=second_merge.sha,
                title="메시지 문구 정리",
                body="이슈 #38 참고",
            ),
        ),
        issues=(38,),
    )
    return (50, 51), scenario, (one, two)


def _changed_pair(scenario: Scenario) -> tuple[str, str]:
    first, second = (pull.commits[0].sha for pull in scenario.pulls)
    return first, second


@requires_git
@pytest.mark.parametrize(
    "build", [c21, c22, c24, c30], ids=["C21", "C22", "C24", "C30"]
)
def test_same_diff_without_relation_evidence_stays_two_works(
    repo: GitRepo, build: Callable[[GitRepo], SameDiffCase]
) -> None:
    numbers, scenario, (first, second) = build(repo)
    # 사례 모양: 공백을 무시한 diff는 같다. 관계 근거(재제출·cherry-pick 표시)는 없다.
    assert first != second
    assert repo.git_patch_id(first) == repo.git_patch_id(second)

    run = run_case(scenario)

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(numbers[0]), pull_identity(numbers[1])]
    )
    for entry in run.result["candidates"]:
        # 관계 근거가 없으면 다른 변경이다. groupingLimitations에 따로 적지 않는다.
        assert entry["groupingLimitations"] == []
    assert_succeeded_without_holds(run)


# 구별 불가(C15)


def c15_scenario() -> Scenario:
    """PR #20의 두 작업(이슈 #5·#8)이 같은 파일을 번갈아 고쳤다."""
    k1 = commit(
        sha(1501),
        MEMBER,
        parents=(B0,),
        message="알림 묶음 처리 (#5)",
        minute=2,
        files=[change("app/notify.py")],
    )
    k2 = commit(
        sha(1502),
        MEMBER,
        parents=(k1.sha,),
        message="알림 시간 표시 (#8)",
        minute=3,
        files=[change("app/notify.py")],
    )
    k3 = commit(
        sha(1503),
        MEMBER,
        parents=(k2.sha,),
        message="알림 묶음 처리 보완 (#5)",
        minute=4,
        files=[change("app/notify.py")],
    )
    m20 = merge_commit(sha(1520), B0, k3.sha, minute=5)
    return Scenario(
        default_branch=(m20, k3, k2, k1, root_commit()),
        pulls=(
            Pull(20, MEMBER, (k1, k2, k3), created=2, merged=5, merge_commit=m20.sha),
        ),
        issues=(5, 8),
    )


def test_c15_indistinguishable_works_stay_one_candidate_with_limitation() -> None:
    run = run_case(c15_scenario())

    assert identities(run.result) == [pull_identity(20)]
    # 구별 불가: 나누지 않고 한 후보, 한계는 groupingLimitations에. notProvided에 세지 않는다.
    assert run.result["candidates"][0]["groupingLimitations"]
    assert_succeeded_without_holds(run)


def test_c15_without_issue_permission_keeps_the_author_boundary() -> None:
    """2026-10-08 팀장 결정 「한 PR·병합 안의 서로 다른 번호」: 이슈 조회가 없으면 C15도 C7과 같은
    한계 문장 하나로 한 후보다."""
    run = run_case(c15_scenario(), request=live_request("COMMIT", "PULL_REQUEST"))

    assert identities(run.result) == [pull_identity(20)]
    assert run.result["candidates"][0]["groupingLimitations"] == [AUTHOR_BOUNDARY_PR]
    assert_succeeded_without_holds(run)


# 단위 미확정(C16, 자료 범위 한계 포함)·근거 부족(C17)


def test_c16_conflicting_membership_is_held_as_undetermined() -> None:
    run = run_case(open_pull_with_direct_commit())

    assert identities(run.result) == [pull_identity(3)]
    assert commit_url(F) not in evidence_urls(run.result["candidates"][0])
    assert not_provided(run.result) == {"UNDETERMINED": 1}
    # 조회를 마친 뒤의 보류라 실패가 아니다. PR #3 후보가 있으므로 SUCCEEDED다.
    assert run.result["failures"] == []
    assert run.result["outcome"] == "SUCCEEDED"


def test_c16_without_other_candidate_is_empty() -> None:
    run = run_case(open_pull_with_direct_commit(pull_author=OTHER))

    assert run.result["candidates"] == []
    assert not_provided(run.result) == {"UNDETERMINED": 1}
    assert run.result["failures"] == []
    assert run.result["outcome"] == "EMPTY"


@pytest.mark.parametrize(
    "unit",
    [
        lambda: CommitsUnit(("aaaaaaa",)),
        lambda: MergeUnit("aaaaaaa"),
        lambda: identity(CommitsUnit((F,)), [Part("aaaaaaa")]),
    ],
    ids=["commits", "merge", "part"],
)
def test_c17_short_sha_cannot_become_an_identity(unit: Callable[[], object]) -> None:
    # 값 생성 함수만 보는 순수 단위 시험이다(수집을 거치지 않는다). 짧은 SHA는 값에 쓰지 않는다.
    # 수집도 전체 SHA만 받으므로 짧은 SHA 근거는 들어오지 않는다.
    with pytest.raises(ValueError):
        unit()


@pytest.mark.parametrize(
    "lookup",
    [
        oversized(),
        respond(
            [relation_pull_json(100 + n, OTHER) for n in range(100)], next_page=True
        ),
    ],
    ids=["oversized", "more-than-a-page"],
)
@pytest.mark.parametrize("with_pull", [True, False], ids=["with-pr3", "alone"])
def test_range_limited_membership_is_undetermined(
    lookup: Reply, with_pull: bool
) -> None:
    """자료 범위 한계 사례는 연결 PR 응답 크기 초과·PR 100건과 다음 쪽으로 만든다."""
    # 연결 PR 응답이 크기 상한을 넘었거나 한 쪽을 넘어(자료 범위 한계) 소속을 확정하지 못했다.
    # 전체 SHA라 근거 요건은 채웠고(C17이 아니다) 정한 범위대로 조회도 마쳤으므로 단위
    # 미확정이다(2026-09-30 집계 결정). 실패는 없다.
    run = run_case(open_pull_with_direct_commit(lookup=lookup, with_pull=with_pull))

    assert identities(run.result) == ([pull_identity(3)] if with_pull else [])
    for entry in run.result["candidates"]:
        assert commit_url(F) not in evidence_urls(entry)
    assert not_provided(run.result) == {"UNDETERMINED": 1}
    assert run.result["failures"] == []
    assert run.result["outcome"] == ("SUCCEEDED" if with_pull else "EMPTY")


def test_lookup_with_unknown_base_repository_is_undetermined() -> None:
    """기준 저장소를 알 수 없는 연결 PR은 이 저장소 PR일 수 있다."""
    run = run_case(
        open_pull_with_direct_commit(
            lookup=respond([relation_pull_json(44, OTHER, base_repository=None)]),
            with_pull=False,
        )
    )

    assert run.result["candidates"] == []
    assert not_provided(run.result) == {"UNDETERMINED": 1}
    assert run.result["failures"] == []
    assert run.result["outcome"] == "EMPTY"


@pytest.mark.parametrize("status", [409, 422])
@pytest.mark.parametrize("with_pull", [True, False], ids=["with-pr3", "alone"])
def test_c17_lookup_refusal_is_a_collection_failure(
    status: int, with_pull: bool
) -> None:
    """조회 오류는 수집 실패(작업 동일성 기준 2026-09-30): 연결 PR 조회 409·422는 수집 실패다. 그 변경은 보류하고 세지 않는다.

    지금 수집은 연결 PR 조회 뒤에 변경 내용을 받으므로 여기서 멈추면 PR #3 커밋의
    변경 내용도 받지 못한다. 빈 커밋인지 모르는 PR #3도 후보로 내지 않고 세지 않는다.
    """
    run = run_case(
        open_pull_with_direct_commit(lookup=status_only(status), with_pull=with_pull)
    )

    assert run.transport.paths.count(commit_pulls_path(F)) == 1
    assert run.result["candidates"] == []
    assert run.result["notProvided"] == []
    assert failure_codes(run.result) == [("COLLECTION", "COLLECTION_FETCH_FAILED")]
    assert run.result["outcome"] == "FAILED"


def test_compare_refusal_holds_the_pull_request_and_records_a_failure() -> None:
    """2026-10-08 결정(커밋 250개 넘는 PR): 250건 넘는 PR의 비교 조회 거절(404)은 수집 실패다. 그 PR 커밋은 보류하고 세지 않는다."""
    line: list[Commit] = []
    parent = B0
    for n in range(260):
        line.append(commit(sha(6000 + n), MEMBER, parents=(parent,), minute=2 + n))
        parent = line[-1].sha
    # 열린 PR #5의 커밋은 260건이다. PR 커밋 목록은 앞의 250건만 준다.
    pull = Pull(5, MEMBER, tuple(line), state="open", created=2)
    direct = commit(F, MEMBER, parents=(B0,), minute=300, files=[change("app/list.py")])
    compare = compare_path(9999, line[-1].sha, 1)
    pages = {
        pull_commits_path(5, page): respond(
            [each.item for each in line[(page - 1) * 100 : min(page * 100, 250)]],
            next_page=page < 3,
        )
        for page in (1, 2, 3)
    }
    scenario = Scenario(
        default_branch=(direct, root_commit()),
        pulls=(pull,),
        lookups={F: ()},
        overrides={
            **pages,
            pull_path(5): respond(pull_detail_json(pull.item(), 260)),
            compare: status_only(404),
        },
    )

    run = run_case(scenario)

    assert run.transport.paths.count(compare) == 1
    assert run.transport.paths[-1] == compare
    assert run.outcome.relations is not None
    assert run.outcome.relations.stopped_during == "PULL_REQUEST_COMMITS"
    # PR #5의 커밋도, PR 밖인지 확인하지 못한 ffff도 후보로 내지 않고 세지 않는다.
    assert run.result["candidates"] == []
    assert run.result["notProvided"] == []
    assert failure_codes(run.result) == [("COLLECTION", "REPOSITORY_UNREACHABLE")]
    assert run.result["outcome"] == "FAILED"


# 커밋 목록을 다 받지 못한 PR과 PR 밖 확정(2026-10-09 팀장 결정 「커밋이 250개 넘는 PR」)

LONG_PULL_COUNT = 300
COMPARE_MISMATCH = (
    "PR 커밋 250건 밖의 커밋으로 받은 커밋이 PR의 전체 커밋 수·판본이나 이미 받은 PR 커밋과 "
    "맞지 않아 그 커밋은 확인하지 못했다"
)
FORK_CAP = "다른 저장소(포크)에서 연 PR이라 PR 커밋 250건 밖의 커밋은 확인하지 않았다"


def long_pull_scenario(state: PullState, *, fork: bool = False) -> tuple[Scenario, str]:
    """커밋 300개인 회원 PR #5의 브랜치를 PR 없이 기본 브랜치에 병합 커밋으로 합쳤다.

    PR 커밋 목록은 앞의 250건만 준다. 포크가 아니면 PR API는 300건이라 하고 비교 결과는 299건이라
    수가 맞지 않아 250건만 쓴다. 포크면 비교하지 않고 250건만 쓴다. 250건 밖 본인 커밋 50건은 연결
    PR 조회가 빈 목록이다(병합되지 않고 닫힌 PR은 돌려주지 않는다). (시나리오, 병합 커밋)을 준다.
    """
    line: list[Commit] = []
    parent = B0
    for n in range(LONG_PULL_COUNT):
        line.append(commit(sha(7000 + n), MEMBER, parents=(parent,), minute=2 + n))
        parent = line[-1].sha
    joined = merge_commit(sha(7999), B0, line[-1].sha, minute=400)
    pull = Pull(5, MEMBER, tuple(line), state=state, created=2, fork=fork)
    overrides: dict[str, Reply] = {
        pull_commits_path(5, page): respond(
            [each.item for each in line[(page - 1) * 100 : min(page * 100, 250)]],
            next_page=page < 3,
        )
        for page in (1, 2, 3)
    }
    if not fork:
        overrides[pull_path(5)] = respond(
            pull_detail_json(pull.item(), LONG_PULL_COUNT)
        )
        overrides[compare_path(9999, line[-1].sha, 1)] = respond(
            compare_json(LONG_PULL_COUNT - 1, 9999, [each.item for each in line[:100]]),
            next_page=True,
        )
    lookups: dict[str, tuple[int, ...] | Reply] = {each.sha: () for each in line[250:]}
    lookups[joined.sha] = ()
    scenario = Scenario(
        default_branch=(joined, *reversed(line), root_commit()),
        pulls=(pull,),
        lookups=lookups,
        overrides=overrides,
    )
    return scenario, joined.sha


@pytest.mark.parametrize("fork", [False, True], ids=["count-mismatch", "fork"])
def test_commits_that_may_belong_to_a_closed_unread_pull_request_are_held(
    caplog: pytest.LogCaptureFixture, fork: bool
) -> None:
    """작업 동일성 사례 문서 「#118이 지킬 것」 5: 커밋 300개인 PR을 병합 없이 닫고 그 브랜치를 PR
    없이 기본 브랜치에 합쳤다. 받은 250건 밖의 본인 커밋은 그 PR의 일부일 수 있어 PR 밖(PR 없는
    병합)으로 확정하지 않는다. PR 후보 1개(한계 기록), 보류한 커밋은 UNDETERMINED, 실패 없음,
    SUCCEEDED다. 포크에서 연 PR의 250건 목록도 같다."""
    scenario, joined = long_pull_scenario("closed", fork=fork)
    caplog.set_level(logging.INFO, logger="app.candidates.build")

    run = run_case(scenario)

    assert run.outcome.completed
    assert identities(run.result) == [pull_identity(5)]
    unit = run.result["candidates"][0]["evidence"][0]
    assert unit["sourceUrl"] == pull_url(5)
    assert (FORK_CAP if fork else COMPARE_MISMATCH) in unit["coverageLimits"]
    assert merge_identity(joined) not in identities(run.result)
    assert not_provided(run.result) == {"UNDETERMINED": LONG_PULL_COUNT - 250}
    assert run.result["failures"] == []
    assert run.result["outcome"] == "SUCCEEDED"
    log = [r.getMessage() for r in caplog.records if "후보 판정 종료" in r.getMessage()]
    assert f"heldByIncompleteLists={LONG_PULL_COUNT - 250}" in log[-1]


@pytest.mark.parametrize("state", ["open", "merged"])
@pytest.mark.parametrize("fork", [False, True], ids=["count-mismatch", "fork"])
def test_unread_commits_of_a_default_branch_pull_request_are_not_held(
    state: PullState, fork: bool
) -> None:
    """한계 L13: 목록을 다 받지 못한 PR이 기본 브랜치 대상의 열린·병합 PR이면 보류하지 않는다.
    250건 밖 본인 커밋은 PR 없는 병합 단위가 되고, 그 근거에 목록 한계를 적는다."""
    scenario, joined = long_pull_scenario(state, fork=fork)

    run = run_case(scenario)

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(5), merge_identity(joined)]
    )
    merge_entry = candidate(run.result, merge_identity(joined))
    assert (
        "커밋 목록을 다 받지 못한 기본 브랜치 대상 PR이 있어, 그 PR에도 담긴 커밋일 수 있다"
        in merge_entry["evidence"][0]["coverageLimits"]
    )
    assert_succeeded_without_holds(run)


@pytest.mark.parametrize("head_is_base", [True, False], ids=["head-is-base", "unknown"])
def test_closed_pull_request_with_an_empty_list_holds_only_when_unmatched(
    head_is_base: bool,
) -> None:
    """다른 계정이 연 PR #6은 병합 없이 닫혔고 커밋 목록이 비었다. 관측한 머리 커밋이 기준 커밋과
    같으면 그 판본의 PR 커밋은 0건이라 끝까지 받은 목록이다. PR 밖 본인 커밋 ffff는 보류하지 않고
    커밋 묶음 후보다. 머리 커밋이 기준 쪽에 있는지 모르면 판본을 맞출 수 없어 지금처럼 보류한다."""
    direct = commit(F, MEMBER, parents=(B0,), minute=4, files=[change("app/list.py")])
    empty_pull = Pull(
        6, OTHER, (), state="closed", head=sha(9999) if head_is_base else None
    )
    scenario = Scenario(
        default_branch=(direct, root_commit()),
        pulls=(empty_pull,),
        lookups={F: ()},
    )

    run = run_case(scenario)

    if head_is_base:
        assert identities(run.result) == [bundle_identity(F)]
        assert_succeeded_without_holds(run)
    else:
        assert run.result["candidates"] == []
        assert not_provided(run.result) == {"UNDETERMINED": 1}
        assert run.result["failures"] == []
        assert run.result["outcome"] == "EMPTY"


def test_pull_request_range_limit_is_kept_on_outside_units() -> None:
    """PR 목록을 최근 1건까지만 받았다. PR 밖 판정은 받은 PR 범위 안의 확인이라
    그 범위 한계를 PR 밖 커밋 묶음의 근거에도 옮긴다. PR 밖 확정은 그대로다."""
    scenario = open_pull_with_direct_commit(lookup=())
    first_page = f"{BASE}/pulls?state=all&sort=created&direction=desc&per_page=1&page=1"
    scenario = replace(
        scenario,
        overrides={first_page: respond([scenario.pull(3).item()], next_page=True)},
    )
    limit = "최근 PR 1건까지만 조회했다"

    run = run_case(scenario, limits=replace(PROPOSED_LIMITS, max_pull_requests=1))

    assert limit in run.outcome.shared_limits("PULL_REQUEST")
    assert sorted(identities(run.result)) == sorted(
        [pull_identity(3), bundle_identity(F)]
    )
    bundle = candidate(run.result, bundle_identity(F))
    assert limit in bundle["evidence"][0]["coverageLimits"]
    assert_succeeded_without_holds(run)


def test_lookup_contradicting_a_lookup_only_pull_request_merge_commit_is_undetermined() -> (
    None
):
    """목록 밖 병합 PR #40의 merge_commit_sha인 커밋 c에 연결 PR 조회가 열린 PR
    #3을 돌려줬는데, #3의 전체 커밋 목록에는 c가 없다. 근거끼리 어긋나 단위 미확정이다."""
    own = commit(sha(31), MEMBER, parents=(B0,), minute=2, files=[change("a.py")])
    squashed = commit(sha(871), MEMBER, parents=(B0,), minute=4, files=[change("b.py")])
    later = commit(
        sha(872), MEMBER, parents=(squashed.sha,), minute=5, files=[change("c.py")]
    )
    scenario = Scenario(
        default_branch=(later, squashed, root_commit()),
        pulls=(Pull(3, MEMBER, (own,), state="open", created=2),),
        lookups={squashed.sha: (3,), later.sha: (40,)},
        lookup_pulls=(
            Pull(40, MEMBER, created=3, merged=6, merge_commit=squashed.sha),
        ),
    )

    run = run_case(scenario)

    assert sorted(identities(run.result)) == sorted(
        [pull_identity(3), pull_identity(40)]
    )
    for entry in run.result["candidates"]:
        assert commit_url(squashed.sha) not in evidence_urls(entry)
    assert not_provided(run.result) == {"UNDETERMINED": 1}
    assert run.result["failures"] == []
    assert run.result["outcome"] == "SUCCEEDED"


# 확인 중단(C27·C28·C29)


def test_c27_budget_stop_during_lookup_holds_change_and_the_unchecked_pull_request() -> (
    None
):
    """C27을 실제 수집 순서로 돌린다. ffff는 보류하고 세지 않으며 실패를 기록한다.

    수집은 연결 PR 조회 뒤에 변경 내용을 받는다. 그래서 연결 PR 조회에서 멈추면
    PR #3 커밋의 변경 내용도 받지 못해, 빈 커밋인지 모르는 PR #3도 후보로 내지 않는다(세지 않음).
    결과는 Catch 0개·FAILED이고 회원은 다시 요청할 수 있다(사례 문서 C27, 2026-10-09 팀장 결정).
    변경 내용을 받은 뒤 멈춰 PARTIAL_FAILED가 되는 모양은 아래 C29 시험의 after_details와
    test_candidate_grouping의 test_stopped_lookup_holds_change_without_counting이 본다.
    """
    # 저장소 확인·목록 셋·PR #3 커밋 목록까지 5회. ffff의 연결 PR 조회가 6번째 호출이다.
    run = run_case(
        open_pull_with_direct_commit(lookup=()), limits=CollectionLimits(max_calls=5)
    )

    assert commit_pulls_path(F) not in run.transport.paths
    assert run.outcome.relations is not None
    assert run.outcome.relations.stopped_during == "LOOKUPS"
    assert run.result["candidates"] == []
    # 판단한 것이 아니므로 notProvided에 세지 않고, 수집 실패를 기록한다.
    assert run.result["notProvided"] == []
    assert failure_codes(run.result) == [("COLLECTION", "BUDGET_EXCEEDED")]
    assert run.result["outcome"] == "FAILED"


def test_details_left_out_by_the_call_room_are_insufficient_evidence() -> None:
    """ffff의 연결 PR 조회는 빈 목록으로 마쳤고, 남은 호출이 모자라 그 변경 내용은
    조회 범위 밖(BEYOND_RANGE)으로 남았다. 선택 조회는 상한에 걸리기 전에 건너뛰므로 수집 실패가
    아니다. 빈 커밋인지 모르는 ffff는 후보가 아니고 근거 부족 1로 센다. PR #3은 후보다."""
    full = run_case(open_pull_with_direct_commit(lookup=()))
    limits = CollectionLimits(max_calls=full.transport.paths.index(detail_path(F)))

    run = run_case(open_pull_with_direct_commit(lookup=()), limits=limits)

    assert run.outcome.completed
    assert detail_path(F) not in run.transport.paths
    assert identities(run.result) == [pull_identity(3)]
    assert commit_url(F) not in evidence_urls(run.result["candidates"][0])
    assert not_provided(run.result) == {"INSUFFICIENT_EVIDENCE": 1}
    assert run.result["failures"] == []
    assert run.result["outcome"] == "SUCCEEDED"


def test_c28_time_stop_without_other_candidate_fails() -> None:
    # 다음 필수 조회(연결 PR 조회) 전에 시간 상한에 닿은 경우만 본다. 호출마다 10초. 목록 넷(40초)을
    # 받은 뒤 ffff의 연결 PR 조회 전에 수집 시간 상한에 닿는다.
    run = run_case(
        open_pull_with_direct_commit(lookup=(), with_pull=False),
        limits=CollectionLimits(max_collection_time=timedelta(seconds=40)),
        clock=FakeClock(),
        seconds_per_call=10.0,
    )

    assert run.transport.paths == [
        BASE,
        LISTED_COMMITS,
        LISTED_PULLS,
        LISTED_ISSUES,
    ]
    assert run.result["candidates"] == []
    assert run.result["notProvided"] == []
    assert failure_codes(run.result) == [("COLLECTION", "TIME_LIMIT_EXCEEDED")]
    assert run.result["outcome"] == "FAILED"


def test_time_stop_after_finished_lookups_keeps_the_undetermined_change() -> None:
    """조회를 마쳐 정한 단위 미확정은 뒤의 시간 실패와 함께 남는다."""
    # 호출마다 10초. 저장소 확인·목록 셋·PR #3 커밋 목록·ffff 연결 PR 조회(60초)를 마친 때가 마감이다.
    # ffff는 C16처럼 근거끼리 어긋나 단위 미확정이다. 변경 내용을 받으려는 때 마감이 이미 지나
    # 범위 한계로 건너뛰지 않고 시간 상한 실패로 멈춘다.
    run = run_case(
        open_pull_with_direct_commit(pull_author=OTHER),
        limits=CollectionLimits(max_collection_time=timedelta(seconds=60)),
        clock=FakeClock(),
        seconds_per_call=10.0,
    )

    assert run.transport.paths[-1] == commit_pulls_path(F)
    assert len(run.transport.paths) == 6
    assert run.outcome.relations is not None
    assert run.outcome.relations.stopped_during == "DETAILS"
    assert run.result["candidates"] == []
    assert not_provided(run.result) == {"UNDETERMINED": 1}
    assert failure_codes(run.result) == [("COLLECTION", "TIME_LIMIT_EXCEEDED")]
    assert run.result["outcome"] == "FAILED"


def test_c29_rate_limited_lookup_is_not_retried_and_holds_change() -> None:
    """C29: 연결 PR 조회 429는 다시 부르지 않고 보류한다(세지 않음, 실패 기록).

    이 조회에서 멈추면 PR #3 커밋의 변경 내용도 받지 못해 PR #3도 후보가 아니고
    결과는 FAILED다(C27과 같은 이유, 사례 문서 C29). 다른 적합 후보가 있는 PARTIAL_FAILED는 변경
    내용을 받은 뒤 멈춘 경우다(after_details).
    """
    run = run_case(open_pull_with_direct_commit(lookup=status_only(429)))

    assert run.transport.paths.count(commit_pulls_path(F)) == 1
    assert run.result["candidates"] == []
    assert run.result["notProvided"] == []
    assert failure_codes(run.result) == [("COLLECTION", "RATE_LIMITED")]
    assert run.result["outcome"] == "FAILED"

    after_details = run_case(
        replace(
            open_pull_with_direct_commit(lookup=()),
            overrides={detail_path(F): status_only(429)},
        )
    )
    assert identities(after_details.result) == [pull_identity(3)]
    assert after_details.result["notProvided"] == []
    assert failure_codes(after_details.result) == [("COLLECTION", "RATE_LIMITED")]
    assert after_details.result["outcome"] == "PARTIAL_FAILED"


def test_stop_while_listing_commits_holds_the_commit_at_the_cut_edge() -> None:
    # PR 조회가 허용되지 않은 요청에서 기본 브랜치 목록 둘째 쪽이 429로 멈췄다. 첫 쪽 맨 아래의
    # 본인 커밋은 부모(둘째 쪽에 있는, 같은 파일을 고친 본인 커밋)를 보지 못해 묶음 경계를 정하지
    # 못했다. 보류하고 세지 않는다. 창 안에서 이웃이 정해진 본인 커밋만 묶음이 된다. 다만 목록
    # 단계에서 멈춰 변경 내용을 받지 못했으므로 그 묶음도 빈 커밋인지 몰라 후보로 내지 않는다.
    own = {1, 2, 50, 101}
    line: list[Commit] = []
    parent = B0
    for n in range(102):
        line.append(
            commit(
                sha(5000 + n),
                MEMBER if n in own else OTHER,
                parents=(parent,),
                minute=2 + n,
                files=[change("app/a.py")],
            )
        )
        parent = sha(5000 + n)
    first_page = tuple(reversed(line))[:100]
    second_page = f"{BASE}/commits?per_page=100&page=2"
    scenario = Scenario(
        default_branch=first_page,
        overrides={
            LISTED_COMMITS: respond([each.item for each in first_page], next_page=True),
            second_page: status_only(429),
        },
    )

    run = run_case(scenario, request=live_request("COMMIT"))

    assert run.transport.paths[-1] == second_page
    assert run.outcome.relations is not None
    assert run.outcome.relations.stopped_during == "LISTS"
    edge = sha(5002)
    assert edge in {each.sha for each in first_page}
    grouping = group_outcome(run.outcome)
    assert [unit.unit for unit in grouping.units] == [
        CommitsUnit((sha(5050),)),
        CommitsUnit((sha(5101),)),
    ]
    assert grouping.observations[edge].membership is Membership.STOPPED
    assert run.result["candidates"] == []
    assert run.result["notProvided"] == []
    assert failure_codes(run.result) == [("COLLECTION", "RATE_LIMITED")]
    assert run.result["outcome"] == "FAILED"


# 본인 기여: 커밋 작성자(연동 계정)만 기여를 세운다


def test_own_commit_in_another_accounts_pull_request_is_a_candidate() -> None:
    theirs = commit(
        sha(401), OTHER, parents=(B0,), minute=2, files=[change("app/search.py")]
    )
    mine = commit(
        sha(402),
        MEMBER,
        parents=(theirs.sha,),
        minute=3,
        files=[change("app/search.py")],
    )
    merged = merge_commit(sha(403), B0, mine.sha, minute=4)
    scenario = Scenario(
        default_branch=(merged, mine, theirs, root_commit()),
        # 다른 계정이 자기 포크 브랜치에서 연 PR에 회원의 커밋이 담겼다.
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

    run = run_case(scenario)

    assert identities(run.result) == [pull_identity(11)]
    entry = run.result["candidates"][0]
    assert pull_url(11) in evidence_urls(entry)
    # 다른 계정의 커밋은 이 회원의 기여 근거가 아니다.
    assert commit_urls(entry) == {commit_url(mine.sha)}
    assert_succeeded_without_holds(run)


@pytest.mark.parametrize("opener", [MEMBER, OTHER], ids=["member-pr", "other-pr"])
def test_pull_request_without_own_commit_is_not_counted(opener: GitHubAccount) -> None:
    """PR을 연 것은 기여가 아니다. 연동 계정이 연 PR에 다른 계정 커밋만 있으면 다른 계정이 연 PR과
    같게 후보도 건수도 없다(2026-10-09 팀장 결정)."""
    first = commit(sha(411), OTHER, parents=(B0,), minute=2)
    second = commit(sha(412), OTHER, parents=(first.sha,), minute=3)
    # 회원이 직접 병합 버튼을 눌러도 병합 커밋은 변경이 아니다.
    merged = merge_commit(sha(413), B0, second.sha, author=MEMBER, minute=4)
    scenario = Scenario(
        default_branch=(merged, second, first, root_commit()),
        pulls=(
            Pull(
                12,
                opener,
                (first, second),
                created=2,
                merged=4,
                merge_commit=merged.sha,
            ),
        ),
    )

    run = run_case(scenario)

    assert run.result["candidates"] == []
    assert not_provided(run.result) == {}
    assert run.result["failures"] == []
    assert run.result["outcome"] == "EMPTY"


@pytest.mark.parametrize("merged", [False, True], ids=["open", "merged"])
def test_member_pull_request_without_own_commit_with_an_unrelated_lookup_stop(
    merged: bool,
) -> None:
    """다른 계정 커밋만 담은 본인 PR #12는 세지 않는다(2026-10-09 팀장 결정). PR 밖 본인 커밋
    ffff의 연결 PR 조회가 429로 멈췄어도, #12가 열렸든 병합됐든 건수는 없고 실패만 남는다.
    """
    first = commit(sha(411), OTHER, parents=(B0,), minute=2)
    second = commit(sha(412), OTHER, parents=(first.sha,), minute=3)
    if merged:
        joined = merge_commit(sha(413), B0, second.sha, author=MEMBER, minute=4)
        direct = commit(
            F, MEMBER, parents=(joined.sha,), minute=5, files=[change("app/list.py")]
        )
        branch: tuple[Commit, ...] = (direct, joined, second, first, root_commit())
        pull = Pull(
            12, MEMBER, (first, second), created=2, merged=4, merge_commit=joined.sha
        )
    else:
        direct = commit(
            F, MEMBER, parents=(B0,), minute=5, files=[change("app/list.py")]
        )
        branch = (direct, root_commit())
        pull = Pull(12, MEMBER, (first, second), state="open", created=2)
    scenario = Scenario(
        default_branch=branch, pulls=(pull,), lookups={F: status_only(429)}
    )

    run = run_case(scenario)

    assert run.result["candidates"] == []
    assert not_provided(run.result) == {}
    assert failure_codes(run.result) == [("COLLECTION", "RATE_LIMITED")]
    assert run.result["outcome"] == "FAILED"


def test_commit_without_linked_author_is_never_own() -> None:
    # GitHub가 작성자를 계정과 잇지 못한 커밋. 커밋한 사람이 연동 계정이어도 본인 기여가 아니다.
    unknown = commit(sha(421), None, parents=(B0,), minute=2, committer=MEMBER)
    merged = merge_commit(sha(422), B0, unknown.sha, author=MEMBER, minute=3)
    direct = commit(sha(423), None, parents=(merged.sha,), minute=4, committer=MEMBER)
    scenario = Scenario(
        default_branch=(direct, merged, unknown, root_commit()),
        pulls=(
            Pull(13, MEMBER, (unknown,), created=2, merged=3, merge_commit=merged.sha),
        ),
    )

    run = run_case(scenario)

    assert run.result["candidates"] == []
    # 회원이 연 PR #13도, 작성자 없는 직접 커밋도 어디에도 세지 않는다.
    assert not_provided(run.result) == {}
    assert commit_pulls_path(direct.sha) not in run.transport.paths
    assert run.result["outcome"] == "EMPTY"


def test_small_single_commit_change_is_still_a_candidate() -> None:
    # 작은 변경·단일 커밋·동기 부재만으로 제외하지 않는다(BR3.2).
    typo = commit(
        sha(431),
        MEMBER,
        parents=(B0,),
        message="오타",
        minute=2,
        files=[change("README.md", additions=1, deletions=1)],
    )
    merged = merge_commit(sha(432), B0, typo.sha, minute=3)
    scenario = Scenario(
        default_branch=(merged, typo, root_commit()),
        pulls=(
            Pull(14, MEMBER, (typo,), created=2, merged=3, merge_commit=merged.sha),
        ),
    )

    run = run_case(scenario)

    assert identities(run.result) == [pull_identity(14)]
    assert_succeeded_without_holds(run)


# 허용 자료 종류


def test_without_pull_request_permission_units_are_merges_and_bundles() -> None:
    feature = commit(
        sha(501), MEMBER, parents=(B0,), minute=2, files=[change("app/profile.py")]
    )
    merged = merge_commit(sha(502), B0, feature.sha, minute=3)
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
        # GitHub에는 PR #10이 있지만 요청이 PR 조회를 허용하지 않았다.
        pulls=(
            Pull(10, MEMBER, (feature,), created=2, merged=3, merge_commit=merged.sha),
        ),
        issues=(21,),
        issue_pull_items=(10,),
    )

    run = run_case(scenario, request=live_request("COMMIT", "ISSUE"))

    # PR API(목록·커밋 목록·연결 PR)와 비교 API를 부르지 않는다.
    assert not any("/pulls" in path for path in run.transport.paths)
    assert not any("/compare/" in path for path in run.transport.paths)
    assert sorted(identities(run.result)) == sorted(
        [merge_identity(merged.sha), bundle_identity(second.sha, third.sha)]
    )
    # 이슈 API가 준 PR 항목은 PR 단위도 이슈 단위도 되지 않는다.
    assert pull_identity(10) not in identities(run.result)
    assert identity(IssueUnit(10)) not in identities(run.result)
    for entry in run.result["candidates"]:
        # PR 소속을 확인하지 않았다는 한계(L2)를 적는다. 단위 미확정은 아니다.
        assert entry["groupingLimitations"]
    assert_succeeded_without_holds(run)


def test_without_commit_permission_pull_request_lists_still_give_candidates() -> None:
    run = run_case(c6_scenario(), request=live_request("PULL_REQUEST"))

    # 커밋 API(기본 브랜치 목록·상세·연결 PR)는 부르지 않고 PR 커밋 목록만 본다.
    assert LISTED_COMMITS not in run.transport.paths
    assert not any("/commits/" in path for path in run.transport.paths)
    assert sorted(identities(run.result)) == sorted(
        [pull_identity(7), pull_identity(9)]
    )
    assert_succeeded_without_holds(run)


# 방법 B: PR·병합에 속하지 않은 본인 커밋 묶음


def direct_history(
    chain: list[tuple[int, GitHubAccount, list[str]]],
) -> tuple[Scenario, dict[int, str]]:
    """기본 브랜치에 바로 올린 직선 이력. 본인 커밋은 연결 PR 조회가 빈 목록이다."""
    parent = B0
    made: list[Commit] = []
    for offset, (number, author, paths) in enumerate(chain):
        made.append(
            commit(
                sha(number),
                author,
                parents=(parent,),
                minute=2 + offset,
                files=[change(path) for path in paths],
            )
        )
        parent = sha(number)
    lookups: dict[str, tuple[int, ...] | Reply] = {
        sha(number): () for number, author, _ in chain if author == MEMBER
    }
    scenario = Scenario(
        default_branch=(*reversed(made), root_commit()), lookups=lookups
    )
    return scenario, {number: sha(number) for number, _, _ in chain}


@pytest.mark.parametrize(
    ("chain", "bundles"),
    [
        (
            [(601, MEMBER, ["app/a.py"]), (602, MEMBER, ["app/a.py", "app/b.py"])],
            [(601, 602)],
        ),
        (
            [(611, MEMBER, ["app/a.py"]), (612, MEMBER, ["app/b.py"])],
            [(611,), (612,)],
        ),
        (
            [
                (621, MEMBER, ["app/a.py"]),
                (622, OTHER, ["app/a.py"]),
                (623, MEMBER, ["app/a.py"]),
            ],
            [(621,), (623,)],
        ),
    ],
    ids=["consecutive-overlap", "consecutive-disjoint", "interleaved-other"],
)
def test_direct_commits_are_bundled_by_adjacent_overlapping_changes(
    chain: list[tuple[int, GitHubAccount, list[str]]],
    bundles: list[tuple[int, ...]],
) -> None:
    scenario, shas = direct_history(chain)

    run = run_case(scenario)

    expected = [bundle_identity(*(shas[n] for n in group)) for group in bundles]
    assert sorted(identities(run.result)) == sorted(expected)
    for group, value in zip(bundles, expected, strict=True):
        # 커밋 묶음의 식별(커밋 SHA)은 그 후보의 근거에서 찾을 수 있다.
        assert commit_urls(candidate(run.result, value)) == {
            commit_url(shas[n]) for n in group
        }
    assert_succeeded_without_holds(run)


SHUFFLE_CHAIN: list[tuple[int, GitHubAccount, list[str]]] = [
    (631, MEMBER, ["app/a.py"]),
    (632, MEMBER, ["app/a.py"]),
    (633, OTHER, ["app/c.py"]),
    (634, MEMBER, ["app/d.py"]),
    (635, MEMBER, ["app/d.py", "app/e.py"]),
    (636, MEMBER, ["app/f.py"]),
]


@pytest.mark.parametrize(
    "order", [[6, 5, 4, 3, 2, 1, 0], [0, 1, 2, 3, 4, 5, 6], [3, 0, 6, 1, 5, 2, 4]]
)
def test_bundles_do_not_depend_on_list_order(order: list[int]) -> None:
    scenario, shas = direct_history(SHUFFLE_CHAIN)
    shuffled = replace(
        scenario, default_branch=tuple(scenario.default_branch[i] for i in order)
    )

    original_run, shuffled_run = run_case(scenario), run_case(shuffled)

    expected = {
        bundle_identity(shas[631], shas[632]),
        bundle_identity(shas[634], shas[635]),
        bundle_identity(shas[636]),
    }
    assert set(identities(original_run.result)) == expected

    def grouping(run: CaseRun) -> list[tuple[str, list[str]]]:
        return [
            (entry["workIdentity"], evidence_urls(entry))
            for entry in run.result["candidates"]
        ]

    assert grouping(shuffled_run) == grouping(original_run)


# PR 없는 병합과 기준 브랜치를 받아온 병합


def test_commits_brought_by_merge_without_pull_request_form_a_merge_unit() -> None:
    first = commit(
        sha(701), MEMBER, parents=(B0,), minute=2, files=[change("app/a.py")]
    )
    second = commit(
        sha(702), MEMBER, parents=(first.sha,), minute=3, files=[change("app/b.py")]
    )
    main = commit(sha(703), OTHER, parents=(B0,), minute=4)
    merged = merge_commit(sha(704), main.sha, second.sha, author=MEMBER, minute=5)
    scenario = Scenario(
        default_branch=(merged, main, second, first, root_commit()),
        lookups={second.sha: (), first.sha: (), merged.sha: ()},
    )

    run = run_case(scenario)

    assert identities(run.result) == [merge_identity(merged.sha)]
    urls = evidence_urls(run.result["candidates"][0])
    assert {
        commit_url(merged.sha),
        commit_url(first.sha),
        commit_url(second.sha),
    } <= set(urls)
    assert_succeeded_without_holds(run)


def test_merge_that_took_in_the_base_branch_is_not_a_unit() -> None:
    first = commit(sha(711), MEMBER, parents=(B0,), minute=2)
    main = commit(sha(712), OTHER, parents=(B0,), minute=3)
    # 작업 브랜치가 기본 브랜치를 받아왔다(흡수 병합). 작업 단위로 쓰지 않는다.
    absorbed = merge_commit(sha(713), first.sha, main.sha, author=MEMBER, minute=4)
    third = commit(sha(714), MEMBER, parents=(absorbed.sha,), minute=5)
    merged = merge_commit(sha(715), main.sha, third.sha, author=MEMBER, minute=6)
    scenario = Scenario(
        default_branch=(merged, third, absorbed, main, first, root_commit()),
        # 흡수 병합에는 연결 PR 조회 응답이 없다. 부르면 시험이 실패한다.
        lookups={third.sha: (), first.sha: (), merged.sha: ()},
    )

    run = run_case(scenario)

    assert identities(run.result) == [merge_identity(merged.sha)]
    assert merge_identity(absorbed.sha) not in identities(run.result)
    assert bundle_identity(first.sha) not in identities(run.result)
    assert_succeeded_without_holds(run)


# 추가 기준 브랜치 release를 받아온 흡수 병합. release 사슬은 H80→H81→C2→B0이다.
RELEASE_C2, WORK_C3, ABSORB_A4, MERGE_M6 = sha(1102), sha(1103), sha(1104), sha(1106)
RELEASE = RelationOptions(("release",))
BASE_BRANCH_CUT = (
    "따로 지정한 기준 브랜치 가운데 커밋을 끝까지 받지 못한 브랜치가 있어, 그 브랜치를 "
    "받아온 병합을 작업과 구별하지 못했을 수 있다"
)


def release_scenario(cut: str | None = None) -> Scenario:
    """C2는 release에 바로 올린 본인 커밋, C3는 작업 브랜치의 본인 커밋이다.

    작업 브랜치가 A4로 release를 받아왔고(흡수 병합), M6가 PR 없이 작업 브랜치를 기본 브랜치에
    병합했다. cut이 count면 release의 최근 1건(H80)만 받고 다음 쪽이 있다. size면 release 응답이 크기
    상한을 넘었다.
    """
    c2 = commit(
        RELEASE_C2, MEMBER, parents=(B0,), minute=2, files=[change("app/release.py")]
    )
    c3 = commit(
        WORK_C3, MEMBER, parents=(B0,), minute=3, files=[change("app/feature.py")]
    )
    a4 = merge_commit(ABSORB_A4, c3.sha, c2.sha, author=MEMBER, minute=4)
    m6 = merge_commit(MERGE_M6, B0, a4.sha, author=MEMBER, minute=6)
    h81 = commit(sha(1181), OTHER, parents=(c2.sha,), minute=8)
    h80 = commit(sha(1180), OTHER, parents=(h81.sha,), minute=9)
    lookups: dict[str, tuple[int, ...] | Reply] = {c3.sha: (), c2.sha: (), m6.sha: ()}
    if cut is None:
        path = branch_commits_path("release")
        reply: Reply = respond([each.item for each in (h80, h81, c2, root_commit())])
    else:
        path = branch_commits_path("release", per_page=1)
        reply = respond([h80.item], next_page=True) if cut == "count" else oversized()
        # 흡수 병합인지 모르는 A4도 PR 밖 본인 커밋(C2)을 들인 PR 없는 병합 후보라 연결 PR을 조회한다.
        lookups[a4.sha] = ()
    return Scenario(
        default_branch=(m6, a4, c3, c2, root_commit()),
        lookups=lookups,
        overrides={path: reply},
    )


@pytest.mark.parametrize("cut", ["count", "size"])
def test_merge_that_may_have_taken_in_a_cut_base_branch_is_held(cut: str) -> None:
    """release를 끝까지 받지 못해 A4가 release를 받아온 흡수 병합인지 모른다.

    A4를 확정하지 않고, A4를 거쳐 들어온 C2를 자료 범위 한계로 보류한다(단위 미확정으로 센다). 잘린
    기준 브랜치의 한계는 공유 근거 한계로 남는다. A4와 무관한 M6의 작업 커밋 C3는 그대로 후보다.
    """
    limits = replace(PROPOSED_LIMITS, max_base_branch_commits=1)

    run = run_case(release_scenario(cut), limits=limits, options=RELEASE)

    assert run.outcome.completed
    assert identities(run.result) == [merge_identity(MERGE_M6)]
    entry = run.result["candidates"][0]
    assert commit_urls(entry) == {commit_url(MERGE_M6), commit_url(WORK_C3)}
    assert not_provided(run.result) == {"UNDETERMINED": 1}
    assert run.result["failures"] == []
    assert run.outcome.shared_limits("COMMIT") == (BASE_BRANCH_CUT,)
    assert all(
        BASE_BRANCH_CUT in evidence["coverageLimits"] for evidence in entry["evidence"]
    )


def test_commits_an_absorption_merge_took_in_stay_in_their_own_unit() -> None:
    """release를 끝까지 읽어 A4가 흡수 병합으로 확인됐다.

    A4가 release에서 들인 C2는 M6가 아니라 원래 단위(기본 브랜치에 PR 없이 들어온 커밋 묶음)에 남고,
    M6에는 작업 커밋 C3만 든다.
    """
    run = run_case(release_scenario(), options=RELEASE)

    assert sorted(identities(run.result)) == sorted(
        [merge_identity(MERGE_M6), bundle_identity(RELEASE_C2)]
    )
    assert merge_identity(ABSORB_A4) not in identities(run.result)
    assert commit_urls(candidate(run.result, merge_identity(MERGE_M6))) == {
        commit_url(MERGE_M6),
        commit_url(WORK_C3),
    }
    assert commit_urls(candidate(run.result, bundle_identity(RELEASE_C2))) == {
        commit_url(RELEASE_C2)
    }
    assert run.outcome.shared_limits("COMMIT") == ()
    assert_succeeded_without_holds(run)


@requires_git
def test_merge_whose_first_parent_is_outside_the_window_uses_the_compared_range(
    repo: GitRepo,
) -> None:
    """커밋 시각이 거꾸로라 첫 부모 B2가 최근 커밋 4건 밖에 남았다.

    창만으로는 B2가 이미 담은 옛 기준 브랜치 커밋 C1을 M4가 들인 것으로 센다. 첫 부모...병합 비교로
    실제로 들인 커밋(C3)만 M4에 두고, C1은 기본 브랜치에 바로 올린 커밋 묶음으로 남는다.
    """
    repo.write("app/base.py", python_module("base = 0"))
    root = repo.commit("기준", minute=20)
    repo.write("app/core.py", python_module("core = 1"))
    c1 = repo.commit("핵심 기능", minute=30)
    repo.branch("feature")
    repo.write("app/main.py", python_module("main = 2"))
    b2 = repo.commit("기본 브랜치 보완", minute=10)
    repo.checkout("feature")
    repo.write("app/feature.py", python_module("feature = 3"))
    c3 = repo.commit("기능 추가", minute=40)
    repo.checkout("main")
    m4 = repo.merge("feature", "기능 병합", minute=50)
    # 사례 모양: 첫 부모 B2는 C1의 자식이지만 커밋 시각이 가장 이르다. 기본 브랜치 목록에서 맨
    # 뒤라 최근 4건에 들지 않는다. B2...M4 비교 범위는 C3와 M4뿐이다.
    assert repo.parents(m4) == (b2, c3)
    assert repo.parents(b2) == (c1,)
    assert repo.log(m4) == [m4, c3, c1, root, b2]
    assert repo.rev_list(b2, m4) == [c3, m4]
    window = (
        git_commit(repo, m4, MEMBER),
        git_commit(repo, c3, MEMBER),
        git_commit(repo, c1, MEMBER),
        git_commit(repo, root, OTHER),
    )
    boundary = [repo.commit_json(each, MEMBER) for each in repo.rev_list(b2, m4)]
    scenario = Scenario(
        default_branch=window,
        lookups={c3: (), c1: (), m4: ()},
        overrides={
            f"{BASE}/commits?per_page=4&page=1": respond(
                [each.item for each in window], next_page=True
            ),
            compare_path(b2, m4, 1): respond(compare_json(2, b2, boundary)),
        },
    )

    run = run_case(scenario, limits=replace(PROPOSED_LIMITS, max_commits=4))

    assert compare_path(b2, m4, 1) in run.transport.paths
    assert sorted(identities(run.result)) == sorted(
        [merge_identity(m4), bundle_identity(c1)]
    )
    assert commit_urls(candidate(run.result, merge_identity(m4))) == {
        commit_url(m4),
        commit_url(c3),
    }
    assert_succeeded_without_holds(run)


def test_rebase_merged_commit_found_by_lookup_belongs_to_the_pull_request() -> None:
    # rebase로 합친 PR: 대상 브랜치에는 새 SHA가 생기고 merge_commit_sha는 마지막 것만 가리킨다.
    originals = (
        commit(
            sha(801), MEMBER, parents=(B0,), minute=2, files=[change("app/cart.py")]
        ),
        commit(
            sha(802),
            MEMBER,
            parents=(sha(801),),
            minute=3,
            files=[change("app/cart.py")],
        ),
    )
    first = commit(
        sha(811), MEMBER, parents=(B0,), minute=2, files=[change("app/cart.py")]
    )
    last = commit(
        sha(812), MEMBER, parents=(first.sha,), minute=3, files=[change("app/cart.py")]
    )
    scenario = Scenario(
        default_branch=(last, first, root_commit()),
        pulls=(Pull(4, MEMBER, originals, created=2, merged=6, merge_commit=last.sha),),
        lookups={first.sha: (4,)},
    )

    run = run_case(scenario)

    # 연결 PR API가 병합된 PR을 가리키는 커밋이 PR 커밋 목록에 없는 것은 정상이다.
    assert identities(run.result) == [pull_identity(4)]
    assert bundle_identity(first.sha) not in identities(run.result)
    assert_succeeded_without_holds(run)


def test_pull_request_known_only_from_lookup_is_the_unit() -> None:
    """최근 PR 목록 밖의 병합된 PR #40이 이 커밋을 들였다. 연결 PR API가 가리키는 병합 PR에 배정한다.

    2026-10-08 팀장 결정 「본인 기여의 뜻」: 이 커밋은 #40의 merge_commit_sha이고 부모가 하나라
    squash 커밋일 수 있다. 원래 커밋 목록을 받지 않았으므로 그 작성자를 명의로 보지 않는다. PR
    밖 커밋 묶음도 아니고 후보도 아니며, PR 하나에 근거 부족 1을 센다(실패 없음).
    """
    landed = commit(
        sha(851), MEMBER, parents=(B0,), minute=2, files=[change("app/legacy.py")]
    )
    scenario = Scenario(
        default_branch=(landed, root_commit()),
        lookups={landed.sha: (40,)},
        lookup_pulls=(Pull(40, MEMBER, created=1, merged=2, merge_commit=landed.sha),),
    )

    run = run_case(scenario)

    assert run.result["candidates"] == []
    assert not_provided(run.result) == {"INSUFFICIENT_EVIDENCE": 1}
    assert run.result["failures"] == []
    assert run.result["outcome"] == "EMPTY"


def test_rebase_commits_of_a_lookup_only_pull_request_are_contribution() -> None:
    """rebase로 합친 목록 밖 PR #40: 기본 브랜치의 새 커밋 둘을 연결 PR 조회가 #40에 배정한다.

    merge_commit_sha가 가리키는 마지막 커밋은 squash 커밋과 구분할 수 없어 기여 근거에서 빼지만,
    앞 커밋은 그대로 본인 기여다(2026-10-08 팀장 결정 「본인 기여의 뜻」).
    """
    first = commit(
        sha(861), MEMBER, parents=(B0,), minute=2, files=[change("app/legacy.py")]
    )
    last = commit(
        sha(862),
        MEMBER,
        parents=(first.sha,),
        minute=3,
        files=[change("app/legacy.py")],
    )
    scenario = Scenario(
        default_branch=(last, first, root_commit()),
        lookups={first.sha: (40,), last.sha: (40,)},
        lookup_pulls=(Pull(40, MEMBER, created=1, merged=4, merge_commit=last.sha),),
    )

    run = run_case(scenario)

    assert identities(run.result) == [pull_identity(40)]
    entry = run.result["candidates"][0]
    assert pull_url(40) in evidence_urls(entry)
    assert commit_urls(entry) == {commit_url(first.sha)}
    assert_succeeded_without_holds(run)


# 불변성(C1~C3·C10)과 민감도(C11~C13)


def single_pull_scenario(
    *,
    title: str = "알림 목록 페이지 나누기",
    body: str = "목록을 쪽으로 나눈다",
    later_commit: bool = False,
    second_author: GitHubAccount = MEMBER,
) -> Scenario:
    """나누지 않은 PR #3. later_commit이면 PR에 커밋이 나중에 하나 더 붙었다."""
    first = commit(
        sha(901), MEMBER, parents=(B0,), minute=2, files=[change("app/notice.py")]
    )
    commits = [first]
    if later_commit:
        commits.append(
            commit(
                sha(902),
                second_author,
                parents=(first.sha,),
                minute=3,
                files=[change("app/notice.py")],
            )
        )
    merged = merge_commit(sha(903), B0, commits[-1].sha, minute=4)
    return Scenario(
        default_branch=(merged, *reversed(commits), root_commit()),
        pulls=(
            Pull(
                3,
                MEMBER,
                tuple(commits),
                created=2,
                merged=4,
                merge_commit=merged.sha,
                title=title,
                body=body,
            ),
        ),
    )


def _pull_revision(run: CaseRun, number: int) -> str:
    entry = candidate(run.result, pull_identity(number, request=run.request))
    revisions = [
        each["sourceRevision"]
        for each in entry["evidence"]
        if each["sourceUrl"] == pull_url(number)
    ]
    assert len(revisions) == 1
    value = revisions[0]
    assert isinstance(value, str)
    return value


def test_c1_to_c3_title_body_and_added_commit_keep_the_identity() -> None:
    before = run_case(single_pull_scenario())
    after = run_case(
        single_pull_scenario(
            title="알림 페이지네이션 추가",
            body="페이지네이션을 더했다",
            later_commit=True,
        )
    )

    assert identities(before.result) == identities(after.result) == [pull_identity(3)]
    # 근거의 판본 값은 나중에 붙은 커밋을 가리키도록 바뀌었지만 값의 입력이 아니다.
    assert _pull_revision(before, 3) == sha(901)
    assert _pull_revision(after, 3) == sha(902)


def test_c10_two_members_of_the_same_pull_request_get_the_same_value() -> None:
    scenario = single_pull_scenario(later_commit=True, second_author=OTHER)
    second_member = live_request(member_id="00000000-0000-4000-8000-000000000888")

    first_run = run_case(scenario)
    second_run = run_case(scenario, request=second_member, linked_account=OTHER)

    assert identities(first_run.result) == [pull_identity(3)]
    assert identities(second_run.result) == identities(first_run.result)
    # 각자의 후보는 자기 커밋만 기여 근거로 둔다.
    assert commit_urls(first_run.result["candidates"][0]) == {commit_url(sha(901))}
    assert commit_urls(second_run.result["candidates"][0]) == {commit_url(sha(902))}


def merge_unit_scenario() -> tuple[Scenario, str]:
    feature = commit(sha(951), MEMBER, parents=(B0,), minute=2)
    merged = merge_commit(sha(952), B0, feature.sha, author=MEMBER, minute=3)
    scenario = Scenario(
        default_branch=(merged, feature, root_commit()),
        lookups={feature.sha: (), merged.sha: ()},
    )
    return scenario, merged.sha


def test_c12_same_pull_request_number_in_another_repository_differs() -> None:
    elsewhere = live_request(repository_id=OTHER_REPOSITORY_ID)

    here_run = run_case(single_pull_scenario())
    elsewhere_run = run_case(single_pull_scenario(), request=elsewhere)

    assert identities(here_run.result) == [pull_identity(3)]
    assert identities(elsewhere_run.result) == [pull_identity(3, request=elsewhere)]
    assert pull_identity(3) != pull_identity(3, request=elsewhere)


def test_c11_same_merge_in_another_repository_differs() -> None:
    # 포크처럼 같은 병합 커밋이 다른 저장소에도 있다. 저장소마다 따로 판정한다.
    scenario, merged = merge_unit_scenario()
    elsewhere = live_request(repository_id=OTHER_REPOSITORY_ID)

    here_run = run_case(scenario)
    elsewhere_run = run_case(scenario, request=elsewhere)

    assert identities(here_run.result) == [merge_identity(merged)]
    assert identities(elsewhere_run.result) == [
        merge_identity(merged, request=elsewhere)
    ]
    assert merge_identity(merged) != merge_identity(merged, request=elsewhere)


def test_c13_mock_and_live_results_get_different_values() -> None:
    mock = REQUEST
    assert mock.source_mode == "MOCK"

    live_run = run_case(single_pull_scenario())
    mock_run = run_case(single_pull_scenario(), request=mock)

    assert identities(live_run.result) == [pull_identity(3)]
    assert identities(mock_run.result) == [pull_identity(3, request=mock)]
    assert pull_identity(3) != pull_identity(3, request=mock)
