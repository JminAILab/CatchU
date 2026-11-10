# 새 Catch — 사용자 이야기 계획과 질문

입력: 승인된 요구사항 `inception/requirements-analysis/requirements.md`(FR1~FR15, NFR1~NFR8, 수락 기준 AC1.1~AC14.3), 코드 지식 `aidlc/spaces/default/codekb/CatchU/business-overview.md`·`component-inventory.md`.

## 이야기 계획

- **필요성:** 실행한다. 사람이 쓰는 화면이 넷(지원자 목록·상세, 발행 화면, 면접관 발행본)이고 사람이 둘(지원자, 면접관)이다(`user-stories-assessment.md`).
- **사람(페르소나):** 지원자(Catch 주인), 면접관(Catch를 받아 보는 사람). 의도 설명 「Target Customer」의 둘 그대로이고 새로 만들지 않는다.
- **형식:** 「[사람]로서 [하고 싶은 것]을 하고 싶다. 그래야 [얻는 것]」. INVEST를 지키고, 수락 기준은 Given/When/Then이며 요구사항의 AC를 옮겨 쓴다.
- **우선순위:** 요구사항이 모두 Must이므로 이야기도 모두 Must다(할 일 목록 「우선순위 방식」).
- **ID:** 이야기 `US{묶음}.{순번}`, 수락 기준 `AC{묶음}.{순번}.{순번}`.

## Q1. [기획] 이야기를 묶는 방식

요구사항은 할 일 (1)~(11)과 단계(1~3)로 나뉘어 있다. 이야기 묶음을 어떻게 나눌지 정한다. 묶음은 뒤의 Unit 나누기와 일정 계획이 읽는다.

A. 할 일 (1)~(11)마다 한 묶음으로 한다(US1~US11). 묶음 안은 화면 동작 하나씩 이야기로 나눈다. 범위 문서·할 일 목록·요구사항과 번호가 같아 따라가기 쉽다. (가장 단순)
B. 사람별로 묶는다(지원자 묶음, 면접관 묶음). 누가 무엇을 얻는지 보기 쉽다. 단계와 할 일 번호가 묶음 안에서 섞여 Unit 나누기 때 다시 갈라야 한다.
C. 흐름별로 묶는다(고르기·쓰기·보내기·면접 전·면접 중, 범위 문서 「가치 흐름」). 사용자 여정을 보기 쉽다. 한 할 일이 여러 흐름에 걸치는 곳(예: 작성자 설명은 쓰기와 면접 전)에서 이야기가 갈린다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q2. [기획] 사람이 화면에서 하는 일이 아닌 요구

FR15(계약 판본·함께 배포, 고지 4절 팀장 승인, DB 초기화 전 반영, 규칙 버림 기준)와 NFR1(호출 수), NFR3(질의응답 재측정), NFR4(규칙 사실 대조), NFR8(시험 방식)은 지원자나 면접관이 화면에서 하는 일이 아니다.

A. 이야기로 만들지 않는다. 이야기 추적 표에 「Deferred」로 넘길 뒤 단계(빌드와 시험, 일정 계획, NFR 요구사항)를 적는다. 화면 이야기에 걸린 비기능(NFR2 출처 구분, NFR5 화면 출력 안전, NFR6 접근성, NFR7 호환)은 해당 이야기의 수락 기준에 넣는다. (가장 단순)
B. 「만드는 사람(팀장)」을 세 번째 사람으로 두고 확인 이야기로 만든다. 확인 일이 이야기 목록에 보여 빠뜨리는 일을 더 막는다. 사람이 하나 늘고, 사용자 가치가 아닌 이야기가 섞인다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
