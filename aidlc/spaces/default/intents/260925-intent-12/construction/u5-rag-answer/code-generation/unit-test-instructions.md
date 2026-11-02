# U5 RAG 응답 — 단위 시험 안내

## 시험 도구와 설정

- api: 기존 `node:test` 묶음과 실행기 `api/scripts/test-with-db.cjs`(`npm test`). 빌드(`dist/`) 뒤 테스트 DB에 마이그레이션을 적용하고 넘긴 파일만 돌린다. 새 시험 도구·설정 파일은 더하지 않는다(team.md Testing Posture, tech-stack-decisions).
- web: 기존 `node --test`(Node 24 타입 제거). 시험 파일은 `web/test/rag-answer-*.test.mjs`이고 `web/src/features/rag-answer/`의 `.ts` 순수 함수·api 함수를 불러 쓴다.
- 테스트 DB: `api/README.md` 「DB 테스트」의 명령으로 pgvector 이미지를 `127.0.0.1:5433`에 띄운다. 이름은 `_test`로 끝나야 한다.
- 실제 Redis 시험: `CATCHU_TEST_REDIS_URL`(예: 로컬 `redis://127.0.0.1:6379/15`)이 있을 때만 돈다. 없으면 건너뛴다(skip).

## 이 Unit 시험 실행 명령

저장소 맨 위 폴더에서 돌린다. api 명령은 `--prefix`가 `api/` 폴더에서 실행한다. web 시험은 `npm --prefix web exec`가 맨 위 폴더에서 실행되고 레지스트리의 `node` 패키지를 받으므로 `(cd web && node --test …)`로 `web/` 폴더에서 돌린다.

첫 시험 파일을 쓰기 전 실행기 확인(Step 1):

```bash
npm --prefix api test -- test/db/publication-tables.test.cjs
(cd web && node --test test/api-response.test.mjs)
```

U5 api 시험 전부:

```bash
npm --prefix api test -- test/rag-answer/question-input.test.cjs test/rag-answer/question-rewriter.test.cjs test/rag-answer/question-counter.test.cjs test/rag-answer/live-question-counter.test.cjs test/rag-answer/qna-controller.test.cjs test/rag-answer/summary-sources.test.cjs test/rag-answer/base-summary-handler.test.cjs test/rag-answer/summary-controller.test.cjs test/rag-answer/rag-eval.test.cjs test/db/member-cascade-delete.test.cjs test/integration/result-application-b.test.cjs
```

U5 web 시험 전부:

```bash
(cd web && node --test test/rag-answer-sse-reader.test.mjs test/rag-answer-state.test.mjs test/rag-answer-api.test.mjs)
```

U5 줄 커버리지(팀장 공용 명령, 표 맨 아래 비율이 U5 값):

```bash
TEST_COVERAGE_INCLUDE='dist/rag-answer/**' npm --prefix api run test:coverage -- test/rag-answer/question-input.test.cjs test/rag-answer/question-rewriter.test.cjs test/rag-answer/question-counter.test.cjs test/rag-answer/live-question-counter.test.cjs test/rag-answer/qna-controller.test.cjs test/rag-answer/summary-sources.test.cjs test/rag-answer/base-summary-handler.test.cjs test/rag-answer/summary-controller.test.cjs test/rag-answer/rag-eval.test.cjs test/db/member-cascade-delete.test.cjs test/integration/result-application-b.test.cjs
(cd web && node --test --experimental-test-coverage --test-coverage-include='src/features/rag-answer/**' test/rag-answer-sse-reader.test.mjs test/rag-answer-state.test.mjs test/rag-answer-api.test.mjs)
```

`test/db/member-cascade-delete.test.cjs`와 `test/integration/result-application-b.test.cjs`는 U5 표와 마이그레이션이 더해진 연쇄 삭제·마이그레이션 목록을 확인하므로 U5 명령에 함께 넣는다. api·web 전체 회귀 확인(`npm --prefix api test`, `npm --prefix web test`)은 계획 Step 13의 마지막 항목으로 따로 돌리며, Unit 범위 명령이 아니다.

정적 검사(서비스 전체 설정이라 범위를 좁힐 수 없다):

```bash
npm --prefix api run lint
npm --prefix api run typecheck
npm --prefix web run lint
npm --prefix web run typecheck
```

## 기대 커버리지

- `api/src/rag-answer/` 줄 커버리지 80% 이상(mvp 범위 하한). 표는 `dist/`의 컴파일된 JS 기준이다.
- `web/src/features/rag-answer/`의 `.ts` 파일 줄 커버리지 80% 이상. `.tsx` 패널은 시험이 불러오지 않아 표에 들지 않으며, 그 사실을 code-summary에 적는다(web README 「테스트」).
- 시험 수: 구성 요소마다 5~8개(Standard). api 약 55개, web 약 18개. 시나리오 정본은 기능 명세 「주요 시나리오와 확인」 22개다.
- 기준을 낮추거나 시험 설정의 상한을 바꿔 통과시키지 않는다. 못 미치면 빠진 경로 시험을 더하고, 그래도 안 되면 그 사실을 code-summary에 적는다.

## 대역(모의) 사용

- **링크 판정:** `api/src/publications/in-memory-publication-access.ts`(U4 시험 전용 가짜)에 발행본·링크 상태(유효·중지·만료·삭제·비밀번호)를 넣어 쓴다. 앱 모듈에는 넣지 않는다.
- **검색:** 시험 파일 안의 합성 `PublishedSearch`(정한 상태와 조각 목록을 돌려주고, 받은 질문·limit·호출 횟수를 기록, 지정한 호출에서 `IndexNotReady`나 제공자 오류).
- **게이트:** 시험 파일 안의 합성 `AiGenerationGate`. `generate`는 정한 `GatedOutput`, `generateStream`은 정한 항목을 차례로 내보내고 `return` 호출 여부를 기록하며, 지정한 위치에서 `AiProviderError`·`AiInputTooLarge`를 던진다.
- **다시 쓰기:** 합성 `QuestionRewriter`(호출 기록·지정 실패). 실제 구현 시험은 `createQuestionRewriter({ apiKey, fetch, timeoutMs })`에 시험용 fetch를 넘겨 받은 본문을 기록하고 redirect·큰 본문·느린 본문·빈 응답·HTTP 오류를 돌려준다. 키는 합성 문자열이다.
- **질문 횟수:** 메모리 계수기와, `INCR`·`EXPIREAT`·`MULTI`만 흉내 내는 가짜 Redis 객체(지정한 명령에서 실패·지연). 실제 Redis는 `live-question-counter.test.cjs`에서만.
- **AiRun·하루 제한:** `registerHandler`·`enqueueAfterCommit`만 가진 기록용 가짜(`ENQUEUED` 또는 시험이 정한 `ENQUEUE_FAILED`), 정한 결정을 돌려주는 `DailyRunLimit` 가짜(받은 manager 기록). 실제 큐는 쓰지 않는다.
- **로그:** 만들기 함수에 기록용 logger를 넘겨 칸 이름과 값을 확인하고, 시험에 쓴 질문·앞 대화·답·근거 글·링크 토큰 문자열이 로그 어디에도 없는지 찾는다.
- **시각·타이머:** `now`와 `clock`을 인자로 넘긴다. keep-alive 간격은 컨트롤러 만들기 옵션으로 짧게 넣는다(운영 기본 15초).

## 시험 자료

- 테스트 DB는 각 시험 앞에서 `resetTestDatabase`로 비운다(`test/support/test-database.cjs`).
- 회원·발행본·항목은 시험 파일의 작은 도우미로 직접 넣는다(C-07 모양: `member_account` → `publication` → `published_item`). 발행본 A = Catch 항목 1개(`workFacts` 2개, `evidence` 1개에 `representedFacts` 2개, `authorDescription`, `aiDraft` 있음)와 텍스트 자료 1개. 모두 공개 가능한 합성 글이다.
- 평가 스크립트 시험은 `test/rag-answer/` 안의 합성 입력 파일(질문 3개·정답 글귀·짧은 JD)과 임시 출력 폴더를 쓰고, 끝나면 지운다. `synthetic` 모드는 저장소 기록(`api/docs/rag-evaluation/`)을 만들지 않으므로, 시험은 출력이 임시 폴더에만 생기는지 확인한다.
- 질의응답 본문 시험에는 정의하지 않은 칸(본문 최상위와 앞 대화 항목 안, 자료 제외 칸 예시 포함)을 넣은 요청을 두어 400을 확인한다.
- web api 시험은 `createApiClient`에 시험용 fetch를 넘겨 받은 주소·머리(linkGrant, 회원 토큰)를 기록하고, 질문 SSE는 전역 `fetch`를 시험용으로 바꿔 주소·`credentials`·머리를 기록한다.
