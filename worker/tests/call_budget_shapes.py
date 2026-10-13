"""요청당 호출 수를 비교할 합성 저장소 모양(#267).

기본 브랜치 창(최근 커밋 목록)에 연동 계정·다른 계정이 바로 올린 커밋, PR 없는 병합(곁가지의 본인
커밋을 들임), 병합 커밋으로 합친 PR을 정한 개수만큼 둔다. 실제 저장소를 복제하거나 부르지 않는다.
개수는 #267 이슈 「왜」 표의 공개 저장소 모양(연동 계정 커밋·PR·PR 없는 병합 수)을 본떠 골랐다.

연결 PR 조회와 경계 비교 응답은 수집이 부를 대상에만 둔다. 이 모듈은 연결 PR 조회 방식(REST·GraphQL)과
무관한 사례 도구(`candidate_scenarios.Scenario`)만 써서, 기준 판본(REST)과 같은 사례를 돌려 호출 수를
비교할 수 있다.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from candidate_scenarios import (
    Commit,
    Pull,
    Scenario,
    change,
    commit,
    merge_commit,
)
from github_synthetic import (
    BASE,
    MEMBER,
    OTHER,
    Reply,
    compare_json,
    compare_path,
    respond,
    sha,
)

# 합성 SHA 번호의 시작. 사례 도구가 쓰는 번호(뿌리 1, PR 머리 +2000 등)와 겹치지 않게 크게 둔다.
_FIRST = 100_000
# 창 밖의 첫 부모(창이 잘린 저장소에서 가장 오래된 창 커밋의 부모).
_OUTSIDE = sha(99_999)


@dataclass(frozen=True)
class Shape:
    name: str
    # 기본 브랜치에 바로 올린 연동 계정 커밋(병합 아님).
    own_direct: int
    # 다른 계정 커밋.
    other_direct: int
    # PR 없는 병합마다 곁가지에서 들인 연동 계정 커밋 수. 병합 커밋도 연동 계정이 만든다.
    merges: tuple[int, ...] = ()
    # 연동 계정이 열어 병합 커밋으로 합친 PR마다 커밋 수.
    pulls: tuple[int, ...] = ()
    # 창이 저장소의 모든 이력(뿌리 커밋까지)이면 참. 거짓이면 창은 최근 500건이고 그 밖에 이력이 있다.
    full_history: bool = False

    @property
    def window(self) -> int:
        return (
            self.own_direct
            + self.other_direct
            + sum(count + 1 for count in self.merges)
            + sum(count + 1 for count in self.pulls)
        )


# 「왜」 표의 모양을 본뜬 사례. 최근 커밋 500건 창 안의 개수다.
SHAPES = (
    # 본인 커밋 500건(병합 2건 포함)·PR 0건, 첫 부모 쪽이 창 밖으로 열린 PR 없는 병합 2건.
    Shape("본인 500·PR 0", own_direct=494, other_direct=0, merges=(2, 2)),
    # algo-problem: 연결 PR 조회 499(커밋 496+병합 3), 경계 비교 3.
    Shape("algo-problem 모양", own_direct=490, other_direct=1, merges=(2, 2, 2)),
    # Goose: 연결 PR 조회 146(커밋 85+병합 61), 경계 비교 61.
    Shape("Goose 모양", own_direct=24, other_direct=354, merges=(1,) * 61),
    # BEASTA-ZOO: 연결 PR 조회 106(커밋 58+병합 48), 경계 비교 48.
    Shape("BEASTA-ZOO 모양", own_direct=10, other_direct=394, merges=(1,) * 48),
    # TheMe: 커밋 484건(창이 모든 이력), PR 2, 연결 PR 조회 168(커밋 119+병합 49), 경계 비교 0.
    Shape(
        "TheMe 모양",
        own_direct=70,
        other_direct=309,
        merges=(1,) * 49,
        pulls=(3, 2),
        full_history=True,
    ),
    # PR로 작업하는 저장소(CatchU처럼): PR 100건, 연결 PR 조회 19(커밋 15+병합 4), 경계 비교 4.
    # 커밋 15는 바로 올린 본인 커밋 11과 PR 없는 병합 곁가지의 본인 커밋 4다.
    Shape(
        "PR 중심",
        own_direct=11,
        other_direct=181,
        merges=(1,) * 4,
        pulls=(2,) * 100,
    ),
)


@dataclass(frozen=True)
class Built:
    scenario: Scenario
    # 연결 PR을 조회할 커밋(본인 병합 아닌 커밋, 그다음 PR 없는 병합). 모두 빈 목록으로 답한다.
    lookups: tuple[str, ...]
    # 경계 비교(첫 부모...병합)를 부를 병합.
    boundaries: tuple[str, ...]


def build(shape: Shape) -> Built:
    """모양대로 만든 사례. 창은 최근 것부터이고 병합 뒤에 그 곁가지 커밋이 온다."""
    if not shape.full_history and shape.window != 500:
        raise ValueError("잘린 창은 최근 커밋 500건이어야 한다")
    if shape.window > 500:
        raise ValueError("창은 500건을 넘지 않는다")
    numbers = iter(range(_FIRST, _FIRST + 10 * shape.window))
    events = _events(shape)
    window: list[Commit] = []
    pulls: list[Pull] = []
    own_targets: list[str] = []
    merge_targets: list[str] = []
    boundaries: dict[str, Reply] = {}
    minute = 10 * shape.window
    # 가장 최근 것부터 만든다. 각 사건의 첫 부모는 다음(더 오래된) 본선 커밋이다.
    mainline = [sha(next(numbers)) for _ in events]
    for index, (kind, count) in enumerate(events):
        here = mainline[index]
        if index + 1 < len(mainline):
            first = mainline[index + 1]
        else:
            first = "" if shape.full_history else _OUTSIDE
        parents = (first,) if first else ()
        if kind in ("own", "other"):
            author = MEMBER if kind == "own" else OTHER
            window.append(
                commit(here, author, parents=parents, minute=minute, files=_files(here))
            )
            if kind == "own":
                own_targets.append(here)
            minute -= 1
            continue
        side = [sha(next(numbers)) for _ in range(count)]
        # 곁가지는 첫 부모에서 갈라진다. side[0]이 곁가지 끝(가장 최근)이다.
        side_commits = [
            commit(
                each,
                MEMBER,
                parents=(side[position + 1],) if position + 1 < count else parents,
                minute=minute - 1 - position,
                files=_files(each),
            )
            for position, each in enumerate(side)
        ]
        merge = merge_commit(here, first, side[0], author=MEMBER, minute=minute)
        window.append(merge)
        window.extend(side_commits)
        minute -= count + 1
        if kind == "pull":
            pulls.append(
                Pull(
                    len(pulls) + 1,
                    MEMBER,
                    tuple(reversed(side_commits)),
                    merge_commit=here,
                    head=side[0],
                    created=index,
                    merged=index + 1,
                )
            )
            continue
        own_targets.extend(side)
        merge_targets.append(here)
        if not shape.full_history:
            compared = [each.item for each in reversed(side_commits)] + [merge.item]
            boundaries[compare_path(first, here, 1)] = respond(
                compare_json(count + 1, first, compared)
            )
    overrides: dict[str, Reply] = dict(boundaries)
    pages = (len(window) + 99) // 100
    for page in range(1, pages + 1):
        overrides[f"{BASE}/commits?per_page=100&page={page}"] = respond(
            [each.item for each in window[(page - 1) * 100 : page * 100]],
            next_page=page < pages or not shape.full_history,
        )
    lookups = (*_newest_first(own_targets, window), *merge_targets)
    return Built(
        Scenario(
            default_branch=tuple(window),
            pulls=tuple(pulls),
            lookups={target: () for target in lookups},
            overrides=overrides,
        ),
        tuple(lookups),
        tuple(merge for merge in merge_targets if not shape.full_history),
    )


def _events(shape: Shape) -> list[tuple[str, int]]:
    """본선 사건을 최근 것부터: 바로 올린 커밋 사이에 병합·PR을 고르게 섞는다."""
    # 다른 계정 커밋을 본인 커밋 사이에 고르게 섞는다.
    mixed = _spread(
        [("own", 1)] * shape.own_direct, [("other", 1)] * shape.other_direct
    )
    grouped = _spread(
        [("merge", count) for count in shape.merges],
        [("pull", count) for count in shape.pulls],
    )
    events = _spread(mixed, grouped)
    if shape.full_history and events and events[-1][0] != "other":
        # 뿌리 커밋은 다른 계정의 바로 올린 커밋으로 둔다.
        last_other = max(i for i, event in enumerate(events) if event[0] == "other")
        events.append(events.pop(last_other))
    return events


def _spread[T](many: Sequence[T], few: Sequence[T]) -> list[T]:
    """many 사이에 few를 고르게 끼운다(앞뒤 순서는 각각 유지한다)."""
    if not few:
        return list(many)
    if not many:
        return list(few)
    result: list[T] = []
    step = len(many) / len(few)
    taken = 0
    for index, item in enumerate(few):
        until = round((index + 0.5) * step)
        result.extend(many[taken:until])
        taken = until
        result.append(item)
    result.extend(many[taken:])
    return result


def _files(sha_value: str) -> list[dict[str, Any]]:
    # 커밋마다 다른 파일 하나를 고친다(풀이 파일을 하나씩 더하는 저장소처럼).
    return [change(f"src/{sha_value[-6:]}.py")]


def _newest_first(targets: Sequence[str], window: Sequence[Commit]) -> list[str]:
    """연결 PR 조회 1단계 대상의 순서: 기본 브랜치 목록 순서."""
    wanted = set(targets)
    return [each.sha for each in window if each.sha in wanted]
