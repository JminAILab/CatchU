"""F 쪽 실험 worker. 제품 코드가 아니다.

E→F 큐에서 Request를 꺼내 dev의 worker 처리 경계(`app.processing.process_request`)와 가짜 생성기로
결과를 만들고, 진행 알림·결과를 F→E 큐로 보낸다. 모의 분석 함수는 호출될 때마다 디스크에 기록을 먼저
남기므로 그 줄 수가 분석 호출 횟수다.

F_MODE
  naive   큐가 다시 준 작업을 그대로 처리한다(앱 수준 중복 방지 없음).
  guarded 시도(attemptId)별 기록을 큐 밖 파일에 두고, 분석 시작 표식을 먼저 남긴 뒤 분석을 부른다.
          다시 받은 작업은 기록을 보고 결과 재전달 / UNCERTAIN 알림 / 첫 실행 중 하나만 한다.

환경변수: RUN_DIR, Q77_PREFIX, Q77_REDIS_URL, F_MODE, F_SCENARIO, F_CRASH(before-call·after-marker·
during-call·before-store·after-store), F_LOCK_MS, F_STALLED_MS, F_MAX_STALLED, F_ANALYSIS_SECONDS,
F_RUN_IN(thread·loop), F_RECHECK_SECONDS(주기 점검 간격, 0이면 끔), F_MAX_RESENDS, F_DELIVERY_DEADLINE_SECONDS,
F_MAX_REQUEST_AGE_SECONDS(0이면 끔)
"""

import asyncio
import hashlib
import json
import os
import signal
import sys
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

KIT_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = KIT_DIR.parents[1]
sys.path.insert(0, str(REPO_ROOT / "worker"))

from bullmq import Job, Queue, Worker  # noqa: E402
from redis.exceptions import RedisError  # noqa: E402

from app.contract import Verdict, check_message  # noqa: E402
from app.processing import (  # noqa: E402
    FakeGenerator,
    Finished,
    Rejected,
    Uncertain,
    check_request,
    process_request,
    synthetic_accepted_context,
)
from app.processing.generation import ExecutionUnknown, GenerationOutput  # noqa: E402
from app.processing.request_check import CheckedRequest  # noqa: E402
from app.processing.result import rfc3339  # noqa: E402

RUN_DIR = Path(os.environ["RUN_DIR"])
PREFIX = os.environ["Q77_PREFIX"]
REDIS_URL = os.environ.get("Q77_REDIS_URL", "redis://127.0.0.1:6390")
MODE = os.environ.get("F_MODE", "guarded")
SCENARIO = os.environ.get("F_SCENARIO", "succeeded-one-candidate")
CRASH = os.environ.get("F_CRASH", "")
RUN_IN = os.environ.get("F_RUN_IN", "thread")
ANALYSIS_SECONDS = float(os.environ.get("F_ANALYSIS_SECONDS", "0"))
RECHECK_SECONDS = float(os.environ.get("F_RECHECK_SECONDS", "0"))
MAX_RESENDS = int(os.environ.get("F_MAX_RESENDS", "5"))
DELIVERY_DEADLINE_SECONDS = float(os.environ.get("F_DELIVERY_DEADLINE_SECONDS", "1800"))
MAX_REQUEST_AGE_SECONDS = float(os.environ.get("F_MAX_REQUEST_AGE_SECONDS", "0"))

REQUEST_QUEUE = "analysis-requests"
EVENT_QUEUE = "worker-messages"
STORE = RUN_DIR / "f-store" / "attempts"
CALLS = RUN_DIR / "analysis-calls.jsonl"
F_LOG = RUN_DIR / "f-log.jsonl"
PENDING_STATES = ("waiting", "active", "delayed", "prioritized", "waiting-children")


def now() -> datetime:
    return datetime.now(UTC)


def _fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def ensure_dir_durable(path: Path) -> None:
    """없는 디렉터리를 위에서부터 하나씩 만들고, 만들 때마다 상위 디렉터리를 fsync한다.

    새 디렉터리 항목이 상위 디렉터리에 확정되지 않으면 전원 장애 뒤 그 안의 표식이 사라질 수 있다.
    """
    missing: list[Path] = []
    cursor = path
    while not cursor.exists():
        missing.append(cursor)
        cursor = cursor.parent
    for directory in reversed(missing):
        try:
            directory.mkdir()
        except FileExistsError:
            pass
        _fsync_dir(directory.parent)


def append_line(path: Path, value: dict[str, Any]) -> None:
    ensure_dir_durable(path.parent)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(value, ensure_ascii=False) + "\n")
        stream.flush()
        os.fsync(stream.fileno())


def read_lines(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text("utf-8").splitlines() if line.strip()]


def write_json_durable(path: Path, value: dict[str, Any]) -> None:
    ensure_dir_durable(path.parent)
    tmp = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    with tmp.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=1)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)
    _fsync_dir(path.parent)


def create_exclusive(path: Path, content: str | None = None) -> bool:
    """파일을 새로 만들었으면 True, 이미 있으면 False. 두 실행이 같은 표식을 동시에 얻지 못한다."""
    ensure_dir_durable(path.parent)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return False
    try:
        os.write(fd, (content or rfc3339(now())).encode())
        os.fsync(fd)
    finally:
        os.close(fd)
    _fsync_dir(path.parent)
    return True


def flog(entry: dict[str, Any]) -> None:
    append_line(F_LOG, {"at": rfc3339(now()), "pid": os.getpid(), "mode": MODE, **entry})


def crash_point(point: str) -> None:
    if CRASH == point:
        flog({"kind": "crash", "point": point})
        os.kill(os.getpid(), signal.SIGKILL)
        # 분석은 별도 스레드에서 돌 수 있다. 신호를 보낸 스레드가 프로세스가 죽기 전 다음 줄을 실행하지 않게 멈춘다.
        threading.Event().wait()


def attempt_key(attempt_id: str) -> str:
    """파일 이름·메시지 ID에 쓸 키. 계약은 attemptId에 빈 문자열만 막으므로 그대로 쓰지 않는다."""
    return hashlib.sha256(attempt_id.encode()).hexdigest()[:32]


def attempt_dir(attempt_id: str) -> Path:
    return STORE / attempt_key(attempt_id)


def request_fingerprint(data: dict[str, Any]) -> str:
    """전송마다 바뀌는 messageId를 뺀 요청 내용의 지문."""
    body = {key: value for key, value in data.items() if key != "messageId"}
    canonical = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def analysis(request: CheckedRequest, inner: FakeGenerator) -> GenerationOutput:
    """모의 분석 함수(LLM 호출 대역). 호출 기록을 먼저 디스크에 남긴다."""
    append_line(
        CALLS, {"pid": os.getpid(), "attemptId": request.attempt_id, "at": rfc3339(now())}
    )
    crash_point("during-call")
    if ANALYSIS_SECONDS:
        time.sleep(ANALYSIS_SECONDS)
    return inner.generate(request)


class NaiveGenerator:
    def __init__(self) -> None:
        self.inner = FakeGenerator(SCENARIO)

    @property
    def source_mode(self) -> str:
        return self.inner.source_mode

    def generate(self, request: CheckedRequest) -> GenerationOutput:
        crash_point("before-call")
        return analysis(request, self.inner)


class GuardedGenerator(NaiveGenerator):
    def generate(self, request: CheckedRequest) -> GenerationOutput:
        crash_point("before-call")
        # 생성기(수집부터 LLM까지)를 부르기 전에 시작 표식을 큐 밖에 남긴다. 이미 있으면 이전 실행이 분석을
        # 불렀을 수 있으므로 다시 부르지 않고 실행 불명으로 돌린다(process_request가 UNCERTAIN을 알린다).
        if not create_exclusive(attempt_dir(request.attempt_id) / "started"):
            raise ExecutionUnknown("이 시도의 분석 시작 표식이 이미 있다")
        crash_point("after-marker")
        return analysis(request, self.inner)


class FWorker:
    def __init__(self) -> None:
        opts = {"connection": REDIS_URL, "prefix": PREFIX}
        self.events = Queue(EVENT_QUEUE, opts)
        self.accepted = synthetic_accepted_context()
        self.loop: asyncio.AbstractEventLoop | None = None

    async def send(self, name: str, message: dict[str, Any]) -> None:
        verdict = check_message(name, message).verdict
        if verdict is not Verdict.VALID:
            raise RuntimeError(f"{name} 스키마 위반: {verdict}")
        await self.events.add(name, message, {"jobId": message["messageId"]})
        flog({"kind": "sent", "name": name, "messageId": message["messageId"],
              "state": message.get("state")})

    # ---------------------------------------------------------------- 결과 전달

    async def deliver_stored(self, folder: Path, reason: str) -> None:
        """보존한 결과를 그대로 보낸다. 재전송마다 새 messageId를 붙인다(#116 「재전달」).

        전송 ID를 먼저 기록한 뒤 큐에 넣는다. 기록 뒤·추가 전에 죽으면 다음 점검이 그 ID의 작업이 없음을
        보고 새 ID로 다시 보낸다(같은 ID를 다시 만들어 큐에서 무시되는 일이 없다).
        """
        result = json.loads((folder / "result.json").read_text("utf-8"))
        sent_log = folder / "sent.jsonl"
        if read_lines(sent_log):
            result["messageId"] = f"{result['messageId']}-resend-{uuid.uuid4().hex[:12]}"
        append_line(sent_log, {"messageId": result["messageId"], "reason": reason, "at": time.time()})
        await self.send("Result", result)

    def valid_receipt(self, receipt: Any, stored: dict[str, Any]) -> bool:
        if check_message("ResultReceipt", receipt).verdict is not Verdict.VALID:
            return False
        return all(receipt[key] == stored[key] for key in ("resultId", "requestId", "attemptId"))

    async def delivery_state(self, folder: Path) -> tuple[str, str | None]:
        """보낸 결과가 E에 닿았는지 모든 전송 기록을 보고 판단한다(#116 「재전달」의 전달 표식은 수신 확인 기준).

        delivered: ACCEPTED·DUPLICATE 수신 확인을 받음 / rejected: REJECTED를 받음(다시 보내지 않음)
        pending: 보낸 결과 작업이 아직 큐에서 기다리는 중 / missing: 보낸 적이 없거나, 결과 작업이 사라졌거나,
        실패·완료로 끝났는데 유효한 수신 확인이 없음
        """
        if (folder / "delivered").exists():
            return "delivered", None
        if (folder / "rejected").exists():
            return "rejected", (folder / "rejected").read_text("utf-8")
        stored = json.loads((folder / "result.json").read_text("utf-8"))
        rejected_code: str | None = None
        pending = False
        for entry in read_lines(folder / "sent.jsonl"):
            message_id = entry["messageId"]
            job = await Job.fromId(self.events, message_id)
            if job is None:
                continue
            receipt = job.returnvalue
            if isinstance(receipt, dict):
                if not self.valid_receipt(receipt, stored):
                    flog({"kind": "invalid-receipt", "messageId": message_id})
                elif receipt["disposition"] in ("ACCEPTED", "DUPLICATE"):
                    create_exclusive(folder / "delivered", f"{receipt['disposition']}/{receipt['code']}")
                    return "delivered", None
                else:
                    rejected_code = receipt["code"]
            if await self.events.getJobState(message_id) in PENDING_STATES:
                pending = True
        if rejected_code is not None:
            # 거부도 큐 밖에 남긴다. 큐 자료가 사라져도 거부된 결과를 다시 보내지 않는다.
            create_exclusive(folder / "rejected", rejected_code)
            return "rejected", rejected_code
        return ("pending" if pending else "missing"), None

    async def ensure_delivered(self, folder: Path, reason: str) -> str:
        """보존 결과가 E에 닿지 않았고 큐에도 없으면 다시 보낸다. 분석은 부르지 않는다.

        재전송은 처음 전송 뒤 MAX_RESENDS번까지, 처음 전송부터 DELIVERY_DEADLINE_SECONDS 안에서만 한다.
        큐에서 기다린 시간도 기한에 넣는다. 넘으면 사람 확인 표식을 남기고 멈춘다(#116 「재전달」 제안).
        """
        if (folder / "needs-human").exists():
            return "needs-human"
        state, code = await self.delivery_state(folder)
        sent = read_lines(folder / "sent.jsonl")
        overdue = bool(sent) and time.time() - sent[0]["at"] > DELIVERY_DEADLINE_SECONDS
        if state in ("missing", "pending") and (overdue or (state == "missing" and len(sent) > MAX_RESENDS)):
            create_exclusive(folder / "needs-human", f"{state} {len(sent)}회 전송")
            state = "needs-human"
        elif state == "missing":
            await self.deliver_stored(folder, reason=reason)
        flog({"kind": "delivery-check", "attempt": folder.name, "state": state, "code": code, "reason": reason})
        return state

    # ---------------------------------------------------------------- 실행 불명 알림

    async def send_uncertain(self, attempt_id: str, request_id: str, reason: str) -> None:
        """UNCERTAIN을 보낸다. 메시지 ID는 시도마다 하나로 고정해, 큐에 남아 있으면 큐가 두 번째를 버린다.

        보냈다는 표식은 남기지만 다시 보내지 않는 조건으로 쓰지 않는다. 큐에 넣은 알림이 E가 받기 전에
        사라질 수 있기 때문이다(E는 같은 시도의 UNCERTAIN을 여러 번 받아도 상태를 바꾸지 않는다).
        """
        await self.send("ProcessingEvent", {
            "schemaVersion": "1",
            "messageId": f"event-uncertain-{attempt_key(attempt_id)}",
            "requestId": request_id,
            "attemptId": attempt_id,
            "state": "UNCERTAIN",
            "observedAt": rfc3339(now()),
        })
        append_line(attempt_dir(attempt_id) / "uncertain-sent.jsonl", {"reason": reason, "at": time.time()})

    # ---------------------------------------------------------------- 처리

    def emit_from_thread(self, event: dict[str, Any]) -> None:
        assert self.loop is not None
        asyncio.run_coroutine_threadsafe(self.send("ProcessingEvent", event), self.loop).result()

    async def run_processing(self, data: Any) -> Any:
        generator = GuardedGenerator() if MODE == "guarded" else NaiveGenerator()
        kwargs = {"accepted": self.accepted, "generator": generator, "clock": now, "id_label": SCENARIO}
        if RUN_IN == "loop":
            # 분석이 이벤트 루프를 막는 구성. 진행 알림은 처리 뒤에 몰아서 보낸다.
            pending: list[dict[str, Any]] = []
            outcome = process_request(data, emit=pending.append, **kwargs)
            for event in pending:
                await self.send("ProcessingEvent", event)
            return outcome
        return await asyncio.to_thread(process_request, data, emit=self.emit_from_thread, **kwargs)

    async def process(self, job: Any, token: str) -> dict[str, Any]:
        try:
            return await self.process_checked(job)
        except Exception as error:
            flog({"kind": "process-error", "jobId": job.id, "reason": repr(error)[:300]})
            raise

    def too_old(self, data: dict[str, Any]) -> bool:
        if not MAX_REQUEST_AGE_SECONDS:
            return False
        requested = datetime.fromisoformat(str(data["requestedAt"]).replace("Z", "+00:00"))
        return (now() - requested).total_seconds() > MAX_REQUEST_AGE_SECONDS

    async def process_checked(self, job: Any) -> dict[str, Any]:
        data = job.data
        flog({"kind": "job-start", "jobId": job.id, "attemptsStarted": job.attemptsStarted,
              "stalledCounter": job.stalledCounter})
        checked = check_request(data, self.accepted)
        if isinstance(checked, Rejected):
            flog({"kind": "rejected", "jobId": job.id, "reason": str(checked.reason)})
            return {"action": "rejected"}
        attempt_id = checked.attempt_id

        if MODE == "guarded":
            folder = attempt_dir(attempt_id)
            recorded = folder / "request.json"
            fingerprint = request_fingerprint(data)
            if recorded.exists() and json.loads(recorded.read_text("utf-8"))["fingerprint"] != fingerprint:
                # 같은 시도 ID인데 내용이 다르다. 보존 결과를 주거나 분석하지 않고 사람 확인으로 둔다.
                flog({"kind": "skip-analysis", "jobId": job.id, "why": "request-mismatch"})
                return {"action": "request-mismatch"}
            if (folder / "result.json").exists():
                state = await self.ensure_delivered(folder, reason="redelivered-job")
                flog({"kind": "skip-analysis", "jobId": job.id, "why": "result-stored", "delivery": state})
                return {"action": "result-already-stored", "delivery": state}
            if (folder / "started").exists():
                await self.send_uncertain(attempt_id, checked.request_id, reason="redelivered-job")
                flog({"kind": "skip-analysis", "jobId": job.id, "why": "started-without-result"})
                return {"action": "uncertain-no-rerun"}
            if not recorded.exists() and self.too_old(data):
                # 기록 보존 기간보다 오래된 시도는 예전에 실행됐는지 알 수 없다. 분석하지 않고 실행 불명으로 둔다.
                await self.send_uncertain(attempt_id, checked.request_id, reason="request-too-old")
                flog({"kind": "skip-analysis", "jobId": job.id, "why": "request-too-old"})
                return {"action": "too-old"}
            write_json_durable(recorded, {"attemptId": attempt_id, "requestId": checked.request_id,
                                          "fingerprint": fingerprint})

        outcome = await self.run_processing(data)
        if isinstance(outcome, Finished):
            result = outcome.result
            crash_point("before-store")
            # 결과를 큐 밖에 보존한 뒤에 보낸다(#116 「수명표」).
            folder = attempt_dir(attempt_id)
            write_json_durable(folder / "result.json", result)
            crash_point("after-store")
            await self.deliver_stored(folder, reason="first-send")
            return {"action": "finished", "outcome": result["outcome"]}
        if isinstance(outcome, Uncertain):
            return {"action": "uncertain"}
        flog({"kind": "rejected", "jobId": job.id})
        return {"action": "rejected"}

    async def recheck(self, reason: str) -> None:
        """보존했지만 E에 닿지 않은 결과를 다시 보낸다(#116 「정리 실패·프로세스 중단」).

        기동할 때는 시작 표식만 남은 시도에 UNCERTAIN도 보낸다. worker가 하나뿐이라 기동 때 남은 시도는 죽은
        실행이다. 시도 하나의 기록이 손상돼도 다른 시도와 worker 기동을 막지 않는다. 큐 서버 연결 오류는
        기록 문제가 아니므로 사람 확인으로 돌리지 않고 이번 점검을 멈춘다(다음 점검에서 다시 본다).
        """
        if MODE != "guarded" or not STORE.exists():
            return
        for folder in sorted(STORE.iterdir()):
            try:
                if (folder / "needs-human").exists():
                    continue
                if (folder / "result.json").exists():
                    await self.ensure_delivered(folder, reason=reason)
                elif reason == "startup-scan" and (folder / "started").exists():
                    recorded = json.loads((folder / "request.json").read_text("utf-8"))
                    await self.send_uncertain(recorded["attemptId"], recorded["requestId"], reason=reason)
            except RedisError as error:
                flog({"kind": "recheck-deferred", "reason": reason, "error": repr(error)[:200]})
                return
            except Exception as error:
                create_exclusive(folder / "needs-human", repr(error)[:300])
                flog({"kind": "attempt-error", "attempt": folder.name, "reason": repr(error)[:300]})

    async def periodic_recheck(self) -> None:
        while True:
            await asyncio.sleep(RECHECK_SECONDS)
            try:
                await self.recheck("periodic")
            except Exception as error:  # 점검 하나가 실패해도 주기 점검은 계속한다
                flog({"kind": "recheck-error", "error": repr(error)[:200]})

    async def main(self) -> None:
        self.loop = asyncio.get_running_loop()
        await self.recheck("startup-scan")
        worker = Worker(REQUEST_QUEUE, self.process, {
            "connection": REDIS_URL,
            "prefix": PREFIX,
            "concurrency": 1,
            "lockDuration": int(os.environ.get("F_LOCK_MS", "30000")),
            "stalledInterval": int(os.environ.get("F_STALLED_MS", "30000")),
            "maxStalledCount": int(os.environ.get("F_MAX_STALLED", "1")),
        })
        worker.on("completed", lambda job, result: flog(
            {"kind": "job-completed", "jobId": getattr(job, "id", None), "action": (result or {}).get("action")}))
        worker.on("failed", lambda job, err: flog(
            {"kind": "job-failed", "jobId": getattr(job, "id", None), "reason": str(err)}))
        worker.on("error", lambda err, *_: flog({"kind": "worker-error", "reason": repr(err)[:300]}))
        worker.on("stalled", lambda job_id, *_: flog({"kind": "stalled", "jobId": job_id}))
        recheck_task = asyncio.create_task(self.periodic_recheck()) if RECHECK_SECONDS and MODE == "guarded" else None
        (RUN_DIR / f"f-ready-{os.getpid()}").write_text("")
        stop = asyncio.Event()
        self.loop.add_signal_handler(signal.SIGTERM, stop.set)
        self.loop.add_signal_handler(signal.SIGINT, stop.set)
        await stop.wait()
        if recheck_task:
            recheck_task.cancel()
        await worker.close()
        await self.events.close()


if __name__ == "__main__":
    asyncio.run(FWorker().main())
