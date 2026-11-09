"""생성 흐름(#120)의 상태·실패·호출 한도·시간·순서를 합성 제공자로 수집부터 결과 조합까지 돌린다.

기대값은 #120 본문의 완료 기준과 2026-10-12 결정 댓글(결정 4·8·9·10·13·14), 계획의 「상태·실패 변환」
표에서 정했다. 이슈가 구현에 맡긴 실패 코드 이름·회원용 문구·상한 수치만 이번 구현이 고른 값(45초·4,000 B,
「{원인} 설명 초안을 만들지 못했다」 등)을 기대값으로 따로 적는다. 생성 코드를 읽어 맞추지 않았다.

후보는 열린 PR마다 본인 커밋 하나(또는 둘)를 둔 합성 저장소로 만든다. PR마다 고친 파일 이름이 달라서
제공자가 받은 자료의 경로로 어느 후보의 생성 호출인지 안다. 모든 시험은 네트워크를 막은 채 돈다.
"""

import json
import logging
import socket
from collections import Counter
from collections.abc import Callable, Mapping
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta
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
    evidence_urls,
    identities,
    named,
    open_pull_with_direct_commit,
    pull_identity,
    pull_url,
    root_commit,
    run_case,
)
from generation_scenarios import (
    DEFAULT_DEADLINE,
    SIZE_FULL,
    SIZE_PARTIAL,
    TRUNCATED,
    GenerationCase,
    Late,
    Reply,
    ScriptedProvider,
    ai_answer,
    answer,
    assert_generated_text,
    assert_preserved,
    code_title,
    file_id_of,
    file_title,
    generation_case,
    line_fragment,
    naive,
    naive_ai,
    pick,
    question,
    sent_files,
    written,
)
from generation_scenarios import sent_lines as sent_lines_of
from github_synthetic import (
    MEMBER,
    OTHER,
    FakeClock,
    detail_path,
    sha,
    stamp,
    status_only,
    with_files,
)

from app.collection import CollectionLimits
from app.contract import Verdict, check_message
from app.generation import (
    PROPOSED_GENERATION_LIMITS,
    GenerationLimits,
    ProviderError,
    ProviderRequest,
    UnusableResponse,
    run_generation,
)
from app.generation.judged import CatchTrace
from app.generation.request import QUESTION_RULES
from app.judgement.provider import Question
from app.judgement.synthetic import SyntheticJudge, default_answer
from app.processing import (
    EligibleCandidate,
    ExecutionUnknown,
    GenerationOutput,
    compose_result,
)


@pytest.fixture
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*args: object, **kwargs: object) -> None:
        raise AssertionError("외부 연결 시도")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)


# 모든 시험을 네트워크를 막은 채 돌린다(첫 범위의 검사 12).
pytestmark = pytest.mark.usefixtures("no_network")

# 구현이 고른 상한(제안값): 생성 호출 시간 제한 45초, 응답 4,000 B.
GENERATION_TIMEOUT_SECONDS = 45.0
MAX_OUTPUT_BYTES = 4_000

# 구현이 고른 실패 코드와 회원용 문구. 문구는 「{원인} 설명 초안을 만들지 못했다」·「{원인} 생각해볼 질문을
# 만들지 못했다」이고, 한도 실패는 후보에 묶이지 않은 ANALYSIS 1건이다.
CALL_FAILED = "GENERATION_CALL_FAILED"
TIMEOUT = "GENERATION_TIMEOUT"
UNREADABLE = "GENERATION_RESPONSE_UNREADABLE"
TOO_LARGE = "GENERATION_RESPONSE_TOO_LARGE"
BUDGET_EXHAUSTED = "GENERATION_BUDGET_EXHAUSTED"
CAUSES = {
    CALL_FAILED: "생성 중 오류가 나",
    TIMEOUT: "생성 시간이 초과되어",
    UNREADABLE: "생성 결과를 읽을 수 없어",
    TOO_LARGE: "생성 결과가 허용 크기를 넘어",
}
BUDGET_MESSAGE = (
    "생성 횟수·시간 한도에 걸려 일부 후보의 설명 초안과 생각해볼 질문을 만들지 못했다"
)
BUDGET_FAILURE = {
    "stage": "ANALYSIS",
    "code": BUDGET_EXHAUSTED,
    "message": BUDGET_MESSAGE,
}

# 회원 결과·로그에 새면 안 되는 제공자 쪽 글. 가짜 비밀값은 실행 중에 이어 붙여 만든다.
SECRET = "".join(("gh", "p_", "Synthetic", "Leak", "0" * 22))
INTERNAL = "".join(("upstream-", "model-x ", "internal ", "trace 7f3a"))

F = named("f")


# 합성 후보


def own(
    number: int,
    minute: int,
    *files: dict[str, Any],
    parent: str = ROOT,
) -> Commit:
    """본인(연동 계정) 커밋 하나."""
    return commit(sha(number), MEMBER, parents=(parent,), minute=minute, files=files)


def short(name: str) -> dict[str, Any]:
    """`app/{name}.py`의 한 줄을 고친 파일. 이름(name)이 추가·삭제 줄에 든다."""
    return change(f"app/{name}.py", patch=f"@@ -1 +1 @@\n-{name} = 1\n+{name} = 2")


def long_line(name: str) -> dict[str, Any]:
    """줄 하나가 1,500자인 파일. 작은 자료 상한(1,000 B)에서는 그 줄 혼자 상한을 넘는다(가리기가 통째로
    가리는 2,000자보다는 짧다)."""
    value = "x" * 1_500
    return change(
        f"app/{name}.py",
        patch=f"@@ -0,0 +1 @@\n+{name} = '{value}'",
        status="added",
    )


def cut(name: str) -> dict[str, Any]:
    """받은 patch가 온전하지 않은 파일(추가 수가 patch의 '+' 줄 수와 맞지 않음)."""
    return change(
        f"app/{name}.py",
        patch=f"@@ -1 +1 @@\n-{name} = 1\n+{name} = 2",
        additions=3,
    )


def opened(number: int, *commits: Commit) -> Pull:
    return Pull(number, MEMBER, commits, state="open", created=number - 1)


def pulls(*items: Pull) -> Scenario:
    """기본 브랜치에는 뿌리 커밋만 있고, 열린 PR마다 후보가 하나씩 나온다."""
    return Scenario(default_branch=(root_commit(),), pulls=items)


ALPHA = own(31, 3, short("alpha"))
BETA = own(32, 9, short("beta"))
GAMMA = own(33, 6, short("gamma"))
# PR #3(alpha, 3분)·PR #4(beta, 9분): 생성은 PR #4가 먼저다.
TWO = pulls(opened(3, ALPHA), opened(4, BETA))
# PR #5(gamma, 6분)를 더한 셋: 생성 순서는 PR #4 → #5 → #3이다.
THREE = pulls(opened(3, ALPHA), opened(4, BETA), opened(5, GAMMA))
LAST_GENERATED_FIRST = {3: "app/alpha.py", 4: "app/beta.py", 5: "app/gamma.py"}


def c29_after_details() -> Scenario:
    """C29의 뒷부분: ffff의 변경 내용 조회가 429라 수집 실패가 남고, PR #3은 후보다."""
    return replace(
        open_pull_with_direct_commit(lookup=()),
        overrides={detail_path(F): status_only(429)},
    )


# 결과 읽기


def by_identity(output: GenerationOutput) -> dict[str, EligibleCandidate]:
    return {each.work_identity: each for each in output.candidates}


def entry(case: GenerationCase, number: int) -> dict[str, Any]:
    """조합된 결과에서 PR #number 후보."""
    return candidate(case.result, pull_identity(number))


def generated(case: GenerationCase, number: int) -> EligibleCandidate:
    return by_identity(case.output)[pull_identity(number)]


def paths(request: ProviderRequest) -> set[str]:
    return {file["path"] for file in sent_files(request).values()}


def added_limits(case: GenerationCase, number: int) -> dict[str, tuple[str, ...]]:
    """PR #number 후보의 근거마다 생성이 한계 목록 끝에 더한 문구."""
    old = by_identity(case.before.output)[pull_identity(number)]
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


def whole_failures(code: str, candidate_id: str) -> list[dict[str, str]]:
    """전체 호출 실패 하나가 남기는 DRAFT·REFLECTION 실패 각 1건."""
    return [
        {
            "stage": "DRAFT",
            "code": code,
            "message": f"{CAUSES[code]} 설명 초안을 만들지 못했다",
            "candidateId": candidate_id,
        },
        {
            "stage": "REFLECTION",
            "code": code,
            "message": f"{CAUSES[code]} 생각해볼 질문을 만들지 못했다",
            "candidateId": candidate_id,
        },
    ]


def sort_failures(failures: list[dict[str, Any]]) -> list[str]:
    return sorted(json.dumps(each, ensure_ascii=False) for each in failures)


def assert_calls(
    provider: ScriptedProvider,
    count: int,
    *,
    timeout: float = GENERATION_TIMEOUT_SECONDS,
    max_output: int = MAX_OUTPUT_BYTES,
) -> None:
    """생성 호출이 정확히 count번이고, 고쳐 쓰기·다른 지시문의 추가 호출이 없으며, 호출마다 시간 제한과
    응답 크기 상한이 넘어갔다."""
    assert len(provider.requests) == count
    assert all(each.purpose == "GENERATE" for each in provider.requests)
    assert len({each.instructions for each in provider.requests}) <= 1
    for each in provider.requests:
        assert each.timeout_seconds == timeout
        assert each.max_output_bytes == max_output


def assert_not_generated(case: GenerationCase, number: int) -> None:
    """설명·질문 NOT_GENERATED, 본문·질문 없음, 내부 제목 None."""
    each = generated(case, number)
    assert each.draft.status == "NOT_GENERATED"
    assert each.draft.content is None
    assert each.reflection.status == "NOT_GENERATED"
    assert each.reflection.questions == ()
    assert each.title is None
    found = entry(case, number)
    assert found["draft"] == {"status": "NOT_GENERATED", "content": None}
    assert found["reflection"] == {"status": "NOT_GENERATED", "questions": []}


def assert_generated(case: GenerationCase, number: int) -> None:
    each = generated(case, number)
    assert each.draft.status == "GENERATED"
    assert each.draft.content
    assert each.reflection.status == "GENERATED"
    assert each.reflection.questions
    assert each.title is not None


def assert_failed_whole(case: GenerationCase, number: int) -> None:
    """전체 호출 실패: 설명·질문 모두 FAILED이고 생성되지 않은 내용을 내보내지 않는다."""
    each = generated(case, number)
    assert each.draft.status == "FAILED"
    assert each.draft.content is None
    assert each.reflection.status == "FAILED"
    assert each.reflection.questions == ()
    assert each.title is None
    found = entry(case, number)
    assert found["draft"] == {"status": "FAILED", "content": None}
    assert found["reflection"] == {"status": "FAILED", "questions": []}
    assert found["title"] is None


def generate_after(
    before: CaseRun,
    provider: ScriptedProvider,
    *,
    limits: GenerationLimits = PROPOSED_GENERATION_LIMITS,
) -> GenerationCase:
    """수집 상한을 따로 정한 사례의 후보 판정 결과에 생성을 붙인다(generation_case와 같은 검사)."""
    clock = FakeClock()
    run = run_generation(
        before.request,
        before.outcome,
        before.output,
        provider=provider,
        clock=clock,
        deadline=clock() + DEFAULT_DEADLINE,
        limits=limits,
    )
    result = compose_result(
        before.request, run.output, finished_at=FINISHED_AT, id_label="case"
    )
    checked = check_message("Result", result)
    assert checked.verdict is Verdict.VALID, checked.errors
    assert_preserved(before.output, run.output)
    assert_generated_text(run.output)
    return GenerationCase(before, run, result, provider, clock)


def padded(limit: int) -> Callable[[ProviderRequest], str]:
    """정상 응답에 한글 덧붙임을 더해 UTF-8 바이트만 limit을 넘긴 응답(글자 수는 limit보다 적다)."""

    def reply(request: ProviderRequest) -> str:
        value = json.loads(naive(request))
        value["note"] = "가" * (limit // 3 + 100)
        text = json.dumps(value, ensure_ascii=False)
        assert len(text) < limit < len(text.encode())
        return text

    return reply


# 정상 생성과 보존


def test_eligible_candidates_are_generated_with_one_call_each() -> None:
    """정상 합성 후보마다 생성 호출이 정확히 1회 일어나고 설명·질문·제목이 채워지며(01·02·16), 다른 칸은
    workIdentity로 짝지은 생성 전 후보와 같다."""
    provider = ScriptedProvider(naive)

    case = generation_case(THREE, provider)

    assert_calls(provider, 3)
    # 호출 하나에는 그 후보의 파일만 실린다.
    assert sorted(min(paths(each)) for each in provider.requests) == [
        "app/alpha.py",
        "app/beta.py",
        "app/gamma.py",
    ]
    assert all(len(paths(each)) == 1 for each in provider.requests)
    for number in (3, 4, 5):
        assert_generated(case, number)
    assert case.result["failures"] == []
    assert case.result["outcome"] == "SUCCEEDED"
    before = by_identity(case.before.output)
    after = by_identity(case.output)
    assert list(after) == list(before)
    for key, old in before.items():
        new = after[key]
        # 한계 문구를 붙일 사유가 없어 근거도 그대로다. 생성 칸만 되돌리면 같다.
        restored = replace(
            new, title=old.title, draft=old.draft, reflection=old.reflection
        )
        assert restored == old
    assert case.result["notProvided"] == case.before.result["notProvided"]


def test_title_comes_from_the_same_generation_call() -> None:
    """제목은 설명과 같은 생성 호출의 응답에서 나오며 따로 부르지 않는다(16)."""
    provider = ScriptedProvider(naive, repeat=False)

    case = generation_case(pulls(opened(3, ALPHA)), provider)

    assert_calls(provider, 1)
    assert generated(case, 3).title is not None
    assert entry(case, 3)["title"] == generated(case, 3).title


# 재료 없음(결정 4·7·8)


NO_MATERIAL: dict[str, dict[str, Any]] = {
    # GitHub가 patch를 주지 않은 파일(이진 파일 등).
    "no-patch": change("assets/logo.png", with_patch=False),
    # 비밀 파일은 경로·상태도 보내지 않으므로 재료가 아니다.
    "secret-file": change(
        ".env", patch="@@ -0,0 +1 @@\n+LOG_LEVEL=debug", status="added"
    ),
    # 받은 patch가 온전하지 않은 파일만 있다.
    "truncated-only": cut("broken"),
}


@pytest.mark.parametrize("kind", list(NO_MATERIAL))
def test_candidate_without_material_is_not_called(kind: str) -> None:
    """재료가 없는 후보는 모델을 부르지 않고 설명·질문 NOT_GENERATED, 제목 None이며 새 실패가 없다(09).
    다른 후보는 그대로 생성한다."""
    empty = own(41, 3, NO_MATERIAL[kind])
    provider = ScriptedProvider(naive, repeat=False)

    case = generation_case(pulls(opened(3, empty), opened(4, BETA)), provider)

    assert_calls(provider, 1)
    assert paths(provider.requests[0]) == {"app/beta.py"}
    assert_not_generated(case, 3)
    assert_generated(case, 4)
    assert new_failures(case) == []
    assert case.result["outcome"] == "SUCCEEDED"
    # 재료가 없으면 크기 문구는 없다. 온전하지 않은 patch의 문구만 붙는다(결정 6·13).
    expected = (TRUNCATED,) if kind == "truncated-only" else ()
    assert added_limits(case, 3) == {pull_url(3): (), commit_url(empty.sha): expected}


def test_no_material_keeps_the_other_candidates_failure() -> None:
    """재료 없음 처리는 다른 후보의 실제 호출 실패를 지우거나 바꾸지 않는다(10)."""
    empty = own(41, 3, NO_MATERIAL["no-patch"])
    provider = ScriptedProvider(ProviderError("제공자 오류"), repeat=False)

    case = generation_case(pulls(opened(3, empty), opened(4, BETA)), provider)

    assert_calls(provider, 1)
    assert_not_generated(case, 3)
    assert_failed_whole(case, 4)
    assert new_failures(case) == whole_failures(
        CALL_FAILED, entry(case, 4)["candidateId"]
    )
    assert case.result["outcome"] == "PARTIAL_FAILED"


def test_nothing_left_after_size_selection_is_not_called() -> None:
    """입력 크기 선별 뒤 보낼 줄이 0개면 부르지 않고 재료 없음과 같이 두며, 그 본인 커밋 근거에만 크기
    전체 문구를 붙인다(09·37)."""
    first = own(41, 3, long_line("first"))
    second = own(42, 9, long_line("second"))
    provider = ScriptedProvider()

    case = generation_case(
        pulls(opened(3, first), opened(4, second)),
        provider,
        limits=GenerationLimits(max_data_bytes=1_000),
    )

    assert provider.requests == []
    for number, target in ((3, first), (4, second)):
        assert_not_generated(case, number)
        assert added_limits(case, number) == {
            pull_url(number): (),
            commit_url(target.sha): (SIZE_FULL,),
        }
    assert new_failures(case) == []
    assert case.result["outcome"] == "SUCCEEDED"


# 전체 호출 실패(결정에서 따라 나온 처리)


WHOLE_FAILURES: dict[str, str] = {
    "provider-error": CALL_FAILED,
    "timeout-error": TIMEOUT,
    "late-answer": TIMEOUT,
    "not-json": UNREADABLE,
    "too-large": TOO_LARGE,
    # 제공자가 정상 응답 안에서 생성을 거절함·최대 출력에서 잘림(실제 제공자 어댑터가 알려 준다).
    "refused": UNREADABLE,
    "cut-at-max-output": TOO_LARGE,
    # 거절·잘림·호출 오류여도 시간 제한을 넘겨 끝났으면 시간 초과다.
    "late-refusal": TIMEOUT,
    "late-cut": TIMEOUT,
    "late-call-error": TIMEOUT,
}


def failing_reply(kind: str) -> Reply | Late:
    if kind == "provider-error":
        return ProviderError(f"제공자 내부 오류 {INTERNAL} {SECRET}")
    if kind == "timeout-error":
        return TimeoutError(f"read timed out {INTERNAL}")
    if kind == "late-answer":
        # 시간 제한(45초)을 넘겨 돌아온 정상 응답.
        return Late(naive, GENERATION_TIMEOUT_SECONDS + 1)
    if kind == "not-json":
        return f"생성 결과 {INTERNAL} {SECRET} {{"
    if kind == "refused":
        return UnusableResponse("UNREADABLE")
    if kind == "cut-at-max-output":
        return UnusableResponse("TOO_LARGE")
    if kind == "late-refusal":
        return Late(UnusableResponse("UNREADABLE"), GENERATION_TIMEOUT_SECONDS + 1)
    if kind == "late-cut":
        return Late(UnusableResponse("TOO_LARGE"), GENERATION_TIMEOUT_SECONDS + 1)
    if kind == "late-call-error":
        return Late(
            ProviderError(f"제공자 내부 오류 {INTERNAL} {SECRET}"),
            GENERATION_TIMEOUT_SECONDS + 1,
        )
    assert kind == "too-large"
    return padded(MAX_OUTPUT_BYTES)


@pytest.mark.parametrize("kind", list(WHOLE_FAILURES))
def test_whole_call_failure_fails_draft_and_reflection_once_each(
    kind: str, caplog: pytest.LogCaptureFixture
) -> None:
    """호출 오류·시간 초과·늦은 응답·읽을 수 없는 응답·크기 초과 응답·제공자 거절·최대 출력에서 잘린 응답은
    설명·질문 모두 FAILED이고
    DRAFT·REFLECTION 실패가 각 1건, ANALYSIS는 0건이다(13). 후보는 남고(02) 본문은 null이며(03),
    다시 부르지 않는다(28). 실패 문구에는 제공자 원문·비밀값·내부 오류 글이 없다."""
    clock = FakeClock()
    # 생성은 PR #4(9분)가 먼저다. 그 호출이 실패하고 PR #3은 정상 응답을 받는다.
    provider = ScriptedProvider(failing_reply(kind), naive, clock=clock)

    with caplog.at_level(logging.DEBUG, logger="app.generation"):
        case = generation_case(TWO, provider, clock=clock)

    assert_calls(provider, 2)
    assert paths(provider.requests[0]) == {"app/beta.py"}
    assert_failed_whole(case, 4)
    assert_generated(case, 3)
    assert identities(case.result) == identities(case.before.result)
    assert new_failures(case) == whole_failures(
        WHOLE_FAILURES[kind], entry(case, 4)["candidateId"]
    )
    assert all(each["stage"] != "ANALYSIS" for each in case.result["failures"])
    assert case.result["outcome"] == "PARTIAL_FAILED"
    text = json.dumps(case.result, ensure_ascii=False)
    for leaked in (SECRET, INTERNAL, "Traceback", "read timed out"):
        assert leaked not in text
        assert leaked not in caplog.text


def test_whole_call_failure_is_not_turned_into_missing_material() -> None:
    """크기 선별로 일부만 보내고 부른 호출이 실패해도 재료 부족(NOT_GENERATED)으로 바꾸지 않고 FAILED로
    둔다. 실제로 선별해 불렀으므로 크기 일부 문구가, 온전하지 않은 파일이 있으므로 잘림 문구가 붙는다
    (13·35·36·37)."""
    wide = own(31, 3, short("alpha"), long_line("wide"), cut("broken"))
    provider = ScriptedProvider(ProviderError("제공자 오류"), repeat=False)

    case = generation_case(
        pulls(opened(3, wide)),
        provider,
        limits=GenerationLimits(max_data_bytes=1_000),
    )

    assert_calls(provider, 1)
    # 긴 줄은 빠지고 짧은 줄은 실렸다.
    assert paths(provider.requests[0]) >= {"app/alpha.py"}
    assert all("x" * 1_500 not in each.data for each in provider.requests)
    assert_failed_whole(case, 3)
    assert new_failures(case) == whole_failures(
        CALL_FAILED, entry(case, 3)["candidateId"]
    )
    assert case.run.report.no_material == 0
    added = added_limits(case, 3)
    assert added[pull_url(3)] == ()
    assert set(added[commit_url(wide.sha)]) == {SIZE_PARTIAL, TRUNCATED}
    assert len(added[commit_url(wide.sha)]) == 2


def test_whole_call_failure_keeps_the_collection_failure() -> None:
    """수집 실패가 있는 사례(C29 뒷부분)에서 전체 호출 실패는 기존 수집 실패 뒤에 DRAFT·REFLECTION
    실패만 더하고 후보를 남긴다(02·10·13)."""
    provider = ScriptedProvider(TimeoutError("timed out"), repeat=False)

    case = generation_case(c29_after_details(), provider)

    assert_calls(provider, 1)
    assert case.before.result["failures"] == [
        {
            "stage": "COLLECTION",
            "code": "RATE_LIMITED",
            "message": case.before.result["failures"][0]["message"],
        }
    ]
    assert identities(case.result) == [pull_identity(3)]
    assert_failed_whole(case, 3)
    assert new_failures(case) == whole_failures(TIMEOUT, entry(case, 3)["candidateId"])
    assert case.result["outcome"] == "PARTIAL_FAILED"


# 수집 실패·미제공 집계 보존(10)


def test_collection_failure_and_outcome_are_kept_when_generated() -> None:
    """C29 뒷부분: 생성이 끝나도 기존 수집 실패와 종결값(PARTIAL_FAILED)이 그대로다(10)."""
    provider = ScriptedProvider(naive, repeat=False)

    case = generation_case(c29_after_details(), provider)

    assert_calls(provider, 1)
    assert_generated(case, 3)
    assert case.result["failures"] == case.before.result["failures"]
    assert case.result["outcome"] == case.before.result["outcome"] == "PARTIAL_FAILED"
    assert case.result["notProvided"] == case.before.result["notProvided"]


def test_not_provided_count_is_kept() -> None:
    """미제공 집계(근거 부족 1)가 있는 사례에서도 생성은 집계와 종결값을 바꾸지 않는다(10)."""
    scenario = open_pull_with_direct_commit(lookup=())
    full = run_case(scenario)
    limits = CollectionLimits(max_calls=full.transport.paths.index(detail_path(F)))
    before = run_case(scenario, limits=limits)
    assert before.result["notProvided"] == [
        {"reason": "INSUFFICIENT_EVIDENCE", "count": 1}
    ]
    provider = ScriptedProvider(naive, repeat=False)

    case = generate_after(before, provider)

    assert_calls(provider, 1)
    assert_generated(case, 3)
    assert case.result["notProvided"] == before.result["notProvided"]
    assert case.result["failures"] == []
    assert case.result["outcome"] == "SUCCEEDED"


# 호출 수·시간 한도(결정 9·13)


def test_call_limit_leaves_the_rest_not_generated_with_one_analysis_failure() -> None:
    """호출 수 한도로 부르지 못한 후보는 설명·질문 NOT_GENERATED, 제목 None이고, 그런 후보가 둘이어도
    후보에 묶이지 않은 ANALYSIS 실패는 1건이다(14). 이 후보들에는 크기 문구가 없고 잘림 문구는 붙는다
    (36·37). 한도 밖 후보를 나중에 다시 부르지 않는다(29)."""
    # PR #3(가장 오래됨)에는 자료 상한 1,000 B로 선별하면 일부가 빠질 긴 줄과 온전하지 않은 파일이 있다.
    wide = own(31, 3, short("alpha"), long_line("wide"), cut("broken"))
    scenario = pulls(opened(3, wide), opened(4, BETA), opened(5, GAMMA))
    limits = GenerationLimits(max_generation_calls=1, max_data_bytes=1_000)
    provider = ScriptedProvider(naive, repeat=False)

    case = generation_case(scenario, provider, limits=limits)

    assert_calls(provider, 1)
    assert paths(provider.requests[0]) == {"app/beta.py"}
    assert_generated(case, 4)
    assert_not_generated(case, 3)
    assert_not_generated(case, 5)
    assert new_failures(case) == [BUDGET_FAILURE]
    assert "candidateId" not in new_failures(case)[0]
    assert case.result["outcome"] == "PARTIAL_FAILED"
    assert added_limits(case, 3) == {
        pull_url(3): (),
        commit_url(wide.sha): (TRUNCATED,),
    }
    assert added_limits(case, 5) == {pull_url(5): (), commit_url(GAMMA.sha): ()}
    assert added_limits(case, 4) == {pull_url(4): (), commit_url(BETA.sha): ()}

    # 대조: 호출 수가 넉넉하면 PR #3도 선별을 거쳐 부르고 크기 일부 문구가 붙는다(사례 모양 확인).
    control = generation_case(
        scenario,
        ScriptedProvider(naive),
        limits=GenerationLimits(max_data_bytes=1_000),
    )
    assert set(added_limits(control, 3)[commit_url(wide.sha)]) == {
        SIZE_PARTIAL,
        TRUNCATED,
    }
    assert new_failures(control) == []


def test_short_deadline_leaves_every_candidate_not_generated() -> None:
    """남은 시간이 생성 호출 시간 제한(45초)보다 적으면 새 호출을 시작하지 않는다. 후보가 둘이어도
    ANALYSIS 실패는 1건이고 크기 문구는 붙지 않는다(14·37)."""
    wide = own(31, 3, short("alpha"), long_line("wide"))
    provider = ScriptedProvider()

    case = generation_case(
        pulls(opened(3, wide), opened(4, BETA)),
        provider,
        limits=GenerationLimits(max_data_bytes=1_000),
        deadline=timedelta(seconds=GENERATION_TIMEOUT_SECONDS - 1),
    )

    assert provider.requests == []
    assert_not_generated(case, 3)
    assert_not_generated(case, 4)
    assert new_failures(case) == [BUDGET_FAILURE]
    assert case.result["outcome"] == "PARTIAL_FAILED"
    assert added_limits(case, 3) == {pull_url(3): (), commit_url(wide.sha): ()}
    assert added_limits(case, 4) == {pull_url(4): (), commit_url(BETA.sha): ()}


def test_deadline_exactly_one_call_away_still_starts_calls() -> None:
    """남은 시간이 호출 시간 제한(45초)과 같으면 '적은' 것이 아니므로 새 호출을 시작한다(14·30).
    합성 응답은 시간을 쓰지 않으므로 두 후보 모두 부른다."""
    provider = ScriptedProvider(naive)

    case = generation_case(
        TWO, provider, deadline=timedelta(seconds=GENERATION_TIMEOUT_SECONDS)
    )

    assert_calls(provider, 2)
    assert_generated(case, 3)
    assert_generated(case, 4)
    assert new_failures(case) == []


@pytest.mark.parametrize("seconds", [20.0, GENERATION_TIMEOUT_SECONDS])
def test_late_answer_within_the_limit_is_used_and_shortens_the_rest(
    seconds: float,
) -> None:
    """시간 제한을 넘기지 않고 늦게 온 응답(45초 정각 포함)은 쓴다. 그 사이 남은 시간이 45초보다 적어지면
    다음 후보는 시작하지 않고 한도 미생성으로 둔다(14·30)."""
    clock = FakeClock()
    provider = ScriptedProvider(Late(naive, seconds), clock=clock, repeat=False)

    case = generation_case(TWO, provider, clock=clock, deadline=timedelta(seconds=60))

    assert_calls(provider, 1)
    assert_generated(case, 4)
    assert_not_generated(case, 3)
    assert new_failures(case) == [BUDGET_FAILURE]


def test_started_call_timeout_and_budget_shortfall_are_kept_apart() -> None:
    """이미 시작한 호출의 시간 초과는 그 후보의 DRAFT·REFLECTION 실패이고, 그 뒤 시간이 모자라 시작하지
    못한 후보는 요청당 ANALYSIS 1건이다. 두 원인을 서로 바꾸거나 합치지 않는다(13·14)."""
    clock = FakeClock()
    provider = ScriptedProvider(
        Late(naive, GENERATION_TIMEOUT_SECONDS + 1), clock=clock, repeat=False
    )

    case = generation_case(TWO, provider, clock=clock, deadline=timedelta(seconds=80))

    assert_calls(provider, 1)
    assert_failed_whole(case, 4)
    assert_not_generated(case, 3)
    assert sort_failures(new_failures(case)) == sort_failures(
        [*whole_failures(TIMEOUT, entry(case, 4)["candidateId"]), BUDGET_FAILURE]
    )
    assert case.result["outcome"] == "PARTIAL_FAILED"


def test_call_failure_and_call_limit_keep_each_cause() -> None:
    """한 후보의 전체 호출 실패와 다른 후보들의 호출 수 한도가 함께 생기면 원인별 실패를 모두 두고
    ANALYSIS는 1건이다(13·14)."""
    provider = ScriptedProvider(ProviderError("제공자 오류"), repeat=False)

    case = generation_case(
        THREE, provider, limits=GenerationLimits(max_generation_calls=1)
    )

    assert_calls(provider, 1)
    assert_failed_whole(case, 4)
    assert_not_generated(case, 3)
    assert_not_generated(case, 5)
    assert sort_failures(new_failures(case)) == sort_failures(
        [*whole_failures(CALL_FAILED, entry(case, 4)["candidateId"]), BUDGET_FAILURE]
    )
    assert [each["stage"] for each in case.result["failures"]].count("ANALYSIS") == 1
    assert case.result["outcome"] == "PARTIAL_FAILED"


def test_call_limit_with_collection_failure_keeps_it() -> None:
    """수집 실패가 있는 사례에서 호출 수 한도로 부르지 못하면 수집 실패 뒤에 ANALYSIS 1건만 더한다(10·14)."""
    provider = ScriptedProvider()

    case = generation_case(
        c29_after_details(), provider, limits=GenerationLimits(max_generation_calls=0)
    )

    assert provider.requests == []
    assert_not_generated(case, 3)
    assert new_failures(case) == [BUDGET_FAILURE]
    assert case.result["outcome"] == "PARTIAL_FAILED"


# 생성 순서(결정 9·14)


def test_generation_order_follows_the_newest_own_commit() -> None:
    """생성은 근거에 든 본인 커밋의 가장 최근 작성 시각이 늦은 후보부터, 같으면 그 커밋의 SHA순이다.
    결과의 후보·근거 순서는 바뀌지 않는다(15)."""
    case, provider = ordered_case(PROPOSED_GENERATION_LIMITS)

    assert_calls(provider, 3)
    # PR #5의 최근 커밋은 12분, PR #3·#4는 7분으로 같고 SHA는 PR #4 쪽이 작다.
    assert ["app/gamma.py" in paths(each) for each in provider.requests] == [
        True,
        False,
        False,
    ]
    assert [paths(each) for each in provider.requests[1:]] == [
        {"app/beta.py"},
        {"app/alpha.py"},
    ]
    assert identities(case.result) == identities(case.before.result)
    for before, after in zip(
        case.before.result["candidates"], case.result["candidates"], strict=True
    ):
        assert evidence_urls(after) == evidence_urls(before)


def test_one_generation_call_goes_to_the_most_recent_work() -> None:
    """호출 수 한도가 1이면 가장 최근 작업의 후보만 생성하고 나머지는 한도 미생성이다(14·15)."""
    case, provider = ordered_case(GenerationLimits(max_generation_calls=1))

    assert_calls(provider, 1)
    assert "app/gamma.py" in paths(provider.requests[0])
    assert_generated(case, 5)
    assert_not_generated(case, 3)
    assert_not_generated(case, 4)
    assert new_failures(case) == [BUDGET_FAILURE]
    assert identities(case.result) == identities(case.before.result)


def ordered_case(limits: GenerationLimits) -> tuple[GenerationCase, ScriptedProvider]:
    """PR #3(SHA 36, 7분)·PR #4(SHA 35, 7분)·PR #5(2분 커밋과 12분 커밋). 결과 순서는 PR 번호 쪽이다."""
    alpha = own(0x36, 7, short("alpha"))
    beta = own(0x35, 7, short("beta"))
    older = own(0x37, 2, short("delta"))
    newer = own(0x38, 12, short("gamma"), parent=older.sha)
    scenario = pulls(opened(3, alpha), opened(4, beta), opened(5, older, newer))
    provider = ScriptedProvider(naive)
    case = generation_case(scenario, provider, limits=limits)
    assert identities(case.before.result) == [
        pull_identity(3),
        pull_identity(4),
        pull_identity(5),
    ]
    return case, provider


def committed_at(target: Commit, minute: int) -> Commit:
    """커밋 시각(committer)만 바꾼 커밋. 작성 시각(author)은 그대로다."""
    item = deepcopy(target.item)
    item["commit"]["committer"]["date"] = stamp(minute)
    assert target.detail is not None
    return Commit(item, with_files(item, target.detail["files"]), target.diff)


def test_generation_order_uses_authored_time_not_commit_time() -> None:
    """생성 순서는 작성 시각으로 잰다. 커밋 시각이 더 늦은 후보가 먼저 생성되지 않는다(15)."""
    alpha = committed_at(own(31, 5, short("alpha")), 50)
    beta = committed_at(own(32, 8, short("beta")), 9)
    provider = ScriptedProvider(naive, repeat=False)

    case = generation_case(
        pulls(opened(3, alpha), opened(4, beta)),
        provider,
        limits=GenerationLimits(max_generation_calls=1),
    )

    assert_calls(provider, 1)
    assert paths(provider.requests[0]) == {"app/beta.py"}
    assert_generated(case, 4)
    assert_not_generated(case, 3)


# 제목만 null(26·27)


def unverified_title(request: ProviderRequest) -> str:
    """설명·질문은 확인되는 줄을, 제목은 보내지 않은 줄을 지목한 응답."""
    line = pick(request, change="added", contains="alpha")
    return answer(
        fragments=[line_fragment(line, "alpha")],
        title=code_title("c9f9:L1", "alpha"),
        questions=[question("BACKGROUND")],
    )


def unclassified_title(request: ProviderRequest) -> str:
    """제목이 위치 분류가 안 되는 파일(확장자 없음)을 지목한 응답."""
    line = pick(request, change="added", contains="blob")
    return answer(
        fragments=[line_fragment(line, "blob")],
        title=file_title(file_id_of(request, "tools/blob")),
        questions=[question("BACKGROUND")],
    )


TITLE_ONLY_NULL: dict[str, tuple[dict[str, Any], Callable[[ProviderRequest], str]]] = {
    "unverified-line": (short("alpha"), unverified_title),
    "unclassified-file": (
        change("tools/blob", patch="@@ -1 +1 @@\n-blob = 1\n+blob = 2"),
        unclassified_title,
    ),
}


@pytest.mark.parametrize("kind", list(TITLE_ONLY_NULL))
def test_title_only_null_keeps_failures_and_outcome(
    kind: str, caplog: pytest.LogCaptureFixture
) -> None:
    """설명·질문은 생성됐는데 제목만 null이면 failures·outcome이 바뀌지 않고(26), 확인 실패라 고쳐 쓰지
    않으며(28), 제목만 null인 건수가 운영 로그에 남는다(27)."""
    file, reply = TITLE_ONLY_NULL[kind]
    target = own(31, 3, file)
    provider = ScriptedProvider(reply, repeat=False)

    with caplog.at_level(logging.INFO, logger="app.generation"):
        case = generation_case(pulls(opened(3, target)), provider)

    assert_calls(provider, 1)
    each = generated(case, 3)
    assert each.draft.status == "GENERATED"
    assert each.reflection.status == "GENERATED"
    assert each.title is None
    assert case.result["failures"] == case.before.result["failures"] == []
    assert case.result["outcome"] == case.before.result["outcome"] == "SUCCEEDED"
    assert entry(case, 3)["title"] is None
    assert case.run.report.title_only_null == 1
    assert "titleOnlyNull=1" in caplog.text


# 호출마다 넘기는 상한(30)과 예외 경계


def test_call_limits_are_passed_and_applied_per_call() -> None:
    """호출마다 정한 시간 제한·응답 크기 상한을 제공자에 넘기고, 그 값으로 늦은 응답·큰 응답을 거른다(30)."""
    clock = FakeClock()
    limits = GenerationLimits(generation_timeout_seconds=12.5, max_output_bytes=1_500)
    provider = ScriptedProvider(Late(naive, 13), padded(1_500), clock=clock)

    case = generation_case(TWO, provider, limits=limits, clock=clock)

    assert_calls(provider, 2, timeout=12.5, max_output=1_500)
    # 두 번째 응답은 기본 상한(4,000 B) 안이지만 이 요청의 상한(1,500 B)은 넘는다.
    assert len(padded(1_500)(provider.requests[1]).encode()) < MAX_OUTPUT_BYTES
    assert_failed_whole(case, 4)
    assert_failed_whole(case, 3)
    assert sort_failures(new_failures(case)) == sort_failures(
        [
            *whole_failures(TIMEOUT, entry(case, 4)["candidateId"]),
            *whole_failures(TOO_LARGE, entry(case, 3)["candidateId"]),
        ]
    )


DEFECTS: dict[str, Callable[[], BaseException]] = {
    "execution-unknown": lambda: ExecutionUnknown("상태를 확인하지 못했다"),
    "runtime-error": lambda: RuntimeError("어댑터 결함"),
}


@pytest.mark.parametrize("kind", list(DEFECTS))
def test_other_provider_exceptions_are_not_turned_into_results(kind: str) -> None:
    """제공자의 실행 여부 불명(ExecutionUnknown)과 그 밖의 예외는 후보 결과로 바꾸지 않고 그대로 올리며,
    다시 부르지 않는다(14·28)."""
    error = DEFECTS[kind]()
    provider = ScriptedProvider(error, repeat=False)

    with pytest.raises(type(error)) as raised:
        generation_case(TWO, provider)

    assert raised.value is error
    assert len(provider.requests) == 1


def test_timeout_error_does_not_escape_the_generation() -> None:
    """제공자의 TimeoutError는 그 후보의 시간 초과 실패로 바뀌고 밖으로 새지 않는다. 그래서 요청 전체가
    실행 여부 불명이 되지 않는다(14)."""
    provider = ScriptedProvider(TimeoutError("timed out"))

    case = generation_case(TWO, provider)

    assert_calls(provider, 2)
    assert_failed_whole(case, 3)
    assert_failed_whole(case, 4)
    assert {each["code"] for each in new_failures(case)} == {TIMEOUT}
    assert len(new_failures(case)) == 4


def test_failed_generation_keeps_the_candidate_eligible() -> None:
    """생성이 실패한 후보도 적합성(작업 사실·본인 기여·실패와 분리) 표시를 그대로 둔 채 결과에 남고,
    설명·질문 실패는 후보 상태로만 넘어가 생성 결과의 요청 단위 실패에 섞이지 않는다(02)."""
    provider = ScriptedProvider(ProviderError("제공자 오류"), naive)

    case = generation_case(TWO, provider)

    assert case.output.failures == case.before.output.failures
    assert len(case.output.candidates) == len(case.before.output.candidates)
    failed: Mapping[str, Any] = entry(case, 4)
    assert (
        failed["eligibility"]
        == candidate(case.before.result, pull_identity(4))["eligibility"]
    )
    assert failed["eligibility"] == {
        "workFactsVerified": True,
        "contributionVerified": True,
        "independentOfFailures": True,
    }
    assert failed["workFacts"] == list(generated(case, 4).work_facts)


# 교차검증(GPT-6.1-Sol)에서 찾은 경계


def test_time_spent_on_selection_is_checked_before_the_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """크기 선별에 시간이 걸려 호출 시간 제한만큼 남지 않으면 부르지 않는다. 부르지 못한 후보이므로
    NOT_GENERATED·요청당 ANALYSIS 1건이고 크기 문구는 없다(14, 결정 9·13)."""
    import app.generation.flow as flow_module
    from app.generation.request import select as real_select

    clock = FakeClock()

    def slow_select(*args: Any, **kwargs: Any) -> Any:
        clock.advance(1)
        return real_select(*args, **kwargs)

    monkeypatch.setattr(flow_module, "select", slow_select)
    provider = ScriptedProvider()

    case = generation_case(
        pulls(opened(3, own(31, 3, short("alpha")))),
        provider,
        clock=clock,
        deadline=timedelta(seconds=GENERATION_TIMEOUT_SECONDS),
    )

    assert provider.requests == []
    assert_not_generated(case, 3)
    assert new_failures(case) == [BUDGET_FAILURE]
    assert added_limits(case, 3) == {pull_url(3): (), commit_url(sha(31)): ()}


def test_data_limit_below_the_empty_frame_sends_nothing() -> None:
    """빈 자료 틀도 담지 못하는 자료 상한이면 모든 줄을 크기 상한으로 뺀 것으로 보고 부르지 않는다(예외
    없이 NOT_GENERATED, 크기 전체 문구)."""
    provider = ScriptedProvider()

    case = generation_case(
        pulls(opened(3, own(31, 3, short("alpha")))),
        provider,
        limits=GenerationLimits(max_data_bytes=1),
    )

    assert provider.requests == []
    assert_not_generated(case, 3)
    assert new_failures(case) == []
    assert added_limits(case, 3) == {pull_url(3): (), commit_url(sha(31)): (SIZE_FULL,)}


def test_rewrites_per_title_cannot_exceed_three() -> None:
    """제목당 고쳐 쓰기 3회는 팀장 결정이라 설정으로 늘릴 수 없다(24)."""
    with pytest.raises(ValueError):
        GenerationLimits(max_rewrites_per_title=4)
    assert GenerationLimits(max_rewrites_per_title=3).max_rewrites_per_title == 3


def test_huge_hunk_number_excludes_only_that_file() -> None:
    """hunk 머리글 숫자가 아주 길어도 처리 전체를 멈추지 않고, 그 파일만 온전하지 않은 파일로 빼고
    나머지로 생성한다(08·36)."""
    broken = change(
        "app/broken.py",
        patch="@@ -" + "1" * 4_301 + " +1 @@\n-a = 1\n+a = 2",
        additions=1,
        deletions=1,
    )
    provider = ScriptedProvider(naive)

    case = generation_case(
        pulls(opened(3, own(31, 3, short("alpha"), broken))),
        provider,
    )

    assert len(provider.generate_requests()) == 1
    assert paths(provider.requests[0]) == {"app/alpha.py"}
    assert generated(case, 3).draft.status == "GENERATED"
    assert added_limits(case, 3)[commit_url(sha(31))] == (TRUNCATED,)


# 제목 우선순위(CR1 BR3.1~BR3.3, S16, NFR1.1·NFR2.1)

RECORD_TITLE = "로그인 오류 수정"
RECORD_MESSAGE = "결제 실패 알림 메모"


def titled(number: int, title: str, *commits: Commit) -> Pull:
    """연동 계정이 연 열린 PR. 커밋 목록을 끝까지 받고 본인 커밋뿐이라 PR 제목이 기록의 글이다."""
    return Pull(number, MEMBER, commits, state="open", created=number - 1, title=title)


def own_message(
    number: int, minute: int, message: str, *files: dict[str, Any]
) -> Commit:
    return commit(
        sha(number),
        MEMBER,
        parents=(ROOT,),
        minute=minute,
        message=message,
        files=files,
    )


def without_title(request: ProviderRequest) -> str:
    """조각 제목만 빠진 응답(형식 위반 MISSING). 조각 제목이면 고쳐 쓰기 대상이다."""
    value = json.loads(naive(request))
    del value["title"]
    return json.dumps(value)


@pytest.mark.parametrize(
    "reply",
    [ProviderError(), TimeoutError(), "{not json"],
    ids=["call-failed", "timeout", "unreadable"],
)
def test_s16_failed_generation_keeps_the_record_text_title(reply: Reply) -> None:
    """S16: 생성 호출이 실패해도 쓸 만한 기록의 글이 제목이다. 설명 초안은 실패, 고쳐 쓰기 호출은 없다."""
    provider = ScriptedProvider(reply)

    case = generation_case(
        pulls(titled(3, RECORD_TITLE, own(31, 3, short("alpha")))), provider
    )

    each = generated(case, 3)
    assert each.title == RECORD_TITLE
    assert each.draft.status == "FAILED"
    assert entry(case, 3)["title"] == RECORD_TITLE
    assert entry(case, 3)["workFacts"] == [
        "PR #3, 상태 열림",
        f'PR 제목: "{RECORD_TITLE}"',
    ]
    assert provider.rewrite_requests() == []
    assert case.run.report.rewrite_calls == 0


def test_record_text_title_skips_rewriting_a_broken_fragment_title(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """BR3.3·NFR2.1: 조각 제목이 형식을 어겨도 기록의 글이 제목이면 고쳐 쓰기를 부르지 않는다. 생성 호출은
    후보마다 한 번 그대로다. 「제목만 없음」은 최종 제목 기준이라 세지 않는다."""
    provider = ScriptedProvider(without_title, repeat=False)

    with caplog.at_level(logging.INFO, logger="app.generation"):
        case = generation_case(
            pulls(titled(3, RECORD_TITLE, own(31, 3, short("alpha")))), provider
        )

    assert_calls(provider, 1)
    each = generated(case, 3)
    assert each.title == RECORD_TITLE
    assert each.draft.status == "GENERATED"
    assert case.run.report.rewrite_calls == 0
    assert case.run.report.title_only_null == 0
    assert "rewriteCalls=0" in caplog.text
    assert "titleOnlyNull=0" in caplog.text


def test_weak_record_text_leaves_the_fragment_title_and_its_rewrite() -> None:
    """BR3.2: 기록의 글이 부실하면(PR 제목 「WIP」) 조각 제목 경로다. 형식을 어긴 조각 제목은 고쳐 쓴다."""

    def reply(request: ProviderRequest) -> str:
        if request.purpose == "REWRITE_TITLE":
            line = json.loads(request.data)["lines"][0]
            return json.dumps({"title": code_title(line["id"], line["names"][0])})
        return without_title(request)

    provider = ScriptedProvider(reply)

    case = generation_case(
        pulls(titled(3, "WIP", own(31, 3, short("alpha")))), provider
    )

    each = generated(case, 3)
    assert each.record_text is not None and each.record_text.weak
    assert len(provider.rewrite_requests()) == 1
    assert each.title == "alpha 코드 수정"
    assert len(each.work_facts) == 1


def test_record_text_title_is_counted_out_of_title_only_null() -> None:
    """「제목만 없음」은 최종 제목이 없는 후보만 센다. 조각 제목이 null이어도 기록의 글이 제목이면 0이다."""

    def unverified(request: ProviderRequest) -> str:
        value = json.loads(naive(request))
        value["title"] = code_title(pick(request), "notInTheLine")
        return json.dumps(value)

    provider = ScriptedProvider(unverified)

    record_case = generation_case(
        pulls(titled(3, RECORD_TITLE, own(31, 3, short("alpha")))), provider
    )
    weak_case = generation_case(
        pulls(titled(3, "wip", own(31, 3, short("alpha")))),
        ScriptedProvider(unverified),
    )

    assert generated(record_case, 3).title == RECORD_TITLE
    assert record_case.run.report.title_only_null == 0
    assert generated(weak_case, 3).title is None
    assert weak_case.run.report.title_only_null == 1


def test_record_text_never_reaches_the_generation_request() -> None:
    """NFR1.1: 생성 요청에는 바뀐 줄만 보낸다. PR 제목·커밋 첫 줄(기록의 글)은 요청 본문에 없다."""
    provider = ScriptedProvider(naive)
    other_title = "다른 PR 제목 표식"

    case = generation_case(
        pulls(
            titled(3, RECORD_TITLE, own_message(31, 3, RECORD_MESSAGE, short("alpha"))),
            Pull(
                4,
                MEMBER,
                (own_message(32, 9, RECORD_MESSAGE + " 둘째", short("beta")),),
                state="open",
                created=3,
                title=other_title,
            ),
        ),
        provider,
    )

    assert generated(case, 3).title == RECORD_TITLE
    assert generated(case, 4).title == other_title
    for request in provider.requests:
        for text in (RECORD_TITLE, RECORD_MESSAGE, other_title):
            assert text not in request.data
            assert text not in request.instructions


def test_budget_skipped_candidate_still_gets_the_record_text_title() -> None:
    """마감이 가까워 생성 호출을 건너뛰어도(budget_skipped) 기록의 글 제목은 남는다(BR3.1, S16의 건너뜀 갈래)."""
    provider = ScriptedProvider(naive)

    case = generation_case(
        pulls(titled(3, RECORD_TITLE, own(31, 3, short("alpha")))),
        provider,
        deadline=timedelta(seconds=GENERATION_TIMEOUT_SECONDS - 1),
    )

    assert provider.requests == []
    assert case.run.report.budget_skipped == 1
    each = generated(case, 3)
    assert each.title == RECORD_TITLE
    assert each.draft.status == "NOT_GENERATED"
    assert entry(case, 3)["title"] == RECORD_TITLE
    assert case.run.report.title_only_null == 0


def test_candidate_without_material_still_gets_the_record_text_title() -> None:
    """고를 줄이 없어 생성 호출을 건너뛰어도 기록의 글 제목은 남는다(BR3.1)."""
    target = own(31, 3, change("assets/logo.png", with_patch=False))
    provider = ScriptedProvider(naive)

    case = generation_case(pulls(titled(3, RECORD_TITLE, target)), provider)

    assert provider.requests == []
    each = generated(case, 3)
    assert each.title == RECORD_TITLE
    assert each.draft.status == "NOT_GENERATED"
    assert case.run.report.no_material == 1


# CR3 AI 쪽: 판정 공급자를 넘긴 생성 흐름(기능 설계 functional-spec.md 3절 시나리오)
#
# 판정은 합성 판정 어댑터(`app.judgement.synthetic.SyntheticJudge`)가 질문 종류·대상마다 정해 둔 답을 돌려준다.
# 기대값은 rules.md(BR2~BR6)와 시나리오 표에서 정했다. 실패 조건(unit-test-instructions.md): AI 쪽이 꺼졌는데
# 판정 호출이 나감, 같은 후보에 판정 두 번, 판정 요청에 정해진 칸 밖 자료, 판정 없이 AI 글이 제목·설명이 됨,
# 작업 사실에 생성 출력, 같은 기록의 글을 제목·둘째 줄이 다르게 판단, 원문이 로그에 남음.

JUDGEMENT_TIMEOUT = "JUDGEMENT_TIMEOUT"
MISSING = object()
SECOND_LINE = f'PR 제목: "{RECORD_TITLE}"'


def choose(option: str, probability: float) -> Callable[[Question], object]:
    """고르기 답: 그 선택지에 probability, 나머지에 남은 확률을 고르게."""

    def value(question: Question) -> object:
        rest = (1 - probability) / max(len(question.options) - 1, 1)
        return [probability if each == option else rest for each in question.options]

    return value


def answers(**values: object) -> Callable[[Question], object | None]:
    """질문 종류(또는 `종류__대상`)마다의 답. 값이 MISSING이면 답하지 않는다. 없는 종류는 모두 통과하는 답."""

    def answer(question: Question) -> object | None:
        value = values.get(f"{question.kind}__{question.target}", MISSING)
        if value is MISSING:
            value = values.get(question.kind, default_answer(question))
        if value is MISSING:
            return None
        return value(question) if callable(value) else value

    return answer


def ai_case(
    scenario: Scenario,
    reply: Reply = naive_ai,
    *,
    judge: SyntheticJudge | None = None,
    **options: Any,
) -> tuple[GenerationCase, SyntheticJudge]:
    judge = judge or SyntheticJudge()
    provider = ScriptedProvider(reply)
    case = generation_case(scenario, provider, judge=judge, **options)
    return case, judge


def catch_questions(judge: SyntheticJudge, index: int = 0) -> dict[str, Question]:
    return {
        f"{each.kind}:{each.target}": each
        for each in judge.catch_requests()[index].questions
    }


def record_pull(*files: dict[str, Any], number: int = 3) -> Scenario:
    """쓸 만한 PR 제목(RECORD_TITLE)이 기록의 글인 열린 PR 하나."""
    return pulls(titled(number, RECORD_TITLE, own(30 + number, 3, *files)))


# Step 9: 생성 요청·응답의 AI 쪽(BR2.4·BR3.1·BR5.1)


def test_s3_ai_generation_returns_title_candidates_citing_lines() -> None:
    """S3: AI 쪽이 켜지면 기록의 글이 쓸 만해도 생성 응답에 제목 후보가 있고 후보마다 근거 줄이 있다. 생성
    요청은 AI 지시문이고 자료에 PR 제목·커밋 메시지가 없다(BR2.4)."""
    seen: list[ProviderRequest] = []

    def reply(request: ProviderRequest) -> str:
        seen.append(request)
        return naive_ai(request)

    case, judge = ai_case(
        pulls(
            titled(3, RECORD_TITLE, own_message(31, 3, RECORD_MESSAGE, short("alpha")))
        ),
        reply,
    )

    (request,) = seen
    assert request.ai_side is True
    assert "titleCandidates" in request.instructions
    for text in (RECORD_TITLE, RECORD_MESSAGE):
        assert text not in request.data and text not in request.instructions
    questions = catch_questions(judge)
    assert set(questions) == {
        "RECORD_WHAT:record",
        "TITLE_CHOICE:title",
        "SENTENCE_TRUE:s1",
    }
    data = json.loads(judge.catch_requests()[0].data)
    assert data["titles"] == [
        {
            "id": "t1",
            "text": "alpha 값 변경",
            "lines": [pick(request, change="added", contains="alpha").id],
        }
    ]
    assert data["record"] == RECORD_TITLE
    # 모두 통과하면 기록의 글이 제목이다(BR3.4의 1).
    assert generated(case, 3).title == RECORD_TITLE


def test_generation_request_without_judge_is_the_template_request() -> None:
    """S1의 생성 쪽: 판정 공급자가 없으면 지금 지시문·응답 그대로이고 판정 호출은 0번이다(BR1.3)."""
    provider = ScriptedProvider(naive)

    case = generation_case(record_pull(short("alpha")), provider)

    (request,) = provider.requests
    assert request.ai_side is False
    assert "titleCandidates" not in request.instructions
    assert case.run.report.ai_side is False
    assert case.run.report.catch_judgements == 0
    assert case.run.report.judgement_provider == "-"


WRITTEN = (
    "알파 값을 바꾸게 된 배경은 무엇이었나요?",
    "이 작업이 의도대로 동작하는지 확인했다면 어떻게 확인했나요?",
)


@pytest.mark.parametrize("ai_side", [False, True], ids=["ai-off", "ai-on"])
def test_questions_are_the_model_text_on_both_sides(ai_side: bool) -> None:
    """#487: AI 쪽을 끄든 켜든 같은 질문 지시를 보내고, 질문은 AI가 쓴 글 그대로다(틀 문장이 아니다).

    질문은 판정·기계 대조를 거치지 않는다: 켰을 때 판정 요청에 질문 글이 없다.
    """
    seen: list[ProviderRequest] = []

    def reply(request: ProviderRequest) -> str:
        seen.append(request)
        value = json.loads(naive_ai(request) if ai_side else naive(request))
        value["questions"] = [
            question("BACKGROUND", WRITTEN[0]),
            question("VERIFICATION", WRITTEN[1]),
        ]
        return json.dumps(value, ensure_ascii=False)

    scenario = pulls(opened(3, ALPHA))
    if ai_side:
        case, judge = ai_case(scenario, reply)
        for each in judge.catch_requests():
            for text in WRITTEN:
                assert text not in each.data and text not in each.instructions
    else:
        case = generation_case(scenario, ScriptedProvider(reply))

    (request,) = seen
    assert request.ai_side is ai_side
    assert QUESTION_RULES in request.instructions
    made = generated(case, 3)
    assert made.reflection.status == "GENERATED"
    assert made.reflection.questions == WRITTEN
    for text in made.reflection.questions:
        assert "이름이 포함된 줄을" not in text


def test_s18_title_candidate_over_40_chars_is_dropped_without_rewriting() -> None:
    """S18: 41자 AI 후보는 버려지고 고쳐 쓰기 호출이 없다."""
    long_text = "alpha " + "가" * 35

    def reply(request: ProviderRequest) -> str:
        line = pick(request, contains="alpha")
        assert len(long_text) == 41
        return ai_answer(
            titles=[written(long_text, line)],
            sentences=[written("alpha 줄을 바꿨습니다.", line)],
            title={"target": "CODE_NAME", "line": line.id},
            questions=[question("BACKGROUND")],
        )

    case, judge = ai_case(pulls(opened(3, ALPHA)), reply)

    assert case.provider.rewrite_requests() == []
    assert "TITLE_CHOICE:title" not in catch_questions(judge)
    assert case.run.report.ai_notes["dropped:TOO_LONG"] == 1
    # 조각 제목도 형식 위반이라 고쳐 쓰지 않아 제목이 없다(BR3.4의 4).
    assert generated(case, 3).title is None


def test_s30_response_without_sentences_is_an_unreadable_generation() -> None:
    """S30: 생성 응답에 문장 칸이 없으면 읽을 수 없는 응답이다. 설명·질문 FAILED, 판정은 보내지 않는다."""

    def reply(request: ProviderRequest) -> str:
        value = json.loads(naive_ai(request))
        del value["sentences"]
        return json.dumps(value)

    case, judge = ai_case(pulls(opened(3, ALPHA)), reply)

    each = generated(case, 3)
    assert each.draft.status == "FAILED"
    assert each.draft.failure is not None
    assert each.draft.failure.code == UNREADABLE
    assert each.reflection.status == "FAILED"
    assert judge.requests == []
    assert new_failures(case) == whole_failures(
        UNREADABLE, entry(case, 3)["candidateId"]
    )


def test_sentences_with_unknown_or_masked_lines_are_dropped() -> None:
    """근거 줄이 없거나 보낸 자료에 없는 줄을 가리킨 문장은 버린다. 칸은 맞지만 모두 버려지면 판정할 문장이 없다."""

    def reply(request: ProviderRequest) -> str:
        line = pick(request, contains="alpha")
        return ai_answer(
            titles=[],
            sentences=[
                written("alpha 줄을 바꿨습니다.", "c9f9:L1"),
                {"text": "alpha 줄을 바꿨습니다.", "lines": []},
                {"text": "alpha", "lines": [line.id], "extra": 1},
            ],
            title=code_title(line, "alpha"),
            questions=[question("BACKGROUND")],
        )

    case, judge = ai_case(pulls(opened(3, ALPHA)), reply)

    assert judge.requests == []
    assert generated(case, 3).draft.status == "NOT_GENERATED"
    assert generated(case, 3).title == "alpha 코드 수정"
    assert case.run.report.ai_notes == Counter(
        {"dropped:UNKNOWN_LINE": 1, "dropped:ITEM_SHAPE": 2}
    )


# Step 10: 순서·시간 몫·상한(BR2.1·BR2.2·BR2.6·BR6.1, 비기능 설계 「호출 순서」·「마감 확인」)

# 작은 자료 상한. 한 줄짜리 파일 후보는 작은 후보로, 파일 여덟 개 후보는 큰 후보로 담긴다.
SMALL_DATA = GenerationLimits(max_data_bytes=700)


def big(number: int, minute: int) -> Commit:
    """`app/` 아래 한 줄 파일 여덟 개를 고친 본인 커밋. 작은 자료 상한에서 큰 후보다."""
    return own(number, minute, *(short(f"delta{index}") for index in range(8)))


def with_big() -> Scenario:
    """S7: Catch 셋(PR #3 alpha, #4 beta, #6 큰 후보)."""
    return pulls(opened(3, ALPHA), opened(4, BETA), opened(6, big(36, 12)))


def purposes(judge: SyntheticJudge) -> list[str]:
    return [request.purpose for request in judge.requests]


def test_s7_one_judgement_per_catch_and_one_material_judgement_for_the_big_one() -> (
    None
):
    """S7: Catch 3개(큰 후보 1개)면 Catch 판정 3번, 재료 판정 1번이다. 후보마다 재료 판정 → 생성 → 판정 순서다."""
    order: list[str] = []
    judge = SyntheticJudge(before=lambda request: order.append(request.purpose))

    def reply(request: ProviderRequest) -> str:
        order.append("GENERATE")
        return naive_ai(request)

    case, _ = ai_case(with_big(), reply, judge=judge, limits=SMALL_DATA)

    assert purposes(judge).count("CATCH") == 3
    assert purposes(judge).count("MATERIAL") == 1
    assert len(judge.requests) <= 4
    # 큰 후보(PR #6, 12분)가 가장 먼저 생성된다: 재료 판정 → 생성 → Catch 판정, 그다음 후보.
    assert order == [
        "MATERIAL",
        "GENERATE",
        "CATCH",
        "GENERATE",
        "CATCH",
        "GENERATE",
        "CATCH",
    ]
    assert case.run.report.catch_judgements == 3
    assert case.run.report.material_judgements == 1
    (material,) = judge.material_requests()
    assert {question.kind for question in material.questions} == {"MATERIAL_SCORE"}


@pytest.mark.parametrize(
    "failure",
    ["JUDGEMENT_TIMEOUT", "JUDGEMENT_CALL_FAILED", "JUDGEMENT_RESPONSE_UNREADABLE"],
)
def test_s7_failed_judgements_are_not_sent_again(failure: str) -> None:
    """S7·NFR2.5: 판정이 실패해도 같은 후보에 다시 보내지 않는다(재료 1 + Catch 3 = 4번)."""
    judge = SyntheticJudge(failure=failure)  # type: ignore[arg-type]

    case, _ = ai_case(with_big(), judge=judge, limits=SMALL_DATA)

    assert len(judge.requests) == 4
    assert case.run.report.material_judgement_reasons == Counter({failure: 1})
    assert case.run.report.catch_judgement_reasons == Counter({failure: 3})


def test_s1_no_judge_means_no_judgement_calls() -> None:
    """S1: AI 쪽이 꺼지면(판정 공급자 없음) 큰 후보가 있어도 판정 호출이 0번이고 재료는 CR1 규칙 순서다."""
    provider = ScriptedProvider(naive)
    case = generation_case(with_big(), provider, limits=SMALL_DATA)
    assert case.run.report.catch_judgements == 0
    assert case.run.report.material_judgements == 0
    assert all(request.ai_side is False for request in provider.requests)


@pytest.mark.parametrize(
    ("files", "reply", "deadline", "draft"),
    [
        (
            (change("assets/logo.png", with_patch=False),),
            naive_ai,
            None,
            "NOT_GENERATED",
        ),
        # 생성 시간 제한 45초 + 판정 몫 20초가 남지 않아 생성을 건너뛴다.
        ((short("alpha"),), naive_ai, 64, "NOT_GENERATED"),
        ((short("alpha"),), ProviderError(), None, "FAILED"),
    ],
    ids=["no-material", "generation-skipped", "generation-failed"],
)
def test_s27_no_generation_response_means_no_judgement(
    files: tuple[dict[str, Any], ...],
    reply: Reply,
    deadline: float | None,
    draft: str,
) -> None:
    """S27: 생성 응답이 없는 Catch는 판정하지 않는다. 설명은 지금 상태, 제목·둘째 줄은 「판정 없음」(규칙 결과)."""
    options: dict[str, Any] = {}
    if deadline is not None:
        options["deadline"] = timedelta(seconds=deadline)

    case, judge = ai_case(record_pull(*files), reply, **options)

    assert judge.requests == []
    each = generated(case, 3)
    assert each.draft.status == draft
    assert each.title == RECORD_TITLE
    assert entry(case, 3)["workFacts"] == ["PR #3, 상태 열림", SECOND_LINE]


class DriftClock(FakeClock):
    """drift를 켜면 읽을 때마다 1초씩 간다(생성 뒤 로컬 처리에 시간이 걸린 것을 흉내 낸다)."""

    drift = False

    def __call__(self) -> datetime:
        if self.drift:
            self.advance(1)
        return self.now


def test_s28_no_time_left_for_judgement_after_generation() -> None:
    """S28: 생성 뒤 마감까지 판정 시간(20초)이 남지 않으면 판정하지 않는다. 설명 NOT_GENERATED, 요청 실패
    GENERATION_BUDGET_EXHAUSTED 1건, 제목·둘째 줄은 판정 없음."""
    clock = DriftClock()

    def reply(request: ProviderRequest) -> str:
        clock.advance(44)
        clock.drift = True
        return naive_ai(request)

    case, judge = ai_case(
        record_pull(short("alpha")),
        reply,
        clock=clock,
        deadline=timedelta(seconds=65),
    )

    assert judge.requests == []
    each = generated(case, 3)
    assert each.draft.status == "NOT_GENERATED"
    assert each.reflection.status == "GENERATED"
    assert each.title == RECORD_TITLE
    assert entry(case, 3)["workFacts"] == ["PR #3, 상태 열림", SECOND_LINE]
    assert new_failures(case) == [BUDGET_FAILURE]
    assert case.run.report.judgement_skipped == 1


def test_judgement_cap_stops_judging_later_catches() -> None:
    """NFR2.3: Catch 판정 상한(작게 둔 1번)에 닿은 뒤의 Catch는 판정하지 않는다. 요청 실패는 1건뿐이다."""
    limits = GenerationLimits(max_catch_judgement_calls=1)

    case, judge = ai_case(THREE, limits=limits)

    assert len(judge.catch_requests()) == 1
    statuses = [generated(case, number).draft.status for number in (3, 4, 5)]
    assert statuses.count("GENERATED") == 1
    assert statuses.count("NOT_GENERATED") == 2
    assert new_failures(case) == [BUDGET_FAILURE]
    assert case.run.report.judgement_skipped == 2


def test_material_judgement_needs_time_for_generation_and_judgement() -> None:
    """재료 판정은 「남은 시간 ≥ 20 + 45 + 20초」일 때만 한다. 모자라면 재료 판정 없이 규칙 순서로 담고 생성한다."""
    case, judge = ai_case(
        pulls(opened(6, big(36, 12))),
        limits=SMALL_DATA,
        deadline=timedelta(seconds=84),
    )

    assert judge.material_requests() == []
    assert len(judge.catch_requests()) == 1
    assert case.run.report.material_skipped == 1
    assert generated(case, 6).draft.status == "GENERATED"


def test_small_candidate_gets_no_material_judgement() -> None:
    """작은 후보에는 재료 판정을 보내지 않는다(BR6.1)."""
    case, judge = ai_case(pulls(opened(3, ALPHA)), limits=SMALL_DATA)
    assert judge.material_requests() == []
    assert case.run.report.material_judgements == 0


# Step 11: 판정 답 적용 — 제목·둘째 줄·설명(BR3.4·BR3.5·BR4.1·BR4.2·BR5.2~BR5.4)


def three_sentences(request: ProviderRequest) -> str:
    """후보 둘(alpha 값 변경·alpha 줄 수정)과 문장 셋(모두 기계 대조 통과)."""
    line = pick(request, change="added", contains="alpha")
    return ai_answer(
        titles=[written("alpha 값 변경", line), written("alpha 줄 수정", line)],
        sentences=[
            written("alpha 값을 2로 바꿨습니다.", line),
            written("app/alpha.py의 한 줄이 바뀌었습니다.", line),
            written("alpha 줄이 더해졌습니다.", line),
        ],
        title=code_title(line, "alpha"),
        questions=[question("BACKGROUND")],
    )


def test_s5_weak_record_by_judgement_takes_the_ai_title_and_drops_the_second_line() -> (
    None
):
    """S5: RECORD_WHAT 0.4, 후보 A 고르기 0.93이면 제목은 A이고 작업 사실 둘째 줄을 지운다."""
    judge = SyntheticJudge(answers(RECORD_WHAT=0.4, TITLE_CHOICE=choose("t1", 0.93)))

    case, _ = ai_case(record_pull(short("alpha")), three_sentences, judge=judge)

    each = generated(case, 3)
    assert each.title == "alpha 값 변경"
    assert entry(case, 3)["workFacts"] == ["PR #3, 상태 열림"]
    assert entry(case, 3)["title"] == "alpha 값 변경"
    assert case.run.report.second_lines_removed == 1
    assert case.run.report.title_sources == Counter({"AI": 1})


def whole_scenario() -> Scenario:
    """본인 커밋 둘과 다른 계정 커밋 하나가 든 열린 PR #3: 기록의 글은 본인 커밋 첫 줄이고 RECORD_WHOLE도 묻는다."""
    first = own_message(41, 2, "alpha 값을 2로 바꿈", short("alpha"))
    second = commit(
        sha(42), MEMBER, parents=(first.sha,), minute=3, files=[short("beta")]
    )
    other = commit(
        sha(43), OTHER, parents=(second.sha,), minute=4, files=[short("gamma")]
    )
    return pulls(Pull(3, MEMBER, (first, second, other), state="open", created=1))


def test_s6_record_failing_only_the_whole_check_stays_the_title() -> None:
    """S6: 기록의 글이 RECORD_WHOLE만 0.4이고 후보가 모두 0.9 미만이면 제목은 그 기록의 글, 둘째 줄은 남는다."""
    judge = SyntheticJudge(
        answers(RECORD_WHAT=0.8, RECORD_WHOLE=0.4, TITLE_CHOICE=choose("t1", 0.6))
    )

    case, _ = ai_case(whole_scenario(), three_sentences, judge=judge)

    record = case.before.output.candidates[0].record_text
    assert record is not None and record.source == "COMMIT_FIRST_LINE"
    assert "RECORD_WHOLE:record" in catch_questions(judge)
    each = case.output.candidates[0]
    assert each.title == "alpha 값을 2로 바꿈"
    assert each.work_facts == case.before.output.candidates[0].work_facts
    assert len(each.work_facts) == 2
    assert case.run.report.title_sources == Counter({"RECORD_WHOLE_MISS": 1})
    assert case.run.report.below_threshold_titles == 2


def test_record_failing_the_whole_check_yields_to_a_chosen_ai_title() -> None:
    """BR3.4: 전체 미달 기록의 글보다 0.9 이상인 AI 후보가 앞선다. 둘째 줄은 전체 미달만으로 지우지 않는다."""
    judge = SyntheticJudge(
        answers(RECORD_WHAT=0.8, RECORD_WHOLE=0.4, TITLE_CHOICE=choose("t2", 0.95))
    )

    case, _ = ai_case(whole_scenario(), three_sentences, judge=judge)

    each = case.output.candidates[0]
    assert each.title == "alpha 줄 수정"
    assert len(each.work_facts) == 2


def test_s9_only_sentences_at_or_above_0_9_are_kept() -> None:
    """S9: 문장 셋 가운데 하나가 0.85면 설명은 나머지 두 문장을 응답 순서대로 이은 글이다."""
    judge = SyntheticJudge(answers(SENTENCE_TRUE__s2=0.85, SENTENCE_TRUE=0.9))

    case, _ = ai_case(pulls(opened(3, ALPHA)), three_sentences, judge=judge)

    each = generated(case, 3)
    assert each.draft.status == "GENERATED"
    assert each.draft.content == "alpha 값을 2로 바꿨습니다. alpha 줄이 더해졌습니다."
    assert case.run.report.below_threshold_sentences == 1


def test_s10_no_sentence_reaches_0_9_means_not_generated_without_failure() -> None:
    """S10: 모든 문장이 0.9 미만이면 설명은 NOT_GENERATED이고 실패 항목이 없다."""
    judge = SyntheticJudge(answers(SENTENCE_TRUE=0.5))

    case, _ = ai_case(pulls(opened(3, ALPHA)), three_sentences, judge=judge)

    each = generated(case, 3)
    assert each.draft.status == "NOT_GENERATED"
    assert entry(case, 3)["draft"]["status"] == "NOT_GENERATED"
    assert new_failures(case) == []


@pytest.mark.parametrize(
    "failure",
    ["JUDGEMENT_CALL_FAILED", "JUDGEMENT_TIMEOUT", "JUDGEMENT_RESPONSE_UNREADABLE"],
)
def test_s11_failed_catch_judgement(failure: str) -> None:
    """S11: Catch 판정 호출 오류면 설명 FAILED(실패 항목 DRAFT), 제목은 판정 없이(기록의 글), 둘째 줄 남음.
    질문은 판정과 관계없어 그대로다."""
    judge = SyntheticJudge(failure=failure)  # type: ignore[arg-type]

    case, _ = ai_case(record_pull(short("alpha")), three_sentences, judge=judge)

    each = generated(case, 3)
    assert each.draft.status == "FAILED"
    assert each.draft.failure is not None and each.draft.failure.code == failure
    assert each.reflection.status == "GENERATED"
    assert each.title == RECORD_TITLE
    assert entry(case, 3)["workFacts"] == ["PR #3, 상태 열림", SECOND_LINE]
    cause = {
        "JUDGEMENT_CALL_FAILED": "설명 확인 중 오류가 나",
        "JUDGEMENT_TIMEOUT": "설명 확인 시간이 초과되어",
        "JUDGEMENT_RESPONSE_UNREADABLE": "설명 확인 결과를 읽을 수 없어",
    }[failure]
    assert new_failures(case) == [
        {
            "stage": "DRAFT",
            "code": failure,
            "message": f"{cause} 설명 초안을 만들지 못했다",
            "candidateId": entry(case, 3)["candidateId"],
        }
    ]


def test_failed_judgement_never_uses_an_ai_title() -> None:
    """BR3.5: 판정이 실패하면 기록의 글이 없는 Catch도 AI 후보를 쓰지 않고 조각 제목이다."""
    judge = SyntheticJudge(failure="JUDGEMENT_CALL_FAILED")

    case, _ = ai_case(pulls(opened(3, ALPHA)), three_sentences, judge=judge)

    assert generated(case, 3).title == "alpha 코드 수정"
    assert case.run.report.title_sources == Counter({"FRAGMENT": 1})


def test_s19_everything_dropped_and_long_fragment_title_means_no_title() -> None:
    """S19: 후보가 모두 떨어지고 기록의 글이 판정 부실이며 조각 제목이 40자를 넘으면 제목이 없다. 고쳐 쓰기 없음."""
    name = "averyveryverylongidentifiername_used_for_titles"

    def reply(request: ProviderRequest) -> str:
        line = pick(request, change="added", contains=name)
        return ai_answer(
            titles=[written("sessionStore 값 변경", line)],
            sentences=[written(f"{name} 값을 바꿨습니다.", line)],
            title=code_title(line, name),
            questions=[question("BACKGROUND")],
        )

    judge = SyntheticJudge(answers(RECORD_WHAT=0.2))
    case, _ = ai_case(record_pull(short(name)), reply, judge=judge)

    each = generated(case, 3)
    assert each.title is None
    assert case.provider.rewrite_requests() == []
    # 기계 대조에서 떨어진 후보는 판정에 오르지 않는다.
    assert "TITLE_CHOICE:title" not in catch_questions(judge)
    assert case.run.report.factcheck_dropped_titles == 1
    assert case.run.report.title_sources == Counter({"NONE": 1})


def test_s20_work_facts_never_carry_generated_text() -> None:
    """S20: 작업 사실의 어느 줄도 생성 응답에서 오지 않는다. CR3은 둘째 줄을 지우기만 한다."""
    judge = SyntheticJudge(answers(RECORD_WHAT=0.1))

    case, _ = ai_case(record_pull(short("alpha")), three_sentences, judge=judge)

    facts = entry(case, 3)["workFacts"]
    assert facts == ["PR #3, 상태 열림"]
    for fact in facts:
        for text in ("alpha 값 변경", "alpha 값을 2로", "alpha 줄"):
            assert text not in fact


def test_s26_missing_record_answer_keeps_the_record_for_title_and_second_line() -> None:
    """S26: 판정 응답에 RECORD_WHAT 답이 없으면 제목은 규칙 결과의 기록의 글이고 둘째 줄도 남는다(같은 판단)."""
    judge = SyntheticJudge(
        answers(RECORD_WHAT=MISSING, TITLE_CHOICE=choose("t1", 0.99))
    )

    case, _ = ai_case(record_pull(short("alpha")), three_sentences, judge=judge)

    each = generated(case, 3)
    assert each.title == RECORD_TITLE
    assert entry(case, 3)["workFacts"] == ["PR #3, 상태 열림", SECOND_LINE]
    assert each.draft.status == "GENERATED"


def test_missing_whole_answer_also_means_no_record_judgement() -> None:
    """BR2.5: 물은 RECORD_WHOLE 답이 빠져도 기록의 글은 판정 없음이다: RECORD_WHAT이 0.1이어도 둘째 줄을 남긴다."""
    judge = SyntheticJudge(
        answers(RECORD_WHAT=0.1, RECORD_WHOLE=MISSING, TITLE_CHOICE=choose("t1", 0.99))
    )

    case, _ = ai_case(whole_scenario(), three_sentences, judge=judge)

    each = case.output.candidates[0]
    assert each.title == "alpha 값을 2로 바꿈"
    assert len(each.work_facts) == 2


def test_s31_none_choice_keeps_ai_titles_out() -> None:
    """S31: TITLE_CHOICE에서 NONE이 0.92면 AI 후보를 쓰지 않는다(기록의 글이 없으면 조각 제목)."""
    judge = SyntheticJudge(answers(TITLE_CHOICE=choose("NONE", 0.92)))

    case, _ = ai_case(pulls(opened(3, ALPHA)), three_sentences, judge=judge)

    assert generated(case, 3).title == "alpha 코드 수정"
    assert case.run.report.below_threshold_titles == 2


def test_record_without_judgement_question_is_not_used_by_weak_rule() -> None:
    """규칙으로 부실한 기록의 글(WIP)은 판정에 올리지 않고, AI 후보가 0.9 이상이면 그 후보가 제목이다."""
    judge = SyntheticJudge(answers(TITLE_CHOICE=choose("t1", 0.97)))

    case, _ = ai_case(pulls(opened(3, ALPHA)), three_sentences, judge=judge)

    assert "RECORD_WHAT:record" not in catch_questions(judge)
    assert generated(case, 3).title == "alpha 값 변경"
    assert entry(case, 3)["workFacts"] == ["PR #3, 상태 열림"]


def test_s8_catch_judgement_carries_the_generation_lines_and_no_other_data() -> None:
    """S8: 판정 요청의 줄은 그 Catch의 생성 요청에 담은 고를 수 있는 줄 그대로다. SHA·작성자·날짜·이슈 글·다른
    Catch의 자료는 없다."""
    judge = SyntheticJudge()

    case, _ = ai_case(TWO, naive_ai, judge=judge)

    for request in judge.catch_requests():
        data = json.loads(request.data)
        sent = next(
            each
            for each in case.provider.generate_requests()
            if {line["id"] for line in data["lines"]}
            <= {line.id for line in sent_lines_of(each)}
        )
        assert [line["id"] for line in data["lines"]] == [
            line.id for line in sent_lines_of(sent) if line.selectable
        ]
        paths = {file["path"] for file in data["files"]}
        assert len(paths) == 1
        for commit_sha in (ALPHA.sha, BETA.sha):
            assert commit_sha not in request.data
        assert MEMBER.login not in request.data
        assert "합성 PR 본문" not in request.data
        assert "2026-" not in request.data


# Step 12: 운영 로그 건수(NFR2.6·NFR3.2, 비기능 설계 관측)


def test_log_line_counts_judgements_and_results_without_text(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """생성 로그 한 줄에 판정·결과 건수와 켜짐 여부·공급자 이름이 있고, 기록의 글·후보·문장 원문은 없다."""
    texts = {
        "t1": "alpha 값 변경",
        "t2": "sessionStore 변경",
        "s1": "alpha 값을 2로 바꿨습니다.",
        "s2": "alpha 줄이 바뀌었습니다.",
        "s3": "betaValue를 더했습니다.",
    }

    def reply(request: ProviderRequest) -> str:
        line = pick(request, change="added", contains="alpha")
        return ai_answer(
            titles=[written(texts["t1"], line), written(texts["t2"], line)],
            sentences=[written(texts[key], line) for key in ("s1", "s2", "s3")],
            title=code_title(line, "alpha"),
            questions=[question("BACKGROUND")],
            extra=[],
        )

    judge = SyntheticJudge(
        answers(
            RECORD_WHAT=0.3,
            TITLE_CHOICE=choose("t1", 0.95),
            SENTENCE_TRUE__s2=0.5,
        )
    )

    with caplog.at_level(logging.INFO, logger="app.generation"):
        case, _ = ai_case(record_pull(short("alpha")), reply, judge=judge)

    (line,) = [
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith("생성 종료:")
    ]
    assert (
        "aiSide=on judgementProvider=synthetic catchJudgements=1 materialJudgements=0 "
        "judgementSkipped=0 materialSkipped=0 catchJudgementReasons=- "
        "materialJudgementReasons=- factcheckDroppedTitles=1 factcheckDroppedSentences=1 "
        "belowThresholdTitles=0 belowThresholdSentences=1 secondLinesRemoved=1 "
        "titleFromRecord=0 titleFromAi=1 titleFromRecordWholeMiss=0 "
        "titleFromFragment=0 titleNone=0 aiDropReasons=-"
    ) in line
    assert "unknownResponseKeys=1" in line
    assert generated(case, 3).title == texts["t1"]
    assert generated(case, 3).draft.content == texts["s1"]
    for text in (
        RECORD_TITLE,
        SECOND_LINE,
        "sessionStore",
        "betaValue",
        *texts.values(),
    ):
        assert text not in caplog.text


def test_log_line_when_the_ai_side_is_off(caplog: pytest.LogCaptureFixture) -> None:
    """AI 쪽이 꺼지면 같은 칸이 꺼짐·0건으로 남는다."""
    with caplog.at_level(logging.INFO, logger="app.generation"):
        generation_case(pulls(opened(3, ALPHA)), ScriptedProvider(naive))

    assert "aiSide=off judgementProvider=- catchJudgements=0" in caplog.text
    assert "titleFromRecord=0 titleFromAi=0" in caplog.text


def test_judgement_failure_codes_are_counted(caplog: pytest.LogCaptureFixture) -> None:
    judge = SyntheticJudge(failure="JUDGEMENT_TIMEOUT")

    with caplog.at_level(logging.INFO, logger="app.generation"):
        ai_case(with_big(), judge=judge, limits=SMALL_DATA)

    assert "catchJudgementReasons=JUDGEMENT_TIMEOUT:3" in caplog.text
    assert "materialJudgementReasons=JUDGEMENT_TIMEOUT:1" in caplog.text


def test_secret_only_candidate_is_masked_to_empty_without_judgement() -> None:
    """비밀 파일만 고친 후보는 AI 쪽에서도 재료가 없어 생성·판정하지 않는다(가리기 뒤 0개로 센다)."""
    target = own(
        31, 3, change(".env", patch="@@ -0,0 +1 @@\n+LOG_LEVEL=debug", status="added")
    )

    case, judge = ai_case(pulls(opened(3, target)))

    assert case.provider.requests == [] and judge.requests == []
    assert case.run.report.masked_to_empty == 1
    assert generated(case, 3).draft.status == "NOT_GENERATED"


def test_missing_title_choice_answer_counts_candidates_below_threshold() -> None:
    """TITLE_CHOICE 답이 빠지면 AI 후보를 쓰지 않고, 통과한 후보는 문턱 미만으로 센다(BR2.5)."""
    judge = SyntheticJudge(answers(TITLE_CHOICE=MISSING))

    case, _ = ai_case(pulls(opened(3, ALPHA)), three_sentences, judge=judge)

    assert generated(case, 3).title == "alpha 코드 수정"
    assert case.run.report.below_threshold_titles == 2


def test_observer_gets_a_trace_even_without_questions() -> None:
    """질문이 없어 판정을 보내지 않은 Catch도 확인 명령 관찰자에 경과(NO_QUESTIONS)가 간다."""
    traces: list[CatchTrace] = []

    def reply(request: ProviderRequest) -> str:
        line = pick(request, change="added", contains="alpha")
        return ai_answer(
            titles=[],
            sentences=[],
            title=code_title(line, "alpha"),
            questions=[question("BACKGROUND")],
        )

    ai_case(pulls(opened(3, ALPHA)), reply, observe=traces.append)

    (trace,) = traces
    assert trace.judgement == "NO_QUESTIONS"
    assert trace.answers == {}
    assert trace.title == "alpha 코드 수정" and trace.title_source == "FRAGMENT"
