# Constraint Register — 발행 프리셋

근거: 승인된 의도 진술 `ideation/intent-capture/intent-statement.md`(intent-statement), 이 단계 질문 `feasibility-questions.md`의 답, 팀 규칙 `aidlc/spaces/default/memory/team.md`.

## 기술 제약

| ID | 제약 | 근거 |
|---|---|---|
| C-T1 | 지금 스택(web Next.js, api NestJS, PostgreSQL·TypeORM)으로 만든다. 새 라이브러리는 들이지 않는다 | Q3 |
| C-T2 | 탭은 자료 화면에 이미 있는 탭 부품을 다시 쓴다 | Q3 |
| C-T3 | DB 변경은 배포 때 도는 migration으로 넣는다 | Q5 |
| C-T4 | 발행본은 발행 당시 자료를 고정한 사본이다. 프리셋을 고치거나 지워도 발행본은 바뀌지 않는다 | intent-statement 성공 기준, 입력 문서 §6 FR4.3 |
| C-T5 | 드래그는 넣지 않고 「위로」「아래로」 단추로 순서를 정한다 | intent-statement 「하지 않는 것」 |

## 조직 제약

| ID | 제약 | 근거 |
|---|---|---|
| C-O1 | 11월 안에 dev에 들어간다(P1) | intent-statement 성공 기준 |
| C-O2 | 구현은 팀장 혼자 한다 | Q3 |
| C-O3 | 발행 요청·사본 계약 변경은 팀원 3, 받은 링크 읽기 담당, JD 요약 담당과 PR 리뷰에서 맞춘다 | intent-statement, Q6 |
| C-O4 | 화면은 기능만 맞춘다. 모양 다듬기는 이 작업 뒤 팀원 3이 한다 | intent-statement |
| C-O5 | 이슈 → `영역/작업내용` 브랜치 → `dev` PR(작성자 외 승인 1건, merge commit)로 반영한다 | team.md Way of Working |
| C-O6 | 공유 인프라·CI 변경은 팀장이 맡는다. 이 작업은 새 AWS 자원과 배포 변경이 없다 | team.md Deployment, Q5 |

## 규제·개인정보 제약

| ID | 제약 | 근거 |
|---|---|---|
| C-R1 | 새 규제 요구는 없다 | Q4 |
| C-R2 | 개인정보처리방침의 저장 항목 표와 「하나씩 지우기」 문장에 프리셋을 더한다 | Q4, Q1 |
| C-R3 | 탈퇴할 때 프리셋도 지운다 | Q4, Q1 |
| C-R4 | 프리셋 이름을 외부 AI에 보내면 고지 문구도 함께 고친다. 보낼지는 설계에서 정한다 | Q4 |
| C-R5 | 비밀값·인증정보·사용자 자료를 Git·로그·화면·AI·이슈·PR 공유 로그에 남기지 않는다 | team.md Code Style |

## Assumptions & Open Questions

None.
