"""작업 동일성 값(workIdentity) 규칙 판본 wi1.

`docs/CatchU_work_identity_rules.md` 「workIdentity 만드는 법」을 그대로 옮겼다. 판정 입력은
방식·저장소·작업 단위·나눈 부분뿐이다. 제목·작업 사실·근거·판본 값(sourceRevision)·동의 범위
판본·회원·요청·시도·결과 번호는 받지 않는다. 정규 JSON의 UTF-8 바이트를 SHA-256으로 해시해
`wi1:` 뒤에 붙인다. B는 값을 해석하지 않고 같은지만 보므로, 단위·부분·정규화·직렬화·해시 중
하나라도 바꾸면 판본을 올린다. 어느 단위로 묶을지와 언제 나눌지는 후보 묶음이 정한다.
"""

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from typing import assert_never, get_args

from app.collection.identifiers import normalize_sha, require_number
from app.processing.request_check import SourceMode

WORK_IDENTITY_VERSION = "wi1"
_SOURCE_MODES: frozenset[str] = frozenset(get_args(SourceMode))


@dataclass(frozen=True)
class PullRequestUnit:
    number: int

    def __post_init__(self) -> None:
        require_number(self.number)


@dataclass(frozen=True)
class MergeUnit:
    """PR 없이 합친 병합. 병합 커밋의 전체 SHA."""

    commit: str

    def __post_init__(self) -> None:
        normalize_sha(self.commit)


@dataclass(frozen=True)
class CommitsUnit:
    """방법 B로 묶은 커밋. 순서·대소문자·중복은 값을 만들 때 정규화한다."""

    commits: tuple[str, ...]

    def __post_init__(self) -> None:
        # 빈 커밋 묶음은 묶음 처리의 결함이다. 단위 미확정으로 바꾸지 않는다.
        if not self.commits:
            raise ValueError("커밋이 하나도 없는 커밋 묶음은 만들지 않는다")
        for commit in self.commits:
            normalize_sha(commit)


@dataclass(frozen=True)
class IssueUnit:
    number: int

    def __post_init__(self) -> None:
        require_number(self.number)


WorkUnit = PullRequestUnit | MergeUnit | CommitsUnit | IssueUnit


@dataclass(frozen=True)
class Part:
    """나눈 부분의 항목. 경로가 없으면 커밋 전체, 있으면 그 커밋의 한 파일 경로."""

    commit: str
    # 그 커밋에서 GitHub가 준 저장소 기준 경로. 대소문자·유니코드 정규화를 바꾸지 않는다.
    path: str | None = None

    def __post_init__(self) -> None:
        normalize_sha(self.commit)
        if self.path is not None and (not isinstance(self.path, str) or not self.path):
            raise ValueError("나눈 부분의 경로가 비었거나 문자열이 아니다")


def work_identity(
    source_mode: SourceMode,
    repository_id: str,
    unit: WorkUnit,
    parts: Iterable[Part] = (),
) -> str:
    """`wi1:` + 정규 JSON의 SHA-256 소문자 16진수(68자).

    부분은 호출하는 묶음 처리가 지킨다. 이 함수는 단위의 전체 커밋·경로 목록을 모른다.
    - 단위 전체가 한 후보면 parts를 비운다. 모든 커밋을 부분으로 나열하지 않는다.
    - 한 커밋의 모든 경로가 이 후보에 속하면 경로 대신 `Part(commit)`으로 넘긴다.
    - PR·병합 단위의 부분에는 그 단위에 배정된, 병합 커밋이 아닌 커밋만 적는다.
    단위 값만으로 어긋남이 보이는 부분(이슈 단위의 부분, 병합 단위의 병합 커밋, 커밋 묶음 밖의
    커밋, 커밋 경계로만 나눈 커밋 묶음)은 묶음 처리의 결함이라 값을 만들지 않고 ValueError를 낸다.
    """
    if source_mode not in _SOURCE_MODES:
        raise ValueError("방식은 MOCK 또는 LIVE다")
    # 불투명한 요청 값이라 대소문자·공백을 바꾸지 않는다.
    if not isinstance(repository_id, str) or not repository_id:
        raise ValueError("저장소 값이 비었거나 문자열이 아니다")
    text = json.dumps(
        {
            "version": WORK_IDENTITY_VERSION,
            "sourceMode": source_mode,
            "repositoryId": repository_id,
            "unit": _unit_value(unit),
            "part": _part_value(unit, parts),
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return f"{WORK_IDENTITY_VERSION}:{digest}"


def _unit_value(unit: WorkUnit) -> dict[str, object]:
    match unit:
        case PullRequestUnit(number=number):
            return {"type": "PULL_REQUEST", "number": require_number(number)}
        case MergeUnit(commit=commit):
            return {"type": "MERGE", "commit": normalize_sha(commit)}
        case CommitsUnit(commits=commits):
            normalized = sorted({normalize_sha(commit) for commit in commits})
            if not normalized:
                raise ValueError("커밋이 하나도 없는 커밋 묶음은 만들지 않는다")
            return {"type": "COMMITS", "commits": normalized}
        case IssueUnit(number=number):
            return {"type": "ISSUE", "number": require_number(number)}
        case _:
            assert_never(unit)


def _part_value(unit: WorkUnit, parts: Iterable[Part]) -> list[dict[str, str]]:
    """한 커밋은 한 가지로만 적는다: 커밋 전체가 있으면 그 커밋의 경로 항목을 흡수한다."""
    whole: set[str] = set()
    paths: dict[str, set[str]] = {}
    for part in parts:
        commit = normalize_sha(part.commit)
        if part.path is None:
            whole.add(commit)
        else:
            paths.setdefault(commit, set()).add(part.path)
    _require_parts_fit_unit(unit, whole, set(paths) - whole)
    entries: list[tuple[str, int, str]] = [(commit, 0, "") for commit in whole]
    entries.extend(
        (commit, 1, path)
        for commit, commit_paths in paths.items()
        if commit not in whole
        for path in commit_paths
    )
    # (SHA, 경로) 순, 경로 없는 항목 먼저. 문자열은 유니코드 코드 포인트 순(Python 기본 비교).
    entries.sort()
    return [
        {"commit": commit} if kind == 0 else {"commit": commit, "path": path}
        for commit, kind, path in entries
    ]


def _require_parts_fit_unit(unit: WorkUnit, whole: set[str], split: set[str]) -> None:
    """단위 값만으로 알아볼 수 있는 부분의 어긋남을 거른다. split은 경로로 나눈 커밋이다."""
    if not whole and not split:
        return
    match unit:
        case PullRequestUnit():
            # PR의 커밋 목록은 이 함수가 모른다. 배정 확인은 묶음 처리의 몫이다.
            return
        case IssueUnit():
            raise ValueError("이슈 단위에는 나눌 커밋이 없다")
        case MergeUnit(commit=commit):
            if normalize_sha(commit) in whole | split:
                raise ValueError("병합 커밋은 어느 부분에도 넣지 않는다")
        case CommitsUnit(commits=commits):
            if not (whole | split) <= {normalize_sha(member) for member in commits}:
                raise ValueError("커밋 묶음에 없는 커밋을 부분으로 적었다")
            # 커밋 묶음은 커밋 경계로 나누지 않고 별도 커밋 묶음 단위로 만든다.
            if not split:
                raise ValueError("커밋 묶음을 커밋 경계로만 나눴다")
        case _:
            assert_never(unit)
