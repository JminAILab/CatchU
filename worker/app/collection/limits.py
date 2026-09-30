"""수집 상한.

기본값은 모두 #116 문서(`docs/CatchU_수집통제_임시자료.md`) 「자원·시간 상한」의 제안값이다.
상세 조회 개수 두 값은 그 문서의 조회 개수가 "호출 수 안에서 끝나도록 잡은 값"이 되도록
이 모듈에서 더한 제안값이다. 기본값의 최악 호출 수는 목록 8회(저장소 1·커밋 5·PR 1·이슈 1)
+ 커밋 상세 200회 + PR 커밋 목록 30건 × 최대 3쪽 = 298회로 호출 상한 300회 안에 든다.
실제 GitHub API로 실측하기 전이므로 확정된 상한으로 인용하지 않는다.
"""

from dataclasses import dataclass, fields
from datetime import timedelta


@dataclass(frozen=True)
class CollectionLimits:
    # 요청 전체 상한. 넘으면 수집 실패다(BUDGET_EXCEEDED·TIME_LIMIT_EXCEEDED).
    max_calls: int = 300
    max_total_bytes: int = 50 * 1024 * 1024
    max_collection_time: timedelta = timedelta(minutes=10)
    # 조회 개수 범위와 단일 응답 크기. 넘은 부분은 실패가 아니라 한계로 기록한다.
    max_commits: int = 500
    max_pull_requests: int = 100
    # 이슈 목록 API는 PR도 섞어 돌려주므로 PR을 포함한 최근 항목 수로 센다.
    max_issue_items: int = 100
    # 연동 계정 기록 가운데 상세를 조회할 최근 기록 수. 넘은 기록은 한계로 남긴다.
    max_commit_details: int = 200
    max_pull_request_commit_lists: int = 30
    max_response_bytes: int = 10 * 1024 * 1024
    # 단일 호출 대기(초).
    connect_timeout: float = 5.0
    read_timeout: float = 15.0

    def __post_init__(self) -> None:
        for field in fields(self):
            value = getattr(self, field.name)
            if value <= (timedelta(0) if isinstance(value, timedelta) else 0):
                raise ValueError(f"상한은 0보다 커야 한다: {field.name}")


PROPOSED_LIMITS = CollectionLimits()
