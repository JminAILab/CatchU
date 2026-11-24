# Risk and Sequencing Rationale — 발행 프리셋

근거: Bolt 계획 `bolt-plan.md`, 단위 의존 `inception/units-generation/unit-of-work-dependency.md`와 단위 `unit-of-work.md`, 구성 요소 `inception/domain-design/components.md`, 계약 `inception/contract-design/contract-summary.md`, 요구사항 `inception/requirements-analysis/requirements.md`, 팀 관행 면담 `inception/practices-discovery/evidence.md`(Q5), 이 단계 질문 `delivery-planning-questions.md`(Q1~Q3).

Bolt는 Construction에서 단위 하나를 설계·코드·시험까지 거쳐 돌아가는 결과로 끝내는 한 바퀴다.

## 쓴 기준

**walking skeleton 먼저**(Cockburn, *Crystal Clear*): 첫 Bolt는 뒤 단위 없이 처음부터 끝까지 실제로 돌아가는 가장 얇은 판이다. 이 작업에서는 팀 관행 면담 Q5와 범위 설정(skeleton on)으로 이미 정해졌다. WSJF 같은 점수 모델은 쓰지 않았다. 단위가 넷뿐이고 의존이 단순해 점수로 가를 일이 없다.

그다음은 **dev가 막히는 기간을 가장 짧게** 하는 순서다(Q1). U1의 계약 PR이 dev에 들어가면 U2가 들어올 때까지 dev 발행 화면은 발행에 실패하므로(단위 Q2), U2를 바로 이어 붙인다. U3은 U2로 실제 발행한 발행본으로 시험한다. U4는 팀장 확정 문구를 기다리므로 마지막이다(Q2).

## 의존 그래프와의 관계

- 단위 의존 그래프: U2·U3은 U1에 기대고, U4는 기대는 단위가 없다.
- 고른 순서 U1 → U2 → U3 → U4는 그래프가 허락하는 순서다.
- 그래프에 없는 순서 하나를 더했다: U3을 U2 뒤에 둔다. U3의 코드는 U2를 기다리지 않아도 되지만, 실제 발행본으로 시험하려고 B3을 B2가 dev에 병합된 뒤에 시작한다(Q1). 런타임 순서는 `aidlc-state.md`의 설정(한 단위씩 차례로)과 그래프가 정하며, 이 문서는 순서를 바꾸지 않는다.
- U4는 그래프로는 처음에도 할 수 있지만 첫 단위가 아니다. 첫 단위는 U1이다(면담 Q5).

## 위험

사람이 따로 걱정되는 것은 없다고 답했다(Q3). 아래는 앞 단계에서 이미 정한 사실이고, 따로 더한 완료 조건은 없다.

| 위험 | 가능성 | 영향 | 이미 정한 대응 |
|---|---|---|---|
| U1 계약 PR 뒤 B2 전까지 dev 발행이 안 됨 | 높음(정해진 일) | 낮음(이용자는 팀 관련자뿐) | 그대로 두고 첫 PR 본문에 적는다(단위 Q2). B2를 바로 잇는다(Q1) |
| 변경 전 발행본 버리기는 되돌릴 수 없음 | 정해진 일 | 낮음(팀 관련자뿐, 따로 알리지 않음) | 요구사항 FR5.1·Assumptions, intent-backlog IB-8 |
| 발행 요청·사본·받은 링크 읽기 계약이 바뀜(깨는 변경) | 정해진 일 | 중간 | U1 계약 PR에서 담당 셋의 리뷰로 합의(contract-summary ownership rules) |
| B4가 팀장 확정 문구를 기다림 | 낮음 | 낮음 | 팀장이 B3이 끝날 때까지 준다(Q2) |
