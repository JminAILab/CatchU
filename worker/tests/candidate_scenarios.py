"""후보 판정 사례 시험용 선언형 합성 저장소(#118).

기본 브랜치 커밋(부모·작성자·메시지·변경 파일), PR(상태·시각·병합 커밋·제목·본문·포크·커밋 목록),
연결 PR 조회 응답, 이슈를 적으면 합성 GitHub 경로별 응답을 만든다. 그다음 관계 조회를 포함한
수집 → 후보 판정 → 결과 조합을 한 번에 돌리고 결과가 메시지 계약 v1을 통과하는지 확인한다.
계획에 없는 호출과 정하지 않은 SHA의 연결 PR 조회는 FakeTransport가 시험 실패로 만든다. 수집을
마쳤으면 사례가 둔 PR 커밋 목록을 모두 불렀는지, 연결 PR을 정한 SHA를 모두 묶음 조회로 물었는지도
본다.

기대값은 작업 동일성 판별 기준 문서와 #118 명세에서 정한다. 후보 판정 코드를 읽어 맞추지 않는다.
workIdentity 기대값은 wi1 함수로 따로 계산한다.
"""

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from typing import Any, Literal

from git_synthetic import GitRepo
from github_synthetic import (
    BASE,
    DEFAULT_BRANCH,
    EVIL,
    GRAPHQL_ROUTE_PREFIX,
    LISTED_COMMITS,
    LISTED_ISSUES,
    LISTED_PULLS,
    MEMBER,
    MISSING_COMMIT,
    NAME,
    OTHER,
    OWNER,
    REQUEST,
    FakeClock,
    FakeTransport,
    Reply,
    StaticCredentials,
    StaticSelections,
    account_json,
    associated_key,
    credential_context,
    detail_diff_path,
    detail_path,
    diff_reply,
    diff_text,
    file_json,
    graphql_route,
    issue_json,
    issue_listing_pull_json,
    line_counts,
    pull_commits_path,
    relation_pull_json,
    relation_repository_json,
    respond,
    sha,
    stamp,
    with_files,
)

import app.candidates as candidates
from app.candidates.identity import (
    CommitsUnit,
    MergeUnit,
    Part,
    PullRequestUnit,
    WorkUnit,
    work_identity,
)
from app.collection import (
    PROPOSED_LIMITS,
    CollectionLimits,
    CollectionOutcome,
    GitHubAccount,
    RelationOptions,
    SelectedRange,
    collect,
)
from app.collection.transport import HttpResponse
from app.contract import Verdict, check_message
from app.processing import CheckedRequest, GenerationOutput, compose_result

FINISHED_AT = datetime(2026, 10, 1, 0, 30, tzinfo=UTC)
# 근거 출처 주소의 앞부분(검사한 저장소 좌표로 만든 GitHub 화면 주소).
WEB = f"https://github.com/{OWNER}/{NAME}"
LIVE: CheckedRequest = replace(REQUEST, source_mode="LIVE")
# 판정 범위 시험(C11·C12)에 쓰는 다른 저장소 값.
OTHER_REPOSITORY_ID = "00000000-0000-4000-8000-000000000777"
# 회원도 OTHER도 아닌 세 번째 계정. 사례마다 기본 브랜치의 뿌리 커밋을 이 계정이 만든다.
THIRD = GitHubAccount("catchu-synthetic-third", 1003)
ROOT = sha(1)

PullState = Literal["merged", "open", "closed"]


def live_request(
    *types: str, repository_id: str | None = None, member_id: str | None = None
) -> CheckedRequest:
    """LIVE 요청. 종류를 주면 그 종류만 허용한다."""
    request = LIVE
    if types:
        request = replace(request, allowed_resource_types=frozenset(types))
    if repository_id is not None:
        request = replace(request, repository_id=repository_id)
    if member_id is not None:
        request = replace(request, member_id=member_id)
    return request


def named(letter: str) -> str:
    """사례표처럼 같은 16진수 글자 40개로 적은 SHA(`cccc…`)."""
    if len(letter) != 1 or letter not in "0123456789abcdef":
        raise ValueError("16진수 글자 하나여야 한다")
    return letter * 40


# 커밋


def change(
    path: str,
    *,
    additions: int | None = None,
    deletions: int | None = None,
    patch: str | None = None,
    status: str = "modified",
    with_patch: bool = True,
) -> dict[str, Any]:
    """커밋 상세의 `files` 항목. patch를 주지 않으면 한 줄을 바꾼 hunk를 둔다.

    줄 수를 주지 않으면 GitHub처럼 patch의 `+`·`-` 줄 수로 둔다. with_patch가 거짓이면 이진·큰
    파일처럼 GitHub가 `patch`를 주지 않은 항목이다(줄 수는 그대로 둔다).
    """
    if patch is None:
        patch = f"@@ -1 +1 @@\n-old {path}\n+new {path}"
    counted_additions, counted_deletions = line_counts(patch)
    return file_json(
        path,
        counted_additions if additions is None else additions,
        counted_deletions if deletions is None else deletions,
        patch if with_patch else None,
        status=status,
    )


@dataclass(frozen=True)
class Commit:
    """커밋 하나: 목록 항목(커밋 목록·PR 커밋 목록 모양)과 상세 응답."""

    item: dict[str, Any]
    # 커밋 상세 응답. None이면 상세 경로를 두지 않는다(부르면 시험 실패).
    detail: dict[str, Any] | None
    # diff 형식 응답 본문. None이면 상세의 files로 만든다(일반 파일, 모드 바꿈 없음).
    diff: bytes | None = None

    @property
    def sha(self) -> str:
        value = self.item["sha"]
        assert isinstance(value, str)
        return value


def _signature(minute: int) -> dict[str, str]:
    return {
        "name": "합성 작성자",
        "email": "synthetic@example.invalid",
        "date": stamp(minute),
    }


def commit(
    sha_value: str,
    author: GitHubAccount | None,
    *,
    parents: Sequence[str] = (),
    message: str = "합성 커밋",
    minute: int = 0,
    files: Sequence[dict[str, Any]] | None = None,
    committer: GitHubAccount | None = None,
) -> Commit:
    """합성 커밋. 병합 커밋(부모 둘 이상)은 상세 경로를 두지 않는다.

    files를 주지 않으면 그 커밋만의 파일 하나를 한 줄 고친 것으로 둔다. committer를 주지
    않으면 작성자와 같다(계정 없는 작성자의 커밋 등 서로 다른 경우만 시험이 정한다).
    """
    item: dict[str, Any] = {
        "sha": sha_value,
        "url": f"{EVIL}/api/commit",
        "html_url": f"{EVIL}/commit",
        "commit": {
            "author": _signature(minute),
            "committer": _signature(minute),
            "message": message,
        },
        "author": account_json(author),
        "committer": account_json(committer if committer is not None else author),
        "parents": [{"sha": parent, "url": f"{EVIL}/p"} for parent in parents],
    }
    if len(parents) >= 2:
        return Commit(item, None)
    changed = list(files) if files is not None else [change(f"src/{sha_value[:8]}.py")]
    return Commit(item, with_files(item, changed))


def git_commit(repo: GitRepo, ref: str, author: GitHubAccount | None) -> Commit:
    """실제 git 커밋을 GitHub 응답 모양으로. 병합 커밋은 상세 경로를 두지 않는다.

    diff 형식 응답은 그 커밋의 실제 git diff 출력(파일 모드 줄 포함)이다.
    """
    item = repo.commit_json(ref, author)
    if len(item["parents"]) >= 2:
        return Commit(item, None)
    return Commit(item, repo.commit_detail_json(ref, author), repo.github_diff(ref))


def merge_commit(
    sha_value: str,
    first_parent: str,
    other_parent: str,
    *,
    author: GitHubAccount | None = OTHER,
    minute: int = 0,
) -> Commit:
    """병합 커밋 항목(실제 git 병합 없이 부모만 정한다)."""
    return commit(
        sha_value,
        author,
        parents=(first_parent, other_parent),
        message="병합",
        minute=minute,
    )


def without_patch(target: Commit) -> Commit:
    """상세 응답의 모든 파일에서 `patch`를 뺀 커밋(이진·큰 변경처럼 GitHub가 주지 않은 경우)."""
    assert target.detail is not None
    files = [
        {key: value for key, value in entry.items() if key != "patch"}
        for entry in target.detail["files"]
    ]
    return Commit(target.item, {**target.detail, "files": files}, target.diff)


# PR


@dataclass(frozen=True)
class Pull:
    """PR 하나: PR 목록·연결 PR API 항목과 PR 커밋 목록."""

    number: int
    author: GitHubAccount | None
    # PR 커밋 목록(API 순서).
    commits: tuple[Commit, ...] = ()
    state: PullState = "merged"
    # 분 단위 합성 시각. 주지 않으면 만든 시각은 번호, 병합·닫은 시각은 그 5분 뒤.
    created: int | None = None
    merged: int | None = None
    # 병합된 PR의 merge_commit_sha. 주지 않으면 관측하지 않은 squash 커밋 값을 둔다.
    merge_commit: str | None = None
    head: str | None = None
    base_sha: str | None = sha(9999)
    base_ref: str = DEFAULT_BRANCH
    fork: bool = False
    title: str | None = None
    body: str | None = "합성 PR 본문"

    @property
    def created_minute(self) -> int:
        return self.number if self.created is None else self.created

    @property
    def closed_minute(self) -> int:
        return self.created_minute + 5 if self.merged is None else self.merged

    @property
    def head_sha(self) -> str:
        if self.head is not None:
            return self.head
        return self.commits[-1].sha if self.commits else sha(self.number + 2000)

    def item(self) -> dict[str, Any]:
        return relation_pull_json(
            self.number,
            self.author,
            state=self.state,
            created=self.created_minute,
            merged_minute=self.closed_minute,
            merge_commit=self.merge_commit if self.state == "merged" else None,
            base_commit=self.base_sha,
            head=self.head_sha,
            base_ref=self.base_ref,
            fork=self.fork,
            title=self.title,
            body=self.body,
        )


def root_commit() -> Commit:
    """기본 브랜치의 뿌리 커밋(세 번째 계정)."""
    return commit(ROOT, THIRD, minute=1)


# 사례


@dataclass(frozen=True)
class Scenario:
    """합성 저장소 하나의 관측 자료."""

    # 기본 브랜치 커밋 목록(최근 것부터).
    default_branch: tuple[Commit, ...] = ()
    # 목록에 나오는 PR. 응답은 만든 순서의 최근 것부터 정렬한다.
    pulls: tuple[Pull, ...] = ()
    # 연결 PR 조회: SHA → 돌려줄 PR 번호(빈 튜플은 빈 목록) 또는 그 커밋의 정한 결과(다음 쪽 표시,
    # MISSING_COMMIT). 오류 상태·크기 초과는 묶음 전체의 응답이라 overrides에 graphql_route로 둔다.
    lookups: Mapping[str, tuple[int, ...] | Reply] = field(default_factory=dict)
    # PR 목록 밖에서 연결 PR 조회로만 나오는 PR.
    lookup_pulls: tuple[Pull, ...] = ()
    # 다른 계정이 연 이슈 번호와, 이슈 목록 API가 섞어 주는 PR 항목 번호.
    issues: tuple[int, ...] = ()
    issue_pull_items: tuple[int, ...] = ()
    # 위에서 만든 경로 응답을 바꾸거나 더한다(목록의 다음 쪽·오류 응답, 연결 PR 묶음 응답 등).
    overrides: Mapping[str, Reply] = field(default_factory=dict)

    def pull(self, number: int) -> Pull:
        found = [p for p in (*self.pulls, *self.lookup_pulls) if p.number == number]
        assert len(found) == 1, f"PR #{number}이 사례에 하나가 아니다"
        return found[0]

    def all_commits(self) -> dict[str, Commit]:
        found: dict[str, Commit] = {}
        for each in self.default_branch:
            found.setdefault(each.sha, each)
        for pull in (*self.pulls, *self.lookup_pulls):
            for each in pull.commits:
                found.setdefault(each.sha, each)
        return found

    def routes(self) -> dict[str, Reply]:
        listed = sorted(
            self.pulls, key=lambda p: (p.created_minute, p.number), reverse=True
        )
        routes: dict[str, Reply] = {
            BASE: respond(relation_repository_json()),
            LISTED_COMMITS: respond([each.item for each in self.default_branch]),
            LISTED_PULLS: respond([pull.item() for pull in listed]),
            LISTED_ISSUES: respond(
                [
                    *(issue_json(number, OTHER) for number in self.issues),
                    *(issue_listing_pull_json(n) for n in self.issue_pull_items),
                ]
            ),
        }
        for pull in self.pulls:
            routes[pull_commits_path(pull.number)] = respond(
                [each.item for each in pull.commits]
            )
        for sha_value, reply in self.lookups.items():
            if isinstance(reply, tuple):
                reply = respond([self.pull(number).item() for number in reply])
            routes[associated_key(sha_value)] = reply
        for each in self.all_commits().values():
            if each.detail is not None:
                routes[detail_path(each.sha)] = respond(each.detail)
                # 같은 변경을 비교할 커밋만 이 경로를 diff 형식으로 부른다.
                diff = each.diff
                if diff is None:
                    diff = diff_text(each.detail["files"])
                routes[detail_diff_path(each.sha)] = diff_reply(diff)
        routes.update(self.overrides)
        return routes


def open_pull_with_direct_commit(
    *,
    pull_author: GitHubAccount = MEMBER,
    lookup: tuple[int, ...] | Reply = (3,),
    with_pull: bool = True,
) -> Scenario:
    """열린 PR #3(커밋 하나)과, PR #3의 전체 커밋 목록에 없는 기본 브랜치의 본인 커밋 ffff.

    C16·C17·C27~C29의 모양이다. 판정은 기본 브랜치의 본인 커밋만 연결 PR을 조회하므로 ffff를
    기본 브랜치 목록에 둔다. 사례표의 강제 푸시 같은 어긋남은 연결 PR 조회 응답(lookup)으로 만든다.
    연결 PR 묶음 조회는 ffff 하나만 묻는다. 그래서 lookup이 PR 번호, 그 커밋의 PR 목록 응답(다음 쪽
    표시 포함), MISSING_COMMIT이면 ffff의 결과로 두고, 그 밖의 응답(오류 상태·크기 초과·전송
    오류)은 그 POST 전체의 응답(graphql_route(ffff))으로 둔다.
    """
    own = commit(
        sha(31), pull_author, parents=(ROOT,), minute=3, files=[change("app/page.py")]
    )
    direct = commit(
        named("f"), MEMBER, parents=(ROOT,), minute=4, files=[change("app/list.py")]
    )
    pulls = (
        (Pull(3, pull_author, (own,), state="open", created=2),) if with_pull else ()
    )
    if isinstance(lookup, tuple) or _commit_result(lookup):
        return Scenario(
            default_branch=(direct, root_commit()),
            pulls=pulls,
            lookups={direct.sha: lookup},
        )
    return Scenario(
        default_branch=(direct, root_commit()),
        pulls=pulls,
        overrides={graphql_route(direct.sha): lookup},
    )


def _commit_result(lookup: Reply) -> bool:
    """커밋 하나의 결과로 둘 응답인가(묶음 전체의 응답이 아닌가)."""
    return lookup is MISSING_COMMIT or (
        isinstance(lookup, HttpResponse)
        and lookup.status == 200
        and lookup.body is not None
        and lookup.body.startswith(b"[")
    )


def _relation_routes(
    scenario: Scenario, request: CheckedRequest
) -> tuple[set[str], set[str]]:
    """허용 종류로 부를 수 있는, 사례가 둔 관계 조회: (호출 열쇠, 연결 PR을 정한 SHA).

    호출 열쇠는 PR 커밋 목록 경로와, 직접 정한 연결 PR 묶음 조회 POST(graphql_route)다.
    """
    allowed = request.allowed_resource_types
    paths: set[str] = set()
    shas: set[str] = set()
    if "PULL_REQUEST" in allowed:
        paths.update(pull_commits_path(pull.number) for pull in scenario.pulls)
        if "COMMIT" in allowed:
            shas.update(scenario.lookups)
            paths.update(
                key
                for key in scenario.overrides
                if key.startswith(GRAPHQL_ROUTE_PREFIX)
            )
    return paths, shas


@dataclass(frozen=True)
class CaseRun:
    scenario: Scenario
    request: CheckedRequest
    outcome: CollectionOutcome
    output: GenerationOutput
    result: dict[str, Any]
    transport: FakeTransport


def collect_case(
    scenario: Scenario,
    *,
    request: CheckedRequest = LIVE,
    limits: CollectionLimits = PROPOSED_LIMITS,
    clock: FakeClock | None = None,
    seconds_per_call: float = 0.0,
    linked_account: GitHubAccount = MEMBER,
    options: RelationOptions | None = None,
) -> tuple[CollectionOutcome, FakeTransport]:
    """관계 조회까지 포함한 수집만 돌린다. 자격정보 맥락은 요청의 회원·저장소에 맞춘다.

    options는 관계 조회 설정(추가 기준 브랜치)이다. 주지 않으면 운영 경로처럼 비워 둔다.
    """
    clock = clock or FakeClock()
    transport = FakeTransport(
        scenario.routes(), clock=clock, seconds_per_call=seconds_per_call
    )
    outcome = collect(
        request,
        credentials=StaticCredentials(
            context=credential_context(
                member_id=request.member_id,
                repository_id=request.repository_id,
                linked_account=linked_account,
            )
        ),
        selections=StaticSelections(
            selected=SelectedRange(request.repository_id, True)
        ),
        open_transport=lambda: transport,
        clock=clock,
        limits=limits,
        relations=options or RelationOptions(),
    )
    return outcome, transport


def run_case(
    scenario: Scenario,
    *,
    request: CheckedRequest = LIVE,
    limits: CollectionLimits = PROPOSED_LIMITS,
    clock: FakeClock | None = None,
    seconds_per_call: float = 0.0,
    linked_account: GitHubAccount = MEMBER,
    options: RelationOptions | None = None,
) -> CaseRun:
    """수집 → 후보 판정 → 결과 조합. 결과는 항상 메시지 계약 v1을 통과해야 한다."""
    outcome, transport = collect_case(
        scenario,
        request=request,
        limits=limits,
        clock=clock,
        seconds_per_call=seconds_per_call,
        linked_account=linked_account,
        options=options,
    )
    if outcome.completed:
        # 사례가 둔 관계 응답(PR 커밋 목록·연결 PR 조회)을 수집이 실제로 불렀어야 한다. 응답만 두고
        # 부르지 않았는데 기대 판정이 우연히 맞는 시험을 막는다. 연결 PR은 묶음 조회 POST의 SHA로
        # 본다(REST 경로가 없다는 것만으로 부르지 않았다고 보지 않는다).
        paths, shas = _relation_routes(scenario, request)
        missing = sorted(paths - set(transport.paths)) + sorted(
            associated_key(sha_value) for sha_value in shas - set(transport.looked_up)
        )
        assert not missing, f"부르지 않은 관계 조회: {missing}"
    output = candidates.build_candidates(request, outcome)
    result = compose_result(request, output, finished_at=FINISHED_AT, id_label="case")
    assert_member_text(output, result)
    checked = check_message("Result", result)
    assert checked.verdict is Verdict.VALID, checked.errors
    return CaseRun(scenario, request, outcome, output, result, transport)


# 후보 처리가 쓰는 회원용 문장에 넣지 않는 조회 방식의 말. 수집 시험이 관계 조회의 한계 문구에
# 쓰는 검사(`test_collection_relations._JARGON`)와 같다.
MEMBER_TEXT_JARGON = ("API", "쪽", "연결 PR 조회")
# 제목·작업 사실·나의 기여에 쓰지 않는 CatchU가 센 숫자(2026-10-08 팀장 결정 「수신자에게 나가는
# 숫자와 근거 순서」). #번호와 SHA는 셈이 아니므로 허용한다.
COUNTED_NUMBER = re.compile(r"[0-9]+ ?(건|줄|개)")


def assert_member_text(
    output: GenerationOutput, result: Mapping[str, Any] | None = None
) -> None:
    """후보 문장이 2026-10-08 팀장 결정과 조회 방식의 말 규칙을 지킨다.

    - #118은 제목을 만들지 않는다(title=None). 조합된 결과의 제목은 임시 대체값인 작업 사실 첫
      항목이다(결정 문서 「담당과 순서」 ③).
    - 제목·작업 사실·나의 기여에 센 숫자가 없다.
    - '작성한'을 쓰지 않는다(「본인 기여의 뜻」).
    result를 주지 않으면 LIVE 요청으로 조합해 본다(제목 대체는 요청 값과 무관하다).
    """
    if result is None:
        result = compose_result(
            LIVE, output, finished_at=FINISHED_AT, id_label="member-text"
        )
    assert len(result["candidates"]) == len(output.candidates)
    for each, entry in zip(output.candidates, result["candidates"], strict=True):
        assert each.title is None, each.title
        assert entry["title"] == each.work_facts[0], entry["title"]
        for text in (entry["title"], *each.work_facts, each.subject_contribution):
            assert not COUNTED_NUMBER.search(text), text
        texts = (
            *each.work_facts,
            each.subject_contribution,
            each.grouping_basis,
            *each.grouping_limitations,
        )
        for text in texts:
            assert not any(word in text for word in MEMBER_TEXT_JARGON), text
        for text in (
            *texts,
            *(item.contribution_scope for item in each.evidence),
            *(limit for item in each.evidence for limit in item.coverage_limits),
        ):
            assert "작성한" not in text, text


# 기대값 계산과 결과 읽기


def identity(
    unit: WorkUnit, parts: Iterable[Part] = (), *, request: CheckedRequest = LIVE
) -> str:
    return work_identity(request.source_mode, request.repository_id, unit, parts)


def pull_identity(
    number: int, *part_commits: str, request: CheckedRequest = LIVE
) -> str:
    """PR 단위 값. 커밋을 주면 그 커밋들로 나눈 부분의 값이다."""
    return identity(
        PullRequestUnit(number),
        [Part(each) for each in part_commits],
        request=request,
    )


def merge_identity(sha_value: str, *, request: CheckedRequest = LIVE) -> str:
    return identity(MergeUnit(sha_value), request=request)


def bundle_identity(*shas: str, request: CheckedRequest = LIVE) -> str:
    return identity(CommitsUnit(tuple(shas)), request=request)


def identities(result: Mapping[str, Any]) -> list[str]:
    return [each["workIdentity"] for each in result["candidates"]]


def candidate(result: Mapping[str, Any], work_identity_value: str) -> dict[str, Any]:
    found: list[dict[str, Any]] = [
        each
        for each in result["candidates"]
        if each["workIdentity"] == work_identity_value
    ]
    assert len(found) == 1, "그 값의 후보가 하나가 아니다"
    return found[0]


def pull_url(number: int) -> str:
    return f"{WEB}/pull/{number}"


def commit_url(sha_value: str) -> str:
    return f"{WEB}/commit/{sha_value}"


def evidence_urls(entry: Mapping[str, Any]) -> list[str]:
    return [each["sourceUrl"] for each in entry["evidence"]]


def commit_urls(entry: Mapping[str, Any]) -> set[str]:
    return {url for url in evidence_urls(entry) if url.startswith(f"{WEB}/commit/")}


def not_provided(result: Mapping[str, Any]) -> dict[str, int]:
    return {each["reason"]: each["count"] for each in result["notProvided"]}


def failure_codes(result: Mapping[str, Any]) -> list[tuple[str, str]]:
    return [(each["stage"], each["code"]) for each in result["failures"]]
