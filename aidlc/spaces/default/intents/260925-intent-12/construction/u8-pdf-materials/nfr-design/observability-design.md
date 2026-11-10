# U8 PDF 자료 — 관측 설계

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [관측 요구사항](../nfr-requirements/observability-requirements.md), [성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [기술 선택](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md), [계약 요약](../../../inception/contract-design/contract-summary.md) C-16 receipt, [NFR 설계 질문·답변](nfr-design-questions.md).

지표·대시보드·경보·분산 추적·SLI/SLO는 두지 않는다(NFR6.5). 관측은 기존 서비스 로그 형식, 10월 수신 확인 기록, 화면 상태 표시, FR19 확인 표로 한다.

## 1. 로그 사건과 필드

기존 api·worker 로그 형식(구조화 필드)을 그대로 쓴다. 새 로그 라이브러리·수집기는 없다.

| 사건(이름) | 어디서 | 필드 | 요구사항 |
|---|---|---|---|
| `PDF_UPLOAD_STORE_FAILED` | api 업로드 | pdfMaterialId, 단계(put / db / compensate-delete), 오류 종류 | NFR6.1 |
| `PDF_EXTRACT_ENQUEUE_FAILED` | api 업로드 커밋 뒤 | pdfMaterialId, 오류 종류 | NFR6.1 |
| `PDF_EXTRACTION_RECEIVED` | api 수신 | pdfMaterialId, messageId, disposition, code, pageCount(SUCCEEDED) | NFR6.1·6.3 |
| `PDF_EXTRACT_CHILD_TERMINATED` | worker 부모 | pdfMaterialId, 이유(timeout / memory / signal), 경과 시간 | NFR6.1 |
| `PDF_EXTRACT_KEY_REJECTED` | worker | messageId, 이유(shape / id-mismatch) | NFR6.1 |
| `PDF_COPY_FAILED` | api 발행 2단계 | publicationId, 항목 position, 오류 종류 | NFR6.1 |
| `PREFIX_CLEANUP_FAILED` | api 발행 보상: C-17의 3·5단계에서 시도한 접두어 정리(`deletePrefix`)가 실패했을 때 6단계에서 기록([신뢰성 설계 §4](reliability-design.md)와 같은 표현) | publicationId, 정리를 부른 단계(3 또는 5), 오류 종류 | NFR6.1 |
| `PDF_DELETE_STORAGE_FAILED` | api 자료 삭제 | pdfMaterialId, 오류 종류 | NFR6.1 |
| `PDF_VIEW_FAILED` | api 열람 | publicationId 또는 pdfMaterialId, publishedItemId, 상태 코드(401·404·500, 전송 도중 중단은 `aborted`), 이유(file-missing / storage), 단계(before-headers / streaming) | NFR6.1 |

넣지 않는 것: 링크 토큰, grant, 파일 키·접두어 값, 뽑은 글, 제목, 요청 본문. 쪽 글은 쪽 번호와 길이만(NFR6.2). 상관 식별자는 새로 만들지 않고 기존 ID(`pdfMaterialId`, `messageId`, `publicationId`, `publishedItemId`)를 쓴다.

## 2. worker 수신 확인 기록

10월 `receipts.py`의 수신 확인 관찰을 재사용한다. `PdfExtractionResult`마다 수신 확인(ACCEPTED/DUPLICATE/REJECTED + 코드)을 기록하고, 확인이 오지 않으면 미관측으로 기록한다. 거부된 결과는 다시 보내지 않는다(NFR6.3).

## 3. 화면 상태 표시

| 화면 | 표시 | 요구사항 |
|---|---|---|
| 작성자 PDF 목록·상세 | 글 추출 중 / 완료 n쪽 / 실패(암호화 PDF·쪽 수 초과·뽑지 못함/시한) 배지와 사유별 안내. 새로고침 때 갱신 | NFR7.1 |
| 발행 화면 | 추출 중·실패 PDF는 고를 수 없게 표시하고 이유 문구 | NFR7.3 |
| 받은 사람·작성자 발행본 | 쪽마다 번호, 읽을 수 없는 쪽 표지, 근거 강조와 [원본 n쪽 열기] | NFR7.2 |
| 접근 끊김 | 401·404 → `onAccessLost`로 다른 패널과 같은 화면 전환 | NFR7.3 |
| 열람 실패(접근 상실 아님) | 본문 수신 실패·네트워크 오류 → "PDF를 불러오지 못했습니다. 다시 시도해 주세요"(grant 유지). 새 탭 열기 중이었으면 빈 탭을 닫음. 팝업 차단 → 같은 요청의 Blob을 화면 안 뷰어에 표시하고 "브라우저가 새 탭을 막았습니다. 화면 안에서 열었습니다…" 안내([보안 설계 §2](security-design.md) 규칙) | NFR7.3 |

## 4. 검증 기록(FR19 확인 표)

U8 행: ① 업로드 → ② 추출 완료(쪽 수·읽을 수 없는 쪽) → ③ PDF 포함 발행 → ④ 받은 사람 열람·쪽 표시·근거 강조 → ⑤ 발행본 삭제 뒤 파일·쪽 사본 없음 → ⑥ 탈퇴 뒤 회원 접두어 없음. 각 행에 날짜·대상 버전·결과(실패·미실행 포함). S3 실제 확인은 버킷 준비 전이면 "미실행". 11/13에 어디서 보일지는 OQ-U8-1(팀장)(NFR6.4).

## 5. 두지 않는 것

지표 수집, 대시보드, 경보 규칙, 분산 추적, SLI/SLO, 로그 수집기 변경(NFR6.5, C06).
