"""분석 소비자 기동 설정. 계획 「PR① 자동 시험」 1·20, PR② LIVE 설정과 큐 규격 ID 검사."""

import logging
import pickle
import tomllib
from pathlib import Path

import pytest
from consumer_support import env

from app.consumer import queues
from app.consumer.__main__ import main
from app.consumer.settings import (
    DEFAULT_PREFIX,
    ConsumerSettings,
    QueueUrl,
    SettingsError,
)

SECRET = "s3cr3t-queue-password"
CONTEXT_KEY = "c0" * 32
GENERATION_KEY = "sk-ant-synthetic-generation-key-must-not-leak"
# 운영 LIVE 설정(요청 정보 조회 목적지·키, 생성 키). PR②부터 운영 필수다.
LIVE = {
    "WORKER_CONTEXT_API_URL": "https://api.internal",
    "WORKER_CONTEXT_API_KEY": CONTEXT_KEY,
    "CATCHU_GENERATION_API_KEY": GENERATION_KEY,
}
WORKER_DIR = Path(__file__).resolve().parents[1]


def load(**values: str) -> ConsumerSettings:
    return ConsumerSettings.from_environment(values)


def production(**values: str) -> ConsumerSettings:
    return ConsumerSettings.from_environment({**LIVE, **values})


# 1. 설정 --------------------------------------------------------------------------------


@pytest.mark.parametrize("node_env", [None, "production", "staging", "Development"])
def test_production_requires_queue_url(node_env: str | None) -> None:
    values = {} if node_env is None else {"NODE_ENV": node_env}
    with pytest.raises(SettingsError):
        ConsumerSettings.from_environment(values)


@pytest.mark.parametrize("node_env", ["development", "test"])
def test_development_without_queue_url_disables_consumer(node_env: str) -> None:
    settings = load(NODE_ENV=node_env)

    assert settings.consumer_enabled is False
    assert settings.mock_enabled is True
    assert (settings.prefix, settings.concurrency) == (DEFAULT_PREFIX, 1)


def test_production_accepts_only_tls_queue_url_and_turns_mock_off() -> None:
    settings = production(
        CATCHU_QUEUE_REDIS_URL=f"rediss://:{SECRET}@queue.internal:6379"
    )

    assert settings.environment == "production"
    assert settings.consumer_enabled is True
    assert settings.mock_enabled is False
    assert settings.live is not None
    with pytest.raises(SettingsError):
        production(CATCHU_QUEUE_REDIS_URL="redis://queue.internal:6379")


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:6379",
        "rediss://queue.internal:6379?ssl_cert_reqs=none",
        "redis://127.0.0.1:6379/0#x",
        "redis://127.0.0.1:6379/abc",
        "redis://:6379",
        "redis://127.0.0.1:99999",
        "redis://127.0.0.1:6379\n",
        "redis://bad_host:6379",
    ],
)
def test_invalid_queue_url_is_rejected(url: str) -> None:
    with pytest.raises(SettingsError) as raised:
        load(NODE_ENV="development", CATCHU_QUEUE_REDIS_URL=url)
    assert url.strip() not in str(raised.value)


# 지금은 1만 받는다(2 이상은 종료 직전 작업의 기록 틈 때문에 막음, 10/15 결정).
@pytest.mark.parametrize("value", ["0", "2", "4", "-1", "abc", "1.5", "01x"])
def test_invalid_concurrency_is_rejected(value: str) -> None:
    with pytest.raises(SettingsError):
        load(NODE_ENV="test", CATCHU_WORKER_CONCURRENCY=value)


def test_concurrency_prefix_and_mock_values() -> None:
    settings = load(
        NODE_ENV="test",
        CATCHU_WORKER_CONCURRENCY="1",
        CATCHU_QUEUE_PREFIX="catchu-test_1",
        CATCHU_WORKER_MOCK="false",
    )

    assert (settings.concurrency, settings.prefix, settings.mock_enabled) == (
        1,
        "catchu-test_1",
        False,
    )
    with pytest.raises(SettingsError):
        load(NODE_ENV="test", CATCHU_QUEUE_PREFIX="a:b")
    with pytest.raises(SettingsError):
        load(NODE_ENV="test", CATCHU_WORKER_MOCK="yes")


def test_mock_cannot_be_turned_on_in_production() -> None:
    with pytest.raises(SettingsError):
        production(
            CATCHU_QUEUE_REDIS_URL="rediss://queue.internal:6379",
            CATCHU_WORKER_MOCK="true",
        )
    assert (
        production(
            CATCHU_QUEUE_REDIS_URL="rediss://queue.internal:6379",
            CATCHU_WORKER_MOCK="false",
        ).mock_enabled
        is False
    )


def test_queue_url_secret_stays_out_of_repr_and_logs(
    caplog: pytest.LogCaptureFixture,
) -> None:
    url = f"redis://user:{SECRET}@127.0.0.1:6379"
    settings = load(NODE_ENV="test", CATCHU_QUEUE_REDIS_URL=url)

    assert SECRET not in repr(settings)
    assert SECRET not in str(settings.queue_url)
    assert SECRET not in repr(settings.for_child())
    assert settings.queue_url is not None and settings.queue_url.reveal() == url

    caplog.set_level(logging.INFO)
    with env({"NODE_ENV": "production", "CATCHU_QUEUE_REDIS_URL": url}):
        assert main([]) == 2  # 운영에서 redis://는 기동하지 않는다
    assert "CATCHU_QUEUE_REDIS_URL" in caplog.text
    assert SECRET not in caplog.text


def test_secrets_are_dropped_before_children_can_inherit_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import subprocess
    import sys

    import app.consumer.service as service_module

    url = f"redis://user:{SECRET}@127.0.0.1:6379"
    seen: dict[str, object] = {}
    names = (
        "CATCHU_QUEUE_REDIS_URL",
        "WORKER_CONTEXT_API_KEY",
        "CATCHU_GENERATION_API_KEY",
    )

    class FakeService:
        def __init__(self, settings: ConsumerSettings, **_: object) -> None:
            seen["settings_url"] = settings.queue_url
            seen["live"] = settings.live

        async def run(self) -> int:
            # 서비스가 뜬 뒤 띄우는 자식 프로세스는 부모의 환경변수를 물려받는다.
            seen["child_env"] = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    "import os, sys; print(' '.join(os.environ.get(n, 'absent')"
                    " for n in sys.argv[1:]))",
                    *names,
                    "WORKER_CONTEXT_API_URL",
                ],
                capture_output=True,
                text=True,
                check=True,
            ).stdout.strip()
            return 0

    monkeypatch.setattr(service_module, "ConsumerService", FakeService)
    monkeypatch.setenv("NODE_ENV", "test")
    monkeypatch.setenv("CATCHU_QUEUE_REDIS_URL", url)
    for name, value in LIVE.items():
        monkeypatch.setenv(name, value)

    assert main([]) == 0
    queue_url = seen["settings_url"]
    assert isinstance(queue_url, QueueUrl) and queue_url.reveal() == url
    assert seen["live"] is not None
    # 비밀값만 지운다. 목적지 주소는 비밀값이 아니라 남는다.
    assert seen["child_env"] == "absent absent absent https://api.internal"


# PR② LIVE 설정 ------------------------------------------------------------------------------

QUEUE = "rediss://queue.internal:6379"


@pytest.mark.parametrize("missing", sorted(LIVE))
def test_production_requires_live_settings(missing: str) -> None:
    values = {**LIVE, "CATCHU_QUEUE_REDIS_URL": QUEUE}
    del values[missing]
    with pytest.raises(SettingsError) as raised:
        ConsumerSettings.from_environment(values)
    assert CONTEXT_KEY not in str(raised.value) and GENERATION_KEY not in str(
        raised.value
    )
    with pytest.raises(SettingsError) as none_given:
        load(CATCHU_QUEUE_REDIS_URL=QUEUE)
    assert "WORKER_CONTEXT_API_URL" in str(none_given.value)


@pytest.mark.parametrize("node_env", ["development", "test"])
def test_development_without_live_settings_turns_live_off(node_env: str) -> None:
    settings = load(NODE_ENV=node_env)

    assert settings.live is None and settings.for_child().live is None


@pytest.mark.parametrize("missing", sorted(LIVE))
def test_partial_live_settings_fail_even_in_development(missing: str) -> None:
    values = {**LIVE, "NODE_ENV": "test"}
    del values[missing]
    with pytest.raises(SettingsError):
        ConsumerSettings.from_environment(values)


@pytest.mark.parametrize(
    ("changes", "ok"),
    [
        # 10/15 팀장 결정 질문 4: 운영 http는 명시 설정 + 클러스터 안 서비스 이름일 때만.
        (
            {
                "WORKER_CONTEXT_API_URL": "http://api.catchu.svc.cluster.local:3001",
                "WORKER_CONTEXT_API_ALLOW_CLUSTER_HTTP": "true",
            },
            True,
        ),
        ({"WORKER_CONTEXT_API_URL": "http://api.catchu.svc.cluster.local:3001"}, False),
        (
            {
                "WORKER_CONTEXT_API_URL": "http://api.internal:3001",
                "WORKER_CONTEXT_API_ALLOW_CLUSTER_HTTP": "true",
            },
            False,
        ),
        ({"WORKER_CONTEXT_API_ALLOW_CLUSTER_HTTP": "yes"}, False),
        ({"WORKER_CONTEXT_API_KEY": "short"}, False),
        ({"CATCHU_GENERATION_API_KEY": "has space"}, False),
    ],
)
def test_production_live_destination_and_keys(
    changes: dict[str, str], ok: bool
) -> None:
    values = {**LIVE, "CATCHU_QUEUE_REDIS_URL": QUEUE, **changes}
    if ok:
        settings = ConsumerSettings.from_environment(values)
        assert settings.live is not None
        assert settings.live.context_api.scheme == "http"
    else:
        with pytest.raises(SettingsError) as raised:
            ConsumerSettings.from_environment(values)
        assert all(value not in str(raised.value) for value in changes.values())


def test_live_keys_reach_the_child_settings_but_not_repr_or_logs(
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings = production(CATCHU_QUEUE_REDIS_URL=QUEUE)
    child = settings.for_child()

    assert child.live is not None and child.live == settings.live
    for rendered in (repr(settings), repr(child), str(child.live)):
        assert CONTEXT_KEY not in rendered and GENERATION_KEY not in rendered
    # 자식은 spawn으로 설정 객체를 받아 쓴다. 넘어간 값으로 조회·생성을 할 수 있어야 한다.
    restored = pickle.loads(pickle.dumps(child))
    assert restored.live is not None
    assert restored.live.context_api.api_key.reveal() == CONTEXT_KEY
    assert restored.live.generation_key.reveal() == GENERATION_KEY
    assert restored.live.context_api.authority == "api.internal"

    caplog.set_level(logging.INFO)
    with env(
        {**LIVE, "CATCHU_QUEUE_REDIS_URL": QUEUE, "CATCHU_GENERATION_API_KEY": ""}
    ):
        assert main([]) == 2
    assert "CATCHU_GENERATION_API_KEY" in caplog.text
    assert CONTEXT_KEY not in caplog.text


# 큐 규격 ---------------------------------------------------------------------------------


def test_ids_follow_queue_rules() -> None:
    attempt = "00000000-0000-4000-8000-000000000102"

    assert queues.event_message_id("MOCK", attempt, "RECEIVED") == (
        f"event-mock-{attempt}-received"
    )
    assert queues.result_message_id("LIVE", attempt) == f"message-live-{attempt}-result"
    assert queues.result_id("LIVE", attempt) == f"result-live-{attempt}"
    ids = {
        queues.event_message_id(mode, attempt, state)
        for mode in ("MOCK", "LIVE")
        for state in ("RECEIVED", "RUNNING", "UNCERTAIN")
    } | {queues.result_message_id(mode, attempt) for mode in ("MOCK", "LIVE")}
    assert len(ids) == 8 and all(map(queues.is_safe_job_id, ids))
    assert not queues.is_safe_job_id("123") and not queues.is_safe_job_id("a:b")
    assert queues.request_envelope_ok("Request", attempt, {"attemptId": attempt})
    assert not queues.request_envelope_ok("Request", attempt.upper()[:-1], {})


# 20. 판본 일치 ---------------------------------------------------------------------------


def _locked(path: Path) -> dict[str, str]:
    packages = tomllib.loads(path.read_text("utf-8"))["package"]
    return {package["name"]: package["version"] for package in packages}


def test_bullmq_and_redis_versions_match_queue_kit() -> None:
    worker = _locked(WORKER_DIR / "uv.lock")
    kit = _locked(WORKER_DIR.parent / "docs/queue-verification/uv.lock")
    pinned = tomllib.loads((WORKER_DIR / "pyproject.toml").read_text("utf-8"))
    dependencies = pinned["project"]["dependencies"]

    for name in ("bullmq", "redis"):
        assert worker[name] == kit[name], name
        assert f"{name}=={worker[name]}" in dependencies, name


# CR3 판정 공급자·AI 쪽 켜기(BR1.1·BR1.4, NFR5) -----------------------------------------------

JUDGEMENT_KEY = "sk-proj-synthetic-judgement-key-must-not-leak"


def test_s1_openai_without_judgement_key_keeps_the_ai_side_off() -> None:
    """S1: 공급자 OpenAI(기본)이고 판정 키가 없으면 AI 쪽이 꺼지고 판정 공급자를 만들지 않는다."""
    from app.consumer import child

    settings = production(CATCHU_QUEUE_REDIS_URL=QUEUE)
    assert settings.live is not None
    assert settings.live.judgement_provider == "openai"
    assert settings.live.judgement_key is None
    assert settings.live.ai_side is False
    assembly = child.live_assembly(settings.for_child())
    assert assembly is not None and assembly.judge_factory is None


def test_openai_with_judgement_key_turns_the_ai_side_on() -> None:
    from app.consumer import child
    from app.judgement.openai_judge import OpenAIJudge

    settings = production(
        CATCHU_QUEUE_REDIS_URL=QUEUE,
        CATCHU_JUDGEMENT_PROVIDER="openai",
        CATCHU_JUDGEMENT_API_KEY=JUDGEMENT_KEY,
    )
    assert settings.live is not None and settings.live.ai_side is True
    assembly = child.live_assembly(settings.for_child())
    assert assembly is not None and assembly.judge_factory is not None
    judge = assembly.judge_factory()
    assert isinstance(judge, OpenAIJudge) and judge.name == "openai"


def test_s2_claude_turns_the_ai_side_on_with_the_generation_key() -> None:
    """S2: 공급자 Claude는 판정 키 없이 기존 생성 키로 켜진다. 판정 키가 있어도 보지 않는다."""
    from app.consumer import child
    from app.judgement.claude import ClaudeJudge

    settings = production(
        CATCHU_QUEUE_REDIS_URL=QUEUE,
        CATCHU_JUDGEMENT_PROVIDER="claude",
        CATCHU_JUDGEMENT_API_KEY=JUDGEMENT_KEY,
    )
    assert settings.live is not None
    assert settings.live.judgement_provider == "claude"
    assert settings.live.judgement_key is None
    assert settings.live.ai_side is True
    assembly = child.live_assembly(settings.for_child())
    assert assembly is not None and assembly.judge_factory is not None
    judge = assembly.judge_factory()
    assert isinstance(judge, ClaudeJudge) and judge.name == "claude"


@pytest.mark.parametrize("value", ["OpenAI", "anthropic", "synthetic", " openai"])
@pytest.mark.parametrize("node_env", [None, "test"])
def test_unknown_judgement_provider_stops_startup(
    value: str, node_env: str | None
) -> None:
    """공급자 값이 openai·claude 밖이면 개발·시험에서도 기동하지 않는다. 합성 공급자는 설정으로 만들 수 없다."""
    values = {"CATCHU_JUDGEMENT_PROVIDER": value}
    if node_env is None:
        values = {**LIVE, "CATCHU_QUEUE_REDIS_URL": QUEUE, **values}
    else:
        values["NODE_ENV"] = node_env
    with pytest.raises(SettingsError) as raised:
        ConsumerSettings.from_environment(values)
    assert "CATCHU_JUDGEMENT_PROVIDER" in str(raised.value)
    assert value.strip() not in str(raised.value).replace(
        "CATCHU_JUDGEMENT_PROVIDER", ""
    ).replace("openai 또는 claude", "")


def test_invalid_judgement_key_stops_startup_without_echoing_it() -> None:
    with pytest.raises(SettingsError) as raised:
        production(
            CATCHU_QUEUE_REDIS_URL=QUEUE, CATCHU_JUDGEMENT_API_KEY="has space key"
        )
    assert "CATCHU_JUDGEMENT_API_KEY" in str(raised.value)
    assert "has space key" not in str(raised.value)


def test_judgement_key_is_not_required_and_alone_does_not_open_live() -> None:
    """판정 키는 운영 필수 셋이 아니다. 개발에서 판정 키만 있으면 지금처럼 LIVE가 꺼진다."""
    assert load(NODE_ENV="test", CATCHU_JUDGEMENT_API_KEY=JUDGEMENT_KEY).live is None
    with pytest.raises(SettingsError):
        load(CATCHU_QUEUE_REDIS_URL=QUEUE, CATCHU_JUDGEMENT_API_KEY=JUDGEMENT_KEY)


def test_judgement_key_reaches_the_child_but_not_repr_or_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """판정 키는 설정 객체로만 자식에 가고, repr·환경에 남지 않는다(BR1.4)."""
    import app.consumer.service as service_module

    seen: dict[str, object] = {}

    class FakeService:
        def __init__(self, settings: ConsumerSettings, **_: object) -> None:
            seen["settings"] = settings

        async def run(self) -> int:
            import os

            seen["left"] = os.environ.get("CATCHU_JUDGEMENT_API_KEY", "absent")
            return 0

    monkeypatch.setattr(service_module, "ConsumerService", FakeService)
    monkeypatch.setenv("NODE_ENV", "test")
    for name, value in LIVE.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("CATCHU_JUDGEMENT_API_KEY", JUDGEMENT_KEY)

    assert main([]) == 0
    assert seen["left"] == "absent"
    settings = seen["settings"]
    assert isinstance(settings, ConsumerSettings)
    child = settings.for_child()
    for rendered in (repr(settings), repr(child), str(child.live)):
        assert JUDGEMENT_KEY not in rendered
    restored = pickle.loads(pickle.dumps(child))
    assert restored.live is not None and restored.live.judgement_key is not None
    assert restored.live.judgement_key.reveal() == JUDGEMENT_KEY
