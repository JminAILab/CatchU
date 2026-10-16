"""실제 stdlib HTTP 조회의 세 갈래(찾음·모름·실패)와 고정 resolver의 수명, 기존 수집 검사와의 연결."""

import gc
import json
import time
import weakref
from typing import Any

import pytest
from context_synthetic import CONTEXT_REQUEST, KEY, ApiReply, context_api
from github_synthetic import ACCEPTED, START, TOKEN, FakeClock

from app.collection import (
    CredentialContext,
    FailureCode,
    SelectedRange,
    Transport,
    collect,
)
from app.collection.credentials import (
    AccessToken,
    CredentialLookupError,
    check_credential,
)
from app.collection.limits import PROPOSED_LIMITS
from app.collection.selection import SelectionLookupError, check_selection
from app.request_context import (
    ContextApiSettings,
    ContextFound,
    ContextLookupFailed,
    ContextUnknown,
    LookupResult,
    RequestContextClient,
    UnresolvedReason,
)

__all__ = ["context_api"]

ATTEMPT = CONTEXT_REQUEST.attempt_id


def lookup(reply: ApiReply) -> LookupResult:
    assert reply.client is not None
    return reply.client.lookup(ATTEMPT)


def found(reply: ApiReply) -> ContextFound:
    result = lookup(reply)
    assert isinstance(result, ContextFound), result
    return result


def failed(reply: ApiReply) -> str:
    result = lookup(reply)
    assert isinstance(result, ContextLookupFailed), result
    assert result.reason is UnresolvedReason.REQUEST_CONTEXT_UNAVAILABLE
    # 실패는 고정 코드만 담는다. 응답 원문·토큰·키가 없다.
    assert all(value not in repr(result) for value in (TOKEN, KEY))
    return result.cause


def test_found_carries_accepted_context_and_fixed_resolvers(
    context_api: ApiReply,
) -> None:
    with found(context_api) as context:
        accepted = context.accepted
        assert (accepted.request_id, accepted.attempt_id) == (
            CONTEXT_REQUEST.request_id,
            ATTEMPT,
        )
        assert (accepted.member_id, accepted.repository_id, accepted.consent_id) == (
            CONTEXT_REQUEST.member_id,
            CONTEXT_REQUEST.repository_id,
            CONTEXT_REQUEST.consent_id,
        )
        assert accepted.notice_revision == ACCEPTED.notice_revision
        assert accepted.scope_revision == CONTEXT_REQUEST.scope_revision
        assert accepted.allowed_resource_types == ACCEPTED.allowed_resource_types
        assert accepted.source_mode == "LIVE"
        # 선정 참조의 기대값은 시도 ID다(10/15 결정 1의 비교 규칙).
        assert accepted.selection_reference == ATTEMPT

        credential = check_credential(
            CONTEXT_REQUEST, context.credentials, now=START, limits=PROPOSED_LIMITS
        )
        selection = check_selection(CONTEXT_REQUEST, context.selections)
        assert isinstance(credential, CredentialContext)
        assert credential.linked_account.account_id == 9007199254740993
        assert credential.access_token.reveal() == TOKEN
        assert isinstance(selection, SelectedRange) and selection.whole_repository
        # 받은 값을 그대로 돌려주므로 몇 번을 물어도 HTTP는 조회 한 번이다.
        assert context.credentials.resolve(ATTEMPT) is credential
        assert context.selections.resolve(ATTEMPT) is selection
        rendered = repr(context) + repr(context.credentials) + repr(accepted)
        assert all(value not in rendered for value in (TOKEN, KEY))
    assert context_api.requests == context_api.valid_requests == 1
    assert context_api.paths == [f"/v1/internal/analysis-attempts/{ATTEMPT}/context"]


def test_each_lookup_is_one_request_and_a_separate_lifetime(
    context_api: ApiReply,
) -> None:
    first, second = found(context_api), found(context_api)
    assert first is not second
    with first:
        pass
    with second:
        assert second.credentials.resolve(ATTEMPT) is not None
    assert context_api.requests == 2


def test_close_releases_context_even_after_exception(context_api: ApiReply) -> None:
    context = found(context_api)
    with pytest.raises(RuntimeError), context:
        credential = context.credentials.resolve(ATTEMPT)
        assert credential is not None
        observed = weakref.ref(credential)
        del credential
        raise RuntimeError("합성 수집 중단")
    gc.collect()
    assert observed() is None
    with pytest.raises(CredentialLookupError, match="CONTEXT_CLOSED"):
        context.credentials.resolve(ATTEMPT)
    with pytest.raises(SelectionLookupError, match="CONTEXT_CLOSED"):
        context.selections.resolve(ATTEMPT)
    with pytest.raises(ValueError):
        context.__enter__()
    assert context_api.requests == 1


def test_other_reference_is_unknown_to_fixed_resolvers(context_api: ApiReply) -> None:
    with found(context_api) as context:
        other = "00000000-0000-4000-8000-00000000ffff"
        assert context.credentials.resolve(other) is None
        assert context.selections.resolve(other) is None
    assert context_api.requests == 1


def test_response_request_id_is_passed_on_for_check_request(
    context_api: ApiReply,
) -> None:
    """요청 ID 불일치는 손상이 아니다. 접수 맥락에 실어 요청 검사가 조용히 거부하게 한다."""
    context_api.payload["requestId"] = "00000000-0000-4000-8000-00000000eeee"
    with found(context_api) as context:
        assert context.accepted.request_id == "00000000-0000-4000-8000-00000000eeee"


@pytest.mark.parametrize("status", [401, 403, 429, 500, 503, 302])
def test_http_failure_is_a_fixed_cause_and_never_retried(
    context_api: ApiReply, status: int
) -> None:
    context_api.status = status
    context_api.body = (TOKEN + KEY).encode()

    assert failed(context_api) == f"CONTEXT_HTTP_{status}"
    assert context_api.requests == 1


@pytest.mark.parametrize(
    ("details", "reason"),
    [
        (None, UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED),
        *(
            (
                {"violations": [{"field": "attemptId", "reason": reason.value}]},
                reason,
            )
            for reason in (
                UnresolvedReason.ATTEMPT_NOT_ACTIVE,
                UnresolvedReason.MEMBER_INACTIVE,
                UnresolvedReason.SCOPE_UNVERIFIED,
                UnresolvedReason.GITHUB_NOT_CONNECTED,
                UnresolvedReason.GITHUB_REAUTH_REQUIRED,
            )
        ),
        # api가 고르지 않는 값·모양이 다른 칸은 이유로 읽지 않는다.
        (
            {"violations": [{"field": "attemptId", "reason": "SOMETHING_NEW"}]},
            UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED,
        ),
        (
            {
                "violations": [
                    {"field": "attemptId", "reason": "REQUEST_CONTEXT_UNAVAILABLE"}
                ]
            },
            UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED,
        ),
        (
            {"violations": [{"field": "requestId", "reason": "SCOPE_UNVERIFIED"}]},
            UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED,
        ),
        (
            {
                "violations": [
                    {"field": "attemptId", "reason": "SCOPE_UNVERIFIED"},
                    {"field": "attemptId", "reason": "MEMBER_INACTIVE"},
                ]
            },
            UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED,
        ),
        (
            {"violations": [{"field": "attemptId", "reason": ["SCOPE_UNVERIFIED"]}]},
            UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED,
        ),
        ({"existingRequestId": "x"}, UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED),
        ("SCOPE_UNVERIFIED", UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED),
    ],
)
def test_resource_unavailable_is_unknown_with_reason(
    context_api: ApiReply, details: object, reason: UnresolvedReason
) -> None:
    context_api.status = 404
    context_api.payload = {
        "code": "RESOURCE_UNAVAILABLE",
        "message": "현재 열람할 수 없는 자료입니다.",
    }
    if details is not None:
        context_api.payload["details"] = details

    result = lookup(context_api)

    assert result == ContextUnknown(reason)
    assert context_api.requests == 1


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("attemptId",), "00000000-0000-4000-8000-00000000eeee"),
        (("extra",), TOKEN),
        (("consentId",), ""),
        (("noticeRevision",), 3),
        (("allowedResourceTypes",), "COMMIT"),
        (("allowedResourceTypes",), ["COMMIT", "WIKI"]),
        (("allowedResourceTypes",), [{"COMMIT": 1}]),
        (("sourceMode",), "live"),
        (("sourceMode",), ["LIVE"]),
        (("credential", "extra"), TOKEN),
        (("credential", "repository", "url"), "https://evil.invalid"),
        (("credential", "repository", "owner"), "../elsewhere"),
        (("credential", "linkedAccount", "extra"), TOKEN),
        (("credential", "linkedAccount", "externalAccountId"), 9007199254740993),
        (("credential", "linkedAccount", "externalAccountId"), "0"),
        (("credential", "linkedAccount", "externalAccountId"), "01"),
        (("credential", "linkedAccount", "externalAccountId"), "1e3"),
        (("credential", "accessToken"), "bad\nheader"),
        (("credential", "expiresAt"), "2026-10-01T01:00:00"),
        (("credential", "expiresAt"), "2026-10-01T01:00:00+09:00"),
        (("credential", "expiresAt"), "2026-13-01T01:00:00Z"),
        (("selection", "extra"), TOKEN),
        (("selection", "wholeRepository"), 1),
    ],
)
def test_damaged_response_is_a_safe_failure(
    context_api: ApiReply,
    path: tuple[str, ...],
    value: object,
    caplog: pytest.LogCaptureFixture,
) -> None:
    target = context_api.payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value

    assert failed(context_api) == "CONTEXT_RESPONSE_INVALID"
    assert TOKEN not in caplog.text and KEY not in caplog.text
    assert context_api.requests == 1


@pytest.mark.parametrize(
    "key",
    ["consentId", "noticeRevision", "allowedResourceTypes", "sourceMode", "requestId"],
)
def test_missing_accepted_field_is_damage(context_api: ApiReply, key: str) -> None:
    del context_api.payload[key]

    assert failed(context_api) == "CONTEXT_RESPONSE_INVALID"


@pytest.mark.parametrize(
    "body",
    [
        b"not-json-secret",
        b"[]",
        b"{}",
        b'{"credential":{},"credential":{}}',
        json.dumps({"code": "OTHER", "message": "x"}).encode(),
    ],
)
def test_malformed_and_duplicate_json_is_rejected(
    context_api: ApiReply, body: bytes
) -> None:
    context_api.body = body

    assert failed(context_api) == "CONTEXT_RESPONSE_INVALID"


@pytest.mark.parametrize(
    "body",
    [
        json.dumps({"code": "INTERNAL_ERROR", "message": "x"}).encode(),
        json.dumps({"code": "RESOURCE_UNAVAILABLE"}).encode(),
        json.dumps(
            {"code": "RESOURCE_UNAVAILABLE", "message": "x", "extra": 1}
        ).encode(),
    ],
)
def test_other_not_found_body_is_damage(context_api: ApiReply, body: bytes) -> None:
    context_api.status = 404
    context_api.body = body

    assert failed(context_api) == "CONTEXT_RESPONSE_INVALID"


@pytest.mark.parametrize(
    "attribute,value",
    [("content_type", "text/html"), ("content_encoding", "gzip"), ("status", 404)],
)
def test_wrong_http_response_metadata_is_rejected(
    context_api: ApiReply, attribute: str, value: Any
) -> None:
    setattr(context_api, attribute, value)

    assert failed(context_api) == "CONTEXT_RESPONSE_INVALID"


@pytest.mark.parametrize("declared", [True, False])
def test_response_limit_is_enforced(context_api: ApiReply, declared: bool) -> None:
    settings = ContextApiSettings(
        context_api.base_url, AccessToken(KEY), "test", max_response_bytes=100
    )
    context_api.body = b"x" * 101
    context_api.declared_size = 101 if declared else -1
    context_api.client = RequestContextClient(settings)

    # Content-Length가 없어도 실제 읽은 바이트에 같은 상한을 둔다.
    assert failed(context_api) == "CONTEXT_RESPONSE_TOO_LARGE"
    assert context_api.requests == 1


def test_total_read_timeout_interrupts_dripping_response(context_api: ApiReply) -> None:
    settings = ContextApiSettings(
        context_api.base_url, AccessToken(KEY), "test", read_timeout=0.1
    )
    context_api.drip = True
    context_api.client = RequestContextClient(settings)
    started = time.monotonic()

    assert failed(context_api) == "CONTEXT_TIMEOUT"
    assert time.monotonic() - started < 2
    assert context_api.requests == 1


def test_connection_refused_is_transport_failure(context_api: ApiReply) -> None:
    import socket

    # 막 닫은 포트로 연결이 거부되게 한다.
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    context_api.client = RequestContextClient(
        ContextApiSettings(f"http://127.0.0.1:{port}", AccessToken(KEY), "test")
    )

    assert failed(context_api) == "CONTEXT_TRANSPORT_FAILED"


def test_transport_failure_keeps_no_original_error(
    context_api: ApiReply, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.collection.transport import HttpsTransport, TransportError

    calls = 0

    def fail(*args: object, **kwargs: object) -> None:
        nonlocal calls
        calls += 1
        raise TransportError(TOKEN + KEY)

    monkeypatch.setattr(HttpsTransport, "get", fail)

    assert failed(context_api) == "CONTEXT_TRANSPORT_FAILED"
    assert calls == 1


@pytest.mark.parametrize("attempt", ["../../untrusted", "", "not-a-uuid"])
def test_invalid_attempt_id_makes_no_http_call(
    context_api: ApiReply, attempt: str
) -> None:
    assert context_api.client is not None
    result = context_api.client.lookup(attempt)

    assert result == ContextLookupFailed("CONTEXT_REFERENCE_INVALID")
    assert context_api.requests == 0


@pytest.mark.parametrize(
    ("section", "field", "value", "expected"),
    [
        (
            "credential",
            "expiresAt",
            "2026-10-01T00:10:00Z",
            FailureCode.CREDENTIAL_EXPIRED,
        ),
        ("selection", "repositoryId", "other-repo", FailureCode.SCOPE_INCONSISTENT),
        ("selection", "wholeRepository", False, FailureCode.SELECTION_UNSUPPORTED),
    ],
)
def test_existing_checks_refuse_before_github(
    context_api: ApiReply,
    section: str,
    field: str,
    value: object,
    expected: FailureCode,
) -> None:
    """조회 값은 기존 수집 검사(만료 여유·선택 범위)를 그대로 지난다. 어긋나면 GitHub 연결을 열지 않는다."""
    context_api.payload[section][field] = value

    def refuse_github() -> Transport:
        pytest.fail("사전 검사 실패 뒤 GitHub 연결을 열었다")

    with found(context_api) as context:
        outcome = collect(
            CONTEXT_REQUEST,
            credentials=context.credentials,
            selections=context.selections,
            open_transport=refuse_github,
            clock=FakeClock(),
        )
    assert [failure.code for failure in outcome.failures] == [expected]
    assert outcome.calls == 0
    assert context_api.requests == 1
