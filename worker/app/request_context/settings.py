"""신뢰된 기동 설정으로만 내부 API 목적지와 전용 인증키를 정한다."""

import ipaddress
import math
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from app.collection.credentials import AccessToken


@dataclass(frozen=True, repr=False)
class ContextApiSettings:
    """요청·응답에서 URL을 받지 않는다. HTTP 예외는 개발·시험의 숫자 loopback뿐이다."""

    base_url: str
    api_key: AccessToken = field(repr=False)
    environment: str = "production"
    connect_timeout: float = 5.0
    read_timeout: float = 5.0
    max_response_bytes: int = 64 * 1024
    scheme: str = field(init=False)
    authority: str = field(init=False)

    def __post_init__(self) -> None:
        # URL 파서가 제어 문자를 제거하기 전에 거부한다. 예외에는 입력을 싣지 않는다.
        valid = False
        try:
            if not self.base_url or not all(
                0x21 <= ord(c) <= 0x7E for c in self.base_url
            ):
                raise ValueError
            parsed = urlsplit(self.base_url)
            host = parsed.hostname
            port = parsed.port
            if (
                parsed.scheme not in {"http", "https"}
                or not host
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
                or "?" in self.base_url
                or "#" in self.base_url
                or (port is not None and port < 1)
            ):
                raise ValueError
            try:
                address = ipaddress.ip_address(host)
            except ValueError:
                address = None
                if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", host):
                    raise ValueError from None
            if parsed.scheme == "http" and (
                self.environment not in {"development", "test"}
                or address is None
                or not address.is_loopback
            ):
                raise ValueError
            if (
                not isinstance(self.api_key, AccessToken)
                or re.fullmatch(r"[0-9a-fA-F]{64}", self.api_key.reveal()) is None
            ):
                raise ValueError
            if any(
                isinstance(value, bool) or not math.isfinite(value) or value <= 0
                for value in (self.connect_timeout, self.read_timeout)
            ):
                raise ValueError
            if type(self.max_response_bytes) is not int or self.max_response_bytes <= 0:
                raise ValueError
            object.__setattr__(self, "scheme", parsed.scheme)
            object.__setattr__(self, "authority", parsed.netloc)
            valid = True
        except (TypeError, ValueError):
            pass
        if not valid:
            raise ValueError("내부 맥락 API 설정이 유효하지 않다")

    @classmethod
    def from_environment(
        cls, environment: Mapping[str, str] | None = None
    ) -> "ContextApiSettings":
        """연결을 구성할 때 필수값을 확인한다. .env를 자동으로 읽거나 기록하지 않는다."""
        values = os.environ if environment is None else environment
        settings = None
        try:
            settings = cls(
                base_url=values.get("WORKER_CONTEXT_API_URL", ""),
                api_key=AccessToken(values.get("WORKER_CONTEXT_API_KEY", "")),
                environment=values.get("NODE_ENV", "production"),
            )
        except ValueError:
            pass
        if settings is None:
            raise ValueError("내부 맥락 API 설정이 없거나 유효하지 않다")
        return settings
