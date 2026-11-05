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
from collections.abc import Callable, Mapping
from copy import deepcopy
from dataclasses import replace
from datetime import timedelta
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
    answer,
    assert_generated_text,
    assert_preserved,
    code_title,
    file_id_of,
    file_title,
    generation_case,
    line_fragment,
    line_question,
    naive,
    pick,
    sent_files,
)
from github_synthetic import (
    MEMBER,
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
        questions=[line_question("BACKGROUND", line, "alpha")],
    )


def unclassified_title(request: ProviderRequest) -> str:
    """제목이 위치 분류가 안 되는 파일(확장자 없음)을 지목한 응답."""
    line = pick(request, change="added", contains="blob")
    return answer(
        fragments=[line_fragment(line, "blob")],
        title=file_title(file_id_of(request, "tools/blob")),
        questions=[line_question("BACKGROUND", line, "blob")],
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
