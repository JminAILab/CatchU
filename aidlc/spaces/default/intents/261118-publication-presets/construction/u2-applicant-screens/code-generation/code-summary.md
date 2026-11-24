# Code Summary — u2-applicant-screens

근거: 승인된 계획 `code-generation-plan.md`(Step 1~11), 시험 안내 `unit-test-instructions.md`, 기능 설계·NFR 요구·NFR 설계(`construction/u2-applicant-screens/`).

## 만든 파일

| 파일 | 내용 |
|---|---|
| `web/src/features/presets/presets-api.ts` | 프리셋 목록·상세·만들기·고치기·지우기·세기 호출, 응답 모양 검사, 실패를 화면 이유로 |
| `web/src/features/presets/presets-list-screen.tsx`·`presets-list-view.tsx` | 프리셋 목록(M2): 상태 넷, [새 프리셋] 단추(50개면 막힘), <고치기> |
| `web/src/features/presets/preset-editor-screen.tsx`·`preset-editor-view.tsx` | 프리셋 편집(M3): 이름 칸, 고르기 셋과 저장소 목록, 쪽마다 세기(세대 번호·끊기), 담기·순서, 20개·60,000자 막힘, 이유·상한 안내, 저장(POST/PUT, 저장 중 막힘), 첫 저장 뒤 `replaceState`, 지우기, 이탈 경고 |
| `web/src/features/presets/source-picker-view.tsx` | 발행 화면에서 옮긴 자료 고르기 부품 |
| `web/src/features/presets/README.md` | 프리셋 화면 안내 |
| `web/src/features/publications/pick-parts.tsx` | 공용 [더 보기]와 순서 목록(`ReorderList`) |
| `web/src/app/(member)/presets/page.tsx`·`new/page.tsx`·`[presetId]/page.tsx` | 주소 셋 |
| `web/test/presets.test.mjs` | 31건 |
| `api/test/catches/publishable-filter.test.cjs` | 7건(DB) |

## 고친 파일

| 파일 | 내용 |
|---|---|
| `api/src/catches/owner-catch-input.ts`·`owner-catch-store.ts` | `publishable=true`(본인 목록만, 그 밖 400), SQL `c.visibility = 'PUBLIC'`·`work_facts_confirmed`·`contribution_confirmed`·`p.applied_restriction IS DISTINCT FROM 'SOURCE_PRIVATE'`, 커서 범위는 있을 때만 끝에 더함 |
| `web/src/features/assets/catch-api.ts` | `publishable` 걸러 보기(없을 때 쿼리 그대로) |
| `web/src/lib/api-response.ts` | `blockedSources` 세 칸만 옮김, `catchIds` 지움 |
| `web/src/lib/routes.ts`, `web/src/components/header/member-header.tsx` | 주소, 메뉴 「프리셋」 |
| `web/src/lib/member-navigation.ts` | 로그인 뒤 돌아갈 회원 경로에 `/presets`(계획과 다른 점 1) |
| `web/src/features/publications/publications-api.ts`·`publish-screen.tsx`·`publish-view.tsx`·`publish-sources.ts` | 프리셋 고르기(이유 순서·외 N개·5개), `presetIds` 요청, `CATCH_PRIVATE`, 막힘 안내(목록 다시 불러와 이름 찾기), 404·400 `presetIds`, 확인 단계 「고른 프리셋과 순서」, `FlaggedCatches`·`PRIVATE_CATCH_NOTICE` 쓰임·작성자 설명 없는 Catch 안내 없앰, `publishDraftErrors` 1~5개 |
| `web/test/publish.test.mjs`(전면), `api-response.test.mjs`, `u9-recipient-claude.test.mjs`(한 줄), `api/test/catches/owner-catch-http.test.cjs` | 시험 |
| `web/README.md`, `web/src/features/publications/README.md`, `web/src/features/assets/README.md`, `api/docs/catch-owner-read-preparation.md` | 문서 |

지운 파일은 없다. 쓰지 않게 된 내보내기(`SelectedItem`·`selectedKeys`·`FlaggedCatches`·`SourcePickerView`·`SelectedListView`·`catchSubline`·`PublishItemRef`·`TOTAL_TEXT_LIMIT_TEXT`, `catchIds` 타입)를 지웠다.

## 주요 판단

- 첫 저장 뒤 주소는 화면 의존성 `replaceUrl`(브라우저에서는 `window.history.replaceState`)로 바꾸고, 화면 모드는 상태의 프리셋 ID로 정한다(NFR 설계 Q1).
- 보호 관측이 없는 Catch는 SQL에서 빠지지 않고 지금처럼 응답을 만들 때 500이다. 시험은 등록 뒤 관측 행을 지워 확인했다.
- 저장 실패 뒤 초점은 [저장]의 id로 되돌린다(React 컴파일러 린트가 ref 전달을 막아서).

## 시험 결과

| 명령 | 기준선(바꾸기 전) | 끝 |
|---|---|---|
| `(cd web && node --test test/presets.test.mjs test/publish.test.mjs test/api-response.test.mjs)` | publish·api-response만 33건 통과 | 58건 통과, 0건 실패(presets 31, publish 18, api-response 8)(약 0.7초) |
| `TEST_DB_PORT=5433 npm --prefix api test -- test/catches/publishable-filter.test.cjs test/catches/owner-catch-http.test.cjs` | owner-catch-http만 56건 통과 | 63건 통과, 0건 실패(약 17.7초, 빌드 포함) |
| `npm --prefix web test`(전체) | — | 1100건 통과, 0건 실패 |
| web·api lint, typecheck | — | 오류 0 |

참고 커버리지(이 단위 web 파일, 세 시험 파일로 잰 줄 비율): presets-api 100, presets-list-view 100, preset-editor-view 98.7, preset-editor-screen 95.6, source-picker-view 92.3, presets-list-screen 81.5, publish-screen 95.6, publish-view 100, pick-parts 65.4. 80% 문턱은 Build and Test가 전체 명령으로 잰다. 문턱 설정은 바꾸지 않았다.

## 기록 남기지 않기(NFR4.1, Step 11)

바뀐 파일의 더한 줄과 새 파일 전부에서 새 `console.`·`Logger` 호출은 0건이다. `presets.test.mjs`에 `features/presets/`에 `console.`이 없는지 보는 시험이 있다.

## 이 단계에서 돌리지 않은 시험

- 브라우저에서만 보이는 동작: 첫 저장 뒤 `replaceState`에 Next 16이 화면을 다시 만들지 않는지, 순서 단추·저장 실패 뒤 초점, 320px 폭 헤더·편집 화면. 서버 렌더링 시험은 마운트 효과를 돌리지 않는다. Build and Test에서 브라우저로 확인한다.
- api 전체 시험과 커버리지: Unit 확인 명령에서 돈다.

## 계획과 다른 점

1. `web/src/lib/member-navigation.ts`(계획에 없는 파일) 한 줄: 로그인 뒤 돌아갈 회원 경로 목록에 `/presets`. web README 「코드 추가 위치」가 새 회원 최상위 주소를 여기에도 넣으라고 정한다(같은 규칙을 적은 다른 곳).
2. `web/test/u9-recipient-claude.test.mjs`(계획에 없는 파일) 한 줄: 확인 단계 부품의 칸 이름 `items` → `presets`. 시험 내용은 그대로다.
3. 막힘 줄에서 이름을 못 찾을 때 대신 쓴 글(종류, 「고른 프리셋」)은 따옴표 없이 쓴다. 예: 「‘P’ 프리셋의 Catch 때문에 발행할 수 없습니다.」
4. 추출 미완료 막힘 첫 줄은 지금 문구의 첫 문장만 남겼다(「PDF 목록을 다시 불러온 뒤…」는 발행 화면에 PDF 목록이 없어져 지움).
5. 발행 화면의 400 모르는 칸 안내에서 「발행본 전체 글이 상한을 넘었을 수도 있습니다」를 빼고(400 `presetIds`로 따로 안내), 로그인 만료·동의 거절 안내의 「고른 항목」을 「고른 프리셋」으로 바꿨다.
6. `PRIVATE_CATCH_NOTICE`는 쓰는 곳만 없앴고 `publication-format.ts`의 상수는 남겼다.

## 남는 것

- 확인 단계의 「작성자 설명이 없는 Catch N개」 안내는 설계대로 없앴다. 다시 넣으려면 U1 응답 칸이 바뀌어야 한다.
- `pick-parts.tsx`는 효과 코드가 서버 렌더링으로 덮이지 않아 이 파일만 보면 줄 커버리지가 낮다(65%).

## Build and Test 되돌아가기 고침(Loop-back 1, 2026-11-21)

근거: 계획 「Build and Test 되돌아가기 고침」 Step 12~15, `construction/build-and-test/test-results.md` 「Loop-Back Log」(팀장 브라우저 확인). api는 바꾸지 않았다.

| 결함 | 고침 |
|---|---|
| ① 첫 저장 뒤 회원 가드가 화면을 새로 만들어 빈 「새 프리셋」이 그려지고 다시 저장하면 프리셋이 또 생김 | 의존 `replaceUrl`(`replaceState`)을 없애고 `replace`(화면이 `router.replace`로 채움)와 `savedNotice`를 둠. 첫 저장(201)은 `presetId`·`dirty: false`·`saved`를 먼저 바꾼 뒤 `savedNotice.leave(id)` → `replace(presetEditPath(id))`. 그 자리에서 상세를 다시 부르지 않고 옮긴 화면이 연다. 고치기(PUT)는 옮기지 않고 지금처럼 다시 불러옴 |
| ② Strict Mode에서 결과가 버려져 「저장하고 있습니다.」에 멈춤 | `open()`에서 `disposed = false`(`jd-management-model`의 `activate()`와 같음) |

「저장했습니다.」 넘기기: 모듈 안 변수 하나(`createSavedNoticeHandOff`). `leave(id)`로 남기고, 편집 모델의 `open()`에서 `take(id)`로 한 번 꺼낸다. `take`는 늘 지우고 같은 ID일 때만 참이다. 주소·브라우저 저장소에 두지 않는다. 모델을 만들 때가 아니라 `open()`에서 꺼내, Strict Mode가 두 번 부르는 `useState` 초기화의 버려지는 모델이 먼저 가져가지 않게 했다.

### 바꾼 파일

- `web/src/features/presets/preset-editor-screen.tsx`, `web/test/presets.test.mjs`(Q1 A 시험을 Q1 B 시험 셋으로, ②·늦은 결과 시험), `web/src/features/presets/README.md`
- 같은 옛 동작을 적은 곳(프로젝트 규칙): `web/src/lib/routes.ts` 주석, `web/src/app/(member)/presets/new/page.tsx` 주석, `web/README.md` 경로 표 `/presets/new` 줄(고친 뒤 35,722 B, 상한 36,000 B)
- `construction/u2-applicant-screens/nfr-design/performance-design.md`에 「2026-11-21 변경: Q1 B」 줄을 덧붙임(승인 때 문장은 그대로)

### 시험

| 명령 | 결과 |
|---|---|
| 고치기 전 `(cd web && node --test test/presets.test.mjs test/publish.test.mjs test/api-response.test.mjs)` | 58건 통과 |
| 고친 뒤 같은 명령 | 62건 통과, 0건 실패(조정자가 다시 돌려 같은 결과) |
| `npm --prefix web test` | 1,131건 통과, 0건 실패 |
| `npm --prefix web run lint`·`typecheck` | 오류 0 |

바뀐 파일에 `console.` 0건.

### 검토 Minor 2 고침(2026-11-21 팀장 지시)

- 옮긴 화면의 `role="status"` 칸이 「저장했습니다.」를 담은 채 새로 생기던 것을 고쳤다(접근성 점검 A9). `open()`은 넘겨받은 표시를 쥐기만 하고(`handedNotice`), 화면이 `view.load === "ready"` 효과에서 `showHandedNotice()`를 불러 빈 칸이 그려진 뒤 글을 넣는다. 한 번만 넣고, 정리된 뒤·상세 준비 전·다른 상태일 때는 넣지 않는다.
- 시험: 옮긴 화면의 첫 준비 렌더에서 칸이 비어 있고 부른 뒤 「저장했습니다.」, 두 번 불러도 한 번, 다른 ID·새로 고침·새 프리셋 화면은 그대로 빈 칸, 상세 준비 전에는 넣지 않음, 화면 소스가 그 효과를 둠. `(cd web && node --test test/presets.test.mjs test/publish.test.mjs test/api-response.test.mjs)` 62건 통과, lint·typecheck 오류 0.
- `web/src/features/presets/README.md` 39행에 같은 내용.

### 받아들인 한계(U2 PR 본문에 적음, 2026-11-21 팀장)

- 검토 Minor 1: 옮긴 화면의 상세가 실패하면 「프리셋을 불러오지 못했습니다.」와 [다시 불러오기]만 보이고 「저장했습니다.」는 다시 불러오기에 성공하면 보인다(기능 설계의 「저장했습니다. 내용을 다시 불러오지 못했습니다.」와 다름).
- 검토 Minor 3: 첫 저장 뒤 옮기기 전에 다른 화면으로 가면 안내가 메모리에 남고, 다음에 편집 화면을 열 때 지워진다. 같은 ID 화면을 처음 열 때만 한 번 늦게 보일 수 있다.
- 320px 머리글 넘침은 U2 전부터 있던 문제라 고치지 않았다.

### 브라우저에서 볼 것(Build and Test)

- 첫 저장 뒤 옮긴 화면이 고치기 상태로 그려지고 프리셋이 하나만 생기는지, 개발 모드에서 「저장하고 있습니다.」에 멈추지 않는지, 화면 낭독기가 「저장했습니다.」를 읽는지.
