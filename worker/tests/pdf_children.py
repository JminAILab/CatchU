"""PDF 처리 함수 시험용 자식 대상 함수. spawn 자식이 이 모듈을 이름으로 불러온다.

정상 자식은 `app.pdf_extraction.child.pdf_child_main`이다. 여기 함수들은 멈추거나, 종결 없이 끝나거나,
메모리 초과·예외·저장소 장애를 흉내 낸다. 바꾸는 것은 자식 프로세스 안의 이름뿐이다.
"""

import os
import signal
import time
from collections.abc import Mapping
from multiprocessing.connection import Connection
from typing import Any, NoReturn

from app.consumer.child import ChildInput, start_watchdog
from app.pdf_extraction import child as pdf_child
from app.pdf_extraction.reader import SourceUnavailable, read_pdf
from app.pdf_extraction.settings import S3Source


def hang(conn: Connection, child_input: ChildInput) -> None:
    """종결 프레임 없이 멈춘다(부모 시간 제한 확인)."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    start_watchdog(child_input)
    while True:
        time.sleep(1)


def exit_without_frame(conn: Connection, child_input: ChildInput) -> None:
    """종결 프레임 없이 바로 끝난다."""
    conn.close()
    os._exit(3)


def memory_error(conn: Connection, child_input: ChildInput) -> None:
    def boom(*args: Any, **kwargs: Any) -> NoReturn:
        raise MemoryError

    setattr(pdf_child, "extract_pages", boom)  # noqa: B010
    pdf_child.pdf_child_main(conn, child_input)


def page_extract_error(conn: Connection, child_input: ChildInput) -> None:
    """pypdf 쪽 글 추출이 예외를 낸다(D25: 파일 전체 UNREADABLE_FILE이어야 함)."""
    from pypdf import PageObject

    def boom(*args: Any, **kwargs: Any) -> NoReturn:
        raise ValueError("broken content stream")

    setattr(PageObject, "extract_text", boom)  # noqa: B010
    pdf_child.pdf_child_main(conn, child_input)


class _MemoryBody:
    def read(self, size: int = -1) -> bytes:
        raise MemoryError

    def close(self) -> None:
        pass


class _MemoryS3:
    def get_object(self, *, Bucket: str, Key: str) -> Mapping[str, Any]:
        return {"Body": _MemoryBody()}


def s3_body_memory_error(conn: Connection, child_input: ChildInput) -> None:
    """실제 `read_pdf`의 S3 경로를 타되 본문 읽기에서 MemoryError가 난다(R-MEM, 합성)."""

    def read(
        source: object, key: str, max_bytes: int, *, total_timeout: float | None = None
    ) -> bytes:
        # 자식이 넘기는 전체 시간 예산을 그대로 넘겨, 예산을 거는 경로에서도 MemoryError 분류가 유지되는지 본다.
        return read_pdf(
            S3Source("catchu-test"),
            key,
            max_bytes,
            s3_client_factory=_MemoryS3,
            total_timeout=total_timeout,
        )

    setattr(pdf_child, "read_pdf", read)  # noqa: B010
    pdf_child.pdf_child_main(conn, child_input)


def allocate_until_limit(conn: Connection, child_input: ChildInput) -> None:
    """추출 단계에서 실제로 메모리를 계속 잡는다(MemoryError를 직접 일으키지 않음).

    Linux에서는 `pdf_child_main`이 건 RLIMIT_AS에 걸려 할당이 실패해야 한다. 4 GiB까지 잡아도 실패하지
    않으면 제한이 걸리지 않은 것이므로 정상 결과를 돌려 시험이 실패하게 한다.
    """

    def hog(*args: Any, **kwargs: Any) -> dict[str, Any]:
        held: list[bytearray] = []
        for _ in range(4096):
            held.append(bytearray(1024 * 1024))
        return {
            "outcome": "SUCCEEDED",
            "pages": [{"pageNumber": 1, "readable": True, "text": "no limit"}],
        }

    setattr(pdf_child, "extract_pages", hog)  # noqa: B010
    pdf_child.pdf_child_main(conn, child_input)


def raise_defect(conn: Connection, child_input: ChildInput) -> None:
    def boom(*args: Any, **kwargs: Any) -> NoReturn:
        raise RuntimeError("자식 결함 synthetic")

    setattr(pdf_child, "extract_pages", boom)  # noqa: B010
    pdf_child.pdf_child_main(conn, child_input)


def source_unavailable(conn: Connection, child_input: ChildInput) -> None:
    def boom(*args: Any, **kwargs: Any) -> NoReturn:
        raise SourceUnavailable("ClientError:AccessDenied")

    setattr(pdf_child, "read_pdf", boom)  # noqa: B010
    pdf_child.pdf_child_main(conn, child_input)


def big_text(conn: Connection, child_input: ChildInput) -> None:
    """쪽마다 30,001자를 돌려준다(2쪽이면 합계 60,002자, 상한 초과)."""
    from pypdf import PageObject

    def text(*args: Any, **kwargs: Any) -> str:
        return "가" * 30_001

    setattr(PageObject, "extract_text", text)  # noqa: B010
    pdf_child.pdf_child_main(conn, child_input)


def corrupt_frame(conn: Connection, child_input: ChildInput) -> None:
    """해석할 수 없는 프레임(JSON 아님)을 보낸다."""
    conn.send_bytes(b"not a json frame")
    conn.close()


def oversized_frame(conn: Connection, child_input: ChildInput) -> None:
    """프레임 상한보다 큰 프레임을 보낸다."""
    conn.send_bytes(b" " * (child_input.settings.limits.frame_max_bytes + 1))
    time.sleep(30)


def _write_partial_frame(conn: Connection) -> None:
    """길이 머리(4096)와 본문 일부만 쓴다. Windows 파이프는 메시지 단위라 반쪽 쓰기가 되지 않아 건너뛴다."""
    import struct

    try:
        os.write(conn.fileno(), struct.pack("!i", 4096) + b'{"kind":')
    except OSError:
        pass


def partial_frame_then_die(conn: Connection, child_input: ChildInput) -> None:
    """길이 머리와 본문 일부만 쓰고 죽는다(보내는 도중 끊김, 자식 종료)."""
    _write_partial_frame(conn)
    os._exit(9)


def partial_frame_then_live(conn: Connection, child_input: ChildInput) -> None:
    """길이 머리와 본문 일부만 쓰고 끝을 닫은 뒤 살아 있다(통신 결함, 자식은 끝나지 않음)."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    start_watchdog(child_input)
    _write_partial_frame(conn)
    conn.close()
    while True:
        time.sleep(1)


def event_frame(conn: Connection, child_input: ChildInput) -> None:
    """종결이 아닌 프레임(진행 알림)을 보낸다. PDF 자식은 보내지 않는 종류다."""
    from app.consumer.frames import Frame, encode

    conn.send_bytes(encode(Frame("event", message={"state": "RUNNING"})))
    time.sleep(30)


def exit_badly_after_result(conn: Connection, child_input: ChildInput) -> None:
    """정상 결과 프레임을 보낸 뒤 비정상 종료한다."""
    pdf_child.pdf_child_main(conn, child_input)
    os._exit(5)
