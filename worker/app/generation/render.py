"""AI 쪽이 꺼졌을 때 설명 초안의 제한된 문장 틀(#120, 2026-10-12 결정 2·3).

모델은 근거 조각을 고르기만 하고, 문장은 코드가 확인한 경로·이름·파일 상태만 넣어 만든다.
틀에는 숫자가 없으므로 설명의 숫자는 확인한 경로·이름 안에만 있다(CatchU가 센 활동량은 들어가지 않는다).
틀은 이름이 줄에 "포함"됐다고만 말한다. 함수 신설·호출·성능 개선 같은 효과·동기·행위, 다른 사람의
기여나 작업 범위 전체를 말하지 않는다. 조사가 받침에 따라 바뀌지 않도록 「이름이」·「파일이」처럼 고정된
말 뒤에 조사를 붙인다. 백틱은 화면에 글자 그대로 보이므로 쓰지 않는다.

생각해 볼 질문은 틀을 쓰지 않고 AI가 직접 쓴다(#487, 2026-11-08 팀장 결정, `response.questions`).
"""

from app.generation.response import Fragment, LineRef

# GitHub 파일 상태 → 설명 문장의 동사. 이 밖의 상태(changed·copied·unchanged 등)는 문장을 만들지 않는다.
_FILE_DONE = {
    "added": "추가되었습니다",
    "removed": "삭제되었습니다",
    "modified": "수정되었습니다",
}


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
