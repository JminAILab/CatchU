"""작업 동일성 값(workIdentity) 규칙 판본 wi1.

`docs/CatchU_work_identity_rules.md` 「workIdentity 만드는 법」을 그대로 옮겼다. 판정 입력은
방식·저장소·작업 단위뿐이다. 제목·작업 사실·근거·판본 값(sourceRevision)·동의 범위 판본·회원·요청·
시도·결과 번호는 받지 않는다. 정규 JSON의 UTF-8 바이트를 SHA-256으로 해시해 `wi1:` 뒤에 붙인다.
B는 값을 해석하지 않고 같은지만 보므로, 단위·정규화·직렬화·해시 중 하나라도 바꾸면 판본을 올린다.
어느 단위로 묶을지는 후보 묶음이 정한다.

CR1(FR2.1)에서 이슈 번호로 나누기를 껐으므로 나눈 부분은 없다. 정규 JSON의 `part`는 늘 빈 목록이다.
나뉘지 않던 단위의 값이 그대로 남도록 이 칸을 지우지 않는다(BR1.3).
"""

import hashlib
import json
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


def work_identity(source_mode: SourceMode, repository_id: str, unit: WorkUnit) -> str:
    """`wi1:` + 정규 JSON의 SHA-256 소문자 16진수(68자). 단위 전체가 한 후보다(나눈 부분 없음)."""
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
            # 나눈 부분이 없던 지금 값과 같게 빈 목록을 둔다(BR1.3).
            "part": [],
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
