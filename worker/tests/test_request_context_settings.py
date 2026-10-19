"""내부 목적지·전용키를 신뢰된 설정에만 고정하는 경계 검사."""

import pytest
from context_synthetic import KEY

from app.collection.credentials import AccessToken
from app.request_context import ContextApiSettings


@pytest.mark.parametrize(
    "url",
    [
        "https://api.internal",
        "https://api.internal:8443/",
        "https://127.0.0.1",
        "https://[::1]:443",
    ],
)
def test_https_origin_is_allowed(url: str) -> None:
    settings = ContextApiSettings(url, AccessToken(KEY))
    assert settings.scheme == "https"
    assert KEY not in repr(settings)


@pytest.mark.parametrize("url", ["http://127.0.0.1:3001", "http://[::1]:3001"])
@pytest.mark.parametrize("environment", ["development", "test"])
def test_http_only_for_explicit_local_environments(url: str, environment: str) -> None:
    assert ContextApiSettings(url, AccessToken(KEY), environment).scheme == "http"


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:3001",
        "http://api.internal:3001",
        "http://192.168.1.1",
        "http://169.254.169.254",
        "ftp://api.internal",
        "https://user:password@api.internal",
        "https://api.internal/v1",
        "https://api.internal?token=value",
        "https://api.internal#fragment",
        "https://api.internal?",
        "https://api.internal#",
        "https://api.internal\n",
        "https://api.internal:0",
        "https://api.internal:99999",
        "https://evil.invalid\\@api.internal",
        "",
    ],
)
def test_invalid_destinations_are_rejected_without_echo(url: str) -> None:
    with pytest.raises(ValueError) as raised:
        ContextApiSettings(url, AccessToken(KEY), "test")
    assert str(raised.value) == "내부 맥락 API 설정이 유효하지 않다"
    assert raised.value.__context__ is None


@pytest.mark.parametrize("environment", ["production", "staging", "", "Test"])
def test_http_is_disabled_in_all_other_environments(environment: str) -> None:
    with pytest.raises(ValueError):
        ContextApiSettings("http://127.0.0.1", AccessToken(KEY), environment)


@pytest.mark.parametrize("key", ["a" * 32, "z" * 64, "a" * 63, "a" * 65])
def test_invalid_worker_keys_are_rejected(key: str) -> None:
    with pytest.raises(ValueError) as raised:
        ContextApiSettings("https://api.internal", AccessToken(key))
    assert key not in str(raised.value)


@pytest.mark.parametrize(
    "values",
    [
        {},
        {"WORKER_CONTEXT_API_URL": "https://api.internal"},
        {"WORKER_CONTEXT_API_KEY": KEY},
        {
            "WORKER_CONTEXT_API_URL": "https://api.internal",
            "WORKER_CONTEXT_API_KEY": KEY + "\n",
        },
    ],
)
def test_missing_or_invalid_configuration_fails_before_lookup(
    values: dict[str, str],
) -> None:
    with pytest.raises(ValueError) as raised:
        ContextApiSettings.from_environment(values)
    assert KEY not in str(raised.value)
    assert raised.value.__cause__ is raised.value.__context__ is None


def test_environment_factory_uses_explicit_values_only() -> None:
    settings = ContextApiSettings.from_environment(
        {
            "WORKER_CONTEXT_API_URL": "http://127.0.0.1:3001",
            "WORKER_CONTEXT_API_KEY": KEY,
            "NODE_ENV": "test",
        }
    )
    assert settings.authority == "127.0.0.1:3001"


@pytest.mark.parametrize(
    "options",
    [
        {"connect_timeout": 0.0},
        {"read_timeout": -1.0},
        {"read_timeout": float("nan")},
        {"read_timeout": float("inf")},
        {"max_response_bytes": 0},
    ],
)
def test_limits_must_be_finite_positive(options: dict[str, float]) -> None:
    with pytest.raises(ValueError):
        ContextApiSettings("https://api.internal", AccessToken(KEY), **options)  # type: ignore[arg-type]


# 운영에서 클러스터 안 주소만 http를 받는다(10/15 팀장 결정 질문 4의 조건 3) ------------------------

CLUSTER_URL = "http://api.catchu.svc.cluster.local:3001"


@pytest.mark.parametrize("environment", ["production", "staging", "test"])
@pytest.mark.parametrize(
    "url",
    [
        CLUSTER_URL,
        "http://api.catchu.svc.cluster.local",
        "http://API.Catchu.svc.cluster.local:3001",
        "http://catchu-api-1.prod-ns.svc.cluster.local:80/",
    ],
)
def test_cluster_service_http_needs_explicit_setting(
    url: str, environment: str
) -> None:
    allowed = ContextApiSettings(
        url, AccessToken(KEY), environment, allow_cluster_http=True
    )
    assert allowed.scheme == "http"
    with pytest.raises(ValueError):
        ContextApiSettings(url, AccessToken(KEY), environment)


@pytest.mark.parametrize(
    "url",
    [
        # 클러스터 안 서비스 이름이 아닌 http는 설정을 켜도 받지 않는다.
        "http://api.internal:3001",
        "http://10.0.1.5:3001",
        "http://127.0.0.1:3001",
        "http://api.svc.cluster.local:3001",
        "http://a.b.c.svc.cluster.local:3001",
        "http://api.catchu.pod.cluster.local:3001",
        "http://api.catchu.svc.cluster.local.:3001",
        "http://api.catchu.svc.cluster.local.evil.invalid:3001",
        "http://-api.catchu.svc.cluster.local:3001",
        "http://api_x.catchu.svc.cluster.local:3001",
    ],
)
def test_cluster_http_allowance_is_narrow(url: str) -> None:
    with pytest.raises(ValueError):
        ContextApiSettings(url, AccessToken(KEY), "production", allow_cluster_http=True)


def test_cluster_setting_keeps_https_and_local_http() -> None:
    settings = ContextApiSettings(
        "https://api.internal", AccessToken(KEY), allow_cluster_http=True
    )
    assert settings.scheme == "https"
    local = ContextApiSettings(
        "http://127.0.0.1:3001", AccessToken(KEY), "test", allow_cluster_http=True
    )
    assert local.scheme == "http"


@pytest.mark.parametrize(
    ("flag", "allowed"),
    [("true", True), ("false", False), ("", False), (None, False)],
)
def test_cluster_setting_from_environment(flag: str | None, allowed: bool) -> None:
    values = {"WORKER_CONTEXT_API_URL": CLUSTER_URL, "WORKER_CONTEXT_API_KEY": KEY}
    if flag is not None:
        values["WORKER_CONTEXT_API_ALLOW_CLUSTER_HTTP"] = flag
    if allowed:
        assert ContextApiSettings.from_environment(values).scheme == "http"
    else:
        with pytest.raises(ValueError):
            ContextApiSettings.from_environment(values)


@pytest.mark.parametrize("flag", ["TRUE", "1", "yes", " true"])
def test_cluster_setting_rejects_other_values(flag: str) -> None:
    values = {
        "WORKER_CONTEXT_API_URL": "https://api.internal",
        "WORKER_CONTEXT_API_KEY": KEY,
        "WORKER_CONTEXT_API_ALLOW_CLUSTER_HTTP": flag,
    }
    with pytest.raises(ValueError) as raised:
        ContextApiSettings.from_environment(values)
    assert raised.value.__cause__ is raised.value.__context__ is None


def test_cluster_setting_must_be_a_real_boolean() -> None:
    with pytest.raises(ValueError):
        ContextApiSettings(
            CLUSTER_URL,
            AccessToken(KEY),
            allow_cluster_http="true",  # type: ignore[arg-type]
        )
