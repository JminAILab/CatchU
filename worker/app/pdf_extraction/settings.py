"""PDF 추출 소비자 설정: 원본 읽기 경로(로컬 뿌리 또는 S3 버킷), 동시성, 자식 제한.

환경변수 이름만 두고 값은 문구에 싣지 않는다(team.md Code Style). `PDF_FILE_ROOT`(로컬·시험: api 로컬 저장
폴더의 읽기 전용 볼륨)와 `FILE_STORAGE_S3_BUCKET`(배포: api와 같은 버킷 이름, 자격은 AWS 기본 체인) 가운데
하나만 둔다. 둘 다 없으면 PDF 추출 Worker를 띄우지 않는다(기존 분석 소비자 동작 그대로).
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from app.consumer.settings import SettingsError

ENV_FILE_ROOT: Final = "PDF_FILE_ROOT"
ENV_BUCKET: Final = "FILE_STORAGE_S3_BUCKET"
ENV_CONCURRENCY: Final = "CATCHU_WORKER_PDF_CONCURRENCY"
ENV_CHILD_TIMEOUT: Final = "CATCHU_WORKER_PDF_CHILD_TIMEOUT_SECONDS"
ENV_CHILD_MEMORY: Final = "CATCHU_WORKER_PDF_CHILD_MEMORY_MB"
PDF_ENV: Final = (
    ENV_FILE_ROOT,
    ENV_BUCKET,
    ENV_CONCURRENCY,
    ENV_CHILD_TIMEOUT,
    ENV_CHILD_MEMORY,
)

DEFAULT_PDF_CONCURRENCY: Final = 1
# 분석 소비자와 같은 종료 순서를 쓰므로 같은 이유(종료 직전에 꺼낸 작업의 실패 기록 틈, 10/15 결정)로
# 지금은 1만 받는다. 설정 이름은 분석 소비자의 것과 별개다(BR3.7).
MAX_PDF_CONCURRENCY: Final = 1
# 자식 시간 제한(초). 추출 시한 10분(큐 대기 포함, BR2.2)보다 충분히 짧게 두어 제한 초과를 일찍 FAILED로
# 확정한다(NFR4.3). 값은 11.4의 대표 PDF 측정 뒤 담당자가 검토한다.
DEFAULT_CHILD_TIMEOUT: Final = 120
MIN_CHILD_TIMEOUT: Final = 1
MAX_CHILD_TIMEOUT: Final = 600
# 자식 메모리 제한(MB). 파일 상한 20 MB와 pypdf 객체를 감안한 여유값. `resource`가 있는 플랫폼(Linux)에서만
# RLIMIT_AS로 적용되고, 없는 플랫폼(Windows)에서는 시간 제한이 주 수단이다(child.py).
DEFAULT_CHILD_MEMORY_MB: Final = 512
MIN_CHILD_MEMORY_MB: Final = 64
MAX_CHILD_MEMORY_MB: Final = 16384
# 자식 자기 마감 여유(초): picked_at + child_timeout + child_grace에 자식이 스스로 끝난다.
CHILD_GRACE: Final = 15
# api PDF_MATERIAL_LIMITS.fileSizeBytes·PDF_PAGE_LIMIT와 같은 값(BR1.2).
MAX_FILE_BYTES: Final = 20 * 1024 * 1024
PAGE_LIMIT: Final = 50
# PDF 하나의 쪽 글 합계 상한(코드 포인트 수). 발행본 전체 글 상한과 같은 값이며 한쪽만 바꾸지 않는다:
# api `src/publications/publications-config.ts`의 SNAPSHOT_TEXT_TOTAL_MAX(api PDF 수신 검사 PDF_TEXT_TOTAL_MAX도 이 값),
# web `src/features/publications/publications-api.ts`의 PUBLISH_LIMITS.totalText.
# 팀장 결정 2026-11-10(#420 issuecomment-6759834176, BR4.5·OQ-U4-4 종결).
TEXT_LIMIT: Final = 60_000

_BUCKET = re.compile(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")


@dataclass(frozen=True)
class LocalSource:
    """로컬·시험: `PDF_FILE_ROOT` 아래에서 읽기만 한다(BR7.4)."""

    root: str  # 실제 경로(절대, 심볼릭 링크 해소)


@dataclass(frozen=True)
class S3Source:
    """배포: 버킷의 원본 키를 GetObject로만 읽는다(BR7.4, NFR1.7). 자격·지역은 기본 체인."""

    bucket: str


PdfSource = LocalSource | S3Source


@dataclass(frozen=True)
class PdfLimits:
    child_timeout: float = (
        DEFAULT_CHILD_TIMEOUT  # 부모가 자식에 주는 총 시간(띄우기 포함)
    )
    child_grace: float = CHILD_GRACE
    child_memory_mb: int = DEFAULT_CHILD_MEMORY_MB
    max_file_bytes: int = MAX_FILE_BYTES
    page_limit: int = PAGE_LIMIT
    text_limit: int = TEXT_LIMIT


@dataclass(frozen=True)
class PdfChildSettings:
    """자식에 넘기는 것: 읽기 경로와 제한값뿐. 큐 접속 정보·LIVE 키는 담지 않는다."""

    source: PdfSource
    limits: PdfLimits


@dataclass(frozen=True)
class PdfSettings:
    source: PdfSource
    concurrency: int = DEFAULT_PDF_CONCURRENCY
    limits: PdfLimits = PdfLimits()

    def for_child(self) -> PdfChildSettings:
        return PdfChildSettings(source=self.source, limits=self.limits)


def pdf_settings_from_environment(values: Mapping[str, str]) -> PdfSettings | None:
    """PDF 설정을 읽는다. 읽기 경로가 하나도 없으면 None(Worker를 띄우지 않음)."""
    root = values.get(ENV_FILE_ROOT) or ""
    bucket = values.get(ENV_BUCKET) or ""
    if not root and not bucket:
        others = [
            name
            for name in (ENV_CONCURRENCY, ENV_CHILD_TIMEOUT, ENV_CHILD_MEMORY)
            if values.get(name)
        ]
        if others:
            raise SettingsError(
                f"{'·'.join(others)}은(는) {ENV_FILE_ROOT} 또는 {ENV_BUCKET}과 함께 두어야 한다"
            )
        return None
    if root and bucket:
        raise SettingsError(f"{ENV_FILE_ROOT}와 {ENV_BUCKET}은 함께 둘 수 없다")
    source: PdfSource = _local(root) if root else _s3(bucket)
    return PdfSettings(
        source=source,
        concurrency=_concurrency(values.get(ENV_CONCURRENCY)),
        limits=PdfLimits(
            child_timeout=_int_setting(
                values.get(ENV_CHILD_TIMEOUT),
                ENV_CHILD_TIMEOUT,
                DEFAULT_CHILD_TIMEOUT,
                MIN_CHILD_TIMEOUT,
                MAX_CHILD_TIMEOUT,
            ),
            child_memory_mb=_int_setting(
                values.get(ENV_CHILD_MEMORY),
                ENV_CHILD_MEMORY,
                DEFAULT_CHILD_MEMORY_MB,
                MIN_CHILD_MEMORY_MB,
                MAX_CHILD_MEMORY_MB,
            ),
        ),
    )


def _local(root: str) -> LocalSource:
    path = Path(root)
    if not path.is_absolute() or not path.is_dir():
        raise SettingsError(f"{ENV_FILE_ROOT}는 존재하는 폴더의 절대 경로여야 한다")
    return LocalSource(root=str(path.resolve()))


def _s3(bucket: str) -> S3Source:
    if _BUCKET.fullmatch(bucket) is None:
        raise SettingsError(
            f"{ENV_BUCKET}은 S3 버킷 이름 모양(3~63자, 소문자·숫자·.·-, 영숫자로 시작·끝)이어야 한다"
        )
    return S3Source(bucket=bucket)


def _concurrency(value: str | None) -> int:
    if value is None or value == "":
        return DEFAULT_PDF_CONCURRENCY
    if re.fullmatch(r"[0-9]{1,2}", value) is None or not (
        1 <= int(value) <= MAX_PDF_CONCURRENCY
    ):
        raise SettingsError(f"{ENV_CONCURRENCY}는 지금 {MAX_PDF_CONCURRENCY}만 받는다")
    return int(value)


def _int_setting(
    value: str | None, name: str, default: int, minimum: int, maximum: int
) -> int:
    if value is None or value == "":
        return default
    if re.fullmatch(r"[0-9]{1,6}", value) is None or not (
        minimum <= int(value) <= maximum
    ):
        raise SettingsError(f"{name}는 {minimum}~{maximum} 사이의 정수여야 한다")
    return int(value)
