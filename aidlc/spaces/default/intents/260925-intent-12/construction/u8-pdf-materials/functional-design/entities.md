# U8 PDF 자료 — 엔티티

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md) U8 절, [컴포넌트 목록](../../../inception/domain-design/components.md)의 Materials·PdfTextExtraction·FileStorage·Publication, [계약 요약](../../../inception/contract-design/contract-summary.md) C-05·C-06·C-07·C-16·C-17, [재승인 요구사항](../../../inception/requirements-analysis/requirements.md) FR3·FR14.9, [기능 설계 질문·답변](functional-design-questions.md) Q1~Q7. 아래 YAML이 정본이고, 표와 설명은 그것을 풀어 쓴 것이다. 자료형은 논리형이며 DB 형식은 코드 생성에서 정한다.

U8이 **새로 만드는 표**는 `pdf_material`·`pdf_page_text`(Materials 소유)와 `published_pdf_page`(Publication 소유, 모양은 C-07 그대로) 셋이다. `published_item`은 U4 소유이며 U8은 PDF 항목 행을 쓰기만 한다(C-07의 `PDF_MATERIAL` 분기). 메시지(`PdfExtract`·`PdfExtractionResult`)는 저장하지 않는 값 객체라 기능 명세에 둔다.

```yaml
entities:
  - name: PdfMaterial
    owner: Materials
    description: 작성 회원이 올린 PDF 원본 한 벌. 파일은 FileStorage의 materialKey에 있고, 이 행은 제목·크기·쪽별 글 추출 상태를 가진다. 원본은 발행 사본과 수명이 다르다(원본을 지워도 사본은 남는다, FR3.2).
    attributes:
      - { name: pdfMaterialId, type: uuid, required: true, unique: true, description: 식별자. FileStorage 키와 추출 작업 ID에 그대로 쓴다 }
      - { name: memberId, type: uuid, required: true, references: MemberAccount, on_delete: cascade, description: 올린 회원(C-06 회원 따라 삭제) }
      - { name: title, type: text, required: true, min: 1, max: 100, description: 제목. 없으면 파일 이름에서 확장자를 뺀 값(Q1) }
      - { name: storageKey, type: text, required: true, description: materialKey(memberId, pdfMaterialId)와 같은 값. 저장해 두되 키는 C-05 도우미로만 만든다 }
      - { name: fileSizeBytes, type: integer, required: true, min: 1, max: 20971520, description: 올린 파일 크기. 상한 20 MB(Q1) }
      - { name: pageCount, type: integer, required: false, min: 1, max: 50, description: 추출이 DONE일 때만 값. api는 PDF를 파싱하지 않으므로 worker 결과(pages.length)로 채운다. 상한 50쪽(Q1) }
      - { name: extractionState, type: enum, required: true, allowed: [PENDING, DONE, FAILED], default: PENDING, description: C-02 status-names. 한 번만 바뀐다(PENDING→DONE 또는 FAILED) }
      - { name: extractionDeadlineAt, type: timestamp, required: true, description: 등록 커밋 시각 + 10분(Q2). C-02 readStatus 판정 기준 }
      - { name: extractionFailureCode, type: enum, required: false, allowed: [ENCRYPTED, UNREADABLE_FILE, PAGE_LIMIT_EXCEEDED, DEADLINE_EXCEEDED], description: FAILED 사유(Q5). DEADLINE_EXCEEDED는 worker 결과가 아니라 시한 판정이 넣는다. 그 밖에는 NULL }
      - { name: createdAt, type: timestamp, required: true }
      - { name: updatedAt, type: timestamp, required: true }
    constraints:
      - (extractionState = DONE) = (pageCount IS NOT NULL)
      - (extractionState = FAILED) = (extractionFailureCode IS NOT NULL)
      - 회원당 행 수 20 이하는 API 검증(BR1.2)으로 지킨다. DB 제약으로 두지 않는다
    relationships:
      - { to: MemberAccount, cardinality: many-to-one, direction: PdfMaterial -> MemberAccount }
      - { to: PdfPageText, cardinality: one-to-many, direction: PdfMaterial <- PdfPageText }
  - name: PdfPageText
    owner: Materials
    description: PDF 원본의 쪽 하나에서 worker가 뽑은 글. 글이 없는 쪽은 readable=false·빈 글이다(FR3.4). 발행 때 이 행들을 복사해 PublishedPdfPage로 고정한다.
    attributes:
      - { name: pdfPageTextId, type: uuid, required: true, unique: true }
      - { name: pdfMaterialId, type: uuid, required: true, references: PdfMaterial, on_delete: cascade, description: 어느 PDF의 쪽인가(C-06 PDF 자료 따라 삭제) }
      - { name: pageNumber, type: integer, required: true, min: 1, description: 1부터 빈틈 없이 연속 }
      - { name: text, type: text, required: true, description: 뽑은 글. 가공 없이 두되 저장할 수 없는 NUL 문자만 뺀다. 신뢰할 수 없는 입력 }
      - { name: readable, type: boolean, required: true, description: 글이 나온 쪽인가 }
    constraints:
      - unique (pdfMaterialId, pageNumber)
      - readable = false 이면 text = ''  (NOT readable OR text <> '' 로 표현)
    relationships:
      - { to: PdfMaterial, cardinality: many-to-one, direction: PdfPageText -> PdfMaterial }
  - name: PublishedPdfPage
    owner: Publication
    description: 발행 때 PdfPageText를 복사해 고정한 발행본 소유 사본(C-07 정의 그대로). U3 조각 나누기와 U5 근거 강조, 받은 사람 화면의 쪽 표시가 이 표만 읽는다. 원본이 바뀌거나 지워져도 바뀌지 않는다.
    attributes:
      - { name: publishedPdfPageId, type: uuid, required: true, unique: true }
      - { name: publishedItemId, type: uuid, required: true, references: PublishedItem, on_delete: cascade, description: 어느 발행 항목(item_kind PDF_MATERIAL)의 쪽인가(C-06 발행 항목 따라 삭제) }
      - { name: pageNumber, type: integer, required: true, min: 1 }
      - { name: text, type: text, required: true, description: 읽을 수 없는 쪽은 빈 문자열 }
      - { name: readable, type: boolean, required: true }
    constraints:
      - unique (publishedItemId, pageNumber)
      - 발행 뒤 갱신하지 않는다(사본)
    relationships:
      - { to: PublishedItem, cardinality: many-to-one, direction: PublishedPdfPage -> PublishedItem }
  - name: PublishedItem (PDF 부분, U4 소유 — 참조만)
    owner: Publication (U4)
    description: C-07의 발행 항목. U8은 item_kind = PDF_MATERIAL인 행을 발행 트랜잭션에서 쓴다. 다시 정의하지 않는다.
    attributes:
      - { name: itemKind, type: enum, allowed: [CATCH, TEXT_MATERIAL, PDF_MATERIAL], description: U8이 PDF_MATERIAL을 쓰기 시작한다 }
      - { name: sourceId, type: uuid, description: 원본 pdfMaterialId. 외래 키 없음(사본) }
      - { name: snapshot, type: json, description: PDF_MATERIAL은 { pageCount } 하나(C-07). 쪽별 글은 PublishedPdfPage }
      - { name: pdfCopyKey, type: text, description: publishedPdfKey(memberId, publicationId, publishedItemId). PDF_MATERIAL일 때만 값(C-07 CHECK) }
    constraints:
      - C-07 그대로
    relationships:
      - { to: PublishedPdfPage, cardinality: one-to-many, direction: PublishedItem <- PublishedPdfPage }
```

## 엔티티 요약

| 엔티티 | 소유 컴포넌트 | 수명(따라 지워지는 부모) | 이번 Unit에서 하는 일 |
|---|---|---|---|
| PdfMaterial | Materials | 회원(탈퇴), 본인 삭제 | 새 표. 업로드 때 PENDING으로 만들고 worker 결과 또는 시한 판정으로 DONE/FAILED |
| PdfPageText | Materials | PdfMaterial | 새 표. 추출 결과 수신 때 한 번에 저장 |
| PublishedPdfPage | Publication | PublishedItem → Publication(발행본 삭제·작성자 탈퇴) | 새 표(C-07 모양). 발행 트랜잭션에서 PdfPageText를 복사 |
| PublishedItem(PDF 부분) | Publication(U4) | Publication | 기존 표. PDF_MATERIAL 행 쓰기와 pdfCopyKey 채움 |

- 파일은 엔티티가 아니라 FileStorage 키다: 원본 `members/{memberId}/materials/{pdfMaterialId}.pdf`, 발행 사본 `members/{memberId}/publications/{publicationId}/{publishedItemId}.pdf`(C-05). 파일 삭제는 DB 연쇄 삭제로 되지 않으므로 규칙(rules.md BR7)으로 지킨다(FR14.9).
- 새 표 셋은 C-06 규칙(ON DELETE CASCADE, 같은 PR에서 탈퇴 삭제 표에 행 추가)을 따른다. 삭제 부모는 계약 C-06의 표(`pdf_material`→회원, `pdf_page_text`→PDF 자료, `published_pdf_page`→발행 항목)와 같다.
- `extractionFailureCode`와 `fileSizeBytes`는 도메인 설계 Materials 속성에 없던 칸이다. 전자는 Q5의 결정(사유 코드), 후자는 목록 표시와 상한 시험을 위한 U8 안 세부로 더했다. 둘 다 다른 Unit이 읽지 않는다.
