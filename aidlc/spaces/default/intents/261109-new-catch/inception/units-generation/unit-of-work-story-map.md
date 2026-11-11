# 새 Catch — 이야기와 Unit

근거:
- 사용자 이야기 `inception/user-stories/stories.md`(US1~US11, 32개)
- Unit 목록 `unit-of-work.md`
- 구성 요소 `inception/domain-design/components.md`
- 요구사항 `inception/requirements-analysis/requirements.md`

행마다 이야기 하나와 그것을 만드는 Unit이다. Unit은 그 행 이야기의 수락 기준을 모두 자기 기능 설계에서 추적한다.

## 이야기 표

| 이야기 | Unit ID | Directory | 이야기 이름 |
|---|---|---|---|
| US1.1 | NC1 | nc1-sections-and-links | 칸 제목별로 나눠 쓰고 한 번에 저장한다 |
| US1.2 | NC1 | nc1-sections-and-links | 글자 상한 안에서 쓴다 |
| US1.3 | NC1 | nc1-sections-and-links | 옛 자유 글을 이어 고친다 |
| US1.4 | NC1 | nc1-sections-and-links | 면접관이 칸 제목별로 읽는다 |
| US1.5 | NC1 | nc1-sections-and-links | 면접관이 옛 글도 지금처럼 읽는다 |
| US2.1 | NC1 | nc1-sections-and-links | 짚어 볼 곳에 줄 링크를 붙인다 |
| US2.2 | NC1 | nc1-sections-and-links | 면접관이 링크를 이름으로 보고 원본으로 간다 |
| US2.3 | NC1 | nc1-sections-and-links | 발행하면 면접관에게 열릴 링크를 미리 본다 |
| US3.1 | NC1 | nc1-sections-and-links | 설명 초안과 질문을 보고 쓴다 |
| US3.2 | NC1 | nc1-sections-and-links | 편집 영역 안내로 무엇을 쓸지 안다 |
| US4.1 | NC1 | nc1-sections-and-links | 작성자 설명을 쓴 Catch와 안 쓴 Catch로 걸러 본다 |
| US4.2 | NC1 | nc1-sections-and-links | 걸러 본 목록에서 설명을 써도 보던 자리를 잃지 않는다 |
| US5.1 | NC1 | nc1-sections-and-links | 저장소마다 몇 개를 보낼지 안내를 본다 |
| US5.2 | NC1 | nc1-sections-and-links | 고르기 목록에서 저장소 이름과 설명 여부를 본다 |
| US5.3 | NC1 | nc1-sections-and-links | 작성자 설명을 쓴 Catch만 보며 고른다 |
| US5.4 | NC1 | nc1-sections-and-links | 확인 단계에서 설명 없는 Catch 수를 본다 |
| US6.1 | NC2 | nc2-snapshot-fields | 어느 저장소의 작업인지 본다 |
| US6.2 | NC2 | nc2-snapshot-fields | 작성자 설명을 언제 마지막으로 고쳤는지 본다 |
| US6.3 | NC2 | nc2-snapshot-fields | 이 기록으로 알 수 없는 것을 본다 |
| US6.4 | NC2 | nc2-snapshot-fields | 이 변경 전에 받은 발행본도 지금처럼 본다 |
| US6.5 | NC2 | nc2-snapshot-fields | AI 답은 화면에만 붙인 칸을 근거로 쓰지 않는다 |
| US7.1 | NC2 | nc2-snapshot-fields | 본인 커밋을 가리키는 링크에 표지를 본다 |
| US7.2 | NC2 | nc2-snapshot-fields | 본인 커밋이 확실하지 않은 링크에는 표지를 보지 않는다 |
| US8.1 | NC2 | nc2-snapshot-fields | AI가 작성자 주장을 작성자의 말로 옮긴다 |
| US9.1 | NC3 | nc3-revisit-facts | 같은 작업 안에서 다시 고친 곳을 본다 |
| US9.2 | NC3 | nc3-revisit-facts | 새 파일로 옮긴 곳과 확장자 바꿈을 본다 |
| US9.3 | NC3 | nc3-revisit-facts | 되돌린 커밋을 본다 |
| US9.4 | NC3 | nc3-revisit-facts | 다시 볼 곳은 나만 본다 |
| US10.1 | NC3 | nc3-revisit-facts | 시험 파일을 바꾼 작업이면 「있음」을 본다 |
| US10.2 | NC3 | nc3-revisit-facts | 산출물 변경은 다시 볼 곳에 나오지 않는다 |
| US11.1 | NC3 | nc3-revisit-facts | 최근에 한 작업부터 목록을 본다 |
| US11.2 | NC3 | nc3-revisit-facts | 다음 쪽을 불러와도 빠지거나 겹치는 Catch가 없다 |

## 여러 Unit에 걸치는 것

이야기 행은 모두 Unit 하나다. 다만 아래는 두 Unit이 같은 코드를 차례로 고치는 곳이다. 뒤 Unit의 기능 설계가 앞 Unit의 결과를 이어받는다.

| 걸치는 것 | 앞 Unit | 뒤 Unit |
|---|---|---|
| 본인 목록 커서 함수 | NC1(걸러 보기 조건, US4.1) | NC3(새 정렬, US11.1·US11.2) |
| 지원자 상세의 「다시 볼 곳」 자리 | NC1(자리 정하기, US3.1) | NC3(내용 채우기, US9.1) |
| GithubLinkName | NC1(이름, US2.2) | NC2(표지, US7.1·US7.2) |
| SnapshotView | NC1(칸 제목별 보기·링크 이름, US1.4·US2.2) | NC2(저장소 줄·작성 시점·한계·표지, US6·US7) |

## Unit 안의 만드는 차례

- **NC1:**
  1. AuthorDescriptionSections와 GithubLinkName(이름 규칙)
  2. api 본인 목록 걸러 보기 조건·응답 칸·커서
  3. 내 자산 편집 8칸·링크 목록·칸 순서·안내 문구·걸러 보기
  4. 발행 화면
  5. SnapshotView 칸 제목별 보기와 링크 이름
- **NC2:**
  1. 사본 칸 모양과 판본(계약 설계)
  2. api 발행 때 사본 칸 담기
  3. 받은 사람 칸 옮기기
  4. SnapshotView 세 칸
  5. GithubLinkName 표지 판정과 그리기
  6. 요약·질의응답 지시
  7. 조각·요약 근거에 새 칸이 들지 않는 시험
- **NC3:**
  1. 결과 메시지 계약 판본(계약 설계)
  2. 수집 파일 내용 식별값
  3. RevisitFacts 규칙 다섯과 좁은 목록
  4. 후보 판정 작업 시각
  5. 처리가 결과에 싣기
  6. api 결과 검사·등록·DB 칸 셋
  7. 본인 목록 정렬·커서
  8. 상세 응답과 「다시 볼 곳」 칸
  9. 고지 4절

## 빠짐 확인

- 이야기 32개가 모두 Unit 하나에 들었다. NC1에 16개, NC2에 8개, NC3에 8개다.
- 세 Unit 모두 행이 있다.
- 이야기로 만들지 않은 요구(FR11.2, FR15, NFR1, NFR3, NFR4, NFR8)는 이 표에 없다. 넘겨받을 단계는 `inception/user-stories/user-stories-assessment.md`에 있다.

## Sources

- `inception/user-stories/stories.md`
- `inception/units-generation/unit-of-work.md`, `inception/units-generation/unit-of-work-dependency.md`
- `inception/domain-design/components.md`
- `inception/requirements-analysis/requirements.md`
