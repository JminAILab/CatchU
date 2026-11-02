"""api–worker 메시지 스키마 v1 검사와 합성 템플릿 채우기.

계약 YAML은 복사하지 않고 저장소의 원본 경로에서 읽는다. api 테스트 도우미
(`api/test/helpers/worker-messages.cjs`)가 같은 규칙으로 같은 판정을 내야 한다.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from functools import cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft7Validator, FormatChecker
from referencing import Registry
from referencing.jsonschema import DRAFT7

REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT_DIR = REPO_ROOT / "api/contracts/repository-analysis"
WORKER_MESSAGES_FILE = "worker-messages.yaml"
COMMON_FILE = "common.yaml"
FIXTURE_DIR = REPO_ROOT / "worker/fixtures/m1-synthetic"

# 파일 경로와 무관하게 `./common.yaml` 상대 참조를 풀기 위한 가상 기준 주소.
_BASE_URI = "https://contract.catchu.invalid/contract-design/"

MESSAGE_SCHEMAS = ("Request", "ProcessingEvent", "Result", "ResultReceipt")
# ResultReceipt를 보낼 수 있는지 가르는 세 식별자(worker-messages.yaml ResultReceipt 설명).
IDENTIFYING_FIELDS = ("resultId", "requestId", "attemptId")

_PLACEHOLDER = re.compile(r"\{\{([A-Za-z][A-Za-z0-9]*)\}\}")


class Verdict(StrEnum):
    """스키마 검사 판정. 계약 코드가 아니라 양쪽 테스트가 비교하는 기대값 이름이다."""

    VALID = "VALID"
    SCHEMA_INVALID = "SCHEMA_INVALID"
    UNIDENTIFIABLE = "UNIDENTIFIABLE"


@dataclass(frozen=True)
class SchemaError:
    """원문 값을 담지 않는 오류 위치. path는 JSON Pointer, keyword는 어긴 스키마 키워드."""

    path: str
    keyword: str


@dataclass(frozen=True)
class CheckResult:
    verdict: Verdict
    unidentified_fields: tuple[str, ...]
    errors: tuple[SchemaError, ...]


def _openapi_nullable_to_json_schema(node: Any) -> Any:
    """OpenAPI 3.0 `nullable: true`를 JSON Schema의 null 허용으로 바꾼다."""
    if isinstance(node, list):
        return [_openapi_nullable_to_json_schema(item) for item in node]
    if not isinstance(node, dict):
        return node
    converted = {
        key: _openapi_nullable_to_json_schema(value) for key, value in node.items()
    }
    if converted.pop("nullable", False) is True:
        schema_type = converted.get("type")
        if isinstance(schema_type, str):
            converted["type"] = [schema_type, "null"]
        if isinstance(converted.get("enum"), list) and None not in converted["enum"]:
            converted["enum"] = [*converted["enum"], None]
    return converted


def _load_contract(file_name: str) -> Any:
    with (CONTRACT_DIR / file_name).open(encoding="utf-8") as stream:
        return _openapi_nullable_to_json_schema(yaml.safe_load(stream))


@cache
def _registry() -> Registry[Any]:
    resources = [
        (_BASE_URI + name, DRAFT7.create_resource(_load_contract(name)))
        for name in (WORKER_MESSAGES_FILE, COMMON_FILE)
    ]
    registry: Registry[Any] = Registry().with_resources(resources)
    return registry


def _format_checker() -> FormatChecker:
    checker: FormatChecker = Draft7Validator.FORMAT_CHECKER
    # jsonschema는 형식 패키지가 없으면 해당 형식을 조용히 통과시킨다.
    missing = {"date-time", "uri"} - set(checker.checkers)
    if missing:
        raise RuntimeError(f"형식 검사기를 불러오지 못함: {sorted(missing)}")
    return checker


@cache
def _validator(schema_name: str) -> Draft7Validator:
    if schema_name not in MESSAGE_SCHEMAS:
        raise ValueError(f"알 수 없는 메시지 스키마: {schema_name}")
    root = {
        "$ref": f"{_BASE_URI}{WORKER_MESSAGES_FILE}#/components/schemas/{schema_name}"
    }
    return Draft7Validator(root, registry=_registry(), format_checker=_format_checker())


def _pointer(parts: Any) -> str:
    return "".join(
        "/" + str(part).replace("~", "~0").replace("/", "~1") for part in parts
    )


def schema_errors(schema_name: str, message: object) -> tuple[SchemaError, ...]:
    errors = {
        SchemaError(path=_pointer(error.absolute_path), keyword=str(error.validator))
        for error in _validator(schema_name).iter_errors(message)
    }
    return tuple(sorted(errors, key=lambda error: (error.path, error.keyword)))


def unidentified_fields(message: object) -> tuple[str, ...]:
    """세 식별자 중 비어 있지 않은 문자열로 읽히지 않는 필드를 돌려준다."""
    if not isinstance(message, Mapping):
        return IDENTIFYING_FIELDS
    return tuple(
        field
        for field in IDENTIFYING_FIELDS
        if not (isinstance(message.get(field), str) and message[field] != "")
    )


def check_message(schema_name: str, message: object) -> CheckResult:
    """식별 가능성(Result만)을 먼저 보고, 그다음 스키마 v1을 검사한다."""
    missing = unidentified_fields(message) if schema_name == "Result" else ()
    errors = schema_errors(schema_name, message)
    if missing:
        verdict = Verdict.UNIDENTIFIABLE
    elif errors:
        verdict = Verdict.SCHEMA_INVALID
    else:
        verdict = Verdict.VALID
    return CheckResult(verdict=verdict, unidentified_fields=missing, errors=errors)


def fill_template(template: Any, values: Mapping[str, str]) -> Any:
    """문자열 값 안의 `{{이름}}`을 채운다. 값이 없는 자리표시자는 오류로 막는다."""
    if isinstance(template, list):
        return [fill_template(item, values) for item in template]
    if isinstance(template, dict):
        return {key: fill_template(value, values) for key, value in template.items()}
    if not isinstance(template, str):
        return template

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in values:
            raise KeyError(f"채울 값이 없는 자리표시자: {name}")
        return values[name]

    return _PLACEHOLDER.sub(replace, template)
