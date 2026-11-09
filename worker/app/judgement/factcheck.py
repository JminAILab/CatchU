"""기계 대조(CR3 기능 설계 BR3.3): AI가 쓴 제목 후보·설명 문장의 낱말이 가리킨 줄에 있는지 본다.

12월 api 기계 대조(`api/src/ai-generation/fact-check.ts`)의 낱말 뽑기를 다시 짰다. 표준 라이브러리만 쓰고 다른
worker 모듈을 불러오지 않는 순수 함수다.

- 글에서 PR 번호(`PR #n`·`PR n`·`#n`)를 먼저 뗀다. PR 번호가 하나라도 있으면 그 글은 통과하지 못한다.
- 남은 글의 영문·숫자 덩어리(안쪽의 `. - _ + # /` 포함)를 뽑아, 숫자로 시작하면 숫자, `/`와 영문자가 있거나
  확장자가 붙으면 파일 이름, 나머지는 영어 이름으로 나눈다. 한글 등 ASCII 밖 글자는 보지 않는다.
- 영어 이름·숫자는 가리킨 줄의 글에, 파일 이름은 가리킨 줄의 경로에 낱말 단위로 있어야 한다. 소문자로 맞춰
  비교하고, 숫자는 앞자리 0을 뗀다(007과 7은 같다). 예외 낱말(ai·api·pr 등)은 보지 않는다.
- 재료의 다른 줄에만 있는 낱말은 통과하지 못한다(대조 대상은 가리킨 줄뿐이다).
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass

# 영어 이름 대조에서 빼는 약어(12월 BR3.3과 같다). 소문자로 비교한다.
EXCEPTIONS = frozenset(
    {
        "ai",
        "api",
        "pr",
        "ci",
        "cd",
        "llm",
        "jd",
        "db",
        "id",
        "url",
        "ui",
        "sdk",
        "mvp",
        "http",
        "json",
    }
)

# "#123", "PR 123", "PR#123", "PR #123". 영문 낱말 안의 PR(예: "APR 3")은 PR 번호가 아니다.
_PR_NUMBER = re.compile(r"(?<![A-Za-z0-9])(?:PR\s?#?\s?|#)(\d+)", re.IGNORECASE)
# 영문·숫자로 시작하는 ASCII 덩어리. 안쪽의 . - _ + # / 를 포함한다.
_ASCII_CHUNK = re.compile(r"[A-Za-z0-9][A-Za-z0-9._\-+#/]*")
_NUMBER = re.compile(r"\d+(?:\.\d+)?")
# 영문자로 시작하고 점 뒤에 영문·숫자 확장자가 붙은 덩어리(main.ts, Node.js).
_FILE_WITH_EXTENSION = re.compile(
    r"[A-Za-z][A-Za-z0-9_\-+#]*(?:\.[A-Za-z0-9_\-+#]+)*\.[A-Za-z0-9]+"
)
_LETTER = re.compile(r"[A-Za-z]")
# 대조 대상 글의 덩어리를 낱말로 더 나누는 구분자. 줄의 `this.loginRateLimit`·`a/b.py`에서 `loginRateLimit`·
# `b.py`를 낱말로 찾게 한다. 밑줄·붙임표는 이름의 일부라 나누지 않는다.
_TARGET_SPLIT = re.compile(r"[./]")


@dataclass(frozen=True)
class Tokens:
    """한 글에서 뽑은 대조 낱말."""

    numbers: frozenset[str]
    pr_numbers: frozenset[str]
    # 소문자.
    file_names: frozenset[str]
    # 소문자, 예외 낱말 제외.
    english: frozenset[str]


def _normalize_number(value: str) -> str:
    """앞자리 0을 뗀다. 소수점 아래는 그대로 둔다."""
    whole, _, fraction = value.partition(".")
    trimmed = whole.lstrip("0") or "0"
    return f"{trimmed}.{fraction}" if fraction else trimmed


def _chunks(text: str, pr_numbers: set[str]) -> list[str]:
    def drop(match: re.Match[str]) -> str:
        pr_numbers.add(_normalize_number(match.group(1)))
        return " "

    without_pr = _PR_NUMBER.sub(drop, text)
    found: list[str] = []
    for raw in _ASCII_CHUNK.findall(without_pr):
        chunk = raw.rstrip(".-")
        if chunk:
            found.append(chunk)
    return found


def _is_file(chunk: str) -> bool:
    return (
        "/" in chunk and _LETTER.search(chunk) is not None
    ) or _FILE_WITH_EXTENSION.fullmatch(chunk) is not None


def extract(text: str) -> Tokens:
    """BR3.3: 글에서 숫자·PR 번호·파일 이름·영어 이름을 뽑는다."""
    pr_numbers: set[str] = set()
    numbers: set[str] = set()
    file_names: set[str] = set()
    english: set[str] = set()
    for chunk in _chunks(text, pr_numbers):
        if chunk[0].isdigit():
            numbers.update(_normalize_number(each) for each in _NUMBER.findall(chunk))
        elif _is_file(chunk):
            file_names.add(chunk.lower())
        elif chunk.lower() not in EXCEPTIONS:
            english.add(chunk.lower())
    return Tokens(
        numbers=frozenset(numbers),
        pr_numbers=frozenset(pr_numbers),
        file_names=frozenset(file_names),
        english=frozenset(english),
    )


def _line_words(text: str) -> tuple[set[str], set[str]]:
    """가리킨 줄 글의 (낱말, 숫자). 덩어리 전체와, 점·빗금으로 나눈 조각을 모두 낱말로 본다."""
    words: set[str] = set()
    numbers: set[str] = set()
    for chunk in _chunks(text, set()):
        pieces = [chunk, *(piece for piece in _TARGET_SPLIT.split(chunk) if piece)]
        for piece in pieces:
            words.add(piece.lower())
            if piece[0].isdigit():
                numbers.update(
                    _normalize_number(each) for each in _NUMBER.findall(piece)
                )
    return words, numbers


def _path_names(path: str) -> set[str]:
    """경로의 낱말 단위 이름: 경로 전체와 뒤에서부터 이은 부분 경로(`a/b/c.py` → `c.py`·`b/c.py`·`a/b/c.py`)."""
    parts = [part for part in path.lower().split("/") if part]
    return {"/".join(parts[index:]) for index in range(len(parts))}


@dataclass(frozen=True)
class CitedLine:
    """대조 대상: 후보·문장이 가리킨 줄 하나의 경로와 글."""

    path: str
    text: str


def passes(text: str, cited: Iterable[CitedLine]) -> bool:
    """글의 낱말이 모두 가리킨 줄에 있으면 참. PR 번호가 있거나 가리킨 줄이 없으면 거짓."""
    lines = tuple(cited)
    if not lines:
        return False
    tokens = extract(text)
    if tokens.pr_numbers:
        return False
    words: set[str] = set()
    numbers: set[str] = set()
    paths: set[str] = set()
    for line in lines:
        line_words, line_numbers = _line_words(line.text)
        words |= line_words
        numbers |= line_numbers
        paths |= _path_names(line.path)
    return (
        tokens.english <= words
        and tokens.numbers <= numbers
        and tokens.file_names <= paths
    )
