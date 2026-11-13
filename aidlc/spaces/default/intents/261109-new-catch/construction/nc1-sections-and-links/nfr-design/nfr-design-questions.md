# NC1 칸 제목과 링크 이름 — NFR 설계 질문

## 질문의 범위

- 입력:
  - NC1 NFR 요구 `construction/nc1-sections-and-links/nfr-requirements/`(성능·보안·기술 스택)
  - NC1 기능 설계 `construction/nc1-sections-and-links/functional-design/`
  - 계약 C1·C7
- 이미 정해진 것은 묻지 않는다.
  - 색인 없음, 코드로 호출 수 확인
  - 화면 출력 안전(React 텍스트, 제어 문자 지우기, 판별 규칙 유지, 포트 든 주소는 주소 전체)
  - 저장소 목록은 화면을 열 때 한 번 끝까지 읽음
  - 공개 응답은 지금처럼 필드를 골라 담으므로(`public-catch-store.ts`의 `publicResponse`) 새 칸이 새지 않음
- ui Unit이라 성능 설계·보안 설계·논리 구성 요소 문서와 추적 표를 만든다. 확장성·신뢰성·관측 설계는 두지 않는다.
- 가장 단순한 안을 A로 둔다.

## Q1. [성능·보안] 본인 응답의 `hasAuthorDescription`을 어떻게 읽을까요?

**배경:** 본인 목록·상세와 공개 Catch는 같은 읽기 칸(`catch-reader.ts`의 `READ_COLUMNS`)을 쓴다. 지금 이 칸에는 작성자 설명이 없다. 작성자 설명 원문은 따로 `GET /v1/catches/{catchId}/description`으로 읽는다.

A. 읽기 칸에 `c.author_description IS NOT NULL AS "hasAuthorDescription"` 참/거짓 하나만 더한다. 원문은 목록·상세에서 읽지 않는다. 공개 쪽도 같은 칸을 읽지만 `publicResponse`가 필드를 골라 담아 밖으로 나가지 않는다. (가장 단순)
B. 본인 목록·상세 질의에만 따로 그 칸을 더하고 공용 읽기 칸은 그대로 둔다. 공개 쪽 질의는 그 값조차 읽지 않는다. 대신 본인과 공개의 읽기 칸이 갈라져 두 곳을 맞춰 고쳐야 한다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q2. [성능] 발행 화면의 저장소 이름은 어떤 부품으로 불러올까요?

**배경:** 내 자산 화면은 `createRepositoryOptionsStore`(`repository-options-store.ts`)로 저장소 목록을 Catch 목록과 따로 불러온다. 이 부품은 쪽을 끝까지 읽고, 실패하면 `error` 상태를 둔다. 발행 화면은 지금 저장소 목록을 부르지 않는다(NFR1.2, BR6.2).

A. 발행 화면도 같은 `createRepositoryOptionsStore`를 화면을 열 때 한 번 만들어 쓴다. 실패하면 작은 줄에서 저장소 이름만 빠진다. 새 부품이 없다. (가장 단순)
B. 발행 화면 전용 불러오기를 새로 만든다. 발행 화면에 맞는 상태를 따로 둘 수 있다. 대신 같은 일을 하는 코드가 둘이 된다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
