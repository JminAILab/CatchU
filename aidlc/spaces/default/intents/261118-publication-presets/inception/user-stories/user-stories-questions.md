# User Stories — 이야기 계획과 질문

근거: 승인된 요구사항 `inception/requirements-analysis/requirements.md`(FR1~FR7, NFR1~NFR6), 범위 문서·백로그(`ideation/scope-definition/`), 화면 초안(`ideation/rough-mockups/`), 코드 지식 기록 `aidlc/spaces/default/codekb/CatchU/business-overview.md`·`component-inventory.md`, 팀 관행 `inception/practices-discovery/team-practices.md`.

## 이야기 계획

- 이야기 꼴: 「[페르소나]로서 [하고 싶은 것]을 하고 싶다. 그래서 [얻는 것]」. INVEST(따로 만들 수 있고, 고칠 여지가 있고, 가치가 있고, 크기를 가늠할 수 있고, 작고, 시험할 수 있음)를 지킨다.
- 수락 기준은 Given/When/Then으로 쓰고, 요구사항의 수락 기준을 옮겨 쓴다.
- 우선순위는 MoSCoW로 매긴다. 범위 문서가 범위 안 9묶음을 모두 Must로 정했으므로 이야기도 Must가 기본이다. MVP 경계는 Delivery Planning에서 정식으로 정한다.
- 이번 작업은 협업자가 꺼져 있어 제품 관리자가 혼자 초안과 마무리를 한다.

## Q1. [제품] 페르소나

A. 둘: 지원자(프리셋을 만들고 발행하며, 작성자 발행본 화면에서 자기 발행본을 본다)와 면접관(받은 사람 화면에서 발행본을 읽는다)
B. 셋: 지원자를 처음 쓰는 지원자(프리셋이 없어 첫 발행까지 걸음이 하나 늘어남)와 이미 프리셋이 있는 지원자로 나누고, 면접관
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q2. [제품] 이야기를 나누는 기준

A. 사용 흐름 순서: 프리셋 관리 → 프리셋으로 발행 → 받은 사람·작성자 화면에서 읽기 → 자료 지우기·탈퇴·방침 등 정리. 요구사항 묶음(FR1~FR7)과 같게 나눈다
B. 화면별(프리셋 목록, 프리셋 편집, 발행, 받은 사람 화면, 작성자 상세)
C. 백로그 항목(IB-1~IB-8)별
X. Other (please specify)

[Answer]: A

## Q3. [제품] 이야기 하나의 크기

A. 사용자가 하는 동작 하나(예: 프리셋 만들기, 고쳐 저장하기, 프리셋 고르기, 출처로 다른 탭 가기)를 이야기 하나로, 수락 기준은 3~6개
B. 요구사항 묶음 하나를 이야기 하나로(이야기 7개 안팎, 수락 기준이 많아진다)
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q4. [품질] 사용자에게 직접 보이지 않는 요구사항

기존 발행본 버리기(FR5.1), 순서 번호 이어 매기기(FR6.1), 받은 링크 읽기·요약·질의응답이 바뀐 사본에서 동작(FR6.2·FR6.3)은 사용자가 직접 하는 동작이 아니다.

A. 이야기를 따로 만들지 않고, 관련 이야기의 수락 기준에 넣거나(예: 면접관이 받은 링크를 Claude로 읽기) 이야기로 쓸 수 없는 것은 추적표에 이유와 함께 N/A로 둔다
B. 모두 이야기로 쓴다(예: 「팀장으로서 기존 발행본을 지우고 싶다」)
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Q1: 페르소나는 둘, 지원자와 면접관
- Q2: 사용 흐름 순서(프리셋 관리 → 발행 → 읽기 → 정리)로, 요구사항 묶음과 같게 나눈다
- Q3: 사용자 동작 하나에 이야기 하나, 수락 기준 3~6개
- Q4: 사용자에게 직접 보이지 않는 요구사항은 관련 이야기의 수락 기준에 넣거나 추적표에 이유와 함께 N/A로 둔다

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
