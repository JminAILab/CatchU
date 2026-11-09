# U8 PDF 자료 — 화면 컴포넌트

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [기능 명세](functional-spec.md) W1·W4, [규칙](rules.md) BR1.5·BR2.3·BR6.3·BR6.4, [계약 요약](../../../inception/contract-design/contract-summary.md) C-11(붙는 자리·근거 강조), [사용자 스토리](../../../inception/user-stories/stories.md) US3.1·US3.2. 구조와 상태만 정하고 스타일·라이브러리는 코드 생성에서 정한다.

## 컴포넌트 계층

```
자료 화면(U4 features/materials)
+-- PdfMaterialsTab (U8)                      # PDF 탭
    +-- SensitiveInfoNotice                  # 텍스트 자료와 같은 문구(BR1.5)
    +-- AiNoticeLine (U2 공용)               # 외부 AI 한 줄 고지(C-04)
    +-- PdfUploadForm                        # 파일 1개·제목 선택, 20 MB 전 검사
    +-- PdfMaterialList                      # 목록(상태·사유·쪽 수)
        +-- PdfMaterialRow
            +-- ExtractionStateBadge         # 글 추출 중 / 완료 n쪽 / 실패(사유)
            +-- PdfViewerLauncher            # [원본 보기] (BR6.3 도우미, 회원 토큰)
            +-- DeleteButton                 # 확인 뒤 DELETE

받은 사람 화면 /s/[token] 1번 자리 (U4)
+-- PublishedItemView (U4)
    +-- PublishedPdfItem (U8)                # item_kind PDF_MATERIAL
        +-- PdfPageList                      # 쪽마다 n쪽 / 읽을 수 없음 / 글(텍스트 노드)
        |   +-- PdfPageText                  # <mark> 강조 범위 수신(showEvidence)
        |   +-- OpenOriginalPageButton       # [원본 n쪽 열기] → PdfViewerLauncher(#page=n)
        +-- PdfViewerLauncher                # fetch + X-Link-Grant → Blob URL → iframe / 새 탭

작성자 발행본 화면 (U4)
+-- PublishedPdfItem (U8, 작성자 모드)      # 같은 컴포넌트, 경로만 /v1/publications/{id}/items/{itemId}/pdf
```

## 컴포넌트별 props·state

| 컴포넌트 | props | state | 비고 |
|---|---|---|---|
| PdfUploadForm | `onUploaded(item)` | `file`, `title`, `clientError`, `submitting` | 제출 전 검사: 확장자·선언 종류 PDF, 20 MB, 제목 100자. 403 `AI_CONSENT_REQUIRED`면 U2 동의 창을 열고 동의 뒤 같은 요청 재전송. 400은 `details.violations`의 첫 항목으로 안내 |
| PdfMaterialList | `items`, `onDeleted(id)` | `cursor`, `loading` | 텍스트 자료 목록과 같은 쪽 넘기기. 새로고침 때 `extractionState` 갱신(폴링 없음, 개발 담당 결정: 새로고침) |
| ExtractionStateBadge | `state`, `failureCode`, `pageCount` | 없음 | PENDING "글 추출 중" / DONE "n쪽" / FAILED는 BR2.3 문구 |
| PdfViewerLauncher | `fetchPdf(): Promise<Response>`, `initialPage?`, `mode: inline \| newTab` | `blobUrl`, `loading`, `error` | 공용 도우미. 받은 사람·작성자·원본 모두 같은 컴포넌트에 `fetchPdf`만 다르게 넘긴다(받은 사람: C-11 `getGrant()`를 헤더에; 작성자: 회원 토큰). 새 탭은 클릭 즉시 빈 창을 열고 Blob URL을 넣는다(팝업 차단 회피). 언마운트 때 `revokeObjectURL` |
| PublishedPdfItem | `item: { publishedItemId, title, snapshot.pageCount, pdfPages }`, `RecipientSlotProps`(token·getGrant·onAccessLost) 또는 작성자 모드 `{ publicationId }`, `highlight?: { pdfPage, charStart, charEnd }` | `activePage` | 401·404는 `onAccessLost(code)`로 넘긴다(C-11 rule). 작성자 모드는 `resolveForOwner` 경로 |
| PdfPageList / PdfPageText | `pages: [{ pageNumber, text, readable }]`, `highlight?` | 없음 | `readable=false` → "읽을 수 없음" 표지(AC3.2.3). 글은 텍스트 노드로만(BR3.5). `highlight.pdfPage === pageNumber`면 `[charStart, charEnd)`를 `<mark>` |

## 상호작용 흐름

1. **업로드**: 파일 고름 → 제출 전 검사 → `POST /v1/pdf-materials` → 201이면 목록 맨 위에 "글 추출 중"으로 추가 → 사용자가 새로고침하면 상태 갱신. 403이면 동의 창 → 동의 → 재전송.
2. **상태 확인**: 목록·상세에서 `extractionState`·`failureCode`를 읽어 배지로 보인다. FAILED면 사유별 안내와 "다시 올리기" 유도(재발송 단추 없음).
3. **원본 보기(작성자)**: [원본 보기] → `PdfViewerLauncher.fetchPdf = GET /v1/pdf-materials/{id}/file` → Blob URL → iframe 또는 새 탭.
4. **받은 사람 열람**: PDF 항목의 쪽 목록 표시 → [PDF 보기]/[원본 n쪽 열기] → `fetchPdf = GET /v1/public/links/{token}/items/{publishedItemId}/pdf` + `X-Link-Grant` → Blob URL(`#page=n`) → iframe/새 탭. 401·404 → `onAccessLost`.
5. **근거 강조**: U5 패널이 `showEvidence(location)`를 부르면 U4 화면이 `publishedItemId`·`pdfPage`로 PublishedPdfItem을 찾아 `highlight`를 넘기고 그 쪽으로 스크롤한다(`recipient-slots` `fieldText`에 `pages[n]` → `pdfPages[n-1].text` 추가).

## 폼 검증 규칙(화면 쪽, 서버 규칙 BR1.1·BR1.2와 같음)

| 입력 | 화면 검사 | 서버 응답 처리 |
|---|---|---|
| 파일 | 1개, 종류 `application/pdf` 또는 `.pdf`, 20 MB 이하 | 400 `VALIDATION_FAILED` → 첫 violation으로 안내 |
| 제목 | 비면 파일 이름(확장자 제외), 1~100자 | 같음 |
| 벌 수 | 목록이 20이면 업로드 단추 비활성·"20벌까지" 안내 | 400이면 같은 안내 |
| 동의 | 없음(서버 403으로 판단) | 403 → U2 동의 창 → 재전송 |

## API 연결 지점

| 화면 | 경로 | 메서드 | 응답 처리 |
|---|---|---|---|
| 업로드 | `/v1/pdf-materials` | POST multipart | 201 / 400 / 403 / 500 |
| 목록 | `/v1/pdf-materials?cursor&limit` | GET | 200 `{ items, page }` |
| 상세 | `/v1/pdf-materials/{id}` | GET | 200 + `pages[{pageNumber, readable}]` / 404 |
| 작성자 원본 | `/v1/pdf-materials/{id}/file` | GET | 200 `application/pdf` / 404 / 500 |
| 삭제 | `/v1/pdf-materials/{id}` | DELETE | 204 / 404 / 500 |
| 받은 사람 사본 | `/v1/public/links/{token}/items/{publishedItemId}/pdf` | GET + `X-Link-Grant` | 200 / 401 → onAccessLost / 404 → onAccessLost / 500 |
| 작성자 사본 | `/v1/publications/{id}/items/{itemId}/pdf` | GET | 200 / 404 / 500 |

한계: 열람은 파일을 메모리에 통째로 받는다(20 MB 상한으로 억제). iOS Safari는 iframe PDF가 첫 쪽만 보일 수 있어 [새 탭에서 열기]를 대안으로 둔다. 쪽 이동 `#page=n`은 내장 뷰어가 지원하는 브라우저에서만 동작하고, 아니면 1쪽부터 보인다.
