# 새 Catch — 순서와 위험의 까닭

**Bolt**는 Unit 하나를 기능 설계부터 코드와 시험까지 지나 실제로 돌아가는 결과로 끝나는 구현 묶음이다. 이 계획의 Bolt는 B1(NC1)·B2(NC2)·B3(NC3) 셋이다.

입력:
- Bolt 계획 `bolt-plan.md`
- Unit 의존 `inception/units-generation/unit-of-work-dependency.md`
- 계약 `inception/contract-design/contract-summary.md`
- 요구사항 `inception/requirements-analysis/requirements.md`
- 범위 문서 `ideation/scope-definition/scope-document.md` 「만드는 순서」, 위험 기록 `ideation/feasibility/raid-log.md`
- 이 단계의 답 `delivery-planning-questions.md`

## 쓴 방식

- **첫 Bolt는 골격 먼저(walking-skeleton-first, Cockburn)다.**
  - 골격은 다른 Unit 없이도 끝에서 끝까지 돌아가는 가장 작은 실제 연결 조각이다.
  - 의존 그래프의 바닥인 NC1이 이 조각이고, 이 작업 범위(mvp)가 골격을 켜 둔다.
- **나머지는 정해진 순서 그대로다.**
  - 범위 문서 「만드는 순서」의 규칙을 따른다: 의존 우선, 같이 풀리면 1단계 → 2단계 → 3단계.
  - 점수 매기기(WSJF, 가치·시급함·위험 줄임을 크기로 나눈 점수로 순서를 정하는 방식)는 쓰지 않았다. 할 일 11개가 모두 Must이고 공수를 항목별로 나누지 않았기 때문이다(할 일 목록 「우선순위 방식」).

## 순서의 까닭

| 순서 | 까닭 |
|---|---|
| B1 NC1 먼저 | NC2·NC3이 기대는 공통 부품(작성자 설명 칸, 링크 이름)과 본인 목록 커서를 만든다. 지원자 화면부터 면접관 보기까지 한 번에 지나므로 첫 실제 연결 조각이 된다. |
| B2 NC2 다음 | 엔진이 이름 순으로 고르는 순서이고, 범위 문서의 1→2→3단계 순서와 같다(Q1 A). web·api 안에서 끝나 배포가 단순하다. |
| B3 NC3 마지막 | 걱정거리가 가장 많다(아래 위험 표). 마지막이라 그 걱정거리가 늦게 드러나는 것을 받아들였다(Q1 A). 시한은 11/30과 출시 직전 DB 초기화 전이다. |

의존 그래프의 위상 순서를 벗어난 곳은 없다.

## 위험

| 위험 | 걸린 Bolt | 대응 |
|---|---|---|
| 일정·공수(위험 기록 위험 1·2). 만드는 사람이 한 명이고 11/30 시한이다 | 전체 | 단계 승인마다 커밋하고, Unit이 끝나는 대로 PR을 넣어 먼저 끝난 것이 일찍 들어가게 한다(Q3 A). 공수가 넘칠 때 줄일 순서는 정하지 않았다(의도 설명). |
| 지운 파일 항목에 파일 내용 식별값이 없으면 여러 커밋에 걸쳐 옮긴 곳을 찾지 못한다 | B3 | NC3 기능 설계 때 실제 GitHub 응답 하나로 확인하고, 없으면 범위를 한계로 적는다(ADR-002). |
| worker와 api 문장이 어긋나 한계·표지가 조용히 사라진다 | B2 | 문장 대조 시험(계약 C6). worker 문장만 바뀐 PR에서도 도는 방법을 NC2 기능 설계에서 정한다. |
| 결과 메시지 판본 "4"로 올릴 때 큐에 남은 "3" 결과 | B3 | 진행 중인 분석이 없을 때 배포한다. 남은 결과는 api가 거부하고 다시 분석한다(계약 C4). |
| 커서 판본이 오르면 web이 가진 옛 커서가 400을 받는다 | B1, B3 | 400 뒤 web 동작을 기능 설계에서 정한다(계약 Open questions). |
| 고지 문구 승인이 늦어 NC3 PR이 걸린다 | B3 | 문구를 바꾸는 PR에서 팀장이 승인한다(FR15.2). 승인이 날 때까지 그 PR을 합치지 않는다. |
| NC3이 출시 직전 DB 초기화보다 늦는다 | B3 | 초기화 날짜는 팀장이 정한다. 3단계와 CR2가 통합 브랜치에 들어간 뒤에 초기화하므로 날짜와 무관하게 판정한다(FR15.3). |

## Sources

- `inception/delivery-planning/bolt-plan.md`
- `inception/units-generation/unit-of-work-dependency.md`
- `inception/contract-design/contract-summary.md` C4·C6, Open questions
- `inception/domain-design/decisions.md` ADR-002
- `inception/requirements-analysis/requirements.md` FR15.3, 제약 11·12
- `ideation/scope-definition/scope-document.md` 「만드는 순서」, `ideation/feasibility/raid-log.md`, `ideation/scope-definition/intent-backlog.md` 「우선순위 방식」
- `inception/delivery-planning/delivery-planning-questions.md` Q1~Q3
