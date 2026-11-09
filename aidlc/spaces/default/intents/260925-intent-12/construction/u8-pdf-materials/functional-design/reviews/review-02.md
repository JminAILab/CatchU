## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06T08:17:35Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | functional-spec.md > W2 worker 1번 ("기존 분석 소비자와 같은 프로세스, 동시 1") 및 BR2.2(시한 10분) | 추출 소비자가 기존 저장소 분석 소비자와 같은 프로세스에서 동시 1로 돈다고만 적혀 있다. 질문 Q2의 선택지 C가 보여 주듯 10월 분석 시한은 60분이라, 분석 작업이 돌고 있으면 PDF 추출 작업은 기다리다가 10분 시한을 넘겨 DEADLINE_EXCEEDED로 FAILED가 될 수 있다. 소비자가 분석 소비자와 따로 도는지, 한 작업이 다른 작업을 막는지 설계에서 알 수 없어 개발자가 추측해야 한다. | 추출 소비자가 분석 소비자와 독립해서 동시에 도는지(별도 소비자·별도 동시성 한도) 명시한다. 독립이 어렵다면 시한 10분이 대기 시간을 포함한다는 점과 그 영향을 Q2 결정에 반영해 적는다. | Resolved (reviewer) |
| R-02 | Minor | rules.md > BR3.3 / entities.md > PdfMaterial.pageCount | 수신 쪽 SCHEMA_INVALID 조건에 `pages` 개수 50 이하 검사와 쪽 글 크기 상한이 없다. pageCount는 50 이하로 제한되는데, 이를 넘는 SUCCEEDED가 오면 BR3.4에 따라 저장이 롤백되고 PENDING으로 남다가 시한 뒤 DEADLINE_EXCEEDED로 FAILED가 된다. 사유가 가려진다. 쪽 글 총량 상한이 없어 큐 메시지(Redis 작업 본문)가 커질 수 있다는 점도 설계에 언급이 없다. | BR3.3에 `pages.length`가 50 초과면 SCHEMA_INVALID라는 조건을 더한다. 메시지 크기 상한을 정할지, 하지 않는다면 그 사실을 BR4.5의 OQ-U4-4 영향 목록에 적는다. | Resolved (reviewer) |
| R-03 | Minor | rules.md > BR3.2 | 쪽 수 0인 PDF를 어떻게 처리할지 정해져 있지 않다. 이 경우 SUCCEEDED + 빈 pages가 되어 BR3.3에서 SCHEMA_INVALID로 거부되고, 자료는 시한까지 PENDING으로 남는다. | 쪽 수 0이면 FAILED(UNREADABLE_FILE)로 보고한다는 한 줄을 BR3.2에 더한다. | Resolved (reviewer) |
| R-04 | Minor | functional-spec.md > 섹션 5 ("U4(같은 담당)"), W3 도입부 | U8이 U4의 발행 서비스 파일, 발행 입력 검증, 받은 사람 화면을 고친다. Unit 정의가 Publication의 PDF 부분을 U8 컴포넌트로 두므로 범위는 근거가 있다. 그러나 "같은 담당"이라는 전제는 담당표로 확인되지 않는다. U4가 먼저 합쳐져야 한다는 순서도 구현 순서 목록에 없다. | 담당이 다르면 계약 규칙(소비 Unit은 요청한다)에 따라 U4 담당과 합의하는 절차를 한 줄로 적는다. 구현 순서의 3단계 앞에 U4 발행 경로가 통합 브랜치에 있어야 한다는 전제를 더한다. | Resolved (reviewer) |
| R-05 | Minor | rules.md > BR4.2 | BR4.2가 정한 잠금 순서(회원, consume, Catch, 텍스트 자료, PDF)는 U4 BR5.1과의 일치 여부를 이 Unit 범위에서 확인할 수 없다. C-08의 순서에서 확인되는 것은 consume이 트랜잭션 시작 직후라는 점까지다. | 코드 생성 전에 U4 BR5.1의 잠금 순서와 대조해 달라고 U4 담당에게 요청한다. 대조 결과를 BR4.2의 근거에 적는다. | Resolved (reviewer) |
| R-06 | Minor | functional-spec.md > 섹션 5 / W2 메시지 | C-16 더하는 변경으로 필수 필드 `memberId`와 `schemaVersion: "2"`를 더한다. 계약 문서의 기존 모양에는 `memberId`가 없고, "2"가 무엇의 두 번째 판인지 설명이 없다. U8이 송신과 수신을 모두 소유하므로 호환 문제는 없다. | `schemaVersion` 값의 근거(10월 메시지의 버전 규칙)를 한 줄로 밝히고, 승인 뒤 C-16에 같은 내용을 반영한다. | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/functional-design/rules.md > BR3.7 및 BR2.2 | 추출 소비자 동시성이 1이고 시한 10분이 큐 대기를 포함하므로, 한 회원이 PDF 여러 벌을 연달아 올리면 뒤쪽 자료는 앞 작업을 기다리다 시한을 넘겨 DEADLINE_EXCEEDED로 실패할 수 있다. 회원당 20벌 상한과 대표 PDF의 추출 시간으로 따지면 실제로 얼마나 일어나는지는 설계에서 알 수 없다. 포트폴리오 MVP에서는 실패 뒤 다시 올리면 되므로 막는 사항은 아니다. | 코드 생성 때 대표 PDF의 추출 시간을 한 번 재서, 연속 업로드에서 시한 초과가 흔하면 동시성 기본값이나 시한을 조정한다. 지금은 설계 변경이 필요하지 않다. | New |

> R-01 Reviewer note: BR3.7을 새로 두어 추출 소비자를 `pdf-extraction-requests` 큐의 별도 Worker 인스턴스와 별도 동시성 한도(기본 1)로 정했다. 분석 작업(60분)이 돌아도 추출은 기다리지 않고, 10분 시한이 큐 대기를 포함한다는 점과 그 결과(worker 꺼짐이면 DEADLINE_EXCEEDED, 다시 올리기)도 적었다. 기능 명세 W2 worker 1번, 전제 항목, 규칙 요약이 BR3.7과 일치한다. worker 코드에 `Worker(` 인스턴스와 `CATCHU_WORKER_CONCURRENCY` 설정이 하나씩 있어 "큐마다 Worker 하나" 전제와 모순되지 않는다.

> R-02 Reviewer note: BR3.3에 `pages`가 50개 초과면 SCHEMA_INVALID라는 조건이 들어갔고, W2 1번에도 같은 내용이 있다. 쪽 글 길이·메시지 크기 상한을 따로 두지 않는 이유와 OQ-U4-4 결정에 딸린다는 점이 BR3.3과 BR4.5에 적혔다.

> R-03 Reviewer note: BR3.2에 쪽 수 0이면 FAILED(UNREADABLE_FILE)가 들어갔고, SUCCEEDED의 pages는 항상 1~50개라고 적었다. W2 worker 4번과 일치한다.

> R-04 Reviewer note: 구현 순서 4·5단계에 "U4 발행 경로가 통합 브랜치에 먼저 합쳐져 있어야 한다"는 선행 조건이 들어갔다. 같은 담당이라는 전제는 Unit 맡기 기록을 근거로 적었고, 담당이 바뀌면 계약 소유 규칙에 따라 U4 담당에게 요청한다고 밝혔다. §5 U4 행도 같다.

> R-05 Reviewer note: BR4.2에 U4 BR5.1과 대조한 결과를 적었다. 이번에 U4 rules.md BR5.1을 직접 열어 확인했고, 순서(consume → Catch를 catch_id 오름차순 → 텍스트 자료를 text_material_id 오름차순)와 consume이 트랜잭션 시작 직후라는 점이 일치한다. PDF를 그 뒤에 더하는 것은 앞 순서를 바꾸지 않는다.

> R-06 Reviewer note: W2 메시지 설명에 `schemaVersion: "2"`와 `messageId` 규칙의 근거를 적었다. 10월 worker 결과 봉투의 판본 번호이며, `worker/app/processing/result.py`와 `pipeline.py`의 `"schemaVersion": "2"`로 확인된다. 승인 뒤 C-16에 같은 내용을 더한다는 점도 §5에 있다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| aidlc engine sensor-traceability --stage functional-design | {"pass":true,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":[],"invalid_entries":[],"invalid_targets":[],"findings_count":0} | 추적 누락·고아·잘못된 대상 없음. |

### What I verified

- 이전 지적 R-01~R-06을 entities.md, rules.md(BR3.2, BR3.3, BR3.7, BR4.2, BR4.5), functional-spec.md(구현 순서, W2 메시지와 worker 절, 전제, §5 U4 행)에서 다시 확인했다. 세 문서의 내용이 서로 모순되지 않는다.
- 계약 C-16·C-17(contract-summary.md)과 대조했다. 메시지에 더한 필드(`schemaVersion`, `messageId`, `memberId`, `failureCode`)는 기존 필드와 수신 판정 5종을 바꾸지 않는 더하는 변경이고, 계약 소유 규칙의 「더하는 변경」에 해당한다.
- U4 rules.md BR5.1을 열어 잠금 순서 주장을 확인했다. worker 코드에서 `schemaVersion "2"`, Worker 인스턴스, 동시성 설정을 확인했다.
- 이번 수정으로 새로 늘어난 장치(별도 Worker, SCHEMA_INVALID 조건, 쪽 수 0 처리)는 모두 기존 승인 질문과 계약의 범위 안이며, 근거 없는 기능을 더하지 않았다. 열어 둔 결정(OQ-U4-4 전체 글 상한과 메시지 크기 상한, OQ-U8-1 11/13 시연 위치, OQ-U8-2 S3 버킷 시점)은 결함으로 보지 않았다.
- 추적 확인 명령의 결과는 위 표와 같다.

### Summary

이전 지적 6건은 모두 반영됐고, 추출 소비자의 독립 구조·수신 검사·쪽 수 0 처리·U4 선행 조건·잠금 순서 대조·메시지 판본 근거가 문서 사이에서 일관된다. 새 지적은 연속 업로드 시 시한 초과 가능성 하나(Minor)뿐이라 개발자가 추측 없이 구현할 수 있는 상태로 보고 READY로 판정한다.
