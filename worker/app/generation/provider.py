"""후보별 생성 제공자의 경계(#120). 제공자 이름·모델·API 키에 해당하는 값은 두지 않는다.

`app.processing.Generator`는 요청 하나의 수집·후보·생성 전체를 감싸는 경계이고, 이 Protocol은 후보 하나의
생성 호출(또는 제목 형식 고쳐 쓰기 호출) 한 번이다. 실제 제공자 어댑터는 #119·C06과 #37의 자료 처리
조건을 갖춘 뒤 이 Protocol로 붙인다. 그 전에는 시험의 합성 제공자만 쓴다.
"""

from dataclasses import dataclass
from typing import Literal, Protocol

Purpose = Literal["GENERATE", "REWRITE_TITLE"]


@dataclass(frozen=True)
class ProviderRequest:
    """제공자에 보내는 것 전부.

    지시문(instructions)과 수집 자료(data)를 따로 둔다. data는 신뢰할 수 없는 자료이고 지시로 해석하지
    않는다. 실제 어댑터는 둘을 섞지 말고 지시문을 시스템 쪽에, 자료를 사용자 쪽에 둔다.
    """

    purpose: Purpose
    instructions: str
    data: str
    timeout_seconds: float
    max_output_bytes: int


class ProviderError(Exception):
    """제공자 호출이 실패했다(연결·서버 오류·거부 등). 어댑터는 SDK 예외를 이것으로 바꾼다.

    메시지에 요청·응답 원문, 자격정보, 제공자 내부 오류 문구를 넣지 않는다.
    """


class GenerationProvider(Protocol):
    """생성 호출 한 번을 하고 응답 글을 돌려준다.

    - timeout_seconds 안에 끝내지 못하면 TimeoutError를 낸다. 다른 실패는 ProviderError로 낸다.
    - 스스로 다시 시도하지 않는다. 실제 SDK를 쓰면 기본 재시도를 끈다.
    - 응답이 max_output_bytes를 넘을 수 있으면 그만큼만 생성하도록 제공자에 넘긴다. 넘는 응답은 생성
      모듈이 읽지 않고 버린다.
    """

    def complete(self, request: ProviderRequest) -> str: ...
