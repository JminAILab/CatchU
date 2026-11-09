## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06T08:02:23Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | functional-spec.md > W2 worker 1번 ("기존 분석 소비자와 같은 프로세스, 동시 1") 및 BR2.2(시한 10분) | 추출 소비자가 기존 저장소 분석 소비자와 같은 프로세스에서 동시 1로 돈다고만 적혀 있다. 질문 Q2의 선택지 C가 보여 주듯 10월 분석 시한은 60분이라, 분석 작업이 돌고 있으면 PDF 추출 작업은 기다리다가 10분 시한을 넘겨 DEADLINE_EXCEEDED로 FAILED가 될 수 있다. 소비자가 분석 소비자와 따로 도는지, 한 작업이 다른 작업을 막는지 설계에서 알 수 없어 개발자가 추측해야 한다. | 추출 소비자가 분석 소비자와 독립해서 동시에 도는지(별도 소비자·별도 동시성 한도) 명시한다. 독립이 어렵다면 시한 10분이 대기 시간을 포함한다는 점과 그 영향을 Q2 결정에 반영해 적는다. | New |
| R-02 | Minor | rules.md > BR3.3 / entities.md > PdfMaterial.pageCount | 수신 쪽 SCHEMA_INVALID 조건에 `pages` 개수 50 이하 검사와 쪽 글 크기 상한이 없다. pageCount는 50 이하로 제한되는데, 이를 넘는 SUCCEEDED가 오면 BR3.4에 따라 저장이 롤백되고 PENDING으로 남다가 시한 뒤 DEADLINE_EXCEEDED로 FAILED가 된다. 사유가 가려진다. 쪽 글 총량 상한이 없어 큐 메시지(Redis 작업 본문)가 커질 수 있다는 점도 설계에 언급이 없다. | BR3.3에 `pages.length`가 50 초과면 SCHEMA_INVALID라는 조건을 더한다. 메시지 크기 상한을 정할지, 하지 않는다면 그 사실을 BR4.5의 OQ-U4-4 영향 목록에 적는다. | New |
| R-03 | Minor | rules.md > BR3.2 | 쪽 수 0인 PDF를 어떻게 처리할지 정해져 있지 않다. 이 경우 SUCCEEDED + 빈 pages가 되어 BR3.3에서 SCHEMA_INVALID로 거부되고, 자료는 시한까지 PENDING으로 남는다. | 쪽 수 0이면 FAILED(UNREADABLE_FILE)로 보고한다는 한 줄을 BR3.2에 더한다. | New |
| R-04 | Minor | functional-spec.md > 섹션 5 ("U4(같은 담당)"), W3 도입부 | U8이 U4의 발행 서비스 파일, 발행 입력 검증, 받은 사람 화면을 고친다. Unit 정의가 Publication의 PDF 부분을 U8 컴포넌트로 두므로 범위는 근거가 있다. 그러나 "같은 담당"이라는 전제는 담당표로 확인되지 않는다. U4가 먼저 합쳐져야 한다는 순서도 구현 순서 목록에 없다. | 담당이 다르면 계약 규칙(소비 Unit은 요청한다)에 따라 U4 담당과 합의하는 절차를 한 줄로 적는다. 구현 순서의 3단계 앞에 U4 발행 경로가 통합 브랜치에 있어야 한다는 전제를 더한다. | New |
| R-05 | Minor | rules.md > BR4.2 | BR4.2가 정한 잠금 순서(회원, consume, Catch, 텍스트 자료, PDF)는 U4 BR5.1과의 일치 여부를 이 Unit 범위에서 확인할 수 없다. C-08의 순서에서 확인되는 것은 consume이 트랜잭션 시작 직후라는 점까지다. | 코드 생성 전에 U4 BR5.1의 잠금 순서와 대조해 달라고 U4 담당에게 요청한다. 대조 결과를 BR4.2의 근거에 적는다. | New |
| R-06 | Minor | functional-spec.md > 섹션 5 / W2 메시지 | C-16 더하는 변경으로 필수 필드 `memberId`와 `schemaVersion: "2"`를 더한다. 계약 문서의 기존 모양에는 `memberId`가 없고, "2"가 무엇의 두 번째 판인지 설명이 없다. U8이 송신과 수신을 모두 소유하므로 호환 문제는 없다. | `schemaVersion` 값의 근거(10월 메시지의 버전 규칙)를 한 줄로 밝히고, 승인 뒤 C-16에 같은 내용을 반영한다. | New |

### What I verified

- 산출물 형식: entities.md와 rules.md에 정본 YAML 블록이 있고, 규칙 ID는 BR{묶음}.{번호} 형식이다. functional-spec.md는 워크플로와 상태 전이(mermaid + 문장 설명), 파생 ER 그림, 규칙 요약을 갖췄다. SQL 본문이나 구현 코드는 없고, `INSERT ... SELECT` 표기는 예시 수준이다.
- 계약 준수: C-05 키(materialKey와 publishedPdfKey), C-06 삭제 부모(`pdf_material`은 회원, `pdf_page_text`는 PDF 자료, `published_pdf_page`는 발행 항목), C-07 `published_pdf_page`와 `PDF_MATERIAL` 스냅샷(`{pageCount}`)·`pdf_copy_key` CHECK, C-10 판정 순서, C-11 grant 헤더 규칙, C-16 수신 판정 5종, C-17 6단계 순서를 대조했고 다시 정의한 곳이 없다. C-16 필드 추가와 C-12 PDF 열람 경로는 U8이 소유하는 더하는 변경으로 섹션 5에 올바르게 표시됐다. `pdfPages`는 C-10 `readSnapshot` 계약에 있다.
- Q&A 반영: Q1 20 MB/50쪽/20벌/제목 100자(BR1.2), Q2 10분(BR2.2), Q3의 토큰은 경로·grant는 헤더·Blob URL(BR6.3), Q4 400 `extractionIncomplete`(BR4.1), Q5 실패 코드와 봉투(BR3.2·BR3.3), Q6 공유 볼륨(BR7.4), Q7 OQ-U4-4 미결과 U4 검증 무변경(BR4.5)이 모두 일치한다.
- 내부 일관성: BR2.2가 읽기 시점에 FAILED를 쓰는 것은 BR2.1의 조건부 UPDATE로 한 번 전이 규칙과 충돌하지 않는다(PENDING에서만 쓰기). BR4.2의 `FOR SHARE` 재확인은 쓰기 없이 롤백만 하므로 BR2.2와 충돌하지 않는다. BR5.6의 회귀 기준은 BR5.1의 선생성이 PDF 항목이 있을 때만 적용되는 한 모순이 없다.
- 근거 없는 장치 점검: 추가된 칸(`extractionFailureCode`, `fileSizeBytes`)과 DEADLINE_EXCEEDED는 Q5·Q1에 근거가 있고 사유가 적혀 있다. 청소 장치, Range 요청, 시도 제한, presigned URL은 넣지 않았다.
- 추적성 검사: `aidlc engine sensor-traceability --stage functional-design --output-path .../u8-pdf-materials/functional-design/traceability.json`을 다시 실행해 `{"pass":true,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":[],"invalid_entries":[],"invalid_targets":[],"findings_count":0}`를 확인했다.
- 읽지 않은 것: 다른 Unit의 `construction/` 내용은 열지 않았다. U4 BR5.1 잠금 순서와 U3 `readable=true`만 조각낸다는 전제는 이 범위에서 확인하지 못했으며 위 Minor 행에 확인 요청으로 남겼다.

### Summary

계약 준수와 승인된 Q1~Q7 반영은 좋고, 새로 더하는 변경(C-16·C-12)도 U8 소유로 올바르게 표시됐다. 가장 무거운 우려는 추출 소비자가 분석 소비자와 같은 프로세스에서 동시 1로 도는 점이다. 이 경우 10분 시한이 대기 시간 때문에 먼저 끝날 수 있어 독립 여부를 명시해야 한다. 나머지는 수신 검증의 빈틈(쪽 수 상한, 0쪽)과 U4와의 순서·잠금 대조에 관한 Minor 항목이고, 모두 차단 사유는 아니다.
