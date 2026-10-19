"""코드 이름 규칙(#120): 모양, 줄 안 식별자 경계 일치, 줄마다 고를 수 있는 이름 목록.

응답 판정(response.py)·제목(title.py)·보내는 자료(request.py)가 같은 규칙을 쓰도록 한 곳에 둔다. 자료에 싣는
이름 목록은 이 규칙으로 확인되는 이름만 담으므로, 모델이 목록에서 고르면 이름 확인을 통과한다(2026-10-18
팀장 결정: 검증 실패의 대부분이 '이름이 그 줄에 없음'이라 줄마다 이름 목록을 미리 준다).
"""

import re
import unicodedata
from typing import Literal

_NAME = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")


def valid_name(name: object, max_chars: int) -> bool:
    """코드 이름 모양: 식별자 글자만, 영문자 하나 이상, 길이 상한 안. 공백·백틱·주소·명령문은 거부."""
    return (
        isinstance(name, str)
        and len(name) <= max_chars
        and _NAME.fullmatch(name) is not None
        and any(char.isalpha() for char in name)
    )


def _joins(char: str) -> bool:
    """이름에 이어 붙어 한 식별자가 되는 글자: 유니코드 글자·숫자, 밑줄, $, 결합 문자."""
    return char.isalnum() or char in "_$" or unicodedata.category(char).startswith("M")


NameMatch = Literal["FOUND", "JOINED_ASCII", "JOINED_NON_ASCII", "MISSING"]


def name_match(name: str, text: str) -> NameMatch:
    """식별자 경계로 일치하는가. `limit`이 `loginRateLimit`에, `func_1`이 `func_10`에, `한글limit`에 묻어
    확인되지 않는다. 한글 조사가 바로 붙은 이름(「limit을」)도 한 덩어리라 확인하지 않는다.

    경계로 일치하는 곳이 없을 때 붙어서만 나오면, 붙은 글자에 ASCII 밖 글자(한글 등)가 하나라도 있으면
    JOINED_NON_ASCII, 아니면 JOINED_ASCII다(실패 원인 건수용, 판정은 같다)."""
    found_joined = False
    non_ascii = False
    start = text.find(name)
    while start >= 0:
        end = start + len(name)
        before = text[start - 1] if start > 0 else ""
        after = text[end] if end < len(text) else ""
        joined = [char for char in (before, after) if char and _joins(char)]
        if not joined:
            return "FOUND"
        found_joined = True
        non_ascii = non_ascii or any(not char.isascii() for char in joined)
        start = text.find(name, start + 1)
    if not found_joined:
        return "MISSING"
    return "JOINED_NON_ASCII" if non_ascii else "JOINED_ASCII"


def name_in(name: str, text: str) -> bool:
    return name_match(name, text) == "FOUND"


def line_names(text: str, *, max_chars: int, limit: int) -> tuple[str, ...]:
    """줄에서 코드 이름으로 고를 수 있는 이름을 나온 순서대로, 겹치지 않게 최대 limit개.

    이어 붙는 글자(`_joins`)가 끊기지 않는 덩어리 하나가 통째로 이름 모양일 때만 담는다. 그래서 목록의
    이름은 모두 그 줄에서 `name_in`으로 확인된다(`한글limit`·`limit을`·`5px`는 담지 않는다).
    """
    found: dict[str, None] = {}
    index = 0
    while index < len(text) and len(found) < limit:
        if not _joins(text[index]):
            index += 1
            continue
        end = index
        while end < len(text) and _joins(text[end]):
            end += 1
        run = text[index:end]
        if valid_name(run, max_chars):
            found.setdefault(run)
        index = end
    return tuple(found)
