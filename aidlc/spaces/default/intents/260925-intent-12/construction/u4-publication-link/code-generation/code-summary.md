# U4 발행·링크 — 코드 요약 (제출 1까지)

## Sources

입력: [코드 생성 계획](code-generation-plan.md) Step 1~8, [단위 시험 안내](unit-test-instructions.md), [U4 기능 명세](../functional-design/functional-spec.md) 「작성자 API」·W1·W2, [업무 규칙](../functional-design/rules.md) BR1~BR3, [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-12(작성자 쪽 경로는 각 Unit 기능 설계에서 정함)·C-13·C-14, 10월 본인 Catch 응답 시험 `api/test/catches/owner-catch-response.test.cjs`, 공통 인증 코드 `web/src/lib/api.ts`·`web/src/lib/auth-integration.ts`·`web/src/components/auth/member-guard.tsx`·`session-member-guard.tsx`·`reauth-notice.tsx`.

이 문서는 제출 1(Step 1~8)과 2026-10-29·11-02 보완까지의 상태다. Step 9 이후(제출 2·3)는 진행하지 않았고 Unit은 일시 정지 상태다. 정지 사유 중 U3 C-08 `PublishedIndexWriter`는 #429·#436으로 통합 브랜치에 들어갔다(2026-11-02, 원격 `48d206a`에서 확인). Step 9 재개는 제출 1 PR 뒤 담당자가 정한다. 커밋·push·PR은 하지 않았다.

## 만든·고친 파일 (제출 1)

- api 새 파일: `api/src/catches/author-description-input.ts`·`author-description-store.ts`·`author-description.controller.ts`, `api/src/materials/materials.module.ts`·`text-material-input.ts`·`text-material-store.ts`·`text-materials.controller.ts`, 시험 `api/test/catches/author-description-api.test.cjs`·`api/test/materials/text-materials-api.test.cjs`
- api 고친 파일: `api/src/catches/catches.module.ts`, `api/src/app.module.ts`(`MaterialsModule` 등록), `api/docs/publications.md`
- web 새 파일: `web/src/lib/save-outcome.ts`, `web/src/lib/view-store.ts`(보완), `web/src/features/assets/author-description-api.ts`·`author-description-panel.tsx`·`author-description-editor.tsx`, `web/src/features/materials/`(api·view·screen·css·README), `web/src/app/(member)/materials/page.tsx`, 시험 `web/test/author-description.test.mjs`·`web/test/materials.test.mjs`·`web/test/materials-screen.test.mjs`(보완)·`web/test/author-description-editor.test.mjs`(보완)
- web 고친 파일: `web/src/features/assets/assets-view.tsx`·`assets-connected.tsx`·`assets-member-page.tsx`·`assets.module.css`·`README.md`, `web/src/lib/routes.ts`·`member-navigation.ts`, `web/src/components/header/member-header.tsx`, `web/README.md`

## 구현 결정과 설계 후속 변경 기록

2026-10-29 담당자가 D1~D3을 받아들였다. 승인된 기능 설계 원본(`functional-spec.md`·`rules.md`)은 소급 수정하지 않고, 아래를 후속 변경으로 기록한다. 제출 1 PR 「리뷰 요청」과 다음 단계(Build and Test) 입력 변경에 같은 내용을 옮긴다.

| # | 결정(받아들임) | 설계 원본과의 차이 | 근거 |
|---|---|---|---|
| D1 | Catch 설명 조회 `GET /v1/catches/{catchId}/description`을 별도로 둔다. 응답은 PUT과 같은 `{ authorDescription, authorDescriptionUpdatedAt }`(없으면 둘 다 `null`), 남의 것·없음·형식 오류 UUID는 404 `RESOURCE_UNAVAILABLE` | 기능 명세 「작성자 API」 표에 이 행이 없다 | 기존 조회로는 설명을 읽을 수 없다. 10월 `GET /v1/catches`·`GET /v1/catches/{catchId}`는 설명 칸을 내보내지 않고, 응답 모양을 `owner-catch-response.test.cjs`가 칸까지 비교한다(10월 응답에 더하면 10월 계약 모양·시험을 바꿔야 함). C-12가 작성자 경로를 Unit 기능 설계에 맡겨 계약 변경은 없다 |
| D2 | 텍스트 자료 목록은 만든 시각 최신순, 같은 시각은 ID 역순. 커서에 마이크로초 시각·ID를 담고 남의 커서는 400 | 기능 명세는 "10월 cursor"만 정했다 | 새로 쓴 자료를 먼저 고르는 경우가 많다. 브라우저에서 새 자료가 맨 위에 오는 것을 확인했다 |
| D3 | 화면 주소 `/materials`, 회원 헤더 메뉴 [텍스트 자료] | 기능 명세 W2는 주소를 정하지 않았다 | U4 담당 결정. web README 주소 표의 '미정' 표기는 PR에서 확정으로 바꾼다 |

## 2026-10-29 보완

### 결함 수정: 새 자료 첫 저장 뒤 "저장됨"이 사라짐

- 원인: 새 자료를 처음 저장하면 화면이 선택을 '기존 자료'로 옮기고, 편집기 속성 `initialId`가 바뀌어 불러오기 효과가 다시 돌았다. 그 응답이 편집 상태를 서버 값으로 바꾸며 "저장됨"을 지웠고, 응답이 늦으면 저장 직후 더 쓴 입력까지 덮을 수 있었다.
- 수정(`materials-screen.tsx`):
  - 편집기는 열 때의 자료 ID를 만들 때 한 번만 받는다(`createMaterialEditorModel(client, openId, …)`). 첫 저장 뒤에는 다시 불러오지 않는다.
  - 불러오기 응답은 아직 불러오는 중이고 가장 최근 요청일 때만 반영한다. 다시 불러오기로 앞 요청은 취소하고, 늦게 온 응답은 버린다.
  - 저장 중에 더 쓴 입력은 저장 성공 응답이 덮지 않는다. 저장된 값은 `saved`에 반영되어 '저장하지 않은 변경'으로 보인다.
- 같은 원칙을 Catch 설명 편집기(`author-description-editor.tsx`)에도 적용했다.

### 결함 수정: 자료 A 삭제 중 자료 B를 열면 B 입력이 사라짐(읽기 전용 재검토 지적)

- 재현: A 삭제 요청이 끝나기 전에 B를 열어 입력하면, A의 늦은 삭제 성공이 화면 모델의 `deleted()`에서 선택과 미저장 상태를 지워 B 편집기를 닫았다. 수정 전 코드에서 새 경합 시험 2개가 실패하는 것으로 확인했다.
- 수정(`materials-screen.tsx`):
  - 삭제 성공 반영과 현재 편집기 종료를 나눴다. 목록에서는 언제나 A를 뺀다. 편집기와 미저장 상태는 지금 A를 열고 있을 때만 닫고 지운다.
  - 편집기가 해제된 뒤 도착한 삭제 성공도 화면 모델에 알린다. 서버에서는 지워졌으므로 목록에서 빼야 하기 때문이다. 해제 뒤 도착한 삭제 실패는 해제된 편집기 상태에만 남고 화면 선택을 바꾸지 않는다.
- 회귀 시험(`materials-screen.test.mjs`): A 삭제 중 B를 열어 입력(B의 선택·입력·미저장·편집기 key 보존, 목록에서 A만 빠짐), A 삭제 중 새 자료를 열기, A를 연 채 삭제(기존처럼 닫힘), 해제 뒤 삭제 실패(선택 유지). 첫 저장 회귀 시험은 그대로 둔다.

### 상태 전이 시험과 커버리지

두 화면 파일의 상태 전이를 각 파일 안의 모델(`createMaterialsScreenModel`·`createMaterialEditorModel`·`createDescriptionEditorModel`)로 옮기고, 화면 컴포넌트는 그 모델을 `useSyncExternalStore`로 읽는다. 새 시험은 원본 `.tsx`를 TypeScript로 변환해 불러와 모델의 실제 전이를 확인한다. 파일을 측정에서 빼거나 기준을 바꾸지 않았다.

- `web/test/materials-screen.test.mjs`(14개, 삭제 경합 3개 포함): 첫 저장 회귀(저장됨 유지·재조회 없음·편집기 key 유지), 저장 중 추가 입력 보존, 늦은 불러오기 응답 무시, 저장 실패 3종 입력 유지, 검사 거부 시 요청 없음, 로그인 변경 뒤 응답 무시, 열기 실패와 다시 불러오기, 삭제 확인·취소·실패·성공, 목록 성공·실패·더 보기, 이탈 확인과 머무르기, 첫 화면 렌더
- `web/test/author-description-editor.test.mjs`(6개): 읽기·저장됨·공백 저장, 저장 중 추가 입력 보존과 중복 전송 막기, 실패 입력 유지·4,001자 거부, 불러오기 실패(로그인 만료 이유)와 다시 불러오기, 늦은 응답·로그인 변경 무시, 첫 화면 렌더
- 화면 컴포넌트의 효과(마운트 때 불러오기 시작)는 서버 렌더링 시험에서 돌지 않는다. 그 연결은 아래 브라우저 확인으로 본다.

## 2026-11-02 보완

### 최신 통합본 대조

- 원격 통합 브랜치 `48d206a` 위에 이 작업 트리의 변경을 얹은 별도 작업 폴더에서 확인했다. 이 폴더의 HEAD `dcd7a01`은 그 원격 변경을 아직 가져오지 않았다.
- 원격 변경과 겹치는 파일은 3개다. `api/src/app.module.ts`는 충돌이 나며 양쪽 모듈 등록을 모두 남겨 해소한다. `web/README.md`·`web/src/lib/routes.ts`는 자동 병합된다. 의존성 변경은 없다.
- U7의 재분석 변경 뒤에도 Catch 결과 반영 코드는 설명 칸을 쓰지 않는다. S2(같은 작업 재반영 뒤 설명 유지)가 통과한다.
- 원격 공통 인증 변경(`auth-api.ts`의 `memberAuthRejected`, `reauth-notice.tsx`)은 U4 저장 결과 구분과 충돌하지 않는다.

### 결함 수정: 저장 중 다른 자료로 옮기면 서버에 저장된 자료가 목록에 없음

- 재현: 새 자료(또는 기존 자료 A)를 저장하는 중에 미저장 확인을 거쳐 다른 자료로 옮기면, 편집기 해제가 저장 요청을 취소했다. 서버에는 저장됐는데 목록에 나타나지 않아 같은 자료를 다시 만들 수 있었다. 수정 전 코드에서 새 시험 2개가 실패하는 것을 확인했다.
- 수정(`materials-screen.tsx`):
  - 저장 요청은 편집기 해제로 취소하지 않는다. 해제 때는 불러오기만 취소한다.
  - 늦게 온 저장 성공은 화면 모델 `saved(item, created, editorSession)`가 목록에 반영한다(새 자료는 목록에 더하고, 이미 있으면 바꾼다).
  - 선택은 그 저장을 보낸 편집기가 아직 열려 있을 때만 옮긴다.
- 회귀 시험(`materials-screen.test.mjs`, 16개): 새 자료 저장 중 다른 자료를 열면 늦은 성공이 목록에 더해지고 지금 선택·입력은 그대로다. A 저장 중 B로 옮기면 늦은 성공은 목록의 A만 바꾸고 B 선택을 그대로 둔다.
- `author-description-editor.test.mjs`는 쓰지 않는 인자로 난 lint 경고만 고쳤다.

### 검증(2026-11-02, 판본: 원격 `48d206a` + 이 작업 트리의 변경)

| 확인 | 결과 |
|---|---|
| api 제출 1 시험 / 타입 | 11개 통과 / 오류 없음 |
| api 줄 커버리지 | U4 파일 96.9~100% |
| web 전체 / U4 시험 | 822개 / 34개 통과 |
| web U4 줄 커버리지 | 95.06%(분기 82.84%) |
| web 타입·lint·빌드 | 오류 없음, 빌드 성공(`/materials`) |
| api 실제 HTTP 경계(18개 통과) | 이모지 본문 20,000자 201·20,001자 400, 제목 101자 400, 정의 밖 필드·깨진 JSON·NUL 400, 남의 자료·형식 오류 ID·없는 ID는 같은 404이고 원본 유지, 인증 없음 401, 커서로 47개를 3쪽에 걸쳐 중복·누락 없이 최신순, 남의 커서·변조한 커서·잘못된 limit 400, 남의 Catch 설명 404 |
| 브라우저(기존·통합 모드 각 12개 통과) | 첫 저장 "저장됨" 유지·재조회 없음, 저장 중 잠금, 저장 중 이동 뒤 늦은 성공 반영, 늦은 불러오기 취소, A 삭제 중 B 편집 유지, 이탈 확인(다른 자료·헤더 링크·상세 [닫기]·새로고침)에서 취소하면 머무름, 저장 실패(연결 끊김·500) 때 입력 유지, [더 보기]로 47개 |

- 확인 창은 대역을 쓰지 않았다. 실제 네이티브 창(`confirm`·`beforeunload`)이 열리는 것을 브라우저 개발자 도구 프로토콜로 받아 확인·취소를 눌렀다. 창 모양은 캡처하지 않았다.
- 지연·실패 응답은 같은 프로토콜로 요청을 붙잡거나 끊어 만든 합성 조건이다.
- 환경: 검증 전용 일회용 DB를 썼다. `catchu-db-u4-dev`는 기존 `analysis_request` 행 때문에 U7 마이그레이션이 거부되어 쓰지 않았고, 확인 결과 그 DB의 마이그레이션 기록과 표는 바뀌지 않았다.

로그인 만료와 갱신 실패는 만든 방법이 다르다.

| 경우 | 만든 방법 | 결과 |
|---|---|---|
| 시간 만료, 기존 모드(기본값) | **실제 시간 경과**: Access 토큰 수명 900초를 기다렸다. 서명 키·세션은 건드리지 않았다 | 텍스트 자료·Catch 설명 모두 PUT 401 → `/login?next=…`로 이동, 입력 사라짐. BR2.3 미충족이 그대로다 |
| 시간 만료, 통합 모드 | **실제 시간 경과**(위와 같음) | PUT 401 → 갱신 성공 → "저장되지 않았습니다 / 로그인이 연장되었습니다. 다시 눌러 주세요."와 입력 유지 → 다시 누르면 "저장됨". 기다리는 동안 미리 갱신하는 요청은 없었다 |
| 갱신 실패, 통합 모드 | **강제 조건**: api 서명 키 교체로 Access 토큰을 무효로 하고 DB의 세션 행을 지웠다(시간 만료가 아님) | PUT 401 → 갱신 실패 → 재인증 안내와 [다시 로그인], "저장되지 않았습니다 / 로그인이 만료되었습니다…", 입력 유지. [다시 로그인]은 네이티브 확인 창을 거쳐 취소하면 머물고 확인하면 `/login?next=%2Fmaterials` |

## 검증 기록

판본: 브랜치 `intent/260925-intent-12`, HEAD `dcd7a01`(통합 브랜치 #422 병합 반영) + 커밋하지 않은 작업 트리. Node v24.21.0, Next.js 16.4.1, React 19.2.8. 날짜 2026-10-29.

| 확인 | 명령 | 결과 |
|---|---|---|
| api 제출 1 시험 | `cd api && TEST_DB_PORT=5443 npm test -- test/catches/author-description-api.test.cjs test/materials/text-materials-api.test.cjs` | 11개 통과(보완 뒤 다시 실행) |
| web 제출 1 시험 | `cd web && node --test test/author-description.test.mjs test/materials.test.mjs test/materials-screen.test.mjs test/author-description-editor.test.mjs` | 32개 통과(삭제 경합 보완 뒤) |
| web 전체 | `cd web && npm test` | 683개 통과, 실패 0(삭제 경합 보완 뒤) |
| web 타입·lint | `npx tsc --noEmit`, 바꾼 파일 `npx eslint` | 오류 없음 |
| web 빌드 | `cd web && npm run build` | 성공(`/materials` 정적 경로). 보완 뒤 다시 실행해 성공 |
| api 줄 커버리지 | `TEST_COVERAGE_INCLUDE='dist/{materials/**,catches/author-description*}' npm run test:coverage -- <위 2개 파일>` | 98.60% |
| web 줄 커버리지(화면 파일 포함, 코드) | `node --test --experimental-test-coverage --test-coverage-include="src/{features/materials/**/*.{ts,tsx},features/assets/author-description*,lib/save-outcome.ts,lib/view-store.ts}" <위 4개 시험>` | **94.78%**(분기 82.77%). `materials-screen.tsx` 94.24%, `author-description-editor.tsx` 83.33%(삭제 경합 보완 뒤) |
| 같은 범위 + CSS 파일 | 포함 범위를 `features/materials/**`로 | 91.57%(보완 전 측정, CSS 모듈 29줄이 0%로 들어감) |

보완 전 측정(화면 파일 2개를 0%로 넣음)은 약 62.6%였다.

### 브라우저 확인 (로컬)

환경: 이 폴더 전용 개발 DB `catchu-db-u4-dev`(포트 5444, 마이그레이션 적용), api `npm run start:dev`(127.0.0.1:3101, `NODE_ENV=development`, 개발용 로그인), web `npm run dev -- -p 3100`. 회원은 개발용 로그인으로 만들고, Catch는 합성 행으로 넣었다.

| 항목 | 결과 | 만든 방법 |
|---|---|---|
| 새 자료 첫 저장 | "저장됨"이 남고, POST 201 뒤 GET 재조회가 없다(보완 전에는 "저장됨" 없음) | 실제 api |
| 저장 직후 추가 입력 | 입력이 남고 '저장하지 않은 변경' 표시 | 실제 api |
| 저장 실패 | "저장되지 않았습니다"와 이유, 입력 유지(텍스트 자료·Catch 설명) | **합성**: 페이지 안 `fetch` 응답을 500으로 바꿈 |
| 이탈 취소 | 헤더 링크·다른 자료 열기·Catch 상세 닫기에서 확인 문구가 불리고, 머무르기면 입력 유지 | **`window.confirm` 대역**: 페이지 안에서 `confirm`을 문구 기록·`false` 반환으로 바꿈. 화면 연결(확인을 부르는지, 거절하면 머무는지)만 확인했고 브라우저 네이티브 확인 창 자체는 띄워 보지 않았다(2026-11-02 보완에서 실제 창으로 확인) |
| 삭제 중 다른 자료 열기(A 삭제 → B 열어 입력) | B의 제목·입력·'저장하지 않은 변경'이 남고, 목록에서 A만 빠짐. DB에서 A 행 삭제 확인 | 실제 api 삭제. 응답을 늦추려고 페이지 안 `fetch`의 DELETE만 5초 지연하는 대역, 삭제 확인은 `window.confirm` 대역(`true` 반환) |
| 로그인 만료, 기존 모드 | PUT 401 → `/login?next=…`로 이동, 입력 사라짐 | **실제 서버 401**: api를 다른 서명 키로 다시 띄워 Access 토큰을 무효로 만듦 |
| 로그인 만료, 통합 모드 갱신 성공 | PUT 401 → refresh 200 → "로그인이 연장되었습니다. 다시 눌러 주세요.", 입력 유지 → 다시 누르면 "저장됨" | 실제 서버 401과 실제 갱신(web은 `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true`, API 주소 `http://localhost:3101`) |
| 로그인 만료, 통합 모드 갱신 실패 | PUT 401 → refresh 401 → 재인증 안내 "로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요."와 [다시 로그인], 화면·입력 유지. [다시 로그인]은 "다시 로그인하면 입력하던 내용이 사라질 수 있습니다…" 확인을 거친다 | 실제 서버: 서명 키 교체 + 개발 DB의 세션 행 삭제 |

- 이전 확인의 합성 401(페이지 안 `fetch`를 401로 바꿈)과 위의 실제 서버 401을 구분한다.
- Access 토큰 수명(900초)이 지나서 생기는 만료는 기다려 재현하지 않았다. 서명 키 교체로 만든 401은 같은 `AUTH_INVALID` 경로이지만 시간 만료 그 자체는 아니다(2026-11-02 보완에서 실제 900초 경과로 확인).

## 로그인 만료 대조와 최소 변경안

| 모드 | 401을 받으면 | 입력 |
|---|---|---|
| 기존(현재 기본값, `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION` 꺼짐) | 공통 클라이언트(`api-client.ts`)가 토큰을 지우고, 기존 회원 가드(`member-guard.tsx`)가 로그인으로 보낸다. 갱신 시도는 없다 | 사라짐 |
| 통합(켬) | 공통 인증이 갱신을 시도한다. 성공하면 "다시 눌러 주세요"(`renewed-rejected`), 실패하면 회원 가드(`session-member-guard.tsx`)가 화면을 유지한 채 재인증 안내를 연다 | 남음(U4 화면은 `useUnsavedChanges`로 미저장 확인에 참여) |

- U4 화면 코드는 두 모드에서 정해진 대로 동작한다. BR2.3의 "로그인 만료 때도 입력 유지"를 기본값에서 지키려면 공통 기반을 바꿔야 한다. 이번에는 수정하지 않았다.
- 최소 변경안(공통 기반 담당·팀장 결정 사항, 제안만):
  1. **(권고)** 공통 인증 통합 모드를 제품 기본으로 켠다. `auth-integration.ts` 주석의 미결 정책(#286 P2·P5 등)이 정리되는 시점에 함께 정한다. U4 쪽 추가 변경은 없다.
  2. 기존 모드를 유지하는 동안에는 BR2.3의 로그인 만료 입력 유지를 '통합 모드 전환 뒤 충족'인 한계로 PR에 적는다.
  3. 기존 가드만 고쳐 401에서 화면을 남기는 안은 공통 가드 동작과 다른 화면 전체에 영향이 있어 권하지 않는다.

## 제출 1의 완료 여부

로컬 수정·검증 기준으로 제출 1의 결함과 커버리지 문제는 해소했다. 남은 것:

1. **미해결(남은 한계, 팀장·공통 인증 담당 판단):** 기본 모드(통합 시험 전환 꺼짐)에서 로그인 만료(401) 때 입력이 사라진다(BR2.3 미충족). 2026-11-02 실제 900초 경과 만료로 다시 확인했다. 통합 모드에서는 시간 만료(갱신 성공)와 강제 갱신 실패 모두 입력이 남는다. 공통 인증 기본값·가드는 바꾸지 않았다(위 최소 변경안).
2. 해소: Access 토큰 시간 만료와 브라우저 네이티브 확인 창(이탈·삭제·[다시 로그인])은 2026-11-02에 실제로 확인했다. 창 모양 캡처는 하지 않았다.
3. PR 전: 이 폴더에 최신 통합 브랜치를 가져오고 `app.module.ts` 충돌을 해소한다. 가져온 뒤에는 2026-11-02 검증 판본(`48d206a`)과 실제 PR 판본을 비교하고, 충돌 해소와 새로 들어온 변경이 닿는 범위에 맞춰 시험(api 제출 1·web 전체·타입·빌드, 필요하면 브라우저 확인)을 다시 돌려야 한다. 아직 하지 않았다.
4. PR에 D1~D3 후속 변경, 위 BR2.3 한계, 2026-11-02 저장 경합 수정을 적는다.
5. 재개 때: #416 Q1 B(텍스트 자료 본문과 Catch 작성자 설명 안의 GitHub 주소만 링크, NFR1.11)를 계획 97행 미결 표와 Step 16·17·22·23에 반영한다. 계획 승인 내용이 바뀌므로 다시 확인받는다. 이번에는 계획을 고치지 않았다.

## 계획과 달라진 점

- D1 경로 추가(계획 밖, 담당자 수용).
- 화면 상태 전이를 각 화면 파일 안의 모델로 옮기고 `web/src/lib/view-store.ts`를 더했다(시험 가능하게 하기 위함).
- Step 1 확인과 api 시험은 테스트 DB 포트가 다른 작업 폴더와 겹치지 않게 `TEST_DB_PORT=5443`으로 실행했다.
- 커버리지 명령은 계획의 publications 파일이 아직 없어 제출 1 파일로 범위를 좁혀 쟀다. 시험 파일 2개(`materials-screen`·`author-description-editor`)는 계획의 파일 목록에 없던 것을 더했다.

## 실행하지 않은 시험

- S10(자료 삭제 뒤 발행 사본 유지)은 계획대로 제출 2에서 한다.
- 화면 컴포넌트의 마운트 효과는 서버 렌더링 시험에서 돌지 않으며, 브라우저 수동 확인으로만 봤다.
- 두 탭 동시 저장은 브라우저에서 확인하지 않았다(마지막 저장 유지는 api S1로 확인).
