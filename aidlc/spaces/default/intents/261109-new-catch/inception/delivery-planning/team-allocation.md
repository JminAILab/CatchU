# 새 Catch — 맡는 사람

**Bolt**는 Unit 하나를 기능 설계부터 코드와 시험까지 지나 실제로 돌아가는 결과로 끝나는 구현 묶음이다. 이 계획의 Bolt는 셋(B1~B3)이고, Unit 하나가 Bolt 하나다.

입력:
- Bolt 계획 `bolt-plan.md`
- Unit `inception/units-generation/unit-of-work.md`
- 요구사항 `inception/requirements-analysis/requirements.md` 제약 11
- 이 단계의 답 `delivery-planning-questions.md`

## 맡는 사람

이 범위(mvp)는 팀 꾸리기 단계를 건너뛰었다. 그래서 따로 짠 팀(mob, 여럿이 함께 붙어 일하는 작업 묶음)은 없다.

| Bolt | Unit | 구현 | 승인 | PR에서 확인하는 담당 |
|---|---|---|---|---|
| B1 | NC1 `nc1-sections-and-links` | AI 개발자(aidlc-developer-agent) | 팀장 | 건드린 영역의 담당(U3·U4·U5·U6·U10 가운데) |
| B2 | NC2 `nc2-snapshot-fields` | AI 개발자(aidlc-developer-agent) | 팀장 | 건드린 영역의 담당(U3·U4·U5·U6·U10 가운데) |
| B3 | NC3 `nc3-revisit-facts` | AI 개발자(aidlc-developer-agent) | 팀장 | 건드린 영역의 담당(U3·U4·U5·U6·U10 가운데) |

- 만드는 사람은 팀장 한 명이다(제약 11). 나란히 만들지 않고 하나씩 차례로 진행한다.
- 「PR에서 확인하는 담당」은 성공 기준 「담당 확인」의 판정이다. 그 영역을 건드린 코드 PR마다 해당 담당의 승인이나 확인 기록이 PR에 남는다.
- 어느 PR이 어느 담당 영역을 건드리는지는 PR을 열 때 실제로 바뀐 파일과 12월 intent 납품 계획 담당표로 정한다. 이 문서는 영역 대응을 미리 정하지 않는다.
- 미배정 공통 일을 팀원에게 새로 배정하지 않는다(팀 규칙).

## Sources

- `inception/delivery-planning/bolt-plan.md`
- `inception/units-generation/unit-of-work.md`
- `inception/requirements-analysis/requirements.md` 제약 11, 성공 기준 「담당 확인」
- `inception/delivery-planning/delivery-planning-questions.md`
