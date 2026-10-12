"""수집한 GitHub 기록의 정규화된 모양.

GitHub 응답 원문은 담지 않고 필요한 값만 남긴다. 제목·본문·커밋 메시지·변경 내용은 이후
후보·생성 단계가 쓰는 자료이며 지시로 해석하지 않는다. 작성자는 GitHub가 준 계정만 남기고
git 작성자 이름·이메일은 남기지 않는다. 작업 적합성·본인 기여의 판정은 후보 처리(#118)가 한다.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Literal

from app.collection.identifiers import GitHubAccount, normalize_sha, require_number

ResourceType = Literal["COMMIT", "PULL_REQUEST", "ISSUE"]
RESOURCE_TYPES: tuple[ResourceType, ...] = ("COMMIT", "PULL_REQUEST", "ISSUE")


class DetailStatus(StrEnum):
    """목록 뒤에 따로 조회하는 상세(커밋 변경 내용, PR 커밋 목록)의 상태.

    관계 조회(#118)에서는 뜻이 조금 넓다. 연동 계정 커밋이라도 병합 커밋과 커밋 조회가 허용되지
    않은 요청의 커밋은 NOT_REQUESTED로 둔다. 선택 조회를 상세 조회 개수나 남은 호출·시간·총량
    여유 때문에 건너뛴 커밋, 최근 PR 목록 밖에서 연결 PR로만 안 PR의 커밋 목록은 BEYOND_RANGE다.
    병합 경계 비교와 파일 모드 확인(relations.MergeBoundary·ModeCheck)도 FETCHED·OVERSIZED·
    NOT_REACHED를 같은 뜻으로 쓴다.
    """

    FETCHED = "FETCHED"
    # 연동 계정이 작성자로 기록되지 않은(PR은 연동 계정이 열지 않은) 기록이라 상세를 조회하지 않았다.
    NOT_REQUESTED = "NOT_REQUESTED"
    # 연동 계정 기록이지만 상세 조회 개수 범위 밖이라 조회하지 않았다.
    BEYOND_RANGE = "BEYOND_RANGE"
    # 단일 응답 크기 상한을 넘어 버렸다. PR 커밋 목록은 일부 쪽만 받았어도 모두 버린다.
    OVERSIZED = "OVERSIZED"
    # PR 커밋 목록만 쓴다. 조회하는 동안 PR이 바뀌어 커밋 목록을 관측한 판본(PR 머리 커밋)과 맞출
    # 수 없었다. 받은 목록은 버리고 다시 부르지 않는다.
    REVISION_MISMATCH = "REVISION_MISMATCH"
    # 수집이 상한·오류로 멈춰 조회하지 못했다(확인 중단).
    NOT_REACHED = "NOT_REACHED"


@dataclass(frozen=True)
class ChangedFile:
    path: str
    status: str
    additions: int
    deletions: int
    previous_path: str | None
    # None이면 GitHub 응답에 변경 내용이 없다(큰 파일·이진 파일 등).
    patch: str | None
    # git diff 머리글의 파일 모드 줄(`new file mode 100755` 등, git 순서). 커밋 상세(JSON)에는 모드가
    # 없어 같은 변경을 비교할 커밋만 diff 형식으로 따로 받아 채운다. None이면 관측하지 않았고, 빈
    # 값이면 모드 바꿈이 없음을 확인했다.
    mode_lines: tuple[str, ...] | None = None


@dataclass(frozen=True)
class CommitChanges:
    files: tuple[ChangedFile, ...]
    additions: int
    deletions: int
    # GitHub가 파일 목록을 여러 쪽으로 나눠 보냈고 첫 쪽만 확인했다.
    files_truncated: bool


@dataclass(frozen=True)
class CommitRecord:
    sha: str
    parents: tuple[str, ...]
    message: str
    authored_at: datetime
    committed_at: datetime
    # GitHub가 계정과 연결하지 못한 작성자는 None.
    author: GitHubAccount | None
    committer: GitHubAccount | None
    changes: CommitChanges | None
    changes_status: DetailStatus

    def __post_init__(self) -> None:
        normalize_sha(self.sha)
        for parent in self.parents:
            normalize_sha(parent)
        if (self.changes is not None) != (self.changes_status is DetailStatus.FETCHED):
            raise ValueError("변경 내용은 조회했을 때만 둔다")


@dataclass(frozen=True)
class PullRequestRecord:
    number: int
    title: str
    body: str
    state: Literal["open", "closed"]
    created_at: datetime
    closed_at: datetime | None
    merged_at: datetime | None
    # 병합된 PR에서만 둔다. 병합 전 값은 시험용 병합 커밋이라 쓰지 않는다.
    merge_commit_sha: str | None
    head_sha: str
    base_ref: str
    head_ref: str
    # 다른 저장소(포크)에서 연 PR. 그 저장소는 따라가지 않는다.
    from_fork: bool
    author: GitHubAccount | None
    commits: tuple[str, ...] | None
    commits_status: DetailStatus
    # PR 커밋 목록 API가 돌려주는 최대 개수에 닿아 나머지를 확인하지 못했을 수 있다.
    commits_truncated: bool
    # 관측한 시점의 기준 브랜치 커밋(`base.sha`). 없거나 형식이 다르면 None.
    base_sha: str | None = None

    def __post_init__(self) -> None:
        require_number(self.number)
        normalize_sha(self.head_sha)
        if self.base_sha is not None:
            normalize_sha(self.base_sha)
        if self.merge_commit_sha is not None:
            normalize_sha(self.merge_commit_sha)
            if self.merged_at is None:
                raise ValueError("병합 커밋은 병합된 PR에서만 둔다")
        if (self.commits is not None) != (self.commits_status is DetailStatus.FETCHED):
            raise ValueError("커밋 목록은 조회했을 때만 둔다")


@dataclass(frozen=True)
class IssueRecord:
    number: int
    title: str
    body: str
    state: Literal["open", "closed"]
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    author: GitHubAccount | None

    def __post_init__(self) -> None:
        require_number(self.number)


@dataclass(frozen=True)
class CoverageLimit:
    """조회 범위 밖이거나 잘려 확인하지 못한 부분. 실패가 아니다."""

    resource_type: ResourceType
    message: str
