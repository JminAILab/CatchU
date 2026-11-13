# 새 Catch — 사용자 이야기 필요성 판단

## 판단

**실행한다.**

## 이유

- 사람이 쓰는 화면 넷이 바뀐다. 지원자 Catch 목록, 지원자 Catch 상세(작성자 설명 편집), 발행 화면, 면접관이 보는 발행본 Catch다(승인된 대략 화면 `ideation/rough-mockups/wireframes.md` 1~4절).
- 사람이 둘이고 얻는 것이 다르다. 지원자는 자기 판단을 칸마다 쓰고 보낼 Catch를 고르기 쉬워진다. 면접관은 그 말을 시험할 코드 자리와 원본을 받는다(의도 설명 「Target Customer」, 코드 지식 `aidlc/spaces/default/codekb/CatchU/business-overview.md` 「쓰는 사람은 둘이다」).
- 화면 동작마다 실패 조건이 많다. 칸 제목 저장, 4,000자 상한, 옛 글 호환, 링크 이름, 표지 비교 규칙, 걸러 보기 커서가 그렇다. 요구사항의 수락 기준(`inception/requirements-analysis/requirements.md`)을 사람과 화면 동작 단위로 다시 묶어야 Unit 나누기와 시험 시나리오가 읽기 쉽다.

## 살펴본 것

| 항목 | 이 intent |
|---|---|
| 종류 | 기존 기능 고치기(web·api·worker 세 서비스 안, 새 외부 서비스 없음) |
| 사람이 쓰는 범위 | 화면 넷, 사람 둘 |
| 복잡도 | 1단계 지원자 화면, 2단계 면접관 화면과 발행 사본, 3단계 분석 쪽 규칙 사실. 할 일 11개 모두 Must |
| 영향 받는 구성 요소 | `web.assets`, `web.publications`, `web.recipient`, `api.catches`, `api.publications`, `api.published-index`, `api.rag-answer`, `worker.collection`, `worker.candidates`(코드 지식 `aidlc/spaces/default/codekb/CatchU/component-inventory.md`) |

## 이야기가 가장 쓸모 있는 곳

- **작성자 설명 칸 제목(할 일 (1)):** 지원자가 쓰는 쪽과 면접관이 읽는 쪽이 같은 저장 글을 다르게 보인다. 두 사람의 이야기로 나눠야 옛 글 호환과 빈 칸 숨기기를 각각 시험할 수 있다.
- **링크 이름과 표지(할 일 (2)·(7)):** 지원자가 붙이는 링크, 지원자가 미리 보는 목록, 면접관이 보는 이름과 표지가 하나의 판별 규칙을 나눠 쓴다. 표지는 붙는 경우와 붙지 않는 경우를 따로 시험해야 한다.
- **고르기 도움(할 일 (4)·(5)):** 같은 「작성자 설명이 있는지」 기준을 목록 걸러 보기, 발행 화면 표시, 확인 단계 수 세기가 함께 쓴다.

## 이야기로 만들지 않는 요구

지원자나 면접관이 화면에서 하는 일이 아닌 요구는 이야기로 만들지 않는다(질문 Q2 A). 추적 표 `traceability.json`에 「Deferred」로 넘길 단계를 적는다.

| 요구 | 넘기는 단계 | 이유 |
|---|---|---|
| 3단계 계약 판본 올림과 api·worker 함께 배포(FR15.1) | `delivery-planning` | 합치고 배포하는 순서의 일 |
| 고지 v3 4절 한 줄과 팀장 승인(FR15.2) | `delivery-planning` | 그 문구를 바꾸는 PR의 승인 일. 판정: 분석 고지 v3 4절에 결과 문장을 Catch에 남긴다는 한 줄이 있고, 그 문구를 바꾼 PR에 팀장 승인이 남는다 |
| 출시 직전 DB 초기화 전 반영(FR15.3) | `delivery-planning` | 통합 브랜치에 넣는 시점의 일 |
| 규칙 버림 기준 한 번 재기(FR15.4) | `build-and-test` | 3단계 빌드·시험 때 잰다 |
| 질의응답 10개 다시 재기(FR11.2) | `build-and-test` | 시험 측정이다(NFR3과 같은 측정) |
| GitHub·AI 호출 수가 늘지 않음, 분석 뒤 GitHub를 다시 읽지 않음(NFR1) | `nfr-requirements` | 바꾸기 전·후 비교 기준을 정하는 일 |
| 질의응답 재측정 방식(NFR3) | `build-and-test` | 시험 측정이다 |
| 규칙 사실 대조(NFR4) | `build-and-test` | 시험 측정이다 |
| 시험 방식(NFR8) | `build-and-test` | 팀 시험 방식을 따르는 일 |

FR11.2는 Q2에 적은 다섯 요구에 들지 않았다. 다만 내용이 NFR3과 같은 측정이고 화면에서 하는 일이 아니라서, 같은 원칙으로 넘긴다.

화면에 걸린 비기능 요구(출처 구분 NFR2, 화면 출력 안전 NFR5, 접근성 NFR6, 호환 NFR7)는 해당 이야기의 수락 기준에 넣는다.

## Sources

- `inception/requirements-analysis/requirements.md`(FR1~FR15, NFR1~NFR8)
- `aidlc/spaces/default/codekb/CatchU/business-overview.md`, `aidlc/spaces/default/codekb/CatchU/component-inventory.md`
- `ideation/intent-capture/intent-statement.md` 「Target Customer」, `ideation/rough-mockups/wireframes.md`
- `inception/user-stories/user-stories-questions.md` Q1·Q2
