# Frontend Components — u2-applicant-screens

부품 나눔과 상태·입력·API다. 동작 순서는 `functional-spec.md`, 규칙은 `rules.md`가 정본이다. 모양(색·간격·크기)은 지금 부품과 `publications.module.css`·`materials.module.css`를 그대로 쓰고 다듬지 않는다(C-O4). 화면 요소의 역할·키보드는 다듬은 화면 `inception/refined-mockups/interaction-spec.md`와 맞췄다.

## 새 기능 폴더 `web/src/features/presets/`

| 부품 | 맡는 것 | 쓰는 지금 부품 |
|---|---|---|
| `presets-api.ts` | `GET/POST /v1/presets`, `GET/PUT/DELETE /v1/presets/{id}`, `POST /v1/presets/measure` 호출과 응답 모양 검사, 실패를 화면 이유로 바꿈 | `api.member`(Bearer·401), `api-response.ts` |
| `presets-list-screen.tsx` / `presets-list-view.tsx` | 목록(M2): 불러오기 상태, 줄, [새 프리셋] 막힘 | 지금 목록 화면의 상태 글 꼴 |
| `preset-editor-screen.tsx` | 편집 상태(clean·dirty·saving·saved·error), 고르기 목록 셋의 불러오기와 쪽마다 세기, 저장·지우기, 이탈 경고 | `useUnsavedGuard`·`useUnsavedTraverseGuard`·`useUnsavedChanges`(텍스트 자료 화면과 같은 셋, `UNSAVED_MESSAGE`) |
| `preset-editor-view.tsx` | 이름 칸, 「담을 자료 고르기」(옮겨 온 고르기 목록), 「담긴 자료와 순서」, 저장·지우기 | 아래 「옮기는 부품」 |

주소 파일 `web/src/app/(member)/presets/page.tsx`·`presets/new/page.tsx`·`presets/[presetId]/page.tsx`를 더하고, `routes.ts`에 `presets`·`presetNew`·`presetEditPath(id)`를 더한다(README 「페이지 주소」 표도 함께).

## 옮기는 부품(발행 화면 → 공용)

지금 `web/src/features/publications/publish-view.tsx`의 자료 고르기(`SourcePickerView`)와 순서 목록(`SelectedListView`)을 프리셋 편집에서 쓰도록 옮긴다. 옮길 곳은 코드 생성이 정하되, 발행 화면과 프리셋 편집이 같은 부품을 쓴다.

| 지금 | 프리셋 편집에서 | 바뀌는 것 |
|---|---|---|
| `SourcePickerView` 「발행할 자료 고르기」 | 「담을 자료 고르기」(h2), h3 「내 Catch」·「내 텍스트 자료」·「내 PDF 자료」 | 머리 두 줄(「최대 20개…」, 「저장소마다 3~5개를 권합니다.」)을 그리지 않는다. Catch 단추 작은 줄에서 공개 상태 글을 뺀다. 막힘 이유에 「항목은 20개까지 담을 수 있습니다」·「전체 글이 60,000자를 넘습니다」를 더한다. 비공개 안내·확인 필요 이유는 목록에 그런 Catch가 없어 그리지 않는다 |
| 「작성자 설명을 쓴 Catch만 보기」 체크박스, 「불러온 N개의 Catch」, [더 보기] | 그대로 | 없음 |
| `SelectedListView` 「고른 항목과 순서 (n/20)」 | 「담긴 자료와 순서 (항목 N개 · M자)」 | 줄에 종류 표지·제목, 이유가 있으면 이유 글. 머리에 상한 넘음 안내. 끝에 「프리셋을 고쳐도 이미 보낸 링크는 바뀌지 않습니다.」 |
| 순서 단추 [위로][아래로][빼기] | 그대로(`aria-label` 「(제목) 위로」 꼴) | 없음 |

`publish-sources.ts`의 `catchSourceOf`는 고르기 목록이 담을 수 있는 Catch만 받으므로 `eligible`·`reason`이 늘 true·null이 된다. 그 판정 코드는 지우지 않고 그대로 두어도 되지만, 화면에 비공개·확인 필요 이유가 나오는 길은 없다.

## 발행 화면 `web/src/features/publications/` (바뀜)

| 부품 | 바뀌는 것 |
|---|---|
| `publish-screen.tsx` | 고르기 목록 셋과 저장소 목록 불러오기를 프리셋 목록 하나(`GET /v1/presets`)로 바꾼다. 고른 상태는 프리셋 ID 배열. 발행 요청 `presetIds`. 막힘 때 목록 다시 불러오기와 이름 찾기(BR4.6). 404 때 없어진 프리셋을 고른 목록에서 뺌. `FlaggedCatches`를 막힘 줄 목록으로 바꿈 |
| `publish-view.tsx` | 「프리셋 고르기」(새 `PresetPickerView`)와 「고른 프리셋과 순서 (n/5)」(순서 목록 부품을 프리셋에 씀). `PublishConfirmView`의 「항목」 자리를 「고른 프리셋과 순서」로, 작성자 설명 없는 Catch 안내는 그리지 않음(functional-spec 열린 질문). `PRIVATE_CATCH_NOTICE` 쓰임을 없앰 |
| `publications-api.ts` | 발행 요청 몸통 `{ title, password?, presetIds }`. 실패 종류에 `catch-private`(409 `CATCH_PRIVATE`)를 더하고, 막힘 종류(`confirmation-required`·`source-restricted`·`catch-private`·추출 미완료 400)는 `blockedSources`를 싣는다. `catchIds`를 지운다. 400 `presetIds` 위반을 따로 구분한다 |
| `README.md` | 오류 표의 409 줄(`details.catchIds` → `blockedSources`)과 발행 요청 모양 |

`PresetPickerView`의 단추 하나:

| 칸 | 값 |
|---|---|
| 이름 | `name`(글자로만) |
| 보조 줄 | 「항목 N개 · M자」 |
| 막힘 이유 | BR4.2 순서의 하나, 5개가 찼을 때는 1·2번만 |
| 상태 | `aria-pressed`(고름), `disabled`(막힘). 막힘 이유는 단추 안 글자라 이름과 함께 읽힌다 |

## 상단 메뉴 `web/src/components/header/member-header.tsx` (바뀜)

메뉴 배열 `[내 자산, 텍스트 자료, 발행본, JD 관리]`의 「텍스트 자료」와 「발행본」 사이에 `{ href: routes.presets, label: "프리셋" }`을 더한다. 현재 자리 판정은 그대로다.

## web 응답 해석 `web/src/lib/api-response.ts` (바뀜)

`details` 타입에 `blockedSources?: { presetId: string; kind: "CATCH" | "TEXT_MATERIAL" | "PDF_MATERIAL"; sourceId: string }[]`를 더하고 `catchIds`를 지운다. 검사와 복사는 지금 `violations`와 같은 꼴(BR5.2).

## api `api/src/catches/` (바뀜, CatchLibrary)

| 파일 | 바뀌는 것 |
|---|---|
| `owner-catch-input.ts` | 쿼리 `publishable`(글자 `true`만), 커서 범위에 넣음 |
| `owner-catch-store.ts` | `publishable`이면 공개·확인됨·보호 안 됨 조건을 SQL에 더함 |
| api 시험 | 쿼리 검사, 거른 결과, PublishableSource 판정과 같은 결과 |
| `api/docs/` Catch 목록 문서 | 쿼리 한 줄 |

## 상태·입력·API 한눈에

| 화면 | 상태 | 입력 | API |
|---|---|---|---|
| 프리셋 목록 | loading·ready·empty·error | — | `GET /v1/presets` |
| 프리셋 편집 | loading·loadFailed·clean·dirty·saving·saved·deleting | 이름, 고르기, 순서 | `GET/POST/PUT/DELETE /v1/presets…`, `POST /v1/presets/measure`, `GET /v1/catches?publishable=true`, 텍스트 자료·PDF 목록 |
| 발행 | 지금 단계(edit·confirm·done) + 프리셋 목록 loading·ready·empty·error | 프리셋 고르기·순서, 제목, 비밀번호 | `GET /v1/presets`, `POST /v1/publications` |

## 접근성(interaction-spec 대조)

| 요소 | 역할·키보드 | interaction-spec |
|---|---|---|
| 고르기 단추(자료·프리셋) | `button` + `aria-pressed`, Enter·Space, 막힘 이유는 단추 안 글자 | ToggleOptionButton 그대로 |
| 순서 단추 | `button`, `aria-label` 「(이름) 위로」, 옮긴 뒤 초점은 같은 단추 | ReorderList 그대로 |
| 이름 칸 | 보이는 이름표 「이름」, 도움말은 `aria-describedby`, 오류 때 `aria-invalid` | PresetEditorForm 그대로 |
| 저장 결과 | 「저장했습니다.」 `role="status"`, 실패 `role="alert"`, 초점은 [저장] | PresetEditorForm 그대로 |
| 5개 안내 | 목록 위 한 번, `aria-live="polite"` | PresetPicker 그대로 |
| 목록의 <고치기> | 링크, 읽히는 이름 「(이름) 고치기」 | M2 그대로 |
| 메뉴 「프리셋」 | 링크, 현재 자리 `aria-current="page"` | MemberHeader 그대로 |

interaction-spec과 다른 동작은 없다.
