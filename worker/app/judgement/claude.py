"""Claude 판정 어댑터(CR3 BR1.2, FR4.5): OpenAI 판정과 같은 질문 집합을 Claude 구조화 출력으로 묻는다.

호출 규칙은 생성 제공자(`app.generation.claude.ClaudeProvider`) 그대로다: 주소·키를 코드와 설정 객체로만
정하고, 다시 시도를 끄며(`max_retries=0`), 추론 위치를 미국으로 고정하고(`inference_geo="us"`), 사용자 지정
머리글 환경변수가 있으면 만들지 않는다. 그 HTTP 보호(응답 본문 상한·호출 마감·프록시 환경변수 무시·redirect
안 따라감)를 다시 쓰려고 생성 제공자의 구조화 출력 호출을 부른다. 생성 흐름·후보 판정은 불러오지 않는다.

- 지시문(고정 글)과 답 규칙은 system 칸에, 자료와 질문 목록은 user 칸에 둔다.
- 답은 `{"answers": [[질문 id, 값], ...]}` 꼴로 받는다. 값은 확률(0~1), 선택지 순서대로의 확률 목록, 점수
  (1~5)다. 범위·모양은 답 읽기(`app.judgement.answers.read`)가 질문마다 본다.
- 출력 상한은 요청의 `max_output_tokens`(Catch 2,000·재료 8,000토큰)다. 잘린 응답은 읽을 수 없는 응답이다.
"""

import json
from collections.abc import Sequence
from typing import Final

import httpx2

from app.collection.credentials import AccessToken
from app.generation.claude import ClaudeProvider
from app.generation.provider import ProviderError, UnusableResponse
from app.judgement.provider import (
    CHOICE_KINDS,
    PROBABILITY_KINDS,
    JudgementError,
    JudgementRequest,
    Question,
    RawAnswer,
)

JUDGEMENT_MODEL: Final = "claude-haiku-5-5"

ANSWER_RULES: Final = (
    "답은 JSON 객체 하나만 쓴다. 키는 answers 하나뿐이다. answers는 질문마다 [질문 id, 값] 두 칸 배열의"
    " 목록이다. 값은 질문 종류에 따라 다르다. predicate는 참일 확률(0~1 사이 수), choice는 options 순서대로"
    " 각 선택지가 맞을 확률의 목록(합 1), score는 1~5 정수다. 답할 수 없는 질문은 목록에서 뺀다. 글은 쓰지"
    " 않는다."
)
ANSWER_SCHEMA: Final[dict[str, object]] = {
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "items": {
                "type": "array",
                "items": {
                    "anyOf": [
                        {"type": "string"},
                        {"type": "number"},
                        {"type": "array", "items": {"type": "number"}},
                    ]
                },
            },
        }
    },
    "required": ["answers"],
    "additionalProperties": False,
}
_LABELS: Final = {"CATCH": "JUDGE_CATCH", "MATERIAL": "JUDGE_MATERIAL"}


def _kind(question: Question) -> str:
    if question.kind in PROBABILITY_KINDS:
        return "predicate"
    if question.kind in CHOICE_KINDS:
        return "choice"
    return "score"


def user_content(request: JudgementRequest) -> str:
    """user 칸의 글: 자료(JSON)와 질문 목록(JSON)을 나눠 싣는다."""
    questions = [
        {
            "id": question.id,
            "type": _kind(question),
            "question": question.prompt,
            **({"options": list(question.options)} if question.options else {}),
        }
        for question in request.questions
    ]
    return (
        "자료:\n"
        + request.data
        + "\n\n질문:\n"
        + json.dumps(questions, ensure_ascii=False, separators=(",", ":"))
    )


class ClaudeJudge:
    """Claude Messages API로 판정 호출 한 번을 한다. 생성 제공자와 같은 키로 따로 클라이언트를 만든다."""

    def __init__(
        self,
        api_key: AccessToken,
        *,
        transport: httpx2.BaseTransport | None = None,
    ) -> None:
        """transport는 시험이 네트워크 없이 SDK 전체를 돌릴 때만 넘긴다."""
        self._client = ClaudeProvider(api_key, transport=transport)

    @property
    def name(self) -> str:
        return "claude"

    def judge(self, request: JudgementRequest) -> Sequence[RawAnswer]:
        try:
            text = self._client.structured(
                label=_LABELS[request.purpose],
                model=JUDGEMENT_MODEL,
                system=request.instructions + "\n\n" + ANSWER_RULES,
                user=user_content(request),
                schema=ANSWER_SCHEMA,
                max_tokens=request.max_output_tokens,
                timeout_seconds=request.timeout_seconds,
            )
        except UnusableResponse:
            raise JudgementError("JUDGEMENT_RESPONSE_UNREADABLE") from None
        except ProviderError:
            raise JudgementError("JUDGEMENT_CALL_FAILED") from None
        return parse(text)


def parse(text: str) -> list[RawAnswer]:
    """구조화 출력 글을 (질문 id, 값) 목록으로 읽는다. 전체 모양이 틀리면 읽을 수 없는 응답이다."""
    try:
        value = json.loads(text)
    except (ValueError, RecursionError):
        raise JudgementError("JUDGEMENT_RESPONSE_UNREADABLE") from None
    answers = value.get("answers") if isinstance(value, dict) else None
    if not isinstance(answers, list):
        raise JudgementError("JUDGEMENT_RESPONSE_UNREADABLE")
    return [
        (row[0], row[1]) for row in answers if isinstance(row, list) and len(row) == 2
    ]
