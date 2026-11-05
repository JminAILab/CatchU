"""재료 순서와 변경 묶음(CR1, 기능 설계 BR5.2~BR5.5·BR5.7).

생성 재료로 보낼 수 있는 파일(`PreparedFile`)을 종류 순서로 놓고, 큰 후보에서는 변경 묶음으로 나눈다.
줄을 실제로 담는 일(몫·한 파일 상한·직렬화 크기)은 `request.select`가 한다. 자세한 규칙은
`docs/generation-material.md`에 있다.

- 종류 순서(BR5.2): 코드 → 시험 → 설정 → 문서 → 그 밖. 종류는 `title.classify`로 파일마다 한 번 정한다.
  같은 종류 안에서는 지금 순서(근거 순서의 커밋 → GitHub가 준 파일 순서)를 지킨다. 어떤 폴더도 빼지 않는다.
- 폴더 묶음(BR5.3): 깊이 1부터 늘려 가며 폴더가 둘 이상으로 갈라지는 첫 깊이를 찾는다. 그 깊이의 폴더마다
  묶음이고, 그보다 얕은 곳의 파일은 함께 한 묶음이다. 갈라지는 깊이가 없으면 묶음 하나다. 묶음 수 상한은 없다.
- 계층 구조(BR5.4): 갈라진 폴더 이름이 모두 계층 이름(controller·service 등)이면 파일 이름에서 계층 낱말과
  구분자를 뺀 앞부분으로 다시 묶는다.
- 시험 붙이기(BR5.5): 시험 파일 이름에서 시험 표시를 뺀 이름이 시험이 아닌 파일 이름(확장자 앞)과 같고 그런
  파일이 한 묶음에만 있으면 그 묶음으로 옮긴다. 대상이 여러 묶음에 있거나 없으면 제자리에 둔다.
- 묶음 순서: 바뀐 줄이 많은 묶음부터, 같으면 묶음 이름순(BR5.6). 같은 입력이면 같은 결과다(BR5.7). 집합·
  사전의 순회 순서에 기대지 않는다.

GitHub·제공자를 부르지 않는 순수 계산이다.
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.generation.request import PreparedFile
from app.generation.title import Kind, classify

# 담는 순서의 종류 자리(BR5.2). 종류를 정할 수 없는 파일(None)은 그 밖이다.
KIND_RANK: Mapping[Kind | None, int] = {
    "코드": 0,
    "시험": 1,
    "설정": 2,
    "문서": 3,
    None: 4,
}
# 계층 이름(BR5.4). 단수·복수, 대소문자 무시.
_LAYERS = (
    "controller",
    "service",
    "repository",
    "dao",
    "entity",
    "model",
    "dto",
    "mapper",
    "handler",
    "route",
    "view",
)
LAYER_NAMES = frozenset(
    {
        *_LAYERS,
        "controllers",
        "services",
        "repositories",
        "daos",
        "entities",
        "models",
        "dtos",
        "mappers",
        "handlers",
        "routes",
        "views",
    }
)
# 파일 이름 조각: 구분자(-_. 공백)로 끊고, 낙타 표기(UserService·HTTPHandler)를 낱말로 끊는다.
_SEPARATORS = re.compile(r"[-_.\s]+")
_WORDS = re.compile(r"[A-Z]+(?![a-z])|[A-Z]?[^\W_A-Z]+")
# 시험 표시(BR5.5). 앞의 test_ 또는 뒤의 표시 가운데 처음 맞는 하나만 뺀다(Tests를 Test보다 먼저 본다).
_TEST_PREFIX = "test_"
_TEST_SUFFIXES = ("_test", ".test", ".spec", "Tests", "Test")


@dataclass(frozen=True)
class ChangeGroup:
    """큰 후보의 변경 묶음 하나."""

    # 폴더 경로, 얕은 곳 묶음이면 갈라지기 전 공통 폴더(뿌리면 빈 글), 계층 구조면 파일 이름 앞부분.
    name: str
    # 이 묶음의 파일. 종류 순서(BR5.2)다.
    files: tuple[PreparedFile, ...]
    # 묶음 순서를 정하는 바뀐 줄 수(보낼 수 있는 '+'·'-' 줄).
    changed_lines: int


def file_kinds(files: Sequence[PreparedFile]) -> dict[str, Kind | None]:
    """파일 id → 종류. 파일마다 한 번만 판정한다."""
    return {file.id: classify(file.path) for file in files}


def kind_order(
    files: Sequence[PreparedFile], kinds: Mapping[str, Kind | None]
) -> tuple[PreparedFile, ...]:
    """종류 순서로 놓는다. 같은 종류 안에서는 받은 순서를 지킨다(안정 정렬)."""
    return tuple(sorted(files, key=lambda file: KIND_RANK[kinds[file.id]]))


def change_groups(
    files: Sequence[PreparedFile], kinds: Mapping[str, Kind | None]
) -> tuple[ChangeGroup, ...]:
    """큰 후보의 변경 묶음을 묶음 순서대로 돌려준다. 파일이 없으면 빈 튜플이다."""
    if not files:
        return ()
    keys = _folder_keys(files)
    split_names = {
        PurePosixPath(key).name for key, shallow in keys.values() if not shallow
    }
    names: dict[str, str]
    if split_names and all(name.casefold() in LAYER_NAMES for name in split_names):
        names = {file.id: _layer_prefix(file.path) for file in files}
    else:
        names = {file_id: key for file_id, (key, _) in keys.items()}
    names = _attach_tests(files, kinds, names)
    members: dict[str, list[PreparedFile]] = {}
    for file in files:
        members.setdefault(names[file.id], []).append(file)
    groups = [
        ChangeGroup(
            name=name,
            files=kind_order(grouped, kinds),
            changed_lines=sum(len(file.lines) for file in grouped),
        )
        for name, grouped in members.items()
    ]
    return tuple(sorted(groups, key=lambda group: (-group.changed_lines, group.name)))


def _folder_keys(files: Sequence[PreparedFile]) -> dict[str, tuple[str, bool]]:
    """파일 id → (묶음 이름, 얕은 곳 묶음인가). 갈라지는 깊이가 없으면 모두 한 묶음(빈 이름)이다."""
    folders = {file.id: PurePosixPath(file.path).parts[:-1] for file in files}
    deepest = max(len(parts) for parts in folders.values())
    for depth in range(1, deepest + 1):
        found = sorted(
            {parts[:depth] for parts in folders.values() if len(parts) >= depth}
        )
        if len(found) < 2:
            continue
        # 그보다 얕은 곳은 모두 갈라지기 전 공통 폴더 위에 있다.
        shallow = "/".join(found[0][: depth - 1])
        return {
            file_id: ("/".join(parts[:depth]), False)
            if len(parts) >= depth
            else (shallow, True)
            for file_id, parts in folders.items()
        }
    return {file_id: ("", True) for file_id in folders}


def _words(stem: str) -> list[str]:
    return [word for piece in _SEPARATORS.split(stem) for word in _WORDS.findall(piece)]


def _layer_prefix(path: str) -> str:
    """파일 이름(확장자 앞)에서 계층 낱말과 구분자를 뺀 앞부분(소문자로 맞춤).

    첫 계층 낱말 앞의 낱말을 잇는다. 계층 낱말이 맨 앞이면 그 뒤의 낱말을 잇는다. 계층 낱말이 없으면
    이름 전체(구분자 뺌)다.
    """
    stem = PurePosixPath(path).stem
    words = _words(stem)
    position = next(
        (index for index, word in enumerate(words) if word.casefold() in LAYER_NAMES),
        None,
    )
    if position is None:
        kept = words
    elif position == 0:
        kept = [word for word in words[1:] if word.casefold() not in LAYER_NAMES]
    else:
        kept = words[:position]
    prefix = "".join(kept).casefold()
    return prefix or stem.casefold()


def strip_test_marker(path: str) -> str:
    """시험 파일 이름(확장자 앞)에서 시험 표시를 하나 뺀 이름."""
    stem = PurePosixPath(path).stem
    if stem.startswith(_TEST_PREFIX) and len(stem) > len(_TEST_PREFIX):
        return stem[len(_TEST_PREFIX) :]
    for suffix in _TEST_SUFFIXES:
        if stem.endswith(suffix) and len(stem) > len(suffix):
            return stem[: -len(suffix)]
    return stem


def _attach_tests(
    files: Sequence[PreparedFile],
    kinds: Mapping[str, Kind | None],
    names: Mapping[str, str],
) -> dict[str, str]:
    """시험 파일을 대상 파일의 묶음으로 옮긴다(BR5.5). 대상 묶음이 하나일 때만 옮긴다."""
    targets: dict[str, set[str]] = {}
    for file in files:
        if kinds[file.id] != "시험":
            targets.setdefault(PurePosixPath(file.path).stem, set()).add(names[file.id])
    moved = dict(names)
    for file in files:
        if kinds[file.id] != "시험":
            continue
        found = targets.get(strip_test_marker(file.path), set())
        if len(found) == 1:
            moved[file.id] = next(iter(found))
    return moved
