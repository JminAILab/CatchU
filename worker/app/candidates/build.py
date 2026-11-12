"""후보 구성(#118): 묶음 결과를 적합 후보·미제공 수·실패로 바꾼다.

입구는 `build_candidates(request, outcome, assigned)`다. 단위 판정은 grouping.py가 하고, 여기서는 후보
자격(본인 기여·실패와의 분리), notProvided 집계, 후보 문장과 근거를 만든다. assigned는 맥락 조회로 받은
소속 커밋 집합(CR2)이고, 빼기는 grouping.py의 `group`이 한다. 빼고 나니 버린 단위는 미제공에 세지 않고
종료 로그의 assignedUnits로만 센다(`docs/commit-assignment.md`).

- 후보: 배정받은 변경 가운데 연동 계정이 작성자로 기록된 기여 근거 커밋이 있고, 그 가운데 변경
  파일을 확인한(비지 않은) 커밋이나 응답이 커서 받지 못한(변경이 있는) 커밋이 있는 단위만 된다.
  작은 변경·커밋 하나·이유 부재만으로 빼지 않는다. 보류한 변경은 어느 후보에도 넣지 않는다. 커밋
  조회가 허용되지 않은 요청은 변경 내용을 보지 않으므로 기여 근거 커밋만 있으면 된다.
- 집계 단위: UNDETERMINED는 근거끼리 어긋난 본인 변경 하나(같은 변경으로 합친 커밋은 하나)마다 1.
  커밋 목록을 다 받지 못한 PR과 겹칠 수 있어 PR 밖을 확정하지 않은 본인 변경과, 자료 범위 한계로
  소속을 확인하지 못한 본인 변경도 여기 센다(둘 다 정한 범위대로 조회를 마쳤다. 운영 로그는 따로
  센다). INSUFFICIENT_EVIDENCE는 커밋 목록을 다 받지 못해 본인 squash 후보 커밋을 기여로 확인하지
  못한 PR 하나마다 1(PR을 연 계정과 무관), 본인 기여 근거 커밋 가운데 변경이 있음을 확인한 커밋이
  없고 받지 못한 커밋이 조회 범위 밖인 단위 하나마다 1. 연동 계정이 연 PR이라도 본인 기여 근거
  커밋이 없으면 다른 계정 커밋만 있는 단위처럼 세지 않는다(PR을 연 것은 기여가 아니다, 2026-10-09
  팀장 결정). BELOW_CRITERIA는 본인 기여 근거 커밋이 모두 빈 커밋(변경 파일 0개)인 단위 하나마다
  1. 확인 중단으로 보류한 변경은 세지 않는다. squash 후보 커밋을 확인하지 못한 PR은 그 PR의 기여를
  바꿀 수 있는 확인(같은 변경 비교·연결 PR 조회·커밋 목록)이 수집 중단으로 끝나지 않았으면 세지
  않는다(`GroupedUnit.contribution_settled`). 변경 내용을 수집이 멈춰 받지 못한 단위도 세지 않는다.
  세는 곳은 `build_candidates` 한 곳이다.
- 실패: 수집 실패(`outcome.stage_failures()`)만 그대로 옮긴다. 보류에는 실패를 더하지 않는다.
- 제목: 만들지 않는다(title=None). 제목은 생성 단계가 기록의 글 칸이나 조각 제목으로 정한다(CR1 BR3).
- 기록의 글: 단위마다 record_text.py로 한 번 고르고 후보 자료의 record_text 칸에 싣는다(CR1 BR2.7).
- 작업 사실(CR1 BR4): 첫 항목은 단위 종류만 쓴다(PR은 「PR #n, 상태 …」, PR 없는 병합은 「PR 없이 합친
  병합」, 커밋 묶음은 「PR·병합 없이 들어간 본인 커밋」·「… 묶음」, PR 조회가 허용되지 않은 요청이면
  「PR·병합 없이」 대신 「병합 없이」). SHA·날짜는 넣지 않는다. 쓸 만한(부실이 아닌) 기록의 글이 있을
  때만 둘째 항목으로 그 글을 따옴표로 옮긴다. 작업 사실은 1~2항목이다. 다른 계정 커밋이 섞였는지
  알리는 문장은 쓰지 않는다(값 other_authors는 그대로 쓴다).
- 문장: 작업 사실 둘째 항목(작성자 원문)을 빼면 구조 값(번호·SHA·상태)만 쓰고 제목·본문·커밋
  메시지·브랜치 이름은 넣지 않는다. CatchU가 만든 문장(작업 사실 첫 항목·나의 기여)에는 CatchU가 센
  숫자(몇 건 중 몇 건, 줄 수 합계, 본인 커밋 수)를 쓰지 않는다(BR4.6). 근거 한계에도 센 본인 커밋 수
  대신 정해 둔 상한 값을 쓴다. 커밋의 파일·줄 수와 PR 커밋 수 같은 원본 숫자는 근거의 관측 사실에만
  있다. 본인 기여는 '작성자로 기록된' 커밋으로 적는다(2026-10-08 팀장 결정 「본인 기여의 뜻」).
  묶음 설명(groupingBasis)은 판정에 실제로 쓴 근거만 적는다.
- 근거 순서: PR·병합 단위는 그 단위 근거 먼저, 그다음 본인 기여 근거 커밋을 최근 것부터 최대 20건.
  커밋 묶음은 본인 커밋을 최근 것부터. 이슈 조회가 허용된 요청이면 맨 뒤에 그 본인 커밋이 가리킨
  수집한 이슈를 번호순으로 더한다(사례 C6). B는 이 순서대로 보인다.
- workIdentity는 identity.py로만 만든다. 한 결과 안에서 값이 같은 후보가 생기면(생기면 안 된다)
  B로 보내기 전에 첫 후보에 합친다. 첫 후보의 작업 사실과 기록의 글을 그대로 두고(BR4.5), 출처·판본이
  같은 근거는 관측 사실과 한계를 합쳐 남긴다. 본인 커밋 목록은 첫 후보의 목록 뒤에 다른 후보의 새 SHA를
  처음 나온 순서로 잇는다(CR2 BR2.1).
- 본인 커밋 목록(own_commit_shas): 근거 20건을 고르던 본인 기여 근거 커밋 전체를 최근 것부터 싣는다.
  api가 그 Catch의 소속으로 쓴다(CR2 BR2.1).
- 초안·최소 질문은 만들지 않는다(NOT_GENERATED).
"""

import logging
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Literal, assert_never

from app.candidates.grouping import (
    GroupedUnit,
    Grouping,
    HoldReason,
    Membership,
    MembershipSource,
    Note,
    NoteKind,
    group,
)
from app.candidates.identity import (
    CommitsUnit,
    MergeUnit,
    PullRequestUnit,
    work_identity,
)
from app.candidates.record_text import choose_record_text, pull_request_title
from app.candidates.same_change import issue_references
from app.collection.collect import CollectionOutcome
from app.collection.records import (
    CommitRecord,
    DetailStatus,
    IssueRecord,
    PullRequestRecord,
)
from app.collection.relations import newest_first
from app.processing.generation import (
    DraftOutcome,
    EligibleCandidate,
    EvidenceItem,
    GenerationOutput,
    NotProvided,
    NotProvidedReason,
    RecordText,
    ReflectionOutcome,
)
from app.processing.request_check import CheckedRequest

logger = logging.getLogger(__name__)

# 후보 하나에 담는 본인 커밋 근거 수. 넘으면 최근 것만 담고 한계로 적는다.
EVIDENCE_COMMIT_CAP = 20

# 본인 기여는 연동 계정이 커밋 작성자로 기록된 변경이다(2026-10-08 팀장 결정 「본인 기여의 뜻」).
_OWN_COMMIT_SCOPE = "연동 계정이 작성자로 기록된 커밋"
_OWN_COMMIT_ELSEWHERE_SCOPE = (
    "연동 계정이 작성자로 기록된 커밋(같은 변경으로 확인해 이 작업에 배정)"
)
_OWN_COMMIT_SCOPES = frozenset({_OWN_COMMIT_SCOPE, _OWN_COMMIT_ELSEWHERE_SCOPE})
# 이슈 조회가 허용된 요청에서, 이 작업의 본인 기여 근거 커밋 메시지가 가리킨 수집한 이슈. 이슈를
# 쓰거나 논의한 것은 본인 기여로 보지 않는다(본인 기여는 커밋뿐이다).
_ISSUE_SCOPE = (
    "이 작업에서 연동 계정이 작성자로 기록된 커밋이 가리킨 이슈"
    "(이슈를 쓰거나 논의한 것은 본인 기여로 보지 않음)"
)
# 값이 같은 후보를 합칠 때, 같은 출처·판본의 근거가 다른 귀속 범위로도 담겼으면 남기는 한계.
_SCOPE_DIFFERS = "같은 근거를 다른 귀속 범위로도 담았다"
# 본인 기여 근거 커밋이 단위 안에 있는지. INSIDE면 모두 단위 안, ELSEWHERE면 모두 같은 변경으로
# 배정받은 다른 곳의 커밋, MIXED면 섞였다. 단위의 본인 커밋처럼 읽히지 않게 문맥을 나눈다.
_Where = Literal["INSIDE", "ELSEWHERE", "MIXED"]
_PULL_OWN: dict[_Where, str] = {
    "INSIDE": "이 PR의 본인 커밋",
    "ELSEWHERE": "같은 변경으로 이 PR에 배정한 다른 곳의 본인 커밋",
    "MIXED": "이 PR의 본인 커밋과 같은 변경으로 배정한 다른 곳의 본인 커밋",
}
_MERGE_ELSEWHERE = {
    "ELSEWHERE": "같은 변경으로 이 병합에 배정한 다른 곳의 본인 커밋",
    "MIXED": "이 병합이 들인 본인 커밋과 같은 변경으로 배정한 다른 곳의 본인 커밋",
}
# 작업 사실 첫 항목(CR1 BR4.1). 단위 종류만 쓰고 SHA·날짜는 넣지 않는다.
_MERGE_FACT = "PR 없이 합친 병합"
# 커밋 묶음: PR 소속을 확인했으면 「PR·병합 없이」, PR 조회가 허용되지 않았으면 PR을 확인하지 않고 「PR
# 없이」라고 쓰지 않도록 「병합 없이」다.
_COMMITS_FACT = "{where} 들어간 본인 커밋"
_COMMITS_BUNDLE_FACT = "{where} 들어간 본인 커밋 묶음"
# 작업 사실 둘째 항목(CR1 BR4.2). 글은 작성자 원문 그대로다.
_RECORD_FACT = {
    "PR_TITLE": 'PR 제목: "{text}"',
    "COMMIT_FIRST_LINE": '본인 커밋 메시지 첫 줄: "{text}"',
}
_MERGE_SCOPE = "PR 없이 병합한 병합 커밋(병합 커밋 자체는 변경으로 세지 않음)"
_PULLS_NOT_ALLOWED = "PR 조회가 허용되지 않아 PR 소속은 확인하지 않았다"
_PULLS_NOT_CHECKED = "PR 조회가 허용되지 않아 PR 소속은 보지 않았다."
# PR 밖 확인의 근거. GitHub의 "커밋과 연결된 PR" 응답과 수집한 PR 커밋 목록이다.
_OUTSIDE_CHECKED = (
    "GitHub가 속한 PR이 없다고 답했고 수집한 PR 커밋 목록에도 없어 PR 밖으로 확인했다."
)
# 커밋 목록을 다 받지 못한 PR이 모두 기본 브랜치 대상의 열린·병합 PR이라 PR 밖 확정을 보류하지
# 않았을 때만 쓴다(한계 L13).
_LISTS_INCOMPLETE = (
    "커밋 목록을 다 받지 못한 기본 브랜치 대상 PR이 있어, 그 PR에도 담긴 커밋일 수 있다"
)
# 이 PR보다 먼저 병합된 PR의 커밋 목록을 다 받지 못했을 때 PR 단위 근거에 적는다. 보류하지 않고
# 집계도 바꾸지 않는다(2026-10-09 팀장 결정).
_EARLIER_LIST_INCOMPLETE = "먼저 병합된 PR 가운데 커밋 목록을 다 받지 못한 PR이 있어, 그 PR에도 담긴 변경일 수 있다"
# 후보 문장이 아니라 첫 근거의 한계(coverageLimits)로 적는 묶음 한계.
_EVIDENCE_NOTES = {
    NoteKind.PULL_REQUEST_LISTS_INCOMPLETE: _LISTS_INCOMPLETE,
    NoteKind.EARLIER_PULL_REQUEST_LIST_INCOMPLETE: _EARLIER_LIST_INCOMPLETE,
}
# 후보 문장(groupingLimitations)에 두고 첫 근거의 한계에도 같은 문장을 적는 같은 작업 경고. B는
# groupingLimitations를 화면에 내지 않고, 근거의 한계는 회원·수신자 응답에 담긴다(2026-10-12 팀장 결정).
_SHOWN_NOTES = frozenset(
    {NoteKind.RESUBMISSION_UNCONFIRMED, NoteKind.CHERRY_PICK_UNCONFIRMED}
)
# 소속 변경을 뺀 커밋 묶음의 묶음 설명에 더하는 고정 문장(CR2 BR1.8, 기능 설계 Q1 A).
_VIA_ASSIGNED = "이미 다른 Catch에 속한 커밋을 거쳐 이어진 커밋도 한 묶음에 두었다."

# 후보가 되지 않은 단위의 이유. NOT_OWN과 DETAILS_STOPPED는 notProvided에 세지 않는다.
# - NOT_OWN: 본인 기여 근거 커밋이 없다. 연동 계정이 연 PR이어도 같다(PR을 연 것은 기여가 아니다).
# - SQUASH_UNCONFIRMED: 커밋 목록을 다 받지 못해 본인 squash 후보 커밋을 기여로 확인하지 못했다.
# - EMPTY_COMMITS: 본인 기여 근거 커밋이 모두 빈 커밋이다.
# - DETAILS_STOPPED: 본인 기여 근거 커밋의 변경 내용을 수집이 멈춰 받지 못했다(빈 커밋인지 모름).
# - DETAILS_LIMITED: 본인 기여 근거 커밋의 변경 내용을 조회 범위 밖이라 받지 못했다.
_Skipped = Literal[
    "SQUASH_UNCONFIRMED",
    "EMPTY_COMMITS",
    "DETAILS_STOPPED",
    "DETAILS_LIMITED",
    "NOT_OWN",
]


@dataclass
class _Tally:
    insufficient: int = 0
    below_criteria: int = 0
    undetermined: int = 0
    held_after_stop: int = 0
    range_limited: int = 0
    # 단위 미확정 가운데 커밋 목록을 다 받지 못한 PR과 겹칠 수 있어 보류한 수(운영 로그용).
    held_by_incomplete_lists: int = 0

    def skipped(self, reason: _Skipped, settled: bool) -> None:
        """settled는 그 단위의 기여를 바꿀 수 있는 확인이 수집 중단에 걸리지 않았는지다."""
        if reason == "SQUASH_UNCONFIRMED":
            if settled:
                self.insufficient += 1
            else:
                self.held_after_stop += 1
        elif reason == "EMPTY_COMMITS":
            self.below_criteria += 1
        elif reason == "DETAILS_STOPPED":
            # 판단한 것이 아니므로 세지 않는다(실패는 수집이 남겼다).
            self.held_after_stop += 1
        elif reason == "DETAILS_LIMITED":
            self.range_limited += 1
            self.insufficient += 1

    def held(self, membership: Membership, reason: HoldReason | None) -> None:
        if membership is Membership.CONFLICT:
            self.undetermined += 1
            if reason is HoldReason.UNSEEN_PULL_REQUEST_COMMITS:
                self.held_by_incomplete_lists += 1
        elif membership is Membership.RANGE_LIMITED:
            # 전체 SHA로 근거 요건은 채웠고 정한 범위대로 조회도 마쳤는데 단위만 정하지 못했다
            # (2026-09-30 집계 결정). 운영 로그에서는 자료 범위 한계로 따로 센다.
            self.range_limited += 1
            self.undetermined += 1
        else:
            # 확인 중단: 판단한 것이 아니므로 notProvided에 세지 않는다(실패는 수집이 남겼다).
            self.held_after_stop += 1


@dataclass(frozen=True)
class _Text:
    facts: tuple[str, ...]
    contribution: str
    basis: str
    # 단위 근거(PR·병합 커밋). 커밋 묶음은 없다.
    unit_evidence: EvidenceItem | None
    # 단위 근거(없으면 첫 커밋 근거)에 더할 한계.
    evidence_limits: tuple[str, ...]


def build_candidates(
    request: CheckedRequest,
    outcome: CollectionOutcome,
    assigned: frozenset[str] = frozenset(),
) -> GenerationOutput:
    """수집 결과에서 적합 후보·미제공 수·실패를 만든다.

    assigned는 소속 커밋 집합이다. 생성 재료 찾기에도 같은 값을 넘겨야 같은 단위를 찾는다(BR1.6).
    첫 호출 전에 멈춘 수집(저장소 없음)은 실패만 돌려준다. 그런데 실패가 없거나, 저장소를 확인한
    수집 결과에 관계 조회 결과가 없거나, 수집 결과끼리 맞지 않으면 부른 쪽이나 수집의 결함이라
    ValueError를 낸다(grouping.py).
    """
    failures = outcome.stage_failures()
    tally = _Tally()
    if outcome.repository is None or outcome.linked_account is None:
        if not failures:
            raise ValueError("저장소를 확인하지 않은 수집 결과에 수집 실패가 없다")
        # 단위를 정하기 전에 끝났으므로 소속 두 숫자는 계산 전이라는 뜻의 0이다.
        _log(request, outcome, 0, tally, 0, (0, 0))
        return outcome.with_observation(GenerationOutput(failures=failures))
    grouping = group(outcome, assigned)
    built: list[EligibleCandidate] = []
    for unit in grouping.units:
        verdict = _candidate(request, outcome, grouping, unit)
        if isinstance(verdict, EligibleCandidate):
            built.append(verdict)
        else:
            tally.skipped(verdict, unit.contribution_settled)
    for held in grouping.held:
        if held.own:
            tally.held(held.membership, held.reason)
    merged_candidates, merged = _merge_same_identity(built, grouping.commits)
    # 작업 시각은 합친 뒤의 본인 커밋 목록으로 정한다(NC3 BR4.1). 기록이 없으면 ValueError(결함)다.
    candidates = tuple(
        _with_work_times(candidate, grouping.commits) for candidate in merged_candidates
    )
    counts: tuple[tuple[NotProvidedReason, int], ...] = (
        ("INSUFFICIENT_EVIDENCE", tally.insufficient),
        ("BELOW_CRITERIA", tally.below_criteria),
        ("UNDETERMINED", tally.undetermined),
    )
    _log(
        request,
        outcome,
        len(candidates),
        tally,
        merged,
        (len(assigned), grouping.assigned_units),
    )
    return outcome.with_observation(
        GenerationOutput(
            candidates=candidates,
            not_provided=tuple(
                NotProvided(reason, count) for reason, count in counts if count
            ),
            failures=failures,
        )
    )


def _candidate(
    request: CheckedRequest,
    outcome: CollectionOutcome,
    grouping: Grouping,
    unit: GroupedUnit,
) -> EligibleCandidate | _Skipped:
    own_changes = [
        change for change in unit.changes if change.contributing and change.own_commits
    ]
    if not own_changes:
        if unit.squash_unconfirmed:
            # 본인 squash 후보 커밋이 있지만 원래 커밋 목록을 다 받지 못해 그 안 변경의 명의를
            # 확인하지 못했다. PR을 연 계정과 무관하게 이 사유로 한 번만 센다.
            return "SQUASH_UNCONFIRMED"
        # 연동 계정이 연 PR이어도 세지 않는다. PR을 연 것은 기여가 아니므로 다른 계정 커밋만 있는
        # 단위와 같다(2026-10-09 팀장 결정).
        return "NOT_OWN"
    own = newest_first(
        grouping.commits[sha]
        for sha in dict.fromkeys(
            sha for change in own_changes for sha in change.own_commits
        )
    )
    if "COMMIT" in outcome.allowed_resource_types:
        unknown = _unconfirmed_changes(outcome, own)
        if unknown is not None:
            return unknown
    unit_commits = {sha for change in unit.changes for sha in change.commits}
    record_text = _record_text(outcome, grouping, unit, own, unit_commits)
    text = _text(outcome, grouping, unit, own, unit_commits, record_text)
    return EligibleCandidate(
        work_identity=work_identity(
            request.source_mode, request.repository_id, unit.unit
        ),
        # 후보 판정은 제목을 만들지 않는다. 제목은 생성 단계가 기록의 글 칸이나 조각 제목으로 정한다.
        title=None,
        work_facts=text.facts,
        subject_contribution=text.contribution,
        grouping_basis=text.basis,
        grouping_limitations=tuple(
            _limitation(note) for note in unit.notes if note.kind not in _EVIDENCE_NOTES
        ),
        evidence=_evidence(outcome, text, own, unit_commits),
        draft=DraftOutcome.not_generated(),
        reflection=ReflectionOutcome.not_generated(),
        record_text=record_text,
        # 근거 20건을 고르던 본인 커밋 목록 전체(최근 것부터, 중복 없음). api가 소속으로 쓴다.
        own_commit_shas=tuple(record.sha for record in own),
    )


def _record_text(
    outcome: CollectionOutcome,
    grouping: Grouping,
    unit: GroupedUnit,
    own: Sequence[CommitRecord],
    unit_commits: set[str],
) -> RecordText | None:
    """기록의 글(BR2.1·BR2.2). own은 본인 기여 근거 커밋이고, 그 가운데 단위 안 커밋만 고른다.

    같은 변경으로 다른 곳에서 이 단위에 배정한 본인 커밋은 고르지 않는다(FR5.1의 「단위 안」).
    """
    title: str | None = None
    if isinstance(unit.unit, PullRequestUnit):
        title = pull_request_title(
            grouping.pull_requests[unit.unit.number],
            outcome.linked_account,
            unit.other_authors == "ABSENT",
        )
    inside = [record for record in own if record.sha in unit_commits]
    return choose_record_text(title, inside)


def _unconfirmed_changes(
    outcome: CollectionOutcome, own: Sequence[CommitRecord]
) -> _Skipped | None:
    """본인 기여 근거 커밋의 변경 내용으로 후보 자격을 확인한다. 후보가 되면 None.

    변경 파일을 확인한(비지 않은) 커밋이나 응답이 커서 받지 못한(변경이 있는) 커밋이 있으면
    후보다. 모두 받았고 모두 비었으면 빈 커밋이다. 그 밖에 수집이 멈춰 받지 못한 커밋(멈춘 뒤
    계획되지 않은 채 남은 것 포함)이 있으면 확인 중단, 나머지(조회 범위 밖)는 근거 부족이다.
    """
    if any(
        (record.changes is not None and record.changes.files)
        or record.changes_status is DetailStatus.OVERSIZED
        for record in own
    ):
        return None
    if all(record.changes is not None for record in own):
        # 본인 기여 근거가 모두 빈 커밋이다. 확인할 작업 사실이 없다.
        return "EMPTY_COMMITS"
    if any(
        record.changes_status is DetailStatus.NOT_REACHED
        or (
            record.changes_status is DetailStatus.NOT_REQUESTED
            and not outcome.completed
        )
        for record in own
    ):
        return "DETAILS_STOPPED"
    return "DETAILS_LIMITED"


def _text(
    outcome: CollectionOutcome,
    grouping: Grouping,
    unit: GroupedUnit,
    own: Sequence[CommitRecord],
    unit_commits: set[str],
    record_text: RecordText | None,
) -> _Text:
    evidence_limits = tuple(
        _EVIDENCE_NOTES[note.kind]
        if note.kind in _EVIDENCE_NOTES
        else _limitation(note)
        for note in unit.notes
        if note.kind in _EVIDENCE_NOTES or note.kind in _SHOWN_NOTES
    )
    if MembershipSource.LOOKUP in unit.sources and not isinstance(
        unit.unit, PullRequestUnit
    ):
        # PR 밖 판정은 수집한 PR 범위 안에서만 확인했다. PR 목록의 범위 한계(예: 최근 PR N건까지만
        # 조회)를 PR 없는 병합·커밋 묶음의 근거에도 옮긴다. PR 단위는 PR 근거가 이미 담는다.
        evidence_limits = tuple(
            dict.fromkeys((*evidence_limits, *outcome.shared_limits("PULL_REQUEST")))
        )
    where = _where(own, unit_commits)
    key = unit.unit
    text: _Text
    match key:
        case PullRequestUnit():
            text = _pull_request_text(
                outcome, grouping, unit, key, where, evidence_limits
            )
        case MergeUnit():
            text = _merge_text(outcome, grouping, unit, key, where, evidence_limits)
        case CommitsUnit():
            text = _commits_text(unit, key, evidence_limits)
        case _:
            assert_never(key)
    # 작업 사실은 종류 줄 하나와, 쓸 만한 기록의 글이 있을 때만 그 줄이다(BR4.1·BR4.2·BR4.5).
    return replace(text, facts=(*text.facts, *_record_fact(record_text)))


def _record_fact(record_text: RecordText | None) -> tuple[str, ...]:
    """작업 사실 둘째 항목. 부실 판단(BR2.5)만 보고, 글은 원문 그대로 따옴표 안에 둔다."""
    if record_text is None or not record_text.usable:
        return ()
    return (_RECORD_FACT[record_text.source].format(text=record_text.text),)


def _where(own: Sequence[CommitRecord], unit_commits: set[str]) -> _Where:
    inside = sum(1 for record in own if record.sha in unit_commits)
    if inside == len(own):
        return "INSIDE"
    return "ELSEWHERE" if inside == 0 else "MIXED"


def _contribution(context: str | None = None) -> str:
    """나의 기여. 센 숫자를 쓰지 않는다(2026-10-08 팀장 결정)."""
    text = "연동 GitHub 계정이 작성자로 기록된 커밋"
    return text if context is None else f"{text}({context})"


def _pull_request_text(
    outcome: CollectionOutcome,
    grouping: Grouping,
    unit: GroupedUnit,
    key: PullRequestUnit,
    where: _Where,
    note_limits: tuple[str, ...],
) -> _Text:
    """PR 단위의 문장. 근거 한계는 그 PR 커밋 목록의 한계 다음에 묶음 한계(note_limits)를 둔다."""
    number = key.number
    record = grouping.pull_requests[number]
    account = outcome.linked_account
    if record.author is None:
        context = "PR을 연 계정은 확인하지 못함"
        opened = "PR을 연 계정을 확인하지 못한 PR"
    elif account is not None and account.same_account(record.author):
        context = opened = "연동 계정이 연 PR"
    else:
        context = "다른 계정이 연 PR에 담긴 본인 커밋"
        opened = "다른 계정이 연 PR"
    if where != "INSIDE":
        context = _PULL_OWN[where]
    scope = f"{opened}(본인 기여는 {_PULL_OWN[where]}에 한정)"
    basis = [
        f"PR #{number} 전체를 한 작업으로 묶었다.",
        f"커밋의 PR 소속을 확인한 근거: {_sources(unit.sources)}.",
    ]
    if unit.moved_out:
        basis.append(
            f"이 PR 커밋 목록의 변경 {unit.moved_out}건은 다른 PR에도 담겨 있어 배정 규칙"
            "(먼저 병합된 PR, 병합된 PR이 없으면 번호가 작은 PR)에 따라 그 PR에 배정했다."
        )
    basis.extend(_merged_in(unit))
    entry = grouping.pull_request_commits.get(number)
    return _Text(
        facts=(f"PR #{number}, 상태 {_state(record)}",),
        contribution=_contribution(context),
        basis=" ".join(basis),
        unit_evidence=outcome.evidence_for(record).to_evidence_item(scope),
        evidence_limits=tuple(
            dict.fromkeys((*(() if entry is None else entry.limits), *note_limits))
        ),
    )


def _merge_text(
    outcome: CollectionOutcome,
    grouping: Grouping,
    unit: GroupedUnit,
    key: MergeUnit,
    where: _Where,
    evidence_limits: tuple[str, ...],
) -> _Text:
    sha12 = key.commit[:12]
    basis = [
        f"PR 없이 병합한 병합 커밋({sha12})이 부모로 들인 커밋을 한 작업으로 묶었다."
    ]
    basis.append(
        f"들인 본인 커밋과 이 병합 커밋은 {_OUTSIDE_CHECKED}"
        if MembershipSource.LOOKUP in unit.sources
        else _PULLS_NOT_CHECKED
    )
    if unit.inner_placed:
        basis.append(
            f"안쪽 병합이 먼저 들인 커밋 {unit.inner_placed}건은 그 병합에 배정했다."
        )
    basis.extend(_merged_in(unit))
    return _Text(
        facts=(_MERGE_FACT,),
        contribution=_contribution(
            None if where == "INSIDE" else _MERGE_ELSEWHERE[where]
        ),
        basis=" ".join(basis),
        unit_evidence=outcome.evidence_for(
            grouping.commits[key.commit]
        ).to_evidence_item(_MERGE_SCOPE),
        evidence_limits=evidence_limits,
    )


def _commits_text(
    unit: GroupedUnit,
    key: CommitsUnit,
    evidence_limits: tuple[str, ...],
) -> _Text:
    """커밋 묶음의 문장. 묶음 설명은 실제로 이은 근거만 적는다."""
    checked = MembershipSource.LOOKUP in unit.sources
    where = "PR·병합에 속하지 않은" if checked else "병합에 속하지 않은"
    fact_where = "PR·병합 없이" if checked else "병합 없이"
    if len(key.commits) == 1:
        fact = _COMMITS_FACT.format(where=fact_where)
        first = [f"{where} 본인 커밋 하나를 한 작업으로 두었다."]
    else:
        fact = _COMMITS_BUNDLE_FACT.format(where=fact_where)
        first = _bundle_links(where, unit)
    basis = [
        *first,
        f"본인 커밋은 {_OUTSIDE_CHECKED}" if checked else _PULLS_NOT_CHECKED,
        *_merged_in(unit),
    ]
    return _Text(
        facts=(fact,),
        contribution=_contribution(),
        basis=" ".join(basis),
        unit_evidence=None,
        evidence_limits=evidence_limits,
    )


def _bundle_links(where: str, unit: GroupedUnit) -> list[str]:
    """여러 커밋을 이은 근거. 부모·변경 파일 겹침과 같은 변경을 쓴 것만 적는다.

    소속 변경을 뺀 묶음(via_assigned)은 남은 연결 뒤에 고정 문장을 더하고, 남은 연결이 없으면 그 문장이
    연결 근거의 전부다(CR2 BR1.8). 빼지 않은 묶음에 이은 근거가 없으면 묶음 처리의 결함이다.
    """
    sentences: list[str] = []
    if unit.parent_links:
        sentences.append(
            f"{where} 본인 커밋 가운데 부모가 하나뿐이고 그 부모와 변경 파일이 겹치는 것을 "
            "이어 한 묶음으로 두었다."
        )
    if unit.same_change_links:
        # 커밋 묶음끼리 같은 변경으로 합치는 관계 근거는 cherry-pick 표시뿐이다. 재제출은 PR 커밋
        # 목록의 커밋이라 PR에 배정된다.
        lead = "또 " if unit.parent_links else f"{where} 본인 커밋 가운데 "
        sentences.append(
            f"{lead}cherry-pick 표시가 있고 공백을 빼고 비교한 변경 내용이 같은 커밋을 같은 "
            "변경으로 보고 부모 관계와 관계없이 한 묶음에 두었다."
        )
    if unit.via_assigned:
        sentences.append(_VIA_ASSIGNED)
    if not sentences:
        raise ValueError("여러 커밋의 묶음에 이은 근거가 없다")
    sentences.append("작성 시각 차이와 메시지 비슷함은 보지 않았다.")
    return sentences


def _state(record: PullRequestRecord) -> str:
    if record.merged_at is not None:
        return "병합됨"
    return "열림" if record.state == "open" else "닫힘"


def _sources(sources: frozenset[MembershipSource]) -> str:
    names: list[str] = []
    if MembershipSource.PULL_REQUEST_COMMITS in sources:
        names.append(
            "PR 커밋 목록(250건이 넘는 PR은 시작 커밋부터 끝 커밋까지 비교해 받은 전체)"
            if MembershipSource.COMPARE in sources
            else "PR 커밋 목록"
        )
    if MembershipSource.MERGE_COMMIT_SHA in sources:
        names.append("병합된 PR이 기준 브랜치에 남긴 커밋")
    if MembershipSource.LOOKUP in sources:
        names.append("GitHub가 알려 준 커밋의 PR")
    return "·".join(names)


def _merged_in(unit: GroupedUnit) -> list[str]:
    if not unit.merged_in:
        return []
    return [
        f"다른 커밋과 같은 변경으로 확인한 변경 {unit.merged_in}건은 하나로 셌다(다시 낸 "
        "PR이거나 cherry-pick 표시가 있고, 공백을 빼고 비교한 변경 내용이 같음)."
    ]


def _limitation(note: Note) -> str:
    match note.kind:
        case NoteKind.RESUBMISSION_UNCONFIRMED:
            first, second = note.pull_requests
            return (
                f"같은 작업을 다시 낸 것일 수 있다(PR #{first}·#{second}, 공백을 무시한 "
                "변경 비교로 같은 변경을 확정하지 못함)"
            )
        case NoteKind.CHERRY_PICK_UNCONFIRMED:
            first_sha, second_sha = note.commits
            return (
                f"cherry-pick으로 옮긴 같은 변경일 수 있다(커밋 {first_sha[:12]}·"
                f"{second_sha[:12]}, 공백을 무시한 변경 비교로 같은 변경을 확정하지 못함)"
            )
        case NoteKind.PULL_REQUESTS_NOT_ALLOWED:
            return _PULLS_NOT_ALLOWED
        case NoteKind.NEIGHBOR_DETAILS_MISSING:
            return "변경 내용을 확인하지 못해 이웃 커밋과 묶을지 판단하지 않았다"
        case NoteKind.NEIGHBOR_FILES_TRUNCATED:
            return "변경 파일이 많아 일부만 확인해 이웃 커밋과 겹치는지 끝까지 판단하지 못했다"
        case (
            NoteKind.PULL_REQUEST_LISTS_INCOMPLETE
            | NoteKind.EARLIER_PULL_REQUEST_LIST_INCOMPLETE
        ):
            # 후보 문장이 아니라 근거의 한계로 적는다(_EVIDENCE_NOTES).
            raise ValueError("PR 커밋 목록 미확인 한계는 근거의 한계로 적는다")
        case _:
            assert_never(note.kind)


def _evidence(
    outcome: CollectionOutcome,
    text: _Text,
    own: Sequence[CommitRecord],
    unit_commits: set[str],
) -> tuple[EvidenceItem, ...]:
    """단위 근거, 그다음 본인 기여 근거 커밋을 최근 것부터(newest_first) 최대 20건.

    커밋 묶음은 단위 근거가 없어 본인 커밋부터 온다. B는 이 순서대로 보인다(2026-10-08 팀장 결정
    「수신자에게 나가는 숫자와 근거 순서」). 이슈 조회가 허용된 요청이면 그 뒤에 이슈 근거를 번호순으로
    더한다(_issue_evidence). 결정이 정한 단위 근거·본인 커밋의 순서는 그대로다.
    """
    items = [
        outcome.evidence_for(record).to_evidence_item(
            _OWN_COMMIT_SCOPE
            if record.sha in unit_commits
            else _OWN_COMMIT_ELSEWHERE_SCOPE
        )
        for record in own[:EVIDENCE_COMMIT_CAP]
    ]
    limits = list(text.evidence_limits)
    if len(own) > EVIDENCE_COMMIT_CAP:
        # 센 본인 커밋 수는 쓰지 않고 정해 둔 상한 값만 쓴다.
        limits.append(
            f"본인 커밋이 {EVIDENCE_COMMIT_CAP}건을 넘어 최근 {EVIDENCE_COMMIT_CAP}건만 "
            "근거로 담았다"
        )
    first = text.unit_evidence if text.unit_evidence is not None else items.pop(0)
    first = replace(first, coverage_limits=(*first.coverage_limits, *limits))
    return (first, *items, *_issue_evidence(outcome, own))


def _issue_evidence(
    outcome: CollectionOutcome, own: Sequence[CommitRecord]
) -> list[EvidenceItem]:
    """본인 기여 근거 커밋 메시지가 가리킨, 이슈 목록으로 수집한 이슈의 근거(번호순).

    이슈 조회가 허용된 요청만이다. 번호 읽기는 issue_references 규칙이다. 같은
    이슈를 가리킨 서로 다른 작업이면 이슈 근거가 후보마다 따로 들어간다(사례 C6). 근거 커밋
    상한(20건) 밖의 본인 기여 근거 커밋이 가리킨 이슈도 넣는다.
    """
    if "ISSUE" not in outcome.allowed_resource_types:
        return []
    referenced: set[int] = set()
    for record in own:
        referenced |= issue_references(record.message)
    issues: dict[int, IssueRecord] = {}
    for issue in outcome.issues:
        if issue.number in referenced:
            issues.setdefault(issue.number, issue)
    return [
        outcome.evidence_for(issues[number]).to_evidence_item(_ISSUE_SCOPE)
        for number in sorted(issues)
    ]


def _merge_same_identity(
    candidates: Iterable[EligibleCandidate], commits: Mapping[str, CommitRecord]
) -> tuple[tuple[EligibleCandidate, ...], int]:
    """값이 같은 후보를 첫 후보에 합친다. B는 두 번째 후보의 내용을 저장하지 않기 때문이다.

    작업 사실과 기록의 글은 첫 후보의 것을 그대로 둔다(최대 2줄, BR4.5). 출처·판본이 같은 근거는
    하나로 두되 관측 사실과 한계를 순서를 지키며 합친다. 귀속 범위가
    다르면 첫 근거의 범위를 두고 그 사실을 한계로 남긴다. 합친 근거는 단위 근거 먼저, 본인 커밋
    근거는 최근 것부터 다시 놓는다. commits는 본인 커밋 근거의 작성 시각을 찾는 데 쓴다.
    """
    merged: dict[str, EligibleCandidate] = {}
    count = 0
    for candidate in candidates:
        first = merged.get(candidate.work_identity)
        if first is None:
            merged[candidate.work_identity] = candidate
            continue
        count += 1
        evidence: dict[tuple[str, str], EvidenceItem] = {}
        for item in (*first.evidence, *candidate.evidence):
            key = (item.source_url, item.source_revision)
            kept = evidence.get(key)
            evidence[key] = item if kept is None else _merge_evidence(kept, item)
        merged[candidate.work_identity] = replace(
            first,
            grouping_limitations=tuple(
                dict.fromkeys(
                    (*first.grouping_limitations, *candidate.grouping_limitations)
                )
            ),
            evidence=_evidence_order(evidence.values(), commits),
            # 남긴 후보의 목록 뒤에 다른 후보의 새 SHA를 처음 나온 순서로 잇는다(CR2 BR2.1).
            own_commit_shas=tuple(
                dict.fromkeys((*first.own_commit_shas, *candidate.own_commit_shas))
            ),
        )
    return tuple(merged.values()), count


def _with_work_times(
    candidate: EligibleCandidate, commits: Mapping[str, CommitRecord]
) -> EligibleCandidate:
    """합친 본인 커밋의 작성 시각(authored_at) 최소·최대를 싣는다(NC3 BR4.1). 커밋 시각은 쓰지 않는다.

    본인 커밋이 없거나 그 기록이 판정에 쓴 커밋 묶음에 없으면 후보 판정의 결함이라 ValueError를 낸다.
    """
    if not candidate.own_commit_shas:
        raise ValueError("작업 시각을 정할 본인 커밋이 없다")
    authored = []
    for sha in candidate.own_commit_shas:
        record = commits.get(sha)
        if record is None:
            raise ValueError("작업 시각을 정할 본인 커밋 기록이 없다")
        authored.append(record.authored_at)
    return replace(candidate, first_work_at=min(authored), last_work_at=max(authored))


def _merge_evidence(kept: EvidenceItem, other: EvidenceItem) -> EvidenceItem:
    limits = [*kept.coverage_limits, *other.coverage_limits]
    if other.contribution_scope != kept.contribution_scope:
        limits.append(_SCOPE_DIFFERS)
    return replace(
        kept,
        represented_facts=tuple(
            dict.fromkeys((*kept.represented_facts, *other.represented_facts))
        ),
        coverage_limits=tuple(dict.fromkeys(limits)),
    )


def _evidence_order(
    items: Iterable[EvidenceItem], commits: Mapping[str, CommitRecord]
) -> tuple[EvidenceItem, ...]:
    """단위 근거(받은 순서) 먼저, 그다음 본인 커밋 근거를 newest_first와 같은 순서로, 이슈 근거(받은
    순서)는 맨 뒤에."""
    units: list[EvidenceItem] = []
    own: dict[str, EvidenceItem] = {}
    issues: list[EvidenceItem] = []
    for item in items:
        if item.contribution_scope in _OWN_COMMIT_SCOPES:
            own[item.source_revision] = item
        elif item.contribution_scope == _ISSUE_SCOPE:
            issues.append(item)
        else:
            units.append(item)
    ordered = newest_first(commits[sha] for sha in own)
    return (*units, *(own[record.sha] for record in ordered), *issues)


def _log(
    request: CheckedRequest,
    outcome: CollectionOutcome,
    candidates: int,
    tally: _Tally,
    merged: int,
    assignment: tuple[int, int],
) -> None:
    """건수만 남긴다. SHA·경로·제목·본문·토큰은 남기지 않는다.

    assignment는 (받은 소속 커밋 수, 소속 변경을 빼고 버린 단위 수)다(CR2 NFR4.5). 단위를 정하기 전에
    끝난 줄은 둘 다 0이다(계산 전).
    """
    logger.log(
        logging.WARNING if merged else logging.INFO,
        "후보 판정 종료: requestId=%s attemptId=%s completed=%s candidates=%d "
        "insufficient=%d belowCriteria=%d undetermined=%d heldAfterStop=%d "
        "rangeLimited=%d heldByIncompleteLists=%d sameIdentityMerged=%d "
        "assignedShas=%d assignedUnits=%d",
        request.request_id,
        request.attempt_id,
        outcome.completed,
        candidates,
        tally.insufficient,
        tally.below_criteria,
        tally.undetermined,
        tally.held_after_stop,
        tally.range_limited,
        tally.held_by_incomplete_lists,
        merged,
        *assignment,
    )
