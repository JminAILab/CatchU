# U5 RAG 응답 — 코드 생성 요약

## Sources

작성일: 2026-10-30. 입력: [코드 생성 계획](code-generation-plan.md)(승인, Testing Contract `sha256:19386d629b3092339d296f2cdf4cb18982564dbd19832a03198ee5687fbc32b6`), [단위 시험 안내](unit-test-instructions.md), [기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md)·[엔티티](../functional-design/entities.md), [비기능 설계](../nfr-design/), [계약 요약](../../../inception/contract-design/contract-summary.md) C-01·C-02·C-03·C-06·C-07·C-09·C-10·C-11·C-12. 기준 코드: 통합 브랜치 `intent/260925-intent-12`(8ab5917)와 이 작업의 미커밋 변경.

## Step 1 착수 확인 결과

- **실행기:** 테스트 DB(`catchu-db-test`, `pgvector/pgvector:0.8.7-pg16-trixie`, 127.0.0.1:5433)가 떠 있었다. `npm --prefix api test -- test/db/publication-tables.test.cjs` 통과(5/5). web 확인 명령 `npm --prefix web exec -- node --test test/api-response.test.mjs`는 **적힌 그대로는 돌지 않았다**: `npm exec`가 저장소 맨 위에서 실행되어 파일을 찾지 못했고, 그 전에 npm이 레지스트리의 `node@26.13.0` 패키지를 받아 그것으로 실행하려 했다(npx 캐시에 받아짐, 저장소 변경 없음). 같은 시험을 `web/` 폴더에서 `node --test test/api-response.test.mjs`로 돌려 통과했다(5/5). 이후 web 명령은 모두 `web/`에서 `node --test …`로 돌렸다(뜻은 같다).
- **U4 DB `PublicationAccess`:** 통합 브랜치에 없다. `api/src/publications/`에는 인터페이스(`publication-access.ts`)와 시험 전용 메모리 가짜(`in-memory-publication-access.ts`)만 있고 `app.module.ts`에 U4 모듈이 없다. 그래서 Step 10에서 **앱에 등록하지 않았다**.
- **공유 인터페이스:** `AiGenerationGate.generate`·`generateStream`(C-01), `AiProviderError`·`AiInputTooLarge`, `AiRun.registerHandler`·`enqueueAfterCommit`(C-02), `DailyRunLimit.consume(memberId, kind, now, manager?)`(C-03), `PublishedSearch.search`·`getIndexState`·`IndexNotReady`(C-09), `PublicationAccess`(C-10)가 계획에 적은 모양과 같았다. 멈출 일은 없었다.

## 만든·고친 파일

| 파일 | 내용 |
|---|---|
| `api/src/rag-answer/rag-answer-config.ts` | 상수(500·6·2,000·8·100·10분·10초·200토큰·15초·1초, `QNA_MODEL = 'HAIKU'`)와 지시문 셋 |
| `api/src/rag-answer/rag-answer-log.ts` | 로그 사건 타입과 수준별 쓰기 |
| `api/src/rag-answer/rag-answer-tokens.ts` | `PUBLICATION_ACCESS`·`RAG_ANSWER_OPTIONS` 주입 자리(새 파일, 아래 「계획과 다른 점」) |
| `api/src/rag-answer/link-access-errors.ts` | C-10 오류 → 404·401, `NotFound` → 404 `RESOURCE_UNAVAILABLE`, 발행본 ID 형식 확인 |
| `api/src/rag-answer/question-input.ts` | 본문 검증·줄이기, 정의하지 않은 칸 400 |
| `api/src/rag-answer/korean-date.ts` | 한국 시간 날짜(`koreanUsageDate` 재사용)·다음 자정·질문 횟수 키 |
| `api/src/rag-answer/question-counter.ts` | `QuestionCounter`: Redis 구현·늘 통과 구현·메모리 구현(시험), 만들기 함수 |
| `api/src/rag-answer/question-rewriter.ts` | `QuestionRewriter`·`QUESTION_REWRITER`·`QuestionRewriteFailed`, Anthropic 구현·합성 구현 |
| `api/src/rag-answer/qna-service.ts` | 다시 쓰기 → 검색 → 생성 한 함수, 단계별 시간·결과 |
| `api/src/rag-answer/qna.controller.ts` | `POST /v1/public/links/:token/questions`(SSE) |
| `api/src/rag-answer/summary-sources.ts` | 사본 → `AiSource[]` |
| `api/src/rag-answer/base-summary.entity.ts` | `base_summary` 엔티티 |
| `api/src/rag-answer/base-summary-store.ts` | 행 읽기·PENDING 만들기·조건부 UPDATE 둘·읽기 시한 판정·다시 만들기 upsert |
| `api/src/rag-answer/base-summary-handler.ts` | `BASE_SUMMARY` 처리기 |
| `api/src/rag-answer/summary.controller.ts` | 받은 사람 요약 GET, 작성자 요약 GET·[다시 만들기] POST |
| `api/src/rag-answer/rag-answer.module.ts` | `RagAnswerModule.register({ publicationAccess, imports? })` |
| `api/src/database/migrations/1793348947970-CreateBaseSummaryTable.ts` | 생성 명령으로 만든 마이그레이션(다른 표 변경·DROP 없음 확인) |
| `api/src/common/errors/error-codes.ts` | `INDEX_NOT_READY`(409)·`QUESTION_LIMIT_REACHED`(429)와 문구(아래 「계획과 다른 점」) |
| `api/scripts/rag-eval/rag-eval.cjs`·`gold-locations.cjs`·`rag-eval-report.cjs` | 평가 스크립트(synthetic·measure) |
| `api/package.json` | `rag-eval` 스크립트 한 줄(비기능 설계 NFR3.1 「package.json 스크립트 이름 하나」) |
| `api/test/rag-answer/*.test.cjs` 9개, `support.cjs`, `rag-eval-input.json` | U5 api 시험과 공용 대역·합성 평가 입력 |
| `api/test/db/member-cascade-delete.test.cjs` | `base_summary` 행 추가 |
| `api/test/integration/result-application-b.test.cjs` | 마이그레이션 목록·표 개수·되돌리기 순서에 U5 추가 |
| `api/docs/rag-answer.md`(새), `api/docs/member-withdrawal-deletion.md`, `api/CONVENTIONS.md`, `api/README.md` | 기능 문서, 삭제 표 행, 파일 역할 행·오류 코드 표, 명령 표 행 |
| `.gitignore` | `api/.rag-eval/` |
| `web/src/features/rag-answer/` | `rag-answer-api.ts`·`sse-reader.ts`·`rag-answer-messages.ts`·`rag-answer-state.ts`·`gated-item-view.tsx`·`base-summary-panel.tsx`·`qna-panel.tsx`·`rag-answer.module.css`·`README.md` |
| `web/test/rag-answer-sse-reader.test.mjs`·`rag-answer-state.test.mjs`·`rag-answer-api.test.mjs` | web 시험 |

전체 목록은 [source-manifest.json](source-manifest.json)에 있다. 커밋·push·PR은 하지 않았다.

## 주요 결정

- **앱 미등록(Step 1·10):** U4 DB `PublicationAccess`가 없어 `RagAnswerModule`을 `app.module.ts`에 넣지 않았다. U4가 합쳐지면 U5 담당이 작은 PR로 `RagAnswerModule.register({ publicationAccess: …, imports: [U4 모듈] })`을 등록하고 기동 시험을 더하며, 그때 U4의 발행 뒤 `BASE_SUMMARY` 등록과 순서를 맞춘다(U5 처리기 등록과 같은 때 또는 뒤). 메모리 가짜는 어느 경우에도 앱에 넣지 않는다. 이 내용은 `api/docs/rag-answer.md` 「앱 등록 상태와 U4 순서」에 있다. `base_summary` 마이그레이션은 이 PR에 들어 있다.
- **web 패널은 화면에 붙이지 않았다:** C-11 모양 props를 받는 `BaseSummaryPanel`(받은 사람/작성자 모드)·`QnaPanel`만 만들고, 붙이는 일은 U4 자리가 생긴 뒤다(`web/src/features/rag-answer/README.md`). 10월 받은 사람 화면은 고치지 않았다.
- **제약 이름:** 생성 마이그레이션의 이름을 그대로 뒀다(`pk_base_summary`, `uq_base_summary_publication_id`, `fk_base_summary_publication_id`, `ck_base_summary_status_dcbae7db`). 비기능 설계가 예로 든 `fk_base_summary_publication`·`ck_base_summary_status`와 다른 것은 R-06(받아들인 위험)대로다.
- **요청 반영 (1)~(4)** 는 아래 「계획 1차 수정 요청 반영 확인」에 결과를 적었다.
- **연결 끊김 판정:** 요청(`IncomingMessage`)의 `close`가 아니라 응답(`ServerResponse`)의 `close`가 응답을 끝내기 전에 오면 끊김으로 본다. Node에서 요청 `close`는 본문을 다 읽은 뒤에도 오기 때문이다. 시험(끊김 → 게이트 스트림 `return` 호출·`CLIENT_CLOSED`)으로 확인했다.
- **다시 쓰기 SDK 설정:** 비기능 설계는 "주소 인자 없음 = SDK 기본값"이라 적었지만, U1 클라이언트와 같이 주소를 코드 상수 `CLAUDE_API_BASE_URL`로 고정하고 `authToken: null`·`logLevel: 'warn'`·`inference_geo: 'us'`를 넣었다. SDK 기본값은 `ANTHROPIC_BASE_URL` 환경변수로 바뀌므로 보안 점검 「외부 호출」(호스트 코드 고정)과 #119(처리 위치 미국)를 지키려는 것이다.
- **처리기 시작 순서:** 행이 없으면 시한 판정에 `publishedAt`이 필요해 `readSnapshot`을 PENDING 행 만들기 전에 부른다. 사본 읽기 실패(`NotFound` 밖)는 생성 실패로 보아 조건부 FAILED를 쓴다(행이 없었으면 바뀐 행 0 → `DISCARDED`).
- **평가 `measure` 모드:** 실제 게이트·검색·DB 연결과 키·DB 이름 검사는 구현했지만, 사본 읽기에 쓸 U4 DB `PublicationAccess`가 없어 CLI는 `createMeasureDeps`에서 멈춘다(`rag-eval.cjs`의 `TODO(U4 합류)`, 측정은 U4 합류 뒤의 일이라 계획 Step 12대로 이번에는 `synthetic`만 돌렸다). U10이 아직 없어 JD 나누기·지시문은 스크립트 것을 쓰고 기록에 "스크립트"로 적는다.

## 계획과 다른 점

- **고지 한 줄을 U2 `<AiNoticeLine />`로 붙였다(BR8.3과 다름):** 기능 설계 BR8.3은 U5가 "질문과 발행본 일부가 … Claude API(Anthropic)와 Voyage AI(MongoDB)로 전송됩니다" 문구를 두게 했지만, U2 README가 "비로그인 질의응답(U5)은 입력란 옆에 같은 한 줄을 둔다"고 정했고 계획 1차 수정 요청 (1)이 그대로 따르게 했다. 같은 고지를 두 문구로 관리하지 않기 위해서다. `rag-answer-messages.ts`에 고지 문구가 없다.
- **정의하지 않은 칸을 무시하지 않고 400으로 거부했다(BR1.2·BR8.7과 다름):** 기능 설계는 "BR1.1·BR1.2 밖의 칸은 무시"였지만, 보안 점검 「요청·메시지 입력」의 "정의하지 않은 필드는 거부한다"와 api의 기존 방식(`validation.pipe.ts`의 `forbidNonWhitelisted`, `analysis-input.ts`)에 맞춰 계획 1차 수정 요청 (2)대로 본문 최상위와 앞 대화 항목 안 모두 `400 VALIDATION_FAILED`로 거부한다. 자료 제외 칸도 이것으로 막힌다(AC6.2.7).
- **오류 코드 두 개를 공통 표에 올렸다:** 계획의 「Touches」에 `src/common/errors/error-codes.ts`가 없었지만, `ApiError`는 그 표의 코드만 받으므로 계약 C-12가 이미 정한 `INDEX_NOT_READY`(409)·`QUESTION_LIMIT_REACHED`(429)를 더하고 `CONVENTIONS.md` 오류 표에도 적었다. 새 계약이 아니라 정한 계약의 구현이다. `QUESTION_LIMIT_REACHED` 문구는 BR3.1의 것이고, `INDEX_NOT_READY`의 공용 문구는 U10 JD 요약도 같은 코드를 쓰므로 "아직 쓸 수 없습니다"로 두었다(아래 「코드 수정 요청 반영」 4). 질의응답 화면 문구는 web 문구 표에 있다.
- **새 파일 둘:** `rag-answer-tokens.ts`(모듈 파일과 컨트롤러가 서로 불러 데코레이터 시점에 토큰이 비는 순환을 막으려고 주입 토큰만 따로 둠), `rag-answer.module.css`(패널 표시용 CSS 모듈, 기존 기능 폴더와 같은 방식). 시험 공용 도우미 `api/test/rag-answer/support.cjs`와 합성 평가 입력 `rag-eval-input.json`도 더했다.
- **`api/package.json`·`api/README.md` 한 줄씩:** 비기능 설계 NFR3.1의 "package.json 스크립트 이름 하나로 손으로 실행"과 코딩 절차 「새 명령은 서비스 README에 반영」을 따랐다. CI·배포 설정·`.env.example`은 고치지 않았다.
- **로그 칸 둘을 더했다:** `qna.completed`에 `failure`(오류 이름, 성공은 null), `base-summary.handled`에 outcome `ERROR`(DB 오류로 처리기가 다시 던질 때). 원인이 다른 실패를 한 종류로 묶지 않으려는 것이며 글 칸은 없다. 질문 횟수 전용 Redis 연결의 `error` 사건은 `qna.count-connection-error`(오류 이름만)로 남긴다(performance-design NFR4.4).
- **web 안내 문구 둘을 더했다:** 요약 통신 실패 "AI 요약을 불러오지 못했습니다. 새로고침해 주세요"와 [다시 만들기] 접수 실패 "다시 만들기를 접수하지 못했습니다. 다시 시도해 주세요". 기능 설계에 문구가 없는 경우이며, 실패를 빈 요약으로 바꾸지 않는다는 계약 「에러 대응 최소선」 1을 지키려는 것이다.
- **공백만인 사본 필드도 근거에서 뺐다:** BR5.1은 "빈 문자열 필드는 뺀다"이고, 공백만인 필드도 근거로 쓸 글이 없어 함께 뺐다.
- **질문 500자 검사:** 앞뒤 공백을 떼기 전 원래 길이로 잰다(BR1.1 문구대로). 화면 입력란도 500자다.

## 시험 결과

명령은 저장소 맨 위에서 돌렸다(web은 위 Step 1 이유로 `web/`에서 `node --test`). 대상 판본은 통합 브랜치 8ab5917 + 이 작업의 미커밋 변경이다.

| 시험 | 결과 | 비고 |
|---|---|---|
| U5 api 9개 파일 + `member-cascade-delete` + `result-application-b`(단위 범위 명령) | **통과** 79, 실패 0, 건너뜀 1 | 건너뜀은 `live-question-counter`(그 실행에는 `CATCHU_TEST_REDIS_URL` 없음). 다른 Unit 자리는 모두 합성 대역이다 |
| `live-question-counter.test.cjs`(실제 Redis) | **통과** 1/1 | 이 작업에서 임시로 띄운 로컬 Valkey 8.1.6(`valkey/valkey:8.1.6-alpine`, 127.0.0.1:6391, 시험 뒤 중지)에 `CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6391/15`로 돌렸다. 연결 직후 첫 질문 셈, 만료 = 다음 한국 자정, close 뒤 통과를 확인 |
| U5 web 3개 파일 | **통과** 22/22 | 시험용 fetch만 씀 |
| api `lint`·`typecheck`, web `lint`·`typecheck` | **통과** | |
| 평가 스크립트 `npm --prefix api run rag-eval -- synthetic` | **통과(SYNTHETIC_CHECK)** | 내장 합성 발행본 질문 3개로 끝까지 돌았고 결과는 `api/.rag-eval/`(무시 폴더)에만 생겼다. NFR3 측정이 아니다 |
| api 전체 `npm --prefix api test` | **통과**(종료 코드 0) | 선행 1/1, 잠금 대기 줄 35/35, 주 줄 1,492개 중 통과 1,464·실패 0·건너뜀 28. 건너뜀은 모두 `CATCHU_TEST_REDIS_URL`이 없을 때 건너뛰는 기존 실제 큐 시험과 U5 실제 Redis 시험이다 |
| web 전체 `npm --prefix web test` | **통과** 758/758 | |
| `migration:run` → `migration:revert` → `migration:run` | **통과** | 테스트 컨테이너 안의 임시 DB `catchu_u5_gen`에서(개발 DB 컨테이너가 없어서). 시험 DB `catchu_test`에는 `npm test`가 적용했다 |

**합성으로 통과한 것과 실제 연결은 다르다.** 질의응답·요약 시험의 링크 판정(메모리 `PublicationAccess`)·검색·게이트·다시 쓰기·AiRun·하루 제한은 합성 대역이다. 실제 Claude·Voyage 호출, U4 실제 링크 판정·사본, U3 실제 검색 색인, 실제 AiRun 큐로 `BASE_SUMMARY`가 도는 것은 확인하지 않았다(U4 합류 뒤 FR19 통합 확인, NFR6.5). 실제로 확인한 것은 테스트 DB(PostgreSQL 16 + pgvector)의 `base_summary` 표·조건부 쓰기·연쇄 삭제·마이그레이션 왕복, 실제 로컬 HTTP·공통 Guard·오류 필터, 실제 Valkey의 질문 횟수다.

### 커버리지

- api `TEST_COVERAGE_INCLUDE='dist/rag-answer/**' npm --prefix api run test:coverage -- <U5 파일들>`: **줄 98.55%**, 분기 90.51%, 함수 96.91%(`dist/` 기준, 하한 80% 충족). 이 실행에는 실제 Redis 시험이 건너뛰어졌다.
- web `node --test --experimental-test-coverage --test-coverage-include='src/features/rag-answer/**' <U5 web 파일들>`: **줄 98.97%**, 분기 95.94%, 함수 100%(`.ts` 네 파일). `.tsx` 패널 셋(`base-summary-panel.tsx`·`qna-panel.tsx`·`gated-item-view.tsx`)은 시험이 불러오지 않아 표에 들지 않는다(web README 「테스트」). 화면 판단은 `.ts` 순수 함수로 옮겨 시험했고, 패널을 붙인 실제 확인은 U4 자리가 생긴 뒤 통합 확인에서 한다.
- 커버리지 기준·설정은 바꾸지 않았다.

### 전체 회귀

api 전체(`npm --prefix api test`)와 web 전체(`npm --prefix web test`)가 모두 실패 없이 끝났다(위 표). 새 오류 코드 두 개로 `security-events.test.cjs`가 코드별로 자동 생성하는 시험("보안 사건·업무 거부 로그를 남기지 않는다")도 두 개 늘어 통과했다.

## 실행하지 않은 시험과 이유

- `measure` 모드 평가(실제 Claude·Voyage·시연 발행본): U4 DB `PublicationAccess`와 실제 발행 경로가 없어 돌릴 수 없다(BR10.1, 계획 Step 12). U4 합류 뒤 한 번 잰다.
- 실제 Claude 다시 쓰기·생성 호출: 키를 쓰는 실제 외부 호출은 이 작업의 허용 범위 밖이라 시험용 fetch·합성 게이트로만 확인했다.
- `.tsx` 패널의 화면 렌더·브라우저 확인: U4 받은 사람 화면 자리가 아직 없다.
- 앱 등록 기동 시험: 등록하지 않았으므로 없다. 대신 `RagAnswerModule.register()`를 시험 전용으로 `AppModule`과 함께 띄워 처리기 등록·경로·종료 때 계수기 닫기를 확인했다(`summary-controller.test.cjs` 마지막 시험).

## 계획 1차 수정 요청 반영 확인 (Step 17)

| 요청 | 확인 |
|---|---|
| (1) 고지 한 줄 | `qna-panel.tsx`가 `@/components/ai-consent/ai-notice-line`의 `<AiNoticeLine />`를 입력란 옆에 그대로 붙인다. `rag-answer-messages.ts`에 고지 문구가 없고 `rag-answer-state.test.mjs`가 그것을 확인한다 |
| (2) 정의하지 않은 칸 400 | `question-input.ts`가 본문 최상위·앞 대화 항목 안의 알 수 없는 칸을 `VALIDATION_FAILED`(`whitelistValidation`)로 거부한다. `question-input.test.cjs`(자료 제외 칸 포함)와 `qna-controller.test.cjs`(HTTP 400)가 확인한다 |
| (3) web 호출 방식 | `rag-answer-api.ts`의 요약 GET은 `client.recipient()`(linkGrant), 작성자 GET·[다시 만들기] POST는 `client.member()`(회원 토큰)를 쓰고, 질문 SSE만 `normalizeApiBaseUrl`·`API_VERSION_PATH`·`credentials: "omit"`·`X-Link-Grant`로 직접 `fetch`한다. `rag-answer-api.test.mjs`가 주소·머리를 확인한다 |
| (4) 평가 결과 위치 | `synthetic`은 원문과 기록 모두 출력 폴더(기본 `api/.rag-eval/`, `.gitignore`)에만 쓰고, `measure`만 기록을 `api/docs/rag-evaluation/<날짜>.md`에 쓴다(루트 `docs/` 아님). `rag-eval.test.cjs`가 확인한다 |

## 코드 수정 요청 반영 (2026-10-30)

담당자 검토의 수정 요청 여섯 가지만 반영했다. 새 파일은 없고 [source-manifest.json](source-manifest.json)의 경로는 그대로다.

| 요청 | 반영 |
|---|---|
| 1. R-01 꼬리표 경계 | `question-rewriter.ts`에 `escapeTagText`(`&` 먼저, 그다음 `<`·`>`)를 두고 `buildRewriteUserText`가 앞 대화 글과 질문을 감싼다. `question-rewriter.test.cjs`에 질문·앞 대화에 `</conversation>`·`<question>`·`&`를 넣은 시험을 더했다(보낸 본문에 `&lt;/conversation&gt;`가 있고 날 `</conversation>`은 꼬리표 자리 하나뿐) |
| 2. R-03 스트림 중 예상 밖 예외 | `qna.controller.ts` `stream()`에 `catch`를 더해 SSE `error { code: ANSWER_FAILED }`를 쓰고, 새 로그 사건 `qna.stream-failed`(`publicationId`·`error` 오류 이름, error 수준)를 남긴 뒤 `finally`에서 닫는다. 기존 사건은 `qna.completed`가 처리 결과 칸 전부를 요구해 맞지 않아 칸 둘인 사건을 `rag-answer-log.ts`에 더했다(글 칸 없음). `qna-controller.test.cjs`에 검색 결과 모양이 깨진 경우(TypeError) 시험을 더했다. `api/docs/rag-answer.md` 로그 표에도 적었다 |
| 3. R-02 늦은 실패 | 코드는 그대로다. `api/docs/rag-answer.md` 「알려진 한계」에 앞 작업의 늦은 실패가 [다시 만들기]로 돌아간 PENDING 행을 FAILED로 바꿔 새 결과가 버려질 수 있고 다시 누르면 복구된다는 줄을, 계약 C-02 「에러 대응 최소선 6」의 받아들인 한계이며 AiRun payload가 ID 하나뿐이라 세대 값을 넘기지 않는다는 근거와 함께 더했다 |
| 4. INDEX_NOT_READY 공용 문구 | `error-codes.ts`·`CONVENTIONS.md`의 기본 문구를 "아직 쓸 수 없습니다"로 바꿨다(U10 JD 요약도 같은 코드). `qna-controller.test.cjs`의 409 본문 기대값과 `api/docs/rag-answer.md`를 맞췄다. web 문구 표(`rag-answer-messages.ts` "질의응답을 아직 쓸 수 없습니다")는 그대로다 |
| 5. 지출 상한 문구 | `question-counter.ts` 주석과 `api/docs/rag-answer.md` 「알려진 한계」에서 콘솔 지출 상한 문구를 지우고 "Redis가 없거나 장애인 동안 질문 수 상한이 없고, 질문당 비용이 작아 받아들인 한계(비기능 요구사항 수정 R-03)"로 적었다 |
| 6. NFR6.5 Deferred | `traceability.json`의 확인 시점을 "EKS 큐 연결 뒤"로 고쳤다(개발 서버는 api 큐를 연결하지 않아 색인·기본 요약이 돌지 않음, 10/27 팀장 결정) |

R-04(U4 합류 뒤 앱 등록 PR·`measure` 한 번·통합 확인)는 코드 변경 없이 U5 이슈에서 추적한다.

수정 뒤 시험(저장소 맨 위, 테스트 DB 127.0.0.1:5433 실행 중):

| 시험 | 결과 |
|---|---|
| U5 api 단위 범위 명령(11개 파일) | **통과** 81, 실패 0, 건너뜀 1(`live-question-counter`, `CATCHU_TEST_REDIS_URL` 없음). 82개 중 새 시험 2개 포함 |
| `security-events.test.cjs`·`db/member-analysis.test.cjs`(기본 오류 문구를 코드별로 확인) | **통과** 54/54 |
| U5 web 3개 파일 | **통과** 22/22 |
| api `lint`·`typecheck` | **통과** |
| U5 api 커버리지 | **줄 98.56%**, 분기 90.57%, 함수 96.93%(`dist/rag-answer/**`, 하한 80% 충족) |

api·web 전체 회귀는 이번 수정에서 다시 돌리지 않았다(바뀐 공용 파일은 `error-codes.ts` 문구 하나이고, 그 문구를 코드별로 확인하는 시험 둘을 위에서 돌렸다).

## 남은 일·다른 Unit에 넘기는 것

- U4 합류 뒤: 앱 등록 작은 PR(기동 시험 포함), 받은 사람 화면 자리 2·3과 작성자 발행본 화면에 패널 붙이기, 발행 뒤 `BASE_SUMMARY` 등록 순서 맞추기, `measure` 평가 한 번, EKS 큐 연결 뒤 FR19 통합 확인(NFR6.5).
- 통합 때 확인: U4 발행 크기 상한이 기본 요약 근거 합 80,000자 안인지, EKS WAF 로깅이 요청 주소(토큰)를 남기는지(팀장).
- 시험 중 만든 것: 테스트 컨테이너 안 임시 DB `catchu_u5_gen`은 지웠다. 임시 Valkey 컨테이너 `u5-redis-live-test`는 `--rm`으로 띄워 시험 뒤 멈췄다. `api/.rag-eval/`의 합성 평가 결과 파일은 무시 폴더라 남겨 두었다.
