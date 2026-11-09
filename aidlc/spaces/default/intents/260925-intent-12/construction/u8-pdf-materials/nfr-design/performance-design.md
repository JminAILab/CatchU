# U8 PDF 자료 — 성능 설계

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측 요구사항](../nfr-requirements/observability-requirements.md), [기술 선택](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md), [계약 요약](../../../inception/contract-design/contract-summary.md) C-02·C-05·C-17, [NFR 설계 질문·답변](nfr-design-questions.md) Q1.

성능 목표 수치는 두지 않는다(NFR4). 아래는 요구사항의 경계 값 안에서 자원을 덜 쓰는 처리 패턴이다. 캐시 계층·CDN·연결 풀 추가·압축 같은 새 장치는 근거가 없어 두지 않는다(C06).

| 영역 | 설계 | 충족하는 요구사항 |
|---|---|---|
| 업로드 처리 순서 | 비용이 낮은 검사부터: 회원 인증 → 동의(C-04, 본문을 읽기 전) → 선언 종류 → 파일 스트림을 받으면서 **누적 바이트가 20 MB를 넘는 즉시 수신을 끊고 400**(요청 헤더나 multipart 메타의 선언 크기는 믿지 않음) → 머리 바이트 `%PDF-` → 제목 → `FileStorage.put` → 트랜잭션: 회원 행 잠금(`SELECT ... FOR UPDATE`) 안에서 벌 수 COUNT → 20 이상이면 롤백·`delete(materialKey)` 1회·400 → `pdf_material` INSERT → 커밋 → 큐 발송. 잠금 안에서 세고 넣으므로 동시 업로드에도 20벌을 넘지 않는다. 파일은 메모리 버퍼 1개로 받아 임시 파일을 만들지 않는다(20 MB 상한). 동시 업로드 n건이면 api 메모리에 최대 n × 20 MB가 머무는 부담은 시연 규모 가정으로 수용한다([보안 설계 §10](security-design.md)). | NFR4.1, NFR4.12 |
| 추출 처리 | `pdf-extraction-requests` 큐의 독립 Worker(동시성 기본 1, 설정값 이름은 코드 생성). 작업마다 자식 프로세스 1개(10월 분석 소비자 틀)에서 pypdf 실행, 결과 JSON을 부모가 받아 `worker-messages` 큐에 넣는다. 시한 10분(큐 대기 포함)은 api의 `readStatus` 판정이 지키고 worker는 시한을 보지 않는다. 자식 프로세스의 시간·메모리 제한값은 구현 단계에서 기존 값과 대표 PDF 측정으로 정한다. | NFR4.2, NFR4.3, NFR4.4 |
| 측정 1회 | 코드 생성 뒤 대표 PDF(수십 쪽, 수 MB)로 연속 업로드 3~5건의 추출 완료 시각을 기록해 동시성 기본값을 검토한다. 10분 시한 변경은 그 근거를 보고 담당자가 별도 결정한다. | NFR4.4 |
| 열람 전송 | api는 응답 헤더를 보내기 전에 `FileStorage.get`을 열어 성공을 확인한다(파일 없음·저장소 실패는 이 시점에 500). 그 뒤 스트림을 HTTP 응답에 그대로 파이프하고 전체를 메모리에 올리지 않는다. 저장소가 길이를 알려 주면 `Content-Length`를 함께 보낸다. **전송 도중** 저장소 오류가 나면 상태 코드를 바꿀 수 없으므로 응답을 중단(연결 끊음)하고 `PDF_VIEW_FAILED`(이유 storage, 단계 streaming)를 남긴다. Range는 지원하지 않는다. | NFR4.5, NFR4.19 |
| 열람 수신(web) | web은 응답 상태가 200이고 본문을 끝까지 받는 데 성공했을 때만 Blob을 만든다. 전송 중단·네트워크 오류로 본문 수신이 실패하면 Blob을 만들지 않고 "PDF를 불러오지 못했습니다. 다시 시도해 주세요"의 일반 열람 실패 안내를 보인다. 이것은 401·404의 접근 상실(onAccessLost)과 구분되며 grant를 지우지 않는다. | NFR4.5, NFR7.3 |
| 열람 재사용(web) | 같은 PDF가 이미 열려 있는 뷰어에서 [원본 n쪽 열기]로 쪽만 바꿀 때는 기존 Blob을 재사용하고 `#page=n`만 바꾼다. 처음 열기·닫았다 다시 열기·[새 탭에서 열기]는 서버에 다시 요청한다(판정 재실행; 새 탭 열기는 팝업 허용 여부와 관계없이 클릭당 요청 1회). Blob URL의 생성·해제 주체와 새 탭·팝업 차단·요청 실패 처리는 [보안 설계 §2](security-design.md)의 규칙 하나를 따른다. | NFR4.5, NFR1.2(Q1) |
| 발행 복사 | PDF 항목마다 `copy`를 position 순으로 순차 호출한다(최대 항목 20). 병렬 복사는 두지 않는다(실패 정리 순서를 단순하게 유지). 트랜잭션은 복사가 모두 끝난 뒤 시작하므로 복사 시간이 DB 잠금 시간에 들어가지 않는다. | NFR4.6 |
| 사본 고정 | `published_pdf_page`는 `INSERT ... SELECT`로 한 문장에 복사한다(PDF당 최대 50행). | NFR4.6 |
| 결과 저장 | 쪽 행 50개를 다중 행 INSERT 한 문장(또는 한 트랜잭션)으로 쓰고 `pdf_material` 갱신과 함께 커밋한다. 메시지 크기 상한은 두지 않는다(OQ-U4-4에 딸림). | NFR4.7 |
| 상태 읽기 | 목록·상세·발행 사전 확인은 시한이 지난 PENDING을 조건부 UPDATE 한 문장(`WHERE extraction_state = 'PENDING' AND extraction_deadline_at <= now()`)으로 FAILED로 바꾼 뒤 읽는다. 별도 스케줄러·타이머는 없다. | NFR4.2, NFR4.14 |
| S3 호출 | SDK 기본 재시도 모드(최대 3회) 유지. 호출 1회가 길어질 수 있음을 받아들인다. | NFR4.8 |
| 두지 않는 것 | 응답 캐시, CDN, 썸네일·미리보기 생성, 추출 글 압축, 연결 풀 변경, 부하 시험 | NFR4(수치 없음), C06 |
