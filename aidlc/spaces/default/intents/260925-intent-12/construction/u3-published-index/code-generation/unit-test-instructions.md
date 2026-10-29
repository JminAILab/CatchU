# U3 발행본 색인·검색 — 단위 시험 안내

## 시험 도구와 설정

- 도구: api의 기존 `node:test` 묶음과 실행기 `api/scripts/test-with-db.cjs`(`npm test`). 빌드(`dist/`) 뒤 테스트 DB에 마이그레이션을 적용하고 넘긴 파일만 돌린다. 새 시험 도구·설정 파일은 더하지 않는다(team.md Testing Posture, tech-stack-decisions).
- 테스트 DB: `api/README.md` 「DB 테스트」의 명령으로 pgvector 이미지(`pgvector/pgvector:0.8.7-pg16-trixie`)를 `127.0.0.1:5433`에 띄운다. 이름은 `_test`로 끝나야 한다. U3 마이그레이션의 `CREATE EXTENSION IF NOT EXISTS vector`는 슈퍼유저 `catchu`로 그 자리에서 돈다.
- 시험 파일은 `api/test/published-index/*.test.cjs`와 고친 `api/test/db/member-cascade-delete.test.cjs`다. 모두 `dist/published-index/`를 불러 쓴다.

## 이 Unit 시험 실행 명령

저장소 맨 위 폴더에서 그대로 돌린다(`--prefix api`가 api 폴더에서 실행한다).

첫 시험 파일을 쓰기 전 실행기 확인(Step 1):

```bash
npm --prefix api test -- test/db/publication-tables.test.cjs
```

U3 시험 전부:

```bash
npm --prefix api test -- test/published-index/chunker.test.cjs test/published-index/embedding-provider.test.cjs test/published-index/published-index-writer.test.cjs test/published-index/embed-publication-handler.test.cjs test/published-index/published-search.test.cjs test/published-index/live-embedding.test.cjs test/db/member-cascade-delete.test.cjs test/integration/result-application-b.test.cjs
```

`test/integration/result-application-b.test.cjs`는 U3 마이그레이션이 더해진 마이그레이션 목록·표 개수(25)·되돌리기 순서를 확인하므로 U3 명령에 함께 넣는다. api 전체 회귀 확인(`npm --prefix api test`)은 계획 Step 8의 마지막 항목으로 따로 돌리며, Unit 범위 명령이 아니다.

U3 줄 커버리지(팀장 공용 명령, 표 맨 아래 비율이 U3 값):

```bash
TEST_COVERAGE_INCLUDE='dist/published-index/**' npm --prefix api run test:coverage -- test/published-index/chunker.test.cjs test/published-index/embedding-provider.test.cjs test/published-index/published-index-writer.test.cjs test/published-index/embed-publication-handler.test.cjs test/published-index/published-search.test.cjs test/published-index/live-embedding.test.cjs test/db/member-cascade-delete.test.cjs test/integration/result-application-b.test.cjs
```

정적 검사(api 전체 설정이라 범위를 좁힐 수 없다):

```bash
npm --prefix api run lint
npm --prefix api run typecheck
```

실제 Voyage 시험(S12)은 키를 셸 환경변수로만 넘긴다. 키를 파일·명령 기록에 남기지 않는다. 키가 없으면 `live-embedding.test.cjs`는 건너뛴다(skip).

## 기대 커버리지

- `api/src/published-index/` 줄 커버리지 80% 이상(mvp 범위 하한). 표는 `dist/`의 컴파일된 JS 기준이다(실행기 설명).
- 시험 수: 구성 요소마다 5~8개(Standard), 합계 약 45개. 시나리오 정본은 기능 명세 S1~S12다.
- 기준을 낮추거나 시험 설정의 상한을 바꿔 통과시키지 않는다. 못 미치면 빠진 경로 시험을 더하고, 그래도 안 되면 그 사실을 code-summary에 적는다.

## 대역(모의) 사용

- **임베딩 제공자:** 시험용 제공자 셋을 시험 파일 안에 둔다. (1) 결정적 합성 제공자(`synthetic-embedding-provider.ts`), (2) 시험이 정한 글→벡터 표를 쓰는 제공자(검색 순위 확인용), (3) 지정한 호출 번호에서 `EmbeddingProviderError`를 던지는 제공자. 각 제공자는 받은 입력 종류(문서·질문)·글 개수·호출 횟수를 기록한다.
- **Voyage 전송:** `createEmbeddingProvider(config, env, fetch)`에 시험용 fetch를 넘긴다. 받은 주소·머리글·본문을 기록하고, 정상·redirect(3xx)·큰 본문(256 KiB 초과 8 MiB 이하, 8 MiB 초과)·느리게 흐르는 본문·보낸 글을 담은 400 응답·개수/차원이 틀린 응답·`TypeError` 전송 실패를 돌려준다. 시간 제한 시험은 짧은 시간 제한을 넣을 수 있게 제공자 만들기 함수의 선택 인자로 받는다(운영 기본값은 상수 30초·10초).
- **AiRun:** `registerHandler`·`enqueueAfterCommit`만 가진 기록용 가짜를 넘긴다. `enqueueAfterCommit`은 `ENQUEUED` 또는 시험이 정한 `ENQUEUE_FAILED`를 돌려주고 받은 종류·runKey·payload를 기록한다. 실제 큐(Redis)는 쓰지 않는다.
- **로그:** 만들기 함수에 기록용 logger(`log`·`warn`·`error`)를 넘겨 남긴 객체의 칸 이름과 값을 확인한다. 시험에 쓴 조각 글·질문 글·키 문자열이 로그 출력 어디에도 없는지 문자열로 찾는다.
- **시각:** `now`를 인자로 넘기고, 처리기는 선택 인자 `clock`으로 받는다. 마감 지남은 `deadline_at`을 과거로 쓴 행으로 만든다.

## 시험 자료

- 테스트 DB는 각 시험 앞에서 `resetTestDatabase`로 비운다(`test/support/test-database.cjs`).
- 회원·발행본·항목은 시험 파일의 작은 도우미로 직접 넣는다(C-07 모양: `member_account` → `publication` → `published_item`). 발행본 A = Catch 항목 1개(`workFacts` 2개, `evidence` 1개에 `representedFacts` 2개, `authorDescription` 300자, `aiDraft` 있음)와 문단 600·300·900·700자 텍스트 자료 1개. 발행본 B = 텍스트 자료 1개. 모두 공개 가능한 합성 글이다.
- PDF 항목은 `published_pdf_page` 표(U8)가 아직 없어 조각 나누개 순수 시험에서만 쓴다(3쪽 중 2쪽 읽을 수 없음).
- 임베딩 129개 조각 경우는 텍스트 자료 하나를 빈 줄로 나뉜 600자 문단 129개로 만들어(두 문단을 이으면 1,000을 넘어 문단마다 조각 하나) 묶음 2개를 확인한다.
