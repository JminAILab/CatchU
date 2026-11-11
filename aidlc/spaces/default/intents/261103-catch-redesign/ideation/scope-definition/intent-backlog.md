# Catch 개편 — 우선순위 목록

입력: 범위 문서 `scope-document.md`, 승인된 의도 설명 `aidlc/spaces/default/intents/261103-catch-redesign/ideation/intent-capture/intent-statement.md`, 실현 가능성 평가 `ideation/feasibility/feasibility-assessment.md`, 제약 목록 `ideation/feasibility/constraint-register.md`, 이 단계의 답 `scope-definition-questions.md`(Q1~Q5).

## 우선순위 방식

MoSCoW를 쓴다. 담는 것은 모두 완성하므로(Q1, Q3) 항목은 모두 **Must**다. 대신 11/30까지 다 못 넣을 때를 위해 **넣는 묶음**을 둔다. 규칙 쪽은 먼저 넣을 수 있고, AI 쪽은 그 뒤에 완성해 넣을 수 있다. (Q1)

## 목록

| ID | 항목 | MoSCoW | 넣는 묶음 | 시한 | 앞서야 하는 것 | 근거 |
|---|---|---|---|---|---|---|
| IB-1 | 소속 저장: 회원·저장소마다 커밋별 소속 Catch 저장, 재분석 요청에 소속 커밋 목록을 실어 새로 묶는 재료에서 뺌, 결과에 소속 커밋 전체, 탈퇴 때 함께 삭제 | Must | 규칙 쪽 | 출시 전 마지막 DB 초기화 전 | 없음(독립) | Q2, Q4 |
| IB-2 | 이슈 번호 나누기 끄기 | Must | 규칙 쪽 | 정하지 않음 | 없음 | Q3 |
| IB-3 | 재료 순서와 변경 묶음: 코드 → 시험 → 설정 → 문서 → 그 밖, 변경 묶음의 씨앗, 묶음마다 고르게 담기 | Must | 규칙 쪽 | 늦어도 11/30 | 없음 | Q1, Q4 |
| IB-4 | 기록의 글 제목과 작업 사실 첫 줄. AI 쪽을 껐을 때는 부실을 규칙(글이 거의 없는 것)만으로 판단 | Must | 규칙 쪽 | 늦어도 11/30 | 없음 | Q1, 범위 정의 변경 요청 |
| IB-5 | 판정 공급자 자리와 OpenAI 판정(판정 키가 있을 때만 켬) | Must | AI 쪽 | 늦어도 11/30, 못 하면 뒤에 완성 | 없음 | Q1, Q4 |
| IB-6 | 큰 후보의 재료 판정 | Must | AI 쪽 | 늦어도 11/30, 못 하면 뒤에 완성 | IB-3, IB-5 | Q4 |
| IB-7 | Claude가 쓰는 제목 후보·설명 초안, 기계 대조, 판정으로 거르기 | Must | AI 쪽 | 늦어도 11/30, 못 하면 뒤에 완성 | IB-3(재료), IB-5, IB-12(기록의 글 판정) | Q4 |
| IB-8 | 분석 고지 v3와 첫 이용 고지 판본 | Must | AI 쪽 | AI 쪽을 켤 때 같이 | IB-5~IB-7 | Q4 |
| IB-9 | web 제목 출처 공통 안내 한 줄 | Must | AI 쪽과 함께(가정) | AI 쪽을 켤 때 같이(가정) | IB-7 | 범위 문서 「Assumptions & Open Questions」 |
| IB-10 | Catch 20개 확인과 AI 쪽을 켤지의 결정 기록 | Must | AI 쪽 | 합치기 전 | IB-5~IB-7, IB-12, OpenAI 키·비밀값(RAID D3) | Q4 |
| IB-11 | 함께 고칠 문서(범위 문서 「함께 고칠 문서」) | Must | 각 항목과 함께 | 각 항목과 같음 | 해당 항목 | Q5 |
| IB-12 | 기록의 글 판정: "무엇을 했는지 알려 주나" 0.5 미만이면 부실. 본인 커밋이 여럿인 단위의 커밋 메시지는 "이 Catch의 작업 전체를 나타내나" 0.5 미만이면 Claude 후보로 넘김. 작업 사실의 기록의 글 한 줄은 부실 기준만 봄 | Must | AI 쪽 | 늦어도 11/30, 못 하면 뒤에 완성 | IB-4, IB-5 | 범위 정의 변경 요청, 입력 문서 §5-2 「제목」 2 |

## 넣는 묶음

```
규칙 쪽: IB-1(시한 따로), IB-2, IB-3, IB-4
AI 쪽:   IB-5 --> IB-6
         IB-4, IB-5 --> IB-12 --> IB-7 --> IB-8, IB-9
         IB-5, IB-6, IB-7, IB-12 + OpenAI 키 --> IB-10
```
<!-- Text fallback: 규칙 쪽은 IB-1~IB-4이고 IB-1은 시한이 따로다. AI 쪽은 IB-5 판정 자리에서 시작해 IB-6 재료 판정으로 이어진다. IB-4 기록의 글과 IB-5 판정 자리 위에 IB-12 기록의 글 판정이 오고, 그다음 IB-7 제목·설명, 그 뒤에 고지(IB-8)와 화면 안내(IB-9)가 온다. IB-5·IB-6·IB-7·IB-12와 OpenAI 키가 갖춰지면 IB-10 20개 확인을 한다. -->

실제 순서와 Unit 나누기는 Unit 나누기·납품 계획 단계에서 이 의존에 따라 정한다. (Q3)

## Assumptions & Open Questions

- IB-9를 AI 쪽과 함께 넣는다는 것은 가정이다. 요구사항 분석에서 확인한다. [assumption]
