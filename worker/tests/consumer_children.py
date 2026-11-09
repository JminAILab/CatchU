"""큐 소비자 시험용 자식 대상 함수. spawn 자식이 이 모듈을 이름으로 불러온다.

정상 자식은 `app.consumer.child.child_main`이다. 여기 함수들은 멈추거나, 종료 신호를 무시하거나,
통신을 깨는 자식을 흉내 낸다.
"""

import os
import signal
import struct
import time
from multiprocessing.connection import Connection
from typing import Any

from app.consumer.child import ChildInput, child_main, start_watchdog
from app.consumer.frames import Frame, encode


def marked(conn: Connection, child_input: ChildInput) -> None:
    """HARNESS_MARKER에 자식 시작을 적고 HARNESS_TARGET 함수로 처리한다(하네스 전용)."""
    with open(os.environ["HARNESS_MARKER"], "a", encoding="utf-8") as stream:
        stream.write(f"child {child_input.job_id}\n")
    name = os.environ.get("HARNESS_TARGET", "child_main")
    target = child_main if name == "child_main" else globals()[name]
    target(conn, child_input)


def hang(conn: Connection, child_input: ChildInput) -> None:
    """종결 프레임 없이 멈춘다(자기 마감·부모 감시는 그대로 돈다)."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    start_watchdog(child_input)
    while True:
        time.sleep(1)


def hang_when_dead(conn: Connection, child_input: ChildInput) -> None:
    """시도 ID가 dead로 끝나면 멈추고, 아니면 정상 처리한다(같은 부모의 다음 작업 확인)."""
    if child_input.job_id.endswith("dead"):
        hang(conn, child_input)
    child_main(conn, child_input)


def hang_ignoring_sigterm(conn: Connection, child_input: ChildInput) -> None:
    """SIGTERM을 무시하고 멈춘다. 무시를 건 뒤 CONSUMER_TEST_READY_DIR에 준비 파일을 만든다."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    start_watchdog(child_input)
    ready_dir = os.environ.get("CONSUMER_TEST_READY_DIR")
    if ready_dir:
        with open(os.path.join(ready_dir, child_input.job_id), "w", encoding="utf-8"):
            pass
    while True:
        time.sleep(1)


def work_for_seconds(conn: Connection, child_input: ChildInput) -> None:
    """정상 처리 전에 SLOW_CHILD_SECONDS(기본 6초)만큼 일하는 척한다(잠금 갱신 시험)."""
    time.sleep(float(os.environ.get("SLOW_CHILD_SECONDS", "6")))
    child_main(conn, child_input)


def large_result(conn: Connection, child_input: ChildInput) -> None:
    """정상 결과에 수 MB 근거 한계 문구를 덧붙여 보낸다(결과 자체는 스키마를 지킨다)."""
    from app.processing import runner

    original = getattr(runner, "process_request")  # noqa: B009

    def bigger(*args: object, **kwargs: object) -> object:
        outcome = original(*args, **kwargs)
        result = getattr(outcome, "result", None)
        if isinstance(result, dict):
            limits = result["candidates"][0]["groupingLimitations"]
            limits.append("가" * (3 * 1024 * 1024))
        return outcome

    setattr(runner, "process_request", bigger)  # noqa: B010
    child_main(conn, child_input)


def oversized_frame(conn: Connection, child_input: ChildInput) -> None:
    """프레임 상한보다 큰 프레임을 보낸다."""
    size = child_input.settings.limits.frame_max_bytes + 1
    conn.send_bytes(b" " * size)
    time.sleep(30)


def partial_frame_then_die(conn: Connection, child_input: ChildInput) -> None:
    """진행 알림 한 건은 온전히 보내고, 다음 프레임은 길이 머리만 보낸 채 죽는다."""
    import json
    from datetime import UTC, datetime

    from app.processing.pipeline import _event
    from app.processing.request_check import CheckedRequest, check_request
    from app.processing.runner import _mock_context

    message = json.loads(child_input.job_data)
    checked = check_request(message, _mock_context(message))
    assert isinstance(checked, CheckedRequest)
    event = _event(checked, "RECEIVED", datetime.now(UTC), "mock")
    conn.send_bytes(encode(Frame("event", message=event)))
    os.write(conn.fileno(), struct.pack("!i", 4096) + b'{"kind":')
    os._exit(9)


def exit_without_terminal(conn: Connection, child_input: ChildInput) -> None:
    os._exit(3)


def exit_badly_after_terminal(conn: Connection, child_input: ChildInput) -> None:
    child_main(conn, child_input)
    os._exit(5)


def raise_in_child(conn: Connection, child_input: ChildInput) -> None:
    """처리 중 예외(결함). 정상 자식과 같이 결함 프레임을 보내는지 본다."""
    from app.processing import runner

    def broken(*args: object, **kwargs: object) -> object:
        raise RuntimeError("비밀 원문 sk-test-should-not-leak")

    setattr(runner, "process_request", broken)  # noqa: B010
    child_main(conn, child_input)


def live_synthetic(conn: Connection, child_input: ChildInput) -> None:
    """LIVE 요청을 합성 GitHub 저장소(열린 PR 하나)와 합성 제공자로 처리한다.

    요청 정보 조회는 자식이 받은 설정의 실제 HTTP 클라이언트로 부른다(시험 프로세스의 loopback 서버).
    """
    from dataclasses import replace

    from live_synthetic import ONE_PULL, Parts

    from app.consumer import child

    original = child.live_assembly

    def assembly(settings: Any) -> Any:
        built = original(settings)
        assert built is not None, "LIVE 설정 없이 띄웠다"
        parts = Parts(ONE_PULL)
        return replace(
            built,
            open_transport=parts.open_transport,
            provider_factory=parts.make_provider,
        )

    setattr(child, "live_assembly", assembly)  # noqa: B010
    child_main(conn, child_input)


# 기록의 글 원문 비노출 시험(CR1 보안 확인 사항)의 PR 제목·커밋 첫 줄. 로그에 나오면 안 되는 표식이다.
RECORD_PULL_TITLE = "기록제목표식 로그인 오류 수정"
RECORD_COMMIT_LINE = "기록커밋표식 알림 정리"


def live_synthetic_record_text(conn: Connection, child_input: ChildInput) -> None:
    """`live_synthetic`과 같되, 열린 PR의 제목이 쓸 만한 기록의 글인 합성 저장소로 처리한다.

    PR 제목이 제목과 작업 사실 둘째 줄(`workFacts[1]`)이 된다. 커밋 첫 줄은 단위 밖 시험에 쓰지 않지만
    로그에 나오지 않는지 함께 본다.
    """
    from dataclasses import replace

    from candidate_scenarios import ROOT, Pull, Scenario, change, commit, root_commit
    from github_synthetic import MEMBER, sha
    from live_synthetic import Parts

    from app.consumer import child

    own = commit(
        sha(31),
        MEMBER,
        parents=(ROOT,),
        minute=3,
        message=RECORD_COMMIT_LINE,
        files=[change("app/alpha.py", patch="@@ -1 +1 @@\n-alpha = 1\n+alpha = 2")],
    )
    scenario = Scenario(
        default_branch=(root_commit(),),
        pulls=(
            Pull(3, MEMBER, (own,), state="open", created=2, title=RECORD_PULL_TITLE),
        ),
    )
    original = child.live_assembly

    def assembly(settings: Any) -> Any:
        built = original(settings)
        assert built is not None, "LIVE 설정 없이 띄웠다"
        parts = Parts(scenario)
        return replace(
            built,
            open_transport=parts.open_transport,
            provider_factory=parts.make_provider,
        )

    setattr(child, "live_assembly", assembly)  # noqa: B010
    child_main(conn, child_input)


# AI 쪽(CR3) 로그 시험의 AI 제목 후보·설명 문장. 로그에 나오면 안 되는 표식이다(한글 표식은 기계 대조가 보지 않는다).
AI_TITLE = "후보표식 alpha 값 변경"
AI_SENTENCE = "문장표식 alpha 값을 2로 바꿨습니다."


def live_synthetic_ai_side(conn: Connection, child_input: ChildInput) -> None:
    """`live_synthetic_record_text`와 같은 저장소를 AI 쪽이 켜진 채로 처리한다.

    판정 공급자는 합성 판정 어댑터다. 기록의 글은 판정 부실(RECORD_WHAT 0.2)이고 후보 t1을 0.95로 골라, 제목은
    AI 후보가 되고 작업 사실 둘째 줄은 지워진다. 자식이 받은 설정의 판정 키는 쓰지 않는다.
    """
    from dataclasses import replace

    from candidate_scenarios import ROOT, Pull, Scenario, change, commit, root_commit
    from generation_scenarios import (
        ScriptedProvider,
        ai_answer,
        code_title,
        pick,
        question,
        written,
    )
    from github_synthetic import MEMBER, sha
    from live_synthetic import Parts

    from app.consumer import child
    from app.generation import ProviderRequest
    from app.judgement.provider import Question
    from app.judgement.synthetic import SyntheticJudge, default_answer

    own = commit(
        sha(31),
        MEMBER,
        parents=(ROOT,),
        minute=3,
        message=RECORD_COMMIT_LINE,
        files=[change("app/alpha.py", patch="@@ -1 +1 @@\n-alpha = 1\n+alpha = 2")],
    )
    scenario = Scenario(
        default_branch=(root_commit(),),
        pulls=(
            Pull(3, MEMBER, (own,), state="open", created=2, title=RECORD_PULL_TITLE),
        ),
    )

    def reply(request: ProviderRequest) -> str:
        line = pick(request, change="added", contains="alpha")
        return ai_answer(
            titles=[written(AI_TITLE, line)],
            sentences=[written(AI_SENTENCE, line)],
            title=code_title(line, "alpha"),
            questions=[question("BACKGROUND")],
        )

    def answer(question: Question) -> object | None:
        if question.kind == "RECORD_WHAT":
            return 0.2
        if question.kind == "TITLE_CHOICE":
            return [0.95, 0.05]
        return default_answer(question)

    original = child.live_assembly

    def assembly(settings: Any) -> Any:
        built = original(settings)
        assert built is not None, "LIVE 설정 없이 띄웠다"
        assert built.judge_factory is not None, "AI 쪽이 꺼진 설정으로 띄웠다"
        parts = Parts(scenario, provider=ScriptedProvider(reply))
        return replace(
            built,
            open_transport=parts.open_transport,
            provider_factory=parts.make_provider,
            judge_factory=lambda: SyntheticJudge(answer),
        )

    setattr(child, "live_assembly", assembly)  # noqa: B010
    child_main(conn, child_input)


def report_modules(conn: Connection, child_input: ChildInput) -> None:
    """자식에 불러온 모듈 중 BullMQ·Redis·FastAPI가 있는지 결함 프레임 이름으로 알린다."""
    import sys

    child_main_modules = {"bullmq", "redis", "fastapi", "uvicorn"} & {
        name.split(".")[0] for name in sys.modules
    }
    conn.send_bytes(
        encode(
            Frame("defect", error_type=",".join(sorted(child_main_modules)) or "none")
        )
    )
