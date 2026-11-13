"""후보 입력 어댑터(#120): 후보마다 생성에 쓸 수 있는 본인 커밋 기록을 찾는다.

후보에는 커밋 메시지·PR 글·변경 내용을 넣지 않았으므로(#118), 같은 수집 결과와 후보 판정에 넘긴 같은 소속
커밋 집합으로 `group(outcome, assigned)`를 다시 불러 단위와 커밋 기록을 얻는다(CR2 BR1.6, 집합이 다르면
커밋 묶음의 열쇠가 달라져 후보에 맞는 단위를 찾지 못한다). 단위와 후보는 순서가 아니라 `work_identity` 값으로
맞춘다(후보가 되지 않은 단위가 있고, 값이 같은 후보는 첫 후보에 합쳐졌다). 후보 판정·근거·순서는 바꾸지
않는다.

재료 커밋은 다음을 모두 지키는 근거의 커밋이다(순서대로 확인한다).
1. 근거 주소 전체가 그 판본의 커밋 화면 주소와 같다. PR 없는 병합의 단위 근거도 `/commit/{병합 SHA}`이고,
   저장소 이름이 `commit`이면 PR 주소에도 `/commit/`이 들어가며, PR 근거 판본(머리 SHA)은 본인 커밋 SHA와
   같을 수 있다. 그래서 `/commit/` 부분 문자열이나 SHA만으로 커밋 근거를 정하지 않는다.
2. 판본이 맞는 단위들의 기여 근거 변경에서 연동 계정이 작성자로 기록된 커밋(own_commits)이다.
3. 그 커밋 기록의 변경 내용을 받았다(FETCHED). 받았어도 파일이 없거나 patch가 없을 수 있으므로
   쓸 수 있는 줄은 request.py가 다시 고른다.
"""

from collections.abc import Mapping
from dataclasses import dataclass

from app.candidates import group, work_identity
from app.candidates.grouping import GroupedUnit, OtherAuthors
from app.candidates.identity import CommitsUnit
from app.collection.collect import CollectionOutcome
from app.collection.evidence import source_url
from app.collection.identifiers import GitHubAccount
from app.collection.records import CommitRecord, DetailStatus
from app.collection.relations import newest_first
from app.processing.generation import EligibleCandidate, GenerationOutput
from app.processing.request_check import CheckedRequest


@dataclass(frozen=True)
class CandidateMaterial:
    # 결과 안의 후보 순서(0부터). 결과 순서는 이 값대로 둔다.
    position: int
    candidate: EligibleCandidate
    # 근거 순서대로, 근거에 든 본인 커밋. 변경 내용을 받았는지와 무관하다(생성 순서에 쓴다).
    evidence_own: tuple[CommitRecord, ...]
    # 그 가운데 변경 내용을 받은(FETCHED) 커밋. 생성 재료는 여기서만 고른다.
    commits: tuple[CommitRecord, ...]
    # 본인 커밋 근거의 자리: 커밋 SHA → 후보 근거 목록 안의 순서. 한계 문구를 붙일 때 쓴다.
    evidence_index: Mapping[str, int]
    # 후보에 맞는 단위들의 본인 기여 근거 커밋 전체(근거 20건 상한 밖 포함).
    own_commits: frozenset[str]
    # 같은 단위에 연동 계정이 작성자로 기록되지 않은 커밋이 있는가(PR은 커밋 목록 전체, 병합은 들인
    # 커밋 전체, 커밋 묶음은 묶인 커밋).
    other_authors: OtherAuthors
    # 판정에 쓴 커밋 기록 전체. 제목의 부모·자식 관계를 따라갈 때 쓴다.
    records: Mapping[str, CommitRecord]

    def priority(self) -> tuple[int, float, str, int]:
        """생성 순서(2026-10-12 결정 9·14): 근거에 든 본인 커밋의 가장 최근 작성 시각이 늦은 것부터,
        같으면 그 커밋의 SHA순, 그것도 같으면 결과 순서. 결과 순서는 바꾸지 않는다."""
        if not self.evidence_own:
            return (1, 0.0, "", self.position)
        newest = newest_first(self.evidence_own)[0]
        return (0, -newest.authored_at.timestamp(), newest.sha, self.position)


def gather(
    request: CheckedRequest,
    outcome: CollectionOutcome,
    built: GenerationOutput,
    assigned: frozenset[str] = frozenset(),
) -> tuple[CandidateMaterial, ...]:
    """후보마다 재료를 찾는다. 후보가 없으면 묶음을 다시 부르지 않는다.

    assigned는 built를 만들 때 넘긴 소속 커밋 집합이다(같은 값이어야 한다).

    후보가 있는데 저장소·연동 계정이나 관계 조회 결과가 없거나, 후보에 맞는 단위가 없으면 부른 쪽이나
    후보 판정의 결함이라 ValueError를 낸다(근거 부족이나 0건으로 숨기지 않는다).
    """
    if not built.candidates:
        return ()
    repository, account = outcome.repository, outcome.linked_account
    if repository is None or account is None:
        raise ValueError("후보가 있는데 수집 결과에 저장소·연동 계정이 없다")
    grouping = group(outcome, assigned)
    units: dict[str, list[GroupedUnit]] = {}
    for unit in grouping.units:
        key = work_identity(request.source_mode, request.repository_id, unit.unit)
        units.setdefault(key, []).append(unit)
    materials: list[CandidateMaterial] = []
    for position, candidate in enumerate(built.candidates):
        matched = units.get(candidate.work_identity)
        if not matched:
            raise ValueError("후보에 맞는 묶음 단위가 없다")
        own = frozenset(
            sha
            for unit in matched
            for change in unit.changes
            if change.contributing
            for sha in change.own_commits
        )
        evidence_own: list[CommitRecord] = []
        evidence_index: dict[str, int] = {}
        for index, item in enumerate(candidate.evidence):
            sha = item.source_revision
            if item.source_url != source_url(repository, "COMMIT", sha):
                continue
            if sha not in own:
                continue
            record = grouping.commits.get(sha)
            if record is None:
                raise ValueError("본인 커밋 근거의 커밋 기록이 없다")
            if sha in evidence_index:
                raise ValueError("같은 본인 커밋 근거가 두 번 들었다")
            evidence_index[sha] = index
            evidence_own.append(record)
        materials.append(
            CandidateMaterial(
                position=position,
                candidate=candidate,
                evidence_own=tuple(evidence_own),
                commits=tuple(
                    record
                    for record in evidence_own
                    if record.changes_status is DetailStatus.FETCHED
                    and record.changes is not None
                ),
                evidence_index=evidence_index,
                own_commits=own,
                other_authors=_other_authors(matched, grouping.commits, account),
                records=grouping.commits,
            )
        )
    return tuple(materials)


def _other_authors(
    units: list[GroupedUnit],
    records: Mapping[str, CommitRecord],
    account: GitHubAccount,
) -> OtherAuthors:
    found: set[OtherAuthors] = set()
    for unit in units:
        if isinstance(unit.unit, CommitsUnit):
            found.add(_bundle_other_authors(unit, records, account))
        else:
            found.add(unit.other_authors or "UNKNOWN")
    if "PRESENT" in found:
        return "PRESENT"
    return "UNKNOWN" if "UNKNOWN" in found else "ABSENT"


def _bundle_other_authors(
    unit: GroupedUnit, records: Mapping[str, CommitRecord], account: GitHubAccount
) -> OtherAuthors:
    unknown = False
    for change in unit.changes:
        for sha in change.commits:
            record = records.get(sha)
            if record is None:
                unknown = True
            elif not account.same_account(record.author):
                return "PRESENT"
    return "UNKNOWN" if unknown else "ABSENT"
