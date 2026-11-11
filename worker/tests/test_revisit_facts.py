"""다시 볼 곳 사실(NC3 RevisitFacts) 시험.

합성 커밋 기록만 쓴다. TheMe 꼴 시험은 줄 글자 모양만 본뜬 합성 patch이고 실제 저장소 내용을 넣지 않는다.
시나리오 번호는 기능 명세 10절(S1~S20), 규칙 번호는 rules.md다. 시간은 단정하지 않는다(NFR 설계 Q1).
"""

from collections.abc import Iterable, Sequence
from dataclasses import fields
from datetime import UTC, datetime, timedelta

import pytest

from app.candidates import revisit
from app.candidates.revisit import (
    EMPTY_BLOB_SHA,
    Material,
    RevisitFact,
    RevisitFactsDefect,
    RevisitKind,
    revisit_facts,
)
from app.collection.identifiers import GitHubAccount
from app.collection.records import (
    ChangedFile,
    CommitChanges,
    CommitRecord,
    DetailStatus,
)

MEMBER = GitHubAccount("synthetic-member", 1)
_START = datetime(2025, 3, 1, tzinfo=UTC)


def sha(number: int) -> str:
    return f"{number:040x}"


def blob(number: int) -> str:
    return f"b{number:039x}"


def patch(*, added: Sequence[str] = (), removed: Sequence[str] = ()) -> str:
    lines = [f"@@ -1,{len(removed)} +1,{len(added)} @@"]
    lines += [f"-{text}" for text in removed]
    lines += [f"+{text}" for text in added]
    return "\n".join(lines)


def changed(
    path: str,
    status: str = "modified",
    *,
    added: Sequence[str] = (),
    removed: Sequence[str] = (),
    previous: str | None = None,
    blob_sha: str | None = None,
    with_patch: bool = True,
) -> ChangedFile:
    return ChangedFile(
        path=path,
        status=status,
        additions=len(added),
        deletions=len(removed),
        previous_path=previous,
        patch=patch(added=added, removed=removed) if with_patch else None,
        blob_sha=blob_sha,
    )


def commit(
    number: int,
    files: Sequence[ChangedFile] = (),
    *,
    day: int | None = None,
    message: str = "합성 커밋",
    parents: int = 1,
    truncated: bool = False,
    fetched: bool = True,
    committed_day: int | None = None,
) -> CommitRecord:
    authored = _START + timedelta(days=number if day is None else day)
    committed = (
        authored if committed_day is None else _START + timedelta(days=committed_day)
    )
    return CommitRecord(
        sha=sha(number),
        parents=tuple(sha(900 + number + index) for index in range(parents)),
        message=message,
        authored_at=authored,
        committed_at=committed,
        author=MEMBER,
        committer=MEMBER,
        changes=CommitChanges(tuple(files), 0, 0, truncated) if fetched else None,
        changes_status=DetailStatus.FETCHED if fetched else DetailStatus.BEYOND_RANGE,
    )


def facts_of(
    commits: Iterable[CommitRecord],
    *,
    own: Sequence[str] | None = None,
    enabled: Iterable[RevisitKind] | None = None,
) -> tuple[RevisitFact, ...]:
    records = {record.sha: record for record in commits}
    shas = list(records) if own is None else list(own)
    if enabled is None:
        return revisit_facts(shas, records)
    return revisit_facts(shas, records, enabled=frozenset(enabled))


def kinds(facts: Iterable[RevisitFact]) -> list[str]:
    return [fact.kind for fact in facts]


_FIREBASE = "Front/theme/src/store/firebase/firebase.ts"


# 다시 고친 곳 (BR3.1)


def test_s1_ac9_1_1_later_own_commit_removing_earlier_added_line_is_reworked() -> None:
    first = commit(
        1, [changed(_FIREBASE, "added", added=["const app = initializeApp(config);"])]
    )
    second = commit(
        2,
        [
            changed(
                _FIREBASE,
                removed=["const app = initializeApp(config);"],
                added=["export const app = initializeApp(config);"],
            )
        ],
    )

    facts = facts_of([second, first])

    assert facts == (RevisitFact("REWORKED_LINES", (_FIREBASE,), (sha(1), sha(2))),)


def test_s1_commit_order_is_authored_time_then_sha_not_input_order() -> None:
    # 식별값은 거꾸로지만 작성 시각은 3 → 2 순서다. 앞 커밋은 작성 시각이 이른 쪽이다.
    early = commit(3, [changed("a.py", "added", added=["value = 1"])], day=1)
    late = commit(
        2, [changed("a.py", removed=["value = 1"], added=["value = 2"])], day=5
    )

    facts = facts_of([late, early], own=[sha(2), sha(3)])

    assert facts[0].commits == (sha(3), sha(2))


def test_s2_ac9_1_2_other_candidate_commit_never_makes_a_fact() -> None:
    mine = commit(1, [changed("a.py", "added", added=["value = 1"])])
    other = commit(2, [changed("a.py", removed=["value = 1"], added=["value = 2"])])
    records = {record.sha: record for record in (mine, other)}

    # 후보마다 자기 본인 커밋만 넘긴다. 기록 사전에 다른 후보 커밋이 있어도 보지 않는다.
    assert revisit_facts([sha(1)], records) == ()
    assert revisit_facts([sha(2)], records) == ()


def test_br3_1_symbol_only_and_blank_lines_are_ignored() -> None:
    first = commit(1, [changed("a.ts", "added", added=["}", "", "),", "  "])])
    second = commit(2, [changed("a.ts", removed=["}", "),"], added=["};"])])

    assert facts_of([first, second]) == ()


def test_br3_1_same_commit_lines_and_removed_files_are_not_reworked() -> None:
    moved_line = commit(
        1, [changed("a.py", added=["value = 1"], removed=["value = 1"])]
    )
    deleted = commit(
        2, [changed("a.py", "removed", removed=["value = 1"], blob_sha=blob(1))]
    )

    assert kinds(facts_of([moved_line, deleted])) == []


def test_br3_1_rename_carries_remembered_lines_to_the_new_path() -> None:
    first = commit(1, [changed("src/old.py", "added", added=["value = 1"])])
    renamed = commit(2, [changed("src/new.py", "renamed", previous="src/old.py")])
    third = commit(3, [changed("src/new.py", removed=["value = 1"], added=["v = 1"])])

    facts = facts_of([first, renamed, third])

    assert RevisitFact("REWORKED_LINES", ("src/new.py",), (sha(1), sha(3))) in facts


def test_br2_2_patchless_file_is_skipped_only_by_the_line_rule() -> None:
    first = commit(1, [changed("tests/a.test.ts", "added", added=["it()"])])
    second = commit(2, [changed("tests/a.test.ts", removed=["it()"], with_patch=False)])

    facts = facts_of([first, second])

    assert kinds(facts) == ["TEST_FILES_PRESENT"]
    assert facts[0].commits == (sha(1), sha(2))


def test_br2_1_merge_commit_is_left_out() -> None:
    first = commit(1, [changed("a.py", "added", added=["value = 1"])])
    merge = commit(2, [changed("a.py", removed=["value = 1"])], parents=2)

    assert facts_of([first, merge]) == ()


def test_br2_2_truncated_or_unfetched_commit_is_left_out_of_path_rules() -> None:
    first = commit(1, [changed("a.py", "added", added=["value = 1"])])
    truncated = commit(2, [changed("a.py", removed=["value = 1"])], truncated=True)
    unfetched = commit(
        3,
        fetched=False,
        message=f"되돌림\n\nThis reverts commit {sha(1)}.",
    )

    facts = facts_of([first, truncated, unfetched])

    # 되돌림은 메시지만 보므로 변경 내용을 받지 못한 커밋도 쓴다.
    assert facts == (RevisitFact("REVERTED", (), (sha(3), sha(1))),)


# 좁은 산출물 목록 (BR2.3)


@pytest.mark.parametrize(
    "path",
    [
        "package-lock.json",
        "web/dist/app.js",
        "static/vendor.min.js",
        ".claude/settings.json",
        "aidlc/spaces/default/memory/team.md",
        "AGENTS.md",
        ".github/copilot-instructions.md",
        "config/.env.production",
    ],
)
def test_s11_ac10_2_1_narrow_artifact_paths_make_no_rework(path: str) -> None:
    first = commit(1, [changed(path, "added", added=["value: 1"])])
    second = commit(2, [changed(path, removed=["value: 1"], added=["value: 2"])])

    assert facts_of([first, second]) == ()


# 옮긴 곳·확장자 바꿈 (BR3.2, BR3.3)


def test_s5_ac9_2_1_move_across_commits_matches_blob_sha() -> None:
    removed = commit(1, [changed("src/a.js", "removed", blob_sha=blob(1))])
    added = commit(2, [changed("lib/a.js", "added", blob_sha=blob(1))])

    facts = facts_of([added, removed])

    assert facts == (
        RevisitFact("MOVED_FILE", ("src/a.js", "lib/a.js"), (sha(1), sha(2))),
    )


def test_s5_rename_inside_one_commit_is_a_move() -> None:
    renamed = commit(1, [changed("lib/a.js", "renamed", previous="src/a.js")])

    assert facts_of([renamed]) == (
        RevisitFact("MOVED_FILE", ("src/a.js", "lib/a.js"), (sha(1),)),
    )


def test_s5_ambiguous_or_empty_blob_is_not_matched() -> None:
    twice_added = [
        commit(1, [changed("src/a.js", "removed", blob_sha=blob(1))]),
        commit(2, [changed("lib/a.js", "added", blob_sha=blob(1))]),
        commit(3, [changed("app/a.js", "added", blob_sha=blob(1))]),
    ]
    empty = [
        commit(4, [changed("src/empty.txt", "removed", blob_sha=EMPTY_BLOB_SHA)]),
        commit(5, [changed("lib/empty.txt", "added", blob_sha=EMPTY_BLOB_SHA)]),
    ]
    unknown = [
        commit(6, [changed("src/b.js", "removed")]),
        commit(7, [changed("lib/b.js", "added")]),
    ]

    for commits in (twice_added, empty, unknown):
        assert kinds(facts_of(commits)) == []


def test_s6_ac9_2_2_extension_only_and_folder_with_extension() -> None:
    extension = commit(1, [changed("src/util.ts", "renamed", previous="src/util.js")])
    both = commit(2, [changed("lib/util.ts", "renamed", previous="src/util.js")])
    case_only = commit(3, [changed("img/logo.jpg", "renamed", previous="img/logo.JPG")])

    assert facts_of([extension]) == (
        RevisitFact("EXTENSION_CHANGED", ("src/util.js", "src/util.ts"), (sha(1),)),
    )
    # 폴더와 확장자가 함께 바뀌면 옮긴 곳 사실 하나뿐이다.
    assert facts_of([both]) == (
        RevisitFact("MOVED_FILE", ("src/util.js", "lib/util.ts"), (sha(2),)),
    )
    assert kinds(facts_of([case_only])) == ["MOVED_FILE"]


def test_br2_3_move_touching_an_artifact_path_makes_no_fact() -> None:
    renamed = commit(1, [changed("dist/a.js", "renamed", previous="src/a.js")])

    assert facts_of([renamed]) == ()


# 되돌림 (BR3.4)


def test_s7_ac9_3_1_revert_of_same_candidate_commit_without_rework_pair() -> None:
    target = commit(1, [changed("a.py", "added", added=["value = 1"])])
    reverting = commit(
        2,
        [changed("a.py", removed=["value = 1"])],
        message=f'Revert "합성"\n\nThis reverts commit {sha(1)}.',
    )

    facts = facts_of([target, reverting])

    assert facts == (RevisitFact("REVERTED", (), (sha(2), sha(1))),)


def test_s7_revert_of_other_candidate_or_short_or_issue_reference_is_ignored() -> None:
    other_target = sha(77)
    messages = [
        f"This reverts commit {other_target}.",
        f"This reverts commit {sha(1)[:7]}.",
        "Reverts catchu-synthetic-owner/catchu-synthetic-repo#12",
    ]
    for number, message in enumerate(messages, start=2):
        target = commit(1, [changed("b.py", "added", added=["value = 1"])])
        reverting = commit(number, message=message)

        assert kinds(facts_of([target, reverting])) == []


# 시험 파일 있음 (BR3.5, NFR8.4)


def test_s9_ac10_1_1_build_folder_test_and_class_like_names_are_not_tests() -> None:
    work = commit(
        1,
        [
            changed("out/test/a.js", added=["value = 1"]),
            changed("src/components/ButtonTest.tsx", added=["value = 1"]),
        ],
    )

    assert facts_of([work]) == ()


def test_s10_ac10_1_2_test_folder_file_is_present() -> None:
    work = commit(1, [changed("src/__tests__/a.test.ts", added=["it('a')"])])

    assert facts_of([work]) == (
        RevisitFact("TEST_FILES_PRESENT", ("src/__tests__/a.test.ts",), (sha(1),)),
    )


def test_s10_nfr8_4_removed_test_files_do_not_count() -> None:
    only_removed = commit(1, [changed("src/__tests__/a.test.ts", "removed")])
    mixed = commit(
        2,
        [
            changed("src/__tests__/old.test.ts", "removed"),
            changed("tests/test_new.py", added=["def test_a(): ..."]),
        ],
    )

    assert facts_of([only_removed]) == ()
    assert facts_of([mixed]) == (
        RevisitFact("TEST_FILES_PRESENT", ("tests/test_new.py",), (sha(2),)),
    )


def test_br3_5_test_paths_and_commits_keep_the_first_twenty() -> None:
    commits = [
        commit(number, [changed(f"pkg/m{number}_test.go", added=["func"])])
        for number in range(1, 26)
    ]

    (fact,) = facts_of(commits)

    assert fact.paths == tuple(f"pkg/m{number}_test.go" for number in range(1, 21))
    assert fact.commits == tuple(sha(number) for number in range(1, 21))


# 상한·순서·끄기 (BR2.4, BR2.5)


def test_br2_5_facts_are_sorted_and_capped_at_thirty() -> None:
    commits = [
        commit(
            1,
            [
                changed(f"f{index:02d}.py", "added", added=["value = 1"])
                for index in range(35)
            ],
        ),
        commit(2, [changed("tests/a.test.ts", added=["it()"])]),
        commit(
            3,
            [changed(f"f{index:02d}.py", removed=["value = 1"]) for index in range(35)],
        ),
        commit(4, [changed("lib/a.js", "renamed", previous="src/a.js")]),
    ]

    facts = facts_of(commits)

    assert len(facts) == 30
    # 다시 고친 곳(커밋 3)이 먼저 30개를 채워 뒤 종류는 안내 없이 빠진다.
    assert kinds(facts) == ["REWORKED_LINES"] * 30
    assert [fact.paths[0] for fact in facts] == [
        f"f{index:02d}.py" for index in range(30)
    ]


def test_br2_5_kinds_follow_the_fixed_order() -> None:
    commits = [
        commit(
            1,
            [
                changed("tests/a.test.ts", added=["it()"]),
                changed("a.py", "added", added=["value = 1"]),
            ],
        ),
        commit(2, [changed("lib/a.js", "renamed", previous="src/a.js")]),
        commit(
            3,
            [changed("a.py", removed=["value = 1"])],
            message=f"This reverts commit {sha(2)}",
        ),
        commit(4, [changed("src/u.ts", "renamed", previous="src/u.js")]),
    ]

    assert kinds(facts_of(commits)) == [
        "REWORKED_LINES",
        "MOVED_FILE",
        "EXTENSION_CHANGED",
        "REVERTED",
        "TEST_FILES_PRESENT",
    ]


def test_br2_5_path_longer_than_1024_makes_no_fact() -> None:
    long_path = "a/" + "x" * 1023 + ".py"
    first = commit(1, [changed(long_path, "added", added=["value = 1"])])
    second = commit(2, [changed(long_path, removed=["value = 1"])])

    assert facts_of([first, second]) == ()


def test_br2_4_disabled_rules_make_no_facts() -> None:
    commits = [
        commit(1, [changed("a.py", "added", added=["value = 1"])]),
        commit(2, [changed("a.py", removed=["value = 1"])]),
        commit(3, [changed("src/u.ts", "renamed", previous="src/u.js")]),
    ]
    without_rework = [kind for kind in revisit.KIND_ORDER if kind != "REWORKED_LINES"]
    without_extension = [
        kind for kind in revisit.KIND_ORDER if kind != "EXTENSION_CHANGED"
    ]

    assert kinds(facts_of(commits)) == ["REWORKED_LINES", "EXTENSION_CHANGED"]
    assert kinds(facts_of(commits, enabled=without_rework)) == ["EXTENSION_CHANGED"]
    # 확장자 바꿈이 꺼져도 그 쌍이 옮긴 곳으로 바뀌지 않는다.
    assert kinds(facts_of(commits, enabled=without_extension)) == ["REWORKED_LINES"]
    assert revisit.ENABLED_KINDS == frozenset(revisit.KIND_ORDER)


def test_result_holds_only_kind_paths_and_commits() -> None:
    assert [field.name for field in fields(RevisitFact)] == ["kind", "paths", "commits"]


# 정해진 예외 (신뢰성 설계 1절, 자기 결과 확인)


def test_missing_record_raises_the_defined_defect_without_values() -> None:
    first = commit(1, [changed("a.py", "added", added=["value = 1"])])

    with pytest.raises(RevisitFactsDefect) as raised:
        revisit_facts([sha(1), sha(2)], {sha(1): first})

    assert sha(2) not in str(raised.value)


@pytest.mark.parametrize(
    "bad",
    [
        RevisitFact("REWORKED_LINES", ("a.py", "b.py"), (sha(1), sha(2))),
        RevisitFact("REVERTED", (), (sha(1), sha(99))),
        RevisitFact("MOVED_FILE", ("a.py", "a.py"), (sha(1),)),
        RevisitFact(
            "TEST_FILES_PRESENT",
            tuple(f"t/{index}.test.ts" for index in range(21)),
            (sha(1),),
        ),
        RevisitFact("TEST_FILES_PRESENT", ("t/" + "x" * 1030,), (sha(1),)),
        RevisitFact("REWORKED_LINES", ("a.py",), (sha(1), sha(1))),
    ],
    ids=[
        "count",
        "outside",
        "overlap-paths",
        "over-20",
        "long-path",
        "overlap-commits",
    ],
)
def test_self_check_rejects_results_breaking_the_api_rules(
    monkeypatch: pytest.MonkeyPatch, bad: RevisitFact
) -> None:
    def broken(
        material: Material, enabled: frozenset[RevisitKind]
    ) -> list[RevisitFact]:
        return [bad]

    monkeypatch.setattr(revisit, "RULES", (broken,))
    commits = [commit(1), commit(2)]

    with pytest.raises(RevisitFactsDefect):
        facts_of(commits)
