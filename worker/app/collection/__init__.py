"""허용된 GitHub 자료 수집과 근거 정규화(#117).

요청의 허용 범위와 A의 자격정보 맥락을 대조한 뒤 GitHub REST API만으로 자료를 모으고,
출처·판본·관측 사실·기여 관측·한계를 가진 기록으로 정규화해 후보 처리(#118)에 넘긴다.
후보 처리가 쓰는 관계(PR 커밋 목록·연결 PR·변경 내용)는 같은 연결의 관계 조회로 모은다.
"""

from app.collection.collect import CollectionOutcome, collect
from app.collection.credentials import (
    AccessToken,
    CredentialContext,
    CredentialLookupError,
    CredentialResolver,
)
from app.collection.evidence import EvidenceBasis, ObservedContribution
from app.collection.failures import CollectionFailure, FailureCode
from app.collection.identifiers import GitHubAccount, RepositoryCoordinates
from app.collection.limits import PROPOSED_LIMITS, CollectionLimits
from app.collection.records import (
    ChangedFile,
    CommitChanges,
    CommitRecord,
    CoverageLimit,
    DetailStatus,
    IssueRecord,
    PullRequestRecord,
    ResourceType,
)
from app.collection.relations import (
    AssociatedPulls,
    BaseBranchLine,
    DetailTiers,
    Lookup,
    MergeBoundary,
    ModeCheck,
    PullRequestCommits,
    RelationObservations,
    RelationOptions,
)
from app.collection.selection import (
    SelectedRange,
    SelectionLookupError,
    SelectionResolver,
)
from app.collection.transport import GITHUB_API_HOST, HttpsTransport, Transport

__all__ = [
    "GITHUB_API_HOST",
    "PROPOSED_LIMITS",
    "AccessToken",
    "AssociatedPulls",
    "BaseBranchLine",
    "ChangedFile",
    "CollectionFailure",
    "CollectionLimits",
    "CollectionOutcome",
    "CommitChanges",
    "CommitRecord",
    "CoverageLimit",
    "CredentialContext",
    "CredentialLookupError",
    "CredentialResolver",
    "DetailStatus",
    "DetailTiers",
    "EvidenceBasis",
    "FailureCode",
    "GitHubAccount",
    "HttpsTransport",
    "IssueRecord",
    "Lookup",
    "MergeBoundary",
    "ModeCheck",
    "ObservedContribution",
    "PullRequestCommits",
    "PullRequestRecord",
    "RelationObservations",
    "RelationOptions",
    "RepositoryCoordinates",
    "ResourceType",
    "SelectedRange",
    "SelectionLookupError",
    "SelectionResolver",
    "Transport",
    "collect",
]
