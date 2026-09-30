"""GitHub REST 응답(JSON)을 정규화된 기록으로 바꾼다.

필요한 필드만 읽고 모양을 검사한다. 응답의 `url`·`html_url` 같은 주소는 읽지 않는다.
본문·메시지의 글자는 해석하지 않고 그대로 자료로 옮긴다.
"""

from collections.abc import Iterable, Mapping
from datetime import datetime
from typing import Literal, cast

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
    )


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
