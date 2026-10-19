"""생성 흐름(#120): 후보 판정 결과(#118)의 후보마다 설명 초안·생각해볼 질문·제목을 채운다.

입구는 `run_generation`이다. 후보 순서·근거·미제공 집계·기존 실패는 그대로 두고, 후보의 생성 칸(draft·
reflection·title)과 본인 커밋 근거의 한계 끝 문구(결정 5·6)만 바꾼다. 처리 순서에 실제 수집·후보·큐·E
전달을 잇는 것은 #121이다.

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
제공자 오류·시간 초과는 후보마다 결과로 바꾸고 다시 부르지 않는다. 그 밖의 예외(결함, 요청 전체의
ExecutionUnknown)는 그대로 올린다.
"""

import logging
from collections import Counter
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Literal

from app.collection.collect import CollectionOutcome
from app.generation import render
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
    GENERATE_INSTRUCTIONS,
    REWRITE_INSTRUCTIONS,
    REWRITE_RULES,
    PreparedCandidate,
    Selection,
    instruction_bytes,
    mask_book,
    prepare,
    rewrite_data,
    select,
)
from app.generation.response import (
    TOP_LEVEL_KEYS,
    Fragment,
    Question,
    Sent,
    SentenceMiss,
    TitleProblem,
    Unreadable,
    fragments,
    questions,
    read,
    title_choice,
    unknown_keys,
)
from app.generation.title import decide
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


@dataclass(frozen=True)
class GenerationRun:
    output: GenerationOutput
    report: GenerationReport


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


def run_generation(
    request: CheckedRequest,
    outcome: CollectionOutcome,
    built: GenerationOutput,
    *,
    provider: GenerationProvider,
    clock: Clock,
    deadline: datetime,
    limits: GenerationLimits = PROPOSED_GENERATION_LIMITS,
) -> GenerationRun:
    """built는 같은 요청·수집 결과로 만든 `build_candidates(request, outcome)`의 결과다.

    deadline은 생성 몫이 끝나야 할 시각이다(요청 전체 마감에서 결과 조합·전송 여유를 뺀 값, #121이 정한다).
    """
    report = GenerationReport()
    materials = gather(request, outcome, built)
    report.candidates = len(materials)
    data_budget = min(
        limits.max_data_bytes,
        limits.max_prompt_bytes - instruction_bytes(GENERATE_INSTRUCTIONS),
    )
    if materials and data_budget <= 0:
        raise ValueError("지시문만으로 전체 입력 상한을 넘는다")
    budget = CallBudget(limits, clock, deadline)
    book = mask_book(materials)
    prepared = [prepare(material, book) for material in materials]
    order = sorted(prepared, key=lambda item: item.material.priority())
    results: dict[int, _Result] = {}
    for item in order:
        results[item.material.position] = _generate_one(
            item, provider, budget, clock, limits, data_budget, report
        )
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
        _apply(item, results[item.material.position], report) for item in prepared
    )
    failures = built.failures
    if any(result.budget_skipped for result in results.values()):
        failures = (
            *failures,
            StageFailure(
                "ANALYSIS", GenerationFailureCode.BUDGET_EXHAUSTED.value, BUDGET_MESSAGE
            ),
        )
    report.generation_calls = budget.generation_calls
    report.rewrite_calls = budget.rewrite_calls
    _log(request, report)
    return GenerationRun(
        GenerationOutput(
            candidates=candidates, not_provided=built.not_provided, failures=failures
        ),
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
    """형식을 어긴 제목만 제목당 최대 N회 고친다. 호출 실패·확인 실패·한도·시간 부족이면 멈추고 None."""
    problem = result.title_problem
    result.title_problem = None
    if problem is None or result.selection is None:
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
    item: PreparedCandidate, result: _Result, report: GenerationReport
) -> EligibleCandidate:
    """생성 칸과 근거 한계 끝 문구만 바꾼다."""
    candidate = item.material.candidate
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
    if result.draft.status == "GENERATED":
        report.draft_generated += 1
        if result.title is None:
            report.title_only_null += 1
    if result.draft.status == "FAILED":
        report.draft_failed += 1
    if result.reflection.status == "FAILED":
        report.reflection_failed += 1
    return replace(
        candidate,
        title=result.title,
        draft=result.draft,
        reflection=result.reflection,
        evidence=tuple(evidence),
    )


def _reasons(counts: Counter[str]) -> str:
    """원인 코드:건수를 코드순으로 쉼표로 잇는다. 없으면 '-'. 코드는 고정 값이라 자료가 들어가지 않는다."""
    return ",".join(f"{code}:{count}" for code, count in sorted(counts.items())) or "-"


def _log(request: CheckedRequest, report: GenerationReport) -> None:
    """건수만 남긴다. SHA·경로·이름·제목·본문·응답 원문·가린 값은 남기지 않는다."""
    logger.log(
        logging.WARNING if report.budget_skipped else logging.INFO,
        "생성 종료: requestId=%s attemptId=%s candidates=%d generationCalls=%d "
        "rewriteCalls=%d noMaterial=%d budgetSkipped=%d wholeFailures=%d "
        "draftGenerated=%d draftFailed=%d reflectionFailed=%d titleOnlyNull=%d "
        "titlesRewritten=%d maskedValues=%d secretFiles=%d maskedToEmpty=%d "
        "sizeLimitedCommits=%d truncatedCommits=%d unknownResponseKeys=%d "
        "wholeReasons=%s draftReasons=%s reflectionReasons=%s "
        "draftDropReasons=%s reflectionDropReasons=%s draftSalvaged=%d reflectionSalvaged=%d",
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
    )
