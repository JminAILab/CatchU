"""허용 범위 안의 수집·정규화·근거와, 결과 조합·처리 순서와의 연결.

모두 합성 GitHub 응답과 자격정보 대역으로 확인한다. 실제 GitHub·A 연결을 검증하지 않는다.
"""

import logging
import tempfile
from dataclasses import fields, is_dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from github_synthetic import (
    BASE,
    EVIL,
    INJECTION,
    MEMBER,
    OTHER,
    REFERENCE,
    REQUEST,
    STANDARD_ORDER,
    TOKEN,
    FakeClock,
    FakeTransport,
    Reply,
    StaticCredentials,
    StaticSelections,
    commit_detail_json,
    commit_json,
    empty_repository,
    file_json,
    issue_json,
    oversized,
    pull_json,
    repository_json,
    request_with,
    respond,
    sha,
    standard_routes,
    status_only,
)

from app.collection import (
    PROPOSED_LIMITS,
    CollectionLimits,
    CollectionOutcome,
    DetailStatus,
    FailureCode,
    GitHubAccount,
    collect,
)
from app.contract import Verdict, check_message
from app.processing import (
    CheckedRequest,
    DraftOutcome,
    EligibleCandidate,
    Finished,
    GenerationOutput,
    ReflectionOutcome,
    compose_result,
    process_request,
    synthetic_accepted_context,
    synthetic_request,
)
from app.processing.request_check import SourceMode

PULLS = f"{BASE}/pulls?state=all&sort=created&direction=desc&per_page=100&page=1"
ISSUES = f"{BASE}/issues?state=all&sort=created&direction=desc&per_page=100&page=1"
FINISHED_AT = datetime(2026, 10, 1, 0, 30, tzinfo=UTC)


def _run(
    routes: dict[str, Reply],
    request: CheckedRequest = REQUEST,
    *,
    limits: CollectionLimits = PROPOSED_LIMITS,
) -> tuple[CollectionOutcome, FakeTransport]:
    transport = FakeTransport(routes)
    outcome = collect(
        request,
        credentials=StaticCredentials(),
        selections=StaticSelections(),
        open_transport=lambda: transport,
        clock=FakeClock(),
        limits=limits,
    )
    return outcome, transport


# 정상 수집과 정규화


def test_normal_collection_keeps_records_within_allowed_scope() -> None:
    outcome, transport = _run(standard_routes())

    assert outcome.completed
    assert outcome.failures == ()
    assert transport.paths == STANDARD_ORDER
    assert outcome.calls == len(STANDARD_ORDER)

    member_commit, other_commit, unlinked_commit = outcome.commits
    assert member_commit.author == MEMBER
    assert member_commit.changes_status is DetailStatus.FETCHED
    assert other_commit.author == OTHER
    assert other_commit.changes_status is DetailStatus.NOT_REQUESTED
    assert unlinked_commit.author is None
    assert unlinked_commit.changes_status is DetailStatus.NOT_REQUESTED

    own_pull, fork_pull = outcome.pull_requests
    assert own_pull.commits == (sha(1),)
    assert own_pull.merge_commit_sha == sha(5010)
    assert not own_pull.from_fork
    assert fork_pull.commits_status is DetailStatus.NOT_REQUESTED
    assert fork_pull.from_fork
    assert fork_pull.merge_commit_sha is None  # 병합 전 값은 쓰지 않는다

    # 이슈 목록 API가 섞어 준 PR 항목은 이슈로 받지 않는다.
    assert [issue.number for issue in outcome.issues] == [20]


def test_commit_changes_keep_files_and_mark_missing_patches() -> None:
    outcome, _ = _run(standard_routes())

    changes = outcome.commits[0].changes
    assert changes is not None
    assert [file.path for file in changes.files] == ["app/login.py", "assets/logo.png"]
    assert changes.files[0].patch == "@@ -1 +1 @@"
    assert changes.files[1].patch is None
    assert (changes.additions, changes.deletions) == (3, 1)
    assert not changes.files_truncated


def test_bot_authors_are_kept_as_observed_accounts() -> None:
    dependabot = GitHubAccount("dependabot[bot]", 49699333)
    routes = standard_routes()
    routes[f"{BASE}/commits?per_page=100&page=1"] = respond(
        [commit_json(1, MEMBER), commit_json(4, dependabot)]
    )
    routes[PULLS] = respond([pull_json(10, MEMBER), pull_json(12, dependabot)])
    routes[ISSUES] = respond(
        [issue_json(21, GitHubAccount("github-actions[bot]", 41898282))]
    )

    outcome, transport = _run(routes)

    assert outcome.completed
    assert transport.paths == STANDARD_ORDER
    assert outcome.commits[1].author == dependabot
    assert outcome.commits[1].changes_status is DetailStatus.NOT_REQUESTED
    assert outcome.pull_requests[1].author == dependabot
    assert outcome.issues[0].author is not None


def test_text_in_collected_records_is_data_not_instructions() -> None:
    outcome, transport = _run(standard_routes())

    assert outcome.issues[0].body == INJECTION
    # 본문의 지시·주소로 호출이 늘거나 바뀌지 않는다.
    assert transport.paths == STANDARD_ORDER
    assert not any(EVIL in path or "other/repo" in path for path in transport.paths)


@pytest.mark.parametrize(
    ("types", "expected"),
    [
        (("COMMIT",), [STANDARD_ORDER[0], STANDARD_ORDER[1], STANDARD_ORDER[4]]),
        (("PULL_REQUEST",), [STANDARD_ORDER[0], PULLS, STANDARD_ORDER[5]]),
        (("ISSUE",), [STANDARD_ORDER[0], ISSUES]),
        (("COMMIT", "ISSUE"), [*STANDARD_ORDER[:2], ISSUES, STANDARD_ORDER[4]]),
    ],
)
def test_only_allowed_resource_types_are_called(
    types: tuple[str, ...], expected: list[str]
) -> None:
    outcome, transport = _run(standard_routes(), request_with(*types))

    assert outcome.completed
    assert transport.paths == expected
    assert bool(outcome.commits) == ("COMMIT" in types)
    assert bool(outcome.pull_requests) == ("PULL_REQUEST" in types)
    assert bool(outcome.issues) == ("ISSUE" in types)


# 조회 개수 범위와 잘림은 한계로 남고 실패가 아니다


def _limits_of(outcome: CollectionOutcome) -> set[tuple[str, str]]:
    return {(limit.resource_type, limit.message) for limit in outcome.coverage_limits}


def test_count_range_is_paged_by_f_and_the_rest_is_a_limit() -> None:
    routes = standard_routes()
    routes[f"{BASE}/commits?per_page=100&page=1"] = respond(
        [commit_json(100 + n, OTHER) for n in range(100)], next_page=True
    )
    routes[f"{BASE}/commits?per_page=100&page=2"] = respond(
        [commit_json(300 + n, OTHER) for n in range(100)], next_page=True
    )

    outcome, transport = _run(routes, limits=replace(PROPOSED_LIMITS, max_commits=150))

    assert outcome.completed
    assert len(outcome.commits) == 150
    assert f"{BASE}/commits?per_page=100&page=3" not in transport.paths
    assert ("COMMIT", "기본 브랜치의 최근 커밋 150건까지만 조회했다") in _limits_of(
        outcome
    )


def test_reaching_the_end_exactly_is_not_a_limit() -> None:
    routes = standard_routes()
    routes[f"{BASE}/commits?per_page=100&page=1"] = respond(
        [commit_json(100 + n, OTHER) for n in range(100)]
    )

    outcome, _ = _run(routes, limits=replace(PROPOSED_LIMITS, max_commits=100))

    assert outcome.completed
    assert not any(kind == "COMMIT" for kind, _ in _limits_of(outcome))


def test_oversized_detail_is_dropped_as_a_limit_and_collection_continues() -> None:
    routes = standard_routes()
    routes[f"{BASE}/commits/{sha(1)}"] = oversized()

    outcome, transport = _run(routes)

    assert outcome.completed
    assert transport.paths == STANDARD_ORDER
    assert outcome.commits[0].changes_status is DetailStatus.OVERSIZED
    evidence = outcome.evidence_for(outcome.commits[0])
    assert "변경 내용 응답이 크기 상한을 넘어 변경 파일을 확인하지 못했다" in (
        evidence.coverage_limits
    )


def test_oversized_list_page_is_a_limit_not_a_failure() -> None:
    routes = standard_routes()
    routes[ISSUES] = oversized()

    outcome, _ = _run(routes)

    assert outcome.completed
    assert outcome.issues == ()
    assert (
        "ISSUE",
        "이슈 목록 응답이 크기 상한을 넘어 그 쪽부터 뒤 이슈는 확인하지 못했다",
    ) in _limits_of(outcome)


def test_split_file_list_and_long_pull_request_commit_list_are_limits() -> None:
    routes = standard_routes()
    routes[f"{BASE}/commits/{sha(1)}"] = respond(
        commit_detail_json(1, MEMBER, [file_json("a.py", 1, 0)]), next_page=True
    )
    for page, count in ((1, 100), (2, 100), (3, 50)):
        routes[f"{BASE}/pulls/10/commits?per_page=100&page={page}"] = respond(
            [{"sha": sha(9000 + page * 100 + n)} for n in range(count)],
            next_page=page < 3,
        )

    outcome, _ = _run(routes)

    assert outcome.completed
    commit_evidence = outcome.evidence_for(outcome.commits[0])
    assert "변경 파일이 많아 GitHub 응답의 첫 쪽 파일만 확인했다" in (
        commit_evidence.coverage_limits
    )
    pull = outcome.pull_requests[0]
    assert pull.commits is not None and len(pull.commits) == 250
    assert pull.commits_truncated
    assert "PR 커밋 목록 API가 돌려주는 250건까지만 확인했다" in (
        outcome.evidence_for(pull).coverage_limits
    )


# 근거의 재료


def test_evidence_uses_urls_and_revisions_built_by_f() -> None:
    outcome, _ = _run(standard_routes())
    web = "https://github.com/catchu-synthetic-owner/catchu-synthetic-repo"

    commit = outcome.evidence_for(outcome.commits[0])
    assert commit.source_url == f"{web}/commit/{sha(1)}"
    assert commit.source_revision == sha(1)
    assert commit.observed_facts == (
        f"커밋 {sha(1)[:12]}, 작성 시각 2026-09-01T00:01:00Z",
        "변경 파일 2개, 추가 3줄·삭제 1줄",
    )
    assert commit.contribution.author == MEMBER
    assert commit.contribution.linked_account_is_author
    assert commit.coverage_limits == (
        "파일 1개는 GitHub 응답에 변경 내용이 없어 확인하지 못했다",
    )
    unlinked = outcome.evidence_for(outcome.commits[2])
    assert unlinked.contribution.author is None
    assert not unlinked.contribution.linked_account_is_author
    assert "GitHub가 작성자를 계정과 연결하지 못해 작성자를 확인하지 못했다" in (
        unlinked.coverage_limits
    )

    pull = outcome.evidence_for(outcome.pull_requests[0])
    assert pull.source_url == f"{web}/pull/10"
    assert pull.source_revision == sha(2010)
    assert pull.observed_facts == ("PR #10, 상태 병합됨", "PR 커밋 1건")

    other = outcome.evidence_for(outcome.commits[1])
    assert not other.contribution.linked_account_is_author
    # 2026-10-08 팀장 결정(본인 기여의 뜻): '작성한'이 아니라 '작성자로 기록된'으로 쓴다.
    assert "연동 계정이 작성자로 기록된 커밋이 아니라 변경 내용을 조회하지 않았다" in (
        other.coverage_limits
    )

    issue = outcome.evidence_for(outcome.issues[0])
    assert issue.source_url == f"{web}/issues/20"
    assert issue.source_revision == "2026-09-01T00:21:00Z"
    # 관측 사실에는 제목·본문 글자를 넣지 않는다.
    assert issue.observed_facts == ("이슈 #20, 상태 열림",)

    for basis in (commit, pull, other, issue):
        assert basis.source_url.startswith(web)
        assert EVIL not in basis.source_url


def _candidate(outcome: CollectionOutcome) -> EligibleCandidate:
    # 후보 판정은 #118이 한다. 여기서는 연결 모양을 보려고 근거 하나로 후보를 흉내 낸다.
    basis = outcome.evidence_for(outcome.commits[0])
    return EligibleCandidate(
        work_identity="synthetic-work-collection",
        title=None,
        work_facts=basis.observed_facts,
        subject_contribution="합성: 연동 계정이 작성한 커밋",
        grouping_basis="합성: 커밋 하나",
        grouping_limitations=(),
        evidence=(basis.to_evidence_item("커밋 1건"),),
        draft=DraftOutcome.not_generated(),
        reflection=ReflectionOutcome.not_generated(),
        # Result v3(CR2)는 후보마다 본인 커밋 목록이 1개 이상이다.
        own_commit_shas=(outcome.commits[0].sha,),
    )


def _compose(outcome: CollectionOutcome, *, with_candidate: bool) -> dict[str, Any]:
    output = GenerationOutput(
        candidates=(_candidate(outcome),) if with_candidate else (),
        failures=outcome.stage_failures(),
    )
    result = compose_result(REQUEST, output, finished_at=FINISHED_AT, id_label="c")
    assert check_message("Result", result).verdict is Verdict.VALID
    return result


def test_evidence_fits_the_result_contract() -> None:
    outcome, _ = _run(standard_routes())

    result = _compose(outcome, with_candidate=True)

    assert result["outcome"] == "SUCCEEDED"
    evidence = result["candidates"][0]["evidence"][0]
    assert evidence["sourceRevision"] == sha(1)
    assert evidence["coverageLimits"]


# 수집 실패·부분 수집은 정상 0건이 아니다


def test_normal_collection_without_records_is_empty_not_failed() -> None:
    routes: dict[str, Reply] = {
        BASE: respond(repository_json()),
        f"{BASE}/commits?per_page=100&page=1": respond([]),
        PULLS: respond([]),
        ISSUES: respond([]),
    }

    outcome, _ = _run(routes)

    assert outcome.completed
    assert (outcome.failures, outcome.coverage_limits) == ((), ())
    assert _compose(outcome, with_candidate=False)["outcome"] == "EMPTY"


def test_empty_git_repository_is_zero_commits_and_other_types_continue() -> None:
    routes: dict[str, Reply] = {
        BASE: respond(repository_json()),
        f"{BASE}/commits?per_page=100&page=1": empty_repository(),
        PULLS: respond([]),
        ISSUES: respond([issue_json(20, MEMBER)]),
    }

    outcome, transport = _run(routes)

    # 빈 저장소 응답은 수집 실패도 한계도 아니다. 뒤의 PR·이슈 목록을 계속 부른다.
    assert outcome.completed
    assert (outcome.failures, outcome.coverage_limits) == ((), ())
    assert transport.paths == [
        BASE,
        f"{BASE}/commits?per_page=100&page=1",
        PULLS,
        ISSUES,
    ]
    assert outcome.commits == ()
    assert [issue.number for issue in outcome.issues] == [20]


@pytest.mark.parametrize(
    ("with_candidate", "expected"), [(True, "PARTIAL_FAILED"), (False, "FAILED")]
)
def test_interrupted_collection_never_becomes_empty(
    with_candidate: bool, expected: str
) -> None:
    routes = standard_routes()
    routes[f"{BASE}/pulls/10/commits?per_page=100&page=1"] = status_only(503)

    outcome, _ = _run(routes)

    assert not outcome.completed
    assert outcome.pull_requests[0].commits_status is DetailStatus.NOT_REACHED
    result = _compose(outcome, with_candidate=with_candidate)
    assert result["outcome"] == expected
    assert result["failures"] == [
        {
            "stage": "COLLECTION",
            "code": "COLLECTION_FETCH_FAILED",
            "message": outcome.failures[0].message,
        }
    ]


def test_refused_collection_composes_a_failed_result() -> None:
    outcome, _ = _run(standard_routes(), request_with())

    result = _compose(outcome, with_candidate=False)

    assert result["outcome"] == "FAILED"
    assert result["failures"][0]["code"] == FailureCode.NO_ALLOWED_RESOURCE_TYPE


class CollectingGenerator:
    """시험용: 수집만 하고 후보는 만들지 않는 생성기. LIVE 조립은 #121이 한다."""

    def __init__(
        self, credentials: StaticCredentials, transport: FakeTransport
    ) -> None:
        self._credentials = credentials
        self._transport = transport

    @property
    def source_mode(self) -> SourceMode:
        return "MOCK"

    def generate(self, request: CheckedRequest) -> GenerationOutput:
        outcome = collect(
            request,
            credentials=self._credentials,
            selections=StaticSelections(),
            open_transport=lambda: self._transport,
            clock=FakeClock(),
        )
        return GenerationOutput(failures=outcome.stage_failures())


def test_credential_failure_is_reported_after_progress_events() -> None:
    accepted = synthetic_accepted_context()
    events: list[dict[str, Any]] = []
    transport = FakeTransport(standard_routes())

    outcome = process_request(
        synthetic_request(accepted),
        accepted=accepted,
        generator=CollectingGenerator(StaticCredentials(context=None), transport),
        emit=events.append,
        clock=lambda: FINISHED_AT,
        id_label="credential-unresolved",
    )

    assert isinstance(outcome, Finished)
    assert [event["state"] for event in events] == ["RECEIVED", "RUNNING"]
    assert outcome.result["outcome"] == "FAILED"
    assert outcome.result["failures"][0]["code"] == "CREDENTIAL_REFERENCE_UNRESOLVED"
    assert transport.calls == []


# 정리와 비밀값


def _strings(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if is_dataclass(value) and not isinstance(value, type):
        return [s for f in fields(value) for s in _strings(getattr(value, f.name))]
    if isinstance(value, tuple | list | frozenset | set):
        return [s for item in value for s in _strings(item)]
    return []


@pytest.mark.parametrize(
    "change",
    [
        {},
        {PULLS: status_only(500)},
        {PULLS: status_only(401)},
        {BASE: status_only(302, {"location": f"{EVIL}/{TOKEN}"})},
    ],
)
def test_connection_is_closed_and_no_secret_is_kept(
    change: dict[str, Reply], caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.DEBUG, logger="app.collection"):
        outcome, transport = _run({**standard_routes(), **change})

    assert transport.closed
    kept = _strings(outcome)
    assert not any(TOKEN in text or REFERENCE in text for text in kept)
    assert TOKEN not in repr(outcome)
    assert TOKEN not in caplog.text
    assert REFERENCE not in caplog.text
    # 로그에는 수집한 본문·경로를 남기지 않는다.
    assert INJECTION not in caplog.text
    assert BASE not in caplog.text
    assert "수집 종료" in caplog.text


def test_unexpected_error_is_not_turned_into_a_result_and_connection_closes() -> None:
    routes = standard_routes()
    transport = FakeTransport(routes)

    def broken() -> Any:
        raise RuntimeError("합성 결함")

    routes[PULLS] = broken
    with pytest.raises(RuntimeError, match="합성 결함"):
        collect(
            REQUEST,
            credentials=StaticCredentials(),
            selections=StaticSelections(),
            open_transport=lambda: transport,
            clock=FakeClock(),
        )

    assert transport.closed


def test_collection_writes_no_temporary_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    monkeypatch.chdir(tmp_path)

    _run(standard_routes())
    _run({**standard_routes(), PULLS: status_only(500)})

    assert list(tmp_path.iterdir()) == []
