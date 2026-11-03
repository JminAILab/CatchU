# U4 발행·링크 — 코드 요약 (제출 2까지)

## Sources

입력: [코드 생성 계획](code-generation-plan.md) Step 1~8, [단위 시험 안내](unit-test-instructions.md), [U4 기능 명세](../functional-design/functional-spec.md) 「작성자 API」·W1·W2, [업무 규칙](../functional-design/rules.md) BR1~BR3, [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-12(작성자 쪽 경로는 각 Unit 기능 설계에서 정함)·C-13·C-14, 10월 본인 Catch 응답 시험 `api/test/catches/owner-catch-response.test.cjs`, 공통 인증 코드 `web/src/lib/api.ts`·`web/src/lib/auth-integration.ts`·`web/src/components/auth/member-guard.tsx`·`session-member-guard.tsx`·`reauth-notice.tsx`.

이 문서는 제출 1(Step 1~8, PR #461로 2026-11-03 통합 브랜치 병합)과 제출 2(Step 9~18, 2026-11-03 구현·로컬 검증)까지의 상태다. 제출 3(Step 19~25)은 진행하지 않았다. 제출 2는 아직 커밋·push·PR 전이다.

## 제출 2 (2026-11-03) — C-10 DB 구현·W3 발행·W5 작성자 관리

판본: 통합 브랜치 `a0d5676`(#461·#466 병합 뒤)을 merge commit `19572db`로 반영한 작업 트리. Step 9 시작 조건(U2 `AiRun`·`DailyRunLimit`·`AiConsentGate`·`FILE_STORAGE`, U3 `PUBLISHED_INDEX_WRITER`)을 확인했다.

### #416 팀장 결정(2026-11-03) 반영

| 결정 | 반영 |
|---|---|
| 1. `BASE_SUMMARY` 등록은 장치 없이 병합 순서로 | 커밋 뒤 `EMBED_PUBLICATION`·`BASE_SUMMARY`를 항상 등록, 켜고 끄는 설정 없음. C-10 DB 구현 주입 토큰 **`PUBLICATION_ACCESS`**(`api/src/publications/publications-config.ts`, `PublicationsModule`이 export)를 U5가 `RagAnswerModule.register({ publicationAccess: PUBLICATION_ACCESS, imports: [PublicationsModule] })`로 쓴다. U5 처리기 등록 전까지 발행본의 기본 요약은 10분 뒤 FAILED |
| 2. 파일 저장소 설정은 `main` 전 팀장이 넣음 | 코드는 BR8.4 그대로. S11은 시험 전용 임시 폴더(로컬 드라이버)로 성공을, `StorageUnavailable` 가짜로 실패(500·DB 유지)를 봄 |
| 3. '링크 열기' 검증 범위 | 세 화면의 버튼 주소·새 탭 속성은 web 시험으로 확인. 받은 사람 판정의 브라우저 확인은 제출 3(Step 23) |
| 4. 중지·만료 때 [링크 열기] | `state === 'ACTIVE'`일 때만 표시, [URL 복사]는 유지(`publication-link-actions.tsx`) |

계획 반영: 미결 표의 OQ-U4-NFR-1·2를 "결정됨(Q1 B)"으로, Step 16·17에 [링크 열기]·Q1 B·검증 범위를 적었다. Guard Policy relaxed라 재승인 정지는 없었고 brief가 현재 내용으로 다시 기록됐다.

### 만든·고친 파일 (제출 2)

- api 새 파일 `api/src/publications/`: `publications-config.ts`(토큰 `PUBLICATION_ACCESS`·`PUBLICATIONS_CLOCK`·`PUBLISH_RATE_LIMITER`, 임시값 `PUBLISH_RATE_LIMIT`(1분 10회, OQ-U4-2)·`SNAPSHOT_TEXT_TOTAL_MAX`(60,000, OQ-U4-4), `PUBLICATION_LIMITS`), `publications-log.ts`, `publish-input.ts`, `snapshot-builder.ts`, `db-publication-access.ts`(C-10 `DbPublicationAccess`), `publish.service.ts`, `publication-manage.service.ts`, `publications.controller.ts`(작성자 5경로, reindex 없음), `publications.module.ts`
- api 고친 파일: `api/src/app.module.ts`(`PublicationsModule` 등록, `ShareLinksModule`·`RecipientModule` 유지), `api/src/common/errors/api-error.ts`·`api-exception.filter.ts`(D5 `details.catchIds`), `api/docs/publications.md`
- api 시험: `api/test/publications/publication-access-db.test.cjs`·`publish-api.test.cjs`·`publications-manage-api.test.cjs`·`publications-logging.test.cjs`·`publications-module.test.cjs`, 도우미 `support.cjs`
- web 새 파일: `web/src/features/publications/`(api·format·sources·publish view/screen·list view/screen·detail view/screen·snapshot-view·link-actions·css·README), `web/src/app/(member)/publications/{page,new/page,[publicationId]/page}.tsx`, `web/src/lib/github-source-url.ts`, 시험 `web/test/publish.test.mjs`·`web/test/publications-owner.test.mjs`
- web 고친 파일: `web/src/lib/routes.ts`·`member-navigation.ts`·`api-response.ts`(D7), `web/src/components/header/member-header.tsx`, `web/src/features/recipient/recipient-format.ts`(`isGithubSourceUrl` 재수출), `web/README.md`

### 구현 결정과 설계 후속 변경 (D4~)

| # | 결정 | 설계 원본과의 차이 | 근거·확인 대상 |
|---|---|---|---|
| D4 | 화면 주소 `/publications`(목록)·`/publications/new`(발행)·`/publications/[publicationId]`(상세), 회원 메뉴 [발행본]. [링크 열기] 세 화면 | 기능 명세 W3·W5는 주소를 정하지 않음. [링크 열기]는 #416 11/2·11/3 결정 | U4 담당 결정 |
| D5 | 409 `CONFIRMATION_REQUIRED`·`SOURCE_RESTRICTED`의 `details.catchIds`를 내려고 공통 `ErrorDetails`에 `catchIds?: string[]`를 더하고 예외 필터가 UUID만 복사. web 공통 해석기(`api-response.ts`)도 같은 칸 통과(D7) | 계약 common.yaml `details` 허용 키(두 개) 밖 | **팀장 확인 필요**(계약 수정 여부). 받아들이지 않으면 409 Catch 목록 전달 방식을 다시 정함 |
| D6 | 발행본 제목 1~50자(rules.md BR4.5·entities.md) | 계획 Step 13 지시의 "1~100"은 텍스트 자료 값 | rules.md 우선 |
| D7 | (web) `api-response.ts` `details.catchIds` 통과 | D5와 짝 | — |
| D8 | Q1 B 링크 규칙: `isGithubSourceUrl`을 `web/src/lib/github-source-url.ts`로 옮기고(recipient는 재수출, 동작 동일) `splitGithubLinks` 추가. 후보는 `https://github.com` 뒤가 `/ : ? #`이거나 주소 글자가 아닌 것, 끝 문장 부호는 글자로 돌림. 본문·작성자 설명에만 적용, `aiDraft`·제목은 글자 | 판정 규칙의 세부(OQ-U4-NFR-1·2) | #416 Q1 B |
| D9 | Catch 잠금은 `FOR NO KEY UPDATE OF c`(10월 `setVisibility`와 같음, visibility만 갱신), 텍스트 자료는 `FOR UPDATE`. 잠금 순서는 계획 그대로 | 계획 Step 13의 `FOR UPDATE` | 외래 키 KEY SHARE와 공존·10월 공개 전환과 직렬화 |
| D10 | `readSnapshot` 발행본 없음은 메모리 가짜와 같은 `NotFound`. `DbPublicationAccess`에 계약 밖 `resolveForRecipientIn(manager, …)`·`readSnapshotIn(manager, …)`를 두어 제출 3 열람 경로가 판정·읽기를 한 읽기 전용 REPEATABLE READ 트랜잭션에 묶게 함(보안 설계 R-04). C-10 계약 함수 모양은 그대로 | 계약에 없는 실패 이름·보조 메서드 | OQ-U4-NFR-5 |
| D11 | 동의 창은 U2 공용 `useAiConsent().run`으로 연결. 403이면 창을 열고 [동의] 뒤 같은 요청 1회 재전송, [닫기]면 입력 유지 | — | C-04 |
| D12 | BR7.3 비공개 전환 안내는 사본에 CATCH 항목이 하나라도 있을 때 보임(사본에 전환 정보가 없음) | 설계가 조건을 정하지 않음 | 팀장 확인 대상 |
| D13 | 실패 뒤 단계: 409·404·400은 편집 단계로(409는 `catchIds` Catch 표시), 403·429·401·500·통신 실패는 확인 단계에 남아 다시 누름. 입력은 모두 유지 | 설계가 정하지 않은 세부 | 팀장 확인 대상 |
| D14 | 10월 `share-links` 화면 도구(`copy-text`·`formatKst`)는 W6에서 지워질 파일이라 import하지 않고 publications 안에 같은 동작으로 둠 | — | — |
| D15 | 정한 문구: 404 "고른 자료 중 지금 발행할 수 없는 것이 있습니다. 목록을 다시 불러온 뒤 다시 골라 주세요." / 빈도 초과 "발행 요청이 잦아 잠시 발행할 수 없습니다. N초 뒤에 [발행]을 다시 누를 수 있습니다."(`Retry-After` 없으면 "… 잠시 뒤 [발행]을 다시 눌러 주세요.", 잠금 없음) | 신뢰성 설계가 "코드 생성 때 정함"으로 둔 두 문구 | — |
| D16 | 로그 칸(임시): `event`(`PUBLISH_SUCCEEDED`·`PUBLISH_FAILED`·`ENQUEUE_RESULT`·`PREFIX_DELETE_FAILED`)·`publicationId`·`memberId`·`errorCode`·`jobKind`·`enqueue` 여섯 개 고정 | NFR6.3이 코드 생성에 맡김 | — |

그 밖: 상세 응답은 「작성자 API」 표 그대로 `{ publicationId, url, state, passwordProtected, snapshot }`(제목·시각은 `snapshot` 안, `stoppedAt` 없음 — 상세를 다시 열면 중지 시각은 보이지 않고 상태만 보임). 빈도 제한 판정은 `PublishService.publish` 첫 단계(시계·제한기 주입). 회원 비활성 404·회원 없음 500(OQ-U4-NFR-6 합의 전)은 C-10 DB 구현의 중지·만료 다음, grant 앞. 재전송 키 없음(BR4.9 한계). U5 자리는 `data-testid="publication-summary-slot"`으로 비움.

### 검증 (2026-11-03, 테스트 DB `catchu-db-test-u4` 5443)

| 확인 | 명령 | 결과 |
|---|---|---|
| api 제출 2 시험 + 제출 1·#422 회귀 + 공통 오류 | `cd api && TEST_DB_PORT=5443 npm test -- test/catches/author-description-api.test.cjs test/materials/text-materials-api.test.cjs test/publications/in-memory-publication-access.test.cjs test/publications/publication-access-db.test.cjs test/publications/publish-api.test.cjs test/publications/publications-manage-api.test.cjs test/publications/publications-logging.test.cjs test/publications/publications-module.test.cjs test/errors.test.cjs` | **64개 통과, 실패 0**(개발자 실행 30+39, conductor 재실행 64) |
| api 타입·lint | `tsc --noEmit`, `npm run lint` | 오류 없음 |
| api 줄 커버리지 | `TEST_DB_PORT=5443 TEST_COVERAGE_INCLUDE='dist/publications/**' npm run test:coverage -- <제출 2 파일 5개>` | **all files 98.24% / 분기 88.83% / 함수 99.27%**. 안 덮인 줄: `db-publication-access` 159-171(U8 전에는 부를 수 없는 `published_pdf_page` 읽기), `publication-manage.service` 127-128(소유 확인 뒤 다른 요청이 먼저 지운 경합) |
| web 제출 2 시험 + 회귀 | `cd web && node --test test/author-description.test.mjs test/materials.test.mjs test/publish.test.mjs test/publications-owner.test.mjs test/recipient.test.mjs test/api-response.test.mjs` | **68개 통과, 실패 0**(개발자 실행: 신규 19, 회귀 129) |
| web 타입·lint·빌드 | `npx tsc --noEmit`, `npx eslint <바꾼 파일>`, `npm run build` | 오류 없음, 빌드 성공(`/publications`·`/publications/new`·`/publications/[publicationId]`) |
| web 줄 커버리지 | `node --test --experimental-test-coverage --test-coverage-include="src/features/publications/**/*.{ts,tsx}" test/publish.test.mjs test/publications-owner.test.mjs` | **all files 95.40% / 분기 80.93% / 함수 90.07%**. 빠진 줄은 브라우저 전용 기본 의존(`accessTokenStore`·`window.confirm`·`navigator.clipboard`)과 마운트 효과 |

- **합성 연결을 포함한 사전 확인**: U2 `AiRun`(등록 결과)·U3 `PublishedIndexWriter`(정상·예외)·`FileStorage` 실패 쪽은 계약 모양 가짜로 돌렸다. 실제 연결 성공이 아니다. `DailyRunLimit`·`AiConsentGate`·로컬 `FileStorage` 성공 쪽·`OwnerProfileReader`는 실제 구현·실제 표를 썼다(회원 없음 500만 `readOwnerState` 대역).
- 환경: `api/node_modules`가 lockfile보다 오래돼(U6 의존성 없음) `npm ci`로 lockfile 그대로 복원했다. 저장소 파일 변경 없음.

### 브라우저 확인 (2026-11-03, 실제 api 연결)

환경: 일회용 DB(`catchu-db-u4-browse`, 5445, 마이그레이션 적용), api `src/main.ts`(127.0.0.1:3101, `NODE_ENV=development`, 개발용 로그인, 큐·파일 저장소 미설정), web `next dev`(3100, `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true`). 회원은 개발용 로그인으로 만들고 Catch 없이 텍스트 자료 1개로 발행했다. 합성 자료만 썼고 끝난 뒤 컨테이너를 지웠다.

| 항목 | 결과 |
|---|---|
| 발행 흐름(고르기 → 제목 → 확인 단계 → [발행]) | 확인 단계에 항목·순서·비밀번호 없음·90일 만료가 보이고, [발행] 중 버튼이 "발행 중…"으로 잠김 |
| 403 `AI_CONSENT_REQUIRED` → 동의 창(D11) | 실제 U2 동의 창이 열리고 [동의] 뒤 같은 요청이 다시 가 201. 완료 화면에 실제 응답의 링크 주소·상태 유효·발행·만료 시각 표시 |
| 완료 화면 [링크 열기] | `href`가 [URL 복사]와 같은 `/s/{token}`, `target="_blank"`, `rel="noopener noreferrer"`. [URL 복사] 존재 |
| [링크 열기]로 연 `/s/{token}` | 10월 받은 사람 경로라 "이 링크는 열람할 수 없습니다"(제출 3에서 교체, #416 결정 3대로 받은 사람 판정은 제출 3에서 확인) |
| 상세 화면 | [링크 열기] 같은 속성, [URL 복사], 고정 안내(BR7.2), 사본 본문의 `https://github.com/…/pull/461`만 새 탭 링크(`rel="noopener noreferrer"`)이고 `https://example.com/page`는 글자(Q1 B) |
| 링크 중지 | 네이티브 `confirm` 문구가 불리고(대역으로 수락) 상태가 "중지됨 (시각)"으로 바뀜. **[링크 열기] 사라짐, [URL 복사] 유지**(#416 결정 4), 되살리기 없음 안내 표시 |

- 한계: 앱 안 브라우저 창은 탭이 하나라 `target="_blank"`가 같은 창에서 열렸다. "원래 탭의 작성자 화면·입력 유지"는 새 탭 속성(`_blank`·`noopener`)으로만 확인했고 두 탭 동시 상태는 보지 못했다. 삭제·빈도 초과 남은 초 갱신·실패 응답은 web 시험으로만 확인했다.
- 개발용 로그인은 전체 이동(주소창 이동)에서 풀려 다시 로그인했다. 공통 인증 동작이며 U4 변경이 아니다.

### 2026-11-03 보완 (자문 검토 뒤)

- **D17 삭제 경로 401/404 일치**(검토 Minor): `remove`가 목록·상세·중지와 같이 짧은 READ COMMITTED 트랜잭션에서 회원 행 확인(`assertMemberExists`, 회원 없음 401 `AUTH_INVALID`) → 소유 확인(`readOwnedPublication`, 없음·남의 것·형식 오류 ID 404)을 먼저 한다. 접두어 삭제·행 삭제는 그대로 트랜잭션 밖. 회귀 시험 1개 추가(`publications-manage-api.test.cjs`: 회원 행을 지운 뒤 네 경로 모두 401). api 시험 48개 통과, tsc·eslint 통과.
- `api/CONVENTIONS.md` 「파일 역할」의 `src/publications/`("첫 경계 제출, 앱 미등록")·`src/rag-answer/`("U4 DB PublicationAccess 합류 전") 문구를 현재 상태로 고쳤다.
- D5(`details.catchIds`)는 고치지 않고 PR의 '팀장 확인 필요·병합 전 해결' 항목으로 둔다.
- 검토 Minor 2(`UNLOCK_POLICY`·`UNLOCK_CONTROLS` 미리 등록)는 계획 Step 11이 정한 공급자라 유지한다(제출 3 unlock이 쓴다).

#### 실제 다중 탭 브라우저 확인 (Chrome, 실제 api 연결, 일회용 DB)

환경은 위 브라우저 확인과 같고(web은 `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true`), Claude in Chrome으로 실제 Chrome 탭을 썼다.

| 화면 | 결과 |
|---|---|
| 발행 완료 | [링크 열기] 클릭 → 새 탭에 `/s/{token}`이 열리고(10월 경로라 "이 링크는 열람할 수 없습니다") 원래 탭은 완료 화면("발행됨", 제목·링크 주소) 그대로 |
| 발행본 목록 | 같은 방식으로 새 탭이 열리고 원래 탭은 목록 그대로. [링크 열기]·[URL 복사] 각 1개(유효 발행본 1개) |
| 발행본 상세 | 새 탭이 열리고 원래 탭은 상세(발행본 자료 포함) 그대로. 본문의 GitHub 주소만 링크, `example.com`은 글자 |

세 화면 모두 `href`가 서버 응답 `url`과 같고 `target="_blank"`·`rel="noopener noreferrer"`다. 받은 사람 판정은 제출 3에서 본다.

#### 발행 중 401 확인 (기본·통합 인증 모드)

확인 단계까지 간 뒤 api를 다른 서명 키로 다시 띄워 Access 토큰(통합 모드에서는 세션 갱신도)을 무효로 만들고 [발행]을 눌렀다(강제 조건, 시간 만료 아님).

| 모드 | 결과 |
|---|---|
| 기본(`NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=false`) | 확인 단계에 그대로 머물고 "발행되지 않았습니다 / 로그인이 만료되었습니다. 다시 로그인한 뒤 발행해 주세요. 고른 항목과 입력은 화면에 남아 있습니다." 표시. 제목·항목 유지, [돌아가서 고치기]·[발행] 다시 활성, 화면 위에 공통 재인증 안내("로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요." + [다시 로그인]) |
| 통합(`…=true`, 갱신 실패) | 기본 모드와 같은 화면·문구·버튼 상태 |

- 한계: 통합 모드의 갱신 **성공** 경로("로그인이 연장되었습니다. [발행]을 다시 눌러 주세요.")는 Access 토큰만 시간 만료되고 세션은 살아 있어야 재현되는데, 900초 대기는 하지 않았고 web 시험(`publish.test.mjs`)으로만 확인했다. [다시 로그인] 뒤 입력 복원은 없다(제출 1 BR2.3 한계와 같은 공통 인증 범위, U4 밖 변경 없음).
- 부수 확인: 미저장 입력이 있는 발행 화면에서 주소창 이동을 시도하면 브라우저 네이티브 "페이지를 떠나시겠습니까" 창이 실제로 떴다(`useUnsavedGuard`).

### 실행하지 않은 시험 (제출 2)

- 받은 사람 판정(비밀번호·중지·만료·삭제)의 브라우저 확인 — 제출 3(#416 결정 3).
- 실제 Redis 큐·실제 U3 색인·U5 처리기 연결, 전체 `npm test`, `test/db/member-cascade-delete.test.cjs`(표 변경 없음, 제출 3 전체 확인 목록), S15(C-09 합의 전 미실행).

### 제출 2 미결·확인 요청

1. D5 `ErrorDetails.catchIds`가 계약 수정인지 팀장 확인(병합 전 해결).
2. D12·D13(web 세부 동작) 팀장 확인.
3. 해소(2026-11-03 보완): `api/CONVENTIONS.md` 문구를 고쳤다.
4. 상세 응답에 `stoppedAt`이 없어 다시 열면 중지 시각이 안 보임. 필요하면 더하는 변경으로 요청.
5. 단계 일지(`construction/code-generation/memory.md`)는 이 체크아웃이 U4 범위로 제한돼 쓰기가 거부됐다. 관찰은 이 문서에 적는다.

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

- 원격 통합 브랜치 `48d206a` 위에 이 작업 트리의 변경을 얹은 별도 작업 폴더에서 확인했다. 그 뒤 제출 1을 커밋 6개로 남기고 원격 `e249427`(#448)과 병합했다(`74c8e8c`). `app.module.ts`는 양쪽 모듈 등록을 모두 남겼다.
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

### 병합 판본 재검사(2026-11-02, 판본 `74c8e8c`)

`74c8e8c`만 가져온 별도 폴더(분리 상태)에서 다시 확인했다. 위 표(`48d206a` 기준)와의 차이는 #448 변경 40개 파일, `app.module.ts`의 `MaterialsModule` 위치, README 2곳 문서 정리뿐이다.

| 확인 | 결과 |
|---|---|
| api 타입·빌드 | 오류 없음 |
| api 제출 1 시험 | 마이그레이션 21개(마지막 `ExpandRepositoryAnalysisScope`)를 적용한 일회용 DB에서 11개 통과 |
| web lint·타입·전체 시험·빌드·smoke | 오류 없음, 822개 통과, 빌드 성공(`/materials`), smoke 통과 |
| 문서 크기 | U4 문서 모두 상한(36,000 B) 미만 |

- 브라우저 확인과 900초 만료 확인은 다시 하지 않았다. #448은 web·인증·Catch·텍스트 자료·결과 반영 코드와 의존성을 바꾸지 않아 위 결과를 재사용한다.
- 커버리지는 병합 판본에서 다시 재지 않았다.

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
3. 해소(2026-11-02): 통합 브랜치 `e249427`을 병합했다(`74c8e8c`, `app.module.ts`는 양쪽 모듈 등록 유지). 검증 판본 `48d206a`와의 차이를 비교하고 병합 판본에서 api 타입·빌드·제출 1 시험과 web 전체 검사를 다시 돌려 통과했다. 브라우저·만료 확인은 #448의 변경 범위를 근거로 재사용했다.
4. PR에 D1~D3 후속 변경, 위 BR2.3 한계, 2026-11-02 저장 경합 수정을 적는다.
5. 해소(2026-11-03): #416 Q1 B(GitHub 주소만 링크, NFR1.11)를 계획 미결 표와 Step 16·17에 반영했다(제출 3 Step 22·23은 미결 표의 같은 규칙을 가리킨다). Guard Policy relaxed라 재승인 정지 없이 이어졌다.

## 계획과 달라진 점

- D1 경로 추가(계획 밖, 담당자 수용).
- 화면 상태 전이를 각 화면 파일 안의 모델로 옮기고 `web/src/lib/view-store.ts`를 더했다(시험 가능하게 하기 위함).
- Step 1 확인과 api 시험은 테스트 DB 포트가 다른 작업 폴더와 겹치지 않게 `TEST_DB_PORT=5443`으로 실행했다.
- 커버리지 명령은 계획의 publications 파일이 아직 없어 제출 1 파일로 범위를 좁혀 쟀다. 시험 파일 2개(`materials-screen`·`author-description-editor`)는 계획의 파일 목록에 없던 것을 더했다.

## 실행하지 않은 시험

- S10(자료 삭제 뒤 발행 사본 유지)은 계획대로 제출 2에서 한다.
- 화면 컴포넌트의 마운트 효과는 서버 렌더링 시험에서 돌지 않으며, 브라우저 수동 확인으로만 봤다.
- 두 탭 동시 저장은 브라우저에서 확인하지 않았다(마지막 저장 유지는 api S1로 확인).
