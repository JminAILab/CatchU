"""후보 구성(#118): 묶음 결과를 적합 후보·미제공 수·실패로 바꾼다.

입구는 `build_candidates(request, outcome)`다. 단위 판정은 grouping.py가 하고, 여기서는 후보 자격
(본인 기여·실패와의 분리), notProvided 집계, 후보 문장과 근거를 만든다.

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
- 제목: 만들지 않는다(title=None). 제목은 #120이 만든다(2026-10-08 팀장 결정 「Catch 제목」). 결과
  조합이 작업 사실 첫 항목을 제목에 넣는 것은 계약 정정과 B·C·E 수정이 병합되기 전까지의 임시
  동작이라, 첫 항목은 후보마다 다른 단위 이름(PR 번호·병합 SHA·커밋 SHA, 나눈 부분은 가리키는 이슈)
  으로 둔다.
- 문장: 구조 값(번호·SHA·상태)만 쓰고 제목·본문·커밋 메시지·브랜치 이름은 넣지 않는다. 작업
  사실(workFacts)·나의 기여(subjectContribution)에는 CatchU가 센 숫자(몇 건 중 몇 건, 줄 수 합계,
  본인 커밋 수)를 쓰지 않는다. 근거 한계에도 센 본인 커밋 수 대신 정해 둔 상한 값을 쓴다. 커밋의
  파일·줄 수와 PR 커밋 수 같은 원본 숫자는 근거의 관측 사실에만 있다. 본인 기여는 '작성자로 기록된'
  커밋으로 적는다. PR·PR 없는 병합은 작업 사실 둘째 항목에 연동 계정이 작성자로 기록되지 않은 커밋이
  있다·없다·있는지 알 수 없다를 적는다(2026-10-08 팀장 결정 「본인 기여의 뜻」·「수신자에게 나가는
  숫자와 근거 순서」). 묶음 설명(groupingBasis)은 판정에 실제로 쓴 근거만 적는다.
- 근거 순서: PR·병합 단위는 그 단위 근거 먼저, 그다음 본인 기여 근거 커밋을 최근 것부터 최대 20건.
  커밋 묶음은 본인 커밋을 최근 것부터. 이슈 조회가 허용된 요청이면 맨 뒤에 그 본인 커밋이 가리킨
  수집한 이슈를 번호순으로 더한다(사례 C6). B는 이 순서대로 보인다.
- workIdentity는 identity.py로만 만든다. 한 결과 안에서 값이 같은 후보가 생기면(생기면 안 된다)
  B로 보내기 전에 첫 후보에 합친다. 출처·판본이 같은 근거는 관측 사실과 한계를 합쳐 남긴다.
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
    OtherAuthors,
    group,
)
from app.candidates.identity import (
    CommitsUnit,
    MergeUnit,
    PullRequestUnit,
    work_identity,
)
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
# 다른 계정 커밋이 섞였는지. 숫자 없이 있다·없다·알 수 없다로 쓰고, 없다는 범위를 끝까지 받았을
# 때만이다(2026-10-08 팀장 결정 「수신자에게 나가는 숫자와 근거 순서」).
_PULL_OTHER_AUTHORS: dict[OtherAuthors, str] = {
    "PRESENT": "이 PR 커밋 목록에 연동 계정이 작성자로 기록되지 않은 커밋이 있다",
    "ABSENT": "이 PR 커밋 목록에 연동 계정이 작성자로 기록되지 않은 커밋이 없다",
    "UNKNOWN": (
        "이 PR 커밋 목록에 연동 계정이 작성자로 기록되지 않은 커밋이 있는지 알 수 없다"
        "(목록을 끝까지 확인하지 못함)"
    ),
}
_MERGE_OTHER_AUTHORS: dict[OtherAuthors, str] = {
    "PRESENT": "이 병합이 들인 커밋에 연동 계정이 작성자로 기록되지 않은 커밋이 있다",
    "ABSENT": "이 병합이 들인 커밋에 연동 계정이 작성자로 기록되지 않은 커밋이 없다",
    "UNKNOWN": (
        "이 병합이 들인 커밋에 연동 계정이 작성자로 기록되지 않은 커밋이 있는지 알 수 없다"
    ),
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
_SPLIT_REASONS = {
    NoteKind.NOT_SPLIT_STOPPED: "수집이 멈춰 나눌 근거를 끝까지 확인하지 못해",
    NoteKind.NOT_SPLIT_MEMBERSHIP: "PR 커밋 목록을 모두 확인하지 못해",
    NoteKind.NOT_SPLIT_DETAILS: "일부 커밋의 변경 파일을 모두 확인하지 못해",
    NoteKind.NOT_SPLIT_OVERLAP: "커밋들이 같은 파일을 함께 고쳐 서로 다른 작업으로 구별할 수 없어",
    NoteKind.NOT_SPLIT_NO_OWN: "변경 파일이 겹치지 않는 부분 가운데 본인 변경이 없는 부분이 있어",
    NoteKind.NOT_SPLIT_ISSUES: "변경 파일이 겹치지 않는 부분들이 가리키는 이슈가 비었거나 서로 겹쳐",
}

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
    request: CheckedRequest, outcome: CollectionOutcome
) -> GenerationOutput:
    """수집 결과에서 적합 후보·미제공 수·실패를 만든다.

    첫 호출 전에 멈춘 수집(저장소 없음)은 실패만 돌려준다. 그런데 실패가 없거나, 저장소를 확인한
    수집 결과에 관계 조회 결과가 없거나, 수집 결과끼리 맞지 않으면 부른 쪽이나 수집의 결함이라
    ValueError를 낸다(grouping.py).
    """
    failures = outcome.stage_failures()
    tally = _Tally()
    if outcome.repository is None or outcome.linked_account is None:
        if not failures:
            raise ValueError("저장소를 확인하지 않은 수집 결과에 수집 실패가 없다")
        _log(request, outcome, 0, tally, 0)
        return GenerationOutput(failures=failures)
    grouping = group(outcome)
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
    candidates, merged = _merge_same_identity(built, grouping.commits)
    counts: tuple[tuple[NotProvidedReason, int], ...] = (
        ("INSUFFICIENT_EVIDENCE", tally.insufficient),
        ("BELOW_CRITERIA", tally.below_criteria),
        ("UNDETERMINED", tally.undetermined),
    )
    _log(request, outcome, len(candidates), tally, merged)
    return GenerationOutput(
        candidates=candidates,
        not_provided=tuple(
            NotProvided(reason, count) for reason, count in counts if count
        ),
        failures=failures,
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
    text = _text(outcome, grouping, unit, own, unit_commits)
    return EligibleCandidate(
        work_identity=work_identity(
            request.source_mode, request.repository_id, unit.unit, unit.parts
        ),
        # #118은 제목을 만들지 않는다(2026-10-08 팀장 결정 「Catch 제목」). 제목은 #120이 만든다.
        title=None,
        work_facts=text.facts,
        subject_contribution=text.contribution,
        grouping_basis=text.basis,
        grouping_limitations=tuple(
            _limitation(note, unit.unit)
            for note in unit.notes
            if note.kind not in _EVIDENCE_NOTES
        ),
        evidence=_evidence(outcome, text, own, unit_commits),
        draft=DraftOutcome.not_generated(),
        reflection=ReflectionOutcome.not_generated(),
    )


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
) -> _Text:
    evidence_limits = tuple(
        _EVIDENCE_NOTES[note.kind]
        for note in unit.notes
        if note.kind in _EVIDENCE_NOTES
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
    match key:
        case PullRequestUnit():
            return _pull_request_text(
                outcome, grouping, unit, key, where, evidence_limits
            )
        case MergeUnit():
            return _merge_text(outcome, grouping, unit, key, where, evidence_limits)
        case CommitsUnit():
            return _commits_text(grouping, unit, key, evidence_limits)
        case _:
            assert_never(key)


def _where(own: Sequence[CommitRecord], unit_commits: set[str]) -> _Where:
    inside = sum(1 for record in own if record.sha in unit_commits)
    if inside == len(own):
        return "INSIDE"
    return "ELSEWHERE" if inside == 0 else "MIXED"


def _contribution(context: str | None = None) -> str:
    """나의 기여. 센 숫자를 쓰지 않는다(2026-10-08 팀장 결정)."""
    text = "연동 GitHub 계정이 작성자로 기록된 커밋"
    return text if context is None else f"{text}({context})"


def _other_authors_fact(
    sentences: Mapping[OtherAuthors, str], unit: GroupedUnit
) -> str:
    if unit.other_authors is None:
        raise ValueError("PR·병합 단위에는 다른 계정 커밋 섞임 판정이 있어야 한다")
    return sentences[unit.other_authors]


def _part_texts(name: str, unit: GroupedUnit) -> tuple[str, list[str]]:
    """나눈 부분의 (첫 작업 사실, 묶음 설명 첫 문장). name은 「PR #7」·「병합 abc…」 같은 단위 이름이다.

    부분끼리 가리키는 이슈가 겹치지 않으므로 첫 작업 사실이 부분마다 다르다.
    """
    issues = _issues(unit.issues)
    basis = [
        f"{name}에서 변경 파일이 겹치지 않고 가리키는 이슈가 서로 다른 부분을 나눴다. "
        f"이 후보는 그 가운데 커밋 {len(unit.parts)}건(가리키는 이슈 {issues})이다."
    ]
    return f"{name}에서 나눈 부분(가리키는 이슈 {issues})", basis


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
    facts = [
        f"PR #{number}, 상태 {_state(record)}",
        _other_authors_fact(_PULL_OTHER_AUTHORS, unit),
    ]
    if unit.parts:
        part_fact, basis = _part_texts(f"PR #{number}", unit)
        facts.insert(0, part_fact)
    else:
        basis = [f"PR #{number} 전체를 한 작업으로 묶었다."]
    basis.append(f"커밋의 PR 소속을 확인한 근거: {_sources(unit.sources)}.")
    if unit.moved_out:
        basis.append(
            f"이 PR 커밋 목록의 변경 {unit.moved_out}건은 다른 PR에도 담겨 있어 배정 규칙"
            "(먼저 병합된 PR, 병합된 PR이 없으면 번호가 작은 PR)에 따라 그 PR에 배정했다."
        )
    basis.extend(_merged_in(unit))
    entry = grouping.pull_request_commits.get(number)
    return _Text(
        facts=tuple(facts),
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
    facts = [
        f"PR 없이 병합한 병합 커밋 {sha12}",
        _other_authors_fact(_MERGE_OTHER_AUTHORS, unit),
    ]
    if unit.parts:
        part_fact, basis = _part_texts(f"병합 {sha12}", unit)
        facts.insert(0, part_fact)
    else:
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
        facts=tuple(facts),
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
    grouping: Grouping,
    unit: GroupedUnit,
    key: CommitsUnit,
    evidence_limits: tuple[str, ...],
) -> _Text:
    """커밋 묶음의 문장. 묶음 설명은 실제로 이은 근거만 적는다."""
    checked = MembershipSource.LOOKUP in unit.sources
    where = "PR·병합에 속하지 않은" if checked else "병합에 속하지 않은"
    if len(key.commits) == 1:
        fact = f"{where} 본인 커밋 {key.commits[0][:12]}"
        first = [f"{where} 본인 커밋 하나를 한 작업으로 두었다."]
    else:
        newest = newest_first(grouping.commits[sha] for sha in key.commits)[0]
        fact = f"{where} 본인 커밋 묶음(가장 최근 커밋 {newest.sha[:12]})"
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
    """여러 커밋을 이은 근거. 부모·변경 파일 겹침과 같은 변경을 쓴 것만 적는다."""
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
    if not sentences:
        raise ValueError("여러 커밋의 묶음에 이은 근거가 없다")
    sentences.append("작성 시각 차이와 메시지 비슷함은 보지 않았다.")
    return sentences


def _state(record: PullRequestRecord) -> str:
    if record.merged_at is not None:
        return "병합됨"
    return "열림" if record.state == "open" else "닫힘"


def _issues(numbers: Iterable[int]) -> str:
    return "·".join(f"#{number}" for number in numbers)


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


def _limitation(note: Note, unit: PullRequestUnit | MergeUnit | CommitsUnit) -> str:
    match note.kind:
        case NoteKind.NOT_SPLIT_AUTHOR_BOUNDARY:
            # 2026-10-08 팀장 결정 「한 PR·병합 안의 서로 다른 번호」의 문장. 커밋 묶음에는 붙지 않는다.
            boundary = "한 PR로" if isinstance(unit, PullRequestUnit) else "한 병합으로"
            return (
                f"본인 커밋이 서로 다른 번호 {note.count}개를 가리키지만, 작성자가 "
                f"{boundary} 묶은 경계를 따라 한 작업으로 두었다"
            )
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
            NoteKind.NOT_SPLIT_STOPPED
            | NoteKind.NOT_SPLIT_MEMBERSHIP
            | NoteKind.NOT_SPLIT_DETAILS
            | NoteKind.NOT_SPLIT_OVERLAP
            | NoteKind.NOT_SPLIT_NO_OWN
            | NoteKind.NOT_SPLIT_ISSUES
        ):
            return (
                f"본인 커밋이 서로 다른 이슈 {note.count}개를 가리키지만 "
                f"{_SPLIT_REASONS[note.kind]} 나누지 않고 한 작업으로 두었다"
            )
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

    이슈 조회가 허용된 요청만이다. 번호 읽기는 나누기 신호와 같은 규칙(issue_references)이다. 같은
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

    출처·판본이 같은 근거는 하나로 두되 관측 사실과 한계를 순서를 지키며 합친다. 귀속 범위가
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
            work_facts=tuple(dict.fromkeys((*first.work_facts, *candidate.work_facts))),
            grouping_limitations=tuple(
                dict.fromkeys(
                    (*first.grouping_limitations, *candidate.grouping_limitations)
                )
            ),
            evidence=_evidence_order(evidence.values(), commits),
        )
    return tuple(merged.values()), count


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
) -> None:
    """건수만 남긴다. SHA·경로·제목·본문·토큰은 남기지 않는다."""
    logger.log(
        logging.WARNING if merged else logging.INFO,
        "후보 판정 종료: requestId=%s attemptId=%s completed=%s candidates=%d "
        "insufficient=%d belowCriteria=%d undetermined=%d heldAfterStop=%d "
        "rangeLimited=%d heldByIncompleteLists=%d sameIdentityMerged=%d",
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
    )
