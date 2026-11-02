## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-24T08:08:20Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 PublishedIndex(depends_on, entities PublishedChunk) 와 Publication의 PublishedItem | 발행 사본에 PDF 쪽별 글이 고정되지 않는다. PublishedItem에는 snapshotContent와 pdfCopyKey만 있고, PDF 글은 Materials의 PdfPageText(원본 자료의 가변 상태)에만 있다. 그런데 PublishedIndex는 Publication만 읽는 것으로 적혀 있고 PublishedChunk에는 pdfPage·text가 들어간다. 조각을 만들 때 PDF 글을 어디서 읽는지 정해져 있지 않다. Materials를 읽으면 선언되지 않은 의존이 생기고, 발행 뒤 원본을 고치거나 지울 때 발행본(FR3.2, FR4.4)이 달라진다. 발행 사본 PDF를 다시 추출하면 PdfTextExtraction이 발행 경로에 끼어든다. | PDF 쪽별 글을 발행 때 PublishedItem(또는 Publication이 소유하는 별도 엔티티)에 사본으로 고정한다고 정하고, PublishedIndex는 그 사본만 읽도록 의존을 맞춘다. 발행 시점에 아직 추출 중이거나 읽을 수 없는 쪽이 있을 때의 처리도 정한다. PDF는 후순위이므로 그 부분만 표시한다. | New |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 PublishedIndex / QnA / JdSummary, 그리고 decisions.md > ADR-005 Consequences | 색인의 준비·실패 상태를 가진 곳이 없다. ADR-005는 발행 직후 색인이 안 된 상태를 "기능 설계에서 구분한다"고 미루지만, 상태를 담을 엔티티가 없다(PublishedChunk뿐, BaseSummary.status 같은 필드가 색인에는 없다). PublishedIndex는 AiRun에도 의존하지 않아 FR6.8의 처리 시한·실패 규칙이 적용되지 않는다. 발행 완료 이벤트를 받는 도중 프로세스가 죽거나 Voyage 호출이 실패하면 그 발행본은 영구히 질의응답·JD 요약이 안 되는데, 작성자가 다시 시도할 길도 없다(다시 만들기는 기본 요약에만 있다). FR4.7은 사본을 "발행할 때" 조각으로 나눠 위치를 기록한다고 하는데 ADR-005는 전부를 사후 구독으로 돌려 요구사항과 어긋난다. 이벤트가 어떤 방식으로 전달되는지도 없다. | 조각 나누기·위치 기록은 발행 트랜잭션 안에서 하고 임베딩만 사후로 두는지, 전부 사후로 두는지 결정한다. 사후라면 색인 상태(대기·완료·실패)를 소유할 엔티티와 처리 시한을 정하고, 실패했을 때 질의응답·JD 요약이 무엇을 보이는지와 다시 시도 경로(없다면 없음을 명시)를 ADR-005에 적는다. 발행 완료 이벤트의 전달 방식도 적는다. | New |
| R-03 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 AiUsageLimit(entities LinkQuestionCount, depends_on: []), 컴포넌트 Catches(entity Catch references AnalysisRequest) | 선언되지 않은 의존이 Unit 순서를 흔든다. (1) 공용 기반인 AiUsageLimit의 LinkQuestionCount가 Publication을 참조하고 연쇄 삭제(FR14.8)도 받아야 하는데 depends_on은 비어 있다. 입력 §3은 공용 기반이 "기다리는 것 없음"이라 했지만 이 엔티티는 발행 Unit의 표를 먼저 요구한다. (2) Catch가 RepositoryAnalysis 소유의 AnalysisRequest를 참조하고 RepositoryAnalysis는 Catches에 의존해, 참조 수준 순환이 생긴다. 이 순환은 기존 코드(catch_asset이 analysis_request를 참조)에 이미 있지만 Rationale에 의도된 순환으로 적혀 있지 않다. 호출 그래프만 비순환이라 표와 다이어그램이 이 두 경우를 가린다. | LinkQuestionCount를 이를 쓰는 QnA(또는 Publication)로 옮겨 공용 기반에서 발행 표 참조를 없앤다. Catch→AnalysisRequest 참조는 순환을 인정해 Rationale에 적거나, 참조 방향을 바꿀 수 있는지 정한다. 두 경우 모두 Unit 나누기가 읽는 의존에 반영한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 AiConsent / RepositoryAnalysis(AnalysisRequest.consentRef) | 10월 코드에는 분석 요청마다의 `analysis_consent` 표가 이미 있다(api/docs/member-withdrawal-deletion.md의 삭제 규칙 표). 새 AiConsent는 "첫 이용 한 번" 동의로 별도 엔티티이고, AnalysisRequest.consentRef가 어느 쪽을 가리키는지 references에 선언되어 있지 않다. 동의 엔티티가 둘이 되는지, 하나가 다른 하나를 대체하는지 알 수 없다. | 기존 분석 동의를 AiConsent로 흡수할지 병존시킬지 정하고 consentRef를 references에 선언한다. 소유는 한 컴포넌트로 한다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 FileStorage behaviour, Withdrawal behaviour | PDF 키가 "회원·발행본 접두어"라고만 적혀 있어, 발행본 접두어가 회원 접두어 아래에 들어 있는지 알 수 없다. 따로라면 탈퇴 때 "회원 접두어 전체" 삭제가 작성자의 발행 사본 PDF를 지우지 못해 FR14.9를 어긴다. Withdrawal은 Publication에 의존하지 않아 발행본별로 지울 수도 없다. | 키 배치를 정한다(예: 회원 접두어 아래에 발행본 접두어를 둔다). 별도 접두어면 Withdrawal이 Publication의 목록을 거치도록 한다. | New |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 Publication behaviour(공개 전환), Catches behaviour | 발행 때 Catches의 공개 전환과 Publication 저장이 한 트랜잭션이어야 한다(FR4.7). 두 컴포넌트가 다른 Unit·담당일 수 있는데, Catches의 인터페이스가 호출자의 트랜잭션에 참여하는지, 판정과 전환 사이에 Catch의 공개 여부·원본 비공개 확인이 바뀌는 경우를 어떻게 막는지(행 잠금 등) 적혀 있지 않다. | Catches가 호출자의 트랜잭션 안에서 판정과 전환을 하며 해당 행을 잠근다는 경계를 적는다. 계약 설계에서 시그니처로 옮긴다. | New |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 ClaudeMcp(McpConnection) | 최소 OAuth(FR13.1)의 승인 코드·토큰·클라이언트 등록이 어느 엔티티에도 없고 McpConnection.grantRef만 있다. 전체 연결 해제와 만료 재승인이 어떤 저장 상태로 성립하는지 개발자가 추정해야 한다. | 승인·토큰 상태의 소유 엔티티를 두거나, 외부 구현에 위임한다면 grantRef가 무엇을 가리키는지 한 줄로 적는다. | New |
| R-08 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md > 컴포넌트 PdfTextExtraction(entities: [], dependents Materials) | 10월 수신 경로(analysis-receiver)는 분석 전용이다. PDF 글 결과를 worker가 api로 되돌리는 경로(수신·인증·부모 외래 키 거부, FR14.10)를 누가 소유하는지 없다. Materials가 "결과 수신"을 가졌다고만 되어 있다. | 결과 수신이 Materials 쪽 책임임을 명시하고, 10월 수신 경로를 재사용하는지 새로 두는지 적는다(후순위라 계약 설계로 넘겨도 된다). | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability sensor | PASS (브리프 기재, 재실행하지 않음) | traceability.json의 US ID가 모두 선언되어 있다. US19.1·US19.3은 Deferred(build-and-test), US19.2는 N/A로 이유가 적혀 있고 stories.md의 US19.2(리허설)·US19.3(RAG 평가)와 내용이 맞는다. 제외된 9월 ID는 N/A로 처리되어 있다. |

**수작업 확인 결과.** 컴포넌트 이름은 유일하고 `component:`/`owned_by`로 쓰인 이름은 모두 선언되어 있다. 자기 의존은 없다. depends_on과 dependents는 대칭이다(Publication, PublishedIndex, BaseSummary, QnA, JdSummary, ClaudeMcp, Withdrawal, AiRun, AiGeneration, AiUsageLimit, AiConsent를 모두 대조했다). 호출 그래프는 비순환이다. 모든 엔티티는 단일 소유자와 식별자를 가지고, 인프라는 external_dependencies에만 있다. 위 Major 3은 이 구조 규칙이 아니라 선언이 가리는 참조·상태의 공백이다.

**Q1~Q4 정합.** Q1 A(Publication 하나), Q2 A(AI 공통·QnA·AiRun을 api에, worker는 분석·PDF 추출), Q3 X(S3·접두어·presigned 없음·로컬 인터페이스·역할 권한), Q4 A(설명은 Catch 속성)와 ADR-001~004가 일치한다. ADR-001~006은 모두 Context, Decision, Consequences, Alternatives Rejected를 갖고 보안 영향도 적었다. ADR-005와 ADR-006은 Q에 없는 설계자 결정이며, 그중 ADR-005의 공백이 위 Major 2다.

**근거 없이 더해진 것 점검.** 새로 얹은 기능이나 화면은 찾지 못했다. AiRun은 api에 이미 BullMQ Queue와 Worker가 있어(`api/src/analysis-queue/analysis-queue.module.ts`) 재사용이 가능하다. 다만 그 모듈은 분석 전용이라 AiRun이 별도 큐 이름을 쓸지는 기능 설계에서 정하면 된다.

### Summary

호출 구조와 Q1~Q4 반영, ADR 형식, 추적성은 건전하다. 그러나 Major 3건이 있다. PDF 글이 발행 사본에 고정되지 않아 색인이 가변 원본을 읽게 되는 점, 색인의 상태·실패·전달 방식이 비어 있는 점, 공용 기반이 발행 표를 참조하고 Catch↔분석 요청 참조 순환이 숨어 있는 점이다. 이 규칙대로는 NOT-READY이지만 모두 컴포넌트 선언과 ADR-005 수정으로 풀리는 크기라, 팀장이 승인 관문에서 수정 요청을 하면 된다.
