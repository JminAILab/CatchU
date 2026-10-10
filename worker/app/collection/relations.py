"""관계 조회(#118): 목록 뒤에 같은 수집 연결로 작업 단위 판정에 필요한 관계를 모은다.

`collect(..., relations=RelationOptions())`일 때만 돈다. 목록(커밋·PR·이슈)을 본 게이트웨이·예산·
자격정보를 그대로 쓰며 새 연결을 열거나 토큰을 밖으로 넘기지 않는다. 순서는 다음과 같다.

1. BASE_BRANCHES(커밋 허용 때): 호출하는 쪽이 명시한 추가 기준 브랜치의 최근 커밋. 이름으로
   기준 브랜치를 추정하지 않는다. 기본값은 빈 목록이고 요청 계약에는 이 설정을 받을 필드가 없어,
   LIVE 조립(#121)에서 저장소별 내부 설정으로 넘기지 않으면 비어 있다. 개수 상한(다음 쪽 있음)이나
   응답 크기 상한으로 끝까지 받지 못한 브랜치가 있으면 커밋 공유 한계를 하나 남긴다(브랜치 이름·
   개수는 넣지 않는다). 후보 처리는 끝까지 따라가지 못한 사슬이 있으면 본선에 없는 PR 없는 병합을
   흡수 병합인지 모르는 것으로 보고 확정하지 않는다.
2. PULL_REQUEST_COMMITS(PR 허용 때): 목록의 모든 PR(다른 계정이 연 PR 포함)의 커밋 목록을 먼저
   병합된 PR부터 본다. 250건 미만 목록은 PR 목록에서 본 머리 커밋이 목록의 끝일 때만 그 판본의
   목록으로 쓰고(빈 목록은 머리 커밋이 기준 쪽에 있어 그 판본의 PR 커밋이 0건일 때만), 아니면 판본
   불일치(REVISION_MISMATCH)로 버린다. PR 커밋 목록 API는 250건까지만
   주고 기준..머리 범위를 받지 않아 PR 경계를 증명하지 못한다. 그래서 250건에 닿고 커밋 조회도
   허용됐으면 PR API로 전체 커밋 수와 그때의 머리 커밋을 받는다. 머리 커밋이 PR 목록에서 본 것과
   같을 때만 비교 API(base...head)를 부르고, 비교 범위의 전체 수가 PR 전체 수와 같고 그만큼 다
   받았고 이미 받은 250건과 머리 커밋이 모두 들어 있을 때만 다 읽은 것으로 본다(작업 동일성 기준
   결정 기록 2026-10-08). 수나 판본이 어긋나면 비교 결과를 모두 버리고 250건만 쓴다. 비교 쪽수
   상한·응답 크기 상한으로 다 받지 못했으면 250건을 모두 담은 데까지만 쓴다. 빈 쪽이나 다음 쪽
   표시가 없는 것은 끝의 증거로 쓰지 않는다.
3. 로컬 계산(호출 없음): PR 커밋 목록·merge_commit_sha로 설명되지 않은 본인 커밋을 고른다.
4. LOOKUPS(커밋·PR 허용 때): 고른 커밋을 모두 먼저 계획해 두고 최근 것부터 연결 PR을 조회한다.
   커밋 조회를 마친 뒤(멈췄으면 멈춘 때) 그 결과로 PR 없는 병합 후보를 고른다. 들인 커밋(흡수
   병합이 기준 브랜치에서 들인 커밋은 뺀다)에 PR 밖으로 확인된(빈 목록이거나 멈춰 조회하지 못한)
   본인 커밋이 있는 병합만 이어서 조회한다. 응답 크기 상한, 다음 쪽, 기준 저장소를 알 수 없는 PR은
   그 커밋의 자료 범위 한계(LIMITED)다. 그다음 이 병합 가운데 첫 부모 쪽 조상이 창 밖으로 열린
   병합만 경계 비교(비교 API, 첫 부모...병합)를 비교 쪽수 상한까지 부른다. 창만으로는 첫 부모가 이미
   담은 커밋을 다 빼지 못하기 때문이다. 창이 저장소의 모든 이력을 담았으면 부르지 않는다. 결과는
   MergeBoundary로 남기고, 쪽수·응답 크기 상한이나 수가 맞지 않으면 다 읽지 못한 것(complete 거짓),
   수집이 멈춰 부르지 못했으면 NOT_REACHED다.
5. DETAILS(커밋 허용 때): 변경 내용. 같은 변경 확인·단위 나누기에 꼭 필요한 것(필수 조회)은
   상한까지 부른다. 그다음 파일 모드를 확인한다. 커밋 상세(JSON)에는 파일 모드가 없어서, 관계
   근거(cherry-pick 표시·재제출)가 있고 모드를 빼고 계산한 diff 값(content_patch_id)이 같으며
   None이 아닌 쌍의 양쪽 커밋만 같은 커밋 경로를 diff 형식으로 커밋마다 한 번 부른다. 받은 본문은
   파일 머리글의 경로·모드 줄만 읽어 변경 파일 목록과 맞추고 `ChangedFile.mode_lines`에 넣는다.
   응답이 크기 상한을 넘었거나 파일을 모두 맞추지 못하면 모드를 넣지 않는다(비교할 수 없음).
   이 조회는 판정에 필요하므로 필수 조회처럼 여유 검사 없이 부르고, 상세 조회 개수에는 세지
   않는다. 결과는 ModeCheck로 남기며 수집이 멈춰 부르지 못했으면 NOT_REACHED다. 필수 조회 도중에
   멈췄으면 받은 변경 내용으로 확인했어야 할 커밋을 정해 NOT_REACHED로 둔다. 그 밖(먼저 단위마다
   기여 커밋 하나, 그다음 선택 1: PR 밖 본인 커밋, 선택 2: 나머지 본인 커밋)은 상세 조회 개수와
   남은 호출·총량 안에서, 수집 시간은 호출 하나의 대기 합의 두 배를 남기고 부른다. 그래서 선택
   조회 때문에 호출 수·총량 상한에 걸리지는 않는다. 다만 선택 조회를 건너뛰려는 때 수집 시간
   마감이 이미 지났으면 시간 상한 실패로 멈춘다. 시간은 여유를 둘 뿐이라 네트워크가 느리면 수집
   시간 상한에 걸릴 수 있다.

어느 단계든 200이 아닌 응답(빈 Git 저장소의 커밋 목록 409는 빼고: #117)·오류·상한이면 다른
호출처럼 수집을 멈춘다. 비교 API(250건 경로와 경계 비교)·연결 PR 조회·추가 기준 브랜치의
404·409·422와 diff 형식 조회의 오류 응답도 같다. 멈추면 그 단계를 남기고, 계획했으나 닿지 못한
조회는 NOT_REACHED로 둔다. 다시 부르지 않는다. 소속 확정·같은 변경·후보 판정은 하지 않는다. 그
판정은 app/candidates가 이 관측으로 한다.

PR 소속은 PR 응답의 `merge_commit_sha`에 기댄다. GitHub REST API 판본 2026-03-10은 이 필드를
없앴으므로 게이트웨이가 고정한 `X-GitHub-Api-Version: 2022-11-28`을 바꾸면 이 조회도 함께 고친다.
"""

import re
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from enum import StrEnum
from functools import partial
from typing import Literal

from app.collection import normalize
from app.collection.api_paths import MAX_PER_PAGE, RepositoryPaths
from app.collection.collectors import (
    PULL_REQUEST_COMMITS_API_CAP,
    CollectedData,
    ListingEnd,
    PagePath,
    list_pages,
    reading,
)
from app.collection.gateway import GitHubGateway, Oversized
from app.collection.graph import BroughtIn, WindowGraph, base_line, is_merge
from app.collection.identifiers import GitHubAccount, RepositoryCoordinates
from app.collection.limits import CollectionLimits
from app.collection.records import (
    CommitRecord,
    DetailStatus,
    PullRequestRecord,
    ResourceType,
)

Phase = Literal["LISTS", "BASE_BRANCHES", "PULL_REQUEST_COMMITS", "LOOKUPS", "DETAILS"]

# git 브랜치 이름 가운데 경로·쿼리에 안전하게 넣을 수 있는 모양만 받는다.
_BRANCH = re.compile(r"[A-Za-z0-9._/-]{1,255}")


def _valid_branch(name: object) -> bool:
    return (
        isinstance(name, str)
        and _BRANCH.fullmatch(name) is not None
        and ".." not in name
        and "//" not in name
        and not name.startswith(("/", "-"))
        and not name.endswith(("/", ".lock"))
    )


@dataclass(frozen=True)
class RelationOptions:
    """관계 조회 설정. 기본 브랜치 밖의 기준 브랜치는 호출하는 쪽이 명시한 것만 쓴다.

    한계: 기본값은 빈 목록이고, 요청 계약(Request)은 추가 속성을 받지 않아 요청에서 이 값을 받을
    칸이 없다. LIVE 조립(#121)에서 저장소별 내부 설정으로 넘기지 않으면 기본 브랜치만 기준 브랜치가
    된다. 그때 통합 브랜치를 받아온 병합이 PR 없는 병합 후보가 되거나 들인 커밋이 넓게 잡힐 수 있다.
    """

    extra_base_branches: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.extra_base_branches, tuple):
            raise ValueError("추가 기준 브랜치는 이름의 튜플이어야 한다")
        if not all(_valid_branch(name) for name in self.extra_base_branches):
            # 이름은 저장소 글자이므로 메시지에 넣지 않는다.
            raise ValueError("추가 기준 브랜치 이름 형식이 맞지 않는다")


class Lookup(StrEnum):
    """커밋 하나의 연결 PR 조회 상태. 조회 오류(404·409·422 포함)는 상태가 아니라 수집 실패다."""

    # 다음 쪽 없이 이 저장소의 PR을 돌려줬다.
    FOUND = "FOUND"
    # 다음 쪽 없이 이 저장소의 PR이 0건이었다(정상 부재). 다른 저장소 기준으로 확인된 PR만 있었던
    # 경우도 여기다.
    EMPTY = "EMPTY"
    # 응답 크기 상한을 넘었거나, 연결 PR이 한 쪽보다 많거나(다음 쪽이 있다. 첫 쪽이 다른 저장소
    # PR로만 찼어도 같다), 기준 저장소를 알 수 없는 PR이 있었다(자료 범위 한계).
    LIMITED = "LIMITED"
    # 수집이 멈춰 조회하지 못했다(확인 중단).
    NOT_REACHED = "NOT_REACHED"


@dataclass(frozen=True)
class PullRequestCommits:
    """PR 하나의 커밋 목록 관측."""

    number: int
    # 관측한 시점의 PR 머리 커밋(관측 판본).
    observed_at: str
    # FETCHED·OVERSIZED·REVISION_MISMATCH·NOT_REACHED, 목록 밖에서 연결 PR 조회로만 안 PR은
    # BEYOND_RANGE. 연결 PR 조회로만 안 PR의 근거 한계 문구는 evidence.py가 그 PR 기록으로 만든다.
    status: DetailStatus
    # API 순서의 SHA. FETCHED일 때만 있다.
    commits: tuple[str, ...]
    # 모든 쪽을 읽었고 관측한 머리 커밋이 목록의 끝이거나(250건 미만), 비교 범위의 전체 수가 PR
    # API의 전체 커밋 수와 같고 그만큼 끝까지 읽었다. 거짓이어도 commits의 커밋은 PR 커밋이다(경계와
    # 판본이 맞는 비교 범위만 더함).
    complete: bool
    full_list_via_compare: bool = False
    # 이 목록에만 해당하는 한계 문구. PR 기록의 상태로 이미 나오는 한계는 되풀이하지 않는다.
    limits: tuple[str, ...] = ()
    # 250건에 닿아 PR API·비교 API로 확인하려 했을 때의 근거: 비교 시작 커밋으로 쓴(쓰려 한) PR의
    # base.sha, 비교 응답이 준 시작 커밋, PR API가 준 전체 커밋 수. 그 단계까지 가지 않았거나 받지
    # 못한 값은 None이다. PR API의 머리 커밋이 달라 비교하지 않았으면 비교 응답의 시작 커밋은 None이고
    # 전체 커밋 수는 바뀐 PR의 값이다.
    compared_from: str | None = None
    merge_base: str | None = None
    total_commits: int | None = None


@dataclass(frozen=True)
class AssociatedPulls:
    sha: str
    status: Lookup
    # 이 저장소 기준 PR 번호(API 순서).
    pull_requests: tuple[int, ...] = ()
    # 기준 저장소가 다른 저장소로 확인돼 버린 PR 수.
    foreign_ignored: int = 0
    # 기준 저장소를 알 수 없어(base.repo가 없거나 null) 버린 PR 수. 1 이상이면 LIMITED다.
    unknown_base: int = 0


@dataclass(frozen=True)
class BaseBranchLine:
    """추가 기준 브랜치의 최근 커밋."""

    name: str
    head: str | None
    commits: tuple[CommitRecord, ...]
    # 브랜치 끝까지 읽었다.
    complete: bool


@dataclass(frozen=True)
class MergeBoundary:
    """첫 부모 쪽이 창 밖으로 열린 PR 없는 병합 하나의 경계 비교(첫 부모...병합) 관측."""

    merge: str
    # 비교 범위의 커밋 SHA(API 순서). 병합 커밋 자신도 든다.
    commits: tuple[str, ...]
    # 비교 범위의 전체 수만큼 다 받았고, 병합 커밋이 들어 있고, 응답이 준 시작 커밋이 첫 부모와 다르지
    # 않았다. 쪽수·응답 크기 상한에 걸렸거나, 쪽끼리 전체 수가 다르거나, 전체 수 전에 끝났으면 거짓이다.
    complete: bool
    # FETCHED(불렀다), OVERSIZED(응답이 크기 상한을 넘었다), NOT_REACHED(수집이 멈춰 부르지 못했다).
    status: DetailStatus

    @property
    def usable(self) -> bool:
        """병합이 들인 커밋을 이 관측으로 정할 수 있다."""
        return self.status is DetailStatus.FETCHED and self.complete


@dataclass(frozen=True)
class DetailTiers:
    """변경 내용 조회 계획(커밋 SHA). 한 커밋은 한 단계에만 든다. 이 순서로 부른다."""

    # 필수 조회: 같은 변경 확인·단위 나누기에 꼭 필요하다. 상한에 걸리면 확인 중단이다.
    needed: tuple[str, ...] = ()
    # 단위의 첫 기여 커밋(선택): 받은 PR 커밋 목록마다 가장 최근 본인 병합 아닌 커밋, 그다음 연결 PR
    # 조회로 정해질 PR마다 가장 최근 본인 커밋(목록에서 이미 골랐거나 목록을 끝까지 받은 PR은 뺀다).
    # 상세 조회 개수가 모자랄 때 PR 단위마다 변경 파일을 확인한 기여 커밋이 하나는 남게 먼저 부른다.
    # 커밋 묶음·PR 없는 병합은 수집 때 단위를 알 수 없어 아래 순서를 따른다.
    unit_first: tuple[str, ...] = ()
    # 선택 1: PR 밖으로 확인된 본인 커밋. 커밋 묶음 판정이 변경 파일을 쓴다.
    outside_pull_requests: tuple[str, ...] = ()
    # 선택 2: 나머지 본인 커밋. 근거·작업 사실에 쓰고, 후보 처리가 본인 커밋이 모두 빈 커밋인 단위를
    # 기준 미달(BELOW_CRITERIA)로 셀 때도 쓴다. 받지 못한 커밋은 빈 커밋으로 보지 않는다.
    evidence: tuple[str, ...] = ()


@dataclass(frozen=True)
class ModeCheck:
    """같은 변경 비교 전에 diff 형식 조회로 파일 모드를 확인한 커밋 하나."""

    sha: str
    # FETCHED(받았다), OVERSIZED(응답이 크기 상한을 넘었다), NOT_REACHED(수집이 멈춰 부르지 못했다).
    status: DetailStatus
    # 받은 diff의 파일과 변경 파일 목록을 모두 맞춰 모드 줄을 커밋 기록에 넣었다. 거짓이면 그 커밋의
    # 모드는 관측하지 못한 것이고, 같은 변경으로 비교할 수 없다.
    matched: bool = False


@dataclass(frozen=True)
class RelationObservations:
    # 저장소 확인 전에 멈췄으면 None.
    default_branch: str | None
    # 목록의 PR은 먼저 병합된 순서로, 그 뒤 연결 PR 조회로만 안 PR.
    pull_request_commits: tuple[PullRequestCommits, ...] = ()
    # PR 목록에 없고 연결 PR 조회로 알게 된 이 저장소의 PR.
    pull_requests_from_lookups: tuple[PullRequestRecord, ...] = ()
    # 계획한 연결 PR 조회(커밋, 그다음 PR 없는 병합 후보) 순서.
    associated: tuple[AssociatedPulls, ...] = ()
    # 기본 브랜치 커밋 목록에 없고 PR 커밋 목록·비교 API로만 본 커밋. 기본 브랜치 커밋과 겹치지 않는다.
    commits: tuple[CommitRecord, ...] = ()
    base_branches: tuple[BaseBranchLine, ...] = ()
    # 계획한 병합 경계 비교(첫 부모 쪽이 창 밖으로 열린 연결 PR 조회 대상 병합) 순서.
    merge_boundaries: tuple[MergeBoundary, ...] = ()
    detail_tiers: DetailTiers = DetailTiers()
    # 계획한 파일 모드 확인 순서. 수집이 멈춰 부르지 못한 커밋은 NOT_REACHED(모드 확인 미도달)다.
    mode_checks: tuple[ModeCheck, ...] = ()
    stopped_during: Phase | None = None


ResubmissionCheck = Callable[[PullRequestRecord, PullRequestRecord], bool]


# 관계 근거의 정의. 변경 내용의 필수 조회 계획과 후보 처리의 판정이 같은 정의를 쓴다. 글자 규칙
# (cherry-pick 표시·이슈 번호·PR 번호 읽기)과 diff 값 계산은 app/candidates/same_change.py에,
# 재제출의 상태·순서 조건은 아래 resubmission_shape에 있다. app.candidates는 app.collection을 가져다
# 쓰므로 이 모듈을 읽을 때 가져오면 순환 import가 된다. 그래서 글자 규칙과 diff 값은 쓸 때 가져온다.


def _cherry_pick_sources(message: str) -> frozenset[str]:
    from app.candidates.same_change import cherry_pick_sources

    return cherry_pick_sources(message)


def _issue_references(text: str) -> frozenset[int]:
    from app.candidates.same_change import issue_references

    return issue_references(text)


def _content_patch_id(record: CommitRecord) -> str | None:
    from app.candidates.same_change import content_patch_id

    return None if record.changes is None else content_patch_id(record.changes)


def resubmission_shape(old: PullRequestRecord, new: PullRequestRecord) -> bool:
    """재제출의 상태·순서 조건: 앞 PR은 병합 없이 닫혔고 뒤 PR은 더 나중에 만들어져 병합됐다."""
    return (
        old.state == "closed"
        and old.merged_at is None
        and new.merged_at is not None
        and new.created_at > old.created_at
    )


def default_resubmission(repository: RepositoryCoordinates) -> ResubmissionCheck:
    """재제출 관계: 상태·순서 조건과, 뒤 PR 제목·본문이 앞 PR을 직접 가리키는지."""
    references: dict[int, frozenset[int]] = {}

    def check(old: PullRequestRecord, new: PullRequestRecord) -> bool:
        if not resubmission_shape(old, new):
            return False
        if new.number not in references:
            from app.candidates.same_change import pull_request_references

            # 제목과 본문을 따로 읽는다. 이어 붙이면 제목의 코드 표시가 본문까지 이어질 수 있다.
            references[new.number] = pull_request_references(
                new.title, repository
            ) | pull_request_references(new.body, repository)
        return old.number in references[new.number]

    return check


# 순수 계산: 수집의 조회 계획과 후보 처리가 함께 쓴다.


def _unique[T](values: Iterable[T]) -> tuple[T, ...]:
    return tuple(dict.fromkeys(values))


def pull_request_precedence(
    records: Iterable[PullRequestRecord],
) -> tuple[PullRequestRecord, ...]:
    """먼저 병합된 PR부터(병합 시각, 번호), 그 뒤 병합되지 않은 PR을 번호순으로. 번호당 처음 것만."""
    unique: dict[int, PullRequestRecord] = {}
    for record in records:
        unique.setdefault(record.number, record)
    merged = sorted(
        (
            (record.merged_at, record.number, record)
            for record in unique.values()
            if record.merged_at is not None
        ),
        key=lambda item: (item[0], item[1]),
    )
    unmerged = sorted(
        (record for record in unique.values() if record.merged_at is None),
        key=lambda record: record.number,
    )
    return (*(record for _, _, record in merged), *unmerged)


def newest_first(records: Iterable[CommitRecord]) -> tuple[CommitRecord, ...]:
    """작성 시각이 늦은 것부터, 같으면 SHA순."""
    by_sha = sorted(records, key=lambda record: record.sha)
    return tuple(sorted(by_sha, key=lambda record: record.authored_at, reverse=True))


def _explained(
    pull_request_commits: Iterable[Iterable[str]], merge_commit_shas: Iterable[str]
) -> set[str]:
    explained = set(merge_commit_shas)
    for shas in pull_request_commits:
        explained.update(shas)
    return explained


def lookup_targets(
    commits: Iterable[CommitRecord],
    account: GitHubAccount,
    *,
    pull_request_commits: Iterable[Iterable[str]],
    merge_commit_shas: Iterable[str],
) -> tuple[str, ...]:
    """연결 PR을 조회할 커밋: 연동 계정이 작성자로 기록된 기본 브랜치의 병합 아닌 커밋 가운데
    조회한 PR 커밋 목록에도, 병합된 PR의 merge_commit_sha에도 없는 것(목록 순서)."""
    explained = _explained(pull_request_commits, merge_commit_shas)
    return _unique(
        record.sha
        for record in commits
        if account.same_account(record.author)
        and not is_merge(record)
        and record.sha not in explained
    )


@dataclass(frozen=True)
class BaseChain:
    """추가 기준 브랜치 하나의 첫 부모 사슬."""

    commits: frozenset[str]
    # 사슬을 끝까지 따라갔다: 브랜치 커밋을 끝까지 받았거나 사슬이 뿌리 커밋에 닿았다. 거짓이면 받은
    # 범위 밖으로 사슬이 이어져, 그 부분을 받아온 병합을 흡수 병합으로 가리지 못했을 수 있다.
    complete: bool


def base_line_chains(
    graph: WindowGraph, lines: Iterable[BaseBranchLine]
) -> tuple[BaseChain, ...]:
    """추가 기준 브랜치마다 머리에서 첫 부모만 따라간 사슬(그 브랜치 커밋과 창 커밋으로)."""
    chains: list[BaseChain] = []
    for line in lines:
        parents = dict(graph.parents)
        parents.update((record.sha, record.parents) for record in line.commits)
        commits, rooted = base_line(line.head, parents)
        chains.append(BaseChain(commits, line.complete or rooted))
    return tuple(chains)


@dataclass(frozen=True)
class PullRequestLessMerges:
    """PR 없는 병합 후보와 그 후보가 들인 커밋의 정의.

    연결 PR 조회·경계 비교 대상과 변경 내용 계획(수집), 병합 단위 판정(후보 처리)이 이 정의 하나를
    쓴다.
    """

    # PR 커밋 목록·merge_commit_sha로 설명되지 않고 흡수 병합도 아닌 창 안 병합(창 순서).
    candidates: tuple[str, ...]
    # PR 커밋 목록·merge_commit_sha로 설명된 SHA.
    explained: frozenset[str]
    # 흡수 병합마다 그 병합이 기준 브랜치에서 들인 커밋. 그 흡수 병합을 들인 후보의 들인 커밋에서
    # 뺀다.
    absorbed: Mapping[str, frozenset[str]]
    # 끝까지 따라가지 못한 추가 기준 브랜치 사슬이 있다. 그러면 본선에 없는 후보는 그 사슬을 받아온
    # 흡수 병합인지 확정하지 못한다.
    base_lines_cut: bool

    def brought_in(
        self, graph: WindowGraph, merge: str, boundary: MergeBoundary | None = None
    ) -> BroughtIn:
        """후보 병합이 들인 창 안 커밋(complete는 그대로 둔다).

        들인 커밋 가운데 흡수 병합이 있으면 그 흡수 병합이 기준 브랜치에서 들인 커밋은 뺀다. 그
        커밋은 원래 들어온 단위에 속한다. 첫 부모 쪽이 창 밖으로 열렸으면 창으로 센 커밋에 첫 부모가
        이미 담은 커밋이 남을 수 있다. 그때 경계 비교를 끝까지 받았으면 비교 범위에서 병합 커밋을
        뺀 것을 들인 커밋으로 쓰고, 그 커밋이 모두 창 안에 있을 때만 complete다. 경계 비교가 없거나
        다 받지 못했으면 창으로 센 커밋을 두고 complete를 거짓으로 둔다. 어느 보류 상태로 둘지는
        부르는 쪽이 정한다.
        """
        seen = graph.brought_in(merge)
        if not seen.first_side_open:
            return replace(seen, commits=self._without_absorbed(seen.commits))
        if boundary is None or not boundary.usable:
            return replace(
                seen, commits=self._without_absorbed(seen.commits), complete=False
            )
        within = frozenset(boundary.commits) - {merge}
        return BroughtIn(
            self._without_absorbed(within),
            all(sha in graph.parents for sha in within),
            first_side_open=True,
        )

    def _without_absorbed(self, commits: frozenset[str]) -> frozenset[str]:
        taken = [
            brought
            for absorption, brought in self.absorbed.items()
            if absorption in commits
        ]
        return commits.difference(*taken)


def pull_request_less_merges(
    graph: WindowGraph,
    *,
    pull_request_commits: Iterable[Iterable[str]],
    merge_commit_shas: Iterable[str],
    base_lines: Iterable[BaseBranchLine],
) -> PullRequestLessMerges:
    """PR 없는 병합 후보(창 순서)와 그 후보가 들인 커밋을 정하는 값.

    후보는 PR 커밋 목록·merge_commit_sha로 설명되지 않고 흡수 병합도 아닌 창 안 병합이다. 머리가
    하나로 정해지지 않으면 본선이 없어 흡수 병합을 가리지 않는다. 그때 병합 단위를 확정할지는
    부르는 쪽이 정한다.
    """
    explained = frozenset(_explained(pull_request_commits, merge_commit_shas))
    chains = base_line_chains(graph, base_lines)
    lines = tuple(chain.commits for chain in chains)
    if graph.head is None:
        absorbed: frozenset[str] = frozenset()
        absorbed_commits: dict[str, frozenset[str]] = {}
    else:
        absorbed = graph.absorption_merges(lines)
        absorbed_commits = graph.absorbed_commits(lines)
    return PullRequestLessMerges(
        candidates=graph.candidate_merges(explained=explained, absorbed=absorbed),
        explained=explained,
        absorbed=absorbed_commits,
        base_lines_cut=not all(chain.complete for chain in chains),
    )


def merge_lookup_targets(
    commits: Sequence[CommitRecord],
    *,
    pull_request_commits: Iterable[Iterable[str]],
    merge_commit_shas: Iterable[str],
    base_lines: Iterable[BaseBranchLine],
    outside: frozenset[str],
) -> tuple[str, ...]:
    """연결 PR을 조회할 PR 없는 병합 후보: 들인 커밋에 outside(PR 밖으로 확인된 본인 커밋)가 있는 것.

    들인 커밋은 흡수 병합이 들인 커밋을 뺀 창 안 커밋이다(후보 처리와 같은 정의). 첫 부모 쪽이 창
    밖으로 열린 병합은 첫 부모가 이미 담은 커밋까지 셀 수 있어 실제보다 넓게 고른다. 머리가 하나로
    정해지지 않으면 병합 단위를 확정할 수 없으므로 조회하지 않는다.
    """
    graph = WindowGraph.of(commits)
    if graph.head is None or not outside:
        return ()
    merges = pull_request_less_merges(
        graph,
        pull_request_commits=pull_request_commits,
        merge_commit_shas=merge_commit_shas,
        base_lines=base_lines,
    )
    return tuple(
        merge
        for merge in merges.candidates
        if merges.brought_in(graph, merge).commits & outside
    )


# 한계 문구. 회원이 읽으므로 API 이름·쪽 같은 조회 방식 대신 확인하지 못한 것을 적는다. 저장소
# 글자(브랜치 이름·제목)를 넣지 않는다. 확인한 커밋 수는 PR 근거의 한계(evidence.py)가 따로 적으므로
# 여기서는 250건 밖을 확인하지 못한 이유만 적는다.
_CAP = PULL_REQUEST_COMMITS_API_CAP
_BEYOND = f"PR 커밋 {_CAP}건 밖의 커밋"
_FORK_CAP = f"다른 저장소(포크)에서 연 PR이라 {_BEYOND}은 확인하지 않았다"
_NO_BASE_CAP = f"PR이 시작된 기준 커밋을 알 수 없어 {_BEYOND}은 확인하지 않았다"
_NO_COMMIT_CAP = f"커밋 조회가 허용되지 않은 요청이라 {_BEYOND}은 확인하지 않았다"
_PULL_OVERSIZED = (
    f"PR 정보 응답이 크기 상한을 넘어 PR의 전체 커밋 수를 알 수 없어 {_BEYOND}은 "
    "확인하지 않았다"
)
_COUNT_MISMATCH = (
    f"PR의 전체 커밋 수가 받은 PR 커밋과 맞지 않아 {_BEYOND}은 확인하지 않았다"
)
_COMPARE_OVERSIZED = (
    f"{_BEYOND}을 받는 응답이 크기 상한을 넘어 그 커밋을 끝까지 확인하지 못했다"
)
_PULL_REVISION_CHANGED = f"PR이 조회 중에 바뀌어 {_BEYOND}은 확인하지 않았다"
_BASE_BRANCH_CUT = (
    "따로 지정한 기준 브랜치 가운데 커밋을 끝까지 받지 못한 브랜치가 있어, 그 브랜치를 "
    "받아온 병합을 작업과 구별하지 못했을 수 있다"
)
_COMPARE_MISMATCH = (
    f"{_BEYOND}으로 받은 커밋이 PR의 전체 커밋 수·판본이나 이미 받은 PR 커밋과 맞지 않아 "
    "그 커밋은 확인하지 못했다"
)


def _compare_pages_limit(pages: int) -> str:
    return (
        f"PR 커밋이 많아 정해 둔 범위인 {pages * MAX_PER_PAGE}건까지만 읽고 그 밖의 PR "
        "커밋은 확인하지 못했다"
    )


def _skipped_details_limit(limit: int) -> str:
    # 건너뛴 본인 커밋 수는 CatchU가 센 수라 적지 않는다(2026-10-08 팀장 결정). 정해 둔 상한 값만 쓴다.
    return (
        "연동 계정이 작성자로 기록된 커밋 일부는 상세 조회 개수"
        f"({limit}건)나 남은 호출·시간·총량 여유 밖이라 변경 내용을 조회하지 않았다"
    )


def _ends_at(records: Sequence[CommitRecord], head: str) -> bool:
    """목록에 머리 커밋이 있고 그 뒤를 잇는 커밋이 없다(머리가 목록의 끝이다)."""
    return any(record.sha == head for record in records) and not any(
        head in record.parents for record in records
    )


def _with_commits(
    record: PullRequestRecord, entry: PullRequestCommits
) -> PullRequestRecord:
    if entry.status is DetailStatus.FETCHED:
        return replace(
            record,
            commits=entry.commits,
            commits_status=DetailStatus.FETCHED,
            commits_truncated=not entry.complete,
        )
    return replace(
        record, commits=None, commits_status=entry.status, commits_truncated=False
    )


@dataclass
class _CompareProof:
    """250건에 닿은 PR을 비교 API로 확인하며 받은 근거."""

    total_commits: int | None = None
    merge_base: str | None = None

    def stamp(self, entry: PullRequestCommits, base_sha: str) -> PullRequestCommits:
        return replace(
            entry,
            compared_from=base_sha,
            merge_base=self.merge_base,
            total_commits=self.total_commits,
        )


class RelationCollector:
    """요청 한 건의 관계 조회. `collect`가 목록 뒤에 같은 게이트웨이로 부른다."""

    def __init__(
        self,
        options: RelationOptions,
        paths: RepositoryPaths,
        account: GitHubAccount,
        limits: CollectionLimits,
        allowed: frozenset[ResourceType],
    ) -> None:
        self._options = options
        self._paths = paths
        self._account = account
        self._limits = limits
        self._allowed = allowed
        self._is_resubmission = default_resubmission(paths.repository)
        # 지금 단계. 멈추면 이 값을 stopped_during으로 남긴다.
        self.phase: Phase = "LISTS"
        self.default_branch: str | None = None
        self._stopped_during: Phase | None = None
        self._base_lines: list[BaseBranchLine] = []
        self._pull_commits: dict[int, PullRequestCommits] = {}
        self._default_positions: dict[str, list[int]] = {}
        self._extra: dict[str, CommitRecord] = {}
        self._planned_lookups: list[str] = []
        self._merge_lookups_planned = False
        self._associated: dict[str, AssociatedPulls] = {}
        self._planned_boundaries: list[str] = []
        self._boundaries: dict[str, MergeBoundary] = {}
        self._lookup_pulls: dict[int, PullRequestRecord] = {}
        self._tiers = DetailTiers()
        # 모드 확인 계획(커밋 SHA). 필수 상세를 받은 뒤 정하고, 그 전에 멈췄으면 멈출 때 정한다.
        self._planned_modes: tuple[str, ...] | None = None
        self._modes: dict[str, ModeCheck] = {}

    def run(self, gateway: GitHubGateway, data: CollectedData) -> None:
        """목록을 본 뒤의 관계 조회. 멈추면 CollectionStopped가 그대로 올라간다."""
        commits_allowed = "COMMIT" in self._allowed
        pulls_allowed = "PULL_REQUEST" in self._allowed
        for index, record in enumerate(data.commits):
            self._default_positions.setdefault(record.sha, []).append(index)
        self.phase = "BASE_BRANCHES"
        if commits_allowed:
            self._collect_base_branches(gateway, data)
        self.phase = "PULL_REQUEST_COMMITS"
        if pulls_allowed:
            self._collect_pull_request_commits(gateway, data)
        self.phase = "LOOKUPS"
        if commits_allowed and pulls_allowed:
            self._look_up_pull_requests(gateway, data)
        self.phase = "DETAILS"
        if commits_allowed:
            self._collect_details(gateway, data)

    # 1. 추가 기준 브랜치

    def _collect_base_branches(
        self, gateway: GitHubGateway, data: CollectedData
    ) -> None:
        names = _unique(
            name
            for name in self._options.extra_base_branches
            if name != self.default_branch
        )
        cut = False
        for name in names:
            # 빈 Git 저장소면 커밋 목록 API가 409를 준다. 그 브랜치 커밋도 0건이다. 브랜치가 없다는
            # 404·422 같은 그 밖의 응답은 다른 조회 오류처럼 수집을 멈춘다.
            records, end = self._list_commits(
                gateway,
                partial(self._paths.branch_commits, name),
                self._limits.max_base_branch_commits,
                allow_empty_repository=True,
            )
            complete = not (end.more_beyond_range or end.oversized)
            self._base_lines.append(
                BaseBranchLine(
                    name=name,
                    head=records[0].sha if records else None,
                    commits=tuple(records),
                    complete=complete,
                )
            )
            if not complete and not cut:
                # 뒤에서 수집이 멈춰도 한계가 남게 처음 잘렸을 때 적는다. 브랜치 이름·개수는 넣지
                # 않는다.
                cut = True
                data.limit("COMMIT", _BASE_BRANCH_CUT)

    def _list_commits(
        self,
        gateway: GitHubGateway,
        page_path: PagePath,
        max_items: int,
        *,
        allow_empty_repository: bool = False,
    ) -> tuple[list[CommitRecord], ListingEnd]:
        records: list[CommitRecord] = []

        def take(items: list[object]) -> None:
            records.extend(
                normalize.commit(item, DetailStatus.NOT_REQUESTED) for item in items
            )

        end = list_pages(
            gateway,
            page_path,
            max_items,
            take,
            allow_empty_repository=allow_empty_repository,
        )
        return records, end

    # 2. PR 커밋 목록

    def _collect_pull_request_commits(
        self, gateway: GitHubGateway, data: CollectedData
    ) -> None:
        positions: dict[int, list[int]] = {}
        for index, record in enumerate(data.pull_requests):
            positions.setdefault(record.number, []).append(index)
        for record in pull_request_precedence(data.pull_requests):
            # PR 하나를 다 읽은 뒤에만 그 커밋을 남긴다. 읽는 중 멈추면 그 PR은 NOT_REACHED이고
            # 그 PR에서 본 커밋도 관계 기록에 남기지 않는다(소속 근거가 없는 커밋이 생기지 않게).
            entry, observed = self._read_pull_request_commits(gateway, record)
            self._observe(observed)
            self._pull_commits[record.number] = entry
            for index in positions[record.number]:
                data.pull_requests[index] = _with_commits(
                    data.pull_requests[index], entry
                )

    def _read_pull_request_commits(
        self, gateway: GitHubGateway, record: PullRequestRecord
    ) -> tuple[PullRequestCommits, list[CommitRecord]]:
        """(커밋 목록 관측, 그 목록의 커밋 기록)."""
        records, end = self._list_commits(
            gateway,
            partial(self._paths.pull_request_commits, record.number),
            _CAP,
        )
        if end.oversized:
            # 일부 쪽만 받은 목록은 소속 근거로 쓰지 않는다.
            return (
                PullRequestCommits(
                    record.number,
                    record.head_sha,
                    DetailStatus.OVERSIZED,
                    (),
                    complete=False,
                ),
                [],
            )
        listed = _unique(commit.sha for commit in records)
        if len(records) < _CAP:
            matches = (
                _ends_at(records, record.head_sha)
                if records
                else self._head_adds_no_commits(record)
            )
            if not matches:
                # PR 목록에서 본 머리 커밋이 목록에 없거나 끝이 아니다. 목록을 읽는 동안(또는 PR
                # 목록을 본 뒤) PR이 바뀌어 어느 판본의 목록인지 맞출 수 없다. 쪽마다 다른 판본을
                # 받은 경우도 여기서 걸린다. 소속 근거로 쓰지 않고 다시 부르지 않는다.
                return (
                    PullRequestCommits(
                        record.number,
                        record.head_sha,
                        DetailStatus.REVISION_MISMATCH,
                        (),
                        complete=False,
                    ),
                    [],
                )
            return (
                PullRequestCommits(
                    record.number, record.head_sha, DetailStatus.FETCHED, listed, True
                ),
                records,
            )
        if record.from_fork or record.base_sha is None or "COMMIT" not in self._allowed:
            # 포크의 커밋은 이 저장소 비교로 따라가지 않는다. 비교 API는 커밋 자료라
            # 커밋 조회가 허용된 요청에서만 부른다.
            if record.from_fork:
                reason = _FORK_CAP
            elif record.base_sha is None:
                reason = _NO_BASE_CAP
            else:
                reason = _NO_COMMIT_CAP
            return (
                PullRequestCommits(
                    record.number,
                    record.head_sha,
                    DetailStatus.FETCHED,
                    listed,
                    complete=False,
                    limits=(reason,),
                ),
                records,
            )
        entry, compared = self._compare(gateway, record, record.base_sha, listed)
        return entry, [*records, *compared]

    def _head_adds_no_commits(self, record: PullRequestRecord) -> bool:
        """PR 목록에서 본 머리 커밋이 이미 기준 쪽에 있어 그 판본의 PR 커밋이 0건이다.

        머리 커밋이 PR 응답의 기준 커밋과 같거나, 기본 브랜치를 대상으로 한 PR의 머리 커밋이 기본
        브랜치 목록에 있을 때다(머리를 기준 브랜치로 되돌린 PR 등). 그러면 빈 커밋 목록이 관측한
        판본의 목록과 맞는다. 그 밖의 빈 목록은 판본을 맞출 수 없다.
        """
        return record.head_sha == record.base_sha or (
            record.base_ref == self.default_branch
            and record.head_sha in self._default_positions
        )

    def _compare(
        self,
        gateway: GitHubGateway,
        record: PullRequestRecord,
        base_sha: str,
        listed: tuple[str, ...],
    ) -> tuple[PullRequestCommits, list[CommitRecord]]:
        """250건에 닿은 PR의 전체 커밋을 PR API의 전체 커밋 수와 비교 API로 확인한다.

        판본은 250건 목록의 끝이 아니라 PR API의 머리 커밋과 비교 결과로 확인한다(GitHub가 어느
        250건을 주든 결과가 같게). 비교 범위의 전체 수가 PR의 전체 커밋 수와 같고, 그만큼 다
        받았고, PR 커밋 목록 250건과 관측한 머리 커밋을 모두 담았을 때만 PR 전체로 본다. 비교
        응답 어느 쪽이든 전체 수가 다르거나, 전체 수 전에 끝나거나, 250건이나 머리 커밋을 담지
        않으면 비교 커밋을 하나도 쓰지 않는다(기준 브랜치 커밋이 섞일 수 있다). 비교 쪽수 상한이나
        비교 응답 크기 상한으로 멈췄으면 250건을 모두 담은 데까지만 PR 커밋으로 더한다.
        """
        collected: dict[str, CommitRecord] = {}
        proof = _CompareProof()
        unfinished = self._read_compare(
            gateway, record, base_sha, listed, collected, proof
        )
        if unfinished is None:
            entry = PullRequestCommits(
                record.number,
                record.head_sha,
                DetailStatus.FETCHED,
                tuple(collected),
                complete=True,
                full_list_via_compare=True,
            )
            return proof.stamp(entry, base_sha), list(collected.values())
        reason, partial_ok = unfinished
        trusted = (
            list(collected.values())
            if partial_ok and set(listed) <= collected.keys()
            else []
        )
        entry = PullRequestCommits(
            record.number,
            record.head_sha,
            DetailStatus.FETCHED,
            _unique((*listed, *(commit.sha for commit in trusted))),
            complete=False,
            limits=(reason,),
        )
        return proof.stamp(entry, base_sha), trusted

    def _read_compare(
        self,
        gateway: GitHubGateway,
        record: PullRequestRecord,
        base_sha: str,
        listed: tuple[str, ...],
        collected: dict[str, CommitRecord],
        proof: _CompareProof,
    ) -> tuple[str, bool] | None:
        """다 읽지 못했으면 (이유, 앞쪽에서 모은 비교 커밋을 쓸 수 있는가). None이면 PR 전체를 읽었다.

        비교 커밋을 쓸 수 있는 것은 정해 둔 범위(비교 쪽수 상한, 응답 크기 상한)에 닿았을 때뿐이다.
        수·판본이 어긋났으면 쓰지 않는다. 비교 호출은 다른 조회와 같은 게이트웨이·호출 상한 안에서
        하고, 404·422를 포함한 조회 오류는 다른 호출처럼 수집을 멈춘다. proof에는 받은 근거를 남긴다.
        """
        fetched_pull = gateway.get(self._paths.pull_request(record.number))
        if isinstance(fetched_pull, Oversized):
            return _PULL_OVERSIZED, False
        with reading():
            detail = normalize.pull_request_detail(fetched_pull.data, record.number)
        expected = detail.total_commits
        proof.total_commits = expected
        if detail.head_sha != record.head_sha:
            # PR 목록을 본 뒤 PR이 바뀌었다. 바뀐 PR의 전체 수로 관측한 판본을 확인할 수 없다.
            # 기준 커밋(base.sha)은 판본으로 쓰지 않는다. 비교 결과의 경계는 전체 수로 본다.
            return _PULL_REVISION_CHANGED, False
        if expected < len(listed):
            return _COUNT_MISMATCH, False
        for page in range(1, self._limits.max_compare_pages + 1):
            fetched = gateway.get(
                self._paths.compare(base_sha, record.head_sha, page, MAX_PER_PAGE)
            )
            if isinstance(fetched, Oversized):
                return _COMPARE_OVERSIZED, True
            with reading():
                compared = normalize.comparison(fetched.data)
                page_records = [
                    normalize.commit(item, DetailStatus.NOT_REQUESTED)
                    for item in compared.commits
                ]
            if proof.merge_base is None:
                proof.merge_base = compared.merge_base
            if compared.total_commits != expected:
                # 비교 범위가 PR 범위와 다르다. 앞쪽에서 모은 커밋도 PR 커밋으로 쓰지 않는다.
                return _COMPARE_MISMATCH, False
            for commit in page_records:
                collected.setdefault(commit.sha, commit)
            if len(collected) > expected:
                # 전체 커밋 수보다 많이 왔다. 어느 커밋이 PR 커밋인지 가릴 수 없다.
                return _COMPARE_MISMATCH, False
            if len(collected) == expected:
                # PR 커밋 목록의 커밋이나 관측한 머리 커밋이 빠졌으면 경계나 판본이 서로 다르다.
                if not set(listed) <= collected.keys() or (
                    record.head_sha not in collected
                ):
                    return _COMPARE_MISMATCH, False
                return None
            if not page_records or not fetched.has_next_page:
                # 전체 커밋 수에 닿기 전에 끝났다. 빈 쪽을 끝의 증거로 쓰지 않는다.
                return _COMPARE_MISMATCH, False
        return _compare_pages_limit(self._limits.max_compare_pages), True

    def _observe(self, records: Iterable[CommitRecord]) -> None:
        """기본 브랜치 목록에 없는 커밋을 처음 본 기록으로 남긴다."""
        for record in records:
            if record.sha not in self._default_positions:
                self._extra.setdefault(record.sha, record)

    # 3·4. 로컬 계산과 연결 PR 조회

    def _listed_commits(self) -> list[tuple[str, ...]]:
        return [
            entry.commits
            for entry in self._pull_commits.values()
            if entry.status is DetailStatus.FETCHED
        ]

    def _merge_commit_shas(self, data: CollectedData) -> list[str]:
        """알려진 PR(목록과 연결 PR 조회로 안 PR)의 merge_commit_sha."""
        return [
            record.merge_commit_sha
            for record in (*data.pull_requests, *self._lookup_pulls.values())
            if record.merge_commit_sha is not None
        ]

    def _look_up_pull_requests(
        self, gateway: GitHubGateway, data: CollectedData
    ) -> None:
        targets = lookup_targets(
            data.commits,
            self._account,
            pull_request_commits=self._listed_commits(),
            merge_commit_shas=self._merge_commit_shas(data),
        )
        # 전체를 먼저 계획해 둔다. 멈추면 닿지 못한 대상을 NOT_REACHED로 남긴다.
        self._planned_lookups.extend(targets)
        for sha in targets:
            self._look_up(gateway, sha, data)
        self._plan_merge_lookups(data)
        for sha in self._planned_lookups[len(targets) :]:
            self._look_up(gateway, sha, data)
        first_parents = {
            record.sha: record.parents[0] for record in data.commits if record.parents
        }
        for merge in self._planned_boundaries:
            self._boundaries[merge] = self._read_boundary(
                gateway, merge, first_parents[merge]
            )

    def _plan_merge_lookups(self, data: CollectedData) -> None:
        """PR 밖으로 확인된(멈췄으면 확인하지 못한) 본인 커밋을 들인 병합 후보를 계획한다.

        그 가운데 첫 부모 쪽 조상이 창 밖으로 열린 병합은 경계 비교도 계획한다. 창이 저장소의 모든
        이력을 담았으면 열린 병합이 없어 부르지 않는다.
        """
        if self._merge_lookups_planned:
            return
        self._merge_lookups_planned = True
        outside = frozenset(
            sha
            for sha in self._planned_lookups
            if sha not in self._associated
            or self._associated[sha].status is Lookup.EMPTY
        )
        merges = merge_lookup_targets(
            data.commits,
            pull_request_commits=self._listed_commits(),
            merge_commit_shas=self._merge_commit_shas(data),
            base_lines=self._base_lines,
            outside=outside,
        )
        self._planned_lookups.extend(
            sha for sha in merges if sha not in self._planned_lookups
        )
        graph = WindowGraph.of(data.commits)
        self._planned_boundaries.extend(
            merge for merge in merges if graph.brought_in(merge).first_side_open
        )

    def _read_boundary(
        self, gateway: GitHubGateway, merge: str, first: str
    ) -> MergeBoundary:
        """첫 부모...병합 비교로 병합이 실제로 들인 커밋을 받는다. 쪽수 상한까지 부르고 다시 부르지 않는다.

        첫 부모는 병합의 조상이라 비교 범위는 병합이 들인 커밋과 병합 커밋 자신이다. 비교 범위의
        전체 수만큼 다 받았고, 병합 커밋이 들어 있고, 시작 커밋이 첫 부모일 때만 다 읽은 것으로
        본다. 쪽마다 전체 수가 다르거나, 전체 수보다 많거나, 전체 수 전에 끝났으면(빈 쪽 포함)
        경계를 확인하지 못한 것이다. 쪽수 상한·응답 크기 상한도 그렇다. 호출은 다른 조회와 같은
        게이트웨이·호출 상한 안에서 하고, 404·422를 포함한 조회 오류는 다른 호출처럼 수집을 멈춘다.
        """
        collected: dict[str, None] = {}
        total: int | None = None

        def unfinished(status: DetailStatus = DetailStatus.FETCHED) -> MergeBoundary:
            return MergeBoundary(merge, tuple(collected), False, status)

        for page in range(1, self._limits.max_compare_pages + 1):
            fetched = gateway.get(self._paths.compare(first, merge, page, MAX_PER_PAGE))
            if isinstance(fetched, Oversized):
                return unfinished(DetailStatus.OVERSIZED)
            with reading():
                compared = normalize.comparison(fetched.data)
                shas = [
                    normalize.commit(item, DetailStatus.NOT_REQUESTED).sha
                    for item in compared.commits
                ]
            if total is None:
                total = compared.total_commits
            collected.update(dict.fromkeys(shas))
            if (
                compared.total_commits != total
                or compared.merge_base not in (None, first)
                or len(collected) > total
            ):
                return unfinished()
            if len(collected) == total:
                return MergeBoundary(
                    merge, tuple(collected), merge in collected, DetailStatus.FETCHED
                )
            if not shas or not fetched.has_next_page:
                # 전체 수에 닿기 전에 끝났다. 빈 쪽을 끝의 증거로 쓰지 않는다.
                return unfinished()
        return unfinished()

    def _look_up(self, gateway: GitHubGateway, sha: str, data: CollectedData) -> None:
        """커밋 하나의 연결 PR을 한 쪽만 조회한다. 조회 오류(409·422 포함)는 수집을 멈춘다."""
        items: list[object] = []
        end = list_pages(
            gateway,
            partial(self._paths.commit_pulls, sha),
            MAX_PER_PAGE,
            items.extend,
        )
        if end.oversized:
            self._associated[sha] = AssociatedPulls(sha, Lookup.LIMITED)
            return
        with reading():
            found = normalize.associated_pull_requests(items, self._paths.repository)
        records = found.records
        listed = {record.number for record in data.pull_requests}
        for record in records:
            if record.number not in listed:
                self._lookup_pulls.setdefault(
                    record.number,
                    replace(record, commits_status=DetailStatus.BEYOND_RANGE),
                )
        if end.more_beyond_range or found.unknown_base:
            # 다음 쪽이나 기준 저장소를 알 수 없는 PR에 이 저장소 PR이 있을 수 있다.
            status = Lookup.LIMITED
        else:
            status = Lookup.FOUND if records else Lookup.EMPTY
        self._associated[sha] = AssociatedPulls(
            sha,
            status,
            _unique(record.number for record in records),
            found.foreign,
            found.unknown_base,
        )

    # 5. 변경 내용

    def _commit_index(self, data: CollectedData) -> dict[str, CommitRecord]:
        index: dict[str, CommitRecord] = {}
        for record in data.commits:
            index.setdefault(record.sha, record)
        index.update(self._extra)
        return index

    def _own(self, record: CommitRecord) -> bool:
        return self._account.same_account(record.author)

    def _collect_details(self, gateway: GitHubGateway, data: CollectedData) -> None:
        index = self._commit_index(data)
        needed = self._needed_details(data, index)
        planned = set(needed)
        unit_first = tuple(
            sha for sha in self._unit_first_details(index) if sha not in planned
        )
        planned.update(unit_first)
        if "PULL_REQUEST" in self._allowed:
            outside_shas = [
                sha
                for sha in self._planned_lookups
                if sha in self._associated
                and self._associated[sha].status is Lookup.EMPTY
            ]
        else:
            # PR 조회가 허용되지 않으면 기본 브랜치의 본인 커밋을 모두 PR 밖으로 다룬다.
            outside_shas = [record.sha for record in data.commits]
        outside = tuple(
            record.sha
            for record in newest_first(
                index[sha]
                for sha in _unique(outside_shas)
                if sha in index
                and sha not in planned
                and self._own(index[sha])
                and not is_merge(index[sha])
            )
        )
        planned.update(outside)
        evidence = tuple(
            record.sha
            for record in newest_first(
                record
                for record in index.values()
                if record.sha not in planned
                and self._own(record)
                and not is_merge(record)
            )
        )
        self._tiers = DetailTiers(
            needed=needed,
            unit_first=unit_first,
            outside_pull_requests=outside,
            evidence=evidence,
        )
        fetched = 0
        for sha in needed:
            fetched += self._fetch_detail(gateway, sha, data)
        # 같은 변경 비교에 필요한 조회라 필수 조회처럼 여유 검사 없이 부른다. 상세 조회 개수에는
        # 세지 않는다(호출 수·시간·총량 상한에는 든다).
        self._planned_modes = self._mode_targets(data, stopped=False)
        for sha in self._planned_modes:
            self._modes[sha] = self._fetch_modes(gateway, sha, data)
        skipped = False
        for sha in (*unit_first, *outside, *evidence):
            record = self._record(sha, data)
            if record.changes_status is not DetailStatus.NOT_REQUESTED:
                continue
            if fetched < self._limits.max_commit_details:
                # 마감이 이미 지났으면 건너뛰지 않고 시간 상한 실패로 멈춘다. 마감 전의 여유
                # 부족만 아래에서 조회 범위의 한계로 둔다.
                gateway.raise_if_time_exhausted()
                if self._room(gateway):
                    fetched += self._fetch_detail(gateway, sha, data)
                    continue
            # 조회 개수 범위의 한계다. 수집 실패가 아니다.
            self._store(replace(record, changes_status=DetailStatus.BEYOND_RANGE), data)
            if not skipped:
                # 뒤에서 수집이 멈춰도 한계가 남게 처음 건너뛸 때 적는다.
                skipped = True
                data.limit(
                    "COMMIT", _skipped_details_limit(self._limits.max_commit_details)
                )

    def _unit_first_details(self, index: dict[str, CommitRecord]) -> tuple[str, ...]:
        """단위마다 먼저 변경 내용을 받을 기여 커밋 하나(최근 것부터).

        받은 PR 커밋 목록마다 그 목록의 가장 최근 본인 병합 아닌 커밋을 고른다. 연결 PR 조회가
        이 저장소 PR을 돌려준 커밋은 그 PR마다 가장 최근 본인 커밋을 고른다. 다만 목록에서 이미
        골랐거나, 커밋 목록을 끝까지 받아 목록의 원래 커밋만 기여 근거가 되는 PR은 고르지 않는다.
        단위의 가장 최근 커밋이 필수 조회에 들었으면 부르는 쪽이 빼며, 그 단위에서 다른 커밋을
        고르지 않는다.
        """

        def newest_own(shas: Iterable[str]) -> str | None:
            own = newest_first(
                index[sha]
                for sha in shas
                if sha in index and self._own(index[sha]) and not is_merge(index[sha])
            )
            return own[0].sha if own else None

        chosen: list[str] = []
        covered: set[int] = set()
        for number, entry in self._pull_commits.items():
            if entry.status is not DetailStatus.FETCHED:
                continue
            first = newest_own(entry.commits)
            if first is not None:
                chosen.append(first)
                covered.add(number)
            elif entry.complete:
                covered.add(number)
        found: dict[int, list[str]] = {}
        for sha in self._planned_lookups:
            lookup = self._associated.get(sha)
            if lookup is None or lookup.status is not Lookup.FOUND:
                continue
            for number in lookup.pull_requests:
                if number not in covered:
                    found.setdefault(number, []).append(sha)
        for shas in found.values():
            first = newest_own(shas)
            if first is not None:
                chosen.append(first)
        return tuple(
            record.sha for record in newest_first(index[sha] for sha in _unique(chosen))
        )

    def _needed_details(
        self, data: CollectedData, index: dict[str, CommitRecord]
    ) -> tuple[str, ...]:
        """필수 조회: 관계 근거가 있는 쌍의 양쪽, 나눌 수 있어 보이는 단위의 커밋."""
        needed: dict[str, None] = {}

        def add(shas: Iterable[str]) -> None:
            for sha in shas:
                if sha in index and not is_merge(index[sha]):
                    needed.setdefault(sha)

        lists = {
            number: entry.commits
            for number, entry in self._pull_commits.items()
            if entry.status is DetailStatus.FETCHED
        }
        pulls = [
            record
            for record in pull_request_precedence(data.pull_requests)
            if record.number in lists
        ]
        for old in pulls:
            for new in pulls:
                if old.number != new.number and self._is_resubmission(old, new):
                    add(lists[old.number])
                    add(lists[new.number])
        for record in index.values():
            if is_merge(record):
                continue
            for source in sorted(_cherry_pick_sources(record.message)):
                if source != record.sha and source in index:
                    add((source, record.sha))
        issue_numbers = {issue.number for issue in data.issues}
        if "ISSUE" in self._allowed and issue_numbers:
            for unit in (*lists.values(), *self._merge_units(data)):
                referenced: set[int] = set()
                for sha in unit:
                    if sha in index and self._own(index[sha]):
                        referenced |= _issue_references(index[sha].message)
                # 단위 나누기는 단위의 모든 변경 파일이 있어야 하므로 다른 계정 커밋도 함께 본다.
                if len(referenced & issue_numbers) >= 2:
                    add(unit)
        return tuple(needed)

    def _merge_units(self, data: CollectedData) -> list[tuple[str, ...]]:
        """PR 없는 병합 후보마다, 들인 커밋 가운데 PR로 설명되지 않은 것.

        들인 커밋은 후보 처리와 같은 정의(흡수 병합이 들인 커밋을 빼고, 경계 비교를 받았으면 그
        결과)로 센다. 추가 기준 브랜치 사슬이 잘려 흡수 여부를 모르거나 첫 부모 쪽 경계를 확인하지
        못한 병합은 후보 처리가 단위로 확정하지 않으므로 나누기에 쓸 변경 내용도 계획하지 않는다.
        """
        graph = WindowGraph.of(data.commits)
        if graph.head is None:
            return []
        merges = pull_request_less_merges(
            graph,
            pull_request_commits=self._listed_commits(),
            merge_commit_shas=self._merge_commit_shas(data),
            base_lines=self._base_lines,
        )
        pulls_allowed = "PULL_REQUEST" in self._allowed
        units: list[tuple[str, ...]] = []
        for merge in merges.candidates:
            lookup = self._associated.get(merge)
            if pulls_allowed and (lookup is None or lookup.status is not Lookup.EMPTY):
                continue
            if merges.base_lines_cut and merge not in graph.mainline:
                continue
            seen = merges.brought_in(graph, merge, self._boundaries.get(merge))
            if seen.first_side_open and not seen.complete:
                continue
            brought = seen.commits
            units.append(
                tuple(
                    sha
                    for sha in graph.order
                    if sha in brought
                    and sha not in merges.explained
                    and (
                        sha not in self._associated
                        or self._associated[sha].status is Lookup.EMPTY
                    )
                )
            )
        return units

    def _relation_pairs(
        self, data: CollectedData, index: Mapping[str, CommitRecord]
    ) -> list[tuple[str, str]]:
        """관계 근거가 있는 병합 아닌 커밋 쌍(앞쪽, 뒤쪽): 재제출한 두 PR의 커밋, cherry-pick 표시.

        후보 처리의 관계 근거와 같은 정의다. 재제출은 커밋 목록을 받은 PR끼리만 본다.
        """
        pairs: list[tuple[str, str]] = []

        def changes(shas: Iterable[str]) -> list[str]:
            return [sha for sha in shas if sha in index and not is_merge(index[sha])]

        lists = {
            number: entry.commits
            for number, entry in self._pull_commits.items()
            if entry.status is DetailStatus.FETCHED
        }
        pulls = [
            record
            for record in pull_request_precedence(data.pull_requests)
            if record.number in lists
        ]
        for old in pulls:
            for new in pulls:
                if old.number != new.number and self._is_resubmission(old, new):
                    later = changes(lists[new.number])
                    pairs.extend(
                        (each, other)
                        for each in changes(lists[old.number])
                        for other in later
                    )
        for record in index.values():
            if is_merge(record):
                continue
            for source in sorted(_cherry_pick_sources(record.message)):
                if source != record.sha and changes((source,)):
                    pairs.append((source, record.sha))
        return pairs

    def _mode_targets(self, data: CollectedData, *, stopped: bool) -> tuple[str, ...]:
        """파일 모드를 확인할 커밋: 관계 근거가 있고 모드 없이 만든 diff 값이 같은 쌍의 양쪽.

        stopped면 필수 상세를 다 받기 전에 수집이 멈춘 때다. 이때는 상대 커밋의 변경 내용을 받지
        못한 쌍도, 받은 쪽은 끝까지 수집했다면 확인했을 수 있으므로 넣는다(부르지 않는다).
        """
        index = self._commit_index(data)
        values: dict[str, str | None] = {}

        def value(sha: str) -> str | None:
            if sha not in values:
                values[sha] = _content_patch_id(index[sha])
            return values[sha]

        def unreached(sha: str) -> bool:
            record = index[sha]
            return record.changes is None and record.changes_status in (
                DetailStatus.NOT_REACHED,
                DetailStatus.NOT_REQUESTED,
            )

        targets: dict[str, None] = {}
        for earlier, later in self._relation_pairs(data, index):
            first, second = value(earlier), value(later)
            if first is not None and first == second:
                targets.setdefault(earlier)
                targets.setdefault(later)
            elif stopped:
                if first is not None and unreached(later):
                    targets.setdefault(earlier)
                if second is not None and unreached(earlier):
                    targets.setdefault(later)
        return tuple(targets)

    def _fetch_modes(
        self, gateway: GitHubGateway, sha: str, data: CollectedData
    ) -> ModeCheck:
        """커밋 하나를 diff 형식으로 받아 파일 모드 줄을 커밋 기록에 넣는다. 다시 부르지 않는다.

        응답이 크기 상한을 넘었거나 diff의 파일을 변경 파일 목록과 모두 맞추지 못하면 모드를 넣지
        않는다(비교할 수 없음). 오류 응답은 다른 호출처럼 수집을 멈춘다.
        """
        record = self._record(sha, data)
        changes = record.changes
        if changes is None:
            raise ValueError("변경 내용을 받은 커밋만 모드를 확인한다")
        body = gateway.get_diff(self._paths.commit(sha))
        if isinstance(body, Oversized):
            return ModeCheck(sha, DetailStatus.OVERSIZED)
        modes = normalize.diff_file_modes(body)
        paths = [entry.path for entry in changes.files]
        if modes is None or len(set(paths)) != len(paths) or set(paths) != set(modes):
            return ModeCheck(sha, DetailStatus.FETCHED)
        files = tuple(
            replace(entry, mode_lines=modes[entry.path]) for entry in changes.files
        )
        self._store(replace(record, changes=replace(changes, files=files)), data)
        return ModeCheck(sha, DetailStatus.FETCHED, matched=True)

    def _room(self, gateway: GitHubGateway) -> bool:
        """선택적 상세를 하나 더 불러도 호출 수·총량 상한에 걸리지 않고 수집 시간에 여유가 남는가.

        호출 하나는 연결·응답 대기의 합보다 오래 걸릴 수 있다(주소 확인, 여러 주소로 연결 시도, TLS
        연결). 그래서 남은 시간이 그 합의 두 배보다 길 때만 부른다. 이것은 여유일 뿐 보장이 아니다.
        네트워크가 느리거나 어느 호출이든 오류·시간 초과로 끝나면 다른 호출처럼 수집이 멈추고 다시
        부르지 않는다. 남은 시간은 실제 시계로 잰다. 그래서 같은 응답이라도 앞 호출이 오래 걸렸으면
        선택 조회를 덜 받는다.
        """
        call_wait = self._limits.connect_timeout + self._limits.read_timeout
        return (
            gateway.remaining_calls() > 0
            and gateway.remaining_seconds() > 2 * call_wait
            and gateway.remaining_bytes() > self._limits.max_response_bytes
        )

    def _record(self, sha: str, data: CollectedData) -> CommitRecord:
        if sha in self._extra:
            return self._extra[sha]
        return data.commits[self._default_positions[sha][0]]

    def _store(self, record: CommitRecord, data: CollectedData) -> None:
        if record.sha in self._extra:
            self._extra[record.sha] = record
            return
        for index in self._default_positions[record.sha]:
            data.commits[index] = record

    def _fetch_detail(
        self, gateway: GitHubGateway, sha: str, data: CollectedData
    ) -> int:
        """변경 내용 하나를 조회하고 부른 호출 수(0·1)를 돌려준다. 이미 받은 것은 다시 부르지 않는다."""
        record = self._record(sha, data)
        if record.changes_status in (DetailStatus.FETCHED, DetailStatus.OVERSIZED):
            return 0
        fetched = gateway.get(self._paths.commit(sha))
        if isinstance(fetched, Oversized):
            self._store(replace(record, changes_status=DetailStatus.OVERSIZED), data)
            return 1
        with reading():
            changes = normalize.commit_changes(
                fetched.data, sha, files_truncated=fetched.has_next_page
            )
        self._store(
            replace(record, changes=changes, changes_status=DetailStatus.FETCHED), data
        )
        return 1

    # 멈춤과 결과

    def stopped(self, data: CollectedData) -> None:
        """멈춘 단계를 남기고, 조회하려 했으나 닿지 못한 것을 NOT_REACHED로 바꾼다."""
        self._stopped_during = self.phase
        if self.phase == "LOOKUPS":
            self._plan_merge_lookups(data)
        for index, pull in enumerate(data.pull_requests):
            if (
                pull.number not in self._pull_commits
                and pull.commits_status is DetailStatus.NOT_REQUESTED
            ):
                data.pull_requests[index] = replace(
                    pull, commits_status=DetailStatus.NOT_REACHED
                )
        if "COMMIT" not in self._allowed:
            # 커밋 상세는 원래 조회하지 않는다.
            return
        tiers = self._tiers
        planned = {
            *tiers.needed,
            *tiers.unit_first,
            *tiers.outside_pull_requests,
            *tiers.evidence,
        }

        def unreached(record: CommitRecord) -> bool:
            return record.changes_status is DetailStatus.NOT_REQUESTED and (
                record.sha in planned or (self._own(record) and not is_merge(record))
            )

        for index, record in enumerate(data.commits):
            if unreached(record):
                data.commits[index] = replace(
                    record, changes_status=DetailStatus.NOT_REACHED
                )
        for sha, record in list(self._extra.items()):
            if unreached(record):
                self._extra[sha] = replace(
                    record, changes_status=DetailStatus.NOT_REACHED
                )
        if self.phase == "DETAILS" and self._planned_modes is None:
            # 필수 상세를 다 받기 전에 멈췄다. 받은 변경 내용으로 모드 확인이 필요했을 커밋을 정한다.
            self._planned_modes = self._mode_targets(data, stopped=True)

    @property
    def stopped_during(self) -> Phase | None:
        return self._stopped_during

    def observations(self, data: CollectedData) -> RelationObservations:
        entries = [
            self._pull_commits.get(record.number)
            or PullRequestCommits(
                record.number,
                record.head_sha,
                DetailStatus.NOT_REACHED,
                (),
                complete=False,
            )
            for record in pull_request_precedence(data.pull_requests)
        ]
        entries.extend(
            PullRequestCommits(
                record.number,
                record.head_sha,
                DetailStatus.BEYOND_RANGE,
                (),
                complete=False,
            )
            for record in self._lookup_pulls.values()
        )
        return RelationObservations(
            default_branch=self.default_branch,
            pull_request_commits=tuple(entries),
            pull_requests_from_lookups=tuple(self._lookup_pulls.values()),
            associated=tuple(
                self._associated.get(sha) or AssociatedPulls(sha, Lookup.NOT_REACHED)
                for sha in self._planned_lookups
            ),
            commits=tuple(self._extra.values()),
            base_branches=tuple(self._base_lines),
            merge_boundaries=tuple(
                self._boundaries.get(merge)
                or MergeBoundary(merge, (), False, DetailStatus.NOT_REACHED)
                for merge in self._planned_boundaries
            ),
            detail_tiers=self._tiers,
            mode_checks=tuple(
                self._modes.get(sha) or ModeCheck(sha, DetailStatus.NOT_REACHED)
                for sha in self._planned_modes or ()
            ),
            stopped_during=self._stopped_during,
        )
