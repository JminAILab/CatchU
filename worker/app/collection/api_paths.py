"""대상 저장소 하나의 GitHub REST API 경로 틀.

경로는 검사를 통과한 저장소 좌표·SHA·번호와 F가 올리는 쪽 번호로만 만든다. 응답의
`url`·Link 헤더의 next 주소는 쓰지 않는다. 경로를 만드는 곳은 이 모듈뿐이다.
"""

from dataclasses import dataclass
from typing import NewType

from app.collection.identifiers import (
    RepositoryCoordinates,
    normalize_sha,
    require_number,
)

ApiPath = NewType("ApiPath", str)

# GitHub 목록 API의 한 쪽 최대 항목 수.
MAX_PER_PAGE = 100


def _page_query(page: int, per_page: int) -> str:
    require_number(page)
    if not 1 <= require_number(per_page) <= MAX_PER_PAGE:
        raise ValueError("per_page는 1~100이어야 한다")
    return f"per_page={per_page}&page={page}"


@dataclass(frozen=True)
class RepositoryPaths:
    repository: RepositoryCoordinates

    @property
    def _base(self) -> str:
        return f"/repos/{self.repository.owner}/{self.repository.name}"

    def metadata(self) -> ApiPath:
        return ApiPath(self._base)

    def commits(self, page: int, per_page: int) -> ApiPath:
        """기본 브랜치의 커밋, 최근 것부터."""
        return ApiPath(f"{self._base}/commits?{_page_query(page, per_page)}")

    def commit(self, sha: str) -> ApiPath:
        return ApiPath(f"{self._base}/commits/{normalize_sha(sha)}")

    def pull_requests(self, page: int, per_page: int) -> ApiPath:
        """열린·닫힌 PR 모두, 만든 순서의 최근 것부터."""
        query = f"state=all&sort=created&direction=desc&{_page_query(page, per_page)}"
        return ApiPath(f"{self._base}/pulls?{query}")

    def pull_request_commits(self, number: int, page: int, per_page: int) -> ApiPath:
        number = require_number(number)
        return ApiPath(
            f"{self._base}/pulls/{number}/commits?{_page_query(page, per_page)}"
        )

    def issues(self, page: int, per_page: int) -> ApiPath:
        """열린·닫힌 이슈 모두, 만든 순서의 최근 것부터. 이 API는 PR도 섞어 돌려준다."""
        query = f"state=all&sort=created&direction=desc&{_page_query(page, per_page)}"
        return ApiPath(f"{self._base}/issues?{query}")
