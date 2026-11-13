# 새 Catch — Unit 나누기 질문

## 질문의 범위

- 입력:
  - 구성 요소 `inception/domain-design/components.md`(16개, 새것 셋)와 설계 결정 `decisions.md`(ADR-001~004)
  - 요구사항 `inception/requirements-analysis/requirements.md`
  - 사용자 이야기 `inception/user-stories/stories.md`(32개)
- 이미 정해진 것은 묻지 않는다.
  - 만드는 사람은 팀장 한 명이다(제약 11).
  - 모든 Unit이 기존 web·api·worker를 고치므로 새 배포 단위가 없다. 3단계는 api·worker를 함께 배포한다(FR15.1).
  - 단계마다 기다리던 선행 PR(#487·#488, Catch 개편 CR1~CR3)은 이미 통합 브랜치에 들어와 이 작업 브랜치에 합쳐졌다(커밋 a1d0fbb4).
- 이 문서는 Unit의 경계와 의존만 정한다. 무엇을 먼저 만들지는 일정 계획 단계에서 정한다.
- 가장 단순한 안을 A로 둔다.

## Q1. [설계] Unit을 어떤 경계로 나눌까요?

**배경:** 범위 문서는 할 일 11개를 1~3단계로 나눴고, 단계마다 기다리는 선행 PR이 달랐다(제약 14). 사용자 이야기 묶음 US1~US11은 할 일 번호와 같다. Catch 개편 intent는 Unit 셋(CR1~CR3)을 PR 하나씩으로 만들었다.

A. 단계마다 Unit 하나, 모두 셋으로 나눈다. 1단계 지원자 화면(US1~US5), 2단계 면접관 화면과 사본(US6~US8), 3단계 분석 쪽(US9~US11)이다. 단계별 PR 경계와 같고, 확인과 합치기가 세 번이다. (가장 단순)
B. 할 일마다 Unit 하나, 모두 11개로 나눈다. Unit이 작아지지만 기능 설계·코드 계획·확인·PR이 11번이다. 같은 파일(내 자산 상세, 사본 보기)을 여러 Unit이 차례로 고친다.
C. 서비스마다(web, api, worker) 나눈다. 한 이야기가 여러 Unit에 걸쳐 이야기 단위로 확인할 수 없다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

**덧붙임(사람 원문):** 1단계 Unit(NC1)의 설명을 「지원자 화면」만으로 적지 않는다. NC1에는 면접관이 보는 바뀜도 들어 있다(US1.4·US1.5 칸 제목별 보기, US2.2 링크 이름, 받은 사람 화면과 작성자 발행본 상세가 함께 쓰는 snapshot-view.tsx). NC1 설명에 이것을 적어, NC1을 확인할 때 면접관 화면도 보게 한다.

## Q2. [설계] 3단계 Unit은 1단계 Unit에 기댈까요?

**배경:** 범위 문서는 3단계 할 일 (9)~(11)이 1·2단계와 서로 기대지 않는다고 적었다. 기능으로는 그렇다. 하지만 코드에서는 두 Unit이 같은 곳을 고친다.
- 본인 목록 커서 함수(`ownerCatchQuery`·`nextOwnerCatchCursor`): 1단계는 걸러 보기 조건을 묶고(FR7.2), 3단계는 새 정렬로 커서 모양을 바꾼다(FR14.4).
- 지원자 상세: 1단계는 칸 순서를 바꾸고 「다시 볼 곳」 자리를 정하고(FR6.1), 3단계는 그 자리를 채운다(FR12.2).

A. 3단계 Unit이 1단계 Unit에 기댄다(1단계를 합친 판 위에서 만든다). 커서와 상세 화면을 두 번 고쳐 쓰지 않는다. 3단계를 1단계보다 먼저 합칠 수는 없다. (가장 단순)
B. 기대지 않는다(서로 다른 판에서 만든다). 어느 쪽이든 먼저 합칠 수 있다. 대신 나중에 합치는 쪽이 커서 함수와 상세 화면의 겹침을 풀어야 하고, 시험도 두 판에서 한 번씩 맞춰야 한다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

**덧붙임(경계 확인, 사람 원문):** 이 나누기에서 NC2는 web·api만 고친다. FR9.3 작업 전체 한계를 골라내는 방법은 계약 설계에서 정하는데, worker에 종류 칸을 더하는 안이 되면 NC2가 worker 변경과 결과 메시지 판본 올림에 묶이고, 그 칸은 DB 초기화 전까지 있는 Catch에 없다. 계약 설계 때 이 경계와 함께 본다.

## Plan Approval

Unit 셋(NC1~NC3, 모두 service), 의존 NC2 → NC1, NC3 → NC1로 나누는 계획을 승인하시겠습니까?

- Approve Plan
- Revise Plan

[Answer]: Approve Plan (2026-11-10). 같은 답에서 NC1의 종류만 `ui`로 바꿨다(아래 「Requested Changes Feedback」). NC2·NC3는 `service`다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct

## Requested Changes Feedback

정리에서 무엇을 고칠까요?

[Answer]: NC1의 종류만 ui로 바꾼다. NC2·NC3는 service 그대로다. 나머지 정리는 맞다.까닭: NC1은 거의 화면 일이다(8칸 편집, 발행하면 열릴 링크 목록, 걸러 보기, 발행 화면, 사본 보기의 칸 제목·링크 이름). api는 목록 걸러 보기 조건과 커서만 고친다. 기능 설계의 frontend-components.md는 ui에만 나오므로 service로 두면 NC1의 화면 부품 설계가 빠진다. NFR의 확장성·안정성·관측 문서는 service에만 나오는데 NC1에는 바뀌는 것이 없어 빈 문서가 된다. ui여도 기능 명세와 보안 요구는 그대로 나온다. 칸 제목 줄 모양, 글을 칸으로 나누고 합치는 규칙, 링크 이름 규칙, 목록 커서 같은 규칙은 NC1 기능 명세에 적는다.
