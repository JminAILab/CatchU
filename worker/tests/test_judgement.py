"""판정 구성 요소(CR3 `app.judgement`) 시험: 요청 조립·답 읽기·호출 한 번·합성 어댑터와 공급자 어댑터.

기대값은 기능 설계 rules.md(BR1.2·BR2.1~BR2.5·BR6.1~BR6.3)와 시나리오 S2·S8·S17·S29·S31, 비기능 설계(보안·
신뢰성 「실패 나누기」)에서 정했다. 외부 호출은 하지 않는다.
"""

import json
import logging
import socket
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx2
import pytest

from app.collection.credentials import AccessToken
from app.judgement.answers import Answers, ask, read
from app.judgement.claude import ANSWER_RULES, ANSWER_SCHEMA, ClaudeJudge
from app.judgement.openai_judge import OpenAIJudge
from app.judgement.provider import JudgementError, JudgementRequest, Question
from app.judgement.questions import (
    CATCH_INSTRUCTIONS,
    COMMON_GROUP,
    MATERIAL_INSTRUCTIONS,
    MAX_QUESTIONS,
    NONE_OPTION,
    TITLE_THRESHOLD,
    CatchLine,
    MaterialFile,
    Written,
    catch_request,
    material_request,
    material_verdicts,
)
from app.judgement.synthetic import SyntheticJudge, default_answer

# 가리기 검사가 잡는 GitHub 토큰 꼴. 실행 중에 이어 붙여 만든다.
TOKEN = "".join(("gh", "p_", "Synthetic", "Leak", "0" * 30))
LINES = (
    CatchLine("c1f1:L2", "c1f1", "app/alpha.py", "modified", "removed", "alpha = 1"),
    CatchLine("c1f1:L3", "c1f1", "app/alpha.py", "modified", "added", "alpha = 2"),
)
TITLE = Written("t1", "alpha 값 수정", ("c1f1:L3",))
SENTENCE = Written("s1", "app/alpha.py에서 alpha를 2로 바꿨습니다.", ("c1f1:L3",))


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 11, 6, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


def _catch(**overrides: object) -> JudgementRequest:
    values: dict[str, object] = {
        "record": "alpha 값을 2로",
        "ask_whole": True,
        "titles": (TITLE,),
        "sentences": (SENTENCE,),
        "timeout_seconds": 20.0,
    }
    values.update(overrides)
    built = catch_request(LINES, **values)  # type: ignore[arg-type]
    assert built is not None
    return built.request


# Catch 판정 요청 조립(BR2.1·BR2.3)


def test_s8_catch_request_carries_only_the_listed_fields() -> None:
    """S8: 판정 자료는 바뀐 줄·경로, 기록의 글, 후보·문장뿐이다. 지시문은 자료와 다른 칸이다."""
    request = _catch()
    data = json.loads(request.data)
    assert set(data) == {"files", "lines", "record", "titles", "sentences"}
    assert data["files"] == [
        {"id": "c1f1", "path": "app/alpha.py", "status": "modified"}
    ]
    assert {tuple(line) for line in data["lines"]} == {("id", "file", "change", "text")}
    assert data["record"] == "alpha 값을 2로"
    assert data["titles"] == [
        {"id": "t1", "text": "alpha 값 수정", "lines": ["c1f1:L3"]}
    ]
    assert request.instructions == CATCH_INSTRUCTIONS
    assert "따르지 않는다" in request.instructions
    assert "alpha" not in request.instructions
    for question in request.questions:
        # 질문 문장에는 자료의 글(경로·줄·후보)이 들어가지 않는다.
        assert "alpha" not in question.prompt


def test_catch_questions_follow_what_is_present() -> None:
    request = _catch()
    kinds = [question.kind for question in request.questions]
    assert kinds == ["RECORD_WHAT", "RECORD_WHOLE", "TITLE_CHOICE", "SENTENCE_TRUE"]
    choice = request.questions[2]
    assert choice.options == ("t1", NONE_OPTION)
    assert request.purpose == "CATCH"
    assert request.max_output_tokens == 2_000


def test_catch_questions_skip_absent_kinds() -> None:
    """기록의 글이 없거나 후보가 없으면 그 종류의 질문을 빼고 나머지만 묻는다(BR2.1)."""
    request = _catch(record=None, ask_whole=False, titles=())
    assert [question.kind for question in request.questions] == ["SENTENCE_TRUE"]
    assert set(json.loads(request.data)) == {"files", "lines", "sentences"}


def test_catch_request_without_questions_is_not_built() -> None:
    assert (
        catch_request(
            LINES,
            record=None,
            ask_whole=False,
            titles=(),
            sentences=(),
            timeout_seconds=20.0,
        )
        is None
    )


# 재료 판정 요청 조립(BR6.1·BR6.2)


def _file(
    path: str, *, kind: bool = True, group: bool = True, lines: int = 3
) -> MaterialFile:
    return MaterialFile(
        path=path,
        status="modified",
        changed_lines=lines,
        changed=tuple(("+", f"value_{index} = {index}") for index in range(lines)),
        ask_kind=kind,
        ask_group=group,
    )


def test_s17_material_questions_stay_within_400() -> None:
    """S17: 바뀐 파일 200개면 질문 400개 안에 드는 앞쪽 파일까지만 묻는다. 파일의 질문은 나누지 않는다."""
    files = [_file(f"pkg/file_{index:03}.txt") for index in range(200)]
    built = material_request(files, groups=("pkg", "web"), timeout_seconds=20.0)
    assert built is not None
    assert len(built.request.questions) <= MAX_QUESTIONS
    # 파일마다 종류·묶음·점수 셋: 133개(399문항)까지 묻는다.
    assert list(built.asked) == [file.path for file in files[:133]]
    assert len(built.request.questions) == 399
    data = json.loads(built.request.data)
    assert [entry["path"] for entry in data["files"]] == list(built.asked)
    assert built.request.instructions == MATERIAL_INSTRUCTIONS
    assert built.request.max_output_tokens == 8_000


def test_material_question_kinds_per_file() -> None:
    files = [
        _file("src/a.py", kind=False, group=False),
        _file("notes.txt", kind=True, group=True),
    ]
    built = material_request(files, groups=("src", "web"), timeout_seconds=20.0)
    assert built is not None
    kinds = [(q.target, q.kind, q.options) for q in built.request.questions]
    assert kinds == [
        ("src/a.py", "MATERIAL_SCORE", ()),
        ("notes.txt", "MATERIAL_KIND", ("WORK", "RECORD", "GENERATED")),
        ("notes.txt", "MATERIAL_GROUP", ("src", "web", COMMON_GROUP)),
        ("notes.txt", "MATERIAL_SCORE", ()),
    ]
    # 질문 문장은 파일을 자료 안 id로만 가리킨다(경로를 넣지 않는다).
    assert all("notes.txt" not in q.prompt for q in built.request.questions)


def test_material_group_is_not_asked_without_seed_groups() -> None:
    built = material_request([_file("notes.txt")], groups=("",), timeout_seconds=20.0)
    assert built is not None
    assert [q.kind for q in built.request.questions] == [
        "MATERIAL_KIND",
        "MATERIAL_SCORE",
    ]


def test_s29_masked_front_lines_are_not_sent() -> None:
    """S29: 앞 5줄의 토큰 꼴 줄은 재료 판정 요청에 없고, 6번째 줄로 채우지 않는다. 문맥 줄·머리글은 없다."""
    file = MaterialFile(
        path="app/config.py",
        status="modified",
        changed_lines=7,
        changed=(
            ("+", "first = 1"),
            ("+", f'token = "{TOKEN}"'),
            ("-", None),
            ("+", "fourth = 4"),
            ("+", "fifth = 5"),
            ("+", "sixth = 6"),
        ),
        ask_kind=False,
        ask_group=False,
    )
    built = material_request([file], groups=(), timeout_seconds=20.0)
    assert built is not None
    assert TOKEN not in built.request.data
    (entry,) = json.loads(built.request.data)["files"]
    assert entry == {
        "id": "m1",
        "path": "app/config.py",
        "status": "modified",
        "changedLines": 7,
        "lines": ["+first = 1", "+fourth = 4", "+fifth = 5"],
    }


def test_material_request_without_files_is_not_built() -> None:
    assert material_request([], groups=("a",), timeout_seconds=20.0) is None


def test_material_verdicts_take_the_most_likely_choice() -> None:
    files = [_file("notes.txt"), _file("lock.json"), _file("tie.txt")]
    built = material_request(files, groups=("src", "web"), timeout_seconds=20.0)
    assert built is not None
    by_target = {(q.target, q.kind): q.id for q in built.request.questions}
    answers = Answers(
        choices={
            by_target["notes.txt", "MATERIAL_KIND"]: {
                "WORK": 0.2,
                "RECORD": 0.7,
                "GENERATED": 0.1,
            },
            by_target["notes.txt", "MATERIAL_GROUP"]: {
                "src": 0.1,
                "web": 0.1,
                COMMON_GROUP: 0.8,
            },
            by_target["lock.json", "MATERIAL_KIND"]: {
                "WORK": 0.0,
                "RECORD": 0.1,
                "GENERATED": 0.9,
            },
            by_target["tie.txt", "MATERIAL_KIND"]: {
                "WORK": 0.5,
                "RECORD": 0.5,
                "GENERATED": 0.0,
            },
        },
        scores={by_target["notes.txt", "MATERIAL_SCORE"]: 5},
    )
    verdicts = material_verdicts(built, answers)
    assert verdicts["notes.txt"].branch == "RECORD"
    assert verdicts["notes.txt"].group == COMMON_GROUP
    assert verdicts["notes.txt"].score == 5
    assert verdicts["lock.json"].branch == "GENERATED"
    assert verdicts["lock.json"].score is None
    # 같은 확률이 둘이면 답이 없다.
    assert verdicts["tie.txt"].branch is None
    assert all(verdict.judged for verdict in verdicts.values())


# 답 읽기(BR1.2·BR2.5)


QUESTIONS = (
    Question("q1", "RECORD_WHAT", "record", "?"),
    Question("q2", "TITLE_CHOICE", "title", "?", ("t1", "t2", NONE_OPTION)),
    Question("q3", "MATERIAL_SCORE", "a.py", "?"),
    Question("q4", "SENTENCE_TRUE", "s1", "?"),
)


def test_answers_are_read_per_question() -> None:
    answers = read(
        [("q1", 0.4), ("q2", [0.4, 0.2, 0.2]), ("q3", 3.6), ("q4", 1)], QUESTIONS
    )
    assert answers.probabilities == {"q1": 0.4, "q4": 1.0}
    # 고르기 확률은 합이 1이 되게 나눠 맞춘다(BR1.2).
    assert answers.choices["q2"] == {"t1": 0.5, "t2": 0.25, NONE_OPTION: 0.25}
    assert answers.scores == {"q3": 4}


@pytest.mark.parametrize(
    "raw",
    [
        [("q1", 1.2)],
        [("q1", -0.1)],
        [("q1", True)],
        [("q1", "0.9")],
        [("q1", float("nan"))],
        [("q2", [0.5, 0.5])],
        [("q2", [0, 0, 0])],
        [("q2", [0.5, "x", 0.5])],
        [("q3", 0)],
        [("q3", 6)],
        [("q9", 0.5)],
        [(1, 0.5)],
        [("q1", 0.9), ("q1", 0.1)],
    ],
)
def test_wrong_answers_drop_only_that_question(
    raw: list[tuple[object, object]],
) -> None:
    """범위 밖 값·모양이 틀린 값·모르는 id·겹친 id는 그 질문만 답이 없다(BR2.5)."""
    answers = read([*raw, ("q4", 0.95)], QUESTIONS)
    assert answers.probabilities.get("q1") is None
    assert "q2" not in answers.choices
    assert "q3" not in answers.scores
    assert answers.probabilities["q4"] == 0.95


def test_s31_none_choice_above_threshold_picks_no_candidate() -> None:
    """S31: TITLE_CHOICE에서 NONE이 0.92면 AI 후보를 고르지 않는다."""
    answers = read([("q2", [0.05, 0.03, 0.92])], QUESTIONS)
    assert answers.chosen("q2", TITLE_THRESHOLD) == NONE_OPTION
    below = read([("q2", [0.85, 0.1, 0.05])], QUESTIONS)
    assert below.chosen("q2", TITLE_THRESHOLD) is None
    assert below.most_likely("q2") == "t1"
    assert Answers().chosen("q2", TITLE_THRESHOLD) is None


# 호출 한 번(BR2.2, 신뢰성 「실패 나누기」)


def _request() -> JudgementRequest:
    return _catch()


@pytest.mark.parametrize(
    ("failure", "code"),
    [
        ("JUDGEMENT_TIMEOUT", "JUDGEMENT_TIMEOUT"),
        ("JUDGEMENT_CALL_FAILED", "JUDGEMENT_CALL_FAILED"),
        ("JUDGEMENT_RESPONSE_UNREADABLE", "JUDGEMENT_RESPONSE_UNREADABLE"),
    ],
)
def test_failures_come_back_as_three_codes_without_retry(
    failure: str, code: str
) -> None:
    judge = SyntheticJudge(failure=failure)  # type: ignore[arg-type]
    assert ask(judge, _request(), Clock()) == code
    assert len(judge.requests) == 1


def test_a_call_that_ends_after_the_timeout_is_a_timeout() -> None:
    clock = Clock()
    judge = SyntheticJudge(before=lambda request: clock.advance(21))
    assert ask(judge, _request(), clock) == "JUDGEMENT_TIMEOUT"
    late_failure = SyntheticJudge(
        failure="JUDGEMENT_CALL_FAILED", before=lambda request: clock.advance(21)
    )
    assert ask(late_failure, _request(), clock) == "JUDGEMENT_TIMEOUT"


def test_malformed_answer_list_is_unreadable() -> None:
    class Broken:
        name = "broken"

        def judge(self, request: JudgementRequest) -> list[object]:
            return [("q1", 0.5, "extra")]

    assert ask(Broken(), _request(), Clock()) == "JUDGEMENT_RESPONSE_UNREADABLE"  # type: ignore[arg-type]


def test_synthetic_judge_answers_and_skips() -> None:
    def answer(question: Question) -> object | None:
        return None if question.kind == "RECORD_WHAT" else default_answer(question)

    judge = SyntheticJudge(answer)
    answers = ask(judge, _request(), Clock())
    assert isinstance(answers, Answers)
    assert "q1" not in answers.probabilities
    assert answers.probabilities["q2"] == 0.95
    assert answers.chosen("q3", TITLE_THRESHOLD) == "t1"
    assert judge.name == "synthetic"
    assert len(judge.catch_requests()) == 1
    assert judge.material_requests() == []


def test_judgement_error_keeps_only_the_code() -> None:
    error = JudgementError("JUDGEMENT_CALL_FAILED")
    assert str(error) == "JUDGEMENT_CALL_FAILED"
    assert error.code == "JUDGEMENT_CALL_FAILED"


# 공급자 어댑터 공통: 진짜 SDK에 가짜 HTTP 전송(httpx2.MockTransport)을 넣는다. 네트워크 연결은 막는다.

CLAUDE_KEY = "".join(("synthetic-", "claude-judge-key-", "0" * 12))
Reply = Callable[[httpx2.Request], httpx2.Response]


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*args: object, **kwargs: object) -> None:
        raise AssertionError("외부 연결 시도")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    for name in (
        "ANTHROPIC_CUSTOM_HEADERS",
        "OPENAI_CUSTOM_HEADERS",
        "OPENAI_BASE_URL",
        "OPENAI_ORG_ID",
        "OPENAI_PROJECT_ID",
    ):
        monkeypatch.delenv(name, raising=False)


class FakeApi:
    """받은 HTTP 요청을 기록하고 정해 둔 응답을 돌려준다."""

    def __init__(self, reply: Reply) -> None:
        self._reply = reply
        self.requests: list[httpx2.Request] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        return self._reply(request)

    def body(self, index: int = 0) -> dict[str, Any]:
        value = json.loads(self.requests[index].content)
        assert isinstance(value, dict)
        return value


def claude_message(text: str, *, stop_reason: str = "end_turn") -> Reply:
    body = {
        "id": "msg_synthetic",
        "type": "message",
        "role": "assistant",
        "model": "claude-haiku-5-5",
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_details": None,
        "stop_sequence": None,
        "usage": {"input_tokens": 321, "output_tokens": 12, "inference_geo": "us"},
    }
    return lambda request: httpx2.Response(
        200, json=body, headers={"request-id": "req_synthetic_judge"}
    )


def claude_judge(api: FakeApi) -> ClaudeJudge:
    return ClaudeJudge(AccessToken(CLAUDE_KEY), transport=httpx2.MockTransport(api))


# Claude 판정 어댑터(BR1.2, Step 6)


def test_claude_judge_sends_the_same_questions_with_fixed_settings() -> None:
    """Claude 판정은 지시문·답 규칙을 system에, 자료·질문을 user에 두고 미국 처리·구조화 출력·다시 시도 없음."""
    api = FakeApi(
        claude_message(
            json.dumps({"answers": [["q1", 0.3], ["q3", [0.95, 0.05]], ["q4", 0.97]]})
        )
    )
    request = _catch()
    answers = ask(claude_judge(api), request, Clock())
    assert isinstance(answers, Answers)
    assert answers.probabilities == {"q1": 0.3, "q4": 0.97}
    assert answers.chosen("q3", TITLE_THRESHOLD) == "t1"
    (sent,) = api.requests
    assert sent.url == "https://api.anthropic.com/v1/messages"
    body = api.body()
    assert body["model"] == "claude-haiku-5-5"
    assert body["max_tokens"] == 2_000
    assert body["inference_geo"] == "us"
    assert body["thinking"] == {"type": "disabled"}
    assert body["system"] == CATCH_INSTRUCTIONS + "\n\n" + ANSWER_RULES
    assert body["output_config"] == {
        "format": {"type": "json_schema", "schema": ANSWER_SCHEMA}
    }
    user = body["messages"][0]["content"]
    data_part, questions_part = user.split("\n\n질문:\n")
    assert data_part == "자료:\n" + request.data
    questions = json.loads(questions_part)
    assert [(q["id"], q["question"]) for q in questions] == [
        (q.id, q.prompt) for q in request.questions
    ]
    assert [q["type"] for q in questions] == [
        "predicate",
        "predicate",
        "choice",
        "predicate",
    ]
    assert questions[2]["options"] == ["t1", NONE_OPTION]


def test_claude_judge_material_uses_the_material_output_cap() -> None:
    api = FakeApi(claude_message('{"answers":[["q1",4]]}'))
    built = material_request(
        [_file("src/a.py", kind=False, group=False)], groups=(), timeout_seconds=20.0
    )
    assert built is not None
    answers = ask(claude_judge(api), built.request, Clock())
    assert isinstance(answers, Answers)
    assert answers.scores == {"q1": 4}
    assert api.body()["max_tokens"] == 8_000
    assert json.loads(api.body()["messages"][0]["content"].split("질문:\n")[1]) == [
        {"id": "q1", "type": "score", "question": built.request.questions[0].prompt}
    ]


@pytest.mark.parametrize(
    ("reply", "code"),
    [
        (
            lambda request: httpx2.Response(529, json={"type": "error"}),
            "JUDGEMENT_CALL_FAILED",
        ),
        (
            lambda request: httpx2.Response(401, json={"type": "error"}),
            "JUDGEMENT_CALL_FAILED",
        ),
        (
            claude_message("{}", stop_reason="max_tokens"),
            "JUDGEMENT_RESPONSE_UNREADABLE",
        ),
        (claude_message("not json"), "JUDGEMENT_RESPONSE_UNREADABLE"),
        (claude_message('{"answers":{}}'), "JUDGEMENT_RESPONSE_UNREADABLE"),
    ],
    ids=["overloaded", "auth", "cut", "not-json", "answers-not-list"],
)
def test_claude_judge_failures_are_not_retried(reply: Reply, code: str) -> None:
    api = FakeApi(reply)
    assert ask(claude_judge(api), _catch(), Clock()) == code
    assert len(api.requests) == 1


def test_claude_judge_timeout_is_a_timeout() -> None:
    def slow(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("합성 시간 초과", request=request)

    api = FakeApi(slow)
    assert ask(claude_judge(api), _catch(), Clock()) == "JUDGEMENT_TIMEOUT"
    assert len(api.requests) == 1


def test_claude_judge_logs_carry_no_text(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    api = FakeApi(claude_message('{"answers":[["q1",0.9]]}'))
    ask(claude_judge(api), _catch(), Clock())
    joined = "\n".join(record.getMessage() for record in caplog.records)
    assert "JUDGE_CATCH" in joined
    for leak in (CLAUDE_KEY, "alpha", "기록의 글이"):
        assert leak not in joined


def test_claude_judge_rows_of_wrong_length_are_dropped() -> None:
    api = FakeApi(claude_message('{"answers":[["q1",0.9,"x"],["q4",0.95]]}'))
    answers = ask(claude_judge(api), _catch(), Clock())
    assert isinstance(answers, Answers)
    assert answers.probabilities == {"q4": 0.95}


# OpenAI 판정 어댑터(BR1.1, NFR1.5, Step 7)

OPENAI_KEY = "".join(("sk-proj-", "synthetic-judgement-", "0" * 16))
USAGE = {
    "input_tokens": 400,
    "input_tokens_details": {"cache_write_tokens": 0, "cached_tokens": 0},
    "output_tokens": 30,
    "output_tokens_details": {"reasoning_tokens": 0},
    "total_tokens": 430,
}


def predicate(name: str, probability: float) -> dict[str, Any]:
    return {"type": "predicate", "name": name, "probability": probability}


def choice(name: str, **probabilities: float) -> dict[str, Any]:
    best = max(probabilities, key=lambda value: probabilities[value])
    return {
        "type": "choice",
        "name": name,
        "choice": best,
        "confidence": probabilities[best],
        "probabilities": [
            {"value": value, "probability": probability}
            for value, probability in probabilities.items()
        ],
    }


def decision(*answers: dict[str, Any]) -> Reply:
    body = {"answers": list(answers), "model": "gpt-6-luna", "usage": USAGE}
    return lambda request: httpx2.Response(
        200, json=body, headers={"x-request-id": "req_synthetic_decision"}
    )


def openai_judge(api: FakeApi) -> OpenAIJudge:
    return OpenAIJudge(AccessToken(OPENAI_KEY), transport=httpx2.MockTransport(api))


CATCH_DECISION = decision(
    predicate("q1", 0.3),
    predicate("q2", 0.8),
    choice("q3", t1=0.95, NONE=0.05),
    predicate("q4", 0.97),
)


def test_openai_judge_sends_decisions_with_fixed_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """OpenAI 판정: 미국 지역 주소 고정, 키는 생성자 인자만, 환경의 주소·키·조직·프로젝트는 쓰지 않는다."""
    monkeypatch.setenv("OPENAI_BASE_URL", "https://collector.example.test/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "env-key-value-must-not-be-used")
    monkeypatch.setenv("OPENAI_ORG_ID", "org-from-env")
    monkeypatch.setenv("OPENAI_PROJECT_ID", "proj-from-env")
    api = FakeApi(CATCH_DECISION)
    request = _catch()
    answers = ask(openai_judge(api), request, Clock())
    assert isinstance(answers, Answers)
    assert answers.probabilities == {"q1": 0.3, "q2": 0.8, "q4": 0.97}
    assert answers.chosen("q3", TITLE_THRESHOLD) == "t1"
    (sent,) = api.requests
    assert str(sent.url) == "https://us.api.openai.com/v1/decisions"
    assert sent.headers["authorization"] == f"Bearer {OPENAI_KEY}"
    assert "openai-organization" not in sent.headers
    assert "openai-project" not in sent.headers
    assert sent.headers["accept-encoding"] == "identity"
    body = api.body()
    assert set(body) == {"model", "input", "questions"}
    assert body["model"] == "gpt-6-luna"
    assert body["input"] == [
        {"role": "developer", "content": CATCH_INSTRUCTIONS},
        {"role": "user", "content": request.data},
    ]
    assert body["questions"][2] == {
        "type": "choice",
        "name": "q3",
        "instructions": request.questions[2].prompt,
        "choices": [{"value": "t1"}, {"value": NONE_OPTION}],
    }


def test_s2_claude_and_openai_get_the_same_question_set() -> None:
    """S2: 공급자가 Claude여도 질문 집합(질문 id·종류·문장·선택지)과 자료가 OpenAI와 같다."""
    request = _catch()
    openai_api = FakeApi(CATCH_DECISION)
    claude_api = FakeApi(claude_message('{"answers":[]}'))
    ask(openai_judge(openai_api), request, Clock())
    ask(claude_judge(claude_api), request, Clock())
    sent_openai = [
        (
            q["name"],
            q["type"],
            q["instructions"],
            [c["value"] for c in q.get("choices", [])],
        )
        for q in openai_api.body()["questions"]
    ]
    user = claude_api.body()["messages"][0]["content"]
    sent_claude = [
        (q["id"], q["type"], q["question"], q.get("options", []))
        for q in json.loads(user.split("\n\n질문:\n")[1])
    ]
    assert sent_openai == sent_claude
    assert openai_api.body()["input"][1]["content"] in user


def test_openai_judge_score_and_refusal() -> None:
    built = material_request(
        [_file("notes.txt"), _file("lock.json")], groups=(), timeout_seconds=20.0
    )
    assert built is not None
    levels = [
        {"label": str(level), "value": level, "probability": p}
        for level, p in zip(range(1, 6), (0.05, 0.05, 0.1, 0.7, 0.1), strict=True)
    ]
    api = FakeApi(
        decision(
            choice("q1", WORK=0.1, RECORD=0.2, GENERATED=0.7),
            {
                "type": "score",
                "name": "q2",
                "score": 3.8,
                "confidence": 0.7,
                "probabilities": levels,
            },
            {"type": "refusal", "name": "q3"},
            # 질문 id가 다른 답은 쓰지 않는다.
            predicate("q9", 0.5),
        )
    )
    answers = ask(openai_judge(api), built.request, Clock())
    assert isinstance(answers, Answers)
    assert answers.most_likely("q1") == "GENERATED"
    assert answers.scores == {"q2": 4}
    assert "q3" not in answers.choices
    assert "q4" not in answers.scores
    sent = api.body()["questions"]
    assert sent[1]["levels"] == [{"label": str(level)} for level in range(1, 6)]


@pytest.mark.parametrize(
    ("reply", "code"),
    [
        (
            lambda request: httpx2.Response(500, json={"error": {}}),
            "JUDGEMENT_CALL_FAILED",
        ),
        (
            lambda request: httpx2.Response(429, json={"error": {}}),
            "JUDGEMENT_CALL_FAILED",
        ),
        (
            lambda request: httpx2.Response(401, json={"error": {}}),
            "JUDGEMENT_CALL_FAILED",
        ),
        (
            lambda request: httpx2.Response(
                307, headers={"location": "https://collector.example.test/v1/decisions"}
            ),
            "JUDGEMENT_CALL_FAILED",
        ),
        (
            lambda request: httpx2.Response(
                200,
                content=b'{"answers": "' + b"x" * (300 * 1024) + b'"}',
                headers={"content-type": "application/json"},
            ),
            "JUDGEMENT_RESPONSE_UNREADABLE",
        ),
        (
            lambda request: httpx2.Response(
                200, content=b"not json", headers={"content-type": "application/json"}
            ),
            "JUDGEMENT_RESPONSE_UNREADABLE",
        ),
        (
            lambda request: httpx2.Response(
                200, json={"answers": {}, "model": "gpt-6-luna", "usage": USAGE}
            ),
            "JUDGEMENT_RESPONSE_UNREADABLE",
        ),
    ],
    ids=["server", "rate-limit", "auth", "redirect", "too-large", "not-json", "shape"],
)
def test_openai_judge_failures_are_not_retried(reply: Reply, code: str) -> None:
    """SDK 다시 시도는 꺼져 있고(429·5xx도 한 번), redirect는 따라가지 않는다(신뢰성 「실패 나누기」)."""
    api = FakeApi(reply)
    assert ask(openai_judge(api), _catch(), Clock()) == code
    assert len(api.requests) == 1


def test_openai_judge_timeout_is_a_timeout() -> None:
    def slow(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("합성 시간 초과", request=request)

    api = FakeApi(slow)
    assert ask(openai_judge(api), _catch(), Clock()) == "JUDGEMENT_TIMEOUT"
    assert len(api.requests) == 1


def test_openai_custom_headers_environment_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "OPENAI_CUSTOM_HEADERS", "Authorization: Bearer env-header-value"
    )
    with pytest.raises(ValueError) as raised:
        OpenAIJudge(AccessToken(OPENAI_KEY))
    assert "env-header-value" not in str(raised.value)


def test_openai_judge_default_transport_ignores_proxy_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for name in ("HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"):
        monkeypatch.setenv(name, "http://proxy.example.test:3128")
    judge = OpenAIJudge(AccessToken(OPENAI_KEY))
    http = judge._client._client
    assert http.trust_env is False
    assert http.follow_redirects is False
    assert http._mounts == {}
    assert judge._client.max_retries == 0
    assert str(judge._client.base_url) == "https://us.api.openai.com/v1/"


def test_openai_judge_logs_carry_no_text(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """SDK DEBUG 로그(`OPENAI_LOG=debug`)를 켜도 키·자료·질문 문장은 로그에 없다."""
    monkeypatch.setenv("OPENAI_LOG", "debug")
    caplog.set_level(logging.DEBUG)
    api = FakeApi(CATCH_DECISION)
    judge = openai_judge(api)
    logging.getLogger("openai").setLevel(logging.DEBUG)
    ask(judge, _catch(), Clock())
    failing = openai_judge(FakeApi(lambda request: httpx2.Response(500, json={})))
    ask(failing, _catch(), Clock())
    joined = "\n".join(record.getMessage() for record in caplog.records)
    assert "provider=openai purpose=CATCH" in joined
    assert "cause=HTTP_ERROR status=500" in joined
    for leak in (OPENAI_KEY, "alpha", "따르지 않는다", "titles"):
        assert leak not in joined


def test_adapter_names_are_fixed_values() -> None:
    assert openai_judge(FakeApi(CATCH_DECISION)).name == "openai"
    assert claude_judge(FakeApi(claude_message("{}"))).name == "claude"
    assert Answers(probabilities={"q1": 0.5}, scores={"q2": 3}).count == 2


def test_openai_connection_failure_is_a_call_failure() -> None:
    def refused(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("합성 연결 실패", request=request)

    api = FakeApi(refused)
    assert ask(openai_judge(api), _catch(), Clock()) == "JUDGEMENT_CALL_FAILED"
    assert len(api.requests) == 1


def test_openai_unexpected_errors_are_not_hidden() -> None:
    """상한 초과가 아닌 예상하지 못한 예외는 결과로 바꾸지 않고 그대로 올린다(결함)."""

    class Broken(httpx2.SyncByteStream):
        def __iter__(self):  # type: ignore[no-untyped-def]
            raise RuntimeError("합성 결함")
            yield b""

    api = FakeApi(lambda request: httpx2.Response(200, stream=Broken()))
    with pytest.raises(RuntimeError):
        ask(openai_judge(api), _catch(), Clock())


def test_openai_answers_are_matched_by_name_not_position() -> None:
    """답 하나가 빠지거나 순서가 바뀌어도 이름으로 질문을 찾는다. 이름이 없는 답만 같은 자리의 질문이다(PR #500 리뷰)."""
    built = catch_request(
        LINES,
        record="Fix login",
        ask_whole=False,
        titles=[TITLE],
        sentences=[SENTENCE, Written("s2", "alpha를 바꿨습니다.", ("c1f1:L3",))],
        timeout_seconds=20.0,
    )
    assert built is not None
    ids = [question.id for question in built.request.questions]
    assert ids == ["q1", "q2", "q3", "q4"]
    # q2(TITLE_CHOICE) 답이 빠지고 q4가 q3보다 먼저 온다. 이름 없는 답은 자리(index 2 → q3)로 본다.
    api = FakeApi(
        decision(
            predicate("q1", 0.4),
            predicate("q4", 0.95),
            {"type": "predicate", "probability": 0.2},
        )
    )
    answers = ask(openai_judge(api), built.request, Clock())
    assert isinstance(answers, Answers)
    assert answers.probabilities == {"q1": 0.4, "q4": 0.95, "q3": 0.2}
    assert "q2" not in answers.choices


def test_openai_answers_that_do_not_fit_their_question_are_dropped(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """질문 꼴과 다른 답·선택지에 없는 값·단계 이름이 아닌 점수·남는 답은 버리고, 모양이 틀린 사용량·요청 ID는
    로그에 원문 대신 없음·INVALID로 적는다."""
    built = material_request(
        [_file("notes.txt"), _file("lock.json")], groups=("src",), timeout_seconds=20.0
    )
    assert built is not None
    kinds = [question.kind for question in built.request.questions]
    assert kinds == [
        "MATERIAL_KIND",
        "MATERIAL_GROUP",
        "MATERIAL_SCORE",
        "MATERIAL_KIND",
        "MATERIAL_GROUP",
        "MATERIAL_SCORE",
    ]
    body = {
        "answers": [
            predicate("q1", 0.5),  # 고르기 질문에 참일 확률
            {
                "type": "choice",
                "name": "q2",
                "choice": "x",
                "confidence": 1.0,
                "probabilities": [{"value": "x", "probability": 1.0}],
            },
            choice("q3", WORK=1.0),  # 점수 질문에 고르기
            {
                "type": "choice",
                "name": "q4",
                "choice": "WORK",
                "confidence": 1.0,
                "probabilities": "not-a-list",
            },
            {
                "type": "choice",
                "name": "q5",
                "choice": "src",
                "confidence": 1.0,
                "probabilities": [
                    {"value": "src", "probability": 0.5},
                    {"value": "COMMON", "probability": 0.5},
                ],
            },
            {
                "type": "score",
                "name": "q6",
                "score": 2.0,
                "confidence": 0.5,
                "probabilities": [{"label": "high", "value": 9, "probability": 1.0}],
            },
            predicate("q7", 0.5),  # 질문보다 많은 답
        ],
        "model": "gpt-6-luna\nINJECT",
        "usage": {**USAGE, "input_tokens": 1.5},
    }
    caplog.set_level(logging.INFO)
    api = FakeApi(lambda request: httpx2.Response(200, json=body))
    answers = ask(openai_judge(api), built.request, Clock())
    assert isinstance(answers, Answers)
    assert answers.count == 1
    assert answers.choices["q5"] == {"src": 0.5, COMMON_GROUP: 0.5}
    assert "model=INVALID" in caplog.text and "inputTokens=None" in caplog.text
    assert "INJECT" not in caplog.text


def test_openai_score_without_levels_or_with_a_tie_is_dropped() -> None:
    built = material_request(
        [
            _file("a.py", kind=False, group=False),
            _file("b.py", kind=False, group=False),
        ],
        groups=(),
        timeout_seconds=20.0,
    )
    assert built is not None
    tie = [
        {"label": "2", "value": 2, "probability": 0.5},
        {"label": "4", "value": 4, "probability": 0.5},
    ]
    api = FakeApi(
        decision(
            {
                "type": "score",
                "name": "q1",
                "score": 3.0,
                "confidence": 0.5,
                "probabilities": "x",
            },
            {
                "type": "score",
                "name": "q2",
                "score": 3.0,
                "confidence": 0.5,
                "probabilities": tie,
            },
        )
    )
    answers = ask(openai_judge(api), built.request, Clock())
    assert isinstance(answers, Answers)
    assert answers.scores == {}


def test_material_request_asks_a_path_once() -> None:
    built = material_request(
        [_file("notes.txt"), _file("notes.txt")], groups=(), timeout_seconds=20.0
    )
    assert built is not None
    assert list(built.asked) == ["notes.txt"]
    assert len(json.loads(built.request.data)["files"]) == 1


def test_default_synthetic_answers() -> None:
    group = Question("q1", "MATERIAL_GROUP", "a", "?", ("a", COMMON_GROUP))
    score = Question("q2", "MATERIAL_SCORE", "a", "?")
    kind = Question("q3", "MATERIAL_KIND", "a", "?", ("WORK", "RECORD", "GENERATED"))
    assert default_answer(group) is None
    assert default_answer(score) == 3
    assert default_answer(kind) == [1.0, 0.0, 0.0]
