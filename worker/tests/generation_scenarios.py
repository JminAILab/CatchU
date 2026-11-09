"""생성 시험(#120)용 합성 제공자와 실행 도구.

합성 제공자는 SDK·API 키·네트워크 없이 받은 요청을 기록하고, 정해 둔 응답·예외·늦은 응답을 돌려준다.
정상 응답은 받은 자료를 읽어 고를 수 있는 줄과 그 줄의 식별자를 고르는 단순한 "모델"이다. 실제 모델의
품질이나 안전성을 대신하지 않는다.

실행 도구는 후보 판정 사례 도구(`candidate_scenarios.run_case`)로 수집 → 후보 판정을 돌리고, 그 결과에
생성(`run_generation`)을 붙여 결과 조합 → 메시지 스키마 v1 검사까지 한 번에 확인한다. 생성 전·후 후보를
workIdentity로 짝지어, 생성 칸과 근거 한계 끝에 붙인 고정 문구 말고는 그대로인지도 매번 본다.

기대값은 #120 본문·완료 기준과 2026-10-12 결정 댓글에서 정한다. 생성 코드를 읽어 맞추지 않는다.
"""

import json
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import timedelta
from typing import Any

from candidate_scenarios import FINISHED_AT, LIVE, CaseRun, Scenario, run_case
from github_synthetic import FakeClock

from app.contract import Verdict, check_message
from app.generation import (
    PROPOSED_GENERATION_LIMITS,
    GenerationLimits,
    GenerationRun,
    ProviderRequest,
    run_generation,
)
from app.generation.judged import CatchTrace
from app.judgement.provider import JudgementProvider
from app.processing import CheckedRequest, GenerationOutput, compose_result
from app.processing.generation import EligibleCandidate
from app.redact import mask_text

# 생성 몫의 기본 마감(합성 시계 기준). 호출 수·시간 한도 시험은 따로 정한다.
DEFAULT_DEADLINE = timedelta(minutes=20)
# #120이 근거 한계 끝에 붙이는 고정 문구(결정 5·6). 기대값이라 생성 코드에서 가져오지 않는다.
SIZE_PARTIAL = (
    "이 커밋의 변경 내용 일부는 생성 입력 크기 제한으로 생성 모델에 보내지 않았다"
)
SIZE_FULL = "이 커밋의 변경 내용은 생성 입력 크기 제한으로 생성 모델에 보내지 않았다"
TRUNCATED = "이 커밋의 변경 파일 가운데 받은 변경 내용이 온전하지 않은 파일은 생성에 쓰지 않았다"
GENERATION_LIMITS = (SIZE_PARTIAL, SIZE_FULL, TRUNCATED)
# #118이 본인 커밋 근거에 쓰는 귀속 범위의 앞부분(candidate-text.md 「근거의 귀속 범위」).
OWN_COMMIT_SCOPE = "연동 계정이 작성자로 기록된 커밋"
# 회원·수신자에게 나가는 생성 글에 없어야 하는 효과·동기·행위·전체성 표현(결정 2·3 거부 예).
FORBIDDEN_WORDS = (
    "성능",
    "개선",
    "설계",
    "예방",
    "직접",
    "전체",
    "모든",
    "호출하도록",
    "함수를 만",
    "새 함수",
    "협업",
    "함께",
)
_IDENTIFIER = re.compile(r"(?<![A-Za-z0-9_$])[A-Za-z_$][A-Za-z0-9_$]*(?![A-Za-z0-9_$])")

Reply = str | BaseException | Callable[[ProviderRequest], "str | BaseException"]


@dataclass(frozen=True)
class Late:
    """시간이 지난 뒤에 돌아오는 응답. 합성 시계를 seconds만큼 움직인다."""

    reply: Reply
    seconds: float


class ScriptedProvider:
    """받은 요청을 기록하고 응답을 차례로 돌려준다. 하나만 주면 매번 같은 응답이다.

    응답 차례가 다 떨어졌는데 또 부르면 시험 실패다(다시 부르지 않아야 할 때 재호출을 잡는다).
    """

    def __init__(
        self,
        *replies: Reply | Late,
        clock: FakeClock | None = None,
        repeat: bool | None = None,
    ) -> None:
        self._replies = list(replies)
        self._repeat = len(replies) == 1 if repeat is None else repeat
        self._clock = clock
        self.requests: list[ProviderRequest] = []

    def complete(self, request: ProviderRequest) -> str:
        self.requests.append(request)
        if not self._replies:
            raise AssertionError("정해 둔 응답보다 많이 불렀다")
        reply = self._replies[0] if self._repeat else self._replies.pop(0)
        if isinstance(reply, Late):
            if self._clock is None:
                raise AssertionError("늦은 응답에는 합성 시계가 필요하다")
            self._clock.advance(reply.seconds)
            reply = reply.reply
        if callable(reply) and not isinstance(reply, BaseException):
            reply = reply(request)
        if isinstance(reply, BaseException):
            raise reply
        return reply

    def generate_requests(self) -> list[ProviderRequest]:
        return [each for each in self.requests if each.purpose == "GENERATE"]

    def rewrite_requests(self) -> list[ProviderRequest]:
        return [each for each in self.requests if each.purpose == "REWRITE_TITLE"]


# 받은 자료 읽기


@dataclass(frozen=True)
class SentLine:
    id: str
    file_id: str
    path: str
    status: str
    change: str
    text: str
    selectable: bool


def sent_files(request: ProviderRequest) -> dict[str, dict[str, Any]]:
    """보낸 파일 id → 파일 항목(id·path·status·previousPath). 생성·고쳐 쓰기 자료 모두."""
    data = json.loads(request.data)
    if "commits" in data:
        files = [file for commit in data["commits"] for file in commit["files"]]
    else:
        files = data["files"]
    return {file["id"]: file for file in files}


def sent_lines(request: ProviderRequest) -> list[SentLine]:
    data = json.loads(request.data)
    files = sent_files(request)
    if "commits" in data:
        raw = [
            line
            for commit in data["commits"]
            for file in commit["files"]
            for line in file["lines"]
        ]
    else:
        raw = data["lines"]
    found: list[SentLine] = []
    for line in raw:
        file_id = line["id"].split(":")[0]
        file = files[file_id]
        found.append(
            SentLine(
                id=line["id"],
                file_id=file_id,
                path=file["path"],
                status=file["status"],
                change=line["change"],
                text=line["text"],
                selectable=line.get("selectable", True),
            )
        )
    return found


def identifiers(text: str) -> list[str]:
    return [
        found
        for found in _IDENTIFIER.findall(text)
        if any(char.isalpha() for char in found)
    ]


def pick(
    request: ProviderRequest,
    *,
    change: str | None = None,
    contains: str | None = None,
    path: str | None = None,
) -> SentLine:
    """고를 수 있는 보낸 줄 가운데 조건에 맞는 첫 줄."""
    for line in sent_lines(request):
        if not line.selectable:
            continue
        if change is not None and line.change != change:
            continue
        if contains is not None and contains not in identifiers(line.text):
            continue
        if path is not None and line.path != path:
            continue
        return line
    raise AssertionError("조건에 맞는 보낸 줄이 없다")


def file_id_of(request: ProviderRequest, path: str) -> str:
    for file_id, file in sent_files(request).items():
        if file["path"] == path:
            return file_id
    raise AssertionError(f"보낸 파일에 {path}가 없다")


# 응답 만들기


def line_fragment(line: SentLine, name: str, kind: str | None = None) -> dict[str, str]:
    if kind is None:
        kind = "ADDED_LINE_WITH" if line.change == "added" else "REMOVED_LINE_WITH"
    return {"kind": kind, "line": line.id, "name": name}


def file_fragment(file_id: str) -> dict[str, str]:
    return {"kind": "FILE_STATUS", "file": file_id}


def code_title(line: SentLine | str, name: str) -> dict[str, str]:
    line_id = line if isinstance(line, str) else line.id
    return {"target": "CODE_NAME", "line": line_id, "name": name}


def file_title(file_id: str) -> dict[str, str]:
    return {"target": "FILE_NAME", "file": file_id}


# AI가 쓴 질문의 합성 글(#487). 줄·파일을 가리키지 않고 작업 전체를 묻는다.
QUESTION_TEXTS = {
    "BACKGROUND": "이 작업을 하게 된 배경은 무엇이었나요?",
    "ALTERNATIVES": "이 작업에서 다른 방법도 고려했다면 무엇이었나요?",
    "VERIFICATION": "이 작업이 의도대로 동작하는지 확인했다면 어떻게 확인했나요?",
}


def question(kind: str, text: str | None = None) -> dict[str, str]:
    """생성 응답의 질문 하나. 글을 주지 않으면 종류의 합성 글을 쓴다."""
    return {"type": kind, "text": QUESTION_TEXTS[kind] if text is None else text}


_UNSET: Any = object()


def answer(
    *,
    fragments: Any = _UNSET,
    title: Any = _UNSET,
    questions: Any = _UNSET,
    **extra: Any,
) -> str:
    """응답 JSON. 주지 않은 칸은 응답에 넣지 않는다."""
    value: dict[str, Any] = {}
    if fragments is not _UNSET:
        value["fragments"] = fragments
    if title is not _UNSET:
        value["title"] = title
    if questions is not _UNSET:
        value["questions"] = questions
    value.update(extra)
    return json.dumps(value, ensure_ascii=False)


def naive(request: ProviderRequest) -> str:
    """정상 합성 모델: 고를 수 있는 첫 추가 줄(없으면 첫 삭제 줄)의 첫 식별자로 조각·제목·질문 하나씩."""
    if request.purpose == "REWRITE_TITLE":
        line = _first_named(request)
        return answer(title=code_title(line, identifiers(line.text)[0]))
    line = _first_named(request)
    name = identifiers(line.text)[0]
    return answer(
        fragments=[line_fragment(line, name)],
        title=code_title(line, name),
        questions=[question("BACKGROUND")],
    )


def written(text: str, *lines: SentLine | str) -> dict[str, Any]:
    """AI 쪽 응답의 제목 후보·설명 문장 하나(CR3 BR3.1·BR5.1)."""
    return {
        "text": text,
        "lines": [line if isinstance(line, str) else line.id for line in lines],
    }


def ai_answer(
    *,
    titles: Any = _UNSET,
    sentences: Any = _UNSET,
    title: Any = _UNSET,
    questions: Any = _UNSET,
    **extra: Any,
) -> str:
    """AI 쪽 응답 JSON. 주지 않은 칸은 넣지 않는다."""
    value: dict[str, Any] = {}
    if titles is not _UNSET:
        value["titleCandidates"] = titles
    if sentences is not _UNSET:
        value["sentences"] = sentences
    if title is not _UNSET:
        value["title"] = title
    if questions is not _UNSET:
        value["questions"] = questions
    value.update(extra)
    return json.dumps(value, ensure_ascii=False)


def naive_ai(request: ProviderRequest) -> str:
    """AI 쪽 정상 합성 모델: 고를 수 있는 첫 이름 줄로 제목 후보 하나·설명 문장 하나·조각 제목·질문 하나.

    후보와 문장은 그 줄의 이름·경로만 써서 기계 대조를 통과한다."""
    assert request.ai_side, "AI 쪽 생성 요청이 아니다"
    line = _first_named(request)
    name = identifiers(line.text)[0]
    return ai_answer(
        titles=[written(f"{name} 값 변경", line)],
        sentences=[written(f"{line.path}에서 {name} 줄을 바꿨습니다.", line)],
        title=code_title(line, name),
        questions=[question("BACKGROUND")],
    )


def _first_named(request: ProviderRequest) -> SentLine:
    lines = [line for line in sent_lines(request) if line.selectable]
    for change in ("added", "removed"):
        for line in lines:
            if line.change == change and identifiers(line.text):
                return line
    raise AssertionError("이름이 든 고를 수 있는 줄이 없다")


# 실행


@dataclass(frozen=True)
class GenerationCase:
    before: CaseRun
    run: GenerationRun
    result: dict[str, Any]
    provider: ScriptedProvider
    clock: FakeClock = field(default_factory=FakeClock)

    @property
    def output(self) -> GenerationOutput:
        return self.run.output


def generation_case(
    scenario: Scenario,
    provider: ScriptedProvider,
    *,
    request: CheckedRequest = LIVE,
    limits: GenerationLimits = PROPOSED_GENERATION_LIMITS,
    clock: FakeClock | None = None,
    deadline: timedelta = DEFAULT_DEADLINE,
    judge: JudgementProvider | None = None,
    observe: Callable[[CatchTrace], None] | None = None,
) -> GenerationCase:
    """수집 → 후보 판정 → 생성 → 결과 조합. 결과는 메시지 계약 v1을 통과하고 후보 내용은 보존된다.

    judge를 주면 AI 쪽이 켜진다(CR3). 그때는 작업 사실 둘째 줄을 지우는 것만 더 허용하고, 설명·제목은 AI가 쓴
    글이라 틀 문장 검사 대신 AI 쪽 검사(`assert_ai_text`)를 한다.
    """
    before = run_case(scenario, request=request)
    clock = clock or FakeClock()
    run = run_generation(
        before.request,
        before.outcome,
        before.output,
        provider=provider,
        clock=clock,
        deadline=clock() + deadline,
        limits=limits,
        judge=judge,
        observe=observe,
    )
    result = compose_result(
        before.request, run.output, finished_at=FINISHED_AT, id_label="case"
    )
    checked = check_message("Result", result)
    assert checked.verdict is Verdict.VALID, checked.errors
    assert_preserved(before.output, run.output, ai_side=judge is not None)
    if judge is None:
        assert_generated_text(run.output)
    else:
        assert_ai_text(before.output, run.output)
    return GenerationCase(before, run, result, provider, clock)


def assert_preserved(
    before: GenerationOutput, after: GenerationOutput, *, ai_side: bool = False
) -> None:
    """생성은 후보의 생성 칸(title·draft·reflection)과, 본인 커밋 근거의 한계 끝 고정 문구만 바꾼다.

    후보 순서·작업 사실·기여·묶음 설명·근거의 주소·판본·관측 사실·귀속 범위·기존 한계와 그 순서,
    미제공 집계, 기존 실패는 그대로다. 실패는 끝에 요청 단위 ANALYSIS 1건만 더해질 수 있다.
    AI 쪽이 켜졌으면 작업 사실의 둘째 항목을 위치로 지운 것만 더 허용한다(CR3 BR4.1·BR4.2).
    """
    assert [each.work_identity for each in after.candidates] == [
        each.work_identity for each in before.candidates
    ]
    for old, new in zip(before.candidates, after.candidates, strict=True):
        evidence = []
        for old_item, new_item in zip(old.evidence, new.evidence, strict=True):
            kept = new_item.coverage_limits[: len(old_item.coverage_limits)]
            added = new_item.coverage_limits[len(old_item.coverage_limits) :]
            assert kept == old_item.coverage_limits
            assert all(limit in GENERATION_LIMITS for limit in added), added
            assert len(set(added)) == len(added)
            assert not (SIZE_PARTIAL in added and SIZE_FULL in added)
            if added:
                # 본인 커밋 근거에만 붙는다. 저장소 이름이 commit이면 PR 주소에도 /commit/이 들어가므로
                # 주소 끝과 귀속 범위를 함께 본다.
                assert new_item.source_url.endswith(
                    f"/commit/{new_item.source_revision}"
                )
                assert new_item.contribution_scope.startswith(OWN_COMMIT_SCOPE)
            evidence.append(replace(new_item, coverage_limits=kept))
        if new.work_facts != old.work_facts:
            assert ai_side, "AI 쪽이 꺼졌는데 작업 사실이 바뀌었다"
            assert new.work_facts == (old.work_facts[0], *old.work_facts[2:])
        restored = replace(
            new,
            title=old.title,
            work_facts=old.work_facts,
            draft=old.draft,
            reflection=old.reflection,
            evidence=tuple(evidence),
        )
        assert restored == old
    assert after.not_provided == before.not_provided
    assert after.failures[: len(before.failures)] == before.failures
    extra = after.failures[len(before.failures) :]
    assert len(extra) <= 1
    for failure in extra:
        assert failure.stage == "ANALYSIS"


_TITLE = re.compile(r"\S+ (시험|문서|설정|코드) (추가|삭제|수정|이름 변경)")
_SENTENCE = re.compile(
    r"(?P<path>[^ ]+)에서 (?P<name>[A-Za-z_$][A-Za-z0-9_$]*) 이름이 포함된 줄이 (추가|삭제)되었습니다\."
    r"|(?P<file>[^ ]+) 파일이 (추가|삭제|수정)되었습니다\."
    r"|(?P<old>[^ ]+) 파일의 이름이 바뀌어 (?P<new>[^ ]+) 파일이 되었습니다\."
)


def assert_written_questions(candidate: EligibleCandidate) -> None:
    """질문은 AI가 쓴 글이다(#487): 150자 이하 한 줄이고 가리기 검사에 걸리지 않는다. 틀·판정은 없다."""
    for text in candidate.reflection.questions:
        assert text and text == text.strip(), text
        assert len(text) <= 150, text
        assert "\n" not in text and "\r" not in text, text
        assert mask_text(text).count == 0, text


def assert_generated_text(output: GenerationOutput) -> None:
    """설명·제목은 정해 둔 틀로만 이루어지고, 틀 밖에 숫자·효과·동기·전체성 표현이 없다. 질문은 AI가 쓴 글이라
    틀 대신 글자 상한·가리기 검사만 본다(#487).

    설명에 든 숫자는 확인한 경로·이름 안에만 있다(CatchU가 센 활동량은 들어가지 않는다). 쓸 만한 기록의
    글이 있는 후보는 그 글이 그대로 제목이다(CR1 BR3.1). 기록의 글 제목에는 40자 상한과 조각 틀을 대지
    않는다(BR3.3). 그 밖의 제목은 조각 제목 틀이다.
    """
    for candidate in output.candidates:
        record = candidate.record_text
        if record is not None and record.usable:
            assert candidate.title == record.text, candidate.title
        elif candidate.title is not None:
            assert len(candidate.title) <= 40
            assert _TITLE.fullmatch(candidate.title), candidate.title
        content = candidate.draft.content
        if content is not None:
            rebuilt = _split_sentences(content)
            assert rebuilt, content
            for sentence in rebuilt:
                match = _SENTENCE.fullmatch(sentence)
                assert match, sentence
                outside = sentence
                for group in ("path", "name", "file", "old", "new"):
                    value = match.group(group)
                    if value:
                        outside = outside.replace(value, "")
                assert not re.search(r"[0-9]", outside), sentence
        assert_written_questions(candidate)
        generated_title = (
            "" if record is not None and record.usable else candidate.title or ""
        )
        for text in (generated_title, content or ""):
            assert "`" not in text
            for word in FORBIDDEN_WORDS:
                stripped = re.sub(r"[^ ]+(에서|파일)", "", text)
                assert word not in stripped, text


def assert_ai_text(before: GenerationOutput, after: GenerationOutput) -> None:
    """AI 쪽이 켜진 결과: 질문은 AI가 쓴 글(꺼졌을 때와 같은 검사), 제목은 40자 이하이거나 기록의 글이다. 작업 사실에는 생성
    출력의 글이 없다(작업 사실은 생성 전 후보의 것에서 둘째 줄만 빠질 수 있다, BR4.2)."""
    previous = {each.work_identity: each for each in before.candidates}
    for candidate in after.candidates:
        old = previous[candidate.work_identity]
        assert set(candidate.work_facts) <= set(old.work_facts)
        record = candidate.record_text
        if candidate.title is not None and not (
            record is not None and candidate.title == record.text
        ):
            assert len(candidate.title) <= 40, candidate.title
        assert_written_questions(candidate)


def _split_sentences(content: str) -> list[str]:
    """「…다.」로 끝나는 문장으로 나눈다(경로·이름에는 공백이 없는 합성 자료를 쓴다)."""
    return [part for part in re.split(r"(?<=다\.) ", content) if part]


def assert_nowhere(
    secret: str,
    *,
    provider: ScriptedProvider,
    result: Mapping[str, Any],
    logs: Sequence[str] = (),
) -> None:
    """가린 값이 제공자 입력·결과(실패 문구 포함)·로그 어디에도 없다."""
    for request in provider.requests:
        assert secret not in request.data
        assert secret not in request.instructions
    assert secret not in json.dumps(result, ensure_ascii=False)
    for line in logs:
        assert secret not in line
