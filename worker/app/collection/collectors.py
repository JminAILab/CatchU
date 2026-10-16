"""허용된 자료 종류별 수집 단계.

모든 호출은 게이트웨이를 거친다. 목록은 조회 개수 범위까지만 보고, 범위 밖이 남았거나
단일 응답 크기 상한으로 버린 부분은 한계(coverage limit)로 남긴다. 관계 조회를 요청하지 않은
기본 경로(#117)에서는 연동 계정이 작성자로 기록된(PR은 연동 계정이 연) 최근 기록의 상세를 상세
조회 개수만큼만 조회한다. 관계 조회를 요청하면 이 상세 단계 대신 relations.py가 목록 뒤의 조회를
한다. 받은 쪽은 곧바로 `CollectedData`에 넣으므로 수집이 멈춰도(CollectionStopped) 그때까지 모은
것은 남는다.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from functools import partial
from typing import Protocol

from app.collection import normalize
from app.collection.api_paths import MAX_PER_PAGE, ApiPath, RepositoryPaths
from app.collection.failures import CollectionStopped, FailureCode, stop
from app.collection.gateway import GitHubGateway, Oversized
from app.collection.identifiers import GitHubAccount
from app.collection.limits import CollectionLimits
from app.collection.normalize import MalformedResponse
from app.collection.records import (
    CommitRecord,
    CoverageLimit,
    DetailStatus,
    IssueRecord,
    PullRequestRecord,
    ResourceType,
)

# PR 커밋 목록 API가 돌려주는 최대 커밋 수(GitHub REST 문서).
PULL_REQUEST_COMMITS_API_CAP = 250

PagePath = Callable[[int, int], ApiPath]


@dataclass
class CollectedData:
    commits: list[CommitRecord] = field(default_factory=list)
    pull_requests: list[PullRequestRecord] = field(default_factory=list)
    issues: list[IssueRecord] = field(default_factory=list)
    coverage_limits: list[CoverageLimit] = field(default_factory=list)

    def limit(self, resource_type: ResourceType, message: str) -> None:
        self.coverage_limits.append(CoverageLimit(resource_type, message))

    def count(self, resource_type: ResourceType) -> int:
        if resource_type == "COMMIT":
            return len(self.commits)
        if resource_type == "PULL_REQUEST":
            return len(self.pull_requests)
        return len(self.issues)


@dataclass(frozen=True)
class ListingEnd:
    # 조회 개수 범위 밖에 항목이 더 있다.
    more_beyond_range: bool
    # 한 쪽이 단일 응답 크기 상한을 넘어 그 쪽부터 뒤를 보지 못했다.
    oversized: bool


def _malformed() -> CollectionStopped:
    return stop(
        FailureCode.COLLECTION_FETCH_FAILED,
        "GitHub 응답이 예상한 모양이 아니라 수집을 멈췄다",
    )


@contextmanager
def reading() -> Iterator[None]:
    """응답 모양이 어긋나면 수집 실패로 멈춘다."""
    try:
        yield
    except MalformedResponse:
        raise _malformed() from None


def list_pages(
    gateway: GitHubGateway,
    page_path: PagePath,
    max_items: int,
    take: Callable[[list[object]], None],
    *,
    allow_empty_repository: bool = False,
) -> ListingEnd:
    """쪽 번호를 F가 올리며 최대 max_items개까지 읽고, 받은 쪽마다 take에 넘긴다.

    allow_empty_repository면 첫 쪽의 빈 Git 저장소 응답을 0건으로 받는다. 앞쪽에 항목이
    있었다면 빈 저장소가 아니므로 둘째 쪽부터는 받지 않는다.
    """
    per_page = min(MAX_PER_PAGE, max_items)
    seen = 0
    page = 1
    while True:
        fetched = gateway.get(
            page_path(page, per_page),
            allow_empty_repository=allow_empty_repository and page == 1,
        )
        if isinstance(fetched, Oversized):
            return ListingEnd(more_beyond_range=False, oversized=True)
        room = max_items - seen
        with reading():
            batch = normalize.as_list(fetched.data)
            take(batch[:room])
        seen += min(len(batch), room)
        ended = len(batch) < per_page or not fetched.has_next_page
        if ended or len(batch) >= room:
            more = len(batch) > room or (not ended and len(batch) == room)
            return ListingEnd(more_beyond_range=more, oversized=False)
        page += 1


def verify_repository(
    gateway: GitHubGateway,
    paths: RepositoryPaths,
    *,
    read_default_branch: bool = False,
) -> str | None:
    """대상 저장소에 접근되고, 응답이 요청한 공개 저장소인지 확인한다.

    read_default_branch면 기존 확인을 모두 통과한 뒤 기본 브랜치 이름을 읽어 돌려준다(관계
    조회만 쓴다). 아니면 그 값을 읽지 않아 그 값 때문에 멈추는 일이 없다.
    """
    fetched = gateway.get(paths.metadata())
    if isinstance(fetched, Oversized):
        raise stop(
            FailureCode.COLLECTION_FETCH_FAILED,
            "저장소 확인 응답이 크기 상한을 넘어 수집을 멈췄다",
        )
    with reading():
        full_name = normalize.repository_full_name(fetched.data)
    if not paths.repository.same_as(full_name):
        raise stop(
            FailureCode.SCOPE_INCONSISTENT,
            "GitHub가 요청한 저장소가 아닌 저장소를 돌려줘 수집을 멈췄다",
        )
    with reading():
        public = normalize.repository_is_public(fetched.data)
    if not public:
        # 수집 대상은 공개 저장소뿐이다. 토큰으로 접근된다고 비공개 자료를 모으지 않는다.
        # 비공개 읽기 권한이 없는 토큰이 받을 404와 같은 코드로 둔다.
        raise stop(
            FailureCode.REPOSITORY_UNREACHABLE,
            "공개 저장소가 아니어서 자료를 조회하지 않고 수집을 멈췄다",
        )
    if not read_default_branch:
        return None
    with reading():
        default_branch = normalize.repository_default_branch(fetched.data)
    return default_branch


class Collector(Protocol):
    """자료 종류 하나의 수집. 모든 종류의 목록을 본 뒤 상세를 조회한다."""

    @property
    def resource_type(self) -> ResourceType: ...

    def collect_list(self, gateway: GitHubGateway, data: CollectedData) -> None: ...

    def collect_details(self, gateway: GitHubGateway, data: CollectedData) -> None: ...


class _DetailRange:
    """연동 계정 기록 가운데 상세를 조회할 최근 기록 수를 센다(목록은 최근 것부터 온다).

    mark_details가 거짓이면 모든 기록을 NOT_REQUESTED로 두고 범위를 세지 않는다. 그때는
    관계 조회(`relations.py`)가 어떤 상세를 조회할지 정한다.
    """

    def __init__(self, limit: int, *, mark_details: bool = True) -> None:
        self._left = limit
        self._mark = mark_details
        self.exceeded = False

    def status_for(self, own: bool) -> DetailStatus:
        if not own or not self._mark:
            return DetailStatus.NOT_REQUESTED
        if self._left == 0:
            self.exceeded = True
            return DetailStatus.BEYOND_RANGE
        self._left -= 1
        # 상세를 조회하기 전이다. 수집이 멈추면 이 상태로 남는다.
        return DetailStatus.NOT_REACHED


class CommitCollector:
    """기본 브랜치의 최근 커밋과, 연동 계정이 작성자로 기록된 최근 커밋의 변경 내용."""

    resource_type: ResourceType = "COMMIT"

    def __init__(
        self,
        paths: RepositoryPaths,
        account: GitHubAccount,
        limits: CollectionLimits,
        *,
        mark_details: bool = True,
    ) -> None:
        self._paths = paths
        self._account = account
        self._limits = limits
        self._mark_details = mark_details

    def collect_list(self, gateway: GitHubGateway, data: CollectedData) -> None:
        details = _DetailRange(
            self._limits.max_commit_details, mark_details=self._mark_details
        )

        def take(items: list[object]) -> None:
            for item in items:
                record = normalize.commit(item, DetailStatus.NOT_REQUESTED)
                status = details.status_for(self._account.same_account(record.author))
                data.commits.append(replace(record, changes_status=status))

        # 빈 Git 저장소면 GitHub는 커밋 목록에 409를 준다. 커밋 0건이며 다른 종류는 계속 본다.
        end = list_pages(
            gateway,
            self._paths.commits,
            self._limits.max_commits,
            take,
            allow_empty_repository=True,
        )
        if end.more_beyond_range:
            data.limit(
                "COMMIT",
                f"기본 브랜치의 최근 커밋 {self._limits.max_commits}건까지만 조회했다",
            )
        if end.oversized:
            data.limit(
                "COMMIT",
                "커밋 목록 응답이 크기 상한을 넘어 그 쪽부터 뒤 커밋은 확인하지 못했다",
            )
        if details.exceeded:
            data.limit(
                "COMMIT",
                f"연동 계정이 작성자로 기록된 최근 커밋 {self._limits.max_commit_details}건 "
                "밖은 변경 내용을 조회하지 않았다",
            )

    def collect_details(self, gateway: GitHubGateway, data: CollectedData) -> None:
        for index, record in enumerate(data.commits):
            if record.changes_status is not DetailStatus.NOT_REACHED:
                continue
            fetched = gateway.get(self._paths.commit(record.sha))
            if isinstance(fetched, Oversized):
                data.commits[index] = replace(
                    record, changes_status=DetailStatus.OVERSIZED
                )
                continue
            with reading():
                changes = normalize.commit_changes(
                    fetched.data, record.sha, files_truncated=fetched.has_next_page
                )
            data.commits[index] = replace(
                record, changes=changes, changes_status=DetailStatus.FETCHED
            )


class PullRequestCollector:
    """최근 PR과, 연동 계정이 연 최근 PR의 커밋 목록."""

    resource_type: ResourceType = "PULL_REQUEST"

    def __init__(
        self,
        paths: RepositoryPaths,
        account: GitHubAccount,
        limits: CollectionLimits,
        *,
        mark_details: bool = True,
    ) -> None:
        self._paths = paths
        self._account = account
        self._limits = limits
        self._mark_details = mark_details

    def collect_list(self, gateway: GitHubGateway, data: CollectedData) -> None:
        details = _DetailRange(
            self._limits.max_pull_request_commit_lists,
            mark_details=self._mark_details,
        )

        def take(items: list[object]) -> None:
            for item in items:
                record = normalize.pull_request(
                    item, self._paths.repository, DetailStatus.NOT_REQUESTED
                )
                status = details.status_for(self._account.same_account(record.author))
                data.pull_requests.append(replace(record, commits_status=status))

        end = list_pages(
            gateway, self._paths.pull_requests, self._limits.max_pull_requests, take
        )
        if end.more_beyond_range:
            data.limit(
                "PULL_REQUEST",
                f"최근 PR {self._limits.max_pull_requests}건까지만 조회했다",
            )
        if end.oversized:
            data.limit(
                "PULL_REQUEST",
                "PR 목록 응답이 크기 상한을 넘어 그 쪽부터 뒤 PR은 확인하지 못했다",
            )
        if details.exceeded:
            data.limit(
                "PULL_REQUEST",
                f"연동 계정이 연 최근 PR {self._limits.max_pull_request_commit_lists}건 "
                "밖은 커밋 목록을 조회하지 않았다",
            )

    def collect_details(self, gateway: GitHubGateway, data: CollectedData) -> None:
        for index, record in enumerate(data.pull_requests):
            if record.commits_status is not DetailStatus.NOT_REACHED:
                continue
            shas = self._commits_of(gateway, record.number)
            if shas is None:
                data.pull_requests[index] = replace(
                    record, commits_status=DetailStatus.OVERSIZED
                )
                continue
            data.pull_requests[index] = replace(
                record,
                commits=shas,
                commits_status=DetailStatus.FETCHED,
                commits_truncated=len(shas) >= PULL_REQUEST_COMMITS_API_CAP,
            )

    def _commits_of(
        self, gateway: GitHubGateway, number: int
    ) -> tuple[str, ...] | None:
        """PR 하나의 커밋 SHA. 응답 크기 상한을 넘으면 None."""
        shas: list[str] = []
        end = list_pages(
            gateway,
            partial(self._paths.pull_request_commits, number),
            PULL_REQUEST_COMMITS_API_CAP,
            lambda items: shas.extend(normalize.commit_shas(items)),
        )
        return None if end.oversized else tuple(shas)


class IssueCollector:
    """최근 이슈. 이슈 목록 API가 섞어 준 PR 항목은 버린다.

    PR은 PR이 허용됐을 때 PR 목록으로만 본다.
    """

    resource_type: ResourceType = "ISSUE"

    def __init__(self, paths: RepositoryPaths, limits: CollectionLimits) -> None:
        self._paths = paths
        self._limits = limits

    def collect_list(self, gateway: GitHubGateway, data: CollectedData) -> None:
        def take(items: list[object]) -> None:
            data.issues.extend(
                normalize.issue(item)
                for item in items
                if not normalize.is_pull_request_item(item)
            )

        end = list_pages(
            gateway, self._paths.issues, self._limits.max_issue_items, take
        )
        if end.more_beyond_range:
            data.limit(
                "ISSUE",
                f"이슈 목록 API의 최근 항목 {self._limits.max_issue_items}건"
                "(PR 포함)까지만 조회했다",
            )
        if end.oversized:
            data.limit(
                "ISSUE",
                "이슈 목록 응답이 크기 상한을 넘어 그 쪽부터 뒤 이슈는 확인하지 못했다",
            )

    def collect_details(self, gateway: GitHubGateway, data: CollectedData) -> None:
        # 이슈는 목록만 본다.
        return None
