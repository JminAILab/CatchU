"""LIVE 요청의 실제 처리(#121): 수집(#117) → 후보 판정(#118) → 생성(#120).

요청 정보 조회로 찾은 자격정보·선택 범위만 쓰고, 생성 제공자와 판정 공급자(CR3, AI 쪽이 켜졌을 때만)는 후보가
있을 때 한 번 만든다. 큐 소비자의 자식
프로세스 하나가 요청 하나를 맡으므로 제공자·자격정보·임시 자료의 수명이 곧 자식 프로세스 수명이다. 메시지를
보내거나 저장하지 않는다. 이 모듈은 `app.processing` 패키지 입구에서 다시 내보내지 않는다(수집 모듈이
`app.processing.request_check`를 불러오므로 서로 불러오는 고리가 생긴다).
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, timedelta

from app.candidates import build_candidates
from app.candidates.revisit import RevisitFact, revisit_facts
from app.collection import (
    PROPOSED_LIMITS,
    CollectionLimits,
    CollectionOutcome,
    CommitRecord,
    RelationOptions,
    Transport,
    collect,
)
from app.generation import (
    PROPOSED_GENERATION_LIMITS,
    GenerationLimits,
    GenerationProvider,
    run_generation,
)
from app.judgement.provider import JudgementProvider
from app.processing.generation import GenerationOutput
from app.processing.pipeline import Clock
from app.processing.request_check import CheckedRequest, SourceMode
from app.request_context import ContextFound, RequestContextClient

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LiveAssembly:
    """LIVE 처리에 쓰는 부품. 큐 소비자 자식이 기동 설정으로 만들고, 시험은 합성 대역을 넣는다."""

    context_client: RequestContextClient
    # GitHub 연결. 수집이 모든 사전 검사를 통과한 뒤에만 연다.
    open_transport: Callable[[], Transport]
    provider_factory: Callable[[], GenerationProvider]
    # 꺼낸 시각부터 생성 마감까지. 운영은 총 상한 60분에서 결과 조합·전송 여유 60초를 뺀 값이다.
    generation_budget: timedelta
    collection_limits: CollectionLimits = PROPOSED_LIMITS
    generation_limits: GenerationLimits = PROPOSED_GENERATION_LIMITS
    # 판정 공급자(CR3). None이면 AI 쪽이 꺼져 판정 호출이 0번이다(BR1.1·BR1.3).
    judge_factory: Callable[[], JudgementProvider] | None = None


class LiveGenerator:
    """요청 하나의 수집·후보·초안·질문·제목. 조회로 받은 값을 그대로 돌려주는 resolver로 수집한다.

    수집·생성 중 확인한 오류는 결과(failures, 후보의 생성 상태)로 돌려준다. 요청 전체의 실행 여부를 모르면
    `ExecutionUnknown`을 그대로 올려 처리 순서가 UNCERTAIN만 알리게 한다(결과로 바꾸지 않는다).
    """

    def __init__(
        self,
        found: ContextFound,
        assembly: LiveAssembly,
        *,
        picked_at: datetime,
        clock: Clock,
    ) -> None:
        self._found = found
        self._assembly = assembly
        self._picked_at = picked_at
        self._clock = clock

    @property
    def source_mode(self) -> SourceMode:
        return "LIVE"

    def generate(self, request: CheckedRequest) -> GenerationOutput:
        assembly = self._assembly
        # 수집 시간 상한도 꺼낸 시각부터 잰다(수집 통제 2.3 "시계는 하나").
        outcome = collect(
            request,
            credentials=self._found.credentials,
            selections=self._found.selections,
            open_transport=assembly.open_transport,
            clock=self._clock,
            limits=assembly.collection_limits,
            started_at=self._picked_at,
            # 관계 조회는 후보 판정에 꼭 필요하다(없으면 판정이 결함으로 멈춘다). 추가 기준 브랜치를 넘길
            # 공급원이 없어 기본값(없음)을 쓴다.
            relations=RelationOptions(),
            # allow_private_repository는 넘기지 않는다: 운영은 공개 저장소만 모은다(FR10 확인 명령만 예외).
        )
        # 맥락 조회로 받은 소속 커밋 집합을 후보 판정과 생성 재료 찾기에 같은 값으로 넘긴다(CR2 BR1.6).
        assigned = self._found.assigned_commits
        built = with_revisit_facts(
            request, outcome, build_candidates(request, outcome, assigned)
        )
        if not built.candidates:
            # 생성할 후보가 없으면 제공자를 만들지 않는다. 생성 흐름도 이때는 후보·미제공·실패를 그대로 둔다.
            return built
        factory = assembly.judge_factory
        run = run_generation(
            request,
            outcome,
            built,
            provider=assembly.provider_factory(),
            clock=self._clock,
            deadline=self._picked_at + assembly.generation_budget,
            limits=assembly.generation_limits,
            judge=None if factory is None else factory(),
            assigned=assigned,
        )
        return run.output


def with_revisit_facts(
    request: CheckedRequest, outcome: CollectionOutcome, built: GenerationOutput
) -> GenerationOutput:
    """후보마다 다시 볼 곳 사실을 붙인다(NC3 BR5.1). 후보 판정 뒤, 생성 앞에서 부른다.

    기록 묶음은 후보 판정(grouping.py)과 같은 (기본 브랜치 창 커밋, 관계 조회 커밋)이다. 그래서 작업 시각이
    정해진 후보는 모든 본인 커밋의 기록이 이 사전에 있다.
    """
    if not built.candidates:
        return built
    relations = outcome.relations
    records: dict[str, CommitRecord] = {}
    for record in (*outcome.commits, *(() if relations is None else relations.commits)):
        records.setdefault(record.sha, record)
    return replace(
        built,
        candidates=tuple(
            replace(
                candidate,
                revisit_facts=_facts(request, candidate.own_commit_shas, records),
            )
            for candidate in built.candidates
        ),
    )


def _facts(
    request: CheckedRequest,
    own_commit_shas: tuple[str, ...],
    records: dict[str, CommitRecord],
) -> tuple[RevisitFact, ...]:
    try:
        return revisit_facts(own_commit_shas, records)
    except Exception as error:
        # 팀 규칙 「예외를 삼키지 않는다」의 예외 한 곳이다(NC3 NFR 요구 Q1 B, NFR8.3). 다시 볼 곳은 본인만
        # 보는 덧붙임이라, 판정 결함 하나로 분석 전체를 실패시키지 않고 그 후보 사실만 비운다. 대신 실패
        # 로그 한 줄을 남긴다. 예외 메시지에는 경로·줄 글자가 섞일 수 있어 종류 이름만 싣는다(NFR4.3).
        # BaseException(중단 신호 등)은 잡지 않는다.
        logger.error(
            "다시 볼 곳 계산 실패: requestId=%s attemptId=%s error=%s",
            request.request_id,
            request.attempt_id,
            type(error).__name__,
        )
        return ()
