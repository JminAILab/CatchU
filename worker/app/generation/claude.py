"""Anthropic Claude API 생성 제공자(#120). 제공자·시작 모델·처리 위치는 #119 결정(2026-10-14)이다.

`GenerationProvider`를 구현한다. 생성 호출 한 번은 Messages API 요청 한 번이고, 실패해도 다시 보내지 않는다.

- 접속 주소는 코드에 고정하고 API 키와 함께 SDK 클라이언트에 직접 넘긴다. 그래서 `ANTHROPIC_BASE_URL`·
  `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN` 환경변수가 주소·자격정보를 바꾸지 못한다. redirect는 따라가지
  않는다.
- SDK 기본 재시도(2회, 시간 초과 포함)를 끈다(`max_retries=0`).
- 요청의 timeout_seconds를 호출마다 넘긴다. 생성 흐름은 남은 시간이 그만큼 있을 때만 호출을 시작하므로 이
  값은 남은 시간 이하다. SDK 시간 제한이 연결·읽기 단계마다 걸리는지 전체 경과에 걸리는지는 문서에 없어,
  시간 제한을 넘겨 돌아온 응답은 생성 흐름(`flow._call`)이 따로 버린다.
- 추론 위치는 미국으로 고정하고(`inference_geo="us"`), 모델의 생각(thinking)은 끈다.
- 지시문은 system 칸에, 신뢰할 수 없는 자료는 user 칸에 따로 둔다.

운영 로그에는 호출마다 호출 종류·모델 ID·토큰 사용량·멈춘 이유·실패 원인 구분·Anthropic 요청 ID·걸린
시간만 남긴다. 지시문·자료·응답 글·오류 원문·거절 설명·API 키는 남기지 않는다.
"""

import logging
import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

import anthropic
import httpx2
from anthropic import Anthropic, DefaultHttpxClient
from anthropic.types import Message, ThinkingConfigParam

from app.collection.credentials import AccessToken
from app.generation.provider import (
    ProviderError,
    ProviderRequest,
    Purpose,
    UnusableResponse,
)

logger = logging.getLogger(__name__)

BASE_URL: Final = "https://api.anthropic.com"
INFERENCE_GEO: Final = "us"
DEFAULT_MODEL: Final = "claude-haiku-5-5"
# 응답 최대 출력(바이트)보다 적게 잡지 않는다. 출력 토큰 하나는 1바이트 이상이므로, 최대 출력 안의 응답은
# 이 토큰 수 안에서 끝난다. 생각을 끄므로 모두 응답 글에 쓰인다.
MIN_MAX_TOKENS: Final = 4_000

# 받는 모델과 그 모델에서 생각을 끄는 설정. 표에 없는 모델은 받지 않는다(30일 보관이 필수인 모델이나 단가가
# 큰 모델을 설정 실수로 쓰지 않게 한다). Haiku 5.5는 `disabled`로 끄고(노력 수준 high 이하, 기본 medium),
# Sonnet 5.5는 `disabled`를 400으로 거절해 `between_tools`로 끈다. Sonnet은 생성 호출 품질 비교 후보다(#119
# 4.2). Sonnet 설정은 실제 호출로 확인하지 않았다.
THINKING_OFF: Final[Mapping[str, ThinkingConfigParam]] = {
    "claude-haiku-5-5": {"type": "disabled"},
    "claude-sonnet-5-5": {"type": "between_tools"},
}

# 지출 상한·크레딧 소진을 운영 로그에서 가르는 공식 문서 문구(2026-10-14 확인). 원문은 로그에 남기지 않는다.
# - 등급 월 지출 상한: 429, error.details.error_code (Rate limits 「Reaching your spend cap」)
# - 직접 정한 지출 상한: 400, 메시지가 이 말로 시작 (Rate limits 「Setting your own spend limit」)
# - 크레딧 소진: 상태 코드 미기재, 메시지 (API credits for Max and Team plans 「When credits run out」)
_SPEND_CAP_CODE: Final = "enforced_spend_limit_reached"
_SPEND_LIMIT_PREFIXES: Final = (
    "You have reached your specified API usage limits",
    "You have reached your specified workspace API usage limits",
)
_CREDIT_PREFIX: Final = "Your credit balance is too low"

_STATUS_CAUSES: Final[Mapping[int, str]] = {
    400: "BAD_REQUEST",
    401: "AUTHENTICATION",
    402: "BILLING",
    403: "PERMISSION",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "REQUEST_TOO_LARGE",
    429: "RATE_LIMIT",
    500: "SERVER_ERROR",
    504: "SERVER_TIMEOUT",
    529: "OVERLOADED",
}


@dataclass(frozen=True)
class ClaudeModels:
    """호출 종류마다 고정으로 쓰는 모델.

    실패한 호출을 다른 모델로 다시 보내는 경로는 두지 않는다(#120 「모델 대체」를 추가하지 않음).
    """

    generate: str = DEFAULT_MODEL
    rewrite_title: str = DEFAULT_MODEL

    def __post_init__(self) -> None:
        # 설정 값이 다른 칸(키 등)과 바뀌어 들어왔을 수 있어 예외에 값을 싣지 않는다.
        if self.generate not in THINKING_OFF or self.rewrite_title not in THINKING_OFF:
            raise ValueError("생성 제공자가 받지 않는 모델이다")

    def for_purpose(self, purpose: Purpose) -> str:
        return self.generate if purpose == "GENERATE" else self.rewrite_title


class ClaudeProvider:
    """Claude Messages API로 생성 호출 한 번을 한다. 클라이언트 하나를 만들어 호출마다 재사용한다."""

    def __init__(
        self,
        api_key: AccessToken,
        models: ClaudeModels | None = None,
        *,
        transport: httpx2.BaseTransport | None = None,
    ) -> None:
        """transport는 시험이 네트워크 없이 SDK 전체를 돌릴 때만 넘긴다. 운영은 기본 transport다."""
        _quiet_sdk_debug_log()
        self._models = models if models is not None else ClaudeModels()
        self._client = Anthropic(
            api_key=api_key.reveal(),
            base_url=BASE_URL,
            max_retries=0,
            http_client=DefaultHttpxClient(transport=transport, follow_redirects=False),
        )

    def complete(self, request: ProviderRequest) -> str:
        model = self._models.for_purpose(request.purpose)
        started = time.monotonic()
        try:
            message = self._client.messages.create(
                model=model,
                max_tokens=max(request.max_output_bytes, MIN_MAX_TOKENS),
                system=request.instructions,
                messages=[{"role": "user", "content": request.data}],
                thinking=THINKING_OFF[model],
                inference_geo=INFERENCE_GEO,
                timeout=request.timeout_seconds,
            )
        # 원인 예외를 잇지 않는다(from None). SDK 예외에는 응답 원문이 들어 있다.
        except anthropic.APITimeoutError:
            _log_failure(request.purpose, model, "TIMEOUT", started)
            raise TimeoutError("생성 제공자 호출 시간 초과") from None
        except anthropic.APIConnectionError:
            _log_failure(request.purpose, model, "CONNECTION", started)
            raise ProviderError("생성 제공자 연결 실패") from None
        except anthropic.APIStatusError as error:
            cause = _status_cause(error)
            _log_failure(
                request.purpose,
                model,
                cause,
                started,
                status=error.status_code,
                error_type=error.type,
                request_id=error.request_id,
            )
            raise ProviderError(f"생성 제공자 호출 실패: {cause}") from None
        except anthropic.APIError:
            # 응답 모양 검사 실패 등 상태 코드 밖의 SDK 오류.
            _log_failure(request.purpose, model, "INVALID_RESPONSE", started)
            raise ProviderError("생성 제공자 응답 오류") from None
        return _text(request.purpose, message, started)


def _text(purpose: Purpose, message: Message, started: float) -> str:
    """정상으로 끝난 응답의 글만 돌려준다. 거절·출력 상한·그 밖의 멈춤은 응답 전체를 쓰지 않는다."""
    stop = message.stop_reason
    category = None
    if stop == "refusal" and message.stop_details is not None:
        category = message.stop_details.category
    usage = message.usage
    logger.log(
        logging.INFO if stop == "end_turn" else logging.WARNING,
        "생성 제공자 응답: purpose=%s model=%s stopReason=%s refusalCategory=%s "
        "inputTokens=%d outputTokens=%d inferenceGeo=%s elapsedMs=%d requestId=%s",
        purpose,
        message.model,
        stop,
        category,
        usage.input_tokens,
        usage.output_tokens,
        usage.inference_geo,
        _elapsed_ms(started),
        message._request_id,
    )
    if stop == "max_tokens":
        raise UnusableResponse("TOO_LARGE")
    if stop != "end_turn":
        raise UnusableResponse("UNREADABLE")
    return "".join(block.text for block in message.content if block.type == "text")


def _status_cause(error: anthropic.APIStatusError) -> str:
    """상태 코드·오류 종류와 문서에 적힌 문구로 원인을 고정 이름 하나로 가른다."""
    detail = error.body.get("error") if isinstance(error.body, dict) else None
    detail = detail if isinstance(detail, dict) else {}
    text = detail.get("message")
    text = text if isinstance(text, str) else ""
    codes = detail.get("details")
    code = codes.get("error_code") if isinstance(codes, dict) else None
    if text.startswith(_CREDIT_PREFIX):
        return "CREDIT_EXHAUSTED"
    if error.status_code == 429 and code == _SPEND_CAP_CODE:
        return "SPEND_CAP"
    if error.status_code == 400 and text.startswith(_SPEND_LIMIT_PREFIXES):
        return "SPEND_LIMIT"
    cause = _STATUS_CAUSES.get(error.status_code)
    if cause is not None:
        return cause
    return "SERVER_ERROR" if error.status_code >= 500 else "HTTP_ERROR"


def _log_failure(
    purpose: Purpose,
    model: str,
    cause: str,
    started: float,
    *,
    status: int | None = None,
    error_type: str | None = None,
    request_id: str | None = None,
) -> None:
    logger.warning(
        "생성 제공자 실패: purpose=%s model=%s cause=%s status=%s errorType=%s "
        "elapsedMs=%d requestId=%s",
        purpose,
        model,
        cause,
        status,
        error_type,
        _elapsed_ms(started),
        request_id,
    )


def _elapsed_ms(started: float) -> int:
    return round((time.monotonic() - started) * 1000)


def _quiet_sdk_debug_log() -> None:
    """SDK는 DEBUG 수준에서 요청 본문 전체(보낸 변경 줄)를 로그에 남긴다(`Request options`).

    회원 자료가 운영 로그에 남지 않게 SDK 로거를 INFO 아래로 내리지 않는다. `ANTHROPIC_LOG=debug`나 루트
    로거의 DEBUG 설정도 이것으로 막는다. 이미 INFO보다 높게 둔 설정은 그대로 둔다.
    """
    sdk = logging.getLogger("anthropic")
    if sdk.level < logging.INFO:
        sdk.setLevel(logging.INFO)
