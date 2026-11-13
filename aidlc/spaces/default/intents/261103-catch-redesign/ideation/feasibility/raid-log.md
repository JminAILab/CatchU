# Catch 개편 — RAID 기록

입력: 승인된 의도 설명 `aidlc/spaces/default/intents/261103-catch-redesign/ideation/intent-capture/intent-statement.md`, 실현 가능성 평가 `feasibility-assessment.md`, 이 단계의 답 `feasibility-questions.md`(Q1~Q7).

## Risks (위험)

| ID | 위험 | 대응 | 담당 | 근거 |
|---|---|---|---|---|
| R1 | OpenAI의 한국어 판정이 기준에 못 미친다 | 지시문 수정 1번 → Claude 판정 → 그래도 못 넘으면 AI 쪽을 끈 채 합침 | 팀장 | Q3 |
| R2 | 확인 표본이 팀장 저장소뿐이라 일반 저장소 결과를 모른다 | 한계로 기록 | 팀장 | Q3 |
| R3 | 소속 저장이 출시 직전 DB 초기화 전에 못 들어간다 | 납품 계획에서 소속 저장을 먼저 넣는 순서를 정한다 | 팀장 | Q2, Q6 |
| R4 | 제목·작업 사실·설명 변경이 11/30까지 못 들어간다 | 납품 계획에서 공수를 추정한다 | 팀장 | Q6 |

## Assumptions (가정)

| ID | 가정 | 확인할 때 | 근거 |
|---|---|---|---|
| A1 | 수집 기록에 커밋 메시지·PR 제목·PR을 연 계정이 이미 있어, 기록의 글을 쓰는 데 GitHub 조회가 늘지 않는다 | 기능 설계 | Q1 |
| A2 | 수집 상한(#424)이 처리돼 기본 브랜치 전체가 한 번에 들어오고, 팀장 Unit PR이 각각 Catch로 나온다 | 납품 계획 전 #424 상태 확인 | Q2 |

## Issues (지금의 문제)

| ID | 문제 | 처리 | 근거 |
|---|---|---|---|
| I1 | OpenAI 계정·키와 SSM·EKS 비밀값이 아직 없다 | 팀장이 Catch 20개 확인 전에 만든다 | Q5 |
| I2 | 공수 근거가 없다 | 납품 계획에서 추정한다 | Q6 |

## Dependencies (의존성)

| ID | 의존 대상 | 필요한 때 | 근거 |
|---|---|---|---|
| D1 | U7 재분석(#433·#448, 통합 브랜치에 합쳐짐) | 소속 저장 구현 | Q2 |
| D2 | 수집 상한(#424) | Catch 20개 확인, 큰 PR 재료 고르기 | Q2 |
| D3 | OpenAI 계정·키, SSM·EKS 비밀값(팀장 인프라) | Catch 20개 확인 | Q5 |
| D4 | 12월 intent 통합 확인 | 통합 브랜치에 넣을 때 | Q2 |
| D5 | 고지 문구 팀장 승인 | 고지를 바꾸는 PR | Q4 |

## Assumptions & Open Questions

None.
