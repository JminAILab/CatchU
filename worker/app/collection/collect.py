"""요청 한 건의 GitHub 자료 수집 순서.

허용 자료 종류 → 자격정보 맥락 → 선택 범위를 모두 확인한 뒤에야 연결을 열고 첫 GitHub
호출을 한다. 저장소 확인 → 허용 종류별 목록 → 상세 순으로 부르고, 멈추면 그때까지 모은
자료와 실패 하나를 함께 돌려준다. 성공·실패·예외 모두 연결을 닫고 자격정보를 놓는다.
원문은 메모리에만 두며 디스크에 쓰지 않는다.

relations를 주면 목록 뒤에 같은 연결로 관계 조회(`relations.py`)를 하고, 그때는 목록 단계가
상세를 정하지 않는다. 주지 않으면 #117의 순서·호출·한계를 그대로 지킨다.

후보·Catch를 만들지 않는다. 결과 조합에는 `stage_failures()`를 `GenerationOutput.failures`에
더해 넘기며, 그러면 수집 실패가 있는 결과는 EMPTY가 되지 않는다.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime

from app.collection import evidence
from app.collection.api_paths import RepositoryPaths
from app.collection.budget import CollectionBudget
from app.collection.collectors import (
    CollectedData,
    Collector,
    CommitCollector,
    IssueCollector,
    PullRequestCollector,
    verify_repository,
)
from app.collection.credentials import (
    CredentialContext,
    CredentialResolver,
    check_credential,
)
from app.collection.failures import (
    CollectionFailure,
    CollectionStopped,
    FailureCode,
)
from app.collection.gateway import GitHubGateway, GraphQLUsage
from app.collection.identifiers import GitHubAccount, RepositoryCoordinates
from app.collection.limits import PROPOSED_LIMITS, CollectionLimits
from app.collection.records import (
    RESOURCE_TYPES,
    CommitRecord,
    CoverageLimit,
    DetailStatus,
    IssueRecord,
    PullRequestRecord,
    ResourceType,
)
from app.collection.relations import (
    Lookup,
    RelationCollector,
    RelationObservations,
    RelationOptions,
)
from app.collection.selection import SelectionResolver, check_selection
from app.collection.transport import Transport
from app.processing.generation import GenerationOutput, StageFailure
from app.processing.request_check import CheckedRequest

logger = logging.getLogger(__name__)

Clock = Callable[[], datetime]

_TYPE_NAMES = {"COMMIT": "커밋", "PULL_REQUEST": "PR", "ISSUE": "이슈"}


@dataclass(frozen=True)
class CollectionOutcome:
    """수집한 기록과 한계, 수집 실패. 자격정보·토큰·응답 원문은 담지 않는다."""

    allowed_resource_types: frozenset[ResourceType]
    selection_reference: str
    # 첫 호출 전 검사에서 멈췄으면 None이다.
    repository: RepositoryCoordinates | None = None
    linked_account: GitHubAccount | None = None
    commits: tuple[CommitRecord, ...] = ()
    pull_requests: tuple[PullRequestRecord, ...] = ()
    issues: tuple[IssueRecord, ...] = ()
    coverage_limits: tuple[CoverageLimit, ...] = ()
    failures: tuple[CollectionFailure, ...] = ()
    # 실제 HTTP 요청 수(REST 호출과 GraphQL POST를 1회씩 합한 값). 호출 수 상한과 같은 셈이다.
    calls: int = 0
    received_bytes: int = 0
    # 그 가운데 연결 PR 묶음 조회(GraphQL)의 호출 수와 점수. 점수는 호출 수에 더하지 않는다.
    graphql: GraphQLUsage = GraphQLUsage()
    # 관계 조회를 요청했고 첫 호출 전에 멈추지 않았을 때만 있다.
    relations: RelationObservations | None = None
    # 실제 조회가 끝난 경우에만 설정한다. 기본 생성한 빈 결과로 NONE을 추측하지 않는다.
    own_commits_checked: bool = False
    elapsed_seconds: float = 0

    def with_observation(self, output: GenerationOutput) -> GenerationOutput:
        records = list(self.commits)
        if self.relations is not None:
            records.extend(self.relations.commits)
            for branch in self.relations.base_branches:
                records.extend(branch.commits)
        own = {
            record.sha
            for record in records
            if self.linked_account is not None
            and self.linked_account.same_account(record.author)
        }
        notes = list(dict.fromkeys(limit.message for limit in self.coverage_limits))
        if self.relations is not None:
            for listing in self.relations.pull_request_commits:
                notes.extend(listing.limits)
                if listing.status is not DetailStatus.FETCHED or not listing.complete:
                    notes.append("PR 커밋 목록을 완전히 확인하지 못했습니다.")
        if self.failures:
            notes.append("수집이 중단되어 필요한 조회를 끝내지 못했습니다.")
        if any(record.author is None for record in records):
            notes.append("작성자 계정을 확인하지 못한 커밋이 있습니다.")
        checked = (
            self.own_commits_checked
            and self.linked_account is not None
            and "COMMIT" in self.allowed_resource_types
        )
        if not checked and not notes:
            notes.append("본인 커밋 확인에 필요한 조회의 완료를 확인하지 못했습니다.")
        notes = list(dict.fromkeys(notes))
        if len(notes) > 100:
            notes = [*notes[:99], "추가 수집 한계가 있습니다."]
        safe_notes = tuple(note[:500] for note in notes)
        if own:
            return replace(
                output,
                own_commit_observation="FOUND",
                observed_own_commit_count=len(own),
                collection_limit_notes=safe_notes,
            )
        if checked and not safe_notes and not output.failures:
            # PR/이슈 기여만으로 후보가 생겨도 완전 조회에서 본인 커밋이 없으면 Catch를 만들지 않는다.
            return replace(
                output,
                candidates=(),
                own_commit_observation="NONE",
                observed_own_commit_count=0,
                collection_limit_notes=(),
            )
        return replace(
            output,
            own_commit_observation="UNKNOWN",
            observed_own_commit_count=None,
            collection_limit_notes=safe_notes,
        )

    @property
    def completed(self) -> bool:
        """필요한 조회를 상한·오류 없이 마쳤는가. False면 확인이 중단된 것이다."""
        return not self.failures

    def stage_failures(self) -> tuple[StageFailure, ...]:
        return tuple(failure.as_stage_failure() for failure in self.failures)

    def shared_limits(self, resource_type: ResourceType) -> tuple[str, ...]:
        return tuple(
            limit.message
            for limit in self.coverage_limits
            if limit.resource_type == resource_type
        )

    def evidence_for(
        self, record: CommitRecord | PullRequestRecord | IssueRecord
    ) -> evidence.EvidenceBasis:
        if self.repository is None or self.linked_account is None:
            raise ValueError("수집하지 않은 결과에는 근거가 없다")
        repository, account = self.repository, self.linked_account
        if isinstance(record, CommitRecord):
            return evidence.commit_evidence(
                record,
                repository=repository,
                linked_account=account,
                shared_limits=self.shared_limits("COMMIT"),
                details_allowed="COMMIT" in self.allowed_resource_types,
            )
        if isinstance(record, PullRequestRecord):
            return evidence.pull_request_evidence(
                record,
                repository=repository,
                linked_account=account,
                shared_limits=self.shared_limits("PULL_REQUEST"),
                lookup_only=self.relations is not None
                and any(
                    pull.number == record.number
                    for pull in self.relations.pull_requests_from_lookups
                ),
            )
        return evidence.issue_evidence(
            record,
            repository=repository,
            linked_account=account,
            shared_limits=self.shared_limits("ISSUE"),
        )


def _collectors(
    allowed: frozenset[ResourceType],
    paths: RepositoryPaths,
    account: GitHubAccount,
    limits: CollectionLimits,
    *,
    mark_details: bool = True,
) -> list[Collector]:
    # 허용 목록에 있는 종류만 만든다. 없는 종류의 API는 부를 수단이 없다.
    available: dict[ResourceType, Collector] = {
        "COMMIT": CommitCollector(paths, account, limits, mark_details=mark_details),
        "PULL_REQUEST": PullRequestCollector(
            paths, account, limits, mark_details=mark_details
        ),
        "ISSUE": IssueCollector(paths, limits),
    }
    return [available[kind] for kind in RESOURCE_TYPES if kind in allowed]


def _allowed_types(request: CheckedRequest) -> frozenset[ResourceType]:
    return frozenset(
        kind for kind in RESOURCE_TYPES if kind in request.allowed_resource_types
    )


def _refuse(
    request: CheckedRequest,
    allowed: frozenset[ResourceType],
    failure: CollectionFailure,
) -> CollectionOutcome:
    logger.warning(
        "첫 GitHub 호출 전에 수집하지 않음: requestId=%s attemptId=%s code=%s",
        request.request_id,
        request.attempt_id,
        failure.code,
    )
    return CollectionOutcome(
        allowed_resource_types=allowed,
        selection_reference=request.selection_reference,
        failures=(failure,),
    )


def _run(
    collectors: list[Collector],
    gateway: GitHubGateway,
    paths: RepositoryPaths,
    data: CollectedData,
    relations: RelationCollector | None = None,
    expected_repository_id: str | None = None,
) -> CollectionFailure | None:
    """저장소 확인 → 목록 → 상세(관계 조회면 관계 조회). 멈추면 실패와, 확인하지 못한 종류의
    한계를 남긴다."""
    listed: set[ResourceType] = set()
    try:
        default_branch = verify_repository(
            gateway,
            paths,
            read_default_branch=relations is not None,
            expected_repository_id=expected_repository_id,
        )
        if relations is not None:
            relations.default_branch = default_branch
        for collector in collectors:
            collector.collect_list(gateway, data)
            listed.add(collector.resource_type)
        if relations is None:
            for collector in collectors:
                collector.collect_details(gateway, data)
        else:
            relations.run(gateway, data)
    except CollectionStopped as stopped:
        if relations is not None:
            relations.stopped(data)
        for collector in collectors:
            kind = collector.resource_type
            if kind in listed:
                continue
            received = data.count(kind)
            data.limit(
                kind,
                f"수집이 멈춰 {_TYPE_NAMES[kind]} 목록을 {received}건까지만 확인했다"
                if received
                else f"수집이 멈춰 {_TYPE_NAMES[kind]} 목록을 확인하지 못했다",
            )
        return stopped.failure
    return None


def collect(
    request: CheckedRequest,
    *,
    credentials: CredentialResolver,
    selections: SelectionResolver,
    open_transport: Callable[[], Transport],
    clock: Clock,
    limits: CollectionLimits = PROPOSED_LIMITS,
    started_at: datetime | None = None,
    relations: RelationOptions | None = None,
) -> CollectionOutcome:
    """요청 하나의 허용 범위 안에서 GitHub 자료를 모은다.

    started_at은 수집 시간 상한의 기준 시각이다(기본: 지금). 연결은 모든 사전 검사를
    통과한 뒤에만 open_transport로 연다. 예상하지 못한 예외는 결과로 바꾸지 않고 올린다.
    relations를 주면 같은 연결로 관계 조회까지 하고 결과의 relations에 담는다.
    """
    started = clock() if started_at is None else started_at
    allowed = _allowed_types(request)
    if not allowed:
        return _refuse(
            request,
            allowed,
            CollectionFailure(
                FailureCode.NO_ALLOWED_RESOURCE_TYPE,
                "허용된 자료 종류가 없어 수집하지 않았다",
            ),
        )
    context = check_credential(request, credentials, now=started, limits=limits)
    if isinstance(context, CollectionFailure):
        return _refuse(request, allowed, context)
    selected = check_selection(request, selections)
    if isinstance(selected, CollectionFailure):
        return _refuse(request, allowed, selected)

    return _collect_with(
        request,
        allowed,
        context,
        open_transport,
        clock,
        limits,
        started,
        relations,
    )


def _collect_with(
    request: CheckedRequest,
    allowed: frozenset[ResourceType],
    context: CredentialContext,
    open_transport: Callable[[], Transport],
    clock: Clock,
    limits: CollectionLimits,
    started: datetime,
    relations: RelationOptions | None,
) -> CollectionOutcome:
    paths = RepositoryPaths(context.repository)
    budget = CollectionBudget(limits, clock=clock, started_at=started)
    data = CollectedData()
    relation = (
        None
        if relations is None
        else RelationCollector(
            relations, paths, context.linked_account, limits, allowed
        )
    )
    logger.info(
        "수집 시작: requestId=%s attemptId=%s types=%s",
        request.request_id,
        request.attempt_id,
        ",".join(sorted(allowed)),
    )
    transport = open_transport()
    gateway: GitHubGateway | None = None
    graphql = GraphQLUsage()
    try:
        gateway = GitHubGateway(
            transport,
            token=context.access_token,
            expires_at=context.expires_at,
            budget=budget,
            clock=clock,
            limits=limits,
        )
        failure = _run(
            _collectors(
                allowed,
                paths,
                context.linked_account,
                limits,
                mark_details=relation is None,
            ),
            gateway,
            paths,
            data,
            relation,
            request.repository_id
            if request.source_mode == "LIVE" and request.repository_id.isdecimal()
            else None,
        )
    finally:
        # 성공·실패·예외 모두 자격정보를 놓고 연결을 닫는다.
        if gateway is not None:
            graphql = gateway.graphql_usage
            gateway.close()
        else:
            transport.close()
    logger.log(
        logging.WARNING if failure else logging.INFO,
        "수집 종료: requestId=%s attemptId=%s completed=%s code=%s calls=%d bytes=%d "
        "graphqlCalls=%d graphqlCost=%d graphqlCostUnobserved=%d "
        "commits=%d pullRequests=%d issues=%d elapsedSeconds=%.3f",
        request.request_id,
        request.attempt_id,
        failure is None,
        failure.code if failure else "-",
        budget.calls,
        budget.received_bytes,
        graphql.calls,
        graphql.observed_cost,
        graphql.unobserved_calls,
        len(data.commits),
        len(data.pull_requests),
        len(data.issues),
        max(0, (clock() - started).total_seconds()),
    )
    observations = None if relation is None else relation.observations(data)
    if observations is not None:
        _log_relations(request, observations, data)
    return CollectionOutcome(
        allowed_resource_types=allowed,
        selection_reference=request.selection_reference,
        repository=context.repository,
        linked_account=context.linked_account,
        commits=tuple(data.commits),
        pull_requests=tuple(data.pull_requests),
        issues=tuple(data.issues),
        coverage_limits=tuple(data.coverage_limits),
        failures=(failure,) if failure else (),
        calls=budget.calls,
        received_bytes=budget.received_bytes,
        graphql=graphql,
        relations=observations,
        own_commits_checked=failure is None,
        elapsed_seconds=max(0, (clock() - started).total_seconds()),
    )


def _log_relations(
    request: CheckedRequest, observations: RelationObservations, data: CollectedData
) -> None:
    """관계 조회 개수만 남긴다. SHA·브랜치 이름·제목·본문은 남기지 않는다."""
    lookups = [entry.status for entry in observations.associated]
    statuses = [
        record.changes_status for record in (*data.commits, *observations.commits)
    ]
    logger.info(
        "관계 조회 종료: requestId=%s attemptId=%s stoppedDuring=%s "
        "pullRequestLists=%d lookups=%d found=%d empty=%d limited=%d notReached=%d "
        "foreignBaseIgnored=%d lookupOnlyPullRequests=%d relationCommits=%d details=%d "
        "beyondRange=%d",
        request.request_id,
        request.attempt_id,
        observations.stopped_during or "-",
        sum(
            1
            for entry in observations.pull_request_commits
            if entry.status is DetailStatus.FETCHED
        ),
        len(lookups),
        lookups.count(Lookup.FOUND),
        lookups.count(Lookup.EMPTY),
        lookups.count(Lookup.LIMITED),
        lookups.count(Lookup.NOT_REACHED),
        sum(entry.foreign_ignored for entry in observations.associated),
        len(observations.pull_requests_from_lookups),
        len(observations.commits),
        statuses.count(DetailStatus.FETCHED),
        statuses.count(DetailStatus.BEYOND_RANGE),
    )
