# 새 Catch — 바깥에 기대는 것

**Bolt**는 Unit 하나를 기능 설계부터 코드와 시험까지 지나 실제로 돌아가는 결과로 끝나는 구현 묶음이다. 이 계획의 Bolt는 B1(NC1)·B2(NC2)·B3(NC3) 셋이다.

입력:
- Bolt 계획 `bolt-plan.md`
- 계약 `inception/contract-design/contract-summary.md`
- 요구사항 `inception/requirements-analysis/requirements.md`
- 이 단계의 답 `delivery-planning-questions.md`

이 작업은 바깥 팀이나 새 외부 서비스에 기대지 않는다(제약 1). 아래는 사람의 승인·확인과, 이미 쓰는 외부 서비스의 실제 응답 확인이다.

| 기대는 것 | 주인 | 걸리는 Bolt | 걸리는 시간 | 늦어지면 |
|---|---|---|---|---|
| 1차 통합 확인 | 팀장 | 전체 | 끝남(2026-11-09, PR #498) | — |
| 선행 PR(Catch 개편 CR1~CR3, #487, #488) | 팀장 | 전체 | 끝남(작업 브랜치 merge `a1d0fbb4`) | — |
| 건드린 영역 담당의 PR 확인(U3·U4·U5·U6·U10 가운데) | 각 담당 | B1·B2·B3 PR | PR마다 | 담당에게 확인을 청하고 기다린다. 확인 기록 없이 합치지 않는다(성공 기준 「담당 확인」). |
| 고지 v3 4절 문구 승인 | 팀장 | B3 PR | 문구를 바꾸는 PR 하나 | 그 PR에서 승인이 날 때까지 합치지 않는다(FR15.2). |
| GitHub 응답에 지운 파일의 파일 내용 식별값이 있는지 | GitHub(이미 쓰는 API) | B3 기능 설계 | 실제 응답 하나 | 없으면 여러 커밋에 걸친 옮긴 곳은 한계로 적는다(ADR-002). |
| 출시 직전 DB 초기화 날짜 | 팀장 | B3 PR 시한 | 정하지 않음 | 3단계와 CR2가 들어간 뒤에 초기화하므로, B3이 늦으면 초기화도 기다린다(FR15.3). |
| 통합 브랜치 `intent/260925-intent-12` 합치기 | 팀장 | 각 Bolt PR | PR마다 | Unit이 끝나 확인을 마치면 바로 넣는다(Q3 A). 시한 11/30(제약 12). |

빌드와 시험 단계에서 기대는 것은 둘이다.
- 시연 저장소(TheMe)로 하는 재측정과 대조(NFR3, NFR4, FR15.4)
- 받은 사람 AI 호출(Anthropic, 지금 그대로)

이 둘은 Construction의 빌드와 시험 단계에서 다룬다.

## Sources

- `inception/delivery-planning/bolt-plan.md`
- `inception/contract-design/contract-summary.md`
- `inception/domain-design/decisions.md` ADR-002
- `inception/requirements-analysis/requirements.md` 제약 1·12, FR15.3, 성공 기준 「담당 확인」
- `inception/delivery-planning/delivery-planning-questions.md` Q3
