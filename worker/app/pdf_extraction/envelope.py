"""PDF 추출 메시지 모양: 요청 봉투 검사(BR3.6), 결과 봉투 조립·자체 검사, 수신 확인 분류.

api `pdf-extraction-spec.ts`와 같은 값을 쓴다(한쪽만 바꾸지 않는다). 계약 YAML(C-16)에는 아직 없는
더하는 변경이라 `app.contract.check_message`에 넣지 않고 여기서 코드로 검사한다(계획 12.2).
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Final

from app.consumer import queues
from app.consumer.receipts import ReceiptKind, ReceiptRecord, ResultJobView
from app.pdf_extraction.settings import PAGE_LIMIT, TEXT_LIMIT

SCHEMA_VERSION: Final = "2"
REQUEST_KEYS: Final = frozenset(
    {"schemaVersion", "messageId", "pdfMaterialId", "memberId", "storageKey"}
)
RESULT_KEYS: Final = frozenset(
    {
        "schemaVersion",
        "messageId",
        "pdfMaterialId",
        "memberId",
        "outcome",
        "pages",
        "failureCode",
    }
)
PAGE_KEYS: Final = frozenset({"pageNumber", "readable", "text"})
RECEIPT_KEYS: Final = frozenset(
    {"schemaVersion", "messageId", "pdfMaterialId", "disposition", "code"}
)
# worker가 보내는 실패 사유 4종(BR3.2 + 팀장 결정 2026-11-10의 TEXT_LIMIT_EXCEEDED, #420 issuecomment-6759834176).
# DEADLINE_EXCEEDED는 api 시한 판정이 넣는다. api PDF_WORKER_FAILURE_CODES와 같은 목록이다.
FAILURE_CODES: Final = (
    "ENCRYPTED",
    "UNREADABLE_FILE",
    "PAGE_LIMIT_EXCEEDED",
    "TEXT_LIMIT_EXCEEDED",
)
RECEIPT_CODES: Final[Mapping[str, frozenset[str]]] = {
    "ACCEPTED": frozenset({"OK"}),
    "DUPLICATE": frozenset({"ALREADY_RECEIVED"}),
    "REJECTED": frozenset({"CONTEXT_MISMATCH", "STALE_ATTEMPT", "SCHEMA_INVALID"}),
}
# 수신 확인과 보낸 결과를 대조하는 식별 필드(api 수신 확인은 결과의 messageId를 그대로 돌려준다).
PDF_IDENTIFYING_FIELDS: Final = ("messageId", "pdfMaterialId")

_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_UUID_RE = re.compile(_UUID)
_STORAGE_KEY = re.compile(rf"members/({_UUID})/materials/({_UUID})\.pdf")


def is_lower_uuid(value: object) -> bool:
    """api와 같은 소문자 UUID만 받는다(queues.is_uuid는 대소문자를 모두 받는다)."""
    return isinstance(value, str) and _UUID_RE.fullmatch(value) is not None


def storage_key(member_id: str, pdf_material_id: str) -> str:
    """C-05 materialKey. 요청 값에서 조립하지 않고 ID에서만 만든다(NFR1.7)."""
    return f"members/{member_id}/materials/{pdf_material_id}.pdf"


def parse_storage_key(value: object) -> tuple[str, str] | None:
    """`members/{uuid}/materials/{uuid}.pdf` 모양이면 (memberId, pdfMaterialId). 그 밖은 None.

    정규식이 `..`·역슬래시·절대 경로·대문자·다른 마디를 모두 거른다(api parseStorageKey와 같은 결과).
    """
    if not isinstance(value, str):
        return None
    matched = _STORAGE_KEY.fullmatch(value)
    if matched is None:
        return None
    return matched.group(1), matched.group(2)


@dataclass(frozen=True)
class PdfRequest:
    """검사를 통과한 요청 봉투."""

    pdf_material_id: str
    member_id: str
    storage_key: str
    message_id: str


def check_request(name: object, job_id: object, data: object) -> PdfRequest | None:
    """작업 이름 PdfExtract, 작업 ID == pdfMaterialId, 허용 키 5개만, 소문자 UUID 2개,
    messageId == pdf-extract-{id}, storageKey == members/{memberId}/materials/{id}.pdf."""
    if name != queues.PDF_REQUEST_JOB or not is_lower_uuid(job_id):
        return None
    if not isinstance(data, Mapping) or set(data.keys()) != REQUEST_KEYS:
        return None
    pdf_material_id = data["pdfMaterialId"]
    member_id = data["memberId"]
    if pdf_material_id != job_id or not is_lower_uuid(member_id):
        return None
    if data["schemaVersion"] != SCHEMA_VERSION:
        return None
    if data["messageId"] != queues.pdf_request_message_id(pdf_material_id):
        return None
    key = data["storageKey"]
    if key != storage_key(member_id, pdf_material_id) or parse_storage_key(key) != (
        member_id,
        pdf_material_id,
    ):
        return None
    return PdfRequest(
        pdf_material_id=pdf_material_id,
        member_id=member_id,
        storage_key=key,
        message_id=data["messageId"],
    )


def build_result(request: PdfRequest, outcome: Mapping[str, Any]) -> dict[str, Any]:
    """자식이 돌려준 추출 결과(`outcome`·`pages` 또는 `failureCode`)에 식별 필드를 붙인다.

    식별 필드는 검사한 요청에서만 가져오므로 자식이 바꿀 수 없다. 모양은 `is_valid_result`로 보내기 전에 확인한다.
    """
    result: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "messageId": queues.pdf_result_message_id(request.pdf_material_id),
        "pdfMaterialId": request.pdf_material_id,
        "memberId": request.member_id,
        "outcome": outcome.get("outcome"),
    }
    if "pages" in outcome:
        result["pages"] = outcome["pages"]
    if "failureCode" in outcome:
        result["failureCode"] = outcome["failureCode"]
    return result


def failed_result(request: PdfRequest, failure_code: str) -> dict[str, Any]:
    return build_result(request, {"outcome": "FAILED", "failureCode": failure_code})


def _absent(value: object) -> bool:
    return value is None


def _valid_pages(value: object) -> bool:
    if not isinstance(value, list) or not 1 <= len(value) <= PAGE_LIMIT:
        return False
    total = 0
    for index, page in enumerate(value):
        if not isinstance(page, Mapping) or set(page.keys()) != PAGE_KEYS:
            return False
        number, readable, text = page["pageNumber"], page["readable"], page["text"]
        if not isinstance(number, int) or isinstance(number, bool):
            return False
        if number != index + 1 or not isinstance(readable, bool):
            return False
        if not isinstance(text, str) or "\x00" in text:
            return False
        if readable != (text != ""):
            return False
        total += len(text)
    # 쪽 글 합계(코드 포인트) 상한. api 수신 검사도 같은 상한으로 SCHEMA_INVALID를 낸다(BR4.5·BR3.3).
    return total <= TEXT_LIMIT


def is_valid_result(value: object) -> bool:
    """api `isValidPdfExtractionResult`와 같은 규칙. 보내기 전 자체 점검에 쓴다."""
    if not isinstance(value, Mapping) or not set(value.keys()) <= RESULT_KEYS:
        return False
    if value.get("schemaVersion") != SCHEMA_VERSION:
        return False
    pdf_material_id = value.get("pdfMaterialId")
    if not is_lower_uuid(pdf_material_id) or not is_lower_uuid(value.get("memberId")):
        return False
    assert isinstance(pdf_material_id, str)
    if value.get("messageId") != queues.pdf_result_message_id(pdf_material_id):
        return False
    outcome = value.get("outcome")
    if outcome == "SUCCEEDED":
        return _absent(value.get("failureCode")) and _valid_pages(value.get("pages"))
    if outcome == "FAILED":
        return _absent(value.get("pages")) and value.get("failureCode") in FAILURE_CODES
    return False


def is_valid_receipt(value: object) -> bool:
    """api 수신 확인 `{ schemaVersion, messageId, pdfMaterialId, disposition, code }`의 모양."""
    if not isinstance(value, Mapping) or set(value.keys()) != RECEIPT_KEYS:
        return False
    if value["schemaVersion"] != SCHEMA_VERSION:
        return False
    if not isinstance(value["messageId"], str) or not value["messageId"]:
        return False
    if not is_lower_uuid(value["pdfMaterialId"]):
        return False
    allowed = RECEIPT_CODES.get(str(value["disposition"]))
    return allowed is not None and value["code"] in allowed


def classify_receipt(view: ResultJobView, sent: Mapping[str, Any]) -> ReceiptRecord:
    """`ReceiptWatcher`에 넘기는 PDF 전용 분류. 10월 분류(`receipts.classify`)와 같은 종류를 낸다."""
    if view.failed:
        return ReceiptRecord(ReceiptKind.JOB_FAILED)
    receipt = view.return_value
    if receipt is None:
        return ReceiptRecord(ReceiptKind.NULL)
    if not is_valid_receipt(receipt):
        return ReceiptRecord(ReceiptKind.INVALID)
    assert isinstance(receipt, Mapping)
    if any(receipt[field] != sent[field] for field in PDF_IDENTIFYING_FIELDS):
        return ReceiptRecord(ReceiptKind.ID_MISMATCH)
    return ReceiptRecord(
        ReceiptKind.RECEIVED,
        disposition=str(receipt["disposition"]),
        code=str(receipt["code"]),
    )
