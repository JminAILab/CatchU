# PDF 자료 — 12월 U8

작성 회원이 PDF를 올리면 worker가 쪽별 글을 뽑고, 추출이 끝난 PDF를 발행본에 넣어 받은 사람이 사본을 여는 기능의 api 쪽 안내다. 화면은 [web PDF 자료 안내](../../web/src/features/materials/README.md#pdf-자료-탭-u8)와 [받은 사람 화면 안내](../../web/src/features/recipient/README.md#pdf-항목과-사본-열람-u8), 추출 소비자는 [worker README 「PDF 글 추출 소비자」](../../worker/README.md#pdf-글-추출-소비자)에 있다.

기준 문서: [U8 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/functional-design/functional-spec.md) W1~W5, [업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/functional-design/rules.md) BR1~BR7, [보안 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/security-design.md), [관측 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/observability-design.md), [계약 요약](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md) C-05·C-10·C-12·C-16·C-17. 구현 기록은 [U8 코드 요약](../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/code-generation/code-summary.md)이다.

## 표와 파일

| 표 | 내용 | 지워지는 때 |
|---|---|---|
| `pdf_material` | 원본 한 벌. 제목·저장 키·크기·쪽 수·추출 상태(`PENDING`·`DONE`·`FAILED`)·시한·실패 사유 | 자료 삭제, 회원 탈퇴 |
| `pdf_page_text` | 원본의 쪽별 글(`page_number`·`text`·`readable`) | 원본과 함께(외래 키 연쇄) |
| `published_pdf_page` | 발행 시점의 쪽 사본 | 발행 항목과 함께(외래 키 연쇄) |

파일은 [FileStorage](file-storage.md)에 둔다. 원본 키는 `materialKey(memberId, pdfMaterialId)`(`members/{memberId}/materials/{pdfMaterialId}.pdf`), 발행 사본 키는 `publishedPdfKey(memberId, publicationId, publishedItemId)`다. 키는 이 도우미로만 만들고 요청 값에서 조립하지 않는다. 원본을 지워도 발행 사본과 쪽 사본은 남는다.

## PDF 자료 API

`src/materials/pdf-materials.controller.ts`·`pdf-material-input.ts`·`pdf-material-store.ts`. 전역 인증 Guard·오류 형식·`no-store`는 공통 기반 그대로이고 `@Public()`을 붙이지 않는다. 모든 조회·삭제는 인증 회원의 자료로 제한하며 남의 것·없는 것·UUID 모양이 아닌 ID는 같은 404다.

| 경로 | 요청 | 성공 | 오류 |
|---|---|---|---|
| `POST /v1/pdf-materials` | `multipart/form-data`: 파일 `file` 하나, 선택 필드 `title` | 201 `{ pdfMaterialId, title, fileSizeBytes, extractionState: PENDING }` | 400 `VALIDATION_FAILED`·`INVALID_REQUEST`, 401, 403 `AI_CONSENT_REQUIRED`, 500 |
| `GET /v1/pdf-materials` | 쿼리 `cursor`·`limit`(1~100, 기본 20) | 200 `{ items: [{ pdfMaterialId, title, fileSizeBytes, pageCount, extractionState, failureCode }], page: { nextCursor } }` | 400, 401 |
| `GET /v1/pdf-materials/{pdfMaterialId}` | — | 200 목록 항목 + `pages: [{ pageNumber, readable }]`(글 본문 없음) | 401, 404 |
| `GET /v1/pdf-materials/{pdfMaterialId}/file` | — | 200 `application/pdf` 원본 스트림 | 401, 404, 500 |
| `DELETE /v1/pdf-materials/{pdfMaterialId}` | — | 204 | 401, 404, 500 |

### 업로드

순서는 인증 → 동의 확인(본문을 읽기 전) → multipart 검사 → `FileStorage.put` → 트랜잭션(회원 행 잠금·벌 수 세기·`PENDING` 행 넣기) → 커밋 → 추출 요청 발송 → 201이다.

- 상한: 파일 20 MB, 제목 1~100자(코드 포인트, 앞뒤 공백 제외), 회원당 20벌. 쪽 50과 쪽 글 합계 60,000자는 worker가 판정한다.
- 파일 검사는 선언 종류(`application/pdf`) → 받은 바이트 누적이 20 MB를 넘는 즉시 중단 → 머리 바이트 `%PDF-` 순서다. 요청 헤더의 선언 크기는 믿지 않는다.
- `title`이 없으면 파일 이름에서 경로 마디와 마지막 확장자를 뺀 값을 쓴다.
- `details.violations`의 `field`·`reason`: `body`(`isMultipart`·`whitelistValidation`), `file`(`isRequired`·`isPdf`·`maxSize`·`singleFile`), `title`(`isString`·`noNul`·`isWellFormed`·`isNotEmpty`·`maxLength`), `materials`(`maxCount`). 값(파일 이름·제목)은 담지 않는다. 해석할 수 없는 multipart는 400 `INVALID_REQUEST`다.
- `put` 뒤에 DB 쓰기가 실패하거나 벌 수를 넘으면 올린 파일을 한 번 지운다. 그 삭제도 실패하면 로그만 남기고, 남은 파일은 탈퇴 때 회원 접두어 삭제로 지워진다.
- 추출 요청 발송 실패는 응답을 바꾸지 않는다(201). 그 자료는 시한이 지나면 `FAILED`(`DEADLINE_EXCEEDED`)가 된다.
- 파일 저장이 설정되지 않은 환경에서는 500이고 행을 만들지 않는다.

### 상태와 시한

- 추출 시한은 업로드 커밋 시각 + 10분이며 큐 대기를 포함한다.
- 상태를 읽는 자리(목록·상세·발행 사전 확인)는 시한이 지난 `PENDING`을 먼저 `FAILED`(`DEADLINE_EXCEEDED`)로 저장한 뒤 읽는다. 따로 도는 정리 작업은 없다.
- `failureCode`: `ENCRYPTED`·`UNREADABLE_FILE`·`PAGE_LIMIT_EXCEEDED`·`TEXT_LIMIT_EXCEEDED`(worker 결과), `DEADLINE_EXCEEDED`(시한 판정). 다시 추출하는 경로는 없고 작성자가 새로 올린다.

### 원본 열람과 삭제

- 원본 열람 응답 헤더는 `Content-Type: application/pdf`, `Content-Disposition: inline; filename="material.pdf"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`다. 제목은 넣지 않는다. Range 요청은 지원하지 않는다.
- 헤더를 보내기 전에 저장소에서 파일을 열어 성공을 확인한다. 파일 없음·저장소 실패는 500이다. 전송 도중 오류는 상태 코드를 바꿀 수 없어 연결을 끊고 로그만 남긴다.
- 삭제는 소유 확인 → 파일 먼저(없는 키도 성공) → 행 삭제 순서다. 저장소가 실패하면 500이고 DB는 그대로다.

## 추출 요청과 결과 수신 (C-16)

`src/pdf-extraction/pdf-extraction-spec.ts`(규격 값 한곳), `pdf-extract.dispatcher.ts`(요청 발송), `pdf-extraction.receiver.ts`(결과 수신). worker의 `app/pdf_extraction/envelope.py`가 같은 값을 전제하므로 한쪽만 바꾸지 않는다. 아래에서 계약 C-16 원문에 없는 필드는 **U8이 더한 변경**이며 계약 문서 반영은 별도 계약 수정 PR로 넘긴다([코드 요약 §18.2](../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/code-generation/code-summary.md)).

| 방향 | 큐 | 작업 이름 | 작업 ID | 본문 |
|---|---|---|---|---|
| api → worker | `pdf-extraction-requests` | `PdfExtract` | `pdfMaterialId` | `{ schemaVersion: "2", messageId: "pdf-extract-{pdfMaterialId}", pdfMaterialId, memberId, storageKey }` |
| worker → api | `worker-messages` | `PdfExtractionResult` | `messageId` | `{ schemaVersion: "2", messageId: "message-pdf-{pdfMaterialId}-result", pdfMaterialId, memberId, outcome, pages?, failureCode? }` |

- 요청은 시도 1회·재시도 없음이고, 완료·실패 작업을 2시간 보관한다(그동안 같은 ID 재등록은 큐가 무시). 큐에 넣는 명령은 5초를 넘기면 실패로 본다.
- 결과 본문: `outcome: SUCCEEDED`면 `pages`만(1~50개, `pageNumber`는 1부터 연속, 각 쪽은 `pageNumber`·`readable`·`text` 세 필드만, `text`에 NUL 없음, `readable === (text !== '')`, 쪽 글 코드 포인트 합 60,000 이하), `outcome: FAILED`면 `failureCode`만(`ENCRYPTED`·`UNREADABLE_FILE`·`PAGE_LIMIT_EXCEEDED`·`TEXT_LIMIT_EXCEEDED`). 정의 밖 필드는 거부한다. 쪽 글은 신뢰하지 않는 입력으로 다룬다.
- 모양 검사는 계약 YAML이 아니라 코드(`isValidPdfExtractionResult`)로 한다.

수신 확인은 `{ schemaVersion, messageId, pdfMaterialId, disposition, code }`이며, `pdf_material` 행을 잠근 안에서 차례로 판정한다.

| 판정 | 수신 확인 | 저장 |
|---|---|---|
| 모양 오류 | `REJECTED`/`SCHEMA_INVALID`(식별자조차 없으면 수신 확인 없음) | 없음 |
| 행 없음(자료 삭제·탈퇴) 또는 회원 불일치 | `REJECTED`/`CONTEXT_MISMATCH` | 없음 |
| 이미 `DONE` | `DUPLICATE`/`ALREADY_RECEIVED` | 없음 |
| `FAILED`, 또는 `PENDING`인데 시한 지남 | `REJECTED`/`STALE_ATTEMPT` | 시한이 지난 `PENDING`은 `FAILED`(`DEADLINE_EXCEEDED`)로 저장 |
| `PENDING`·시한 전 | `ACCEPTED`/`OK`(커밋 뒤에만) | `SUCCEEDED`면 쪽 행 전부 + 쪽 수 + `DONE`, `FAILED`면 `FAILED` + 사유 |

- 저장(쪽 행·상태·커밋)이 실패하면 전부 되돌아가고 수신 확인 없이 작업이 실패한다. 자료는 `PENDING`으로 남아 시한으로 `FAILED`가 된다.
- worker는 거부된 결과를 다시 보내지 않는다.
- 발송·수신은 `CATCHU_QUEUE_REDIS_URL`이 있을 때만 조립된다(아래 「설정」).

## 발행의 PDF 부분 (C-17)

`src/publications/pdf-publish.ts`를 U4 발행 서비스(`publish.service.ts`)가 부른다. 발행 API 전체는 [발행본 문서](publications.md#발행-api-제출-2)에 있고, 여기에는 PDF가 더하는 것만 적는다.

- `POST /v1/publications`의 `items[].kind`에 `PDF_MATERIAL`을 받는다. 항목 수·중복 규칙은 U4 그대로다.
- 고른 PDF가 모두 `DONE`이어야 한다. 아니면 400 `VALIDATION_FAILED`이고 `details.violations`에 해당 위치마다 `{ field: "items[i].sourceId", reason: "extractionIncomplete" }`가 들어간다. 없거나 남의 것은 U4와 같은 404다.
- 순서: 사전 확인(트랜잭션 밖) → 발행본·항목 ID 선생성 → `position` 순으로 원본을 사본 키에 복사 → 발행 트랜잭션 안에서 PDF를 다시 잠가 `DONE` 재확인·쪽 글 합계 계산·쪽 사본 행 복사 → 커밋.
- 복사가 하나라도 실패하면 그 발행본 접두어를 한 번 지우고 500이다. 트랜잭션이 실패해도 접두어를 한 번 지우고 원래 오류를 낸다. 접두어 정리 실패는 로그만 남긴다.
- 쪽 글 합계는 발행본 전체 글 상한 60,000자에 들어간다.
- PDF 항목이 없는 발행은 저장소를 부르지 않고 U4 흐름 그대로다.
- 사본(`PublishedSnapshot`)의 PDF 항목은 `snapshot: { pageCount }`와 `pdfPages: [{ pageNumber, text, readable }]`를 갖는다. 다른 종류 항목의 `pdfPages`는 `null`이다.

## PDF 사본 열람 (C-12 추가 경로)

`src/publications/published-pdf-view.service.ts`. 받은 사람 경로는 계약 C-12에 **U8이 더한 경로**다(계약 문서 반영은 별도 계약 수정 PR).

| 경로 | 인증 | 성공 | 오류 |
|---|---|---|---|
| `GET /v1/public/links/{token}/items/{publishedItemId}/pdf` | 없음(`@Public()`). 비밀번호 링크는 헤더 `X-Link-Grant` | 200 `application/pdf` 사본 스트림 | 401 `LINK_PASSWORD_REQUIRED`, 404 `LINK_UNAVAILABLE`, 500 |
| `GET /v1/publications/{publicationId}/items/{publishedItemId}/pdf` | 회원(작성자) | 200 `application/pdf` 사본 스트림 | 401, 404, 500 |

- 받은 사람 경로는 읽기 전용 REPEATABLE READ 트랜잭션에서 C-10 링크 판정(`resolveForRecipient`)을 그대로 쓴 뒤 항목을 찾는다. 그 발행본의 `PDF_MATERIAL` 항목이 아니면 404 `LINK_UNAVAILABLE`이며 사유를 구분하지 않는다.
- 작성자 경로는 본인 발행본이면 링크가 중지·만료된 뒤에도 연다.
- 응답 헤더는 `Content-Type: application/pdf`, `Content-Disposition: inline; filename="document.pdf"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`다. Range 요청은 지원하지 않는다.
- 헤더 전에 파일을 열어 확인한다. 파일 없음·저장소 실패는 500이다.
- 이 경로에는 시도 제한이 없다. 토큰·grant·저장 키는 로그에 남기지 않는다.
- 발행본을 지우면 접두어 삭제로 사본 파일이 함께 지워지고, 그 뒤 사본 경로는 404다.

## 설정

| 이름 | 쓰는 곳 | 내용 |
|---|---|---|
| `FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT`·`FILE_STORAGE_S3_BUCKET` | 파일 저장 | [파일 저장 문서 「설정」](file-storage.md#설정). 셋 다 비우면 api는 기동하고 PDF 업로드가 500이다 |
| `AWS_REGION` | S3 드라이버 | AWS SDK가 읽는 지역. 접근 키는 넣지 않고 기본 자격 체인(역할)을 쓴다 |
| `CATCHU_QUEUE_REDIS_URL`·`CATCHU_QUEUE_PREFIX` | 추출 요청 발송·결과 수신 | 주소가 없으면 발송도 수신도 조립되지 않는다. 업로드는 201이지만 추출이 돌지 않아 10분 뒤 `FAILED`(`DEADLINE_EXCEEDED`)로 보인다. 접두사는 worker와 같아야 한다 |

이름과 설명은 `api/.env.example`에 있다. 상한 값(20 MB·20벌·50쪽·60,000자·10분)은 설정이 아니라 코드 상수다.

## 로그

구조 로그이며 식별자·사건 이름·단계·오류 이름만 남긴다. 저장 키·토큰·grant·제목·파일 이름·쪽 글은 넣지 않는다.

| 사건 | 수준 | 때 |
|---|---|---|
| `PDF_UPLOAD_STORE_FAILED` | error | 업로드의 `put`·DB 쓰기·보상 삭제 실패(`stage`) |
| `PDF_EXTRACT_ENQUEUE_FAILED` | warn | 커밋 뒤 추출 요청 발송 실패 |
| `PDF_EXTRACTION_RECEIVED` | log | 결과 수신 판정마다(`disposition`·`code`·`pageCount`) |
| `PDF_DELETE_STORAGE_FAILED` | error | 자료 삭제 때 저장소 실패 |
| `PDF_COPY_FAILED` | warn | 발행 복사 실패 |
| `PREFIX_CLEANUP_FAILED` | error | 발행 실패 뒤 접두어 정리 실패(`stage` 3·5) |
| `PDF_VIEW_FAILED` | warn(401·404), error(500·전송 중 끊김) | 원본·사본 열람 실패. `stage`(`before-headers`·`streaming`), `status`, `reason`(`file-missing`·`storage`) |

`PDF_VIEW_FAILED`의 받은 사람 401·404에는 발행본 ID만(판정이 거부되어 모르면 없이), 작성자 404에는 회원 ID를 함께 적는다. 받는 쪽이 먼저 연결을 끊은 경우는 기록하지 않는다.

## 수용한 위험

[보안 설계 §10](../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/security-design.md)의 내용이다.

| 위험 | 상태 |
|---|---|
| PDF 내용(스크립트·외부 링크)의 악성 여부를 검사하지 않는다 | 수용. 브라우저 내장 뷰어의 격리와 `nosniff`에 맡긴다 |
| 이미 전달된 PDF는 링크를 중지한 뒤에도 그 탭에서 보인다 | 수용. 다음 요청부터 막는다 |
| 개인정보가 든 PDF를 그대로 저장·전송한다 | 요구사항대로. 업로드 화면의 안내 문구로 알린다 |
| 동시 업로드 n건이면 api 메모리에 최대 n × 20 MB가 머문다 | 수용. 시연 규모 가정이며 규모가 커지면 다시 검토한다 |
| 해제된 새 탭 Blob URL은 그 탭을 새로고침하면 실패한다 | 수용. 원래 화면에서 다시 연다 |

그 밖에 알아 둘 한계: OCR이 없어 스캔본의 쪽은 "읽을 수 없음"으로 남는다. 파일 교체와 다시 추출이 없다. PDF 글은 MCP 도구로 내보내지 않는다. PDF 뷰어가 Blob URL을 iframe으로 그리므로 web의 CSP에 `frame-src 'self' blob:`이 있다.

## 확인 범위

| 범위 | 상태 |
|---|---|
| 자동 시험(아래 「시험」) | 통과. S3는 요청을 기록하는 가짜 클라이언트, 발행의 저장소 실패는 가짜 `FileStorage` |
| 로컬 파일 저장소 + 실제 큐 + 실제 worker를 거친 전체 흐름(화면 업로드 → 추출 `DONE` → 발행 화면 선택·발행 → 받은 사람 화면에서 사본 열람) | **확인됨**(2026-11-11 로컬, 코드 요약 §17.4~§17.6) |
| 실제 S3(업로드·추출 읽기·사본 복사·열람·접두어 삭제) | **미검증** |
| Compose 전체 스택 기동(`compose.single` + `compose.local-db`) 안에서의 업로드·추출 | **미검증**. `files` 볼륨은 이미지 단위 쓰기·읽기 전용 확인과 `docker compose config`까지만 했다 |

## 시험

| 파일 | 수 | 내용 |
|---|---|---|
| `test/db/pdf-tables.test.cjs` | 11 | 세 표의 제약·연쇄 삭제 |
| `test/file-storage/s3-file-storage.test.cjs` | 9 | S3 드라이버의 메서드별 S3 호출·오류 분류·접두어 삭제·키 검사·설정 거부(가짜 클라이언트) |
| `test/materials/pdf-materials-api.test.cjs` | 12 | 업로드·목록·상세·원본 열람·삭제, 동의·상한·소유, 시한 판정, 로그 |
| `test/materials/pdf-extraction-receiver.test.cjs` | 13 | 수신 판정 5종, 저장 실패 되돌림, 글 합계 상한 |
| `test/publications/publish-pdf.test.cjs` | 15 | 발행의 PDF 부분: 순서·사본, 추출 미완 400, 복사·트랜잭션 실패 정리, 발행 중 원본 변경, 동의 순서, 전체 글 상한 |
| `test/publications/recipient-pdf.test.cjs` | 8 | 받은 사람·작성자 사본 열람, 판정·헤더·로그, 발행본 삭제 뒤 404 |

실행(테스트 DB 필요, README 「DB 테스트」):

```bash
npm test -- test/db/pdf-tables.test.cjs test/file-storage/s3-file-storage.test.cjs test/materials/pdf-materials-api.test.cjs test/materials/pdf-extraction-receiver.test.cjs test/publications/publish-pdf.test.cjs test/publications/recipient-pdf.test.cjs
```
