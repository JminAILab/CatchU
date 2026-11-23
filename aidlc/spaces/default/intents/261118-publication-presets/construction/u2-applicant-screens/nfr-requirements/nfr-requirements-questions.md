# NFR Requirements Questions — u2-applicant-screens

근거: 기능 설계 `construction/u2-applicant-screens/functional-design/`(functional-spec·rules·frontend-components, 검토 review-01), 요구사항 `inception/requirements-analysis/requirements.md` NFR1~NFR6, 계약 `inception/contract-design/contract-summary.md` P-1·P-2, 코드 지식 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`, 지금 코드 `api/src/catches/owner-catch-input.ts`(본인 목록과 공개 목록이 쿼리 해석 `pageFilters`를 함께 씀).

요구사항이 정한 접근성(NFR1)·권한(NFR2, U1)·글자로만 그리기(NFR3)·로그(NFR4, U1)·상태 구분(NFR5)·목록 한 번(NFR6)은 다시 묻지 않는다. 새 라이브러리를 들이지 않는다는 제약(requirements Constraints)도 그대로다. 아래 둘만 비어 있다.

## Q1. [보안 담당] `publishable=true`를 공개 Catch 목록에서도 받을지

U2는 본인 Catch 목록(`GET /v1/catches`)에 `publishable=true`를 더한다(기능 설계 BR5.1). 지금 본인 목록과 받은 사람·공개 프로필이 쓰는 공개 Catch 목록은 쿼리 해석(`pageFilters`)을 함께 쓴다. 그래서 해석에 그대로 더하면 공개 목록도 이 쿼리를 받게 된다(기능 설계 검토 Minor 2).

A. 본인 목록에서만 받는다. 공개 목록에 `publishable`이 오면 지금처럼 모르는 쿼리로 400이다. 공개 목록은 이미 공개 Catch만 주므로 쓸 곳이 없고, 받는 쿼리가 늘지 않는다(권장, 가장 단순)
B. 두 목록 모두 받는다. 해석 코드는 한 곳이지만, 공개 목록 응답이 확인·보호 조건으로 줄어드는 새 동작이 생기고 그 시험이 더 필요하다
X. Other (please specify)

[Answer]: A

## Q2. [성능 담당] 프리셋 편집 화면의 요청 수·응답 시간 목표

프리셋 편집 화면은 열 때 상세 1번, 고르기 목록 셋(Catch·텍스트 자료·PDF)을 1번씩, 그리고 쪽마다 세기(`POST /v1/presets/measure`)를 1번씩 부른다(기능 설계 Q3 A). [더 보기]마다 목록 1번과 세기 1번이 늘어난다. 이용자는 12월까지 팀 관련자뿐이고, 지금 다른 화면에도 응답 시간 목표나 재는 장치는 없다.

A. 숫자 목표를 두지 않는다. 화면을 열 때 요청 수를 「상세 1 + 목록 3 + 세기 최대 3」으로, [더 보기] 한 번에 「목록 1 + 세기 1」로 고정하는 것만 요구로 적고 시험으로 센다. 세기 요청이 늦거나 실패해도 고르기 단추는 먼저 그리고, 글자 이유 막힘만 나중에 붙는다(권장, 가장 단순)
B. 위에 더해 응답 시간 목표(예: 편집 화면이 쓸 수 있게 되기까지 2초)를 둔다. 재는 방법(브라우저 시험이나 로그)이 지금 없어 새로 들여야 하고, 그만큼 공수가 는다
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
