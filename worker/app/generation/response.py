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
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from app.generation.names import NameMatch, name_match, valid_name
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
# 부분이 실패한 첫 원인. 운영 로그의 원인별 건수에만 쓰고(값·경로·이름은 남기지 않음) 실패 코드·회원 문구는
# problem으로 정한다.
LineMiss = Literal[
    "UNKNOWN_LINE",  # 보낸 자료에 없는 줄 id
    "MASKED_LINE",  # 가린 줄(selectable false)
    "NAME_SHAPE",  # 이름이 식별자 하나의 모양이 아님
    "NAME_MISSING",  # 이름이 그 줄에 없음
    "NAME_JOINED_ASCII",  # 이름이 영문자·숫자·밑줄·$에 붙어서만 있음
    "NAME_JOINED_NON_ASCII",  # 이름이 한글 등 ASCII 밖 글자에 붙어서만 있음
]
PartReason = (
    LineMiss
    | Literal[
        "UNKNOWN_FILE",  # 보낸 자료에 없는 파일 id
        "KIND_MISMATCH",  # 추가 줄 조각인데 삭제 줄(또는 반대)을 지목
        "NO_TEMPLATE",  # 파일 상태에 맞는 문장 틀이 없음
        "COUNT",  # 개수 위반(목록이 아님 포함)
        "ITEM_SHAPE",  # 항목 모양·종류 값·키 위반
        "DUPLICATE_TYPE",  # 같은 종류 질문이 둘 이상
        "TOO_LONG",  # 파일 이름으로 줄여도 질문이 글자 상한을 넘음
    ]
)


@dataclass(frozen=True)
class PartVerdict[T]:
    items: tuple[T, ...] = ()
    problem: PartProblem | None = None
    reason: PartReason | None = None


def _miss[T](problem: PartProblem, reason: PartReason) -> PartVerdict[T]:
    return PartVerdict(problem=problem, reason=reason)


_NAME_MISS: dict[NameMatch, LineMiss] = {
    "MISSING": "NAME_MISSING",
    "JOINED_ASCII": "NAME_JOINED_ASCII",
    "JOINED_NON_ASCII": "NAME_JOINED_NON_ASCII",
}


class Sent:
    """한 호출에서 보낸 줄·파일. 지목은 여기 있는 것만 받는다(문맥 줄·다른 후보·보내지 않은 줄은 없다)."""

    def __init__(
        self, lines: Mapping[str, PreparedLine], files: Mapping[str, PreparedFile]
    ) -> None:
        self.lines = lines
        self.files = files

    def locate_line(
        self, line_id: object, name: object, max_chars: int
    ) -> LineRef | LineMiss:
        """고를 수 있는 보낸 줄이고 이름이 그 줄에 식별자 경계로 있으면 지목, 아니면 맞지 않은 첫 이유."""
        if not isinstance(line_id, str):
            return "UNKNOWN_LINE"
        line = self.lines.get(line_id)
        if line is None:
            return "UNKNOWN_LINE"
        if line.masked:
            return "MASKED_LINE"
        if not isinstance(name, str) or not valid_name(name, max_chars):
            return "NAME_SHAPE"
        match = name_match(name, line.text)
        if match != "FOUND":
            return _NAME_MISS[match]
        return LineRef(line, self.files[line.file_id], name)

    def line(self, line_id: object, name: object, max_chars: int) -> LineRef | None:
        """고를 수 있는 보낸 줄이고 이름이 그 줄에 식별자 경계로 있으면 지목을 돌려준다."""
        found = self.locate_line(line_id, name, max_chars)
        return found if isinstance(found, LineRef) else None

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
        return _miss("RULE_VIOLATION", "COUNT")
    shaped: list[tuple[FragmentKind, Mapping[str, Any]]] = []
    for item in items:
        if not isinstance(item, dict) or item.get("kind") not in _FRAGMENT_KINDS:
            return _miss("RULE_VIOLATION", "ITEM_SHAPE")
        kind: FragmentKind = item["kind"]
        if kind == "FILE_STATUS":
            if not _keys(item, "kind", "file"):
                return _miss("RULE_VIOLATION", "ITEM_SHAPE")
        elif not _keys(item, "kind", "line", "name"):
            return _miss("RULE_VIOLATION", "ITEM_SHAPE")
        elif not valid_name(item["name"], max_name):
            return _miss("RULE_VIOLATION", "NAME_SHAPE")
        shaped.append((kind, item))
    verified: list[Fragment] = []
    for kind, item in shaped:
        ref: Ref | None
        if kind == "FILE_STATUS":
            ref = sent.file(item["file"])
            if ref is None:
                return _miss("UNVERIFIED", "UNKNOWN_FILE")
        else:
            found = sent.locate_line(item["line"], item["name"], max_name)
            if not isinstance(found, LineRef):
                return _miss("UNVERIFIED", found)
            expected = "+" if kind == "ADDED_LINE_WITH" else "-"
            if found.line.kind != expected:
                return _miss("UNVERIFIED", "KIND_MISMATCH")
            ref = found
        verified.append(Fragment(kind, ref))
    return PartVerdict(tuple(verified))


def questions(
    response: Mapping[str, Any], sent: Sent, *, low: int, high: int, max_name: int
) -> PartVerdict[Question]:
    items = response.get("questions")
    if not isinstance(items, list) or not low <= len(items) <= high:
        return _miss("RULE_VIOLATION", "COUNT")
    shaped: list[tuple[QuestionType, Mapping[str, Any]]] = []
    for item in items:
        if not isinstance(item, dict) or item.get("type") not in _QUESTION_TYPES:
            return _miss("RULE_VIOLATION", "ITEM_SHAPE")
        if _keys(item, "type", "file"):
            pass
        elif not _keys(item, "type", "line", "name"):
            return _miss("RULE_VIOLATION", "ITEM_SHAPE")
        elif not valid_name(item["name"], max_name):
            return _miss("RULE_VIOLATION", "NAME_SHAPE")
        shaped.append((item["type"], item))
    if len({kind for kind, _ in shaped}) != len(shaped):
        # 같은 종류의 질문이 둘 이상이면 질문 전체가 형식 위반이다(결정 12).
        return _miss("RULE_VIOLATION", "DUPLICATE_TYPE")
    verified: list[Question] = []
    for kind, item in shaped:
        ref: Ref
        if "file" in item:
            file = sent.file(item["file"])
            if file is None:
                return _miss("UNVERIFIED", "UNKNOWN_FILE")
            ref = file
        else:
            found = sent.locate_line(item["line"], item["name"], max_name)
            if not isinstance(found, LineRef):
                return _miss("UNVERIFIED", found)
            ref = found
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
