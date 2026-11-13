# 발행본 색인·검색 PublishedIndex — 12월 intent U3

발행 사본을 조각으로 나누고(발행 트랜잭션 안), 조각을 Voyage로 임베딩하고(백그라운드 작업), 발행본 하나 안에서 의미 검색을 하는 모듈(`src/published-index/`)이다. 발행(U4)·질의응답(U5)·JD 요약(U10)이 쓴다.

기준 문서: [계약 C-02·C-06·C-07·C-08·C-09](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md), [U3 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/functional-spec.md) W1~W5·[업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/rules.md) BR1~BR6, [U3 비기능 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/nfr-design/). 규칙 ID는 그 문서의 것이다.

## 조립 상태

- `PublishedIndexModule`(`published-index.module.ts`)을 기본 앱(`AppModule`)이 가져온다(#431). api 기동 때 한 번 아래 두 일이 돈다.
  - 임베딩 제공자를 만든다. [키 판정](#키와-합성-제공자-br61)이 여기서 돌므로 **운영(`production`)에서 `CATCHU_EMBEDDING_API_KEY`가 없으면 api가 기동하지 않는다.** 배포 환경에는 키(SSM)와 DB의 pgvector 확장이 먼저 있어야 한다.
  - 모듈 초기화에서 `AiRun.registerHandler('EMBED_PUBLICATION', …)`를 부른다. AiRun은 앱 기동이 끝난 뒤 소비를 시작하므로 첫 작업보다 먼저 등록된다. 큐 주소가 없는 곳(개발 서버)에서는 작업이 큐에 들어가지 않아 색인은 처리 시한으로 FAILED가 된다([AiRun](ai-run.md)).
- 쓰는 Unit(U4·U5·U10)은 자기 모듈 `imports`에 `PublishedIndexModule`을 넣고 `@Inject(PUBLISHED_INDEX_WRITER)`(C-08)·`@Inject(PUBLISHED_SEARCH)`(C-09)로 받는다. Nest는 같은 모듈을 한 번만 만들므로 여러 모듈이 가져와도 판정과 처리기 등록은 한 번이다. U4가 발행 커밋 뒤 부를 `enqueueAfterCommit`은 U4 모듈이 `AiRunModule`을 가져와 같은 AiRun에서 부른다.

## 공개 함수와 호출 순서

| 함수 | 부르는 곳 | 하는 일 |
|---|---|---|
| `createPublishedIndexWriter({ dataSource, aiRun })` → `chunkInTransaction(manager, publicationId, now)` | U4 발행 트랜잭션 안(C-08 publish-sequence 3단계, 비공개 Catch 공개 전환 뒤·커밋 전) | 넘긴 manager로 `published_item`(PDF 항목이 있으면 `published_pdf_page`)을 읽어 `published_chunk`(임베딩 없음)와 `publication_index`(PENDING, 마감 = now + 10분)를 쓴다. 외부·큐 호출 없음. 예외면 U4가 트랜잭션을 되돌린다(발행 실패) |
| (U4) 커밋 뒤 `aiRun.enqueueAfterCommit('EMBED_PUBLICATION', 'EMBED_PUBLICATION-{publicationId}', { publicationId })` | U4 | 첫 임베딩 작업 등록 |
| `requestReindex(publicationId, now)` → `REQUEUED \| NOT_FAILED` | U4 [검색 다시 준비](작성자 확인 뒤) | FAILED일 때만 PENDING·새 마감으로 돌리고 `EMBED_PUBLICATION-{publicationId}-{uuid}`로 다시 등록. 조각은 다시 나누지 않고 하루 실행 제한에 세지 않는다. 등록이 실패해도 `REQUEUED`(시한으로 FAILED 확정) |
| `createEmbedPublicationHandler({ dataSource, provider })` | AiRun(U2)이 작업마다 부름 | 아래 「임베딩 작업」 |
| `createPublishedSearch({ dataSource, provider })` → `getIndexState(publicationId, now)` | U4(버튼 표시)·U5·U10 | `PENDING \| DONE \| FAILED`. 행이 없으면 FAILED. 시한이 지난 PENDING은 FAILED로 저장한다 |
| `search(publicationId, query, limit)` → `{ hits: ChunkHit[], publicationText }` | U5·U10. **C-10 링크 조건 판정을 통과한 뒤에만 부른다** | 그 발행본 조각만 코사인 거리로 정확 비교해 가까운 순 `limit`개. 같은 점수는 조각 순서(seq) |

`search`의 검사 순서: `limit`(1~50 정수가 아니면 `RangeError`) → 상태(DONE이 아니면 `IndexNotReady`) → `publicationText` → 빈·공백 질문이면 `{ hits: [], publicationText }` → 질문 임베딩 한 번(실패면 `EmbeddingProviderError`를 그대로 던짐) → 비교. 앞 검사를 통과해야 Voyage를 부른다.

호출 Unit의 오류 처리: `IndexNotReady`는 `409 INDEX_NOT_READY`("아직 쓸 수 없음")로 바꾸고, 그 밖의 예외(질문 임베딩 실패 포함)는 자기 기능의 일반 실패로 처리한다.

## 조각 나누기 (BR1)

- 고르는 필드(C-07): CATCH는 `workFacts[i]` → `subjectContribution` → `evidence[i].representedFacts[j]` → `authorDescription`(null 아닐 때), TEXT_MATERIAL은 `body`, PDF_MATERIAL은 읽을 수 있는 쪽 `pages[n]`. `aiDraft`·제목·`mismatch`·`sourceUrl`·`sourceRevision`은 조각이 아니다. 새 Catch NC2가 더한 사본 칸 넷(`repositoryName`·`authorDescriptionEditedMonth`·`workLimits`·`evidence[].ownCommit`, [publications.md](publications.md))도 조각이 되지 않는다.
- 필드 하나가 1,000자(UTF-16) 이하면 조각 하나. 넘으면 빈 줄 문단 → 줄 → 1,000자 자리(대리쌍 가운데면 한 칸 앞) 순으로 이어 붙일 수 있을 때까지 모은다. 앞뒤 공백은 범위에서 빼고 빈 범위는 버린다. 조각 글은 필드의 `[charStart, charEnd)` 그대로다.
- 출처 종류: CATCH의 작업 사실·기여·근거는 `GITHUB_RECORD`, 작성자 설명·텍스트·PDF는 `AUTHOR_MATERIAL`. CATCH 조각은 그 항목 사본의 `evidence[].sourceUrl` 목록을 `catch_evidence_urls`에 함께 저장한다(검색은 이 칸만 읽는다).
- 사본 모양이 C-07과 다르면 `ChunkSourceError`(메시지에 사본 글 없음).

## 임베딩 작업 (BR2)

1. 색인 행이 없거나 PENDING이 아니거나 마감이 지났으면 버린다(마감 지난 PENDING은 FAILED로 저장).
2. 조각을 seq 순으로 128개씩 차례로 `embedDocuments`(문서용 입력)에 보낸다. 조각이 0개면 부르지 않는다.
3. 묶음 하나라도 실패하면(Voyage 오류·시간 초과·응답 모양 불일치) 그 자리에서 멈추고 PENDING일 때만 FAILED로 쓴 뒤 정상 종료한다. 다시 시도하지 않는다.
4. 모두 받으면 짧은 트랜잭션 하나에서 색인 행을 `FOR UPDATE`로 잠그고 다시 확인한 뒤 모든 조각 벡터(`unnest` 한 문장)와 DONE을 함께 쓴다. 조건이 맞지 않거나 부모가 지워졌으면(23503) 버린다.
5. DB 오류 같은 예기치 못한 오류는 `EMBED_PUBLICATION_ERROR`를 남기고 던진다(AiRun이 실패로 기록, 상태는 마감 판정에 맡김).

Voyage 호출 중에는 DB 트랜잭션을 열어 두지 않는다.

## 상태 전이

| 지금 | 일 | 다음 |
|---|---|---|
| (없음) | 발행 트랜잭션 커밋 | PENDING, 마감 = 발행 시각 + 10분 |
| PENDING(마감 전) | 임베딩 모두 저장 / 조각 0개 | DONE |
| PENDING(마감 전) | 임베딩 호출 실패 | FAILED |
| PENDING(마감 지남) | 상태를 읽음(검색·상태 조회·다시 준비·처리기 시작) | FAILED |
| FAILED | [검색 다시 준비] | PENDING, 마감 = 접수 시각 + 10분 |
| DONE·PENDING | [검색 다시 준비] | 그대로(`NOT_FAILED`) |
| 어느 상태든 | 발행본 삭제·작성자 탈퇴 | 행 없음(조각도 함께, [탈퇴 연쇄 삭제](member-withdrawal-deletion.md)) |

## 값 (`embedding-config.ts`)

| 항목 | 값 |
|---|---|
| 모델·차원·거리 | `voyage-4-lite`, 1024, 코사인(pgvector `<=>`), 근사 색인 없음 |
| 주소 | `https://api.voyageai.com/v1/embeddings`(코드 상수, 설정으로 바꾸지 않음) |
| 시간 제한 | 문서 30초·질문 10초. 응답 본문 읽기까지 덮는다 |
| 묶음 | 128개(Voyage 한 번 호출 상한: 글 1,000개, voyage-4-lite 1M 토큰) |
| 응답 본문 상한 | 8 MiB(U1 `createGuardedFetch`에 넘김, redirect 금지) |
| 처리 시한 | 10분 |
| 조각 최대 길이 | 1,000(UTF-16 코드 단위) |
| 재시도 | 없음 |

## 키와 합성 제공자 (BR6.1)

`readEmbeddingConfig(env)`는 `CATCHU_EMBEDDING_API_KEY`만 읽는다(앞뒤 공백을 뺀 값이 비면 키 없음). SDK가 읽는 `VOYAGE_API_KEY`는 쓰지 않는다.

| 키 | `NODE_ENV` | `createEmbeddingProvider` 결과 |
|---|---|---|
| 있음 | 무엇이든 | Voyage 제공자 |
| 없음 | 정확히 `development`·`test` | 합성 제공자(같은 글 → 같은 1024차원 단위 벡터) + `EMBEDDING_PROVIDER_SYNTHETIC` 경고 한 줄 |
| 없음 | 그 밖(미지정 포함) | 오류 `CATCHU_EMBEDDING_API_KEY가 비어 있어 임베딩 제공자를 만들 수 없습니다.` |

키는 Voyage 요청의 `Authorization: Bearer` 머리글에만 쓴다. 합성 제공자의 결과는 실제 임베딩 성공이 아니다.

## 오류와 로그

`EmbeddingProviderError`는 실패 종류(`REDIRECT_REJECTED`·`RESPONSE_TOO_LARGE`·`TIMEOUT`·`CONNECTION_FAILED`·`API_STATUS`·`INVALID_RESPONSE`)와 HTTP 상태만 갖고, 메시지는 종류별 고정 문구다. 2xx가 아닌 응답의 본문은 읽지 않고 버린다.

로그는 Nest `Logger('PublishedIndex')`에 객체 하나로 남긴다. 칸은 아래가 전부이며 조각 글·질문 글·키·응답 본문은 없다.

| 사건 | 수준 | 칸 |
|---|---|---|
| `EMBED_PUBLICATION_COMPLETED` | log | publicationId, chunkCount, batchCount, result(`DONE`), totalTokens, durationMs |
| `EMBED_PUBLICATION_FAILED` | warn | 위 칸 + result(`FAILED`), failure, httpStatus |
| `EMBED_PUBLICATION_DISCARDED` | log | publicationId, chunkCount(읽기 전이면 null), result(`DISCARDED`), reason(`NO_INDEX`·`NOT_PENDING`·`DEADLINE_PASSED`·`PARENT_GONE`), durationMs |
| `EMBED_PUBLICATION_ERROR` | error | publicationId, failure(`UNEXPECTED_ERROR`), durationMs |
| `PUBLISHED_SEARCH_FAILED` | warn | publicationId, failure, httpStatus, durationMs |
| `PUBLISHED_REINDEX` | log(등록 실패면 warn) | publicationId, result, enqueueFailed |
| `EMBEDDING_PROVIDER_SYNTHETIC` | warn | (없음) |

## 저장

`publication_index`(발행본마다 한 행, `publication` 연쇄 삭제)와 `published_chunk`(`(publication_id, published_item_id)` → `published_item` 복합 외래 키 연쇄 삭제, `unique(publication_id, seq)`, `embedding vector(1024)`). 마이그레이션 `1793257382741-CreatePublishedIndexTables`는 `CREATE EXTENSION IF NOT EXISTS vector`를 먼저 부르고, `down`에서는 확장을 지우지 않는다(CONVENTIONS).

## 시험

저장소 맨 위에서(테스트 DB 필요, README 「DB 테스트」):

```bash
npm --prefix api test -- test/published-index/chunker.test.cjs test/published-index/embedding-provider.test.cjs test/published-index/published-index-writer.test.cjs test/published-index/embed-publication-handler.test.cjs test/published-index/published-search.test.cjs test/published-index/live-embedding.test.cjs test/published-index/published-index-module.test.cjs test/published-index/queue-embedding.test.cjs test/db/member-cascade-delete.test.cjs test/integration/result-application-b.test.cjs
```

- S1~S11은 테스트 DB와 시험용 임베딩 제공자·기록용 AiRun으로 돈다. 실제 임베딩 성공으로 보고하지 않는다.
- S12(`test/published-index/live-embedding.test.cjs`)는 `CATCHU_EMBEDDING_API_KEY`를 셸 환경변수로 줄 때만 실제 Voyage를 부르고, 없으면 "미실행"으로 건너뛴다(통과 아님). 출력에는 상태·조각 개수·맞은 조각 위치만 남는다.
- 앱 등록(`published-index-module.test.cjs`): 기본 앱 기동 때 처리기 한 번 등록(소비 모듈 둘이 가져와도), C-08·C-09 주입, 키 판정표(Voyage는 가로챈 fetch로 확인, 실제 호출 없음).
- 실제 큐(`queue-embedding.test.cjs`): `CATCHU_TEST_REDIS_URL`이 있을 때만 돈다. 기본 앱을 실제 Valkey에 붙여 발행본 하나의 `EMBED_PUBLICATION`이 처리되어 DONE이 되는지 본다. 셸에 `CATCHU_EMBEDDING_API_KEY`가 있으면 실제 Voyage, 없으면 합성 제공자다(CI는 합성, 큐·처리기 연결 확인일 뿐 실제 임베딩 성공이 아니다). 출력에는 제공자·상태·개수만 남는다.
- 줄 커버리지: `TEST_COVERAGE_INCLUDE='dist/published-index/**' npm --prefix api run test:coverage -- <위 파일들>`.

## 알려진 한계

- [검색 다시 준비] 직후 이전 작업이 늦게 끝나면 임베딩 호출이 1회 겹친다. 같은 조각·같은 모델이라 결과가 같아 막지 않는다. 이전 작업이 늦게 실패하면 새로 PENDING이 된 행을 FAILED로 만들 수 있고, 작성자가 한 번 더 눌러야 한다(BR2.6).
- 작업 등록이 실패하거나 큐에서 사라지면 10분 동안 PENDING으로 보인 뒤 FAILED가 된다. 개발 서버에는 지금 큐 주소가 없어 백그라운드 임베딩은 처리 시한으로 FAILED가 된다([AiRun](ai-run.md)).
- 시한이 지나 읽을 때 FAILED로 바꾸는 저장은 공용 도우미 `persistDeadlineFailure`(C-02)를 써서 `updated_at`을 고치지 않는다.
- PDF 쪽 사본 표(`published_pdf_page`)는 U8이 만든다. 그 전에는 PDF 항목을 발행할 수 없으므로 PDF 조각 나누기는 순수 함수 시험으로만 확인했다.
