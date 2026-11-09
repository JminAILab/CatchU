"""LIVE 처리 시험(#121 PR②)용 합성 요청·조회 응답·저장소·제공자. 실제 api·GitHub·LLM을 쓰지 않는다.

요청 정보 조회는 loopback 합성 HTTP 서버(`context_synthetic.context_api`)가 답한다. 조회 응답의 연동 계정은
합성 GitHub 저장소의 본인 계정(MEMBER)이라 본인 커밋이 후보가 된다.
"""

from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import timedelta
from typing import Any

from candidate_scenarios import ROOT, Pull, Scenario, change, commit, root_commit
from context_synthetic import KEY, context_body
from generation_scenarios import ScriptedProvider, naive
from github_synthetic import ACCEPTED, MEMBER, FakeClock, FakeTransport, sha

from app.collection import Transport
from app.collection.credentials import AccessToken
from app.consumer.settings import LiveSettings
from app.generation import GenerationProvider
from app.processing import synthetic_request
from app.processing.live import LiveAssembly
from app.request_context import ContextApiSettings, RequestContextClient

LIVE_ACCEPTED = replace(ACCEPTED, source_mode="LIVE")
ATTEMPT = LIVE_ACCEPTED.attempt_id
GENERATION_KEY = "sk-ant-synthetic-generation-key-must-not-leak"
# 운영과 같은 생성 마감: 총 상한 60분 − 결과 조합·전송 여유 60초.
GENERATION_BUDGET = timedelta(minutes=60) - timedelta(seconds=60)

# 열린 PR #3 하나에 본인 커밋 하나(app/alpha.py 한 줄): 후보 1건.
ALPHA = commit(
    sha(31),
    MEMBER,
    parents=(ROOT,),
    minute=3,
    files=[change("app/alpha.py", patch="@@ -1 +1 @@\n-alpha = 1\n+alpha = 2")],
)
ONE_PULL = Scenario(
    default_branch=(root_commit(),),
    pulls=(Pull(3, MEMBER, (ALPHA,), state="open", created=2),),
)
# 기본 브랜치에 다른 계정의 뿌리 커밋만 있다: 후보 없음.
NOTHING_OWN = Scenario(default_branch=(root_commit(),))


def live_message() -> dict[str, Any]:
    """두 참조가 시도 ID인 합성 LIVE 요청."""
    return synthetic_request(LIVE_ACCEPTED)


def live_payload(*, expires_at: str = "2026-10-01T01:00:00.000Z") -> dict[str, Any]:
    """합성 요청과 맞는 조회 응답. 연동 계정은 합성 저장소의 본인 계정이다."""
    body = context_body()
    body["credential"]["linkedAccount"] = {
        "login": MEMBER.login,
        "externalAccountId": str(MEMBER.account_id),
    }
    body["credential"]["expiresAt"] = expires_at
    return body


def context_settings(base_url: str, *, read_timeout: float = 5.0) -> ContextApiSettings:
    return ContextApiSettings(
        base_url, AccessToken(KEY), "test", read_timeout=read_timeout
    )


def live_settings(base_url: str) -> LiveSettings:
    return LiveSettings(
        context_api=context_settings(base_url),
        generation_key=AccessToken(GENERATION_KEY),
    )


@dataclass
class Parts:
    """시험이 넣는 LIVE 부품과 그 사용 기록."""

    scenario: Scenario
    provider: GenerationProvider = field(
        default_factory=lambda: ScriptedProvider(naive)
    )
    clock: FakeClock = field(default_factory=FakeClock)
    transports: list[FakeTransport] = field(default_factory=list)
    providers_made: int = 0

    def open_transport(self) -> Transport:
        transport = FakeTransport(self.scenario.routes(), clock=self.clock)
        self.transports.append(transport)
        return transport

    def make_provider(self) -> GenerationProvider:
        self.providers_made += 1
        return self.provider

    def assembly(self, base_url: str) -> LiveAssembly:
        return LiveAssembly(
            context_client=RequestContextClient(context_settings(base_url)),
            open_transport=self.open_transport,
            provider_factory=self.make_provider,
            generation_budget=GENERATION_BUDGET,
        )


def refuse_github() -> Transport:
    raise AssertionError("GitHub 연결을 열면 안 된다")


def refuse_provider() -> GenerationProvider:
    raise AssertionError("생성 제공자를 만들면 안 된다")


def no_github_assembly(
    base_url: str,
    *,
    provider: Callable[[], GenerationProvider] = refuse_provider,
    read_timeout: float = 5.0,
) -> LiveAssembly:
    """GitHub 연결·생성 제공자를 쓰면 시험이 실패하는 부품(조회 모름·실패·거부 시험)."""
    return LiveAssembly(
        context_client=RequestContextClient(
            context_settings(base_url, read_timeout=read_timeout)
        ),
        open_transport=refuse_github,
        provider_factory=provider,
        generation_budget=GENERATION_BUDGET,
    )
