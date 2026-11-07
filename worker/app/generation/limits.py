"""생성 호출·고쳐 쓰기·입출력 크기·시간 상한(#120).

제목당 고쳐 쓰기 3회는 2026-10-08 팀장 결정(결정 문서 「Catch 제목」), 요청당 생성 호출 300회는
#424의 2026-11-01 팀장 결정이다(근거는 worker/docs/generation-limits.md). 나머지는 #120이
정하도록 맡긴 값의 첫 제안이다. 요청 전체 마감은 #121이 정해 넘기며 여기서는 그 마감 시각만 지킨다.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

Clock = Callable[[], datetime]


@dataclass(frozen=True)
class GenerationLimits:
    # 요청당 생성 호출 수(후보당 1회). 고쳐 쓰기는 세지 않는다.
    max_generation_calls: int = 300
    # 요청당 제목 형식 고쳐 쓰기 호출 수와 제목당 최대 횟수(제목당 3회는 팀장 결정).
    max_rewrite_calls: int = 20
    max_rewrites_per_title: int = 3
    # 호출마다 제공자에 넘기는 시간 제한. 남은 시간이 이보다 적으면 새 호출을 시작하지 않는다.
    generation_timeout_seconds: float = 45.0
    rewrite_timeout_seconds: float = 20.0
    # 생성 호출 하나에 보내는 자료(가린 뒤, 직렬화한 UTF-8 바이트)와 지시문을 더한 전체 상한.
    max_data_bytes: int = 24_000
    max_prompt_bytes: int = 32_000
    # 제공자가 돌려줄 수 있는 응답 크기. 넘는 응답은 읽지 않고 버린다.
    max_output_bytes: int = 4_000
    # 고쳐 쓰기에 보내는 줄 수(첫 호출에서 보낸 줄 가운데서만 고른다).
    rewrite_max_lines: int = 20
    # 설명 조각·질문 개수와 글자 상한.
    min_fragments: int = 1
    max_fragments: int = 3
    min_questions: int = 1
    max_questions: int = 3
    max_title_chars: int = 40
    max_question_chars: int = 150
    max_name_chars: int = 64
    # 줄마다 싣는 고를 수 있는 이름 수(나온 순서대로). 실측 전 제안값이다.
    max_names_per_line: int = 12
    # 판정 호출(CR3 BR2.6): 시간 제한은 Catch 판정·재료 판정 모두 20초(고쳐 쓰기 호출과 같다), 요청당 상한은
    # 각 300번(생성 호출 상한과 같다). AI 쪽이 꺼지면 쓰지 않는다.
    judgement_timeout_seconds: float = 20.0
    max_catch_judgement_calls: int = 300
    max_material_judgement_calls: int = 300

    def __post_init__(self) -> None:
        counts = (
            self.max_generation_calls,
            self.max_rewrite_calls,
            self.max_rewrites_per_title,
            self.max_catch_judgement_calls,
            self.max_material_judgement_calls,
            self.max_data_bytes,
            self.max_prompt_bytes,
            self.max_output_bytes,
            self.rewrite_max_lines,
            self.max_title_chars,
            self.max_question_chars,
            self.max_name_chars,
            self.max_names_per_line,
        )
        if any(value < 0 for value in counts):
            raise ValueError("상한은 0 이상이어야 한다")
        if (
            self.generation_timeout_seconds <= 0
            or self.rewrite_timeout_seconds <= 0
            or self.judgement_timeout_seconds <= 0
        ):
            raise ValueError("호출 시간 제한은 0보다 커야 한다")
        if self.max_rewrites_per_title > 3:
            raise ValueError(
                "제목당 고쳐 쓰기는 3회를 넘지 않는다(2026-10-08 팀장 결정)"
            )
        if not 1 <= self.min_fragments <= self.max_fragments:
            raise ValueError("설명 조각 개수 범위가 맞지 않는다")
        if not 1 <= self.min_questions <= self.max_questions:
            raise ValueError("질문 개수 범위가 맞지 않는다")
        if self.max_data_bytes > self.max_prompt_bytes:
            raise ValueError("자료 상한이 전체 상한보다 크다")


PROPOSED_GENERATION_LIMITS = GenerationLimits()


class CallBudget:
    """요청 하나의 생성·고쳐 쓰기·판정 호출 수와 남은 시간을 센다. 시각은 주입한 시계로 잰다.

    판정 호출(CR3)은 생성 호출과 따로, Catch 판정·재료 판정을 각각 센다. 상한에 닿은 종류만 막는다.
    """

    def __init__(
        self, limits: GenerationLimits, clock: Clock, deadline: datetime
    ) -> None:
        if deadline.tzinfo is None:
            raise ValueError("마감 시각에는 시간대가 있어야 한다")
        self._limits = limits
        self._clock = clock
        self._deadline = deadline
        self.generation_calls = 0
        self.rewrite_calls = 0
        self.catch_judgement_calls = 0
        self.material_judgement_calls = 0

    def _time_left(self, seconds: float) -> bool:
        return self._deadline - self._clock() >= timedelta(seconds=seconds)

    def can_generate(self, reserve_seconds: float = 0.0) -> bool:
        """새 생성 호출을 시작할 수 있는가(호출 수와, 호출 시간 제한만큼 남은 시간).

        reserve_seconds는 생성 뒤에 이어 할 호출의 몫이다. AI 쪽이 켜지면 Catch 판정 시간 제한(20초)을 넘겨
        「남은 시간 ≥ 생성 45초 + 판정 20초」를 본다(비기능 설계 「마감 확인」).
        """
        return self.generation_calls < self._limits.max_generation_calls and (
            self._time_left(self._limits.generation_timeout_seconds + reserve_seconds)
        )

    def can_judge_catch(self) -> bool:
        """Catch 판정 호출을 시작할 수 있는가(Catch 판정 상한과, 판정 시간 제한만큼 남은 시간)."""
        return self.catch_judgement_calls < self._limits.max_catch_judgement_calls and (
            self._time_left(self._limits.judgement_timeout_seconds)
        )

    def can_judge_material(self) -> bool:
        """재료 판정 호출을 시작할 수 있는가. 뒤에 이어 할 생성·Catch 판정 몫까지 남아야 한다(20 + 45 + 20초)."""
        limits = self._limits
        return self.material_judgement_calls < limits.max_material_judgement_calls and (
            self._time_left(
                limits.judgement_timeout_seconds * 2 + limits.generation_timeout_seconds
            )
        )

    def can_rewrite(self) -> bool:
        return self.rewrite_calls < self._limits.max_rewrite_calls and self._time_left(
            self._limits.rewrite_timeout_seconds
        )
