"""판정 호출 한 번과 답 읽기(CR3 BR1.2·BR2.2·BR2.5).

- 호출은 한 번뿐이고 실패해도 다시 부르지 않는다. 시간 제한을 넘겨 끝난 호출은 결과가 어떻든 시간 초과다.
- 답은 질문 목록에 있는 id만 받는다. 범위 밖 값·모양이 틀린 값·같은 id가 두 번 온 답은 그 질문의 답이 없는
  것으로 본다. 고르기 확률은 선택지 수와 같은 길이의 0~1 목록이어야 하고, 합이 1이 되게 나눠 맞춘다.
  점수는 1~5 안의 수를 가장 가까운 정수로 맞춘다.
- 답에 글 칸은 없다. 판정 답의 글이 화면이나 결과 메시지로 가는 길이 없다.
"""

import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.judgement.provider import (
    CHOICE_KINDS,
    PROBABILITY_KINDS,
    SCORE_KINDS,
    JudgementError,
    JudgementFailureCode,
    JudgementProvider,
    JudgementRequest,
    Question,
    RawAnswer,
)

Clock = Callable[[], datetime]


@dataclass(frozen=True)
class Answers:
    """읽은 답. 질문 id → 값. 없는 id는 답이 없는 질문이다."""

    probabilities: Mapping[str, float] = field(default_factory=dict)
    # 질문 id → 선택지 → 확률(합 1).
    choices: Mapping[str, Mapping[str, float]] = field(default_factory=dict)
    scores: Mapping[str, int] = field(default_factory=dict)

    @property
    def count(self) -> int:
        return len(self.probabilities) + len(self.choices) + len(self.scores)

    def chosen(self, question_id: str, threshold: float) -> str | None:
        """확률이 문턱 이상인 선택지. 합이 1이므로 문턱이 0.5를 넘으면 많아야 하나다."""
        probabilities = self.choices.get(question_id)
        if probabilities is None:
            return None
        found = [
            option for option, value in probabilities.items() if value >= threshold
        ]
        return found[0] if len(found) == 1 else None

    def most_likely(self, question_id: str) -> str | None:
        """확률이 가장 큰 선택지. 가장 큰 값이 둘 이상이면 None."""
        probabilities = self.choices.get(question_id)
        if not probabilities:
            return None
        top = max(probabilities.values())
        found = [option for option, value in probabilities.items() if value == top]
        return found[0] if len(found) == 1 else None


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def _probability(value: object) -> float | None:
    number = _number(value)
    return number if number is not None and 0.0 <= number <= 1.0 else None


def _choice(value: object, options: tuple[str, ...]) -> dict[str, float] | None:
    if not isinstance(value, list | tuple) or len(value) != len(options):
        return None
    numbers = [_probability(each) for each in value]
    if any(each is None for each in numbers):
        return None
    total = sum(each for each in numbers if each is not None)
    if total <= 0:
        return None
    return {
        option: (each or 0.0) / total
        for option, each in zip(options, numbers, strict=True)
    }


def _score(value: object) -> int | None:
    number = _number(value)
    if number is None or not 1.0 <= number <= 5.0:
        return None
    return int(math.floor(number + 0.5))


def read(raw: Sequence[RawAnswer], questions: Sequence[Question]) -> Answers:
    """(질문 id, 값) 목록을 질문마다 검사해 읽는다. 맞지 않는 답은 그 질문만 버린다."""
    by_id = {question.id: question for question in questions}
    seen: dict[str, int] = {}
    for pair in raw:
        if isinstance(pair[0], str):
            seen[pair[0]] = seen.get(pair[0], 0) + 1
    probabilities: dict[str, float] = {}
    choices: dict[str, dict[str, float]] = {}
    scores: dict[str, int] = {}
    for question_id, value in raw:
        if not isinstance(question_id, str) or seen.get(question_id) != 1:
            continue
        question = by_id.get(question_id)
        if question is None:
            continue
        if question.kind in PROBABILITY_KINDS:
            probability = _probability(value)
            if probability is not None:
                probabilities[question_id] = probability
        elif question.kind in CHOICE_KINDS:
            choice = _choice(value, question.options)
            if choice is not None:
                choices[question_id] = choice
        elif question.kind in SCORE_KINDS:
            score = _score(value)
            if score is not None:
                scores[question_id] = score
    return Answers(probabilities, choices, scores)


def ask(
    provider: JudgementProvider, request: JudgementRequest, clock: Clock
) -> Answers | JudgementFailureCode:
    """판정 호출을 한 번 한다. 다시 부르지 않는다. 실패면 실패 코드를 돌려준다."""
    started = clock()
    failed: JudgementFailureCode | None = None
    raw: Sequence[RawAnswer] = ()
    try:
        raw = provider.judge(request)
    except TimeoutError:
        return "JUDGEMENT_TIMEOUT"
    except JudgementError as error:
        failed = error.code
    if clock() - started > timedelta(seconds=request.timeout_seconds):
        return "JUDGEMENT_TIMEOUT"
    if failed is not None:
        return failed
    if not isinstance(raw, list | tuple) or not all(
        isinstance(pair, tuple | list) and len(pair) == 2 for pair in raw
    ):
        return "JUDGEMENT_RESPONSE_UNREADABLE"
    return read([(pair[0], pair[1]) for pair in raw], request.questions)
