"""다시 볼 곳 사실(NC3 RevisitFacts): 같은 작업 안 본인 커밋끼리 본 사실 다섯 종류.

입구는 `revisit_facts(own_commit_shas, records)`다. 후보 하나의 본인 커밋 기록만 받아 계산하는 순수
함수이고 GitHub·AI를 부르지 않는다(인자에 수집·전송 객체가 없다). 규칙은 기능 설계 rules.md
BR2.1~BR2.5·BR3.1~BR3.5를 따른다.

- 입력: 병합 커밋(부모 둘 이상)을 빼고 (작성 시각, 식별값) 순서로 둔다(BR2.1). 변경 내용을 받지 못했거나
  파일 목록이 잘린 커밋은 경로를 보는 규칙에서, patch가 없는 파일은 줄을 보는 규칙에서만 뺀다(BR2.2).
  좁은 산출물 목록(잠금 파일·빌드 폴더·.min.js·AI 하네스·지시 파일·비밀 경로)은 판정에서만 뺀다(BR2.3).
- 규칙 다섯: 다시 고친 곳(BR3.1), 옮긴 곳(BR3.2), 확장자 바꿈(BR3.3), 되돌림(BR3.4), 시험 파일 있음(BR3.5).
  켜진 종류는 `ENABLED_KINDS` 상수로 정한다(BR2.4). 측정으로 버리는 규칙은 이 상수에서 빼는 코드 변경으로 끈다.
- 상한: 종류 순서·커밋 순서로 늘어놓고 앞의 30개, 사실마다 경로·커밋 20개, 경로 1,024자(BR2.5).
- 계산 구조(NFR1.3): 쓰는 커밋을 커밋 순서로 한 번 훑고, 다시 고친 곳은 (경로, 줄 글자) 사전을, 옮긴 곳은
  내용 식별값 사전을 쓴다. 커밋 쌍마다 다시 훑지 않는다. 줄 글자는 맞춰 보기에만 쓰고 결과에 담지 않는다.
- 기록이 없는 식별값이나 규격(api 등록 검사와 같은 규칙)을 어긴 결과는 `RevisitFactsDefect` 하나로 올린다.
  부르는 쪽(`app.processing.live`)이 그 후보 사실만 비우고 실패 로그 한 줄을 남긴다(NFR8.3).
"""

import re
from collections.abc import Callable, Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from fnmatch import fnmatchcase
from pathlib import PurePosixPath
from typing import Literal

from app.collection.records import ChangedFile, CommitRecord, DetailStatus
from app.redact import is_secret_path

RevisitKind = Literal[
    "REWORKED_LINES",
    "MOVED_FILE",
    "EXTENSION_CHANGED",
    "REVERTED",
    "TEST_FILES_PRESENT",
]
# 결과의 종류 순서(BR2.5).
KIND_ORDER: tuple[RevisitKind, ...] = (
    "REWORKED_LINES",
    "MOVED_FILE",
    "EXTENSION_CHANGED",
    "REVERTED",
    "TEST_FILES_PRESENT",
)
# 켜진 종류(BR2.4). 기본은 다섯 모두다. 환경 변수나 화면 설정은 두지 않는다.
ENABLED_KINDS: frozenset[RevisitKind] = frozenset(KIND_ORDER)

MAX_FACTS = 30
MAX_ITEMS = 20
MAX_PATH_CHARS = 1024
# 빈 파일의 git 내용 식별값. 빈 파일끼리는 옮김으로 맞추지 않는다(BR3.2).
EMPTY_BLOB_SHA = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"

# 종류별 (경로 최소, 최대), (커밋 최소, 최대). api 등록 입력 검사·web 응답 검사와 같은 표다(보안 설계 2절).
KIND_COUNTS: Mapping[RevisitKind, tuple[tuple[int, int], tuple[int, int]]] = {
    "REWORKED_LINES": ((1, 1), (2, 2)),
    "MOVED_FILE": ((2, 2), (1, 2)),
    "EXTENSION_CHANGED": ((2, 2), (1, 2)),
    "REVERTED": ((0, 0), (2, 2)),
    "TEST_FILES_PRESENT": ((1, MAX_ITEMS), (1, MAX_ITEMS)),
}

_COMMIT_SHA = re.compile(r"[0-9a-f]{40}")
# git revert가 남기는 메시지. 짧은 식별값과 「Reverts owner/repo#N」은 잡지 않는다(BR3.4).
_REVERTS = re.compile(r"This reverts commit ([0-9a-fA-F]{40})(?![0-9a-fA-F])")

# BR2.3 좁은 산출물 목록(폴더·이름 비교는 소문자).
_LOCK_FILES = frozenset(
    {
        "package-lock.json",
        "npm-shrinkwrap.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "bun.lock",
        "bun.lockb",
        "poetry.lock",
        "uv.lock",
        "pipfile.lock",
        "cargo.lock",
        "gemfile.lock",
        "composer.lock",
        "go.sum",
        "gradle.lockfile",
        "podfile.lock",
        "pubspec.lock",
        "mix.lock",
        "flake.lock",
    }
)
_BUILD_FOLDERS = frozenset({"build", "dist", "out"})
_HARNESS_FOLDERS = frozenset(
    {
        ".claude",
        ".codex",
        ".agents",
        ".cursor",
        ".kiro",
        ".aidlc",
        ".windsurf",
        ".gemini",
    }
)
_INSTRUCTION_FILES = frozenset({"agents.md", "claude.md", "gemini.md", ".cursorrules"})
_INSTRUCTION_PATHS = frozenset({".github/copilot-instructions.md"})
# BR3.5 좁은 시험 꼴. 재료 분류(title.py _is_test)의 대소문자 꼴 둘은 쓰지 않는다.
_TEST_FOLDERS = frozenset({"test", "tests", "__tests__", "spec", "e2e", "androidtest"})
_TEST_NAMES = ("test_*.py", "*_test.*", "*.test.*", "*.spec.*")


class RevisitFactsDefect(Exception):
    """기록이 없는 본인 커밋이나 규격을 어긴 판정 결과. 경로·식별값·줄 글자를 메시지에 넣지 않는다."""


@dataclass(frozen=True)
class RevisitFact:
    """다시 볼 곳 사실 하나. 종류·경로·커밋 식별값만 담는다(문장·링크는 web이 만든다)."""

    kind: RevisitKind
    paths: tuple[str, ...]
    commits: tuple[str, ...]


@dataclass(frozen=True)
class Material:
    """후보 하나의 판정 재료. 병합 커밋을 뺀 본인 커밋을 커밋 순서로 둔다."""

    commits: tuple[CommitRecord, ...]
    # 식별값 → 커밋 순서(BR2.1).
    order: Mapping[str, int]
    # (되돌린 커밋, 되돌려진 커밋), 처음 나온 순서(BR3.4).
    reverts: tuple[tuple[str, str], ...]

    @property
    def path_commits(self) -> tuple[tuple[str, tuple[ChangedFile, ...]], ...]:
        """경로를 보는 규칙에 쓰는 (커밋 식별값, 파일들): 변경 내용을 받았고 파일 목록이 잘리지 않았다(BR2.2)."""
        return tuple(
            (commit.sha, commit.changes.files)
            for commit in self.commits
            if commit.changes_status is DetailStatus.FETCHED
            and commit.changes is not None
            and not commit.changes.files_truncated
        )


Rule = Callable[[Material, frozenset[RevisitKind]], Iterable[RevisitFact]]


def is_excluded_path(path: str) -> bool:
    """좁은 산출물 목록(BR2.3)에 든 경로인가. 다시 볼 곳 판정에서만 쓴다."""
    lowered = path.lower()
    parts = PurePosixPath(lowered).parts
    name = parts[-1] if parts else lowered
    folders = parts[:-1]
    return (
        name in _LOCK_FILES
        or any(folder in _BUILD_FOLDERS for folder in folders)
        or name.endswith(".min.js")
        or any(folder in _HARNESS_FOLDERS for folder in folders)
        or (len(parts) > 1 and parts[0] == "aidlc")
        or name in _INSTRUCTION_FILES
        or lowered in _INSTRUCTION_PATHS
        or is_secret_path(path)
    )


def is_test_path(path: str) -> bool:
    """좁은 시험 폴더·이름 꼴인가(BR3.5)."""
    parts = PurePosixPath(path.lower()).parts
    if not parts:
        return False
    name = parts[-1]
    return any(folder in _TEST_FOLDERS for folder in parts[:-1]) or any(
        fnmatchcase(name, pattern) for pattern in _TEST_NAMES
    )


def _countable_text(line: str) -> str | None:
    """patch 한 줄(앞의 +/- 뺌)의 맞춰 볼 글자. 글자나 숫자가 하나도 없으면 None이다(BR3.1)."""
    text = line.strip()
    return text if any(char.isalnum() for char in text) else None


def _changed_lines(patch: str) -> tuple[list[str], list[str]]:
    """patch의 (넣은 줄 글자, 지운 줄 글자). hunk 머리글과 표시 줄은 보지 않는다."""
    added: list[str] = []
    removed: list[str] = []
    for line in patch.split("\n"):
        if not line or line[0] not in "+-":
            continue
        text = _countable_text(line[1:])
        if text is not None:
            (added if line[0] == "+" else removed).append(text)
    return added, removed


def reworked_lines(
    material: Material, enabled: frozenset[RevisitKind]
) -> Iterable[RevisitFact]:
    """BR3.1 다시 고친 곳: 뒤 커밋이 앞 커밋이 넣은 줄과 글자가 같은 줄을 같은 파일에서 지웠다."""
    if "REWORKED_LINES" not in enabled:
        return []
    # 되돌린 쌍(앞 = 되돌려진 커밋, 뒤 = 되돌린 커밋)은 다시 고친 곳으로 만들지 않는다.
    revert_pairs = frozenset((target, source) for source, target in material.reverts)
    # 경로 → 줄 글자 → 그 줄을 넣은 가장 늦은 앞 커밋. 후보 하나가 끝나면 버린다.
    memory: dict[str, dict[str, str]] = {}
    found: dict[tuple[str, str, str], None] = {}
    for sha, files in material.path_commits:
        added_now: list[tuple[str, list[str]]] = []
        for file in files:
            if file.status == "removed" or is_excluded_path(file.path):
                continue
            if file.status == "renamed" and file.previous_path is not None:
                moved = memory.pop(file.previous_path, None)
                if moved is not None:
                    memory.setdefault(file.path, {}).update(moved)
            if file.patch is None:
                continue
            added, removed = _changed_lines(file.patch)
            if file.status in ("modified", "renamed"):
                known = memory.get(file.path, {})
                for text in removed:
                    earlier = known.get(text)
                    if earlier is not None and (earlier, sha) not in revert_pairs:
                        found[(earlier, sha, file.path)] = None
            added_now.append((file.path, added))
        # 같은 커밋 안의 넣은 줄은 그 커밋의 지운 줄과 맞추지 않는다.
        for path, added in added_now:
            known = memory.setdefault(path, {})
            for text in added:
                known[text] = sha
    return [
        RevisitFact("REWORKED_LINES", (path,), (earlier, later))
        for earlier, later, path in found
        if len(path) <= MAX_PATH_CHARS
    ]


def _extension_changed(before: str, after: str) -> bool:
    """폴더와 마지막 점 앞 이름이 같고 확장자만 다르다(대소문자만 다르면 아니다, BR3.3)."""
    old, new = PurePosixPath(before), PurePosixPath(after)
    if old.parent != new.parent:
        return False
    old_dot, new_dot = old.name.rfind("."), new.name.rfind(".")
    if old_dot <= 0 or new_dot <= 0:
        return False
    return (
        old.name[:old_dot] == new.name[:new_dot]
        and old.name[old_dot + 1 :].lower() != new.name[new_dot + 1 :].lower()
    )


def _moved_pairs(material: Material) -> list[tuple[str, str, tuple[str, ...]]]:
    """(앞 경로, 뒤 경로, 커밋들)을 처음 찾은 순서로. 한 커밋 안 이름 바꿈과 여러 커밋에 걸친 옮김(BR3.2)."""
    pairs: list[tuple[str, str, tuple[str, ...]]] = []
    by_blob: dict[str, tuple[list[tuple[str, str]], list[tuple[str, str]]]] = {}
    for sha, files in material.path_commits:
        for file in files:
            if file.status == "renamed" and file.previous_path is not None:
                pairs.append((file.previous_path, file.path, (sha,)))
                continue
            blob = file.blob_sha
            # 빈 파일 식별값과 None은 맞추지 않는다.
            if (
                file.status in ("removed", "added")
                and blob is not None
                and blob != EMPTY_BLOB_SHA
            ):
                removed, added = by_blob.setdefault(blob, ([], []))
                (removed if file.status == "removed" else added).append(
                    (file.path, sha)
                )
    for removed, added in by_blob.values():
        # 지운 곳이나 만든 곳이 둘 이상이면 고르지 않는다.
        if len(removed) != 1 or len(added) != 1 or removed[0][0] == added[0][0]:
            continue
        shas = sorted({removed[0][1], added[0][1]}, key=material.order.__getitem__)
        pairs.append((removed[0][0], added[0][0], tuple(shas)))
    return pairs


def moved_files(
    material: Material, enabled: frozenset[RevisitKind]
) -> Iterable[RevisitFact]:
    """BR3.2 옮긴 곳과 BR3.3 확장자 바꿈. 같은 쌍 찾기로 둘을 가르고, 꺼진 종류의 쌍은 버린다."""
    facts: list[RevisitFact] = []
    for before, after, shas in _moved_pairs(material):
        if is_excluded_path(before) or is_excluded_path(after):
            continue
        if len(before) > MAX_PATH_CHARS or len(after) > MAX_PATH_CHARS:
            continue
        kind: RevisitKind = (
            "EXTENSION_CHANGED" if _extension_changed(before, after) else "MOVED_FILE"
        )
        if kind in enabled:
            facts.append(RevisitFact(kind, (before, after), shas))
    return facts


def reverted_commits(
    material: Material, enabled: frozenset[RevisitKind]
) -> Iterable[RevisitFact]:
    """BR3.4 되돌림: 같은 후보 본인 커밋을 git revert 꼴로 가리킨다. commits = [되돌린, 되돌려진]."""
    if "REVERTED" not in enabled:
        return []
    return [
        RevisitFact("REVERTED", (), (reverting, reverted))
        for reverting, reverted in material.reverts
    ]


def present_test_files(
    material: Material, enabled: frozenset[RevisitKind]
) -> Iterable[RevisitFact]:
    """BR3.5 시험 파일 있음: 지우지 않은 시험 파일이 하나라도 있으면 후보마다 사실 하나(NFR8.4)."""
    if "TEST_FILES_PRESENT" not in enabled:
        return []
    paths: dict[str, None] = {}
    shas: dict[str, None] = {}
    for sha, files in material.path_commits:
        for file in files:
            if (
                file.status == "removed"
                or len(file.path) > MAX_PATH_CHARS
                or is_excluded_path(file.path)
                or not is_test_path(file.path)
            ):
                continue
            paths.setdefault(file.path, None)
            shas.setdefault(sha, None)
    if not paths:
        return []
    return [
        RevisitFact(
            "TEST_FILES_PRESENT",
            tuple(paths)[:MAX_ITEMS],
            tuple(shas)[:MAX_ITEMS],
        )
    ]


# 규칙 차례. 시험은 이 값을 바꿔 끼워 규격을 어긴 결과에서 정해진 예외가 나는지 본다.
RULES: tuple[Rule, ...] = (
    reworked_lines,
    moved_files,
    reverted_commits,
    present_test_files,
)


def _material(
    own_commit_shas: Sequence[str], records: Mapping[str, CommitRecord]
) -> Material:
    commits: dict[str, CommitRecord] = {}
    for sha in own_commit_shas:
        record = records.get(sha)
        if record is None:
            # 기본 브랜치 창과 관계 조회 커밋 묶음이 어긋나는 코드 결함이다(신뢰성 설계 1절).
            raise RevisitFactsDefect("본인 커밋 기록이 없다")
        if len(record.parents) < 2:
            commits[record.sha] = record
    ordered = tuple(
        sorted(commits.values(), key=lambda record: (record.authored_at, record.sha))
    )
    order = {record.sha: index for index, record in enumerate(ordered)}
    reverts: dict[tuple[str, str], None] = {}
    for record in ordered:
        for match in _REVERTS.finditer(record.message):
            target = match.group(1).lower()
            if target in order and target != record.sha:
                reverts.setdefault((record.sha, target), None)
    return Material(ordered, order, tuple(reverts))


def _sort_key(fact: RevisitFact, order: Mapping[str, int]) -> tuple[int, int, str]:
    last = max((order.get(sha, -1) for sha in fact.commits), default=-1)
    return (KIND_ORDER.index(fact.kind), last, fact.paths[0] if fact.paths else "")


def check_facts(facts: Sequence[RevisitFact], own: Collection[str]) -> None:
    """api 등록 입력 검사와 같은 규칙으로 자기 결과를 본다. 어기면 RevisitFactsDefect다.

    전체 30개, 사실마다 경로·커밋 20개, 경로 1~1,024자, 종류별 경로·커밋 개수, 커밋이 그 후보 본인 커밋
    안(소문자 16진수 40자), 한 사실 안 겹침 없음.
    """
    if len(facts) > MAX_FACTS:
        raise RevisitFactsDefect("다시 볼 곳 사실이 상한을 넘었다")
    for fact in facts:
        if fact.kind not in KIND_COUNTS:
            raise RevisitFactsDefect("다시 볼 곳 사실의 종류를 모른다")
        (path_min, path_max), (commit_min, commit_max) = KIND_COUNTS[fact.kind]
        if not path_min <= len(fact.paths) <= min(path_max, MAX_ITEMS):
            raise RevisitFactsDefect("다시 볼 곳 사실의 경로 수가 규격 밖이다")
        if not commit_min <= len(fact.commits) <= min(commit_max, MAX_ITEMS):
            raise RevisitFactsDefect("다시 볼 곳 사실의 커밋 수가 규격 밖이다")
        if any(not 1 <= len(path) <= MAX_PATH_CHARS for path in fact.paths):
            raise RevisitFactsDefect("다시 볼 곳 사실의 경로 길이가 규격 밖이다")
        if any(
            not _COMMIT_SHA.fullmatch(sha) or sha not in own for sha in fact.commits
        ):
            raise RevisitFactsDefect(
                "다시 볼 곳 사실의 커밋이 그 후보 본인 커밋 밖이다"
            )
        if len(set(fact.paths)) != len(fact.paths) or len(set(fact.commits)) != len(
            fact.commits
        ):
            raise RevisitFactsDefect("다시 볼 곳 사실 안에 겹치는 값이 있다")


def revisit_facts(
    own_commit_shas: Sequence[str],
    records: Mapping[str, CommitRecord],
    *,
    enabled: Collection[RevisitKind] = ENABLED_KINDS,
) -> tuple[RevisitFact, ...]:
    """후보 하나의 다시 볼 곳 사실(0~30개, 종류 순서·커밋 순서).

    records는 식별값 → 커밋 기록 사전이다(기본 브랜치 창과 관계 조회 커밋). 본인 커밋의 기록이 없거나
    결과가 규격을 어기면 RevisitFactsDefect를 낸다.
    """
    material = _material(own_commit_shas, records)
    kinds = frozenset(enabled)
    facts = [
        fact for rule in RULES for fact in rule(material, kinds) if fact.kind in kinds
    ]
    facts.sort(key=lambda fact: _sort_key(fact, material.order))
    kept = tuple(facts[:MAX_FACTS])
    check_facts(kept, frozenset(own_commit_shas))
    return kept
