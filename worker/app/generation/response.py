"""생성 응답 해석과 부분별 판정(#120).

전체를 해석할 수 없는 응답(크기 초과, JSON이 아님, 최상위가 객체가 아님, 같은 키가 겹침)은 전체 호출
실패다. 그 밖의 문제는 해당 부분에만 적용한다(2026-10-12 결정 10·12).

- 설명(fragments): 항목마다 판정해 맞는 항목만 쓰고 틀린 항목은 버린다(2026-10-19 팀장 결정). 목록이
  아니거나 비었거나 맞는 항목이 하나도 없으면 그 부분 전체 실패다. 상한을 넘으면 맞는 항목을 앞에서부터
  상한까지 쓰고, 조각 종류가 지목한 줄의 종류와 다르면 실제 줄 종류로 쓴다. 문장을 만들 수 없는 항목(문장 틀이
  없는 파일 상태)은 상한을 세기 전에 버린다. 문장은 코드가 확인한 줄·이름으로만 만들므로 모양을 이렇게 풀어도
  틀린 문장은 나오지 않는다. 지목한 줄·파일이 보낸 자료에 있는지, 가린 줄이 아닌지, 이름이 그 줄에 식별자
  경계로 있는지(사실 검사)는 그대로 본다.
- 질문(questions): AI가 작업 전체를 묻는 질문 글을 직접 쓴다(#487, 2026-11-08 팀장 결정). 본인만 보는 칸이라
  판정은 붙이지 않는다. 모양이 틀리거나 글자 상한을 넘거나 가리기 검사(`app.redact.mask_text`)에
  걸리는 질문은 버리고, 같은 종류 질문은 처음 것만, 상한까지 쓴다. 쓸 질문이 하나도 없으면 질문 부분 실패다.
- 제목(title): 칸 누락·모양 위반·40자 초과는 형식 위반이라 고쳐 쓰기 대상이다. 확인 실패는 null이다.
- 최상위의 모르는 키는 어느 부분에도 쓰지 않고 판정에서 무시한다(건수만 운영 로그에 남긴다). 모르는
  키 하나로 설명·질문 전체를 실패로 넓히지 않기 위해서다. 항목 안의 모르는 키는 그 항목의 형식 위반이다.
"""

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal

from app.generation.names import NameMatch, name_match, valid_name
from app.generation.request import PreparedFile, PreparedLine
from app.redact import mask_text

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
    """AI가 쓴 질문 하나. 줄·파일을 가리키지 않고 작업 전체를 묻는다(#487)."""

    type: QuestionType
    text: str


PartProblem = Literal["RULE_VIOLATION", "UNVERIFIED"]
# 항목을 버린 원인과 부분이 실패한 첫 원인. 운영 로그의 원인별 건수에만 쓰고(값·경로·이름은 남기지 않음)
# 실패 코드·회원 문구는 problem으로 정한다.
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
        "KIND_MISMATCH",  # 추가 줄 조각인데 삭제 줄(또는 반대)을 지목. 실제 줄 종류로 고쳐 쓴다
        "NO_TEMPLATE",  # 파일 상태에 맞는 문장 틀이 없음
        "COUNT",  # 목록이 아니거나 비었음, 또는 상한 뒤라 버린 맞는 항목
        "ITEM_SHAPE",  # 항목 모양·종류 값·키 위반
        "DUPLICATE_TYPE",  # 앞에 같은 종류 질문이 있음
        "TOO_LONG",  # 질문 글이 글자 상한을 넘음
        "MASKED_TEXT",  # 질문 글이 가리기 검사에 걸림
    ]
)


@dataclass(frozen=True)
class PartVerdict[T]:
    items: tuple[T, ...] = ()
    problem: PartProblem | None = None
    reason: PartReason | None = None
    # 부분이 살았는지와 별개로 버리거나 고친 항목. 운영 로그의 건수에만 쓴다. "dropped:<원인>"(틀려서 버림),
    # "fixed:KIND_MISMATCH"(실제 줄 종류로 고침), "over:COUNT"(맞지만 상한 뒤라 버림).
    notes: tuple[str, ...] = ()


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


_ItemMiss = tuple[PartProblem, PartReason]
# 확인된 조각으로 문장을 만들 수 없는 원인. 만들 수 있으면 None을 돌려주는 판정은 문장 틀을 가진 쪽(render)이
# 넘긴다. 상한을 세기 전에 보아야 문장이 되는 뒤 조각을 잃지 않는다.
SentenceMiss = Literal["NO_TEMPLATE"]
_SENTENCE_PROBLEMS: dict[SentenceMiss, PartProblem] = {
    "NO_TEMPLATE": "UNVERIFIED",
}


def _line_miss(found: LineMiss) -> _ItemMiss:
    return ("RULE_VIOLATION" if found == "NAME_SHAPE" else "UNVERIFIED", found)


def _with_sentence[T](
    item: T, sentence: Callable[[T], SentenceMiss | None]
) -> T | _ItemMiss:
    miss = sentence(item)
    return item if miss is None else (_SENTENCE_PROBLEMS[miss], miss)


def _fragment(
    item: object, sent: Sent, max_name: int, notes: list[str]
) -> Fragment | _ItemMiss:
    """조각 하나. 맞지 않으면 (문제, 원인). 조각 종류가 지목한 줄의 종류와 다르면 실제 줄 종류로 고친다
    (문장은 코드가 아는 줄 종류로만 만들므로 사실이 바뀌지 않는다)."""
    if not isinstance(item, dict) or item.get("kind") not in _FRAGMENT_KINDS:
        return ("RULE_VIOLATION", "ITEM_SHAPE")
    kind: FragmentKind = item["kind"]
    if kind == "FILE_STATUS":
        if not _keys(item, "kind", "file"):
            return ("RULE_VIOLATION", "ITEM_SHAPE")
        file = sent.file(item["file"])
        if file is None:
            return ("UNVERIFIED", "UNKNOWN_FILE")
        return Fragment(kind, file)
    if not _keys(item, "kind", "line", "name"):
        return ("RULE_VIOLATION", "ITEM_SHAPE")
    found = sent.locate_line(item["line"], item["name"], max_name)
    if not isinstance(found, LineRef):
        return _line_miss(found)
    actual: FragmentKind = (
        "ADDED_LINE_WITH" if found.line.kind == "+" else "REMOVED_LINE_WITH"
    )
    if actual != kind:
        notes.append("fixed:KIND_MISMATCH")
    return Fragment(actual, found)


def fragments(
    response: Mapping[str, Any],
    sent: Sent,
    *,
    low: int,
    high: int,
    max_name: int,
    sentence: Callable[[Fragment], SentenceMiss | None],
) -> PartVerdict[Fragment]:
    """맞고 문장을 만들 수 있는 조각만 앞에서부터 상한까지 쓰고 나머지는 버린다. 목록이 아니거나 하한보다
    적으면, 또는 쓸 조각이 하나도 없으면 첫 원인으로 실패한다."""
    items = response.get("fragments")
    if not isinstance(items, list) or len(items) < low:
        return _miss("RULE_VIOLATION", "COUNT")
    verified: list[Fragment] = []
    notes: list[str] = []
    first: _ItemMiss | None = None
    for item in items:
        outcome = _fragment(item, sent, max_name, notes)
        if isinstance(outcome, Fragment):
            outcome = _with_sentence(outcome, sentence)
        if isinstance(outcome, Fragment):
            if len(verified) < high:
                verified.append(outcome)
            else:
                notes.append("over:COUNT")
            continue
        first = first or outcome
        notes.append(f"dropped:{outcome[1]}")
    if not verified:
        assert first is not None
        return PartVerdict(problem=first[0], reason=first[1], notes=tuple(notes))
    return PartVerdict(tuple(verified), notes=tuple(notes))


def _one_line(text: str) -> bool:
    """비지 않은 한 줄인가. CR·LF뿐 아니라 유니코드 줄 구분 문자(U+2028·U+2029·NEL 등, `str.splitlines` 기준)도
    줄바꿈으로 본다(#504 자동 리뷰 지적)."""
    return len(text.splitlines()) == 1


def _question(item: object, max_chars: int) -> Question | _ItemMiss:
    """질문 하나. 키는 type·text 둘뿐이고, 글은 한 줄이며 비어 있지 않아야 한다. 맞지 않으면 (문제, 원인).

    글자 상한은 앞뒤 공백을 뗀 글로 센다. 가리기 검사에 걸리는 글(비밀값·개인정보 꼴)은 버린다. 후보 판정이
    기록의 글을 버리는 것과 같은 검사다(`app.candidates.record_text`)."""
    if (
        not isinstance(item, dict)
        or not _keys(item, "type", "text")
        or item["type"] not in _QUESTION_TYPES
    ):
        return ("RULE_VIOLATION", "ITEM_SHAPE")
    kind: QuestionType = item["type"]
    text = item["text"].strip()
    if not _one_line(text):
        return ("RULE_VIOLATION", "ITEM_SHAPE")
    if len(text) > max_chars:
        return ("RULE_VIOLATION", "TOO_LONG")
    if mask_text(text).count > 0:
        return ("RULE_VIOLATION", "MASKED_TEXT")
    return Question(kind, text)


def questions(
    response: Mapping[str, Any],
    *,
    low: int,
    high: int,
    max_chars: int,
) -> PartVerdict[Question]:
    """맞는 질문만 종류마다 처음 것 하나씩 상한까지 쓰고 나머지는 버린다. 목록이 아니거나 하한보다 적으면,
    또는 쓸 질문이 하나도 없으면 첫 원인으로 실패한다."""
    items = response.get("questions")
    if not isinstance(items, list) or len(items) < low:
        return _miss("RULE_VIOLATION", "COUNT")
    verified: list[Question] = []
    used: set[QuestionType] = set()
    notes: list[str] = []
    first: _ItemMiss | None = None
    for item in items:
        outcome = _question(item, max_chars)
        if isinstance(outcome, Question):
            if outcome.type in used:
                notes.append("dropped:DUPLICATE_TYPE")
            elif len(verified) >= high:
                notes.append("over:COUNT")
            else:
                used.add(outcome.type)
                verified.append(outcome)
            continue
        first = first or outcome
        notes.append(f"dropped:{outcome[1]}")
    if not verified:
        assert first is not None
        return PartVerdict(problem=first[0], reason=first[1], notes=tuple(notes))
    return PartVerdict(tuple(verified), notes=tuple(notes))


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


# AI 쪽 응답(CR3 BR3.1·BR5.1): 제목 후보(titleCandidates)·설명 문장(sentences)

AI_TOP_LEVEL_KEYS = frozenset({"titleCandidates", "sentences", "title", "questions"})
MAX_AI_TITLES = 3
MAX_AI_SENTENCES = 3


@dataclass(frozen=True)
class WrittenItem:
    """AI가 쓴 제목 후보(t1~t3) 또는 설명 문장(s1~s3). 근거 줄은 보낸 자료의 고를 수 있는 줄뿐이다."""

    id: str
    text: str
    lines: tuple[PreparedLine, ...]


@dataclass(frozen=True)
class WrittenPart:
    items: tuple[WrittenItem, ...] = ()
    # 버린 항목. "dropped:<원인>"(모양·근거 줄·글자 수), "over:COUNT"(상한 뒤). 운영 로그의 건수에만 쓴다.
    notes: tuple[str, ...] = ()


def _written_item(
    item: object, sent: Sent, max_chars: int | None
) -> tuple[str, tuple[PreparedLine, ...]] | str:
    """항목 하나를 (글, 근거 줄)로 읽는다. 맞지 않으면 버린 원인."""
    if (
        not isinstance(item, dict)
        or isinstance(item, _Duplicated)
        or set(item) != {"text", "lines"}
    ):
        return "ITEM_SHAPE"
    text, refs = item["text"], item["lines"]
    if not isinstance(text, str) or not isinstance(refs, list) or not refs:
        return "ITEM_SHAPE"
    text = text.strip()
    if not _one_line(text):
        return "ITEM_SHAPE"
    if max_chars is not None and len(text) > max_chars:
        # 40자를 넘는 제목 후보는 버리고 고쳐 쓰지 않는다(Q3 A).
        return "TOO_LONG"
    lines: list[PreparedLine] = []
    for ref in refs:
        line = sent.lines.get(ref) if isinstance(ref, str) else None
        if line is None:
            return "UNKNOWN_LINE"
        if line.masked:
            return "MASKED_LINE"
        if line not in lines:
            lines.append(line)
    return text, tuple(lines)


def written(
    value: object, sent: Sent, *, prefix: str, high: int, max_chars: int | None
) -> WrittenPart | None:
    """AI가 쓴 글 목록을 읽는다. 목록이 아니면 None(칸의 모양이 틀림). 맞는 항목만 앞에서부터 high개까지 쓰고
    응답 안 순서로 prefix+번호(t1·s1…)를 붙인다. 근거 줄이 없거나 보낸 자료에 없는 줄을 가리킨 항목은 버린다."""
    if not isinstance(value, list):
        return None
    items: list[WrittenItem] = []
    notes: list[str] = []
    for each in value:
        found = _written_item(each, sent, max_chars)
        if isinstance(found, str):
            notes.append(f"dropped:{found}")
            continue
        if len(items) >= high:
            notes.append("over:COUNT")
            continue
        text, lines = found
        items.append(WrittenItem(f"{prefix}{len(items) + 1}", text, lines))
    return WrittenPart(tuple(items), tuple(notes))


@dataclass(frozen=True)
class AiParts:
    titles: WrittenPart
    sentences: WrittenPart


def ai_parts(
    response: Mapping[str, Any], sent: Sent, *, max_title_chars: int
) -> AiParts | None:
    """AI 쪽 응답 칸을 읽는다. 문장 칸이 없거나 목록이 아니면 None이다: 응답을 읽을 수 없는 것으로 보아 생성
    호출 실패(GENERATION_RESPONSE_UNREADABLE)다(BR5.1). 제목 후보 칸이 없거나 목록이 아니면 후보가 0개다."""
    sentences = written(
        response.get("sentences"),
        sent,
        prefix="s",
        high=MAX_AI_SENTENCES,
        max_chars=None,
    )
    if sentences is None:
        return None
    titles = written(
        response.get("titleCandidates"),
        sent,
        prefix="t",
        high=MAX_AI_TITLES,
        max_chars=max_title_chars,
    )
    if titles is None:
        titles = WrittenPart(notes=("dropped:SHAPE",))
    return AiParts(titles, sentences)
