# 질의응답·AI 기본 요약 RagAnswer — 12월 intent U5

받은 사람의 질의응답(SSE, 로그인 없음, 대화 저장 없음)과 발행본마다 하나인 AI 기본 요약(백그라운드 생성·받은 사람/작성자 읽기·[다시 만들기]), RAG 품질 평가 스크립트를 맡는 모듈(`src/rag-answer/`, `scripts/rag-eval/`)이다. 화면 패널은 [web/src/features/rag-answer](../../web/src/features/rag-answer/README.md)에 있다.

기준 문서: [계약 C-01·C-02·C-03·C-06·C-07·C-09·C-10·C-11·C-12](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md), [U5 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/functional-spec.md) W1~W7·[업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md) BR1~BR10, [U5 비기능 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/). 규칙 ID는 그 문서의 것이다.

## 앱 등록 상태와 U4 순서

- **기본 앱(`AppModule`)에 등록했다**(#441). U4 제출 2(PR #468)가 `PublicationsModule`과 C-10 DB 구현(`DbPublicationAccess`, 토큰 `PUBLICATION_ACCESS`)을 앱에 넣은 뒤라, `AppModule` `imports`에 `RagAnswerModule.register({ imports: [PublicationsModule], publicationAccess: { useExisting: PUBLICATION_ACCESS } })`를 둔다. `PUBLICATION_ACCESS`는 `src/publications/publications.module.ts`가 내보내는 U4 토큰이고, U5 안의 같은 이름 자리(`rag-answer-tokens.ts`)와는 다른 심볼이다.
- 순서(#416 팀장 결정 2026-11-03): U4 제출 2가 먼저 합쳐지고 이 등록이 뒤따랐다. 그 사이에 큐가 있는 환경에서 발행한 발행본은 `BASE_SUMMARY`가 모르는 작업 종류로 실패 처리되어 10분 뒤 `FAILED`이고, 작성자가 [다시 만들기]로 복구한다. 개발 서버는 큐가 없어 이 경우가 생기지 않는다(등록 뒤에도 큐가 없으면 기본 요약은 시한으로 `FAILED`, [AiRun](ai-run.md)).
- 기동 조건은 바뀌지 않는다. 생성 키(`CATCHU_GENERATION_API_KEY`)가 없어도 api는 뜨고 다시 쓰기·게이트를 부를 때 `NOT_CONFIGURED`로 끝난다. 큐 주소(`CATCHU_QUEUE_REDIS_URL`)가 없으면 질문 횟수는 늘 통과하고, 틀리면 AiRun과 같이 기동이 멈춘다. 기동 시험은 `test/rag-answer/rag-answer-app.test.cjs`다.
- 메모리 `PublicationAccess`(`src/publications/in-memory-publication-access.ts`)는 시험에서만 넣고 앱에는 어느 경우에도 넣지 않는다. 컨트롤러 시험(`test/rag-answer/support.cjs`)은 `AppModule`에서 U5 등록만 뺀 조립에 대역을 넣어 띄운다.
- `base_summary` 마이그레이션(`1793348947970-CreateBaseSummaryTable`)은 등록과 관계없이 들어 있다.

`RagAnswerModule.register()`가 조립하는 것: 컨트롤러 둘(`QnaController`·`SummaryController`), `QUESTION_REWRITER`(키 판정), `QUESTION_COUNTER`(Redis 주소 판정, 앱 종료 때 `close()`), `PUBLICATION_ACCESS` 자리, 모듈 초기화 때 `AiRun.registerHandler('BASE_SUMMARY', …)` 한 번. `AiGenerationModule`·`AiRunModule`·`DailyRunLimitModule`·`PublishedIndexModule`을 가져온다.

## 경로

| 경로 | 누구 | 응답 | 오류 |
|---|---|---|---|
| `POST /v1/public/links/{token}/questions` | 받은 사람(`@Public()`, `X-Link-Grant`) | `200 text/event-stream` | 400 `VALIDATION_FAILED`, 401 `LINK_PASSWORD_REQUIRED`, 404 `LINK_UNAVAILABLE`, 409 `INDEX_NOT_READY`, 429 `QUESTION_LIMIT_REACHED` |
| `GET /v1/public/links/{token}/summary` | 받은 사람(`@Public()`, `X-Link-Grant`) | `{ status, items }`(DONE만 항목) | 401 `LINK_PASSWORD_REQUIRED`, 404 `LINK_UNAVAILABLE` |
| `GET /v1/publications/{publicationId}/summary` | 작성 회원(Bearer) | `{ status, items, canRegenerate }` | 401 `AUTH_*`, 404 `RESOURCE_UNAVAILABLE`(남의 것·없음·형식 틀린 ID 구분 없음) |
| `POST /v1/publications/{publicationId}/summary/regenerate` | 작성 회원(Bearer) | `202 {}`(접수) | 401 `AUTH_*`, 404 `RESOURCE_UNAVAILABLE`, 429 `DAILY_LIMIT_REACHED` |

오류 본문은 공통 `{ code, message }`다. `INDEX_NOT_READY`(409, 공용 문구 "아직 쓸 수 없습니다". U10 JD 요약도 같은 코드를 쓰므로 기능 이름을 넣지 않고, 질의응답 화면 문구는 web 문구 표가 정한다)와 `QUESTION_LIMIT_REACHED`(429, "오늘 한도에 도달했습니다")는 계약 C-12가 정한 코드로 `src/common/errors/error-codes.ts`에 있다. 남은 횟수·`Retry-After`는 보내지 않는다.

### 질의응답 본문

`{ "question": string, "history": [{ "role": "USER" | "ASSISTANT", "text": string }] }`

- 질문은 앞뒤 공백을 뺀 길이 1 이상, UTF-16 500 이하. 앞뒤 공백만 뗀다.
- `history`는 배열(빈 배열 허용). 모양을 모두 본 뒤 끝에서 6개만 남기고 메시지마다 앞 2,000자만 쓴다(넘는 부분은 거부하지 않고 버림).
- **정의하지 않은 칸은 본문 최상위와 앞 대화 항목 안 모두 `400 VALIDATION_FAILED`다**(보안 점검 「요청·메시지 입력」, 자료 제외 같은 칸도 이것으로 막힌다). `details.violations`에는 칸 이름과 규칙 이름만 있다.

### SSE

| 이벤트 | data |
|---|---|
| `item` | 게이트가 통과시킨 `GatedItem`(C-01) 하나. 받는 대로 쓴다 |
| `done` | `{}` |
| `error` | `{ "code": "ANSWER_FAILED" \| "INDEX_NOT_READY" }`. 이미 보낸 항목은 그대로 두고 닫는다 |

머리: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive`. 항목을 기다리는 동안 15초마다 `: keep-alive` 주석을 쓴다. 받은 사람이 연결을 끊으면(응답 `close`가 끝나기 전에 옴, 또는 확인 단계를 기다리는 사이 이미 끊겨 응답이 `destroyed`) 끊김으로 보아 아직 시작하지 않은 다시 쓰기·검색·생성을 부르지 않고, 생성 반복을 `break`해 게이트 스트림의 `return`을 부른다. 센 질문 횟수는 돌려주지 않는다.

## 단계 순서

질의응답(W1): 본문 검증 → `resolveForRecipient(token, grant, now)` → `getIndexState`가 DONE이 아니면 409 → 질문 횟수(100 초과면 429, Redis 장애면 통과) → SSE 열기 → (앞 대화가 있을 때만) 다시 쓰기 → `search(publicationId, 검색 질문, 8)` → (조각이 있을 때만) `generateStream({ feature: 'QNA', model: QNA_MODEL, userText: 검색 질문, publicationText })` → `done`. 각 단계는 한 번만 부르고 다시 시도하지 않는다. 앞 대화는 다시 쓰기에만 자료로 넣고 검색·생성에는 넣지 않는다.

기본 요약 처리기(W3, `BASE_SUMMARY`): `base_summary` 행만 보고 판정한다. 행 없음이고 `published_at + 10분` 전이면 `INSERT … ON CONFLICT (publication_id) DO NOTHING`으로 PENDING을 만들고 다시 읽는다. PENDING이고 마감 전이면 생성한다. 그 밖(DONE·FAILED·마감 지남·시한 지난 행 없음·발행본 없음)은 끝낸다. 사본 필드 하나를 근거 하나로(`aiDraft`·`mismatch`·제목 제외) `generate({ feature: 'BASE_SUMMARY', model: 'HAIKU', userText: null, publicationText: null })`. 결과는 짧은 트랜잭션에서 행을 잠근 뒤(`FOR UPDATE`) 시각을 읽고 조건부 UPDATE 하나로 쓴다(잠금을 기다리는 사이 마감이 지나면 버리기 위해): 항목 1개 이상은 `status <> 'FAILED' AND deadline_at > now`일 때 DONE, 0개·생성 실패는 `status = 'PENDING' AND deadline_at > now`일 때 FAILED. 바뀐 행이 없으면(발행본 삭제·FAILED·마감 지남) 버린다. 생성 실패(사본 읽기·사본 모양·`AiProviderError`·`AiInputTooLarge`)는 FAILED로 쓰고 정상 반환하며, DB 오류는 로그 뒤 다시 던진다(AiRun이 실패로 기록, 상태는 시한으로 FAILED). 하루 횟수를 세지 않는다.

요약 읽기(W4·W5): 행이 없으면 `readSnapshot().publishedAt + 10분` 전이면 PENDING, 지났으면 FAILED로 보고 행을 만들지 않는다. 행이 PENDING이고 마감이 지났으면 `persistDeadlineFailure`로 그 자리에서 FAILED를 저장한다. 받은 사람에게는 DONE일 때만 항목을 준다. 작성자는 링크 중지·만료 뒤에도 보고 `canRegenerate = status != PENDING`을 받는다.

[다시 만들기](W6): `resolveForOwner` → 한 트랜잭션(`consume(memberId, 'BASE_SUMMARY', now, manager)`, `LIMIT_REACHED`면 되돌리고 429, 아니면 행을 PENDING·빈 항목·`generated_at` 비움·`deadline_at = now + 10분`으로 upsert) → 커밋 뒤 `enqueueAfterCommit('BASE_SUMMARY', 'BASE_SUMMARY-{publicationId}-{uuid}', { publicationId })` → 결과와 관계없이 202. PENDING이어도 거부하지 않고 동의는 다시 확인하지 않는다.

## 값

`src/rag-answer/rag-answer-config.ts` 한곳에 있다.

| 값 | 크기 |
|---|---|
| 질문 길이 | 500(UTF-16) |
| 앞 대화 | 최근 6개, 메시지마다 2,000자 |
| 질의응답 검색 조각 | 8 |
| 링크당 하루 질문 | 100(한국 시간 날짜) |
| 기본 요약 처리 시한 | 10분 |
| 다시 쓰기 | 10초, 출력 200토큰 |
| SSE keep-alive | 15초 |
| 질문 횟수 Redis 명령 상한 | 1초 |
| 질의응답 모델 `QNA_MODEL` | `HAIKU`(환경변수 없음. 평가 조정으로 Sonnet을 쓸 때 이 값을 코드 PR로 바꾼다) |

## 작성자 자료 딱지 — #528

받은 사람 AI가 작성자 글을 옮긴 항목에 '작성자 자료 원문' 딱지가 붙게 하는 두 장치다(새 Catch FR11.1·AC8.1.1·AC8.1.2).

- 질의응답·기본 요약 항목에 Claude 인용이 없어도, 따옴표로 옮긴 글이 작성자 자료 원문 한 곳에 글자 그대로 있으면 게이트가 그 줄을 인용으로 붙인다. 규칙과 한계는 [AI 생성 관문](ai-generation.md) 「따옴표 인용 — #528」이다.
- 기본 요약 지시(`BASE_SUMMARY_INSTRUCTION`)는 지금 지시와 끝의 작성자 말 옮기기 문장 사이에 두 문장을 둔다. 작성자 자료 원문에서 온 내용은 다른 자료와 섞지 않은 항목에 핵심 문장을 바꾸지 않고 따옴표로 옮겨 그 줄을 인용한다. 커밋 메시지·PR 제목은 「작성자는 …라고 적었다」로 옮기지 않는다. 질의응답 지시는 그대로다.
- 다시 잰 결과는 [평가 기록 2026-11-12(#528 재측정)](rag-evaluation/2026-11-12-528.md)에 있다.

## 질문 다시 쓰기 키 판정

`QuestionRewriter`(주입 토큰 `QUESTION_REWRITER`)는 U5 모듈 안의 인터페이스다. 게이트(C-01)·U1·U2 내부 클라이언트는 쓰지 않고 같은 키 `CATCHU_GENERATION_API_KEY`·SDK·지키는 fetch·모델 상수만 함께 쓴다.

- 키를 만들기 함수에서만 읽는다. 앞뒤 공백을 뺀 값이 비면 SDK 클라이언트를 만들지 않고 부를 때마다 `QuestionRewriteFailed('NOT_CONFIGURED')`다. 기동은 막지 않는다.
- 키가 있으면 주소를 코드 상수(`https://api.anthropic.com`)로 고정하고 재시도 0·10초·지키는 fetch(redirect 거부·응답 256 KiB 상한)·`inference_geo: us`로 한 번 부른다. system은 고정 지시문, user는 `<conversation>`·`<question>` 꼬리표 자료다. 인용 기능은 쓰지 않는다.
- 결과는 앞뒤 공백을 떼고 앞 500자. 시간 초과·호출 실패·redirect·본문 초과·빈 응답은 모두 `QuestionRewriteFailed`(종류만) 하나이고 SSE는 `error ANSWER_FAILED`다.

## Redis 연결(질문 횟수)

- 큐와 같은 설정 `CATCHU_QUEUE_REDIS_URL`·`CATCHU_QUEUE_PREFIX`를 `readAnalysisQueueConfig`로 읽는다(새 환경변수 없음, 틀리면 기동 실패). 주소가 없으면 늘 세지 않고 통과하는 계수기다.
- 전용 ioredis 연결 하나. `lazyConnect` 없이 만들 때 연결을 시작하되 기동을 기다리게 하지 않는다. `enableOfflineQueue: false`·`commandTimeout: 1000`·`maxRetriesPerRequest: 0`. `error` 사건은 오류 이름만 한 번 경고로 남긴다(ready 뒤 다시). 앱 종료 때 `quit()` 뒤 `disconnect()`.
- 키 `{prefix}:qna-question-count:{publicationId}:{YYYY-MM-DD}`(한국 시간 날짜). `MULTI`로 `INCR`과 `EXPIREAT 다음 한국 자정`을 함께 보낸다. 101번째부터 429. 명령 실패·1초 초과면 그 질문을 세지 않고 통과시키고 `qna.count-bypassed`를 남긴다. 거부된 질문도 늘린 값을 되돌리지 않는다. 키는 지우지 않고 만료에 맡긴다(발행본 삭제·탈퇴 때도).

## 로그 사건

Nest `Logger('RagAnswer')`로 사건마다 객체 한 줄을 남긴다(`rag-answer-log.ts`의 타입 칸만). 질문·앞 대화·답·근거 글·링크 토큰·grant는 남기지 않는다.

| 사건 | 수준 | 칸 |
|---|---|---|
| `qna.completed` | 성공·끊김 log, 실패 warn | `publicationId`, `stage`, `outcome`(`OK`·`REWRITE_FAILED`·`SEARCH_FAILED`·`INDEX_NOT_READY`·`GENERATION_FAILED`·`CLIENT_CLOSED`), `failure`(오류 이름), `rewritten`, `rewriteMs`, `rewriteInputTokens`, `rewriteOutputTokens`, `searchMs`, `chunkCount`, `generateMs`, `itemCount`. 버린 항목 수는 게이트 로그 `ai_gate_result`에서 본다 |
| `qna.rejected` | log | `outcome`(`VALIDATION_FAILED`·`LINK_UNAVAILABLE`·`LINK_PASSWORD_REQUIRED`·`INDEX_NOT_READY`·`QUESTION_LIMIT_REACHED`), `publicationId`(링크 판정 뒤만) |
| `qna.stream-failed` | error | `publicationId`, `error`(오류 이름). SSE를 연 뒤 단계별 실패 처리 밖의 예상 밖 예외. 받은 사람에게는 `error ANSWER_FAILED`를 쓰고 닫는다 |
| `qna.count-bypassed` | warn | `publicationId`, `reason`(`NO_REDIS`·`REDIS_ERROR`·`REDIS_TIMEOUT`) |
| `qna.count-connection-error` | warn | `error`(오류 이름) |
| `base-summary.handled` | DONE·DISCARDED·SKIPPED log, FAILED warn, ERROR error | `publicationId`, `outcome`, `failure`, `itemCount`, `droppedCount`, `durationMs` |
| `base-summary.regenerate-accepted` | ENQUEUED log, ENQUEUE_FAILED warn | `publicationId`, `enqueue` |

## 시험

저장소 맨 위 폴더에서 돌린다. 테스트 DB는 [README 「DB 테스트」](../README.md#db-테스트)대로 띄운다.

```bash
npm --prefix api test -- test/rag-answer/question-input.test.cjs test/rag-answer/question-rewriter.test.cjs test/rag-answer/question-counter.test.cjs test/rag-answer/live-question-counter.test.cjs test/rag-answer/qna-controller.test.cjs test/rag-answer/summary-sources.test.cjs test/rag-answer/base-summary-handler.test.cjs test/rag-answer/summary-controller.test.cjs test/rag-answer/rag-answer-app.test.cjs test/rag-answer/rag-eval.test.cjs test/db/member-cascade-delete.test.cjs test/integration/result-application-b.test.cjs
```

- 다른 Unit 자리(링크 판정·검색·게이트·AiRun·하루 제한·다시 쓰기)는 합성 대역이다(`test/rag-answer/support.cjs`). 합성으로 통과한 것은 실제 Claude·Voyage·U4 연결 성공이 아니다.
- **실제 Redis 시험(`live-question-counter.test.cjs`)은 `CATCHU_TEST_REDIS_URL`이 있을 때만 돈다.** 예: `CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6379/15 npm --prefix api test -- test/rag-answer/live-question-counter.test.cjs`. 키 접두사는 시험마다 새로 만든다.
- 줄 커버리지: `TEST_COVERAGE_INCLUDE='dist/rag-answer/**' npm --prefix api run test:coverage -- <위 파일들>`.

## RAG 품질 평가(US19.3)

CI에서 돌지 않는 손 실행 스크립트다(`scripts/rag-eval/`).

```bash
npm --prefix api run rag-eval -- synthetic [--input <파일>] [--out <폴더>]
npm --prefix api run rag-eval -- measure --input <파일> [--target <대상 버전>]
```

입력 파일(JSON, 저장소에 넣지 않는다):

```json
{ "publicationId": "uuid", "memberId": "실행자 본인 회원 uuid(measure만)", "targetVersion": "커밋", "questions": [{ "question": "면접관 말투 질문", "goldQuotes": ["사본 원문 글귀"] }], "jd": "JD 원문(줄마다 요구사항 하나)" }
```

| 모드 | 하는 일 | 결과 위치 |
|---|---|---|
| `synthetic` | 합성 게이트·합성 검색(U3 조각 나누기 + 합성 임베딩)·메모리 사본으로 끝까지 도는지만 확인한다. `SYNTHETIC_CHECK`이며 NFR3 측정이 아니다. 입력이 없으면 내장 합성 발행본을 쓰고, 입력에 `snapshot`(C-10 사본 모양)을 넣을 수 있다 | 원문 결과와 기록 모두 `api/.rag-eval/`(`.gitignore`)에만. 저장소에 남는 파일을 만들지 않는다 |
| `measure` | 실제 게이트·실제 검색과 테스트가 아닌 DB의 시연 발행본으로 한 번 잰다. 질문 10개, `CATCHU_GENERATION_API_KEY`·`CATCHU_EMBEDDING_API_KEY`가 있어야 한다 | 원문은 `api/.rag-eval/<날짜>-measure.json`, 저장소 기록은 `api/docs/rag-evaluation/<날짜>.md` |

- 정답 글귀마다 사본 필드에서 글자 그대로 나오는 모든 위치를 정답 위치로 삼는다. 한 곳도 없으면 질문 번호를 알리고 멈춘다(파일을 쓰지 않음).
- 질문마다 `search(…, 12)` 한 번으로 앞 5·8·12개 적중(같은 항목·같은 fieldPath에서 범위가 겹치면 적중)을 판정하고, 앞 8개로 질의응답과 같은 요청(지시문·모델)을 `generate`로 불러 통과·버린 항목 수를 모은다. 8개 기준 비적중 질문은 앞 8개 조각 위치를 기록에 남긴다. 답이 0개(`NO_ITEMS`)인 질문은 앱처럼 「답 실패」로 그 질문 번호를 결과·기록·로그에 남기고 다음 질문으로 간다. 다른 생성 실패는 질문 번호를 로그에 알리고 멈춘다(파일을 쓰지 않음).
- JD 비교: 빈 줄을 뺀 줄마다 검색 기반(조각 8개)과 전체 넣기(`published_chunk`를 `seq` 순으로 모두 읽기 전용으로 읽음) 두 번 `JD_SUMMARY`를 부른다. 전체 넣기가 80,000자를 넘으면 `INPUT_TOO_LARGE`로 적는다. U10은 아직 합쳐지지 않아 스크립트의 나누기·지시문을 쓰고 기록에 "스크립트"로 적는다. `published_chunk` 직접 읽기는 이 평가 스크립트의 읽기 전용 사용뿐이고 서비스 경로는 C-09만 쓴다.
- 저장소 기록에는 실행 날짜·대상 버전·모드, 적중률(5·8·12), 통과·버린 항목 수, 답 실패 질문 번호, 비적중 질문의 조각 위치, 요구사항마다 두 방식의 항목·버린 수, 빈 사람 판정 칸(남의 기여 오귀속, 근거 비뒷받침, 다른 곳의 맞는 근거 n건, 통과 여부, 조정 내용)만 있다. 질문·글귀·답 원문은 없다.
- **`measure`의 사본 읽기는 앱과 같은 U4 DB 구현(`DbPublicationAccess.readSnapshot`)이다.** 실제 발행 경로로 만든 시연 발행본으로 한 번 잰다(BR10.1). 읽은 내용이 Claude·Voyage로 나가므로, 입력의 `memberId`(실행자 본인)가 그 발행본의 주인인지 작성자 화면과 같은 판정(`resolveForOwner`)으로 먼저 확인하고, 아니면 외부 호출 없이 멈춘다. 시연용 여부는 확인하지 않으니 `publicationId`에는 본인의 시연 발행본을 넣는다. 아직 재지 않았다(#441). 판정·조정·재측정은 BR10.6을 따른다.

## 알려진 한계

- 앞 대화에 숨긴 지시가 다시 쓴 검색어를 바꿀 수 있다. 찾는 범위는 그 발행본뿐이고 답은 게이트가 대조한다.
- 자동 첫 요약과 [다시 만들기], 겹친 [다시 만들기]는 두 번 생성되고 하루 횟수도 두 번 쓴다. 늦은 DONE이 앞 DONE을 덮을 수 있다(고정 사본이라 같은 내용).
- [다시 만들기]는 DONE 요약도 바로 PENDING(항목 비움)으로 바꾼다. 다시 만들기가 실패하면 기존 요약은 사라진다.
- 앞 작업의 늦은 실패가 [다시 만들기]로 돌아간 PENDING 행을 FAILED로 바꿔, 뒤 작업의 새 결과가 버려질 수 있다(DONE 쓰기는 `status <> 'FAILED'`일 때만). 작성자가 [다시 만들기]를 다시 누르면 복구된다. 계약 C-02 「에러 대응 최소선 6」의 받아들인 한계이고, AiRun payload는 ID(`publicationId`) 하나뿐이라 작업 세대 값을 넘겨 가려내지 않는다.
- Redis가 없거나 장애인 동안 질문 수 상한이 없다. 질문당 비용이 작아 받아들인 한계다(비기능 요구사항 수정 R-03).
- 연결이 끊긴 뒤 게이트 스트림 닫힘이 게이트 시간 제한(45초)까지 늦을 수 있고, 이미 시작한 다시 쓰기는 끝까지 돈다.
- "맞는데 버려진 항목"은 버린 수를 상한값으로만 적는다.
- U4의 발행 크기 상한이 기본 요약 근거 글 합 80,000자 안에 들어야 한다. 넘으면 큰 발행본의 기본 요약은 늘 FAILED다(통합 때 확인).
- 읽을 때 지난 PENDING을 FAILED로 바꾸는 공용 도우미(`persistDeadlineFailure`)는 `updated_at`을 고치지 않는다(U3 `publication_index`와 같음).
