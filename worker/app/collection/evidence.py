"""정규화된 기록에서 근거의 재료(출처 주소·판본·관측 사실·기여 관측·한계)를 만든다.

출처 주소는 검사한 저장소 좌표와 SHA·번호로 F가 만든 GitHub 화면 주소다. 응답의
`html_url`이나 본문의 주소를 옮기지 않는다. 관측 사실은 API가 준 구조 값(판본·상태·개수)만
쓰고 제목·본문 글자를 넣지 않는다. 후보에 어떤 근거를 쓰고 기여 범위를 어떻게 적을지는
후보 처리(#118)가 정한다.
"""

from dataclasses import dataclass

from app.collection.collectors import PULL_REQUEST_COMMITS_API_CAP
from app.collection.identifiers import GitHubAccount, RepositoryCoordinates
from app.collection.records import (
    CommitRecord,
    DetailStatus,
    IssueRecord,
    PullRequestRecord,
    ResourceType,
)
from app.processing.generation import EvidenceItem
from app.processing.result import rfc3339

GITHUB_WEB_ORIGIN = "https://github.com"
_UNKNOWN_AUTHOR = "GitHub가 작성자를 계정과 연결하지 못해 작성자를 확인하지 못했다"


def source_url(
    repository: RepositoryCoordinates, resource_type: ResourceType, key: str | int
) -> str:
    section = {"COMMIT": "commit", "PULL_REQUEST": "pull", "ISSUE": "issues"}
    return (
        f"{GITHUB_WEB_ORIGIN}/{repository.owner}/{repository.name}"
        f"/{section[resource_type]}/{key}"
    )


@dataclass(frozen=True)
class ObservedContribution:
    """API가 준 작성자 계정과 연동 계정의 관계. 관측일 뿐 본인 기여의 판정이 아니다."""

    author: GitHubAccount | None
    linked_account_is_author: bool
    # 커밋에만 있다.
    committer: GitHubAccount | None = None


@dataclass(frozen=True)
class EvidenceBasis:
    resource_type: ResourceType
    source_url: str
    source_revision: str
    observed_facts: tuple[str, ...]
    contribution: ObservedContribution
    coverage_limits: tuple[str, ...]

    def to_evidence_item(self, contribution_scope: str) -> EvidenceItem:
        """결과의 근거 하나. 기여 범위 문구는 후보 처리가 정해 넘긴다."""
        return EvidenceItem(
            source_url=self.source_url,
            source_revision=self.source_revision,
            represented_facts=self.observed_facts,
            contribution_scope=contribution_scope,
            coverage_limits=self.coverage_limits,
        )


_COMMIT_CHANGES_LIMIT = {
    DetailStatus.NOT_REQUESTED: (
        "연동 계정이 작성자로 기록된 커밋이 아니라 변경 내용을 조회하지 않았다"
    ),
    DetailStatus.BEYOND_RANGE: "상세 조회 개수 범위 밖이라 변경 내용을 조회하지 않았다",
    DetailStatus.OVERSIZED: "변경 내용 응답이 크기 상한을 넘어 변경 파일을 확인하지 못했다",
    DetailStatus.NOT_REACHED: "수집이 멈춰 변경 내용을 확인하지 못했다",
}
# 관계 조회(#118)는 연동 계정 커밋이라도 병합 커밋과, 커밋 조회가 허용되지 않은 요청에서 PR 커밋
# 목록으로만 본 커밋의 변경 내용은 부르지 않는다. 그 기록에 "작성자로 기록된 커밋이 아니라"를 쓰지
# 않는다.
_OWN_MERGE_NOT_REQUESTED = "병합 커밋이라 변경 내용을 조회하지 않았다"
_OWN_COMMIT_NOT_ALLOWED = (
    "커밋 조회가 허용되지 않은 요청이라 변경 내용을 조회하지 않았다"
)
# 두 수집 경로 모두 본인의 병합 아닌 커밋은 받았거나 범위 밖·수집 중단으로 표시하므로 지금은 나오지
# 않는다. 표시가 빠진 기록이 생겨도 "작성자로 기록된 커밋이 아니라"라고 잘못 적지 않으려고 둔다.
_OWN_NOT_PLANNED = "변경 내용 조회 대상으로 정하지 않아 변경 내용을 조회하지 않았다"
_PULL_REQUEST_COMMITS_LIMIT = {
    DetailStatus.NOT_REQUESTED: "연동 계정이 연 PR이 아니라 커밋 목록을 조회하지 않았다",
    DetailStatus.BEYOND_RANGE: "상세 조회 개수 범위 밖이라 커밋 목록을 조회하지 않았다",
    DetailStatus.OVERSIZED: "커밋 목록 응답이 크기 상한을 넘어 커밋 목록을 확인하지 못했다",
    # 관계 조회(#118)만 쓴다. 판본을 맞출 수 없는 목록은 버렸다.
    DetailStatus.REVISION_MISMATCH: (
        "조회하는 동안 PR이 바뀌어 커밋 목록을 관측한 판본과 맞출 수 없었다"
    ),
    DetailStatus.NOT_REACHED: "수집이 멈춰 커밋 목록을 확인하지 못했다",
}
# 관계 조회(#118)가 최근 PR 목록 밖에서 커밋에 연결된 PR로만 알게 된 PR. 그 PR의 커밋 목록은
# 부르지 않는다. 상세 조회 개수와는 관계없다.
_LOOKUP_ONLY_COMMITS = (
    "최근 PR 목록 밖의 PR이라 이 PR에 담긴 커밋 전체는 확인하지 않았다"
)


def _changes_limit(
    record: CommitRecord, linked_account: GitHubAccount, details_allowed: bool
) -> str:
    status = record.changes_status
    if status is DetailStatus.NOT_REQUESTED and linked_account.same_account(
        record.author
    ):
        if len(record.parents) > 1:
            return _OWN_MERGE_NOT_REQUESTED
        return _OWN_NOT_PLANNED if details_allowed else _OWN_COMMIT_NOT_ALLOWED
    return _COMMIT_CHANGES_LIMIT[status]


def commit_evidence(
    record: CommitRecord,
    *,
    repository: RepositoryCoordinates,
    linked_account: GitHubAccount,
    shared_limits: tuple[str, ...],
    details_allowed: bool = True,
) -> EvidenceBasis:
    """details_allowed는 요청이 커밋 조회(COMMIT)를 허용했는지다. 한계 문구에만 쓴다."""
    facts = [f"커밋 {record.sha[:12]}, 작성 시각 {rfc3339(record.authored_at)}"]
    if len(record.parents) > 1:
        facts.append(f"병합 커밋(부모 {len(record.parents)}개)")
    limits = [_UNKNOWN_AUTHOR] if record.author is None else []
    if record.changes is None:
        limits.append(_changes_limit(record, linked_account, details_allowed))
    else:
        changes = record.changes
        facts.append(
            f"변경 파일 {len(changes.files)}개, "
            f"추가 {changes.additions}줄·삭제 {changes.deletions}줄"
        )
        if changes.files_truncated:
            limits.append("변경 파일이 많아 GitHub 응답의 첫 쪽 파일만 확인했다")
        missing = sum(1 for file in changes.files if file.patch is None)
        if missing:
            limits.append(
                f"파일 {missing}개는 GitHub 응답에 변경 내용이 없어 확인하지 못했다"
            )
    return EvidenceBasis(
        resource_type="COMMIT",
        source_url=source_url(repository, "COMMIT", record.sha),
        source_revision=record.sha,
        observed_facts=tuple(facts),
        contribution=ObservedContribution(
            author=record.author,
            linked_account_is_author=linked_account.same_account(record.author),
            committer=record.committer,
        ),
        coverage_limits=(*limits, *shared_limits),
    )


def pull_request_evidence(
    record: PullRequestRecord,
    *,
    repository: RepositoryCoordinates,
    linked_account: GitHubAccount,
    shared_limits: tuple[str, ...],
    lookup_only: bool = False,
) -> EvidenceBasis:
    """lookup_only는 관계 조회가 PR 목록 밖에서 연결 PR 조회로만 안 PR인지다. 한계 문구에만 쓴다."""
    state = (
        "병합됨"
        if record.merged_at is not None
        else ("열림" if record.state == "open" else "닫힘")
    )
    facts = [f"PR #{record.number}, 상태 {state}"]
    if record.from_fork:
        facts.append("다른 저장소(포크)의 브랜치에서 연 PR")
    limits = [_UNKNOWN_AUTHOR] if record.author is None else []
    if record.commits is None:
        limits.append(
            _LOOKUP_ONLY_COMMITS
            if lookup_only
            else _PULL_REQUEST_COMMITS_LIMIT[record.commits_status]
        )
    else:
        facts.append(f"PR 커밋 {len(record.commits)}건")
        if record.commits_truncated:
            # 관계 조회(#118)는 250건 밖을 비교 API로 일부 더 읽을 수 있다. 그때 250건이라 적으면
            # 위 사실과 어긋난다. 기본 경로의 목록은 250건을 넘지 않아 문구가 그대로다.
            limits.append(
                f"PR 커밋 목록 API가 돌려주는 {PULL_REQUEST_COMMITS_API_CAP}건까지만 확인했다"
                if len(record.commits) <= PULL_REQUEST_COMMITS_API_CAP
                else f"PR 커밋이 많아 {len(record.commits)}건까지만 확인했고 나머지는 "
                "확인하지 못했다"
            )
    return EvidenceBasis(
        resource_type="PULL_REQUEST",
        source_url=source_url(repository, "PULL_REQUEST", record.number),
        # 관측한 시점의 PR 머리 커밋.
        source_revision=record.head_sha,
        observed_facts=tuple(facts),
        contribution=ObservedContribution(
            author=record.author,
            linked_account_is_author=linked_account.same_account(record.author),
        ),
        coverage_limits=(*limits, *shared_limits),
    )


def issue_evidence(
    record: IssueRecord,
    *,
    repository: RepositoryCoordinates,
    linked_account: GitHubAccount,
    shared_limits: tuple[str, ...],
) -> EvidenceBasis:
    state = "열림" if record.state == "open" else "닫힘"
    return EvidenceBasis(
        resource_type="ISSUE",
        source_url=source_url(repository, "ISSUE", record.number),
        # 이슈에는 git 판본이 없어 관측한 마지막 수정 시각을 판본으로 쓴다.
        source_revision=rfc3339(record.updated_at),
        observed_facts=(f"이슈 #{record.number}, 상태 {state}",),
        contribution=ObservedContribution(
            author=record.author,
            linked_account_is_author=linked_account.same_account(record.author),
        ),
        coverage_limits=(
            *([_UNKNOWN_AUTHOR] if record.author is None else []),
            *shared_limits,
        ),
    )
