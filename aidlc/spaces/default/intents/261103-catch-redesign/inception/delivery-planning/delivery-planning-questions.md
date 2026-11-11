# Catch 개편 — 납품 계획 질문

## 질문의 범위

- 입력: Unit(`inception/units-generation/`), 계약(`inception/contract-design/contract-summary.md`), 요구사항·스토리, 입력 문서 `docs/ai-dlc-input-catch/CatchU_Catch_개편_입력.md` §6·§8.
- 이 계획에서 Bolt는 한 번의 구현 단계 묶음이다. 기능 설계부터 코드 생성과 시험까지를 지나 실제로 돌아가는 결과로 끝난다.
- 이미 정해진 것:
  - **첫 Bolt는 CR1이다.** 의존 그래프의 바닥이고 가장 작은 실제 연결 조각이다(첫 Unit 골격). CR1의 설계·코드가 끝나고 실제 연결 확인을 승인받기 전에는 다른 Unit을 시작하지 않는다.
  - **시한:** CR1과 CR3(제목·작업 사실·설명)은 #441 NFR3 측정 전, 늦어도 11/30까지 들어가야 한다. CR2(소속 저장)는 출시 직전 DB 초기화 전까지다(입력 §6·§8-6).
  - **담당:** 이 intent는 모두 팀장 몫이다(입력 §6). 구현은 AI 개발자 에이전트가 하고, 팀장이 단계마다 승인한다.
  - **브랜치:** 통합 브랜치 `intent/260925-intent-12`에서 만든 작업 브랜치에서 진행한다. 단계 승인마다 커밋한다. 통합 브랜치에는 12월 intent의 통합 확인 뒤에 PR과 merge commit으로 넣는다(입력 §8-5·§8-6).
  - **진행 방식:** Unit 하나씩 차례로 진행한다. 지금 기록은 Unit 하나의 설계부터 코드까지 마친 뒤 다음 Unit으로 가는 방식(unit-major, serial)이다.
  - **엔진의 순서:** CR1이 끝나면 엔진은 같은 층의 CR2와 CR3 가운데 이름 순으로 CR2를 먼저 고른다.
- 가장 단순한 안을 A로 둔다.

## Q1. [계획] CR1 다음에 CR2(소속 저장)와 CR3(AI 쪽) 가운데 무엇을 먼저 만들까요?

**배경:** 둘은 서로 기대지 않는다. CR3은 11/30 시한이고, 합치기 전에 20개 Catch 확인(FR10)과 팀장 표시가 필요하다. CR2는 시한이 더 늦지만(출시 직전 DB 초기화 전) 계약 판본과 DB 표가 바뀐다.

A. CR1 → CR2 → CR3. 엔진이 고르는 순서 그대로다. 계약·DB가 바뀌는 쪽을 먼저 끝낸다. 대신 CR2가 늦어지면 11/30 시한인 CR3이 밀린다.
B. CR1 → CR3 → CR2. 시한이 먼저 오는 쪽을 먼저 끝낸다. 더 막는 것: CR2가 늦어져도 11/30 시한을 지킨다. 늘어나는 공수: CR1이 끝난 뒤 엔진에 CR3으로 건너가라는 지시를 한 번 내려야 한다.
C. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: B

## Q2. [계획] Bolt 하나에 Unit을 몇 개 담을까요?

A. Unit 하나가 Bolt 하나다(Bolt 3개). Unit마다 확인하고 승인한다.
B. CR1을 Bolt 하나로, CR2와 CR3을 함께 Bolt 하나로 둔다. 더 막는 것: 확인과 승인이 한 번 준다. 늘어나는 공수: 두 Unit의 부딪힘을 한 번에 풀어야 하고, 한쪽이 늦으면 다른 쪽도 기다린다.
C. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: A

## Q3. [계획] 통합 브랜치에는 PR을 몇 개로 넣을까요?

**배경:** 입력 §8-5는 Unit마다 PR을 나눌 수 있다고 했다. 통합 브랜치에 넣는 것은 어느 쪽이든 12월 intent의 통합 확인 뒤다.

A. intent가 끝난 뒤 PR 하나로 넣는다. PR 관리가 가장 적다. 대신 CR2가 늦어지면 11/30 시한인 CR1·CR3도 통합 브랜치에 늦게 들어간다.
B. Unit마다 PR을 하나씩 넣는다(CR1, CR2, CR3). 더 막는 것: 시한이 다른 Unit을 따로 넣을 수 있다. 늘어나는 공수: PR이 셋이 되고, 넣을 때마다 통합 브랜치와 맞춘다.
C. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: B

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
