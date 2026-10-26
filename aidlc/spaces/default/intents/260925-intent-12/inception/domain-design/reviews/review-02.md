## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-24T10:07:40Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 PublishedIndex(depends_on, entities PublishedChunk) 와 Publication의 PublishedItem | 발행 사본에 PDF 쪽별 글이 고정되지 않는다. PublishedItem에는 snapshotContent와 pdfCopyKey만 있고, PDF 글은 Materials의 PdfPageText(원본 자료의 가변 상태)에만 있다. 그런데 PublishedIndex는 Publication만 읽는 것으로 적혀 있고 PublishedChunk에는 pdfPage·text가 들어간다. 조각을 만들 때 PDF 글을 어디서 읽는지 정해져 있지 않다. Materials를 읽으면 선언되지 않은 의존이 생기고, 발행 뒤 원본을 고치거나 지울 때 발행본(FR3.2, FR4.4)이 달라진다. 발행 사본 PDF를 다시 추출하면 PdfTextExtraction이 발행 경로에 끼어든다. | PDF 쪽별 글을 발행 때 PublishedItem(또는 Publication이 소유하는 별도 엔티티)에 사본으로 고정한다고 정하고, PublishedIndex는 그 사본만 읽도록 의존을 맞춘다. 발행 시점에 아직 추출 중이거나 읽을 수 없는 쪽이 있을 때의 처리도 정한다. PDF는 후순위이므로 그 부분만 표시한다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 PublishedIndex / QnA / JdSummary, 그리고 decisions.md > ADR-005 Consequences | 색인의 준비·실패 상태를 가진 곳이 없다. ADR-005는 발행 직후 색인이 안 된 상태를 "기능 설계에서 구분한다"고 미루지만, 상태를 담을 엔티티가 없다(PublishedChunk뿐, BaseSummary.status 같은 필드가 색인에는 없다). PublishedIndex는 AiRun에도 의존하지 않아 FR6.8의 처리 시한·실패 규칙이 적용되지 않는다. 발행 완료 이벤트를 받는 도중 프로세스가 죽거나 Voyage 호출이 실패하면 그 발행본은 영구히 질의응답·JD 요약이 안 되는데, 작성자가 다시 시도할 길도 없다(다시 만들기는 기본 요약에만 있다). FR4.7은 사본을 "발행할 때" 조각으로 나눠 위치를 기록한다고 하는데 ADR-005는 전부를 사후 구독으로 돌려 요구사항과 어긋난다. 이벤트가 어떤 방식으로 전달되는지도 없다. | 조각 나누기·위치 기록은 발행 트랜잭션 안에서 하고 임베딩만 사후로 두는지, 전부 사후로 두는지 결정한다. 사후라면 색인 상태(대기·완료·실패)를 소유할 엔티티와 처리 시한을 정하고, 실패했을 때 질의응답·JD 요약이 무엇을 보이는지와 다시 시도 경로(없다면 없음을 명시)를 ADR-005에 적는다. 발행 완료 이벤트의 전달 방식도 적는다. | Resolved (reviewer) |
| R-03 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 AiUsageLimit(entities LinkQuestionCount, depends_on: []), 컴포넌트 Catches(entity Catch references AnalysisRequest) | 선언되지 않은 의존이 Unit 순서를 흔든다. (1) 공용 기반인 AiUsageLimit의 LinkQuestionCount가 Publication을 참조하고 연쇄 삭제(FR14.8)도 받아야 하는데 depends_on은 비어 있다. 입력 §3은 공용 기반이 "기다리는 것 없음"이라 했지만 이 엔티티는 발행 Unit의 표를 먼저 요구한다. (2) Catch가 RepositoryAnalysis 소유의 AnalysisRequest를 참조하고 RepositoryAnalysis는 Catches에 의존해, 참조 수준 순환이 생긴다. 이 순환은 기존 코드(catch_asset이 analysis_request를 참조)에 이미 있지만 Rationale에 의도된 순환으로 적혀 있지 않다. 호출 그래프만 비순환이라 표와 다이어그램이 이 두 경우를 가린다. | LinkQuestionCount를 이를 쓰는 QnA(또는 Publication)로 옮겨 공용 기반에서 발행 표 참조를 없앤다. Catch→AnalysisRequest 참조는 순환을 인정해 Rationale에 적거나, 참조 방향을 바꿀 수 있는지 정한다. 두 경우 모두 Unit 나누기가 읽는 의존에 반영한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 AiConsent / RepositoryAnalysis(AnalysisRequest.consentRef) | 10월 코드에는 분석 요청마다의 `analysis_consent` 표가 이미 있다(api/docs/member-withdrawal-deletion.md의 삭제 규칙 표). 새 AiConsent는 "첫 이용 한 번" 동의로 별도 엔티티이고, AnalysisRequest.consentRef가 어느 쪽을 가리키는지 references에 선언되어 있지 않다. 동의 엔티티가 둘이 되는지, 하나가 다른 하나를 대체하는지 알 수 없다. | 기존 분석 동의를 AiConsent로 흡수할지 병존시킬지 정하고 consentRef를 references에 선언한다. 소유는 한 컴포넌트로 한다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 FileStorage behaviour, Withdrawal behaviour | PDF 키가 "회원·발행본 접두어"라고만 적혀 있어, 발행본 접두어가 회원 접두어 아래에 들어 있는지 알 수 없다. 따로라면 탈퇴 때 "회원 접두어 전체" 삭제가 작성자의 발행 사본 PDF를 지우지 못해 FR14.9를 어긴다. Withdrawal은 Publication에 의존하지 않아 발행본별로 지울 수도 없다. | 키 배치를 정한다(예: 회원 접두어 아래에 발행본 접두어를 둔다). 별도 접두어면 Withdrawal이 Publication의 목록을 거치도록 한다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 Publication behaviour(공개 전환), Catches behaviour | 발행 때 Catches의 공개 전환과 Publication 저장이 한 트랜잭션이어야 한다(FR4.7). 두 컴포넌트가 다른 Unit·담당일 수 있는데, Catches의 인터페이스가 호출자의 트랜잭션에 참여하는지, 판정과 전환 사이에 Catch의 공개 여부·원본 비공개 확인이 바뀌는 경우를 어떻게 막는지(행 잠금 등) 적혀 있지 않다. | Catches가 호출자의 트랜잭션 안에서 판정과 전환을 하며 해당 행을 잠근다는 경계를 적는다. 계약 설계에서 시그니처로 옮긴다. | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 ClaudeMcp(McpConnection) | 최소 OAuth(FR13.1)의 승인 코드·토큰·클라이언트 등록이 어느 엔티티에도 없고 McpConnection.grantRef만 있다. 전체 연결 해제와 만료 재승인이 어떤 저장 상태로 성립하는지 개발자가 추정해야 한다. | 승인·토큰 상태의 소유 엔티티를 두거나, 외부 구현에 위임한다면 grantRef가 무엇을 가리키는지 한 줄로 적는다. | Resolved (reviewer) |
| R-08 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 PdfTextExtraction(entities: [], dependents Materials) | 10월 수신 경로(analysis-receiver)는 분석 전용이다. PDF 글 결과를 worker가 api로 되돌리는 경로(수신·인증·부모 외래 키 거부, FR14.10)를 누가 소유하는지 없다. Materials가 "결과 수신"을 가졌다고만 되어 있다. | 결과 수신이 Materials 쪽 책임임을 명시하고, 10월 수신 경로를 재사용하는지 새로 두는지 적는다(후순위라 계약 설계로 넘겨도 된다). | Resolved (reviewer) |
| R-09 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > PublishedIndex behaviour, AiRun behaviour, Publication behaviour (커밋 뒤 작업 등록) | 색인 시한 초과를 실패로 바꾸는 주체가 AiRun 작업 처리에 매여 있다. 발행 커밋 뒤 작업 등록이 실패하거나(Redis 장애) 큐의 작업이 사라지면 처리기가 한 번도 돌지 않아 PublicationIndex가 영원히 "대기"로 남는다. [검색 다시 준비]는 실패 상태에서만 받으므로 이 발행본은 질의응답·JD 요약이 막힌 채 빠져나올 길이 없다. | 시한 판정을 처리기와 무관하게 하도록 적는다. 예를 들어 상태를 읽을 때 deadlineAt이 지났으면 실패로 간주하고 확정한다. 아니면 작업 등록 실패를 발행 응답에 드러내는 규칙을 둔다. | New |
| R-10 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > Publication behaviour, FileStorage behaviour | PDF 복사(S3)는 DB 트랜잭션에 묶이지 않는다. 발행 트랜잭션이 롤백되면 발행본 접두어 아래에 부모 없는 파일이 남고, 이를 지우는 규칙이 없다(탈퇴 때 회원 접두어에서만 지워짐). | 복사를 트랜잭션 앞에서 하는지 안에서 하는지와 롤백 때 복사본 정리를 한 줄로 정해 계약 설계로 넘긴다. | New |
| R-11 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > QnA behaviour, ClaudeMcp entities | 링크당 질문 횟수의 Redis 장애 때 동작(막을지 통과시킬지)과 하루 경계 기준(시간대)이 없다. McpAccessToken에는 McpConnection과의 연결이 없어 "전체 해제 시 토큰과 연결 기록 삭제"가 회원 기준 삭제인지 연결 기준 삭제인지 모호하다. | 두 항목 모두 기능 설계에서 정할 항목으로 이 문서에 한 줄 남긴다. | New |

> R-01 Reviewer note: Publication이 PublishedPdfPage(쪽별 글·readable)를 소유하고 PublishedIndex는 그 사본만 읽는다. PdfMaterial.extractionState로 추출 미완료 PDF를 발행 선택에서 막고, ADR-001·005가 같은 내용이다. 남은 시한 문제는 새 지적 1로 올렸다.

> R-02 Reviewer note: PublicationIndex(state, deadlineAt)를 PublishedIndex가 소유한다. 조각 나누기는 발행 트랜잭션 안, 임베딩은 커밋 뒤 AiRun 작업이다. 실패 때 [검색 다시 준비] 경로와 ADR-007이 있고, 질의응답·JD 요약의 준비 전/실패 응답도 적혔다. 시한 집행 주체는 새 지적 1로 올렸다.

> R-03 Reviewer note: 링크당 질문 횟수는 QnA의 Redis 키로 옮겨 AiUsageLimit에서 Publication 참조가 사라졌다. Catch→AnalysisRequest 순환은 Rationale에 의도된 순환으로 적혔다.

> R-04 Reviewer note: AnalysisConsent와 AiConsent가 병존하고 AnalysisRequest.consentRef가 선언됐으며 ADR-008이 FR20.1의 분석 동의 소유를 밝힌다.

> R-05 Reviewer note: 회원/{memberId}/발행본/{publicationId}/... 구조가 FileStorage·Withdrawal·Publication·ADR-003에 일관되게 적혔다.

> R-06 Reviewer note: Catches가 호출자(Publication)의 발행 트랜잭션에 참여하는 10월 공개 전환 로직을 쓰고 잠금을 새로 설계하지 않는다고 적혔다.

> R-07 Reviewer note: McpClient·McpAuthorizationCode·McpAccessToken이 선언됐고 갱신 토큰은 없으며 해제·탈퇴 삭제 규칙이 적혔다(ADR-009).

> R-08 Reviewer note: Materials가 PDF 글 결과를 10월 수신 방식으로 받고 시한 초과를 실패로 바꾼다고 적혔다. 세부는 계약 설계로 넘겼다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (없음) | 선언된 검증 도구 없음 | traceability 센서는 통과 상태로 전달됐다. 호출 그래프는 직접 대조했고 순환이 없다. |

### Summary

이전 지적 8건은 모두 반영됐고 호출 그래프에 순환이 없으며 엔티티 참조도 해소된다. 열린 큰 지적은 새 Major 1건으로, 색인 시한 집행이 큐 작업에 의존해 작업이 등록되지 않으면 "대기"에 갇힌다는 점이다. 승인 전에 한 줄 보강하기를 권하지만 구현을 막을 정도는 아니어서 READY로 본다.
