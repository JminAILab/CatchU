"""Anthropic Claude API 생성 제공자(#120·#119 결정) 시험.

SDK는 진짜를 쓰고 HTTP 전송만 가짜(httpx2.MockTransport)로 바꾼다. 그래서 재시도·시간 제한·접속 주소·
redirect·응답 상한·요청 본문을 SDK가 실제로 만드는 HTTP 요청·응답에서 확인한다. 네트워크 연결은 막는다.
응답은 공식 문서의 모양을 본뜬 합성 값이고, 실제 API의 응답 시간·토큰 수·결과 품질은 이 시험으로 알 수 없다.
"""

import gzip
import io
import json
import logging
import socket
from collections.abc import Callable, Iterator
from typing import Any

import anthropic
import httpx2
import pytest
from candidate_scenarios import (
    ROOT,
    Pull,
    Scenario,
    change,
    commit,
    root_commit,
)
from generation_scenarios import ScriptedProvider, generation_case, naive
from github_synthetic import MEMBER, sha

from app.collection.credentials import AccessToken
from app.generation import ProviderError, ProviderRequest, UnusableResponse
from app.generation.claude import MAX_RESPONSE_BYTES, ClaudeModels, ClaudeProvider
from app.generation.provider import Purpose

KEY = "".join(("synthetic-", "claude-key-", "0" * 16))
INSTRUCTIONS = "합성 지시문 INSTRUCTION-MARK-51"
DATA = '{"commits":[{"id":"c1","note":"DATA-MARK-73"}]}'
ANSWER = '{"title":{"target":"FILE","file":"c1f1"},"note":"ANSWER-MARK-29"}'
ERROR_TEXT = "upstream detail ERROR-MARK-88"
REFUSAL_TEXT = "refusal explanation REFUSAL-MARK-64"
LEAKS = (KEY, "INSTRUCTION-MARK-51", "DATA-MARK-73", "ANSWER-MARK-29", "ERROR-MARK-88")
SDK_LOGGERS = ("anthropic", "anthropic._base_client")


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*args: object, **kwargs: object) -> None:
        raise AssertionError("외부 연결 시도")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)


@pytest.fixture(autouse=True)
def sdk_loggers() -> Iterator[None]:
    """시험이 바꾼 SDK 로거의 수준·전파·핸들러를 원래대로 돌린다."""
    saved = []
    for name in SDK_LOGGERS:
        each = logging.getLogger(name)
        saved.append((each, each.level, each.propagate, list(each.handlers)))
    yield
    for each, level, propagate, handlers in saved:
        each.setLevel(level)
        each.propagate = propagate
        each.handlers[:] = handlers


# 가짜 Messages API


Reply = Callable[[httpx2.Request], httpx2.Response]


class FakeApi:
    """받은 HTTP 요청을 기록하고 정해 둔 응답을 돌려준다."""

    def __init__(self, reply: Reply) -> None:
        self._reply = reply
        self.requests: list[httpx2.Request] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        return self._reply(request)

    def provider(self, models: ClaudeModels | None = None) -> ClaudeProvider:
        return ClaudeProvider(
            AccessToken(KEY), models, transport=httpx2.MockTransport(self)
        )

    def body(self, index: int = 0) -> dict[str, Any]:
        value = json.loads(self.requests[index].content)
        assert isinstance(value, dict)
        return value


def message_body(
    text: str = ANSWER,
    *,
    stop_reason: str = "end_turn",
    model: str = "claude-haiku-5-5",
    stop_details: dict[str, Any] | None = None,
    usage: tuple[int, int] = (1234, 56),
) -> dict[str, Any]:
    return {
        "id": "msg_synthetic",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_details": stop_details,
        "stop_sequence": None,
        "usage": {
            "input_tokens": usage[0],
            "output_tokens": usage[1],
            "inference_geo": "us",
        },
    }


def message(
    text: str = ANSWER, *, request_id: str = "req_synthetic_ok", **fields: Any
) -> Reply:
    body = message_body(text, **fields)
    return lambda request: httpx2.Response(
        200, json=body, headers={"request-id": request_id}
    )


def raw(status: int, content: bytes, **headers: str) -> Reply:
    return lambda request: httpx2.Response(
        status,
        content=content,
        headers={"content-type": "application/json", **headers},
    )


def api_error(
    status: int,
    error_type: str,
    text: str = ERROR_TEXT,
    *,
    details: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> Reply:
    error: dict[str, Any] = {"type": error_type, "message": text}
    if details is not None:
        error["details"] = details
    body = {"type": "error", "error": error, "request_id": "req_synthetic_err"}
    return lambda request: httpx2.Response(
        status,
        json=body,
        headers={"request-id": "req_synthetic_err", **(headers or {})},
    )


def call(
    purpose: Purpose = "GENERATE", timeout: float = 45.0, max_output: int = 4_000
) -> ProviderRequest:
    return ProviderRequest(
        purpose=purpose,
        instructions=INSTRUCTIONS,
        data=DATA,
        timeout_seconds=timeout,
        max_output_bytes=max_output,
    )


def assert_no_leak(text: str) -> None:
    for leaked in LEAKS:
        assert leaked not in text


def assert_detached(error: BaseException) -> None:
    """SDK 예외(원문·요청 본문·키 머리글을 담음)가 원인으로도 문맥으로도 이어지지 않는다."""
    assert error.__cause__ is None
    assert error.__context__ is None


# 정상 응답과 요청 설정


def test_normal_response_returns_text_with_fixed_settings(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """정상 응답의 글만 돌려준다. 요청은 고정 주소·지시문과 자료 분리·Haiku 5.5·생각 끔·미국 처리·
    최대 출력 4,000 토큰·압축하지 않은 응답·호출 시간 제한 45초로 한 번 나간다. 운영 로그에는 모델 ID·토큰
    사용량만 남는다."""
    api = FakeApi(message())

    with caplog.at_level(logging.INFO, logger="app.generation.claude"):
        text = api.provider().complete(call())

    assert text == ANSWER
    assert len(api.requests) == 1
    sent = api.requests[0]
    assert str(sent.url) == "https://api.anthropic.com/v1/messages"
    assert sent.headers["x-api-key"] == KEY
    assert "authorization" not in sent.headers
    assert sent.headers["accept-encoding"] == "identity"
    assert api.body() == {
        "model": "claude-haiku-5-5",
        "max_tokens": 4_000,
        "system": INSTRUCTIONS,
        "messages": [{"role": "user", "content": DATA}],
        "thinking": {"type": "disabled"},
        "inference_geo": "us",
    }
    assert sent.extensions["timeout"] == {
        "connect": 45.0,
        "read": 45.0,
        "write": 45.0,
        "pool": 45.0,
    }
    assert "model=claude-haiku-5-5" in caplog.text
    assert "stopReason=end_turn" in caplog.text
    assert "inputTokens=1234 outputTokens=56 inferenceGeo=us" in caplog.text
    assert "requestId=req_synthetic_ok" in caplog.text
    assert_no_leak(caplog.text)


def test_log_takes_model_and_usage_from_the_response(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """로그의 모델 ID·토큰 수·요청 ID는 요청 설정이 아니라 응답에서 온 값이다."""
    api = FakeApi(
        message(
            model="claude-haiku-5-5-synthetic-variant",
            usage=(777, 88),
            request_id="req_synthetic_variant",
        )
    )

    with caplog.at_level(logging.INFO, logger="app.generation.claude"):
        api.provider().complete(call())

    assert "model=claude-haiku-5-5-synthetic-variant" in caplog.text
    assert "inputTokens=777 outputTokens=88" in caplog.text
    assert "requestId=req_synthetic_variant" in caplog.text


@pytest.mark.parametrize(("max_output", "max_tokens"), [(1_000, 4_000), (6_000, 6_000)])
def test_max_tokens_is_at_least_4000(max_output: int, max_tokens: int) -> None:
    """최대 출력 바이트가 작아도 max_tokens는 4,000 아래로 내리지 않고, 크면 그만큼 올린다."""
    api = FakeApi(message())

    api.provider().complete(call(max_output=max_output))

    assert api.body()["max_tokens"] == max_tokens


@pytest.mark.parametrize(
    ("models", "generate", "rewrite"),
    [
        (
            ClaudeModels(generate="claude-sonnet-5-5"),
            "claude-sonnet-5-5",
            "claude-haiku-5-5",
        ),
        (
            ClaudeModels(rewrite_title="claude-sonnet-5-5"),
            "claude-haiku-5-5",
            "claude-sonnet-5-5",
        ),
    ],
)
def test_models_are_fixed_per_call_kind(
    models: ClaudeModels, generate: str, rewrite: str
) -> None:
    """생성 호출과 제목 고쳐 쓰기 호출의 모델을 따로 정한다. 고쳐 쓰기는 자기 시간 제한(20초)을 쓴다.
    Sonnet 5.5는 `disabled`를 받지 않아 `between_tools`로 생각을 끈다."""
    thinking = {
        "claude-haiku-5-5": {"type": "disabled"},
        "claude-sonnet-5-5": {"type": "between_tools"},
    }
    api = FakeApi(message())
    provider = api.provider(models)

    provider.complete(call("GENERATE"))
    provider.complete(call("REWRITE_TITLE", timeout=20.0))

    assert api.body(0)["model"] == generate
    assert api.body(0)["thinking"] == thinking[generate]
    assert api.body(1)["model"] == rewrite
    assert api.body(1)["thinking"] == thinking[rewrite]
    assert api.requests[1].extensions["timeout"]["read"] == 20.0


def test_unknown_model_is_rejected_without_echoing_it() -> None:
    """표에 없는 모델(30일 보관이 필수인 모델 포함)은 받지 않는다. 예외에 설정 값을 싣지 않는다."""
    for model in (
        "claude-fable-5-1",
        "claude-opus-5-5",
        "synthetic-value-in-wrong-field",
    ):
        with pytest.raises(ValueError) as raised:
            ClaudeModels(rewrite_title=model)
        assert model not in str(raised.value)


# 접속 경로


def test_environment_cannot_change_address_or_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ANTHROPIC_BASE_URL·키 환경변수가 있어도 고정 주소와 넘긴 키로만 보낸다."""
    monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://collector.example.test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "env-key-should-not-be-used")
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "env-token-should-not-be-used")
    api = FakeApi(message())

    api.provider().complete(call())

    sent = api.requests[0]
    assert sent.url.host == "api.anthropic.com"
    assert sent.url.scheme == "https"
    assert sent.headers["host"] == "api.anthropic.com"
    assert sent.headers["x-api-key"] == KEY
    assert "authorization" not in sent.headers


def test_custom_headers_environment_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SDK가 머리글로 붙여 키·Host를 덮어쓰는 ANTHROPIC_CUSTOM_HEADERS가 있으면 만들지 않는다."""
    monkeypatch.setenv(
        "ANTHROPIC_CUSTOM_HEADERS",
        "x-api-key: env-key-value\nHost: collector.example.test",
    )

    with pytest.raises(ValueError) as raised:
        FakeApi(message()).provider()

    assert "env-key-value" not in str(raised.value)
    assert "collector" not in str(raised.value)


def test_default_transport_ignores_proxy_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """운영 기본 전송은 환경변수를 읽지 않게 만들고, 프록시 환경변수가 있어도 프록시 경로를 두지 않는다."""
    for name in ("HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"):
        monkeypatch.setenv(name, "http://proxy.example.test:3128")
    api = FakeApi(message())
    made: list[dict[str, object]] = []

    class Recording(httpx2.MockTransport):
        def __init__(self, **kwargs: object) -> None:
            made.append(kwargs)
            super().__init__(api)

    monkeypatch.setattr(httpx2, "HTTPTransport", Recording)
    provider = ClaudeProvider(AccessToken(KEY))
    provider.complete(call())

    assert made == [{"trust_env": False, "limits": anthropic.DEFAULT_CONNECTION_LIMITS}]
    assert len(api.requests) == 1
    http = provider._client._client
    assert http.trust_env is False
    assert http._mounts == {}


def test_redirect_is_not_followed() -> None:
    """다른 주소로 보내는 redirect를 따라가지 않고 그 호출의 실패로 끝낸다."""
    api = FakeApi(
        lambda request: httpx2.Response(
            307, headers={"location": "https://collector.example.test/v1/messages"}
        )
    )

    with pytest.raises(ProviderError):
        api.provider().complete(call())

    assert [each.url.host for each in api.requests] == ["api.anthropic.com"]


# SDK 로그


def debug_everywhere_before() -> io.StringIO | None:
    logging.getLogger("anthropic").setLevel(logging.DEBUG)
    return None


def child_with_own_handler() -> io.StringIO:
    """SDK 하위 로거에 DEBUG 수준과 핸들러를 직접 달고 전파를 끈다."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setLevel(logging.DEBUG)
    child = logging.getLogger("anthropic._base_client")
    child.setLevel(logging.DEBUG)
    child.addHandler(handler)
    child.propagate = False
    return stream


SDK_DEBUG_SETUPS: dict[str, Callable[[], io.StringIO | None]] = {
    "root-and-sdk-debug": debug_everywhere_before,
    "child-own-handler": child_with_own_handler,
}


@pytest.mark.parametrize("setup", list(SDK_DEBUG_SETUPS))
def test_sdk_debug_log_does_not_record_request_data(
    setup: str, caplog: pytest.LogCaptureFixture
) -> None:
    """SDK는 DEBUG에서 요청 본문을 로그에 남긴다. 루트·SDK·하위 로거를 DEBUG로 두거나, 하위 로거에 직접
    핸들러를 달아도 지시문·자료가 남지 않는다."""
    stream = SDK_DEBUG_SETUPS[setup]()
    api = FakeApi(message())

    with caplog.at_level(logging.DEBUG):
        api.provider().complete(call())

    assert caplog.records
    assert_no_leak(caplog.text)
    if stream is not None:
        assert_no_leak(stream.getvalue())


def test_sdk_debug_set_after_construction_records_nothing(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """제공자를 만든 뒤 SDK 로거를 DEBUG로 바꿔도 요청 본문이 남지 않는다."""
    provider = FakeApi(message()).provider()
    for name in SDK_LOGGERS:
        logging.getLogger(name).setLevel(logging.DEBUG)

    with caplog.at_level(logging.DEBUG):
        provider.complete(call())

    assert_no_leak(caplog.text)


# 재시도와 시간 초과


RETRIED_BY_DEFAULT = {
    "409": api_error(409, "conflict_error"),
    "429": api_error(429, "rate_limit_error"),
    "500": api_error(500, "api_error"),
    "504": api_error(504, "timeout_error"),
    "529": api_error(529, "overloaded_error"),
}


@pytest.mark.parametrize("status", list(RETRIED_BY_DEFAULT))
def test_sdk_retries_are_off(status: str) -> None:
    """SDK가 기본으로 다시 보내는 상태 코드(재시도를 권하는 머리글 포함)에도 요청은 한 번이다."""
    reply = RETRIED_BY_DEFAULT[status]

    def answer(request: httpx2.Request) -> httpx2.Response:
        response = reply(request)
        response.headers["x-should-retry"] = "true"
        response.headers["retry-after"] = "0"
        return response

    api = FakeApi(answer)

    with pytest.raises(ProviderError):
        api.provider().complete(call())

    assert len(api.requests) == 1


def raises(error: type[httpx2.TransportError]) -> Reply:
    def reply(request: httpx2.Request) -> httpx2.Response:
        raise error("synthetic transport failure", request=request)

    return reply


@pytest.mark.parametrize("error", [httpx2.ReadTimeout, httpx2.ConnectTimeout])
def test_timeout_becomes_timeout_error_without_retry(
    error: type[httpx2.TransportError], caplog: pytest.LogCaptureFixture
) -> None:
    """SDK 시간 초과는 TimeoutError로 바뀌고 다시 보내지 않는다. SDK 예외를 잇지 않는다."""
    api = FakeApi(raises(error))

    with (
        caplog.at_level(logging.INFO, logger="app.generation.claude"),
        pytest.raises(TimeoutError) as raised,
    ):
        api.provider().complete(call())

    assert len(api.requests) == 1
    assert_detached(raised.value)
    assert "cause=TIMEOUT" in caplog.text


def test_connection_failure_becomes_provider_error_without_retry(
    caplog: pytest.LogCaptureFixture,
) -> None:
    api = FakeApi(raises(httpx2.ConnectError))

    with (
        caplog.at_level(logging.INFO, logger="app.generation.claude"),
        pytest.raises(ProviderError) as raised,
    ):
        api.provider().complete(call())

    assert not isinstance(raised.value, UnusableResponse)
    assert len(api.requests) == 1
    assert_detached(raised.value)
    assert "cause=CONNECTION" in caplog.text


# 오류 응답


CREDIT = "Your credit balance is too low to access the Anthropic API. " + ERROR_TEXT

STATUS_ERRORS: dict[str, tuple[Reply, str, str]] = {
    "400": (
        api_error(400, "invalid_request_error"),
        "BAD_REQUEST",
        "invalid_request_error",
    ),
    "400-spend-limit": (
        api_error(
            400,
            "invalid_request_error",
            "You have reached your specified API usage limits. " + ERROR_TEXT,
        ),
        "SPEND_LIMIT",
        "invalid_request_error",
    ),
    "400-workspace-spend-limit": (
        api_error(
            400,
            "invalid_request_error",
            "You have reached your specified workspace API usage limits. " + ERROR_TEXT,
        ),
        "SPEND_LIMIT",
        "invalid_request_error",
    ),
    # 크레딧 소진의 상태 코드는 문서에 없어 어느 코드로 와도 메시지로 가른다.
    "400-credit": (
        api_error(400, "invalid_request_error", CREDIT),
        "CREDIT_EXHAUSTED",
        "invalid_request_error",
    ),
    "402-credit": (
        api_error(402, "billing_error", CREDIT),
        "CREDIT_EXHAUSTED",
        "billing_error",
    ),
    "429-credit": (
        api_error(429, "rate_limit_error", CREDIT),
        "CREDIT_EXHAUSTED",
        "rate_limit_error",
    ),
    "401": (
        api_error(401, "authentication_error"),
        "AUTHENTICATION",
        "authentication_error",
    ),
    "402": (api_error(402, "billing_error"), "BILLING", "billing_error"),
    "403": (api_error(403, "permission_error"), "PERMISSION", "permission_error"),
    "404": (api_error(404, "not_found_error"), "NOT_FOUND", "not_found_error"),
    "409": (api_error(409, "conflict_error"), "CONFLICT", "conflict_error"),
    "413": (
        api_error(413, "request_too_large"),
        "REQUEST_TOO_LARGE",
        "request_too_large",
    ),
    "429": (
        api_error(429, "rate_limit_error", headers={"retry-after": "7"}),
        "RATE_LIMIT",
        "rate_limit_error",
    ),
    "429-spend-cap": (
        api_error(
            429,
            "rate_limit_error",
            details={"error_code": "enforced_spend_limit_reached"},
        ),
        "SPEND_CAP",
        "rate_limit_error",
    ),
    "500": (api_error(500, "api_error"), "SERVER_ERROR", "api_error"),
    "504": (api_error(504, "timeout_error"), "SERVER_TIMEOUT", "timeout_error"),
    "529": (api_error(529, "overloaded_error"), "OVERLOADED", "overloaded_error"),
    "418-unlisted-type": (
        api_error(418, "synthetic\nFAKE-LOG-LINE"),
        "HTTP_ERROR",
        "OTHER",
    ),
}


@pytest.mark.parametrize("case", list(STATUS_ERRORS))
def test_error_status_becomes_provider_error_with_cause(
    case: str, caplog: pytest.LogCaptureFixture
) -> None:
    """오류 응답은 다시 보내지 않고 ProviderError가 된다. 운영 로그에는 원인 이름·상태 코드·오류 종류(목록에
    없으면 OTHER)·요청 ID만 남고 오류 원문·자료·키는 남지 않는다. 예외에도 원문이 없고 SDK 예외를 잇지 않는다."""
    reply, cause, error_type = STATUS_ERRORS[case]
    status = case.split("-")[0]
    api = FakeApi(reply)

    with (
        caplog.at_level(logging.INFO, logger="app.generation.claude"),
        pytest.raises(ProviderError) as raised,
    ):
        api.provider().complete(call())

    assert not isinstance(raised.value, UnusableResponse)
    assert len(api.requests) == 1
    assert f"cause={cause} status={status} errorType={error_type}" in caplog.text
    assert "requestId=req_synthetic_err" in caplog.text
    assert "FAKE-LOG-LINE" not in caplog.text
    assert_no_leak(caplog.text)
    assert_no_leak(str(raised.value))
    assert_detached(raised.value)


# 정상 HTTP 응답이지만 쓸 수 없는 응답


UNUSABLE = {
    "refusal": (
        "UNREADABLE",
        {"type": "refusal", "category": "cyber", "explanation": REFUSAL_TEXT},
    ),
    "max_tokens": ("TOO_LARGE", None),
    "pause_turn": ("UNREADABLE", None),
}


@pytest.mark.parametrize("stop_reason", list(UNUSABLE))
def test_refusal_and_cut_responses_are_unusable(
    stop_reason: str, caplog: pytest.LogCaptureFixture
) -> None:
    """거절·최대 출력에서 잘림·그 밖의 멈춤은 응답 글을 돌려주지 않는다. 사용량과 멈춘 이유는 남기고 거절
    설명 글은 남기지 않는다."""
    reason, details = UNUSABLE[stop_reason]
    api = FakeApi(message(stop_reason=stop_reason, stop_details=details))

    with (
        caplog.at_level(logging.INFO, logger="app.generation.claude"),
        pytest.raises(UnusableResponse) as raised,
    ):
        api.provider().complete(call())

    assert raised.value.reason == reason
    assert len(api.requests) == 1
    assert_detached(raised.value)
    assert f"stopReason={stop_reason}" in caplog.text
    assert "inputTokens=1234 outputTokens=56" in caplog.text
    if stop_reason == "refusal":
        assert "refusalCategory=cyber" in caplog.text
    assert "REFUSAL-MARK-64" not in caplog.text
    assert_no_leak(caplog.text)


def test_response_values_are_checked_before_logging(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """응답에서 온 모델 ID·멈춘 이유·거절 분류·요청 ID는 정해 둔 목록·모양일 때만 그대로 적는다. 줄바꿈으로
    새 로그 줄을 만들 수 없다."""
    odd = FakeApi(
        message(
            model="claude\nFAKE-LOG-LINE",
            stop_reason="mystery\nFAKE-LOG-LINE",
            request_id="req with spaces",
        )
    )
    refused = FakeApi(
        message(
            stop_reason="refusal",
            stop_details={"type": "refusal", "category": "x\nFAKE-LOG-LINE"},
        )
    )

    with caplog.at_level(logging.INFO, logger="app.generation.claude"):
        with pytest.raises(UnusableResponse):
            odd.provider().complete(call())
        with pytest.raises(UnusableResponse):
            refused.provider().complete(call())

    assert "model=INVALID stopReason=OTHER" in caplog.text
    assert "requestId=INVALID" in caplog.text
    assert "refusalCategory=OTHER" in caplog.text
    assert "FAKE-LOG-LINE" not in caplog.text


def oversized(status: int) -> Reply:
    body = json.dumps(message_body()).encode() + b" " * MAX_RESPONSE_BYTES
    return raw(status, body)


@pytest.mark.parametrize("status", [200, 500])
def test_response_body_over_the_limit_is_not_read(
    status: int, caplog: pytest.LogCaptureFixture
) -> None:
    """응답 본문이 상한을 넘으면 끝까지 읽지 않고 최대 출력을 넘은 응답으로 끝낸다(오류 응답도 같다)."""
    api = FakeApi(oversized(status))

    with (
        caplog.at_level(logging.INFO, logger="app.generation.claude"),
        pytest.raises(UnusableResponse) as raised,
    ):
        api.provider().complete(call())

    assert raised.value.reason == "TOO_LARGE"
    assert len(api.requests) == 1
    assert_detached(raised.value)
    assert f"cause=RESPONSE_TOO_LARGE status={status}" in caplog.text


def test_response_body_at_the_limit_is_read() -> None:
    body = json.dumps(message_body()).encode()
    padded = body + b" " * (MAX_RESPONSE_BYTES - len(body))
    assert len(padded) == MAX_RESPONSE_BYTES

    assert FakeApi(raw(200, padded)).provider().complete(call()) == ANSWER


def test_compressed_response_is_refused(caplog: pytest.LogCaptureFixture) -> None:
    """압축하지 말라고 했는데 압축된 응답이 오면 풀린 크기를 셀 수 없어 받지 않는다."""
    body = gzip.compress(json.dumps(message_body()).encode())
    api = FakeApi(raw(200, body, **{"content-encoding": "gzip"}))

    with (
        caplog.at_level(logging.INFO, logger="app.generation.claude"),
        pytest.raises(ProviderError) as raised,
    ):
        api.provider().complete(call())

    assert not isinstance(raised.value, UnusableResponse)
    assert_detached(raised.value)
    assert "cause=INVALID_RESPONSE status=200" in caplog.text


def without(field: str) -> bytes:
    body = message_body()
    del body[field]
    return json.dumps(body).encode()


def with_fields(**fields: Any) -> bytes:
    body = message_body()
    body.update(fields)
    return json.dumps(body).encode()


MALFORMED = {
    "empty-object": b"{}",
    "not-json": b"ANSWER-MARK-29 <html>not json",
    "json-array": b"[]",
    "no-usage": without("usage"),
    "no-content": without("content"),
    "content-null": with_fields(content=None),
    "text-not-string": with_fields(content=[{"type": "text", "text": 123}]),
    "tokens-not-int": with_fields(usage={"input_tokens": "12", "output_tokens": 3}),
}


@pytest.mark.parametrize("case", list(MALFORMED))
def test_malformed_success_response_becomes_provider_error(
    case: str, caplog: pytest.LogCaptureFixture
) -> None:
    """모양이 맞지 않는 HTTP 200 응답은 다른 예외로 새지 않고 ProviderError(응답 오류)가 된다."""
    api = FakeApi(raw(200, MALFORMED[case]))

    with (
        caplog.at_level(logging.INFO, logger="app.generation.claude"),
        pytest.raises(ProviderError) as raised,
    ):
        api.provider().complete(call())

    assert not isinstance(raised.value, UnusableResponse)
    assert_detached(raised.value)
    assert "cause=INVALID_RESPONSE" in caplog.text
    assert_no_leak(caplog.text)
    assert_no_leak(str(raised.value))


def test_other_sdk_error_becomes_provider_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """상태 코드 밖의 SDK 오류(응답 모양 검사 실패)도 ProviderError가 된다."""
    provider = FakeApi(message()).provider()
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")

    def invalid(**kwargs: object) -> None:
        raise anthropic.APIResponseValidationError(
            response=httpx2.Response(200, request=request), body=None
        )

    monkeypatch.setattr(provider._client.messages, "create", invalid)

    with pytest.raises(ProviderError) as raised:
        provider.complete(call())

    assert not isinstance(raised.value, UnusableResponse)
    assert_detached(raised.value)


# 생성 흐름과 이어서


ALPHA_PULL = Scenario(
    default_branch=(root_commit(),),
    pulls=(
        Pull(
            3,
            MEMBER,
            (
                commit(
                    sha(31),
                    MEMBER,
                    parents=(ROOT,),
                    minute=3,
                    files=(
                        change(
                            "app/alpha.py", patch="@@ -1 +1 @@\n-alpha = 1\n+alpha = 2"
                        ),
                    ),
                ),
            ),
            state="open",
            created=2,
        ),
    ),
)


def as_provider_request(sent: httpx2.Request) -> ProviderRequest:
    """가짜 API가 받은 HTTP 본문을 합성 모델(naive)이 읽는 요청으로 되돌린다."""
    body = json.loads(sent.content)
    return ProviderRequest(
        purpose="GENERATE",
        instructions=body["system"],
        data=body["messages"][0]["content"],
        timeout_seconds=sent.extensions["timeout"]["read"],
        max_output_bytes=body["max_tokens"],
    )


def test_generation_flow_runs_through_the_claude_provider() -> None:
    """생성 흐름 → 어댑터 → SDK → 가짜 API → 생성 흐름. 흐름이 만든 지시문·자료가 그대로 나가고, 합성 모델의
    정상 응답으로 설명·질문·제목이 생성된다."""
    api = FakeApi(lambda request: message(naive(as_provider_request(request)))(request))
    scripted = ScriptedProvider(api.provider().complete)

    case = generation_case(ALPHA_PULL, scripted)

    assert len(api.requests) == 1
    assert api.body()["system"] == scripted.requests[0].instructions
    assert api.body()["messages"][0]["content"] == scripted.requests[0].data
    (candidate,) = case.output.candidates
    assert candidate.draft.status == "GENERATED"
    assert candidate.reflection.status == "GENERATED"
    assert candidate.title is not None


FLOW_FAILURES = {
    "refusal": (
        message(
            stop_reason="refusal", stop_details={"type": "refusal", "category": None}
        ),
        "GENERATION_RESPONSE_UNREADABLE",
    ),
    "max_tokens": (message(stop_reason="max_tokens"), "GENERATION_RESPONSE_TOO_LARGE"),
    "oversized-body": (oversized(200), "GENERATION_RESPONSE_TOO_LARGE"),
    "malformed": (raw(200, b"{}"), "GENERATION_CALL_FAILED"),
    "529": (api_error(529, "overloaded_error"), "GENERATION_CALL_FAILED"),
    "timeout": (raises(httpx2.ReadTimeout), "GENERATION_TIMEOUT"),
}


@pytest.mark.parametrize("kind", list(FLOW_FAILURES))
def test_generation_flow_turns_provider_failures_into_whole_call_failures(
    kind: str,
) -> None:
    """어댑터의 실패가 생성 흐름에서 원인별 전체 호출 실패가 되고(다른 예외로 새지 않고), 다시 부르지 않는다."""
    reply, code = FLOW_FAILURES[kind]
    api = FakeApi(reply)

    case = generation_case(ALPHA_PULL, ScriptedProvider(api.provider().complete))

    assert len(api.requests) == 1
    (candidate,) = case.output.candidates
    assert candidate.draft.status == "FAILED"
    assert candidate.reflection.status == "FAILED"
    assert candidate.title is None
    assert {each["code"] for each in case.result["failures"]} == {code}
