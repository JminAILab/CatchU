"""GitHub REST 응답(JSON)과 연결 PR 묶음 조회의 GraphQL 응답을 정규화된 기록으로 바꾼다.

필요한 필드만 읽고 모양을 검사한다. 응답의 `url`·`html_url` 같은 주소는 읽지 않는다.
본문·메시지의 글자는 해석하지 않고 그대로 자료로 옮긴다. diff 형식 커밋 응답은 파일 머리글의
경로와 모드 줄만 읽는다.
"""

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, cast

from app.collection.graphql import PULLS_PER_COMMIT, GraphQLRequest, alias
from app.collection.identifiers import (
    GitHubAccount,
    RepositoryCoordinates,
    normalize_sha,
    require_number,
)
from app.collection.records import (
    ChangedFile,
    CommitChanges,
    CommitRecord,
    DetailStatus,
    IssueRecord,
    PullRequestRecord,
)

Json = Mapping[str, object]


class MalformedResponse(Exception):
    """응답이 예상한 모양이 아니다. 원문을 메시지에 넣지 않는다."""


def _object(value: object) -> Json:
    if not isinstance(value, Mapping):
        raise MalformedResponse("객체가 아니다")
    return cast(Json, value)


def as_list(value: object) -> list[object]:
    if not isinstance(value, list):
        raise MalformedResponse("목록이 아니다")
    return value


def _text(data: Json, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str):
        raise MalformedResponse(f"{key}: 문자열이 아니다")
    return value


def _optional_text(data: Json, key: str) -> str | None:
    value = data.get(key)
    if value is not None and not isinstance(value, str):
        raise MalformedResponse(f"{key}: 문자열이 아니다")
    return value


def _count(data: Json, key: str) -> int:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise MalformedResponse(f"{key}: 0 이상의 정수가 아니다")
    return value


def _time(value: object, key: str) -> datetime:
    if not isinstance(value, str):
        raise MalformedResponse(f"{key}: 시각이 아니다")
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        raise MalformedResponse(f"{key}: 시각 형식이 아니다") from None
    if moment.tzinfo is None:
        raise MalformedResponse(f"{key}: 시간대가 없다")
    return moment


def _optional_time(data: Json, key: str) -> datetime | None:
    value = data.get(key)
    return None if value is None else _time(value, key)


def _state(data: Json) -> Literal["open", "closed"]:
    state = data.get("state")
    if state == "open" or state == "closed":
        return state
    raise MalformedResponse("state: open·closed가 아니다")


def _sha(value: object) -> str:
    try:
        return normalize_sha(value)
    except ValueError:
        raise MalformedResponse("SHA 형식이 아니다") from None


def _number(value: object) -> int:
    try:
        return require_number(value)
    except ValueError:
        raise MalformedResponse("번호 형식이 아니다") from None


def _account(value: object) -> GitHubAccount | None:
    if value is None:
        return None
    data = _object(value)
    try:
        return GitHubAccount(_text(data, "login"), require_number(data.get("id")))
    except ValueError:
        raise MalformedResponse("계정 형식이 아니다") from None


def repository_full_name(data: object) -> str:
    return _text(_object(data), "full_name")


def repository_default_branch(data: object) -> str:
    """저장소 응답의 기본 브랜치 이름. 비었거나 문자열이 아니면 모양 오류다."""
    name = _text(_object(data), "default_branch")
    if not name:
        raise MalformedResponse("default_branch: 비었다")
    return name


def repository_is_public(data: object) -> bool:
    """저장소 응답이 공개 저장소라고 하는가.

    필수 항목 `private`가 거짓이고, 선택 항목 `visibility`가 있으면 그것도 public이어야 한다.
    `private`가 없거나 참·거짓이 아니면 공개로 추정하지 않고 모양 오류로 둔다.
    """
    repository = _object(data)
    private = repository.get("private")
    if not isinstance(private, bool):
        raise MalformedResponse("private: 참·거짓이 아니다")
    visibility = _optional_text(repository, "visibility")
    return not private and visibility in (None, "public")


def commit(item: object, status: DetailStatus) -> CommitRecord:
    """커밋 목록의 항목. 변경 내용은 상세 조회에서 채운다."""
    data = _object(item)
    git = _object(data.get("commit"))
    return CommitRecord(
        sha=_sha(data.get("sha")),
        parents=tuple(
            _sha(_object(parent).get("sha")) for parent in as_list(data.get("parents"))
        ),
        message=_text(git, "message"),
        authored_at=_time(_object(git.get("author")).get("date"), "author.date"),
        committed_at=_time(_object(git.get("committer")).get("date"), "committer.date"),
        author=_account(data.get("author")),
        committer=_account(data.get("committer")),
        changes=None,
        changes_status=status,
    )


def commit_changes(
    detail: object, expected_sha: str, *, files_truncated: bool
) -> CommitChanges:
    """커밋 상세 응답의 변경 파일과 줄 수."""
    data = _object(detail)
    if _sha(data.get("sha")) != expected_sha:
        raise MalformedResponse("요청한 커밋이 아니다")
    stats = _object(data.get("stats"))
    files = []
    for item in as_list(data.get("files")):
        entry = _object(item)
        files.append(
            ChangedFile(
                path=_text(entry, "filename"),
                status=_text(entry, "status"),
                additions=_count(entry, "additions"),
                deletions=_count(entry, "deletions"),
                previous_path=_optional_text(entry, "previous_filename"),
                patch=_optional_text(entry, "patch"),
            )
        )
    return CommitChanges(
        files=tuple(files),
        additions=_count(stats, "additions"),
        deletions=_count(stats, "deletions"),
        files_truncated=files_truncated,
    )


# diff 형식 커밋 응답(`application/vnd.github.diff`)의 파일 머리글.
_DIFF_GIT = b"diff --git "
_MODE_LINE = re.compile(
    rb"(?:old mode|new mode|new file mode|deleted file mode) [0-7]{6}"
)
_MODE_PREFIXES = (b"old mode ", b"new mode ", b"new file mode ", b"deleted file mode ")
# git의 C 문자열 따옴표 규칙에서 `\` 뒤 글자가 나타내는 바이트.
_UNESCAPED = {
    ord("a"): 0x07,
    ord("b"): 0x08,
    ord("t"): 0x09,
    ord("n"): 0x0A,
    ord("v"): 0x0B,
    ord("f"): 0x0C,
    ord("r"): 0x0D,
    ord('"'): 0x22,
    ord("\\"): 0x5C,
}
_OCTAL = frozenset(b"01234567")


def diff_file_modes(body: bytes) -> dict[str, tuple[str, ...]] | None:
    """diff 형식 커밋 응답에서 파일마다 모드 줄(git 순서). 맞춰 읽을 수 없으면 None.

    `diff --git` 줄부터 그 파일의 `---` 줄(없으면 다음 `diff --git` 줄) 전까지를 머리글로 보고,
    그 안의 `old mode`·`new mode`·`new file mode`·`deleted file mode` 줄만 남긴다. `index` 줄은
    건너뛴다. hunk 줄은 읽지 않는다. 경로는 git 따옴표 규칙(`"...\\t..."`, `\\ooo`)을 풀어
    UTF-8로 읽는다. 다음이면 None이다: 첫 줄이 `diff --git`이 아니다, 두 경로가 다르다(이름 바꿈
    등), 경로를 읽을 수 없다, 같은 경로가 두 번 나온다, 머리글에 그 밖의 줄(유사도·이름 바꿈·
    이진 표시 등)이나 모양이 다른 모드 줄이 있다. 셸이나 git을 부르지 않는다.
    """
    lines = body.split(b"\n")
    if lines and lines[-1] == b"":
        lines.pop()
    modes: dict[str, list[str]] = {}
    current: list[str] | None = None
    in_header = False
    for line in lines:
        if line.startswith(_DIFF_GIT):
            path = _diff_path(line[len(_DIFF_GIT) :])
            if path is None or path in modes:
                return None
            current = modes[path] = []
            in_header = True
            continue
        if current is None:
            return None
        if not in_header:
            continue
        if line.startswith(b"--- "):
            in_header = False
        elif line.startswith(_MODE_PREFIXES):
            if _MODE_LINE.fullmatch(line) is None:
                return None
            current.append(line.decode("ascii"))
        elif not line.startswith(b"index "):
            return None
    return {path: tuple(found) for path, found in modes.items()}


def _diff_path(names: bytes) -> str | None:
    """`diff --git` 줄의 두 이름(`a/경로 b/경로`)이 같은 경로를 가리킬 때 그 경로."""
    if names.startswith(b'"'):
        first = _unquoted(names)
        if first is None or not first[1].startswith(b' "'):
            return None
        second = _unquoted(first[1][1:])
        if second is None or second[1]:
            return None
        old, new = first[0], second[0]
    else:
        # 따옴표가 없으면 경로에 공백이 있을 수 있으므로 같은 경로라고 보고 길이로 가른다.
        half = (len(names) - 1) // 2
        if len(names) % 2 == 0 or names[half : half + 1] != b" ":
            return None
        old, new = names[:half], names[half + 1 :]
    if not (old.startswith(b"a/") and new.startswith(b"b/")) or old[2:] != new[2:]:
        return None
    try:
        path = old[2:].decode("utf-8")
    except UnicodeDecodeError:
        return None
    return path or None


def _unquoted(text: bytes) -> tuple[bytes, bytes] | None:
    """`"`로 시작하는 git 따옴표 이름의 (푼 바이트, 닫는 따옴표 뒤). 모양이 다르면 None."""
    raw = bytearray()
    index = 1
    while index < len(text):
        byte = text[index]
        if byte == 0x22:
            return bytes(raw), text[index + 1 :]
        if byte != 0x5C:
            raw.append(byte)
            index += 1
            continue
        escaped = text[index + 1 : index + 2]
        if escaped and escaped[0] in _UNESCAPED:
            raw.append(_UNESCAPED[escaped[0]])
            index += 2
            continue
        digits = text[index + 1 : index + 4]
        if len(digits) != 3 or not set(digits) <= _OCTAL or digits[0] > ord("3"):
            return None
        raw.append(int(digits, 8))
        index += 4
    return None


def pull_request(
    item: object, repository: RepositoryCoordinates, status: DetailStatus
) -> PullRequestRecord:
    """PR 목록의 항목. 커밋 목록은 따로 조회해 채운다."""
    data = _object(item)
    head = _object(data.get("head"))
    base = _object(data.get("base"))
    head_repository = head.get("repo")
    merged_at = _optional_time(data, "merged_at")
    merge_commit = data.get("merge_commit_sha")
    try:
        # 비교 API의 기준으로만 쓰는 선택 값이다. 없다고 PR 기록을 버리지 않는다.
        base_sha: str | None = normalize_sha(base.get("sha"))
    except ValueError:
        base_sha = None
    return PullRequestRecord(
        number=_number(data.get("number")),
        title=_text(data, "title"),
        body=_optional_text(data, "body") or "",
        state=_state(data),
        created_at=_time(data.get("created_at"), "created_at"),
        closed_at=_optional_time(data, "closed_at"),
        merged_at=merged_at,
        merge_commit_sha=(
            _sha(merge_commit) if merged_at is not None and merge_commit else None
        ),
        head_sha=_sha(head.get("sha")),
        base_ref=_text(base, "ref"),
        head_ref=_text(head, "ref"),
        # 포크가 지워졌으면 head.repo가 null이다. 이것도 이 저장소 밖에서 연 PR이다.
        from_fork=head_repository is None
        or not repository.same_as(repository_full_name(head_repository)),
        author=_account(data.get("user")),
        commits=None,
        commits_status=status,
        commits_truncated=False,
        base_sha=base_sha,
    )


@dataclass(frozen=True)
class AssociatedPullRequests:
    """커밋 하나의 연결 PR 한 쪽을 기준 저장소로 가른 결과."""

    # 이 저장소를 기준으로 연 PR(응답 순서).
    records: tuple[PullRequestRecord, ...]
    # 기준 저장소가 다른 저장소로 확인돼 버린 PR 수.
    foreign: int
    # 기준 저장소를 알 수 없어(`base.repo`가 없거나 null) 버린 PR 수. 이 저장소 PR일 수도 있다.
    unknown_base: int


@dataclass(frozen=True)
class PullRequestDetail:
    """PR API(PR 하나) 응답에서 PR 커밋 목록 250건 밖을 확인할 때 쓰는 값."""

    # PR의 전체 커밋 수(`commits`).
    total_commits: int
    # 이 응답을 받은 때의 PR 머리 커밋(`head.sha`). 이 PR을 관측한 판본과 대조한다.
    head_sha: str
    # 이 응답의 기준 브랜치 커밋(`base.sha`). 없거나 형식이 다르면 None.
    base_sha: str | None


def pull_request_detail(data: object, number: int) -> PullRequestDetail:
    """PR API 응답의 전체 커밋 수와 머리·기준 커밋. 요청한 PR이 아니면 모양 오류다."""
    pull = _object(data)
    if _number(pull.get("number")) != number:
        raise MalformedResponse("요청한 PR이 아니다")
    try:
        base_sha: str | None = normalize_sha(_object(pull.get("base")).get("sha"))
    except (ValueError, MalformedResponse):
        base_sha = None
    return PullRequestDetail(
        total_commits=_count(pull, "commits"),
        head_sha=_sha(_object(pull.get("head")).get("sha")),
        base_sha=base_sha,
    )


@dataclass(frozen=True)
class Comparison:
    """비교 API(base...head) 응답 한 쪽. commits는 커밋 목록 항목 모양 그대로다."""

    total_commits: int
    commits: tuple[object, ...]
    # 비교의 시작 커밋(`merge_base_commit`). 경계를 남기는 선택 값이라 없거나 형식이 다르면 None.
    merge_base: str | None = None


def comparison(data: object) -> Comparison:
    compared = _object(data)
    base = compared.get("merge_base_commit")
    try:
        merge_base: str | None = (
            normalize_sha(base.get("sha")) if isinstance(base, dict) else None
        )
    except ValueError:
        merge_base = None
    return Comparison(
        total_commits=_count(compared, "total_commits"),
        commits=tuple(as_list(compared.get("commits"))),
        merge_base=merge_base,
    )


# 연결 PR 묶음 조회(#267, GraphQL). 쿼리 틀은 graphql.py에 있다.


class MissingCommit(MalformedResponse):
    """묶음 응답에서 요청한 커밋이 null이다(GitHub가 그 SHA의 커밋을 찾지 못했다)."""


class RepositoryMismatch(MalformedResponse):
    """요청한 저장소가 아닌 저장소로 답했다."""


@dataclass(frozen=True)
class CommitPulls:
    """커밋 하나의 연결 PR 첫 쪽을 기준 저장소로 가른 결과."""

    sha: str
    found: AssociatedPullRequests
    # 첫 100개 뒤에 연결 PR이 더 있다.
    has_next_page: bool


def associated_pulls_batch(
    data: object, request: GraphQLRequest, repository: RepositoryCoordinates
) -> tuple[CommitPulls, ...]:
    """묶음 응답의 `data`를 요청 순서의 커밋별 결과로 바꾼다. 하나라도 어긋나면 예외를 올린다.

    별칭은 요청 때 정한 것과 정확히 같아야 하고, 커밋은 그 별칭에 묶은 SHA여야 한다. 응답의 필드
    순서는 쓰지 않는다. 결과를 모두 만든 뒤에만 돌려주므로 예외가 나면 그 묶음의 관계 상태도 PR
    기록도 남지 않는다. `rateLimit`은 기록용이라 여기서 보지 않는다(`graphql_rate_limit`).
    """
    top = _object(data)
    if not set(top) <= {"rateLimit", "repository"}:
        raise MalformedResponse("요청하지 않은 최상위 필드가 있다")
    found = _object(top.get("repository"))
    if not repository.same_as(_text(found, "nameWithOwner")):
        raise RepositoryMismatch("요청한 저장소가 아니다")
    aliases = [alias(index) for index in range(len(request.shas))]
    if set(found) != {"nameWithOwner", *aliases}:
        raise MalformedResponse("요청한 별칭과 응답의 별칭이 맞지 않는다")
    return tuple(
        _commit_pulls(found[name], sha, repository)
        for name, sha in zip(aliases, request.shas, strict=True)
    )


def _commit_pulls(
    value: object, sha: str, repository: RepositoryCoordinates
) -> CommitPulls:
    if value is None:
        raise MissingCommit("커밋이 null이다")
    commit = _object(value)
    if commit.get("__typename") != "Commit":
        raise MalformedResponse("커밋이 아니다")
    if _sha(commit.get("oid")) != sha:
        raise MalformedResponse("요청한 커밋이 아니다")
    connection = _object(commit.get("associatedPullRequests"))
    next_page = _object(connection.get("pageInfo")).get("hasNextPage")
    if not isinstance(next_page, bool):
        raise MalformedResponse("hasNextPage: 참·거짓이 아니다")
    nodes = as_list(connection.get("nodes"))
    if len(nodes) > PULLS_PER_COMMIT:
        raise MalformedResponse("연결 PR이 요청한 수보다 많다")
    records: list[PullRequestRecord] = []
    foreign = 0
    unknown_base = 0
    for node in nodes:
        pull = _object(node)
        if "baseRepository" not in pull:
            raise MalformedResponse("baseRepository: 없다")
        base_repository = pull["baseRepository"]
        if base_repository is None:
            # 기준 저장소를 알 수 없다. 이 저장소 PR일 수도 있다.
            unknown_base += 1
            continue
        if not repository.same_as(_text(_object(base_repository), "nameWithOwner")):
            foreign += 1
            continue
        records.append(_graphql_pull_request(pull, repository))
    return CommitPulls(
        sha, AssociatedPullRequests(tuple(records), foreign, unknown_base), next_page
    )


_GRAPHQL_STATES: dict[str, Literal["open", "closed"]] = {
    "OPEN": "open",
    "CLOSED": "closed",
    # REST는 병합된 PR의 state를 closed로 준다.
    "MERGED": "closed",
}


def _graphql_pull_request(
    pull: Json, repository: RepositoryCoordinates
) -> PullRequestRecord:
    """연결 PR 한 건. REST 연결 PR API의 같은 PR을 정규화한 기록(`pull_request`)과 같은 뜻이다."""
    state = pull.get("state")
    if not isinstance(state, str) or state not in _GRAPHQL_STATES:
        raise MalformedResponse("state: OPEN·CLOSED·MERGED가 아니다")
    merged_at = _optional_time(pull, "mergedAt")
    if (state == "MERGED") != (merged_at is not None):
        raise MalformedResponse("병합 상태와 병합 시각이 맞지 않는다")
    merge_commit = pull.get("mergeCommit")
    if merge_commit is not None:
        merge_commit = _object(merge_commit).get("oid")
    if "headRepository" not in pull:
        raise MalformedResponse("headRepository: 없다")
    head_repository = pull["headRepository"]
    try:
        # 비교 API의 기준으로만 쓰는 선택 값이다(REST의 base.sha). 없다고 PR 기록을 버리지 않는다.
        base_sha: str | None = normalize_sha(pull.get("baseRefOid"))
    except ValueError:
        base_sha = None
    return PullRequestRecord(
        number=_number(pull.get("number")),
        title=_text(pull, "title"),
        body=_optional_text(pull, "body") or "",
        state=_GRAPHQL_STATES[state],
        created_at=_time(pull.get("createdAt"), "createdAt"),
        closed_at=_optional_time(pull, "closedAt"),
        merged_at=merged_at,
        merge_commit_sha=(
            _sha(merge_commit) if merged_at is not None and merge_commit else None
        ),
        head_sha=_sha(pull.get("headRefOid")),
        base_ref=_text(pull, "baseRefName"),
        head_ref=_text(pull, "headRefName"),
        # 포크가 지워졌으면 headRepository가 null이다. 이것도 이 저장소 밖에서 연 PR이다.
        from_fork=head_repository is None
        or not repository.same_as(_text(_object(head_repository), "nameWithOwner")),
        author=_graphql_author(pull),
        commits=None,
        commits_status=DetailStatus.NOT_REQUESTED,
        commits_truncated=False,
        base_sha=base_sha,
    )


def _graphql_author(pull: Json) -> GitHubAccount | None:
    """작성자. 명시적 null만 작성자 없음이다. 있는 작성자의 숫자 ID를 얻지 못하면 모양 오류다.

    숫자 ID(`databaseId`)는 REST의 `user.id`와 같은 계정을 가리킨다고 보고 같은 칸에 넣는다.
    """
    if "author" not in pull:
        raise MalformedResponse("author: 없다")
    value = pull["author"]
    if value is None:
        return None
    author = _object(value)
    try:
        return GitHubAccount(
            _text(author, "login"), require_number(author.get("databaseId"))
        )
    except ValueError:
        raise MalformedResponse("계정 형식이 아니다") from None


@dataclass(frozen=True)
class RateLimitObservation:
    """GraphQL 응답이 함께 준 점수. 기록용이며 관계 판정에 쓰지 않는다."""

    cost: int
    remaining: int
    reset_at: datetime


def graphql_rate_limit(data: object) -> RateLimitObservation | None:
    """정상 응답 `data`의 `rateLimit`. 없거나 null이거나 모양이 다르면 관측하지 못한 것(None)이다.

    점수는 기록일 뿐이라 이 값 때문에 관계 자료를 버리지 않는다.
    """
    if not isinstance(data, Mapping):
        return None
    value = cast(Json, data).get("rateLimit")
    if not isinstance(value, Mapping):
        return None
    found = cast(Json, value)
    try:
        return RateLimitObservation(
            _count(found, "cost"),
            _count(found, "remaining"),
            _time(found.get("resetAt"), "resetAt"),
        )
    except MalformedResponse:
        return None


def commit_shas(items: Iterable[object]) -> tuple[str, ...]:
    return tuple(_sha(_object(item).get("sha")) for item in items)


def is_pull_request_item(item: object) -> bool:
    """이슈 목록 API가 섞어 돌려준 PR 항목인가."""
    return "pull_request" in _object(item)


def issue(item: object) -> IssueRecord:
    data = _object(item)
    return IssueRecord(
        number=_number(data.get("number")),
        title=_text(data, "title"),
        body=_optional_text(data, "body") or "",
        state=_state(data),
        created_at=_time(data.get("created_at"), "created_at"),
        updated_at=_time(data.get("updated_at"), "updated_at"),
        closed_at=_optional_time(data, "closed_at"),
        author=_account(data.get("user")),
    )
