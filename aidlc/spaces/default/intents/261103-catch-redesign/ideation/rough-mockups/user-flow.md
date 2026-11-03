# Catch 개편 — 사용자 흐름

입력: 승인된 의도 설명 `aidlc/spaces/default/intents/261103-catch-redesign/ideation/intent-capture/intent-statement.md`, 범위 문서 `ideation/scope-definition/scope-document.md`, 우선순위 목록 `ideation/scope-definition/intent-backlog.md`, 화면 초안 `wireframes.md`, 이 단계의 답 `rough-mockups-questions.md`(Q1~Q4).

새 흐름은 없다. 기존 흐름에서 사람이 보는 결과가 바뀐다.

## 흐름 1. 구직자가 분석 결과를 읽는다

```
Flow: 분석 결과 읽기
Persona: 구직자(Catch 주인)
Trigger: 저장소 분석 또는 재분석이 끝남
Steps:
  1. 자산 목록 -> Catch 카드를 훑음 -> 제목이 2줄까지 보임(넘치면 말줄임)
  2. 카드 선택 -> Catch 상세 -> 제목 전체, 작업 사실(종류 + 기록의 글 한 줄), 설명 초안(있을 때만)
  3. 상세에서 근거와 대조 -> 확인·불일치·공개를 각각 선택(기존과 같음)
Success outcome: 제목과 작업 사실만으로 무슨 작업인지 알아본다.
Error paths:
  - 설명 초안이 판정을 하나도 넘지 못함 -> 설명 칸이 숨겨짐(실패 아님) -> 근거와 작업 사실로 읽음
  - 판정·생성 오류 -> 지금처럼 만들지 못함 안내 -> 근거로 읽음
```

재분석 때는 이미 Catch에 속한 커밋이 새 Catch에 들어가지 않아, 같은 작업이 목록에 두 번 나오지 않는다. (의도 설명 「Success Metrics」, 우선순위 목록 IB-1)

## 흐름 2. 받은 사람이 공유 링크로 Catch를 읽는다

```
Flow: 공유된 Catch 읽기
Persona: 받은 사람(기업·면접관)
Trigger: 구직자가 보낸 공유 링크를 엶
Steps:
  1. 공유된 프로필 -> 공개 GitHub 자산(위에 고친 자동 생성 안내 문장) -> 카드 제목이 2줄까지 보임
  2. 상세 보기 -> Catch 상세 -> 제목 전체, 고친 자동 생성 안내 문장(항상), 작업 사실(종류 + 기록의 글 한 줄), 설명 초안(있을 때만)
  3. 12월 AI 질의응답·요약 -> 작업 사실의 기록의 글 줄을 근거로 인용할 수 있음
Success outcome: 무슨 작업인지 알고, 제목이 AI 글일 수 있다는 것을 안다.
Error paths:
  - 링크 만료·비밀번호·불러오기 실패 -> 기존 화면 그대로
```

## 흐름에 쓰는 화면 상태

| 화면 | 채워짐 | 설명 없음 | 오류 | 긴 글 |
|---|---|---|---|---|
| 목록 카드 | 제목 2줄 | 해당 없음 | 기존 | 2줄 뒤 말줄임 |
| 구직자 상세 | 제목 전체·작업 사실 두 줄 | 설명 칸 숨김 | 기존 만들지 못함 안내 | 제목 줄바꿈 |
| 받은 사람 상세 | 제목 전체·고친 안내 문장·작업 사실 두 줄 | 설명 칸 숨김 | 판정·생성 오류일 때만 기존 안내 | 제목 줄바꿈 |

## Assumptions & Open Questions

- 고친 안내 문장의 문구는 요구사항 분석에서 정한다. (wireframes.md 「Assumptions & Open Questions」)
