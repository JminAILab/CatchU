# NC1 칸 제목과 링크 이름 — NFR 요구 질문

## 질문의 범위

- 입력:
  - NC1 기능 설계 `construction/nc1-sections-and-links/functional-design/`(`functional-spec.md`·`rules.md`·`frontend-components.md`)
  - 요구사항 NFR1~NFR8, 계약 C1·C7, 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이미 정해진 것은 묻지 않는다.
  - 화면 출력 안전: React 텍스트로만 그리기, 이름의 제어·서식 문자 지우기, `rel="noopener noreferrer"`(NFR5, BR2.5·BR2.7)
  - 접근성(NFR6), 옛 글 호환(NFR7), 시험 방식(NFR8)
  - 본인 목록 응답에만 `hasAuthorDescription`을 싣고 공개 응답은 바꾸지 않는 것(C1, BR5.3)
  - 기술 스택: 새 라이브러리 없이 지금 web(Next.js·React)과 api(NestJS·TypeORM·PostgreSQL)만 쓴다
- NC1에 해당하지 않는 것: NFR3(NC2 빌드와 시험), NFR4(NC3 빌드와 시험). 확장성·신뢰성·관측은 ui Unit이라 문서를 만들지 않는다.
- 가장 단순한 안을 A로 둔다.

## Q1. [성능] 본인 목록의 「작성자 설명」 조건에 DB 색인을 더할까요?

**배경:** 본인 목록은 지금 `c.owner_id = $1`로 그 회원의 Catch만 읽고 `catch_id` 순으로 한 쪽씩 자른다. 새 조건은 여기에 `author_description IS [NOT] NULL`을 더한다(BR5.1). 12월까지 이용자는 팀 관련자와 동료 수강생이고, 회원 한 명의 Catch는 많아야 수백 개다.

A. 색인을 더하지 않는다. 회원 범위 안에서 거르는 조건 하나라 지금 목록 읽기와 같은 길로 읽는다. 마이그레이션이 없다. (가장 단순)
B. `(owner_id, catch_id) WHERE author_description IS NOT NULL` 같은 부분 색인을 더한다. Catch가 많은 회원에서 「씀」 조건이 빨라진다. 대신 마이그레이션이 하나 늘고, 지금 이용자 규모에서는 차이를 잴 수 없다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q2. [NFR1] NC1이 GitHub·AI 호출을 늘리지 않는다는 것을 어떻게 확인할까요?

**배경:** NFR1은 1~3단계가 GitHub 호출도 AI 호출도 늘리지 않는다고 하고, 같은 저장소를 바꾸기 전·후로 분석해 판정한다. NC1은 worker와 AI 호출 코드를 건드리지 않는다. 발행 화면이 새로 부르는 저장소 목록(`GET /me/repositories`)은 DB만 읽고 GitHub를 부르지 않는다. GitHub 클라이언트는 저장소 등록(POST)에서만 쓴다. 링크 이름도 화면에서만 계산한다(BR2.8).

A. NC1은 코드로 확인한다. PR에 「worker·AI 호출 코드 변경 없음, 새 요청은 DB만 읽는 저장소 목록뿐」을 적는다. 분석 전·후 호출 수 측정은 NC3 빌드와 시험에서 한 번만 한다(bolt-plan B3). (가장 단순)
B. NC1에서도 시연 저장소를 바꾸기 전·후로 분석해 호출 수를 잰다. NC1만으로도 증거가 남는다. 대신 실제 분석을 두 번 더 돌린다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

**덧붙임(사람 원문):** 질문의 「저장소 목록은 DB만 읽는다」는 조금 다르다. GET /me/repositories는 목록 전에 refreshStatus로 보관된 GitHub 자격 정보를 읽어 만료만 확인한다(github-connection.service.ts). GitHub와 AI는 부르지 않으므로 결론은 같다. PR에는 「GitHub·AI 호출 없음(저장소 목록은 DB와 자격 정보 보관소만 읽음)」으로 적는다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
