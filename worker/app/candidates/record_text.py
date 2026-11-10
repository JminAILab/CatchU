"""기록의 글(CR1, 기능 설계 BR2.1~BR2.7): 후보 단위마다 작성자가 GitHub에 남긴 원문 한 줄을 고른다.

고르는 순서는 다음과 같다. 결과는 후보 자료의 기록의 글 칸(`RecordText`)에 한 번만 싣고, 작업 사실
둘째 줄(build.py)과 제목(생성 단계)은 그 칸만 본다. 생성 단계는 다시 계산하지 않는다.

1. PR 단위이고, PR을 연 계정이 연동 계정이며, 그 PR 커밋 목록을 끝까지 받아 다른 계정 커밋이 없다고
   확인했으면 PR 제목을 고른다(BR2.1). 목록이 잘렸거나 다른 계정 커밋이 있거나 있는지 모르면 고르지 않는다.
2. 아니면 단위 안 본인 커밋(병합 커밋 제외) 가운데 작성 시각이 가장 이른 커밋(같으면 SHA 사전순)의
   메시지 첫 줄을 고른다(BR2.2). 같은 변경으로 다른 곳에서 이 단위에 배정한 본인 커밋은 고르지 않는다.
3. 고른 글의 첫 줄바꿈 앞을 잡고 앞뒤 공백만 뺀다. 자르지 않는다. 비면 기록의 글이 없다(BR2.3).
4. 가리기 검사(`app.redact.mask_text`, 생성과 함께 쓰는 한 글 검사)가 가릴 값을 하나라도 찾으면 기록의
   글이 없다. 다른 글로 바꿔 고르지 않는다(BR2.4). 2,000자를 넘는 글은 이 검사가 통째로 가리므로 여기서
   빠진다.
5. 부실 판단을 한다(BR2.5·BR2.6). 부실한 글도 칸에는 싣고 weak로 표시한다.

GitHub를 부르지 않는 순수 계산이다. 글 원문을 로그에 남기지 않는다.
"""

import unicodedata
from collections.abc import Iterable

from app.collection.identifiers import GitHubAccount
from app.collection.records import CommitRecord, PullRequestRecord
from app.processing.generation import RecordText, RecordTextSource
from app.redact import mask_text

# 부실 목록(BR2.6). 비교는 앞뒤 공백·문장 부호를 빼고 안쪽 공백을 한 칸으로 줄인 글 전체와,
# 영어 대소문자를 무시하고 한다. 편집기 기본 문구(Update README.md 등)는 넣지 않는다.
WEAK_TEXTS = frozenset(
    {
        # 영어
        "fix",
        "fixes",
        "fixed",
        "update",
        "updates",
        "updated",
        "change",
        "changes",
        "edit",
        "wip",
        "test",
        "tests",
        "tmp",
        "temp",
        "typo",
        "refactor",
        "cleanup",
        "misc",
        "minor",
        "init",
        "commit",
        "save",
        # 한국어
        "수정",
        "변경",
        "업데이트",
        "작업",
        "테스트",
        "정리",
        "임시",
        "오타",
        "커밋",
        "저장",
        # GitHub 기본 메시지
        "initial commit",
        "first commit",
        "add files via upload",
    }
)
# 문자·숫자가 이 수 이하이면 부실이다(BR2.5).
MAX_WEAK_LETTERS = 2


def pull_request_title(
    record: PullRequestRecord,
    account: GitHubAccount | None,
    other_authors_absent: bool,
) -> str | None:
    """BR2.1의 조건을 채우면 PR 제목, 아니면 None.

    other_authors_absent는 그 PR 커밋 목록을 끝까지 받아 연동 계정이 작성자로 기록되지 않은 커밋이
    없다고 확인했는가다(grouping의 other_authors가 ABSENT).
    """
    if account is None or record.author is None:
        return None
    if not account.same_account(record.author) or not other_authors_absent:
        return None
    return record.title


def earliest_own_commit(commits: Iterable[CommitRecord]) -> CommitRecord | None:
    """병합 커밋(부모 둘 이상)을 뺀 커밋 가운데 작성 시각이 가장 이른 커밋. 같으면 SHA 사전순."""
    candidates = [record for record in commits if len(record.parents) <= 1]
    if not candidates:
        return None
    return min(candidates, key=lambda record: (record.authored_at, record.sha))


def choose_record_text(
    title: str | None, own_commits: Iterable[CommitRecord]
) -> RecordText | None:
    """기록의 글을 고른다. title은 `pull_request_title`의 결과다.

    own_commits는 단위 안의 본인 커밋이다(다른 곳에서 같은 변경으로 배정한 커밋은 넣지 않는다).
    PR 제목을 골랐으면 그 글이 비거나 가리기에 걸려도 커밋 첫 줄로 바꿔 고르지 않는다.
    """
    if title is not None:
        return _checked("PR_TITLE", title)
    earliest = earliest_own_commit(own_commits)
    if earliest is None:
        return None
    return _checked("COMMIT_FIRST_LINE", earliest.message)


def first_line(text: str) -> str:
    """첫 줄바꿈 앞을 잡고 앞뒤 공백만 뺀다. 자르지 않는다."""
    lines = text.splitlines()
    return lines[0].strip() if lines else ""


def is_weak(text: str) -> bool:
    """부실 판단(BR2.5). 앞뒤 공백과 문장 부호를 빼고 안쪽 공백을 한 칸으로 줄인 글로 본다."""
    core = " ".join(_strip_punctuation(text).split())
    letters = sum(1 for char in core if unicodedata.category(char)[0] in "LN")
    if letters <= MAX_WEAK_LETTERS:
        return True
    return core.casefold() in WEAK_TEXTS


def _strip_punctuation(text: str) -> str:
    """앞뒤의 공백과 문장 부호(유니코드 범주 P)를 뺀다. 안쪽 글자는 그대로 둔다."""
    start, end = 0, len(text)
    while start < end and _edge(text[start]):
        start += 1
    while end > start and _edge(text[end - 1]):
        end -= 1
    return text[start:end]


def _edge(char: str) -> bool:
    return char.isspace() or unicodedata.category(char).startswith("P")


def _checked(source: RecordTextSource, raw: str) -> RecordText | None:
    text = first_line(raw)
    if not text:
        return None
    if mask_text(text).count > 0:
        # 가린 결과 글은 쓰지 않는다. 걸렸다는 사실만 본다.
        return None
    return RecordText(source=source, text=text, weak=is_weak(text))
