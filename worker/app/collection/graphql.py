"""연결 PR 묶음 조회(#267)의 GraphQL 쿼리 틀.

쿼리 문은 이 모듈이 가진 틀 하나로만 만든다. 바뀌는 것은 묶음의 커밋 수(별칭 수)뿐이고, 저장소
좌표와 SHA는 쿼리 문에 넣지 않고 검사를 통과한 값만 변수로 넘긴다. 이름이 바뀌었거나 옮겨진
저장소를 따라가지 않도록 `followRenames: false`를 고정한다. 커밋마다 연결 PR은 첫 100개와 다음
쪽이 있는지만 받는다. 다음 쪽 cursor·응답의 주소·글은 받지 않고 다음 요청에 쓰지 않는다. 쓰기
(mutation)는 없다. 응답 해석은 `normalize.associated_pulls_batch`가 한다.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.collection.api_paths import MAX_PER_PAGE, ApiPath
from app.collection.identifiers import RepositoryCoordinates, normalize_sha

# GraphQL 호출이 가는 유일한 경로(호스트는 전송이 api.github.com으로 고정한다).
GRAPHQL_PATH = ApiPath("/graphql")
# 묶음 하나에 넣을 수 있는 최대 커밋 수. 커밋마다 연결 PR 연결 하나(first: 100)라 100개까지는 쿼리
# 점수가 1점이다(GitHub 점수 계산: 연결마다 필요한 요청 수의 합 ÷ 100, 최소 1점).
MAX_BATCH = 100

# 커밋 하나에서 받는 연결 PR 수(쿼리의 first). 이보다 많으면 다음 쪽 표시만 본다.
PULLS_PER_COMMIT = MAX_PER_PAGE

# 연결 PR 한 건에서 읽는 필드. REST 연결 PR API에서 읽던 값과 같은 뜻의 필드만 둔다. 작성자 숫자 ID는
# Actor 인터페이스에 없어 숫자 ID가 있는 유형마다 받는다.
_PULL_FIELDS = (
    "number title body state createdAt closedAt mergedAt mergeCommit { oid } "
    "headRefOid headRefName baseRefName baseRefOid "
    "headRepository { nameWithOwner } baseRepository { nameWithOwner } "
    "author { __typename login ... on User { databaseId } ... on Bot { databaseId } "
    "... on Mannequin { databaseId } ... on Organization { databaseId } }"
)
_COMMIT_FRAGMENT = (
    "fragment AssociatedPulls on Commit { __typename oid "
    f"associatedPullRequests(first: {PULLS_PER_COMMIT}) "
    f"{{ pageInfo {{ hasNextPage }} nodes {{ {_PULL_FIELDS} }} }} }}"
)


def alias(index: int) -> str:
    """묶음의 index번째 커밋을 받는 응답 필드 이름."""
    return f"c{index}"


def _variable(index: int) -> str:
    return f"s{index}"


@dataclass(frozen=True)
class GraphQLRequest:
    """묶음 조회 요청 하나. 이 모듈의 틀(`associated_pulls_request`)로만 만든다."""

    query: str
    # 검사를 통과한 저장소 좌표와 SHA만 든다.
    variables: Mapping[str, str]
    # 요청 순서의 SHA. 응답 필드 alias(i)가 shas[i]의 결과다.
    shas: tuple[str, ...]


def associated_pulls_request(
    repository: RepositoryCoordinates, shas: Sequence[str]
) -> GraphQLRequest:
    """커밋 묶음(1~100개, 중복 없음)의 연결 PR을 묻는 읽기 쿼리."""
    checked = tuple(normalize_sha(sha) for sha in shas)
    if not 1 <= len(checked) <= MAX_BATCH:
        raise ValueError("묶음의 커밋 수는 1~100이어야 한다")
    if len(set(checked)) != len(checked):
        raise ValueError("묶음에 같은 커밋이 두 번 있다")
    declared = " ".join(
        f"${_variable(index)}: GitObjectID!" for index in range(len(checked))
    )
    selections = " ".join(
        f"{alias(index)}: object(oid: ${_variable(index)}) {{ ...AssociatedPulls }}"
        for index in range(len(checked))
    )
    query = (
        f"query AssociatedPulls($owner: String!, $name: String!, {declared}) {{ "
        "rateLimit { cost remaining resetAt } "
        "repository(owner: $owner, name: $name, followRenames: false) "
        f"{{ nameWithOwner {selections} }} }} {_COMMIT_FRAGMENT}"
    )
    variables = {"owner": repository.owner, "name": repository.name}
    variables.update((_variable(index), sha) for index, sha in enumerate(checked))
    return GraphQLRequest(query, variables, checked)
