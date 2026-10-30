# U3 발행본 색인·검색 — 코드 생성 계획

## Summary

- Builds: 발행 트랜잭션 안의 조각 나누기, Voyage 임베딩 작업 처리기, 색인 상태·[검색 다시 준비], 발행본 하나 안의 의미 검색(api `published-index`)
- Touches: `api/src/published-index/`(새 폴더), 새 마이그레이션 1개, `api/test/published-index/`(새 폴더), `api/test/db/member-cascade-delete.test.cjs`, `api/test/integration/result-application-b.test.cjs`, `api/docs/published-index.md`(새), `api/docs/member-withdrawal-deletion.md`, `api/CONVENTIONS.md`
- Tests: `node:test` 시험 파일 6개, 약 45개(순수 함수·전송 시험 약 20개, 테스트 DB 통합 시험 약 25개, 실제 Voyage 시험 1개는 키가 있을 때만)

## Sources

작성일: 2026-10-29. 입력: [기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W1~W5·「주요 시나리오와 확인」 S1~S12, [업무 규칙](../functional-design/rules.md)(rules) BR1~BR6, [엔티티](../functional-design/entities.md)(entities), [비기능 설계](../nfr-design/)의 performance-design·security-design·reliability-design·observability-design·scalability-design·logical-components, [기술 선택](../nfr-requirements/tech-stack-decisions.md), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-06·C-07·C-08·C-09, [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U3, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR4.7·FR6.2·FR6.3·FR6.4·FR6.8·FR14.8·FR14.10·NFR1·NFR2. 현재 코드: 통합 브랜치 `intent/260925-intent-12`(fd1b465)의 `api/src/ai-run/`(U2 AiRun, #423), `api/src/publications/`(U4 발행본 표, #422), `api/src/ai-generation/guarded-fetch.ts`(U1), `api/src/common/node-env.ts`, `api/CONVENTIONS.md`, `api/scripts/test-with-db.cjs`.

## 구현 범위와 스토리 대응

| 스토리 | U3이 맡는 부분 | 계획 단계 |
|---|---|---|
| US4.1 발행 때 조각 나누기 | 발행 트랜잭션 안의 조각·위치 확정, 실패면 발행 실패(AC4.1.1·AC4.1.8) | Step 3·5·6 |
| US6.2 색인 상태·의미 검색 | 임베딩 작업, 색인 상태, [검색 다시 준비], 발행본 하나 안의 의미 검색(AC6.2.1·AC6.2.3·AC6.2.7) | Step 4·6·7·8 |
| (공통) 탈퇴·삭제 | 두 표의 연쇄 삭제(C-06, FR14.8·FR14.10) | Step 2·9 |

계약 C-08 `PublishedIndexWriter`·C-09 `PublishedSearch`의 함수 이름·인자·반환·오류는 계약 그대로 둔다. 화면·HTTP 경로·링크 조건 판정은 U3에 없다(functional-spec 「범위」).

## 현재 코드에서 정한 것 (설계 뒤 바뀐 사실)

- **AiRun이 이미 있다.** 설계 때는 U2 `AiRun`이 없어 합성 AiRun으로 개발한다고 적었지만(functional-spec 「Assumptions」), 지금 통합 브랜치에는 `api/src/ai-run/`(#423)이 있다. 처리기와 `requestReindex`는 실제 `AiRunHandler`·`AiRunJob` 타입과 `readStatus`·`persistDeadlineFailure`(C-02 공용 도우미)를 쓰고, 시험에서는 `registerHandler`·`enqueueAfterCommit`만 가진 기록용 가짜를 넘긴다. 앱 모듈 등록·`registerHandler` 호출은 설계대로 이번 PR에 넣지 않고 통합 PR로 따로 낸다(logical-components 「통합 때 할 일」, 비기능 설계 Q1). 저장은 공용 `saveRunResult` 대신 U3 설계의 `SELECT … FOR UPDATE` 다시 확인과 U3 로그 사건을 쓴다(reliability-design NFR5.2, observability-design).
- **`published_pdf_page` 표가 아직 없다.** U8(후순위)이 만든다. 그래서 PDF 쪽 조각 나누기는 순수 함수 시험으로만 확인하고, DB 통합 시험 S1의 발행본 A는 Catch 1개와 텍스트 자료 1개로 만든다. `chunkInTransaction`은 그 발행본에 PDF 항목이 있을 때만 `published_pdf_page`를 읽는다. U8이 표를 만들기 전에는 PDF 항목을 발행할 수 없으므로(C-17 선행 조건) 지금 동작에는 영향이 없다. U8 표가 들어오면 S1에 PDF 항목을 더하는 일은 U8 쪽 통합 시험으로 넘긴다.
- **Voyage 확인 결과는 code-summary에 적는다.** functional-spec·tech-stack-decisions는 확인 결과를 그 문서의 「Assumptions & Open Questions」에 적으라고 했지만, 두 문서는 이미 승인·검토가 끝난 설계 산출물이라 고치지 않고 이번 단계의 `code-summary.md` 「Voyage 확인 결과」에 적는다. 확인한 값이 설계(모델 `voyage-4-lite`·1024차원·묶음 128)와 다르면 코드를 쓰기 전에 멈추고 묻는다.

## 파일 배치

모두 `api/src/published-index/`에 둔다(tech-stack-decisions, C-08·C-09 자리).

| 파일 | 내용 |
|---|---|
| `embedding-config.ts` | 상수(모델·차원·주소·시간 제한·묶음 크기·본문 상한·처리 시한 10분·조각 최대 길이 1,000)와 `readEmbeddingConfig(env)` |
| `embedding-provider.ts` | `EmbeddingProvider` 경계, `EmbeddingProviderError`(실패 종류·HTTP 상태만), `createEmbeddingProvider(config, env, fetch?)` |
| `voyage-embedding-provider.ts` | Voyage 호출 하나(지키는 fetch 8 MiB, 시간 제한 신호, 오류 분류, 응답 검사) |
| `synthetic-embedding-provider.ts` | 같은 글에 같은 1024차원 단위 벡터를 주는 결정적 구현(개발·시험 전용) |
| `chunker.ts` | 사본 모양 검사와 조각 초안 만들기(순수 함수, BR1.1~BR1.6·BR1.9·BR1.10) |
| `publication-index.entity.ts`, `published-chunk.entity.ts` | U3 소유 두 표(entities.md) |
| `published-index-writer.ts` | `PublishedIndexWriter`: `chunkInTransaction`, `requestReindex`(C-08) |
| `embed-publication-handler.ts` | `EMBED_PUBLICATION` 처리기 만들기 함수(C-02) |
| `published-search.ts` | `PublishedSearch`: `getIndexState`, `search`, `IndexNotReady`(C-09) |
| `published-index-log.ts` | 로그 사건별 칸만 가진 타입과 남기는 함수(observability-design 표) |

Nest 모듈·`AppModule` 등록은 만들지 않는다. 시험과 통합 PR이 만들기 함수(`createPublishedIndexWriter`·`createEmbedPublicationHandler`·`createPublishedSearch`)로 직접 만든다(logical-components).

## 단계

### Step 1: 착수 확인 — Voyage 공식 문서와 기존 시험 실행기 (기준: NFR2.1, tech-stack-decisions 미결)

- [x] Voyage 공식 문서(docs.voyageai.com의 Embeddings API·모델 표·Data usage/privacy)에서 확인한다: 모델 이름 `voyage-4-lite`, `output_dimension` 1024 지원, `input_type` 값(`document`·`query`), 한 번 호출의 글 개수·토큰 상한(128개 묶음이 안에 드는지), 응답 칸(`data[].embedding`·`data[].index`·`usage.total_tokens`), 자료 보존·학습 사용 조건. 결과를 Step 11의 code-summary 「Voyage 확인 결과」에 적는다. 설계와 다르면 여기서 멈추고 담당자에게 묻는다(코드 착수 전).
- [x] 설치된 TypeORM(1.1.1)이 PostgreSQL `vector` 칼럼 타입(`{ type: 'vector', length: 1024 }`)을 지원하는지 확인한다. 지원하지 않으면 엔티티에서 그 칼럼을 빼지 않고 마이그레이션을 손으로 고치는 방법을 Step 2에서 정하고 code-summary에 적는다. 새 의존성은 더하지 않는다(tech-stack-decisions 「의존성」).
- [x] 시험 실행기 확인: 테스트 DB(README 「DB 테스트」의 pgvector 이미지, 5433)를 띄우고 `unit-test-instructions.md`의 U3 명령이 지금 상태에서 돈다는 것을 확인한다(아직 U3 시험 파일이 없으면 기존 `test/db/publication-tables.test.cjs` 하나로 실행기·마이그레이션 적용을 확인).

### Step 2: 저장 — 엔티티와 마이그레이션 (US4.1·US6.2, entities.md, C-06·C-07, NFR5.1)

- [x] `publication-index.entity.ts`: `publication_index`(publication_id PK·FK → publication ON DELETE CASCADE, status varchar CHECK IN ('PENDING','DONE','FAILED'), deadline_at·updated_at timestamptz NOT NULL). `inValues`·`deleteWithParent`·CONVENTIONS 「DB 물리 규약」을 따른다.
- [x] `published-chunk.entity.ts`: `published_chunk`(chunk_id uuid PK, publication_id, published_item_id, seq integer >= 1, field_path text, char_start >= 0, char_end > char_start AND char_end - char_start <= 1000, pdf_page integer NULL >= 1, source_kind CHECK IN ('GITHUB_RECORD','AUTHOR_MATERIAL'), text text NOT NULL, catch_evidence_urls text[] NOT NULL DEFAULT '{}', embedding vector(1024) NULL). `unique(publication_id, seq)`, 복합 외래 키 `(publication_id, published_item_id) → published_item(publication_id, published_item_id) ON DELETE CASCADE`(C-06).
- [x] `npm run migration:generate -- src/database/migrations/CreatePublishedIndexTables`로 만들고, 맨 앞에 `CREATE EXTENSION IF NOT EXISTS vector`를 손으로 더한다(`down`에서는 지우지 않음, CONVENTIONS). 생성 SQL에 다른 표 변경·의도하지 않은 DROP이 없는지 읽는다. `migration:run`·`migration:revert`·다시 `migration:run`으로 `down`까지 확인한다.

### Step 3: 업무 규칙 — 조각 나누개 (US4.1, BR1.1~BR1.6·BR1.9·BR1.10, NFR1.2)

- [x] `chunker.ts`: 항목(`publishedItemId`·`position`·`itemKind`·`snapshot`·PDF 쪽 목록)을 받아 `ChunkDraft[]`를 돌려주는 순수 함수. 사본 모양이 C-07과 다르면 예외(문자열이 아닌 필드, 배열이 아닌 `workFacts` 등, BR1.7). CATCH 필드 순서·TEXT `body`·PDF 읽을 수 있는 쪽만(BR1.1·BR1.5), `aiDraft`·제목·`mismatch`·`sourceRevision`은 고르지 않는다.
- [x] 필드 나누기(BR1.3·BR1.4): 1,000 이하 한 범위, 넘으면 빈 줄 문단 → 줄 → 1,000자 자리(대리쌍 가운데면 한 칸 앞), 앞뒤 공백 범위 제외, 빈 범위 버림. 글은 `field.slice(charStart, charEnd)` 그대로이고 저장 전 같음을 검사한다(BR1.2).
- [x] 출처 종류(BR1.6), CATCH 조각의 `catchEvidenceUrls` = 사본 `evidence[].sourceUrl` 순서대로, 그 밖 빈 배열(BR1.10). 항목 position → 필드 순서 → 필드 안 위치로 정렬해 돌려준다(BR1.9; seq는 기록기가 매긴다).

### Step 4: 외부 호출 — 설정·임베딩 제공자 (US6.2, BR2.3·BR5.3·BR6.1·BR6.2, NFR1.3·NFR2.1~NFR2.3·NFR4.1·NFR6.3)

- [x] `embedding-config.ts`: `readEmbeddingConfig(env)`는 `CATCHU_EMBEDDING_API_KEY`만 읽고 앞뒤 공백을 뺀 빈 값은 키 없음으로 본다. 상수: `VOYAGE_EMBEDDINGS_URL`(코드 상수), 모델·차원 1024, 시간 제한 문서 30초·질문 10초, 묶음 128, 응답 본문 상한 8 MiB, 처리 시한 10분, 조각 최대 1,000.
- [x] `embedding-provider.ts`: `EmbeddingProvider`(`embedDocuments(texts) → { vectors, totalTokens }`, `embedQuery(text) → { vector, totalTokens }`), `EmbeddingProviderError`(종류 `REDIRECT_REJECTED`·`RESPONSE_TOO_LARGE`·`TIMEOUT`·`CONNECTION_FAILED`·`API_STATUS`·`INVALID_RESPONSE`, `httpStatus`, 종류별 고정 문구). `createEmbeddingProvider(config, env, fetch?)`는 security-design 판정표대로(키 있음 → Voyage, 키 없음 + `isDevelopmentOrTest` → 합성 + `EMBEDDING_PROVIDER_SYNTHETIC` 경고 한 줄, 그 밖 → 키 값 없는 오류).
- [x] `voyage-embedding-provider.ts`: `createGuardedFetch(baseFetch, 8 MiB)`, `AbortSignal.timeout`을 `init.signal`로, 요청 보내기부터 본문 읽기·응답 검사까지 try/catch 하나로 묶어 security-design 「오류 분류」표대로 바꾼다. 2xx가 아니면 본문을 읽지 않고 취소한다. 요청 본문은 Step 1에서 확인한 칸 이름으로 `input`(글 배열 또는 질문 하나)·모델·입력 종류·차원만. 키는 `Authorization: Bearer` 머리글에만 두고, 제공자 객체는 키를 내보내는 속성·`toString`을 두지 않는다. 응답 개수·`index`·차원·유한한 숫자를 검사한다.
- [x] `synthetic-embedding-provider.ts`: 글의 SHA-256으로 만든 결정적 1024차원 단위 벡터, `totalTokens` 0.

### Step 5: 저장소 접근 — 색인 기록기 (US4.1·US6.2, W1·W4, BR1.7·BR1.8·BR3.1·BR4.1·BR4.2, NFR2.4·NFR4.3)

- [x] `published-index-writer.ts`의 `chunkInTransaction(manager, publicationId, now)`: 넘겨받은 manager로만 `published_item`을 position 순으로 읽고(PDF 항목이 있을 때만 `published_pdf_page`), 조각 나누개로 초안을 만들어 seq 1부터 `published_chunk`에 쓴다(embedding 없음). `publication_index`를 PENDING·`deadline_at = now + 10분`·`updated_at = now`로 쓴다(조각 0개여도). 외부 호출·큐 호출이 없다. 실패는 모두 그대로 던진다(CONVENTIONS 「트랜잭션 규약」).
- [x] `requestReindex(publicationId, now)`: `getIndexState`와 같은 판정(시한 지난 PENDING은 `persistDeadlineFailure`로 FAILED 저장)으로 FAILED가 아니면(행 없음 포함) `NOT_FAILED`. FAILED면 `status = 'FAILED'` 조건부 UPDATE로 PENDING·새 마감·updated_at을 쓰고, 바뀐 행 0개면 `NOT_FAILED`. 커밋 뒤 `aiRun.enqueueAfterCommit('EMBED_PUBLICATION', 'EMBED_PUBLICATION-{publicationId}-{randomUUID()}', { publicationId })`. `ENQUEUE_FAILED`여도 `REQUEUED`를 돌려주고 `PUBLISHED_REINDEX` 로그(등록 실패면 warn). 조각은 다시 나누지 않고 `DailyRunLimit`을 부르지 않는다.

### Step 6: 업무 로직 — 임베딩 작업 처리기 (US6.2, W2, BR2.1~BR2.6, NFR4.1·NFR4.2·NFR4.5·NFR5.2·NFR5.3·NFR6.2)

- [x] `embed-publication-handler.ts`의 `createEmbedPublicationHandler({ dataSource, provider, clock?, logger? })`가 `AiRunHandler`를 돌려준다. 시작 때 색인 행을 트랜잭션 없이 읽어 없음·PENDING 아님·마감 지남이면 버림(마감 지난 PENDING은 `persistDeadlineFailure`로 FAILED 저장). 조각을 seq 순으로 읽고 0개면 조건부 UPDATE로 DONE.
- [x] 128개 묶음을 차례로 `embedDocuments`에 보낸다(동시 전송 없음). `EmbeddingProviderError`면 그 자리에서 멈추고 `status = 'PENDING'`일 때만 FAILED, `EMBED_PUBLICATION_FAILED` 경고, 정상 종료(다시 시도 없음).
- [x] 모두 받으면 짧은 트랜잭션 하나: 색인 행 `SELECT … FOR UPDATE` → PENDING·마감 전 확인 → `unnest`로 조각 벡터를 한 문장에 갱신 → 갱신 수가 읽은 조각 수와 다르면 되돌리고 던짐 → DONE → 커밋. 조건이 맞지 않거나 외래 키 오류(`23503`)면 아무것도 쓰지 않고 `EMBED_PUBLICATION_DISCARDED`. 그 밖의 예기치 못한 오류는 `EMBED_PUBLICATION_ERROR`를 남기고 던진다(상태는 마감 판정에 맡김). 외부 호출 중에는 트랜잭션을 열어 두지 않는다(performance-design 「트랜잭션 경계」).

### Step 7: 업무 로직 — 색인 상태·의미 검색 (US6.2, W3·W5, BR3.1~BR3.3·BR5.1~BR5.8, NFR1.1·NFR4.3·NFR4.4)

- [x] `published-search.ts`의 `createPublishedSearch({ dataSource, provider, logger? })`. `getIndexState(publicationId, now)`: 행 없음 → FAILED, `readStatus`로 판정하고 시한 지난 PENDING은 `persistDeadlineFailure`로 저장.
- [x] `search(publicationId, query, limit)`: 순서대로 limit 정수 1~50 검사(아니면 `RangeError` 계열 인자 오류) → 상태가 DONE이 아니면 `IndexNotReady` → `publicationText`(seq 순 조각 글을 줄바꿈 하나로) → 빈·공백 질문이면 `{ hits: [], publicationText }` → `embedQuery` 한 번(실패면 `PUBLISHED_SEARCH_FAILED` 경고 뒤 그대로 던짐) → `embedding <=> $2::vector` 거리로 `ORDER BY distance, seq LIMIT $3`, `WHERE publication_id = $1`만. `score = 1 - distance`, `catchEvidenceUrls`는 조각 칸 그대로, `published_item`은 읽지 않는다. 함수 설명에 "호출자는 C-10 판정을 통과한 뒤에만 부른다"를 적는다.
- [x] `published-index-log.ts`: 사건 7종(observability-design 표)의 칸만 가진 타입과 Nest `Logger`에 객체 하나로 남기는 함수.

### Step 8: 시험 — 시나리오 먼저, 세부 시험은 구현 뒤 (팀 Testing Posture, functional-spec S1~S12)

functional-spec 「주요 시나리오와 확인」의 S1~S12와 기대 결과·실패 조건이 시나리오 정본이다. Step 3~7을 구현한 뒤 아래 시험 코드를 쓰고 돌린다. 시험 자료는 모두 공개 가능한 합성 글이다.

- [x] `api/test/published-index/chunker.test.cjs`(순수): 「조각 나누기 예」의 Catch 6조각·텍스트 3조각(600·300·900·700자 문단)·1,500자 줄 2조각·대리쌍 경계·PDF 2·3쪽 중 읽을 수 있는 쪽만, aiDraft·제목 글이 어떤 조각에도 없음, 모든 조각 "필드 [charStart, charEnd) = text"와 길이 1,000 이하, 공백만 있는 필드는 조각 없음, 사본 모양 오류는 예외(S1·S2의 순수 부분).
- [x] `api/test/published-index/embedding-provider.test.cjs`(시험용 fetch): 주소가 상수와 같음, 요청 본문 칸(문서·질문), 키가 머리글에만 있음, redirect → `REDIRECT_REJECTED`, 256 KiB 초과·8 MiB 이하 응답 성공, 본문 도중 8 MiB 초과 → `RESPONSE_TOO_LARGE`, 본문을 천천히 흘리는 응답 → `TIMEOUT`, 보낸 글을 담은 400 응답 → `API_STATUS`이고 그 글이 오류 메시지에 없음, 개수·차원·비유한 숫자 → `INVALID_RESPONSE`, 전송 오류 → `CONNECTION_FAILED`, 제공자 만들기 판정표 3행(키·`NODE_ENV`)과 합성 경고 로그 한 줄, 합성 제공자 결정성.
- [x] `api/test/published-index/published-index-writer.test.cjs`(테스트 DB): S1(발행본 A = Catch 1개 + 텍스트 자료 1개, aiDraft 있음 / 트랜잭션 안 조각·순서·출처 종류·위치·근거 URL·색인 행 PENDING과 마감, 제공자·AiRun 호출 0회), S2(모양 오류 항목 → 예외, 되돌린 뒤 조각·색인 행 0개), S7(FAILED·PENDING·DONE·마감 지난 PENDING·행 없음에 `requestReindex` / FAILED와 마감 지난 PENDING만 REQUEUED·새 마감·runKey 형식(콜론 없음, `isValidRunKey`) 등록 1회, 나머지 NOT_FAILED 등록 0회, 등록 실패여도 REQUEUED), S11(발행본 삭제 → 두 표 행 0개).
- [x] `api/test/published-index/embed-publication-handler.test.cjs`(테스트 DB, 시험용 제공자): S3(모든 조각 1024차원·DONE·문서용 입력·묶음 수 = ceil(조각 수/128), 129개 조각으로 묶음 2개 확인), S4(두 번째 묶음 실패 → FAILED·벡터 0개·다시 호출 없음·처리기는 던지지 않음), S5(마감 지난 PENDING → 처리기가 아무것도 쓰지 않음), S6(처리 전 발행본 삭제 → 오류 없이 끝남), 조각 0개 → 제공자 호출 없이 DONE, 저장 직전 상태가 바뀐 경우(제공자 호출 중에 FAILED로 바꿈) → 버림, 로그 칸 이름이 표와 같고 조각 글·키가 로그에 없음.
- [x] `api/test/published-index/published-search.test.cjs`(테스트 DB, 글→벡터 표 제공자): S8(A·B 모두 DONE, A 검색 → A 조각만 점수순 limit개·ChunkHit 칸·근거 URL·publicationText에 aiDraft 없음, 같은 점수는 seq 순), S9(PENDING·FAILED → `IndexNotReady`, 제공자 호출 0회), S10(질문 임베딩 실패 → 제공자 오류 그대로·로그에 질문 글 없음 / limit 0·51·1.5 → 인자 오류·호출 0회 / 공백 질문 → 빈 hits와 publicationText·호출 0회), `getIndexState`(행 없음 → FAILED, 마감 지난 PENDING → FAILED 저장, DONE 그대로).
- [x] `api/test/db/member-cascade-delete.test.cjs`에 U3 두 표의 행을 더한다: 회원을 지우면 그 회원 발행본의 `publication_index`·`published_chunk`가 0개, 다른 회원 행은 그대로(S11, C-06).
- [x] `api/test/published-index/live-embedding.test.cjs`(S12): `process.env.CATCHU_EMBEDDING_API_KEY`가 없으면 `skip`. 있으면 발행본 A를 나누고 실제 Voyage로 임베딩한 뒤 A의 텍스트 자료와 같은 뜻의 질문으로 검색해 DONE과 맞는 조각의 위치를 확인한다. 출력에는 상태·조각 개수·`fieldPath`·`charStart`·`charEnd`만 남긴다(U1 `test/ai-generation/live-citation.test.cjs`와 같은 방식).
- [x] `api/test/integration/result-application-b.test.cjs`의 격리 스키마 마이그레이션 시험을 U3 마이그레이션에 맞춘다(요청 반영). 이 시험은 모든 마이그레이션 이름 목록과 표 개수를 정확히 비교하고 마지막 마이그레이션부터 하나씩 되돌리므로, U3 마이그레이션을 더하면 그대로는 실패한다. 목록 끝에 `CreatePublishedIndexTables…`를 더하고, 표 개수를 23에서 25(`publication_index`·`published_chunk`)로 바꾸고, 되돌리기 순서 맨 앞에 U3 마이그레이션 되돌리기(두 표가 사라지고 나머지는 그대로임을 확인)를 한 줄 더한다. `vector` 확장은 `down`에서 지우지 않으므로 표 개수에 들지 않는다.
- [x] U3 시험 전부와 `member-cascade-delete`·`result-application-b`를 돌리고, `api/src/published-index/` 줄 커버리지 80% 이상을 팀장 공용 명령(`TEST_COVERAGE_INCLUDE`)으로 확인한다. 못 미치면 기준을 낮추지 않고 빠진 경로의 시험을 더한다. `npm run lint`·`npm run typecheck`를 통과시킨다.
- [x] api 전체 시험 `npm --prefix api test`를 돌려 U3 시험뿐 아니라 기존 시험도 모두 통과하는지 확인한다(요청 반영). 마이그레이션 목록·표 개수·연쇄 삭제처럼 표 전체를 보는 다른 시험이 U3 표 추가로 깨지지 않았는지 보는 단계다. 실패하면 U3 변경 때문인지 먼저 가리고, U3 때문이면 고친 뒤 다시 돌린다. 결과는 code-summary에 통과·실패·실행하지 못함으로 적는다.

### Step 9: 설정·문서 (C-06, BR6.1, CONVENTIONS 「파일 역할」)

- [x] `api/docs/member-withdrawal-deletion.md` 표에 `publication_index` | 발행본, `published_chunk` | 발행 항목(발행본을 거쳐) 행과 마이그레이션 이름을 더한다(C-06 「새 표를 만드는 PR」).
- [x] `api/docs/published-index.md`(새 기능 문서): 공개 함수와 호출 순서(U4·U5·U10), 상태 전이, 처리 시한·묶음·시간 제한 값, 키·합성 제공자 판정, 로그 사건, 시험 방법(S12는 키가 있을 때만), 알려진 한계(BR2.6), 앱 미등록과 통합 PR에서 할 일.
- [x] `api/CONVENTIONS.md` 「파일 역할과 모듈 추가 위치」 표에 `src/published-index/` 한 행을 더한다.
- [x] `api/.env.example`은 이미 `CATCHU_EMBEDDING_API_KEY`(#389)가 있으므로 설명이 이 Unit 동작(개발·시험에서 비우면 합성 제공자)과 맞는지만 확인하고, 다르면 설명 줄만 고친다. 배포 설정·CI는 고치지 않는다(팀장 몫, team.md Deployment).

### Step 10: 배포 산출물

- [x] 해당 없음: 새 배포 단위·Dockerfile·IaC 변경이 없다. 배포 DB의 pgvector 확장과 SSM 키는 팀장 공용 기반 작업이다(functional-spec 「다른 Unit에 넘기는 것」).

### Step 11: 정리·추적

- [x] `code-summary.md`: 만든·고친 파일, 주요 결정(위 「현재 코드에서 정한 것」 포함), 「Voyage 확인 결과」, 시험 결과(합성 제공자로 통과한 S1~S11과 S12 통과·미실행을 따로), 실행하지 않은 시험과 이유, 계획과 다른 점.
- [x] `source-manifest.json`: 이 Unit이 만든·고친 모든 경로.
- [x] `traceability.json`: U3이 맡은 AC4.1.1·AC4.1.8·AC6.2.1·AC6.2.3·AC6.2.7, BR1.1~BR6.2, NFR1.1~NFR6.3을 구현·시험 파일에 잇는다. 다른 Unit 몫의 AC는 기능 설계 추적대로 둔다.

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

계약의 단계 순서를 이 계획에 이렇게 맞췄다: 구조·설정 뼈대(Step 2·4의 상수), 실행기 확인(Step 1), 시나리오 먼저(기능 설계 S1~S12가 이미 정함), 구현 뒤 세부 시험(Step 3~7 → Step 8), 설정(Step 9), 문서·추적(Step 9·11). API/endpoint·Frontend 층은 U3에 없다(HTTP 경로·화면 없음). CI는 고치지 않는다. 새 시험은 `api/test/` 아래 `.test.cjs`라 기존 `npm test`와 CI가 그대로 찾는다.

## Assumptions & Open Questions

- [assumption] 통합 브랜치의 U4 `published_item.snapshot` 모양은 `api/src/publications/published-snapshot.ts`와 같고(C-07), U3은 그 타입을 가져다 쓰되 실제 값은 형태를 믿지 않고 검사한다(security-design 「입력 검증」).
- 미결(Step 1에서 닫음): Voyage 모델·차원·입력 종류·묶음 상한·자료 보존 조건, TypeORM `vector` 칼럼 지원.
