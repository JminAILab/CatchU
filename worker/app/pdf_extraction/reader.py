"""원본 PDF 읽기: 키 모양 검사 뒤에만, 읽기만(BR3.6·BR7.4, NFR1.7).

로컬은 `PDF_FILE_ROOT` 아래 실제 경로가 뿌리 안인지 확인한 뒤 바이트를 읽고, 배포는 boto3 `get_object`만
부른다(자격·지역은 기본 체인, 코드에 상수 없음). S3 읽기는 두 겹으로 시간을 묶는다: 요청 단계의 연결·읽기 시간 제한과
시도 횟수(settings.py S3_*), 그리고 요청부터 본문 내려받기까지 전체에 거는 시간 예산(`total_timeout`). 예산을 넘으면
저장소 장애(`SourceUnavailable("TotalTimeout")`)다. 20 MB 상한을 넘는 바이트는 읽기를 멈춘다. 파일 쪽 문제
(없음·크기 초과·키 모양)는 `FileUnreadable`(→ FAILED UNREADABLE_FILE), 저장소 쪽 장애(자격·권한·네트워크)는
`SourceUnavailable`(→ 결과 없이 작업 실패)로 구분한다. 로그·오류 문구에 키 값을 싣지 않는다.
"""

import os
import threading
from collections.abc import Callable, Mapping
from typing import Any, Final, Literal, Protocol

from botocore.exceptions import BotoCoreError, ClientError

from app.pdf_extraction.envelope import parse_storage_key
from app.pdf_extraction.settings import (
    S3_CONNECT_TIMEOUT,
    S3_MAX_ATTEMPTS,
    S3_READ_TIMEOUT,
    LocalSource,
    PdfSource,
    S3Source,
)

UnreadableReason = Literal["invalid-key", "missing", "too-large", "outside-root"]
_CHUNK: Final = 1024 * 1024
# S3 본문을 한 번에 읽는 크기. SDK의 `read(n)`은 n바이트가 찰 때까지 돌아오지 않으므로, 작게 두어 버림 표시를
# 자주 확인한다(20 MB에 320번 호출).
_S3_CHUNK: Final = 64 * 1024
# 버려진 읽기의 소켓 시간 제한(초). 전체 시간 예산을 넘긴 뒤에는 다음 조각을 오래 기다릴 이유가 없다.
_S3_ABANDONED_SOCKET_TIMEOUT: Final = 0.05


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


def s3_client_config(
    connect_timeout: float = S3_CONNECT_TIMEOUT,
    read_timeout: float = S3_READ_TIMEOUT,
    max_attempts: int = S3_MAX_ATTEMPTS,
) -> Any:
    """S3 클라이언트 설정. 기본값은 자식 시간 제한 안에서 먼저 포기하도록 정한 값이다(settings.py 주석)."""
    from botocore.config import Config

    return Config(
        connect_timeout=connect_timeout,
        read_timeout=read_timeout,
        retries={"mode": "standard", "total_max_attempts": max_attempts},
    )


def default_s3_client() -> S3Client:
    """boto3 클라이언트. 자식에서 S3를 쓸 때만 불러온다(자격·지역은 환경·역할의 기본 체인)."""
    import boto3

    client: S3Client = boto3.client("s3", config=s3_client_config())
    return client


def read_pdf(
    source: PdfSource,
    key: str,
    max_bytes: int,
    *,
    s3_client_factory: Callable[[], S3Client] = default_s3_client,
    total_timeout: float | None = None,
) -> bytes:
    """키 모양을 확인한 뒤 원본 바이트를 읽는다. 쓰기·삭제 호출은 없다.

    `total_timeout`(초)은 S3 읽기 전체의 시간 예산이다. 자식은 자기 시간 제한에서 계산한 값을 넘긴다
    (`settings.s3_total_budget`). None이면 예산 없이 읽는다(가짜 클라이언트를 쓰는 단위 시험용).
    """
    if parse_storage_key(key) is None:
        raise FileUnreadable("invalid-key")
    if isinstance(source, LocalSource):
        return _read_local(source.root, key, max_bytes)
    if total_timeout is None:
        return _read_s3(source, key, max_bytes, s3_client_factory, None)
    return _read_s3_within(source, key, max_bytes, s3_client_factory, total_timeout)


def _read_limited(
    read: Callable[[int], bytes],
    max_bytes: int,
    cancelled: threading.Event | None = None,
    chunk_size: int = _CHUNK,
) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        if cancelled is not None and cancelled.is_set():
            # 시간 예산을 넘겨 버려진 읽기다. 받은 조각을 붙들지 않고 멈춘다.
            raise SourceUnavailable("TotalTimeout")
        chunk = read(chunk_size)
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


S3_READ_THREAD_NAME: Final = "pdf-s3-read"


class _S3ReadTask:
    """S3 읽기 한 번을 다른 스레드에서 돌리고, 밖에서 버릴 수 있게 한다.

    버릴 때는 표시(`cancelled`)를 남기고 소켓 시간 제한을 줄인다. 응답 본문은 읽는 스레드가 스스로 닫는다: 다른
    스레드에서 닫으면 진행 중인 읽기가 쥔 버퍼 잠금을 기다리느라 닫는 쪽까지 막힌다(실제 소켓 시험에서 확인).
    """

    def __init__(self) -> None:
        self.cancelled = threading.Event()
        self.data: bytes | None = None
        self.error: BaseException | None = None
        self._body: Any = None
        self._lock = threading.Lock()

    def attach(self, body: Any) -> None:
        """읽는 스레드가 받은 응답 본문을 알린다(버릴 때 소켓 시간 제한을 줄일 대상)."""
        with self._lock:
            self._body = body

    def cancel(self) -> None:
        """읽기를 버린다. 기다리지 않는다.

        읽는 스레드는 진행 중인 `read`가 돌아오면 표시를 보고 멈춘 뒤 응답 본문을 닫는다. 그 `read`가 일찍 돌아오도록
        SDK의 공개 메서드 `StreamingBody.set_socket_timeout`으로 소켓 시간 제한을 줄인다(잠금을 잡지 않아 막히지 않는다).
        이미 시작된 소켓 읽기 한 번에는 줄인 값이 적용되지 않으므로, 그 한 번은 다음 조각이 오거나 원래의 개별 읽기
        시간 제한이 지나야 끝난다. 본문이 없는 단계(요청 중)였거나 메서드가 없는 본문이면 표시만 남는다.
        """
        with self._lock:
            self.cancelled.set()
            body = self._body
        shorten = getattr(body, "set_socket_timeout", None)
        if callable(shorten):
            try:
                shorten(_S3_ABANDONED_SOCKET_TIMEOUT)
            except Exception:  # noqa: BLE001 — 줄이지 못해도 원래 시간 제한 안에 끝난다
                pass

    def run(
        self,
        source: S3Source,
        key: str,
        max_bytes: int,
        factory: Callable[[], S3Client],
    ) -> None:
        try:
            self.data = _read_s3(source, key, max_bytes, factory, self)
        except BaseException as error:  # noqa: BLE001 — 부른 쪽 스레드에서 그대로 다시 올린다
            self.error = error


def _read_s3_within(
    source: S3Source,
    key: str,
    max_bytes: int,
    factory: Callable[[], S3Client],
    total_timeout: float,
) -> bytes:
    """S3 읽기 전체를 `total_timeout`초 안에 끝낸다. 넘으면 읽기를 버리고 저장소 장애로 끝낸다.

    소켓 읽기는 막혀 있는 동안 밖에서 멈출 수 없고, 개별 읽기 시간 제한은 조각 사이 간격만 잰다. 그래서 읽기를 다른
    스레드에 맡기고 여기서는 정한 시간만 기다린다. 시간이 지나면 버림 표시를 남기고 기다리지 않고
    `SourceUnavailable("TotalTimeout")`을 올린다.

    **부른 쪽이 돌아오는 시점과 정리가 끝나는 시점은 다르다.**
    - 부른 쪽: 예산이 지나는 즉시 돌아온다. 읽는 스레드나 응답이 정리되기를 기다리지 않는다.
    - 읽는 스레드와 응답: 그 뒤에 읽는 스레드가 스스로 정리한다. 본문은 SDK의 공개 읽기(`StreamingBody.read`)로 64 KiB씩
      읽는다(길이·체크섬 검사를 SDK에 맡긴다). 버릴 때 소켓 시간 제한을 0.05초로 줄이므로, 진행 중인 소켓 읽기 한 번이
      끝난 뒤(다음 조각이 오거나 원래의 개별 읽기 시간 제한이 지날 때) 그다음 읽기가 곧 시간 초과로 끝나고, 스레드가
      응답 본문을 닫아 연결을 놓는다. 조각이 0.05초보다 촘촘히 계속 오면 64 KiB를 다 받은 뒤 표시를 보고 멈춘다.
      요청 단계에서 막혀 있었다면 요청이 끝난 뒤(늦어도 요청 단계 상한) 같은 표시를 보고 닫는다.
    - 그 스레드는 데몬이라, 정리가 끝나기 전이라도 자식 프로세스가 결과를 보내고 끝나는 것을 막지 않는다. 자식이 끝나면
      남은 스레드와 연결도 함께 끝난다.
    """
    task = _S3ReadTask()
    thread = threading.Thread(
        target=task.run,
        args=(source, key, max_bytes, factory),
        name=S3_READ_THREAD_NAME,
        daemon=True,
    )
    thread.start()
    thread.join(total_timeout)
    if thread.is_alive():
        task.cancel()
        raise SourceUnavailable("TotalTimeout")
    if task.error is not None:
        # FileUnreadable·SourceUnavailable·MemoryError(R-MEM) 모두 원래 분류 그대로 올린다.
        raise task.error
    assert task.data is not None
    return task.data


def _read_s3(
    source: S3Source,
    key: str,
    max_bytes: int,
    factory: Callable[[], S3Client],
    task: _S3ReadTask | None,
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
    cancelled = task.cancelled if task is not None else None
    if task is not None:
        task.attach(body)
    try:
        # 본문은 SDK의 공개 읽기로만 읽는다. `StreamingBody.read`는 끝에서 받은 길이를 Content-Length와 맞춰 보고,
        # 체크섬 머리가 있는 응답(`StreamingChecksumBody`)은 체크섬도 맞춰 본다. 틀리면 예외라 저장소 장애가 된다.
        # 응답 머리가 예산을 넘긴 뒤에 왔다면 첫 조각을 읽기 전에 버림 표시를 보고 멈춘다(부른 쪽은 이미 떠났다).
        return _read_limited(body.read, max_bytes, cancelled, _S3_CHUNK)
    except (FileUnreadable, MemoryError):
        # MemoryError는 저장소 장애가 아니라 자식의 메모리 제한 분류(FAILED UNREADABLE_FILE)를 따른다(R-MEM).
        raise
    except Exception as error:
        raise SourceUnavailable(type(error).__name__) from None
    finally:
        _close_quietly(body)


def _close_quietly(body: Any) -> None:
    close = getattr(body, "close", None)
    if callable(close):
        try:
            close()
        except Exception:  # noqa: BLE001 — 닫기 실패는 읽기 결과를 바꾸지 않는다
            pass
