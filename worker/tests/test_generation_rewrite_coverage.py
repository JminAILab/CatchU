"""제목 형식 고쳐 쓰기·근거 한계(coverageLimits)·가리기를 생성 흐름(#120) 끝까지 합성 제공자로 확인한다.

기대값은 #120 본문의 「호출 한도와 제목 고쳐 쓰기」·「자료 보호와 coverageLimits」와 완료 기준 23~27·32~39,
2026-10-12 결정 5·6·7·13·15·16과 결정에서 따라 나온 처리, 착수 계획의 「상태·실패 변환」·「coverageLimits
처리」·「첫 범위의 검사」에서 정했다. 이슈가 구현에 맡긴 값만 이번 구현이 고른 값을 기대값으로 따로 적는다:
근거 한계 문구 세 가지와 붙는 차례(크기 → 잘림), 고쳐 쓰기 입력 20줄(첫 호출에서 보낸 고를 수 있는 줄의
앞에서부터)과 시간 제한 20초, 고쳐 쓰기 응답의 최상위 키는 title 하나, 실패 코드 이름과 회원용 문구,
운영 로그의 건수 이름, 가림 자리표시 `[MASKED]`와 `"selectable": false`, 자료의 줄 id 꼴(`c1f1:L5`).
생성 코드를 읽어 기대값을 맞추지 않았다.

후보는 열린 PR마다 본인 커밋을 둔 합성 저장소로 만든다. PR마다 고친 파일 이름이 달라 제공자가 받은
자료의 경로로 어느 후보의 호출인지 안다. 가짜 비밀값·개인정보는 실행 중에 조각을 이어 붙여 만든다.
모든 시험은 네트워크를 막은 채 돈다.
"""

import json
import logging
import re
import socket
from collections.abc import Callable
from dataclasses import replace
from datetime import timedelta
from pathlib import PurePosixPath
from typing import Any

import pytest
from candidate_scenarios import (
    FINISHED_AT,
    ROOT,
    CaseRun,
    Commit,
    Pull,
    Scenario,
    candidate,
    change,
    commit,
    commit_url,
    live_request,
    merge_commit,
    merge_identity,
    named,
    pull_identity,
    pull_url,
    root_commit,
    run_case,
)
from generation_scenarios import (
    SIZE_FULL,
    SIZE_PARTIAL,
    TRUNCATED,
    GenerationCase,
    Late,
    Reply,
    ScriptedProvider,
    SentLine,
    answer,
    assert_generated_text,
    assert_nowhere,
    assert_preserved,
    code_title,
    file_fragment,
    file_id_of,
    file_question,
    file_title,
    generation_case,
    identifiers,
    line_fragment,
    line_question,
    naive,
    pick,
    sent_files,
    sent_lines,
)
from github_synthetic import (
    MEMBER,
    FakeClock,
    detail_path,
    diff_text,
    sha,
    status_only,
)

from app.contract import Verdict, check_message
from app.generation import (
    PROPOSED_GENERATION_LIMITS,
    GenerationLimits,
    ProviderError,
    ProviderRequest,
    run_generation,
)
from app.processing import EligibleCandidate, GenerationOutput, compose_result
from app.processing.generation import EvidenceItem


@pytest.fixture
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*args: object, **kwargs: object) -> None:
        raise AssertionError("외부 연결 시도")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)


pytestmark = pytest.mark.usefixtures("no_network")

# 구현이 고른 값(제안값): 고쳐 쓰기 시간 제한 20초, 고쳐 쓰기 입력 20줄, 응답 4,000 B.
REWRITE_TIMEOUT_SECONDS = 20.0
REWRITE_MAX_LINES = 20
MAX_OUTPUT_BYTES = 4_000
# 구현이 고른 실패 코드와 회원용 문구.
UNVERIFIED = "GENERATION_UNVERIFIED"
BUDGET_EXHAUSTED = "GENERATION_BUDGET_EXHAUSTED"
UNVERIFIED_DRAFT = (
    "생성 결과를 변경 내용과 대조해 확인하지 못해 설명 초안을 만들지 못했다"
)
UNVERIFIED_REFLECTION = (
    "생성 결과를 변경 내용과 대조해 확인하지 못해 생각해볼 질문을 만들지 못했다"
)
BUDGET_MESSAGE = (
    "생성 횟수·시간 한도에 걸려 일부 후보의 설명 초안과 생각해볼 질문을 만들지 못했다"
)
MASK = "[MASKED]"
FLOW_LOGGER = "app.generation.flow"

# 이 이름을 대상으로 고른 제목 「registerLoginRateLimitForEveryRegion 코드 수정」은 42자라 40자 형식을 어긴다.
LONG = "registerLoginRateLimitForEveryRegion"
F = named("f")


def _join(*parts: str) -> str:
    """가짜 값을 실행 중에 이어 붙인다(소스에 통째로 두지 않는다)."""
    return "".join(parts)


# 가짜 값. 모두 실제 계정·사람과 무관하다.
TOKEN = _join("gh", "p_", "Synthetic", "Leak", "0" * 26)
EMAIL = _join("hong.gildong", "@", "example.com")
ENV_VALUE = _join("plain", "Env", "Value9")
PEM_BODY = _join("MIIB", "Synthetic", "CertBody")
SECRET_PATHS = (".env", "certs/server.pem", "server.pem")


# 합성 후보


def own(number: int, minute: int, *files: dict[str, Any], parent: str = ROOT) -> Commit:
    """본인(연동 계정) 커밋 하나."""
    return commit(sha(number), MEMBER, parents=(parent,), minute=minute, files=files)


def opened(number: int, *commits: Commit) -> Pull:
    return Pull(number, MEMBER, commits, state="open", created=number - 1)


def pulls(*items: Pull) -> Scenario:
    """기본 브랜치에는 뿌리 커밋만 있고, 열린 PR마다 후보가 하나씩 나온다."""
    return Scenario(default_branch=(root_commit(),), pulls=items)


def short(label: str) -> dict[str, Any]:
    """`app/{label}.py`의 한 줄을 고친 파일."""
    return change(f"app/{label}.py", patch=f"@@ -1 +1 @@\n-{label} = 1\n+{label} = 2")


def wordy(label: str) -> dict[str, Any]:
    """`app/{label}.py`: LONG이 든 줄을 바꾸고(삭제·추가), label이 든 줄을 더하고, 문맥 줄 하나를 둔다.

    줄 순서는 머리글 L1, `-LONG` L2, `+LONG` L3, `+label` L4, 문맥 줄 L5다. LONG을 고른 제목은 40자를
    넘고, label을 고른 제목은 「{label} 코드 추가」다.
    """
    return change(
        f"app/{label}.py",
        patch=(
            f"@@ -1,2 +1,3 @@\n-{LONG} = 1\n+{LONG} = 2\n+{label} = 3\n unchanged = 0"
        ),
    )


def filler(label: str, count: int = 10, width: int = 60) -> dict[str, Any]:
    """새 파일 `app/{label}.py`: 길이가 같은 추가 줄 count개(줄마다 `{label}NN` 이름이 든다)."""
    body = "\n".join(f"+{label}{index:02d} = '{'x' * width}'" for index in range(count))
    return change(
        f"app/{label}.py", patch=f"@@ -0,0 +1,{count} @@\n{body}", status="added"
    )


def huge(label: str) -> dict[str, Any]:
    """줄 하나가 1,500자인 새 파일. 작은 자료 상한(1,000 B)에서는 그 줄 혼자 상한을 넘는다(가리기가 통째로
    가리는 2,000자보다는 짧다)."""
    return change(
        f"app/{label}.py",
        patch=f"@@ -0,0 +1 @@\n+{label} = '{'x' * 1_500}'",
        status="added",
    )


def cut(label: str) -> dict[str, Any]:
    """받은 patch가 온전하지 않은 파일: 추가 수가 patch의 '+' 줄 수와 맞지 않는다."""
    return change(
        f"app/{label}.py",
        patch=f"@@ -1 +1 @@\n-{label} = 1\n+{label} = 2",
        additions=3,
    )


def misheaded(label: str) -> dict[str, Any]:
    """hunk 머리글의 줄 수(3줄)와 실제 내용 줄 수(1줄)가 맞지 않는 파일. 추가·삭제 수는 patch와 같다."""
    return change(
        f"app/{label}.py", patch=f"@@ -1,3 +1,3 @@\n-{label} = 1\n+{label} = 2"
    )


def unencodable(label: str) -> dict[str, Any]:
    """UTF-8로 인코딩할 수 없는(짝 없는 대리 문자가 든) patch."""
    return change(
        f"app/{label}.py", patch=f"@@ -1 +1 @@\n-{label} = 1\n+{label} = '\ud800'"
    )


TRUNCATIONS = [
    pytest.param(cut, id="line-count"),
    pytest.param(misheaded, id="hunk-header"),
    pytest.param(unencodable, id="encoding"),
]


def with_safe_diff(target: Commit) -> Commit:
    """같은 변경 비교용 diff 응답만 인코딩할 수 있는 글자로 둔 커밋(상세 응답의 patch는 그대로)."""
    assert target.detail is not None
    files = [
        {**entry, "patch": entry["patch"].encode("utf-8", "replace").decode("utf-8")}
        if "patch" in entry
        else entry
        for entry in target.detail["files"]
    ]
    return replace(target, diff=diff_text(files))


def settings() -> dict[str, Any]:
    """비밀값 줄과 이메일 줄이 든 설정 코드. 줄 순서: L2 `-limit`, L3 `+limit`, L4 토큰, L5 이메일, L6 문맥."""
    return change(
        "app/settings.py",
        patch=(
            "@@ -1,2 +1,4 @@\n"
            "-limit = 1\n"
            "+limit = 2\n"
            f'+api_token = "{TOKEN}"\n'
            f'+owner = "{EMAIL}"\n'
            " unchanged = 0"
        ),
    )


def env_file() -> dict[str, Any]:
    return change(
        ".env", patch=f"@@ -0,0 +1 @@\n+GITHUB_TOKEN={ENV_VALUE}", status="added"
    )


def pem_file() -> dict[str, Any]:
    return change(
        "certs/server.pem", patch=f"@@ -0,0 +1 @@\n+{PEM_BODY}", status="added"
    )


def keys_only() -> dict[str, Any]:
    """바뀐 줄마다 가릴 값이 든 새 파일. 가리고 나면 고를 수 있는 줄이 없다."""
    return change(
        "app/keys.py",
        patch=f'@@ -0,0 +1,2 @@\n+api_token = "{TOKEN}"\n+owner = "{EMAIL}"',
        status="added",
    )


def with_collection_failure(*files: dict[str, Any]) -> Scenario:
    """PR #3(본인 커밋 하나)은 후보이고, 기본 브랜치의 본인 커밋 ffff는 변경 내용 조회가 429라 수집 실패가 남는다."""
    mine = own(31, 3, *files)
    direct = commit(F, MEMBER, parents=(ROOT,), minute=4, files=[change("app/list.py")])
    return Scenario(
        default_branch=(direct, root_commit()),
        pulls=(opened(3, mine),),
        lookups={direct.sha: ()},
        overrides={detail_path(F): status_only(429)},
    )


# PR #3(3분)·#4(9분)·#5(6분): 생성 순서는 최근 본인 커밋부터 #4 → #5 → #3이다(결정 14).
REWRITE_THREE = pulls(
    opened(3, own(31, 3, wordy("alpha"))),
    opened(4, own(32, 9, wordy("beta"))),
    opened(5, own(33, 6, wordy("gamma"))),
)
GENERATION_ORDER = ["app/beta.py", "app/gamma.py", "app/alpha.py"]
# 제목 확인이 실패하는 대상을 고를 수 있게 분류할 수 없는 파일과 대응하지 않는 상태의 파일을 함께 둔다.
CHECKED = pulls(
    opened(
        3,
        own(
            31,
            3,
            wordy("alpha"),
            change("assets/palette.dat", patch="@@ -1 +1 @@\n-pal = 1\n+pal = 2"),
            change(
                "app/copied.py",
                status="copied",
                patch="@@ -1 +1 @@\n-cp = 1\n+cp = 2",
            ),
        ),
    )
)


# 합성 응답


OMIT: Any = object()


def long_line(request: ProviderRequest) -> SentLine:
    return pick(request, change="added", contains=LONG)


def label_of(request: ProviderRequest) -> str:
    """보낸 자료에서 LONG이 든 파일(`app/{label}.py`)의 label."""
    return PurePosixPath(pick(request, contains=LONG).path).stem


def label_line(request: ProviderRequest) -> SentLine:
    return pick(request, change="added", contains=label_of(request))


def with_title(
    title: Callable[[ProviderRequest], Any],
) -> Callable[[ProviderRequest], str]:
    """생성 응답: 조각·질문은 LONG 추가 줄로 확인되고, 제목 칸은 title이 정한다(OMIT이면 칸이 없다)."""

    def reply(request: ProviderRequest) -> str:
        assert request.purpose == "GENERATE"
        line = long_line(request)
        value: dict[str, Any] = {
            "fragments": [line_fragment(line, LONG)],
            "questions": [line_question("BACKGROUND", line, LONG)],
        }
        chosen = title(request)
        if chosen is not OMIT:
            value["title"] = chosen
        return json.dumps(value, ensure_ascii=False)

    return reply


# 생성 응답의 제목이 LONG(40자 초과)이라 형식을 어긴다.
long_title = with_title(lambda request: code_title(long_line(request), LONG))


def short_title(request: ProviderRequest) -> str:
    """고쳐 쓰기 응답: label이 든 추가 줄을 골라 「{label} 코드 추가」가 된다."""
    assert request.purpose == "REWRITE_TITLE"
    return answer(title=code_title(label_line(request), label_of(request)))


def long_then_short(request: ProviderRequest) -> str:
    if request.purpose == "GENERATE":
        return long_title(request)
    return short_title(request)


# 고쳐 쓰기 응답의 형식 위반(다시 고쳐 쓸 대상).
def no_title(request: ProviderRequest) -> str:
    return answer()


def null_title(request: ProviderRequest) -> str:
    return answer(title=None)


def nameless_title(request: ProviderRequest) -> str:
    return answer(title={"target": "CODE_NAME", "line": label_line(request).id})


def spaced_name(request: ProviderRequest) -> str:
    return answer(title=code_title(label_line(request), f"{label_of(request)} value"))


def long_again(request: ProviderRequest) -> str:
    return answer(title=code_title(long_line(request), LONG))


def extra_top_key(request: ProviderRequest) -> str:
    """제목은 맞지만 최상위에 title 말고 다른 키가 있다(구현이 고른 고쳐 쓰기 응답 모양 위반)."""
    line = label_line(request)
    label = label_of(request)
    return answer(
        title=code_title(line, label),
        questions=[line_question("BACKGROUND", line, label)],
    )


# 결과·로그 읽기


def generated(case: GenerationCase, number: int) -> EligibleCandidate:
    found = [
        each
        for each in case.output.candidates
        if each.work_identity == pull_identity(number)
    ]
    assert len(found) == 1
    return found[0]


def entry(case: GenerationCase, number: int) -> dict[str, Any]:
    return candidate(case.result, pull_identity(number))


def added_limits(case: GenerationCase, number: int) -> dict[str, tuple[str, ...]]:
    """PR #number 후보의 근거마다 생성이 한계 목록 끝에 더한 문구."""
    (old,) = [
        each
        for each in case.before.output.candidates
        if each.work_identity == pull_identity(number)
    ]
    new = generated(case, number)
    return {
        after.source_url: after.coverage_limits[len(before.coverage_limits) :]
        for before, after in zip(old.evidence, new.evidence, strict=True)
    }


def new_failures(case: GenerationCase) -> list[dict[str, Any]]:
    """생성 전 결과의 실패를 모두 그대로 둔 채 새로 생긴 실패."""
    left = list(case.before.result["failures"])
    added: list[dict[str, Any]] = []
    for failure in case.result["failures"]:
        if failure in left:
            left.remove(failure)
        else:
            added.append(failure)
    assert left == [], "생성 전 실패가 사라졌다"
    return added


def paths(request: ProviderRequest) -> set[str]:
    return {file["path"] for file in sent_files(request).values()}


def purposes(provider: ScriptedProvider) -> list[str]:
    return [each.purpose for each in provider.requests]


_PAIR = re.compile(r"(\w+)=(\S+)")


def flow_counts(caplog: pytest.LogCaptureFixture) -> dict[str, int]:
    """생성 흐름의 운영 로그 한 줄(「생성 종료: …」)에서 건수만 읽는다."""
    lines = [
        record.getMessage() for record in caplog.records if record.name == FLOW_LOGGER
    ]
    assert len(lines) == 1, lines
    assert lines[0].startswith("생성 종료:")
    return {
        key: int(value)
        for key, value in _PAIR.findall(lines[0])
        if key not in ("requestId", "attemptId") and not key.endswith("Reasons")
    }


def flow_reasons(caplog: pytest.LogCaptureFixture) -> dict[str, str]:
    """같은 로그 줄의 원인별 건수 칸 글자 그대로: 실패 원인(`wholeReasons`·`draftReasons`·`reflectionReasons`)과
    버리거나 고친 항목(`draftDropReasons`·`reflectionDropReasons`)."""
    (line,) = [
        record.getMessage() for record in caplog.records if record.name == FLOW_LOGGER
    ]
    return {key: value for key, value in _PAIR.findall(line) if key.endswith("Reasons")}


def log_lines(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [record.getMessage() for record in caplog.records]


def generate_on(
    built: GenerationOutput,
    before: CaseRun,
    provider: ScriptedProvider,
    *,
    limits: GenerationLimits = PROPOSED_GENERATION_LIMITS,
) -> tuple[GenerationOutput, dict[str, Any]]:
    """후보 판정 결과(built)를 직접 정해 생성을 붙인다(generation_case와 같은 결과 검사)."""
    clock = FakeClock()
    run = run_generation(
        before.request,
        before.outcome,
        built,
        provider=provider,
        clock=clock,
        deadline=clock() + timedelta(minutes=20),
        limits=limits,
    )
    result = compose_result(
        before.request, run.output, finished_at=FINISHED_AT, id_label="case"
    )
    checked = check_message("Result", result)
    assert checked.verdict is Verdict.VALID, checked.errors
    assert_preserved(built, run.output)
    assert_generated_text(run.output)
    return run.output, result


# 제목 형식 고쳐 쓰기: 시점(23)


def test_long_name_title_breaks_the_forty_character_rule() -> None:
    """시험 자료 확인: LONG을 대상으로 한 코드 이름 제목은 공백 포함 40자 제안값을 넘는다(결정 문서 「Catch 제목」)."""
    assert len(f"{LONG} 코드 수정") > 40
    assert len(f"{LONG} 코드 추가") > 40
    assert len(LONG) <= 64


def test_rewrite_runs_only_after_every_generation_call() -> None:
    """모든 후보의 생성 호출이 끝난 뒤에만 제목 고쳐 쓰기를 부른다(23, 결정 15). 고쳐 쓰기는 생성 순서대로다."""
    provider = ScriptedProvider(long_then_short)

    case = generation_case(REWRITE_THREE, provider)

    assert purposes(provider) == ["GENERATE"] * 3 + ["REWRITE_TITLE"] * 3
    assert [min(paths(each)) for each in provider.generate_requests()] == (
        GENERATION_ORDER
    )
    assert [min(paths(each)) for each in provider.rewrite_requests()] == (
        GENERATION_ORDER
    )
    for number, label in ((3, "alpha"), (4, "beta"), (5, "gamma")):
        found = generated(case, number)
        assert found.title == f"{label} 코드 추가"
        assert found.draft.status == "GENERATED"
        assert entry(case, number)["title"] == f"{label} 코드 추가"
    assert case.result["failures"] == []


def test_rewrite_does_not_take_the_time_of_a_later_generation_call() -> None:
    """고쳐 쓰기가 남은 시간을 써도 생성하지 못한 후보가 생기지 않는다(23·25, 결정 15).

    마감 95초, 생성 호출 10초·고쳐 쓰기 19초(고쳐 쓰기 시간 제한 20초 안). 생성 세 번을 먼저 끝내면(30초)
    고쳐 쓰기 세 번이 남은 시간에 들어간다(87초). 후보마다 생성 뒤 바로 고쳐 쓰면 세 번째 생성 때(58초)
    남은 시간이 생성 시간 제한 45초보다 적어 그 후보를 생성하지 못한다.
    """
    clock = FakeClock()
    provider = ScriptedProvider(
        *[Late(long_title, 10) for _ in range(3)],
        *[Late(short_title, 19) for _ in range(3)],
        clock=clock,
        repeat=False,
    )

    case = generation_case(
        REWRITE_THREE, provider, clock=clock, deadline=timedelta(seconds=95)
    )

    assert purposes(provider) == ["GENERATE"] * 3 + ["REWRITE_TITLE"] * 3
    for number, label in ((3, "alpha"), (4, "beta"), (5, "gamma")):
        assert generated(case, number).draft.status == "GENERATED"
        assert generated(case, number).title == f"{label} 코드 추가"
    assert case.result["failures"] == []
    assert case.result["outcome"] == "SUCCEEDED"


def test_rewrite_calls_are_counted_apart_from_generation_calls(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """생성 호출 상한을 다 쓴 뒤에도 고쳐 쓰기는 따로 센 상한 안에서 한다(23·25). 한도 실패도 생기지 않는다."""
    caplog.set_level(logging.DEBUG)
    provider = ScriptedProvider(long_then_short)

    case = generation_case(
        REWRITE_THREE, provider, limits=GenerationLimits(max_generation_calls=3)
    )

    assert purposes(provider) == ["GENERATE"] * 3 + ["REWRITE_TITLE"] * 3
    for number in (3, 4, 5):
        assert generated(case, number).draft.status == "GENERATED"
        assert generated(case, number).title is not None
    assert case.result["failures"] == []
    counts = flow_counts(caplog)
    assert counts["generationCalls"] == 3
    assert counts["rewriteCalls"] == 3
    assert counts["budgetSkipped"] == 0


# 형식 위반만 고쳐 쓴다(24)


GENERATION_FORMAT_VIOLATIONS = [
    pytest.param(lambda request: OMIT, id="missing"),
    pytest.param(lambda request: None, id="null"),
    pytest.param(lambda request: "alpha", id="not-an-object"),
    pytest.param(
        lambda request: {"target": "CODE_NAME", "line": label_line(request).id},
        id="no-name",
    ),
    pytest.param(
        lambda request: {
            "target": "FUNCTION",
            "line": label_line(request).id,
            "name": "alpha",
        },
        id="unknown-target",
    ),
    pytest.param(
        lambda request: {**code_title(label_line(request), "alpha"), "why": "x"},
        id="unknown-key",
    ),
    pytest.param(
        lambda request: code_title(label_line(request), "alpha value"),
        id="name-shape",
    ),
    pytest.param(lambda request: code_title(long_line(request), LONG), id="over-forty"),
]


@pytest.mark.parametrize("title", GENERATION_FORMAT_VIOLATIONS)
def test_format_violation_in_the_generated_title_is_rewritten(
    title: Callable[[ProviderRequest], Any],
) -> None:
    """title 칸 누락·모양 위반·이름 모양 위반·40자 초과는 형식 위반이라 한 번 고쳐 써 제목을 얻는다(24)."""
    provider = ScriptedProvider(with_title(title), short_title, repeat=False)

    case = generation_case(CHECKED, provider)

    assert purposes(provider) == ["GENERATE", "REWRITE_TITLE"]
    found = generated(case, 3)
    assert found.title == "alpha 코드 추가"
    assert found.draft.status == "GENERATED"
    assert found.reflection.status == "GENERATED"
    assert new_failures(case) == []


TITLE_CHECK_FAILURES = [
    # 문맥 줄은 보내지 않는다(wordy의 L5).
    pytest.param(lambda request: code_title("c1f1:L5", "unchanged"), id="context-line"),
    pytest.param(lambda request: code_title("c9f9:L1", "alpha"), id="unsent-line"),
    pytest.param(
        lambda request: code_title(label_line(request), "beta"), id="name-not-on-line"
    ),
    pytest.param(
        lambda request: code_title(long_line(request), "Rate"),
        id="name-inside-identifier",
    ),
    pytest.param(
        lambda request: file_title(file_id_of(request, "assets/palette.dat")),
        id="unclassified-file",
    ),
    pytest.param(
        lambda request: file_title(file_id_of(request, "app/copied.py")),
        id="unsupported-status",
    ),
]


@pytest.mark.parametrize("title", TITLE_CHECK_FAILURES)
def test_title_check_failure_is_not_rewritten(
    title: Callable[[ProviderRequest], Any], caplog: pytest.LogCaptureFixture
) -> None:
    """지목을 확인하지 못했거나 종류·동작을 정할 수 없는 제목은 고쳐 쓰지 않고 null이다(24·26·27)."""
    caplog.set_level(logging.DEBUG)
    provider = ScriptedProvider(with_title(title), short_title, repeat=False)

    case = generation_case(CHECKED, provider)

    assert purposes(provider) == ["GENERATE"]
    found = generated(case, 3)
    assert found.title is None
    assert found.draft.status == "GENERATED"
    assert found.reflection.status == "GENERATED"
    assert new_failures(case) == []
    assert case.result["outcome"] == case.before.result["outcome"]
    # 제목 null은 결과 조합의 임시 대체값(작업 사실 첫 항목)으로 나간다(결정 문서 「담당과 순서」 ③).
    assert entry(case, 3)["title"] == found.work_facts[0]
    assert flow_counts(caplog)["titleOnlyNull"] == 1


# 최대 3회와 재확인(24)


@pytest.mark.parametrize(
    "before_success",
    [
        pytest.param((), id="first-try"),
        pytest.param((no_title,), id="second-try"),
        pytest.param((long_again, spaced_name), id="third-try"),
    ],
)
def test_rewrite_succeeds_on_the_first_second_or_third_try(
    before_success: tuple[Reply, ...], caplog: pytest.LogCaptureFixture
) -> None:
    """형식을 어긴 고쳐 쓰기 응답은 제목당 3회까지 다시 고쳐 쓴다(24). 확인을 통과한 제목을 쓴다."""
    caplog.set_level(logging.DEBUG)
    provider = ScriptedProvider(long_title, *before_success, short_title, repeat=False)

    case = generation_case(CHECKED, provider)

    assert purposes(provider) == ["GENERATE"] + ["REWRITE_TITLE"] * (
        len(before_success) + 1
    )
    assert generated(case, 3).title == "alpha 코드 추가"
    assert new_failures(case) == []
    counts = flow_counts(caplog)
    assert counts["rewriteCalls"] == len(before_success) + 1
    assert counts["titlesRewritten"] == 1
    assert counts["titleOnlyNull"] == 0


@pytest.mark.parametrize(
    "violations",
    [
        pytest.param((null_title, nameless_title, extra_top_key), id="shape"),
        pytest.param((long_again, long_again, long_again), id="over-forty"),
        pytest.param((no_title, spaced_name, long_again), id="mixed"),
    ],
)
def test_title_is_null_after_three_failed_rewrites(
    violations: tuple[Reply, ...], caplog: pytest.LogCaptureFixture
) -> None:
    """세 번 고쳐 써도 형식을 어기면 네 번째를 부르지 않고 제목은 null이다(24·26·27)."""
    caplog.set_level(logging.DEBUG)
    # 네 번째 응답(맞는 제목)은 쓰이면 안 된다.
    provider = ScriptedProvider(long_title, *violations, short_title, repeat=False)

    case = generation_case(CHECKED, provider)

    assert purposes(provider) == ["GENERATE"] + ["REWRITE_TITLE"] * 3
    found = generated(case, 3)
    assert found.title is None
    assert found.draft.status == "GENERATED"
    assert found.reflection.status == "GENERATED"
    assert new_failures(case) == []
    assert case.result["outcome"] == "SUCCEEDED"
    counts = flow_counts(caplog)
    assert counts["rewriteCalls"] == 3
    assert counts["titlesRewritten"] == 0
    assert counts["titleOnlyNull"] == 1


REWRITE_CHECK_FAILURES = [
    pytest.param(lambda request: code_title("c1f1:L5", "unchanged"), id="context-line"),
    pytest.param(lambda request: code_title("c9f9:L1", "alpha"), id="unsent-line"),
    pytest.param(
        lambda request: code_title(label_line(request), "beta"), id="name-not-on-line"
    ),
    pytest.param(
        lambda request: code_title(long_line(request), "Rate"),
        id="name-inside-identifier",
    ),
    pytest.param(
        lambda request: file_title(file_id_of(request, "assets/palette.dat")),
        id="unclassified-file",
    ),
    pytest.param(
        lambda request: file_title(file_id_of(request, "app/copied.py")),
        id="unsupported-status",
    ),
]


@pytest.mark.parametrize("title", REWRITE_CHECK_FAILURES)
def test_rewritten_title_must_pass_the_check_again(
    title: Callable[[ProviderRequest], Any],
) -> None:
    """고쳐 쓴 제목도 근거 확인을 다시 통과해야 쓴다. 확인 실패면 다시 부르지 않고 null이다(24·28)."""
    provider = ScriptedProvider(
        long_title,
        lambda request: answer(title=title(request)),
        short_title,
        repeat=False,
    )

    case = generation_case(CHECKED, provider)

    assert purposes(provider) == ["GENERATE", "REWRITE_TITLE"]
    found = generated(case, 3)
    assert found.title is None
    assert found.draft.status == "GENERATED"
    assert new_failures(case) == []


def crowded() -> dict[str, Any]:
    """고를 수 있는 줄이 20줄보다 많은 파일. L2 `-LONG`, L3 `+LONG`, L4 가린 토큰 줄, L5~L28 `vNN` 줄."""
    added = [
        f"+{LONG} = 2",
        f'+api_token = "{TOKEN}"',
        *(f"+v{index:02d} = 0" for index in range(24)),
    ]
    return change(
        "app/crowded.py",
        patch="@@ -1 +1,26 @@\n" + f"-{LONG} = 1\n" + "\n".join(added),
    )


CROWDED = pulls(opened(3, own(31, 3, crowded())))


def test_rewrite_input_is_at_most_twenty_selectable_lines_from_the_first_call() -> None:
    """고쳐 쓰기에는 첫 호출에서 보낸 지목 가능한 줄 가운데 최대 20줄만 보내고, 크기 한계 문구는 생기지 않는다(24·37)."""
    provider = ScriptedProvider(
        long_title,
        lambda request: answer(title=code_title(pick(request, contains="v05"), "v05")),
        repeat=False,
    )

    case = generation_case(CROWDED, provider)

    first, rewrite = provider.requests
    assert first.purpose == "GENERATE"
    assert rewrite.purpose == "REWRITE_TITLE"
    selectable = [line for line in sent_lines(first) if line.selectable]
    assert len(selectable) > REWRITE_MAX_LINES
    sent = sent_lines(rewrite)
    # 구현이 고른 값: 첫 호출에서 보낸 고를 수 있는 줄의 앞에서부터 20줄.
    assert [line.id for line in sent] == [
        line.id for line in selectable[:REWRITE_MAX_LINES]
    ]
    assert all(line.selectable for line in sent)
    assert MASK not in rewrite.data
    assert TOKEN not in rewrite.data
    assert set(sent_files(rewrite)) <= set(sent_files(first))
    assert set(json.loads(rewrite.data)) == {"files", "lines"}
    assert rewrite.instructions != first.instructions
    assert rewrite.timeout_seconds == REWRITE_TIMEOUT_SECONDS
    assert rewrite.max_output_bytes == MAX_OUTPUT_BYTES
    assert generated(case, 3).title == "v05 코드 추가"
    # 고쳐 쓰기 때 적게 보낸 줄은 크기 제외로 세지 않는다(결정 5·13).
    assert all(added == () for added in added_limits(case, 3).values())


def test_rewrite_pointing_at_a_line_left_out_of_the_rewrite_input_is_null() -> None:
    """첫 호출에는 보냈지만 고쳐 쓰기에 보내지 않은 줄을 지목한 고쳐 쓰기 응답은 확인 실패라 null이다(24)."""
    seen: list[ProviderRequest] = []

    def reply(request: ProviderRequest) -> str:
        seen.append(request)
        if request.purpose == "GENERATE":
            return long_title(request)
        line = pick(seen[0], contains="v23")
        assert line.id not in {each.id for each in sent_lines(request)}
        return answer(title=code_title(line, "v23"))

    provider = ScriptedProvider(reply)

    case = generation_case(CROWDED, provider)

    assert purposes(provider) == ["GENERATE", "REWRITE_TITLE"]
    assert generated(case, 3).title is None
    assert generated(case, 3).draft.status == "GENERATED"


# 요청당 상한과 남은 시간(25)


def test_rewrite_call_limit_per_request_stops_and_leaves_null(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """요청당 고쳐 쓰기 상한에 이르면 멈추고 남은 제목은 null이며 실패·종결값은 그대로다(25·26·27)."""
    caplog.set_level(logging.DEBUG)
    provider = ScriptedProvider(long_then_short)

    case = generation_case(
        REWRITE_THREE, provider, limits=GenerationLimits(max_rewrite_calls=2)
    )

    assert purposes(provider) == ["GENERATE"] * 3 + ["REWRITE_TITLE"] * 2
    # 고쳐 쓰기는 생성 순서(#4 → #5 → #3)대로라 #3이 남는다.
    assert generated(case, 4).title == "beta 코드 추가"
    assert generated(case, 5).title == "gamma 코드 추가"
    assert generated(case, 3).title is None
    for number in (3, 4, 5):
        assert generated(case, number).draft.status == "GENERATED"
    assert case.result["failures"] == []
    assert case.result["outcome"] == "SUCCEEDED"
    counts = flow_counts(caplog)
    assert counts["rewriteCalls"] == 2
    assert counts["titlesRewritten"] == 2
    assert counts["titleOnlyNull"] == 1
    assert counts["budgetSkipped"] == 0


def test_failed_tries_count_toward_the_request_rewrite_limit() -> None:
    """한 제목에서 형식 위반으로 다시 고친 호출도 요청당 고쳐 쓰기 상한에 들어간다(25).

    상한 4회: 먼저 고치는 #4가 3회 모두 형식을 어겨 null, #5는 남은 1회로 고치고, #3은 부르지 않고 null이다.
    """
    provider = ScriptedProvider(
        long_title,
        long_title,
        long_title,
        no_title,
        null_title,
        long_again,
        short_title,
        repeat=False,
    )

    case = generation_case(
        REWRITE_THREE, provider, limits=GenerationLimits(max_rewrite_calls=4)
    )

    assert purposes(provider) == ["GENERATE"] * 3 + ["REWRITE_TITLE"] * 4
    assert [min(paths(each)) for each in provider.rewrite_requests()] == [
        "app/beta.py",
        "app/beta.py",
        "app/beta.py",
        "app/gamma.py",
    ]
    assert generated(case, 4).title is None
    assert generated(case, 5).title == "gamma 코드 추가"
    assert generated(case, 3).title is None
    assert case.result["failures"] == []


def test_rewrite_limit_of_zero_makes_no_rewrite_call() -> None:
    """요청당 고쳐 쓰기 상한이 0이면 고쳐 쓰기를 부르지 않고 제목만 null이다(25·26)."""
    provider = ScriptedProvider(long_then_short)

    case = generation_case(
        REWRITE_THREE, provider, limits=GenerationLimits(max_rewrite_calls=0)
    )

    assert purposes(provider) == ["GENERATE"] * 3
    for number in (3, 4, 5):
        assert generated(case, number).title is None
        assert generated(case, number).draft.status == "GENERATED"
    assert case.result["failures"] == []


@pytest.mark.parametrize(
    ("deadline", "rewritten"),
    [
        # 생성 호출이 41초 걸리면 남은 시간은 9초로 고쳐 쓰기 시간 제한 20초보다 적다.
        pytest.param(50, False, id="9s-left"),
        # 남은 시간 29초는 20초보다 많다.
        pytest.param(70, True, id="29s-left"),
    ],
)
def test_rewrite_needs_the_rewrite_time_limit_left(
    deadline: int, rewritten: bool, caplog: pytest.LogCaptureFixture
) -> None:
    """남은 시간이 고쳐 쓰기 시간 제한보다 적으면 고쳐 쓰기를 시작하지 않고 제목만 null이다(25·26)."""
    caplog.set_level(logging.DEBUG)
    clock = FakeClock()
    provider = ScriptedProvider(
        Late(long_title, 41), short_title, clock=clock, repeat=False
    )

    case = generation_case(
        CHECKED, provider, clock=clock, deadline=timedelta(seconds=deadline)
    )

    found = generated(case, 3)
    assert found.draft.status == "GENERATED"
    if rewritten:
        assert purposes(provider) == ["GENERATE", "REWRITE_TITLE"]
        assert found.title == "alpha 코드 추가"
    else:
        assert purposes(provider) == ["GENERATE"]
        assert found.title is None
    # 고쳐 쓰기를 못 한 것은 생성 호출 예산 부족이 아니다. 새 실패가 없다.
    assert new_failures(case) == []
    assert case.result["outcome"] == "SUCCEEDED"
    assert flow_counts(caplog)["titleOnlyNull"] == (0 if rewritten else 1)


def test_rewrite_stops_when_time_runs_out_between_tries() -> None:
    """고쳐 쓰는 사이 남은 시간이 고쳐 쓰기 시간 제한보다 적어지면 제목당 3회 전이라도 멈추고 null이다(25)."""
    clock = FakeClock()
    # 마감 60초: 생성 10초 → 고쳐 쓰기 16초(형식 위반) → 16초(형식 위반) → 남은 시간 18초 < 20초.
    provider = ScriptedProvider(
        Late(long_title, 10),
        Late(no_title, 16),
        Late(no_title, 16),
        short_title,
        clock=clock,
        repeat=False,
    )

    case = generation_case(
        CHECKED, provider, clock=clock, deadline=timedelta(seconds=60)
    )

    assert purposes(provider) == ["GENERATE", "REWRITE_TITLE", "REWRITE_TITLE"]
    assert generated(case, 3).title is None
    assert generated(case, 3).draft.status == "GENERATED"
    assert new_failures(case) == []


def oversized_title(request: ProviderRequest) -> str:
    """맞는 제목에 덧붙임을 더해 응답 크기 상한(4,000 B)을 넘긴 고쳐 쓰기 응답."""
    text = answer(
        title=code_title(label_line(request), label_of(request)),
        note="가" * 1_500,
    )
    assert len(text.encode("utf-8")) > MAX_OUTPUT_BYTES
    return text


@pytest.mark.parametrize(
    "failure",
    [
        pytest.param(ProviderError("synthetic"), id="provider-error"),
        pytest.param(TimeoutError("synthetic"), id="timeout-error"),
        # 고쳐 쓰기 시간 제한(20초)을 넘겨 돌아온 응답은 버린다.
        pytest.param(Late(short_title, 21), id="late-answer"),
        pytest.param("고쳐 쓰기 결과가 아님", id="unreadable"),
        pytest.param(oversized_title, id="too-large"),
    ],
)
def test_failed_rewrite_call_is_not_repeated(
    failure: Reply | Late, caplog: pytest.LogCaptureFixture
) -> None:
    """고쳐 쓰기 호출 실패·시간 초과·읽을 수 없는 응답은 다시 부르지 않고 제목만 null이다(25·26·28)."""
    caplog.set_level(logging.DEBUG)
    clock = FakeClock()
    provider = ScriptedProvider(
        long_title, failure, short_title, clock=clock, repeat=False
    )

    case = generation_case(CHECKED, provider, clock=clock)

    assert purposes(provider) == ["GENERATE", "REWRITE_TITLE"]
    found = generated(case, 3)
    assert found.title is None
    assert found.draft.status == "GENERATED"
    assert found.reflection.status == "GENERATED"
    assert new_failures(case) == []
    assert case.result["outcome"] == "SUCCEEDED"
    assert flow_counts(caplog)["titleOnlyNull"] == 1


# 제목만 null일 때 failures·outcome과 로그(26·27)


TITLE_ONLY_NULL: list[Any] = [
    pytest.param(
        (long_title, null_title, nameless_title, long_again),
        PROPOSED_GENERATION_LIMITS,
        None,
        id="three-format-failures",
    ),
    pytest.param(
        (long_title, ProviderError("synthetic")),
        PROPOSED_GENERATION_LIMITS,
        None,
        id="rewrite-call-failed",
    ),
    pytest.param(
        (long_title, lambda request: answer(title=code_title("c9f9:L1", "alpha"))),
        PROPOSED_GENERATION_LIMITS,
        None,
        id="rewrite-check-failed",
    ),
    pytest.param(
        (long_title,),
        GenerationLimits(max_rewrite_calls=0),
        None,
        id="no-rewrite-budget",
    ),
    pytest.param(
        (Late(long_title, 41),),
        PROPOSED_GENERATION_LIMITS,
        50,
        id="no-time-left",
    ),
    pytest.param(
        (with_title(lambda request: code_title(label_line(request), "beta")),),
        PROPOSED_GENERATION_LIMITS,
        None,
        id="first-check-failed",
    ),
]


@pytest.mark.parametrize(("replies", "limits", "deadline"), TITLE_ONLY_NULL)
def test_title_only_null_keeps_failures_and_outcome(
    replies: tuple[Reply | Late, ...],
    limits: GenerationLimits,
    deadline: int | None,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """설명이 생성됐는데 제목만 null이면 failures·outcome은 제목을 얻은 경우와 같다(26). 건수만 로그에 남는다(27)."""
    scenario = with_collection_failure(wordy("alpha"))
    fixed = generation_case(
        scenario, ScriptedProvider(long_title, short_title, repeat=False)
    )
    assert fixed.before.result["failures"], "수집 실패가 있는 사례여야 한다"
    assert generated(fixed, 3).title == "alpha 코드 추가"
    caplog.clear()
    caplog.set_level(logging.DEBUG)
    clock = FakeClock()
    provider = ScriptedProvider(*replies, clock=clock, repeat=False)

    case = generation_case(
        scenario,
        provider,
        limits=limits,
        clock=clock,
        deadline=timedelta(minutes=20)
        if deadline is None
        else timedelta(seconds=deadline),
    )

    found = generated(case, 3)
    assert found.title is None
    assert found.draft.status == "GENERATED"
    assert found.reflection.status == "GENERATED"
    assert case.result["failures"] == fixed.result["failures"]
    assert case.result["failures"] == case.before.result["failures"]
    assert case.result["outcome"] == fixed.result["outcome"]
    assert case.result["outcome"] == case.before.result["outcome"]
    assert entry(case, 3)["title"] == found.work_facts[0]
    counts = flow_counts(caplog)
    assert counts["titleOnlyNull"] == 1
    assert counts["draftGenerated"] == 1


def test_title_only_null_count_leaves_out_failed_drafts(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """설명까지 실패해 제목이 null인 후보는 「제목만 null」 건수에 들지 않는다(27)."""
    caplog.set_level(logging.DEBUG)
    # 생성 순서는 #4 → #3이다. #4는 호출 오류, #3은 설명은 확인되고 제목 지목만 확인되지 않는다.
    provider = ScriptedProvider(
        ProviderError("synthetic"),
        with_title(lambda request: code_title(label_line(request), "zeta")),
        repeat=False,
    )
    scenario = pulls(
        opened(3, own(31, 3, wordy("alpha"))), opened(4, own(32, 9, wordy("beta")))
    )

    case = generation_case(scenario, provider)

    assert generated(case, 4).draft.status == "FAILED"
    assert generated(case, 4).title is None
    assert generated(case, 3).draft.status == "GENERATED"
    assert generated(case, 3).title is None
    counts = flow_counts(caplog)
    assert counts["draftFailed"] == 1
    assert counts["titleOnlyNull"] == 1
    # 호출 오류는 전체 호출 실패 원인으로만 센다. 제목 확인 실패(null)는 실패가 아니라 원인을 세지 않는다.
    assert flow_reasons(caplog) == {
        "wholeReasons": "GENERATION_CALL_FAILED:1",
        "draftReasons": "-",
        "reflectionReasons": "-",
        "draftDropReasons": "-",
        "reflectionDropReasons": "-",
    }


def test_failure_reasons_are_counted_per_part_in_code_order(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """설명·질문 실패마다 실패한 첫 원인 하나를 세고, 원인 코드순으로 `코드:건수`를 쉼표로 잇는다.

    값·경로·이름은 남지 않는다. 설명 실패 수는 전체 호출 실패 수와 설명 원인 건수 합을 더한 값이다
    (generation-limits.md 「운영 로그」).
    """
    caplog.set_level(logging.DEBUG)

    def unsent_line_and_joined_name(request: ProviderRequest) -> str:
        # 생성 순서 첫 후보(#4, beta): 설명은 보내지 않은 줄 id, 질문은 beta 줄의 bet(붙은 이름).
        line = label_line(request)
        return json.dumps(
            {
                "fragments": [
                    {"kind": "ADDED_LINE_WITH", "line": "c9f9:L9", "name": "beta"}
                ],
                "title": code_title(line, "beta"),
                "questions": [line_question("BACKGROUND", line, "bet")],
            }
        )

    def missing_name(request: ProviderRequest) -> str:
        # 둘째 후보(#3, alpha): 설명은 그 줄에 없는 이름, 질문은 확인된다.
        line = label_line(request)
        return json.dumps(
            {
                "fragments": [line_fragment(line, "alphaHelper")],
                "title": code_title(line, "alpha"),
                "questions": [line_question("BACKGROUND", line, "alpha")],
            }
        )

    provider = ScriptedProvider(unsent_line_and_joined_name, missing_name, repeat=False)
    scenario = pulls(
        opened(3, own(31, 3, wordy("alpha"))), opened(4, own(32, 9, wordy("beta")))
    )

    case = generation_case(scenario, provider)

    assert generated(case, 4).draft.status == "FAILED"
    assert generated(case, 4).reflection.status == "FAILED"
    assert generated(case, 3).draft.status == "FAILED"
    assert generated(case, 3).reflection.status == "GENERATED"
    counts = flow_counts(caplog)
    assert (counts["wholeFailures"], counts["draftFailed"]) == (0, 2)
    assert counts["reflectionFailed"] == 1
    # 실패한 부분에서 버린 항목도 버린 항목 건수에 든다. 살아남은 부분은 없다.
    assert flow_reasons(caplog) == {
        "wholeReasons": "-",
        "draftReasons": "NAME_MISSING:1,UNKNOWN_LINE:1",
        "reflectionReasons": "NAME_JOINED_ASCII:1",
        "draftDropReasons": "dropped:NAME_MISSING:1,dropped:UNKNOWN_LINE:1",
        "reflectionDropReasons": "dropped:NAME_JOINED_ASCII:1",
    }
    assert (counts["draftSalvaged"], counts["reflectionSalvaged"]) == (0, 0)
    (line,) = [r.getMessage() for r in caplog.records if r.name == FLOW_LOGGER]
    for value in ("alphaHelper", "bet ", "c9f9", "app/"):
        assert value not in line


def test_dropped_items_are_counted_by_cause_without_names(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """틀려서 버린 항목·상한 뒤 항목·종류를 고친 조각은 원인별 건수로만 남고, 틀린 항목을 버리고도 만들어진
    부분 수를 따로 센다. 실패 원인 칸에는 들지 않는다. 값·경로·이름은 남지 않는다(generation-limits.md
    「운영 로그」, 2026-10-19 결정)."""
    caplog.set_level(logging.DEBUG)

    def mixed(request: ProviderRequest) -> str:
        line = label_line(request)
        good = line_fragment(line, "alpha")
        return json.dumps(
            {
                "fragments": [
                    line_fragment(line, "alphaHelper"),
                    good | {"kind": "REMOVED_LINE_WITH"},
                    good,
                    good,
                    good,
                ],
                "title": code_title(line, "alpha"),
                "questions": [
                    line_question("BACKGROUND", line, "alpha"),
                    line_question("BACKGROUND", line, "alpha"),
                    line_question("VERIFICATION", "c9f9:L9", "alpha"),
                ],
            }
        )

    case = generation_case(
        pulls(opened(3, own(31, 3, wordy("alpha")))), ScriptedProvider(mixed)
    )

    assert generated(case, 3).draft.status == "GENERATED"
    assert len(generated(case, 3).reflection.questions) == 1
    counts = flow_counts(caplog)
    assert (counts["draftFailed"], counts["reflectionFailed"]) == (0, 0)
    assert (counts["draftSalvaged"], counts["reflectionSalvaged"]) == (1, 1)
    assert flow_reasons(caplog) == {
        "wholeReasons": "-",
        "draftReasons": "-",
        "reflectionReasons": "-",
        "draftDropReasons": "dropped:NAME_MISSING:1,fixed:KIND_MISMATCH:1,over:COUNT:1",
        "reflectionDropReasons": "dropped:DUPLICATE_TYPE:1,dropped:UNKNOWN_LINE:1",
    }
    (line,) = [r.getMessage() for r in caplog.records if r.name == FLOW_LOGGER]
    for value in ("alphaHelper", "alpha ", "c9f9", "app/"):
        assert value not in line


# coverageLimits: 크기 상한(35·37)

# 작은 자료 상한. filler 줄(약 120 B) 네 줄쯤만 들어간다.
SMALL = GenerationLimits(max_data_bytes=600)


def filler_texts(label: str, count: int = 10) -> list[str]:
    """filler(label)의 줄마다 든 이름(`{label}NN`)."""
    return [f"{label}{index:02d}" for index in range(count)]


def sent_names(request: ProviderRequest, label: str) -> list[str]:
    """보낸 줄 가운데 filler(label)의 줄 이름."""
    return [
        name
        for line in sent_lines(request)
        for name in identifiers(line.text)
        if name in filler_texts(label)
    ]


def test_size_limit_partly_excluded_commit_gets_the_partial_phrase(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """자료 상한을 넘는 줄은 보내지 않고, 그 본인 커밋 근거 끝에 일부 제외 문구를 붙인다(35·37)."""
    caplog.set_level(logging.DEBUG)
    provider = ScriptedProvider(naive)

    case = generation_case(
        pulls(opened(3, own(31, 3, filler("alpha")))), provider, limits=SMALL
    )

    (request,) = provider.requests
    assert len(request.data.encode("utf-8")) <= SMALL.max_data_bytes
    sent = sent_names(request, "alpha")
    assert 0 < len(sent) < 10
    for name in filler_texts("alpha"):
        if name not in sent:
            assert name not in request.data
    assert added_limits(case, 3) == {
        pull_url(3): (),
        commit_url(sha(31)): (SIZE_PARTIAL,),
    }
    assert generated(case, 3).draft.status == "GENERATED"
    assert new_failures(case) == []
    assert flow_counts(caplog)["sizeLimitedCommits"] == 1


def test_size_limit_marks_partial_and_full_commits_apart() -> None:
    """한 후보 안에서 일부를 보낸 커밋은 일부 제외, 하나도 보내지 못한 커밋은 전체 제외 문구다(35)."""
    first = own(31, 3, filler("alpha"))
    second = own(32, 4, filler("beta"), parent=sha(31))
    provider = ScriptedProvider(naive)

    case = generation_case(pulls(opened(3, first, second)), provider, limits=SMALL)

    (request,) = provider.requests
    sent = {
        sha(31): len(sent_names(request, "alpha")),
        sha(32): len(sent_names(request, "beta")),
    }
    assert sorted(sent.values())[0] == 0
    assert 0 < sorted(sent.values())[1] < 10
    added = added_limits(case, 3)
    assert added[pull_url(3)] == ()
    for commit_sha, count in sent.items():
        expected = (SIZE_FULL,) if count == 0 else (SIZE_PARTIAL,)
        assert added[commit_url(commit_sha)] == expected


def test_nothing_left_after_size_selection_gets_the_full_phrase() -> None:
    """선별 뒤 보낼 줄이 없으면 부르지 않고 NOT_GENERATED, 새 실패 없이 크기 전체 문구를 붙인다(35·37, 결정 13)."""
    provider = ScriptedProvider()

    case = generation_case(
        pulls(opened(3, own(31, 3, huge("alpha")))),
        provider,
        limits=GenerationLimits(max_data_bytes=1_000),
    )

    assert provider.requests == []
    found = generated(case, 3)
    assert found.draft.status == "NOT_GENERATED"
    assert found.reflection.status == "NOT_GENERATED"
    assert found.title is None
    assert added_limits(case, 3) == {pull_url(3): (), commit_url(sha(31)): (SIZE_FULL,)}
    assert new_failures(case) == []


def test_size_phrase_is_kept_when_the_started_call_fails() -> None:
    """선별을 거쳐 생성 호출을 했으면 그 호출이 실패해도 크기 문구는 붙는다(35·37, 상태표 호출 오류 행)."""
    provider = ScriptedProvider(ProviderError("synthetic"))

    case = generation_case(
        pulls(opened(3, own(31, 3, filler("alpha")))), provider, limits=SMALL
    )

    assert len(provider.requests) == 1
    assert generated(case, 3).draft.status == "FAILED"
    assert added_limits(case, 3)[commit_url(sha(31))] == (SIZE_PARTIAL,)


# coverageLimits: 온전하지 않은 patch(36)


@pytest.mark.parametrize("broken", TRUNCATIONS)
def test_truncated_patch_file_is_left_out_with_the_phrase(
    broken: Callable[[str], dict[str, Any]],
) -> None:
    """온전하지 않은 patch의 파일은 보내지 않고 온전한 파일로 생성하며, 그 커밋 근거 끝에 잘림 문구를 붙인다(36)."""
    target = with_safe_diff(own(31, 3, short("alpha"), broken("broken")))
    provider = ScriptedProvider(naive)

    case = generation_case(pulls(opened(3, target)), provider)

    (request,) = provider.requests
    assert paths(request) == {"app/alpha.py"}
    assert "broken" not in request.data
    found = generated(case, 3)
    assert found.draft.status == "GENERATED"
    assert found.title == "alpha 코드 수정"
    # PR 근거의 판본(머리 SHA)은 본인 커밋 SHA와 같지만 PR 근거에는 붙지 않는다.
    assert case.before.output.candidates[0].evidence[0].source_revision == sha(31)
    assert added_limits(case, 3) == {pull_url(3): (), commit_url(sha(31)): (TRUNCATED,)}


@pytest.mark.parametrize(
    "others",
    [
        pytest.param((), id="truncated-only"),
        pytest.param((env_file(),), id="with-secret-file"),
        pytest.param(
            (change("assets/logo.png", with_patch=False),), id="with-no-patch"
        ),
    ],
)
def test_truncated_phrase_on_candidate_without_material(
    others: tuple[dict[str, Any], ...],
) -> None:
    """재료가 없어 부르지 않은 후보에도 잘림 문구는 붙고, 선별 전 재료 0개라 크기 문구는 없다(36·37)."""
    target = own(31, 3, cut("broken"), *others)
    provider = ScriptedProvider()

    case = generation_case(pulls(opened(3, target)), provider, limits=SMALL)

    assert provider.requests == []
    found = generated(case, 3)
    assert found.draft.status == "NOT_GENERATED"
    assert found.reflection.status == "NOT_GENERATED"
    assert found.title is None
    assert added_limits(case, 3) == {pull_url(3): (), commit_url(sha(31)): (TRUNCATED,)}
    assert new_failures(case) == []


BUDGET_SHORTFALLS = [
    pytest.param(replace(SMALL, max_generation_calls=1), 20 * 60, id="call-limit"),
    pytest.param(SMALL, 30, id="time-limit"),
]


@pytest.mark.parametrize(("limits", "deadline"), BUDGET_SHORTFALLS)
def test_budget_shortfall_keeps_the_truncated_phrase_without_size_phrase(
    limits: GenerationLimits, deadline: int
) -> None:
    """호출 수·시간 한도로 부르지 못한 후보에도 잘림 문구는 붙고 크기 문구는 붙지 않는다(36·37, 결정 13)."""
    scenario = pulls(
        opened(3, own(31, 3, filler("alpha"), cut("alphacut"))),
        opened(4, own(32, 9, filler("beta"), cut("betacut"))),
    )
    provider = ScriptedProvider(naive)

    case = generation_case(
        scenario, provider, limits=limits, deadline=timedelta(seconds=deadline)
    )

    called = {min(paths(each)) for each in provider.requests}
    # 생성은 최근 본인 커밋부터(#4가 먼저)다. 시간이 모자라면 아무 후보도 부르지 못한다.
    assert called == ({"app/beta.py"} if limits.max_generation_calls == 1 else set())
    skipped = [3] if called else [3, 4]
    for number in skipped:
        assert generated(case, number).draft.status == "NOT_GENERATED"
        added = added_limits(case, number)
        assert added[pull_url(number)] == ()
        assert added[commit_url(sha(28 + number))] == (TRUNCATED,)
    if called:
        # 실제로 선별해 부른 후보에는 크기 문구가 잘림 문구 앞에 붙는다(구현이 고른 차례).
        assert added_limits(case, 4)[commit_url(sha(32))] == (SIZE_PARTIAL, TRUNCATED)
    assert new_failures(case) == [
        {
            "stage": "ANALYSIS",
            "code": BUDGET_EXHAUSTED,
            "message": BUDGET_MESSAGE,
        }
    ]


# coverageLimits: 보존(38·39)


def test_no_exclusion_adds_no_phrase() -> None:
    """뺀 자료가 없으면 근거 한계에 아무것도 붙지 않고 근거가 그대로다(35·38)."""
    provider = ScriptedProvider(naive)

    case = generation_case(pulls(opened(3, own(31, 3, short("alpha")))), provider)

    assert all(added == () for added in added_limits(case, 3).values())
    assert (
        entry(case, 3)["evidence"]
        == candidate(case.before.result, pull_identity(3))["evidence"]
    )


def test_new_phrases_follow_existing_limits_without_numbers_paths_or_fields() -> None:
    """새 문구는 기존 한계 뒤에 붙고, 기존 근거 내용·순서·필드는 그대로이며 숫자·경로·원문이 없다(38)."""
    target = own(
        31,
        3,
        filler("alpha"),
        change("assets/logo.png", with_patch=False),
        cut("broken"),
    )
    provider = ScriptedProvider(naive)

    case = generation_case(pulls(opened(3, target)), provider, limits=SMALL)

    before = candidate(case.before.result, pull_identity(3))
    after = entry(case, 3)
    old_pull, old_commit = before["evidence"]
    new_pull, new_commit = after["evidence"]
    # 사례 확인: 커밋 근거에는 수집이 적은 한계가 이미 있고, PR 근거의 판본은 본인 커밋 SHA와 같다.
    assert old_commit["coverageLimits"]
    assert old_pull["sourceRevision"] == sha(31)
    assert new_commit["coverageLimits"] == [
        *old_commit["coverageLimits"],
        SIZE_PARTIAL,
        TRUNCATED,
    ]
    assert new_pull == old_pull
    assert {
        key: value for key, value in new_commit.items() if key != "coverageLimits"
    } == {key: value for key, value in old_commit.items() if key != "coverageLimits"}
    assert set(after) == set(before)
    for old, new in zip(before["evidence"], after["evidence"], strict=True):
        assert set(new) == set(old)
    added = new_commit["coverageLimits"][len(old_commit["coverageLimits"]) :]
    for phrase in added:
        assert not re.search(r"[0-9]", phrase), phrase
        for raw in ("/", ".py", ".png", "alpha", "broken", "logo", "xxx", sha(31)[:7]):
            assert raw not in phrase, phrase


def test_phrase_already_present_is_not_added_again() -> None:
    """같은 사유의 문구가 이미 근거 한계에 있으면 다시 붙이지 않고 새 사유만 끝에 붙인다(38)."""
    target = own(31, 3, filler("alpha"), cut("broken"))
    before = run_case(pulls(opened(3, target)))
    (built_candidate,) = before.output.candidates
    index = [item.source_url for item in built_candidate.evidence].index(
        commit_url(sha(31))
    )
    item = built_candidate.evidence[index]
    present = (*item.coverage_limits, TRUNCATED)
    evidence = list(built_candidate.evidence)
    evidence[index] = replace(item, coverage_limits=present)
    built = replace(
        before.output,
        candidates=(replace(built_candidate, evidence=tuple(evidence)),),
    )

    output, _ = generate_on(built, before, ScriptedProvider(naive), limits=SMALL)

    (after,) = output.candidates
    assert after.evidence[index].coverage_limits == (*present, SIZE_PARTIAL)
    assert after.evidence[index].coverage_limits.count(TRUNCATED) == 1


def _evidence_change(
    url: str, edit: Callable[[EvidenceItem], EvidenceItem]
) -> Callable[[GenerationOutput], GenerationOutput]:
    def apply(output: GenerationOutput) -> GenerationOutput:
        (only,) = output.candidates
        evidence = tuple(
            edit(item) if item.source_url == url else item for item in only.evidence
        )
        return replace(output, candidates=(replace(only, evidence=evidence),))

    return apply


def _append(*phrases: str) -> Callable[[EvidenceItem], EvidenceItem]:
    return lambda item: replace(item, coverage_limits=(*item.coverage_limits, *phrases))


PRESERVATION_BREAKS = [
    pytest.param(
        _evidence_change(pull_url(3), _append(TRUNCATED)), id="phrase-on-pull-request"
    ),
    pytest.param(
        _evidence_change(
            commit_url(sha(31)),
            lambda item: replace(
                item, coverage_limits=("바뀐 한계", *item.coverage_limits[1:])
            ),
        ),
        id="existing-limit-changed",
    ),
    pytest.param(
        _evidence_change(
            commit_url(sha(31)),
            lambda item: replace(
                item, coverage_limits=(TRUNCATED, *item.coverage_limits)
            ),
        ),
        id="phrase-before-existing",
    ),
    pytest.param(
        _evidence_change(
            commit_url(sha(31)), _append("이 커밋의 일부 값은 가려서 보내지 않았다")
        ),
        id="masking-phrase",
    ),
    pytest.param(
        _evidence_change(commit_url(sha(31)), _append(SIZE_PARTIAL, SIZE_FULL)),
        id="partial-and-full",
    ),
    pytest.param(
        _evidence_change(commit_url(sha(31)), _append(TRUNCATED, TRUNCATED)),
        id="duplicate",
    ),
    pytest.param(
        _evidence_change(
            commit_url(sha(31)),
            lambda item: replace(item, represented_facts=("바뀐 관측 사실",)),
        ),
        id="facts-changed",
    ),
]


@pytest.mark.parametrize("breaks", PRESERVATION_BREAKS)
def test_preservation_check_rejects_changes_outside_the_exception(
    breaks: Callable[[GenerationOutput], GenerationOutput],
) -> None:
    """근거 보존 검사는 본인 커밋 근거 끝의 정해진 문구 추가만 허용하고 그 밖의 근거 변경은 잡는다(39)."""
    target = own(31, 3, short("alpha"), change("assets/logo.png", with_patch=False))
    before = run_case(pulls(opened(3, target)))
    allowed = _evidence_change(commit_url(sha(31)), _append(SIZE_PARTIAL, TRUNCATED))

    assert_preserved(before.output, allowed(before.output))
    with pytest.raises(AssertionError):
        assert_preserved(before.output, breaks(before.output))


# 가리기 끝까지(32·33·34)


MASKED = pulls(opened(3, own(31, 3, settings(), env_file(), pem_file())))
HIDDEN = (TOKEN, EMAIL, ENV_VALUE, PEM_BODY, *SECRET_PATHS)


def echo_unknown_key(request: ProviderRequest) -> str:
    """정상 응답에 가린 값·비밀 파일 경로를 되돌려 쓴 모르는 최상위 키를 더한다."""
    value = json.loads(naive(request))
    value["note"] = f"{TOKEN} {EMAIL} .env"
    return json.dumps(value, ensure_ascii=False)


@pytest.mark.parametrize(
    "reply",
    [
        pytest.param(naive, id="normal"),
        pytest.param(echo_unknown_key, id="echoed-in-unknown-key"),
        pytest.param(
            ProviderError(f"upstream echoed {TOKEN} {EMAIL} .env"), id="provider-error"
        ),
        pytest.param(f"not json {TOKEN} {EMAIL}", id="unreadable-echo"),
    ],
)
def test_masked_values_and_secret_files_are_not_sent_or_returned(
    reply: Reply, caplog: pytest.LogCaptureFixture
) -> None:
    """가린 값·비밀 파일의 경로·상태는 제공자 입력·결과(실패 문구 포함)·로그 어디에도 없다(32·34)."""
    caplog.set_level(logging.DEBUG)
    provider = ScriptedProvider(reply)

    case = generation_case(MASKED, provider)

    (request,) = provider.generate_requests()
    assert paths(request) == {"app/settings.py"}
    assert {file["status"] for file in sent_files(request).values()} == {"modified"}
    lines = sent_lines(request)
    hidden = [line for line in lines if not line.selectable]
    assert len(hidden) == 2
    assert all(MASK in line.text for line in hidden)
    assert all(MASK not in line.text for line in lines if line.selectable)
    for value in HIDDEN:
        assert_nowhere(
            value, provider=provider, result=case.result, logs=log_lines(caplog)
        )
    # 가리기는 근거 한계에 적지 않는다(결정 7).
    assert all(added == () for added in added_limits(case, 3).values())
    counts = flow_counts(caplog)
    assert counts["maskedValues"] == 2
    assert counts["secretFiles"] == 2
    assert counts["maskedToEmpty"] == 0
    # 운영 로그 한 줄에는 건수만 있고 경로·이름·SHA가 없다.
    (flow,) = [r.getMessage() for r in caplog.records if r.name == FLOW_LOGGER]
    for raw in ("app/settings.py", "settings", "api_token", "owner", "limit", sha(31)):
        assert raw not in flow


def _hidden_line(request: ProviderRequest, name: str) -> SentLine:
    found = [
        line
        for line in sent_lines(request)
        if not line.selectable and name in identifiers(line.text)
    ]
    assert len(found) == 1
    return found[0]


def _unsent_file_id(request: ProviderRequest) -> str:
    """같은 커밋에서 보내지 않은 파일 자리의 id(비밀 파일이 있을 자리)."""
    sent = sent_files(request)
    for number in range(1, 10):
        file_id = f"c1f{number}"
        if file_id not in sent:
            return file_id
    raise AssertionError("보내지 않은 파일 자리가 없다")


def pointing(part: str, target: str) -> Callable[[ProviderRequest], str]:
    """part(fragments·questions·title) 하나만 가린 줄이나 보내지 않은 비밀 파일 자리를 지목하고, 나머지는
    가리지 않은 `limit` 줄을 지목하는 생성 응답."""

    def reply(request: ProviderRequest) -> str:
        normal = pick(request, change="added", contains="limit")
        value: dict[str, Any] = {
            "fragments": [line_fragment(normal, "limit")],
            "title": code_title(normal, "limit"),
            "questions": [line_question("BACKGROUND", normal, "limit")],
        }
        if target == "secret-file":
            file_id = _unsent_file_id(request)
            chosen = {
                "fragments": [file_fragment(file_id)],
                "title": file_title(file_id),
                "questions": [file_question("BACKGROUND", file_id)],
            }
        else:
            line = _hidden_line(request, target)
            chosen = {
                "fragments": [line_fragment(line, target)],
                "title": code_title(line, target),
                "questions": [line_question("BACKGROUND", line, target)],
            }
        value[part] = chosen[part]
        return json.dumps(value, ensure_ascii=False)

    return reply


@pytest.mark.parametrize("target", ["api_token", "owner", "secret-file"])
@pytest.mark.parametrize("part", ["fragments", "questions", "title"])
def test_reply_pointing_at_a_masked_line_or_secret_file_is_rejected(
    part: str, target: str
) -> None:
    """가림이 든 줄·비밀 파일을 설명·질문·제목의 근거로 지목하면 그 부분만 거부한다(33, 결정 10·16)."""
    provider = ScriptedProvider(pointing(part, target), short_title, repeat=False)

    case = generation_case(MASKED, provider)

    # 제목 확인 실패는 고쳐 쓰지 않는다.
    assert purposes(provider) == ["GENERATE"]
    found = generated(case, 3)
    candidate_id = entry(case, 3)["candidateId"]
    if part == "fragments":
        assert found.draft.status == "FAILED"
        assert found.draft.content is None
        assert found.reflection.status == "GENERATED"
        assert found.title == "limit 코드 수정"
        assert new_failures(case) == [
            {
                "stage": "DRAFT",
                "code": UNVERIFIED,
                "message": UNVERIFIED_DRAFT,
                "candidateId": candidate_id,
            }
        ]
    elif part == "questions":
        assert found.draft.status == "GENERATED"
        assert found.reflection.status == "FAILED"
        assert found.reflection.questions == ()
        assert found.title == "limit 코드 수정"
        assert new_failures(case) == [
            {
                "stage": "REFLECTION",
                "code": UNVERIFIED,
                "message": UNVERIFIED_REFLECTION,
                "candidateId": candidate_id,
            }
        ]
    else:
        assert found.draft.status == "GENERATED"
        assert found.reflection.status == "GENERATED"
        assert found.title is None
        assert new_failures(case) == []
    for value in HIDDEN:
        assert_nowhere(value, provider=provider, result=case.result)


def test_masked_to_empty_candidate_is_not_called(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """가리기 뒤 고를 수 있는 줄이 없는 후보는 부르지 않고 NOT_GENERATED, 새 실패·근거 한계 추가가 없다(32·34)."""
    caplog.set_level(logging.DEBUG)
    scenario = pulls(
        opened(3, own(31, 3, keys_only(), env_file())),
        opened(4, own(32, 9, short("beta"))),
    )
    provider = ScriptedProvider(naive)

    case = generation_case(scenario, provider)

    (request,) = provider.requests
    assert paths(request) == {"app/beta.py"}
    found = generated(case, 3)
    assert found.draft.status == "NOT_GENERATED"
    assert found.reflection.status == "NOT_GENERATED"
    assert found.title is None
    assert generated(case, 4).draft.status == "GENERATED"
    assert new_failures(case) == []
    assert all(added == () for added in added_limits(case, 3).values())
    for value in (TOKEN, EMAIL, ENV_VALUE, ".env", "app/keys.py"):
        assert_nowhere(
            value, provider=provider, result=case.result, logs=log_lines(caplog)
        )
    counts = flow_counts(caplog)
    assert counts["maskedToEmpty"] == 1
    assert counts["generationCalls"] == 1


def test_new_limits_skip_merge_commit_and_issue_evidence() -> None:
    """PR 없는 병합의 병합 커밋 근거(/commit/{병합 SHA})와 이슈 근거에는 한계 문구를 붙이지 않고, 본인 커밋
    근거에만 붙인다(기준 38, 결정 5·6)."""
    feature = commit(
        sha(7301),
        MEMBER,
        parents=(ROOT,),
        minute=2,
        message="#21 처리",
        files=[
            change("app/profile.py", patch="@@ -1 +1 @@\n-x = 1\n+loginRateLimit = 5"),
            change("app/broken.py", patch="@@ -1,2 +1,2 @@\n-a\n+b"),
        ],
    )
    joined = merge_commit(sha(7302), ROOT, feature.sha, minute=3)
    scenario = Scenario(default_branch=(joined, feature, root_commit()), issues=(21,))

    case = generation_case(
        scenario, ScriptedProvider(naive), request=live_request("COMMIT", "ISSUE")
    )

    entry = candidate(case.result, merge_identity(joined.sha))
    urls = [item["sourceUrl"] for item in entry["evidence"]]
    assert urls[0] == commit_url(joined.sha)
    assert urls[1] == commit_url(feature.sha)
    assert urls[2].endswith("/issues/21")
    before = candidate(case.before.result, merge_identity(joined.sha))
    for index, (old, new) in enumerate(
        zip(before["evidence"], entry["evidence"], strict=True)
    ):
        added = new["coverageLimits"][len(old["coverageLimits"]) :]
        assert added == ([TRUNCATED] if index == 1 else []), (index, added)


def test_value_masked_in_one_file_is_not_sent_from_another_file() -> None:
    """한 파일의 대입 줄에서 가린 비밀번호가 다른 파일의 호출 줄에 그대로 있어도 보내지 않고, 그 줄은 고를
    수 없다. 결과(설명·질문·제목) 어디에도 값이 없다(32·33)."""
    password = "".join(("S3cret", "Passw0rd"))
    work = commit(
        sha(7401),
        MEMBER,
        parents=(ROOT,),
        minute=2,
        files=[
            change(
                "src/config.ts",
                patch=f'@@ -0,0 +1 @@\n+const adminPassword = "{password}";',
                status="added",
            ),
            change(
                "tests/login.test.ts",
                patch=f'@@ -0,0 +1 @@\n+await login(page, "admin", "{password}");',
                status="added",
            ),
            change("src/limit.ts", patch="@@ -1 +1 @@\n-x = 1\n+loginRateLimit = 5"),
        ],
    )
    provider = ScriptedProvider(naive)

    case = generation_case(
        Scenario(default_branch=(work, root_commit()), lookups={work.sha: ()}),
        provider,
    )

    assert_nowhere(password, provider=provider, result=case.result)
    (request,) = provider.generate_requests()
    login = [line for line in sent_lines(request) if line.path == "tests/login.test.ts"]
    assert login
    assert all(not line.selectable for line in login)
    assert case.run.report.masked_values == 2


def test_preservation_check_rejects_a_phrase_on_pull_request_evidence_of_a_commit_repo() -> (
    None
):
    """저장소 이름이 commit이라 PR 주소에 /commit/이 들어가도, 한계 문구가 PR 근거에 붙으면 공용 보존
    검사가 실패로 잡는다(38·39)."""
    case = generation_case(
        pulls(opened(3, own(31, 3, filler("alpha")))), ScriptedProvider(naive)
    )
    (before,) = case.before.output.candidates
    pull_evidence = replace(
        before.evidence[0],
        source_url=before.evidence[0].source_url.replace("/pull/", "/commit/pull/"),
    )
    moved = replace(before, evidence=(pull_evidence, *before.evidence[1:]))
    broken = replace(
        moved,
        evidence=(
            replace(
                pull_evidence,
                coverage_limits=(*pull_evidence.coverage_limits, SIZE_FULL),
            ),
            *moved.evidence[1:],
        ),
    )

    with pytest.raises(AssertionError):
        assert_preserved(
            replace(case.before.output, candidates=(moved,)),
            replace(case.before.output, candidates=(broken,)),
        )
