"""PDF 추출 시험 도구: 합성 PDF 바이트, `PdfExtract` 봉투·가짜 작업, 로컬 뿌리에 원본 두기.

실제 회원 PDF는 쓰지 않는다. 쪽마다 Helvetica `Tj` 글 한 줄을 넣거나 빈 쪽을 만들고, 필요하면 RC4-128로
암호화한다. 글은 latin-1로 쓸 수 있는 ASCII만 쓴다(Type1 표준 글꼴의 기본 인코딩).
"""

import io
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pypdf import PdfWriter
from pypdf.generic import (
    ArrayObject,
    ByteStringObject,
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
    NumberObject,
)

from app.consumer import queues
from app.pdf_extraction.envelope import SCHEMA_VERSION, storage_key


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def pdf_bytes(pages: list[str | None], *, password: str | None = None) -> bytes:
    """쪽마다 글 한 줄(None이면 빈 쪽)을 둔 PDF. password가 있으면 RC4-128로 암호화한다."""
    writer = PdfWriter()
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    font_ref = writer._add_object(font)
    for text in pages:
        page = writer.add_blank_page(width=612, height=792)
        if text is None:
            continue
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref})}
        )
        stream = DecodedStreamObject()
        stream.set_data(
            f"BT /F1 12 Tf 72 720 Td ({_escape(text)}) Tj ET".encode("latin-1")
        )
        page[NameObject("/Contents")] = writer._add_object(stream)
    if password is not None:
        writer.encrypt(user_password=password, algorithm="RC4-128")
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def aes256_pdf_bytes() -> bytes:
    """AES-256(/V 5 /R 6, AESV3) 암호화 사전이 붙은 한 쪽 PDF.

    시험 환경에는 암호 라이브러리가 없어 실제로 암호화하지는 못한다. pypdf가 여는 단계에서 보는 것은 암호화
    사전뿐이므로(빈 비밀번호 확인을 시도하다 `DependencyError`), 사전만 손으로 붙여도 같은 경로를 탄다.
    """
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    crypt_filter = DictionaryObject(
        {
            NameObject("/CFM"): NameObject("/AESV3"),
            NameObject("/AuthEvent"): NameObject("/DocOpen"),
            NameObject("/Length"): NumberObject(32),
        }
    )
    encrypt = DictionaryObject(
        {
            NameObject("/Filter"): NameObject("/Standard"),
            NameObject("/V"): NumberObject(5),
            NameObject("/R"): NumberObject(6),
            NameObject("/Length"): NumberObject(256),
            NameObject("/P"): NumberObject(-1),
            NameObject("/O"): ByteStringObject(bytes(range(48))),
            NameObject("/U"): ByteStringObject(bytes(range(48, 96))),
            NameObject("/OE"): ByteStringObject(bytes(32)),
            NameObject("/UE"): ByteStringObject(bytes(32)),
            NameObject("/Perms"): ByteStringObject(bytes(16)),
            NameObject("/CF"): DictionaryObject({NameObject("/StdCF"): crypt_filter}),
            NameObject("/StmF"): NameObject("/StdCF"),
            NameObject("/StrF"): NameObject("/StdCF"),
        }
    )
    writer._add_object(encrypt)
    writer._encrypt_entry = encrypt
    writer._ID = ArrayObject([ByteStringObject(b"0" * 16), ByteStringObject(b"1" * 16)])
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def text_pages(count: int) -> list[str | None]:
    return [f"Synthetic page {number}" for number in range(1, count + 1)]


def new_id() -> str:
    return str(uuid.uuid4())


def pdf_request(
    pdf_material_id: str | None = None, member_id: str | None = None
) -> dict[str, Any]:
    """api가 넣는 `PdfExtract` 봉투(5필드)."""
    pdf_material_id = pdf_material_id or new_id()
    member_id = member_id or new_id()
    return {
        "schemaVersion": SCHEMA_VERSION,
        "messageId": queues.pdf_request_message_id(pdf_material_id),
        "pdfMaterialId": pdf_material_id,
        "memberId": member_id,
        "storageKey": storage_key(member_id, pdf_material_id),
    }


@dataclass
class PdfJob:
    """BullMQ 작업 대역(`PdfJob` 프로토콜)."""

    id: Any
    data: Any
    name: Any = queues.PDF_REQUEST_JOB
    opts: dict[str, Any] = field(default_factory=lambda: {"attempts": 1})


def pdf_job(message: dict[str, Any] | None = None) -> PdfJob:
    message = message or pdf_request()
    return PdfJob(id=message["pdfMaterialId"], data=message)


def place(root: Path, message: dict[str, Any], data: bytes) -> Path:
    """로컬 뿌리 아래 봉투의 storageKey 위치에 원본을 둔다."""
    target = root.joinpath(*str(message["storageKey"]).split("/"))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target
