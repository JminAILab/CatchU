# Unit 나누기 질문·답변 (2026-10-24 재승인 뒤)

단계: units-generation. intent: `260925-intent-12`. 입력: [컴포넌트 목록](../domain-design/components.md)(덩어리 배치 출발안 포함), [결정 기록](../domain-design/decisions.md), [재승인 요구사항](../requirements-analysis/requirements.md), [사용자 스토리](../user-stories/stories.md).

## 출발점과 이미 정해진 것

- 입력 §3 「11월 진행 방식」의 다섯 덩어리(공용 기반 / 발행·링크 / RAG / Claude MCP / 저장소·JD)를 출발안으로 쓴다. 공용 기반은 팀장이 맡고, 다른 Unit의 담당은 납품 계획에서 정한다.
- 입력 §2-3: 후순위(PDF 자료, 받은 사람의 Claude 연결)는 별도 Unit으로 떼고 다른 Unit이 기다리지 않게 둔다. 그래서 PDF Unit과 받은 사람 Claude 연결 Unit을 따로 둔다.
- 배포 단위는 기존 web·api·worker 그대로이며, Unit은 기능 단위로 이 셋에 걸친다(Unit마다 새 배포 단위를 만들지 않는다).
- 이 단계는 Unit 사이의 의존(DAG)만 정한다. 무엇을 먼저 만들지와 담당은 납품 계획에서 정한다.
- 이번 계획(mvp)은 첫 Unit을 "작게 실제로 연결해 돌려 보는 통합 경로(walking skeleton)"로 만들도록 되어 있다. 팀 관행의 '최소 연결 첫 결과'(11/13 1차 통합 확인)와 같은 뜻으로 본다.

## Q1. [설계] 발행본 색인(PublishedIndex)을 어느 Unit에 둘까요?

배경: 조각 나누기·위치 기록은 발행 트랜잭션 안에서 Publication이 PublishedIndex를 불러 한다(ADR-005). 입력은 RAG 덩어리에 "발행본 색인·검색"을, RAG가 발행을 기다린다고 두었다.

A. 발행·링크 Unit에 둔다 — 조각 나누기·임베딩·색인 상태·[검색 다시 준비]까지 발행 Unit이 맡고, RAG Unit은 그 검색을 써서 질의응답·기본 요약을 만든다. 발행 트랜잭션이 한 Unit 안에 있어 Unit 사이 의존이 한 방향(RAG→발행)으로 남는다. 발행 Unit이 조금 커진다.
B. RAG Unit에 둔다 — 입력대로 색인을 RAG가 맡는다. 대신 발행 Unit이 RAG Unit의 조각 나누기를 불러야 해서 발행↔RAG가 서로 기다리는 순환이 생기므로, 계약 설계에서 조각 나누기 인터페이스를 먼저 고정하고 한쪽을 합성 구현으로 시작해야 한다.
X. Other (please specify)

[Answer]: X. PublishedIndex 전체(조각 나누기·위치, 임베딩, 색인 상태·시한, [검색 다시 준비], 의미 검색)를 독립된 "발행본 색인·검색" Unit으로 둔다. 발행·링크 Unit은 이 Unit에 의존하고(발행 트랜잭션 안에서 조각 나누기를 부른다), 질의응답·기본 요약을 묶은 "RAG 응답" Unit은 발행·링크와 색인·검색 Unit에 의존한다. 두 RAG Unit은 납품 계획에서 같은 담당자가 순서대로 맡도록 배정한다. 색인·검색 Unit의 선행 조건으로 발행본·항목의 최소 DB 계약과 사본·트랜잭션 전달 계약을 계약 설계에서 먼저 고정한다. 승인된 FR4.7·ADR-005·ADR-007은 바꾸지 않는다.

## Q2. [설계] 텍스트 자료(Materials의 텍스트 부분)를 어느 Unit에 둘까요?

배경: 입력은 텍스트 자료를 Claude MCP 덩어리에 두고, 발행·링크가 텍스트 자료를 기다린다고 했다. 발행은 텍스트 자료를 고르고 복사하며, 본인 Claude 연결은 텍스트 자료를 읽는다.

A. Claude MCP Unit에 둔다(입력대로) — 발행 Unit이 Claude MCP Unit의 텍스트 자료를 기다린다. Claude MCP Unit은 공용 기반만 기다린다.
B. 발행·링크 Unit에 둔다 — 발행이 다른 Unit을 덜 기다리지만, 본인 Claude 연결이 발행 Unit을 기다리게 되고 입력의 덩어리 배치와 달라진다.
X. Other (please specify)

[Answer]: B. 발행·링크 Unit에 둔다. 텍스트 자료는 Catch 설명과 같은 편집 규칙(FR2.4)을 따르므로 같은 Unit에서 만든다. 본인 Claude 연결의 텍스트 자료 읽기 도구는 텍스트 자료 표에 의존하며, 그 표 모양을 계약 설계에서 먼저 고정해 Claude MCP Unit이 시험용 자료로 먼저 개발할 수 있게 한다. 공수 균형(Claude MCP 덩어리가 1인 가용을 넘음)도 이유로 적는다.

## Q3. [설계] 첫 Unit(작게 실제로 연결해 돌려 보는 통합 경로)을 무엇으로 할까요?

배경: 첫 Unit은 다른 Unit 없이도 실제로 끝까지 돌아가는 작은 통합 경로여야 한다. 입력은 "AI 생성 공통 관문(응답을 항목으로 묶기·인용 보존·원문 위치 연결·거부 사례 처리)"을 실제 연결 때 다시 보라고 했고, 공용 기반은 다른 덩어리를 기다리지 않는다.

A. 공용 기반 Unit — 공용 계약과 함께 AI 생성 공통을 실제 Claude 인용 호출로 끝까지 돌려 관문 네 가지를 확인하는 경로를 포함한다. 다른 Unit이 모두 이것을 기다리므로 가장 먼저 필요하다.
B. 발행·링크의 최소 경로 — Catch 설명 하나와 텍스트 자료 하나를 발행해 받은 사람이 여는 데까지를 첫 Unit으로 한다. 사용자 흐름은 더 잘 보이지만 공용 계약·텍스트 자료가 먼저 있어야 해 공용 기반을 쪼개야 한다.
X. Other (please specify)

[Answer]: X. A로 하되 범위와 대기를 좁힌다. 첫 Unit은 공용 기반 전체가 아니라 그중 "공용 계약과 AI 생성 공통을 실제 Claude 인용 호출로 끝까지 돌려 관문 네 가지(항목 묶기·인용 보존·원문 위치 연결·거부 사례 처리)를 확인하는 최소 경로"로 한다. 다른 Unit은 이 경로가 끝나기를 기다리지 않고, 계약 설계에서 고정한 공용 계약과 합성 제공자로 11/2부터 병행 착수한다(입력 §2-6). 각 담당 Unit은 팀 관행대로 처음 실제로 연결될 때 '최소 연결 첫 결과'를 한 번 승인받는다.

## Consolidated Summary Confirmation

- Unit 10개(모두 kind: service, 배포 단위는 기존 web·api·worker): U1 AI 생성 관문 최소 경로(첫 Unit), U2 공용 기반 나머지(AiRun·AiUsageLimit·AiConsent·FileStorage·Withdrawal·StartGuide·근거 검사 규칙·통합 확인 진행), U3 발행본 색인·검색(PublishedIndex 전체), U4 발행·링크(Catch 설명·텍스트 자료·Publication), U5 RAG 응답(질의응답·기본 요약·RAG 평가), U6 Claude MCP 본인 연결, U7 저장소·분석(RepositoryAnalysis 변경), U8 PDF 자료(후순위), U9 받은 사람의 Claude 연결(후순위), U10 JD(JD 관리·JD 요약). U7을 둘로 나누고 U8·U9 번호는 그대로 둔다(Q4, 2026-10-25).
- 의존(DAG): U4→U3, U5→U4·U3, U10→U4·U3, U8→U4, U9→U6·U4. U1·U2·U3·U6·U7은 다른 Unit을 기다리지 않는다. U10→U4는 JD 요약이 링크 조건 판정과 발행본 읽기를 Publication(U4)에서 받기 때문이다(요약 확인 때 팀장 수정). 저장소 분석은 Publication·PublishedIndex에 의존하지 않아 U7은 기다리는 Unit이 없다(Q4).
- U1 위험 문장은 "U1 관문 결과에 따라 U5·U7·U10의 AI 부분이 바뀔 수 있다"로 고친다(Q4). 그 밖의 Unit 정의·의존·대응은 바꾸지 않는다.
- 의존 YAML의 `depends_on`은 모든 Unit에서 빈 목록으로 둔다. 팀 방식의 Unit 맡기가 `depends_on`의 Unit이 끝나기를 기다리게 하기 때문이다. 위 통합·완료 전제(U4→U3, U5→U4·U3, U10→U4·U3, U8→U4, U9→U6·U4)는 의존 표와 그림에만 남긴다. Unit 정의·스토리 배정·계약 내용은 바꾸지 않고, 첫 Unit(U1) skeleton 설정도 그대로 둔다(Q5, 2026-10-26).
- 공용 기반(U1·U2)에 대한 의존은 DAG에 넣지 않고, 계약 설계에서 고정한 공용 계약과 합성 제공자로 11/2부터 병행 착수한다(입력 §2-6, Q3). U6은 텍스트 자료 표 모양을 계약 설계에서 먼저 고정해 시험용 자료로 개발하고 U4와는 통합 때 만난다(Q2). U3의 선행 조건인 발행본·항목의 최소 DB 계약과 사본·트랜잭션 전달 계약도 계약 설계에서 먼저 고정한다(Q1).
- U3·U5는 납품 계획에서 같은 담당자가 순서대로 맡도록 배정한다(Q1). 각 담당 Unit은 처음 실제 연결 때 '최소 연결 첫 결과'를 한 번 승인받는다(Q3).
- 확인할 점: 이번 계획(mvp)은 첫 Unit을 먼저 끝내고 승인받은 뒤 나머지를 진행하도록 되어 있다. 다른 Unit을 병행 착수하려면 납품 계획에서 팀 방식(담당자가 Unit을 맡아 진행)으로 정해야 한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct

## Requested Changes Feedback

What should change?

[Answer]: 의존에 U7→U4를 더한다. U7의 JD 요약은 링크 조건 판정과 발행본 읽기를 Publication(U4)에서 받는다(components.md JdSummary 의존). 나머지는 그대로 둔다.

## Q4. [설계] 저장소·JD Unit(U7)을 나눌까요? (2026-10-25 Unit 나누기로 되돌아와 추가)

배경: 납품 계획에서 담당을 정하기 전에, 팀장이 Unit 나누기로 되돌아와 U7 하나만 나누기로 했다. 컴포넌트 목록에서 저장소 분석(RepositoryAnalysis)은 Publication·PublishedIndex에 의존하지 않고, JD 요약(JdSummary)만 두 컴포넌트에 의존한다. 그래서 나누면 U7→U4·U3 의존은 JD 쪽으로만 간다.

A. 나누지 않는다 — U7(저장소·JD)을 그대로 둔다.
B. U7을 U7(저장소·분석)과 새 U10(JD)으로 나눈다 — U8·U9 번호는 그대로 두고, U7은 기다리는 Unit이 없으며, U10은 U4·U3에 의존한다.
X. Other (please specify)

[Answer]: B. 팀장 지시(2026-10-25): "응, Unit 나누기로 되돌아가자. 범위는 이것만이다: U7을 U7(저장소·분석)과 새 U10(JD)으로 나누고, 그에 따라 Unit 표·U7 절·U10 절, 의존(U7은 기다리는 Unit 없음, U10은 U4·U3), 스토리·Unit 대응, traceability, U1 위험 문장(U5·U7·U10)을 고친다. 계약 설계는 소비 Unit 이름을 U7/U10으로 나누고 하루 횟수 소비 Unit에 U10을 더하는 것만 하며 계약 내용은 바꾸지 않는다. 납품 계획 질문지는 새 Unit 목록으로 다시 쓴다. 그 밖의 내용은 바꾸지 않는다. 되돌린 뒤 엔진이 실제로 무엇을 다시 열었는지 먼저 알려 달라."

## Q5. [설계] 의존 YAML의 `depends_on`을 어떻게 둘까요? (2026-10-26 납품 계획 중 Unit 나누기로 되돌아와 추가)

배경: 팀 방식에서 Unit 맡기 규칙은 `depends_on`에 적힌 Unit이 끝나기 전에는 그 Unit을 맡지 못하게 막는다. 승인된 의존 문서는 화살표를 "착수 전제"가 아니라 "통합·완료 전제"로 정했고, 모든 Unit은 11/2부터 병행 착수한다. 지금 YAML에는 U4→U3, U5→U4·U3, U8→U4, U9→U6·U4, U10→U4·U3이 적혀 있어 이 Unit들을 11/2에 맡을 수 없다.

A. 그대로 둔다 — YAML이 통합·완료 전제를 그대로 적는다. 대신 U4·U5·U8·U9·U10은 앞 Unit이 끝나야 맡을 수 있어 병행 착수와 어긋난다.
B. YAML의 `depends_on`을 모든 Unit에서 빈 목록으로 둔다 — 통합 때 필요한 Unit은 의존 표와 그림(통합·완료 전제)에만 남긴다. Unit 정의·스토리 배정·계약 내용은 바꾸지 않고, 첫 Unit(U1) skeleton 설정도 그대로 둔다.
X. Other (please specify)

[Answer]: B. 팀장 지시(2026-10-26): "납품 계획을 마치기 전에 Unit 나누기로 한 번 더 돌아가자. 이유: 팀 방식에서 aidlc-unit.ts의 맡기 규칙은 depends_on에 적힌 Unit이 끝나기 전에는 그 Unit을 맡지 못하게 막는다. 승인된 문서는 의존을 "통합·완료 전제"로 정했으므로, 의존 YAML의 depends_on은 모든 Unit에서 빈 목록으로 두고, 통합 때 필요한 Unit은 지금의 표와 그림(통합·완료 전제)에만 남긴다. Unit 정의·스토리 배정·계약 내용은 바꾸지 않는다. 첫 Unit(U1) skeleton 설정은 그대로 둔다(U1은 팀 방식 시험으로 다른 Unit보다 먼저 합친다). 되돌린 뒤 엔진이 무엇을 다시 열었는지 먼저 알려 달라."
