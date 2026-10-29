# U2 공용 기반 — 코드 요약

## 개요

승인된 [코드 생성 계획](code-generation-plan.md)의 Step 2~14를 구현했다. Step 1(계약 수정 PR)은 담당자 지시에 따라 U2 빌드에서 하지 않았다: "Step 1의 계약 수정 PR은 팀장이 U2 폴더 밖에서 따로 올린다. 이 폴더에서는 계약 PR을 만들지 않고 Step 2로 넘어간다." 그래서 Step 1의 체크박스는 비어 있다. Step 12는 계획대로 맨 뒤에 했고, 그 시점에 열려 있던 계약 PR #421과 모양을 대조했다(아래 「계약 PR 대조」). 브랜치·커밋·PR은 만들지 않았다.

## 만들거나 고친 파일

전체 경로 목록은 [source-manifest.json](source-manifest.json)에 있다. 지운 애플리케이션 파일은 없다.

| 영역 | 새 파일 | 고친 파일 |
|---|---|---|
| api 저장 표 | `src/database/migrations/1793161114211-CreateU2UsageAndConsent.ts`(`daily_execution_count`·`ai_consent`), 엔티티 2개 | `test/db/member-cascade-delete.test.cjs`, `test/integration/result-application-b.test.cjs`(마이그레이션 목록·표 수 18→20), `docs/member-withdrawal-deletion.md` |
| 하루 실행 제한 | `src/daily-run-limit/`(`consume`, `DAILY_RUN_LIMIT = 30`) | `src/common/errors/error-codes.ts`(`DAILY_LIMIT_REACHED` 429) |
| 첫 이용 동의 | `src/ai-consent/`(게이트·`GET/POST /v1/ai-consent`, `AI_NOTICE_VERSION = '2026-11-v1'`) | `error-codes.ts`(`AI_CONSENT_REQUIRED` 403), `app.module.ts` |
| AiRun | `src/ai-run/`(`ai-run-spec.ts`·`ai-run.ts`·`run-status-store.ts`·모듈) | — |
| FileStorage | `src/file-storage/`(인터페이스·설정 읽기·로컬 드라이버·모듈) | — |
| AI 게이트 | `gate-policy.ts`·`fact-check.ts`·`jd-checks.ts`·`checked-gate.ts`·`ai-generation.module.ts` | U1 파일 5개에 선택 인자·필드만 더함(`ai-generation.types.ts`·`ai-generation.gate.ts`·`citation-request.ts`·`claude-citation-client.ts`·`response-items.ts`) |
| 탈퇴 | `src/withdrawal/`(`DELETE /v1/me`, 4단계) | `error-codes.ts`(`WITHDRAWAL_FAILED` 500), `github-connection.module.ts`(CredentialVault 내보냄), `app.module.ts` |
| web | `components/ai-consent/`·`components/error-pages/`·`components/recipient-guide/`·`features/start-guide/`·`features/withdrawal/`, `app/not-found.tsx`·`app/error.tsx`, `lib/u2-error-messages.ts` | `app/(guest)/page.tsx`("탈퇴했습니다"), `features/home/home-member-page.tsx`(시작 안내), `features/profile/profile-detail.tsx`(탈퇴 영역), `README.md` |
| 문서 | `api/docs/ai-run.md`·`file-storage.md`·`withdrawal.md`·`daily-run-limit.md`, `docs/CatchU_통합확인.md` | `api/docs/ai-generation.md`·`environment.md`·`google-login.md`, `api/CONVENTIONS.md`·`api/README.md`, `docs/README.md` |
| 시험 | `api/test/u2/` 10개 파일(도우미 2개 포함), `web/test/u2-*.mjs` 7개 파일(도우미 2개 포함) | — |

바꾸지 않은 것: `dev-ci`, 환경변수 예시 파일, 계약 문서, `unit-test-instructions.md`.

## 주요 구현 결정

- **U1·U2 게이트를 나눔.** U1 게이트(`createAiGenerationGate`)는 동작을 그대로 두고, U2 검사를 붙인 `CheckedAiGenerationGate`를 따로 만들어 Nest 모듈(`AiGenerationModule`, 토큰 `AI_GENERATION_GATE`)로 등록했다. U1 시험이 검사 없는 동작과 정확한 지시문·로그를 단언하기 때문이다. 게이트·AiRun·DailyRunLimit 모듈은 HTTP 경로가 없어 `AppModule`에 넣지 않았고, 쓰는 Unit이 imports에 넣는다.
- **키가 없을 때.** `CATCHU_GENERATION_API_KEY`가 없어도 api는 기동하고, 호출 때 `AiProviderError`(`NOT_CONFIGURED`)로 끝난다.
- **SONNET 제한.** QNA 밖에서 SONNET을 쓰면 호출자 버그로 보고 TypeError로 끝낸다. 계약에 새 오류를 더하지 않았다.
- **runKey·payload.** runKey는 영문·숫자·`_`·`.`·`-` 1~128자만 받고(콜론·빈 값 거부 포함), payload는 계약 모양(UUID 하나)만 받는다(NFR5.3).
- **AiRun 큐 설정.** 새 환경변수 없이 10월 큐 설정(`CATCHU_QUEUE_REDIS_URL`·`CATCHU_QUEUE_PREFIX`)을 쓴다. 주소가 없으면 등록이 모두 `ENQUEUE_FAILED`다.
- **FileStorage 설정.** 미설정·빈 문자열은 "없음"(기동은 하고 호출 때 `StorageUnavailable`), 값이 있으면 기동 때 검사한다(계획에 더한 결정 1·2).
- **Origin 검사.** `POST /v1/ai-consent`와 `DELETE /v1/me`에 세션 경로와 같은 허용 출처 검사(`assertSessionOrigin`)를 붙였다.
- **탈퇴 1단계의 미합류 표.** `publication`·`mcp_*` 표가 아직 없으면 `to_regclass`로 확인해 건너뛴다. 막을 행이 없기 때문이며, U4·U6 합류 전에도 개발 서버에서 탈퇴가 된다.
- **탈퇴 뒤 web.** 204면 `/?withdrawn=1`로 페이지를 다시 열어 메모리 토큰을 버린다.
- **시작 안내 "자료" 단계.** 전용 화면이 아직 없어 내 자산 화면으로, 발행·Claude 연결 단계는 공유 링크로 연결했다. U4·U6 화면이 생기면 주소를 바꾼다.
- **web 시험 가능성.** 탈퇴 확인과 동의 창 제어를 순수 함수(`confirmWithdrawal`, `createConsentDialogControl`)로 옮겼다. 이 과정에서 동의 기록 실패 안내가 이미 닫힌 창에 그려지던 결함을 고쳤다(기록이 끝날 때까지 창을 열어 둔다).

## 계약 PR 대조 (Step 12)

PR #421 "docs: 계약 C-01에 JD 역할 칸·서버 안내 종류를, C-11에 U2 시작 안내 자리를 더한다"(OPEN, 리뷰 요청: U10·U4 담당, 아직 리뷰 없음)를 찾아 대조했다. 모양이 functional-spec 「계약 변경 제안」과 같아 그대로 구현했다.

- `GatedItem.kind`에 `SERVER_NOTICE`, `jdRole: EVIDENCE | UNCONFIRMED | INTERVIEW_QUESTION | null`.
- C-11 slots 0번 `RecipientGuide(U2)`, props `showClaudeConnect: boolean` 하나.
- PR 문구 "BASE_SUMMARY·QNA는 null"에 맞춰 U2 게이트는 두 기능 항목에 `jdRole: null`을 명시한다(기능 명세는 "선택 칸").

PR 리뷰에서 모양이 바뀌면 `jd-checks.ts`, `test/u2/ai-gate-jd.test.cjs`, `web/src/components/recipient-guide/`, `web/test/u2-recipient-guide.test.mjs`만 고친다.

## 시험과 커버리지

| 대상 | 명령 | 결과 |
|---|---|---|
| api 검사 | `npm run lint`, `npm run typecheck` | 통과 |
| api U2 시험 | `npm test -- <unit-test-instructions의 U2 9개 파일>` (`CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6381`) | 63/63 통과 |
| api U1 회귀 | U1 시험 5개 파일 | 통과(실제 Claude 호출 1개 건너뜀) |
| api 전체 | `npm test` | 1,358 통과·1 건너뜀, 35/35, build-output 1/1, 실패 0 |
| api 커버리지 | 승인 명령 그대로(`TEST_COVERAGE_INCLUDE='dist/{ai-generation,ai-run,daily-run-limit,ai-consent,file-storage,withdrawal}/**'`) | 줄 98.32%, 분기 86.92%, 함수 96.75%. 가장 낮은 파일 `local-file-storage` 87.97% |
| web 검사 | `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:run` | 통과 |
| web U2 시험 | U2 시험 5개 파일 | 26/26 통과 |
| web 전체 | `npm test` | 677/677 통과 |
| web 커버리지 | 승인 명령 그대로(`src/**/*.ts`·`src/**/*.tsx`) | 줄 59.19% — **80% 미달** |
| web 커버리지 | U2 코드 파일 18개로 범위를 좁힘(`.ts`·`.tsx`) | 줄 95.04% |

web 커버리지 설명: 승인 명령은 `src` 전체를 넣으므로, U2 파일이 불러오는 `@/lib/api` 때문에 U2가 고치지 않은 기존 `lib/auth-*` 등이 표에 들어가 비율을 끌어내린다. U2 범위로 좁히면 95.04%다. 기준을 낮추지 않았고, 어느 수치를 U2 기준으로 볼지는 Build and Test에서 확인할 일로 남긴다. U2 범위에서 낮은 파일은 `ai-consent-dialog.tsx` 74.6%(useEffect·Esc 처리, 서버 렌더링 시험이라 돌지 않음), `withdrawal-section.tsx` 73.1%(클릭 처리기)이다. 고쳤지만 시험이 불러오지 않는 기존 파일(`home-member-page.tsx`, `profile-detail.tsx`, `(guest)/page.tsx`)은 표에 없다.

시험 수는 계획과 조금 다르다: withdrawal 8개(계획 7, U4·U6 표 없음 경우 추가), ai-gate-checks+stream 14개(약 13), ai-gate-jd 9개(약 8), web U2 26개(약 15).

시험 환경: 시험용 Valkey 컨테이너 `catchu-u2-test-queue`(127.0.0.1:6381)를 띄워 돌렸고 지금도 실행 중이다. 마이그레이션 생성용 임시 DB는 지웠다.

## 작성했지만 이 단계에서 돌리지 않은 시험·확인

| 항목 | 이유 |
|---|---|
| 실제 Claude 호출(S8 live) | API 키가 없음 |
| 실제 JD 호출로 물음표 규칙 확인(기능 명세 열린 확인 5) | API 키가 없음 |
| 브라우저에서 동의 창·탈퇴 클릭 동작 | 브라우저 시험 도구를 들이지 않음. 서버 렌더링·순수 함수 시험으로만 확인 |
| 실제 U4·U6 표로 탈퇴 통합 시험 | 그 표가 아직 통합 브랜치에 없음. 시험 안의 C-07·C-15 모양 시험용 표로 대신함(실제 표가 생기면 시험이 실패하도록 해 둠). U2 완료 조건 |
| 다른 회원의 JD 원본이 남는지 | U10 `jd` 표가 아직 없음 |
| S29 외부 Google 계정 로그인 | 배포 환경 수동 확인. 통합 확인 표에 남김 |
| CI(`dev-ci`) 실행 | 이 단계는 커밋·푸시를 하지 않아 CI가 돌지 않았음 |

## 계획과 달라진 점

- Step 1을 하지 않았다(담당자 지시, 위 개요).
- 계획에 없던 문서를 더 만들었다: `api/docs/daily-run-limit.md`(하루 제한과 동의), web README 3개, `api/docs/environment.md` 행 추가.
- 기존 시험 `result-application-b.test.cjs`를 고쳤다. 새 마이그레이션 때문에 마이그레이션 목록·표 수·되돌리기 단언이 깨지기 때문이다.
- 비로그인 홈 `/`가 쿼리(`?withdrawn=1`)를 읽어 정적 페이지에서 요청 때 렌더링으로 바뀌었다.

## 열린 질문

1. 개발 서버에 `CATCHU_QUEUE_REDIS_URL`이 없으면 U3·U5·U10의 백그라운드 실행이 11/13 1차 확인에서 모두 처리 시한으로 FAILED가 된다. 큐를 연결하는 공용 기반 작업이 필요하다(팀장).
2. 동의 창 문의 경로는 임시로 저장소 이슈 주소(`https://github.com/JminAILab/CatchU/issues`)를 넣었다(기능 명세 가정 1, 팀장 결정 대기).
3. 고지 판본 상수 `AI_NOTICE_VERSION = '2026-11-v1'`은 임의로 정했다. api·web 값은 web 시험이 대조한다.
4. 계약 PR #421이 합쳐진 뒤 모양이 바뀌었는지 다시 대조해야 한다.
5. 배포 앱의 Google '프로덕션' 게시가 남아 있다. api는 지금 `openid profile`만 요청한다(BR9.1 범위 안).
