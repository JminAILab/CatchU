"""생성 실패 코드·회원용 문구와 근거 한계 문구(#120).

- 코드는 원인별로 나눈다(계약의 `Failure.code`는 자유 문자열이고 E는 코드로 갈라 처리하지 않는다).
- message는 회원 화면에 「실패한 부분: {message}」로 그대로 나간다. 그래서 원인과 실패한 결과(설명 초안·
  생각해볼 질문)를 구분하는 고정 문장만 쓴다. 제공자·모델 이름, 내부 용어, 경로, 원문, 비밀값, 내부 오류
  문구는 넣지 않는다. 말투는 수집 실패 문구(「…수집을 멈췄다」)와 같은 평서문이다.
- 근거 한계(coverageLimits) 문구는 회원·수신자 응답에 모두 담긴다. 숫자·경로·원문 없이 사유마다 고정
  문장 하나다(2026-10-12 결정 5·6·13).
"""

from enum import StrEnum
from typing import Literal

from app.processing.generation import DraftOutcome, ReflectionOutcome


class GenerationFailureCode(StrEnum):
    # 생성 호출 전체 실패: 설명·질문 모두 FAILED, DRAFT·REFLECTION 실패 각 1건.
    CALL_FAILED = "GENERATION_CALL_FAILED"
    TIMEOUT = "GENERATION_TIMEOUT"
    RESPONSE_UNREADABLE = "GENERATION_RESPONSE_UNREADABLE"
    RESPONSE_TOO_LARGE = "GENERATION_RESPONSE_TOO_LARGE"
    # 부분 실패: 그 부분(설명 또는 질문)만 FAILED.
    RULE_VIOLATION = "GENERATION_RULE_VIOLATION"
    UNVERIFIED = "GENERATION_UNVERIFIED"
    # 요청 단위: 호출 수·시간 한도로 새 생성 호출을 시작하지 못한 후보가 있다(ANALYSIS 1건).
    BUDGET_EXHAUSTED = "GENERATION_BUDGET_EXHAUSTED"


_CAUSE = {
    GenerationFailureCode.CALL_FAILED: "생성 중 오류가 나",
    GenerationFailureCode.TIMEOUT: "생성 시간이 초과되어",
    GenerationFailureCode.RESPONSE_UNREADABLE: "생성 결과를 읽을 수 없어",
    GenerationFailureCode.RESPONSE_TOO_LARGE: "생성 결과가 허용 크기를 넘어",
    GenerationFailureCode.RULE_VIOLATION: "생성 결과가 정해진 형식을 지키지 않아",
    GenerationFailureCode.UNVERIFIED: "생성 결과를 변경 내용과 대조해 확인하지 못해",
}
_PART = {
    "DRAFT": "설명 초안을 만들지 못했다",
    "REFLECTION": "생각해볼 질문을 만들지 못했다",
}

BUDGET_MESSAGE = (
    "생성 횟수·시간 한도에 걸려 일부 후보의 설명 초안과 생각해볼 질문을 만들지 못했다"
)

WHOLE_CALL_FAILURES = frozenset(
    {
        GenerationFailureCode.CALL_FAILED,
        GenerationFailureCode.TIMEOUT,
        GenerationFailureCode.RESPONSE_UNREADABLE,
        GenerationFailureCode.RESPONSE_TOO_LARGE,
    }
)


def message(code: GenerationFailureCode, part: Literal["DRAFT", "REFLECTION"]) -> str:
    return f"{_CAUSE[code]} {_PART[part]}"


def failed_draft(code: GenerationFailureCode) -> DraftOutcome:
    return DraftOutcome.failed(code.value, message(code, "DRAFT"))


def failed_reflection(code: GenerationFailureCode) -> ReflectionOutcome:
    return ReflectionOutcome.failed(code.value, message(code, "REFLECTION"))


# 근거 한계 문구. 확인에는 받은 전체 patch를 쓰므로 "생성 모델에 보내지 않았다"로 적는다.
SIZE_PARTIAL = (
    "이 커밋의 변경 내용 일부는 생성 입력 크기 제한으로 생성 모델에 보내지 않았다"
)
SIZE_FULL = "이 커밋의 변경 내용은 생성 입력 크기 제한으로 생성 모델에 보내지 않았다"
TRUNCATED = "이 커밋의 변경 파일 가운데 받은 변경 내용이 온전하지 않은 파일은 생성에 쓰지 않았다"
GENERATION_LIMITS = (SIZE_PARTIAL, SIZE_FULL, TRUNCATED)
