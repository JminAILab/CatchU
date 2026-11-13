# NC3 다시 볼 곳 사실과 작업 시각 — NFR 설계 질문

## 질문의 범위

- 입력: NFR 요구 `construction/nc3-revisit-facts/nfr-requirements/` 여섯 문서와 그 점검(Major 1·Minor 2), 기능 설계 `functional-spec.md`, 계약 C2·C4
- 이미 정해진 것은 묻지 않는다: 판정 예외는 그 후보 사실만 비움(NFR8.3), 지운 시험 파일 뺌(NFR8.4), 규칙별 수는 DB 질의(NFR4.2), 인덱스 없음(NFR1.6)
- **점검 지적 가운데 설계에서 정리하는 것(질문 없음):**
  - Major: 점검을 마친 기능 명세 W1 「실패와 경계」는 판정 예외를 「삼키지 않고 생성 실패 갈래로 올린다」고 적어 NFR8.3(Q1 B)과 반대다. 신뢰성 설계에 코드 생성 계획의 함께 고칠 문서로 functional-spec W1 「실패와 경계」, rules.md BR2.1(「순수 계산」)과 같은 취지의 자리를 모두 적는다.
  - Minor(호출 순서): 작업 시각(BR4.1)은 후보 판정 안에서 `grouping.commits`로 먼저 정하고, RevisitFacts는 그 뒤 처리에서 같은 기록 묶음(기본 브랜치 창과 관계 조회 커밋)으로 부른다. 그래서 시각 계산에서 기록이 없으면 지금처럼 worker 결함으로 올라가고(후보 판정의 결함), RevisitFacts에서 기록이 없으면 NFR8.3 갈래다. 두 계산이 같은 묶음을 쓰므로 시각이 정해진 후보에서 RevisitFacts가 기록을 못 찾는 일은 코드 결함일 때만 생긴다.
- 가장 단순한 안을 A로 둔다.

## Q1. [설계] RevisitFacts 시간 「1초 이하」(NFR1.3)를 어떻게 확인할까요?

**배경:** NFR 요구 점검이 「1초 이하」는 요구사항·기능 설계에 없던 새 숫자이고, worker 시험에서 시간을 단정하면 노트북 부하에 따라 가끔 실패할 수 있다고 짚었다. 프로젝트 규칙은 Unit 확인 전에 충전기·부하를 보게 하지만, CI는 그 조건을 모른다.

A. 시험에서 시간을 단정하지 않는다. 빌드와 시험 때 TheMe 분석 하나에서 RevisitFacts 전체 시간을 재어 기록만 하고, 1초를 넘으면 그 기록에 적어 팀장이 판단한다. worker 시험은 결과만 본다. (가장 단순, 시험이 흔들리지 않음)
B. worker 시험에 같은 규모 합성 자료로 1초 단정을 둔다. 느려지는 변경을 시험이 막는다. 대신 부하가 높은 노트북·CI에서 가끔 실패할 수 있어, 기준 장비·부하 조건을 따로 정해야 한다.
X. Other (please specify)

[Answer]: X — 1초 숫자를 뺀다 (2026-11-11, **Mode:** chat)

**사람 원문:** Q1은 A보다 더 단순하게 한다. 「RevisitFacts 1초 이하」 숫자는 요구사항에 근거가 없으니 뺀다. 분석 하나의 처리 시한이 60분이라 1초 단위 숫자는 판단에 쓸 데가 없다. 느려지지 않게 하는 것은 NFR1.3의 구조 요구(후보의 커밋 기록을 한 번만 훑고 (경로, 줄 글자) 사전을 써서 커밋 쌍마다 다시 훑지 않음)로 하고, 코드 검토 때 그 구조를 본다. 빌드와 시험에서는 이미 적기로 한 분석 전체 시간(elapsedSeconds) 바꾸기 전·후 기록만 남기고, RevisitFacts만 따로 재거나 시험에서 시간을 단정하지 않는다. performance-requirements.md NFR1.3의 이 부분도 코드 생성 계획의 함께 고칠 문서에 넣는다.

**Major 처리 덧붙임(사람 원문):** 기능 설계에서 Q1 B와 어긋나는 문장은 functional-spec.md 49행 하나뿐이다. rules.md BR2.1의 「순수 계산」은 GitHub를 부르지 않는다는 뜻이라 고치지 않고, BR4.1(작업 시각 기록 없음은 worker 결함)은 계산 순서 정리대로 그대로 둔다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
