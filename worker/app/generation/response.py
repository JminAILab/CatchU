"""생성 응답 해석과 부분별 판정(#120).

전체를 해석할 수 없는 응답(크기 초과, JSON이 아님, 최상위가 객체가 아님, 같은 키가 겹침)은 전체 호출
실패다. 그 밖의 문제는 해당 부분에만 적용한다(2026-10-12 결정 10·12).

- 설명(fragments)·질문(questions): 개수·종류·항목 모양 위반은 그 부분 전체의 형식 위반이고, 지목한 줄·
  파일·이름이 보낸 자료와 맞지 않으면 그 부분 전체의 확인 실패다. 넘친 항목만 버리고 나머지를 쓰지
  않는다.
- 제목(title): 칸 누락·모양 위반·40자 초과는 형식 위반이라 고쳐 쓰기 대상이다. 확인 실패는 null이다.
- 최상위의 모르는 키는 어느 부분에도 쓰지 않고 판정에서 무시한다(건수만 운영 로그에 남긴다). 모르는
  키 하나로 설명·질문 전체를 실패로 넓히지 않기 위해서다. 항목 안의 모르는 키는 그 부분의 형식 위반이다.
"""

import json
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from app.generation.request import PreparedFile, PreparedLine

FragmentKind = Literal["ADDED_LINE_WITH", "REMOVED_LINE_WITH", "FILE_STATUS"]
QuestionType = Literal["BACKGROUND", "ALTERNATIVES", "VERIFICATION"]
_FRAGMENT_KINDS: tuple[FragmentKind, ...] = (
    "ADDED_LINE_WITH",
    "REMOVED_LINE_WITH",
    "FILE_STATUS",
)
_QUESTION_TYPES: tuple[QuestionType, ...] = (
    "BACKGROUND",
    "ALTERNATIVES",
    "VERIFICATION",
)
TOP_LEVEL_KEYS = frozenset({"fragments", "title", "questions"})
_NAME = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")


class Unreadable(Exception):
    """응답 전체를 해석할 수 없다."""

    def __init__(self, reason: Literal["TOO_LARGE", "UNREADABLE"]) -> None:
        super().__init__(reason)
        self.reason = reason


class _Duplicated(dict[str, Any]):
    """같은 키가 두 번 이상 나온 JSON 객체. 어느 값을 뜻했는지 알 수 없어 그 객체를 모양 위반으로 본다."""


def read(raw: str, max_output_bytes: int) -> dict[str, Any]:
    """응답 글을 JSON 객체로 읽는다. 크기를 먼저 보고, 넘으면 해석하지 않는다.

    최상위 객체에서 같은 키가 겹치면 어느 부분의 값인지 알 수 없어 전체를 읽을 수 없는 응답으로 본다.
    항목 안에서 겹치면 그 항목이 든 부분만 모양 위반이다.
    """
    if len(raw.encode("utf-8", errors="surrogatepass")) > max_output_bytes:
        raise Unreadable("TOO_LARGE")
    try:
        value = json.loads(raw, object_pairs_hook=_pairs, parse_constant=_no_constant)
    except (ValueError, RecursionError) as error:
        raise Unreadable("UNREADABLE") from error
    if not isinstance(value, dict) or isinstance(value, _Duplicated):
        raise Unreadable("UNREADABLE")
    return value


def _no_constant(name: str) -> Any:
    """NaN·Infinity·-Infinity는 JSON 표준이 아니라 응답 전체를 읽을 수 없는 것으로 본다."""
    raise ValueError(f"표준 JSON이 아닌 값 {name}")


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    found: dict[str, Any] = {}
    for key, value in pairs:
        if key in found:
            return _Duplicated(pairs)
        found[key] = value
    return found


def valid_name(name: object, max_chars: int) -> bool:
    """코드 이름 모양: 식별자 글자만, 영문자 하나 이상, 길이 상한 안. 공백·백틱·주소·명령문은 거부."""
    return (
        isinstance(name, str)
        and len(name) <= max_chars
        and _NAME.fullmatch(name) is not None
        and any(char.isalpha() for char in name)
    )


def _joins(char: str) -> bool:
    """이름에 이어 붙어 한 식별자가 되는 글자: 유니코드 글자·숫자, 밑줄, $, 결합 문자."""
    return char.isalnum() or char in "_$" or unicodedata.category(char).startswith("M")


def name_in(name: str, text: str) -> bool:
    """식별자 경계로 일치하는가. `limit`이 `loginRateLimit`에, `func_1`이 `func_10`에, `한글limit`에 묻어
    확인되지 않는다. 한글 조사가 바로 붙은 이름(「limit을」)도 한 덩어리라 확인하지 않는다."""
    start = text.find(name)
    while start >= 0:
        end = start + len(name)
        joined_before = start > 0 and _joins(text[start - 1])
        joined_after = end < len(text) and _joins(text[end])
        if not joined_before and not joined_after:
            return True
        start = text.find(name, start + 1)
    return False


# 부분 판정 결과


@dataclass(frozen=True)
class LineRef:
    line: PreparedLine
    file: PreparedFile
    name: str


@dataclass(frozen=True)
class FileRef:
    file: PreparedFile


Ref = LineRef | FileRef


@dataclass(frozen=True)
class Fragment:
    kind: FragmentKind
    ref: Ref


@dataclass(frozen=True)
class Question:
    type: QuestionType
    ref: Ref


PartProblem = Literal["RULE_VIOLATION", "UNVERIFIED"]


@dataclass(frozen=True)
class PartVerdict[T]:
    items: tuple[T, ...] = ()
    problem: PartProblem | None = None


class Sent:
    """한 호출에서 보낸 줄·파일. 지목은 여기 있는 것만 받는다(문맥 줄·다른 후보·보내지 않은 줄은 없다)."""

    def __init__(
        self, lines: Mapping[str, PreparedLine], files: Mapping[str, PreparedFile]
    ) -> None:
        self.lines = lines
        self.files = files

    def line(self, line_id: object, name: object, max_chars: int) -> LineRef | None:
        """고를 수 있는 보낸 줄이고 이름이 그 줄에 식별자 경계로 있으면 지목을 돌려준다."""
        if not isinstance(line_id, str) or not isinstance(name, str):
            return None
        line = self.lines.get(line_id)
        if line is None or line.masked or not valid_name(name, max_chars):
            return None
        if not name_in(name, line.text):
            return None
        return LineRef(line, self.files[line.file_id], name)

    def file(self, file_id: object) -> FileRef | None:
        if not isinstance(file_id, str):
            return None
        file = self.files.get(file_id)
        return None if file is None else FileRef(file)


def _keys(item: Mapping[str, Any], *expected: str) -> bool:
    if isinstance(item, _Duplicated):
        return False
    return set(item) == set(expected) and all(
        isinstance(item[key], str) for key in expected
    )


def fragments(
    response: Mapping[str, Any], sent: Sent, *, low: int, high: int, max_name: int
) -> PartVerdict[Fragment]:
    items = response.get("fragments")
    if not isinstance(items, list) or not low <= len(items) <= high:
        return PartVerdict(problem="RULE_VIOLATION")
    shaped: list[tuple[FragmentKind, Mapping[str, Any]]] = []
    for item in items:
        if not isinstance(item, dict) or item.get("kind") not in _FRAGMENT_KINDS:
            return PartVerdict(problem="RULE_VIOLATION")
        kind: FragmentKind = item["kind"]
        if kind == "FILE_STATUS":
            if not _keys(item, "kind", "file"):
                return PartVerdict(problem="RULE_VIOLATION")
        elif not _keys(item, "kind", "line", "name") or not valid_name(
            item["name"], max_name
        ):
            return PartVerdict(problem="RULE_VIOLATION")
        shaped.append((kind, item))
    verified: list[Fragment] = []
    for kind, item in shaped:
        ref: Ref | None
        if kind == "FILE_STATUS":
            ref = sent.file(item["file"])
        else:
            ref = sent.line(item["line"], item["name"], max_name)
            expected = "+" if kind == "ADDED_LINE_WITH" else "-"
            if ref is not None and ref.line.kind != expected:
                ref = None
        if ref is None:
            return PartVerdict(problem="UNVERIFIED")
        verified.append(Fragment(kind, ref))
    return PartVerdict(tuple(verified))


def questions(
    response: Mapping[str, Any], sent: Sent, *, low: int, high: int, max_name: int
) -> PartVerdict[Question]:
    items = response.get("questions")
    if not isinstance(items, list) or not low <= len(items) <= high:
        return PartVerdict(problem="RULE_VIOLATION")
    shaped: list[tuple[QuestionType, Mapping[str, Any]]] = []
    for item in items:
        if not isinstance(item, dict) or item.get("type") not in _QUESTION_TYPES:
            return PartVerdict(problem="RULE_VIOLATION")
        if not (
            _keys(item, "type", "file")
            or (
                _keys(item, "type", "line", "name")
                and valid_name(item["name"], max_name)
            )
        ):
            return PartVerdict(problem="RULE_VIOLATION")
        shaped.append((item["type"], item))
    if len({kind for kind, _ in shaped}) != len(shaped):
        # 같은 종류의 질문이 둘 이상이면 질문 전체가 형식 위반이다(결정 12).
        return PartVerdict(problem="RULE_VIOLATION")
    verified: list[Question] = []
    for kind, item in shaped:
        ref: Ref | None = (
            sent.file(item["file"])
            if "file" in item
            else sent.line(item["line"], item["name"], max_name)
        )
        if ref is None:
            return PartVerdict(problem="UNVERIFIED")
        verified.append(Question(kind, ref))
    return PartVerdict(tuple(verified))


TitleProblem = Literal["MISSING", "SHAPE", "NAME"]


@dataclass(frozen=True)
class TitleChoice:
    """제목 대상 지목. ref가 None이면 확인 실패(null, 고쳐 쓰지 않음), problem이 있으면 형식 위반."""

    ref: Ref | None = None
    problem: TitleProblem | None = None


def title_choice(value: object, sent: Sent, *, max_name: int) -> TitleChoice:
    if value is None:
        return TitleChoice(problem="MISSING")
    if not isinstance(value, dict):
        return TitleChoice(problem="SHAPE")
    target = value.get("target")
    if target == "FILE_NAME" and _keys(value, "target", "file"):
        return TitleChoice(ref=sent.file(value["file"]))
    if target == "CODE_NAME" and _keys(value, "target", "line", "name"):
        if not valid_name(value["name"], max_name):
            return TitleChoice(problem="NAME")
        return TitleChoice(ref=sent.line(value["line"], value["name"], max_name))
    return TitleChoice(problem="SHAPE")


def unknown_keys(response: Mapping[str, Any], allowed: frozenset[str]) -> int:
    return sum(1 for key in response if key not in allowed)
