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
    DetailStatus.NOT_REQUESTED: "연동 계정이 작성한 커밋이 아니라 변경 내용을 조회하지 않았다",
    DetailStatus.BEYOND_RANGE: "상세 조회 개수 범위 밖이라 변경 내용을 조회하지 않았다",
    DetailStatus.OVERSIZED: "변경 내용 응답이 크기 상한을 넘어 변경 파일을 확인하지 못했다",
    DetailStatus.NOT_REACHED: "수집이 멈춰 변경 내용을 확인하지 못했다",
}
_PULL_REQUEST_COMMITS_LIMIT = {
    DetailStatus.NOT_REQUESTED: "연동 계정이 연 PR이 아니라 커밋 목록을 조회하지 않았다",
    DetailStatus.BEYOND_RANGE: "상세 조회 개수 범위 밖이라 커밋 목록을 조회하지 않았다",
    DetailStatus.OVERSIZED: "커밋 목록 응답이 크기 상한을 넘어 커밋 목록을 확인하지 못했다",
    DetailStatus.NOT_REACHED: "수집이 멈춰 커밋 목록을 확인하지 못했다",
}


def commit_evidence(
    record: CommitRecord,
    *,
    repository: RepositoryCoordinates,
    linked_account: GitHubAccount,
    shared_limits: tuple[str, ...],
) -> EvidenceBasis:
    facts = [f"커밋 {record.sha[:12]}, 작성 시각 {rfc3339(record.authored_at)}"]
    if len(record.parents) > 1:
        facts.append(f"병합 커밋(부모 {len(record.parents)}개)")
    limits = [_UNKNOWN_AUTHOR] if record.author is None else []
    if record.changes is None:
        limits.append(_COMMIT_CHANGES_LIMIT[record.changes_status])
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
) -> EvidenceBasis:
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
        limits.append(_PULL_REQUEST_COMMITS_LIMIT[record.commits_status])
    else:
        facts.append(f"PR 커밋 {len(record.commits)}건")
        if record.commits_truncated:
            limits.append(
                f"PR 커밋 목록 API가 돌려주는 {PULL_REQUEST_COMMITS_API_CAP}건까지만 확인했다"
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
