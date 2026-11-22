# External Dependency Map — 발행 프리셋

근거: Bolt 계획 `bolt-plan.md`, 요구사항 `inception/requirements-analysis/requirements.md`(Constraints), 구성 요소 `inception/domain-design/components.md`, 단위 `inception/units-generation/unit-of-work.md`·`unit-of-work-dependency.md`, 계약 `inception/contract-design/contract-summary.md`, 범위 `ideation/scope-definition/intent-backlog.md`(Q4).

Bolt는 Construction에서 단위 하나를 설계·코드·시험까지 거쳐 돌아가는 결과로 끝내는 한 바퀴다. 이 문서는 AI가 혼자 끝낼 수 없고 사람이나 다른 작업을 기다리는 것만 적는다. 새 외부 API·AWS 자원·라이브러리는 없다.

| 기다리는 것 | 누가 | 막는 Bolt | 늦어지면 |
|---|---|---|---|
| U1 계약 PR 리뷰 | 팀원 3, 받은 링크 읽기 담당, JD 요약 담당 | B1의 dev 병합, 그 뒤 B2·B3 | dev PR은 리뷰 승인 뒤에만 병합한다. 늦어지면 다음 Bolt 착수도 그만큼 늦어진다 |
| 각 Bolt의 dev PR 승인(작성자 외 1건) | 팀원 | 각 Bolt의 dev 병합 | 팀 관행 그대로 |
| 개인정보처리방침 확정 문구 | 팀장 | B4 | B3이 끝날 때까지 받는다(Q2) |
| 팀원 3의 화면 정리 | 팀원 3 | B3의 출발점(막지는 않음) | dev에 먼저 들어간 쪽이 기준이다. 들어와 있지 않으면 그대로 진행한다(범위 Q4) |
| 2026-11-30 dev 반영 마감 | — | 모든 Bolt | 범위 문서의 기한 |
