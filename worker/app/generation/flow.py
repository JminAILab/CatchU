"""생성 흐름(#120): 후보 판정 결과(#118)의 후보마다 설명 초안·생각해볼 질문·제목을 채운다.

입구는 `run_generation`이다. 후보 순서·근거·미제공 집계·기존 실패는 그대로 두고, 후보의 생성 칸(draft·
reflection·title)과 본인 커밋 근거의 한계 끝 문구(결정 5·6)만 바꾼다. 처리 순서에 잇는 것은 #121의 LIVE
조립(`app.processing.live`)이다.

후보 하나의 처리(2026-10-12 결정 4·7·8·9·13 및 #120 본문 「응답과 실패 판정」):
1. 재료 준비: 재료 커밋의 파일마다 patch 온전성 확인과 가리기(request.prepare).
2. 고를 수 있는 줄이 없으면(원인 무관) 부르지 않는다: 설명·질문 NOT_GENERATED, 제목 None, 새 실패 없음.
3. 호출 수나 남은 시간이 모자라 새 생성 호출을 시작할 수 없으면 같은 상태로 두고, 요청에 ANALYSIS 실패
   1건을 더한다(그런 후보가 몇이든 1건).
4. 크기 선별. 선별 뒤 고를 수 있는 줄이 없으면 2와 같이 끝내고 크기 전체 문구를 붙인다.
5. 생성 호출 1회. 호출 오류·시간 초과·늦은 응답·전체를 읽을 수 없는 응답은 설명·질문 모두 FAILED(DRAFT·
   REFLECTION 실패 각 1건, 같은 호출의 ANALYSIS는 없음), 제목 None.
6. 설명·질문·제목은 각자 판정한다. 설명이 실패해도 확인된 질문·제목은 둔다. 설명·질문은 맞는 항목만 쓰고
   틀린 항목은 버린다(response 모듈 설명, 2026-10-19 팀장 결정).
모든 후보의 생성·미생성 판정이 끝난 뒤, 남은 시간 안에서 형식을 어긴 제목만 고쳐 쓴다(결정 15).

제목 우선순위(CR1 BR3.1~BR3.3): 후보 자료의 기록의 글 칸(record_text)이 있고 부실이 아니면 그 글이
제목이다. 생성 호출이 성공했든 실패했든 건너뛰었든 같다. 이때는 조각 제목을 고쳐 쓰는 호출을 하지 않고,
40자 상한도 쓰지 않는다. 기록의 글은 다시 계산하지 않고 생성 요청에도 넣지 않는다. 아니면 조각 제목,
그것도 없으면 null이다. 운영 로그의 「제목만 없음」(titleOnlyNull)은 최종 제목이 없는 후보만 센다.
제공자 오류·시간 초과는 후보마다 결과로 바꾸고 다시 부르지 않는다. 그 밖의 예외(결함, 요청 전체의
ExecutionUnknown)는 그대로 올린다.

AI 쪽(CR3, 판정 공급자를 넘겼을 때): 후보마다 (큰 후보면) 재료 판정 → AI 지시문으로 생성 → Catch 판정을
차례로 하고(`_generate_one_ai`), 판정 답으로 제목·설명·작업 사실 둘째 줄을 정한다(`_apply_judgement`,
`judged.py`). 고쳐 쓰기는 부르지 않는다. 규칙은 worker/docs/generation-judgement.md에 있다. 판정 공급자를
넘기지 않으면 위 경로 그대로이고 판정 호출은 0번이다.
"""

import logging
from collections import Counter
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Literal

from app.collection.collect import CollectionOutcome
from app.generation import render
from app.generation.judged import (
    CatchTrace,
    Checked,
    RecordVerdict,
    TitleSource,
    ai_title,
    answer_values,
    catch_ask,
    choose_title,
    factchecked,
    kept_sentences,
    material_ask,
    record_verdict,
    remove_record_fact,
)
from app.generation.limits import (
    PROPOSED_GENERATION_LIMITS,
    CallBudget,
    Clock,
    GenerationLimits,
)
from app.generation.material import gather
from app.generation.outcome import (
    BUDGET_MESSAGE,
    SIZE_FULL,
    SIZE_PARTIAL,
    TRUNCATED,
    GenerationFailureCode,
    failed_draft,
    failed_reflection,
)
from app.generation.provider import (
    GenerationProvider,
    ProviderError,
    ProviderRequest,
    UnusableResponse,
)
from app.generation.request import (
    GENERATE_AI_INSTRUCTIONS,
    GENERATE_INSTRUCTIONS,
    REWRITE_INSTRUCTIONS,
    REWRITE_RULES,
    PreparedCandidate,
    Selection,
    instruction_bytes,
    is_large,
    mask_book,
    prepare,
    rewrite_data,
    select,
)
from app.generation.response import (
    AI_TOP_LEVEL_KEYS,
    TOP_LEVEL_KEYS,
    Fragment,
    Question,
    Sent,
    SentenceMiss,
    TitleProblem,
    Unreadable,
    ai_parts,
    fragments,
    questions,
    read,
    title_choice,
    unknown_keys,
)
from app.generation.title import decide
from app.judgement.answers import Answers, ask
from app.judgement.provider import JudgementProvider
from app.judgement.questions import (
    TITLE_THRESHOLD,
    CatchAsk,
    MaterialVerdict,
    material_verdicts,
)
from app.processing.generation import (
    DraftOutcome,
    EligibleCandidate,
    GenerationOutput,
    ReflectionOutcome,
    StageFailure,
)
from app.processing.request_check import CheckedRequest

logger = logging.getLogger(__name__)

RewriteProblem = TitleProblem | Literal["TOO_LONG"]
_PART_CODES = {
    "RULE_VIOLATION": GenerationFailureCode.RULE_VIOLATION,
    "UNVERIFIED": GenerationFailureCode.UNVERIFIED,
}


@dataclass
class GenerationReport:
    """운영 로그에 남기는 건수. 값·경로·이름·원문은 담지 않는다."""

    candidates: int = 0
    generation_calls: int = 0
    rewrite_calls: int = 0
    no_material: int = 0
    budget_skipped: int = 0
    whole_failures: int = 0
    draft_generated: int = 0
    draft_failed: int = 0
    reflection_failed: int = 0
    # 설명은 생성됐는데 제목만 null인 후보(#122 검수용).
    title_only_null: int = 0
    titles_rewritten: int = 0
    masked_values: int = 0
    secret_files: int = 0
    # 가리기(가린 줄·비밀 파일) 뒤 고를 수 있는 줄이 0개가 된 후보.
    masked_to_empty: int = 0
    size_limited_commits: int = 0
    truncated_commits: int = 0
    unknown_response_keys: int = 0
    # 실패 원인별 건수(원인 코드 → 건수). 전체 호출 실패는 실패 코드, 설명·질문 실패는 부분이 실패한 첫
    # 원인(response.PartReason)으로 센다. 설명 실패 수 = 전체 호출 실패 수 + 설명 원인 건수의 합이다.
    whole_reasons: Counter[str] = field(default_factory=Counter)
    draft_reasons: Counter[str] = field(default_factory=Counter)
    reflection_reasons: Counter[str] = field(default_factory=Counter)
    # 버리거나 고친 항목 건수(response.PartVerdict.notes → 건수)와, 틀린 항목을 버리고도 살아남은 부분 수.
    # 부분이 실패했어도 그 부분에서 버린 항목은 센다.
    draft_notes: Counter[str] = field(default_factory=Counter)
    reflection_notes: Counter[str] = field(default_factory=Counter)
    draft_salvaged: int = 0
    reflection_salvaged: int = 0
    # AI 쪽(CR3 NFR2.6·NFR3.2). 켜짐 여부와 판정 공급자 이름(키 값 아님), 판정·결과 건수만 센다.
    ai_side: bool = False
    judgement_provider: str = "-"
    catch_judgements: int = 0
    material_judgements: int = 0
    # 판정 실패 코드 → 건수. 재료 판정 실패는 실패 항목을 남기지 않고 여기에만 센다.
    catch_judgement_reasons: Counter[str] = field(default_factory=Counter)
    material_judgement_reasons: Counter[str] = field(default_factory=Counter)
    # 생성은 됐지만 시간·Catch 판정 상한으로 판정하지 않은 Catch, 시간·상한으로 재료 판정을 건너뛴 큰 후보.
    judgement_skipped: int = 0
    material_skipped: int = 0
    factcheck_dropped_titles: int = 0
    factcheck_dropped_sentences: int = 0
    below_threshold_titles: int = 0
    below_threshold_sentences: int = 0
    second_lines_removed: int = 0
    title_sources: Counter[str] = field(default_factory=Counter)
    # AI 쪽 응답에서 모양·근거 줄·글자 수로 버린 제목 후보·문장(원인 → 건수).
    ai_notes: Counter[str] = field(default_factory=Counter)


@dataclass(frozen=True)
class GenerationRun:
    output: GenerationOutput
    report: GenerationReport


JudgementState = Literal["SKIPPED", "FAILED", "ANSWERED", "NO_QUESTIONS"]


@dataclass
class _Judged:
    """AI 쪽 생성 응답을 받은 후보의 판정 경과. 생성 응답이 없으면 만들지 않는다(「판정 없음」)."""

    titles: tuple[Checked, ...]
    sentences: tuple[Checked, ...]
    state: JudgementState = "NO_QUESTIONS"
    ask: CatchAsk | None = None
    answers: Answers | None = None
    failure: GenerationFailureCode | None = None


@dataclass
class _Result:
    draft: DraftOutcome = field(default_factory=DraftOutcome.not_generated)
    reflection: ReflectionOutcome = field(
        default_factory=ReflectionOutcome.not_generated
    )
    title: str | None = None
    title_problem: RewriteProblem | None = None
    # 크기 선별을 거쳤으면 그 결과(호출했는지와 무관). 크기 문구와 고쳐 쓰기 입력에 쓴다.
    selection: Selection | None = None
    called: bool = False
    budget_skipped: bool = False
    # AI 쪽(CR3): 판정 경과와, 생성 뒤 시간·상한으로 판정을 보내지 못했는지, 재료 판정 경과.
    judged: _Judged | None = None
    judgement_skipped: bool = False
    material_judged: bool = False
    material_seconds: float | None = None


def run_generation(
    request: CheckedRequest,
    outcome: CollectionOutcome,
    built: GenerationOutput,
    *,
    provider: GenerationProvider,
    clock: Clock,
    deadline: datetime,
    limits: GenerationLimits = PROPOSED_GENERATION_LIMITS,
    judge: JudgementProvider | None = None,
    observe: Callable[[CatchTrace], None] | None = None,
) -> GenerationRun:
    """built는 같은 요청·수집 결과로 만든 `build_candidates(request, outcome)`의 결과다.

    deadline은 생성 몫이 끝나야 할 시각이다(요청 전체 마감에서 결과 조합·전송 여유를 뺀 값). 큐 소비자는
    꺼낸 시각 + 60분 − 60초를 넘긴다(#424).

    judge는 판정 공급자(CR3)다. 주면 AI 쪽이 켜진다: 후보마다 차례로 (큰 후보면) 재료 판정 → 생성 → Catch 판정을
    하고 다음 후보로 간다(비기능 설계 Q1 A). 제목 고쳐 쓰기는 부르지 않는다. 주지 않으면 지금 경로 그대로이고
    판정 호출은 0번이다(BR1.3). observe는 FR10 확인 명령만 넘긴다(Catch마다 판정 경과, 원문 포함).
    """
    report = GenerationReport(
        ai_side=judge is not None,
        judgement_provider="-" if judge is None else judge.name,
    )
    materials = gather(request, outcome, built)
    report.candidates = len(materials)
    instructions = GENERATE_INSTRUCTIONS if judge is None else GENERATE_AI_INSTRUCTIONS
    data_budget = min(
        limits.max_data_bytes,
        limits.max_prompt_bytes - instruction_bytes(instructions),
    )
    if materials and data_budget <= 0:
        raise ValueError("지시문만으로 전체 입력 상한을 넘는다")
    budget = CallBudget(limits, clock, deadline)
    book = mask_book(materials)
    prepared = [prepare(material, book) for material in materials]
    order = sorted(prepared, key=lambda item: item.material.priority())
    results: dict[int, _Result] = {}
    for item in order:
        if judge is None:
            results[item.material.position] = _generate_one(
                item, provider, budget, clock, limits, data_budget, report
            )
        else:
            results[item.material.position] = _generate_one_ai(
                item,
                _Calls(provider, judge, budget, clock, limits),
                data_budget,
                report,
            )
    if judge is None:
        for item in order:
            _rewrite_title(
                item,
                results[item.material.position],
                provider,
                budget,
                clock,
                limits,
                report,
            )
    candidates = tuple(
        _apply(
            item, results[item.material.position], report, judge is not None, observe
        )
        for item in prepared
    )
    failures = built.failures
    if any(
        result.budget_skipped or result.judgement_skipped for result in results.values()
    ):
        failures = (
            *failures,
            StageFailure(
                "ANALYSIS", GenerationFailureCode.BUDGET_EXHAUSTED.value, BUDGET_MESSAGE
            ),
        )
    report.generation_calls = budget.generation_calls
    report.rewrite_calls = budget.rewrite_calls
    report.catch_judgements = budget.catch_judgement_calls
    report.material_judgements = budget.material_judgement_calls
    _log(request, report)
    return GenerationRun(
        replace(built, candidates=candidates, failures=failures),
        report,
    )


def _generate_one(
    item: PreparedCandidate,
    provider: GenerationProvider,
    budget: CallBudget,
    clock: Clock,
    limits: GenerationLimits,
    data_budget: int,
    report: GenerationReport,
) -> _Result:
    report.masked_values += item.masked_values
    report.secret_files += item.secret_files
    if item.selectable == 0:
        report.no_material += 1
        if item.files or item.secret_files:
            report.masked_to_empty += 1
        return _Result()
    if not budget.can_generate():
        report.budget_skipped += 1
        return _Result(budget_skipped=True)
    selection = select(item, limits, data_budget)
    if selection.selectable == 0:
        report.no_material += 1
        return _Result(selection=selection)
    if not budget.can_generate():
        # 선별하는 동안 시간이 지나 호출 시간 제한만큼 남지 않았다. 부르지 못한 후보이므로 크기 문구는 없다.
        report.budget_skipped += 1
        return _Result(budget_skipped=True)
    budget.generation_calls += 1
    timeout = limits.generation_timeout_seconds
    call = ProviderRequest(
        purpose="GENERATE",
        instructions=GENERATE_INSTRUCTIONS,
        data=selection.data,
        timeout_seconds=timeout,
        max_output_bytes=limits.max_output_bytes,
    )
    code, response = _call_and_read(provider, call, clock, limits)
    if response is None:
        assert code is not None
        report.whole_failures += 1
        report.whole_reasons[code.value] += 1
        return _Result(
            draft=failed_draft(code),
            reflection=failed_reflection(code),
            selection=selection,
            called=True,
        )
    report.unknown_response_keys += unknown_keys(response, TOP_LEVEL_KEYS)
    sent = Sent(selection.lines, selection.files)
    result = _Result(selection=selection, called=True)
    result.draft = _draft(response, sent, limits, report)
    result.reflection = _reflection(response, sent, limits, report)
    choice = title_choice(response.get("title"), sent, max_name=limits.max_name_chars)
    if choice.problem is not None:
        result.title_problem = choice.problem
    elif choice.ref is not None:
        text = decide(choice.ref, item)
        if text is not None and len(text) > limits.max_title_chars:
            result.title_problem = "TOO_LONG"
        else:
            result.title = text
    return result


@dataclass(frozen=True)
class _Calls:
    """AI 쪽 후보 하나가 쓰는 호출 부품."""

    provider: GenerationProvider
    judge: JudgementProvider
    budget: CallBudget
    clock: Clock
    limits: GenerationLimits


def _generate_one_ai(
    item: PreparedCandidate, calls: _Calls, data_budget: int, report: GenerationReport
) -> _Result:
    """AI 쪽 후보 하나: (큰 후보면) 재료 판정 → 생성 → Catch 판정(BR2.1·BR2.6·BR6.1, 비기능 설계 Q1 A).

    생성 응답이 없으면(재료 없음·생성 건너뜀·생성 호출 실패) 판정하지 않는다. 생성을 시작할 때는 Catch 판정 몫
    (20초)까지 남았는지 보고, 모자라면 지금 생성 건너뜀과 같이 다룬다. 어느 호출도 다시 부르지 않는다.
    """
    limits, budget = calls.limits, calls.budget
    report.masked_values += item.masked_values
    report.secret_files += item.secret_files
    if item.selectable == 0:
        report.no_material += 1
        if item.files or item.secret_files:
            report.masked_to_empty += 1
        return _Result()
    verdicts, material_seconds = _judge_material(item, calls, data_budget, report)
    reserve = limits.judgement_timeout_seconds

    def made(result: _Result) -> _Result:
        result.material_judged = verdicts is not None
        result.material_seconds = material_seconds
        return result

    if not budget.can_generate(reserve):
        report.budget_skipped += 1
        return made(_Result(budget_skipped=True))
    selection = select(item, limits, data_budget, verdicts)
    if selection.selectable == 0:
        report.no_material += 1
        return made(_Result(selection=selection))
    if not budget.can_generate(reserve):
        report.budget_skipped += 1
        return made(_Result(budget_skipped=True))
    budget.generation_calls += 1
    call = ProviderRequest(
        purpose="GENERATE",
        instructions=GENERATE_AI_INSTRUCTIONS,
        data=selection.data,
        timeout_seconds=limits.generation_timeout_seconds,
        max_output_bytes=limits.max_output_bytes,
        ai_side=True,
    )
    code, response = _call_and_read(calls.provider, call, calls.clock, limits)
    sent = Sent(selection.lines, selection.files)
    parts = (
        None
        if response is None
        else ai_parts(response, sent, max_title_chars=limits.max_title_chars)
    )
    if response is None or parts is None:
        # 문장 칸이 없거나 모양이 틀린 응답도 읽을 수 없는 응답이다(BR5.1). 판정하지 않는다(BR2.6).
        failed = code or GenerationFailureCode.RESPONSE_UNREADABLE
        report.whole_failures += 1
        report.whole_reasons[failed.value] += 1
        return made(
            _Result(
                draft=failed_draft(failed),
                reflection=failed_reflection(failed),
                selection=selection,
                called=True,
            )
        )
    report.unknown_response_keys += unknown_keys(response, AI_TOP_LEVEL_KEYS)
    result = made(_Result(selection=selection, called=True))
    result.reflection = _reflection(response, sent, limits, report)
    result.title = _fragment_title(response, sent, item, limits)
    report.ai_notes.update((*parts.titles.notes, *parts.sentences.notes))
    titles, sentences = factchecked(parts.titles), factchecked(parts.sentences)
    report.factcheck_dropped_titles += sum(not each.passed for each in titles)
    report.factcheck_dropped_sentences += sum(not each.passed for each in sentences)
    judged = _Judged(titles=titles, sentences=sentences)
    result.judged = judged
    judged.ask = catch_ask(
        item, selection, titles, sentences, limits.judgement_timeout_seconds
    )
    if judged.ask is None:
        return result
    if not budget.can_judge_catch():
        # 생성은 됐지만 판정할 시간·호출이 없다. 판정을 거치지 않은 글은 쓰지 않는다(BR2.6).
        report.judgement_skipped += 1
        result.judgement_skipped = True
        judged.state = "SKIPPED"
        return result
    budget.catch_judgement_calls += 1
    answered = ask(calls.judge, judged.ask.request, calls.clock)
    if isinstance(answered, str):
        judged.state = "FAILED"
        judged.failure = GenerationFailureCode(answered)
        report.catch_judgement_reasons[answered] += 1
    else:
        judged.state = "ANSWERED"
        judged.answers = answered
    return result


def _judge_material(
    item: PreparedCandidate, calls: _Calls, data_budget: int, report: GenerationReport
) -> tuple[Mapping[str, MaterialVerdict] | None, float | None]:
    """큰 후보의 재료 판정(BR6.1). 답이 없거나 실패하면 None이고 재료는 CR1 규칙 순서다(BR6.4).

    「남은 시간 ≥ 재료 판정 20 + 생성 45 + Catch 판정 20초」가 아니면 재료 판정 없이 넘어간다. 실패는 실패 항목을
    남기지 않고 운영 로그 건수에만 센다. 걸린 시간(초)은 FR10 확인표에만 쓴다.
    """
    if not is_large(item, calls.limits, data_budget):
        return None, None
    if not calls.budget.can_judge_material():
        report.material_skipped += 1
        return None, None
    built = material_ask(item, calls.limits.judgement_timeout_seconds)
    if built is None:
        return None, None
    calls.budget.material_judgement_calls += 1
    started = calls.clock()
    answered = ask(calls.judge, built.request, calls.clock)
    seconds = (calls.clock() - started).total_seconds()
    if isinstance(answered, str):
        report.material_judgement_reasons[answered] += 1
        return None, seconds
    return material_verdicts(built, answered), seconds


def _fragment_title(
    response: dict[str, object],
    sent: Sent,
    item: PreparedCandidate,
    limits: GenerationLimits,
) -> str | None:
    """조각 제목(지금의 대상·종류·동작). AI 쪽에서는 고쳐 쓰지 않아 형식 위반·40자 초과면 None이다(BR3.4의 4)."""
    choice = title_choice(response.get("title"), sent, max_name=limits.max_name_chars)
    if choice.problem is not None or choice.ref is None:
        return None
    text = decide(choice.ref, item)
    if text is None or len(text) > limits.max_title_chars:
        return None
    return text


def _call_and_read(
    provider: GenerationProvider,
    call: ProviderRequest,
    clock: Clock,
    limits: GenerationLimits,
) -> tuple[GenerationFailureCode | None, dict[str, object] | None]:
    """부르고 응답 전체를 읽는다. 읽지 못하면 (원인 코드, None)."""
    code, raw = _call(provider, call, clock)
    if raw is None:
        return code, None
    try:
        return None, read(raw, limits.max_output_bytes)
    except Unreadable as error:
        if error.reason == "TOO_LARGE":
            return GenerationFailureCode.RESPONSE_TOO_LARGE, None
        return GenerationFailureCode.RESPONSE_UNREADABLE, None


def _call(
    provider: GenerationProvider, call: ProviderRequest, clock: Clock
) -> tuple[GenerationFailureCode | None, str | None]:
    """제공자를 한 번 부른다. 다시 부르지 않는다. 시간 제한을 넘겨 끝난 호출은 쓸 수 없는 응답·호출 오류로
    끝났어도 시간 초과로 본다(제공자 경계: 시간 제한 안에 끝내지 못하면 시간 초과)."""
    started = clock()
    failed: GenerationFailureCode | None = None
    raw: str | None = None
    try:
        raw = provider.complete(call)
    except TimeoutError:
        return GenerationFailureCode.TIMEOUT, None
    except UnusableResponse as error:
        failed = (
            GenerationFailureCode.RESPONSE_TOO_LARGE
            if error.reason == "TOO_LARGE"
            else GenerationFailureCode.RESPONSE_UNREADABLE
        )
    except ProviderError:
        failed = GenerationFailureCode.CALL_FAILED
    if clock() - started > timedelta(seconds=call.timeout_seconds):
        return GenerationFailureCode.TIMEOUT, None
    if failed is not None:
        return failed, None
    return None, raw


def _draft(
    response: dict[str, object],
    sent: Sent,
    limits: GenerationLimits,
    report: GenerationReport,
) -> DraftOutcome:
    verdict = fragments(
        response,
        sent,
        low=limits.min_fragments,
        high=limits.max_fragments,
        max_name=limits.max_name_chars,
        sentence=_fragment_sentence,
    )
    report.draft_notes.update(verdict.notes)
    if verdict.problem is not None:
        assert verdict.reason is not None
        report.draft_reasons[verdict.reason] += 1
        return failed_draft(_PART_CODES[verdict.problem])
    if _salvaged(verdict.notes):
        report.draft_salvaged += 1
    text = render.description(verdict.items)
    assert text is not None  # 문장을 만들 수 있는 조각만 남았다
    return DraftOutcome.generated(text)


def _fragment_sentence(fragment: Fragment) -> SentenceMiss | None:
    return None if render.fragment_sentence(fragment) is not None else "NO_TEMPLATE"


def _reflection(
    response: dict[str, object],
    sent: Sent,
    limits: GenerationLimits,
    report: GenerationReport,
) -> ReflectionOutcome:
    def sentence(question: Question) -> SentenceMiss | None:
        return _question_miss(render.question(question, limits.max_question_chars))

    verdict = questions(
        response,
        sent,
        low=limits.min_questions,
        high=limits.max_questions,
        max_name=limits.max_name_chars,
        sentence=sentence,
    )
    report.reflection_notes.update(verdict.notes)
    if verdict.problem is not None:
        assert verdict.reason is not None
        report.reflection_reasons[verdict.reason] += 1
        return failed_reflection(_PART_CODES[verdict.problem])
    if _salvaged(verdict.notes):
        report.reflection_salvaged += 1
    return ReflectionOutcome.generated(
        tuple(
            render.question(item, limits.max_question_chars) for item in verdict.items
        )
    )


def _question_miss(text: str) -> SentenceMiss | None:
    if text == "UNSUPPORTED":
        return "NO_TEMPLATE"
    if text == "TOO_LONG":
        return "TOO_LONG"
    return None


def _salvaged(notes: tuple[str, ...]) -> bool:
    """틀린 항목을 버리고도 그 부분이 만들어졌는가. 상한 뒤 항목·종류를 고친 조각만 있으면 아니다."""
    return any(note.startswith("dropped:") for note in notes)


def _rewrite_title(
    item: PreparedCandidate,
    result: _Result,
    provider: GenerationProvider,
    budget: CallBudget,
    clock: Clock,
    limits: GenerationLimits,
    report: GenerationReport,
) -> None:
    """형식을 어긴 제목만 제목당 최대 N회 고친다. 호출 실패·확인 실패·한도·시간 부족이면 멈추고 None.

    쓸 만한 기록의 글이 제목인 후보는 조각 제목을 쓰지 않으므로 고쳐 쓰기를 부르지 않는다(BR3.3).
    """
    problem = result.title_problem
    result.title_problem = None
    if problem is None or result.selection is None:
        return
    if _record_title(item.material.candidate) is not None:
        return
    data, lines, files = rewrite_data(result.selection, limits)
    sent = Sent(lines, files)
    for _ in range(limits.max_rewrites_per_title):
        if not lines or not budget.can_rewrite():
            return
        budget.rewrite_calls += 1
        call = ProviderRequest(
            purpose="REWRITE_TITLE",
            instructions=REWRITE_INSTRUCTIONS.format(rule=REWRITE_RULES[problem]),
            data=data,
            timeout_seconds=limits.rewrite_timeout_seconds,
            max_output_bytes=limits.max_output_bytes,
        )
        _, response = _call_and_read(provider, call, clock, limits)
        if response is None:
            # 고쳐 쓰기 호출 실패·시간 초과·읽을 수 없는 응답은 다시 부르지 않는다.
            return
        if set(response) != {"title"}:
            problem = "SHAPE"
            continue
        choice = title_choice(response["title"], sent, max_name=limits.max_name_chars)
        if choice.problem is not None:
            problem = choice.problem
            continue
        if choice.ref is None:
            return
        text = decide(choice.ref, item)
        if text is None:
            return
        if len(text) > limits.max_title_chars:
            problem = "TOO_LONG"
            continue
        result.title = text
        report.titles_rewritten += 1
        return


def _apply(
    item: PreparedCandidate,
    result: _Result,
    report: GenerationReport,
    ai_side: bool,
    observe: Callable[[CatchTrace], None] | None,
) -> EligibleCandidate:
    """생성 칸과 근거 한계 끝 문구만 바꾼다. 작업 사실은 바꾸지 않는다(BR4.3).

    AI 쪽이 켜졌으면 판정 답으로 제목·설명을 정하고, 판정 부실이면 작업 사실 둘째 줄을 위치로 지운다(CR3 BR4.1).
    작업 사실에 생성 출력의 글을 더하거나 고치지 않는다(BR4.2).
    """
    candidate = item.material.candidate
    work_facts = candidate.work_facts
    draft = result.draft
    if ai_side:
        title, draft, work_facts = _apply_judgement(item, result, report, observe)
    else:
        title = _record_title(candidate)
        if title is None:
            title = result.title
    additions: dict[str, list[str]] = {}
    if result.selection is not None:
        for sha, partial in result.selection.size_excluded.items():
            phrase = SIZE_PARTIAL if partial and result.called else SIZE_FULL
            additions.setdefault(sha, []).append(phrase)
            report.size_limited_commits += 1
    for sha in item.truncated:
        additions.setdefault(sha, []).append(TRUNCATED)
        report.truncated_commits += 1
    evidence = list(candidate.evidence)
    for sha, phrases in additions.items():
        index = item.material.evidence_index[sha]
        limits = evidence[index].coverage_limits
        new = tuple(phrase for phrase in phrases if phrase not in limits)
        evidence[index] = replace(evidence[index], coverage_limits=(*limits, *new))
    if draft.status == "GENERATED":
        report.draft_generated += 1
        if title is None:
            # 최종 제목 기준이다. 기록의 글이 제목이면 세지 않는다(BR3.3).
            report.title_only_null += 1
    if draft.status == "FAILED":
        report.draft_failed += 1
    if result.reflection.status == "FAILED":
        report.reflection_failed += 1
    return replace(
        candidate,
        title=title,
        work_facts=work_facts,
        draft=draft,
        reflection=result.reflection,
        evidence=tuple(evidence),
    )


def _apply_judgement(
    item: PreparedCandidate,
    result: _Result,
    report: GenerationReport,
    observe: Callable[[CatchTrace], None] | None,
) -> tuple[str | None, DraftOutcome, tuple[str, ...]]:
    """AI 쪽 판정 답 적용: (제목, 설명 초안, 작업 사실).

    - 생성 응답이 없는 Catch는 「판정 없음」: 제목·둘째 줄은 규칙 결과, 설명·질문은 지금 상태 그대로(BR2.6).
    - 시간·상한으로 판정하지 않았거나 질문이 없으면 설명은 NOT_GENERATED, 판정 실패면 FAILED(BR2.6·BR5.4).
    - 판정 답이 있으면 0.9 이상 문장만 응답 순서대로 이어 쓰고, 하나도 없으면 NOT_GENERATED(BR5.2·BR5.3).
    """
    candidate = item.material.candidate
    record = candidate.record_text
    judged = result.judged
    ask_ = None if judged is None else judged.ask
    answers = None if judged is None else judged.answers
    verdict = record_verdict(ask_, answers)
    titles = () if judged is None else judged.titles
    chosen = ai_title(ask_, answers, titles)
    title, source = choose_title(record, verdict, chosen, result.title)
    facts = remove_record_fact(candidate.work_facts, record, verdict)
    kept: tuple[Checked, ...] = ()
    draft = result.draft
    if judged is not None:
        if judged.state == "FAILED":
            assert judged.failure is not None
            draft = failed_draft(judged.failure)
        elif judged.state == "ANSWERED":
            kept = kept_sentences(ask_, answers, judged.sentences)
            draft = (
                DraftOutcome.generated(" ".join(each.item.text for each in kept))
                if kept
                else DraftOutcome.not_generated()
            )
            _count_below(judged, kept, report)
        else:
            draft = DraftOutcome.not_generated()
    report.title_sources[source] += 1
    if facts != candidate.work_facts:
        report.second_lines_removed += 1
    if observe is not None:
        observe(_trace(item, result, (chosen, title, source), kept, facts, verdict))
    return title, draft, facts


def _count_below(
    judged: _Judged, kept: tuple[Checked, ...], report: GenerationReport
) -> None:
    """기계 대조는 통과했지만 판정이 0.9 미만이라 쓰지 않은 후보·문장을 센다."""
    ask_, answers = judged.ask, judged.answers
    passed_titles = [each for each in judged.titles if each.passed]
    if ask_ is not None and answers is not None and ask_.title_choice is not None:
        probabilities = answers.choices.get(ask_.title_choice, {})
        report.below_threshold_titles += sum(
            probabilities.get(each.item.id, 0.0) < TITLE_THRESHOLD
            for each in passed_titles
        )
    elif passed_titles:
        report.below_threshold_titles += len(passed_titles)
    report.below_threshold_sentences += sum(
        each.passed for each in judged.sentences
    ) - len(kept)


def _trace(
    item: PreparedCandidate,
    result: _Result,
    title: tuple[str | None, str | None, TitleSource],
    kept: tuple[Checked, ...],
    facts: tuple[str, ...],
    verdict: RecordVerdict | None,
) -> CatchTrace:
    candidate = item.material.candidate
    judged = result.judged
    chosen, final, source = title
    return CatchTrace(
        work_identity=candidate.work_identity,
        record=candidate.record_text,
        titles=() if judged is None else judged.titles,
        sentences=() if judged is None else judged.sentences,
        answers={} if judged is None else answer_values(judged.ask, judged.answers),
        judgement="NOT_SENT" if judged is None else judged.state,
        failure=None
        if judged is None or judged.failure is None
        else judged.failure.value,
        record_verdict=verdict,
        chosen_title=chosen,
        title=final,
        title_source=source,
        kept=tuple(each.item.id for each in kept),
        second_line_removed=facts != candidate.work_facts,
        material_judged=result.material_judged,
        material_seconds=result.material_seconds,
    )


def _record_title(candidate: EligibleCandidate) -> str | None:
    """쓸 만한 기록의 글이면 그 글(BR3.1). 후보 판정이 한 번 계산한 칸만 본다(BR2.7)."""
    record = candidate.record_text
    if record is None or not record.usable:
        return None
    return record.text


def _reasons(counts: Counter[str]) -> str:
    """원인 코드:건수를 코드순으로 쉼표로 잇는다. 없으면 '-'. 코드는 고정 값이라 자료가 들어가지 않는다."""
    return ",".join(f"{code}:{count}" for code, count in sorted(counts.items())) or "-"


def _log(request: CheckedRequest, report: GenerationReport) -> None:
    """건수만 남긴다. SHA·경로·이름·제목·본문·응답 원문·가린 값은 남기지 않는다.

    AI 쪽(CR3) 칸도 같은 한 줄에 둔다: 켜짐 여부·공급자 이름, 판정 요청·실패(코드별)·건너뜀, 기계 대조·문턱으로
    버린 후보·문장, 둘째 줄을 지운 Catch, 제목 출처별 Catch 수. 기록의 글·후보·문장·판정 답·키는 남기지 않는다.
    """
    sources = report.title_sources
    logger.log(
        logging.WARNING
        if report.budget_skipped or report.judgement_skipped
        else logging.INFO,
        "생성 종료: requestId=%s attemptId=%s candidates=%d generationCalls=%d "
        "rewriteCalls=%d noMaterial=%d budgetSkipped=%d wholeFailures=%d "
        "draftGenerated=%d draftFailed=%d reflectionFailed=%d titleOnlyNull=%d "
        "titlesRewritten=%d maskedValues=%d secretFiles=%d maskedToEmpty=%d "
        "sizeLimitedCommits=%d truncatedCommits=%d unknownResponseKeys=%d "
        "wholeReasons=%s draftReasons=%s reflectionReasons=%s "
        "draftDropReasons=%s reflectionDropReasons=%s draftSalvaged=%d reflectionSalvaged=%d "
        "aiSide=%s judgementProvider=%s catchJudgements=%d materialJudgements=%d "
        "judgementSkipped=%d materialSkipped=%d catchJudgementReasons=%s "
        "materialJudgementReasons=%s factcheckDroppedTitles=%d factcheckDroppedSentences=%d "
        "belowThresholdTitles=%d belowThresholdSentences=%d secondLinesRemoved=%d "
        "titleFromRecord=%d titleFromAi=%d titleFromRecordWholeMiss=%d "
        "titleFromFragment=%d titleNone=%d aiDropReasons=%s",
        request.request_id,
        request.attempt_id,
        report.candidates,
        report.generation_calls,
        report.rewrite_calls,
        report.no_material,
        report.budget_skipped,
        report.whole_failures,
        report.draft_generated,
        report.draft_failed,
        report.reflection_failed,
        report.title_only_null,
        report.titles_rewritten,
        report.masked_values,
        report.secret_files,
        report.masked_to_empty,
        report.size_limited_commits,
        report.truncated_commits,
        report.unknown_response_keys,
        _reasons(report.whole_reasons),
        _reasons(report.draft_reasons),
        _reasons(report.reflection_reasons),
        _reasons(report.draft_notes),
        _reasons(report.reflection_notes),
        report.draft_salvaged,
        report.reflection_salvaged,
        "on" if report.ai_side else "off",
        _provider_name(report.judgement_provider),
        report.catch_judgements,
        report.material_judgements,
        report.judgement_skipped,
        report.material_skipped,
        _reasons(report.catch_judgement_reasons),
        _reasons(report.material_judgement_reasons),
        report.factcheck_dropped_titles,
        report.factcheck_dropped_sentences,
        report.below_threshold_titles,
        report.below_threshold_sentences,
        report.second_lines_removed,
        sources["RECORD"],
        sources["AI"],
        sources["RECORD_WHOLE_MISS"],
        sources["FRAGMENT"],
        sources["NONE"],
        _reasons(report.ai_notes),
    )


_PROVIDER_NAMES = frozenset({"-", "openai", "claude", "synthetic"})


def _provider_name(name: str) -> str:
    """공급자 이름은 정해 둔 값만 그대로 적는다(키·글이 로그에 들어가지 않게)."""
    return name if name in _PROVIDER_NAMES else "OTHER"
