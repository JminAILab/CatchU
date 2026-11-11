"""원본 PDF 읽기: 키 모양 검사 뒤에만, 읽기만(BR3.6·BR7.4, NFR1.7).

로컬은 `PDF_FILE_ROOT` 아래 실제 경로가 뿌리 안인지 확인한 뒤 바이트를 읽고, 배포는 boto3 `get_object`만
부른다(자격·지역은 기본 체인, 코드에 상수 없음). 20 MB 상한을 넘는 바이트는 읽기를 멈춘다. 파일 쪽 문제
(없음·크기 초과·키 모양)는 `FileUnreadable`(→ FAILED UNREADABLE_FILE), 저장소 쪽 장애(자격·권한·네트워크)는
`SourceUnavailable`(→ 결과 없이 작업 실패)로 구분한다. 로그·오류 문구에 키 값을 싣지 않는다.
"""

import os
from collections.abc import Callable, Mapping
from typing import Any, Final, Literal, Protocol

from botocore.exceptions import BotoCoreError, ClientError

from app.pdf_extraction.envelope import parse_storage_key
from app.pdf_extraction.settings import LocalSource, PdfSource, S3Source

UnreadableReason = Literal["invalid-key", "missing", "too-large", "outside-root"]
_CHUNK: Final = 1024 * 1024


class FileUnreadable(Exception):
    """원본 파일 쪽 문제. 결과 FAILED(UNREADABLE_FILE)로 확정한다. 문구에는 사유 코드만."""

    def __init__(self, reason: UnreadableReason) -> None:
        super().__init__(reason)
        self.reason = reason


class SourceUnavailable(Exception):
    """저장소 쪽 장애. 파일 탓이 아니므로 결과 없이 작업을 실패로 끝낸다. 문구에는 예외 종류 이름만."""

    def __init__(self, error_type: str) -> None:
        super().__init__(error_type)
        self.error_type = error_type


class S3Client(Protocol):
    def get_object(self, *, Bucket: str, Key: str) -> Mapping[str, Any]: ...


def default_s3_client() -> S3Client:
    """boto3 클라이언트. 자식에서 S3를 쓸 때만 불러온다(자격·지역은 환경·역할의 기본 체인)."""
    import boto3

    client: S3Client = boto3.client("s3")
    return client


def read_pdf(
    source: PdfSource,
    key: str,
    max_bytes: int,
    *,
    s3_client_factory: Callable[[], S3Client] = default_s3_client,
) -> bytes:
    """키 모양을 확인한 뒤 원본 바이트를 읽는다. 쓰기·삭제 호출은 없다."""
    if parse_storage_key(key) is None:
        raise FileUnreadable("invalid-key")
    if isinstance(source, LocalSource):
        return _read_local(source.root, key, max_bytes)
    return _read_s3(source, key, max_bytes, s3_client_factory)


def _read_limited(read: Callable[[int], bytes], max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = read(_CHUNK)
        if not chunk:
            return b"".join(chunks)
        total += len(chunk)
        if total > max_bytes:
            raise FileUnreadable("too-large")
        chunks.append(chunk)


def _read_local(root: str, key: str, max_bytes: int) -> bytes:
    root_real = os.path.realpath(root)
    target = os.path.realpath(os.path.join(root_real, *key.split("/")))
    try:
        inside = os.path.commonpath([root_real, target]) == root_real
    except ValueError:  # 드라이브가 다른 경로(Windows)
        inside = False
    if not inside:
        raise FileUnreadable("outside-root")
    try:
        with open(target, "rb") as stream:
            return _read_limited(stream.read, max_bytes)
    except (FileNotFoundError, IsADirectoryError, NotADirectoryError):
        raise FileUnreadable("missing") from None
    except OSError as error:
        raise SourceUnavailable(type(error).__name__) from None


def _read_s3(
    source: S3Source, key: str, max_bytes: int, factory: Callable[[], S3Client]
) -> bytes:
    try:
        response = factory().get_object(Bucket=source.bucket, Key=key)
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code == "NoSuchKey":
            raise FileUnreadable("missing") from None
        raise SourceUnavailable(f"ClientError:{code or 'unknown'}") from None
    except (BotoCoreError, OSError) as error:
        raise SourceUnavailable(type(error).__name__) from None
    body = response["Body"]
    try:
        return _read_limited(body.read, max_bytes)
    except (FileUnreadable, MemoryError):
        # MemoryError는 저장소 장애가 아니라 자식의 메모리 제한 분류(FAILED UNREADABLE_FILE)를 따른다(R-MEM).
        raise
    except Exception as error:
        raise SourceUnavailable(type(error).__name__) from None
    finally:
        close = getattr(body, "close", None)
        if callable(close):
            close()
