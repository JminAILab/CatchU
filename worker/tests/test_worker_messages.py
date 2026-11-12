import copy
import json
import re
from pathlib import Path
from typing import Any

import pytest

from app.contract import (
    FIXTURE_DIR,
    SchemaError,
    Verdict,
    check_message,
    fill_template,
    unidentified_fields,
)

# #103 본문 「범위」의 사례 9가지와 cases.json 사례 ID의 대응.
ISSUE_CASES = {
    "succeeded-one-candidate": "적합 후보 1건(SUCCEEDED)",
    "empty": "정상 0건(EMPTY)",
    "partial-failed": "부분 실패(PARTIAL_FAILED)",
    "failed": "실패(FAILED)",
    "unidentifiable": "식별 불가(세 ID 중 누락)",
    "redelivery": "같은 결과 재전달",
    "same-id-different-content": "같은 ID의 다른 내용",
    "two-candidates-same-work": "두 후보가 같은 작업",
    "progress-events": "진행 알림(RUNNING·UNCERTAIN)",
}
CONTEXT_FIELDS = (
    "requestId",
    "attemptId",
    "memberId",
    "repositoryId",
    "consentId",
    "scopeRevision",
)


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


CASES: dict[str, Any] = _read_json(FIXTURE_DIR / "cases.json")
CONTEXT: dict[str, str] = _read_json(FIXTURE_DIR / "context.sample.json")["values"]
CASE_BY_ID = {case["caseId"]: case for case in CASES["cases"]}


def _fill(file: str, case_id: str) -> Any:
    return fill_template(_read_json(FIXTURE_DIR / file), {**CONTEXT, "caseId": case_id})


def _filled_messages(case_id: str) -> list[Any]:
    return [
        _fill(message["file"], case_id) for message in CASE_BY_ID[case_id]["messages"]
    ]


def _outcome_for(candidates: int, failures: int) -> str:
    if candidates and failures:
        return "PARTIAL_FAILED"
    if candidates:
        return "SUCCEEDED"
    return "FAILED" if failures else "EMPTY"


def _apply_patch(document: Any, operations: list[dict[str, Any]]) -> Any:
    """cases.json 음성 대조에 쓰는 JSON Patch의 remove·replace만 적용한다."""
    patched = copy.deepcopy(document)
    for operation in operations:
        *parents, last = [
            part.replace("~1", "/").replace("~0", "~")
            for part in operation["path"].split("/")[1:]
        ]
        target = patched
        for part in parents:
            target = target[int(part)] if isinstance(target, list) else target[part]
        key: int | str = int(last) if isinstance(target, list) else last
        if operation["op"] == "remove":
            del target[key]
        elif operation["op"] == "replace":
            target[key] = operation["value"]
        else:
            raise ValueError(f"지원하지 않는 patch op: {operation['op']}")
    return patched


def test_cases_match_issue_scope() -> None:
    assert {case["caseId"]: case["issueName"] for case in CASES["cases"]} == ISSUE_CASES


def test_every_template_is_used() -> None:
    templates = {
        path.relative_to(FIXTURE_DIR).as_posix()
        for path in FIXTURE_DIR.glob("*/*.json")
    }
    used = {message["file"] for case in CASES["cases"] for message in case["messages"]}
    assert used == templates
    assert len(templates) == 9


@pytest.mark.parametrize(
    ("case_id", "index"),
    [
        (case["caseId"], index)
        for case in CASES["cases"]
        for index in range(len(case["messages"]))
    ],
)
def test_case_message_check(case_id: str, index: int) -> None:
    spec = CASE_BY_ID[case_id]["messages"][index]
    message = _fill(spec["file"], case_id)

    assert "{{" not in json.dumps(message, ensure_ascii=False)
    result = check_message(spec["schema"], message)
    assert result.verdict == Verdict(spec["check"]["verdict"])
    assert list(result.unidentified_fields) == spec["check"]["unidentifiedFields"]
    if result.verdict is Verdict.VALID:
        assert result.errors == ()


@pytest.mark.parametrize(
    "spec", CASES["negativeControls"], ids=lambda spec: str(spec["id"])
)
def test_negative_control(spec: dict[str, Any]) -> None:
    valid = _fill(spec["file"], "succeeded-one-candidate")
    result = check_message(spec["schema"], _apply_patch(valid, spec["patch"]))

    assert result.verdict == Verdict(spec["check"]["verdict"])
    if "unidentifiedFields" in spec["check"]:
        assert list(result.unidentified_fields) == spec["check"]["unidentifiedFields"]
    for error in spec["check"].get("errorsInclude", []):
        assert (
            SchemaError(path=error["path"], keyword=error["keyword"]) in result.errors
        )


def test_results_keep_accepted_context_and_mock_source() -> None:
    for case in CASES["cases"]:
        for spec, message in zip(
            case["messages"], _filled_messages(case["caseId"]), strict=True
        ):
            fields = (
                CONTEXT_FIELDS if spec["schema"] == "Result" else CONTEXT_FIELDS[:2]
            )
            for field in fields:
                if field in message:
                    assert message[field] == CONTEXT[field]
            if spec["schema"] == "Result":
                assert message["sourceMode"] == "MOCK"
                assert all(candidate["title"] for candidate in message["candidates"])


def test_expected_results_follow_outcome_and_receipt_rules() -> None:
    for case in CASES["cases"]:
        for spec, message in zip(
            case["messages"], _filled_messages(case["caseId"]), strict=True
        ):
            expected = spec["expected"]
            if spec["schema"] == "ProcessingEvent":
                assert expected["receipt"] is None
                assert expected["processingAfter"] == message["state"]
            elif spec["check"]["verdict"] == "UNIDENTIFIABLE":
                assert expected["receipt"] is None
                assert expected["catchesAfter"] == 0
            else:
                outcome = _outcome_for(
                    len(message["candidates"]), len(message["failures"])
                )
                assert message["outcome"] == outcome
                assert expected["receipt"] is not None


def test_only_results_are_version_four_with_own_commit_shas() -> None:
    """Result만 "4"이고(NC3 C4) 후보마다 본인 커밋 목록(소문자 40자, 중복 없음)이 있다. 진행 알림은
    "2"다(CR2 BR2.2)."""
    for case in CASES["cases"]:
        for spec, message in zip(
            case["messages"], _filled_messages(case["caseId"]), strict=True
        ):
            if spec["schema"] == "ProcessingEvent":
                assert message["schemaVersion"] == "2"
                continue
            assert message["schemaVersion"] == "4"
            for candidate in message["candidates"]:
                shas = candidate["ownCommitShas"]
                assert shas and len(set(shas)) == len(shas)
                assert all(re.fullmatch(r"[0-9a-f]{40}", each) for each in shas)


def test_version_two_result_and_missing_own_commits_are_schema_invalid() -> None:
    (message,) = _filled_messages("succeeded-one-candidate")
    assert check_message("Result", message).verdict is Verdict.VALID
    old = {**message, "schemaVersion": "2"}
    assert check_message("Result", old).verdict is Verdict.SCHEMA_INVALID
    missing = copy.deepcopy(message)
    del missing["candidates"][0]["ownCommitShas"]
    assert check_message("Result", missing).verdict is Verdict.SCHEMA_INVALID
    for shas in (
        [],
        ["A" * 40],
        ["a" * 40, "a" * 40],
        [f"{n:040x}" for n in range(3001)],
    ):
        changed = copy.deepcopy(message)
        changed["candidates"][0]["ownCommitShas"] = shas
        assert check_message("Result", changed).verdict is Verdict.SCHEMA_INVALID


def test_redelivery_sends_identical_message() -> None:
    first, second = _filled_messages("redelivery")
    assert first == second


def test_same_id_different_content_conflicts() -> None:
    first, second = _filled_messages("same-id-different-content")
    assert first["resultId"] == second["resultId"]
    assert (
        first["candidates"][0]["candidateId"] == second["candidates"][0]["candidateId"]
    )
    assert first["candidates"] != second["candidates"]


def test_two_candidates_share_work_identity() -> None:
    (message,) = _filled_messages("two-candidates-same-work")
    first, second = message["candidates"]
    assert first["workIdentity"] == second["workIdentity"]
    assert first["candidateId"] != second["candidateId"]
    assert second["draft"] == {"status": "NOT_GENERATED", "content": None}


def test_work_identities_do_not_cross_cases() -> None:
    owners: dict[str, str] = {}
    for case in CASES["cases"]:
        for message in _filled_messages(case["caseId"]):
            for candidate in message.get("candidates", []):
                owner = owners.setdefault(candidate["workIdentity"], case["caseId"])
                assert owner == case["caseId"]


def test_fixtures_use_synthetic_hosts_only() -> None:
    text = "\n".join(
        path.read_text(encoding="utf-8") for path in FIXTURE_DIR.rglob("*.json")
    )
    hosts = set(re.findall(r"https?://([^/\"\s]+)", text))
    assert hosts
    assert all(host.endswith(".invalid") for host in hosts)


def test_unidentified_fields_rules() -> None:
    assert unidentified_fields([]) == ("resultId", "requestId", "attemptId")
    assert unidentified_fields(
        {"resultId": "r", "requestId": " ", "attemptId": None}
    ) == ("attemptId",)


def test_fill_template_rejects_missing_value() -> None:
    with pytest.raises(KeyError):
        fill_template({"requestId": "{{requestId}}"}, {})
