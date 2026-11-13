# 새 Catch — 작업 단위(Unit)

입력:
- 구성 요소 `inception/domain-design/components.md`(16개), 설계 결정 `inception/domain-design/decisions.md`(ADR-001~004)
- 요구사항 `inception/requirements-analysis/requirements.md`, 사용자 이야기 `inception/user-stories/stories.md`(US1~US11, 32개)
- 이 단계의 답 `units-generation-questions.md`(Q1 A·Q2 A와 덧붙임, 계획 승인, NC1 종류 바꿈)

## Unit 목록

| Unit ID | Directory | 이름 | 종류 | 크기 | 배포 |
|---|---|---|---|---|---|
| NC1 | `nc1-sections-and-links` | 칸 제목과 링크 이름(1단계) | ui | L | 기존 web·api에 함께 들어감(shared) |
| NC2 | `nc2-snapshot-fields` | 면접관 사본 칸과 표지(2단계) | service | M | 기존 web·api에 함께 들어감(shared) |
| NC3 | `nc3-revisit-facts` | 다시 볼 곳 사실과 작업 시각(3단계) | service | L | 기존 api·worker·web에 함께 들어감(shared). api·worker 동시 배포 |

- **이름:** 12월 intent의 U1~U10, Catch 개편의 CR1~CR3과 같은 통합 브랜치를 쓰므로 `NC`(New Catch) 접두를 쓴다. ID는 폴더 이름의 앞부분이다.
- **경계:** 범위 문서의 1~3단계와 같다(Q1 A). 단계마다 PR 하나로 합친다.
- **종류:**
  - NC1은 `ui`다. 거의 화면 일이고, api는 목록 걸러 보기 조건과 커서만 고친다. 기능 설계의 화면 부품 설계가 나오고, 확장성·안정성·관측 문서는 바뀌는 것이 없어 나오지 않는다. 기능 명세와 보안 요구는 그대로 나온다.
  - NC2·NC3은 배포되는 서비스 코드(api 사본, worker 분석)를 고치므로 `service`다.
  - 새로 생기는 배포 단위는 없다.
- **크기:**
  - NC1(L): 화면 넷과 새 web 공통 구성 요소 둘을 바꾼다.
  - NC2(M): 사본 칸 더하기, 표지, 지시 바꾸기다.
  - NC3(L): 새 worker 구성 요소, 결과 메시지 판본 올림, DB 칸 셋이 든다.
- **만드는 사람:** 셋 모두 팀장이다(제약 11). U3·U4·U5·U6·U10 담당은 자기 영역을 건드린 PR에서 확인한다(성공 기준 「담당 확인」).

## NC1 칸 제목과 링크 이름 (`nc1-sections-and-links`)

- **설명:** 지원자가 작성자 설명을 칸 제목 8개로 나눠 쓰고, 보낼 Catch를 고르기 쉽게 한다. **면접관이 보는 바뀜도 이 Unit에 들어 있다.** 칸 제목별 보기(US1.4·US1.5)와 링크 이름(US2.2)이고, 받은 사람 화면과 작성자 발행본 상세가 함께 쓰는 `snapshot-view.tsx`를 바꾼다. 그래서 NC1을 확인할 때 면접관 화면도 본다.
- **경계:** web의 내 자산·발행·사본 보기, web 공통 자리의 새 구성 요소 둘, api의 본인 목록 걸러 보기 조건·응답의 「작성자 설명이 있는지」·커서. 사본 칸, 결과 메시지 계약, worker, DB 칸은 바꾸지 않는다.
- **맡는 이야기:** US1.1~US1.5, US2.1~US2.3, US3.1·US3.2, US4.1·US4.2, US5.1~US5.4
- **고치는 구성 요소:** AuthorDescriptionSections(새것), GithubLinkName(새것, 이름 규칙), AssetsScreen, PublishScreen, SnapshotView(칸 제목별 보기·링크 이름), Catches(목록 걸러 보기·커서·응답 칸)
- **구현 메모·제약:**
  - 칸 제목 줄 모양, 칸 나누기·합치기 규칙, 링크 이름 규칙은 NC1 기능 명세에 적는다.
  - 목록 요청 조건, 응답의 「작성자 설명이 있는지」 칸, 커서 계약은 NC1 기능 명세에 적는다. NC3이 이를 이어받아 정렬을 바꾼다.
  - 합계 글자 수는 코드 포인트, 칸 시작 위치와 원문 주소 길이는 UTF-16 코드 단위다(ADR-001). 칸 제목 앞뒤에 이모지가 있는 글의 강조 위치를 시험한다.
  - 상세 칸 순서를 바꿀 때 「다시 볼 곳」 자리를 근거 아래에 정한다. 그 칸의 내용은 NC3이 채운다(FR6.1).
  - 발행 화면의 저장소 이름을 얻는 길은 기능 설계에서 정한다(FR8.2).
  - 링크 판별 규칙(`github-source-url.ts`)과 텍스트 자료 본문의 링크 표시는 바꾸지 않는다.

## NC2 면접관 사본 칸과 표지 (`nc2-snapshot-fields`)

- **설명:** 면접관이 지원자의 말을 시험할 재료를 받게 한다. 사본에 저장소 이름·작성 시점·작업 전체 한계를 담아 보이고, 작성자 글 속 링크가 이 작업의 본인 커밋이면 표지를 붙이며, AI가 작성자 주장을 작성자의 말로 옮긴다.
- **경계:** api의 발행·사본 만들기·요약·질의응답 지시, web의 사본 보기·받은 사람 화면. **NC2는 web·api만 고친다.** worker와 결과 메시지 계약은 바꾸지 않는다.
- **맡는 이야기:** US6.1~US6.5, US7.1·US7.2, US8.1
- **고치는 구성 요소:** Publications(사본 칸, 근거별 본인 커밋 여부), SnapshotView(저장소 줄·작성 시점·한계 목록·표지), GithubLinkName(표지 판정), RecipientScreen(새 칸 옮기기), RagAnswer(지시), PublishedIndex(새 칸이 조각에 들지 않는 시험)
- **구현 메모·제약:**
  - 사본 칸 모양(C-07·C-10·C-12)은 판본과 함께 바꾼다. 옛 사본은 칸 없이 그대로 보인다.
  - **경계 확인(계약 설계 때 함께 본다):** 작업 전체 한계 두 문장을 골라내는 방법(FR9.3)은 계약 설계에서 정한다. worker에 종류 칸을 더하는 안이 되면 NC2가 worker 변경과 결과 메시지 판본 올림에 묶이고, 그 칸은 DB 초기화 전까지 있는 Catch에 없다. 고정 문장 대조 안이면 이 경계 그대로다. 그래서 「NC2는 web·api만 고친다」와 「NC2와 NC3 사이 의존 없음」은 종류 칸 안이 아닐 때만 맞고, 그 안이 되면 계약 설계에서 의존을 다시 본다(`unit-of-work-dependency.md` 「조건」).
  - 질의응답 10개 다시 재기(FR11.2, NFR3)는 빌드와 시험에서 한다.

## NC3 다시 볼 곳 사실과 작업 시각 (`nc3-revisit-facts`)

- **설명:** 분석하는 동안 같은 작업 안의 본인 커밋끼리 보고 다시 고친 곳·옮긴 곳·확장자 바꿈·되돌림·시험 파일 「있음」을 계산해, 지원자 상세의 「다시 볼 곳」에 보인다. 첫·마지막 작업 시각을 남겨 본인 목록을 최근 작업부터 정렬한다.
- **경계:** worker의 수집(파일 내용 식별값)·후보 판정(작업 시각)·새 규칙 사실·처리, 결과 메시지 계약 판본, api의 결과 검사·등록·본인 목록 정렬과 상세 응답, DB 칸 셋, 분석 고지 4절, web의 「다시 볼 곳」 칸.
- **맡는 이야기:** US9.1~US9.4, US10.1·US10.2, US11.1·US11.2
- **고치는 구성 요소:** Collection, CandidateGrouping, RevisitFacts(새것), AnalysisProcessing, ResultReception, Catches(저장·정렬·커서·상세 응답), AssetsScreen(다시 볼 곳 칸), AnalysisNotice
- **구현 메모·제약:**
  - 결과 메시지 계약 판본을 올리고 api·worker를 함께 배포한다(FR15.1).
  - 고지 4절 문구를 바꾸는 PR에서 팀장이 승인한다(FR15.2).
  - 출시 직전 DB 초기화 전에 통합 브랜치에 들어가야 한다(FR15.3).
  - 지운 파일 항목에도 GitHub가 파일 내용 식별값을 주는지 기능 설계 때 실제 응답 하나로 확인한다(ADR-002).
  - patch가 없거나 파일 목록이 잘린 파일·커밋은 판정에서 빼고 추측하지 않는다.
  - 작업 시각은 작업 식별값이 같은 후보를 합친 뒤의 본인 커밋 목록으로 정한다(ADR-003).
  - 규칙 버림 기준(FR15.4)과 규칙 사실 대조(NFR4)는 빌드와 시험에서 시연 저장소로 잰다.
  - 커서와 지원자 상세는 NC1이 바꾼 판 위에서 다시 고친다(Q2 A).

## 첫 Unit 골격

이 intent의 범위(mvp)와 팀 관행은 따로 골격 Unit을 두지 않는다. 팀 관행은 각 Unit이 처음 실제로 연결될 때 「최소 연결 첫 결과」를 한 번 마일스톤으로 승인받게 한다(팀 규칙 「Walking Skeleton」). 최소 연결이나 합성 연결의 성공을 전체 완료로 보고하지 않는다.

## Sources

- `inception/domain-design/components.md`, `inception/domain-design/decisions.md` ADR-001~004
- `inception/requirements-analysis/requirements.md` FR1~FR15, 제약 11
- `inception/user-stories/stories.md` US1~US11
- `inception/units-generation/units-generation-questions.md` Q1·Q2, 계획 승인, Requested Changes Feedback
- `ideation/scope-definition/scope-document.md` 「만드는 순서」
