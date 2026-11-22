# Intent Backlog — 발행 프리셋

근거: `scope-document.md`의 범위 안 S1~S9, 승인된 의도 진술 `ideation/intent-capture/intent-statement.md`(intent-statement), 타당성 평가 `ideation/feasibility/feasibility-assessment.md`(feasibility-assessment), 제약 목록 `ideation/feasibility/constraint-register.md`(constraint-register), 이 단계 질문의 답(Q1~Q4).

우선순위는 MoSCoW로 매겼다. 모두 Must다(Q1). 순서는 의존 순서다(Q2).

## 백로그

| 순서 | ID | 항목 | MoSCoW | 앞서야 하는 것 | 범위 묶음 |
|---|---|---|---|---|---|
| 1 | IB-1 | 발행 요청·사본 계약 변경과 프리셋 저장. 계약 변경은 먼저 PR로 올려 담당 리뷰를 받는다(Q3) | Must | 없음 | S1, S2 |
| 1 | IB-8 | 기존 발행본 버리기. IB-1과 함께 한다 | Must | 없음(IB-1과 함께) | S8 |
| 2 | IB-2 | 프리셋 화면: 만들기·고치기·지우기, 안의 순서, 자료 고르기와 작성자 설명 걸러 보기 옮김, 확인 필요·비공개 표시, 항목·글자 수, 보낸 링크는 안 바뀐다는 안내 | Must | IB-1 | S1, S6 |
| 3 | IB-3 | 프리셋으로 발행: 프리셋 고르기(최대 5개), 프리셋 순서, 프리셋이 없을 때 링크, 발행이 막힌 프리셋·자료 표시 | Must | IB-1, IB-2 | S2, S6 |
| 4 | IB-4 | 받은 사람·작성자 발행본 화면의 탭, 요약·질의응답을 탭 밖에 두는 배치 | Must | IB-1 | S3, S4 |
| 5 | IB-5 | 출처 단추의 탭 이동과 답으로 돌아가는 단추 | Must | IB-4 | S5 |
| 6 | IB-6 | 받은 링크 읽기·JD 요약을 바뀐 사본에 맞추기 | Must | IB-1 | S9 |
| 7 | IB-7 | 자료 지우기·탈퇴 때 프리셋 처리, 개인정보처리방침 문구 | Must | IB-1 | S7 |

IB-8은 IB-1과 함께 한다. 사본에 프리셋 구분을 더하는 DB 변경을 넣을 때 기존 발행본 행이 남아 있으면 그 변경이 프리셋 없는 행까지 받아 줘야 해서, 버리기로 한 이점이 사라지기 때문이다.

IB-7은 IB-1 뒤 어느 때나 할 수 있다. 위 순서는 Q2의 의존 순서를 따르고, 정리 작업을 뒤에 두었다.

## 팀원 3 작업과의 관계

- IB-4를 시작할 때 팀원 3의 지금 화면 정리가 dev에 들어와 있으면 그 위에서 시작하고, 없으면 그대로 진행한다. dev에 먼저 들어간 쪽이 기준이다(Q4).
- 팀원 3의 화면 다듬기와 드래그는 이 백로그가 dev에 들어간 뒤 시작한다(intent-statement).

## 마감

모든 항목은 2026-11-30까지 dev에 들어간다(Q3, constraint-register C-O1).

## Assumptions & Open Questions

None.
