# 새 Catch — 일정 계획 질문

## 질문의 범위

- 입력:
  - Unit `inception/units-generation/`(NC1~NC3, NC2·NC3이 NC1에 기댐)
  - 계약 `inception/contract-design/contract-summary.md`
  - 요구사항·이야기·다듬은 화면·구성 요소
  - 범위 문서 `ideation/scope-definition/scope-document.md` 「만드는 순서」, 제약 목록 `ideation/feasibility/constraint-register.md`
- **Bolt란:** 이 계획에서 Bolt는 Unit 하나를 기능 설계부터 코드와 시험까지 한 번에 지나, 실제로 돌아가는 결과로 끝나는 구현 묶음이다.
- 이미 정해진 것:
  - **첫 Bolt는 NC1이다.** 의존 그래프의 바닥이다. 이 작업 범위(mvp)는 첫 Unit을 가장 작은 실제 연결 조각(walking skeleton, 다른 Unit 없이도 끝에서 끝까지 돌아가는 첫 결과)으로 먼저 끝내고 승인받게 한다. NC1이 끝나고 실제 연결 확인을 승인받기 전에는 다른 Unit을 시작하지 않는다. 팀 규칙 「최소 연결 첫 결과」도 Unit마다 한 번 승인받게 한다.
  - **시한:** 모든 코드 PR은 11/30 안에 통합 브랜치 `intent/260925-intent-12`에 들어간다(제약 12). NC3은 출시 직전 DB 초기화 전에 들어가야 한다(FR15.3).
  - **담당:** 모두 팀장 몫이다(제약 11). 구현은 AI 개발자가 하고 팀장이 단계마다 승인한다. U3·U4·U5·U6·U10 담당은 자기 영역을 건드린 PR에서 확인한다.
  - **진행 방식:** Unit 하나의 설계부터 코드까지 마친 뒤 다음 Unit으로 간다(지금 기록: unit-major, serial, 확인 단계 켜짐). 만드는 사람이 한 명이라 나란히 만들지 않는다.
  - **선행 PR:** 범위 문서의 선행 PR(Catch 개편 CR1~CR3, #487, #488)은 이미 이 작업 브랜치에 들어와 있다.
  - **엔진의 순서:** NC1이 끝나면 엔진은 같은 층의 NC2와 NC3 가운데 이름 순으로 NC2를 먼저 고른다.
- 가장 단순한 안을 A로 둔다.

## Q1. [계획] NC1 다음에 NC2(면접관 사본 칸)와 NC3(다시 볼 곳 사실) 가운데 무엇을 먼저 만들까요?

**배경:** 둘은 서로 기대지 않는다. 둘 다 11/30 시한이다. NC3에는 걱정거리가 더 많다.
- 결과 메시지 판본 올림과 api·worker 함께 배포
- 지운 파일 식별값을 실제 GitHub 응답으로 확인하는 일
- 고지 4절 문구 승인
- 출시 직전 DB 초기화 전 반영

NC2는 web·api 안에서 끝난다.

A. NC1 → NC2 → NC3. 엔진이 고르는 순서 그대로이고, 범위 문서 「같이 풀리면 1단계 → 2단계 → 3단계」와 같다. 대신 NC3의 걱정거리가 가장 늦게 드러난다. (가장 단순)
B. NC1 → NC3 → NC2. 걱정거리가 많은 쪽을 먼저 끝낸다. 더 막는 것은 NC3이 늦어져 DB 초기화나 11/30에 걸리는 일이다. 늘어나는 공수는 NC1이 끝난 뒤 엔진에 NC3으로 건너가라고 한 번 지시하는 것이다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q2. [계획] Bolt 하나에 Unit을 몇 개 담을까요?

A. Unit 하나가 Bolt 하나다(Bolt 3개). Unit마다 확인하고 승인한다. (가장 단순)
B. NC1을 Bolt 하나로, NC2와 NC3을 함께 Bolt 하나로 둔다. 확인과 승인이 한 번 준다. 대신 두 Unit의 겹침을 한 번에 풀어야 하고, 한쪽이 늦으면 다른 쪽도 기다린다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q3. [계획] 통합 브랜치에는 언제, PR 몇 개로 넣을까요?

**배경:** 제약 13은 이 intent의 코드 PR을 12월 intent의 1차 통합 확인(개발 서버, 목표 11/13) 뒤에 넣게 했다. Catch 개편은 Unit마다 PR을 나눠 그 확인 뒤에 넣기로 했다.

A. Unit마다 PR 하나씩(3개)으로 넣는다. 1차 통합 확인이 끝난 뒤, 끝난 Unit부터 차례로 넣는다. 제약 13과 Catch 개편 방식 그대로이고, 먼저 끝난 Unit이 11/30 전에 일찍 들어간다. (가장 단순)
B. intent가 끝난 뒤 PR 하나로 넣는다. PR 관리가 가장 적다. 대신 한 Unit이 늦어지면 나머지도 함께 늦게 들어가고, 담당 확인(U3·U4·U5·U6·U10)을 한 PR에서 모두 받아야 한다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

**덧붙임(사람 원문):** 1차 통합 확인은 이미 끝났다. 2026-11-09 개발 서버에서 돌려 결과를 PR #498로 확인 표에 남겼고(17행, 통과 7·미실행 10), Catch 개편 PR(#499~#502)도 그 뒤 같은 날 들어갔다. 그래서 「목표 11/13」을 기다리지 않고, Unit이 끝나 확인을 마치면 바로 그 Unit의 PR을 넣는다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
