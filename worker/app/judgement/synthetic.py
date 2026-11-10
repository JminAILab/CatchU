"""합성 판정 어댑터(CR3 FR4.1): 외부 호출 없이 판정 경로를 시험한다.

질문마다 정해 둔 답을 돌려주고, 실패 셋(시간 초과·호출 오류·읽을 수 없는 응답)을 흉내 낸다. 받은 요청을
기록한다. 운영 설정(`app.consumer.settings`)으로는 만들 수 없다(공급자 값은 openai·claude뿐이다). 실제 모델의
품질을 대신하지 않는다.
"""

from collections.abc import Callable, Sequence

from app.judgement.provider import (
    JudgementError,
    JudgementFailureCode,
    JudgementRequest,
    Question,
    RawAnswer,
)

# 질문 하나의 답. None이면 그 질문에 답하지 않는다(BR2.5 시험).
Answerer = Callable[[Question], object | None]


def default_answer(question: Question) -> object | None:
    """모두 통과하는 답: 확률 질문은 0.95, 고르기는 첫 선택지, 재료 종류는 WORK, 묶음은 답 없음, 점수 3."""
    if question.kind in ("RECORD_WHAT", "RECORD_WHOLE", "SENTENCE_TRUE"):
        return 0.95
    if question.kind == "MATERIAL_GROUP":
        return None
    if question.kind == "MATERIAL_SCORE":
        return 3
    return [1.0 if index == 0 else 0.0 for index, _ in enumerate(question.options)]


class SyntheticJudge:
    """정해 둔 답·실패를 돌려준다. before는 답하기 전에 부른다(시험이 합성 시계를 움직일 때)."""

    def __init__(
        self,
        answer: Answerer = default_answer,
        *,
        failure: JudgementFailureCode | None = None,
        before: Callable[[JudgementRequest], None] | None = None,
    ) -> None:
        self._answer = answer
        self._failure = failure
        self._before = before
        self.requests: list[JudgementRequest] = []

    @property
    def name(self) -> str:
        return "synthetic"

    def judge(self, request: JudgementRequest) -> Sequence[RawAnswer]:
        self.requests.append(request)
        if self._before is not None:
            self._before(request)
        if self._failure == "JUDGEMENT_TIMEOUT":
            raise TimeoutError("합성 판정 시간 초과")
        if self._failure is not None:
            raise JudgementError(self._failure)
        found: list[RawAnswer] = []
        for question in request.questions:
            value = self._answer(question)
            if value is not None:
                found.append((question.id, value))
        return found

    def catch_requests(self) -> list[JudgementRequest]:
        return [each for each in self.requests if each.purpose == "CATCH"]

    def material_requests(self) -> list[JudgementRequest]:
        return [each for each in self.requests if each.purpose == "MATERIAL"]
