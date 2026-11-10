"""LIVE 요청 처리(#121 PR②): 조회 1회 → 요청 대조 → 실제 수집·후보·생성, 또는 조회 모름·실패의 FAILED 결과.

실제 stdlib HTTP로 loopback 합성 조회 API를 부르고, GitHub는 합성 응답(`FakeTransport`), 생성 제공자는 합성
제공자다. 기대값은 계획 「PR② 자동 시험」 1~7과 10/15 팀장 결정(질문 1·3)에서 정한다.
"""

import gc
import json
import logging
import weakref
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Any

import pytest
from context_synthetic import KEY, ApiReply, context_api
from generation_scenarios import ScriptedProvider, naive
from github_synthetic import START, TOKEN, FakeClock
from live_synthetic import (
    ATTEMPT,
    NOTHING_OWN,
    ONE_PULL,
    Parts,
    live_message,
    live_payload,
    live_settings,
    no_github_assembly,
)

from app.candidates import build_candidates
from app.collection.credentials import CredentialLookupError
from app.collection.transport import HttpsTransport
from app.consumer import child
from app.consumer.settings import ChildSettings, Limits
from app.contract import Verdict, check_message
from app.generation import run_generation
from app.generation.claude import ClaudeProvider
from app.processing import ExecutionUnknown, Finished, Uncertain
from app.processing import live as live_module
from app.processing.live import LiveAssembly
from app.processing.runner import RefusalReason, Refused, RunOutcome, run_request
from app.request_context import (
    FAILURE_MESSAGES,
    ContextFound,
    RequestContextClient,
    UnresolvedReason,
)

__all__ = ["context_api"]

# 결과가 요청에서 그대로 옮기는 맥락(E가 접수 기록과 대조하는 일곱 개).
CONTEXT_KEYS = ("requestId", "attemptId", "memberId", "repositoryId", "consentId")
# 10/15 팀장이 확정한 이유 코드별 회원 문구(계획 3.7, 질문 3). 구현 사전과 따로 둔 기대값이다.
EXPECTED_MESSAGES = {
    "ATTEMPT_NOT_ACTIVE": (
        "이 분석 요청은 이미 끝났거나 새 요청으로 바뀌어 처리하지 않았습니다."
    ),
    "MEMBER_INACTIVE": "회원 상태를 확인할 수 없어 분석하지 않았습니다.",
    "SCOPE_UNVERIFIED": (
        "동의한 저장소 범위를 확인하지 못해 분석하지 않았습니다. 다시 동의한 뒤 요청해 주세요."
    ),
    "GITHUB_NOT_CONNECTED": (
        "GitHub 연결이 없어 분석하지 않았습니다. GitHub를 연결한 뒤 다시 요청해 주세요."
    ),
    "GITHUB_REAUTH_REQUIRED": (
        "GitHub 연결을 다시 확인해야 해서 분석하지 않았습니다."
        " GitHub를 다시 연결한 뒤 요청해 주세요."
    ),
    "REQUEST_CONTEXT_UNRESOLVED": "분석 요청 정보를 확인하지 못해 분석하지 않았습니다.",
    "REQUEST_CONTEXT_UNAVAILABLE": (
        "분석 요청 정보를 잠시 확인하지 못해 분석하지 않았습니다. 잠시 후 다시 요청해 주세요."
    ),
}


@dataclass
class Ran:
    outcome: RunOutcome
    events: list[dict[str, Any]]


def run_live(
    message: dict[str, Any],
    live: LiveAssembly | None,
    *,
    clock: FakeClock | None = None,
    picked_at: datetime = START,
) -> Ran:
    events: list[dict[str, Any]] = []
    outcome = run_request(
        message,
        job_id=message["attemptId"],
        picked_at=picked_at,
        mock_enabled=True,
        mock_scenario="succeeded-one-candidate",
        live=live,
        emit=events.append,
        clock=clock or FakeClock(),
    )
    return Ran(outcome, events)


def result_of(ran: Ran) -> dict[str, Any]:
    assert isinstance(ran.outcome, Finished), ran.outcome
    result = ran.outcome.result
    assert check_message("Result", result).verdict is Verdict.VALID
    return result


def assert_same_context(result: dict[str, Any], message: dict[str, Any]) -> None:
    for key in CONTEXT_KEYS:
        assert result[key] == message[key], key
    assert result["scopeRevision"] == message["allowedScope"]["revision"]
    assert result["sourceMode"] == message["sourceMode"] == "LIVE"
    assert result["messageId"] == f"message-live-{ATTEMPT}-result"
    assert result["resultId"] == f"result-live-{ATTEMPT}"


# 1. LIVE 합성 끝까지 ----------------------------------------------------------------------------


def test_live_request_runs_collection_candidates_and_generation_once(
    context_api: ApiReply, monkeypatch: pytest.MonkeyPatch
) -> None:
    context_api.payload = live_payload()
    deadlines: list[datetime] = []
    original = run_generation

    def recording(*args: Any, **kwargs: Any) -> Any:
        deadlines.append(kwargs["deadline"])
        return original(*args, **kwargs)

    monkeypatch.setattr(live_module, "run_generation", recording)
    parts = Parts(ONE_PULL)
    message = live_message()
    # 꺼낸 뒤 시계가 흘러도 수집 시계와 생성 마감은 꺼낸 시각에서 시작한다.
    ran = run_live(message, parts.assembly(context_api.base_url), clock=parts.clock)

    result = result_of(ran)
    assert_same_context(result, message)
    assert result["outcome"] == "SUCCEEDED"
    assert len(result["candidates"]) == 1
    candidate = result["candidates"][0]
    assert candidate["draft"]["status"] == "GENERATED"
    assert candidate["evidence"][0]["sourceUrl"].startswith("https://github.com/")
    assert [event["state"] for event in ran.events] == ["RECEIVED", "RUNNING"]
    assert [event["messageId"] for event in ran.events] == [
        f"event-live-{ATTEMPT}-received",
        f"event-live-{ATTEMPT}-running",
    ]
    # 조회는 한 번, GitHub 연결은 사전 검사 뒤 한 번, 제공자는 후보가 있어 한 번 만든다.
    assert context_api.requests == context_api.valid_requests == 1
    assert len(parts.transports) == 1 and parts.transports[0].paths
    assert parts.providers_made == 1
    assert isinstance(parts.provider, ScriptedProvider)
    assert len(parts.provider.generate_requests()) == 1
    assert deadlines == [START + timedelta(minutes=60) - timedelta(seconds=60)]


# 6. 관계 조회와 후보 없음 ------------------------------------------------------------------------


def test_no_candidate_keeps_provider_unmade_and_relations_are_collected(
    context_api: ApiReply,
) -> None:
    context_api.payload = live_payload()
    parts = Parts(NOTHING_OWN)

    ran = run_live(live_message(), parts.assembly(context_api.base_url))

    result = result_of(ran)
    # 관계 조회 결과가 없으면 후보 판정이 결함(ValueError)으로 멈춘다. 끝까지 왔다면 넘긴 것이다.
    assert result["outcome"] == "EMPTY"
    assert result["candidates"] == [] and result["failures"] == []
    assert parts.providers_made == 0
    assert [event["state"] for event in ran.events] == ["RECEIVED", "RUNNING"]


# CR2. 소속 커밋 집합 전달 -----------------------------------------------------------------------


def test_assigned_commits_reach_judgement_and_material_lookup_as_one_value(
    context_api: ApiReply, monkeypatch: pytest.MonkeyPatch
) -> None:
    """맥락 조회의 소속 집합을 후보 판정과 생성 재료 찾기에 같은 값으로 넘긴다(BR1.6)."""
    unrelated = "e" * 40
    context_api.payload = live_payload(assigned=(unrelated,))
    seen: dict[str, frozenset[str]] = {}
    build, generate = build_candidates, run_generation

    def judged(*args: Any, **kwargs: Any) -> Any:
        seen["build"] = args[2]
        return build(*args, **kwargs)

    def generated(*args: Any, **kwargs: Any) -> Any:
        seen["generation"] = kwargs["assigned"]
        return generate(*args, **kwargs)

    monkeypatch.setattr(live_module, "build_candidates", judged)
    monkeypatch.setattr(live_module, "run_generation", generated)
    parts = Parts(ONE_PULL)

    result = result_of(run_live(live_message(), parts.assembly(context_api.base_url)))

    assert seen == {
        "build": frozenset({unrelated}),
        "generation": frozenset({unrelated}),
    }
    assert result["schemaVersion"] == "3"
    (candidate,) = result["candidates"]
    assert candidate["ownCommitShas"] == [ONE_PULL.pulls[0].commits[0].sha]


def test_reanalysis_with_everything_assigned_is_empty_without_provider(
    context_api: ApiReply,
) -> None:
    """바뀐 것이 없는 재분석(W6): 후보·미제공·실패 0, 결과 EMPTY, 생성 제공자를 만들지 않는다."""
    context_api.payload = live_payload(assigned=(ONE_PULL.pulls[0].commits[0].sha,))
    parts = Parts(ONE_PULL)

    result = result_of(run_live(live_message(), parts.assembly(context_api.base_url)))

    assert result["outcome"] == "EMPTY"
    assert result["candidates"] == [] and result["notProvided"] == []
    assert result["failures"] == []
    assert parts.providers_made == 0


# 2·3·5. 조회 모름·실패 ----------------------------------------------------------------------------


def assert_unresolved(
    ran: Ran, message: dict[str, Any], reason: UnresolvedReason
) -> None:
    result = result_of(ran)
    assert_same_context(result, message)
    assert result["outcome"] == "FAILED"
    assert result["candidates"] == [] and result["notProvided"] == []
    assert result["failures"] == [
        {
            "stage": "COLLECTION",
            "code": reason.value,
            "message": EXPECTED_MESSAGES[reason.value],
        }
    ]
    # 진행 알림 없이 결과 하나. 수집·생성은 일어나지 않는다(부품이 막는다).
    assert ran.events == []


@pytest.mark.parametrize(
    "reason",
    [
        UnresolvedReason.ATTEMPT_NOT_ACTIVE,
        UnresolvedReason.MEMBER_INACTIVE,
        UnresolvedReason.SCOPE_UNVERIFIED,
        UnresolvedReason.GITHUB_NOT_CONNECTED,
        UnresolvedReason.GITHUB_REAUTH_REQUIRED,
    ],
)
def test_not_found_reason_sends_one_failed_result_without_events(
    context_api: ApiReply, reason: UnresolvedReason
) -> None:
    context_api.status = 404
    context_api.payload = {
        "code": "RESOURCE_UNAVAILABLE",
        "message": "현재 열람할 수 없는 자료입니다.",
        "details": {"violations": [{"field": "attemptId", "reason": reason.value}]},
    }
    message = live_message()

    ran = run_live(message, no_github_assembly(context_api.base_url))

    assert_unresolved(ran, message, reason)
    assert context_api.requests == 1


def test_member_text_is_exactly_the_decided_wording() -> None:
    """회원 화면에 그대로 나가는 문구다. 이유 코드 일곱 개와 문구가 확정본과 글자 단위로 같다."""
    assert {reason.value: text for reason, text in FAILURE_MESSAGES.items()} == (
        EXPECTED_MESSAGES
    )
    assert {reason.value for reason in UnresolvedReason} == set(EXPECTED_MESSAGES)


def _closed_port() -> int:
    import socket

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


@pytest.mark.parametrize(
    ("case", "reason"),
    [
        ("http-500", UnresolvedReason.REQUEST_CONTEXT_UNAVAILABLE),
        ("redirect", UnresolvedReason.REQUEST_CONTEXT_UNAVAILABLE),
        ("timeout", UnresolvedReason.REQUEST_CONTEXT_UNAVAILABLE),
        ("connection-refused", UnresolvedReason.REQUEST_CONTEXT_UNAVAILABLE),
        ("damaged", UnresolvedReason.REQUEST_CONTEXT_UNAVAILABLE),
        ("other-attempt", UnresolvedReason.REQUEST_CONTEXT_UNAVAILABLE),
        ("no-reason", UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED),
        ("unknown-reason", UnresolvedReason.REQUEST_CONTEXT_UNRESOLVED),
    ],
)
def test_lookup_failure_is_a_failed_result_without_raw_text(
    context_api: ApiReply,
    case: str,
    reason: UnresolvedReason,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    marker = "raw-context-response-must-not-leak"
    base_url = context_api.base_url
    if case == "http-500":
        context_api.status, context_api.body = 500, (marker + TOKEN).encode()
    elif case == "redirect":
        context_api.status, context_api.body = 302, marker.encode()
    elif case == "timeout":
        context_api.drip, context_api.body = True, (marker * 20).encode()
    elif case == "connection-refused":
        base_url = f"http://127.0.0.1:{_closed_port()}"
    elif case == "damaged":
        context_api.body = (marker + '{"credential":').encode()
    elif case == "other-attempt":
        context_api.payload = live_payload()
        context_api.payload["attemptId"] = "00000000-0000-4000-8000-00000000eeee"
    else:
        context_api.status = 404
        context_api.payload = {"code": "RESOURCE_UNAVAILABLE", "message": marker}
        if case == "unknown-reason":
            context_api.payload["details"] = {
                "violations": [{"field": "attemptId", "reason": marker}]
            }
    live = no_github_assembly(base_url, read_timeout=0.1)
    message = live_message()

    ran = run_live(message, live)

    assert_unresolved(ran, message, reason)
    rendered = json.dumps(result_of(ran), ensure_ascii=False) + caplog.text
    assert all(value not in rendered for value in (marker, TOKEN, KEY))
    assert (
        "요청 정보 조회 실패" if reason.name.endswith("UNAVAILABLE") else "조회 모름"
    ) in (caplog.text)


# 4. 조회 성공 + 메시지 불일치 -----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "value", "pointer"),
    [
        (("requestId",), "00000000-0000-4000-8000-00000000eeee", "/requestId"),
        (
            ("credential", "memberId"),
            "00000000-0000-4000-8000-00000000eeee",
            "/memberId",
        ),
        (("credential", "repositoryId"), "other-repository", "/repositoryId"),
        (("consentId",), "00000000-0000-4000-8000-00000000eeee", "/consentId"),
        (("noticeRevision",), "other-notice", "/noticeRevision"),
        (("sourceMode",), "MOCK", "/sourceMode"),
        (("credential", "scopeRevision"), "other-scope", "/allowedScope/revision"),
        (
            ("allowedResourceTypes",),
            ["COMMIT"],
            "/allowedScope/allowedResourceTypes",
        ),
    ],
)
def test_found_but_different_from_message_is_silently_refused(
    context_api: ApiReply, path: tuple[str, ...], value: object, pointer: str
) -> None:
    context_api.payload = live_payload()
    target = context_api.payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value

    ran = run_live(live_message(), no_github_assembly(context_api.base_url))

    assert isinstance(ran.outcome, Refused), ran.outcome
    assert ran.outcome.reason is RefusalReason.CONTEXT_MISMATCH
    assert pointer in ran.outcome.fields
    assert ran.events == []
    assert context_api.requests == 1


# 7. 자격정보 해제 ---------------------------------------------------------------------------------


@pytest.mark.parametrize("ending", ["result", "refused", "defect"])
def test_fixed_resolvers_let_go_of_the_token(
    context_api: ApiReply, monkeypatch: pytest.MonkeyPatch, ending: str
) -> None:
    context_api.payload = live_payload()
    if ending == "refused":
        context_api.payload["noticeRevision"] = "other-notice"
    seen: list[ContextFound] = []
    observed: list[weakref.ref[object]] = []
    original = RequestContextClient.lookup

    def capture(self: Any, attempt_id: str) -> Any:
        looked_up = original(self, attempt_id)
        assert isinstance(looked_up, ContextFound)
        seen.append(looked_up)
        credential = looked_up.credentials.resolve(attempt_id)
        assert credential is not None
        observed.append(weakref.ref(credential))
        return looked_up

    monkeypatch.setattr(RequestContextClient, "lookup", capture)
    provider = ScriptedProvider(
        RuntimeError("합성 결함") if ending == "defect" else naive
    )
    parts = Parts(ONE_PULL, provider=provider)
    live = parts.assembly(context_api.base_url)

    if ending == "defect":
        with pytest.raises(RuntimeError):
            run_live(live_message(), live, clock=parts.clock)
    else:
        ran = run_live(live_message(), live, clock=parts.clock)
        expected = Finished if ending == "result" else Refused
        assert isinstance(ran.outcome, expected)
    gc.collect()
    [found] = seen
    assert observed[0]() is None
    with pytest.raises(CredentialLookupError, match="CONTEXT_CLOSED"):
        found.credentials.resolve(ATTEMPT)


# 기준 4. 실행 여부를 모르면 UNCERTAIN만 ------------------------------------------------------------


def test_execution_unknown_in_live_generation_is_uncertain_without_result(
    context_api: ApiReply,
) -> None:
    context_api.payload = live_payload()
    parts = Parts(ONE_PULL, provider=ScriptedProvider(ExecutionUnknown("합성")))

    ran = run_live(
        live_message(), parts.assembly(context_api.base_url), clock=parts.clock
    )

    assert isinstance(ran.outcome, Uncertain)
    assert [event["state"] for event in ran.events] == [
        "RECEIVED",
        "RUNNING",
        "UNCERTAIN",
    ]


def test_live_without_settings_is_refused_before_lookup(context_api: ApiReply) -> None:
    ran = run_live(live_message(), None)

    assert ran.outcome == Refused(RefusalReason.LIVE_NOT_CONFIGURED, ("/sourceMode",))
    assert ran.events == [] and context_api.requests == 0


# 운영 조립: 자식이 기동 설정으로 만드는 부품 ----------------------------------------------------


def _child_settings(base_url: str, limits: Limits) -> ChildSettings:
    return ChildSettings(
        environment="test",
        mock_enabled=False,
        mock_scenario="succeeded-one-candidate",
        limits=limits,
        live=live_settings(base_url),
    )


def test_child_assembly_uses_total_limit_minus_margin_as_generation_deadline(
    context_api: ApiReply, monkeypatch: pytest.MonkeyPatch
) -> None:
    """운영 조립(`child.live_assembly`)이 생성 마감을 총 상한 − 여유로 넘긴다(계획 3.2).

    두 값을 기본값과 다르게 두어 여유를 빼지 않는 회귀를 잡는다.
    """
    default = child.live_assembly(_child_settings(context_api.base_url, Limits()))
    assert default is not None
    assert Limits().total == 3600
    assert default.generation_budget == timedelta(seconds=3540)

    built = child.live_assembly(
        _child_settings(
            context_api.base_url, replace(Limits(), total=1000, generation_margin=37)
        )
    )
    assert built is not None
    assert built.open_transport is HttpsTransport
    context_api.payload = live_payload()
    deadlines: list[datetime] = []
    original = run_generation

    def recording(*args: Any, **kwargs: Any) -> Any:
        deadlines.append(kwargs["deadline"])
        return original(*args, **kwargs)

    monkeypatch.setattr(live_module, "run_generation", recording)
    parts = Parts(ONE_PULL)
    # 조회 클라이언트와 마감은 운영 조립 그대로, GitHub·제공자만 합성으로 바꾼다.
    live = replace(
        built,
        open_transport=parts.open_transport,
        provider_factory=parts.make_provider,
    )

    ran = run_live(live_message(), live, clock=parts.clock)

    assert result_of(ran)["outcome"] == "SUCCEEDED"
    assert deadlines == [START + timedelta(seconds=963)]
    assert context_api.requests == 1


def test_child_assembly_makes_the_claude_provider_only_when_asked(
    context_api: ApiReply,
) -> None:
    built = child.live_assembly(_child_settings(context_api.base_url, Limits()))
    assert built is not None
    # 부품을 만드는 것만으로는 제공자를 만들지 않는다(후보가 있을 때 생성 흐름이 부른다).
    provider = built.provider_factory()
    assert isinstance(provider, ClaudeProvider)
    assert (
        child.live_assembly(
            replace(_child_settings(context_api.base_url, Limits()), live=None)
        )
        is None
    )
