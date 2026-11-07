"""FR10 확인 명령(CR3 BR9.1·BR9.2, NFR1.6, 시나리오 S25) 시험.

합성 수집 결과(후보 판정 사례 도구)와 합성 생성 제공자·합성 판정 어댑터로 돌린다. 수집 결과 파일·확인표는
시험마다 저장소 밖 임시 폴더(pytest `tmp_path`)에 쓴다. 실제 GitHub·OpenAI·Anthropic은 부르지 않는다.
"""

import json
import os
import socket
import stat
from pathlib import Path
from typing import Any

import pytest
from candidate_scenarios import (
    ROOT,
    Pull,
    Scenario,
    change,
    commit,
    root_commit,
    run_case,
)
from generation_scenarios import ScriptedProvider, naive_ai
from github_synthetic import (
    BASE,
    MEMBER,
    NAME,
    OWNER,
    FakeClock,
    FakeTransport,
    Reply,
    relation_repository_json,
    respond,
    sha,
)

import app.processing.confirm as confirm_module
from app.candidates import build_candidates
from app.collection import CollectionOutcome, FailureCode, collect
from app.collection.credentials import AccessToken
from app.collection.identifiers import RepositoryCoordinates
from app.generation import GenerationProvider
from app.judgement.provider import JudgementProvider
from app.judgement.synthetic import SyntheticJudge
from app.processing import collection_file
from app.processing.confirm import (
    REPOSITORY_ROOT,
    ConfirmationError,
    collect_live,
    confirm,
    local_request,
    outside_repository,
)

GITHUB_TOKEN = "".join(("github_pat_", "Synthetic", "Confirmation", "0" * 40))
GENERATION_KEY = "sk-ant-synthetic-confirmation-generation-key"
JUDGEMENT_KEY = "sk-proj-synthetic-confirmation-judgement-key"
RECORD_TITLE = "alpha 값을 2로 바꿈"


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*args: object, **kwargs: object) -> None:
        raise AssertionError("외부 연결 시도")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)


def scenario() -> Scenario:
    """열린 PR 둘: #3은 쓸 만한 PR 제목(기록의 글), #4는 기본 제목(WIP, 규칙으로 부실)."""
    alpha = commit(
        sha(31),
        MEMBER,
        parents=(ROOT,),
        minute=3,
        files=[change("app/alpha.py", patch="@@ -1 +1 @@\n-alpha = 1\n+alpha = 2")],
    )
    beta = commit(
        sha(32),
        MEMBER,
        parents=(ROOT,),
        minute=9,
        files=[change("app/beta.py", patch="@@ -1 +1 @@\n-beta = 1\n+beta = 2")],
    )
    return Scenario(
        default_branch=(root_commit(),),
        pulls=(
            Pull(3, MEMBER, (alpha,), state="open", created=2, title=RECORD_TITLE),
            Pull(4, MEMBER, (beta,), state="open", created=3),
        ),
    )


def clock() -> Any:
    from datetime import UTC, datetime

    return datetime(2026, 11, 6, tzinfo=UTC)


def test_collection_file_round_trips_the_outcome(tmp_path: Path) -> None:
    """수집 결과 파일은 수집 결과 모양 그대로다(관계 조회 포함). 다시 읽으면 같은 값이다."""
    outcome = run_case(scenario()).outcome
    assert outcome.relations is not None

    path = tmp_path / "x.collection.json"
    collection_file.write(path, outcome)

    assert collection_file.read(path) == outcome
    document = json.loads(path.read_text("utf-8"))
    assert (document["format"], document["version"]) == (
        "catchu-collection-outcome",
        1,
    )
    assert mode(path) == 0o600


def mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def test_private_files_are_owner_only_from_creation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """검토 R-02: 확인표·수집 결과 파일은 만드는 순간부터 0o600이다. 만든 뒤 권한을 바꾸지 않는다."""
    created: list[tuple[str, int]] = []
    real_open = os.open

    def recording_open(path: Any, flags: int, mode: int = 0o777) -> int:
        created.append((os.fspath(path), mode))
        return real_open(path, flags, mode)

    def refuse_chmod(*args: object, **kwargs: object) -> None:
        raise AssertionError("만든 뒤 권한을 바꾸면 안 된다")

    monkeypatch.setattr(os, "open", recording_open)
    monkeypatch.setattr(os, "chmod", refuse_chmod)
    monkeypatch.setattr(Path, "chmod", refuse_chmod)
    case = run_case(scenario())
    collection = tmp_path / "in.collection.json"
    sheet = tmp_path / "out" / "sheet.json"

    collection_file.write(collection, case.outcome)
    confirm(
        case.request,
        case.outcome,
        provider=ScriptedProvider(naive_ai),
        judge=SyntheticJudge(),
        sheet_path=sheet,
        clock=clock,
    )

    assert created == [(str(collection), 0o600), (str(sheet.resolve()), 0o600)]
    assert mode(collection) == 0o600
    assert mode(sheet) == 0o600


def test_existing_loose_files_are_replaced_with_owner_only_files(
    tmp_path: Path,
) -> None:
    """검토 R-02: 이미 있던 파일이 넓은 권한이어도 지우고 0o600 새 파일로 쓴다."""
    case = run_case(scenario())
    collection = tmp_path / "in.collection.json"
    sheet = tmp_path / "sheet.json"
    for path in (collection, sheet):
        path.write_text("old", "utf-8")
        path.chmod(0o644)

    collection_file.write(collection, case.outcome)
    confirm(
        case.request,
        case.outcome,
        provider=ScriptedProvider(naive_ai),
        judge=SyntheticJudge(),
        sheet_path=sheet,
        clock=clock,
    )

    assert mode(collection) == 0o600 and mode(sheet) == 0o600
    assert collection_file.read(collection) == case.outcome
    assert json.loads(sheet.read_text("utf-8"))["catches"] == 2


@pytest.mark.parametrize(
    "text",
    [
        "not json",
        '{"format": "other", "version": 1, "outcome": {}}',
        '{"format": "catchu-collection-outcome", "version": 1, "outcome": {"x": 1}}',
    ],
)
def test_unknown_collection_files_are_refused(text: str) -> None:
    with pytest.raises(collection_file.CollectionFileError):
        collection_file.load(text)


def test_s25_confirmation_sheet_lists_candidates_values_and_empty_marks(
    tmp_path: Path,
) -> None:
    """S25: 확인표에 Catch마다 기록의 글·AI 후보와 기계 대조 결과·문장·판정 값·고른 제목·빈 맞음/틀림 칸이 있다.
    결과 메시지는 만들지 않는다."""
    case = run_case(scenario())
    collection = tmp_path / "in.collection.json"
    collection_file.write(collection, case.outcome)
    judge = SyntheticJudge()
    provider = ScriptedProvider(naive_ai)

    sheet = confirm(
        case.request,
        collection_file.read(collection),
        provider=provider,
        judge=judge,
        sheet_path=tmp_path / "out" / "sheet.json",
        clock=clock,
    )

    written = json.loads((tmp_path / "out" / "sheet.json").read_text("utf-8"))
    assert written == sheet
    assert written["catches"] == 2
    assert written["judgementProvider"] == "synthetic"
    by_record = {
        None if item["recordText"] is None else item["recordText"]["text"]: item
        for item in written["items"]
    }
    titled = by_record[RECORD_TITLE]
    assert titled["recordText"] == {
        "source": "PR_TITLE",
        "text": RECORD_TITLE,
        "weakByRule": False,
    }
    assert titled["titleCandidates"][0]["text"] == "alpha 값 변경"
    assert titled["titleCandidates"][0]["passedFactcheck"] is True
    assert titled["titleCandidates"][0]["judged"] == 1.0
    assert titled["sentences"][0]["judged"] == 0.95
    assert titled["judgement"] == "ANSWERED"
    assert titled["answers"]["RECORD_WHAT"] == 0.95
    # 기록의 글이 제목이어도 TITLE_CHOICE가 고른 AI 후보를 적는다(BR9.1).
    assert titled["title"] == RECORD_TITLE
    assert titled["chosenAiTitle"] == "alpha 값 변경"
    assert titled["keptSentences"] == ["s1"]
    assert titled["marks"] == {
        "title": None,
        "chosenAiTitle": None,
        "sentences": {"s1": None},
        "note": "",
    }
    weak = next(item for item in written["items"] if item is not titled)
    assert weak["recordText"]["weakByRule"] is True
    assert weak["titleSource"] == "AI"
    assert len(judge.catch_requests()) == 2


def test_inside_repository_paths_are_refused(tmp_path: Path) -> None:
    """NFR1.6: 쓸 곳이 저장소 작업 폴더 안이면(바로가기를 거쳐도) 거부한다."""
    with pytest.raises(ConfirmationError):
        outside_repository(REPOSITORY_ROOT / "worker" / "sheet.json")
    with pytest.raises(ConfirmationError):
        outside_repository(REPOSITORY_ROOT)
    link = tmp_path / "link"
    link.symlink_to(REPOSITORY_ROOT / "worker")
    with pytest.raises(ConfirmationError):
        outside_repository(link / "sheet.json")
    assert outside_repository(tmp_path / "ok.json") == (tmp_path / "ok.json").resolve()

    case = run_case(scenario())
    with pytest.raises(ConfirmationError):
        confirm(
            case.request,
            case.outcome,
            provider=ScriptedProvider(naive_ai),
            judge=SyntheticJudge(),
            sheet_path=link / "sheet.json",
            clock=clock,
        )


def private_routes() -> dict[str, Reply]:
    """같은 합성 저장소를 비공개 저장소 응답으로 바꾼다(`JminAILab/CatchU`와 같은 경우)."""
    routes = scenario().routes()
    routes[BASE] = respond(relation_repository_json(private=True, visibility="private"))
    return routes


class Swapped:
    """명령의 실제 SDK·GitHub 부품을 합성 부품으로 바꾼다."""

    def __init__(
        self, monkeypatch: pytest.MonkeyPatch, *, private: bool = False
    ) -> None:
        self.judge = SyntheticJudge()
        self.provider = ScriptedProvider(naive_ai)
        self.judge_args: list[tuple[str, str, str | None]] = []
        self.transports: list[FakeTransport] = []

        def make_provider(key: AccessToken) -> GenerationProvider:
            assert key.reveal() == GENERATION_KEY
            return self.provider

        def make_judge(
            provider: str, generation: AccessToken, judgement: AccessToken | None
        ) -> JudgementProvider:
            self.judge_args.append(
                (
                    provider,
                    generation.reveal(),
                    None if judgement is None else judgement.reveal(),
                )
            )
            return self.judge

        def open_transport() -> FakeTransport:
            transport = FakeTransport(
                private_routes() if private else scenario().routes()
            )
            self.transports.append(transport)
            return transport

        monkeypatch.setattr(confirm_module, "make_provider", make_provider)
        monkeypatch.setattr(confirm_module, "make_judge", make_judge)
        monkeypatch.setattr(confirm_module, "open_transport", open_transport)


def args(output: Path, *extra: str) -> list[str]:
    return [
        "--repository",
        f"{OWNER}/{NAME}",
        "--account-login",
        MEMBER.login,
        "--account-id",
        str(MEMBER.account_id),
        "--output",
        str(output),
        *extra,
    ]


def environment(**extra: str) -> dict[str, str]:
    return {
        "CATCHU_FR10_GITHUB_TOKEN": GITHUB_TOKEN,
        "CATCHU_GENERATION_API_KEY": GENERATION_KEY,
        "CATCHU_JUDGEMENT_API_KEY": JUDGEMENT_KEY,
        **extra,
    }


def test_command_collects_writes_the_file_and_keeps_secrets_out(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """수집 결과 파일이 없으면 GitHub에서 직접 수집해 파일로 남기고 확인표를 쓴다. 토큰·키는 파일·출력·로그에
    없고 명령의 환경에서도 지운다."""
    swapped = Swapped(monkeypatch)
    env = environment()

    assert confirm_module.run(args(tmp_path), env) == 0

    label = f"{OWNER}__{NAME}"
    collection = tmp_path / f"{label}.collection.json"
    sheet = tmp_path / f"{label}.sheet.json"
    assert collection.exists() and sheet.exists()
    assert mode(collection) == 0o600 and mode(sheet) == 0o600
    assert len(swapped.transports) == 1
    assert swapped.judge_args == [("openai", GENERATION_KEY, JUDGEMENT_KEY)]
    out = capsys.readouterr()
    for secret in (GITHUB_TOKEN, GENERATION_KEY, JUDGEMENT_KEY):
        for text in (
            collection.read_text("utf-8"),
            sheet.read_text("utf-8"),
            out.out,
            out.err,
            caplog.text,
        ):
            assert secret not in text
        assert secret not in env.values()
    assert json.loads(sheet.read_text("utf-8"))["catches"] == 2

    # 수집 결과 파일이 있으면 다시 수집하지 않고 그 파일을 쓴다(토큰 없이도).
    again = Swapped(monkeypatch)
    no_token = environment()
    del no_token["CATCHU_FR10_GITHUB_TOKEN"]
    assert confirm_module.run(args(tmp_path), no_token) == 0
    assert again.transports == []


def test_collect_live_collects_a_private_repository(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Step 20: 확인 명령의 직접 수집은 비공개 저장소도 공개 여부 확인을 지나 끝까지 모은다.
    같은 응답을 운영 기본값으로 모으면 REPOSITORY_UNREACHABLE로 멈춘다."""
    calls: list[dict[str, Any]] = []

    def recording(*args: Any, **kwargs: Any) -> CollectionOutcome:
        calls.append(dict(kwargs))
        return collect(*args, **kwargs)

    monkeypatch.setattr(confirm_module, "collect", recording)
    repository = RepositoryCoordinates(OWNER, NAME)
    request = local_request(repository)
    transport = FakeTransport(private_routes())

    outcome = collect_live(
        request,
        repository,
        MEMBER,
        AccessToken(GITHUB_TOKEN),
        open_transport=lambda: transport,
        clock=FakeClock(),
    )

    assert [call.get("allow_private_repository") for call in calls] == [True]
    assert outcome.completed
    assert transport.paths[0] == BASE and len(transport.paths) > 1
    assert len(outcome.pull_requests) == 2
    assert len(build_candidates(request, outcome).candidates) == 2

    # 대조: 같은 비공개 응답을 운영 기본값(인자 없음)으로 모으면 저장소 확인에서 멈춘다.
    default_transport = FakeTransport(private_routes())
    refused = collect(
        request,
        credentials=calls[0]["credentials"],
        selections=calls[0]["selections"],
        open_transport=lambda: default_transport,
        clock=FakeClock(),
        relations=calls[0]["relations"],
    )
    assert [failure.code for failure in refused.failures] == [
        FailureCode.REPOSITORY_UNREACHABLE
    ]
    assert default_transport.paths == [BASE]


def test_command_confirms_a_private_repository(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Step 20: 수집 결과 파일이 없는 비공개 저장소도 명령 하나로 수집·확인표까지 간다."""
    swapped = Swapped(monkeypatch, private=True)

    assert confirm_module.run(args(tmp_path), environment()) == 0

    label = f"{OWNER}__{NAME}"
    assert len(swapped.transports) == 1
    assert swapped.transports[0].paths[0] == BASE
    stored = collection_file.read(tmp_path / f"{label}.collection.json")
    assert stored.completed and len(stored.pull_requests) == 2
    sheet = json.loads((tmp_path / f"{label}.sheet.json").read_text("utf-8"))
    assert sheet["catches"] == 2


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"CATCHU_GENERATION_API_KEY": ""}, "CATCHU_GENERATION_API_KEY"),
        ({"CATCHU_JUDGEMENT_PROVIDER": "synthetic"}, "CATCHU_JUDGEMENT_PROVIDER"),
        ({"CATCHU_FR10_GITHUB_TOKEN": ""}, "CATCHU_FR10_GITHUB_TOKEN"),
        ({"CATCHU_JUDGEMENT_API_KEY": "has space"}, "CATCHU_JUDGEMENT_API_KEY"),
    ],
)
def test_command_refuses_missing_or_bad_settings(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    changes: dict[str, str],
    message: str,
) -> None:
    Swapped(monkeypatch)
    env = environment(**changes)

    assert confirm_module.run(args(tmp_path), env) == 2

    err = capsys.readouterr().err
    assert message in err
    assert JUDGEMENT_KEY not in err and GENERATION_KEY not in err
    assert not (tmp_path / f"{OWNER}__{NAME}.sheet.json").exists()


def test_command_refuses_an_output_inside_the_repository(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    Swapped(monkeypatch)
    assert confirm_module.run(args(REPOSITORY_ROOT / "worker"), environment()) == 2
    assert "저장소 작업 폴더" in capsys.readouterr().err


def test_openai_without_judgement_key_means_nothing_to_confirm() -> None:
    """AI 쪽이 꺼진 설정(공급자 openai에 판정 키 없음)이면 확인할 것이 없어 멈춘다."""
    with pytest.raises(ConfirmationError):
        confirm_module.make_judge("openai", AccessToken(GENERATION_KEY), None)


def test_local_request_ids_are_fresh() -> None:
    repository = RepositoryCoordinates(OWNER, NAME)
    first, second = local_request(repository), local_request(repository)
    assert first.attempt_id != second.attempt_id
    assert first.source_mode == "LIVE"
    assert first.selection_reference == first.attempt_id


def _document() -> dict[str, Any]:
    document = json.loads(collection_file.dump(run_case(scenario()).outcome))
    assert isinstance(document, dict)
    return document


@pytest.mark.parametrize(
    "change",
    [
        # 시간대 없는 시각, 글이 아닌 시각
        lambda doc: doc["outcome"]["commits"][0].__setitem__(
            "authored_at", "2026-10-01T00:00:00"
        ),
        lambda doc: doc["outcome"]["commits"][0].__setitem__("authored_at", 5),
        # 정해 둔 값이 아닌 값, 목록이 아닌 목록 칸, 객체가 아닌 객체 칸
        lambda doc: doc["outcome"]["pull_requests"][0].__setitem__("state", "draft"),
        lambda doc: doc["outcome"]["commits"][0].__setitem__("parents", "x"),
        lambda doc: doc["outcome"].__setitem__("allowed_resource_types", "COMMIT"),
        lambda doc: doc["outcome"].__setitem__("repository", 3),
        # 형식이 다른 기본 값, 모르는 열거 값
        lambda doc: doc["outcome"].__setitem__("calls", "1"),
        lambda doc: doc["outcome"]["commits"][0].__setitem__("changes_status", "?"),
    ],
)
def test_collection_file_values_must_match_their_field_types(change: Any) -> None:
    """수집 결과 파일은 칸의 형식 정보와 맞는 값만 읽는다. 맞지 않으면 그 파일을 읽지 않는다."""
    document = _document()
    change(document)
    with pytest.raises(ValueError):
        collection_file.load(json.dumps(document))


def test_collection_file_refuses_unwritable_values() -> None:
    from dataclasses import replace
    from datetime import datetime

    outcome = run_case(scenario()).outcome
    naive_time = replace(
        outcome,
        commits=(replace(outcome.commits[0], authored_at=datetime(2026, 10, 1)),),
    )
    with pytest.raises(collection_file.CollectionFileError):
        collection_file.dump(naive_time)
    with pytest.raises(collection_file.CollectionFileError):
        collection_file.dump(replace(outcome, selection_reference=object()))  # type: ignore[arg-type]


def test_max_catches_keeps_only_the_first_candidates(tmp_path: Path) -> None:
    case = run_case(scenario())
    sheet = confirm(
        case.request,
        case.outcome,
        provider=ScriptedProvider(naive_ai),
        judge=SyntheticJudge(),
        sheet_path=tmp_path / "sheet.json",
        clock=clock,
        max_catches=1,
    )
    assert sheet["catches"] == 1


def test_command_refuses_a_bad_repository_value(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    Swapped(monkeypatch)
    argv = args(tmp_path)
    argv[1] = "no-slash"
    assert confirm_module.run(argv, environment()) == 2
    assert "OWNER/NAME" in capsys.readouterr().err


def test_command_reports_an_incomplete_collection(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """수집 실패가 남은 수집 결과도 확인표는 쓰고, 건수만 경고로 남긴다."""
    from dataclasses import replace

    from app.collection.failures import CollectionFailure, FailureCode

    Swapped(monkeypatch)
    outcome = run_case(scenario()).outcome
    failed = replace(
        outcome,
        failures=(CollectionFailure(FailureCode.RATE_LIMITED, "합성 실패"),),
    )
    collection_file.write(tmp_path / f"{OWNER}__{NAME}.collection.json", failed)
    caplog.set_level("WARNING")

    assert confirm_module.run(args(tmp_path), environment()) == 0
    assert "failures=1" in caplog.text


def test_real_parts_are_built_without_calling_out(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """실제 부품(Claude 생성·두 판정 어댑터·GitHub 전송)은 만들 때 외부를 부르지 않는다."""
    from app.collection.transport import HttpsTransport
    from app.judgement.claude import ClaudeJudge
    from app.judgement.openai_judge import OpenAIJudge

    for name in ("ANTHROPIC_CUSTOM_HEADERS", "OPENAI_CUSTOM_HEADERS"):
        monkeypatch.delenv(name, raising=False)
    key = AccessToken(GENERATION_KEY)
    assert confirm_module.make_provider(key) is not None
    assert isinstance(confirm_module.make_judge("claude", key, None), ClaudeJudge)
    assert isinstance(
        confirm_module.make_judge("openai", key, AccessToken(JUDGEMENT_KEY)),
        OpenAIJudge,
    )
    assert isinstance(confirm_module.open_transport(), HttpsTransport)


def test_main_reads_the_process_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import os

    Swapped(monkeypatch)
    for name, value in environment(CATCHU_GENERATION_API_KEY="").items():
        monkeypatch.setenv(name, value)
    assert confirm_module.main(args(tmp_path)) == 2
    assert "CATCHU_FR10_GITHUB_TOKEN" not in os.environ
