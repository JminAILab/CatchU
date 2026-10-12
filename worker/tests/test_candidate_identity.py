"""작업 동일성 값 wi1: 정규 JSON 값, 정규화, C1–C5·C9–C13의 불변·민감성, 입력 검사.

기대 값은 함수를 거치지 않고 정규 JSON 글자를 직접 적어 hashlib로 만든다.
"""

import dataclasses
import hashlib
import inspect
import random
import re
import unicodedata
from collections.abc import Callable
from typing import cast

import pytest

from app.candidates.identity import (
    WORK_IDENTITY_VERSION,
    CommitsUnit,
    IssueUnit,
    MergeUnit,
    Part,
    PullRequestUnit,
    WorkUnit,
    work_identity,
)
from app.processing.request_check import SourceMode

REPO = "synthetic-repo-0001"
A, B, C, D = "a" * 40, "b" * 40, "c" * 40, "d" * 40
E64, F64 = "e" * 64, "f" * 64

Case = tuple[WorkUnit, tuple[Part, ...]]


def _hashed(canonical: str) -> str:
    for name, sha in {"<A>": A, "<C>": C, "<D>": D, "<E64>": E64, "<F64>": F64}.items():
        canonical = canonical.replace(name, sha)
    return "wi1:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _pr(number: int, parts: tuple[Part, ...] = ()) -> str:
    return work_identity("LIVE", REPO, PullRequestUnit(number), parts)


@pytest.mark.parametrize(
    ("mode", "repository_id", "unit", "parts", "canonical"),
    [
        (
            "LIVE",
            REPO,
            PullRequestUnit(3),
            (),
            '{"part":[],"repositoryId":"synthetic-repo-0001","sourceMode":"LIVE",'
            '"unit":{"number":3,"type":"PULL_REQUEST"},"version":"wi1"}',
        ),
        (
            "MOCK",
            "저장소 A:1",
            CommitsUnit((C.upper(), A, C)),
            (),
            '{"part":[],"repositoryId":"저장소 A:1","sourceMode":"MOCK",'
            '"unit":{"commits":["<A>","<C>"],"type":"COMMITS"},"version":"wi1"}',
        ),
        (
            "LIVE",
            REPO,
            PullRequestUnit(20),
            (Part(D), Part(C, "src/한글.py"), Part(C.upper(), "src/b.py")),
            '{"part":[{"commit":"<C>","path":"src/b.py"},'
            '{"commit":"<C>","path":"src/한글.py"},{"commit":"<D>"}],'
            '"repositoryId":"synthetic-repo-0001","sourceMode":"LIVE",'
            '"unit":{"number":20,"type":"PULL_REQUEST"},"version":"wi1"}',
        ),
        (
            "LIVE",
            REPO,
            MergeUnit(E64.upper()),
            (Part(F64),),
            '{"part":[{"commit":"<F64>"}],"repositoryId":"synthetic-repo-0001",'
            '"sourceMode":"LIVE","unit":{"commit":"<E64>","type":"MERGE"},'
            '"version":"wi1"}',
        ),
        (
            "LIVE",
            REPO,
            IssueUnit(7),
            (),
            '{"part":[],"repositoryId":"synthetic-repo-0001","sourceMode":"LIVE",'
            '"unit":{"number":7,"type":"ISSUE"},"version":"wi1"}',
        ),
    ],
    ids=["pr", "commits-mock-korean-repo", "pr-parts", "merge-sha256", "issue"],
)
def test_value_is_sha256_of_hand_written_canonical_json(
    mode: SourceMode,
    repository_id: str,
    unit: WorkUnit,
    parts: tuple[Part, ...],
    canonical: str,
) -> None:
    value = work_identity(mode, repository_id, unit, parts)

    assert value == _hashed(canonical)
    assert re.fullmatch(r"wi1:[0-9a-f]{64}", value)
    assert len(value) == 68


def test_known_vectors_and_version_constant() -> None:
    # 기대 값 도우미까지 틀린 경우를 막는 고정 값(규칙 문서의 Python 호출로 따로 계산한 값).
    assert WORK_IDENTITY_VERSION == "wi1"
    assert _pr(3) == (
        "wi1:b5e4c6df75af3c30249001065b03c5eba3cba2e1a8de12be2e3f780e5b67cca8"
    )
    assert work_identity("LIVE", REPO, CommitsUnit((C, A))) == (
        "wi1:8f45576fdd428535d54bec3519a8566701fb4328b3bc64835763c8d75e771770"
    )
    assert _pr(20, (Part(C), Part(D))) == (
        "wi1:4bd7782de2858d4df4b036b47fde3681c829e03156b8cb8c57d1f80069f42a4f"
    )


def test_inputs_are_only_mode_repository_unit_and_parts() -> None:
    # C1–C4·C10: 제목·작업 사실·근거·sourceRevision·회원·요청 번호를 넣을 자리가 없다.
    assert list(inspect.signature(work_identity).parameters) == [
        "source_mode",
        "repository_id",
        "unit",
        "parts",
    ]
    fields = {
        cls.__name__: tuple(field.name for field in dataclasses.fields(cls))
        for cls in (PullRequestUnit, MergeUnit, CommitsUnit, IssueUnit, Part)
    }
    assert fields == {
        "PullRequestUnit": ("number",),
        "MergeUnit": ("commit",),
        "CommitsUnit": ("commits",),
        "IssueUnit": ("number",),
        "Part": ("commit", "path"),
    }


def test_same_arguments_give_same_value_on_every_call() -> None:
    # C1–C4·C10의 불변성은 위 시험(제목·근거·회원 등을 넣을 자리가 없음)이 보인다. 여기서는
    # 같은 인자를 새 객체로 다시 넘겨도 값이 같은지, 곧 시각·난수·객체 번호를 쓰지 않는지 본다.
    def fresh() -> str:
        return work_identity(
            "LIVE", REPO, PullRequestUnit(3), [Part(D), Part(C, "src/a.py")]
        )

    values = {fresh() for _ in range(5)}

    assert values == {_pr(3, (Part(C, "src/a.py"), Part(D)))}


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
        ((PullRequestUnit(3), ()), (IssueUnit(3), ())),
        ((MergeUnit(A), ()), (CommitsUnit((A,)), ())),
        ((PullRequestUnit(3), ()), (PullRequestUnit(4), ())),
        ((CommitsUnit((A,)), ()), (CommitsUnit((A, B)), ())),
        ((PullRequestUnit(3), ()), (PullRequestUnit(3), (Part(A),))),
        ((PullRequestUnit(3), (Part(A),)), (PullRequestUnit(3), (Part(B),))),
        ((PullRequestUnit(3), (Part(A),)), (PullRequestUnit(3), (Part(A), Part(B)))),
        ((PullRequestUnit(3), (Part(A),)), (PullRequestUnit(3), (Part(A, "a.py"),))),
        (
            (PullRequestUnit(3), (Part(A, "a.py"),)),
            (PullRequestUnit(3), (Part(A, "A.py"),)),
        ),
        (
            (PullRequestUnit(3), (Part(A, unicodedata.normalize("NFC", "한.py")),)),
            (PullRequestUnit(3), (Part(A, unicodedata.normalize("NFD", "한.py")),)),
        ),
    ],
    ids=[
        "pr-vs-issue-same-number",
        "merge-vs-commits-same-sha",
        "pr-number",
        "commit-set",
        "whole-vs-split",
        "part-commit",
        "part-count",
        "whole-commit-vs-path",
        "path-case",
        "path-no-unicode-normalization",
    ],
)
def test_unit_and_part_differences_change_value(left: Case, right: Case) -> None:
    assert work_identity("LIVE", REPO, *left) != work_identity("LIVE", REPO, *right)


def test_parts_sort_by_commit_then_path_in_code_point_order() -> None:
    # 코드 포인트 순: B(0x42) < b(0x62) < 한(U+D55C) < Ａ(U+FF21) < 😀(U+1F600).
    # UTF-16 단위로 비교하면 😀(0xD83D…)가 Ａ보다 앞서므로 그 순서와 구별된다.
    parts = [
        Part(A),
        Part(C, "src/b.py"),
        Part(C, "src/\U0001f600.py"),
        Part(C, "src/Ａ.py"),
        Part(C, "src/한글.py"),
        Part(C.upper(), "src/B.py"),
        Part(D),
    ]
    expected = _hashed(
        '{"part":[{"commit":"<A>"},'
        '{"commit":"<C>","path":"src/B.py"},{"commit":"<C>","path":"src/b.py"},'
        '{"commit":"<C>","path":"src/한글.py"},{"commit":"<C>","path":"src/Ａ.py"},'
        '{"commit":"<C>","path":"src/\U0001f600.py"},{"commit":"<D>"}],'
        '"repositoryId":"synthetic-repo-0001","sourceMode":"LIVE",'
        '"unit":{"number":3,"type":"PULL_REQUEST"},"version":"wi1"}'
    )
    shuffled = [list(reversed(parts))]
    for seed in range(20):
        order = list(parts)
        random.Random(seed).shuffle(order)
        shuffled.append(order)

    assert {_pr(3, tuple(order)) for order in [parts, *shuffled]} == {expected}


@pytest.mark.parametrize(
    ("parts", "same_as"),
    [
        ((Part(C), Part(C, "a.py")), (Part(C),)),
        ((Part(C, "a.py"), Part(C), Part(C, "b.py")), (Part(C),)),
        ((Part(C, "a.py"), Part(C.upper())), (Part(C),)),
        ((Part(C), Part(C.upper())), (Part(C),)),
        (
            (Part(C, "a.py"), Part(C, "a.py"), Part(C.upper(), "a.py")),
            (Part(C, "a.py"),),
        ),
        ((Part(C, "a.py"), Part(D)), (Part(D), Part(C, "a.py"))),
    ],
    ids=[
        "whole-absorbs-path",
        "whole-absorbs-paths",
        "whole-absorbs-across-case",
        "whole-dedupe",
        "path-dedupe",
        "order",
    ],
)
def test_parts_keep_one_form_per_commit_and_dedupe(
    parts: tuple[Part, ...], same_as: tuple[Part, ...]
) -> None:
    assert _pr(3, parts) == _pr(3, same_as)


def test_commit_bundle_may_split_inside_a_member_commit_by_path() -> None:
    # 한 커밋 안을 경로로 나눈 커밋 묶음은 받는다. 다른 커밋 전체를 함께 적을 수 있다.
    value = work_identity("LIVE", REPO, CommitsUnit((C, A)), (Part(A), Part(C, "x.py")))

    assert value == _hashed(
        '{"part":[{"commit":"<A>"},{"commit":"<C>","path":"x.py"}],'
        '"repositoryId":"synthetic-repo-0001","sourceMode":"LIVE",'
        '"unit":{"commits":["<A>","<C>"],"type":"COMMITS"},"version":"wi1"}'
    )


@pytest.mark.parametrize(
    "call",
    [
        lambda: work_identity("LIVE", REPO, IssueUnit(3), (Part(A),)),
        lambda: work_identity("LIVE", REPO, IssueUnit(3), (Part(A, "a.py"),)),
        lambda: work_identity("LIVE", REPO, MergeUnit(E64), (Part(E64), Part(F64))),
        lambda: work_identity("LIVE", REPO, MergeUnit(E64), (Part(E64.upper(), "a"),)),
        lambda: work_identity("LIVE", REPO, CommitsUnit((A, C)), (Part(A),)),
        lambda: work_identity("LIVE", REPO, CommitsUnit((A, C)), (Part(A), Part(C))),
        lambda: work_identity(
            "LIVE", REPO, CommitsUnit((A,)), (Part(A), Part(A, "a.py"))
        ),
        lambda: work_identity("LIVE", REPO, CommitsUnit((A, C)), (Part(D, "a.py"),)),
        lambda: work_identity(
            "LIVE", REPO, CommitsUnit((A, C)), (Part(D), Part(C, "a.py"))
        ),
    ],
    ids=[
        "issue-whole-part",
        "issue-path-part",
        "merge-commit-whole-part",
        "merge-commit-path-part-other-case",
        "bundle-split-at-commit-boundary",
        "bundle-every-commit-listed",
        "bundle-path-absorbed-into-whole",
        "bundle-path-of-foreign-commit",
        "bundle-whole-foreign-commit",
    ],
)
def test_parts_that_contradict_the_unit_raise(call: Callable[[], str]) -> None:
    with pytest.raises(ValueError):
        call()


def test_parts_accept_any_iterable() -> None:
    assert work_identity(
        "LIVE", REPO, PullRequestUnit(3), (part for part in [Part(C)])
    ) == _pr(3, (Part(C),))


@pytest.mark.parametrize(
    "call",
    [
        lambda: work_identity("LIVE", REPO, MergeUnit("abc1234")),
        lambda: work_identity("LIVE", REPO, CommitsUnit((A, "abc1234"))),
        lambda: _pr(3, (Part("abc1234"),)),
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
        lambda: _pr(3, (Part(C, ""),)),
        lambda: _pr(3, (Part(C, "\ud800.py"),)),
        lambda: work_identity(cast(SourceMode, "live"), REPO, PullRequestUnit(3)),
        lambda: work_identity(cast(SourceMode, ""), REPO, PullRequestUnit(3)),
    ],
    ids=[
        "short-merge-sha",
        "short-sha-in-bundle",
        "short-sha-in-part",
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
        "empty-path",
        "lone-surrogate-path",
        "lowercase-mode",
        "empty-mode",
    ],
)
def test_invalid_input_raises_value_error(call: Callable[[], str]) -> None:
    with pytest.raises(ValueError):
        call()
