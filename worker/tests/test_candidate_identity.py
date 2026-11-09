"""작업 동일성 값 wi1: 정규 JSON 값, 정규화, C1–C5·C9–C13의 불변·민감성, 입력 검사.

기대 값은 함수를 거치지 않고 정규 JSON 글자를 직접 적어 hashlib로 만든다. CR1(FR2.1)에서 이슈
번호로 나누기를 껐으므로 나눈 부분 값은 없고 정규 JSON의 `part`는 늘 빈 목록이다. 나뉘지 않던 단위의
값은 고정 값 그대로다(BR1.3, S18).
"""

import dataclasses
import hashlib
import inspect
import re
from collections.abc import Callable
from typing import cast

import pytest

from app.candidates.identity import (
    WORK_IDENTITY_VERSION,
    CommitsUnit,
    IssueUnit,
    MergeUnit,
    PullRequestUnit,
    WorkUnit,
    work_identity,
)
from app.processing.request_check import SourceMode

REPO = "synthetic-repo-0001"
A, B, C, D = "a" * 40, "b" * 40, "c" * 40, "d" * 40
E64, F64 = "e" * 64, "f" * 64


def _hashed(canonical: str) -> str:
    for name, sha in {"<A>": A, "<C>": C, "<D>": D, "<E64>": E64, "<F64>": F64}.items():
        canonical = canonical.replace(name, sha)
    return "wi1:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _pr(number: int) -> str:
    return work_identity("LIVE", REPO, PullRequestUnit(number))


@pytest.mark.parametrize(
    ("mode", "repository_id", "unit", "canonical"),
    [
        (
            "LIVE",
            REPO,
            PullRequestUnit(3),
            '{"part":[],"repositoryId":"synthetic-repo-0001","sourceMode":"LIVE",'
            '"unit":{"number":3,"type":"PULL_REQUEST"},"version":"wi1"}',
        ),
        (
            "MOCK",
            "저장소 A:1",
            CommitsUnit((C.upper(), A, C)),
            '{"part":[],"repositoryId":"저장소 A:1","sourceMode":"MOCK",'
            '"unit":{"commits":["<A>","<C>"],"type":"COMMITS"},"version":"wi1"}',
        ),
        (
            "LIVE",
            REPO,
            MergeUnit(E64.upper()),
            '{"part":[],"repositoryId":"synthetic-repo-0001",'
            '"sourceMode":"LIVE","unit":{"commit":"<E64>","type":"MERGE"},'
            '"version":"wi1"}',
        ),
        (
            "LIVE",
            REPO,
            IssueUnit(7),
            '{"part":[],"repositoryId":"synthetic-repo-0001","sourceMode":"LIVE",'
            '"unit":{"number":7,"type":"ISSUE"},"version":"wi1"}',
        ),
    ],
    ids=["pr", "commits-mock-korean-repo", "merge-sha256", "issue"],
)
def test_value_is_sha256_of_hand_written_canonical_json(
    mode: SourceMode,
    repository_id: str,
    unit: WorkUnit,
    canonical: str,
) -> None:
    value = work_identity(mode, repository_id, unit)

    assert value == _hashed(canonical)
    assert re.fullmatch(r"wi1:[0-9a-f]{64}", value)
    assert len(value) == 68


def test_known_vectors_and_version_constant() -> None:
    # 기대 값 도우미까지 틀린 경우를 막는 고정 값(규칙 문서의 Python 호출로 따로 계산한 값). 나누기를
    # 끈 뒤에도 나뉘지 않던 단위의 값은 그대로다(BR1.3, S18).
    assert WORK_IDENTITY_VERSION == "wi1"
    assert _pr(3) == (
        "wi1:b5e4c6df75af3c30249001065b03c5eba3cba2e1a8de12be2e3f780e5b67cca8"
    )
    assert work_identity("LIVE", REPO, CommitsUnit((C, A))) == (
        "wi1:8f45576fdd428535d54bec3519a8566701fb4328b3bc64835763c8d75e771770"
    )


def test_inputs_are_only_mode_repository_and_unit() -> None:
    # C1–C4·C10: 제목·작업 사실·근거·sourceRevision·회원·요청 번호를 넣을 자리가 없다. 나눈 부분을
    # 넘길 자리도 없다(BR1.1).
    assert list(inspect.signature(work_identity).parameters) == [
        "source_mode",
        "repository_id",
        "unit",
    ]
    fields = {
        cls.__name__: tuple(field.name for field in dataclasses.fields(cls))
        for cls in (PullRequestUnit, MergeUnit, CommitsUnit, IssueUnit)
    }
    assert fields == {
        "PullRequestUnit": ("number",),
        "MergeUnit": ("commit",),
        "CommitsUnit": ("commits",),
        "IssueUnit": ("number",),
    }


def test_same_arguments_give_same_value_on_every_call() -> None:
    # C1–C4·C10의 불변성은 위 시험(제목·근거·회원 등을 넣을 자리가 없음)이 보인다. 여기서는
    # 같은 인자를 새 객체로 다시 넘겨도 값이 같은지, 곧 시각·난수·객체 번호를 쓰지 않는지 본다.
    def fresh() -> str:
        return work_identity("LIVE", REPO, PullRequestUnit(3))

    values = {fresh() for _ in range(5)}

    assert values == {_pr(3)}


@pytest.mark.parametrize(
    "commits",
    [(C, A), (C.upper(), A), (A, C, A), (A.upper(), C, A, C.upper())],
    ids=["order", "case", "duplicate", "case-duplicate"],
)
def test_commit_bundle_ignores_order_case_and_duplicates(
    commits: tuple[str, ...],
) -> None:
    # C5
    expected = work_identity("LIVE", REPO, CommitsUnit((A, C)))

    assert work_identity("LIVE", REPO, CommitsUnit(commits)) == expected


def test_same_revision_value_in_different_prs_differs() -> None:
    # C9: 판본 값(synthetic-revision-11)이 같아도 PR이 다르면 다른 작업이다.
    assert _pr(11) != _pr(12)


def test_repository_id_is_used_verbatim() -> None:
    # C11·C12: 저장소가 다르면 다른 값. 불투명한 값이라 대소문자·공백·구분자를 바꾸지 않는다.
    ids = ["repo-1", "Repo-1", " repo-1", "repo-1 ", "repo 1", "repo:1", "repo-2"]

    values = {work_identity("LIVE", rid, PullRequestUnit(3)) for rid in ids}

    assert len(values) == len(ids)


def test_repository_and_unit_boundary_cannot_collide() -> None:
    # 글자를 이어 붙이면 ("a:" + A, [B])와 ("a", [A, B])가 같아진다. 정규 JSON은 경계를 남긴다.
    first, second = ("a:" + A, (B,)), ("a", (A, B))
    assert ":".join([first[0], *first[1]]) == ":".join([second[0], *second[1]])

    assert work_identity("LIVE", first[0], CommitsUnit(first[1])) != work_identity(
        "LIVE", second[0], CommitsUnit(second[1])
    )


def test_mock_and_live_differ() -> None:
    # C13
    unit = PullRequestUnit(3)

    assert work_identity("MOCK", REPO, unit) != work_identity("LIVE", REPO, unit)


@pytest.mark.parametrize(
    ("left", "right"),
    [
        (PullRequestUnit(3), IssueUnit(3)),
        (MergeUnit(A), CommitsUnit((A,))),
        (PullRequestUnit(3), PullRequestUnit(4)),
        (CommitsUnit((A,)), CommitsUnit((A, B))),
    ],
    ids=[
        "pr-vs-issue-same-number",
        "merge-vs-commits-same-sha",
        "pr-number",
        "commit-set",
    ],
)
def test_unit_differences_change_value(left: WorkUnit, right: WorkUnit) -> None:
    assert work_identity("LIVE", REPO, left) != work_identity("LIVE", REPO, right)


def test_no_part_can_be_passed() -> None:
    """BR1.1: 나눈 부분을 넘길 수 없다. 예전처럼 네 번째 인자를 주면 호출 자체가 틀린 것이다."""
    with pytest.raises(TypeError):
        work_identity("LIVE", REPO, PullRequestUnit(3), ())  # type: ignore[call-arg]


@pytest.mark.parametrize(
    "call",
    [
        lambda: work_identity("LIVE", REPO, MergeUnit("abc1234")),
        lambda: work_identity("LIVE", REPO, CommitsUnit((A, "abc1234"))),
        lambda: work_identity("LIVE", REPO, MergeUnit("a" * 41)),
        lambda: work_identity("LIVE", REPO, MergeUnit("g" * 40)),
        lambda: work_identity("LIVE", REPO, CommitsUnit(())),
        lambda: _pr(0),
        lambda: _pr(-1),
        lambda: _pr(True),
        lambda: _pr(cast(int, "3")),
        lambda: work_identity("LIVE", REPO, IssueUnit(0)),
        lambda: work_identity("LIVE", REPO, IssueUnit(False)),
        lambda: work_identity("LIVE", "", PullRequestUnit(3)),
        lambda: work_identity("LIVE", cast(str, None), PullRequestUnit(3)),
        lambda: work_identity(cast(SourceMode, "live"), REPO, PullRequestUnit(3)),
        lambda: work_identity(cast(SourceMode, ""), REPO, PullRequestUnit(3)),
    ],
    ids=[
        "short-merge-sha",
        "short-sha-in-bundle",
        "sha-41-chars",
        "non-hex-sha",
        "empty-bundle",
        "zero-number",
        "negative-number",
        "bool-number",
        "string-number",
        "zero-issue",
        "bool-issue",
        "empty-repository-id",
        "non-string-repository-id",
        "lowercase-mode",
        "empty-mode",
    ],
)
def test_invalid_input_raises_value_error(call: Callable[[], str]) -> None:
    with pytest.raises(ValueError):
        call()
