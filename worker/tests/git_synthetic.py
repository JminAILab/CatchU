"""실제 git으로 만든 합성 저장소와, 그 커밋을 GitHub 커밋 응답 모양으로 옮기는 도구.

같은 변경 확인(공백을 무시한 diff·cherry-pick 표시) 시험이 실제 git 동작과 대조하도록 시험
안에서만 git을 부른다. 앱 코드는 git을 부르지 않는다. 사용자·시스템 git 설정과 바깥 환경
변수를 읽지 않고 작성자·시각을 고정하므로, 같은 순서로 만들면 같은 SHA가 나온다.

GitHub 모양으로 옮길 때는 `git diff-tree -p --no-renames` 출력을 파일별로 나눠 `patch`(첫 `@@`부터
그 파일 끝까지, 끝 줄바꿈 없음)를 만든다. 이진·빈 파일처럼 `@@`가 없으면 `patch`를 두지 않는다.
diff 형식 커밋 응답(파일 모드 줄이 있는 글)은 같은 출력을 그대로 쓴다.
"""

import os
import shutil
import subprocess
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from github_synthetic import account_json

from app.collection.identifiers import GitHubAccount
from app.collection.records import ChangedFile, CommitChanges

GIT = shutil.which("git")
requires_git = pytest.mark.skipif(
    GIT is None, reason="git 실행 파일이 없어 실제 git과 대조하는 시험을 건너뛴다"
)

AUTHOR_NAME = "CatchU Synthetic"
AUTHOR_EMAIL = "synthetic@example.invalid"
# 커밋마다 1분씩 늘린다. 시각을 따로 정하지 않으면 작성 시각 순서가 만든 순서와 같다.
EPOCH = datetime(2026, 9, 1, tzinfo=UTC)

_STATUS = {"A": "added", "D": "removed", "M": "modified", "T": "changed"}


class GitError(AssertionError):
    """시험용 git 명령이 실패했다."""


class GitRepo:
    """`base/repo`에 만든 합성 저장소. `base/home`을 HOME으로 쓴다."""

    def __init__(self, base: Path, *, branch: str = "main") -> None:
        if GIT is None:
            pytest.skip("git 실행 파일이 없어 합성 저장소를 만들 수 없다")
        self._git = GIT
        self.root = base / "repo"
        home = base / "home"
        self.root.mkdir(parents=True)
        home.mkdir(parents=True, exist_ok=True)
        self._env = {
            "PATH": os.environ.get("PATH", ""),
            "HOME": str(home),
            "LC_ALL": "C",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": AUTHOR_NAME,
            "GIT_AUTHOR_EMAIL": AUTHOR_EMAIL,
            "GIT_COMMITTER_NAME": AUTHOR_NAME,
            "GIT_COMMITTER_EMAIL": AUTHOR_EMAIL,
            "GIT_EDITOR": ":",
            "GIT_TERMINAL_PROMPT": "0",
        }
        self._minutes = 0
        self.git("init", "-q", "-b", branch)

    def git(self, *args: str, stdin: bytes | None = None) -> bytes:
        """git 명령의 표준 출력(바이트). 줄바꿈을 바꾸지 않는다."""
        moment = EPOCH + timedelta(minutes=self._minutes)
        stamp = f"{int(moment.timestamp())} +0000"
        env = {**self._env, "GIT_AUTHOR_DATE": stamp, "GIT_COMMITTER_DATE": stamp}
        completed = subprocess.run(
            [self._git, "-c", "core.quotePath=false", *args],
            cwd=self.root,
            env=env,
            input=stdin,
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            raise GitError(
                f"git {' '.join(args)} 실패: {completed.stderr.decode(errors='replace')}"
            )
        return completed.stdout

    def _text(self, *args: str) -> str:
        return self.git(*args).decode("utf-8")

    def _tick(self, minute: int | None = None) -> None:
        self._minutes = self._minutes + 1 if minute is None else minute

    # 작업 트리와 이력 만들기

    def write(self, path: str, text: str | bytes) -> None:
        """파일을 그대로 쓴다. 문자열은 UTF-8로, 줄바꿈(CRLF 포함)을 바꾸지 않는다."""
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(text.encode("utf-8") if isinstance(text, str) else text)

    def remove(self, path: str) -> None:
        (self.root / path).unlink()

    def chmod(self, path: str, *, executable: bool) -> None:
        """작업 트리 파일의 실행 권한을 바꾼다. 다음 커밋에 모드로 남는다(core.fileMode가 참일 때)."""
        os.chmod(self.root / path, 0o755 if executable else 0o644)

    def records_file_mode(self) -> bool:
        """이 파일 시스템에서 git이 실행 권한을 기록하는가."""
        return self.git("config", "--bool", "core.fileMode").strip() == b"true"

    def commit(
        self, message: str, *, allow_empty: bool = False, minute: int | None = None
    ) -> str:
        """작업 트리 전체를 커밋하고 전체 SHA를 돌려준다. 메시지의 `#` 줄도 남긴다.

        minute을 주면 작성·커밋 시각을 EPOCH에서 그 분 뒤로 정한다(부모보다 이른 시각도 된다).
        """
        self._tick(minute)
        self.git("add", "-A")
        extra = ("--allow-empty",) if allow_empty else ()
        self.git(
            "commit", "-q", "--no-verify", "--cleanup=whitespace", "-m", message, *extra
        )
        return self.head()

    def amend(self) -> str:
        """작업 트리를 마지막 커밋에 합친다. 메시지(cherry-pick 표시 포함)는 그대로 둔다."""
        self._tick()
        self.git("add", "-A")
        self.git("commit", "-q", "--no-verify", "--amend", "--no-edit")
        return self.head()

    def branch(self, name: str, start: str = "HEAD") -> None:
        self.git("branch", name, start)

    def checkout(self, name: str) -> None:
        self.git("checkout", "-q", name)

    def merge(self, ref: str, message: str, *, minute: int | None = None) -> str:
        """병합 커밋을 항상 만든다(--no-ff). 충돌이면 GitError. minute은 commit과 같다."""
        self._tick(minute)
        self.git("merge", "-q", "--no-ff", "--no-verify", "-m", message, ref)
        return self.head()

    def cherry_pick_x(self, ref: str) -> str:
        """`git cherry-pick -x`로 옮긴 새 커밋의 전체 SHA."""
        self._tick()
        self.git("cherry-pick", "-x", ref)
        return self.head()

    def revert(self, ref: str) -> str:
        self._tick()
        self.git("revert", "--no-edit", ref)
        return self.head()

    # 관측

    def head(self) -> str:
        return self.resolve("HEAD")

    def resolve(self, ref: str) -> str:
        return self._text("rev-parse", "--verify", f"{ref}^{{commit}}").strip()

    def message(self, ref: str) -> str:
        """커밋 메시지. GitHub 응답처럼 끝 줄바꿈을 뺀다."""
        raw = self._text("cat-file", "commit", self.resolve(ref))
        return raw.split("\n\n", 1)[1].rstrip("\n")

    def parents(self, ref: str) -> tuple[str, ...]:
        return tuple(self._text("rev-list", "--parents", "-n", "1", ref).split()[1:])

    def dates(self, ref: str) -> tuple[str, str]:
        """(작성 시각, 커밋 시각). GitHub 응답처럼 `Z`로 끝나는 RFC 3339."""
        lines = self._text("log", "-1", "--format=%aI%n%cI", ref).split()
        return lines[0].replace("+00:00", "Z"), lines[1].replace("+00:00", "Z")

    def log(self, ref: str = "HEAD") -> list[str]:
        """`git log` 기본 순서(커밋 시각 순으로 걸어 부모가 자식보다 먼저 나올 수 있다)의 전체 SHA."""
        return self._text("log", "--format=%H", ref).split()

    def rev_list(self, excluded: str, included: str) -> list[str]:
        """excluded에서 닿지 않고 included에서 닿는 커밋(오래된 것부터). 비교 API의 범위다."""
        return self._text("rev-list", "--reverse", f"{excluded}..{included}").split()

    def git_patch_id(self, ref: str) -> str | None:
        """`git show` 출력을 `git patch-id --stable`에 넣은 값. 변경이 없으면 None."""
        shown = self.git("show", "--no-color", "--no-renames", "--no-ext-diff", ref)
        output = self.git("patch-id", "--stable", stdin=shown).split()
        return output[0].decode("ascii") if output else None

    # GitHub 응답 모양

    def github_detail(self, ref: str) -> tuple[str, list[dict[str, Any]]]:
        """(전체 SHA, 커밋 상세 응답의 `files`). 이름 바꿈은 찾지 않는다(삭제+추가)."""
        sha = self.resolve(ref)
        fields = self.git(
            "diff-tree",
            "--no-commit-id",
            "-r",
            "--root",
            "--no-renames",
            "-z",
            "--name-status",
            sha,
        ).split(b"\0")
        names = [
            (fields[index].decode("ascii"), fields[index + 1].decode("utf-8"))
            for index in range(0, len(fields) - 1, 2)
        ]
        diff = self._text(
            "diff-tree",
            "--no-commit-id",
            "-p",
            "--root",
            "--no-renames",
            "--no-color",
            "--no-ext-diff",
            sha,
        )
        sections = _file_sections(diff)
        if len(sections) != len(names):
            raise GitError("파일 목록과 diff 구역 수가 다르다")
        files = [
            _file_json(path, _STATUS[status[0]], section)
            for (status, path), section in zip(names, sections, strict=True)
        ]
        return sha, files

    def github_files(self, ref: str) -> list[dict[str, Any]]:
        return self.github_detail(ref)[1]

    def github_diff(self, ref: str, *, quote_path: bool = False) -> bytes:
        """diff 형식 커밋 응답 모양: 그 커밋의 `git diff-tree -p` 출력(모드 줄 포함) 그대로.

        quote_path면 git 기본값처럼 0x80 이상 바이트도 `\\ooo`로 적는다.
        """
        return self.git(
            "-c",
            f"core.quotePath={'true' if quote_path else 'false'}",
            "diff-tree",
            "--no-commit-id",
            "-p",
            "--root",
            "--no-renames",
            "--no-color",
            "--no-ext-diff",
            self.resolve(ref),
        )

    def commit_json(self, ref: str, author: GitHubAccount | None) -> dict[str, Any]:
        """커밋 목록 항목 모양. 작성자 계정은 시험이 정한다(git 이름·이메일은 쓰지 않음)."""
        sha = self.resolve(ref)
        authored, committed = self.dates(sha)
        return {
            "sha": sha,
            "commit": {
                "author": {
                    "name": AUTHOR_NAME,
                    "email": AUTHOR_EMAIL,
                    "date": authored,
                },
                "committer": {
                    "name": AUTHOR_NAME,
                    "email": AUTHOR_EMAIL,
                    "date": committed,
                },
                "message": self.message(sha),
            },
            "author": account_json(author),
            "committer": account_json(author),
            "parents": [{"sha": parent} for parent in self.parents(sha)],
        }

    def commit_detail_json(
        self, ref: str, author: GitHubAccount | None
    ) -> dict[str, Any]:
        """커밋 상세 응답 모양(`stats`·`files` 포함)."""
        sha, files = self.github_detail(ref)
        additions = sum(entry["additions"] for entry in files)
        deletions = sum(entry["deletions"] for entry in files)
        return {
            **self.commit_json(sha, author),
            "stats": {
                "additions": additions,
                "deletions": deletions,
                "total": additions + deletions,
            },
            "files": files,
        }


def _file_sections(diff: str) -> list[list[str]]:
    """`diff --git` 줄마다 나눈 파일 구역. 줄은 `\\n`으로만 나눠 `\\r`을 남긴다."""
    lines = diff.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    sections: list[list[str]] = []
    for line in lines:
        if line.startswith("diff --git "):
            sections.append([])
        if not sections:
            raise GitError("diff가 파일 머리글로 시작하지 않는다")
        sections[-1].append(line)
    return sections


def _file_json(path: str, status: str, section: list[str]) -> dict[str, Any]:
    first_hunk = next(
        (index for index, line in enumerate(section) if line.startswith("@@")), None
    )
    hunk_lines = [] if first_hunk is None else section[first_hunk:]
    additions = sum(1 for line in hunk_lines if line.startswith("+"))
    deletions = sum(1 for line in hunk_lines if line.startswith("-"))
    entry: dict[str, Any] = {
        "filename": path,
        "status": status,
        "additions": additions,
        "deletions": deletions,
        "changes": additions + deletions,
    }
    if first_hunk is not None:
        entry["patch"] = "\n".join(hunk_lines)
    return entry


def changed_file(
    entry: Mapping[str, Any], mode_lines: tuple[str, ...] | None = None
) -> ChangedFile:
    """GitHub `files` 항목 하나를 앱의 변경 파일로 옮긴다. 모드 줄은 따로 받는다."""
    return ChangedFile(
        path=entry["filename"],
        status=entry["status"],
        additions=entry["additions"],
        deletions=entry["deletions"],
        previous_path=entry.get("previous_filename"),
        patch=entry.get("patch"),
        mode_lines=mode_lines,
    )


def commit_changes(
    files: Sequence[Mapping[str, Any]],
    *,
    files_truncated: bool = False,
    modes: Mapping[str, tuple[str, ...]] | None = None,
) -> CommitChanges:
    """GitHub `files` 목록을 앱의 커밋 변경으로 옮긴다. 줄 수 합은 파일 합으로 둔다.

    modes는 경로마다 모드 줄이다. 주지 않거나 경로가 없으면 모드를 관측하지 않은 파일이다.
    """
    changed = tuple(
        changed_file(entry, None if modes is None else modes.get(entry["filename"]))
        for entry in files
    )
    return CommitChanges(
        files=changed,
        additions=sum(entry.additions for entry in changed),
        deletions=sum(entry.deletions for entry in changed),
        files_truncated=files_truncated,
    )


# 사례 시험 도우미


def python_module(*middle: str) -> str:
    """앞뒤 문맥이 넉넉한 Python 파일. 고친 곳의 문맥 줄이 파일 끝에 닿지 않는다."""
    head = [f"setting_{n} = {n}" for n in range(1, 8)]
    tail = [f"other_{n} = {n}" for n in range(1, 8)]
    return "\n".join([*head, *middle, *tail]) + "\n"


def two_branches(
    repo: GitRepo, base: str, first: str, second: str, path: str = "app.py"
) -> tuple[str, str, str]:
    """같은 기준에서 갈라진 두 브랜치가 각자 한 번 고친 커밋: (기준, 첫 변경, 둘째 변경)."""
    repo.write(path, base)
    root = repo.commit("기준")
    repo.branch("first")
    repo.branch("second")
    repo.checkout("first")
    repo.write(path, first)
    one = repo.commit("첫 변경")
    repo.checkout("second")
    repo.write(path, second)
    two = repo.commit("둘째 변경")
    return root, one, two
