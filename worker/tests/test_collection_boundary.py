"""첫 GitHub 호출 전 검사: 허용 자료 종류·자격정보 맥락·선택 범위.

어긋나면 연결을 열지 않고(호출 0회) 수집 실패 하나로 끝나며, 조회를 다시 시도하지 않는다.
"""

from datetime import timedelta

import pytest
from github_synthetic import (
    REQUEST,
    START,
    FakeClock,
    FakeTransport,
    StaticCredentials,
    StaticSelections,
    credential_context,
    request_with,
    standard_routes,
)

from app.collection import (
    PROPOSED_LIMITS,
    AccessToken,
    CollectionOutcome,
    FailureCode,
    SelectedRange,
    collect,
)
from app.processing.request_check import CheckedRequest


class RefusingOpener:
    """연결을 열면 시험 실패. 사전 검사에서 멈춰야 하는 경우에 쓴다."""

    opened = 0

    def __call__(self) -> FakeTransport:
        self.opened += 1
        raise AssertionError("사전 검사를 통과하지 않았는데 연결을 열었다")


def _collect(
    request: CheckedRequest = REQUEST,
    *,
    credentials: StaticCredentials | None = None,
    selections: StaticSelections | None = None,
) -> tuple[CollectionOutcome, RefusingOpener]:
    opener = RefusingOpener()
    outcome = collect(
        request,
        credentials=credentials or StaticCredentials(),
        selections=selections or StaticSelections(),
        open_transport=opener,
        clock=FakeClock(),
    )
    return outcome, opener


def _assert_refused(
    outcome: CollectionOutcome, opener: RefusingOpener, code: FailureCode
) -> None:
    assert opener.opened == 0
    assert [failure.code for failure in outcome.failures] == [code]
    assert not outcome.completed
    assert outcome.calls == 0
    assert (outcome.commits, outcome.pull_requests, outcome.issues) == ((), (), ())
    assert outcome.repository is None
    assert [f.stage for f in outcome.stage_failures()] == ["COLLECTION"]


def test_empty_allowed_resource_types_is_a_failure_not_zero_records() -> None:
    credentials, selections = StaticCredentials(), StaticSelections()
    outcome, opener = _collect(
        request_with(), credentials=credentials, selections=selections
    )

    _assert_refused(outcome, opener, FailureCode.NO_ALLOWED_RESOURCE_TYPE)
    assert credentials.lookups == 0
    assert selections.lookups == 0


def test_unknown_credential_reference_is_not_retried() -> None:
    credentials = StaticCredentials(context=None)
    outcome, opener = _collect(credentials=credentials)

    _assert_refused(outcome, opener, FailureCode.CREDENTIAL_REFERENCE_UNRESOLVED)
    assert credentials.lookups == 1


def test_credential_lookup_error_is_not_retried() -> None:
    credentials = StaticCredentials(fail=True)
    outcome, opener = _collect(credentials=credentials)

    _assert_refused(outcome, opener, FailureCode.CREDENTIAL_REFERENCE_UNRESOLVED)
    assert credentials.lookups == 1


@pytest.mark.parametrize(
    ("change", "label"),
    [
        ({"member_id": "00000000-0000-4000-8000-00000000ffff"}, "회원"),
        ({"repository_id": "synthetic-repo-other"}, "저장소"),
        ({"scope_revision": "00000000-0000-4000-8000-00000000fffe"}, "허용 범위 판본"),
    ],
)
def test_context_that_differs_from_request_is_refused_without_narrowing(
    change: dict[str, str], label: str
) -> None:
    outcome, opener = _collect(
        credentials=StaticCredentials(credential_context(**change))
    )

    _assert_refused(outcome, opener, FailureCode.CREDENTIAL_SCOPE_MISMATCH)
    message = outcome.failures[0].message
    assert label in message
    # 어긋난 값은 메시지에 옮기지 않는다.
    assert not any(value in message for value in change.values())


@pytest.mark.parametrize(
    "expires_in",
    [
        timedelta(0),
        -timedelta(minutes=1),
        # 수집 시간 상한(제안 10분) 안에 만료되면 시작하지 않는다.
        PROPOSED_LIMITS.max_collection_time,
        PROPOSED_LIMITS.max_collection_time - timedelta(seconds=1),
    ],
)
def test_expired_or_expiring_credential_is_refused(expires_in: timedelta) -> None:
    context = credential_context(expires_at=START + expires_in)
    outcome, opener = _collect(credentials=StaticCredentials(context))

    _assert_refused(outcome, opener, FailureCode.CREDENTIAL_EXPIRED)


def test_credential_valid_past_collection_limit_opens_connection() -> None:
    context = credential_context(
        expires_at=START + PROPOSED_LIMITS.max_collection_time + timedelta(seconds=1)
    )
    transport = FakeTransport(standard_routes())

    outcome = collect(
        REQUEST,
        credentials=StaticCredentials(context),
        selections=StaticSelections(),
        open_transport=lambda: transport,
        clock=FakeClock(),
    )

    assert outcome.completed
    assert transport.calls


@pytest.mark.parametrize(
    ("selections", "code"),
    [
        (StaticSelections(selected=None), FailureCode.SELECTION_UNRESOLVED),
        (StaticSelections(fail=True), FailureCode.SELECTION_UNRESOLVED),
        (
            StaticSelections(selected=SelectedRange("synthetic-repo-other", True)),
            FailureCode.SCOPE_INCONSISTENT,
        ),
        # 제공자가 저장소 단위라고 밝히지 않은 범위는 저장소 전체로 넓히지 않는다.
        (
            StaticSelections(selected=SelectedRange(REQUEST.repository_id, False)),
            FailureCode.SELECTION_UNSUPPORTED,
        ),
    ],
)
def test_selection_must_be_resolved_and_not_widened(
    selections: StaticSelections, code: FailureCode
) -> None:
    outcome, opener = _collect(selections=selections)

    _assert_refused(outcome, opener, code)
    assert selections.lookups == 1


@pytest.mark.parametrize("value", ["", "abc\n", "abc\r\nX-Evil: 1", "abc def", "토큰"])
def test_token_that_cannot_be_a_header_value_is_refused_without_echo(
    value: str,
) -> None:
    with pytest.raises(ValueError) as refused:
        AccessToken(value)

    assert value.strip() == "" or value not in str(refused.value)
