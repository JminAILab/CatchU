"""Node↔Python 자료 왕복 확인용 Python worker. 제품 코드가 아니다.

Node가 넣은 작업의 data를 worker 계약 검사(`check_message`)로 판정하고, 받은 값을 그대로
(1) 작업 반환값으로 돌려주고 (2) Python 생산자로 다른 큐에 다시 넣어 Node 소비자가 읽게 한다.

환경변수: RUN_DIR, Q77_PREFIX, Q77_REDIS_URL
"""

import asyncio
import os
import signal
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "worker"))

from bullmq import Queue, Worker  # noqa: E402

from app.contract import check_message  # noqa: E402

RUN_DIR = Path(os.environ["RUN_DIR"])
PREFIX = os.environ["Q77_PREFIX"]
REDIS_URL = os.environ.get("Q77_REDIS_URL", "redis://127.0.0.1:6390")


def python_types(value: Any) -> Any:
    """Python이 해석한 자료형을 그대로 보여 준다(문자열·정수·실수·불리언·None·목록·사전)."""
    if isinstance(value, dict):
        return {key: python_types(item) for key, item in value.items()}
    if isinstance(value, list):
        return [python_types(item) for item in value]
    return type(value).__name__


async def main() -> None:
    back = Queue("interop-back", {"connection": REDIS_URL, "prefix": PREFIX})

    async def process(job: Any, token: str) -> dict[str, Any]:
        schema = job.data.get("schema")
        message = job.data.get("message")
        checked = check_message(schema, message) if schema else None
        reply = {
            "jobId": job.id,
            "name": job.name,
            "verdict": str(checked.verdict) if checked else None,
            "message": message,
            "types": python_types(message),
        }
        await back.add(job.name, reply, {"jobId": f"back-{job.id}"})
        return reply

    worker = Worker("interop-echo", process, {"connection": REDIS_URL, "prefix": PREFIX})
    (RUN_DIR / f"echo-ready-{os.getpid()}").write_text("")
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, stop.set)
    loop.add_signal_handler(signal.SIGINT, stop.set)
    await stop.wait()
    await worker.close()
    await back.close()


if __name__ == "__main__":
    asyncio.run(main())
