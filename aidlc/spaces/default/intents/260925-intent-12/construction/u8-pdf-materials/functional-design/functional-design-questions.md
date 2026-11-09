# U8 PDF 자료 — 기능 설계 질문

작성일: 2026-11-06. Unit: `u8-pdf-materials`(#420). 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md), [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md), [사용자 스토리](../../../inception/user-stories/stories.md), [재승인 요구사항](../../../inception/requirements-analysis/requirements.md), [컴포넌트 목록](../../../inception/domain-design/components.md), [계약 요약](../../../inception/contract-design/contract-summary.md). 2026-11-06 담당자가 엔진 밖에서 쓴 기능 설계 초안(공유 노트 `u8-pdf-functional-design-draft-2026-11-06.md`)의 「승인된 값 / 제안 구분표」와 「실제로 결정이 필요한 질문」을 바탕으로, 승인 문서가 정하지 않아 담당이 정해야 하는 것만 묻는다.

승인된 계약·요구사항이 이미 정한 것(C-04 동의, C-05 키 배치, C-06·C-07 표와 삭제 부모, C-16 큐·메시지·수신 판정 5종, C-17 발행 순서, C-10 받은 사람 판정, ADR-003 S3·presigned URL 없음, FR3.3·FR3.4 OCR 없음·읽을 수 없는 쪽)은 다시 묻지 않고 그대로 쓴다.

## Q1. [개발 담당(U8)] PDF 업로드 상한 값

재승인 요구사항 FR3.1은 "크기·쪽 수 등 상한 값은 개발 담당 결정"으로 두었다. 이 값은 업로드 거부(AC3.1.2), worker의 쪽 수 판정, 받은 사람 열람 방식(파일을 메모리에 통째로 받음)의 부담을 함께 정한다.

A. 파일 20 MB, 50쪽, 회원당 20벌, 제목 1~100자 (초안 제안)
B. 더 작게: 파일 10 MB, 30쪽, 회원당 10벌, 제목 1~100자
C. 더 크게: 파일 50 MB, 100쪽, 회원당 30벌, 제목 1~100자 (Q7의 전체 글 상한과 AI 입력 한도에 닿기 쉬움)
X. Other (please specify)

[Answer]: A

## Q2. [개발 담당(U8)] 쪽별 글 추출의 처리 시한

계약 C-16은 추출 시한에 C-02 `readStatus` 규칙(상태를 읽을 때 시한이 지난 PENDING은 FAILED로 확정)을 적용하되 값은 "각 담당 기능 설계에서 정한다"고 했다. 시한이 지나면 작성자에게 "다시 올려 주세요"를 안내한다.

A. 10분 (U3 색인 시한과 같음, 초안 제안)
B. 30분
C. 60분 (10월 저장소 분석 시한과 같음)
X. Other (please specify)

[Answer]: A

## Q3. [개발 담당(U8)] 받은 사람이 PDF 원본을 여는 방식

계약 C-10·C-11은 비밀번호 링크의 grant를 `X-Link-Grant` 머리글과 `sessionStorage`로만 다루고 URL에 싣지 않는다. PDF 원본(`application/pdf` 스트림)을 브라우저로 보려면(AC3.2.1) 머리글을 붙일 수 없는 `<a target=_blank>` 대신 다른 방법이 필요하다.

A. web이 `fetch` + `X-Link-Grant`로 받아 Blob URL로 열기: 화면 안 `<iframe src=blob#page=n>`, [새 탭에서 열기] 단추, [원본 n쪽 열기]는 `#page=n` (초안 추천; 경로 1개, C-10 판정 그대로, grant가 URL·접근 로그에 남지 않음; 큰 파일은 받는 동안 진행 표시 필요)
B. 짧은 일회성 열람 토큰을 `POST .../pdf-view`로 발급받아 `GET .../pdf?view=토큰`으로 새 탭에서 열기 (링크 그대로 열려 단순하지만 경로 2개·새 토큰 종류·수명·1회성 보장이 더 필요하고, 토큰이 URL·접근 로그·브라우저 이력에 남으며, 중지·만료를 즉시 막으려면 토큰 검증 때 C-10을 다시 불러야 함)
X. Other (please specify)

[Answer]: A

## Q4. [개발 담당(U8)] 추출이 끝나지 않은 PDF를 발행에 넣었을 때의 거부 응답

계약 C-17 전제는 "고른 PDF는 모두 추출 DONE, 아니면 발행 전 거부하고 이유 안내"다. 응답 모양은 U8 안 세부다. U4 발행 API(`POST /v1/publications`)는 "새 오류 코드를 만들지 않는다"는 규칙으로 `400 VALIDATION_FAILED`의 `details.violations`를 쓰고 있다.

A. `400 VALIDATION_FAILED`, `details.violations = [{ field: 'items[i].sourceId', reason: 'extractionIncomplete' }]` (U4 규칙 유지, 초안 제안; 화면은 그 PDF를 고를 수 없게 표시하고 "글 추출이 끝나지 않았습니다 / 실패했습니다"를 보임)
B. `409` 새 코드(예: `PDF_EXTRACTION_INCOMPLETE`) + `details.pdfMaterialIds` (여러 PDF를 한 번에 알리기 쉽지만 공통 `ErrorDetails` 확장이 필요해 팀장 확인이 따름)
X. Other (please specify)

[Answer]: A

## Q5. [개발 담당(U8)] 추출 실패의 종류와 결과 메시지의 사유 코드

계약 C-16의 `PdfExtractionResult`는 `outcome: SUCCEEDED | FAILED`만 정했고 세부는 "U8 착수 때 10월 결과 수신 규칙(messageId·receipt)에 맞춰 더하는 변경으로 더한다"고 했다. 암호화 PDF·파싱 실패·쪽 수 초과를 어떻게 알릴지에 따라 작성자 화면 안내(NFR7)가 달라진다.

A. 셋 모두 FAILED로 하고 사유 코드(`ENCRYPTED | UNREADABLE_FILE | PAGE_LIMIT_EXCEEDED`)를 결과 메시지와 `pdf_material.extraction_failure_code`(NULL 허용)에 남겨 화면 안내를 구분 ("비밀번호가 걸린 PDF는 풀어서 올려 주세요" 등). 봉투에 `messageId`·`schemaVersion`을 더하고 수신 확인은 `{ messageId, pdfMaterialId, disposition, code }` (C-16 더하는 변경, 초안 제안)
B. 사유 코드 없이 FAILED만. 화면은 "글을 뽑지 못했습니다. 다시 올려 주세요" 하나 (payload는 C-16 그대로, 봉투 `messageId`·`schemaVersion`만 더함; 가장 단순하지만 암호화 PDF를 올린 사람이 원인을 모름)
X. Other (please specify)

[Answer]: A

## Q6. [개발 담당(U8)] worker가 로컬·시험 환경에서 PDF 원본을 읽는 방법

ADR-003은 배포는 S3, 로컬·시험은 로컬 파일이며 "팀원은 S3 없이 개발"한다고 정했다. 배포에서 worker는 S3 GetObject(역할)로 읽는다. 로컬에서 api가 `FILE_STORAGE_LOCAL_ROOT`에 쓴 파일을 worker(다른 프로세스·컨테이너)가 어떻게 읽을지는 정해지지 않았다.

A. api의 로컬 저장 폴더를 같은 볼륨으로 worker에 마운트하고 `PDF_FILE_ROOT`로 읽기 (초안 제안; 코드가 가장 적고 `storageKey` 검사 규칙은 S3와 같음; 개발용 compose 볼륨 설정이 필요)
B. worker가 api의 내부 HTTP 경로로 파일을 받기 (환경 사이 경로가 같아지지만 worker→api 내부 인증 경로를 새로 만들어야 하고, 10월에는 api→worker 방향 HTTP 호출이 없어 공수가 늘어남)
X. Other (please specify)

[Answer]: A

## Q7. [팀장] PDF 쪽 글을 발행본 전체 글 상한에 넣을지

계약 C-07은 PDF 쪽 글(`pages[n]`)을 조각 대상으로 두므로 PDF 글이 임베딩·요약·질의응답의 AI 입력에 들어간다. U4 발행 검증은 발행본 전체 글에 60,000자 임시 상한(`SnapshotTextTotal`, OQ-U4-4)을 두고 있고, 50쪽 PDF 하나가 이 값을 넘기 쉽다. 팀장 결정이 필요한 항목이라, 담당은 팀장 확인 전까지 쓸 임시안을 고르거나 "팀장 확인 뒤 정한다"로 답할 수 있다.

A. 합산에서 빼고 Q1의 쪽 수·파일 크기 상한으로만 억제 (가장 단순, U4 발행 검증 변경 없음; AI 입력 한도 초과는 U2 게이트의 `AiInputTooLarge`로 드러나 그 기능만 실패함)
B. 합산에 넣고 상한을 올림 (값은 U2·U5의 AI 입력 한도 확인 뒤 정함; U4 발행 검증 변경과 U5 영향이 따르며, 발행 전에 초과를 막음)
C. 현행 60,000자에 그대로 넣음 (변경 없음, 대신 쪽 수가 많은 PDF 발행이 자주 거부됨)
X. Other (please specify)

[Answer]: X. 팀장 확인 뒤 정합니다. PDF 쪽 글을 발행본 전체 60,000자 상한에 포함할지와 상한값은 OQ-U4-4 미결로 남겨 주세요. U2·U5의 실제 입력 한도와 대표 PDF의 추출 글자 수를 확인해 팀장에게 선택지별 영향을 전달하겠습니다. 결정 전에는 현재 U4 발행 기준을 유지하고, 이 결정과 독립적인 U8 설계는 계속 진행해 주세요.

## Consolidated Summary Confirmation

- Q1 업로드 상한: 파일 20 MB, 50쪽, 회원당 20벌, 제목 1~100자.
- Q2 추출 처리 시한: 10분. 시한이 지난 PENDING은 읽을 때 FAILED로 확정하고 "다시 올려 주세요"를 안내한다.
- Q3 받은 사람 PDF 열람: 경로는 기존 계약(C-12)대로 공유 링크 토큰을 경로에 쓰는 `GET /v1/public/links/{token}/items/{publishedItemId}/pdf` 하나이고, 판정은 C-10 `resolveForRecipient`를 그대로 쓴다. 비밀번호 열람 권한인 grant는 `X-Link-Grant` 헤더로만 보내고 URL에는 넣지 않는다. web은 이 경로를 fetch로 불러 권한 확인을 통과한 뒤 받은 PDF를 Blob URL로 만들고, 화면 안 iframe(`#page=n`)과 [새 탭에서 열기] 모두 그 Blob URL을 쓴다.
- Q4 DONE이 아닌 PDF의 발행 거부: `400 VALIDATION_FAILED`, `details.violations[].reason = extractionIncomplete`. 새 오류 코드는 만들지 않는다.
- Q5 추출 실패: 암호화·파싱 실패·쪽 수 초과를 FAILED로 하고 사유 코드(`ENCRYPTED | UNREADABLE_FILE | PAGE_LIMIT_EXCEEDED`)를 결과 메시지와 `pdf_material`에 남긴다. 봉투에 `messageId`·`schemaVersion`을 더하고 수신 확인은 `{ messageId, pdfMaterialId, disposition, code }`다(C-16 더하는 변경).
- Q6 worker 로컬 읽기: api 로컬 저장 폴더를 같은 볼륨으로 마운트해 `PDF_FILE_ROOT`로 읽는다. 배포는 S3 GetObject.
- Q7 전체 글 상한: 팀장 확인 뒤 정한다. PDF 쪽 글을 60,000자 상한에 넣을지와 값은 OQ-U4-4 미결로 남기고, 결정 전에는 현재 U4 발행 기준을 바꾸지 않는다. 담당이 U2·U5 입력 한도와 대표 PDF 글자 수를 확인해 팀장에게 선택지별 영향을 전달한다.
- 승인된 계약·요구사항이 정한 것(C-04·C-05·C-06·C-07·C-10·C-16·C-17, ADR-003, FR3.3·FR3.4)은 그대로 쓴다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct

## Requested Changes Feedback

1차 확인(2026-11-06)에서 Request changes를 고른 뒤 받은 피드백. 적용: Q3 요약 문구를 아래 내용으로 고쳤고 Q1~Q7의 선택은 그대로다.

[Answer]: Q1~Q7의 선택은 유지합니다. Q3 문구만 명확히 해주세요. 공유 링크 토큰은 기존 계약대로 /v1/public/links/{token}/items/{publishedItemId}/pdf의 경로에 사용합니다. 비밀번호 열람 권한인 grant는 X-Link-Grant 헤더로만 전송하고 URL에는 넣지 않습니다. iframe과 새 탭은 권한 확인 후 받은 PDF의 Blob URL을 사용합니다.
