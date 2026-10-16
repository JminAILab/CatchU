"""내부 조회·기존 수집을 요청 수명 안에서 조립하는 호출 예시이자 실행 함수."""

from collections.abc import Callable
from datetime import datetime

from app.collection import (
    PROPOSED_LIMITS,
    CollectionLimits,
    CollectionOutcome,
    RelationOptions,
    Transport,
    collect,
)
from app.processing.request_check import CheckedRequest
from app.request_context.client import RequestContextClient


def collect_with_context(
    request: CheckedRequest,
    *,
    context_client: RequestContextClient,
    open_transport: Callable[[], Transport],
    clock: Callable[[], datetime],
    limits: CollectionLimits = PROPOSED_LIMITS,
    started_at: datetime | None = None,
    relations: RelationOptions | None = None,
) -> CollectionOutcome:
    """성공·거부·예외 모두 내부 context를 놓는다. 큐나 HTTP 경로에는 아직 연결하지 않는다."""
    with context_client.for_request(request) as resolvers:
        return collect(
            request,
            credentials=resolvers.credentials,
            selections=resolvers.selections,
            open_transport=open_transport,
            clock=clock,
            limits=limits,
            started_at=started_at,
            relations=relations,
        )
