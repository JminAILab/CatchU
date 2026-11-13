"""Catch 제목(#120, 2026-10-08 결정 문서 「Catch 제목」, 2026-10-12 결정 10·11·17).

제목은 「{대상} {종류} {동작}」 세 조각뿐이다. 모델은 대상과 그 대상이 기대는 줄(또는 파일)을 지목하고,
종류·동작·제목 글자는 여기서 정한다. 하나라도 정할 수 없으면 null이다.

- 대상: 지목한 줄의 코드 이름(식별자 경계로 그 줄에 있음), 또는 지목한 파일의 이름을 원문 그대로.
- 종류: 대상 파일의 위치로 정한다(classify). 목록 밖이면 null.
- 동작: 대상 파일을 건드린 후보 안 본인 재료 커밋마다 정한다. 코드 이름은 그 파일의 추가 줄에만
  있으면 추가, 삭제 줄에만 있으면 삭제, 둘 다 있으면 수정. 파일 이름은 GitHub 파일 상태(added·removed·
  modified·renamed)를 추가·삭제·수정·이름 변경으로 옮기고 그 밖의 상태는 null이다. 커밋마다 같으면 그
  동작이고, 갈리면 후보의 시작 전·끝을 비교한다(_before_after).
- 그 파일을 건드린 재료 커밋의 patch가 없거나 온전하지 않거나, 그 파일의 가림이 든 줄에 대상 이름이
  있으면 null이다. 후보의 다른 파일이 빠졌다는 이유로는 null로 두지 않는다.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from fnmatch import fnmatchcase
from pathlib import PurePosixPath
from typing import Literal

from app.collection.records import CommitRecord
from app.generation.names import name_in
from app.generation.request import FileState, PreparedCandidate
from app.generation.response import LineRef, Ref

Kind = Literal["시험", "문서", "설정", "코드"]
Action = Literal["추가", "삭제", "수정", "이름 변경"]

_STATUS_ACTION: dict[str, Action] = {
    "added": "추가",
    "removed": "삭제",
    "modified": "수정",
    "renamed": "이름 변경",
}
# 폴더 이름(소문자)의 시험 꼴. Android의 androidTest도 든다(CR1 BR5.1).
_TEST_DIRS = frozenset({"test", "tests", "__tests__", "spec", "e2e", "androidtest"})
# 파일 이름(소문자)의 시험 꼴. 문서의 분류표와 같은 글자로 둔다.
_TEST_NAMES = ("test_*.py", "*_test.*", "*.test.*", "*.spec.*")
# 대소문자를 가리는 시험 꼴(CR1 BR5.1): 파일 이름(확장자 앞)이 Test·Tests로 끝나는 꼴(FooTest.java·
# FooTests.swift)과, 이름이 Tests로 끝나는 폴더(iOS 앱Tests·앱UITests).
_TEST_STEM_SUFFIXES = ("Test", "Tests")
_TEST_DIR_SUFFIX = "Tests"
_DOC_SUFFIXES = frozenset({".md", ".mdx", ".rst", ".adoc"})
_CONFIG_SUFFIXES = frozenset(
    {
        ".toml",
        ".yaml",
        ".yml",
        ".ini",
        ".cfg",
        ".gradle",
        ".plist",
        ".xcconfig",
        ".pbxproj",
    }
)
# 모바일 설정 파일(CR1 BR5.1). 이름(소문자)으로 본다. .gradle.kts는 확장자 .kts가 코드라 따로 본다.
_CONFIG_NAMES = frozenset({"androidmanifest.xml", "podfile"})
_CONFIG_DOUBLE_SUFFIX = ".gradle.kts"
_CONFIG_JSON = frozenset(
    {
        "package.json",
        "tsconfig.json",
        "jsconfig.json",
        "composer.json",
        "renovate.json",
        ".eslintrc.json",
        ".prettierrc.json",
        "nest-cli.json",
        "vercel.json",
        "turbo.json",
        "deno.json",
    }
)
_CONFIG_SCRIPT_SUFFIXES = frozenset({".js", ".ts", ".mjs", ".cjs"})
_CODE_SUFFIXES = frozenset(
    {
        ".py",
        ".pyi",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".ts",
        ".tsx",
        ".java",
        ".kt",
        ".kts",
        ".scala",
        ".go",
        ".rs",
        ".rb",
        ".php",
        ".c",
        ".h",
        ".cc",
        ".cpp",
        ".cxx",
        ".hpp",
        ".cs",
        ".swift",
        ".m",
        ".mm",
        ".dart",
        ".lua",
        ".r",
        ".pl",
        ".ex",
        ".exs",
        ".erl",
        ".hs",
        ".clj",
        ".sh",
        ".bash",
        ".zsh",
        ".sql",
        ".vue",
        ".svelte",
        ".html",
        ".css",
        ".scss",
        ".sass",
        ".less",
        # 노트북은 코드다(CR1 BR5.1).
        ".ipynb",
    }
)


def classify(path: str) -> Kind | None:
    """파일 위치로 종류를 정한다. 여럿에 해당하면 시험 → 문서 → 설정 → 코드 순서의 앞이 이긴다.

    재료 순서(groups.py)와 조각 제목의 종류가 같은 판정을 쓴다.
    """
    pure = PurePosixPath(path)
    name = pure.name
    lowered = name.lower()
    folders = pure.parts[:-1]
    directories = [part.lower() for part in folders]
    suffix = pure.suffix.lower()
    stem_parts = lowered.split(".")
    if _is_test(pure, lowered, folders, directories):
        return "시험"
    if (
        suffix in _DOC_SUFFIXES
        or (suffix == ".txt" and {"docs", "doc"}.intersection(directories))
        or stem_parts[0] in {"readme", "changelog"}
    ):
        return "문서"
    if (
        suffix in _CONFIG_SUFFIXES
        or lowered in _CONFIG_NAMES
        or lowered.endswith(_CONFIG_DOUBLE_SUFFIX)
        or lowered in _CONFIG_JSON
        or (lowered.startswith("tsconfig.") and suffix == ".json")
        or lowered == "dockerfile"
        or lowered.startswith("docker-compose")
        or (directories[:1] == [".github"])
        or (
            len(stem_parts) > 2
            and stem_parts[-2] == "config"
            and suffix in _CONFIG_SCRIPT_SUFFIXES
        )
    ):
        return "설정"
    if suffix in _CODE_SUFFIXES:
        return "코드"
    return None


def _is_test(
    pure: PurePosixPath,
    lowered: str,
    folders: tuple[str, ...],
    directories: list[str],
) -> bool:
    if _TEST_DIRS.intersection(directories) or any(
        fnmatchcase(lowered, pattern) for pattern in _TEST_NAMES
    ):
        return True
    if any(folder.endswith(_TEST_DIR_SUFFIX) for folder in folders):
        return True
    return pure.stem.endswith(_TEST_STEM_SUFFIXES)


def decide(ref: Ref, prepared: PreparedCandidate) -> str | None:
    """지목한 대상으로 제목 글자를 만든다. 정할 수 없으면 None. 글자 수 검사는 부른 쪽이 한다."""
    path = ref.file.path
    kind = classify(path)
    if kind is None:
        return None
    paths = _related_paths(prepared, path)
    touching = _touching(prepared, paths)
    if touching is None:
        return None
    if len(paths) > 1 and len({state.commit for state in touching}) > 1:
        # 후보 안에서 이름이 바뀐 파일을 여러 커밋이 건드렸다. 이름 바꿈이 낀 흐름은 전후를 정할 수 없다.
        return None
    if _own_commits_unclear(prepared, paths):
        return None
    if isinstance(ref, LineRef):
        name = ref.name
        action = _code_action(prepared, touching, name, paths)
    else:
        name = PurePosixPath(path).name
        action = _file_action(prepared, touching, path, paths)
    if action is None:
        return None
    return f"{name} {kind} {action}"


def _touches(state: FileState, paths: set[str]) -> bool:
    return state.path in paths or state.previous_path in paths


def _related_paths(prepared: PreparedCandidate, path: str) -> set[str]:
    """대상 경로와, 재료 커밋 안의 이름 바꿈으로 이어진 이전·이후 경로."""
    paths = {path}
    grown = True
    while grown:
        grown = False
        for states in prepared.states.values():
            for state in states:
                if not _touches(state, paths):
                    continue
                for each in (state.path, state.previous_path):
                    if each is not None and each not in paths:
                        paths.add(each)
                        grown = True
    return paths


def _own_commits_unclear(prepared: PreparedCandidate, paths: set[str]) -> bool:
    """후보의 본인 커밋 가운데 대상 파일을 함께 확인할 수 없는 커밋이 있는가.

    - 변경 내용을 받지 못했거나(응답 크기 초과·상세 조회 범위 밖 등) 파일 목록이 잘렸는데 대상이 보이지
      않아, 대상 파일을 건드렸는지 알 수 없는 커밋(2026-10-13 팀장 결정: 받은 커밋끼리 동작이 같아도
      제목 없음).
    - 받은 파일 목록에 대상이 있는데 재료가 아닌 커밋(근거 20건 밖 등). 허용 근거가 아니다.
    """
    material = prepared.material
    inside = {record.sha for record in material.commits}
    for sha in material.own_commits:
        record = material.records.get(sha)
        if record is None or record.changes is None:
            return True
        touches = any(
            entry.path in paths or entry.previous_path in paths
            for entry in record.changes.files
        )
        if touches and sha not in inside:
            return True
        if record.changes.files_truncated and not touches:
            return True
    return False


def _touching(prepared: PreparedCandidate, paths: set[str]) -> list[FileState] | None:
    """대상 파일을 건드린 재료 커밋의 파일 상태(근거 순서). 그 가운데 patch가 없거나 온전하지 않거나,
    비밀 파일이면 대상의 patch를 다 확인할 수 없어 None."""
    found: list[FileState] = []
    for record in prepared.material.commits:
        for state in prepared.states.get(record.sha, ()):
            if not _touches(state, paths):
                continue
            if state.patch is None or state.secret:
                return None
            found.append(state)
    return found


def _code_action(
    prepared: PreparedCandidate, touching: list[FileState], name: str, paths: set[str]
) -> Action | None:
    actions: list[Action] = []
    for state in touching:
        assert state.patch is not None
        added = removed = False
        for line in state.patch.changed:
            text = state.texts[line.index]
            if not name_in(name, text) and not (
                line.index in state.masked and name_in(name, line.text)
            ):
                continue
            if line.index in state.masked:
                # 가림이 든 줄에 대상 이름이 있으면 그 줄을 빼고 동작을 정할 수 없다.
                return None
            if line.kind == "+":
                added = True
            else:
                removed = True
        if added or removed:
            actions.append(_mixed(added, removed))
    if not actions:
        return None
    if len(set(actions)) == 1:
        return actions[0]
    chain = _chain(prepared, touching, paths)
    if chain is None:
        return None
    return _code_before_after(chain, name)


def _mixed(added: bool, removed: bool) -> Action:
    if added and removed:
        return "수정"
    return "추가" if added else "삭제"


def _file_action(
    prepared: PreparedCandidate, touching: list[FileState], path: str, paths: set[str]
) -> Action | None:
    actions: list[Action] = []
    for state in touching:
        action = "이름 변경" if state.path != path else _STATUS_ACTION.get(state.status)
        if action is None:
            return None
        actions.append(action)
    if not actions:
        return None
    if len(set(actions)) == 1:
        return actions[0]
    chain = _chain(prepared, touching, paths)
    if chain is None:
        return None
    statuses = [state.status for state in chain]
    if any(status not in ("added", "removed", "modified") for status in statuses):
        return None
    if "added" in statuses[1:] or "removed" in statuses[:-1]:
        # 지웠다 다시 만들거나 지운 뒤 고친 흐름은 같은 파일인지 정할 수 없다.
        return None
    before = statuses[0] != "added"
    after = statuses[-1] != "removed"
    if before and after:
        return "수정"
    if after:
        return "추가"
    return "삭제" if before else None


# 후보의 시작 전·끝 비교(결정 11·17). 순서는 확인된 부모·자식 관계로만 정한다.


def _chain(
    prepared: PreparedCandidate, touching: list[FileState], paths: set[str]
) -> list[FileState] | None:
    """대상 파일을 건드린 본인 커밋을 부모·자식 순서로 잇는다. 입증할 수 없으면 None.

    작성 시각·SHA·근거 순서는 쓰지 않는다. 다음이면 None이다.
    - 같은 단위에 연동 계정이 작성자로 기록되지 않은 커밋이 있거나 있는지 알 수 없다.
    - 후보의 본인 커밋 가운데 그 파일을 건드렸는지 알 수 없거나, 건드렸는데 재료가 아닌 커밋이 있다.
    - 부모를 따라 올라가며 다음 커밋을 찾을 수 없다(부모가 둘 이상, 기록 없음, 변경 내용을 다 받지 못한
      커밋, 후보 밖에서 그 파일을 건드린 커밋). 부모 관계가 없는 같은 변경 커밋도 여기 든다.
    - 이은 결과가 한 줄이 아니거나 이름 바꿈이 끼었다.
    """
    material = prepared.material
    if material.other_authors != "ABSENT":
        return None
    if any(
        state.previous_path is not None or state.status == "renamed"
        for state in touching
    ):
        # 이름 바꿈이 낀 흐름은 같은 파일의 전후를 정할 수 없다.
        return None
    target = {state.commit: state for state in touching}
    if len(target) != len(touching):
        return None
    if not _own_commits_known(material.own_commits, material.records, target, paths):
        return None
    predecessor: dict[str, str] = {}
    roots: list[str] = []
    for sha in target:
        found = _walk(material.records, sha, target, paths)
        if found is None:
            roots.append(sha)
        else:
            predecessor[sha] = found
    if len(roots) != 1 or len(set(predecessor.values())) != len(predecessor):
        return None
    following = {parent: child for child, parent in predecessor.items()}
    ordered = [roots[0]]
    while ordered[-1] in following:
        ordered.append(following[ordered[-1]])
    if len(ordered) != len(target):
        return None
    return [target[sha] for sha in ordered]


def _own_commits_known(
    own: Iterable[str],
    records: Mapping[str, CommitRecord],
    target: Mapping[str, FileState],
    paths: set[str],
) -> bool:
    for sha in own:
        if sha in target:
            continue
        record = records.get(sha)
        if record is None or record.changes is None or record.changes.files_truncated:
            return False
        if any(
            entry.path in paths or entry.previous_path in paths
            for entry in record.changes.files
        ):
            # 그 파일을 건드린 본인 커밋인데 재료가 아니다(근거 20건 밖, 쓸 수 없는 patch 등).
            return False
    return True


def _walk(
    records: Mapping[str, CommitRecord],
    sha: str,
    target: Mapping[str, FileState],
    paths: set[str],
) -> str | None:
    """부모를 따라 올라가 대상 파일을 건드린 가장 가까운 후보 커밋. 사이 커밋은 부모가 하나이고 변경
    내용을 모두 받았고 그 파일을 건드리지 않아야 한다. 찾지 못하면 None."""
    record = records.get(sha)
    seen: set[str] = set()
    while record is not None and len(record.parents) == 1:
        parent = record.parents[0]
        if parent in target:
            return parent
        if parent in seen:
            return None
        seen.add(parent)
        record = records.get(parent)
        if record is None or record.changes is None or record.changes.files_truncated:
            return None
        if any(
            entry.path in paths or entry.previous_path in paths
            for entry in record.changes.files
        ):
            return None
    return None


@dataclass
class _Tracked:
    position: int
    raw: str
    text: str


@dataclass
class _Gap:
    """지운 시작 전 줄의 자리. low~high는 지금 파일에서 그 자리에 들어선 줄(뒤 커밋들이 그 자리에 더한
    줄)부터 그 자리 다음에 처음 남은 줄까지의 위치다."""

    low: int
    high: int
    raw: str
    text: str


def _code_before_after(chain: list[FileState], name: str) -> Action | None:
    """앞 커밋이 더한 줄을 뒤 커밋이 같은 위치에서 같은 내용으로 지웠을 때만 서로 지운다. 위치는 hunk의
    이전·이후 줄 위치로 커밋마다 옮겨 본다. 내용이 어긋나면 이어 볼 수 없어 None이다.

    시작 전 줄을 지운 자리도 커밋마다 옮겨 본다. 뒤 커밋이 그 자리(그 자리에 앞서 더한 줄들 사이 포함)에
    같은 내용의 줄을 더하면 원래 줄을 되살린 것으로 보고 서로 지운다. 다른 위치에 더한 같은 내용은 옮긴
    것이라 상쇄하지 않는다."""
    alive: list[_Tracked] = []
    gaps: list[_Gap] = []
    for number, state in enumerate(chain):
        patch = state.patch
        assert patch is not None
        if state.status == "added" and (number or alive):
            return None
        cancelled: set[int] = set()
        survivors: list[_Tracked] = []
        for tracked in alive:
            line = patch.line_at_old(tracked.position)
            if line is not None and line.text != tracked.raw:
                return None
            if line is not None and line.kind == "-":
                cancelled.add(line.index)
                continue
            moved = patch.new_position(tracked.position)
            if moved is None:
                return None
            survivors.append(_Tracked(moved, tracked.raw, tracked.text))
        restored: set[int] = set()
        for line in patch.changed:
            if line.kind != "+":
                continue
            assert line.anchor is not None
            found = next(
                (
                    gap
                    for gap in gaps
                    if gap.raw == line.text and gap.low <= line.anchor <= gap.high
                ),
                None,
            )
            if found is not None:
                gaps.remove(found)
                restored.add(line.index)
        gaps = [
            _Gap(patch.gap_start(gap.low), patch.gap_end(gap.high), gap.raw, gap.text)
            for gap in gaps
        ]
        for line in patch.changed:
            text = state.texts[line.index]
            if line.kind == "-":
                if line.index not in cancelled and name_in(name, text):
                    assert line.gap is not None and line.gap_end is not None
                    gaps.append(_Gap(line.gap, line.gap_end, line.text, text))
            elif line.index not in restored:
                assert line.new_no is not None
                survivors.append(_Tracked(line.new_no, line.text, text))
        alive = survivors
    removed_before = bool(gaps)
    added_after = any(name_in(name, tracked.text) for tracked in alive)
    if added_after and removed_before:
        return "수정"
    if added_after:
        return "추가"
    return "삭제" if removed_before else None
