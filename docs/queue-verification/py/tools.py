"""실험 보조 명령. 제품 코드가 아니다.

  synthetic-request          dev worker의 합성 Request JSON을 출력한다.
  read-receipt <messageId>   F→E 큐의 Result 작업을 Python에서 다시 읽어 상태와 반환값(수신 확인)을 출력한다.
  resend <attemptId>         보존한 결과를 messageId만 새로 붙여 다시 보낸다(분석을 부르지 않는다).

환경변수: RUN_DIR, Q77_PREFIX, Q77_REDIS_URL
"""

import asyncio
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "worker"))


async def read_receipt(message_id: str) -> None:
    from bullmq import Job, Queue

    queue = Queue("worker-messages", {
        "connection": os.environ.get("Q77_REDIS_URL", "redis://127.0.0.1:6390"),
        "prefix": os.environ["Q77_PREFIX"],
    })
    job = await Job.fromId(queue, message_id)
    state = await queue.getJobState(message_id) if job else None
    print(json.dumps({
        "found": job is not None,
        "state": state,
        "returnvalue": job.returnvalue if job else None,
        "returnvalueType": type(job.returnvalue).__name__ if job else None,
    }, ensure_ascii=False))
    await queue.close()


async def resend(attempt_id: str) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from f_worker import FWorker, attempt_dir

    worker = FWorker()
    await worker.deliver_stored(attempt_dir(attempt_id), reason="manual-resend")
    await worker.events.close()


def main() -> None:
    command, *rest = sys.argv[1:]
    if command == "synthetic-request":
        from app.processing import synthetic_accepted_context, synthetic_request

        print(json.dumps(synthetic_request(synthetic_accepted_context()), ensure_ascii=False))
    elif command == "read-receipt":
        asyncio.run(read_receipt(rest[0]))
    elif command == "resend":
        asyncio.run(resend(rest[0]))
    else:
        raise SystemExit(f"알 수 없는 명령: {command}")


if __name__ == "__main__":
    main()
