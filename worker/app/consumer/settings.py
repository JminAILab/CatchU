"""분석 소비자 기동 설정: 환경변수 읽기와 검사, 비밀값 숨김, 시간 상한.

큐 주소에는 비밀번호가 들어가므로 주소 전체를 비밀값으로 다룬다. LIVE 처리 설정(요청 정보 조회 목적지·키, 생성
제공자 키)은 운영에서 필수다. 판정 공급자(`CATCHU_JUDGEMENT_PROVIDER`)·판정 키(`CATCHU_JUDGEMENT_API_KEY`)는
선택이며 AI 쪽이 켜졌는지만 정한다(CR3 BR1.1). 검사에 실패하면 입력 값을 오류 문구에 싣지 않는다. 시간 상한은 환경변수로 열지 않고
코드 상수로 둔다(시험은 생성자 인자로 바꾼다).
"""

import os
import re
from collections.abc import Mapping, MutableMapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Final, Literal, NoReturn
from urllib.parse import urlsplit

from app.collection.credentials import AccessToken
from app.request_context.settings import ContextApiSettings

if TYPE_CHECKING:
    from app.pdf_extraction.settings import PdfSettings

Environment = Literal["production", "development", "test"]

DEFAULT_PREFIX: Final = "catchu"
DEFAULT_CONCURRENCY: Final = 1
# 10월 운영값. 2 이상은 종료 직전에 꺼낸 작업의 실패 기록 틈(worker/docs/queue-consumer.md)을
# 고치기 전까지 받지 않는다(10/15 팀장 결정).
MAX_CONCURRENCY: Final = 1
DEFAULT_MOCK_SCENARIO: Final = "succeeded-one-candidate"
# 설정 객체에 담은 비밀값. spawn 자식은 부모의 환경변수를 물려받으므로 부모가 읽은 뒤 환경에서 지운다.
# 큐 주소는 자식에 주지 않고, LIVE 키는 자식용 설정(`ChildSettings.live`)으로만 넘긴다.
SECRET_ENV: Final = (
    "CATCHU_QUEUE_REDIS_URL",
    "WORKER_CONTEXT_API_KEY",
    "CATCHU_GENERATION_API_KEY",
    "CATCHU_JUDGEMENT_API_KEY",
)
# 운영 필수 LIVE 설정. 판정 키(CR3)는 넣지 않는다: 없으면 AI 쪽이 꺼진 채 기동한다(오류 아님).
LIVE_ENV: Final = (
    "WORKER_CONTEXT_API_URL",
    "WORKER_CONTEXT_API_KEY",
    "CATCHU_GENERATION_API_KEY",
)
# 판정 공급자(CR3 BR1.1). 값이 없으면 openai다. 이 밖의 값이면 기동하지 않는다.
JudgementProviderName = Literal["openai", "claude"]
DEFAULT_JUDGEMENT_PROVIDER: Final[JudgementProviderName] = "openai"

_HOST = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?")
_PREFIX = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")


class SettingsError(ValueError):
    """기동 설정이 없거나 틀렸다. 문구에는 설정 이름만 담고 값은 담지 않는다."""


class QueueUrl:
    """큐 서버 주소. 비밀번호가 들어 있으므로 문자열 변환·repr에 드러내지 않는다."""

    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        self._value = value

    def reveal(self) -> str:
        return self._value

    def __repr__(self) -> str:
        return "QueueUrl(***)"

    __str__ = __repr__

    def __reduce__(self) -> NoReturn:
        # 자식 프로세스로 넘기지 않는다(자식은 큐에 붙지 않는다).
        raise TypeError("큐 주소는 다른 프로세스로 넘기지 않는다")


@dataclass(frozen=True)
class Limits:
    """대기·처리 상한(초). 총 처리는 #424 후속 결정, 나머지는 기존 소비자 계획을 따른다."""

    # #424 후속 결정의 60분에 맞춘다. 이전 구현의 20분에서 변경하며 시작점은 꺼낸 시각 그대로다.
    total: float = 60 * 60  # 꺼낸 시각부터 종결 프레임까지
    child_grace: float = 30  # 자식은 total + child_grace에 스스로 끝낸다
    parent_watch_interval: float = 1  # 자식이 부모 PID를 확인하는 간격
    event_send: float = 5
    result_send: float = 10
    receipt_poll_once: float = 3
    receipt_interval: float = 5
    receipt_window: float = 5 * 60
    receipt_remove: float = 3
    child_exit_wait: float = 5  # 종결 프레임 뒤 자식이 스스로 끝나기를 기다림
    terminate_wait: float = 5  # SIGTERM 뒤
    kill_wait: float = 5  # SIGKILL 뒤 회수
    pause: float = 2
    shutdown: float = 25
    # LIVE 생성 마감은 꺼낸 시각 + total − generation_margin이다(결과 조합·검사·프레임 전달 여유).
    generation_margin: float = 60
    frame_max_bytes: int = 16 * 1024 * 1024
    lock_duration_ms: int = 30_000
    stalled_interval_ms: int = 30_000


@dataclass(frozen=True)
class LiveSettings:
    """LIVE 처리 설정: 요청 정보 조회 목적지·전용 키와 생성 제공자(Claude API) 키, 판정 공급자와 판정 키(CR3).
    값은 repr에 드러내지 않는다."""

    context_api: ContextApiSettings = field(repr=False)
    generation_key: AccessToken = field(repr=False)
    judgement_provider: JudgementProviderName = DEFAULT_JUDGEMENT_PROVIDER
    # OpenAI 판정 키(`CATCHU_JUDGEMENT_API_KEY`). 없을 수 있다.
    judgement_key: AccessToken | None = field(default=None, repr=False)

    @property
    def ai_side(self) -> bool:
        """AI 쪽이 켜졌는가(BR1.1). openai면 판정 키가 있을 때, claude면 생성 키로 늘 켜진다."""
        return self.judgement_provider == "claude" or self.judgement_key is not None


@dataclass(frozen=True)
class ChildSettings:
    """자식에 넘기는 설정. 큐 접속 정보는 담지 않는다. LIVE 키는 자식이 요청 처리에 쓰므로 담는다."""

    environment: Environment
    mock_enabled: bool
    mock_scenario: str
    limits: Limits
    # 없으면(개발·시험에서 LIVE 설정을 넣지 않음) LIVE 요청을 처리 전에 거부한다.
    live: LiveSettings | None = None


@dataclass(frozen=True)
class ConsumerSettings:
    environment: Environment
    queue_url: QueueUrl | None = field(repr=False)
    prefix: str
    concurrency: int
    mock_enabled: bool
    mock_scenario: str = DEFAULT_MOCK_SCENARIO
    limits: Limits = field(default_factory=Limits)
    live: LiveSettings | None = None
    # PDF 글 추출 소비자(U8). 없으면 둘째 Worker를 띄우지 않는다. 설정 모듈은 app/pdf_extraction/settings.py.
    pdf: "PdfSettings | None" = None

    @property
    def consumer_enabled(self) -> bool:
        return self.queue_url is not None

    def for_child(self) -> ChildSettings:
        return ChildSettings(
            environment=self.environment,
            mock_enabled=self.mock_enabled,
            mock_scenario=self.mock_scenario,
            limits=self.limits,
            live=self.live,
        )

    @classmethod
    def from_environment(
        cls,
        environment: Mapping[str, str] | None = None,
        *,
        limits: Limits | None = None,
        mock_scenario: str = DEFAULT_MOCK_SCENARIO,
    ) -> "ConsumerSettings":
        # 순환 참조(PDF 설정 모듈이 SettingsError를 가져옴)를 피해 여기서 불러온다.
        from app.pdf_extraction.settings import pdf_settings_from_environment

        values = os.environ if environment is None else environment
        env = _environment(values.get("NODE_ENV"))
        development = env in ("development", "test")
        # 판정 공급자 값은 LIVE 설정이 없는 개발·시험에서도 검사한다(잘못된 값이면 기동하지 않는다).
        provider = _judgement_provider(values.get("CATCHU_JUDGEMENT_PROVIDER"))
        return cls(
            environment=env,
            queue_url=_queue_url(values.get("CATCHU_QUEUE_REDIS_URL"), development),
            prefix=_prefix(values.get("CATCHU_QUEUE_PREFIX")),
            concurrency=_concurrency(values.get("CATCHU_WORKER_CONCURRENCY")),
            mock_enabled=_mock(values.get("CATCHU_WORKER_MOCK"), development),
            mock_scenario=mock_scenario,
            limits=limits or Limits(),
            live=_live(values, development, provider),
            pdf=pdf_settings_from_environment(values),
        )


def _environment(value: str | None) -> Environment:
    # 개발 동작은 development·test에서만 연다. 그 밖의 값은 모두 운영으로 본다.
    if value == "development":
        return "development"
    if value == "test":
        return "test"
    return "production"


def _printable(value: str) -> bool:
    return all(0x21 <= ord(c) <= 0x7E for c in value)


def _queue_url(value: str | None, development: bool) -> QueueUrl | None:
    if value is None or value == "":
        if development:
            return None
        raise SettingsError("운영 설정에는 CATCHU_QUEUE_REDIS_URL이 필요하다")
    valid = False
    try:
        if not _printable(value):
            raise ValueError
        parsed = urlsplit(value)
        host = parsed.hostname
        port = parsed.port  # 범위 밖이면 ValueError
        allowed = ("rediss", "redis") if development else ("rediss",)
        # 질의 문자열은 redis-py 연결 옵션(예: TLS 인증서 검증 끄기)이 되므로 받지 않는다.
        valid = (
            parsed.scheme in allowed
            and host is not None
            and _HOST.fullmatch(host) is not None
            and (port is None or port >= 1)
            and re.fullmatch(r"(/[0-9]{1,2})?", parsed.path) is not None
            and not parsed.query
            and not parsed.fragment
            and "?" not in value
            and "#" not in value
        )
    except ValueError:
        valid = False
    if not valid:
        raise SettingsError(
            "CATCHU_QUEUE_REDIS_URL이 유효하지 않다"
            " (운영은 rediss://만, 개발·시험은 redis://도 받는다. 질의 문자열은 받지 않는다)"
        )
    return QueueUrl(value)


def _prefix(value: str | None) -> str:
    if value is None or value == "":
        return DEFAULT_PREFIX
    if _PREFIX.fullmatch(value) is None:
        raise SettingsError("CATCHU_QUEUE_PREFIX는 영문·숫자·_·-로 64자 이하여야 한다")
    return value


def _concurrency(value: str | None) -> int:
    if value is None or value == "":
        return DEFAULT_CONCURRENCY
    if re.fullmatch(r"[0-9]{1,2}", value) is None or not (
        1 <= int(value) <= MAX_CONCURRENCY
    ):
        raise SettingsError(
            f"CATCHU_WORKER_CONCURRENCY는 지금 {MAX_CONCURRENCY}만 받는다"
        )
    return int(value)


def _mock(value: str | None, development: bool) -> bool:
    if value is None or value == "":
        return development
    if value not in ("true", "false"):
        raise SettingsError("CATCHU_WORKER_MOCK은 true 또는 false여야 한다")
    if value == "true" and not development:
        # MOCK 처리는 개발·시험에서만 연다(10/15 결정). 운영에서 켜려 하면 기동하지 않는다.
        raise SettingsError("운영 설정에서는 CATCHU_WORKER_MOCK을 켤 수 없다")
    return value == "true"


def _judgement_provider(value: str | None) -> JudgementProviderName:
    if value is None or value == "":
        return DEFAULT_JUDGEMENT_PROVIDER
    if value == "openai":
        return "openai"
    if value == "claude":
        return "claude"
    raise SettingsError("CATCHU_JUDGEMENT_PROVIDER는 openai 또는 claude여야 한다")


def _judgement_key(value: str | None) -> AccessToken | None:
    if value is None or value == "":
        return None
    try:
        return AccessToken(value)
    except ValueError:
        pass
    raise SettingsError("CATCHU_JUDGEMENT_API_KEY가 유효하지 않다")


def _live(
    values: Mapping[str, str],
    development: bool,
    provider: JudgementProviderName = DEFAULT_JUDGEMENT_PROVIDER,
) -> LiveSettings | None:
    if not any(values.get(name) for name in LIVE_ENV):
        if development:
            return None
        raise SettingsError(
            "운영 설정에는 WORKER_CONTEXT_API_URL·WORKER_CONTEXT_API_KEY·"
            "CATCHU_GENERATION_API_KEY가 필요하다"
        )
    context_api = generation_key = None
    try:
        context_api = ContextApiSettings.from_environment(values)
    except ValueError:
        pass
    if context_api is None:
        raise SettingsError(
            "WORKER_CONTEXT_API_URL·WORKER_CONTEXT_API_KEY·"
            "WORKER_CONTEXT_API_ALLOW_CLUSTER_HTTP가 없거나 유효하지 않다"
            " (http 주소는 개발·시험의 숫자 loopback, 또는 명시 설정을 켠 클러스터 안 서비스 이름만 받는다)"
        )
    try:
        generation_key = AccessToken(values.get("CATCHU_GENERATION_API_KEY", ""))
    except ValueError:
        pass
    if generation_key is None:
        raise SettingsError("CATCHU_GENERATION_API_KEY가 없거나 유효하지 않다")
    return LiveSettings(
        context_api=context_api,
        generation_key=generation_key,
        judgement_provider=provider,
        # 공급자가 claude면 판정 키를 보지 않는다(생성 키로 켜진다).
        judgement_key=(
            _judgement_key(values.get("CATCHU_JUDGEMENT_API_KEY"))
            if provider == "openai"
            else None
        ),
    )


def drop_secret_env(environment: MutableMapping[str, str] | None = None) -> None:
    """설정을 읽은 뒤 부르면, 그 뒤에 띄우는 자식은 비밀값을 환경변수로 물려받지 않는다."""
    values = os.environ if environment is None else environment
    for name in SECRET_ENV:
        values.pop(name, None)
