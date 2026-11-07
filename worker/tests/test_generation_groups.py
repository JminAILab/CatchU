"""재료 순서·변경 묶음·한 파일 상한(CR1 기능 설계 BR5.2~BR5.7, 시나리오 S24~S27, 커밋 3,000 합성 후보).

기대값은 기능 설계 3절의 시나리오 표와 rules.md에서 정했다. 실패 조건: 큰 후보에서 한 파일이 6,000 B(머리글
포함)를 넘거나, 전체가 자료 상한을 넘거나, 같은 입력에서 재료 순서가 달라지면 실패다.

재료 커밋은 수집을 거치지 않고 `CommitRecord`로 바로 만들어 `prepare` → `select`(또는 `change_groups`)에
넣는다. 생성 제공자는 부르지 않는다. 처리 시간은 단언하지 않는다(비기능 설계 Q1 A). 시간은 코드 생성 때
한 번 재서 요약에 적는다.
"""

import json
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from github_synthetic import MEMBER, sha

from app.collection import ChangedFile, CommitChanges, CommitRecord, DetailStatus
from app.generation import PROPOSED_GENERATION_LIMITS
from app.generation.groups import (
    LAYER_NAMES,
    change_groups,
    file_kinds,
    kind_order,
    strip_test_marker,
)
from app.generation.judged import material_ask
from app.generation.material import CandidateMaterial
from app.generation.request import (
    LARGE_CANDIDATE_FILE_BYTES,
    PreparedCandidate,
    Selection,
    is_large,
    judged_groups,
    prepare,
    select,
)
from app.judgement.questions import COMMON_GROUP, MaterialVerdict
from app.processing.generation import (
    DraftOutcome,
    EligibleCandidate,
    EvidenceItem,
    ReflectionOutcome,
)

LIMITS = PROPOSED_GENERATION_LIMITS
BUDGET = LIMITS.max_data_bytes
T0 = datetime(2026, 9, 1, tzinfo=UTC)

# 파일 하나: (경로, 바뀐 줄 수, 줄 하나의 글자 수).
FileSpec = tuple[str, int, int]


def patch_of(lines: int, width: int, stem: str = "value") -> str:
    """새 줄만 있는 patch. 줄마다 다른 글이라 같은 값 가리기에 걸리지 않는다."""
    body = [f"+{stem}_{index} = {'x' * width}" for index in range(lines)]
    return f"@@ -0,0 +1,{lines} @@\n" + "\n".join(body)


def record(number: int, files: Sequence[FileSpec]) -> CommitRecord:
    changed = tuple(
        ChangedFile(path, "added", lines, 0, None, patch_of(lines, width), ())
        for path, lines, width in files
    )
    return CommitRecord(
        sha=sha(number),
        parents=(sha(number - 1),),
        message="wip",
        authored_at=T0 + timedelta(minutes=number),
        committed_at=T0 + timedelta(minutes=number),
        author=MEMBER,
        committer=MEMBER,
        changes=CommitChanges(changed, sum(spec[1] for spec in files), 0, False),
        changes_status=DetailStatus.FETCHED,
    )


def prepared(*records: CommitRecord) -> PreparedCandidate:
    """재료 커밋(근거 순서)만 채운 후보 하나의 생성 입력."""
    evidence = EvidenceItem("https://github.com/o/r/pull/1", sha(1), (), "범위", ())
    candidate = EligibleCandidate(
        work_identity="wi1:" + "0" * 64,
        title=None,
        work_facts=("PR #1, 상태 열림",),
        subject_contribution="연동 GitHub 계정이 작성자로 기록된 커밋",
        grouping_basis="PR #1 전체를 한 작업으로 묶었다.",
        grouping_limitations=(),
        evidence=(evidence,),
        draft=DraftOutcome.not_generated(),
        reflection=ReflectionOutcome.not_generated(),
    )
    material = CandidateMaterial(
        position=0,
        candidate=candidate,
        evidence_own=records,
        commits=records,
        evidence_index={},
        own_commits=frozenset(each.sha for each in records),
        other_authors="ABSENT",
        records={each.sha: each for each in records},
    )
    return prepare(material)


def sent_files(selection: Selection) -> list[dict[str, Any]]:
    data = json.loads(selection.data)
    return [file for commit in data["commits"] for file in commit["files"]]


def file_bytes(file: dict[str, Any]) -> int:
    """보낸 파일 하나의 양: 머리글·꼬리와 줄 조각을 전체 자료와 같게 직렬화한 UTF-8 바이트."""
    text = json.dumps(file, ensure_ascii=False, separators=(",", ":"))
    return len(text.encode("utf-8"))


def group_names(candidate: PreparedCandidate) -> dict[str, list[str]]:
    groups = change_groups(candidate.files, file_kinds(candidate.files))
    return {group.name: [file.path for file in group.files] for group in groups}


# 1. 종류 순서(BR5.2)


def test_kind_order_is_code_test_config_doc_other_and_stable_inside_a_kind() -> None:
    candidate = prepared(
        record(
            10,
            [
                ("docs/guide.md", 2, 10),
                ("assets/data.bin.txt", 2, 10),
                ("pyproject.toml", 2, 10),
                ("tests/test_login.py", 2, 10),
                ("app/b.py", 2, 10),
                ("app/a.py", 2, 10),
            ],
        )
    )

    ordered = kind_order(candidate.files, file_kinds(candidate.files))

    assert [file.path for file in ordered] == [
        "app/b.py",
        "app/a.py",
        "tests/test_login.py",
        "pyproject.toml",
        "docs/guide.md",
        "assets/data.bin.txt",
    ]


# 2. 변경 묶음(BR5.3~BR5.5)


def test_groups_split_at_the_first_depth_with_two_folders() -> None:
    candidate = prepared(
        record(
            10,
            [
                ("README.md", 1, 10),
                ("src/api/a.py", 3, 10),
                ("src/api/b.py", 1, 10),
                ("src/web/c.ts", 2, 10),
                ("src/app.py", 1, 10),
            ],
        )
    )

    groups = change_groups(candidate.files, file_kinds(candidate.files))

    # 깊이 1은 src 하나뿐이라 갈라지지 않고 깊이 2에서 api·web으로 갈라진다. 그보다 얕은 README.md와
    # src/app.py는 함께 한 묶음(공통 폴더 src)이다. 순서는 바뀐 줄이 많은 묶음부터다.
    assert [(group.name, group.changed_lines) for group in groups] == [
        ("src/api", 4),
        ("src", 2),
        ("src/web", 2),
    ]
    assert [file.path for file in groups[1].files] == ["src/app.py", "README.md"]


def test_single_folder_without_a_split_is_one_group() -> None:
    candidate = prepared(record(10, [("a.py", 1, 10), ("b.py", 1, 10)]))

    assert group_names(candidate) == {"": ["a.py", "b.py"]}


def test_s24_layer_folders_regroup_by_file_name_prefix() -> None:
    """S24: 갈라진 폴더가 controller·service뿐이면 파일 이름 앞부분(User·Order)으로 묶는다."""
    candidate = prepared(
        record(
            10,
            [
                ("src/controller/UserController.java", 4, 10),
                ("src/controller/OrderController.java", 2, 10),
                ("src/service/UserService.java", 4, 10),
                ("src/service/OrderServiceImpl.java", 2, 10),
            ],
        )
    )

    assert group_names(candidate) == {
        "user": [
            "src/controller/UserController.java",
            "src/service/UserService.java",
        ],
        "order": [
            "src/controller/OrderController.java",
            "src/service/OrderServiceImpl.java",
        ],
    }


def test_layer_names_are_singular_and_plural_case_insensitive() -> None:
    assert {"controller", "controllers", "repositories", "dto", "views"} <= LAYER_NAMES
    candidate = prepared(
        record(
            10,
            [
                ("app/Controllers/user_controller.rb", 1, 10),
                ("app/Models/user.rb", 1, 10),
            ],
        )
    )

    assert group_names(candidate) == {
        "user": ["app/Controllers/user_controller.rb", "app/Models/user.rb"]
    }


def test_layer_word_first_or_missing_uses_the_rest_of_the_name() -> None:
    """계층 낱말이 이름 맨 앞이면 그 뒤 낱말로, 계층 낱말이 없으면 이름 전체로 묶는다."""
    candidate = prepared(
        record(
            10,
            [
                ("src/service/ServiceUser.java", 1, 10),
                ("src/model/user.java", 1, 10),
                ("src/model/Order.java", 1, 10),
            ],
        )
    )

    assert group_names(candidate) == {
        "user": ["src/service/ServiceUser.java", "src/model/user.java"],
        "order": ["src/model/Order.java"],
    }


def test_no_files_make_no_groups() -> None:
    assert change_groups((), {}) == ()


def test_folders_that_are_not_all_layers_keep_folder_groups() -> None:
    candidate = prepared(
        record(
            10,
            [
                ("src/controller/UserController.java", 1, 10),
                ("src/billing/UserInvoice.java", 1, 10),
            ],
        )
    )

    assert set(group_names(candidate)) == {"src/controller", "src/billing"}


def test_s25_test_file_moves_to_its_target_group() -> None:
    """S25: `test/FooTest.java`는 `src/a/Foo.java`의 묶음으로 옮겨진다."""
    candidate = prepared(
        record(
            10,
            [
                ("src/a/Foo.java", 3, 10),
                ("src/b/Bar.java", 1, 10),
                ("test/FooTest.java", 2, 10),
            ],
        )
    )

    groups = group_names(candidate)

    assert "test" not in groups
    assert groups["src"] == ["src/a/Foo.java", "src/b/Bar.java", "test/FooTest.java"]


def test_test_file_with_targets_in_two_groups_stays_put() -> None:
    candidate = prepared(
        record(
            10,
            [
                ("api/Foo.java", 1, 10),
                ("web/Foo.java", 1, 10),
                ("tests/FooTest.java", 1, 10),
            ],
        )
    )

    assert group_names(candidate)["tests"] == ["tests/FooTest.java"]


def test_test_markers_are_stripped_once() -> None:
    assert strip_test_marker("tests/test_login.py") == "login"
    assert strip_test_marker("pkg/login_test.go") == "login"
    assert strip_test_marker("web/login.test.ts") == "login"
    assert strip_test_marker("web/login.spec.ts") == "login"
    assert strip_test_marker("src/LoginTests.swift") == "Login"
    assert strip_test_marker("src/LoginTest.java") == "Login"
    assert strip_test_marker("tests/helpers.py") == "helpers"


# 3. 담기(BR5.6)


def test_s27_small_candidate_keeps_a_whole_12_kb_file() -> None:
    """S27: 모든 줄이 상한 안이면 작은 후보다. 한 파일 상한이 없어 12 KB 파일이 통째로 담긴다."""
    candidate = prepared(record(10, [("app/big.py", 120, 90)]))

    selection = select(candidate, LIMITS, BUDGET)

    (file,) = sent_files(selection)
    assert file_bytes(file) > 12_000
    assert len(selection.lines) == 120
    assert selection.size_excluded == {}


def test_large_candidate_caps_each_file_at_6000_bytes_including_its_head() -> None:
    candidate = prepared(
        record(10, [("api/huge.py", 300, 90), ("web/page.ts", 300, 90)])
    )

    selection = select(candidate, LIMITS, BUDGET)

    files = sent_files(selection)
    assert {file["path"] for file in files} == {"api/huge.py", "web/page.ts"}
    assert all(file_bytes(file) <= LARGE_CANDIDATE_FILE_BYTES for file in files)
    assert len(selection.data.encode("utf-8")) <= BUDGET
    assert selection.size_excluded == {sha(10): True}


def test_s26_share_below_one_head_is_filled_on_the_second_pass() -> None:
    """S26: 묶음이 많아 몫이 머리글 한 벌보다 작으면 첫 채우기는 비고, 두 번째 채우기가 묶음 순서대로
    담는다. 전체는 상한 안이다."""
    files = [(f"d{index:02d}/x.py", 3, 40) for index in range(40)]
    candidate = prepared(record(10, files))
    budget = 2_000
    groups = change_groups(candidate.files, file_kinds(candidate.files))
    assert budget // len(groups) < 60

    selection = select(candidate, LIMITS, budget)

    sent = [file["path"] for file in sent_files(selection)]
    assert sent
    assert len(selection.data.encode("utf-8")) <= budget
    # 바뀐 줄 수가 같아 묶음 이름순이고, 두 번째 채우기는 그 순서의 앞에서부터 채운다.
    assert sent == [f"d{index:02d}/x.py" for index in range(len(sent))]


def test_first_pass_shares_the_budget_across_groups() -> None:
    """첫 채우기는 묶음마다 몫까지라, 앞 묶음이 아무리 커도 뒤 묶음 줄이 담긴다(S12의 바탕)."""
    candidate = prepared(
        record(
            10,
            [
                ("api/a.py", 60, 90),
                ("api/b.py", 60, 90),
                ("api/c.py", 60, 90),
                ("web/small.ts", 4, 10),
            ],
        )
    )

    selection = select(candidate, LIMITS, BUDGET)

    paths = {file["path"] for file in sent_files(selection)}
    assert "web/small.ts" in paths
    assert len(selection.data.encode("utf-8")) <= BUDGET


def test_second_pass_keeps_line_order_inside_a_file() -> None:
    candidate = prepared(record(10, [("api/a.py", 200, 90), ("web/b.py", 200, 90)]))

    selection = select(candidate, LIMITS, BUDGET)

    for file in sent_files(selection):
        ids = [line["id"] for line in file["lines"]]
        numbers = [int(each.split(":L")[1]) for each in ids]
        assert numbers == sorted(numbers)


# 4. 결정성과 큰 입력(BR5.7, NFR4.1, 성능 확인 사항)


def three_thousand_commits() -> PreparedCandidate:
    """커밋 3,000(수집 상한 크기)의 합성 후보. 폴더 10곳에 코드·시험 파일을 나눠 고친다."""
    records = [
        record(
            100 + number,
            [
                (f"mod{number % 10}/src/Feature{number}.java", 3, 30),
                (f"mod{number % 10}/test/Feature{number}Test.java", 2, 30),
            ],
        )
        for number in range(3_000)
    ]
    return prepared(*records)


def test_three_thousand_commit_candidate_is_bounded_and_deterministic() -> None:
    """결과만 단언한다(비기능 설계 Q1 A). 시간은 단언하지 않는다."""
    first = select(three_thousand_commits(), LIMITS, BUDGET)
    second = select(three_thousand_commits(), LIMITS, BUDGET)

    assert first.data == second.data
    assert list(first.lines) == list(second.lines)
    assert len(first.data.encode("utf-8")) <= BUDGET
    files = sent_files(first)
    assert files
    assert all(file_bytes(file) <= LARGE_CANDIDATE_FILE_BYTES for file in files)
    # 폴더 10곳이 모두 재료에 든다(묶음마다 몫).
    assert {str(file["path"]).split("/")[0] for file in files} == {
        f"mod{index}" for index in range(10)
    }


def test_same_input_gives_the_same_groups_every_time() -> None:
    candidate = prepared(
        record(
            10,
            [
                ("b/x.py", 2, 10),
                ("a/y.py", 2, 10),
                ("c/z.py", 3, 10),
            ],
        )
    )

    runs = {
        tuple(
            (group.name, tuple(file.id for file in group.files))
            for group in change_groups(candidate.files, file_kinds(candidate.files))
        )
        for _ in range(5)
    }

    assert runs == {
        (("c", ("c1f3",)), ("a", ("c1f2",)), ("b", ("c1f1",))),
    }


# CR3 재료 판정 답 적용(BR6.2·BR6.3, 시나리오 S13~S17)

# 큰 후보가 되는 작은 상한. 파일 하나는 줄 4개(약 70 B씩)라 묶음 몫 안에 일부만 든다.
SMALL = 900


def verdict(
    path: str,
    *,
    branch: str | None = None,
    group: str | None = None,
    score: int | None = None,
) -> MaterialVerdict:
    return MaterialVerdict(path, branch, group, score, judged=True)  # type: ignore[arg-type]


def sent_paths(selection: Selection) -> list[str]:
    return [file["path"] for file in sent_files(selection)]


def test_s13_generated_answer_keeps_the_file_out_of_the_material() -> None:
    """S13: 재료 판정이 X를 GENERATED로 답하면 X의 줄은 재료에 없다."""
    # x.lock은 따로 묶음(api)이라 규칙 순서로는 그 묶음 몫으로 담긴다.
    candidate = prepared(record(10, [("web/a.py", 10, 60), ("api/x.lock", 1, 20)]))
    assert is_large(candidate, LIMITS, SMALL)
    without = select(candidate, LIMITS, SMALL)
    assert "api/x.lock" in sent_paths(without)

    judged = select(
        candidate,
        LIMITS,
        SMALL,
        {"api/x.lock": verdict("api/x.lock", branch="GENERATED")},
    )

    assert "api/x.lock" not in sent_paths(judged)
    assert "x.lock" not in judged.data
    assert "web/a.py" in sent_paths(judged)


def test_s14_higher_score_goes_first_inside_a_group() -> None:
    """S14: 같은 묶음의 A(점수 5)·B(점수 2)면 A가 B보다 먼저 담긴다(규칙 순서는 B가 먼저다)."""
    candidate = prepared(record(10, [("app/b.py", 6, 60), ("app/a.py", 6, 60)]))
    assert sent_paths(select(candidate, LIMITS, SMALL))[0] == "app/b.py"

    judged = select(
        candidate,
        LIMITS,
        SMALL,
        {
            "app/a.py": verdict("app/a.py", score=5),
            "app/b.py": verdict("app/b.py", score=2),
        },
    )

    assert sent_paths(judged)[0] == "app/a.py"


def test_work_branch_goes_before_record_branch() -> None:
    """묶음 안에서 WORK 갈래(규칙이 코드로 본 파일 포함)를 먼저, RECORD 갈래를 그다음에 담는다."""
    candidate = prepared(record(10, [("app/notes.txt", 6, 60), ("app/main.py", 6, 60)]))
    kinds = file_kinds(candidate.files)
    groups = change_groups(candidate.files, kinds)
    (group,) = judged_groups(
        groups,
        kinds,
        {
            "app/notes.txt": verdict("app/notes.txt", branch="RECORD", score=5),
            "app/main.py": verdict("app/main.py", score=1),
        },
    )
    assert [file.path for file in group.files] == ["app/main.py", "app/notes.txt"]


def test_s16_common_answers_make_their_own_evenly_shared_group() -> None:
    """S16: COMMON으로 답한 파일 2개와 씨앗 묶음 2개면 묶음 3개로 고르게 담긴다."""
    candidate = prepared(
        record(
            10,
            [
                ("web/page.ts", 8, 60),
                ("api/route.ts", 8, 60),
                ("shared.ts", 2, 60),
                ("types.ts", 2, 60),
            ],
        )
    )
    kinds = file_kinds(candidate.files)
    groups = change_groups(candidate.files, kinds)
    verdicts = {
        "shared.ts": verdict("shared.ts", group=COMMON_GROUP),
        "types.ts": verdict("types.ts", group=COMMON_GROUP),
    }

    regrouped = judged_groups(groups, kinds, verdicts)

    assert len(regrouped) == 3
    members = {tuple(file.path for file in group.files) for group in regrouped}
    assert ("shared.ts", "types.ts") in members
    selection = select(candidate, LIMITS, 1_500, verdicts)
    # 몫(상한 ÷ 3)으로 세 묶음 모두에서 줄을 담는다.
    assert {"web/page.ts", "api/route.ts", "shared.ts"} <= set(sent_paths(selection))


def test_seed_group_answer_moves_an_ambiguous_file() -> None:
    """MATERIAL_GROUP이 씨앗 묶음 이름이면 그 묶음으로 옮긴다."""
    candidate = prepared(
        record(
            10, [("web/page.ts", 4, 40), ("api/route.ts", 4, 40), ("page.css", 4, 40)]
        )
    )
    kinds = file_kinds(candidate.files)
    regrouped = judged_groups(
        change_groups(candidate.files, kinds),
        kinds,
        {"page.css": verdict("page.css", group="web")},
    )
    by_name = {group.name: [file.path for file in group.files] for group in regrouped}
    # 옮긴 파일은 판정 받은 파일이라 묶음 안에서 판정 없는 파일보다 앞이다(BR6.3).
    assert by_name["web"] == ["page.css", "web/page.ts"]
    assert by_name["api"] == ["api/route.ts"]


def test_s17_unjudged_files_follow_judged_files_in_rule_order() -> None:
    """S17: 질문 400개에 들지 않아 묻지 못한 파일(판정 없음)은 판정 받은 파일 뒤에 CR1 규칙 순서로 담는다."""
    # 그 밖(OTHER) 파일은 종류·점수 두 질문이라 250개면 200개만 묻는다.
    specs = [(f"app/file_{index:03}.txt", 1, 20) for index in range(250)]
    candidate = prepared(record(10, specs))
    kinds = file_kinds(candidate.files)
    groups = change_groups(candidate.files, kinds)
    built = material_ask(candidate, 20.0)
    assert built is not None
    assert len(built.request.questions) <= 400
    asked = set(built.asked)
    assert len(asked) == 200
    verdicts = {path: verdict(path, score=3) for path in asked}

    (group,) = judged_groups(groups, kinds, verdicts)

    order = [file.path for file in group.files]
    judged_count = len(asked)
    assert set(order[:judged_count]) == asked
    rest = [file.path for file in groups[0].files if file.path not in asked]
    assert order[judged_count:] == rest


def test_material_ask_marks_other_and_ambiguous_files() -> None:
    """BR6.1: 규칙이 그 밖(OTHER)으로 본 파일에는 종류를, 저장소 맨 위·얕은 곳의 파일에는 묶음을 묻는다."""
    candidate = prepared(
        record(
            10,
            [("web/page.ts", 2, 20), ("api/route.ts", 2, 20), ("data.bin.txt", 2, 20)],
        )
    )
    built = material_ask(candidate, 20.0)
    assert built is not None
    kinds = {(q.target, q.kind) for q in built.request.questions}
    assert ("data.bin.txt", "MATERIAL_KIND") in kinds
    assert ("data.bin.txt", "MATERIAL_GROUP") in kinds
    assert ("web/page.ts", "MATERIAL_KIND") not in kinds
    assert ("web/page.ts", "MATERIAL_GROUP") not in kinds
    group_question = next(
        q for q in built.request.questions if q.kind == "MATERIAL_GROUP"
    )
    assert group_question.options == ("api", "web", COMMON_GROUP)


def test_budget_too_small_for_the_frame_is_not_a_large_candidate() -> None:
    """빈 자료 틀도 못 담는 상한이면 큰 후보가 아니다(재료 판정을 보내지 않는다)."""
    candidate = prepared(record(10, [("app/a.py", 4, 40)]))
    assert is_large(candidate, LIMITS, 5) is False


def test_no_verdicts_keep_the_rule_order() -> None:
    """BR6.4: 재료 판정이 없으면(빈 답 포함) CR1 규칙 순서 그대로다."""
    candidate = prepared(record(10, [("app/b.py", 6, 60), ("app/a.py", 6, 60)]))
    assert (
        select(candidate, LIMITS, SMALL, {}).data
        == select(candidate, LIMITS, SMALL).data
    )
