# Catch 개편 — 스토리 배정

입력: 스토리 `inception/user-stories/stories.md`(US1.1~US4.4), `unit-of-work.md`. 셋째 칸은 Unit 폴더 이름이다. Unit ID(CR1~CR3)는 폴더 이름의 앞부분이다.

## 배정표

| Story | Unit ID | Unit 폴더 | 요구사항 |
|---|---|---|---|
| US1.1 | CR2 | cr2-commit-assignment | FR1.1, FR1.2, FR1.3, FR1.4, FR1.6, FR1.7, NFR4 |
| US1.2 | CR2 | cr2-commit-assignment | FR1.5 |
| US1.3 | CR2 | cr2-commit-assignment | FR1.8 |
| US1.4 | CR1 | cr1-readable-catch | FR2.1 |
| US2.1 | CR1 | cr1-readable-catch | FR5.1, FR5.2, FR5.7 |
| US2.2 | CR1; CR3 | cr1-readable-catch; cr3-ai-drafts | FR6.1, FR6.2, FR6.3 |
| US2.3 | CR3 | cr3-ai-drafts | FR4.1, FR4.3, FR4.4, FR4.5, FR5.3~FR5.7, NFR1, NFR2 |
| US3.1 | CR3 | cr3-ai-drafts | FR7.1~FR7.5, FR8.2 |
| US3.2 | CR1 | cr1-readable-catch | FR3.1, FR3.2, FR3.3 |
| US3.3 | CR3 | cr3-ai-drafts | FR4.2 |
| US4.1 | CR1 | cr1-readable-catch | FR8.1 |
| US4.2 | CR1 | cr1-readable-catch | FR8.3 |
| US4.3 | CR1 | cr1-readable-catch | FR8.4 |
| US4.4 | CR3 | cr3-ai-drafts | FR9.1, FR9.2, NFR1 |

## 여러 Unit에 걸친 스토리

| Story | 나눔 |
|---|---|
| US2.2 | CR1이 첫 줄(종류)과 규칙으로 정한 둘째 줄을 만든다(AC2.2.1~AC2.2.3). CR3은 판정이 "무엇을 했는지"에서 부실이라고 할 때만 둘째 줄을 지우고, "전체를 나타내나"에서만 떨어지면 둘째 줄을 그대로 둔다(AC2.2.5). 두 Unit 모두 작업 사실에 Claude 출력이 들어가지 않게 한다(AC2.2.4). |

`traceability.json`은 스토리마다 대상을 하나만 받는다. 그래서 US2.2의 대상은 첫 줄·둘째 줄을 만드는 CR1(`cr1-readable-catch`)로 두었다. CR3이 이 스토리의 일부(AC2.2.4·AC2.2.5)를 맡는다는 것은 위 배정표가 정본이다.

## 스토리가 없는 요구사항

| 요구사항 | Unit | 근거 |
|---|---|---|
| FR10.1·FR10.2, NFR3 | CR3 | AI 쪽을 켜기 전 팀장 확인 절차다. CR3의 시험 단계에서 다룬다 |
| NFR5 | CR3 | OpenAI 판정 키 보관(SSM) |
| NFR6 | CR2 | 결과 메시지 판본과 api·worker 동시 배포 |
| NFR7 | CR1; CR2; CR3 | worker 문서 크기. 각 Unit의 기능 설계에서 다룬다 |

## Unit 안의 구현 순서

- **CR1:** US1.4(이슈 나누기 끄기) → US2.1(기록의 글) → US2.2(작업 사실) → US3.2(재료 순서) → US4.1·US4.2·US4.3(화면).
- **CR2:** US1.1(소속 기록·맥락 조회·제외·결과 판본) → US1.3(PR 없는 새 커밋) → US1.2(기존 Catch 내용 보존).
- **CR3:** US3.3(재료 판정)·US2.3(판정 공급자와 AI 제목) → US2.2의 둘째 줄 지우기 → US3.1(설명 초안과 칸 숨기기) → US4.4(고지).
  - 판정 공급자 자리는 US2.3에서 만들고, US3.3이 같은 자리를 쓴다.

## 배정 확인

- 스토리 14개가 모두 배정됐다(CR1 7개, CR2 3개, CR3 5개, 겹침 US2.2 하나).
- 세 Unit 모두 배정된 스토리가 있다.
