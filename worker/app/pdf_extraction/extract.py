"""pypdf로 쪽별 글을 뽑는다(BR3.1·BR3.2). 자식 프로세스에서 불린다.

판정 순서: 파싱 실패 → UNREADABLE_FILE, 암호화 → ENCRYPTED, 쪽 수 0 → UNREADABLE_FILE, 쪽 수 > 50 →
PAGE_LIMIT_EXCEEDED(쪽 글을 뽑기 전에), 아니면 쪽마다 extract_text. 뽑은 글은 NUL만 빼고 가공하지
않으며, 공백·제어 문자만이면 그 쪽만 readable=false·text=''다. 어느 한 쪽이라도 쪽 읽기·글 추출에서 예외가
나면 BR3.2의 "파싱 예외"로 보아 파일 전체를 UNREADABLE_FILE로 끝낸다(D25, 담당자 결정 2026-11-10).
MemoryError는 여기서 잡지 않고 올려 보내 자식(child.py)의 메모리 제한 분류를 따르게 한다. 결과는 순수 자료(dict)다.

쪽 글 합계(정리한 text의 코드 포인트 수, 읽을 수 없는 쪽은 0)가 `TEXT_LIMIT`(60,000)를 넘으면 그 쪽에서 추출을 멈추고
TEXT_LIMIT_EXCEEDED로 끝낸다. 부분 pages는 돌려주지 않는다(팀장 결정 2026-11-10, #420 issuecomment-6759834176, BR4.5).
"""

import io
import logging
import unicodedata
from typing import Any, Final

from pypdf import PdfReader

from app.pdf_extraction.settings import PAGE_LIMIT, TEXT_LIMIT

logger = logging.getLogger(__name__)

NUL: Final = "\x00"


def normalize_page_text(raw: str) -> tuple[str, bool]:
    """(text, readable). NUL만 제거하고, 남은 글이 공백·제어 문자(Cc)뿐이면 ('', False)."""
    text = raw.replace(NUL, "")
    if all(ch.isspace() or unicodedata.category(ch) == "Cc" for ch in text):
        return "", False
    return text, True


def page_entry(page_number: int, raw: str) -> dict[str, Any]:
    text, readable = normalize_page_text(raw)
    return {"pageNumber": page_number, "readable": readable, "text": text}


def _failed(code: str) -> dict[str, Any]:
    return {"outcome": "FAILED", "failureCode": code}


def extract_pages(
    data: bytes, page_limit: int = PAGE_LIMIT, text_limit: int = TEXT_LIMIT
) -> dict[str, Any]:
    """`{"outcome": "SUCCEEDED", "pages": [...]}` 또는 `{"outcome": "FAILED", "failureCode": ...}`.

    pypdf 예외는 종류 이름만 로그에 남긴다(글·바이트는 남기지 않는다).
    """
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        encrypted = bool(reader.is_encrypted)
    except MemoryError:
        raise
    except Exception as error:
        logger.info("PDF 파싱 실패: error=%s", type(error).__name__)
        return _failed("UNREADABLE_FILE")
    if encrypted:
        return _failed("ENCRYPTED")
    try:
        page_count = len(reader.pages)
    except MemoryError:
        raise
    except Exception as error:
        logger.info("PDF 쪽 수 읽기 실패: error=%s", type(error).__name__)
        return _failed("UNREADABLE_FILE")
    if page_count == 0:
        return _failed("UNREADABLE_FILE")
    if page_count > page_limit:
        return _failed("PAGE_LIMIT_EXCEEDED")
    pages: list[dict[str, Any]] = []
    total = 0
    for index in range(page_count):
        try:
            raw = reader.pages[index].extract_text()
        except MemoryError:
            raise
        except Exception as error:
            # 쪽 단위 파싱·추출 예외는 파일 전체 실패다(BR3.2, D25). 빈 쪽(BR3.1)과 구분한다.
            logger.info(
                "쪽 글 추출 실패(파일 전체 UNREADABLE_FILE): page=%s error=%s",
                index + 1,
                type(error).__name__,
            )
            return _failed("UNREADABLE_FILE")
        entry = page_entry(index + 1, raw if isinstance(raw, str) else "")
        # 파이썬 str 길이 = 코드 포인트 수(api codePointLength와 같은 셈).
        total += len(entry["text"])
        if total > text_limit:
            logger.info("쪽 글 합계 상한 초과: page=%s limit=%s", index + 1, text_limit)
            return _failed("TEXT_LIMIT_EXCEEDED")
        pages.append(entry)
    return {"outcome": "SUCCEEDED", "pages": pages}
