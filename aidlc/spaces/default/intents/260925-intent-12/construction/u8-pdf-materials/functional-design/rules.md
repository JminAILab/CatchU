# U8 PDF 자료 — 업무 규칙

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [재승인 요구사항](../../../inception/requirements-analysis/requirements.md) FR3·FR4.2·FR4.7·FR5.2·FR14.9·FR20.1·NFR7, [사용자 스토리](../../../inception/user-stories/stories.md) US3.1·US3.2·US4.1·US5.2, [Unit 정의](../../../inception/units-generation/unit-of-work.md) U8, [컴포넌트 목록](../../../inception/domain-design/components.md), [계약 요약](../../../inception/contract-design/contract-summary.md) C-04·C-05·C-06·C-07·C-10·C-16·C-17, [질문·답변](functional-design-questions.md) Q1~Q7. 아래 YAML이 정본이다. `source`의 Qn은 이 Unit의 질문 번호, Cn은 계약 번호다.

```yaml
rules:
  # BR1 — 업로드와 원본 관리 (W1)
  - id: BR1.1
    statement: PDF 파일만 받는다. 선언된 종류가 application/pdf이고 파일 머리가 %PDF-로 시작해야 한다. 요청에는 파일 하나와 정의된 필드만 허용한다.
    category: validation
    applies_to: PDF 업로드
    trigger: 업로드 요청
    logic: IF 선언 종류 또는 머리 바이트가 PDF가 아니거나 파일이 둘 이상이거나 정의 밖 필드가 있으면 THEN 저장하지 않고 400 VALIDATION_FAILED로 이유를 알린다
    violation: 400 VALIDATION_FAILED, 파일은 저장되지 않음
    source: FR3.1, AC3.1.2
  - id: BR1.2
    statement: 상한은 파일 20 MB, 쪽 50, 회원당 20벌, 제목 1~100자다. 크기·벌 수·제목은 api가 업로드 때 판정하고, 쪽 수는 worker가 추출 때 판정한다(api는 PDF를 파싱하지 않는다).
    category: constraint
    applies_to: PDF 업로드, 추출
    trigger: 업로드 요청, worker 추출
    logic: IF 파일이 20 MB를 넘거나 회원의 PDF가 이미 20벌이거나 제목이 1~100자 밖이면 THEN 받지 않고 어느 상한인지 알린다. IF 쪽 수가 50을 넘으면 THEN worker가 FAILED(PAGE_LIMIT_EXCEEDED)로 보고한다
    violation: 400 VALIDATION_FAILED(크기·벌 수·제목) 또는 추출 FAILED(쪽 수)
    source: FR3.1 개발 담당 결정, Q1, AC3.1.2
  - id: BR1.3
    statement: PDF 업로드는 외부 AI 처리의 첫 이용 동의를 먼저 확인한다. 동의가 없으면 파일을 받지 않는다.
    category: authorization
    applies_to: PDF 업로드
    trigger: 업로드 요청, 회원 인증 직후
    logic: IF AiConsentGate.require가 실패하면 THEN 본문을 읽지 않고 403 AI_CONSENT_REQUIRED를 돌려주고 web은 U2 공용 동의 창을 연 뒤 같은 요청을 다시 보낸다
    violation: 403 AI_CONSENT_REQUIRED
    source: FR20.1, C-04 consumers, AC20.1.1(PDF 부분)
  - id: BR1.4
    statement: PDF 업로드와 글 추출은 계정당 하루 실행 횟수를 쓰지 않는다. 추출은 외부 AI 호출이 아니다.
    category: policy
    applies_to: PDF 업로드, 추출
    trigger: 업로드·추출
    logic: IF 업로드 또는 추출이 접수되면 THEN DailyRunLimit.consume을 부르지 않는다
    violation: 해당 없음(설계 규칙)
    source: FR6.6(합산 대상에 PDF 처리 없음), C-03
  - id: BR1.5
    statement: 자료를 올리는 화면에 "주민등록번호 같은 민감한 정보는 지우고 올려 주세요"를 보이고, 서비스는 자료 안의 개인정보를 찾아 가리지 않는다. 텍스트 자료와 같은 문구를 쓴다.
    category: policy
    applies_to: PDF 업로드 화면
    trigger: 화면 표시
    logic: IF 업로드 화면이 열리면 THEN 안내 문구를 보인다. 서버는 내용을 검사·가공하지 않는다
    violation: 해당 없음(화면 규칙)
    source: FR3.6, FR20.3, AC3.1.4
  - id: BR1.6
    statement: 업로드 저장 순서는 파일 저장 → DB 행(PENDING, 시한 = 커밋 시각 + 10분) → 커밋 → 추출 요청 발송이다. 파일 저장 뒤 DB 쓰기가 실패하면 그 파일을 한 번 지우고 500으로 끝낸다.
    category: constraint
    applies_to: PDF 업로드
    trigger: 검증 통과 뒤
    logic: IF FileStorage.put이 StorageUnavailable이면 THEN 500 INTERNAL_ERROR. IF put 뒤 DB 쓰기가 실패하면 THEN FileStorage.delete(materialKey)를 한 번 시도하고 500. IF 그 삭제도 실패하면 THEN 로그만 남긴다(남은 파일은 탈퇴 때 memberPrefix로 지워진다)
    violation: 500 INTERNAL_ERROR, 행 없음
    source: C-05, C-17 6단계 원칙, 에러 대응 최소선 1·3
  - id: BR1.7
    statement: PDF 원본의 수정·파일 교체 API는 없다. 삭제는 본인 확인 뒤 원본 파일(materialKey)만 지우고 성공하면 행을 지운다(쪽별 글은 연쇄 삭제). 발행 사본(pdf_copy_key)은 건드리지 않는다.
    category: constraint
    applies_to: PDF 자료 삭제
    trigger: 삭제 요청
    logic: IF FileStorage.delete(materialKey)가 성공(없는 키 포함)하면 THEN pdf_material 행을 지운다. IF 삭제가 StorageUnavailable이면 THEN 500을 돌려주고 DB는 그대로 둔다
    violation: 500 INTERNAL_ERROR, 행 유지
    source: FR3.2, FR14.9, 요구사항 제외 표(FR3.5 파일 교체), ADR-003, C-05 deletion
  - id: BR1.8
    statement: 남의 PDF, 없는 PDF, UUID 모양이 아닌 ID는 구분 없이 404 RESOURCE_UNAVAILABLE이다.
    category: authorization
    applies_to: PDF 상세·원본 열람·삭제
    trigger: ID가 든 요청
    logic: IF 행이 없거나 member_id가 요청 회원과 다르거나 ID가 UUID가 아니면 THEN 404 RESOURCE_UNAVAILABLE
    violation: 404 RESOURCE_UNAVAILABLE
    source: NFR1(회원 자료 격리), 10월 공통 오류 규칙

  # BR2 — 추출 상태와 시한 (W2)
  - id: BR2.1
    statement: 추출 상태는 PENDING에서 DONE 또는 FAILED로 한 번만 바뀐다. DONE·FAILED에서 다른 상태로 돌아가지 않는다.
    category: constraint
    applies_to: PdfMaterial.extractionState
    trigger: 결과 수신, 시한 판정
    logic: IF 상태가 PENDING이 아니면 THEN 상태를 바꾸는 쓰기를 하지 않는다(조건부 UPDATE WHERE extraction_state = 'PENDING')
    violation: 쓰기 0건, 결과는 DUPLICATE 또는 STALE_ATTEMPT 판정
    source: C-02 readStatus, C-16 receipt
  - id: BR2.2
    statement: 추출 처리 시한은 10분이다. 상태를 읽는 자리(목록·상세·발행 사전 확인·결과 수신)에서 PENDING이고 now가 시한을 지났으면 FAILED(DEADLINE_EXCEEDED)로 저장하고 FAILED로 보인다.
    category: calculation
    applies_to: PdfMaterial.extractionState, extractionDeadlineAt
    trigger: 상태 읽기
    logic: IF state = PENDING AND now >= extractionDeadlineAt THEN UPDATE state = FAILED, failureCode = DEADLINE_EXCEEDED WHERE state = PENDING, 그리고 FAILED로 돌려준다
    violation: 해당 없음(판정 규칙)
    source: C-02, C-16 deadline, Q2, FR6.8 원칙
  - id: BR2.3
    statement: FAILED의 재시도는 작성자가 다시 올리는 것뿐이다. 재발송 API·자동 재시도는 없다. 화면은 사유 코드에 맞는 안내를 보인다.
    category: policy
    applies_to: 추출 실패
    trigger: FAILED 표시
    logic: IF failureCode = ENCRYPTED THEN "비밀번호가 걸린 PDF는 풀어서 올려 주세요". IF PAGE_LIMIT_EXCEEDED THEN "50쪽까지 올릴 수 있습니다". IF UNREADABLE_FILE 또는 DEADLINE_EXCEEDED THEN "글을 뽑지 못했습니다. 다시 올려 주세요"
    violation: 해당 없음(화면 규칙)
    source: FR3.3, NFR7, 에러 대응 최소선 2, Q5
  - id: BR2.4
    statement: 추출 요청(PdfExtract)은 업로드 트랜잭션 커밋 뒤에 보낸다. 작업 ID는 pdfMaterialId, 시도 1회, 재시도 없음이다. 발송 실패·시간 초과는 로그만 남기고 201 응답을 바꾸지 않는다.
    category: policy
    applies_to: 추출 요청 발송
    trigger: 업로드 커밋 뒤
    logic: IF 큐 등록이 실패하면 THEN 로그를 남기고 응답은 그대로 둔다. 자료는 BR2.2의 시한으로 FAILED가 된다
    violation: 해당 없음(시한으로 확정)
    source: C-02 enqueueAfterCommit 원칙, C-16 PdfExtract, 에러 대응 최소선 3

  # BR3 — worker 추출과 결과 수신 (W2)
  - id: BR3.1
    statement: worker는 pypdf로 쪽마다 글을 뽑는다. 뽑은 글이 공백·제어 문자만이면 그 쪽은 readable=false·빈 글이고, 아니면 readable=true이며 글은 가공하지 않고 저장할 수 없는 NUL 문자만 뺀다. 이미지 글자 인식은 없다.
    category: calculation
    applies_to: 쪽별 글 추출
    trigger: PdfExtract 수신
    logic: FOR 각 쪽: text = extract_text(); IF text에서 공백·제어 문자를 뺀 것이 비면 THEN readable=false, text='' ELSE readable=true, text = NUL 제거한 원문
    violation: 해당 없음(판정 규칙)
    source: FR3.3, FR3.4, AC3.2.2, AC3.2.3, Q5
  - id: BR3.2
    statement: 암호화된 PDF, 파싱 실패, 쪽 수 0, 쪽 수 50 초과는 추출 실패이며 사유 코드 ENCRYPTED, UNREADABLE_FILE(파싱 실패·쪽 수 0), PAGE_LIMIT_EXCEEDED를 결과 메시지에 싣는다. 실패 결과에는 pages가 없다. 그래서 SUCCEEDED 결과의 pages는 항상 1~50개다.
    category: validation
    applies_to: 쪽별 글 추출
    trigger: PdfExtract 수신
    logic: IF reader.is_encrypted THEN FAILED ENCRYPTED. ELSE IF 파싱 예외 OR 쪽 수 = 0 THEN FAILED UNREADABLE_FILE. ELSE IF 쪽 수 > 50 THEN FAILED PAGE_LIMIT_EXCEEDED. ELSE SUCCEEDED + pages(1~50개)
    violation: FAILED 결과 메시지
    source: Q5, Q1, FR3.3, 검토 R-03(쪽 수 0)
  - id: BR3.3
    statement: 결과 수신은 판정과 저장을 한 트랜잭션으로 한다. 판정 순서는 봉투·모양 검사 → 자료 행 잠금 조회 → 이미 DONE → FAILED 또는 시한 지남 → 저장이며, 각 갈래의 수신 확인 코드는 C-16의 5종(SCHEMA_INVALID, CONTEXT_MISMATCH, ALREADY_RECEIVED, STALE_ATTEMPT, OK)이다.
    category: validation
    applies_to: PdfExtractionResult 수신
    trigger: worker-messages 큐의 PdfExtractionResult
    logic: >
      IF pdfMaterialId가 UUID가 아니거나 outcome이 밖 값이거나 SUCCEEDED인데 pages가 없거나 비었거나 pages가 50개를 넘거나(BR1.2 쪽 수 상한, 검토 R-02) FAILED인데 pages가 있거나 FAILED인데 failureCode가 없거나
      pageNumber가 1부터 연속하지 않거나 중복이거나 readable=false인데 text가 비지 않았거나 정의 밖 필드가 있으면 THEN REJECTED/SCHEMA_INVALID.
      (수신 쪽은 쪽 글 길이·메시지 크기 상한을 따로 두지 않는다. 글의 양은 쪽 수 50·파일 20 MB로만 억제하며, 쪽 글 총량 상한은 OQ-U4-4와 함께 정한다 — BR4.5)
      ELSE IF pdf_material 행이 없거나 memberId가 다르면 THEN REJECTED/CONTEXT_MISMATCH.
      ELSE IF state = DONE THEN DUPLICATE/ALREADY_RECEIVED.
      ELSE IF state = FAILED OR now >= deadline THEN (시한 지남이면 BR2.2로 FAILED 저장) REJECTED/STALE_ATTEMPT.
      ELSE 저장(BR3.4) THEN ACCEPTED/OK
    violation: 수신 확인에 거부 코드. 거부된 결과는 다시 보내지 않는다
    source: C-16 receipt, 10월 결과 수신 방식
  - id: BR3.4
    statement: 저장은 전부 아니면 전무다. SUCCEEDED면 쪽 행 전부 INSERT와 pageCount·DONE 갱신을, FAILED면 FAILED·사유 코드 갱신을 같은 트랜잭션에 넣고, ACCEPTED/OK는 커밋 뒤에만 돌려준다. 커밋 실패는 수신 확인 없이 작업 실패로 두어 자료는 시한으로 FAILED가 된다.
    category: constraint
    applies_to: PdfExtractionResult 저장
    trigger: BR3.3의 저장 갈래
    logic: IF 어느 쪽 행의 INSERT가 실패하면 THEN 트랜잭션을 되돌려 어떤 쪽도 남지 않고 상태는 PENDING 그대로다. IF 커밋이 실패하면 THEN 수신 확인을 쓰지 않고 작업을 실패로 끝낸다
    violation: 부분 저장 없음, 수신 확인 없음
    source: C-16, 에러 대응 최소선 1·4·5, FR14.10
  - id: BR3.5
    statement: 뽑은 글은 신뢰할 수 없는 입력이다. 로그·오류 응답·지시문에 싣지 않고, 화면에서는 글로만(마크업 해석 없이) 보인다. AI에 넘기는 것은 U2 게이트와 U5가 발행 사본에서 한다.
    category: policy
    applies_to: PdfPageText.text, PublishedPdfPage.text
    trigger: 저장·표시·로그
    logic: IF 글을 로그나 오류 본문에 넣으려 하면 THEN 넣지 않는다(쪽 번호·길이만). IF 화면에 보이면 THEN 텍스트 노드로만 그린다
    violation: 해당 없음(보안 규칙)
    source: FR3.3, AC3.2.5, FR6.4 숨긴 지시 방어, team.md Code Style
  - id: BR3.6
    statement: worker는 storageKey가 members/{uuid}/materials/{uuid}.pdf 모양이고 그 pdfMaterialId가 메시지의 것과 같을 때만 읽는다. 그렇지 않으면 결과를 보내지 않고 작업을 실패로 끝낸다.
    category: validation
    applies_to: PdfExtract 수신
    trigger: 메시지 수신
    logic: IF storageKey가 키 모양에 맞지 않거나 ID가 다르면 THEN 읽지 않고 JOB_FAILED 기록만
    violation: 작업 실패, 결과 없음(자료는 시한으로 FAILED)
    source: C-05 keys, 보안 점검(입력 검증), ADR-003 worker는 S3 읽기만
  - id: BR3.7
    statement: 추출 소비자는 저장소 분석 소비자와 독립이다. 같은 worker 프로세스 안에서 돌되 pdf-extraction-requests 큐를 소비하는 별도 Worker이고, 동시성 한도(기본 1)도 분석 소비자의 CATCHU_WORKER_CONCURRENCY와 별개로 둔다. 분석 작업(시한 60분)이 돌고 있어도 PDF 추출은 기다리지 않고 바로 시작한다. 추출 시한 10분은 큐 대기 시간을 포함하므로, worker가 꺼져 있거나 추출 작업이 10분 안에 끝나지 않으면 자료는 FAILED(DEADLINE_EXCEEDED)가 되고 작성자는 다시 올린다.
    category: constraint
    applies_to: worker 추출 소비자
    trigger: worker 기동, PdfExtract 수신
    logic: IF 분석 Worker가 작업을 처리 중이면 THEN 추출 Worker는 영향 없이 자기 큐의 다음 작업을 받는다(서로 다른 큐·다른 Worker 인스턴스). IF 추출 작업이 시한 안에 끝나지 않으면 THEN BR2.2의 시한 판정으로 FAILED
    violation: 해당 없음(구조 규칙); 시한 초과는 BR2.2
    source: 검토 R-01, Q2, C-16(새 큐), worker 소비자 구조(큐마다 Worker 하나), 에러 대응 최소선 3

  # BR4 — 발행 전제와 사본 (W3)
  - id: BR4.1
    statement: 추출이 DONE인 PDF만 발행에 고를 수 있다. PENDING·FAILED인 PDF가 들어 있으면 발행 전에 400 VALIDATION_FAILED, details.violations = [{ field: items[i].sourceId, reason: extractionIncomplete }]로 거부하고 파일 복사를 시작하지 않는다. 새 오류 코드는 만들지 않는다.
    category: validation
    applies_to: 발행 요청의 PDF 항목
    trigger: 발행 사전 확인(트랜잭션 밖, 복사 전)
    logic: IF 고른 PDF 가운데 readStatus(BR2.2)가 DONE이 아닌 것이 있으면 THEN 400 extractionIncomplete. IF 없는 PDF나 남의 PDF면 THEN U4의 기존 404 규칙
    violation: 400 VALIDATION_FAILED(extractionIncomplete), 복사·저장 없음
    source: C-17 preconditions, Q4, AC4.1.9(PDF 부분), NFR7
  - id: BR4.2
    statement: 발행 트랜잭션 안에서 고른 PDF를 pdf_material_id 오름차순으로 공유 잠금(FOR SHARE)하고 DONE을 다시 확인한다. 잠금 순서는 U4 BR5.1이 정한 순서(consume → Catch를 catch_id 오름차순 → 텍스트 자료를 text_material_id 오름차순) 뒤에 PDF를 더하는 것이며 앞 순서는 바꾸지 않는다. 발행 도중 삭제되거나 상태가 바뀐 PDF가 있으면 트랜잭션을 되돌린다.
    category: constraint
    applies_to: 발행 트랜잭션
    trigger: U4 BR5.1 순서의 텍스트 자료 잠금 다음
    logic: IF 재확인에서 행이 없거나 DONE이 아니면 THEN 되돌리고 BR4.1과 같은 응답(없음은 404)
    violation: 롤백, C-17 5단계 정리
    source: C-17 4단계, C-08 publish-sequence, U4 기능 설계 rules.md BR5.1(2026-11-06 대조 — Catch catch_id 오름차순, 텍스트 자료 text_material_id 오름차순, consume은 트랜잭션 시작 직후; 검토 R-05)
  - id: BR4.3
    statement: PDF 항목의 사본은 published_item 행(item_kind PDF_MATERIAL, snapshot { pageCount }, pdf_copy_key = publishedPdfKey)과 published_pdf_page 행(그 시점 pdf_page_text를 INSERT ... SELECT로 복사)이다. 읽을 수 없는 쪽도 readable=false로 함께 고정한다.
    category: calculation
    applies_to: 발행 트랜잭션의 PDF 항목
    trigger: published_item 쓰기
    logic: FOR 각 PDF 항목: INSERT published_item; INSERT published_pdf_page SELECT page_number, text, readable FROM pdf_page_text WHERE pdf_material_id = sourceId. pageCount = 복사한 행 수
    violation: 트랜잭션 실패 → 롤백
    source: FR3.2, FR4.7(PDF 쪽 위치), C-07 published_pdf_page, AC3.1.5, AC4.1.1(PDF 부분), AC3.2.4(readable 저장 책임)
  - id: BR4.4
    statement: 발행 뒤 원본 PDF를 지우거나 다시 올려도 발행본의 사본 파일과 쪽별 글은 바뀌지 않는다. 사본은 발행본 수명을 따른다.
    category: constraint
    applies_to: PublishedPdfPage, pdf_copy_key
    trigger: 원본 삭제·변경
    logic: IF 원본 pdf_material이 지워지면 THEN published_item.source_id는 외래 키가 아니므로 남고 사본 파일은 publicationPrefix에 그대로 있다
    violation: 해당 없음(설계 규칙)
    source: FR3.2, AC3.1.5, C-06 사본 칸 규칙
  - id: BR4.5
    statement: 발행본 전체 글 상한(U4의 60,000자 임시값)에 PDF 쪽 글을 넣을지와 값은 팀장 결정(OQ-U4-4)으로 남긴다. 결정 전에는 U4의 현재 발행 검증을 바꾸지 않고, 이 Unit은 쪽 수·파일 크기 상한(BR1.2)으로만 PDF 글의 양을 억제한다. 같은 이유로 쪽 글 총량 상한과 추출 결과 메시지의 크기 상한도 따로 두지 않으며(BR3.3), 팀장이 PDF 글을 전체 글 상한에 넣기로 하면 그 값이 쪽 글 총량의 상한이 되고 수신 검사(BR3.3)에 같은 상한을 더한다.
    category: policy
    applies_to: 발행 전체 글 검증
    trigger: 발행 요청
    logic: IF 팀장 결정 전이면 THEN U4의 전체 글 검증을 그대로 두고 PDF 쪽 글을 더하거나 빼는 변경을 하지 않는다. 결정이 나면 U4 발행 검증 변경으로 반영한다
    violation: 해당 없음(미결 보류 규칙)
    source: Q7, OQ-U4-4, C06(근거 없는 장치 금지)

  # BR5 — 발행 순서 (C-17, W3)
  - id: BR5.1
    statement: publicationId와 각 항목의 publishedItemId는 트랜잭션 전에 만든다. 파일 사본 키가 그 ID로 정해지기 때문이다.
    category: constraint
    applies_to: 발행 순서 1단계
    trigger: 발행 사전 확인 통과 뒤
    logic: IF PDF 항목이 하나라도 있으면 THEN 토큰 생성과 같은 자리에서 모든 ID를 먼저 만든다
    violation: 해당 없음(순서 규칙)
    source: C-17 1단계
  - id: BR5.2
    statement: 고른 PDF마다 position 순서로 FileStorage.copy(materialKey → publishedPdfKey)를 한다(2단계). 복사가 모두 끝난 뒤에만 트랜잭션을 시작한다.
    category: constraint
    applies_to: 발행 순서 2단계
    trigger: 1단계 뒤
    logic: FOR 각 PDF 항목 IN position 순: copy. IF 모두 성공하면 THEN 4단계(트랜잭션)
    violation: BR5.3
    source: C-17 2단계, AC4.1.1(PDF 부분)
  - id: BR5.3
    statement: 복사가 하나라도 실패하면(FileNotFound = DONE인데 파일 없음, StorageUnavailable) deletePrefix(publicationPrefix)를 한 번 시도하고 500 INTERNAL_ERROR로 발행을 끝낸다. DB는 건드리지 않는다.
    category: constraint
    applies_to: 발행 순서 3단계
    trigger: 2단계 실패
    logic: IF copy가 실패하면 THEN deletePrefix 시도 → 500. 로그에는 실패 종류만(키·경로 값 없음)
    violation: 500 INTERNAL_ERROR, 어떤 Catch도 공개로 바뀌지 않음
    source: C-17 3단계, AC4.1.8(PDF 부분)
  - id: BR5.4
    statement: 트랜잭션이 어떤 이유로든 실패하면(한도 429 롤백, 재확인 실패 404·400, chunkInTransaction 예외, DB 오류) deletePrefix(publicationPrefix)를 한 번 시도하고 원래 오류를 그대로 응답한다. 오류 코드를 바꾸지 않는다.
    category: constraint
    applies_to: 발행 순서 5단계
    trigger: 4단계 롤백
    logic: IF 트랜잭션이 실패하면 THEN deletePrefix 시도 → 원래 상태 코드·오류 본문 그대로
    violation: 원래 오류 유지
    source: C-17 5단계
  - id: BR5.5
    statement: 3·5단계의 접두어 삭제가 실패하면 로그만 남긴다. 남은 파일은 탈퇴 때 memberPrefix로 지워지며 별도 청소 장치는 두지 않는다.
    category: policy
    applies_to: 발행 순서 6단계
    trigger: deletePrefix 실패
    logic: IF deletePrefix가 실패하면 THEN 로그 PREFIX_CLEANUP_FAILED(접두어 값 없음) 하나만
    violation: 해당 없음
    source: C-17 6단계, 팀장 결정 2026-10-24(청소 장치 없음)
  - id: BR5.6
    statement: 발행에 PDF 항목이 없으면 1~3·5·6단계를 전혀 타지 않고 FileStorage를 부르지 않는다. 파일 저장소가 설정되지 않은 환경에서도 PDF 없는 발행은 그대로 성공한다.
    category: constraint
    applies_to: 발행 순서
    trigger: 발행 요청
    logic: IF items에 PDF_MATERIAL이 없으면 THEN U4의 기존 발행 경로 그대로(FileStorage 호출 0회)
    violation: 해당 없음(회귀 기준)
    source: C-17 pdf-free-publish, Unit 정의 "발행은 PDF를 기다리지 않는다"

  # BR6 — 열람 (W4, W1 5번)
  - id: BR6.1
    statement: 받은 사람의 PDF 원본 열람은 C-10 resolveForRecipient(token, grant, now)를 그대로 거친다(중지·만료·삭제·작성자 비활성 404 LINK_UNAVAILABLE, 작성자 회원 행 없음 500, 비밀번호 grant 거부 401 LINK_PASSWORD_REQUIRED). 판정과 항목 조회는 읽기 전용 트랜잭션 하나에서 한다.
    category: authorization
    applies_to: GET /v1/public/links/{token}/items/{publishedItemId}/pdf
    trigger: 열람 요청
    logic: IF 판정이 실패하면 THEN 그 오류를 그대로 돌려주고 파일을 읽지 않는다
    violation: 401 LINK_PASSWORD_REQUIRED 또는 404 LINK_UNAVAILABLE
    source: FR4.2, NFR1, C-10, C-12, AC3.2.1, AC4.4.1(PDF 부분)
  - id: BR6.2
    statement: 열람 항목은 판정으로 얻은 publicationId에 속한 item_kind PDF_MATERIAL 행만이다. 다른 발행본의 항목, PDF가 아닌 항목, 없는 항목, UUID 모양이 아닌 ID는 구분 없이 404 LINK_UNAVAILABLE이다.
    category: authorization
    applies_to: 받은 사람 PDF 열람
    trigger: 판정 통과 뒤
    logic: SELECT pdf_copy_key WHERE publication_id = access.publicationId AND published_item_id = $id AND item_kind = 'PDF_MATERIAL'. IF 0행 THEN 404 LINK_UNAVAILABLE
    violation: 404 LINK_UNAVAILABLE
    source: FR4.4(발행본에 넣지 않은 자료는 얻을 수 없다), NFR1, C-10 rule
  - id: BR6.3
    statement: 공유 링크 토큰은 경로에, 비밀번호 열람 권한인 grant는 X-Link-Grant 헤더에만 싣고 URL에 넣지 않는다. web은 이 경로를 fetch로 불러 권한 확인을 통과한 뒤 받은 PDF를 Blob URL로 만들고, 화면 안 iframe(#page=n)과 [새 탭에서 열기] 모두 그 Blob URL을 쓴다. 응답 401·404는 다른 패널처럼 onAccessLost로 처리한다.
    category: policy
    applies_to: 받은 사람 화면의 PDF 열람
    trigger: [PDF 보기]·[새 탭에서 열기]·[원본 n쪽 열기]
    logic: fetch(경로, { headers: { X-Link-Grant: getGrant() } }) → 200이면 Blob URL → iframe src = blob#page=n, 새 탭은 미리 연 창의 주소를 Blob URL로. 401·404면 onAccessLost(code). 화면을 떠나면 revokeObjectURL
    violation: 해당 없음(화면 규칙)
    source: Q3, C-11 grant 규칙, 10월 결정 #150(grant는 머리글), 보안 점검
  - id: BR6.4
    statement: 받은 사람과 작성자 화면은 PDF 쪽마다 쪽 번호를 보이고, readable=false인 쪽은 "읽을 수 없음"으로 표시하며, readable=true인 쪽은 사본의 글을 텍스트로 보인다. U5 근거의 pdfPage·charStart·charEnd는 그 쪽 글에서 강조하고 "원본 n쪽 열기"를 함께 둔다.
    category: policy
    applies_to: 받은 사람 화면 1번 자리, 작성자 발행본 화면, 작성자 PDF 상세
    trigger: 화면 표시, showEvidence(location)
    logic: FOR 각 쪽: IF readable THEN 글 + [원본 n쪽 열기] ELSE "읽을 수 없음" + [원본 n쪽 열기]. IF location.pdfPage가 있으면 THEN fieldText(pages[n]) = pdfPages[n-1].text 범위를 강조
    violation: 해당 없음(화면 규칙)
    source: FR3.4, FR6.5(PDF 부분), AC3.2.3, AC6.3.5(PDF 부분), NFR7, C-11 evidence-highlight
  - id: BR6.5
    statement: 사본 행은 있는데 파일이 없거나(FileNotFound) 저장소를 쓸 수 없으면(StorageUnavailable) 500 INTERNAL_ERROR다. 데이터 불일치는 로그에 남기되 키 값은 적지 않는다.
    category: constraint
    applies_to: PDF 원본·사본 열람
    trigger: FileStorage.get 실패
    logic: IF get이 FileNotFound 또는 StorageUnavailable이면 THEN 500
    violation: 500 INTERNAL_ERROR
    source: C-05 errors, 에러 대응 최소선 1
  - id: BR6.6
    statement: 작성자는 자기 발행본의 PDF 사본을 중지·만료 뒤에도 연다(resolveForOwner). 자기 원본은 본인 확인 뒤 연다. 두 경로 모두 application/pdf 스트림, inline 처분, 제목을 헤더에 넣지 않고, 캐시하지 않는다.
    category: authorization
    applies_to: GET /v1/publications/{id}/items/{itemId}/pdf, GET /v1/pdf-materials/{id}/file
    trigger: 작성자 열람 요청
    logic: IF resolveForOwner 또는 본인 확인이 실패하면 THEN 404(NotFound·RESOURCE_UNAVAILABLE). ELSE 스트림
    violation: 404
    source: FR5.1(작성자는 계속 본다), C-10 resolveForOwner, NFR1
  - id: BR6.7
    statement: PDF 열람 GET에는 시도 제한을 두지 않는다. 토큰·grant·키는 로그·오류 본문에 넣지 않는다.
    category: policy
    applies_to: 모든 PDF 열람 경로
    trigger: 요청·로그
    logic: IF 요청이 실패하면 THEN 코드만 로그. 시도 횟수는 세지 않는다
    violation: 해당 없음(보안 규칙)
    source: 보안 점검(grant로 조회하는 GET에는 시도 제한 없음), C-07 link_token_reference 비노출 규칙

  # BR7 — 삭제·탈퇴·S3 (W5)
  - id: BR7.1
    statement: 발행본 삭제는 U4의 순서(deletePrefix(publicationPrefix) 먼저, 실패면 오류·DB 유지) 그대로다. U8은 이 순서를 바꾸지 않고, PDF 사본이 있는 발행본에서 파일과 published_pdf_page가 실제로 함께 지워지는지 확인 시험을 더한다.
    category: constraint
    applies_to: 발행본 삭제
    trigger: 작성자 삭제 요청
    logic: IF deletePrefix가 성공하면 THEN publication 행 삭제(published_item·published_pdf_page 연쇄). ELSE 오류·DB 유지
    violation: 오류 응답, DB 유지
    source: FR5.2, FR14.9, AC5.2.2(PDF 부분), AC5.2.4, C-17 delete-publication, ADR-003
  - id: BR7.2
    statement: 탈퇴는 U2의 순서(2단계 deletePrefix(memberPrefix))가 PDF 원본과 발행 사본을 함께 지운다. U8은 로컬 드라이버로 "원본 1개 + 발행 사본 1개가 모두 사라짐"을 확인 시험하고, S3 실제 삭제 확인은 버킷(#389)이 준비된 뒤 한다.
    category: constraint
    applies_to: 탈퇴
    trigger: 탈퇴 요청
    logic: IF memberPrefix 삭제가 끝나면 THEN 그 회원의 materials/·publications/ 아래 파일이 없다
    violation: 탈퇴 실패 응답(U2 규칙)
    source: FR14.1, FR14.9, AC14.1.4(PDF 부분), C-06 withdrawal-order, Unit 정의 U8 책임
  - id: BR7.3
    statement: C-05 S3 드라이버는 put=PutObject, get=GetObject 스트림(NoSuchKey→FileNotFound), copy=CopyObject(원본 없음→FileNotFound), delete=DeleteObject(없어도 성공), deletePrefix=ListObjectsV2 반복 + DeleteObjects(1,000개 단위, 없는 접두어 성공), 그 밖 오류→StorageUnavailable이다. 설정은 FILE_STORAGE_DRIVER=s3와 버킷 이름, 자격은 AWS 기본 체인(역할)이며 presigned URL은 만들지 않는다. 로컬·S3 드라이버는 같은 계약 시험을 통과해야 한다.
    category: constraint
    applies_to: FileStorage S3 구현
    trigger: 배포 환경 설정
    logic: IF 드라이버가 s3인데 버킷 이름이 없으면 THEN 시작 때 실패(U2 로컬 드라이버의 설정 규칙과 같음). 키는 키 모양 검사를 통과한 것만 쓴다
    violation: 시작 실패 또는 StorageUnavailable
    source: ADR-003, C-05, Unit 정의 U8(S3 구현), 보안 점검(설정·외부 호출)
  - id: BR7.4
    statement: worker는 로컬·시험에서 api의 로컬 저장 폴더를 같은 볼륨으로 마운트해 PDF_FILE_ROOT로 읽고, 배포에서는 S3 GetObject(역할)로 읽는다. 두 경우 모두 읽기만 하고 쓰기·삭제는 하지 않는다.
    category: policy
    applies_to: worker 파일 읽기
    trigger: PdfExtract 처리
    logic: IF 배포면 THEN S3 GetObject(storageKey) ELSE open(PDF_FILE_ROOT/storageKey). 쓰기 호출 없음
    violation: 해당 없음(환경 규칙)
    source: Q6, ADR-003(worker는 S3 읽기만), components.md PdfTextExtraction
```

## 규칙 요약

| 묶음 | 규칙 | 핵심 | 출처 |
|---|---|---|---|
| BR1 업로드·원본 | BR1.1~BR1.8 | PDF만·머리 바이트, 20 MB·50쪽·20벌·제목 100자, 동의 먼저, 하루 횟수 안 씀, 민감 정보 안내, 파일→DB→커밋→발송 순서, 교체 없음·삭제는 원본만, 남의 것 404 | FR3.1·FR3.2·FR3.6·FR20.1, C-04·C-05, Q1 |
| BR2 상태·시한 | BR2.1~BR2.4 | PENDING→DONE/FAILED 한 번, 10분 시한을 읽을 때 판정, 재시도는 다시 올리기, 발송은 커밋 뒤 | C-02·C-16, Q2·Q5 |
| BR3 추출·수신 | BR3.1~BR3.7 | pypdf 쪽별·readable 판정·NUL 제거만, 실패 사유 3종(쪽 수 0 포함), 수신 판정 5종 한 트랜잭션(쪽 50 초과는 SCHEMA_INVALID), 전부 아니면 전무·ACCEPTED는 커밋 뒤, 글은 신뢰하지 않음, 키 모양 검사, 분석 소비자와 독립인 추출 Worker | FR3.3·FR3.4, C-16, Q2·Q5 |
| BR4 발행 전제·사본 | BR4.1~BR4.5 | DONE만(400 extractionIncomplete), 트랜잭션 안 재확인, published_pdf_page 복사 고정, 원본 변경 무영향, 전체 글 상한은 팀장 결정 보류 | FR3.2·FR4.7, C-07·C-17, Q4·Q7 |
| BR5 발행 순서 | BR5.1~BR5.6 | ID 선생성, position 순 복사, 실패 시 접두어 삭제 후 500/원래 오류, 정리 실패 로그만, PDF 없으면 저장소 미호출 | C-17 |
| BR6 열람 | BR6.1~BR6.7 | C-10 판정 재사용, 그 발행본의 PDF 항목만, grant는 헤더·Blob URL, 쪽 번호·읽을 수 없음·근거 강조, 파일 없음 500, 작성자는 중지 뒤에도, 시도 제한 없음 | FR4.2·FR4.4·FR3.4·FR6.5, C-10·C-11·C-12, Q3 |
| BR7 삭제·탈퇴·S3 | BR7.1~BR7.4 | 발행본 삭제·탈퇴는 기존 순서 + 실제 삭제 확인, S3 드라이버 동작 대응표, worker 읽기 경로 | FR5.2·FR14.9, ADR-003, C-05·C-06, Q6 |
