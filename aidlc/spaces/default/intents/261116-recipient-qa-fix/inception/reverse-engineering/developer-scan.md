# 개발자 코드 스캔 — CatchU (#559 받은 사람 질의응답 고치기)

> 기준: 2026-11-16, 커밋 `eb0d5a6cf1aa236ef8520946ea66a87c1c632a37`. 범위는 집중 스캔(Minimal)이다. 시험·빌드·프로그램은 돌리지 않았고 코드만 읽었다. 행 번호는 이 커밋의 파일 기준이다.

## Developer Code Scan Results

### Scan Coverage
- **Analyzed deeply**:
  - `api/src/published-index/` (15개 파일 전부: `chunker.ts`, `published-index-writer.ts`, `published-search.ts`, `embed-publication-handler.ts`, `published-chunk.entity.ts`, `publication-index.entity.ts`, `embedding-config.ts`, `embedding-types.ts`, `embedding-provider.ts`, `voyage-embedding-provider.ts`, `synthetic-embedding-provider.ts`, `published-index-log.ts`, `published-index.module.ts`)
  - `api/src/ai-generation/` (15개 파일. `jd-checks.ts`·`guarded-fetch.ts`는 앞부분과 내보낸 이름까지, 나머지는 끝까지)
  - `api/src/rag-answer/` (17개 파일. `question-counter.ts`는 앞 40줄과 규약까지, 나머지는 끝까지)
  - `web/src/features/rag-answer/` (9개 파일. `sse-reader.ts`는 머리 설명과 규약까지, 나머지는 끝까지)
- **Skimmed only**:
  - `web/src/features/recipient/` (`recipient-slots.ts` 전부, `recipient-view.tsx` 40~113행, `recipient-screen.tsx` 40~99행: 패널을 다는 곳과 `showEvidence`·강조)
  - `web/src/features/publications/` (`publication-detail-view.tsx` 전부, `publication-detail-screen.tsx`·`snapshot-view.tsx`는 `showEvidence`·`highlight`가 나오는 줄만)
  - `web/src/features/jd/` (`showEvidence`·`GatedItemView`를 찾는 검색 결과만)
  - `api/src/jd-summary/` (`jd-generation-request.ts` 전부, `jd-summary-processor.ts`는 검색 호출 줄만)
  - `api/src/publications/published-snapshot.ts` (사본 칸 이름만)
  - `api/docs/` 가운데 `published-index.md`·`rag-answer.md`·`ai-generation.md`의 제목과 검색 결과 줄, `api/docs/rag-evaluation/2026-11-14-text-header.md` 앞 20줄
  - `api/test/published-index/`, `api/test/ai-generation/`, `api/test/rag-answer/`, `api/test/u2/`, `web/test/` 가운데 이 범위를 시험하는 파일의 시험 이름과 검색 결과 줄
- **Left out**:
  - `api/dist/`, `api/node_modules/`, `web/node_modules/`, `web/.next/` (빌드 결과·의존 폴더, 열지 않음)
  - 계약 문서 `aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md`(C-01·C-07·C-09·C-11·C-12). 코드 주석이 가리키는 경로만 적었고, AI-DLC 작업 공간 안이라 열지 않았다
  - AI-DLC 설치와 작업 공간(`.claude/`, `.codex/`, `.agents/`, `aidlc/`)
  - 위 네 폴더와 이웃 밖의 나머지 저장소 전체(이번 범위 밖)

### Packages Found
- `@catchu/api` — NestJS 서버 — TypeScript — 이번 범위의 `published-index`(조각·임베딩·검색), `ai-generation`(Claude 인용 호출 게이트), `rag-answer`(질의응답 SSE·기본 요약) 모듈을 가진다
- `catchu-web` — Next.js 앱 — TypeScript/React — 이번 범위의 `features/rag-answer`(요약·질의응답 패널과 항목 표시)를 가진다

### Build System
- **Type**: npm(api·web 각각), TypeScript 컴파일. api 시험은 빌드한 `dist/`를 부른다
- **Config Files**: `api/package.json`(`rag-eval` 스크립트 포함), `web/package.json`, 각 `tsconfig.json`·`eslint.config.mjs`(이번에 열지 않음, 앞 저장소 기록)
- **Build Dependencies**: `rag-answer` → `published-index`(C-09 `PUBLISHED_SEARCH`), `rag-answer` → `ai-generation`(C-01 `AI_GENERATION_GATE`), `rag-answer` → `publications`(C-10 `PUBLICATION_ACCESS`), `published-index` → `ai-generation/guarded-fetch`, `jd-summary` → `published-index`·`ai-generation`·`rag-answer/rag-answer-config`(`AUTHOR_MATERIAL_VOICE_INSTRUCTION`). web `rag-answer` 패널은 `recipient`·`publications` 화면이 단다

### APIs Discovered
- REST(SSE) — `api/src/rag-answer/qna.controller.ts` — `POST /v1/public/links/:token/questions` 1개(SSE `item`·`done`·`error`)
- REST — `api/src/rag-answer/summary.controller.ts` — `GET /v1/public/links/:token/summary`, `GET /v1/publications/:publicationId/summary`, `POST /v1/publications/:publicationId/summary/regenerate` 3개
- 내부 인터페이스 — C-08 `PublishedIndexWriter`(`chunkInTransaction`, `requestReindex`), C-09 `PublishedSearch`(`getIndexState`, `search`), C-01 `AiGenerationGate`(`generate`, `generateStream`)
- 백그라운드 작업 — `ai-run` 큐 `EMBED_PUBLICATION`(`embed-publication-handler.ts`), `BASE_SUMMARY`(`base-summary-handler.ts`)
- 외부 호출 — Voyage `POST https://api.voyageai.com/v1/embeddings`(`voyage-4-lite`, 1024차원), Anthropic Messages(인용 문서, `claude-haiku-5-5`·`claude-sonnet-5-5`, 미국 처리)

### Frameworks & Libraries
- `@nestjs/common` — 12.0.4 — 모듈·컨트롤러(앞 저장소 판본 표)
- `typeorm` / `pg` — 1.1.1 / 8.23.0 — `published_chunk`(pgvector `vector(1024)`)·`publication_index`·`base_summary` 표
- `@anthropic-ai/sdk` — 0.133.0 — 인용 호출·스트림·질문 다시 쓰기
- `ioredis` — 6.0.0 — 링크당 하루 질문 수
- `next` / `react` — 16.4.1 / 19.2.8 — 패널 그리기
- 판본은 이번에 다시 보지 않았다(`technology-stack.md`의 앞 기록)

### Test Coverage
- **Test Directories**: `api/test/published-index/`(9), `api/test/ai-generation/`(8), `api/test/rag-answer/`(12, `rag-eval-input.json` 포함), `api/test/u2/ai-gate-*.test.cjs`(게이트 대조·스트림·JD), `web/test/rag-answer-*.test.mjs`(3), `web/test/recipient.test.mjs`(`resolveEvidenceTarget`), `web/test/publications-owner.test.mjs`
- **Test Frameworks**: Node `node:test`(api `.cjs`, web `.mjs`)
- **Coverage Config**: 있음(서비스별 `test:coverage`). `web/src/features/rag-answer/README.md` 「시험」: `.tsx` 패널(`gated-item-view.tsx` 포함)은 시험이 불러오지 않는다

### Code Quality Indicators
- **Linting**: api ESLint(`--max-warnings=0`)·web ESLint(앞 저장소 기록). 이번 범위 파일에 `eslint-disable`·`TODO`·`FIXME` 없음
- **CI/CD**: `.github/workflows/ci.yml`(이번에 열지 않음, 앞 기록)
- **Documentation**: 파일마다 머리 주석이 계약·업무 규칙 번호를 단다. 모듈 안내 `api/docs/published-index.md`·`rag-answer.md`·`ai-generation.md`, 화면 안내 `web/src/features/rag-answer/README.md`, 품질 평가 기록 `api/docs/rag-evaluation/`

### Technical Debt Signals
- 조각 하나 = 사본 문자열 칸 하나의 한 범위. Catch 근거 하나의 기록 줄(`evidence[i].representedFacts[j]`)마다 따로 조각이 되고 따로 검색된다(`api/src/published-index/chunker.ts` 118~123행). 같은 근거의 다른 줄은 검색 상위 8개에 같이 들어올 때만 모델에 간다
- 모델에 넘기는 인용 문서의 머리글(`context`)은 자료 종류뿐이다(`api/src/ai-generation/citation-request.ts` 22~26·48~53행). 어느 발행 항목(Catch)·어느 칸인지, 같은 근거끼리인지 모델은 모른다. 문서 순서는 검색 점수 순이다(`published-search.ts` 140행)
- 인용 항목 대조는 그 항목이 인용한 줄의 낱말만 본다(`api/src/ai-generation/fact-check.ts` 113~121행). 같은 근거의 다른 줄에 있는 영어 표기·숫자·파일 이름을 답에 쓰면 `fact`로 버려진다
- 스트림에서 모델이 낸 `- ` 항목이 있으나 모두 버려지면 오류 없이 끝난다(`checked-gate.ts` 217행은 모델 항목 0개일 때만 `NO_ITEMS`). 이때 화면은 「근거를 찾지 못했습니다」를 보이고(`web/src/features/rag-answer/rag-answer-state.ts` `askDisplay`), 버린 이유는 `ai_gate_result` 로그에만 있다
- `gated-item-view.tsx`는 시험이 없다(README 「시험」)
- 같은 지시 문장 `AUTHOR_MATERIAL_VOICE_INSTRUCTION`을 질의응답·기본 요약·JD 요약이 함께 쓴다(`rag-answer-config.ts` 40~45·52~55행, `api/src/jd-summary/jd-generation-request.ts` 4·7~8행)

## Handoff Summary
- **Intent-relevant finding**:
  1. **조각 나누기(바꿀 곳 1)**: `catchFields`(`chunker.ts` 105~128행)가 Catch 사본을 `workFacts[i]` → `subjectContribution` → `evidence[i].representedFacts[j]` → `authorDescription` 칸으로 나누고, 칸마다 `splitFieldRanges`(1,000자, 152~159행)로 범위를 만든다. 칸을 넘는 조각은 없다. 조각에는 그 Catch 근거 주소 전체(`catchEvidenceUrls`)만 붙고 어느 근거(`evidence[i]`)인지는 `fieldPath` 글자에만 있다. 조각 행(`published_chunk`)은 `char_end - char_start <= 1000` CHECK가 있다(`published-chunk.entity.ts` 22행). 사본의 `aiDraft`·항목 `title`·`repositoryName`·`workLimits`·`ownCommit`은 조각이 되지 않는다(`chunker.ts` 104행 주석, `api/test/published-index/chunker.test.cjs` 166·188행 시험).
  2. **검색**: `search(publicationId, query, 8)`(`rag-answer-config.ts` 12행 `QNA_SEARCH_LIMIT`)이 그 발행본 조각만 코사인 거리로 정확 비교해 가까운 8개를 점수 순으로 준다(`published-search.ts` 124~144행). 같은 근거·같은 항목을 묶거나 이웃 조각을 더하는 단계가 없다. JD 요약은 같은 검색을 6개로 부르고(`jd-summary-processor.ts` 30행), 조각 글 1,000자 이하·근거 6개 이하·`charEnd - charStart === text.length`를 검사한다(`jd-generation-request.ts` 18~23·32행).
  3. **모델 요청(바꿀 곳 2)**: `chunkToSource`(`qna-service.ts` 48~57행)가 조각 하나를 근거 하나로 옮기고, `buildCitationRequest`(`citation-request.ts` 41~64행)가 근거 하나를 인용 문서 하나(줄마다 글 블록 하나, `context` = `자료 종류: GitHub 기록 원문`/`작성자 자료 원문`)로 만든다. 문서 번호 → 근거 하나의 대응표(`CitationDocument.sourceIndex`)라서 블록 범위 인용은 늘 근거 하나 안이다(`citation-locator.ts` 14~37행). 위치 = 근거 `location.charStart` + 줄 시작(C-01 「사본 칸 하나 안의 범위」가 이 구조로 지켜진다). 시스템 지시 = 항목 형식 지시 + 기능 지시 + 공통 방어 문구(`gate-policy.ts` 12~19행), 질문은 문서 뒤 사용자 글이다.
  4. **지시(바꿀 곳 3)**: `QNA_INSTRUCTION`(`rag-answer-config.ts` 44~45행) = 「발행본 자료만으로 … 자료에 없는 일은 없다고 말한다.」 + `AUTHOR_MATERIAL_VOICE_INSTRUCTION`. 끝 문장은 기본 요약·JD 요약과 같은 상수다. 질의응답 모델은 `QNA_MODEL = 'HAIKU'`(30행).
  5. **답 항목 0개(바꿀 곳 5)**: 세 길이 있다. (a) 검색 조각 0개 → Claude를 부르지 않고 `done`(`qna-service.ts` 112행, 로그 `qna.completed` `chunkCount: 0`). (b) 모델이 `- ` 항목을 하나도 내지 않음 → `NO_ITEMS` → `GENERATION_FAILED` → SSE `error ANSWER_FAILED`(`checked-gate.ts` 217행, 로그는 `ai_gate_failed`의 `failure: NO_ITEMS`. 이 로그에는 `nonItemLineCount`·`dropReasons` 칸이 없어 모델이 항목 아닌 줄을 몇 줄 썼는지 알 수 없다, 140~145행). (c) 모델 항목이 모두 `truncated`·`location`·`fact`로 버려짐 → 오류 없이 `done`, 로그 `ai_gate_result`의 `itemCount: 0`·`dropReasons`, `qna.completed` `outcome: OK, itemCount: 0`. 화면은 (a)(c)에서 「발행본에서 이 질문의 근거를 찾지 못했습니다」, (b)에서 「답을 만들지 못했습니다. 다시 질문해 주세요」(`rag-answer-state.ts` `askDisplay`). 원인을 가르려면 같은 시각의 `ai_gate_result`(또는 `ai_gate_failed`)와 `qna.completed`를 함께 본다. (c)의 `fact`는 위 3의 「인용한 줄만 대조」와 1의 「근거 줄이 따로 떨어짐」이 겹칠 때 생기기 쉽다(추정, 로그로 확인 필요).
  6. **답·인용을 web에 돌려주는 길**: 게이트가 대조를 통과한 `GatedItem`을 하나씩 내보내면 컨트롤러가 SSE `item`으로 쓴다(`qna.controller.ts` 122행). 항목 모양은 `{ kind: CITED|AI_INTERPRETATION, text, citations[{ sourceId, quote, location{ publishedItemId, fieldPath, charStart, charEnd, pdfPage }, sourceLabel }], jdRole: null }`이고 항목 제목은 없다. web `parseGatedItem`(`rag-answer-api.ts` 111~118행)은 계약 칸만 옮기고 `jdRole`은 버린다.
  7. **화면 출처 딱지(바꿀 곳 4)**: `GatedItemView`(`gated-item-view.tsx` 10~36행)는 `items`·`showEvidence`·`testId`만 받는다. `CITED` 인용마다 `<blockquote>` 안에 인용문과 `sourceLabel` 단추(누르면 `showEvidence(citation.location)`)를 그린다. 이 부품을 쓰는 곳은 `BaseSummaryPanel`(받은 사람·작성자 모드)과 `QnaPanel` 둘뿐이고, JD 요약은 자기 부품(`features/jd/jd-result-view.tsx` `JdItemView`)을 쓴다. 패널은 사본을 받지 않는다: 받은 사람 패널 props는 C-11 `RecipientSlotProps`(`recipient-slots.ts` 21~31행: `token`·`getGrant`·`onAccessLost`·`isLoggedIn`·`showEvidence`)이고 작성자 모드는 `publicationId`·`showEvidence`다. 사본(항목 `title` 포함)은 화면 쪽(`recipient-view.tsx` 84행 `snapshot.snapshot`, `publication-detail-view.tsx` 86행 `detail.snapshot`)이 갖는다. 강조는 화면이 `resolveEvidenceTarget`(`recipient-slots.ts` 40~51행)으로 `publishedItemId`·`fieldPath`·범위를 사본에 대조해 `PublishedSnapshotView`의 `<mark data-testid="snapshot-highlight">`로 그린다.
- **Risks / follow-up**:
  - 조각을 합치면 조각 하나가 여러 사본 칸에 걸친다. 지금 위치 모양(`SourceLocation`: `fieldPath` 하나와 그 칸 안의 범위)과 C-01 경계를 지키려면 「조각(검색 단위)」과 「근거(인용 단위)」를 나누거나, 인용 문서 하나에 여러 근거의 줄을 넣고 블록마다 근거를 따로 대응시키는 쪽으로 가야 한다. 어느 쪽이든 `published_chunk`의 1,000자 CHECK, JD 요약의 1,000자·6개·길이 검사, `published-search`의 `publicationText`(조각 글을 이은 글) 뜻이 함께 움직인다.
  - 조각을 다시 나누면 이미 발행한 발행본의 조각·벡터는 그대로다(조각은 발행 트랜잭션에서 한 번, `requestReindex`는 다시 나누지 않음, `published-index-writer.ts` 21~25행). 옛 발행본에 새 방식을 쓰려면 다시 나누는 길이 필요하다.
  - 「어느 Catch인가」를 모델에 알리되 Catch 제목·AI 초안은 넣지 않아야 한다(FR6.4, `chunker.ts` 104행, `summary-sources.ts` 2행). 쓸 수 있는 값은 발행 항목 순번(`position`)·`publishedItemId`·사본 `repositoryName`(선택 칸)·근거 `sourceUrl`이다. 이 값들을 `context`에 넣으면 인용 대조 대상(인용한 줄)에는 들지 않으므로 대조 규칙과 맞는지 따져야 한다.
  - `QNA_INSTRUCTION`을 바꾸면 질의응답 10개 다시 재기(`api/docs/rag-answer.md` 「RAG 품질 평가」, `npm run rag-eval`, `api/test/rag-answer/rag-eval.test.cjs`)가 확인 수단이다. 끝 문장 상수는 기본 요약·JD 요약과 같이 움직이므로 질의응답만 바꿀 때는 그 상수 밖에서 바꾼다.
  - 출처 딱지 옆 항목 제목은 사본을 가진 화면이 찾아야 한다. 패널 props에 사본(또는 `publishedItemId` → 제목 찾기 함수)을 더하면 C-11 `RecipientSlotProps` 모양이 바뀐다(받은 사람 화면 4번 자리 JD 패널도 같은 props를 받는다). 작성자 화면도 같은 부품을 쓰므로 두 화면을 함께 고친다.
  - 함께 고칠 문서: `api/docs/published-index.md` 「조각 나누기」, `api/docs/ai-generation.md` 39행(`context` 설명), `api/docs/rag-answer.md` 「단계 순서」·「값」, `web/src/features/rag-answer/README.md`, 계약 C-01·C-07·C-09·C-11 원본(AI-DLC 작업 공간 안, 이번에 열지 않음).
