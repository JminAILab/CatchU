"""FR10 확인 명령(CR3 BR9.1·BR9.2, NFR1.6): 운영과 같은 후보 판정·생성·판정을 돌려 로컬 확인표를 쓴다.

실행: `python -m app.processing.confirm --repository OWNER/NAME --account-login LOGIN --account-id ID`

- 수집 결과 파일(`--collection`, 기본 `<출력 폴더>/<owner>__<name>.collection.json`)이 있으면 그 파일을 읽는다.
  없으면 실제 GitHub에서 직접 수집해 그 파일로 남긴다. 공개·비공개 저장소 모두 같은 길이다(이 명령만 수집의
  공개 저장소 확인을 끈다). GitHub 토큰은 셸 환경변수 `CATCHU_FR10_GITHUB_TOKEN`(읽기 전용 fine-grained
  토큰)으로만 받는다.
- 생성 키·판정 키·판정 공급자는 운영과 같은 이름(`CATCHU_GENERATION_API_KEY`·`CATCHU_JUDGEMENT_API_KEY`·
  `CATCHU_JUDGEMENT_PROVIDER`)의 셸 환경변수에서 읽는다. AI 쪽이 꺼진 설정이면 확인할 것이 없어 멈춘다.
- 결과 메시지를 만들거나 보내지 않는다. 출력은 로컬 확인표(`<owner>__<name>.sheet.json`)뿐이고, Catch마다 기록의
  글·AI 후보와 기계 대조 결과·문장·판정 값·고른 제목·남긴 문장과 빈 맞음/틀림 칸을 적는다.
- 출력 폴더(기본 `~/catchu-local-live/cr3-fr10/`)와 수집 결과 파일은 실제 경로를 풀어 이 저장소 작업 폴더 안이면
  거부한다. 확인표·수집 결과에는 비공개 코드 줄이 들어 있다. 확인이 끝나면 팀장이 지운다.
- 토큰·키는 파일·로그·확인표에 쓰지 않는다. 읽은 뒤 이 프로세스의 환경에서 지운다.
"""

import argparse
import json
import logging
import os
import re
import sys
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Final

from app.candidates import build_candidates
from app.collection import RelationOptions, Transport, collect
from app.collection.collect import CollectionOutcome
from app.collection.credentials import AccessToken, CredentialContext
from app.collection.identifiers import GitHubAccount, RepositoryCoordinates
from app.collection.selection import SelectedRange
from app.collection.transport import HttpsTransport
from app.generation import GenerationProvider, run_generation
from app.generation.judged import CatchTrace, Checked
from app.judgement.provider import JudgementProvider
from app.processing import collection_file
from app.processing.request_check import CheckedRequest

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT: Final = Path("~/catchu-local-live/cr3-fr10")
TOKEN_ENV: Final = "CATCHU_FR10_GITHUB_TOKEN"
KEY_ENV: Final = (
    TOKEN_ENV,
    "CATCHU_GENERATION_API_KEY",
    "CATCHU_JUDGEMENT_API_KEY",
)
# 이 저장소 작업 폴더(worker/app/processing/confirm.py에서 세 단계 위).
REPOSITORY_ROOT: Final = Path(__file__).resolve().parents[3]
# 운영 생성 마감과 같다(꺼낸 시각 + 60분 − 60초).
GENERATION_BUDGET: Final = timedelta(minutes=60) - timedelta(seconds=60)
_COORDINATE = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})")

Clock = Callable[[], datetime]


class ConfirmationError(Exception):
    """확인 명령을 이어 갈 수 없다. 문구에 키·토큰·자료 원문을 싣지 않는다."""


def outside_repository(path: Path, root: Path = REPOSITORY_ROOT) -> Path:
    """실제 경로를 풀어 저장소 작업 폴더 밖이면 그 경로, 안이면 거부한다(NFR1.6)."""
    resolved = path.expanduser().resolve()
    root = root.resolve()
    if resolved == root or root in resolved.parents:
        raise ConfirmationError("확인표·수집 결과는 저장소 작업 폴더 안에 쓰지 않는다")
    return resolved


def _label(repository: RepositoryCoordinates) -> str:
    return f"{repository.owner}__{repository.name}"


# 수집


@dataclass(frozen=True)
class _Credentials:
    context: CredentialContext

    def resolve(self, reference: str) -> CredentialContext | None:
        return self.context


@dataclass(frozen=True)
class _Selections:
    selected: SelectedRange

    def resolve(self, reference: str) -> SelectedRange | None:
        return self.selected


def local_request(repository: RepositoryCoordinates) -> CheckedRequest:
    """확인용 요청. 접수 기록이 없는 개발 명령이라 시도마다 새 ID를 쓴다(결과 메시지를 만들지 않는다)."""
    attempt = str(uuid.uuid4())
    return CheckedRequest(
        request_id=str(uuid.uuid4()),
        attempt_id=attempt,
        member_id="fr10-local-member",
        repository_id=f"fr10-local-{_label(repository)}",
        consent_id="fr10-local-consent",
        scope_revision="fr10-local-scope",
        allowed_resource_types=frozenset({"COMMIT", "PULL_REQUEST", "ISSUE"}),
        selection_reference=attempt,
        source_mode="LIVE",
        credential_context_reference=attempt,
    )


def collect_live(
    request: CheckedRequest,
    repository: RepositoryCoordinates,
    account: GitHubAccount,
    token: AccessToken,
    *,
    open_transport: Callable[[], Transport],
    clock: Clock,
) -> CollectionOutcome:
    """운영 수집과 같은 경로로 GitHub에서 모은다. 토큰은 수집 결과에 남지 않는다.

    운영과 다른 점은 하나다. 비공개 저장소(`JminAILab/CatchU`)도 모으도록 공개 여부 확인만 끈다
    (`allow_private_repository=True`, Step 20). 저장소 ID·같은 이름·크기 상한 확인은 그대로다.
    """
    started = clock()
    context = CredentialContext(
        member_id=request.member_id,
        repository_id=request.repository_id,
        scope_revision=request.scope_revision,
        repository=repository,
        linked_account=account,
        access_token=token,
        expires_at=started + timedelta(hours=2),
    )
    return collect(
        request,
        credentials=_Credentials(context),
        selections=_Selections(SelectedRange(request.repository_id, True)),
        open_transport=open_transport,
        clock=clock,
        started_at=started,
        relations=RelationOptions(),
        # FR10 확인 명령만 비공개 저장소를 모은다. 운영 경로(app.processing.live)는 넘기지 않는다.
        allow_private_repository=True,
    )


# 확인표


def _written(
    items: Sequence[Checked], judged: Callable[[str], object]
) -> list[dict[str, object]]:
    """AI가 쓴 글마다 기계 대조 결과와 판정 값(고르기 확률·참일 확률, 묻지 않았으면 None)."""
    return [
        {
            "id": each.item.id,
            "text": each.item.text,
            "lines": [line.id for line in each.item.lines],
            "passedFactcheck": each.passed,
            "judged": judged(each.item.id),
        }
        for each in items
    ]


def _title_value(answers: Mapping[str, object]) -> Callable[[str], object]:
    choice = answers.get("TITLE_CHOICE")
    return lambda item_id: choice.get(item_id) if isinstance(choice, dict) else None


def _sentence_value(answers: Mapping[str, object]) -> Callable[[str], object]:
    return lambda item_id: answers.get(f"SENTENCE_TRUE:{item_id}")


def sheet_entry(trace: CatchTrace) -> dict[str, object]:
    """Catch 하나의 확인표 칸. 맞음/틀림 칸(`marks`)은 비워 두고 팀장이 채운다."""
    record = trace.record
    verdict = trace.record_verdict
    return {
        "workIdentity": trace.work_identity,
        "recordText": None
        if record is None
        else {"source": record.source, "text": record.text, "weakByRule": record.weak},
        "titleCandidates": _written(trace.titles, _title_value(trace.answers)),
        "sentences": _written(trace.sentences, _sentence_value(trace.answers)),
        "judgement": trace.judgement,
        "judgementFailure": trace.failure,
        "answers": dict(trace.answers),
        "recordVerdict": None
        if verdict is None
        else {"weak": verdict.weak, "wholeMiss": verdict.whole_miss},
        # 기록의 글이 제목이어도 TITLE_CHOICE가 고른 AI 후보를 적는다(BR9.1).
        "chosenAiTitle": trace.chosen_title,
        "title": trace.title,
        "titleSource": trace.title_source,
        "keptSentences": list(trace.kept),
        "secondLineRemoved": trace.second_line_removed,
        "materialJudged": trace.material_judged,
        "materialSeconds": trace.material_seconds,
        "marks": {
            "title": None,
            "chosenAiTitle": None,
            "sentences": {each.item.id: None for each in trace.sentences},
            "note": "",
        },
    }


def confirm(
    request: CheckedRequest,
    outcome: CollectionOutcome,
    *,
    provider: GenerationProvider,
    judge: JudgementProvider,
    sheet_path: Path,
    clock: Clock,
    max_catches: int | None = None,
) -> dict[str, object]:
    """운영과 같은 후보 판정·생성·판정을 돌려 확인표를 쓴다. 결과 메시지는 만들지 않는다. 쓴 확인표를 돌려준다."""
    sheet_path = outside_repository(sheet_path)
    built = build_candidates(request, outcome)
    if max_catches is not None:
        built = replace(built, candidates=built.candidates[:max_catches])
    traces: list[CatchTrace] = []
    started = clock()
    if built.candidates:
        run_generation(
            request,
            outcome,
            built,
            provider=provider,
            clock=clock,
            deadline=started + GENERATION_BUDGET,
            judge=judge,
            observe=traces.append,
        )
    seconds = [trace.material_seconds for trace in traces if trace.material_seconds]
    sheet: dict[str, object] = {
        "repository": None
        if outcome.repository is None
        else f"{outcome.repository.owner}/{outcome.repository.name}",
        "judgementProvider": judge.name,
        "catches": len(traces),
        "analysisSeconds": round((clock() - started).total_seconds(), 1),
        "largestMaterialSeconds": max(seconds) if seconds else None,
        "items": [sheet_entry(trace) for trace in traces],
    }
    collection_file.write_private(
        sheet_path, json.dumps(sheet, ensure_ascii=False, indent=1)
    )
    return sheet


# 명령


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.processing.confirm",
        description="FR10 확인: 운영과 같은 판정을 돌려 저장소 밖 로컬 확인표를 쓴다(결과 메시지 없음).",
    )
    parser.add_argument("--repository", required=True, help="OWNER/NAME")
    parser.add_argument("--account-login", required=True, help="연동 계정 로그인")
    parser.add_argument(
        "--account-id", required=True, type=int, help="연동 계정 숫자 ID"
    )
    parser.add_argument(
        "--collection", type=Path, help="수집 결과 파일(없으면 수집해 쓴다)"
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="출력 폴더")
    parser.add_argument(
        "--max-catches", type=int, help="앞에서부터 이 수의 Catch만 확인"
    )
    return parser


def _check_saved_target(
    outcome: CollectionOutcome, repository: RepositoryCoordinates, account_id: int
) -> None:
    """읽은 수집 결과가 --repository·--account-id와 같은 대상인지 본다.

    확인표는 --repository 이름으로 쓰므로, 다른 저장소·계정의 수집을 읽으면
    그 결과가 이 저장소의 확인표로 섞인다. 저장소 이름은 GitHub처럼 대소문자를 가리지
    않고, 계정은 바뀌지 않는 숫자 식별자로 본다.
    """
    saved = outcome.repository
    if saved is None or (saved.owner.lower(), saved.name.lower()) != (
        repository.owner.lower(),
        repository.name.lower(),
    ):
        raise ConfirmationError("수집 결과 파일의 저장소가 --repository와 다르다")
    if (
        outcome.linked_account is None
        or outcome.linked_account.account_id != account_id
    ):
        raise ConfirmationError("수집 결과 파일의 연동 계정이 --account-id와 다르다")


def _coordinates(value: str) -> RepositoryCoordinates:
    owner, _, name = value.partition("/")
    if not _COORDINATE.fullmatch(owner) or not _COORDINATE.fullmatch(name):
        raise ConfirmationError("--repository는 OWNER/NAME 꼴이어야 한다")
    return RepositoryCoordinates(owner, name)


def _secret(environment: Mapping[str, str], name: str) -> AccessToken | None:
    value = environment.get(name, "")
    if not value:
        return None
    try:
        return AccessToken(value)
    except ValueError:
        raise ConfirmationError(f"{name}가 유효하지 않다") from None


# 시험이 바꿔 끼우는 부품(실제 SDK·GitHub 연결). 운영 경로는 이 명령을 쓰지 않는다.
def make_provider(key: AccessToken) -> GenerationProvider:
    from app.generation.claude import ClaudeProvider

    return ClaudeProvider(key)


def make_judge(
    provider: str, generation_key: AccessToken, judgement_key: AccessToken | None
) -> JudgementProvider:
    if provider == "claude":
        from app.judgement.claude import ClaudeJudge

        return ClaudeJudge(generation_key)
    if judgement_key is None:
        raise ConfirmationError(
            "AI 쪽이 꺼진 설정이다(공급자 openai에 CATCHU_JUDGEMENT_API_KEY 없음)"
        )
    from app.judgement.openai_judge import OpenAIJudge

    return OpenAIJudge(judgement_key)


def open_transport() -> Transport:
    return HttpsTransport()


def run(argv: Sequence[str] | None, environment: dict[str, str]) -> int:
    """명령 하나. 키·토큰을 읽은 뒤 environment(기본 os.environ)에서 지운다."""
    args = _parser().parse_args(argv)
    try:
        repository = _coordinates(args.repository)
        if args.max_catches is not None and args.max_catches < 1:
            raise ConfirmationError("--max-catches는 1 이상이어야 한다")
        output = outside_repository(args.output)
        collection = outside_repository(
            args.collection or output / f"{_label(repository)}.collection.json"
        )
        sheet = output / f"{_label(repository)}.sheet.json"
        token = _secret(environment, TOKEN_ENV)
        generation_key = _secret(environment, "CATCHU_GENERATION_API_KEY")
        judgement_key = _secret(environment, "CATCHU_JUDGEMENT_API_KEY")
        provider_name = environment.get("CATCHU_JUDGEMENT_PROVIDER") or "openai"
        for name in KEY_ENV:
            environment.pop(name, None)
        if provider_name not in ("openai", "claude"):
            raise ConfirmationError(
                "CATCHU_JUDGEMENT_PROVIDER는 openai 또는 claude여야 한다"
            )
        if generation_key is None:
            raise ConfirmationError("CATCHU_GENERATION_API_KEY가 필요하다")
        judge = make_judge(provider_name, generation_key, judgement_key)
        request = local_request(repository)
        clock = lambda: datetime.now(UTC)  # noqa: E731
        if collection.exists():
            outcome = collection_file.read(collection)
            _check_saved_target(outcome, repository, args.account_id)
        else:
            if token is None:
                raise ConfirmationError(f"수집 결과 파일이 없어 {TOKEN_ENV}가 필요하다")
            outcome = collect_live(
                request,
                repository,
                GitHubAccount(args.account_login, args.account_id),
                token,
                open_transport=open_transport,
                clock=clock,
            )
            collection_file.write(collection, outcome)
        if outcome.failures:
            logger.warning(
                "수집이 끝까지 가지 못했다: failures=%d", len(outcome.failures)
            )
        written = confirm(
            request,
            outcome,
            provider=make_provider(generation_key),
            judge=judge,
            sheet_path=sheet,
            clock=clock,
            max_catches=args.max_catches,
        )
    except (ConfirmationError, collection_file.CollectionFileError) as error:
        print(f"확인 명령 오류: {error}", file=sys.stderr)
        return 2
    print(f"확인표: {sheet} (Catch {written['catches']}개)")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    return run(argv, os.environ)  # type: ignore[arg-type]


if __name__ == "__main__":
    raise SystemExit(main())
