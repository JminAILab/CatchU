"""설명 초안·생각해볼 질문·Catch 제목 생성(#120).

후보 판정(#118) 결과와 같은 수집 결과를 받아 후보마다 제공자 비종속 생성 호출로 설명 초안·질문·제목을
채운다. 제공자는 `GenerationProvider` Protocol로 주입한다. 실제 제공자 어댑터(`app.generation.claude`)는
SDK를 불러오므로 여기서 다시 내보내지 않고, 만드는 쪽(큐 소비자 자식, `app.consumer.child`)에서 직접 불러온다.
처리 순서 연결은 #121의 `app.processing.live`다. 규칙과 상한은 `worker/docs/generation.md`에 있다.
"""

from app.generation.flow import GenerationReport, GenerationRun, run_generation
from app.generation.limits import PROPOSED_GENERATION_LIMITS, GenerationLimits
from app.generation.outcome import GenerationFailureCode
from app.generation.provider import (
    GenerationProvider,
    ProviderError,
    ProviderRequest,
    UnusableResponse,
)

__all__ = [
    "PROPOSED_GENERATION_LIMITS",
    "GenerationFailureCode",
    "GenerationLimits",
    "GenerationProvider",
    "GenerationReport",
    "GenerationRun",
    "ProviderError",
    "ProviderRequest",
    "UnusableResponse",
    "run_generation",
]
