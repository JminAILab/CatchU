"""부모 쪽 자식 프로세스 관리: spawn으로 띄우기, 파이프 읽기 스레드, 끝내기·회수.

부모 이벤트 루프는 막히는 호출(`recv_bytes`·`join`)을 직접 부르지 않는다. 자식마다 데몬 스레드
하나가 프레임을 읽어 `call_soon_threadsafe`로 넘기고, `join`은 `asyncio.to_thread`로 부른다.
"""

import asyncio
import logging
import multiprocessing
import threading
from collections.abc import Callable
from enum import Enum
from multiprocessing.connection import Connection
from typing import Any

from app.consumer.child import ChildInput
from app.consumer.frames import Frame, FrameError, decode

logger = logging.getLogger(__name__)

ChildTarget = Callable[[Connection, ChildInput], None]
_SPAWN = multiprocessing.get_context("spawn")


class Signal(Enum):
    """읽기 스레드가 넘기는 표지. EOF는 자식 쪽 끝이 닫힘, CORRUPT는 통신 손상."""

    EOF = "EOF"
    CORRUPT = "CORRUPT"


Item = Frame | Signal


class ChildRun:
    """자식 하나와 그 읽기 스레드."""

    def __init__(
        self,
        process: Any,
        reader: Connection,
        loop: asyncio.AbstractEventLoop,
        max_bytes: int,
    ) -> None:
        self.process = process
        self._reader = reader
        self._loop = loop
        self._max_bytes = max_bytes
        self.items: asyncio.Queue[Item] = asyncio.Queue()
        self._released_exitcode: int | None = None
        self._thread = threading.Thread(
            target=self._read, name="child-frames", daemon=True
        )

    @classmethod
    async def start(
        cls, target: ChildTarget, child_input: ChildInput, max_bytes: int
    ) -> "ChildRun":
        reader, writer = _SPAWN.Pipe(duplex=False)
        process = _SPAWN.Process(
            target=target,
            args=(writer, child_input),
            name="analysis-child",
            daemon=True,
        )
        try:
            await asyncio.to_thread(process.start)
        finally:
            # 부모 쪽 쓰기 끝을 닫아야 자식이 죽었을 때 읽기 쪽에 EOF가 온다.
            writer.close()
        run = cls(process, reader, asyncio.get_running_loop(), max_bytes)
        run._thread.start()
        return run

    @property
    def pid(self) -> int | None:
        pid: int | None = self.process.pid
        return pid

    def _post(self, item: Item) -> None:
        try:
            self._loop.call_soon_threadsafe(self.items.put_nowait, item)
        except RuntimeError:
            pass  # 이벤트 루프가 이미 닫혔다(프로세스 종료 중)

    def _read(self) -> None:
        try:
            while True:
                raw = self._reader.recv_bytes(self._max_bytes)
                try:
                    frame = decode(raw)
                except FrameError:
                    self._post(Signal.CORRUPT)
                    return
                self._post(frame)
        except EOFError:
            # 길이 머리만 받고 본문이 끊긴 경우도 EOFError다. 받은 완전한 프레임만 쓴다.
            self._post(Signal.EOF)
        except OSError:
            # 상한(16 MiB)을 넘는 프레임이나 읽기 오류. 그 뒤로는 읽을 수 없다.
            self._post(Signal.CORRUPT)
        finally:
            self._reader.close()

    def is_alive(self) -> bool:
        if self._released_exitcode is not None:
            return False
        alive: bool = self.process.is_alive()
        return alive

    @property
    def exitcode(self) -> int | None:
        if self._released_exitcode is not None:
            return self._released_exitcode
        code: int | None = self.process.exitcode
        return code

    async def wait_exit(self, timeout: float) -> int | None:
        await asyncio.to_thread(self.process.join, timeout)
        return self.exitcode

    async def stop(self, terminate_wait: float, kill_wait: float) -> int | None:
        """SIGTERM → 기다림 → SIGKILL → 회수. 회수하지 못하면 기록만 하고 돌아온다."""
        if self.is_alive():
            self.process.terminate()
            await self.wait_exit(terminate_wait)
        if self.is_alive():
            self.process.kill()
            await self.wait_exit(kill_wait)
        if self.is_alive():
            logger.error("자식을 회수하지 못함: pid=%s", self.pid)
        return self.exitcode

    def kill_now(self, wait: float = 0.5) -> None:
        """비상 경로(취소·종료 상한 초과): 기다리지 않고 SIGKILL한다."""
        if self.is_alive():
            self.process.kill()
            self.process.join(wait)

    def release(self) -> None:
        """회수한 자식의 프로세스 자원(파일 기술자)을 바로 놓는다. 아직 살아 있으면 둔다."""
        code = self.exitcode
        if code is not None and self._released_exitcode is None:
            self._released_exitcode = code
            self.process.close()
