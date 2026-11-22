# Team Allocation — 발행 프리셋

근거: Bolt 계획 `bolt-plan.md`, 요구사항 `inception/requirements-analysis/requirements.md`(Constraints), 구성 요소 `inception/domain-design/components.md`, 단위 `inception/units-generation/unit-of-work.md`·`unit-of-work-dependency.md`, 계약 `inception/contract-design/contract-summary.md`(ownership rules), 팀 관행 `inception/practices-discovery/team-practices.md`.

Bolt는 Construction에서 단위 하나를 설계·코드·시험까지 거쳐 돌아가는 결과로 끝내는 한 바퀴다. mob은 한 Bolt를 함께 맡는 묶음(사람이든 AI든)이다. 이 작업은 mvp 범위라 팀 구성 단계가 없어, 모든 Bolt는 AI(aidlc-developer-agent)가 만든다.

| Bolt | 단위 | 만드는 쪽 | 단계 승인 | dev PR 리뷰 |
|---|---|---|---|---|
| B1 | U1 u1-preset-contract | aidlc-developer-agent | 팀장 | 팀원 3, 받은 링크 읽기 담당, JD 요약 담당(계약 PR) |
| B2 | U2 u2-applicant-screens | aidlc-developer-agent | 팀장 | 작성자 외 승인 1건(팀 관행) |
| B3 | U3 u3-reader-views | aidlc-developer-agent | 팀장 | 작성자 외 승인 1건(팀 관행) |
| B4 | U4 u4-privacy-policy | aidlc-developer-agent | 팀장 | 작성자 외 승인 1건(팀 관행) |

- 팀 관행대로 dev PR은 작성자 외 승인 1건과 merge commit으로 들어간다. 보호 브랜치에 squash·rebase 머지는 쓰지 않는다.
- 미배정 공통 업무를 팀원 1이나 초기화 담당에게 자동 배정하지 않는다(팀 관행).
- B4의 확정 문구는 팀장이 준다.
- 화면 모양 다듬기와 드래그는 이 작업 뒤 팀원 3이 한다(requirements Constraints). 이 표에 넣지 않는다.
