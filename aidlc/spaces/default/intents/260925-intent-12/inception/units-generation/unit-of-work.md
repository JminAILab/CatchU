# CatchU 12월 범위 — Unit 정의

작성일: 2026-10-24. 고침: 2026-10-26 U7을 U7(저장소·분석)과 U10(JD)으로 나눔(Q4). 입력: [컴포넌트 목록](../domain-design/components.md)(components), [결정 기록](../domain-design/decisions.md)(decisions), [재승인 요구사항](../requirements-analysis/requirements.md)(requirements), [사용자 스토리](../user-stories/stories.md)(stories), [Unit 나누기 질문·답변](units-generation-questions.md). 의존은 [unit-of-work-dependency.md](unit-of-work-dependency.md), 스토리 대응은 [unit-of-work-story-map.md](unit-of-work-story-map.md)다.

## 공통 전제

- 배포 단위는 기존 web·api·worker 그대로다. Unit은 기능 단위로 이 셋에 걸치며, Unit마다 새 배포 단위를 만들지 않는다(deployment model: 모든 Unit이 shared).
- 모든 Unit의 kind는 `service`다. 각 Unit이 api·web(·worker) 코드를 함께 바꿔 배포되는 기능을 만든다.
- Unit 사이 의존은 "착수 전제"가 아니라 "통합·완료 전제"다. 모든 Unit은 계약 설계 뒤 11/2부터 병행 착수한다([unit-of-work-dependency.md](unit-of-work-dependency.md)).
- 공용 기반(U1·U2)에 대한 의존은 Unit 사이 DAG에 넣지 않는다. 계약 설계에서 고정한 공용 계약과 합성 제공자(외부 AI·임베딩 대역)로 11/2부터 병행 착수한다(입력 §2-6, Q3).
- 각 담당 Unit은 팀 관행대로 처음 실제로 연결될 때 '최소 연결 첫 결과'를 한 번 승인받는다(team.md, Q3).
- 후순위 Unit(U8·U9)은 다른 Unit이 기다리지 않는다(입력 §2-3, Q119). 담당·순서는 납품 계획에서 정한다.

## Unit 목록

| Unit ID | Directory | 이름 | Kind | 복잡도 | 지위 |
|---|---|---|---|---|---|
| U1 | u1-ai-generation-gate | AI 생성 관문 최소 경로(첫 Unit) | service | S | 필수 |
| U2 | u2-shared-foundation | 공용 기반 | service | L | 필수 |
| U3 | u3-published-index | 발행본 색인·검색 | service | M | 필수 |
| U4 | u4-publication-link | 발행·링크 | service | L | 필수(PDF 부분은 U8) |
| U5 | u5-rag-answer | RAG 응답 | service | M | 필수 |
| U6 | u6-claude-mcp | Claude MCP 본인 연결 | service | M | 필수 |
| U7 | u7-repository-analysis | 저장소·분석 | service | M | 필수 |
| U8 | u8-pdf-materials | PDF 자료 | service | M | 후순위 |
| U9 | u9-recipient-claude | 받은 사람의 Claude 연결 | service | S | 후순위 |
| U10 | u10-jd | JD | service | M | 필수 |

U10은 2026-10-26에 U7(저장소·JD)에서 JD 부분을 떼어 만들었다. U8·U9 번호는 그대로 둔다(Q4).

복잡도는 Unit 사이의 상대 크기다. 일수·공수 추정이 아니다.

## U1 — AI 생성 관문 최소 경로 (u1-ai-generation-gate)

- **설명:** 공용 계약의 최소 부분과 AiGeneration의 인용 연결을 실제 Claude 인용 호출로 끝까지 돌려, 관문 네 가지(응답을 항목으로 묶기·인용 보존·원문 위치 연결·거부 사례 처리)를 확인하는 작은 통합 경로다. 이번 계획의 첫 Unit(walking skeleton)이다.
- **컴포넌트:** AiGeneration(인용 연결 핵심), 공용 계약의 최소 부분.
- **책임:** 인용 단위(줄) 넘기기와 인용 보존, 원문 위치 연결, 거부 사례 처리의 실제 동작 확인. 통과하지 못하면 원문 열람부터 확보하고 다른 생성 방식은 다시 산정해 범위를 정한다(요구사항 A04).
- **경계:** 기계 대조·버림 규칙 전체와 세 AI 기능의 연결은 U2·U5·U10이 맡는다. 다른 Unit은 이 경로가 끝나기를 기다리지 않는다. 위험: U1 관문 결과에 따라 U5·U7·U10의 AI 부분이 바뀔 수 있다(요구사항 A04). 인용 관문은 10/24 사전 시험에서 통과했다.
- **구현 메모:** api(TypeScript)에 둔다(ADR-002). 모델은 Haiku 5.5.

## U2 — 공용 기반 (u2-shared-foundation)

- **설명:** 팀장이 맡는 공용 기반의 나머지다.
- **컴포넌트:** AiGeneration(근거 기계 대조·버림·출처 표시 규칙), AiRun, AiUsageLimit, AiConsent, FileStorage, Withdrawal, StartGuide. 기존 MemberAccount·GitHubConnection의 탈퇴·로그인 대상 설정 변경도 여기서 한다.
- **책임:** 근거 검사 공통, 백그라운드 실행 공통(처리 시한은 상태를 읽을 때 판정), 계정당 하루 실행 제한(한국 시간 자정 경계), 첫 이용 동의와 고지, 파일 저장 인터페이스(로컬/S3), 탈퇴 순서와 실패 응답, 최소 시작 안내·기본 오류·404, 외부 사용자 Google 로그인 대상 설정, 통합 확인 진행(FR19).
- **경계:** 공용 인프라(RDS pgvector, SSM 비밀값, `dev-ci` 필수 검사, EKS, S3 버킷·역할)는 이 intent 밖의 팀장 공용 기반 작업이다(C07). S3 버킷·권한은 PDF Unit(U8)이 시작될 때 준비한다(ADR-003). FileStorage는 인터페이스와 로컬 구현만 U2에 두고 S3 구현은 U8에 둔다. 그래서 U2의 탈퇴 확인은 로컬 저장소 기준이고, S3 접두어 삭제 확인은 U8이 맡는다.
- **구현 메모:** 공용 기반 PR은 그것을 가져다 쓰는 사람이 리뷰한다(입력 §3).

## U3 — 발행본 색인·검색 (u3-published-index)

- **설명:** PublishedIndex 전체다(Q1).
- **컴포넌트:** PublishedIndex.
- **책임:** 발행 트랜잭션 안에서 받은 사본의 조각 나누기·위치 기록, 커밋 뒤 임베딩 작업 처리(Voyage AI, pgvector), 색인 상태(대기·완료·실패)와 처리 시한, [검색 다시 준비] 처리(ADR-007), 의미 검색.
- **경계:** 발행본·항목의 최소 DB 계약과 사본·트랜잭션 전달 계약을 계약 설계에서 먼저 고정하는 것이 선행 조건이다. FR4.7·ADR-005·ADR-007은 바꾸지 않는다.
- **구현 메모:** U5와 같은 담당자가 순서대로 맡는다(Q1, 납품 계획에서 배정).

## U4 — 발행·링크 (u4-publication-link)

- **설명:** Catch 설명, 텍스트 자료, 고정 발행본과 링크다.
- **컴포넌트:** Catches(작성자 설명·발행 때 공개 전환 호출), Materials(텍스트 부분), Publication.
- **책임:** Catch 설명 작성·저장 실패 처리, 텍스트 자료 등록·수정, Catch·자료 직접 선택과 순서, 비공개 Catch의 발행 시 공개 전환(10월 로직을 발행 트랜잭션 안에서), 발행 트랜잭션 안에서 U3의 조각 나누기 호출, 커밋 뒤 작업 등록, 링크 조건 판정, 발행 후 확인, 링크 중지·만료, 발행본 삭제, [검색 다시 준비] 버튼.
- **경계:** 텍스트 자료는 Catch 설명과 같은 편집 규칙(FR2.4)을 따르므로 이 Unit에 둔다(Q2). 텍스트 자료 표 모양과 Catch 설명 속성(10월 `catch_asset`에 칸이 없어 새로 더함)은 계약 설계에서 먼저 고정해 U6이 시험용 자료로 개발할 수 있게 한다. PDF 부분(선택·사본·복사)은 U8이다.
- **구현 메모:** 10월 `share-links`·`catches` 모듈을 넓힌다(ADR-001, ADR-004).

## U5 — RAG 응답 (u5-rag-answer)

- **설명:** 받은 사람이 보는 AI 응답이다.
- **컴포넌트:** QnA, BaseSummary.
- **책임:** 대화형 질의응답(SSE, 링크당 하루 질문 횟수는 Redis), AI 기본 요약(생성·다시 만들기·상태), 색인 준비 전·실패 때의 "아직 쓸 수 없음" 표시, RAG 품질 평가(NFR3, 입력 §3의 RAG 덩어리).
- **경계:** 검색은 U3, 링크 조건·사본은 U4, 근거 검사는 U1·U2의 계약을 쓴다.
- **구현 메모:** U3과 같은 담당자가 순서대로 맡는다(Q1).

## U6 — Claude MCP 본인 연결 (u6-claude-mcp)

- **설명:** 구직자 본인의 Claude 웹·Desktop 연결이다.
- **컴포넌트:** ClaudeMcp(연결·OAuth·동의·해제·빈도 제한, 본인 조회 도구).
- **책임:** 최소 OAuth(MCP 공식 SDK 인증 도구, 갱신 토큰 없음), 전체 해제(회원 기준), 첫 연결 동의, Catch 조회·텍스트 자료 조회 도구, 회원 기준 요청 빈도·응답 크기 제한, 실제 Claude 연결 확인(웹 전체·Desktop 연결).
- **경계:** 텍스트 자료 표는 U4 소유이며 계약 설계에서 먼저 고정한 모양으로 시험용 자료를 써서 개발한다. U4와는 통합 때 만난다. 받은 사람 도구는 U9다.
- **구현 메모:** Claude MCP 덩어리가 1인 가용을 넘어 텍스트 자료를 U4로 옮겼다(Q2). 계약 설계가 늦으면 계약을 기다리지 않는 Claude 연결부터 시작한다(입력 §3).

## U7 — 저장소·분석 (u7-repository-analysis)

- **설명:** 저장소 등록·분석 변경이다.
- **컴포넌트:** RepositoryAnalysis(등록 검사 단순화·수집 상한·이유별 거부·재요청).
- **책임:** 관계 사전 검사 없는 등록과 분석 중 본인 커밋 확인, 수집 상한 상향(커밋 약 500개 실측), 실제 분석 확인(팀장 계정 CatchU 저장소와 거부 사례).
- **경계:** 기다리는 Unit이 없다. RepositoryAnalysis는 Publication·PublishedIndex에 의존하지 않는다(Q4).
- **구현 메모:** 10월 분석 경로를 그대로 재사용한다(ADR-006). 계약을 기다리지 않는 저장소 등록부터 시작할 수 있다(입력 §3).

## U8 — PDF 자료 (u8-pdf-materials) · 후순위

- **설명:** PDF 업로드·원본 열람·쪽별 글 추출과 PDF가 발행본에 들어가는 부분이다.
- **컴포넌트:** Materials(PDF 부분, 추출 결과 수신·처리 시한), PdfTextExtraction(worker), Publication의 PDF 부분(추출 끝난 PDF만 선택, 쪽별 글 사본 고정, 트랜잭션 앞 S3 복사, 롤백 때 발행본 접두어 삭제), FileStorage의 S3 구현.
- **책임:** FR3.1(PDF 부분)·FR3.3·FR3.4와 PDF가 걸친 수용 기준의 PDF 부분. 탈퇴·발행본 삭제 때 S3 접두어가 실제로 지워지는지 확인(US14.1·US5.2의 S3 부분).
- **경계:** 발행은 PDF를 기다리지 않는다(입력 §2-3). 11/13 1차 통합 확인에서 계속할지 뺄지 정한다. 빼도 승인 기준을 어기지 않는다.

## U9 — 받은 사람의 Claude 연결 (u9-recipient-claude) · 후순위

- **설명:** 링크를 받은 사람이 비밀번호 없는 링크를 Claude에서 읽는 부분이다.
- **컴포넌트:** ClaudeMcp의 받은 링크 읽기 도구, Publication의 "Claude에서 분석하기" 버튼과 작성자 안내.
- **책임:** FR13.3. 호출마다 링크 조건 확인, 비밀번호 링크는 웹 안내.
- **경계:** 빼면 보호 흐름의 MCP 차단 확인과 시작 안내의 해당 부분이 빠진다(FR19.1, FR16.3). 11/13에 계속할지 뺄지 정한다.

## U10 — JD (u10-jd)

- **설명:** JD 기능이다. 2026-10-26에 U7(저장소·JD)에서 떼었다(Q4).
- **컴포넌트:** JdManagement, JdSummary.
- **책임:** JD 관리 페이지, JD 요구사항별 요약(백그라운드, 색인 준비 전·실패 때 실행하지 않음).
- **경계:** 링크 조건 판정과 발행본 읽기는 U4의 Publication에서 받고(요약 확인 때 팀장 수정), 근거 검색은 U3에서 받는다.
- **구현 메모:** JD 저장은 U3·U4 없이 시작할 수 있다. U3·U4 의존은 JD 요약의 통합·완료에만 걸린다.
