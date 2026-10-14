"""Anthropic Claude API 생성 제공자(#120). 제공자·시작 모델·처리 위치는 #119 결정(2026-10-14)이다.

`GenerationProvider`를 구현한다. 생성 호출 한 번은 Messages API 요청 한 번이고, 실패해도 다시 보내지 않는다.

- 접속 주소는 코드에 고정하고 API 키와 함께 SDK 클라이언트에 직접 넘긴다. 그래서 `ANTHROPIC_BASE_URL`·
  `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN` 환경변수가 주소·자격정보를 바꾸지 못한다. 머리글을 덧붙이는
  `ANTHROPIC_CUSTOM_HEADERS`가 있으면 만들지 않는다. HTTP 전송은 프록시 환경변수를 읽지 않고, redirect를
  따라가지 않으며, 응답 본문을 `MAX_RESPONSE_BYTES`까지만 받는다.
- SDK 기본 재시도(2회, 시간 초과 포함)를 끈다(`max_retries=0`).
- 요청의 timeout_seconds를 호출마다 넘긴다. 생성 흐름은 남은 시간이 그만큼 있을 때만 호출을 시작하므로 이
  값은 남은 시간 이하다. SDK 시간 제한은 연결·읽기 등 단계마다 걸려 전체 경과를 막지 않으므로, HTTP 전송이
  머리글을 받은 직후와 본문 조각마다 호출 시작부터 지난 시간을 보고 넘으면 시간 초과로 끊는다. 막혀 있는 읽기
  한 번은 그 읽기의 시간 제한까지 더 걸릴 수 있어 최악은 시간 제한의 2배다. 시간 제한을 넘겨 돌아온 응답은
  생성 흐름(`flow._call`)도 따로 버린다.
- 추론 위치는 미국으로 고정하고(`inference_geo="us"`), 모델의 생각(thinking)은 끈다.
- 지시문은 system 칸에, 신뢰할 수 없는 자료는 user 칸에 따로 둔다.

운영 로그에는 호출마다 호출 종류·모델 ID·토큰 사용량·멈춘 이유·실패 원인 구분·Anthropic 요청 ID·걸린
시간만 남긴다. 지시문·자료·응답 글·오류 원문·거절 설명·API 키는 남기지 않는다. 응답에서 온 값은 정해 둔
목록·모양에 맞을 때만 그대로 쓴다.
"""

import json
import logging
import os
import re
import time
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from typing import Final

import anthropic
import httpx2
from anthropic import DEFAULT_CONNECTION_LIMITS, Anthropic, DefaultHttpxClient
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
# 최대 출력 바이트(4,000)보다 적게 잡지 않는다. 토큰 수와 응답 글 길이는 일대일이 아니어서 이 값으로 최대 출력
# 안의 응답이 잘리지 않는다고 보장하지는 못한다. 잘리면 `max_tokens` 멈춤으로 와 전체 응답을 쓰지 않는다.
MIN_MAX_TOKENS: Final = 4_000
# 받는 HTTP 응답 본문 상한(바이트, 압축하지 않은 크기). 최대 출력 4,000 B 응답의 JSON 본문보다 넉넉히 크다.
MAX_RESPONSE_BYTES: Final = 256 * 1024

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

# 응답에서 와 운영 로그에 쓰는 값의 허용 목록·모양. 맞지 않으면 OTHER·INVALID로 적는다(원문·줄바꿈 차단).
_STOP_REASONS: Final = frozenset(
    {
        "end_turn",
        "max_tokens",
        "stop_sequence",
        "tool_use",
        "pause_turn",
        "refusal",
        "model_context_window_exceeded",
    }
)
_REFUSAL_CATEGORIES: Final = frozenset(
    {"cyber", "bio", "frontier_llm", "reasoning_extraction", "general_harms"}
)
_ERROR_TYPES: Final = frozenset(
    {
        "invalid_request_error",
        "authentication_error",
        "billing_error",
        "permission_error",
        "not_found_error",
        "conflict_error",
        "request_too_large",
        "rate_limit_error",
        "api_error",
        "timeout_error",
        "overloaded_error",
    }
)
_SAFE_ID: Final = re.compile(r"[A-Za-z0-9._:-]{1,128}")

# 걸린 시간과 호출 마감을 재는 시계(초). 시험이 실제로 기다리지 않고 시간을 움직일 때만 바꾼다.
_monotonic: Callable[[], float] = time.monotonic


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
        """transport는 시험이 네트워크 없이 SDK 전체를 돌릴 때만 넘긴다. 운영은 환경변수를 읽지 않는 기본
        HTTP 전송이다. 어느 쪽이든 응답 본문 상한을 씌운다."""
        if "ANTHROPIC_CUSTOM_HEADERS" in os.environ:
            # SDK는 이 값을 머리글로 붙이고, 그 머리글이 x-api-key·Host까지 덮어쓴다. 값은 예외에 싣지 않는다.
            raise ValueError(
                "ANTHROPIC_CUSTOM_HEADERS 환경변수가 있으면 생성 제공자를 만들지 않는다"
            )
        _drop_sdk_debug_records()
        self._models = models if models is not None else ClaudeModels()
        inner = (
            transport
            if transport is not None
            else httpx2.HTTPTransport(trust_env=False, limits=DEFAULT_CONNECTION_LIMITS)
        )
        self._client = Anthropic(
            api_key=api_key.reveal(),
            base_url=BASE_URL,
            max_retries=0,
            # 압축된 응답은 풀린 크기를 미리 셀 수 없어 압축하지 않은 응답만 받는다.
            default_headers={"Accept-Encoding": "identity"},
            http_client=DefaultHttpxClient(
                transport=_CappedTransport(inner),
                follow_redirects=False,
                trust_env=False,
            ),
        )

    def complete(self, request: ProviderRequest) -> str:
        model = self._models.for_purpose(request.purpose)
        started = _monotonic()
        # 실패 예외는 except 밖에서 낸다. SDK 예외는 응답 원문·요청 본문·키 머리글을 담고 있어, 새 예외의
        # 원인(__cause__)으로도 문맥(__context__)으로도 이어지지 않게 한다.
        failure: _Failure
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
        except anthropic.APITimeoutError:
            failure = _Failure("TIMEOUT")
        except anthropic.APIConnectionError as error:
            failure = _connection_failure(error)
        except anthropic.APIStatusError as error:
            failure = _Failure(
                _status_cause(error),
                status=error.status_code,
                error_type=_listed(error.type, _ERROR_TYPES),
                request_id=_safe_id(error.request_id),
            )
        except (anthropic.APIError, json.JSONDecodeError):
            # 상태 코드 밖의 응답 오류(JSON이 아닌 본문, SDK 응답 검사 실패).
            failure = _Failure("INVALID_RESPONSE")
        else:
            return _text(request.purpose, model, message, started)
        _log_failure(request.purpose, model, failure, started)
        raise failure.exception()


@dataclass(frozen=True)
class _Failure:
    """실패 원인과 로그에 남길 안전한 값. SDK 예외 객체는 담지 않는다."""

    cause: str
    status: int | None = None
    error_type: str | None = None
    request_id: str | None = None

    def exception(self) -> Exception:
        if self.cause == "TIMEOUT":
            return TimeoutError("생성 제공자 호출 시간 초과")
        if self.cause == "RESPONSE_TOO_LARGE":
            return UnusableResponse("TOO_LARGE")
        return ProviderError(f"생성 제공자 호출 실패: {self.cause}")


@dataclass(frozen=True)
class _Reply:
    text: str
    stop: str | None
    category: str | None
    model: str
    input_tokens: int
    output_tokens: int
    inference_geo: str | None
    request_id: str | None


def _text(purpose: Purpose, model: str, message: object, started: float) -> str:
    """정상으로 끝난 응답의 글만 돌려준다. 거절·출력 상한·그 밖의 멈춤은 응답 전체를 쓰지 않는다."""
    reply = _read(message)
    if reply is None:
        _log_failure(purpose, model, _Failure("INVALID_RESPONSE"), started)
        raise ProviderError("생성 제공자 호출 실패: INVALID_RESPONSE")
    logger.log(
        logging.INFO if reply.stop == "end_turn" else logging.WARNING,
        "생성 제공자 응답: purpose=%s model=%s stopReason=%s refusalCategory=%s "
        "inputTokens=%d outputTokens=%d inferenceGeo=%s elapsedMs=%d requestId=%s",
        purpose,
        _safe_id(reply.model),
        _listed(reply.stop, _STOP_REASONS),
        _listed(reply.category, _REFUSAL_CATEGORIES),
        reply.input_tokens,
        reply.output_tokens,
        _safe_id(reply.inference_geo),
        _elapsed_ms(started),
        _safe_id(reply.request_id),
    )
    if reply.stop == "max_tokens":
        raise UnusableResponse("TOO_LARGE")
    if reply.stop != "end_turn":
        raise UnusableResponse("UNREADABLE")
    return reply.text


def _read(message: object) -> _Reply | None:
    """쓰기 전에 필요한 칸의 모양을 확인한다. SDK는 응답을 엄격히 검사하지 않아 칸이 빠지거나 자료형이 달라도
    객체를 만든다. 맞지 않으면 None."""
    if not isinstance(message, Message):
        return None
    usage = getattr(message, "usage", None)
    content = getattr(message, "content", None)
    stop = getattr(message, "stop_reason", None)
    model = getattr(message, "model", None)
    if usage is None or not isinstance(content, list) or not isinstance(model, str):
        return None
    if stop is not None and not isinstance(stop, str):
        return None
    tokens = (
        getattr(usage, "input_tokens", None),
        getattr(usage, "output_tokens", None),
    )
    if type(tokens[0]) is not int or type(tokens[1]) is not int:
        return None
    texts: list[str] = []
    for block in content:
        if getattr(block, "type", None) != "text":
            continue
        text = getattr(block, "text", None)
        if not isinstance(text, str):
            return None
        texts.append(text)
    category = None
    if stop == "refusal":
        category = getattr(getattr(message, "stop_details", None), "category", None)
    geo = getattr(usage, "inference_geo", None)
    request_id = getattr(message, "_request_id", None)
    return _Reply(
        text="".join(texts),
        stop=stop,
        category=category if isinstance(category, str) else None,
        model=model,
        input_tokens=tokens[0],
        output_tokens=tokens[1],
        inference_geo=geo if isinstance(geo, str) else None,
        request_id=request_id if isinstance(request_id, str) else None,
    )


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


def _connection_failure(error: anthropic.APIConnectionError) -> _Failure:
    """SDK는 응답을 받는 중에 난 예외를 연결 오류로 감싼다. 응답 상한·압축 거부는 따로 가른다."""
    cause = error.__cause__
    if isinstance(cause, _ResponseTooLarge):
        return _Failure("RESPONSE_TOO_LARGE", status=cause.status)
    if isinstance(cause, _UnexpectedEncoding):
        return _Failure("INVALID_RESPONSE", status=cause.status)
    return _Failure("CONNECTION")


def _log_failure(
    purpose: Purpose, model: str, failure: _Failure, started: float
) -> None:
    logger.warning(
        "생성 제공자 실패: purpose=%s model=%s cause=%s status=%s errorType=%s "
        "elapsedMs=%d requestId=%s",
        purpose,
        model,
        failure.cause,
        failure.status,
        failure.error_type,
        _elapsed_ms(started),
        failure.request_id,
    )


def _listed(value: object, allowed: frozenset[str]) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) and value in allowed else "OTHER"


def _safe_id(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str) and _SAFE_ID.fullmatch(value):
        return value
    return "INVALID"


def _elapsed_ms(started: float) -> int:
    return round((_monotonic() - started) * 1000)


class _ResponseTooLarge(Exception):
    def __init__(self, status: int) -> None:
        super().__init__("응답 본문 상한 초과")
        self.status = status


class _UnexpectedEncoding(Exception):
    def __init__(self, status: int) -> None:
        super().__init__("압축된 응답")
        self.status = status


class _CappedStream(httpx2.SyncByteStream):
    def __init__(
        self,
        stream: httpx2.SyncByteStream,
        status: int,
        deadline: float | None,
        request: httpx2.Request,
    ) -> None:
        self._stream = stream
        self._status = status
        self._deadline = deadline
        self._request = request

    def __iter__(self) -> Iterator[bytes]:
        received = 0
        for chunk in self._stream:
            received += len(chunk)
            if received > MAX_RESPONSE_BYTES:
                raise _ResponseTooLarge(self._status)
            if _past(self._deadline):
                raise _timed_out(self._request)
            yield chunk

    def close(self) -> None:
        self._stream.close()


class _CappedTransport(httpx2.BaseTransport):
    """응답을 호출 마감과 MAX_RESPONSE_BYTES 안에서만 받는다. SDK는 본문을 끝까지 읽은 뒤에 해석하므로 그 전에
    끊는다. 압축된 응답(Content-Encoding이 identity가 아님)은 풀린 크기를 셀 수 없어 받지 않는다.

    SDK 시간 제한은 연결·읽기 등 단계마다 걸려, 서버가 그보다 짧은 간격으로 조각을 계속 보내면 호출이 끝나지
    않는다. 그래서 그 시간 제한을 호출 전체의 상한으로도 쓴다. 머리글을 받은 직후와 본문 조각마다 지난 시간을
    보며, 막혀 있는 읽기 한 번은 그 읽기의 시간 제한까지 더 걸릴 수 있다."""

    def __init__(self, inner: httpx2.BaseTransport) -> None:
        self._inner = inner

    def handle_request(self, request: httpx2.Request) -> httpx2.Response:
        limit = _call_limit(request)
        deadline = None if limit is None else _monotonic() + limit
        response = self._inner.handle_request(request)
        if _past(deadline):
            response.close()
            raise _timed_out(request)
        encoding = response.headers.get("content-encoding", "identity").strip().lower()
        if encoding not in ("", "identity") or not isinstance(
            response.stream, httpx2.SyncByteStream
        ):
            response.close()
            raise _UnexpectedEncoding(response.status_code)
        return httpx2.Response(
            response.status_code,
            headers=response.headers,
            stream=_CappedStream(
                response.stream, response.status_code, deadline, request
            ),
            extensions=response.extensions,
        )

    def close(self) -> None:
        self._inner.close()


def _call_limit(request: httpx2.Request) -> float | None:
    """SDK가 요청에 실은 단계별 시간 제한(호출마다 넘긴 값) 가운데 가장 큰 값. 없으면 None."""
    timeouts = request.extensions.get("timeout")
    if not isinstance(timeouts, dict):
        return None
    values = [
        value
        for value in timeouts.values()
        if isinstance(value, int | float) and not isinstance(value, bool)
    ]
    return float(max(values)) if values else None


def _past(deadline: float | None) -> bool:
    return deadline is not None and _monotonic() > deadline


def _timed_out(request: httpx2.Request) -> httpx2.ReadTimeout:
    """SDK는 HTTP 전송의 시간 초과를 APITimeoutError로 바꾸고, 어댑터는 그것을 TimeoutError로 바꾼다."""
    return httpx2.ReadTimeout("호출 시간 제한 초과", request=request)


class _DropBelowInfo(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno >= logging.INFO


_SDK_DEBUG_FILTER: Final = _DropBelowInfo()


def _drop_sdk_debug_records() -> None:
    """SDK는 DEBUG에서 요청 본문 전체(보낸 변경 줄)를 남긴다(`anthropic._base_client`의 `Request options`).

    상위 로거의 수준으로는 하위 로거가 만든 기록을 막지 못한다(하위 로거에 수준·핸들러를 직접 달면 그대로
    나간다). 로거 필터는 그 로거가 만든 기록을 수준·핸들러·전파 설정과 관계없이 거르므로, 지금 있는 SDK
    로거 모두에 INFO 아래 기록을 버리는 필터를 단다. SDK 모듈은 불러올 때 로거를 만든다.
    """
    for name in list(logging.Logger.manager.loggerDict):
        if name == "anthropic" or name.startswith("anthropic."):
            sdk = logging.getLogger(name)
            if _SDK_DEBUG_FILTER not in sdk.filters:
                sdk.addFilter(_SDK_DEBUG_FILTER)
