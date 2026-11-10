"""판정 공급자 규약(CR3 BR1·BR2): 요청 하나 → 질문마다의 답, 또는 실패 셋 가운데 하나.

공급자는 글을 쓰지 않는다. 질문마다 참일 확률(predicate)·고르기 확률(choice)·점수(score)로만 답한다. 실제
어댑터는 OpenAI Decisions API(`app.judgement.openai_judge`)와 Claude 구조화 출력(`app.judgement.claude`)이고,
시험은 합성 어댑터(`app.judgement.synthetic`)를 쓴다. 공급자 이름·모델·키 값은 이 규약에 두지 않는다.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final, Literal, Protocol

QuestionKind = Literal[
    "RECORD_WHAT",
    "RECORD_WHOLE",
    "TITLE_CHOICE",
    "SENTENCE_TRUE",
    "MATERIAL_KIND",
    "MATERIAL_GROUP",
    "MATERIAL_SCORE",
]
# 답의 꼴. 공급자마다 같은 질문 집합·같은 꼴로 묻는다(BR1.2).
PROBABILITY_KINDS: Final = frozenset({"RECORD_WHAT", "RECORD_WHOLE", "SENTENCE_TRUE"})
CHOICE_KINDS: Final = frozenset({"TITLE_CHOICE", "MATERIAL_KIND", "MATERIAL_GROUP"})
SCORE_KINDS: Final = frozenset({"MATERIAL_SCORE"})
# 점수 질문의 단계(1~5).
SCORE_LEVELS: Final = (1, 2, 3, 4, 5)

JudgementPurpose = Literal["CATCH", "MATERIAL"]
JudgementFailureCode = Literal[
    "JUDGEMENT_TIMEOUT",
    "JUDGEMENT_CALL_FAILED",
    "JUDGEMENT_RESPONSE_UNREADABLE",
]


@dataclass(frozen=True)
class Question:
    """질문 하나. prompt는 고정 문장에 자료 안 id만 넣은 글이고, 자료의 글(경로·줄·후보)은 넣지 않는다."""

    id: str
    kind: QuestionKind
    # RECORD_*는 record, TITLE_CHOICE는 title, SENTENCE_TRUE는 문장 id, MATERIAL_*는 파일 경로.
    target: str
    prompt: str
    # 고르기 질문의 선택지(순서가 답의 순서다). 그 밖에는 비어 있다.
    options: tuple[str, ...] = ()


@dataclass(frozen=True)
class JudgementRequest:
    """공급자에 보내는 것 전부. 지시문(고정 글)과 자료(JSON 글)를 따로 둔다.

    자료는 신뢰할 수 없는 글이다. 어댑터는 지시문을 지시 칸(system·developer)에, 자료를 사용자 칸에 두고
    섞지 않는다.
    """

    purpose: JudgementPurpose
    instructions: str
    data: str
    questions: tuple[Question, ...]
    timeout_seconds: float
    # 공급자가 받는 출력 토큰 상한(Claude `max_tokens`). 받는 인자가 없는 공급자(OpenAI Decisions)는 쓰지 않는다.
    max_output_tokens: int


# 질문 id와 값 한 쌍. 값은 확률(0~1), 선택지 순서대로의 확률 목록, 점수(1~5) 가운데 하나다. 모양은 답 읽기
# (`app.judgement.answers.read`)가 질문마다 검사한다.
RawAnswer = tuple[object, object]


class JudgementError(Exception):
    """판정 호출이 실패했다. 메시지에 요청·응답 원문, 자격정보, 공급자 오류 글을 넣지 않는다."""

    def __init__(self, code: JudgementFailureCode) -> None:
        # 시간 초과는 TimeoutError로 낸다. 이 예외의 코드로 와도 흐름은 같은 시간 초과로 다룬다.
        super().__init__(code)
        self.code = code


class JudgementProvider(Protocol):
    """판정 호출 한 번을 하고 (질문 id, 값) 목록을 돌려준다.

    - timeout_seconds 안에 끝내지 못하면 TimeoutError를 낸다. 연결·인증·429·5xx는 JUDGEMENT_CALL_FAILED,
      읽을 수 없는 응답·크기 초과는 JUDGEMENT_RESPONSE_UNREADABLE로 JudgementError를 낸다.
    - 스스로 다시 시도하지 않는다. SDK의 다시 시도도 끈다.
    - 답하지 않은 질문(거절 등)은 목록에서 빼면 된다. 그 질문만 답이 없는 것으로 본다(BR2.5).
    """

    @property
    def name(self) -> str:
        """운영 로그에 남기는 공급자 이름(openai·claude·synthetic). 키·모델 값이 아니다."""
        ...

    def judge(self, request: JudgementRequest) -> Sequence[RawAnswer]: ...
