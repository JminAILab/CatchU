"""기본 브랜치 창의 부모 관계로 PR 없는 병합을 가리는 순수 계산(#118).

창은 기본 브랜치 커밋 목록으로 받은 커밋이다. GitHub를 부르지 않는다. 수집의 관계 조회(연결 PR
조회 대상 고르기)와 후보 처리(병합 단위 판정)가 같은 정의를 쓰도록 여기에 둔다.

- 머리: 창의 어떤 커밋의 부모도 아닌 창 커밋. 하나가 아니면 None이며 본선을 정하지 않는다.
- 본선: 머리에서 첫 부모만 따라간 창 안의 사슬. 추가 기준 브랜치도 같은 방법으로 사슬을 만든다.
- 흡수 병합: 본선에 없고, 첫 부모가 아닌 부모가 본선이나 추가 기준 브랜치 사슬에 있는 병합 커밋.
  기준 브랜치를 작업 브랜치로 받아온 병합이라 작업 단위로 쓰지 않는다. 흡수 병합이 들인 커밋
  (absorbed_commits)은 기준 브랜치에서 온 커밋이라, 그 흡수 병합을 들인 바깥 병합이 들인 커밋에서
  뺀다(빼는 곳은 relations.PullRequestLessMerges.brought_in).
- 들인 커밋 S(M): M의 첫 부모가 아닌 부모들의 창 안 조상에서 첫 부모의 창 안 조상과 M을 뺀 것.
  첫 부모가 아닌 쪽을 걷다가 창 밖 부모에 닿으면 보지 못한 커밋이 있으므로 complete가 거짓이다.
  첫 부모 쪽을 걷다가 창 밖 부모에 닿으면(first_side_open) 첫 부모가 이미 담은 커밋을 창만으로는
  다 빼지 못한다. 이때 S(M)은 실제보다 많을 수 있어, 부르는 쪽이 첫 부모와 M의 비교로 경계를
  확인하거나 확정하지 않는다(경계를 추정하지 않는다).
- 조상 순서: 창 안 조상이 늘 앞서는 자리. 창 안 부모를 모두 자리에 둔 커밋 가운데 커밋 시각이 이른
  것, 같으면 작은 SHA를 먼저 둔다. 어느 병합이 같은 변경을 먼저 들였는지 정할 때 쓰며 목록 순서와
  무관하다.
"""

import heapq
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime

from app.collection.records import CommitRecord

Parents = Mapping[str, tuple[str, ...]]


def is_merge(record: CommitRecord) -> bool:
    """부모가 둘 이상인 병합 커밋. 변경으로 세지 않고 단위 경계에만 쓴다."""
    return len(record.parents) >= 2


def first_parent_chain(head: str | None, parents: Parents) -> tuple[str, ...]:
    """head에서 첫 부모만 따라간 사슬. parents에 없는 커밋에 닿으면 멈춘다."""
    chain: list[str] = []
    seen: set[str] = set()
    current = head
    while current is not None and current in parents and current not in seen:
        seen.add(current)
        chain.append(current)
        own_parents = parents[current]
        current = own_parents[0] if own_parents else None
    return tuple(chain)


@dataclass(frozen=True)
class BroughtIn:
    """병합 하나가 들인 창 안 커밋."""

    commits: frozenset[str]
    # 첫 부모가 아닌 쪽을 걷는 중 창 밖 부모에 닿지 않았다. 거짓이면 들인 커밋을 모두 보지 못했을 수
    # 있다.
    complete: bool
    # 첫 부모 쪽 조상을 걷다 창 밖 부모에 닿았다(첫 부모가 창 밖인 경우도). 참이면 첫 부모가 이미 담은
    # 커밋이 commits에 남았을 수 있다.
    first_side_open: bool = False


@dataclass(frozen=True)
class WindowGraph:
    order: tuple[str, ...]
    parents: Parents
    head: str | None
    mainline: frozenset[str]
    # 창 커밋마다 커밋 시각. 조상 관계가 없는 커밋끼리의 순서에 쓴다.
    committed_at: Mapping[str, datetime]

    @classmethod
    def of(cls, commits: Iterable[CommitRecord]) -> "WindowGraph":
        parents: dict[str, tuple[str, ...]] = {}
        committed_at: dict[str, datetime] = {}
        order: list[str] = []
        for record in commits:
            if record.sha not in parents:
                parents[record.sha] = record.parents
                committed_at[record.sha] = record.committed_at
                order.append(record.sha)
        referenced = {parent for each in parents.values() for parent in each}
        heads = [sha for sha in order if sha not in referenced]
        head = heads[0] if len(heads) == 1 else None
        return cls(
            order=tuple(order),
            parents=parents,
            head=head,
            mainline=frozenset(first_parent_chain(head, parents)),
            committed_at=committed_at,
        )

    def is_merge(self, sha: str) -> bool:
        return len(self.parents.get(sha, ())) >= 2

    def _key(self, sha: str) -> tuple[datetime, str]:
        return (self.committed_at[sha], sha)

    def parents_first(self) -> dict[str, int]:
        """창 커밋마다 자리(0부터). 창 안 조상은 늘 자손보다 앞선다.

        창 안 부모를 모두 자리에 둔 커밋 가운데 커밋 시각이 이른 것을, 같으면 작은 SHA를 먼저 둔다.
        목록 위치는 쓰지 않으므로 같은 커밋을 어떤 순서로 받아도 자리가 같다.
        """
        waiting: dict[str, int] = {}
        children: dict[str, list[str]] = {}
        for sha in self.order:
            inside = {parent for parent in self.parents[sha] if parent in self.parents}
            waiting[sha] = len(inside)
            for parent in inside:
                children.setdefault(parent, []).append(sha)
        ready = [self._key(sha) for sha in self.order if waiting[sha] == 0]
        heapq.heapify(ready)
        rank: dict[str, int] = {}
        while ready:
            _, sha = heapq.heappop(ready)
            rank[sha] = len(rank)
            for child in children.get(sha, ()):
                waiting[child] -= 1
                if waiting[child] == 0:
                    heapq.heappush(ready, self._key(child))
        # 부모 관계에 고리가 있으면(git 이력에는 없다) 남은 커밋을 같은 기준(시각, SHA)으로 뒤에 둔다.
        for sha in sorted(self.order, key=self._key):
            rank.setdefault(sha, len(rank))
        return rank

    def _walk(self, starts: Iterable[str]) -> tuple[frozenset[str], bool]:
        """(starts와 그 창 안 조상, 창 밖 커밋에 닿았는가)."""
        found: set[str] = set()
        reached_outside = False
        stack = list(starts)
        while stack:
            sha = stack.pop()
            if sha in found:
                continue
            if sha not in self.parents:
                reached_outside = True
                continue
            found.add(sha)
            stack.extend(self.parents[sha])
        return frozenset(found), reached_outside

    def ancestors(self, starts: Iterable[str]) -> frozenset[str]:
        """starts와 그 창 안 조상. 창 밖 커밋은 넣지 않는다."""
        found, _ = self._walk(starts)
        return found

    def brought_in(self, merge: str) -> BroughtIn:
        own_parents = self.parents.get(merge, ())
        if len(own_parents) < 2:
            raise ValueError("병합 커밋이 아니다")
        first, *others = own_parents
        base, first_side_open = self._walk((first,))
        found: set[str] = set()
        complete = True
        stack = list(others)
        while stack:
            sha = stack.pop()
            if sha in found or sha in base or sha == merge:
                continue
            if sha not in self.parents:
                complete = False
                continue
            found.add(sha)
            stack.extend(self.parents[sha])
        return BroughtIn(frozenset(found), complete, first_side_open)

    def absorption_merges(
        self, base_lines: Iterable[frozenset[str]] = ()
    ) -> frozenset[str]:
        """본선에 없고, 첫 부모가 아닌 부모가 본선이나 추가 기준 브랜치 사슬에 있는 병합."""
        bases = set(self.mainline).union(*base_lines)
        return frozenset(
            sha
            for sha in self.order
            if self.is_merge(sha)
            and sha not in self.mainline
            and any(parent in bases for parent in self.parents[sha][1:])
        )

    def absorbed_commits(
        self, base_lines: Iterable[frozenset[str]] = ()
    ) -> dict[str, frozenset[str]]:
        """흡수 병합마다 들인 창 안 커밋(흡수 병합이 기준 브랜치에서 들여온 커밋).

        이 커밋은 원래 들어온 단위에 속한다. 그래서 그 흡수 병합을 들인 바깥 PR 없는 병합의 들인
        커밋에서 뺀다. 흡수 병합을 들이지 않은 병합(그 커밋을 기본 브랜치에 처음 들인 병합 등)에서는
        빼지 않는다.
        """
        return {
            merge: self.brought_in(merge).commits
            for merge in sorted(self.absorption_merges(base_lines))
        }

    def candidate_merges(
        self, *, explained: Iterable[str], absorbed: frozenset[str]
    ) -> tuple[str, ...]:
        """PR 없는 병합 후보: 창 안 병합 커밋 가운데 PR로 설명되지 않고 흡수 병합도 아닌 것.

        explained에는 PR의 merge_commit_sha와 조회한 PR 커밋 목록의 SHA를 넘긴다. 머리가 하나로
        정해지지 않으면 본선이 비어 흡수 병합을 덜 가리므로, 이때 병합 단위를 확정할지는 부르는
        쪽이 head로 정한다.
        """
        known = set(explained)
        return tuple(
            sha
            for sha in self.order
            if self.is_merge(sha) and sha not in known and sha not in absorbed
        )


def base_line(head: str | None, parents: Parents) -> tuple[frozenset[str], bool]:
    """(추가 기준 브랜치의 첫 부모 사슬, 사슬이 뿌리 커밋(부모 없는 커밋)에서 끝났는가).

    parents에는 그 브랜치 커밋과 창 커밋을 함께 넘긴다. 뿌리에 닿지 않고 parents에 없는 부모에서
    멈췄으면 받은 범위 밖으로 사슬이 이어진다.
    """
    chain = first_parent_chain(head, parents)
    return frozenset(chain), bool(chain) and not parents[chain[-1]]
