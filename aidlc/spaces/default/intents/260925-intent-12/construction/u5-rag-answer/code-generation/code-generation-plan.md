# U5 RAG 응답 — 코드 생성 계획

## Summary

- Builds: 받은 사람 질의응답(SSE·질문 다시 쓰기·링크당 하루 질문 횟수), AI 기본 요약(처리기·받은 사람/작성자 읽기·[다시 만들기]), web 요약·질의응답 패널, RAG 평가 스크립트
- Touches: `api/src/rag-answer/`(새 폴더), 새 마이그레이션 1개, `api/test/rag-answer/`(새 폴더), `api/scripts/rag-eval/`(새), `web/src/features/rag-answer/`(새 폴더, U2 `AiNoticeLine`·`createApiClient` 사용), `web/test/rag-answer-*.test.mjs`, `api/docs/rag-answer.md`(새), `api/docs/member-withdrawal-deletion.md`, `api/CONVENTIONS.md`, `api/test/db/member-cascade-delete.test.cjs`, `api/test/integration/result-application-b.test.cjs`, `.gitignore`
- Tests: api `node:test` 9개 파일 약 55개(순수 함수·HTTP·테스트 DB, 실제 Redis 시험 1개는 주소가 있을 때만), web 3개 파일 약 18개

## Sources

작성일: 2026-10-30. 입력: [기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W1~W7·「화면」·「주요 시나리오와 확인」, [업무 규칙](../functional-design/rules.md)(rules) BR1~BR10, [엔티티](../functional-design/entities.md)(entities), [비기능 설계](../nfr-design/)의 performance-design·security-design·scalability-design·reliability-design·observability-design·logical-components, [비기능 요구사항](../nfr-requirements/), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01·C-02·C-03·C-06·C-07·C-09·C-10·C-11·C-12, [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U5, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR2.7·FR6.2~FR6.9·NFR1~NFR7. 현재 코드: 통합 브랜치 `intent/260925-intent-12`(8ab5917)의 `api/src/ai-generation/`(U1·U2 게이트, `AI_GENERATION_GATE`, `CLAUDE_MODEL_IDS`·`THINKING_OFF`, `createGuardedFetch`), `api/src/ai-run/`(AiRun·`readStatus`·`persistDeadlineFailure`·`isValidRunKey`), `api/src/daily-run-limit/`(`consume(memberId, kind, now, manager?)`), `api/src/published-index/`(U3 `PUBLISHED_SEARCH`, 앱 등록됨), `api/src/publications/`(U4 엔티티·`PublicationAccess` 인터페이스와 메모리 가짜만), `api/src/common/errors/`(`ApiError`·`VALIDATION_FAILED`), `api/src/auth/auth.decorators.ts`(`@CurrentMemberId()`·`@Public()`), `api/src/database/`(snake 이름 전략·`checks.ts`·`foreign-keys.ts`), `api/CONVENTIONS.md`, `web/src/features/recipient/`, `web/README.md`.

## 구현 범위와 스토리 대응

| 스토리 | U5가 맡는 부분 | 계획 단계 |
|---|---|---|
| US4.2 AI 기본 요약 | 처리기·사본 근거·조건부 저장, 받은 사람/작성자 읽기, [다시 만들기], 요약 패널(AC4.2.1~AC4.2.7) | Step 3·8·9·10·12 |
| US6.2 대화형 질의응답 | 본문 검증, 링크·색인·횟수 확인, 다시 쓰기, 검색·생성 SSE, 질의응답 패널(AC6.2.1~AC6.2.8) | Step 4·5·6·7·10·12 |
| US19.3 RAG 품질 평가 | CI 밖 평가 스크립트(합성 확인·측정 모드), 로컬 원문·`docs/` 기록, JD 두 방식 비교(AC19.3.1~AC19.3.6) | Step 11·12 |
| (공통) 삭제 | `base_summary` 연쇄 삭제(C-06, FR5.2·FR14.10) | Step 3·12·13 |

계약 C-01·C-02·C-03·C-09·C-10의 함수 이름·인자·반환·오류는 그대로 쓰고 고치지 않는다. C-12의 U5 경로 셋(`…/summary`, `…/questions`)과 작성자 경로 둘은 기능 설계 「범위」대로다.

## 현재 코드에서 정한 것 (설계 뒤 확인한 사실)

- **U4의 실제 `PublicationAccess`는 아직 없다.** 통합 브랜치에는 인터페이스와 시험 전용 메모리 가짜만 있다(`api/src/publications/in-memory-publication-access.ts`). 비기능 설계 Q1대로 이 PR에서는 `RagAnswerModule`을 만들되 `app.module.ts`에 등록하지 않는다. 시험은 만들기 함수와 Nest 시험 모듈에 메모리 가짜를 넣어 돌린다. Step 1에서 다시 확인해 그 사이 U4 DB 구현이 통합 브랜치에 들어왔으면 Step 10에서 등록까지 한다. `base_summary` 마이그레이션은 등록과 관계없이 이 PR에 넣는다(`publication` 표는 #422로 있음).
- **U4 받은 사람 화면 틀(C-11 자리)도 아직 없다.** 지금 `/s/[token]`은 10월 화면(`web/src/features/recipient/`)이다. U5는 `web/src/features/rag-answer/`에 C-11 모양의 props(`token`·`getGrant`·`onAccessLost`·`isLoggedIn`·`showEvidence`, 작성자 모드는 `publicationId`·`showEvidence`)를 받는 패널 둘을 만들고, 화면에 붙이는 일은 U4가 자리를 만든 뒤 한다(functional-spec 「다른 Unit에 넘기는 것」). 10월 화면은 고치지 않는다.
- **계획 1차 수정 요청(2026-10-30) 네 가지.** (1) 질의응답 입력란 옆 고지는 U5 문구 상수를 따로 두지 않고 U2의 `<AiNoticeLine />`(`web/src/components/ai-consent`, `AI_NOTICE_LINE`)을 그대로 붙인다. U2 README가 "비로그인 질의응답(U5)은 입력란 옆에 같은 한 줄을 둔다"고 정했다. (2) 질의응답 본문의 정의하지 않은 칸(앞 대화 항목 안의 칸 포함)은 버리지 않고 `400 VALIDATION_FAILED`로 거부한다. 보안 점검 「요청·메시지 입력」의 "정의하지 않은 필드는 거부한다"와 api의 기존 방식(`common/errors/validation.pipe.ts`의 `forbidNonWhitelisted`, `analysis-intake/analysis-input.ts`)을 따르며, 자료 제외 같은 칸도 이것으로 막힌다(AC6.2.7). (3) web의 요약 GET과 다시 만들기 POST는 기존 `web/src/lib/api-client.ts`의 `createApiClient`(`recipient()`는 linkGrant, `member()`는 회원 토큰)로 부르고, 질문 SSE만 같은 기준 주소 규칙(`normalizeApiBaseUrl`·`API_VERSION_PATH`, `credentials: "omit"`)으로 직접 `fetch` 스트림을 연다. (4) 평가 스크립트의 `synthetic` 모드는 원문과 기록 모두 `api/.rag-eval/`(로컬)에만 쓰고 저장소에 남는 기록 파일을 만들지 않는다. 저장소에 남기는 기록(건수·위치·빈 사람 판정 칸)은 `measure` 모드만 쓰며 위치는 루트 `docs/`가 아니라 `api/docs/` 아래다(루트 `docs/`는 문서 목록 규칙이 있다). 기능 설계와 달라지는 (1)(BR8.3 고지 문구)·(2)(BR1.2·BR8.7의 "그 밖의 칸은 무시")는 Step 16 code-summary 「계획과 다른 점」에 이유와 함께 적는다.
- **제약 이름은 이름 전략이 만든다.** 비기능 설계 검토 R-06(받아들인 위험)대로 `fk_`·`ck_` 이름을 손으로 정하지 않고 `snake-naming.strategy.ts`가 생성 마이그레이션에서 만드는 이름을 그대로 쓴다.

## 파일 배치

api는 `api/src/rag-answer/`에 둔다(tech-stack-decisions, logical-components).

| 파일 | 내용 |
|---|---|
| `rag-answer-config.ts` | 상수(질문 500·앞 대화 6개·메시지 2,000·검색 8·하루 100·요약 처리 시한 10분·다시 쓰기 10초·200토큰·keep-alive 15초·Redis 1초, `QNA_MODEL = 'HAIKU'`), 지시문 상수 |
| `question-input.ts` | 질의응답 본문 검증·줄이기(순수 함수, BR1.1·BR1.2) |
| `korean-date.ts` | 한국 시간 날짜·다음 자정 계산(순수 함수, NFR4.7). `daily-run-limit`의 `koreanUsageDate`를 다시 쓴다 |
| `question-counter.ts` | `QuestionCounter` 경계, ioredis 구현(만들 때 연결, `error` 처리기, `close()`), 늘 통과 구현, 메모리 구현(시험) |
| `question-rewriter.ts` | `QuestionRewriter` 경계와 주입 토큰 `QUESTION_REWRITER`, `QuestionRewriteFailed`, Anthropic 구현, 합성 구현 |
| `qna-service.ts` | 다시 쓰기 → 검색 → 생성 순서 한 함수, 단계별 시간·결과 모으기 |
| `qna.controller.ts` | `POST /v1/public/links/:token/questions`(`@Public()`), 확인 단계·SSE 쓰기·keep-alive·끊김 깃발 |
| `summary-sources.ts` | 사본 → `AiSource[]`(C-07 필드 상수 표, 순수 함수, BR5.1) |
| `base-summary.entity.ts` | `base_summary`(entities.md, reliability-design NFR5.1) |
| `base-summary-store.ts` | 읽기·시한 판정 저장·조건부 UPDATE·`INSERT … ON CONFLICT DO NOTHING`·다시 만들기 쓰기 |
| `base-summary-handler.ts` | `BASE_SUMMARY` 처리기 만들기 함수(W3) |
| `summary.controller.ts` | 받은 사람 `GET /v1/public/links/:token/summary`(`@Public()`), 작성자 `GET /v1/publications/:publicationId/summary`·`POST …/summary/regenerate` |
| `link-access-errors.ts` | C-10 오류 → 404·401, `NotFound` → 404 `RESOURCE_UNAVAILABLE` 대응표 |
| `rag-answer-log.ts` | 로그 사건 5종의 칸만 가진 타입과 남기는 함수(observability-design 표) |
| `rag-answer.module.ts` | Nest 모듈(컨트롤러·처리기 등록·주입 자리). 앱 등록은 Step 10의 조건대로 |

web은 `web/src/features/rag-answer/`에 둔다: `rag-answer-api.ts`(요약 GET·다시 만들기 POST는 `createApiClient`로, 질문 SSE는 같은 기준 주소 규칙의 `fetch` 스트림으로), `sse-reader.ts`(SSE 덩어리 해석, 순수), `rag-answer-messages.ts`(문구 상수 표, 고지 문구 없음, 순수), `rag-answer-state.ts`(상태·오류 → 화면 문구·버튼, 순수), `gated-item-view.tsx`, `base-summary-panel.tsx`, `qna-panel.tsx`, `README.md`.

평가 스크립트는 `api/scripts/rag-eval/`에 둔다: `rag-eval.cjs`(실행 진입점, `synthetic`·`measure` 모드), `gold-locations.cjs`(정답 글귀 위치 찾기, 순수), `rag-eval-report.cjs`(로컬 원문 결과·기록 쓰기. `synthetic`은 `api/.rag-eval/`에만, `measure`만 `api/docs/rag-evaluation/`에 저장소 기록).

## 단계

### Step 1: 착수 확인 — 실행기와 현재 경계 (Testing Contract 실행기 단계)

- [ ] 테스트 DB(README 「DB 테스트」, pgvector 이미지 5433)를 띄우고 `unit-test-instructions.md`의 실행기 확인 명령 둘(api 기존 시험 하나, web 기존 시험 하나)이 지금 상태에서 도는지 확인한다.
- [ ] 통합 브랜치에 U4의 DB `PublicationAccess` 구현이 들어왔는지 확인한다(`api/src/publications/`와 `app.module.ts`). 결과를 code-summary에 적고 Step 10의 등록 여부를 정한다.
- [ ] `AiGenerationGate.generateStream`·`generate` 시그니처, `AiProviderError`·`AiInputTooLarge`, `AiRun.registerHandler`·`enqueueAfterCommit`, `DailyRunLimit.consume`, `PublishedSearch.search`·`getIndexState`·`IndexNotReady`가 계획에 적은 모양과 같은지 확인한다. 다르면 코드를 쓰기 전에 멈추고 묻는다.

### Step 2: 구조와 설정 뼈대 (Testing Contract 구조 단계, NFR2.1·NFR4.2~NFR4.4)

- [ ] `rag-answer-config.ts`의 상수와 지시문 상수(다시 쓰기·QNA·BASE_SUMMARY), `rag-answer-log.ts`의 사건 타입, `link-access-errors.ts` 대응표를 만든다. 환경변수는 새로 읽지 않는다(키는 기존 `CATCHU_GENERATION_API_KEY`, Redis는 기존 `CATCHU_QUEUE_REDIS_URL`·`CATCHU_QUEUE_PREFIX`).

### Step 3: 저장 — 엔티티와 마이그레이션 (US4.2, entities.md, C-06, NFR5.1)

- [ ] `base-summary.entity.ts`: `base_summary_id uuid` PK, `publication_id uuid` UNIQUE·`deleteWithParent`(→ `publication`), `status` `inValues('PENDING','DONE','FAILED')`, `deadline_at`·`updated_at` timestamptz NOT NULL, `items` jsonb NOT NULL DEFAULT `'[]'`, `generated_at` timestamptz NULL. CONVENTIONS 「DB 물리 규약」을 따른다.
- [ ] `npm --prefix api run migration:generate -- src/database/migrations/CreateBaseSummaryTable`로 만들고 생성 SQL에 다른 표 변경·의도하지 않은 DROP이 없는지 읽는다. `migration:run`·`migration:revert`·다시 `migration:run`으로 `down`까지 확인한다. 제약 이름은 생성된 그대로 둔다.

### Step 4: 업무 규칙 — 질문 입력과 한국 시간 (US6.2, BR1.1~BR1.3, NFR1.4, NFR4.7)

- [ ] `question-input.ts`: 질문 문자열·앞뒤 공백 뺀 길이 1 이상·UTF-16 500 이하, `history` 배열·역할·글 모양 검사, 끝에서 6개·앞 2,000자로 줄인 새 배열. 틀리면 `ApiError('VALIDATION_FAILED')`(details에 칸 이름만). 본문과 앞 대화 항목의 정의하지 않은 칸은 버리지 않고 같은 400으로 거부한다(요청 반영 (2), `analysis-intake/analysis-input.ts`와 같은 방식).
- [ ] `korean-date.ts`: 시각 → 한국 날짜 문자열과 다음 한국 자정(초). 질문 횟수 키 `{prefix}:qna-question-count:{publicationId}:{YYYY-MM-DD}`를 만드는 함수.

### Step 5: 외부 호출 — 질문 다시 쓰기 (US6.2, BR4.1, NFR2.2~NFR2.4)

- [ ] `question-rewriter.ts`: `QuestionRewriter.rewrite({ history, question }) → { text, inputTokens, outputTokens }`. Anthropic 구현은 `new Anthropic({ apiKey, maxRetries: 0, timeout: 10_000, fetch: createGuardedFetch(globalThis.fetch) })`, `model: CLAUDE_MODEL_IDS[QNA_MODEL]`, `thinking: THINKING_OFF[QNA_MODEL]`, `max_tokens: 200`, system = 고정 지시문, user = `<conversation>`·`<question>` 꼬리표 자료. 결과 앞뒤 공백 제거·500자 자르기, 비면 실패. 모든 실패(시간 초과·호출 실패·redirect·본문 초과·빈 응답)는 `QuestionRewriteFailed`(종류만) 하나로 바꾼다. 키가 비면 클라이언트를 만들지 않고 부를 때마다 `QuestionRewriteFailed('NOT_CONFIGURED')`. 합성 구현은 마지막 사용자 질문과 이번 질문을 이은 결정적 문장을 돌려준다(시험 전용).

### Step 6: 외부 호출 — 질문 횟수 계수기 (US6.2, BR3.1~BR3.3, NFR4.4·NFR4.7·NFR6.4)

- [ ] `question-counter.ts`: `QuestionCounter.count(publicationId, now) → { decision: 'ALLOWED' | 'LIMIT_REACHED' | 'BYPASSED', reason? }`. ioredis 구현은 `lazyConnect` 없이 만들 때 연결을 시작하고(기동을 막지 않음) `enableOfflineQueue: false`·`commandTimeout: 1000`·`maxRetriesPerRequest: 0`, `error` 이벤트는 이름만 경고 로그, `close()`는 `quit()` 뒤 `disconnect()`. `MULTI`로 `INCR`·`EXPIREAT 다음 한국 자정`. 100 초과면 `LIMIT_REACHED`, 명령 실패·시간 초과면 `BYPASSED`(`qna.count-bypassed`). 주소가 없으면 늘 `BYPASSED(NO_REDIS)` 구현. 주소 검사는 `readAnalysisQueueConfig`를 다시 쓴다. 메모리 구현은 시험용.

### Step 7: 업무 로직·API — 질의응답 (US6.2, W1·W2, BR2·BR4, NFR1.1·NFR2.5·NFR4.1·NFR4.3·NFR6.1)

- [ ] `qna-service.ts`: 앞 대화가 있을 때만 다시 쓰기 → `search(publicationId, 검색 질문, 8)` → 조각 0개면 생성 없이 끝 → 조각을 `AiSource`로 옮겨(`sourceId = chunkId`) `generateStream({ feature: 'QNA', instruction, sources, userText, publicationText, model: QNA_MODEL })`. 항목마다 콜백으로 넘기고, 중단 깃발을 보면 `break`한다. 단계별 걸린 시간·토큰·조각 수·보낸 항목 수와 결과 종류를 돌려준다.
- [ ] `qna.controller.ts`: `@Public()` `POST public/links/:token/questions`. 본문 검증 → `resolveForRecipient(token, X-Link-Grant, now)` → `getIndexState`가 DONE 아니면 409 `INDEX_NOT_READY` → 계수기(`LIMIT_REACHED`면 429 `QUESTION_LIMIT_REACHED`). 모두 통과하면 응답 머리(`text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive`)를 쓰고 `flushHeaders()`, 15초 keep-alive 타이머, 요청 `close`에서 타이머 해제·중단 깃발, `event: item`·`event: done`·`event: error { code }` 쓰기, `finally`에서 타이머 해제·응답 끝. 거부는 `qna.rejected`, 끝은 `qna.completed` 한 줄. 질문·대화·답 글은 로그에 없다.

### Step 8: 업무 로직 — 기본 요약 생성 처리기 (US4.2, W3, BR5, NFR5.2·NFR5.3·NFR5.5·NFR6.2)

- [ ] `summary-sources.ts`: 사본 항목을 position 순으로, CATCH `workFacts[i]`·`subjectContribution`·`evidence[i].representedFacts[j]`·`authorDescription`(비어 있지 않을 때), TEXT `body`, PDF 읽을 수 있는 쪽 `pages[n]`을 필드 하나씩 `AiSource`로(`sourceId = {publishedItemId}/{fieldPath}`, 전체 범위 위치, sourceKind 규칙, CATCH `catchEvidenceUrls`). 빈 필드는 뺀다. `aiDraft`·`mismatch`·제목은 넣지 않는다.
- [ ] `base-summary-store.ts`: 행 읽기, 처리기 시작 때 `INSERT … ON CONFLICT (publication_id) DO NOTHING`으로 PENDING(`deadline_at = published_at + 10분`) 뒤 다시 읽기, 결과 조건부 UPDATE 둘(성공: `status <> 'FAILED' AND deadline_at > now`, 0개·실패: `status = 'PENDING' AND deadline_at > now`), 읽기 시한 판정(`readStatus` + `persistDeadlineFailure`), 다시 만들기 upsert.
- [ ] `base-summary-handler.ts`: `createBaseSummaryHandler({ dataSource, publicationAccess, gate, clock?, logger? })`가 `AiRunHandler`를 돌려준다. 행 판정(BR5.3) → `readSnapshot` → 근거 → `generate({ feature: 'BASE_SUMMARY', model: 'HAIKU', userText: null, publicationText: null })` → 조건부 저장(BR5.4). 생성 예외는 종류를 로그로 남기고 조건부 FAILED 뒤 정상 반환, DB 오류는 로그 뒤 다시 던진다. `base-summary.handled` 한 줄.

### Step 9: API — 기본 요약 읽기와 다시 만들기 (US4.2, W4~W6, BR6·BR7, NFR1.1·NFR1.2·NFR5.4)

- [ ] `summary.controller.ts`: 받은 사람 `@Public()` `GET public/links/:token/summary` → `resolveForRecipient` → 시한 판정 읽기(행 없으면 `readSnapshot().publishedAt + 10분`) → `{ status, items }`(DONE만 항목). 작성자 `GET publications/:publicationId/summary`(`@CurrentMemberId()`) → `resolveForOwner` → `{ status, items, canRegenerate }`. `POST publications/:publicationId/summary/regenerate` → `resolveForOwner` → 트랜잭션(`consume(memberId, 'BASE_SUMMARY', now, manager)`, `LIMIT_REACHED`면 429 `DAILY_LIMIT_REACHED`, 아니면 PENDING·빈 항목·새 마감 upsert) → 커밋 뒤 `enqueueAfterCommit('BASE_SUMMARY', 'BASE_SUMMARY-{publicationId}-{randomUUID()}', { publicationId })` → 202, `base-summary.regenerate-accepted` 로그. 동의는 확인하지 않는다. 대응표로 오류를 바꾼다.

### Step 10: 모듈과 조건부 앱 등록 (logical-components 「앱 등록 시점」, 비기능 설계 Q1)

- [ ] `rag-answer.module.ts`: 컨트롤러 둘, `QUESTION_REWRITER`(키 판정 만들기 함수), 계수기(주소 판정 만들기 함수, 종료 훅에서 `close()`), `PublicationAccess` 주입 자리, `AI_GENERATION_GATE`·`AiRun`·`DailyRunLimit`·`PUBLISHED_SEARCH` 주입. 모듈 초기화 때 `aiRun.registerHandler('BASE_SUMMARY', …)` 한 번.
- [ ] Step 1에서 U4 DB `PublicationAccess`가 있었으면 `app.module.ts`에 `RagAnswerModule`을 등록하고 기동 시험을 더한다. 없었으면 등록하지 않고 docs·code-summary에 "U4 합류 뒤 작은 PR로 등록, 그때 U4의 발행 뒤 `BASE_SUMMARY` 등록과 순서를 맞춤"을 적는다. 메모리 가짜는 어느 경우에도 앱에 넣지 않는다.

### Step 11: 프런트엔드 — 요약·질의응답 패널 (US4.2·US6.2, functional-spec 「화면」, BR8, NFR7)

- [ ] `rag-answer-messages.ts`·`rag-answer-state.ts`: 문구 상수 표(만드는 중·요약 없음·만들지 못함·한도·아직 쓸 수 없음·근거 없음·답 실패·500자. 고지 문구는 두지 않는다, 요청 반영 (1))와 요약 상태(받은 사람/작성자)·질의응답 오류 코드 → 문구·버튼 표시를 고르는 순수 함수.
- [ ] `sse-reader.ts`: `ReadableStream` 바이트를 SSE 덩어리(`event:`·`data:`·`:` 주석)로 나누는 순수 해석기. `rag-answer-api.ts`: 요약 GET과 다시 만들기 POST는 `web/src/lib/api-client.ts`의 `createApiClient`로 부른다(받은 사람은 `recipient()`에 linkGrant, 작성자는 `member()`의 회원 토큰). 질문 POST만 같은 기준 주소 규칙(`normalizeApiBaseUrl`·`API_VERSION_PATH`, `credentials: "omit"`, `X-Link-Grant`)으로 직접 `fetch` 스트림을 열어 `item`·`done`·`error` 콜백으로 넘긴다(요청 반영 (3)). 401·404 링크 오류는 `onAccessLost(code)`를 부른다.
- [ ] `gated-item-view.tsx`(CITED 인용 원문·출처 단추 → `showEvidence(location)`, `AI_INTERPRETATION` 'AI 해석', `data-testid`), `base-summary-panel.tsx`(받은 사람/작성자 모드, 'AI 요약' 머리, PENDING 동안 [다시 만들기] 감춤, 화면을 열 때 한 번만 읽기), `qna-panel.tsx`(입력란 500자·입력란 옆에 U2 `<AiNoticeLine />`를 그대로 붙임(요청 반영 (1))·화면 메모리 대화·최근 6개 전송·보내는 동안 버튼 막기·0개 안내). 자료 제외 선택은 없다. `README.md`에 props(C-11 모양)와 U4가 붙일 자리를 적는다.

### Step 12: 평가 스크립트 (US19.3, BR10, NFR3.1~NFR3.3)

- [ ] `api/scripts/rag-eval/`: 입력 파일(발행본 ID·질문 10개·정답 글귀·JD 하나)을 읽고, `synthetic` 모드는 합성 게이트·검색·메모리 사본으로, `measure` 모드는 실제 게이트·검색과 테스트가 아닌 DB로 돈다(키가 없으면 멈춤). 정답 위치 찾기(없으면 질문 번호와 함께 멈춤), `search(…, 12)` 한 번과 앞 5·8·12 적중, 앞 8개로 QNA `generate`와 통과·버린 수, JD 두 방식(U10 함수가 있으면 그것, 없으면 빈 줄 뺀 줄 나누기·스크립트 지시문, 전체 넣기는 `published_chunk`를 `seq` 순으로 읽기 전용, 80,000자 초과는 `INPUT_TOO_LARGE`).
- [ ] `synthetic` 모드는 원문 결과와 기록 모두 `api/.rag-eval/`(새 `.gitignore` 줄)에만 쓰고 저장소에 남는 기록 파일을 만들지 않는다. `measure` 모드만 원문은 `api/.rag-eval/`에, 저장소 기록(건수·위치·빈 사람 판정 칸, 파일 이름은 실행 날짜)은 `api/docs/rag-evaluation/`에 쓴다(요청 반영 (4), 루트 `docs/`는 쓰지 않음). 측정 실행은 U4 합류 뒤의 일이라 이 단계에서는 `synthetic`만 돌린다.

### Step 13: 시험 — 시나리오 먼저, 세부 시험은 구현 뒤 (팀 Testing Posture, functional-spec 「주요 시나리오와 확인」)

functional-spec 「주요 시나리오와 확인」 표의 22개 시나리오와 기대 결과가 정본이다. Step 4~12를 구현한 뒤 아래 시험 코드를 쓰고 돌린다. 시험 자료는 모두 공개 가능한 합성 글이다.

- [ ] `api/test/rag-answer/question-input.test.cjs`(순수): 1·500·501자, 공백만, 앞 대화 8개→6개, 2,000자 넘는 글 자르기, 역할·모양 오류, 본문·앞 대화 항목의 알 수 없는 칸(자료 제외 칸 포함) → 400(요청 반영 (2)), 한국 날짜·자정 경계(23:59:59·00:00:00 KST)와 키 형식.
- [ ] `api/test/rag-answer/question-rewriter.test.cjs`(시험용 fetch): 요청 모델·`max_tokens`·system 지시문·꼬리표, 키 없음 `NOT_CONFIGURED`(기동 성공), redirect·256 KiB 초과·시간 초과·빈 응답·HTTP 오류가 모두 `QuestionRewriteFailed`이고 메시지에 질문 글 없음, 500자 자르기.
- [ ] `api/test/rag-answer/question-counter.test.cjs`(메모리·가짜 Redis): 100번째 허용·101번째 `LIMIT_REACHED`, 명령 실패·시간 초과 `BYPASSED`와 경고 로그, 주소 없음 `BYPASSED(NO_REDIS)`, 키 만료 시각.
- [ ] `api/test/rag-answer/live-question-counter.test.cjs`: `CATCHU_TEST_REDIS_URL`이 없으면 `skip`. 있으면 실제 Redis에서 연결 직후 첫 질문이 세어지는지, `EXPIREAT`가 다음 한국 자정인지, `close()` 뒤 연결이 끝나는지(`queue-embedding.test.cjs`와 같은 방식).
- [ ] `api/test/rag-answer/qna-controller.test.cjs`(Nest 시험 앱, 메모리 `PublicationAccess`·합성 검색·합성 게이트·합성 다시 쓰기·메모리 계수기): 첫 질문(다시 쓰기 0회·검색 limit 8·통과 항목만 `item`·`done`·SSE 머리), 앞 대화 질문(다시 쓰기 1회·다시 쓴 문장으로 검색·userText), 400·401·404·409·429 각각 횟수 영향, Redis 통과, 조각 0개(생성 0회·`done`), 생성 중 `AiProviderError`(보낸 항목 유지·`error ANSWER_FAILED`), 다시 쓰기 실패, 연결 끊김(생성 반복 `return` 호출·타이머 해제), keep-alive 주석(짧은 간격 주입), 로그에 질문·대화·답·토큰 글 없음.
- [ ] `api/test/rag-answer/summary-sources.test.cjs`(순수): Catch·텍스트·PDF 필드 순서·sourceKind·위치·근거 URL, `aiDraft`·제목 없음, 빈 필드 제외.
- [ ] `api/test/rag-answer/base-summary-handler.test.cjs`(테스트 DB): 행 없음·시한 전 → PENDING 만들고 DONE, 항목 0개 → FAILED, 처리 중 발행본 삭제 → 버림·행 없음, 마감 지난 PENDING·DONE·FAILED → 생성 0회, `AiProviderError`·`AiInputTooLarge` → FAILED·던지지 않음, 겹친 두 결과(먼저 DONE 뒤 다시 DONE 덮기), 로그 칸.
- [ ] `api/test/rag-answer/summary-controller.test.cjs`(테스트 DB + Nest 시험 앱): 받은 사람 DONE 항목·PENDING/FAILED 빈 목록·중지 링크 404·비밀번호 401, 행 없음 10분 전후, 지난 PENDING FAILED 저장, 작성자 중지 뒤에도 읽기·`canRegenerate`, 남의 발행본 404·횟수 그대로, 다시 만들기 202·행 PENDING·runKey 형식(`isValidRunKey`)·등록 1회, 한도 429·행 그대로, 등록 실패여도 202, PENDING 중 다시 만들기도 받음.
- [ ] `api/test/rag-answer/rag-eval.test.cjs`: `synthetic` 모드가 합성 자료로 끝까지 돌고 `SYNTHETIC_CHECK`를 적으며 출력이 지정한 로컬 폴더에만 생기는지(저장소 기록 없음), 정답 글귀 없음 → 질문 번호와 멈춤, 적중률 5·8·12 계산, JD 전체 넣기 80,000자 초과 표시, `measure` 기록 쓰기 함수가 만든 기록에 질문·답 원문이 없는지.
- [ ] `api/test/db/member-cascade-delete.test.cjs`에 `base_summary` 행을 더한다(회원 삭제 → 그 회원 발행본 요약 0개, 다른 회원 그대로).
- [ ] `api/test/integration/result-application-b.test.cjs`의 마이그레이션 목록 끝에 `CreateBaseSummaryTable…`, 표 개수 +1, 되돌리기 순서 맨 앞에 U5 마이그레이션 되돌리기를 더한다(U3 #429와 같은 방식).
- [ ] `web/test/rag-answer-sse-reader.test.mjs`·`web/test/rag-answer-state.test.mjs`·`web/test/rag-answer-api.test.mjs`(시험용 fetch): SSE 덩어리 나눔·주석 무시·끊긴 덩어리 이어 붙이기, 상태별 문구·버튼(받은 사람/작성자), 오류 코드별 문구, 401·404 → `onAccessLost`, 요약 GET이 `createApiClient().recipient()`의 linkGrant 머리로, 작성자 GET·다시 만들기 POST가 `member()` 회원 토큰으로 가는지, 질문 SSE의 주소(`API_VERSION_PATH`)·`credentials: "omit"`·`X-Link-Grant`, 최근 6개만 보냄, 항목 0개 안내.
- [ ] U5 시험 전부와 `member-cascade-delete`·`result-application-b`를 돌리고, `api/src/rag-answer/` 줄 커버리지 80% 이상(`TEST_COVERAGE_INCLUDE='dist/rag-answer/**'`)과 `web/src/features/rag-answer/`(`.ts` 파일) 줄 커버리지 80% 이상을 확인한다. 못 미치면 기준을 낮추지 않고 빠진 경로의 시험을 더한다. api·web `lint`·`typecheck`를 통과시킨다.
- [ ] api 전체 시험 `npm --prefix api test`와 web 전체 시험 `npm --prefix web test`를 돌려 기존 시험이 깨지지 않았는지 확인한다. 결과는 code-summary에 통과·실패·실행하지 못함으로 적는다.

### Step 14: 설정·문서 (C-06, CONVENTIONS 「파일 역할」, web README 규칙)

- [ ] `api/docs/member-withdrawal-deletion.md` 표에 `base_summary` | 발행본 행과 마이그레이션 이름을 더한다.
- [ ] `api/docs/rag-answer.md`(새): 경로·오류 코드·SSE 이벤트, 단계 순서, 상수 값, 다시 쓰기 키 판정, Redis 연결, 로그 사건, 시험 방법(실제 Redis 시험은 주소가 있을 때만), 평가 스크립트 실행법(입력 파일 모양·모드·결과 위치), 알려진 한계(기능 설계·비기능 설계의 한계), 앱 등록 상태와 U4 순서.
- [ ] `api/CONVENTIONS.md` 「파일 역할과 모듈 추가 위치」 표에 `src/rag-answer/` 한 행을 더한다.
- [ ] `.gitignore`에 `api/.rag-eval/`를 더한다. `api/.env.example`·배포 설정·CI는 고치지 않는다(새 환경변수 없음, 팀장 몫).

### Step 15: 배포 산출물

- [ ] 해당 없음: 새 배포 단위·Dockerfile·IaC 변경이 없다. 배포 환경의 키·Redis는 기존 것이다.

### Step 16: 정리·추적

- [ ] `code-summary.md`: 만든·고친 파일, 주요 결정(위 「현재 코드에서 정한 것」과 Step 1·10 결과), 시험 결과(합성으로 통과한 것과 실제 Redis 시험 통과·미실행을 따로), 실행하지 않은 시험과 이유, 계획과 다른 점. 「계획과 다른 점」에는 기능 설계와 달라진 두 가지를 이유와 함께 적는다: 고지 한 줄을 U2 `<AiNoticeLine />`로 붙인 것(BR8.3, U2 README 결정), 정의하지 않은 칸을 무시하지 않고 400으로 거부한 것(BR1.2·BR8.7, 보안 점검 「요청·메시지 입력」).

### Step 17: 계획 1차 수정 요청 반영 확인 (2026-10-30)

- [ ] 요청 네 가지가 코드에 들어갔는지 확인한다: (1) `qna-panel.tsx`가 U2 `<AiNoticeLine />`를 쓰고 `rag-answer-messages.ts`에 고지 문구가 없음, (2) `question-input.ts`가 정의하지 않은 칸을 400으로 거부하고 시험이 그것을 확인함, (3) `rag-answer-api.ts`의 요약 GET·다시 만들기 POST가 `createApiClient`를 쓰고 질문 SSE만 같은 기준 주소 규칙의 직접 `fetch`임, (4) `synthetic` 모드가 `api/.rag-eval/`에만 쓰고 `measure` 기록 위치가 `api/docs/rag-evaluation/`임. 결과를 code-summary에 적는다.
- [ ] `source-manifest.json`: 이 Unit이 만든·고친 모든 경로.
- [ ] `traceability.json`: AC4.2.1~AC4.2.7·AC6.2.1~AC6.2.8·AC19.3.1~AC19.3.6, BR1.1~BR10.7, NFR1.1~NFR7.2를 구현·시험 파일에 잇는다.

## Testing Contract

```json
{
  "version": 1,
  "methodology": "custom",
  "source": "team",
  "ordering": "각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
  "scope": "mvp",
  "test_strategy": "standard",
  "project_type": "brownfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: custom\n- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.\n- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. Unit에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다."
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Meet an 80% line-coverage floor.",
      "Run the selected tests in CI before merge."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "custom",
    "runner_step": "Verify the existing test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Verify the existing test runner/configuration and record the exact unit-scoped command.",
      "Custom ordering - 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
      "Implementation and tests - preserve that exact ordering; do not convert it to layer-local TDD.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:b6cb6e0b1ba6bb0736259ab7987a5841cfc41f21a49cf2fb5eade7c786b2dc66",
  "contract_sha256": "sha256:19386d629b3092339d296f2cdf4cb18982564dbd19832a03198ee5687fbc32b6"
}
```

계약의 단계 순서를 이 계획에 이렇게 맞췄다: 실행기 확인(Step 1), 구조·설정 뼈대(Step 2), 시나리오 먼저(기능 설계 「주요 시나리오와 확인」 22개가 이미 정함), 구현 뒤 세부 시험(Step 3~12 → Step 13), 설정(Step 14), 문서·추적(Step 14·16). 다섯 시험 층(DB·저장소·업무 로직·API·프런트엔드)이 모두 있다. CI는 고치지 않는다. 새 시험은 `api/test/` 아래 `.test.cjs`, `web/test/` 아래 `.test.mjs`라 기존 `npm test`와 CI가 그대로 찾는다.

## Assumptions & Open Questions

- [assumption] U4 `published_item.snapshot` 모양은 `api/src/publications/published-snapshot.ts`와 같고(C-07), U5는 그 타입을 쓰되 실제 값은 형태를 검사한다.
- [assumption] web의 `.tsx` 패널은 기존 web 시험 방식(Node 타입 제거)으로 직접 시험하지 않고, 화면 판단은 `.ts` 순수 함수로 옮겨 시험한다. 패널을 화면에 붙인 실제 확인은 U4 자리가 생긴 뒤 통합 확인(FR19)에서 한다.
- 미결(Step 1에서 닫음): U4 DB `PublicationAccess` 합류 여부와 그에 따른 앱 등록.
