# U3 발행본 색인·검색 — 코드 생성 요약

## Sources

작성일: 2026-10-29. 입력: [코드 생성 계획](code-generation-plan.md)과 [단위 시험 안내](unit-test-instructions.md)(승인본), [기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md)·[엔티티](../functional-design/entities.md), [비기능 설계](../nfr-design/), [기술 선택](../nfr-requirements/tech-stack-decisions.md), [계약 요약](../../../inception/contract-design/contract-summary.md) C-02·C-06·C-07·C-08·C-09. 기준 코드: 통합 브랜치 `intent/260925-intent-12`(fd1b465). Voyage 공식 문서(docs.voyageai.com, 2026-10-29 열람).

## 만든·고친 파일

새로 만든 것

| 파일 | 내용 |
|---|---|
| `api/src/published-index/embedding-config.ts` | 상수(모델·차원·주소·시간 제한·묶음·본문 상한·처리 시한·조각 최대 길이), `readEmbeddingConfig`, `embeddingDeadline` |
| `api/src/published-index/embedding-types.ts` | `EmbeddingProvider` 경계 타입, `EmbeddingProviderError`(종류·HTTP 상태, 고정 문구), 벡터 검사·pgvector 문자열 도우미 |
| `api/src/published-index/embedding-provider.ts` | `createEmbeddingProvider(config, env, options)` 판정표, 위 타입 다시 내보내기 |
| `api/src/published-index/voyage-embedding-provider.ts` | Voyage 호출(지키는 fetch 8 MiB, 시간 제한 신호, 오류 분류, 응답 검사) |
| `api/src/published-index/synthetic-embedding-provider.ts` | 결정적 1024차원 단위 벡터(개발·시험 전용) |
| `api/src/published-index/chunker.ts` | 사본 모양 검사와 조각 초안(순수 함수) |
| `api/src/published-index/publication-index.entity.ts`, `published-chunk.entity.ts` | U3 소유 두 표 |
| `api/src/published-index/published-index-writer.ts` | C-08 `chunkInTransaction`·`requestReindex` |
| `api/src/published-index/embed-publication-handler.ts` | `EMBED_PUBLICATION` 처리기 만들기 함수 |
| `api/src/published-index/published-search.ts` | C-09 `getIndexState`·`search`, `IndexNotReady`, 공용 상태 판정 `readIndexState` |
| `api/src/published-index/published-index-log.ts` | 로그 사건 7종 타입과 남기는 함수 |
| `api/src/database/migrations/1793257382741-CreatePublishedIndexTables.ts` | 생성 명령으로 만들고 `CREATE EXTENSION IF NOT EXISTS vector`만 손으로 더함 |
| `api/test/published-index/support.cjs` | 시험 자료(발행본 A·B)·기록용 logger·가짜 AiRun·시험용 제공자 |
| `api/test/published-index/*.test.cjs` 6개 | chunker, embedding-provider, published-index-writer, embed-publication-handler, published-search, live-embedding |
| `api/docs/published-index.md` | 기능 문서 |

고친 것

| 파일 | 내용 |
|---|---|
| `api/test/db/member-cascade-delete.test.cjs` | 회원 자료에 U3 두 표 행을 더하고 연쇄 삭제 대상 표에 넣음 |
| `api/test/integration/result-application-b.test.cjs` | 격리 스키마 마이그레이션 시험: 목록 끝에 U3 마이그레이션, 표 개수 23→25, U3 되돌리기 확인, 검색 경로에 `public` 추가와 표 존재 확인의 스키마 한정(아래 「계획과 다른 점」) |
| `api/docs/member-withdrawal-deletion.md` | 삭제 규칙 표에 `publication_index`·`published_chunk` 행 |
| `api/CONVENTIONS.md` | 「파일 역할」 표에 `src/published-index/` 행 |

`api/.env.example`은 확인만 했다. `CATCHU_EMBEDDING_API_KEY` 설명("일반 개발·시험은 합성 제공자로 돌리므로 비워 둡니다")이 이 Unit 동작과 맞아 고치지 않았다. 배포 설정·CI·Dockerfile은 고치지 않았다(Step 10 해당 없음).

## Voyage 확인 결과

2026-10-29 Voyage 공식 문서(Embeddings API 참조, Text Embeddings 모델 표, FAQ)로 확인했다. 설계와 다른 값은 없어 그대로 진행했다.

| 항목 | 문서 내용 | 설계와 비교 |
|---|---|---|
| 주소 | `POST https://api.voyageai.com/v1/embeddings` | 같음 |
| 모델 이름 | `voyage-4-lite`(권장 모델 목록에 있음) | 같음 |
| 차원 | voyage-4-lite `output_dimension` 2048·1024(기본)·512·256 | 1024 지원 |
| 입력 종류 | `input_type`: `null`(기본)·`query`·`document` | `document`·`query` 그대로 |
| 요청 칸 | `input`(문자열 또는 문자열 배열), `model`, 선택 `input_type`·`truncation`(기본 true)·`output_dimension`·`output_dtype`·`encoding_format` | U3은 `input`·`model`·`input_type`·`output_dimension`만 보냄 |
| 한 번 호출 상한 | 글 목록 최대 1,000개, 토큰 합 voyage-4-lite 1M | 128개 묶음은 안에 든다(조각 1,000자 × 128 ≪ 1M 토큰) |
| 문맥 길이 | voyage-4-lite 32,000 토큰 | 조각 1,000자라 넘지 않음 |
| 응답 칸 | `object: "list"`, `data[].object/embedding/index`, `model`, `usage.total_tokens` | 같음 |
| 자료 보존·학습 | Voyage 호스팅에서는 조직 관리자(결제 수단 등록)가 대시보드 Organization → Terms of Service에서 학습 사용을 거부(opt-out)할 수 있고, 거부하면 자료를 보존하지 않는다(zero-day retention). 거부 뒤에는 대시보드에서 다시 동의로 돌릴 수 없다 | 설계가 미결로 둔 항목. **실제 키를 쓰기 전에 팀장(키 발급 담당)이 계정의 opt-out 여부를 확인해야 한다**(아래 Issues) |

질문 글은 `truncation` 기본값(true)으로 보낸다. 질문이 32,000 토큰을 넘으면 Voyage가 잘라서 임베딩한다. 질문 길이 상한은 요구사항에 없어 두지 않았다(security-design 「입력 검증」).

TypeORM 1.1.1은 PostgreSQL `vector` 칼럼(`{ type: 'vector', length: 1024 }`)을 지원한다. 생성 명령이 `"embedding" vector(1024)`를 그대로 만들었고 마이그레이션을 손으로 고칠 필요는 없었다(확장 줄만 더함).

## 주요 결정

- **실제 AiRun 타입을 쓴다.** 처리기는 `AiRunHandler`를 돌려주고, 기록기는 `Pick<AiRun, 'enqueueAfterCommit'>`를 받는다(`import type`이라 bullmq·ioredis를 불러오지 않음). 시험은 `registerHandler`·`enqueueAfterCommit`만 가진 기록용 가짜를 넘긴다. 앱 모듈 등록·`registerHandler` 호출은 넣지 않았다(통합 PR 몫, 문서에 적음).
- **상태 판정 하나를 함께 쓴다.** `readIndexState(manager, publicationId, now)`(published-search.ts)를 `getIndexState`·`search`·`requestReindex`가 쓴다. 행 없음 → FAILED, `readStatus`로 판정, 시한 지난 PENDING은 공용 `persistDeadlineFailure`로 저장.
- **처리기 저장은 U3 설계대로.** 공용 `saveRunResult` 대신 `SELECT … FOR UPDATE` 다시 확인 → `unnest` 한 문장 갱신(갱신 수가 다르면 되돌리고 던짐) → DONE. 버림 이유는 `NO_INDEX`·`NOT_PENDING`·`DEADLINE_PASSED`·`PARENT_GONE`.
- **조각 0개도 같은 저장 경로.** 계획은 "조건부 UPDATE로 DONE"이라 적었다. 저장 트랜잭션(행 잠금 + PENDING·마감 전 확인 + DONE)을 그대로 쓰면 같은 조건부 결과이고 버림 이유도 정확히 남아 그렇게 했다. 제공자는 부르지 않는다.
- **제공자 실패 때 이미 PENDING이 아니면** FAILED로 덮지 않고(조건부 UPDATE 바뀐 행 0) `EMBED_PUBLICATION_DISCARDED`(`NOT_PENDING`)로 남긴다.
- **처리기도 벡터 모양을 검사한다.** 제공자가 개수·차원·유한한 수가 맞지 않는 벡터를 주면 `INVALID_RESPONSE` 제공자 실패로 본다(BR2.3). 검색의 질문 벡터도 같다. Voyage 제공자는 응답 단계에서 이미 검사하지만 경계 뒤 제공자가 바뀌어도 DB에 이상한 값이 들어가지 않게 했다.
- **`chunkInTransaction`은 트랜잭션 안 manager만 받는다.** `manager.queryRunner?.isTransactionActive`가 아니면 바로 예외(BR1.7 "트랜잭션 안에서만"). 같은 발행본을 두 번 나누면 기본 키·유일 제약으로 실패한다.
- **본문 읽기 시간 제한.** `AbortSignal.timeout`을 fetch의 `init.signal`로 넘기고, 본문 읽기는 fetch가 같은 신호로 끊는 동작에 맡긴다(security-design ④). 시험용 fetch도 실제 fetch처럼 신호가 끊기면 본문 스트림을 실패시킨다.
- **2xx가 아닌 응답의 본문 버리기 실패는 무시한다.** 버리기(cancel) 실패가 결과(`API_STATUS`)를 바꾸지 않게 `.catch(() => undefined)`로 두고 주석을 달았다.
- **토큰 수 칸이 없거나 이상하면 0.** 로그 전용 값이라 응답 실패로 보지 않는다.
- **키는 닫힌 변수에만.** Voyage 제공자 객체(`Object.freeze`)는 `embedDocuments`·`embedQuery` 두 함수만 갖는다. 설정 객체 `EmbeddingConfig`는 키를 갖고 있으므로 로그에 넣지 않는다고 주석에 적었다.

## 계획과 다른 점

1. **파일 하나 추가: `embedding-types.ts`.** 계획은 경계 타입·`EmbeddingProviderError`를 `embedding-provider.ts`에 둔다고 했다. 그러면 `embedding-provider.ts`(만들기 함수, Voyage 제공자를 불러옴)와 `voyage-embedding-provider.ts`(오류 클래스를 불러옴)가 서로 불러오는 고리가 생겨, 타입·오류를 `embedding-types.ts`로 옮기고 `embedding-provider.ts`가 다시 내보내게 했다. `embedding-provider.ts`에서 가져다 쓰는 사용법은 그대로다.
2. **만들기 함수 셋째 인자는 선택 객체.** 계획의 `createEmbeddingProvider(config, env, fetch?)`를 `createEmbeddingProvider(config, env, { fetch?, documentTimeoutMs?, queryTimeoutMs?, logger? })`로 했다. 단위 시험 안내가 "시간 제한은 제공자 만들기 함수의 선택 인자로 받는다"고 해 인자가 늘었고, 인자를 셋으로 유지하려고 묶었다.
3. **`result-application-b.test.cjs` 수정 범위.** 계획은 목록·표 개수·U3 되돌리기 한 줄만 고친다고 했다. 실제로 돌려 보니 이 격리 스키마 시험은 `search_path=<격리 스키마>`만 써서 `public`에 설치된 pgvector의 `vector` 형식을 찾지 못해 U3 마이그레이션이 `type "vector" does not exist`로 실패했다. 그래서 (a) 검색 경로를 `<격리 스키마>,public`으로 바꾸고, (b) 그러면 `to_regclass('표')`가 `public`의 같은 이름 표를 찾게 되므로 표 존재 확인 11곳을 격리 스키마로 한정한 도우미 `regclass(name)`로 바꿨다. 확인하는 내용(어느 표가 언제 사라지는지)은 그대로이고, `vector` 확장이 U3 되돌리기 뒤에도 남는 것(1개)을 더 확인한다. 다른 격리 시험(`E 수신 기록 …` 시험, `test/support/catch-db-fixture.cjs`를 쓰는 시험)은 U3 마이그레이션을 쓰지 않아 고치지 않았고 전체 시험에서 통과했다.
4. **마이그레이션 생성 DB.** 개발 DB 컨테이너(`catchu-db`)가 이 컴퓨터에 없어, `migration:generate`·`run`·`revert`·`run`을 셸 환경변수 `DB_*`로 테스트 DB(`catchu_test`, 모든 마이그레이션 적용 상태)에 대고 돌렸다. 생성 SQL에는 U3 두 표 외의 변경·`DROP`이 없었다. 테스트 DB에는 U3 마이그레이션이 적용된 상태로 남아 있다(실행기가 다음 실행 때 그대로 쓴다).
5. **처리 시한 FAILED 저장의 `updated_at`.** 계획대로 공용 `persistDeadlineFailure`(C-02)를 써서, 시한으로 FAILED가 될 때는 `updated_at`이 바뀌지 않는다(엔티티 설명 "상태를 쓸 때마다 그 시각"과 다름). 공용 도우미를 고치지 않으려고 그대로 두고 기능 문서 「알려진 한계」에 적었다.

## 시험 결과

환경: macOS, Node 24.21.0, npm 11.19.0, 테스트 DB `pgvector/pgvector:0.8.7-pg16-trixie`(127.0.0.1:5433, 이미 떠 있었음). `api/node_modules`가 없어 `npm ci`로 잠금 파일 그대로 설치했다(새 의존성 없음).

| 명령 | 결과 |
|---|---|
| 착수 확인 `npm --prefix api test -- test/db/publication-tables.test.cjs` | 통과 5/5 |
| 변경 전 기준선 `npm --prefix api test` | 통과. 첫째 줄 1,370개(통과 1,345·건너뜀 25·실패 0), 둘째 줄 35개 통과, build-output 1개 통과 |
| U3 명령(단위 시험 안내의 8개 파일) | 73개: 통과 72·실패 0·건너뜀 1(S12) |
| U3 줄 커버리지 `TEST_COVERAGE_INCLUDE='dist/published-index/**' … test:coverage -- <8개 파일>` | **줄 97.23%**·분기 93.79%·함수 94.29%(하한 80% 충족) |
| `npm --prefix api run lint` | 통과 |
| `npm --prefix api run typecheck` | 통과 |
| 변경 뒤 전체 `npm --prefix api test` | 통과(종료 코드 0). 첫째 줄 1,420개(통과 1,394·건너뜀 26·실패 0), 둘째 줄 35개 통과, build-output 1개 통과. 늘어난 50개는 U3 새 시험이고 건너뜀 1개 증가는 S12 |

파일별(U3 명령 안): chunker 9, embedding-provider 12, published-index-writer 9, embed-publication-handler 13, published-search 6, live-embedding 1(건너뜀), member-cascade-delete 4, result-application-b 19.

시나리오별:

| ID | 결과 | 시험 |
|---|---|---|
| S1 | 통과(합성) | published-index-writer, chunker |
| S2 | 통과(합성) | published-index-writer, chunker |
| S3 | 통과(시험용 제공자) | embed-publication-handler |
| S4 | 통과(시험용 제공자) | embed-publication-handler |
| S5 | 통과 | embed-publication-handler |
| S6 | 통과 | embed-publication-handler |
| S7 | 통과(기록용 AiRun) | published-index-writer |
| S8 | 통과(글→벡터 표 제공자) | published-search |
| S9 | 통과 | published-search |
| S10 | 통과 | published-search |
| S11 | 통과 | published-index-writer, member-cascade-delete |
| S12 | **미실행(키 없음)** | live-embedding |

S1~S11은 테스트 DB와 시험용·합성 임베딩 제공자, 기록용 AiRun으로 통과한 것이다. 실제 Voyage 임베딩이나 실제 큐 처리 성공이 아니다(team.md Walking Skeleton).

미커버 줄: `published-index-writer`의 `readPdfPages`(PDF 항목이 있을 때만 `published_pdf_page`를 읽는 경로. 표가 U8에서 생기기 전이라 DB 시험 불가), 처리기의 외래 키 오류(23503) 버림 분기(행 잠금으로 실제로는 생기기 어려운 방어 분기), 기본 Nest logger 만들기 함수(시험은 기록용 logger를 넘김).

## 실행하지 않은 시험과 이유

- `api/test/published-index/live-embedding.test.cjs`(S12): 이 셸에 `CATCHU_EMBEDDING_API_KEY`가 없어 `skip`으로 건너뜀. 통과로 보고하지 않는다. '최소 연결 첫 결과'(team.md Walking Skeleton) 승인 자료는 키를 가진 사람이 `CATCHU_EMBEDDING_API_KEY=… npm --prefix api test -- test/published-index/live-embedding.test.cjs`로 돌려 얻어야 한다.
- PDF 항목의 DB 통합 경로(`published_pdf_page` 읽기): 표가 U8에서 생기기 전이라 시험을 쓰지 않았다. PDF 조각 나누기는 chunker 순수 시험으로만 확인했다. U8 표가 들어오면 S1에 PDF 항목을 더하는 일은 U8 쪽 통합 시험으로 넘긴다(계획대로).
- CI 실행: 이 단계에서 커밋·PR을 하지 않아 CI에서 돌지 않았다. 새 시험은 `api/test/` 아래 `.test.cjs`라 기존 `npm test`·CI가 그대로 찾는다.

## Assumptions & Open Questions

- [assumption] 통합 브랜치의 U4 사본 모양은 `api/src/publications/published-snapshot.ts`(C-07)와 같다. 조각 나누개는 그 모양을 실제 값에서 다시 검사한다.
- 미결: Voyage 계정의 학습 사용 거부(opt-out) 여부. 문서상 거부는 조직 관리자가 대시보드에서 하며 되돌릴 수 없다. 실제 키를 S12나 배포에 쓰기 전에 키 발급 담당(팀장)이 확인해야 한다.
- 통합 PR에서 할 일: Nest 모듈 등록, `registerHandler('EMBED_PUBLICATION', …)`, 기동 때 키 판정. 그 전에 배포 환경 키(SSM)와 RDS pgvector 확장(팀장 공용 기반).
