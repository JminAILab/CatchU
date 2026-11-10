# 새 Catch — Bolt 계획

**Bolt**는 Unit 하나를 기능 설계부터 코드와 시험까지 한 번에 지나, 실제로 돌아가는 결과로 끝나는 구현 묶음이다. 이 계획은 Unit 하나가 Bolt 하나다(Q2 A).

입력:
- Unit `inception/units-generation/unit-of-work.md`·`unit-of-work-dependency.md`·`unit-of-work-story-map.md`
- 계약 `inception/contract-design/contract-summary.md`
- 요구사항 `inception/requirements-analysis/requirements.md`, 이야기 `inception/user-stories/stories.md`
- 다듬은 화면 `inception/refined-mockups/mockups.md`, 구성 요소 `inception/domain-design/components.md`
- 이 단계의 답 `delivery-planning-questions.md`(Q1~Q3 모두 A, Q3 덧붙임)

## 순서

| 차례 | Bolt | Unit | 골격 | 통합 브랜치에 넣는 때 |
|---|---|---|---|---|
| 1 | B1 | NC1 `nc1-sections-and-links` | 첫 Unit 골격 | NC1 확인을 마치면 바로 PR |
| 2 | B2 | NC2 `nc2-snapshot-fields` | — | NC2 확인을 마치면 바로 PR |
| 3 | B3 | NC3 `nc3-revisit-facts` | — | NC3 확인을 마치면 바로 PR, 출시 직전 DB 초기화 전 |

- 의존 그래프(NC2 → NC1, NC3 → NC1)를 그대로 따른다. NC1 다음 NC2, NC3 순서는 엔진이 이름 순으로 고르는 순서와 같다(Q1 A).
- Unit은 하나씩 차례로 진행한다(unit-major, serial). 각 Unit의 기능 설계부터 코드 생성까지 마치고, 확인 단계를 승인받은 뒤 다음 Unit으로 간다.
- 1차 통합 확인은 2026-11-09에 끝났다(PR #498). 그래서 PR은 Unit이 끝나 확인을 마치는 대로 넣는다(Q3 A 덧붙임). 시한은 모든 PR 11/30이다(제약 12).

## B1 — NC1 칸 제목과 링크 이름

- **Unit:** NC1 `nc1-sections-and-links`(ui)
- **골격 표시:** 첫 Unit 골격이다. 골격(walking skeleton)은 다른 Unit 없이도 끝에서 끝까지 돌아가는 가장 작은 실제 연결 조각이다. 이 작업 범위(mvp)는 이 조각을 먼저 끝내고 승인받게 한다. NC1이 끝나고 실제 연결 확인을 승인받기 전에는 NC2·NC3을 시작하지 않는다.
- **끝에서 끝까지 지나는 길:** 지원자 web(8칸 편집) → api 작성자 설명 저장(지금 경로) → api 본인 목록(새 조건·응답 칸·커서 v2) → 발행 → 받은 사람 web(칸 제목별 보기·링크 이름)이다.
- **완료 기준:**
  - US1~US5(16개)의 수락 기준이 모두 시험으로 통과한다.
  - 확인 명령(Unit 확인 단계에서 승인받는 명령)이 통과한다.
  - 기존 시험이 계속 통과한다.
  - 팀 규칙 「최소 연결 첫 결과」를 한 번 승인받는다.
  - 건드린 영역의 담당 확인을 PR에 받는다(`team-allocation.md`).
- **확인하는 가설:** 저장 글 한 칸에 칸 제목을 담는 방식이 지금 저장 경로와 상한(4,000자)을 바꾸지 않고 편집과 면접관 보기 모두에서 돌아간다. 칸으로 나눠 그려도 근거 강조 위치가 맞는다.
- **보일 결과:** 로컬에서 Catch 하나에 「이 작업에서 정한 것」과 「짚어 볼 곳」(GitHub 줄 링크)을 쓰고 저장한다. 「작성자 설명: 씀」으로 걸러 보고 발행한다. 면접관 링크로 열어 두 칸만 칸 제목과 함께 보이고 링크가 「파일 · 줄 · 판본」 이름으로 보이는 것을 보인다.
- **맡는 사람:** 팀장(구현은 AI 개발자)

## B2 — NC2 면접관 사본 칸과 표지

- **Unit:** NC2 `nc2-snapshot-fields`(service)
- **골격 표시:** 없음
- **완료 기준:**
  - US6~US8(8개)의 수락 기준이 시험으로 통과한다.
  - 문장 대조 시험(계약 C6)이 통과한다. worker 문장만 바뀐 PR에서도 이 시험이 도는 방법을 기능 설계에서 정한다.
  - 새 사본 칸이 조각·요약 근거에 들지 않는 시험이 통과한다.
  - 옛 사본이 그대로 보인다.
  - 확인 명령이 통과한다.
  - 건드린 영역의 담당 확인을 PR에 받는다(`team-allocation.md`).
- **확인하는 가설:**
  - worker와 결과 메시지를 바꾸지 않고, api 문장 대조만으로 작업 전체 한계와 본인 커밋 표지를 사본에 담을 수 있다.
  - 지금 있는 Catch에도 바로 맞는다.
- **보일 결과:** NC1의 발행본에서 제목 아래 저장소 이름, 「작성자 설명」 옆 작성 시점, 작업 사실 아래 「이 기록으로 알 수 없는 것」을 보인다. 본인 커밋 판본 링크 뒤에는 표지가 붙고, 병합 커밋 링크와 본인 커밋이 아닌 PR 마지막 커밋 링크에는 붙지 않는 것을 보인다(AC7.2.2). PR 마지막 커밋이 본인 커밋 근거에도 있으면 표지가 붙는 것이 맞다(FR10.1·FR10.3). 시연 저장소에 남의 커밋이 없으면 병합 커밋 링크로 보인다.
- **빌드와 시험으로 넘기는 것:** 질의응답 10개 다시 재기(FR11.2, NFR3)
- **맡는 사람:** 팀장(구현은 AI 개발자)

## B3 — NC3 다시 볼 곳 사실과 작업 시각

- **Unit:** NC3 `nc3-revisit-facts`(service)
- **골격 표시:** 없음
- **완료 기준:**
  - US9~US11(8개)의 수락 기준이 시험으로 통과한다.
  - 결과 메시지 판본 "4"로 api·worker가 함께 통과한다.
  - 합성(MOCK) 경로와 고정 자료가 새 칸을 채운다.
  - 지운 파일 식별값을 실제 GitHub 응답 하나로 확인한 결과가 기능 설계에 적혀 있다.
  - 고지 4절 문구 PR에 팀장 승인이 남는다.
  - 확인 명령이 통과한다.
  - 건드린 영역의 담당 확인을 PR에 받는다(`team-allocation.md`).
- **확인하는 가설:** 이미 모은 기록만으로(GitHub 호출을 늘리지 않고) 같은 작업 안의 다시 고친 곳·옮긴 곳·되돌림을 찾을 수 있고, 지원자에게 기억을 되살릴 재료가 된다.
- **보일 결과:** 시연 저장소(TheMe)를 다시 분석해 지원자 상세의 「다시 볼 곳」에 다시 고친 곳이 두 커밋 링크와 함께 보이는 것을 보인다. 본인 목록이 최근 작업부터 정렬되는 것도 보인다.
- **빌드와 시험으로 넘기는 것:**
  - 규칙 버림 기준(FR15.4)
  - 규칙 사실 대조(NFR4)
  - 호출 수 비교(NFR1)
- **맡는 사람:** 팀장(구현은 AI 개발자)

## Construction 진행 설정

- 지금 기록 그대로다.
  - Construction Iteration: unit-major
  - Construction Execution: serial
  - Construction Checkpoints: enabled
- 확인 명령은 이 단계 끝에서 승인받는다.

## Sources

- `inception/units-generation/unit-of-work.md`, `unit-of-work-dependency.md`, `unit-of-work-story-map.md`
- `inception/contract-design/contract-summary.md` C1~C7
- `inception/requirements-analysis/requirements.md` 제약 11·12, FR15
- `inception/user-stories/stories.md`, `inception/refined-mockups/mockups.md`, `inception/domain-design/components.md`
- `inception/delivery-planning/delivery-planning-questions.md` Q1~Q3
