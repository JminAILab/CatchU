"""설명 초안·질문의 제한된 문장 틀(#120, 2026-10-12 결정 2·3).

모델은 근거 조각과 질문 종류를 고르기만 하고, 문장은 코드가 확인한 경로·이름·파일 상태만 넣어 만든다.
틀에는 숫자가 없으므로 설명의 숫자는 확인한 경로·이름 안에만 있다(CatchU가 센 활동량은 들어가지 않는다).
틀은 이름이 줄에 "포함"됐다고만 말한다. 함수 신설·호출·성능 개선 같은 효과·동기·행위, 다른 사람의
기여나 작업 범위 전체를 말하지 않는다. 조사가 받침에 따라 바뀌지 않도록 「이름이」·「파일이」처럼 고정된
말 뒤에 조사를 붙인다. 백틱은 화면에 글자 그대로 보이므로 쓰지 않는다.
"""

from pathlib import PurePosixPath
from typing import Literal

from app.generation.response import Fragment, LineRef, Question, Ref

# GitHub 파일 상태 → 설명 문장의 동사. 이 밖의 상태(changed·copied·unchanged 등)는 문장을 만들지 않는다.
_FILE_DONE = {
    "added": "추가되었습니다",
    "removed": "삭제되었습니다",
    "modified": "수정되었습니다",
}
_FILE_ACT = {"added": "추가", "removed": "삭제", "modified": "수정"}


def fragment_sentence(fragment: Fragment) -> str | None:
    ref = fragment.ref
    if isinstance(ref, LineRef):
        done = (
            "추가되었습니다" if fragment.kind == "ADDED_LINE_WITH" else "삭제되었습니다"
        )
        return f"{ref.file.path}에서 {ref.name} 이름이 포함된 줄이 {done}."
    file = ref.file
    if file.status == "renamed" and file.previous_path is not None:
        return (
            f"{file.previous_path} 파일의 이름이 바뀌어 {file.path} 파일이 되었습니다."
        )
    status_done = _FILE_DONE.get(file.status)
    return None if status_done is None else f"{file.path} 파일이 {status_done}."


def description(fragments: tuple[Fragment, ...]) -> str | None:
    """확인한 조각마다 한 문장. 같은 문장은 한 번만 쓴다. 문장을 만들 수 없는 조각이 있으면 None."""
    sentences: list[str] = []
    for fragment in fragments:
        sentence = fragment_sentence(fragment)
        if sentence is None:
            return None
        sentences.append(sentence)
    return " ".join(dict.fromkeys(sentences))


def _subject(ref: Ref, *, short: bool) -> tuple[str, str, str] | None:
    """(대상 구, 과거 동작, 할 때의 동작). short면 경로 대신 파일 이름을 쓴다."""
    if isinstance(ref, LineRef):
        path = PurePosixPath(ref.file.path).name if short else ref.file.path
        verb = "추가" if ref.line.kind == "+" else "삭제"
        return f"{path}에서 {ref.name} 이름이 포함된 줄을", f"{verb}한", f"{verb}할"
    file = ref.file
    path = PurePosixPath(file.path).name if short else file.path
    if file.status == "renamed" and file.previous_path is not None:
        previous = (
            PurePosixPath(file.previous_path).name if short else file.previous_path
        )
        return f"{previous} 파일의 이름을", "바꾼", "바꿀"
    act = _FILE_ACT.get(file.status)
    if act is None:
        return None
    return f"{path} 파일을", f"{act}한", f"{act}할"


def _question_text(question: Question, *, short: bool) -> str | None:
    subject = _subject(question.ref, short=short)
    if subject is None:
        return None
    target, done, doing = subject
    if question.type == "BACKGROUND":
        return f"{target} {done} 배경은 무엇인가요?"
    if question.type == "ALTERNATIVES":
        return f"{target} {doing} 때 다른 방법도 고려했다면 무엇이었나요?"
    return f"{target} {done} 뒤 의도대로 동작하는지 확인했다면 어떻게 확인했나요?"


def question(
    question: Question, max_chars: int
) -> str | Literal["UNSUPPORTED", "TOO_LONG"]:
    """질문 한 문장. 길면 경로 대신 파일 이름을 쓴다. 파일 상태에 맞는 틀이 없으면 UNSUPPORTED, 파일
    이름으로도 길면 TOO_LONG."""
    for short in (False, True):
        text = _question_text(question, short=short)
        if text is None:
            return "UNSUPPORTED"
        if len(text) <= max_chars:
            return text
    return "TOO_LONG"
