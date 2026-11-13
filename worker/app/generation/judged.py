"""생성 흐름의 AI 쪽(CR3): 재료 판정 질문, Catch 판정 질문과 답 적용.

생성 흐름(`flow.py`)이 AI 쪽이 켜졌을 때만 부른다. 판정 공급자 호출은 판정 구성 요소(`app.judgement`)가 하고,
여기는 생성 쪽 자료(보낸 줄·후보 자료)를 판정 요청의 단순한 값으로 옮기고 답을 제목·작업 사실·설명에 적용한다.

- 기록의 글은 후보 자료의 칸(`record_text`, CR1)만 읽고 다시 계산하지 않는다(BR2.3). 판정 요청에만 넣고 생성
  요청에는 넣지 않는다(BR2.4).
- 「판정 없음」은 Catch 판정 요청이 실패했거나, 보내지 않았거나, 물은 기록의 글 질문(RECORD_WHAT·RECORD_WHOLE)
  가운데 답이 빠진 것이 있을 때다. 이때 제목과 작업 사실 둘째 줄은 같은 규칙 결과를 쓴다(BR2.5·BR3.5·BR4.1).
- 작업 사실에는 생성 출력의 글을 넣지 않는다. CR3이 하는 일은 둘째 줄을 위치로 지우는 것뿐이다(BR4.2).
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Literal

from app.generation.groups import ChangeGroup, change_groups, file_kinds
from app.generation.request import PreparedCandidate, Selection
from app.generation.response import WrittenItem
from app.judgement.answers import Answers
from app.judgement.questions import (
    NONE_OPTION,
    RECORD_THRESHOLD,
    SENTENCE_THRESHOLD,
    TITLE_THRESHOLD,
    CatchAsk,
    CatchLine,
    MaterialAsk,
    MaterialFile,
    Written,
    catch_request,
    material_request,
)
from app.processing.generation import RecordText

TitleSource = Literal["RECORD", "AI", "RECORD_WHOLE_MISS", "FRAGMENT", "NONE"]


# 재료 판정(BR6.1·BR6.2)


def _ambiguous(groups: Sequence[ChangeGroup]) -> frozenset[str]:
    """애매한 파일: 저장소 맨 위의 파일, 또는 씨앗 묶음이 둘 이상일 때 갈라지기 전 얕은 곳에 남은 파일."""
    depth = max(
        (len(PurePosixPath(group.name).parts) for group in groups if group.name),
        default=0,
    )
    found: set[str] = set()
    for group in groups:
        shallow = (
            not group.name or len(PurePosixPath(group.name).parts) < depth
        ) and len(groups) > 1
        for file in group.files:
            if "/" not in file.path or shallow:
                found.add(file.path)
    return frozenset(found)


def material_ask(item: PreparedCandidate, timeout_seconds: float) -> MaterialAsk | None:
    """큰 후보의 재료 판정 요청. 파일은 CR1 규칙 순서(묶음 순서 → 묶음 안 종류 순서)로 놓는다.

    입력은 생성 재료 준비가 고른 파일(비밀 파일·온전하지 않은 patch는 이미 빠짐)의 경로·상태·바뀐 줄 수와 앞
    5줄이다. 준비 단계에서 가린 줄은 글 없이 넘겨 판정 요청에 들어가지 않게 한다.
    """
    kinds = file_kinds(item.files)
    groups = change_groups(item.files, kinds)
    ambiguous = _ambiguous(groups)
    files: list[MaterialFile] = []
    for group in groups:
        for file in group.files:
            files.append(
                MaterialFile(
                    path=file.path,
                    status=file.status,
                    changed_lines=len(file.lines),
                    changed=tuple(
                        (line.kind, None if line.masked else line.text)
                        for line in file.lines
                    ),
                    ask_kind=kinds[file.id] is None,
                    ask_group=file.path in ambiguous,
                )
            )
    return material_request(
        files,
        groups=[group.name for group in groups],
        timeout_seconds=timeout_seconds,
    )


# Catch 판정(BR2.1·BR3.2)


def _usable(record: RecordText | None) -> RecordText | None:
    return record if record is not None and record.usable else None


def catch_ask(
    item: PreparedCandidate,
    selection: Selection,
    titles: Sequence[WrittenItem],
    sentences: Sequence[WrittenItem],
    timeout_seconds: float,
) -> CatchAsk | None:
    """Catch 판정 요청. 바뀐 줄·경로는 생성 요청에 담은 고를 수 있는 줄 그대로다(가린 줄 제외)."""
    record = _usable(item.material.candidate.record_text)
    ask_whole = (
        record is not None
        and record.source == "COMMIT_FIRST_LINE"
        and len(item.material.own_commits) >= 2
    )
    lines = [
        CatchLine(
            id=line.id,
            file_id=line.file_id,
            path=selection.files[line.file_id].path,
            status=selection.files[line.file_id].status,
            change="added" if line.kind == "+" else "removed",
            text=line.text,
        )
        for line in selection.lines.values()
        if not line.masked
    ]
    return catch_request(
        lines,
        record=None if record is None else record.text,
        ask_whole=ask_whole,
        titles=[_written(each) for each in titles],
        sentences=[_written(each) for each in sentences],
        timeout_seconds=timeout_seconds,
    )


def _written(item: WrittenItem) -> Written:
    return Written(item.id, item.text, tuple(line.id for line in item.lines))


@dataclass(frozen=True)
class RecordVerdict:
    """기록의 글 판정(BR3.2). weak는 판정 부실(RECORD_WHAT < 0.5), whole_miss는 전체 미달(RECORD_WHOLE < 0.5)."""

    weak: bool
    whole_miss: bool


def record_verdict(
    ask: CatchAsk | None, answers: Answers | None
) -> RecordVerdict | None:
    """기록의 글 판정. 물은 기록의 글 질문 가운데 답이 하나라도 빠지면 「판정 없음」(None)이다(BR2.5)."""
    if ask is None or answers is None or ask.record_what is None:
        return None
    what = answers.probabilities.get(ask.record_what)
    if what is None:
        return None
    whole: float | None = None
    if ask.record_whole is not None:
        whole = answers.probabilities.get(ask.record_whole)
        if whole is None:
            return None
    return RecordVerdict(
        weak=what < RECORD_THRESHOLD,
        whole_miss=whole is not None and whole < RECORD_THRESHOLD,
    )


def ai_title(
    ask: CatchAsk | None, answers: Answers | None, titles: Sequence[WrittenItem]
) -> str | None:
    """TITLE_CHOICE에서 0.9 이상인 후보의 글. NONE이 0.9 이상이거나 0.9 이상인 선택지가 없으면 None(BR3.4)."""
    if ask is None or answers is None or ask.title_choice is None:
        return None
    chosen = answers.chosen(ask.title_choice, TITLE_THRESHOLD)
    if chosen is None or chosen == NONE_OPTION:
        return None
    return next((each.text for each in titles if each.id == chosen), None)


def choose_title(
    record: RecordText | None,
    verdict: RecordVerdict | None,
    ai: str | None,
    fragment: str | None,
) -> tuple[str | None, TitleSource]:
    """제목 순서(BR3.4·BR3.5): 기록의 글 → AI 후보 → 전체 미달만으로 떨어진 기록의 글 → 조각 제목 → 없음.

    verdict가 None(「판정 없음」)이면 쓸 만한 기록의 글이 그대로 제목이다. ai는 판정을 거친 후보만 넘긴다.
    """
    usable = _usable(record)
    if usable is not None:
        if verdict is None or not (verdict.weak or verdict.whole_miss):
            return usable.text, "RECORD"
    if ai is not None:
        return ai, "AI"
    if usable is not None and verdict is not None and not verdict.weak:
        return usable.text, "RECORD_WHOLE_MISS"
    if fragment is not None:
        return fragment, "FRAGMENT"
    return None, "NONE"


def remove_record_fact(
    facts: tuple[str, ...], record: RecordText | None, verdict: RecordVerdict | None
) -> tuple[str, ...]:
    """판정 부실이면 작업 사실의 둘째 항목(CR1의 기록의 글 줄)을 위치로 지운다(BR4.1). 전체 미달은 보지 않는다."""
    if _usable(record) is None or verdict is None or not verdict.weak or len(facts) < 2:
        return facts
    return (facts[0], *facts[2:])


def kept_sentences(
    ask: CatchAsk | None, answers: Answers | None, sentences: Sequence[WrittenItem]
) -> tuple[WrittenItem, ...]:
    """SENTENCE_TRUE가 0.9 이상인 문장(응답 순서). 답이 없으면 0.9 미만으로 본다(BR5.2)."""
    if ask is None or answers is None:
        return ()
    kept: list[WrittenItem] = []
    for each in sentences:
        question = ask.sentences.get(each.id)
        if question is None:
            continue
        probability = answers.probabilities.get(question)
        if probability is not None and probability >= SENTENCE_THRESHOLD:
            kept.append(each)
    return tuple(kept)


@dataclass(frozen=True)
class CatchTrace:
    """FR10 확인 명령(`app.processing.confirm`)이 확인표에 옮기는 Catch 하나의 판정 경과.

    원문(기록의 글·AI 글)을 담으므로 운영 로그·결과 메시지로 보내지 않는다. 생성 흐름은 관찰자가 있을 때만
    만들어 넘긴다.
    """

    work_identity: str
    record: RecordText | None
    titles: tuple[WrittenItem, ...]
    sentences: tuple[WrittenItem, ...]
    # 질문 종류·대상 → 답 값(확률·선택지별 확률·점수). 판정하지 않았으면 비어 있다.
    answers: Mapping[str, object]
    judgement: Literal["NOT_SENT", "SKIPPED", "FAILED", "ANSWERED", "NO_QUESTIONS"]
    failure: str | None
    record_verdict: RecordVerdict | None
    # 기록의 글이 제목이어도 TITLE_CHOICE가 고른 후보를 적는다(BR9.1).
    chosen_title: str | None
    title: str | None
    title_source: TitleSource
    kept: tuple[str, ...]
    second_line_removed: bool
    material_judged: bool
    material_seconds: float | None
    # 최종 설명 초안 상태와 실패 코드(FAILED일 때), 생각해 볼 질문 상태·실패 코드와 AI가 쓴 질문 글(#487).
    draft_status: str
    draft_failure: str | None
    reflection_status: str
    reflection_failure: str | None
    questions: tuple[str, ...]


def answer_values(ask: CatchAsk | None, answers: Answers | None) -> dict[str, object]:
    """확인표용: 질문 종류(와 문장 id) → 답 값."""
    if ask is None or answers is None:
        return {}
    values: dict[str, object] = {}
    for question in ask.request.questions:
        key = (
            f"{question.kind}:{question.target}"
            if question.kind == "SENTENCE_TRUE"
            else question.kind
        )
        if question.id in answers.probabilities:
            values[key] = answers.probabilities[question.id]
        elif question.id in answers.choices:
            values[key] = dict(answers.choices[question.id])
    return values
