"""후보 묶음(#118): 수집 관측만으로 변경의 작업 단위를 정한다.

`docs/CatchU_work_identity_unit.md`의 작업 단위·배정과 「PR 소속과 같은 변경을 확인하는
근거」를 옮겼다. 입력은 `CollectionOutcome`(기본 브랜치 창·PR·이슈와 관계 관측)뿐이고 GitHub를
부르지 않는다. 같은 작업이라는 결론을 밖에서 받지 않고, 모든 판정을 관측에서 끌어낸다.
`group()`이 아래 단계를 차례로 부른다.

1. 소속 관측: PR 커밋 목록 → 병합된 PR의 merge_commit_sha → 연결 PR 조회 순으로 본다. 연동 계정이
   작성자로 기록된 커밋(작성자 계정의 숫자 ID로만 본다. 커미터·PR을 연 계정·이름·메일·글은 쓰지
   않는다)은 ASSIGNED·OUTSIDE·RANGE_LIMITED·CONFLICT·STOPPED 가운데 하나가 된다. 다른 계정 커밋은
   연결 PR을 조회하지 않으므로 PR 목록에 없으면 병합 단위의 구성으로만 쓴다. 커밋 목록을 다 받지
   못한 PR(병합되지 않고 닫혔거나 기본 브랜치가 아닌 곳이 대상)이 있으면 연결 PR 조회가 빈
   목록이어도 PR 밖을 확정하지 않고 단위 미확정으로 보류한다(2026-10-09 팀장 결정).
2. PR 없는 병합: PR 밖 커밋을 기본 브랜치 창의 부모 관계(app.collection.graph)로 가장 안쪽 병합에
   넣는다. 흡수 병합이 기준 브랜치에서 들인 커밋은 바깥 병합이 들인 커밋에서 빼 원래 단위에 둔다.
   첫 부모 쪽이 창 밖으로 열린 병합은 경계 비교(첫 부모...병합)를 끝까지 받았을 때만 그 결과로
   들인 커밋을 정한다. 비교를 다 받지 못했거나 비교가 없으면 자료 범위 한계, 수집이 멈춰 부르지
   못했으면 확인 중단이다. 추가 기준 브랜치 사슬을 끝까지 따라가지 못했으면 본선에 없는 병합은
   그 브랜치를 받아온 흡수 병합인지 모르므로 자료 범위 한계다. 들인 커밋이 창 밖에 닿거나 창의
   머리가 하나가 아니면 확정하지 않는다. 목록 단계에서 멈춰 창이 잘렸을 수 있으면 확인 중단이다.
3. 같은 변경: SHA가 다른 두 커밋은 관계 근거(cherry-pick 표시·재제출)와 공백을 무시한 diff(관측한
   파일 모드 포함)가 함께 있을 때만 합친다. 모드를 관측하지 못했거나 diff가 다르면 합치지 않고
   양쪽에 한계를 붙인다. 수집이 멈춰 비교하지 못한 쌍(변경 내용이나 모드 확인에 닿지 못함)으로
   이어진 변경들은 _roots_to_hold 순서로 본다. 이미 보류된 변경이 하나 이어졌으면 그 보류는 두고
   나머지를 확인 중단으로 보류하고, 둘 이상이면 세는 수가 비교 결과에 달리므로 모두 확인 중단으로
   둔다. 보류된 변경이 없고 모두 서로 다른 PR·PR 없는 병합에 소속을 확인했으면 보류하지 않고
   양쪽에 한계를 붙인다. 그 밖에는 가장 앞선 단위의 변경만 두고 나머지를 보류한다(그 단위가 커밋
   묶음이고 그런 변경이 둘 이상이면 모두 보류한다).
4. 배정: 같은 변경은 PR(먼저 병합된 PR, 없으면 작은 번호) → PR 없는 병합(먼저 들인 병합) → 커밋
   묶음 순으로 한 단위에만 둔다. 병합끼리는 창의 조상 관계로 먼저 들인 쪽을 정하고, 조상 관계가
   없으면 부모를 모두 자리에 둔 커밋 가운데 커밋 시각이 이른 쪽, 같으면 작은 SHA를 앞에 둔다. 목록
   순서는 쓰지 않는다. 배정할 PR이나 그보다 앞선 PR의 커밋 목록을 수집이 멈춰 보지 못했으면
   보류한다. 먼저 병합된 PR의 커밋 목록을 정한 범위대로 조회했지만 다 받지 못했으면 보류하지 않고
   뒤 PR 단위의 근거 한계로 남긴다(2026-10-09 팀장 결정).
5. 커밋 묶음(방법 B): 남은 PR 밖 본인 커밋을, 부모가 하나뿐이고 그 부모도 커밋 묶음으로 갈 본인
   커밋이며 변경 파일이 겹칠 때만 잇는다. 같은 변경으로 합친 커밋들은 부모와 관계없이 한 묶음이다.
   시각 차이·메시지 유사도는 쓰지 않는다. 이웃이 확인 중단으로 보류됐거나 이웃과 잇는지 볼 변경
   내용을 수집이 멈춰 받지 못했으면 그 묶음 전체를 보류한다. 목록 단계에서 멈춰 창이 잘렸을 수
   있으면 창 밖 부모를 둔 커밋도 보류한다.
6. 단위 목록: PR·PR 없는 병합 단위는 이슈 번호로 나누지 않고 단위 전체를 후보 하나로 둔다. 이슈
   조회가 허용돼도 같고, 나누지 않은 이유의 한계도 남기지 않는다(CR1 FR2.1, BR1.1·BR1.2).
7. 소속 빼기(CR2): 단위를 위 규칙대로 다 정한 뒤, 이미 다른 Catch에 속한 커밋(맥락 조회의 소속 커밋
   집합)이 든 변경을 각 단위에서 뺀다. 변경의 관측 커밋이나 본인 기여 커밋 가운데 하나라도 소속이면
   그 변경 전체를 뺀다. 뺀 단위에 본인 기여 변경이 남지 않으면 단위를 버리고 `assigned_units`로만
   센다(미제공 아님). PR·병합 단위는 열쇠 그대로, 커밋 묶음은 남은 커밋으로 단위를 다시 만든다.
   보류와 관측은 바꾸지 않는다. 집합이 비면 결과가 지금과 같다(`docs/commit-assignment.md`).

병합 커밋(부모 둘 이상)은 변경으로 세지 않고 경계로만 쓴다. 후보 문장·근거·집계는 build.py가 한다.
문장에 쓰도록 단위마다 두 가지를 더 남긴다. PR·PR 없는 병합에 연동 계정이 작성자로 기록되지 않은
커밋이 섞였는지(있다·없다·알 수 없다, PR은 커밋 목록 전체, 병합은 들인 커밋 전체)와, 커밋 묶음을
실제로 이은 근거(같은 변경, 부모와 변경 파일 겹침)다.

수집 결과끼리 맞지 않으면 ValueError를 낸다. 수집을 마쳤다는 결과에 멈춘 단계나 닿지 못한
(NOT_REACHED) 조회·상세·목록이 있을 때, 수집을 마쳤는데 PR 밖 본인 커밋이나 그 커밋을 들인 병합의
연결 PR 조회 기록이 없을 때, 연결 PR 조회(병합 커밋 포함)가 알려지지 않은 PR을 돌려줬을 때,
알려지지 않은 PR의 커밋 목록이 있을 때, PR 커밋 목록으로만 본 커밋이 받은 목록에 없을 때다. 수집이나
부른 쪽의 결함이므로 근거 부족이나 0건으로 숨기지 않는다.
"""

from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Literal

from app.candidates.identity import CommitsUnit, MergeUnit, PullRequestUnit
from app.candidates.same_change import (
    cherry_pick_sources,
    content_patch_id,
    stable_patch_id,
)
from app.collection.collect import CollectionOutcome
from app.collection.graph import BroughtIn, WindowGraph, is_merge
from app.collection.records import (
    CommitRecord,
    DetailStatus,
    PullRequestRecord,
)
from app.collection.relations import (
    AssociatedPulls,
    Lookup,
    MergeBoundary,
    PullRequestCommits,
    RelationObservations,
    default_resubmission,
    pull_request_less_merges,
    pull_request_precedence,
)


class Membership(StrEnum):
    """변경 하나의 소속 판정 상태."""

    # PR 단위를 정했다.
    ASSIGNED = "ASSIGNED"
    # PR 밖이 확정됐다(연결 PR 조회가 빈 목록이고 수집한 PR 커밋 목록에 없다). PR 조회가 허용되지
    # 않은 요청의 커밋도 여기다. 병합이 정해지면 그 병합에, 아니면 커밋 묶음으로 간다.
    OUTSIDE = "OUTSIDE"
    # 자료 범위 한계로 소속을 확인하지 못했다(연결 PR이 한 쪽보다 많음, 창 밖 경계 등).
    RANGE_LIMITED = "RANGE_LIMITED"
    # 필요한 조회를 마쳤는데 근거끼리 답이 어긋난다(단위 미확정). 정한 범위대로 조회를 마쳤지만
    # 커밋 목록을 다 받지 못한 PR과 겹칠 수 있어 PR 밖을 확정하지 않은 커밋도 여기다(사유는
    # HoldReason).
    CONFLICT = "CONFLICT"
    # 수집이 상한·오류로 멈춰 확인하지 못했다(확인 중단).
    STOPPED = "STOPPED"


# 보류 상태. 앞의 것이 우선한다(한 변경의 커밋 하나라도 확인 중단이면 확인 중단).
_HOLDS = (Membership.STOPPED, Membership.CONFLICT, Membership.RANGE_LIMITED)


class HoldReason(StrEnum):
    """단위 미확정(CONFLICT) 가운데 운영 로그에서 따로 세는 사유."""

    # 커밋 목록을 다 받지 못한 PR(병합되지 않고 닫혔거나 기본 브랜치가 아닌 곳이 대상)이 있어,
    # 연결 PR 조회가 빈 목록이어도 그 PR의 커밋일 수 있어 PR 밖을 확정하지 않았다(2026-10-09
    # 팀장 결정, 「커밋이 250개 넘는 PR」).
    UNSEEN_PULL_REQUEST_COMMITS = "UNSEEN_PULL_REQUEST_COMMITS"


class MembershipSource(StrEnum):
    """단위 소속의 근거. 후보의 묶음 설명에 쓴다."""

    PULL_REQUEST_COMMITS = "PULL_REQUEST_COMMITS"
    # PR 커밋 목록 250건을 넘어 비교 API로 전체를 받은 목록.
    COMPARE = "COMPARE"
    MERGE_COMMIT_SHA = "MERGE_COMMIT_SHA"
    LOOKUP = "LOOKUP"
    MERGE_PARENTS = "MERGE_PARENTS"


_LISTED = frozenset({MembershipSource.PULL_REQUEST_COMMITS, MembershipSource.COMPARE})

# 단위의 커밋 가운데 연동 계정이 작성자로 기록되지 않은 커밋(작성자 계정이 없는 커밋 포함)이
# 있다·없다·있는지 알 수 없다. 없다는 범위의 커밋을 모두 보았을 때만이다.
OtherAuthors = Literal["PRESENT", "ABSENT", "UNKNOWN"]


@dataclass(frozen=True)
class Observation:
    """병합 아닌 커밋 하나의 소속 판정 결과.

    다른 계정 커밋은 연결 PR을 조회하지 않으므로 PR 목록·merge_commit_sha에 없으면 OUTSIDE로 두고
    병합 단위의 구성으로만 쓴다. 후보·집계에서 빼는 것은 own(연동 계정이 작성자로 기록됐는가)으로
    정한다. PR 커밋 목록을 관측한 판본(PR 머리 커밋)과 끝까지 읽었는지는
    `Grouping.pull_request_commits`에 있다.
    """

    sha: str
    membership: Membership
    # 이 커밋을 담은 PR 번호(번호순).
    pull_requests: tuple[int, ...]
    # 들인 PR 없는 병합 커밋.
    merge: str | None
    own: bool
    # PR마다 이 커밋이 그 PR에 속한다고 본 근거.
    pull_request_sources: Mapping[int, frozenset[MembershipSource]] = field(
        default_factory=dict
    )
    # 단위 미확정(CONFLICT)일 때 따로 세는 사유. 그 밖이면 None이다.
    hold_reason: HoldReason | None = None


class NoteKind(StrEnum):
    """묶음의 한계. 문장은 build.py가 만든다."""

    RESUBMISSION_UNCONFIRMED = "RESUBMISSION_UNCONFIRMED"
    CHERRY_PICK_UNCONFIRMED = "CHERRY_PICK_UNCONFIRMED"
    PULL_REQUESTS_NOT_ALLOWED = "PULL_REQUESTS_NOT_ALLOWED"
    # 근거 한계로 적는다: 커밋 목록을 다 받지 못한 PR이 모두 기본 브랜치 대상의 열린·병합 PR이라
    # PR 밖 확정을 보류하지 않았지만, 그 PR에도 담긴 커밋일 수 있다(한계 L13).
    PULL_REQUEST_LISTS_INCOMPLETE = "PULL_REQUEST_LISTS_INCOMPLETE"
    # 근거 한계로 적는다: 이 PR보다 먼저 병합된 PR 가운데 커밋 목록을 다 받지 못한(크기 상한·판본
    # 불일치·250건에서 다 읽지 못함) PR이 있어, 이 PR에 배정한 변경이 그 PR에도 담겼을 수 있다.
    # 보류하지 않고 집계도 바꾸지 않는다(2026-10-09 팀장 결정).
    EARLIER_PULL_REQUEST_LIST_INCOMPLETE = "EARLIER_PULL_REQUEST_LIST_INCOMPLETE"
    NEIGHBOR_DETAILS_MISSING = "NEIGHBOR_DETAILS_MISSING"
    NEIGHBOR_FILES_TRUNCATED = "NEIGHBOR_FILES_TRUNCATED"


@dataclass(frozen=True, order=True)
class Note:
    """묶음의 한계 하나. 종류마다 쓰는 칸이 정해져 있다.

    RESUBMISSION_UNCONFIRMED는 pull_requests에 (닫힌 PR, 병합된 PR)을, CHERRY_PICK_UNCONFIRMED는
    commits에 (원본 커밋, 옮긴 커밋)을 둔다. 나머지 종류는 칸을 쓰지 않는다.
    """

    kind: NoteKind
    pull_requests: tuple[int, ...] = ()
    commits: tuple[str, ...] = ()


@dataclass(frozen=True)
class AssignedChange:
    """단위에 배정한 변경 하나. SHA가 다른 커밋도 같은 변경으로 확인했으면 함께 든다."""

    # 이 단위에서 관측한 커밋(SHA순).
    commits: tuple[str, ...]
    # 기여 근거가 되는 커밋이 있다(_contribution_basis). PR 커밋 목록을 끝까지 받았으면 목록의
    # 원래 커밋만 근거가 되고, squash·rebase로 새로 생긴 커밋은 배정만 받는다.
    contributing: bool
    # 연동 계정이 작성자로 기록된 기여 근거 커밋. 이 단위의 커밋이 우선이고, 없으면 같은 변경의
    # 다른 단위 커밋이다(어느 PR에서든 그 PR 목록에서 확인하지 못한 squash 후보 커밋은 뺀다).
    own_commits: tuple[str, ...]


@dataclass(frozen=True)
class GroupedUnit:
    unit: PullRequestUnit | MergeUnit | CommitsUnit
    changes: tuple[AssignedChange, ...]
    sources: frozenset[MembershipSource] = frozenset()
    notes: tuple[Note, ...] = ()
    # PR 커밋 목록의 변경 가운데 배정 규칙으로 다른 PR에 보낸 수.
    moved_out: int = 0
    # SHA가 다른 커밋과 같은 변경으로 확인해 하나로 센 변경 수.
    merged_in: int = 0
    # PR 없는 병합이 들인 커밋 가운데 최종으로 안쪽 병합에 배정된 커밋 수.
    inner_placed: int = 0
    # PR 단위에서, 연동 계정이 작성자로 기록된 squash 후보 커밋(그 PR의 merge_commit_sha이면서
    # 부모가 하나)을 커밋 목록을 다 받지 못해 기여 근거에서 뺐다(2026-10-08 팀장 결정 「본인
    # 기여의 뜻」).
    squash_unconfirmed: bool = False
    # 이 단위의 기여를 바꿀 수 있는 확인이 수집 중단에 걸리지 않았다(_stop_touches, PR이면 어느
    # PR의 커밋 목록도 수집이 멈춰 받지 못한 것이 없다). 거짓이면 squash 후보 커밋을 확인하지
    # 못했어도 근거 부족으로 세지 않는다.
    contribution_settled: bool = True
    # 연동 계정이 작성자로 기록되지 않은 커밋이 섞였는가(_other_authors). PR은 그 PR 커밋 목록 전체,
    # PR 없는 병합은 그 병합이 들인 커밋 전체를 본다. 커밋 묶음은 None이다. 작업 사실 문장에는 쓰지
    # 않고(CR1 BR4.4), 기록의 글 고르기(BR2.1)와 생성 재료·제목 처리에 쓴다.
    other_authors: OtherAuthors | None = None
    # 커밋 묶음에서 실제로 이은 쌍(작은 SHA, 큰 SHA). 같은 변경으로 이은 쌍과 부모·변경 파일
    # 겹침으로 이은 쌍을 따로 둔다. 묶음 설명은 쓴 근거만 적는다. PR·병합 단위는 비었다.
    same_change_links: tuple[tuple[str, str], ...] = ()
    parent_links: tuple[tuple[str, str], ...] = ()
    # 커밋 묶음에서 소속 변경을 뺐다(CR2 BR1.8). 남은 커밋은 뺀 커밋을 거쳐 이어졌을 수 있어, 남은
    # 연결이 비어도 묶음 설명이 고정 문장으로 설명한다. PR·병합 단위와 빼지 않은 묶음은 거짓이다.
    via_assigned: bool = False


@dataclass(frozen=True)
class HeldChange:
    """후보로 내보내지 않는 변경."""

    membership: Membership
    commits: tuple[str, ...]
    # 연동 계정이 작성자로 기록된 커밋이 있다. 집계는 본인 변경만 한다.
    own: bool
    # 단위 미확정(CONFLICT)이고 그 단위 미확정 커밋이 모두 이 사유일 때만 둔다. 운영 로그에서
    # 따로 센다.
    reason: HoldReason | None = None


@dataclass(frozen=True)
class Grouping:
    units: tuple[GroupedUnit, ...]
    held: tuple[HeldChange, ...]
    observations: Mapping[str, Observation]
    # 판정에 쓴 커밋(기본 브랜치 창과 관계 조회로만 본 커밋)과 알려진 PR.
    commits: Mapping[str, CommitRecord]
    pull_requests: Mapping[int, PullRequestRecord]
    pull_request_commits: Mapping[int, PullRequestCommits]
    # 소속 변경을 빼고 나니 본인 기여 변경이 남지 않아 버린 단위 수(CR2 BR1.4). 미제공에 세지 않는다.
    assigned_units: int = 0


Pool = Literal["POOL"]
_POOL: Pool = "POOL"
UnitKey = PullRequestUnit | MergeUnit | Pool


class _UnionFind:
    """순서와 무관한 결과를 내도록 늘 작은 SHA를 대표로 둔다."""

    def __init__(self, items: Iterable[str]) -> None:
        self._parent = {item: item for item in items}

    def __contains__(self, item: str) -> bool:
        return item in self._parent

    def find(self, item: str) -> str:
        root = item
        while self._parent[root] != root:
            root = self._parent[root]
        while self._parent[item] != root:
            self._parent[item], item = root, self._parent[item]
        return root

    def union(self, left: str, right: str) -> None:
        first, second = sorted((self.find(left), self.find(right)))
        self._parent[second] = first

    def groups(self) -> tuple[tuple[str, ...], ...]:
        members: dict[str, list[str]] = {}
        for item in sorted(self._parent):
            members.setdefault(self.find(item), []).append(item)
        return tuple(sorted(tuple(group) for group in members.values()))


@dataclass
class _CommitState:
    """판정 중의 커밋 상태. 끝나면 Observation으로 굳힌다."""

    membership: Membership
    own: bool
    # 이 커밋을 담은 PR과 그 소속 근거.
    pulls: dict[int, set[MembershipSource]] = field(default_factory=dict)
    merge: str | None = None
    # 단위 미확정으로 둔 사유 가운데 따로 세는 것. 상태가 CONFLICT일 때만 뜻이 있다.
    reason: HoldReason | None = None


States = dict[str, _CommitState]


@dataclass(frozen=True)
class _Context:
    outcome: CollectionOutcome
    relations: RelationObservations
    commits: Mapping[str, CommitRecord]
    # 기본 브랜치 창(기본 브랜치 커밋 목록으로 받은 커밋).
    window: frozenset[str]
    pull_requests: Mapping[int, PullRequestRecord]
    lists: Mapping[int, PullRequestCommits]
    lookups: Mapping[str, AssociatedPulls]
    # 병합 커밋마다 경계 비교 관측.
    boundaries: Mapping[str, MergeBoundary]
    rank: Mapping[int, int]
    graph: WindowGraph
    # 창 커밋의 자리. 창 안 조상이 늘 앞서고, 조상 관계가 없으면 커밋 시각이 이른 것, 같으면 작은
    # SHA가 앞선다(WindowGraph.parents_first).
    ancestry: Mapping[str, int]
    pulls_allowed: bool
    commits_allowed: bool
    # 목록 단계에서 수집이 멈춰 기본 브랜치 창이 잘렸을 수 있다. 창 밖에 닿은 판정은 확인 중단이다.
    window_cut: bool
    # 파일 모드를 확인하려 했으나 수집이 멈춰 확인하지 못한 커밋(모드 확인 미도달).
    modes_unreached: frozenset[str]
    # PR 목록으로 받은 PR 가운데 커밋 목록을 정한 범위대로 조회했지만 다 받지 못한 PR 번호
    # (_incomplete_lists).
    incomplete_lists: frozenset[int]
    # 커밋 목록을 다 받지 못한 PR 때문에 PR 밖 확정을 보류한다(_held_by_incomplete_lists).
    lists_hold: bool
    # 커밋 목록을 다 받지 못한 PR이 있지만 모두 기본 브랜치 대상의 열린·병합 PR이라 보류하지
    # 않았다. PR 밖 판정에 기대는 단위의 근거 한계로 적는다(한계 L13).
    lists_note: bool
    # PR 밖일 수 있는 본인 커밋의 연결 PR 조회를 수집이 멈춰 마치지 못했다(계획 전 멈춤 포함).
    lookups_unfinished: bool

    def own(self, record: CommitRecord) -> bool:
        account = self.outcome.linked_account
        return account is not None and account.same_account(record.author)

    def earlier_list_unreached(self, number: int) -> bool:
        """이 PR이나 더 앞선 PR의 커밋 목록을 수집이 멈춰 보지 못했다."""
        position = self.rank[number]
        return any(
            self.rank[other] <= position and entry.status is DetailStatus.NOT_REACHED
            for other, entry in self.lists.items()
        )

    def earlier_merged_list_incomplete(self, number: int) -> bool:
        """이 PR보다 먼저 병합된 PR 가운데 커밋 목록을 다 받지 못한 PR이 있다.

        그 PR의 받지 못한 커밋에 이 PR의 변경이 들어 있었다면 배정 규칙대로 그 PR에 갔을 것이다.
        보류하지 않고 이 PR 단위의 근거 한계로 적는다(2026-10-09 팀장 결정). 수집이 멈춰 받지 못한
        목록은 earlier_list_unreached가 확인 중단으로 본다.
        """
        position = self.rank[number]
        return any(
            self.rank[other] < position
            and self.pull_requests[other].merged_at is not None
            for other in self.incomplete_lists
        )

    def full_list(self, number: int) -> bool:
        """이 PR의 커밋 목록을 관측한 판본 그대로 끝까지 받았다."""
        entry = self.lists.get(number)
        return (
            entry is not None
            and entry.status is DetailStatus.FETCHED
            and entry.complete
        )

    def squash_candidate(self, number: int, sha: str) -> bool:
        """그 PR의 merge_commit_sha이면서 부모가 하나인 커밋.

        squash 커밋이거나, 커밋 목록 없이는 squash와 구분할 수 없는 rebase 마지막 커밋이다.
        """
        return (
            self.pull_requests[number].merge_commit_sha == sha
            and len(self.commits[sha].parents) == 1
        )

    def headless(self) -> Membership:
        """창의 머리가 하나가 아닐 때의 보류 상태. 창이 잘렸으면 다 받았을 때 하나였을 수 있다."""
        return Membership.STOPPED if self.window_cut else Membership.RANGE_LIMITED


@dataclass(frozen=True)
class _Merge:
    sha: str
    # 판정 상태. ASSIGNED면 PR 없는 병합으로 확인했다. 그 밖의 값은 이 병합을 확정하지 못한
    # 이유이며, 이 병합에 들어갈 본인 커밋을 이 상태로 보류한다.
    status: Membership
    # 들인 커밋(흡수 병합이 들인 커밋은 빼고, 경계 비교를 받았으면 그 결과). 배치와 안쪽 병합 수가
    # 같은 집합을 쓴다.
    brought: frozenset[str]
    complete: bool


@dataclass(frozen=True)
class _Relation:
    """같은 변경일 수 있다는 관계 근거."""

    kind: Literal["CHERRY_PICK", "RESUBMISSION"]
    # 앞쪽(cherry-pick 원본, 재제출의 닫힌 PR)과 뒤쪽 커밋.
    earlier: tuple[str, ...]
    later: tuple[str, ...]
    # 재제출이면 (닫힌 PR, 병합된 PR).
    pull_requests: tuple[int, ...] = ()


@dataclass
class _Assignment:
    units: dict[UnitKey, list[tuple[str, ...]]] = field(default_factory=dict)
    held: list[HeldChange] = field(default_factory=list)
    moved_out: Counter[int] = field(default_factory=Counter)
    # PR·PR 없는 병합마다. 커밋 묶음은 묶음을 만든 뒤 _units가 센다.
    merged_in: Counter[UnitKey] = field(default_factory=Counter)


def group(
    outcome: CollectionOutcome, assigned: frozenset[str] = frozenset()
) -> Grouping:
    """수집 결과의 변경을 작업 단위에 배정하고, 배정하지 못한 변경을 보류로 남긴다.

    assigned는 그 시도의 맥락 조회로 받은 소속 커밋 집합(CR2)이다. 단위를 다 정한 뒤 각 단위에서 소속
    변경을 뺀다(7). 후보 판정과 생성 재료 찾기가 같은 수집 결과·같은 집합으로 부르면 같은 단위를 얻는다
    (BR1.6). 비면(첫 분석·합성 요청·FR10 확인 명령) 결과가 지금과 같다(BR1.7).
    """
    ctx = _context(outcome)
    # 1. 소속 관측
    states = _observe(ctx)
    # 2. PR 없는 병합
    merges = _merge_candidates(ctx, states)
    _place_in_merges(ctx, states, merges)
    # 3. 같은 변경
    same_change = _UnionFind(states)
    relations = _relations(ctx, states)
    patch_ids = _PatchIds(ctx)
    _union_same_changes(same_change, relations, patch_ids)
    notes = _unconfirmed_notes(same_change, relations)
    uncompared = _uncompared(ctx, same_change, relations, patch_ids)
    _hold_uncertain(ctx, states, same_change, uncompared)
    # 4. 배정
    assignment = _assign(ctx, states, same_change)
    inner_placed = _inner_placed(merges, states, assignment)
    # 5. 커밋 묶음
    pool_changes = assignment.units.pop(_POOL, [])
    bundles = _bundle(ctx, states, assignment, pool_changes)
    # 6. 단위 목록, 7. 소속 빼기
    units, assigned_units = _units(
        ctx,
        states,
        assignment,
        bundles,
        same_change,
        notes,
        inner_placed,
        uncompared.commits,
        {merge.sha: merge for merge in merges},
        assigned,
    )
    return Grouping(
        units=units,
        held=tuple(assignment.held),
        observations={
            sha: Observation(
                sha=sha,
                membership=state.membership,
                pull_requests=tuple(sorted(state.pulls)),
                merge=state.merge,
                own=state.own,
                pull_request_sources={
                    number: frozenset(how)
                    for number, how in sorted(state.pulls.items())
                },
                hold_reason=state.reason
                if state.membership is Membership.CONFLICT
                else None,
            )
            for sha, state in sorted(states.items())
        },
        commits=ctx.commits,
        pull_requests=ctx.pull_requests,
        pull_request_commits=ctx.lists,
        assigned_units=assigned_units,
    )


def _context(outcome: CollectionOutcome) -> _Context:
    relations = outcome.relations
    if relations is None:
        raise ValueError("후보 묶음에는 관계 조회 결과가 필요하다")
    commits: dict[str, CommitRecord] = {}
    for record in (*outcome.commits, *relations.commits):
        commits.setdefault(record.sha, record)
    known: dict[int, PullRequestRecord] = {}
    for pull in (*outcome.pull_requests, *relations.pull_requests_from_lookups):
        known.setdefault(pull.number, pull)
    lists: dict[int, PullRequestCommits] = {}
    for entry in relations.pull_request_commits:
        if entry.number not in known:
            # 관계 조회는 알려진 PR(목록과 연결 PR 조회로 안 PR)의 목록만 만든다.
            raise ValueError("알려지지 않은 PR의 커밋 목록이 있다")
        lists.setdefault(entry.number, entry)
    lookups: dict[str, AssociatedPulls] = {}
    for lookup in relations.associated:
        lookups.setdefault(lookup.sha, lookup)
    boundaries: dict[str, MergeBoundary] = {}
    for boundary in relations.merge_boundaries:
        boundaries.setdefault(boundary.merge, boundary)
    if outcome.completed and _unfinished(relations, commits.values()):
        # 수집은 멈출 때만 단계를 남기고 닿지 못한 조회를 NOT_REACHED로 둔다.
        raise ValueError("수집을 마쳤다는 결과에 멈춘 단계나 닿지 못한 조회가 있다")
    allowed = outcome.allowed_resource_types
    graph = WindowGraph.of(outcome.commits)
    ctx = _Context(
        outcome=outcome,
        relations=relations,
        commits=commits,
        window=frozenset(record.sha for record in outcome.commits),
        pull_requests=known,
        lists=lists,
        lookups=lookups,
        boundaries=boundaries,
        rank={
            pull.number: position
            for position, pull in enumerate(pull_request_precedence(known.values()))
        },
        graph=graph,
        ancestry=graph.parents_first(),
        pulls_allowed="PULL_REQUEST" in allowed,
        commits_allowed="COMMIT" in allowed,
        window_cut=not outcome.completed and relations.stopped_during == "LISTS",
        modes_unreached=frozenset(
            check.sha
            for check in relations.mode_checks
            if check.status is DetailStatus.NOT_REACHED
        ),
        incomplete_lists=frozenset(),
        lists_hold=False,
        lists_note=False,
        lookups_unfinished=False,
    )
    incomplete = frozenset(pull.number for pull in _incomplete_lists(ctx))
    held = _held_by_incomplete_lists(ctx)
    return replace(
        ctx,
        incomplete_lists=incomplete,
        lists_hold=held,
        lists_note=bool(incomplete) and not held,
        lookups_unfinished=_lookups_unfinished(ctx),
    )


def _unfinished(
    relations: RelationObservations, commits: Iterable[CommitRecord]
) -> bool:
    """멈춘 단계가 있거나 수집이 멈춰 닿지 못한(NOT_REACHED) 조회·상세·목록이 있다."""
    unreached = DetailStatus.NOT_REACHED
    return (
        relations.stopped_during is not None
        or any(entry.status is unreached for entry in relations.pull_request_commits)
        or any(lookup.status is Lookup.NOT_REACHED for lookup in relations.associated)
        or any(each.status is unreached for each in relations.merge_boundaries)
        or any(check.status is unreached for check in relations.mode_checks)
        or any(record.changes_status is unreached for record in commits)
    )


# 커밋 목록을 정한 범위대로 조회를 마쳤지만 다 받지 못한 상태. FETCHED는 complete가 거짓일 때다.
_LIST_NOT_WHOLE = frozenset({DetailStatus.OVERSIZED, DetailStatus.REVISION_MISMATCH})


def _incomplete_lists(ctx: _Context) -> list[PullRequestRecord]:
    """PR 목록으로 받은 PR 가운데 커밋 목록을 다 받지 못한 PR.

    응답 크기 상한(OVERSIZED), 판본 불일치(REVISION_MISMATCH), 250건에서 다 읽지 못함(수·판본
    어긋남, 비교 쪽수 상한, 포크에서 연 PR, 기준 커밋 모름)이다. 연결 PR 조회로만 안 PR은 넣지
    않는다. 수집이 멈춰 받지 못한 목록(NOT_REACHED)은 확인 중단이라 여기 들지 않는다.
    """
    found: list[PullRequestRecord] = []
    for pull in ctx.outcome.pull_requests:
        entry = ctx.lists.get(pull.number)
        if entry is None:
            continue
        if entry.status in _LIST_NOT_WHOLE or (
            entry.status is DetailStatus.FETCHED and not entry.complete
        ):
            found.append(pull)
    return found


def _held_by_incomplete_lists(ctx: _Context) -> bool:
    """커밋 목록을 다 받지 못한 PR 때문에 PR 밖으로 판정될 본인 커밋을 모두 보류하는가.

    그런 PR 가운데 병합되지 않고 닫혔거나 기본 브랜치가 아닌 곳을 대상으로 한 PR이 있으면 참이다.
    그 PR의 받지 못한 커밋은 연결 PR 조회가 돌려주지 않으므로 PR 밖 판정과 겹칠 수 있다. 기본
    브랜치 대상의 열린·병합 PR이면 보류하지 않는다(한계 L13). 기본 브랜치를 모르면 기본 브랜치가
    아닌 것으로 본다(2026-10-09 팀장 결정, 「커밋이 250개 넘는 PR」).
    """
    default = ctx.relations.default_branch
    return any(
        (pull.merged_at is None and pull.state == "closed")
        or default is None
        or pull.base_ref != default
        for pull in _incomplete_lists(ctx)
    )


def _lookups_unfinished(ctx: _Context) -> bool:
    """PR 커밋 목록·merge_commit_sha로 설명되지 않은 본인 커밋의 연결 PR 조회를 마치지 못했다.

    조회 기록이 없으면(조회를 계획하기 전에 멈춤) 마치지 못한 것이다. 병합된 PR은 squash·rebase로
    새로 생긴 커밋을 이 조회로만 배정받으므로 그 PR의 구성과 기여가 이 조회에 달린다.
    """
    if not ctx.pulls_allowed:
        return False
    explained = {
        sha
        for entry in ctx.lists.values()
        if entry.status is DetailStatus.FETCHED
        for sha in entry.commits
    }
    explained.update(
        pull.merge_commit_sha
        for pull in ctx.pull_requests.values()
        if pull.merge_commit_sha is not None
    )
    for sha in ctx.window:
        record = ctx.commits[sha]
        if is_merge(record) or not ctx.own(record) or sha in explained:
            continue
        lookup = ctx.lookups.get(sha)
        if lookup is None or lookup.status is Lookup.NOT_REACHED:
            return True
    return False


# 단위 키: 배정 순서와 커밋이 단위에 드는지


def _unit_order(ctx: _Context, key: UnitKey) -> tuple[int, int, str]:
    """배정 우선순위: 먼저 병합된 PR(없으면 작은 번호) → 먼저 들인 병합 → 커밋 묶음.

    병합끼리는 창 안 조상인 병합이 먼저 들였다. 조상 관계가 없으면 부모를 모두 자리에 둔 커밋
    가운데 커밋 시각이 이른 병합을, 같으면 작은 SHA를 앞에 둔다(WindowGraph.parents_first). 목록
    순서는 쓰지 않는다. 키마다 값이 다르다.
    """
    if isinstance(key, PullRequestUnit):
        return (0, ctx.rank[key.number], "")
    if isinstance(key, MergeUnit):
        return (1, ctx.ancestry[key.commit], key.commit)
    return (2, 0, "")


def _first_unit(ctx: _Context, keys: Iterable[UnitKey]) -> UnitKey:
    return min(keys, key=lambda key: _unit_order(ctx, key))


def _pool_bound(state: _CommitState) -> bool:
    """커밋 묶음으로 갈 커밋: PR 밖이 확정됐고 PR 없는 병합에 들지 않은 본인 커밋."""
    return state.membership is Membership.OUTSIDE and state.own and state.merge is None


def _keys(state: _CommitState) -> list[UnitKey]:
    keys: list[UnitKey] = [PullRequestUnit(number) for number in state.pulls]
    if state.merge is not None:
        keys.append(MergeUnit(state.merge))
    elif _pool_bound(state):
        keys.append(_POOL)
    return keys


def _in_unit(state: _CommitState, key: UnitKey) -> bool:
    if isinstance(key, PullRequestUnit):
        return key.number in state.pulls
    if isinstance(key, MergeUnit):
        return state.merge == key.commit
    return _pool_bound(state)


# 1. 소속 관측


def _observe(ctx: _Context) -> States:
    pulls: dict[str, dict[int, set[MembershipSource]]] = {}
    for entry in ctx.lists.values():
        if entry.status is not DetailStatus.FETCHED:
            continue
        how = {MembershipSource.PULL_REQUEST_COMMITS}
        if entry.full_list_via_compare:
            how.add(MembershipSource.COMPARE)
        for sha in entry.commits:
            pulls.setdefault(sha, {}).setdefault(entry.number, set()).update(how)
    # squash 커밋·rebase 마지막 커밋·병합 커밋. 병합 커밋이면 경계로만 쓴다.
    pull_merged: set[str] = set()
    for pull in ctx.pull_requests.values():
        merge = pull.merge_commit_sha
        if merge is None:
            continue
        pulls.setdefault(merge, {}).setdefault(pull.number, set()).add(
            MembershipSource.MERGE_COMMIT_SHA
        )
        if ctx.graph.is_merge(merge):
            # 병합 커밋으로 합친 PR이 들인 커밋. 연결 PR 조회가 빈 목록이면 어긋남이다.
            pull_merged |= ctx.graph.brought_in(merge).commits
    states: States = {}
    for sha, record in ctx.commits.items():
        if is_merge(record):
            continue
        own = ctx.own(record)
        units = pulls.get(sha)
        if units:
            states[sha] = _CommitState(
                Membership.ASSIGNED,
                own,
                {number: set(how) for number, how in units.items()},
            )
            lookup = ctx.lookups.get(sha) if own else None
            if (
                lookup is not None
                and lookup.status is Lookup.FOUND
                and _found_pulls_contradict(ctx, sha, lookup)
            ):
                # 목록 밖에서 연결 PR 조회로만 안 PR의 merge_commit_sha처럼, 연결 PR 조회 대상을
                # 정한 뒤에 알게 된 근거로 소속이 나온 커밋도 그 조회 결과와 어긋나면 단위 미확정이다.
                states[sha].membership = Membership.CONFLICT
        elif sha not in ctx.window:
            # 관계 조회는 다 읽은 PR 커밋 목록의 커밋만 남긴다.
            raise ValueError("PR 커밋 목록으로만 본 커밋이 받은 PR 커밋 목록에 없다")
        elif not own:
            # 다른 계정 커밋은 연결 PR을 조회하지 않는다. 병합 단위의 구성으로만 쓴다.
            states[sha] = _CommitState(Membership.OUTSIDE, own)
        else:
            states[sha] = _own_outside_lists(ctx, sha, sha in pull_merged)
    return states


def _own_outside_lists(ctx: _Context, sha: str, pull_merged: bool) -> _CommitState:
    """PR 커밋 목록·merge_commit_sha로 설명되지 않은 본인 커밋: 연결 PR 조회로 정한다.

    빈 목록이면 PR 밖이 확정되지만 두 경우는 단위 미확정이다. 병합 커밋으로 합친 PR이 이 커밋을
    들였으면 근거끼리 어긋난다. 커밋 목록을 다 받지 못한 PR(병합되지 않고 닫혔거나 기본 브랜치가
    아닌 곳이 대상)이 있으면 그 PR의 커밋일 수 있어 PR 밖을 확정하지 않는다(_held_by_incomplete_lists).
    정한 범위대로 조회를 마쳤으므로 실패는 남기지 않는다.
    """
    if not ctx.pulls_allowed:
        # PR 조회가 허용되지 않으면 PR 단위를 쓰지 않는다. 보류가 아니다(한계 L2).
        return _CommitState(Membership.OUTSIDE, True)
    lookup = ctx.lookups.get(sha)
    if lookup is None:
        if ctx.outcome.completed:
            # 수집은 이런 커밋을 모두 조회한다(lookup_targets).
            raise ValueError(
                "수집을 마쳤는데 PR 밖 본인 커밋의 연결 PR 조회 기록이 없다"
            )
        # 조회를 계획하기 전에 멈췄다.
        return _CommitState(Membership.STOPPED, True)
    if lookup.status is Lookup.NOT_REACHED:
        return _CommitState(Membership.STOPPED, True)
    if lookup.status is Lookup.LIMITED:
        return _CommitState(Membership.RANGE_LIMITED, True)
    if lookup.status is Lookup.EMPTY:
        if pull_merged:
            return _CommitState(Membership.CONFLICT, True)
        if ctx.lists_hold:
            return _CommitState(
                Membership.CONFLICT,
                True,
                reason=HoldReason.UNSEEN_PULL_REQUEST_COMMITS,
            )
        return _CommitState(Membership.OUTSIDE, True)
    if _found_pulls_contradict(ctx, sha, lookup):
        return _CommitState(Membership.CONFLICT, True)
    return _CommitState(
        Membership.ASSIGNED,
        True,
        {number: {MembershipSource.LOOKUP} for number in lookup.pull_requests},
    )


def _found_pulls_contradict(ctx: _Context, sha: str, lookup: AssociatedPulls) -> bool:
    """연결 PR 조회가 돌려준 병합되지 않은 PR의 전체 커밋 목록에 이 커밋이 없다(C16).

    병합된 PR이면 squash·rebase로 새로 생긴 커밋이라 정상이다. 돌려준 PR이 없거나 알려지지 않은
    PR이면 수집의 결함이다.
    """
    numbers = lookup.pull_requests
    if not numbers or any(number not in ctx.rank for number in numbers):
        # 수집은 돌려받은 이 저장소의 PR을 모두 알려진 PR로 남긴다.
        raise ValueError("연결 PR 조회가 돌려준 PR이 알려진 PR에 없다")
    return any(
        ctx.pull_requests[number].merged_at is None
        and ctx.full_list(number)
        and sha not in ctx.lists[number].commits
        for number in numbers
    )


# 2. PR 없는 병합


def _merge_candidates(ctx: _Context, states: States) -> tuple[_Merge, ...]:
    if not ctx.commits_allowed:
        return ()
    graph = ctx.graph
    found = pull_request_less_merges(
        graph,
        pull_request_commits=(
            entry.commits
            for entry in ctx.lists.values()
            if entry.status is DetailStatus.FETCHED
        ),
        merge_commit_shas=(
            pull.merge_commit_sha
            for pull in ctx.pull_requests.values()
            if pull.merge_commit_sha is not None
        ),
        base_lines=ctx.relations.base_branches,
    )
    merges: list[_Merge] = []
    for sha in found.candidates:
        brought = found.brought_in(graph, sha, ctx.boundaries.get(sha))
        status = _merge_status(ctx, states, sha, brought.commits)
        unsettled = _unsettled_boundary(ctx, sha, brought, found.base_lines_cut)
        if unsettled is not None and status is not Membership.STOPPED:
            # 병합이 무엇을 들였는지(또는 흡수 병합인지)부터 모르면 연결 PR 조회가 준 확정·단위
            # 미확정보다 이 보류가 앞선다. 확인 중단은 그대로 둔다(세지 않는다).
            status = unsettled
        merges.append(_Merge(sha, status, brought.commits, brought.complete))
    return tuple(merges)


def _unsettled_boundary(
    ctx: _Context, sha: str, brought: BroughtIn, base_lines_cut: bool
) -> Membership | None:
    """병합이 들인 커밋의 경계나 흡수 여부를 확인하지 못했으면 그 보류 상태, 확인했으면 None.

    ① 추가 기준 브랜치 사슬을 끝까지 따라가지 못했으면 본선에 없는 병합은 그 사슬을 받아온 흡수
    병합일 수 있다. ② 첫 부모 쪽이 창 밖으로 열렸는데 경계 비교를 수집이 멈춰 부르지 못했으면 확인
    중단, 비교를 다 받지 못했으면 자료 범위 한계다. 비교가 없으면(계획하지 않았으면) 자료 범위
    한계다. ①과 비교가 없는 ②는 목록 단계에서 멈춰 창이 잘렸을 수 있으면 확인 중단이다. 둘 다면
    확인 중단이 앞선다.
    """
    unseen = Membership.STOPPED if ctx.window_cut else Membership.RANGE_LIMITED
    found: set[Membership] = set()
    if base_lines_cut and sha not in ctx.graph.mainline:
        found.add(unseen)
    if brought.first_side_open:
        boundary = ctx.boundaries.get(sha)
        if boundary is None:
            found.add(unseen)
        elif boundary.status is DetailStatus.NOT_REACHED:
            found.add(Membership.STOPPED)
        elif not boundary.usable:
            found.add(Membership.RANGE_LIMITED)
    return next((state for state in _HOLDS if state in found), None)


def _merge_status(
    ctx: _Context, states: States, sha: str, brought: frozenset[str]
) -> Membership:
    """연결 PR 조회로 정한 병합의 상태. 경계·흡수 여부의 보류는 _unsettled_boundary가 더한다."""
    if ctx.graph.head is None:
        # 머리가 하나가 아니면 본선과 흡수 병합을 정할 수 없어 병합 단위를 확정하지 않는다.
        return ctx.headless()
    if not ctx.pulls_allowed:
        return Membership.ASSIGNED
    lookup = ctx.lookups.get(sha)
    if lookup is None:
        if not ctx.outcome.completed:
            # 조회를 계획하기 전에 멈췄다.
            return Membership.STOPPED
        if any(
            state is not None and state.own and state.membership is Membership.OUTSIDE
            for state in map(states.get, brought)
        ):
            raise ValueError(
                "수집을 마쳤는데 PR 밖 본인 커밋을 들인 병합의 연결 PR 조회 기록이 없다"
            )
        # 수집은 PR 밖 본인 커밋을 들인 병합만 조회한다(merge_lookup_targets). 이 병합에 넣을
        # 본인 커밋이 없으므로 확정하지 않아도 후보·집계가 달라지지 않는다.
        return Membership.RANGE_LIMITED
    if lookup.status is Lookup.FOUND and (
        not lookup.pull_requests
        or any(number not in ctx.rank for number in lookup.pull_requests)
    ):
        # 수집은 돌려받은 이 저장소의 PR을 모두 알려진 PR로 남긴다.
        raise ValueError("병합 커밋의 연결 PR 조회가 돌려준 PR이 알려진 PR에 없다")
    return {
        Lookup.EMPTY: Membership.ASSIGNED,
        # 들인 커밋은 PR 밖으로 확인됐는데 병합은 PR에 속한다: 근거끼리 어긋난다.
        Lookup.FOUND: Membership.CONFLICT,
        Lookup.LIMITED: Membership.RANGE_LIMITED,
        Lookup.NOT_REACHED: Membership.STOPPED,
    }[lookup.status]


def _place_in_merges(ctx: _Context, states: States, merges: tuple[_Merge, ...]) -> None:
    """PR 밖 커밋을 그 커밋을 처음 들인 가장 안쪽 PR 없는 병합에 넣는다.

    넣지 못한 본인 커밋은 그 이유의 보류 상태가 된다. 넣지 못한 다른 계정 커밋은 상태를 그대로
    두며, 단위 키가 없어 후보·집계에서 빠진다.
    """
    for sha in sorted(states):
        state = states[sha]
        if state.membership is not Membership.OUTSIDE:
            continue
        containing = [merge for merge in merges if sha in merge.brought]
        if not containing:
            continue
        placed = _placement(ctx, containing)
        if isinstance(placed, _Merge):
            state.merge = placed.sha
        elif state.own:
            state.membership = placed


def _placement(ctx: _Context, containing: list[_Merge]) -> _Merge | Membership:
    """커밋을 들인 병합들 가운데 넣을 병합. 넣지 못하면 보류 상태를 돌려준다.

    앞의 판정이 우선한다. ① 창의 머리가 하나가 아니면 본선을 몰라 아래 판정도 믿을 수 없다.
    ② 서로 안쪽이 아닌 병합 둘이 들였으면 처음 들인 병합을 하나로 정할 수 없다. ③ 가장 안쪽
    병합을 PR 없는 병합으로 확인하지 못했다(연결 PR 조회, 첫 부모 쪽 경계, 추가 기준 브랜치 사슬).
    그 병합을 거쳐 바깥 병합에 들어온 커밋도 가장 안쪽 병합이 그 병합이므로 같은 상태가 된다.
    ④ 그 병합이 들인 커밋이 창 밖에 닿았다.
    """
    if ctx.graph.head is None:
        return ctx.headless()
    innermost = [
        merge
        for merge in containing
        if not any(
            other.sha in merge.brought for other in containing if other is not merge
        )
    ]
    if len(innermost) != 1:
        # 들인 병합의 연결 PR 조회나 기본 브랜치 목록을 수집이 멈춰 끝내지 못했으면 필요한 조회를
        # 마치지 못한 것이므로 단위 미확정이 아니라 확인 중단이다.
        stopped = ctx.window_cut or any(
            merge.status is Membership.STOPPED for merge in containing
        )
        return Membership.STOPPED if stopped else Membership.CONFLICT
    (merge,) = innermost
    if merge.status is not Membership.ASSIGNED:
        return merge.status
    if not merge.complete:
        # 창이 수집 중단으로 잘렸을 수 있으면 자료 범위 한계가 아니라 확인 중단이다(세지 않는다).
        return Membership.STOPPED if ctx.window_cut else Membership.RANGE_LIMITED
    return merge


def _inner_placed(
    merges: tuple[_Merge, ...], states: States, assignment: _Assignment
) -> Counter[str]:
    """PR 없는 병합마다, 들인 커밋 가운데 최종으로 안쪽 병합에 배정된 커밋 수.

    배정 뒤에 센다. 안쪽 병합에 넣었어도 같은 변경을 따라 다른 단위로 가거나 보류된 커밋은 세지
    않는다.
    """
    confirmed = [merge for merge in merges if merge.status is Membership.ASSIGNED]
    counts: Counter[str] = Counter()
    for key, changes in assignment.units.items():
        if not isinstance(key, MergeUnit):
            continue
        for sha in (sha for members in changes for sha in members):
            if states[sha].merge != key.commit:
                continue
            for outer in confirmed:
                if outer.sha != key.commit and sha in outer.brought:
                    counts[outer.sha] += 1
    return counts


# 3. 같은 변경


def _relations(ctx: _Context, states: Mapping[str, _CommitState]) -> list[_Relation]:
    """관계 근거: 커밋 메시지의 cherry-pick 표시, 재제출한 두 PR의 커밋 쌍."""
    found: list[_Relation] = []
    pairs: set[frozenset[str]] = set()
    for sha in sorted(states):
        for source in sorted(cherry_pick_sources(ctx.commits[sha].message)):
            pair = frozenset((source, sha))
            if source != sha and source in states and pair not in pairs:
                pairs.add(pair)
                found.append(_Relation("CHERRY_PICK", (source,), (sha,)))
    repository = ctx.outcome.repository
    if repository is None:
        return found
    is_resubmission = default_resubmission(repository)
    fetched = [
        pull
        for pull in pull_request_precedence(ctx.pull_requests.values())
        if pull.number in ctx.lists
        and ctx.lists[pull.number].status is DetailStatus.FETCHED
    ]
    for old in fetched:
        for new in fetched:
            if old.number == new.number or not is_resubmission(old, new):
                continue
            earlier = tuple(s for s in ctx.lists[old.number].commits if s in states)
            later = tuple(s for s in ctx.lists[new.number].commits if s in states)
            if earlier and later:
                found.append(
                    _Relation("RESUBMISSION", earlier, later, (old.number, new.number))
                )
    return found


class _PatchIds:
    """커밋마다 공백을 무시한 diff 값. 변경 내용이 없거나 값을 만들 수 없으면 None이다.

    부르면 파일 모드를 반영한 값(stable_patch_id)이다. 같은 변경은 이 값으로만 합친다.
    content는 모드 없이 만든 값(content_patch_id)으로, 모드를 확인하지 못한 쌍이 같을 수
    있었는지 볼 때만 쓴다.
    """

    def __init__(self, ctx: _Context) -> None:
        self._ctx = ctx
        self._values: dict[str, str | None] = {}
        self._contents: dict[str, str | None] = {}

    def __call__(self, sha: str) -> str | None:
        if sha not in self._values:
            changes = self._ctx.commits[sha].changes
            self._values[sha] = None if changes is None else stable_patch_id(changes)
        return self._values[sha]

    def content(self, sha: str) -> str | None:
        if sha not in self._contents:
            changes = self._ctx.commits[sha].changes
            self._contents[sha] = None if changes is None else content_patch_id(changes)
        return self._contents[sha]


def _union_same_changes(
    same_change: _UnionFind, relations: list[_Relation], patch_id: _PatchIds
) -> None:
    """관계 근거가 있고 공백을 무시한 diff(파일 모드 포함)가 같은 쌍을 같은 변경으로 합친다."""
    for relation in relations:
        later_by_id: dict[str, list[str]] = {}
        for sha in relation.later:
            value = patch_id(sha)
            if value is not None:
                later_by_id.setdefault(value, []).append(sha)
        for sha in relation.earlier:
            value = patch_id(sha)
            for match in later_by_id.get(value, []) if value is not None else []:
                same_change.union(sha, match)


def _unconfirmed_notes(
    same_change: _UnionFind, relations: list[_Relation]
) -> dict[str, frozenset[Note]]:
    """확정하지 못한 관계의 한계를 양쪽 변경(같은 변경 묶음의 대표 SHA)마다 돌려준다.

    합칠 쌍을 모두 합친 뒤에 부른다. 그 변경이 다른 단위로 옮겨 배정돼도 한계는 그 변경을 가진
    후보에 붙는다.
    """
    notes: dict[str, set[Note]] = {}
    for relation in relations:
        later_roots = {same_change.find(sha) for sha in relation.later}
        unmatched = [
            sha for sha in relation.earlier if same_change.find(sha) not in later_roots
        ]
        if not unmatched:
            continue
        if relation.kind == "RESUBMISSION":
            note = Note(
                NoteKind.RESUBMISSION_UNCONFIRMED, pull_requests=relation.pull_requests
            )
        else:
            note = Note(
                NoteKind.CHERRY_PICK_UNCONFIRMED,
                commits=(relation.earlier[0], relation.later[0]),
            )
        for sha in (*unmatched, *relation.later):
            notes.setdefault(same_change.find(sha), set()).add(note)
    return {root: frozenset(found) for root, found in notes.items()}


@dataclass(frozen=True)
class _Uncompared:
    """관계 근거가 있는데 수집이 멈춰 비교하지 못했고, 끝까지 받았다면 같을 수 있었던 쌍.

    변경 내용이나 파일 모드 확인에 닿지 못한 커밋이 낀 쌍이다. 쌍 자체는 두지 않는다.
    """

    # 그런 쌍에 든 커밋.
    commits: frozenset[str]
    # 그런 쌍으로 서로 이어지는 같은 변경 묶음(대표 SHA)들. 묶음은 여러 무리에 들 수 있다.
    links: tuple[tuple[str, ...], ...]


@dataclass
class _Side:
    """관계 한쪽의 커밋을 비교하지 못한 쌍이 될 수 있는 경우로 나눈 것.

    변경 내용을 받지 못한 커밋(changes_cut)은 어떤 변경이든 될 수 있다. 변경 내용을 받은 커밋은
    비교할 수 있어야 한다. comparable은 이 둘을 모두 담는다. 받은 커밋 가운데 모드 확인에 닿지 못한
    커밋은 모드 없이 만든 값이 있어야 하고(modes), 나머지는 모드를 반영한 값이 있어야 한다(full).
    modes·full은 모드 없이 만든 값마다 모은다.
    """

    comparable: list[str] = field(default_factory=list)
    changes_cut: list[str] = field(default_factory=list)
    modes: dict[str, list[str]] = field(default_factory=dict)
    full: dict[str, list[str]] = field(default_factory=dict)


def _side(ctx: _Context, patch_id: _PatchIds, shas: Iterable[str]) -> _Side:
    side = _Side()
    for sha in shas:
        if _changes_cut(ctx, sha):
            side.changes_cut.append(sha)
            side.comparable.append(sha)
            continue
        modes_unreached = sha in ctx.modes_unreached
        if (patch_id.content(sha) if modes_unreached else patch_id(sha)) is None:
            continue
        side.comparable.append(sha)
        content = patch_id.content(sha)
        if content is not None:
            found = side.modes if modes_unreached else side.full
            found.setdefault(content, []).append(sha)
    return side


def _uncompared(
    ctx: _Context,
    same_change: _UnionFind,
    relations: list[_Relation],
    patch_id: _PatchIds,
) -> _Uncompared:
    """비교하지 못했고 같을 수 있었던 쌍(_Uncompared)을 관계마다 양쪽 커밋 수에 비례해 찾는다.

    앞쪽·뒤쪽의 모든 쌍을 만들지 않는다. PR이 많으면 수천만 쌍이 되어 메모리를 다 쓸 수 있다.
    쌍이 되는 경우는 한쪽 변경 내용을 받지 못했거나, 두 쪽 모두 받았고 한쪽 이상이 모드 확인에
    닿지 못했으며 모드 없이 만든 값이 같은 것이다. 같은 변경 묶음끼리는 쌍으로 보지 않는다.
    """
    commits: set[str] = set()
    links: list[tuple[str, ...]] = []

    def connect(left: Sequence[str], right: Sequence[str]) -> None:
        """left와 right의 모든 쌍을 반영한다.

        이 쌍들이 잇는 묶음은 모두 서로 이어진다. 두 쌍 (a, b)·(c, d)는 a와 d의 묶음이 다르면
        (a, d)도 쌍이고, 같으면 a에서 만난다. 그래서 묶음 목록 하나로 남긴다.
        """
        if not left or not right:
            return
        left_roots = {same_change.find(sha) for sha in left}
        right_roots = {same_change.find(sha) for sha in right}
        roots: set[str] = set()
        for shas, others in ((left, right_roots), (right, left_roots)):
            for sha in shas:
                root = same_change.find(sha)
                # 상대 쪽에 다른 묶음의 커밋이 있어야 쌍이 있다.
                if len(others) > 1 or root not in others:
                    commits.add(sha)
                    roots.add(root)
        if roots:
            links.append(tuple(sorted(roots)))

    for relation in relations:
        if not any(_cut(ctx, sha) for sha in (*relation.earlier, *relation.later)):
            continue
        earlier = _side(ctx, patch_id, relation.earlier)
        later = _side(ctx, patch_id, relation.later)
        connect(earlier.changes_cut, later.comparable)
        connect(earlier.comparable, later.changes_cut)
        for value, shas in earlier.modes.items():
            connect(shas, [*later.modes.get(value, ()), *later.full.get(value, ())])
        for value, shas in earlier.full.items():
            connect(shas, later.modes.get(value, []))
    return _Uncompared(frozenset(commits), tuple(links))


def _cut(ctx: _Context, sha: str) -> bool:
    """수집이 멈춰 같은 변경 비교에 쓸 자료(변경 내용이나 파일 모드)를 받지 못했다."""
    return _changes_cut(ctx, sha) or sha in ctx.modes_unreached


def _changes_cut(ctx: _Context, sha: str) -> bool:
    """수집이 멈춰 변경 내용을 받지 못했다. 끝까지 수집했다면 받았을 수 있다."""
    record = ctx.commits[sha]
    if record.changes is not None:
        return False
    if record.changes_status is DetailStatus.NOT_REACHED:
        return True
    # 상세 계획 전에 멈추면 다른 계정 커밋은 계획되지 않은 채(NOT_REQUESTED) 남는다.
    return (
        record.changes_status is DetailStatus.NOT_REQUESTED
        and ctx.commits_allowed
        and not ctx.outcome.completed
    )


def _hold_uncertain(
    ctx: _Context,
    states: States,
    same_change: _UnionFind,
    uncompared: _Uncompared,
) -> None:
    """비교하지 못한 쌍으로 이어진 같은 변경 묶음 가운데 배정이 비교 결과에 달린 것을 보류한다.

    단위가 없는 다른 계정 커밋을 거쳐 이어진 경우도 같다. 어느 묶음을 보류할지는
    _roots_to_hold가 정한다. 수집을 끝까지 마친 결과에는 이런 쌍이 없다(_context가 멈춘 흔적이
    있는 완료 결과를 결함으로 막는다).
    """
    if not uncompared.commits:
        return
    links = _UnionFind(same_change.find(sha) for sha in uncompared.commits)
    for first, *rest in uncompared.links:
        for root in rest:
            links.union(first, root)
    members: dict[str, list[str]] = {}
    for sha in states:
        root = same_change.find(sha)
        if root in links:
            members.setdefault(root, []).append(sha)
    for component in links.groups():
        for root in _roots_to_hold(ctx, states, members, component):
            for sha in members[root]:
                states[sha].membership = Membership.STOPPED


def _roots_to_hold(
    ctx: _Context,
    states: States,
    members: Mapping[str, list[str]],
    component: tuple[str, ...],
) -> list[str]:
    """비교하지 못한 쌍으로 이어진 같은 변경 묶음들 가운데 확인 중단으로 둘 것.

    이미 보류된 묶음이 있을 때: 합치면 함께 보류되므로 나머지를 보류한다. 이미 보류된 묶음(자료
    범위 한계·단위 미확정)이 하나뿐이면 같은 변경이든 아니든 그 보류는 한 번 세므로 그대로 둔다.
    둘 이상이면 같은 변경인지에 따라 세는 수가 달라지므로 그 묶음도 확인 중단으로 바꿔
    notProvided에 세지 않는다.

    보류된 묶음이 없을 때: 묶음마다 가장 앞선 단위가 모두 서로 다른 PR·PR 없는 병합이면 소속은
    이미 확인됐으므로 아무것도 보류하지 않는다. 같은 변경인지만 확정하지 못한 것이라
    _unconfirmed_notes가 양쪽 후보에 한계를 붙인다(관계는 있는데 비교할 수 없는 경우와 같다). 그
    밖에는 같은 변경을 합치면 가장 앞선 단위로 가므로, 가장 앞선 단위를 가진 묶음만 배정이
    그대로다. 나머지는 보류한다. 그 단위가 커밋 묶음이고 그런 묶음이 둘 이상이면 합쳤을 때 커밋
    묶음의 구성이 달라지므로 모두 보류한다.
    """
    already = [
        root
        for root in component
        if any(states[sha].membership in _HOLDS for sha in members[root])
    ]
    if already:
        if len(already) > 1:
            return list(component)
        return [root for root in component if root not in already]
    first: dict[str, UnitKey] = {}
    for root in component:
        keys = [key for sha in members[root] for key in _keys(states[sha])]
        if keys:
            first[root] = _first_unit(ctx, keys)
    if not first:
        return []
    units = list(first.values())
    if _POOL not in units and len(set(units)) == len(units):
        return []
    top = _first_unit(ctx, units)
    keep = [root for root, key in first.items() if key == top]
    if top == _POOL and len(keep) > 1:
        return list(first)
    return [root for root in first if root not in keep]


# 4. 배정


def _assign(ctx: _Context, states: States, same_change: _UnionFind) -> _Assignment:
    """같은 변경마다 가장 앞선 단위 하나에 배정한다. 확인하지 못한 커밋이 든 변경은 보류한다."""
    assignment = _Assignment()
    for members in same_change.groups():
        found = {states[sha].membership for sha in members}
        held = next((state for state in _HOLDS if state in found), None)
        keys = {key for sha in members for key in _keys(states[sha])}
        if not keys:
            # 키가 없고 보류도 아니면 PR·병합·커밋 묶음 어디에도 들지 않는 다른 계정 커밋이다.
            if held is not None:
                _hold(states, assignment, held, members)
            continue
        best = _first_unit(ctx, keys)
        if (
            held is None
            and isinstance(best, PullRequestUnit)
            and ctx.earlier_list_unreached(best.number)
        ):
            # 이 변경을 담았을 수 있는 앞선 PR(또는 이 PR)의 커밋 목록을 보지 못했다.
            held = Membership.STOPPED
        if held is not None:
            _hold(states, assignment, held, members)
            continue
        assignment.units.setdefault(best, []).append(members)
        listed_in = {
            number
            for sha in members
            for number, how in states[sha].pulls.items()
            if how & _LISTED
        }
        for number in sorted(listed_in):
            if PullRequestUnit(number) != best:
                assignment.moved_out[number] += 1
        if best != _POOL and _merged_from_elsewhere(states, best, members):
            assignment.merged_in[best] += 1
    return assignment


def _merged_from_elsewhere(
    states: Mapping[str, _CommitState], key: UnitKey, members: tuple[str, ...]
) -> bool:
    """같은 변경에 이 단위 밖의 커밋이 들었다(SHA가 다른 커밋을 같은 변경으로 확인해 하나로 셈)."""
    return len(members) > 1 and not all(_in_unit(states[sha], key) for sha in members)


def _hold(
    states: States,
    assignment: _Assignment,
    membership: Membership,
    members: tuple[str, ...],
) -> None:
    # 단위 미확정의 따로 세는 사유는 단위 미확정 커밋이 모두 그 사유일 때만 남긴다. 근거끼리
    # 어긋난 커밋이 섞였으면 그쪽(일반 단위 미확정)으로 센다.
    reasons = {
        states[sha].reason
        for sha in members
        if states[sha].membership is Membership.CONFLICT
    }
    reason = (
        next(iter(reasons))
        if membership is Membership.CONFLICT and len(reasons) == 1
        else None
    )
    for sha in members:
        states[sha].membership = membership
    assignment.held.append(
        HeldChange(membership, members, any(states[sha].own for sha in members), reason)
    )


def _change(
    ctx: _Context,
    states: Mapping[str, _CommitState],
    key: UnitKey,
    members: tuple[str, ...],
) -> AssignedChange:
    commits = tuple(sha for sha in members if _in_unit(states[sha], key))
    basis = tuple(sha for sha in commits if _contribution_basis(ctx, states, key, sha))
    own_inside = tuple(sha for sha in basis if states[sha].own)
    elsewhere = tuple(
        sha
        for sha in members
        if sha not in commits
        and states[sha].own
        and not any(
            _unlisted_squash(ctx, states, number, sha) for number in states[sha].pulls
        )
    )
    return AssignedChange(
        commits=commits,
        contributing=bool(basis),
        own_commits=own_inside or elsewhere,
    )


def _contribution_basis(
    ctx: _Context,
    states: Mapping[str, _CommitState],
    key: UnitKey,
    sha: str,
) -> bool:
    """이 단위에 배정된 커밋이 그 단위의 기여 근거인가(2026-10-08 팀장 결정 「본인 기여의 뜻」).

    병합·커밋 묶음은 들인 커밋이 곧 원래 커밋이다. PR은 커밋 목록에 있는 원래 커밋이 근거다.
    목록을 끝까지 받았으면 목록의 원래 커밋만 근거다. 목록을 다 받지 못했으면(크기 상한·판본
    불일치·250건에서 다 읽지 못함·목록 밖에서 연결 PR 조회로만 앎) 연결 PR 조회·merge_commit_sha로
    배정한 커밋도 근거로 쓰되, 그 PR의 squash 후보 커밋(merge_commit_sha이면서 부모가 하나)은
    빼고 squash_unconfirmed로 알린다. GitHub가 squash로 새로 만든 커밋의 작성자는 그 안 변경의
    명의로 보지 않기 때문이다.
    """
    if not isinstance(key, PullRequestUnit):
        return True
    number = key.number
    if states[sha].pulls[number] & _LISTED:
        return True
    # 목록 밖 근거(merge_commit_sha·연결 PR 조회)로만 이 PR에 속한다.
    if ctx.full_list(number):
        return False
    return not ctx.squash_candidate(number, sha)


def _unlisted_squash(
    ctx: _Context, states: Mapping[str, _CommitState], number: int, sha: str
) -> bool:
    """그 PR 목록에서 원래 커밋으로 확인하지 못한 squash 후보 커밋. 기여 근거로 쓰지 않는다.

    목록에 있으면 merge_commit_sha여도(fast-forward로 합친 PR의 마지막 커밋) 원래 커밋이다.
    """
    return not states[sha].pulls[number] & _LISTED and ctx.squash_candidate(number, sha)


def _squash_unconfirmed(
    ctx: _Context,
    states: Mapping[str, _CommitState],
    key: PullRequestUnit,
    changes: Iterable[AssignedChange],
) -> bool:
    """커밋 목록을 다 받지 못한 PR에서 본인 squash 후보 커밋을 기여 근거에서 뺐다.

    목록을 수집이 멈춰 받지 못했으면(NOT_REACHED) 그 PR의 변경은 이미 확인 중단으로 보류되므로
    여기 들지 않는다.
    """
    number = key.number
    entry = ctx.lists.get(number)
    if ctx.full_list(number) or (
        entry is not None and entry.status is DetailStatus.NOT_REACHED
    ):
        return False
    return any(
        states[sha].own and _unlisted_squash(ctx, states, number, sha)
        for change in changes
        for sha in change.commits
    )


# 5. 커밋 묶음(방법 B)


@dataclass(frozen=True)
class _Bundle:
    commits: tuple[str, ...]
    changes: tuple[tuple[str, ...], ...]
    notes: tuple[Note, ...]
    # 이 묶음 안에서 같은 변경으로 이은 쌍과 부모·변경 파일 겹침으로 이은 쌍(_Links).
    same_change_links: tuple[tuple[str, str], ...] = ()
    parent_links: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class _Links:
    """커밋 묶음 후보끼리의 부모·자식 판정."""

    # 이은 커밋들.
    bundles: _UnionFind
    # 이은 근거별 쌍(작은 SHA, 큰 SHA). 묶음 설명이 실제로 쓴 근거만 적도록 따로 둔다.
    same_change_links: frozenset[tuple[str, str]]
    parent_links: frozenset[tuple[str, str]]
    # 이웃의 소속이나 변경 내용을 수집이 멈춰 확인하지 못해 묶음 경계가 달라질 수 있는 커밋.
    blocked: frozenset[str]
    # 변경 내용이 없어 이웃과 잇는지 판단하지 않은 커밋.
    missing: frozenset[str]
    # 변경 파일이 잘려 이웃과 겹치는지 끝까지 보지 못한 커밋.
    truncated: frozenset[str]


def _paths(record: CommitRecord) -> frozenset[str]:
    changes = record.changes
    if changes is None:
        return frozenset()
    paths = {entry.path for entry in changes.files}
    paths.update(entry.previous_path for entry in changes.files if entry.previous_path)
    return frozenset(paths)


def _bundle(
    ctx: _Context,
    states: States,
    assignment: _Assignment,
    pool_changes: list[tuple[str, ...]],
) -> list[_Bundle]:
    """커밋 묶음에 배정한 변경을 이웃 판정으로 묶는다. 입력 순서와 무관하다.

    이웃 때문에 경계를 정하지 못한 묶음은 그 변경을 모두 확인 중단으로 보류한다.
    """
    pool = {
        sha
        for members in pool_changes
        for sha in members
        if _in_unit(states[sha], _POOL)
    }
    links = _neighbor_links(ctx, states, assignment, pool_changes, pool)
    result: list[_Bundle] = []
    for component in links.bundles.groups():
        component_set = set(component)
        changes = tuple(
            sorted(group for group in pool_changes if component_set.intersection(group))
        )
        if component_set & links.blocked:
            for group in changes:
                _hold(states, assignment, Membership.STOPPED, group)
            continue
        notes: list[Note] = []
        if component_set & links.missing:
            notes.append(Note(NoteKind.NEIGHBOR_DETAILS_MISSING))
        if component_set & links.truncated:
            notes.append(Note(NoteKind.NEIGHBOR_FILES_TRUNCATED))
        result.append(
            _Bundle(
                component,
                changes,
                tuple(notes),
                same_change_links=_links_within(links.same_change_links, component_set),
                parent_links=_links_within(links.parent_links, component_set),
            )
        )
    return result


def _links_within(
    links: frozenset[tuple[str, str]], component: set[str]
) -> tuple[tuple[str, str], ...]:
    return tuple(sorted(pair for pair in links if pair[0] in component))


def _neighbor_links(
    ctx: _Context,
    states: Mapping[str, _CommitState],
    assignment: _Assignment,
    pool_changes: list[tuple[str, ...]],
    pool: set[str],
) -> _Links:
    """부모가 하나뿐인 커밋을 그 부모와 잇는지 정한다.

    같은 변경으로 합친 커밋들은 먼저 한 묶음으로 잇는다. 그다음 부모와 자식이 모두 묶음 후보이고
    변경 파일(바꾼 경로와 이전 경로)이 겹치면 잇는다. 한쪽이 확인 중단으로 보류됐거나, 창이 잘려
    부모를 보지 못했거나, 변경 내용을 수집이 멈춰 받지 못했으면 막힌 것으로 둔다. 두 근거로 이은
    쌍은 따로 남긴다(같은 쌍이 두 근거를 모두 채우면 둘 다에 든다).
    """
    bundles = _UnionFind(pool)
    same_change_links: set[tuple[str, str]] = set()
    parent_links: set[tuple[str, str]] = set()
    for members in pool_changes:
        pooled = sorted(sha for sha in members if sha in pool)
        for sha in pooled[1:]:
            bundles.union(pooled[0], sha)
            same_change_links.add((pooled[0], sha))
    # 확인 중단으로 보류한 본인 커밋 가운데 커밋 묶음으로 올 수 있었던 것. 보류로 상태가 STOPPED로
    # 바뀌었으므로 _pool_bound 대신 PR 근거·병합이 없는지로 본다.
    stopped = {
        sha
        for held in assignment.held
        if held.membership is Membership.STOPPED
        for sha in held.commits
        if states[sha].own and not states[sha].pulls and states[sha].merge is None
    }
    blocked: set[str] = set()
    missing: set[str] = set()
    truncated: set[str] = set()
    for sha in sorted(pool | stopped):
        parents = ctx.commits[sha].parents
        if len(parents) != 1:
            continue
        parent = parents[0]
        if sha in stopped:
            if parent in pool:
                blocked.add(parent)
            continue
        if parent in stopped:
            blocked.add(sha)
            continue
        if parent not in pool:
            if ctx.window_cut and parent not in ctx.window:
                # 창이 수집 중단으로 잘려 부모를 보지 못했다. 부모가 본인 커밋이면 묶음이 달라진다.
                blocked.add(sha)
            continue
        child_record, parent_record = ctx.commits[sha], ctx.commits[parent]
        statuses = (child_record.changes_status, parent_record.changes_status)
        if child_record.changes is not None and parent_record.changes is not None:
            if _paths(child_record) & _paths(parent_record):
                bundles.union(sha, parent)
                low, high = sorted((sha, parent))
                parent_links.add((low, high))
            elif (
                child_record.changes.files_truncated
                or parent_record.changes.files_truncated
            ):
                truncated.update((sha, parent))
        elif DetailStatus.NOT_REACHED in statuses:
            blocked.update((sha, parent))
        else:
            missing.update((sha, parent))
    return _Links(
        bundles,
        frozenset(same_change_links),
        frozenset(parent_links),
        frozenset(blocked),
        frozenset(missing),
        frozenset(truncated),
    )


# 6. 단위 목록


def _outside_notes(ctx: _Context) -> tuple[Note, ...]:
    """PR 밖이라는 판정에 걸리는 저장소 전체의 한계. PR 없는 병합과 커밋 묶음에만 붙인다.

    PR 단위는 그 PR의 커밋 목록·merge_commit_sha·연결 PR 조회로 소속을 확인했으므로 붙이지 않는다.
    커밋 목록을 다 받지 못한 PR이 있어도 보류하지 않은 경우(모두 기본 브랜치 대상의 열린·병합
    PR)에만 목록 한계를 붙인다. 보류했으면 PR 밖으로 판정된 본인 커밋이 없다.
    """
    if not ctx.pulls_allowed:
        return (Note(NoteKind.PULL_REQUESTS_NOT_ALLOWED),)
    if ctx.lists_note:
        return (Note(NoteKind.PULL_REQUEST_LISTS_INCOMPLETE),)
    return ()


def _stopped_keys(
    states: Mapping[str, _CommitState], held: Iterable[HeldChange]
) -> frozenset[UnitKey]:
    """확인 중단으로 보류한 변경이 걸린 단위(그 변경의 PR·PR 없는 병합)."""
    return frozenset(
        key
        for change in held
        if change.membership is Membership.STOPPED
        for sha in change.commits
        for key in _keys(states[sha])
    )


def _stop_touches(
    ctx: _Context,
    key: UnitKey,
    commits: Iterable[str],
    stopped_keys: frozenset[UnitKey],
    uncompared: frozenset[str],
) -> bool:
    """이 단위의 구성·기여를 바꿀 수 있는 확인이 수집 중단으로 끝나지 않았다.

    이 단위에 걸린 변경을 확인 중단으로 보류했거나, 이 단위의 커밋이 든 관계 쌍을 비교하지
    못했거나, 병합된 PR인데 본인 커밋의 연결 PR 조회를 마치지 못했거나(squash·rebase 커밋이 그
    조회로만 배정된다), 이 PR이나 먼저 병합된 PR의 커밋 목록을 받지 못했을 때다. 수집이 멈춘
    것만으로는 해당하지 않는다(무관한 실패가 확인된 판정을 바꾸지 않게).
    """
    if key in stopped_keys or any(sha in uncompared for sha in commits):
        return True
    if isinstance(key, PullRequestUnit):
        merged = ctx.pull_requests[key.number].merged_at is not None
        return (merged and ctx.lookups_unfinished) or ctx.earlier_list_unreached(
            key.number
        )
    return False


def _other_authors(ctx: _Context, commits: Iterable[str], whole: bool) -> OtherAuthors:
    """범위의 커밋에 연동 계정이 작성자로 기록되지 않은 커밋이 있는가.

    본인 판정은 _Context.own과 같다(작성자 계정이 없는 커밋은 기록되지 않은 쪽). 본 커밋 가운데
    하나라도 그렇다면 있다. 없다는 범위를 모두 받았고(whole) 그 커밋 기록을 모두 보았을 때만이고,
    그 밖에는 알 수 없다.
    """
    seen_all = whole
    for sha in sorted(commits):
        record = ctx.commits.get(sha)
        if record is None:
            seen_all = False
        elif not ctx.own(record):
            return "PRESENT"
    return "ABSENT" if seen_all else "UNKNOWN"


def _pull_request_other_authors(ctx: _Context, number: int) -> OtherAuthors:
    """PR 커밋 목록 전체(병합 커밋 포함) 기준. 목록을 받지 못했으면(크기 상한·판본 불일치·범위
    밖·수집 중단·목록 없음) 알 수 없다."""
    entry = ctx.lists.get(number)
    if entry is None or entry.status is not DetailStatus.FETCHED:
        return "UNKNOWN"
    return _other_authors(ctx, entry.commits, entry.complete)


def _merge_other_authors(ctx: _Context, merge: _Merge) -> OtherAuthors:
    """PR 없는 병합이 들인 커밋 전체(흡수분을 빼고 경계 비교를 반영한 집합, 병합 커밋 자신 제외)."""
    return _other_authors(ctx, merge.brought - {merge.sha}, merge.complete)


def _units(
    ctx: _Context,
    states: Mapping[str, _CommitState],
    assignment: _Assignment,
    bundles: list[_Bundle],
    same_change: _UnionFind,
    change_notes: Mapping[str, frozenset[Note]],
    inner_placed: Counter[str],
    uncompared: frozenset[str],
    merges: Mapping[str, _Merge],
    assigned: frozenset[str],
) -> tuple[tuple[GroupedUnit, ...], int]:
    """단위마다 변경·근거·한계를 굳힌다. PR·병합 단위는 나누지 않고 단위 전체가 하나다(BR1.1).

    uncompared는 수집이 멈춰 비교하지 못한 관계 쌍의 커밋이다. 기여 확인은 요청 전체의 완료 여부가
    아니라 그 단위에 걸린 확인으로 판단한다(_stop_touches). 그에 더해 어느 PR이든 커밋 목록을 수집이
    멈춰 받지 못했으면 끝나지 않은 것으로 본다. 그 목록의 커밋이 같은 변경으로 이 단위의 본인 기여가
    될 수 있기 때문이다. merges는 병합 커밋마다 PR 없는 병합 판정이다.

    assigned(소속 커밋 집합, CR2)로 각 단위의 소속 변경을 뺀다(_without_assigned). 근거·기여는 남은
    변경으로 정하고(BR1.5), 묶음 한계 메모·기여 확인·다른 PR로 보낸 수·안쪽 병합 수처럼 단위 전체의
    성질은 뺀 변경까지 본 그대로 둔다(BR1.8). 같은 변경으로 하나로 센 수는 남은 변경으로 다시 센다.
    둘째 값은 빼고 나니 본인 기여 변경이 없어 버린 단위 수다.
    """
    stopped_keys = _stopped_keys(states, assignment.held)
    lists_unreached = any(
        entry.status is DetailStatus.NOT_REACHED for entry in ctx.lists.values()
    )
    outside_notes = _outside_notes(ctx)
    merge_sources = frozenset(
        {
            MembershipSource.MERGE_PARENTS,
            *([MembershipSource.LOOKUP] if ctx.pulls_allowed else []),
        }
    )

    def notes_for(
        changes: Iterable[AssignedChange], extra: Iterable[Note]
    ) -> tuple[Note, ...]:
        found = set(extra)
        for change in changes:
            for sha in change.commits:
                found.update(change_notes.get(same_change.find(sha), ()))
        return tuple(sorted(found))

    result: list[GroupedUnit] = []
    dropped = 0
    pull_keys = sorted(
        (key for key in assignment.units if isinstance(key, PullRequestUnit)),
        key=lambda key: key.number,
    )
    merge_keys = sorted(
        (key for key in assignment.units if isinstance(key, MergeUnit)),
        key=lambda key: key.commit,
    )
    unit_keys: list[PullRequestUnit | MergeUnit] = [*pull_keys, *merge_keys]
    for key in unit_keys:
        all_members = tuple(sorted(assignment.units[key]))
        every = tuple(_change(ctx, states, key, members) for members in all_members)
        kept = _without_assigned(all_members, every, assigned)
        if kept is None:
            dropped += 1
            continue
        kept_members, changes = kept
        extra: tuple[Note, ...]
        if isinstance(key, PullRequestUnit):
            sources = frozenset(
                how
                for change in changes
                for sha in change.commits
                for how in states[sha].pulls[key.number]
            )
            extra = (
                (Note(NoteKind.EARLIER_PULL_REQUEST_LIST_INCOMPLETE),)
                if ctx.earlier_merged_list_incomplete(key.number)
                else ()
            )
            moved, inner = assignment.moved_out[key.number], 0
            other_authors = _pull_request_other_authors(ctx, key.number)
        else:
            sources = merge_sources
            extra = outside_notes
            moved, inner = 0, inner_placed[key.commit]
            other_authors = _merge_other_authors(ctx, merges[key.commit])
        commits = [sha for change in every for sha in change.commits]
        touched = _stop_touches(ctx, key, commits, stopped_keys, uncompared)
        settled = not touched and not (
            isinstance(key, PullRequestUnit) and lists_unreached
        )
        result.append(
            GroupedUnit(
                key,
                changes,
                sources=sources,
                notes=notes_for(every, extra),
                moved_out=moved,
                merged_in=assignment.merged_in[key]
                if len(changes) == len(every)
                else sum(
                    1
                    for members in kept_members
                    if _merged_from_elsewhere(states, key, members)
                ),
                inner_placed=inner,
                squash_unconfirmed=isinstance(key, PullRequestUnit)
                and _squash_unconfirmed(ctx, states, key, every),
                contribution_settled=settled,
                other_authors=other_authors,
            )
        )
    for bundle in sorted(bundles, key=lambda item: item.commits[0]):
        every = tuple(
            _change(ctx, states, _POOL, members) for members in bundle.changes
        )
        kept = _without_assigned(bundle.changes, every, assigned)
        if kept is None:
            dropped += 1
            continue
        kept_members, changes = kept
        removed = len(changes) != len(every)
        # BR1.3: 커밋 묶음은 남은 커밋으로 단위(열쇠)를 다시 만든다. 빼지 않았으면 묶음 그대로다.
        remaining = (
            tuple(sorted(sha for change in changes for sha in change.commits))
            if removed
            else bundle.commits
        )
        result.append(
            GroupedUnit(
                CommitsUnit(remaining),
                changes,
                sources=frozenset(
                    [MembershipSource.LOOKUP] if ctx.pulls_allowed else []
                ),
                notes=notes_for(every, [*outside_notes, *bundle.notes]),
                merged_in=sum(
                    1
                    for members in kept_members
                    if _merged_from_elsewhere(states, _POOL, members)
                ),
                contribution_settled=not any(
                    sha in uncompared for sha in bundle.commits
                ),
                same_change_links=_links_kept(bundle.same_change_links, remaining),
                parent_links=_links_kept(bundle.parent_links, remaining),
                via_assigned=removed,
            )
        )
    return tuple(result), dropped


# 7. 소속 빼기(CR2)


def _without_assigned(
    members: Sequence[tuple[str, ...]],
    changes: Sequence[AssignedChange],
    assigned: frozenset[str],
) -> tuple[tuple[tuple[str, ...], ...], tuple[AssignedChange, ...]] | None:
    """단위의 (같은 변경 묶음, 변경)에서 소속 변경을 뺀다. 버릴 단위면 None이다.

    변경의 관측 커밋이나 본인 기여 커밋 가운데 하나라도 소속 커밋이면 그 변경 전체가 소속 변경이다
    (BR1.1). 뺀 변경이 없으면 그대로 돌려준다(본인 기여가 없어도 지금처럼 후보 판정이 미제공 사유를
    정한다). 하나라도 뺐는데 기여 근거이면서 본인 커밋이 있는 변경이 남지 않으면 버린다(BR1.4).
    """
    pairs = [
        (group, change)
        for group, change in zip(members, changes, strict=True)
        if assigned.isdisjoint(change.commits)
        and assigned.isdisjoint(change.own_commits)
    ]
    if len(pairs) == len(changes):
        return tuple(members), tuple(changes)
    if not any(change.contributing and change.own_commits for _, change in pairs):
        return None
    return tuple(group for group, _ in pairs), tuple(change for _, change in pairs)


def _links_kept(
    links: tuple[tuple[str, str], ...], commits: tuple[str, ...]
) -> tuple[tuple[str, str], ...]:
    """두 끝이 모두 남은 커밋인 연결만 남긴다(BR1.8)."""
    kept = set(commits)
    return tuple(pair for pair in links if pair[0] in kept and pair[1] in kept)
