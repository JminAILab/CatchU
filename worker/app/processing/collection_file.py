"""수집 결과 파일(CR3 FR10 확인 명령): `CollectionOutcome`을 JSON 파일로 쓰고 읽는다.

수집 결과 모양 그대로 옮긴다. 자격정보·토큰은 수집 결과에 없으므로 파일에도 없다(수집 결과 정의). 읽을 때는
코드를 실행하는 형식(pickle 등)을 쓰지 않고, 필드의 형식 정보(type hint)만 보고 값을 다시 만든다. 알 수 없는
형식·칸·판본이면 읽지 않는다. 비공개 저장소의 코드 줄·커밋 메시지가 들어 있으므로 저장소 밖에만 둔다(확인
명령이 경로를 검사한다).
"""

import dataclasses
import json
import os
import types
import typing
from collections.abc import Mapping
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Final

from app.collection.collect import CollectionOutcome

FORMAT: Final = "catchu-collection-outcome"
VERSION: Final = 1


class CollectionFileError(ValueError):
    """수집 결과 파일을 읽을 수 없다. 문구에 파일 내용을 싣지 않는다."""


def _encode(value: object) -> object:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {
            field.name: _encode(getattr(value, field.name))
            for field in dataclasses.fields(value)
        }
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise CollectionFileError("시간대 없는 시각은 쓰지 않는다")
        return value.isoformat()
    if isinstance(value, tuple | list):
        return [_encode(each) for each in value]
    if isinstance(value, frozenset | set):
        return sorted(_encode(each) for each in value)  # type: ignore[type-var]
    if value is None or isinstance(value, str | int | float | bool):
        return value
    raise CollectionFileError(f"쓸 수 없는 형식: {type(value).__name__}")


def _decode(kind: Any, value: object) -> Any:
    origin = typing.get_origin(kind)
    args = typing.get_args(kind)
    if origin in (typing.Union, types.UnionType):
        options = [each for each in args if each is not type(None)]
        if value is None and len(options) < len(args):
            return None
        if len(options) != 1:
            raise CollectionFileError("한 형식으로 정할 수 없는 칸이다")
        return _decode(options[0], value)
    if origin is typing.Literal:
        if value not in args:
            raise CollectionFileError("정해 둔 값이 아니다")
        return value
    if origin is tuple:
        if not isinstance(value, list):
            raise CollectionFileError("목록이어야 한다")
        if len(args) == 2 and args[1] is Ellipsis:
            return tuple(_decode(args[0], each) for each in value)
        if len(args) != len(value):
            raise CollectionFileError("목록 길이가 맞지 않는다")
        return tuple(
            _decode(each_kind, each)
            for each_kind, each in zip(args, value, strict=True)
        )
    if origin is frozenset:
        if not isinstance(value, list):
            raise CollectionFileError("목록이어야 한다")
        return frozenset(_decode(args[0], each) for each in value)
    if isinstance(kind, type) and dataclasses.is_dataclass(kind):
        return _dataclass(kind, value)
    if isinstance(kind, type) and issubclass(kind, Enum):
        return kind(value)
    if kind is datetime:
        if not isinstance(value, str):
            raise CollectionFileError("시각은 글이어야 한다")
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise CollectionFileError("시각에는 시간대가 있어야 한다")
        return parsed
    if kind is float and isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    if kind in (str, int, bool) and type(value) is kind:
        return value
    raise CollectionFileError("칸의 형식이 맞지 않는다")


def _dataclass(kind: type, value: object) -> Any:
    if not isinstance(value, dict):
        raise CollectionFileError("객체여야 한다")
    hints = typing.get_type_hints(kind)
    fields = {field.name: field for field in dataclasses.fields(kind)}
    if set(value) != set(fields):
        raise CollectionFileError(f"{kind.__name__}의 칸이 맞지 않는다")
    return kind(**{name: _decode(hints[name], value[name]) for name in fields})


def dump(outcome: CollectionOutcome) -> str:
    return json.dumps(
        {"format": FORMAT, "version": VERSION, "outcome": _encode(outcome)},
        ensure_ascii=False,
        indent=1,
    )


def load(text: str) -> CollectionOutcome:
    try:
        document = json.loads(text)
    except (ValueError, RecursionError) as error:
        raise CollectionFileError("JSON이 아니다") from error
    if not isinstance(document, Mapping) or (
        document.get("format"),
        document.get("version"),
    ) != (FORMAT, VERSION):
        raise CollectionFileError("수집 결과 파일 판본이 아니다")
    outcome = _dataclass(CollectionOutcome, document.get("outcome"))
    assert isinstance(outcome, CollectionOutcome)
    return outcome


def write_private(path: Path, text: str) -> None:
    """본인만 읽고 쓰는 파일(0o600)로 쓴다. 만드는 순간부터 0o600이고, 만든 뒤 권한을 바꾸지 않는다.

    이미 있는 파일은 권한이 넓을 수 있어 지우고 새로 만든다(`O_EXCL`이라 그 사이 누가 같은 이름을 만들면
    쓰지 않고 실패한다).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(text)


def write(path: Path, outcome: CollectionOutcome) -> None:
    """파일을 새로 쓴다(본인만 읽고 쓰는 권한)."""
    write_private(path, dump(outcome))


def read(path: Path) -> CollectionOutcome:
    return load(path.read_text(encoding="utf-8"))
