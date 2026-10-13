"""보내기 전 비밀값·제3자 개인정보 가리기(#120, 2026-10-12 결정 7·16).

- 가린 줄: '+'·'-' 줄의 값만 자리표시로 바꾸고 줄 구조는 남긴다. 가림이 든 줄은 설명·제목·질문 어느
  근거로도 고를 수 없다(모델에 "고를 수 없음"으로 표시해 보내고, 지목하면 응답을 거부한다).
- 같은 값: 한 줄에서 꼴로 알아본 값(6자 이상)은 같은 요청의 다른 줄·경로에 그대로 나와도 가린다
  (`MaskBook`). 대입 줄에서만 알아본 비밀번호가 시험 파일의 호출 줄에 그대로 나오는 경우 때문이다.
- 비밀 파일: 경로·상태를 보내지 않고 생성 대상으로도 쓰지 않는다. 경로에 가릴 값이 든 파일도 같다.
- 너무 긴 줄(`MAX_LINE_CHARS` 초과)은 정규식을 돌리지 않고 통째로 가린다. 압축 코드·빌드 산출물 줄에서
  정규식 시간이 길어지는 것을 막고, 그런 줄은 설명 근거로도 쓸모가 없기 때문이다.
- 가린 사실은 coverageLimits에 적지 않는다. 운영 로그에 값·경로 없이 건수만 남긴다.

정규식으로 모든 비밀값을 잡는다고 주장하지 않는다. 알려진 놓침·잘못 잡음은 시험으로 고정해 둔다. 꼴마다
먼저 싼 글자 검사로 해당 없는 줄을 건너뛰고, 반복 구간에는 길이 상한·되돌아가기 없는 반복을 써서 줄
길이에 대해 시간이 크게 늘지 않게 한다.
"""

import re
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import PurePosixPath

MASK = "[MASKED]"
# 이보다 긴 줄은 통째로 가린다(제안값).
MAX_LINE_CHARS = 2_000
# 다른 줄에서도 찾아 가릴 값의 최소 길이. 짧은 값까지 넓히면 흔한 낱말이 든 줄을 모두 가리게 된다.
MIN_SHARED_VALUE_CHARS = 6

# 이름만으로 비밀로 보는 파일. 예시 파일(.env.example 등)은 값만 가린다.
_SECRET_NAMES = frozenset(
    {
        ".env",
        "id_rsa",
        "id_dsa",
        "id_ecdsa",
        "id_ed25519",
        "credentials.json",
        "credentials",
        ".npmrc",
        ".pypirc",
        ".netrc",
        ".htpasswd",
        ".git-credentials",
    }
)
_SECRET_SUFFIXES = (".pem", ".key", ".p12", ".pfx", ".keystore", ".jks", ".ppk")
_ENV_EXAMPLES = frozenset({"example", "sample", "template", "dist"})

_PRIVATE_KEY_BEGIN = re.compile(r"-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY( BLOCK)?-----")
_PRIVATE_KEY_END = re.compile(r"-----END [A-Z0-9 ]{0,40}PRIVATE KEY( BLOCK)?-----")
_SECRET_WORD = (
    r"(?:secret|token|passw(?:or)?d|pwd|api[_-]?key|access[_-]?key|private[_-]?key"
    r"|client[_-]?secret)"
)
# 따옴표 값. 여는 따옴표와 같은 따옴표에서 끝나고 백슬래시 이스케이프를 건너뛴다.
_QUOTED_VALUE = (
    r"(?:\"(?P<value_d>(?:\\.|[^\"\\\n])++)\""
    r"|'(?P<value_s>(?:\\.|[^'\\\n])++)'"
    r"|`(?P<value_b>(?:\\.|[^`\\\n])++)`)"
)


@dataclass(frozen=True)
class _Rule:
    pattern: re.Pattern[str]
    # 줄에 이 가운데 하나라도 있어야 정규식을 돌린다(lowered면 소문자로 바꾼 줄에서 찾는다).
    needles: tuple[str, ...] = ()
    lowered: bool = False
    min_length: int = 0

    def applies(self, text: str, lowered: str) -> bool:
        if len(text) < self.min_length:
            return False
        if not self.needles:
            return True
        haystack = lowered if self.lowered else text
        return any(needle in haystack for needle in self.needles)


def _rule(
    pattern: str, *needles: str, lowered: bool = False, min_length: int = 0
) -> _Rule:
    # 경계는 ASCII로만 본다(유니코드 \w·\b는 한글을 단어 글자로 보아, 「…@example.com으로」처럼 조사가
    # 붙은 값을 놓친다).
    return _Rule(re.compile(pattern, re.ASCII), needles, lowered, min_length)


# 값의 꼴. 이름이 value로 시작하는 그룹(없으면 첫 그룹)이 가릴 값이다.
_RULES = (
    _rule(
        r"(?<![A-Za-z0-9_])((?:AKIA|ASIA)[0-9A-Z]{16})(?![A-Za-z0-9_])", "AKIA", "ASIA"
    ),
    _rule(
        r"(?<![A-Za-z0-9_])(gh[pousr]_[A-Za-z0-9]{36,}+)(?![A-Za-z0-9_])",
        "ghp_",
        "gho_",
        "ghu_",
        "ghs_",
        "ghr_",
    ),
    _rule(r"(?<![A-Za-z0-9_])(github_pat_[A-Za-z0-9_]{22,}+)", "github_pat_"),
    _rule(r"(?<![A-Za-z0-9_])(xox[abprs]-[A-Za-z0-9-]{10,}+)(?![A-Za-z0-9_])", "xox"),
    _rule(r"(?<![A-Za-z0-9_])(AIza[0-9A-Za-z_\-]{35})(?![A-Za-z0-9_-])", "AIza"),
    _rule(
        r"(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{10,}+\.[A-Za-z0-9_-]{10,}+\.[A-Za-z0-9_-]{10,}+)",
        "eyJ",
    ),
    # 따옴표 값을 비밀 이름에 대입(apiKey = '…', "password": "…", "x-api-key": "…"). 이름은 앞뒤 40자까지.
    _rule(
        rf"(?i)(?<![\w.-])[\"']?[\w.-]{{0,40}}?{_SECRET_WORD}[\w.-]{{0,40}}[\"']?\s*"
        rf"(?::=|=>|:|=)\s*{_QUOTED_VALUE}",
        "secret",
        "token",
        "passw",
        "pwd",
        "key",
        lowered=True,
    ),
    # 대문자 환경 변수 꼴(GITHUB_TOKEN=…, export API_KEY=…, ENV API_KEY=…, compose의 - POSTGRES_PASSWORD=…·
    # POSTGRES_PASSWORD: …, 명령 앞 대입 NPM_TOKEN=… npm ci). 값은 공백·;·&·|·# 앞에서 끝난다. 함수 호출·
    # 참조(괄호·$·대괄호가 붙음)는 가리지 않는다.
    _rule(
        r"(?:^|(?<=[\s-]))(?:export\s+|ENV\s+)?(?<![A-Z0-9_])[A-Z0-9_]{0,40}"
        r"(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY)[A-Z0-9_]{0,40}\s*[=:]\s*"
        r"(?P<value>[^\s\"'`#(){}\[\]$;&|=:][^\s\"'`#(){}\[\];&|]*+)(?=[\s;&|#]|$)",
        "SECRET",
        "TOKEN",
        "PASSWORD",
        "PASSWD",
        "KEY",
    ),
    # 인증 머리글 값(Authorization: Bearer …)과 숫자가 든 Bearer 토큰.
    _rule(
        r"(?i)(?<![A-Za-z0-9_])authorization[\"']?\s*[:=]\s*[\"']?(?:bearer|basic|token)\s+"
        r"(?P<value>[A-Za-z0-9._~+/=-]{8,}+)",
        "authorization",
        lowered=True,
    ),
    _rule(
        r"(?<![A-Za-z0-9_])Bearer\s+(?P<value>(?=[A-Za-z0-9._~+/=-]*?[0-9])[A-Za-z0-9._~+/=-]{8,}+)",
        "Bearer",
    ),
    # URL에 든 사용자 정보(https://user:pass@host).
    _rule(
        r"(?<![A-Za-z0-9+.-])[A-Za-z][A-Za-z0-9+.-]{0,30}://[^\s/:@]{1,256}:"
        r"(?P<value>[^\s/@]{1,256})@",
        "://",
    ),
    # 이메일. 버전 표기(core@7.24.0)는 끝이 글자가 아니라 잡지 않는다.
    _rule(
        r"(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24})"
        r"(?![A-Za-z0-9_-])",
        "@",
    ),
    # 주민등록번호·휴대전화 번호 꼴.
    _rule(r"(?<!\d)(\d{6}-[1-4]\d{6})(?!\d)", "-"),
    _rule(r"(?<!\d)(01[016789]-?\d{3,4}-?\d{4})(?!\d)", "01"),
    # 줄 전체가 대소문자·숫자가 섞인 긴 base64 덩어리(PEM 키 내용 줄 등, 앞뒤 따옴표·쉼표 허용). BEGIN·END
    # 줄이 hunk 밖이라 키 블록인지 모르는 줄도 가린다. 인증서·공개 키 내용도 가린다(잘못 잡음).
    _rule(
        r"^\s*[\"']?(?P<value>(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*[a-z])"
        r"(?=[A-Za-z0-9+/]*[0-9])[A-Za-z0-9+/]{40,}+={0,2})[\"']?,?\s*$",
        min_length=40,
    ),
)


@dataclass(frozen=True)
class Masked:
    text: str
    # 가린 값 수. 0이면 원래 줄 그대로다.
    count: int
    # 꼴로 알아보고 가린 원래 값. 같은 요청의 다른 줄에서도 가리는 데만 쓰고 어디에도 남기지 않는다.
    values: tuple[str, ...] = ()


def is_secret_path(path: str, book: "MaskBook | None" = None) -> bool:
    """이름만으로 비밀 파일로 보거나 경로에 가릴 값(같은 요청에서 가린 값 포함)이 든 파일인가."""
    name = PurePosixPath(path).name
    lowered = name.lower()
    if lowered in _SECRET_NAMES or lowered.endswith(_SECRET_SUFFIXES):
        return True
    if lowered.startswith(".env.") and lowered.split(".")[-1] not in _ENV_EXAMPLES:
        return True
    if book is not None:
        return book.mask(path).count > 0
    return mask_text(path).count > 0


def mask_text(text: str) -> Masked:
    """한 줄의 비밀값·개인정보를 꼴로 알아보고 자리표시로 바꾼다. 너무 긴 줄은 통째로 가린다."""
    if len(text) > MAX_LINE_CHARS:
        return Masked(MASK, 1)
    lowered = text.lower()
    count = 0
    values: list[str] = []
    for rule in _RULES:
        if not rule.applies(text, lowered):
            continue
        text, found = _replace(rule.pattern, text, values)
        if found:
            count += found
            lowered = text.lower()
    return Masked(text, count, tuple(values))


def _replace(pattern: re.Pattern[str], text: str, values: list[str]) -> tuple[str, int]:
    found = 0
    pieces: list[str] = []
    last = 0
    names: list[str | int] = [
        name for name in pattern.groupindex if name.startswith("value")
    ]
    groups = names or [1]
    for match in pattern.finditer(text):
        start, end = next(
            (span for span in (match.span(group) for group in groups) if span[0] >= 0),
            (-1, -1),
        )
        value = text[start:end]
        if start < 0 or value == MASK or not value.strip():
            continue
        pieces.append(text[last:start])
        pieces.append(MASK)
        values.append(value)
        last = end
        found += 1
    pieces.append(text[last:])
    return "".join(pieces), found


# 긴 줄에서 값을 찾을 때 나눠 보는 구간의 겹침. 값이 구간 경계에 걸려 빠지지 않게 한다.
_WINDOW_OVERLAP = 256


def learned_values(text: str) -> set[str]:
    """줄에서 꼴로 알아본 값(다른 줄로 넓혀 가릴 만큼 긴 것). 긴 줄은 겹치는 구간으로 나눠 훑는다."""
    if len(text) <= MAX_LINE_CHARS:
        windows: Iterable[str] = (text,)
    else:
        step = MAX_LINE_CHARS - _WINDOW_OVERLAP
        windows = (
            text[start : start + MAX_LINE_CHARS] for start in range(0, len(text), step)
        )
    return {
        value
        for window in windows
        for value in mask_text(window).values
        if len(value) >= MIN_SHARED_VALUE_CHARS
    }


_KEY_PIECES = re.compile(r"(?:\\n|[\s\"',`;])+")


def private_key_values(lines: Iterable[str]) -> set[str]:
    """한 파일의 hunk 줄(문맥 줄 포함)을 순서대로 보며 PEM 개인 키 블록 안의 내용 조각을 모은다. 블록
    줄은 통째로 가리지만, 같은 내용이 다른 줄·파일에 복사돼 있어도 가리려고 값으로 둔다."""
    found: set[str] = set()
    inside = False
    for text in lines:
        begin = _PRIVATE_KEY_BEGIN.search(text)
        end = _PRIVATE_KEY_END.search(text)
        if begin is not None:
            stop = (
                end.start() if end is not None and end.start() > begin.end() else None
            )
            content = text[begin.end() : stop]
            inside = stop is None
        elif inside:
            content = text if end is None else text[: end.start()]
            inside = end is None
        else:
            continue
        found.update(
            piece
            for piece in _KEY_PIECES.split(content)
            if len(piece) >= MIN_SHARED_VALUE_CHARS
        )
    return found


class _Finder:
    """여러 값이 글 안에 나오는 자리를 한 번 훑어 찾는다(Aho–Corasick). 시간은 글 길이와 찾은 수에
    비례하고 값의 개수에 따라 늘지 않는다."""

    def __init__(self, words: Iterable[str]) -> None:
        self._next: list[dict[str, int]] = [{}]
        self._fail: list[int] = [0]
        # 그 상태에서 끝나는 가장 긴 값의 길이(0이면 없음).
        self._longest: list[int] = [0]
        for word in words:
            state = 0
            for char in word:
                following = self._next[state].get(char)
                if following is None:
                    following = len(self._next)
                    self._next.append({})
                    self._fail.append(0)
                    self._longest.append(0)
                    self._next[state][char] = following
                state = following
            self._longest[state] = max(self._longest[state], len(word))
        queue = deque(self._next[0].values())
        while queue:
            state = queue.popleft()
            for char, following in self._next[state].items():
                queue.append(following)
                fallback = self._fail[state]
                while fallback and char not in self._next[fallback]:
                    fallback = self._fail[fallback]
                target = self._next[fallback].get(char, 0)
                self._fail[following] = target if target != following else 0
                self._longest[following] = max(
                    self._longest[following], self._longest[self._fail[following]]
                )

    def spans(self, text: str) -> list[tuple[int, int]]:
        """값이 나온 구간을 합쳐 앞에서부터 돌려준다."""
        found: list[tuple[int, int]] = []
        state = 0
        for index, char in enumerate(text):
            while state and char not in self._next[state]:
                state = self._fail[state]
            state = self._next[state].get(char, 0)
            if self._longest[state]:
                found.append((index + 1 - self._longest[state], index + 1))
        merged: list[tuple[int, int]] = []
        for start, end in sorted(found):
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end))
            else:
                merged.append((start, end))
        return merged


class MaskBook:
    """요청 하나의 가리기. 먼저 모든 줄에서 꼴로 알아본 값(긴 줄·PEM 블록 내용 포함)을 모으고, 줄을 가릴
    때 그 값이 다른 줄에 그대로 나와도 가린다. 결과는 같은 글이면 다시 계산하지 않는다."""

    def __init__(self, texts: Iterable[str] = (), extra: Iterable[str] = ()) -> None:
        self._cache: dict[str, Masked] = {}
        found = {value for value in extra if len(value) >= MIN_SHARED_VALUE_CHARS}
        for text in texts:
            if len(text) <= MAX_LINE_CHARS:
                found.update(
                    value
                    for value in self._rules(text).values
                    if len(value) >= MIN_SHARED_VALUE_CHARS
                )
            else:
                found.update(learned_values(text))
        self._finder = _Finder(found) if found else None

    def _rules(self, text: str) -> Masked:
        cached = self._cache.get(text)
        if cached is None:
            cached = mask_text(text)
            self._cache[text] = cached
        return cached

    def mask(self, text: str) -> Masked:
        result = self._rules(text)
        if self._finder is None:
            return Masked(result.text, result.count)
        spans = self._finder.spans(result.text)
        if not spans:
            return Masked(result.text, result.count)
        pieces: list[str] = []
        last = 0
        for start, end in spans:
            pieces.append(result.text[last:start])
            pieces.append(MASK)
            last = end
        pieces.append(result.text[last:])
        return Masked("".join(pieces), result.count + len(spans))


class PrivateKeyBlock:
    """한 파일의 hunk 줄(문맥 줄 포함)을 순서대로 넘기며 PEM 개인 키 블록 안의 줄을 통째로 가린다."""

    def __init__(self, book: MaskBook | None = None) -> None:
        self._inside = False
        self._book = book

    def mask(self, text: str) -> Masked:
        if _PRIVATE_KEY_BEGIN.search(text):
            self._inside = not _PRIVATE_KEY_END.search(text)
            return Masked(MASK, 1)
        if self._inside:
            if _PRIVATE_KEY_END.search(text):
                self._inside = False
            return Masked(MASK, 1)
        if self._book is not None:
            return self._book.mask(text)
        return mask_text(text)
