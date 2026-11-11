"""PDF 추출 자식 프로세스 진입점: 원본 읽기 → pypdf 추출 → 결과 프레임 하나 → 종료.

10월 분석 자식(`app.consumer.child`)의 틀을 재사용한다: spawn으로 뜨고 부모에게서 순수 자료(작업 ID, 봉투
JSON, 꺼낸 시각, 큐 접속 정보 없는 설정)만 받으며, SIGINT를 무시해 종료 순서를 부모가 쥐고, 부모가 사라졌거나
자기 마감(꺼낸 시각 + 시간 제한 + 유예)이 지나면 스스로 끝난다. 큐·DB에 붙지 않는다(NFR1.9).

메모리 제한은 `resource.setrlimit(RLIMIT_AS)`가 있는 플랫폼(Linux)에서만 건다. 없는 플랫폼(Windows)은
시간 제한이 주 수단이다. 제한에 걸리면(MemoryError·종료) 부모가 FAILED(UNREADABLE_FILE)로 보고한다.
로그에는 pdfMaterialId·코드·예외 종류 이름만 남기고 글·키는 남기지 않는다(BR3.5, NFR1.4).
"""

import json
import logging
import signal
import sys
from dataclasses import dataclass, replace
from multiprocessing.connection import Connection

from app.consumer import queues
from app.consumer.child import ChildInput, start_watchdog
from app.consumer.frames import Frame, encode
from app.consumer.settings import ChildSettings
from app.pdf_extraction.envelope import check_request
from app.pdf_extraction.extract import extract_pages
from app.pdf_extraction.reader import FileUnreadable, SourceUnavailable, read_pdf
from app.pdf_extraction.settings import PdfChildSettings, s3_total_budget

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PdfChildInput(ChildInput):
    """분석 자식 입력에 PDF 읽기 경로·제한을 더한 것.

    `settings.limits.total`·`child_grace`에는 PDF 자식 시간 제한을 넣어 부모의 상한과 자식의 자기 마감이
    같은 값에서 나오게 한다(`pdf_child_settings`). `settings.live`는 항상 None이다(LIVE 키를 주지 않음).
    """

    pdf: PdfChildSettings


def pdf_child_settings(base: ChildSettings, pdf: PdfChildSettings) -> ChildSettings:
    """부모가 자식용 `ChildSettings`를 만들 때: 시간 제한을 PDF 값으로 바꾸고 LIVE 키를 뺀다."""
    return replace(
        base,
        live=None,
        limits=replace(
            base.limits,
            total=pdf.limits.child_timeout,
            child_grace=pdf.limits.child_grace,
        ),
    )


class _MaterialFilter(logging.Filter):
    def __init__(self, pdf_material_id: str) -> None:
        super().__init__()
        self.pdf_material_id = pdf_material_id

    def filter(self, record: logging.LogRecord) -> bool:
        record.pdf_material_id = self.pdf_material_id
        return True


def _configure_logging(pdf_material_id: str) -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.addFilter(_MaterialFilter(pdf_material_id))
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s pdfMaterialId=%(pdf_material_id)s %(message)s"
        )
    )
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    # pypdf는 손상된 구조를 경고로 적는다. 글 조각이 섞일 수 있어 오류만 남긴다.
    logging.getLogger("pypdf").setLevel(logging.ERROR)


def apply_memory_limit(megabytes: int) -> bool:
    """RLIMIT_AS를 건다. 지원하지 않는 플랫폼·실패면 False(시간 제한만 적용)."""
    try:
        import resource
    except ImportError:
        logger.info("메모리 제한을 지원하지 않는 플랫폼: 시간 제한만 적용")
        return False
    setrlimit = getattr(resource, "setrlimit", None)
    limit_name = getattr(resource, "RLIMIT_AS", None)
    if not callable(setrlimit) or limit_name is None:
        logger.info("메모리 제한을 지원하지 않는 플랫폼: 시간 제한만 적용")
        return False
    size = megabytes * 1024 * 1024
    try:
        setrlimit(limit_name, (size, size))
    except (ValueError, OSError) as error:
        logger.warning("메모리 제한 적용 실패: error=%s", type(error).__name__)
        return False
    return True


def _outcome(child_input: PdfChildInput) -> Frame:
    request = check_request(
        queues.PDF_REQUEST_JOB, child_input.job_id, json.loads(child_input.job_data)
    )
    if request is None:
        # 부모가 이미 검사했으므로 여기 닿으면 부모·자식 사이 전달 결함이다.
        return Frame("defect", error_type="PdfRequestInvalid")
    pdf = child_input.pdf
    try:
        data = read_pdf(
            pdf.source,
            request.storage_key,
            pdf.limits.max_file_bytes,
            # 느리게 흘러오는 저장소 응답이 자식 시간 제한(→ UNREADABLE_FILE)에 먼저 걸리지 않게 한다(#521 리뷰).
            total_timeout=s3_total_budget(pdf.limits.child_timeout),
        )
    except FileUnreadable as error:
        logger.info("원본을 읽을 수 없음: reason=%s", error.reason)
        return Frame(
            "result", message={"outcome": "FAILED", "failureCode": "UNREADABLE_FILE"}
        )
    return Frame(
        "result",
        message=extract_pages(data, pdf.limits.page_limit, pdf.limits.text_limit),
    )


def pdf_child_main(conn: Connection, child_input: ChildInput) -> None:
    """spawn 자식의 대상 함수(`ChildRun.create`에 넘긴다). 종결 프레임 하나를 보내고 돌아온다."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    start_watchdog(child_input)
    _configure_logging(child_input.job_id)
    try:
        if not isinstance(child_input, PdfChildInput):
            raise TypeError("PdfChildInput이 아니다")
        apply_memory_limit(child_input.pdf.limits.child_memory_mb)
        frame = _outcome(child_input)
    except MemoryError:
        # 메모리 제한 초과는 그 파일을 처리할 수 없는 것으로 확정한다(NFR4.3).
        logger.error("메모리 제한 초과: UNREADABLE_FILE로 보고")
        frame = Frame(
            "result", message={"outcome": "FAILED", "failureCode": "UNREADABLE_FILE"}
        )
    except SourceUnavailable as error:
        # 저장소 쪽 장애는 파일 탓이 아니므로 결과를 만들지 않는다(부모가 작업 실패로 끝낸다).
        logger.error("원본 저장소를 쓸 수 없음: error=%s", error.error_type)
        frame = Frame("defect", error_type="SourceUnavailable")
    except Exception as error:  # 결함: 예외 종류 이름만 넘긴다
        logger.error("PDF 자식 처리 중 결함: %s", type(error).__name__)
        frame = Frame("defect", error_type=type(error).__name__)
    conn.send_bytes(encode(frame))
    conn.close()
