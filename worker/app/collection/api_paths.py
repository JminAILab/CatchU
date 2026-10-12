"""대상 저장소 하나의 GitHub REST API 경로 틀.

경로는 검사를 통과한 저장소 좌표·SHA·번호·기준 브랜치 이름과 F가 올리는 쪽 번호로만
만든다. 브랜치 이름은 경로 문자로 해석되지 않게 모두 인코딩한다. 응답의
`url`·Link 헤더의 next 주소는 쓰지 않는다. REST 경로를 만드는 곳은 이 모듈뿐이다. 연결 PR
조회는 REST 대신 GraphQL 묶음 조회(graphql.py, #267)로 한다.
"""

from dataclasses import dataclass
from typing import NewType
from urllib.parse import quote

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

    def pull_request(self, number: int) -> ApiPath:
        """PR 하나(PR API). 관계 조회가 PR의 전체 커밋 수(`commits`)를 볼 때만 쓴다."""
        return ApiPath(f"{self._base}/pulls/{require_number(number)}")

    def pull_request_commits(self, number: int, page: int, per_page: int) -> ApiPath:
        number = require_number(number)
        return ApiPath(
            f"{self._base}/pulls/{number}/commits?{_page_query(page, per_page)}"
        )

    def branch_commits(self, ref: str, page: int, per_page: int) -> ApiPath:
        """지정한 브랜치의 커밋, 최근 것부터. ref는 호출하는 쪽이 이름 규칙으로 검사한 값이다."""
        if not ref:
            raise ValueError("브랜치 이름이 비었다")
        return ApiPath(
            f"{self._base}/commits?sha={quote(ref, safe='')}&"
            f"{_page_query(page, per_page)}"
        )

    def compare(
        self, base_sha: str, head_sha: str, page: int, per_page: int
    ) -> ApiPath:
        """두 커밋의 비교(base...head). 병합 기준 커밋과 전체 커밋 수를 준다."""
        return ApiPath(
            f"{self._base}/compare/{normalize_sha(base_sha)}...{normalize_sha(head_sha)}?"
            f"{_page_query(page, per_page)}"
        )

    def issues(self, page: int, per_page: int) -> ApiPath:
        """열린·닫힌 이슈 모두, 만든 순서의 최근 것부터. 이 API는 PR도 섞어 돌려준다."""
        query = f"state=all&sort=created&direction=desc&{_page_query(page, per_page)}"
        return ApiPath(f"{self._base}/issues?{query}")
