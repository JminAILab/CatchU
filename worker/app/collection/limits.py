"""수집 상한.

조회 개수·커밋 상세·호출 수·수집 시간은 #424의 2026-11-01 팀장 결정이다.
그 밖의 응답 크기·총량·관계 조회별 상한은 기존 값을 유지한다. 현재 값과 적용 범위는
worker/docs/repository-analysis-u7.md에 있다. 실제 외부 호출 실측을 뜻하지 않는다.

호출 수는 실제 HTTP 요청 수다. REST 요청 1회와 연결 PR 묶음 조회의 GraphQL 요청 1회가 각각
1회이고, GraphQL 점수는 더하지 않는다(2026-10-12 팀장 결정, #267).

관계 조회(#118, `relations.py`)는 목록에 있는 모든 PR의 커밋 목록과 연결 PR 조회처럼 판정에
꼭 필요한 호출을 조회 개수로 줄이지 않는다. 그 호출이 상한에 걸리면 확인 중단(수집 실패)이다.
변경 내용 상세 가운데 판정에 꼭 필요하지 않은 것만 남은 호출·시간·총량 안에서 조회한다. 연결 PR
묶음 크기의 근거와 이전 호출 수 비교는 worker/docs/associated-pr-lookup.md에 있다.
"""

from dataclasses import dataclass, fields
from datetime import timedelta

from app.collection.graphql import MAX_BATCH


@dataclass(frozen=True)
class CollectionLimits:
    # 요청 전체 상한. 넘으면 수집 실패다(BUDGET_EXCEEDED·TIME_LIMIT_EXCEEDED).
    max_calls: int = 2500
    max_total_bytes: int = 50 * 1024 * 1024
    max_collection_time: timedelta = timedelta(seconds=1800)
    # 조회 개수 범위와 단일 응답 크기. 넘은 부분은 실패가 아니라 한계로 기록한다.
    max_commits: int = 3000
    max_pull_requests: int = 600
    # 이슈 목록 API는 PR도 섞어 돌려주므로 PR을 포함한 최근 항목 수로 센다.
    max_issue_items: int = 1000
    # 연동 계정 기록 가운데 상세를 조회할 최근 기록 수. 넘은 기록은 한계로 남긴다.
    max_commit_details: int = 1500
    max_pull_request_commit_lists: int = 30
    # 관계 조회: PR 커밋 목록이 250건에 닿은 PR 하나당, 또는 첫 부모 쪽이 창 밖으로 열린 PR 없는
    # 병합 하나당 비교 API로 읽을 최대 쪽 수, 추가 기준 브랜치 하나당 조회할 최근 커밋 수.
    max_compare_pages: int = 10
    max_base_branch_commits: int = 100
    # 관계 조회(#267): 연결 PR 묶음 조회 POST 하나에 넣을 최대 커밋 수(1~100).
    max_lookup_batch: int = 100
    max_response_bytes: int = 10 * 1024 * 1024
    # 단일 호출 대기(초).
    connect_timeout: float = 5.0
    read_timeout: float = 15.0

    def __post_init__(self) -> None:
        for field in fields(self):
            value = getattr(self, field.name)
            if value <= (timedelta(0) if isinstance(value, timedelta) else 0):
                raise ValueError(f"상한은 0보다 커야 한다: {field.name}")
        if self.max_lookup_batch > MAX_BATCH:
            raise ValueError("연결 PR 묶음 크기는 100을 넘을 수 없다")


PROPOSED_LIMITS = CollectionLimits()
