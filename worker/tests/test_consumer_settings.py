"""분석 소비자 기동 설정. 계획 「PR① 자동 시험」 1·20과 큐 규격 ID 검사."""

import logging
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
WORKER_DIR = Path(__file__).resolve().parents[1]


def load(**values: str) -> ConsumerSettings:
    return ConsumerSettings.from_environment(values)


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
    settings = load(CATCHU_QUEUE_REDIS_URL=f"rediss://:{SECRET}@queue.internal:6379")

    assert settings.environment == "production"
    assert settings.consumer_enabled is True
    assert settings.mock_enabled is False
    with pytest.raises(SettingsError):
        load(CATCHU_QUEUE_REDIS_URL="redis://queue.internal:6379")


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


@pytest.mark.parametrize("value", ["0", "5", "-1", "abc", "1.5", "01x"])
def test_invalid_concurrency_is_rejected(value: str) -> None:
    with pytest.raises(SettingsError):
        load(NODE_ENV="test", CATCHU_WORKER_CONCURRENCY=value)


def test_concurrency_prefix_and_mock_values() -> None:
    settings = load(
        NODE_ENV="test",
        CATCHU_WORKER_CONCURRENCY="2",
        CATCHU_QUEUE_PREFIX="catchu-test_1",
        CATCHU_WORKER_MOCK="false",
    )

    assert (settings.concurrency, settings.prefix, settings.mock_enabled) == (
        2,
        "catchu-test_1",
        False,
    )
    with pytest.raises(SettingsError):
        load(NODE_ENV="test", CATCHU_QUEUE_PREFIX="a:b")
    with pytest.raises(SettingsError):
        load(NODE_ENV="test", CATCHU_WORKER_MOCK="yes")


def test_mock_cannot_be_turned_on_in_production() -> None:
    with pytest.raises(SettingsError):
        load(
            CATCHU_QUEUE_REDIS_URL="rediss://queue.internal:6379",
            CATCHU_WORKER_MOCK="true",
        )
    assert (
        load(
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


def test_queue_url_is_dropped_before_children_can_inherit_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import subprocess
    import sys

    import app.consumer.service as service_module

    url = f"redis://user:{SECRET}@127.0.0.1:6379"
    seen: dict[str, object] = {}

    class FakeService:
        def __init__(self, settings: ConsumerSettings, **_: object) -> None:
            seen["settings_url"] = settings.queue_url

        async def run(self) -> int:
            # 서비스가 뜬 뒤 띄우는 자식 프로세스는 부모의 환경변수를 물려받는다.
            seen["child_env"] = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    "import os; print(os.environ.get('CATCHU_QUEUE_REDIS_URL', 'absent'))",
                ],
                capture_output=True,
                text=True,
                check=True,
            ).stdout.strip()
            return 0

    monkeypatch.setattr(service_module, "ConsumerService", FakeService)
    monkeypatch.setenv("NODE_ENV", "test")
    monkeypatch.setenv("CATCHU_QUEUE_REDIS_URL", url)

    assert main([]) == 0
    queue_url = seen["settings_url"]
    assert isinstance(queue_url, QueueUrl) and queue_url.reveal() == url
    assert seen["child_env"] == "absent"


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
