"""부모 처리 함수와 실제 자식 프로세스(가짜 출력 큐). 계획 「PR① 자동 시험」 2~9·18·19."""

import asyncio
import logging
import pickle
import subprocess
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

import consumer_children
import pytest
from consumer_support import (
    FAST,
    FakeJob,
    FakeOutput,
    FakeResultJobs,
    child_settings,
    mock_request,
    new_attempt,
    pid_alive,
    request_job,
    wait_until,
)

from app.consumer import queues
from app.consumer.child import ChildInput, child_main
from app.consumer.children import ChildRun, ChildTarget
from app.consumer.parent import ProcessingAborted, RequestProcessor
from app.consumer.receipts import ReceiptWatcher
from app.consumer.settings import ChildSettings, QueueUrl
from app.contract import Verdict, check_message

WORKER_DIR = Path(__file__).resolve().parents[1]


@dataclass
class Run:
    value: dict[str, str] | ProcessingAborted
    processor: RequestProcessor
    output: FakeOutput
    receipts_watched: int
    job: FakeJob


def run_job(
    job: FakeJob,
    *,
    settings: ChildSettings | None = None,
    output: FakeOutput | None = None,
    target: ChildTarget = child_main,
) -> Run:
    settings = settings or child_settings()
    output = output or FakeOutput()

    async def go() -> Run:
        watcher = ReceiptWatcher(
            FakeResultJobs(), replace(settings.limits, receipt_window=60)
        )
        processor = RequestProcessor(settings, output, watcher, child_target=target)
        try:
            value: dict[str, str] | ProcessingAborted = await processor(job, "token")
        except ProcessingAborted as error:
            value = error
        watched = watcher.pending
        await watcher.cancel_all()
        return Run(value, processor, output, watched, job)

    return asyncio.run(go())


def aborted(run: Run) -> str:
    assert isinstance(run.value, ProcessingAborted), run.value
    # 실패 사유는 고정 코드뿐이고 예외 연결 고리가 없다.
    assert str(run.value) == run.value.code
    assert run.value.__cause__ is None and run.value.__context__ is None
    return run.value.code


def names(run: Run) -> list[str]:
    return [added.name for added in run.output.added]


# 2. 작업 봉투 -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "change",
    [
        lambda job: replace(job, name="ProcessingEvent"),
        lambda job: replace(job, id=new_attempt()),
        lambda job: replace(job, id="1234", data={**job.data, "attemptId": "1234"}),
        lambda job: replace(job, id="a:b", data={**job.data, "attemptId": "a:b"}),
        lambda job: replace(job, data=["not", "a", "mapping"]),
    ],
    ids=["name", "id-not-attempt", "numeric-id", "colon-id", "data-not-object"],
)
def test_envelope_violation_fails_job_without_child(change: Any) -> None:
    run = run_job(change(request_job()))

    assert aborted(run) == "REQUEST_JOB_INVALID"
    assert run.processor.spawned == 0
    assert run.output.attempts == []
    assert run.job.opts["stackTraceLimit"] == 0


# 3. 조회 전 자체 검사·처리 전 거부 ----------------------------------------------------------


def _with(message: dict[str, Any], path: tuple[str, ...], value: Any) -> dict[str, Any]:
    changed = {**message, "allowedScope": dict(message["allowedScope"])}
    target = changed
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value
    return changed


@pytest.mark.parametrize(
    ("path", "value", "pointer"),
    [
        (("credentialContextReference",), "other-ref", "/credentialContextReference"),
        (
            ("allowedScope", "selectionReference"),
            "other-ref",
            "/allowedScope/selectionReference",
        ),
        (
            ("allowedScope", "repositoryId"),
            "synthetic-repo-0002",
            "/allowedScope/repositoryId",
        ),
        (("requestId",), "request-0001", "/requestId"),
    ],
)
def test_self_check_rejects_before_any_message(
    path: tuple[str, ...], value: str, pointer: str
) -> None:
    message = _with(mock_request(new_attempt()), path, value)
    run = run_job(request_job(message))

    assert run.value == {"handled": "REJECTED", "reason": "SELF_CHECK_FAILED"}
    assert run.output.attempts == []
    assert run.receipts_watched == 0


def test_schema_invalid_and_mode_refusals_send_nothing() -> None:
    broken = {**mock_request(new_attempt()), "unexpected": True}
    live = {**mock_request(new_attempt()), "sourceMode": "LIVE"}
    results = [
        run_job(request_job(broken)),
        run_job(request_job(live)),
        run_job(request_job(), settings=child_settings(mock_enabled=False)),
    ]

    assert [run.value for run in results] == [
        {"handled": "REJECTED", "reason": "SCHEMA_INVALID"},
        {"handled": "REJECTED", "reason": "LIVE_NOT_ASSEMBLED"},
        {"handled": "REJECTED", "reason": "MOCK_NOT_ACCEPTED"},
    ]
    assert all(run.output.attempts == [] for run in results)


# 4·5. MOCK 정상 종결과 실행 불명 ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("scenario", "outcome"),
    [
        ("succeeded-one-candidate", "SUCCEEDED"),
        ("empty", "EMPTY"),
        ("partial-failed", "PARTIAL_FAILED"),
    ],
)
def test_mock_request_sends_events_then_result(scenario: str, outcome: str) -> None:
    message = mock_request(new_attempt())
    attempt = message["attemptId"]
    run = run_job(request_job(message), settings=child_settings(scenario=scenario))

    assert run.value == {"handled": "RESULT_SENT", "outcome": outcome}
    assert names(run) == ["ProcessingEvent", "ProcessingEvent", "Result"]
    received, running, result = run.output.added
    assert [received.data["state"], running.data["state"]] == ["RECEIVED", "RUNNING"]
    assert received.data["messageId"] == f"event-mock-{attempt}-received"
    assert running.data["messageId"] == f"event-mock-{attempt}-running"
    for event in (received, running):
        assert event.opts == {
            **queues.EVENT_JOB_OPTIONS,
            "jobId": event.data["messageId"],
        }
        assert check_message("ProcessingEvent", event.data).verdict is Verdict.VALID
    assert result.opts == {
        **queues.RESULT_JOB_OPTIONS,
        "jobId": f"message-mock-{attempt}-result",
    }
    assert result.data["resultId"] == f"result-mock-{attempt}"
    assert check_message("Result", result.data).verdict is Verdict.VALID
    # 결과는 요청의 식별자·맥락을 그대로 옮긴다(E가 대조하는 7개).
    for key in (
        "requestId",
        "attemptId",
        "memberId",
        "repositoryId",
        "consentId",
        "sourceMode",
    ):
        assert result.data[key] == message[key]
    assert result.data["scopeRevision"] == message["allowedScope"]["revision"]
    assert result.data["outcome"] == outcome
    assert run.processor.spawned == 1
    assert run.receipts_watched == 1


def test_execution_unknown_sends_only_uncertain_and_no_result() -> None:
    run = run_job(request_job(), settings=child_settings(scenario="execution-unknown"))

    assert run.value == {"handled": "UNCERTAIN"}
    assert [added.data["state"] for added in run.output.added] == [
        "RECEIVED",
        "RUNNING",
        "UNCERTAIN",
    ]
    assert run.processor.spawned == 1
    assert run.receipts_watched == 0


# 6·7. 상한 초과와 자식 회수 -------------------------------------------------------------------


def _short(total: float) -> ChildSettings:
    return child_settings(limits=replace(FAST, total=total))


def test_time_limit_kills_child_sends_nothing_and_next_job_runs() -> None:
    settings = _short(1.5)
    stuck = request_job(mock_request(new_attempt()[:-4] + "dead"))
    following = request_job()

    async def go() -> tuple[Any, Any, RequestProcessor, FakeOutput]:
        output = FakeOutput()
        watcher = ReceiptWatcher(
            FakeResultJobs(), replace(settings.limits, receipt_window=60)
        )
        processor = RequestProcessor(
            settings, output, watcher, child_target=consumer_children.hang_when_dead
        )
        try:
            first: Any = await processor(stuck, "token")
        except ProcessingAborted as error:
            first = error
        sent_before = list(output.attempts)
        second = await processor(following, "token")
        await watcher.cancel_all()
        return first, (sent_before, second), processor, output

    first, (sent_before, second), processor, output = asyncio.run(go())

    assert isinstance(first, ProcessingAborted) and first.code == "TIME_LIMIT_EXCEEDED"
    assert sent_before == []  # 부모는 알림을 만들지 않고 결과도 없다
    assert second == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
    assert processor.spawned == 2


def test_child_ignoring_sigterm_is_killed_and_reaped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[ChildRun] = []
    original = ChildRun.start.__func__  # type: ignore[attr-defined]

    async def start(
        cls: Any, target: Any, child_input: ChildInput, max_bytes: int
    ) -> Any:
        child = await original(cls, target, child_input, max_bytes)
        seen.append(child)
        return child

    monkeypatch.setattr(ChildRun, "start", classmethod(start))
    run = run_job(
        request_job(),
        settings=_short(1.5),
        target=consumer_children.hang_ignoring_sigterm,
    )

    assert aborted(run) == "TIME_LIMIT_EXCEEDED"
    assert len(seen) == 1
    assert not seen[0].is_alive()
    assert seen[0].exitcode == -9  # SIGTERM을 무시해 SIGKILL로 끝났다


def test_child_exits_by_itself_when_parent_is_killed() -> None:
    harness = subprocess.Popen(
        [sys.executable, str(WORKER_DIR / "tests/consumer_harness.py"), "orphan"],
        cwd=WORKER_DIR,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert harness.stdout is not None
        line = harness.stdout.readline()
        child_pid, tracker_pid = (int(value) for value in line.split())
        assert pid_alive(child_pid)
        harness.kill()
        harness.wait(5)
        # 자식은 부모 PID가 바뀐 것을 보고 스스로 끝나고, 자원 추적기도 함께 끝난다.
        assert wait_until(lambda: not pid_alive(child_pid), 5)
        assert tracker_pid == 0 or wait_until(lambda: not pid_alive(tracker_pid), 5)
    finally:
        if harness.poll() is None:
            harness.kill()


# 8. 통신 경계 -----------------------------------------------------------------------------


def test_large_result_is_delivered_whole() -> None:
    run = run_job(request_job(), target=consumer_children.large_result)

    assert run.value == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
    result = run.output.added[-1].data
    assert len(result["candidates"][0]["groupingLimitations"][-1]) == 3 * 1024 * 1024


@pytest.mark.parametrize(
    ("target", "events"),
    [
        (consumer_children.oversized_frame, []),
        (consumer_children.partial_frame_then_die, ["RECEIVED"]),
        (consumer_children.exit_without_terminal, []),
    ],
    ids=["over-16MiB", "partial-frame", "eof-without-terminal"],
)
def test_broken_channel_fails_job_with_child_exited(
    target: Any, events: list[str]
) -> None:
    run = run_job(request_job(), target=target)

    assert aborted(run) == "CHILD_EXITED"
    assert [added.data["state"] for added in run.output.added] == events
    assert run.receipts_watched == 0


def test_bad_exit_after_terminal_keeps_result() -> None:
    run = run_job(request_job(), target=consumer_children.exit_badly_after_terminal)

    assert run.value == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
    assert names(run) == ["ProcessingEvent", "ProcessingEvent", "Result"]


def test_exception_in_child_is_defect_without_result() -> None:
    run = run_job(request_job(), target=consumer_children.raise_in_child)

    assert aborted(run) == "WORKER_DEFECT"
    assert run.output.attempts == []


# 9. 결과와 상한·종료의 경쟁 -----------------------------------------------------------------


class _RacingOutput(FakeOutput):
    """결과를 넣는 순간 상한 시각을 지나게 하고 종료 신호도 보낸다."""

    def __init__(self, clock: list[float]) -> None:
        super().__init__()
        self.clock = clock
        self.processor: RequestProcessor | None = None

    async def add(self, name: str, data: dict[str, Any], opts: dict[str, Any]) -> Any:
        if name == "Result":
            self.clock[0] += 10_000
            assert self.processor is not None
            self.processor.begin_stop()
            self.processor.abort_active()
        return await super().add(name, data, opts)


def test_limit_or_stop_after_terminal_frame_does_not_drop_result() -> None:
    clock = [0.0]
    output = _RacingOutput(clock)
    settings = child_settings()

    async def go() -> Any:
        watcher = ReceiptWatcher(FakeResultJobs(), settings.limits)
        processor = RequestProcessor(
            settings, output, watcher, monotonic=lambda: clock[0]
        )
        output.processor = processor
        value = await processor(request_job(), "token")
        await watcher.cancel_all()
        return value, processor

    value, processor = asyncio.run(go())

    assert value == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
    assert [added.name for added in output.added].count("Result") == 1
    assert processor.spawned == 1


def test_result_send_timeout_is_not_retried() -> None:
    output = FakeOutput(hang_on="Result")
    run = run_job(request_job(), output=output)

    assert aborted(run) == "RESULT_DISPATCH_UNKNOWN"
    assert output.attempts.count("Result") == 1
    assert run.processor.spawned == 1
    assert run.receipts_watched == 1  # 보냈는지 몰라도 수신 확인 조회는 한다


def test_event_send_timeout_continues_analysis_once() -> None:
    output = FakeOutput(hang_on="ProcessingEvent")
    run = run_job(request_job(), output=output)

    assert run.value == {"handled": "RESULT_SENT", "outcome": "SUCCEEDED"}
    assert output.attempts == ["ProcessingEvent", "ProcessingEvent", "Result"]
    assert run.processor.spawned == 1


# 18. 자식 입력 ----------------------------------------------------------------------------


def test_child_input_is_plain_data_without_queue_objects() -> None:
    settings = child_settings()
    child_input = ChildInput(
        job_id=new_attempt(),
        job_data="{}",
        picked_at="2026-10-15T00:00:00Z",
        settings=settings,
        parent_pid=1,
    )
    dumped = pickle.dumps(child_input)

    assert b"bullmq" not in dumped and b"redis" not in dumped
    assert {type(value) for value in vars(child_input).values()} == {
        str,
        int,
        ChildSettings,
    }
    with pytest.raises(TypeError):
        pickle.dumps(QueueUrl("redis://:secret@127.0.0.1:6379"))


def test_child_does_not_load_queue_or_web_modules(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.ERROR, logger="app.consumer.parent")
    run = run_job(request_job(), target=consumer_children.report_modules)

    assert aborted(run) == "WORKER_DEFECT"
    assert "error=none" in caplog.text


# 19. 로그 -------------------------------------------------------------------------------


def test_logs_carry_ids_and_codes_but_no_message_body(
    caplog: pytest.LogCaptureFixture, capfd: pytest.CaptureFixture[str]
) -> None:
    caplog.set_level(logging.INFO)
    message = mock_request(new_attempt())
    runs = [
        run_job(request_job(message)),
        run_job(request_job(), output=FakeOutput(fail_on="Result")),
        run_job(request_job(), target=consumer_children.raise_in_child),
    ]
    child_logs = capfd.readouterr().err
    text = caplog.text + child_logs

    assert message["attemptId"] in text
    assert "분석 시작" in caplog.text and "결과 전송" in caplog.text
    assert "attemptId=" in child_logs
    result = runs[0].output.added[-1].data
    forbidden = [
        message["memberId"],
        message["consentId"],
        message["repositoryId"],
        message["noticeRevision"],
        result["candidates"][0]["workFacts"][0],
        result["candidates"][0]["subjectContribution"],
        "secret",
        "sk-test-should-not-leak",
    ]
    for value in forbidden:
        assert value not in text, value
