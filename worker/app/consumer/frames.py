"""부모·자식 사이 프레임: JSON 봉투 `{"kind": …}`를 send_bytes로 주고받는다(pickle 없음).

종류는 진행 알림 `event`와 종결 4종 `rejected`(사유·위치만), `result`(Result 메시지),
`uncertain`, `defect`(예외 종류 이름만)다. 이 모듈은 자식에서도 불리므로 BullMQ·FastAPI를
불러오지 않는다.
"""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

FrameKind = Literal["event", "rejected", "result", "uncertain", "defect"]
TERMINAL_KINDS: frozenset[str] = frozenset(
    {"rejected", "result", "uncertain", "defect"}
)


class FrameError(ValueError):
    """프레임을 해석하지 못했다(통신 손상). 원문은 싣지 않는다."""


@dataclass(frozen=True)
class Frame:
    kind: FrameKind
    message: dict[str, Any] | None = None  # event·result
    reason: str | None = None  # rejected
    fields: tuple[str, ...] = ()  # rejected: 어긋난 위치(JSON Pointer)
    error_type: str | None = None  # defect

    @property
    def terminal(self) -> bool:
        return self.kind in TERMINAL_KINDS


def encode(frame: Frame) -> bytes:
    body: dict[str, Any] = {"kind": frame.kind}
    if frame.kind in ("event", "result"):
        body["message"] = frame.message
    elif frame.kind == "rejected":
        body["reason"] = frame.reason
        body["fields"] = list(frame.fields)
    elif frame.kind == "defect":
        body["errorType"] = frame.error_type
    return json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")


def _text(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise FrameError("프레임 값이 문자열이 아니다")
    return value


def decode(raw: bytes) -> Frame:
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise FrameError("프레임이 JSON이 아니다") from None
    if not isinstance(body, Mapping):
        raise FrameError("프레임이 객체가 아니다")
    kind = body.get("kind")
    if kind in ("event", "result"):
        message = body.get("message")
        if not isinstance(message, dict):
            raise FrameError("메시지 프레임에 메시지가 없다")
        return Frame(kind, message=message)
    if kind == "rejected":
        fields = body.get("fields")
        if not isinstance(fields, list):
            raise FrameError("거부 프레임의 위치 목록이 없다")
        return Frame(
            "rejected",
            reason=_text(body.get("reason")),
            fields=tuple(_text(item) for item in fields),
        )
    if kind == "uncertain":
        return Frame("uncertain")
    if kind == "defect":
        return Frame("defect", error_type=_text(body.get("errorType")))
    raise FrameError("알 수 없는 프레임 종류")
