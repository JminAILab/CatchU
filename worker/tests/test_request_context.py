"""실제 stdlib HTTP와 기존 수집 검사 사이의 합성 연결·거부·수명 검사."""

import gc
import time
import traceback
import weakref
from dataclasses import replace
from typing import Any

import pytest
from context_synthetic import CONTEXT_REQUEST, KEY, ApiReply, context_api
from github_synthetic import START, TOKEN, FakeClock

from app.collection import (
    CredentialContext,
    FailureCode,
    SelectedRange,
    Transport,
)
from app.collection.credentials import (
    AccessToken,
    CredentialLookupError,
    check_credential,
)
from app.collection.limits import PROPOSED_LIMITS
from app.collection.selection import SelectionLookupError, check_selection
from app.request_context import ContextApiSettings, RequestContextClient
from app.request_context.collection import collect_with_context

__all__ = ["context_api"]


def test_http_context_passes_existing_boundaries_once(context_api: ApiReply) -> None:
    assert context_api.client is not None
    with context_api.client.for_request(CONTEXT_REQUEST) as pair:
        context = check_credential(
            CONTEXT_REQUEST, pair.credentials, now=START, limits=PROPOSED_LIMITS
        )
        selection = check_selection(CONTEXT_REQUEST, pair.selections)
        assert isinstance(context, CredentialContext)
        assert context.linked_account.account_id == 9007199254740993
        assert context.access_token.reveal() == TOKEN
        assert isinstance(selection, SelectedRange) and selection.whole_repository
        assert TOKEN not in repr(context)
        assert all(
            value not in repr(pair) + repr(pair.credentials) + repr(pair.selections)
            for value in (TOKEN, KEY, CONTEXT_REQUEST.attempt_id)
        )
        assert pair.credentials.resolve(CONTEXT_REQUEST.attempt_id) is context
    assert context_api.requests == context_api.valid_requests == 1


def test_selection_first_and_separate_request_lifetimes(context_api: ApiReply) -> None:
    assert context_api.client is not None
    for _ in range(2):
        with context_api.client.for_request(CONTEXT_REQUEST) as pair:
            assert pair.selections.resolve(CONTEXT_REQUEST.attempt_id) is not None
            assert pair.credentials.resolve(CONTEXT_REQUEST.attempt_id) is not None
    assert context_api.requests == 2


def test_close_releases_context_even_after_exception(context_api: ApiReply) -> None:
    assert context_api.client is not None
    pair = context_api.client.for_request(CONTEXT_REQUEST)
    with pytest.raises(RuntimeError), pair:
        context = pair.credentials.resolve(CONTEXT_REQUEST.attempt_id)
        assert context is not None
        observed = weakref.ref(context)
        del context
        raise RuntimeError("합성 수집 중단")
    gc.collect()
    assert observed() is None
    assert pair._request_id is pair._attempt_id is None
    with pytest.raises(CredentialLookupError, match="CONTEXT_CLOSED"):
        pair.credentials.resolve(CONTEXT_REQUEST.attempt_id)
    assert context_api.requests == 1


@pytest.mark.parametrize("status", [401, 403, 429, 500, 503, 302])
def test_http_failure_is_shared_and_never_retried(
    context_api: ApiReply, status: int
) -> None:
    assert context_api.client is not None
    context_api.status = status
    context_api.body = (TOKEN + KEY).encode()
    with context_api.client.for_request(CONTEXT_REQUEST) as pair:
        for resolver, error in (
            (pair.credentials, CredentialLookupError),
            (pair.selections, SelectionLookupError),
            (pair.credentials, CredentialLookupError),
        ):
            with pytest.raises(error) as raised:
                resolver.resolve(CONTEXT_REQUEST.attempt_id)
            assert str(raised.value) == f"CONTEXT_HTTP_{status}"
            assert raised.value.__cause__ is raised.value.__context__ is None
    assert context_api.requests == 1


def test_resource_unavailable_is_none_for_both_resolvers(context_api: ApiReply) -> None:
    assert context_api.client is not None
    context_api.status = 404
    context_api.payload = {
        "code": "RESOURCE_UNAVAILABLE",
        "message": "현재 열람할 수 없는 자료입니다.",
    }
    with context_api.client.for_request(CONTEXT_REQUEST) as pair:
        assert pair.credentials.resolve(CONTEXT_REQUEST.attempt_id) is None
        assert pair.selections.resolve(CONTEXT_REQUEST.attempt_id) is None
    assert context_api.requests == 1


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("requestId",), "wrong-request"),
        (("attemptId",), "wrong-attempt"),
        (("extra",), TOKEN),
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
def test_damaged_response_has_safe_failure(
    context_api: ApiReply,
    path: tuple[str, ...],
    value: object,
    caplog: pytest.LogCaptureFixture,
) -> None:
    assert context_api.client is not None
    target = context_api.payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with context_api.client.for_request(CONTEXT_REQUEST) as pair:
        with pytest.raises(CredentialLookupError) as raised:
            pair.credentials.resolve(CONTEXT_REQUEST.attempt_id)
        assert str(raised.value) == "CONTEXT_RESPONSE_INVALID"
        rendered = (
            "".join(traceback.format_exception(raised.value)) + caplog.text + repr(pair)
        )
        assert all(
            secret not in rendered
            for secret in (TOKEN, KEY, CONTEXT_REQUEST.attempt_id)
        )
        assert raised.value.__cause__ is raised.value.__context__ is None
        with pytest.raises(SelectionLookupError):
            pair.selections.resolve(CONTEXT_REQUEST.attempt_id)
    assert context_api.requests == 1


@pytest.mark.parametrize(
    "body", [b"not-json-secret", b"[]", b"{}", b'{"credential":{},"credential":{}}']
)
def test_malformed_and_duplicate_json_is_rejected(
    context_api: ApiReply, body: bytes
) -> None:
    assert context_api.client is not None
    context_api.body = body
    with context_api.client.for_request(CONTEXT_REQUEST) as pair:
        with pytest.raises(CredentialLookupError, match="CONTEXT_RESPONSE_INVALID"):
            pair.credentials.resolve(CONTEXT_REQUEST.attempt_id)


@pytest.mark.parametrize(
    "attribute,value",
    [("content_type", "text/html"), ("content_encoding", "gzip"), ("status", 404)],
)
def test_wrong_http_response_metadata_is_rejected(
    context_api: ApiReply, attribute: str, value: Any
) -> None:
    assert context_api.client is not None
    setattr(context_api, attribute, value)
    with context_api.client.for_request(CONTEXT_REQUEST) as pair:
        with pytest.raises(CredentialLookupError, match="CONTEXT_RESPONSE_INVALID"):
            pair.credentials.resolve(CONTEXT_REQUEST.attempt_id)


@pytest.mark.parametrize("declared", [True, False])
def test_response_limit_is_enforced(context_api: ApiReply, declared: bool) -> None:
    settings = ContextApiSettings(
        context_api.base_url, AccessToken(KEY), "test", max_response_bytes=100
    )
    context_api.body = b"x" * 101
    context_api.declared_size = 101 if declared else -1
    with RequestContextClient(settings).for_request(CONTEXT_REQUEST) as pair:
        # Content-Length가 없어도 실제 읽은 바이트에 같은 상한을 둔다.
        code = "CONTEXT_RESPONSE_TOO_LARGE"
        with pytest.raises(CredentialLookupError, match=code):
            pair.credentials.resolve(CONTEXT_REQUEST.attempt_id)
    assert context_api.requests == 1


def test_total_read_timeout_interrupts_dripping_response(context_api: ApiReply) -> None:
    settings = ContextApiSettings(
        context_api.base_url, AccessToken(KEY), "test", read_timeout=0.1
    )
    context_api.drip = True
    started = time.monotonic()
    with RequestContextClient(settings).for_request(CONTEXT_REQUEST) as pair:
        with pytest.raises(CredentialLookupError, match="CONTEXT_TIMEOUT"):
            pair.credentials.resolve(CONTEXT_REQUEST.attempt_id)
        with pytest.raises(SelectionLookupError, match="CONTEXT_TIMEOUT"):
            pair.selections.resolve(CONTEXT_REQUEST.attempt_id)
    assert time.monotonic() - started < 2
    assert context_api.requests == 1


@pytest.mark.parametrize(
    "field",
    ["credential_context_reference", "selection_reference", "attempt_id", "request_id"],
)
def test_invalid_or_different_references_make_no_http_call(
    context_api: ApiReply, field: str
) -> None:
    assert context_api.client is not None
    request = replace(CONTEXT_REQUEST, **{field: "../../untrusted"})  # type: ignore[arg-type]
    with context_api.client.for_request(request) as pair:
        with pytest.raises(CredentialLookupError, match="CONTEXT_REFERENCE_INVALID"):
            pair.credentials.resolve(request.credential_context_reference)
    assert context_api.requests == 0


@pytest.mark.parametrize(
    ("section", "field", "value", "expected"),
    [
        (
            "credential",
            "memberId",
            "other-member",
            FailureCode.CREDENTIAL_SCOPE_MISMATCH,
        ),
        (
            "credential",
            "repositoryId",
            "other-repo",
            FailureCode.CREDENTIAL_SCOPE_MISMATCH,
        ),
        (
            "credential",
            "scopeRevision",
            "other-scope",
            FailureCode.CREDENTIAL_SCOPE_MISMATCH,
        ),
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
    assert context_api.client is not None
    context_api.payload[section][field] = value

    def refuse_github() -> Transport:
        pytest.fail("사전 검사 실패 뒤 GitHub 연결을 열었다")

    outcome = collect_with_context(
        CONTEXT_REQUEST,
        context_client=context_api.client,
        open_transport=refuse_github,
        clock=FakeClock(),
    )
    assert [failure.code for failure in outcome.failures] == [expected]
    assert outcome.calls == 0
    assert context_api.requests == 1


def test_transport_failure_has_no_exception_chain_or_retry(
    context_api: ApiReply, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.collection.transport import HttpsTransport, TransportError

    assert context_api.client is not None
    calls = 0

    def fail(*args: object, **kwargs: object) -> None:
        nonlocal calls
        calls += 1
        raise TransportError(TOKEN + KEY)

    monkeypatch.setattr(HttpsTransport, "get", fail)
    with context_api.client.for_request(CONTEXT_REQUEST) as pair:
        for resolver, error in (
            (pair.credentials, CredentialLookupError),
            (pair.selections, SelectionLookupError),
        ):
            with pytest.raises(error) as raised:
                resolver.resolve(CONTEXT_REQUEST.attempt_id)
            assert str(raised.value) == "CONTEXT_TRANSPORT_FAILED"
            assert raised.value.__cause__ is raised.value.__context__ is None
            assert TOKEN not in "".join(traceback.format_exception(raised.value))
    assert calls == 1


def test_valid_but_other_reference_cannot_access_context(context_api: ApiReply) -> None:
    assert context_api.client is not None
    with context_api.client.for_request(CONTEXT_REQUEST) as pair:
        with pytest.raises(CredentialLookupError, match="CONTEXT_REFERENCE_INVALID"):
            pair.credentials.resolve("00000000-0000-4000-8000-00000000ffff")
    assert context_api.requests == 0
