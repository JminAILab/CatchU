# 개발자 코드 스캔 — 발행 프리셋(261118-publication-presets)

- 저장소: 프로젝트 루트(기록되지 않은 단일 저장소, codekb 이름 `CatchU`)
- 기준 커밋: `aa241a4c629bb90ca2ccd729df7b0917275e8f02`(브랜치 `api/publication-presets`)
- 방식: 집중 스캔(앞 저장소는 STALE), 깊이 Standard. 협업자가 꺼져 있어 개발자 한 명이 스캔과 아홉 문서 작성을 함께 했다.
- 프로젝트의 시험·빌드·프로그램은 돌리지 않았다. 아래 행 번호는 이 커밋의 파일에서 읽은 값이다.

## Developer Code Scan Results

### Scan Coverage

- **Analyzed deeply**:
  - `api/src/publications/` (발행 요청 검사·발행 트랜잭션·사본 만들기·사본 모양·엔티티·C-10 DB 구현·작성자 관리·컨트롤러 둘·모듈·PDF 발행. `recipient-access.service.ts`·`published-pdf-view.service.ts`·`publications-log.ts`·`in-memory-publication-access.ts`·`work-limit-sentences.ts`·`publication-state.ts`는 내보낸 이름과 `position`·`readSnapshot` 쓰는 줄만 읽었다)
  - `api/src/published-index/` (`chunker.ts`·`published-index-writer.ts`·`published-chunk.entity.ts`는 끝까지, `published-search.ts`는 앞 60줄. 11-16 뒤 바뀐 파일이 없음을 `git diff --stat eb0d5a6c aa241a4c`로 확인)
  - `api/src/rag-answer/` (`qna-sources.ts`·`qna-service.ts`·`qna.controller.ts`·`summary-sources.ts`·`rag-answer-config.ts`는 끝까지, 나머지는 내보낸 이름·`readSnapshot`·작성자 한도 줄)
  - `api/src/claude-mcp/mcp-shared-publication-reader.ts`, `mcp-shared-page.ts`, `mcp-shared-text.ts`
  - `api/src/jd-summary/jd-summary-processor.ts`, `jd-generation-request.ts`
  - `api/src/catches/owner-catch-input.ts`, `owner-catch-store.ts`, `catch-reader.ts`, `owner-catches.controller.ts`
  - `api/src/materials/text-material-store.ts`, `text-materials.controller.ts`
  - `api/src/withdrawal/withdrawal.service.ts`
  - `api/src/database/migrations/1793162230851-CreatePublicationTables.ts`, `1794378756644-AddCatchRevisitFacts.ts`
  - `web/src/features/publications/publish-screen.tsx`, `publish-sources.ts`, `publish-view.tsx`(구성 요소·제목·단추 줄), `publications-api.ts`(1~165행), `snapshot-view.tsx`, `publication-detail-screen.tsx`(근거 강조 부분 100~155행), `publication-detail-view.tsx`
  - `web/src/features/recipient/recipient-view.tsx`, `recipient-screen.tsx`, `recipient-slots.ts`, `recipient-api.ts`
  - `web/src/features/recipient-claude/recipient-claude-text.ts`
  - `web/src/features/rag-answer/item-title.ts`, `gated-item-view.tsx`, `qna-panel.tsx`, `rag-answer-messages.ts`
  - `web/src/features/materials/materials-view.tsx`
  - `web/src/features/privacy/README.md`
  - `web/src/features/withdrawal/withdrawal.ts`
  - `web/src/components/header/member-header.tsx`
- **Skimmed only**:
  - `api/src/claude-mcp/` 나머지(파일 목록, `mcp-tools.ts`의 도구 이름 세 줄, `mcp-material-reader.ts` 조회문 머리)
  - `api/src/jd-summary/` 나머지(`jd-summary.service.ts`·`jd-summary-run.entity.ts`의 발행본 연결 줄)
  - `api/src/catches/owner-catch-response.ts`(1~110행 타입), 그 밖 파일은 목록만
  - `api/src/materials/pdf-material-store.ts`(120~199행), `pdf-materials.controller.ts`(1~60·130~179행), 나머지는 목록과 삭제문 검색 결과
  - `api/src/database/migrations/` 나머지(파일 목록, PDF·JD 요약·색인·기본 요약 마이그레이션의 외래 키 줄 검색)
  - `api/src/database/database.config.ts`(마이그레이션·엔티티 경로와 `synchronize`·`migrationsRun` 줄)
  - `api/src/ai-generation/ai-generation.types.ts`·`citation-request.ts`(`itemContext` 쓰는 줄 검색만)
  - `web/src/features/publications/` 나머지(목록·PDF 항목·링크 동작·형식·README 절 제목)
  - `web/src/features/recipient/recipient-store.ts`(`claudeConnectable`), `recipient-format.ts`·README(절 제목)
  - `web/src/features/recipient-claude/claude-analyze-panel.tsx`(내보낸 이름)
  - `web/src/features/rag-answer/base-summary-panel.tsx`(props·제목 줄), README(절 제목)
  - `web/src/features/materials/materials-screen.tsx`(탭 바꾸기·삭제 확인 270~315행), `pdf-materials-api.ts`·`pdf-materials-tab.tsx`(삭제 확인 줄), README(절 제목)
  - `web/src/features/privacy/privacy-policy.tsx`(저장 항목 표·지우기 문장 검색 결과)
  - `web/src/lib/routes.ts`(발행·자료 주소 줄), `web/src/app/(member)/`(주소 폴더 목록)
  - `api/test/`, `api/test/publications/`, `api/test/rag-answer/`, `api/test/claude-mcp/`, `web/test/`(파일 이름 목록만)
- **Left out**:
  - `node_modules/`, `api/dist/`, `web/.next/`, `coverage/` (설치·빌드 결과)
  - AI-DLC 설치와 작업 공간: `.claude/`, `.codex/`, `.agents/`, `aidlc/`
  - 집중 범위 밖의 서비스 코드(`worker/`, `deploy/`, `.github/`, `docs/`의 팀 문서)는 이번에 열지 않았다(입력 문서 `docs/ai-dlc-input-preset/CatchU_발행_프리셋_입력.md`만 지시 글로 읽었다)

### Packages Found

- `api`(`@catchu/api`) — NestJS 서버 — TypeScript — 발행·사본·검색·질의응답·MCP·자료·탈퇴(이번 범위)
- `web`(`catchu-web`) — Next.js 앱 — TypeScript/React — 발행 화면·발행본 상세·받은 사람 화면·자료 화면·상단 메뉴·개인정보처리방침
- `worker` — Python 처리기 — 이번 범위 밖(열지 않음)

### Build System

- **Type**: npm(api·web 각각), TypeORM 마이그레이션(api)
- **Config Files**: `api/src/database/database.config.ts`(엔티티 `**/*.entity.{ts,js}`, 마이그레이션 `database/migrations/*.{ts,js}`, `synchronize: false`, `migrationsRun: false` — 43~48행). 나머지 설정 파일은 이번에 다시 열지 않았다(앞 저장소 `technology-stack.md` 기준).
- **Build Dependencies**: web → api는 HTTP `/v1`뿐. api 안에서 `publications` → `published-index`(조각, C-08), `rag-answer`·`jd-summary`·`claude-mcp` → `publications`(C-10 `PUBLICATION_ACCESS`). `materials`·`catches`는 `publications`를 import하지 않는다(발행이 그 표를 SQL로 직접 잠그고 읽는다).

### APIs Discovered

- REST(작성자) — `api/src/publications/publications.controller.ts` — 6개(`POST /publications`, `GET /publications`, `GET /publications/:id`, `GET /publications/:id/items/:itemId/pdf`, `PUT /publications/:id/stop`, `DELETE /publications/:id`)
- REST(받은 사람, 공개) — `api/src/publications/recipient-links.controller.ts` — 3개(`GET /public/links/:token`, `POST .../unlock`, `GET .../items/:itemId/pdf`)
- REST+SSE(받은 사람) — `api/src/rag-answer/qna.controller.ts`·`summary.controller.ts` — 질의응답 1개, 요약 3개(앞 저장소와 같음)
- REST(작성자) — `api/src/catches/owner-catches.controller.ts` — 5개(목록·상세·확인·불일치·공개). Catch를 지우는 경로는 없다
- REST(작성자) — `api/src/materials/text-materials.controller.ts` — 5개, `pdf-materials.controller.ts` — 업로드·목록·상세·원본·삭제
- REST(회원) — `api/src/withdrawal/withdrawal.controller.ts` — `DELETE /me`
- MCP 도구 — `api/src/claude-mcp/mcp-tools.ts` — 3개(`list_my_catches`, `list_my_text_materials`, `read_shared_publication`)
- 프리셋 관련 표·엔티티·경로·화면은 아직 없다(검색으로 확인: `preset`이라는 이름이 `api/src`·`web/src`에 없음)

### Frameworks & Libraries

판본은 이번에 다시 열지 않았다(앞 저장소 `technology-stack.md`의 2026-11-09 기록). 이번 범위가 직접 쓰는 것:

- NestJS 12.0.4 — 컨트롤러·모듈
- TypeORM 1.1.1 + PostgreSQL 16(pgvector) — 엔티티·손으로 고친 마이그레이션·`manager.query` SQL
- Next.js 16.4.1 / React 19.2.8 — 화면. 탭·드래그 라이브러리 없음(탭은 `materials-view.tsx` 자체 부품)
- `@modelcontextprotocol/sdk` 1.32.2 — MCP 도구

### Test Coverage

- **Test Directories**: `api/test/publications/`(13개: `publish-api`, `publish-pdf`, `publications-manage-api`, `publication-access-db`, `recipient-api` 등), `api/test/rag-answer/`(`qna-sources.test.cjs` 포함 13개), `api/test/published-index/`, `api/test/claude-mcp/`(`mcp-shared-page`·`mcp-shared-reader`·`mcp-shared-text`·`mcp-withdrawal` 등), `api/test/catches/`, `api/test/materials/`, `web/test/`(`publish.test.mjs`, `publications-owner.test.mjs`, `recipient.test.mjs`, `rag-answer-item-title.test.mjs`, `rag-answer-qna-panel.test.mjs`, `materials-screen.test.mjs`, `member-navigation.test.mjs`, `privacy-policy.test.mjs`, `u2-withdrawal.test.mjs`)
- **Test Frameworks**: Node `node:test`(api `*.test.cjs`, web `*.test.mjs`)
- **Coverage Config**: 명령은 있다(앞 저장소 기록). 이번에 다시 확인하지 않았다

### Code Quality Indicators

- **Linting**: api ESLint(경고도 실패), web ESLint(앞 저장소 기록). 이번에 읽은 파일에 `eslint-disable`·`@ts-ignore`·TODO·FIXME가 없다
- **CI/CD**: 이번에 다시 열지 않았다
- **Documentation**: 기능 폴더마다 README, 코드 머리 주석이 요구사항·계약 번호와 이유를 적는다. 개인정보처리방침은 `privacy-policy.md` 원문 사본 + 시험의 SHA-256 대조로 묶여 있다(`web/src/features/privacy/README.md` 22·26행)

### Technical Debt Signals

- 발행본 안에 묶음 개념이 없고 항목 순서 번호(`position`) 하나가 순서·표 글자·cursor·조각 순서를 모두 맡는다(`publication.entity.ts` 60·62행, `qna-sources.ts` 22~23·84행, `mcp-shared-page.ts` 12~15행)
- 자료 화면 탭 부품은 탭 이름·ID가 코드 상수에 묶여 있고(`materials-view.tsx` 20~22행), 화살표 키·roving tabindex가 없으며, 텍스트 쪽에는 `role="tabpanel"` 요소가 없어 `aria-controls="materials-panel-text"`가 가리키는 id가 화면에 없다(`materials-screen.tsx` 288·300행)
- 받은 사람 화면 근거 이동은 DOM id로 항목을 찾는다(`recipient-screen.tsx` 66~73행). 가리킨 항목이 그려지지 않은 자리에 있으면 아무 일도 없다
- 발행본 행을 마이그레이션으로 지우면 파일 저장소의 발행본 PDF 사본(`publicationPrefix`)은 남는다. 지금 삭제 경로는 파일 접두어를 먼저 지우고 행을 지운다(`publication-manage.service.ts` 127~152행)
- 같은 상한 값이 여러 곳에 따로 있다: 항목 20·제목 50·전체 글 60,000(api `publications-config.ts`, web `publications-api.ts` 14행, PDF 추출 설정·worker 설정은 주석이 가리킴)
- 응답 검사가 모르는 칸을 무시하고(`publications-api.ts` 107~119행), 받은 사람 화면은 계약 칸만 골라 옮긴다(`recipient-api.ts` 27~62행) — 사본에 새 칸을 더하면 두 곳을 함께 고쳐야 받은 사람 화면에 닿는다

## 이 intent가 닿는 사실 (집중 범위)

### 1. 발행 요청과 사본 모양

- 요청 본문은 `{ title, password?, items: [{ kind, sourceId }] }` 하나다. 본문 칸은 `title`·`password`·`items`만, 항목 칸은 `kind`·`sourceId`만 받고 그 밖은 400(`publish-input.ts` 113~124·91행). 항목 1~20개, 같은 `kind:sourceId`는 한 번만(84~105행, `publications-config.ts` 34~36행).
- 배열 순서가 곧 `position`이다. 발행 서비스는 `index + 1`로 `published_item.position`을 쓴다(`publish.service.ts` 243~249행). 미리 만든 항목 ID도 요청 순서다(159행).
- 트랜잭션 안에서 Catch를 `catch_id` 순서로 잠그고 → 텍스트 자료 → PDF(FOR SHARE) 순으로 잠근 뒤 공개 자격(미확인 409 `CONFIRMATION_REQUIRED`, 보호 409 `SOURCE_RESTRICTED`, 둘 다 `details.catchIds`)을 본다(`publish.service.ts` 206~216·317~339행). PDF 추출 미완료는 400 `items[i].sourceId` `extractionIncomplete`이고 `i`는 0부터인 요청 위치다(`pdf-publish.ts` 49~60행).
- 전체 글 60,000자(코드 포인트, 조각 대상 칸 + PDF 쪽 글)는 발행본 전체로 한 번 센다(`publish.service.ts` 232~236행, `snapshot-builder.ts` 94~102행). 하루 실행 횟수는 `BASE_SUMMARY` 종류로 같은 트랜잭션에서 쓴다(204행).
- 고른 비공개 Catch만 공개로 바꾸고(254~257행), 같은 트랜잭션에서 조각을 나눈다(259행). 커밋 뒤 `EMBED_PUBLICATION`·`BASE_SUMMARY`를 등록한다(181~182행).
- 표: `publication`(제목·토큰·비밀번호 검증값·발행/만료/중지 시각), `published_item`(`position` ≥ 1, `unique(publication_id, position)`, `item_kind`, `source_id` 외래 키 없음, `title`, `snapshot` jsonb, `pdf_copy_key`)(`publication.entity.ts` 19~89행, 마이그레이션 `1793162230851` 11행). **묶음(프리셋) 칸이 없다.**
- 사본 `PublishedSnapshot = { title, publishedAt, expiresAt, items[position 오름차순] }`, 항목 `{ publishedItemId, position, itemKind, title, snapshot, pdfPages }`(`published-snapshot.ts` 52~68행). `readSnapshotIn`이 `ORDER BY position`으로 읽는다(`db-publication-access.ts` 168~170행).

### 2. 순서 번호(`position`)를 쓰는 곳

| 자리 | 쓰는 방법 | 근거 |
|---|---|---|
| 조각 나누기 | 항목을 `position`으로 정렬해 조각을 만들고 `seq`를 발행본 전체에 1부터 매긴다 | `chunker.ts` 54~66행, `published-index-writer.ts` 60~64·95~98행 |
| 기본 요약 근거 | 사본 항목을 `position`으로 정렬해 칸마다 근거 하나 | `summary-sources.ts` 96~98행 |
| 질의응답 머리글 | `position` 순서의 배열 자리로 표 글자 「가」~「버」(20개)를 매기고, 21번째부터 두 글자 | `qna-sources.ts` 22~23·53~57·83~101행 |
| 받은 링크 읽기(MCP) | 쪽 cursor가 `{ position, offset }`이고 그 `position`의 항목을 찾는다 | `mcp-shared-page.ts` 11~15·91~97행, `mcp-shared-publication-reader.ts` 42~45행 |
| 사본 읽기·화면 | `ORDER BY position`, web은 `orderedItems`로 한 번 더 정렬 | `db-publication-access.ts` 170행, `publications-api.ts` 131~133행 |
| PDF 발행 오류 위치 | 0부터인 요청 위치(`items[i]`) | `pdf-publish.ts` 49~60행 |

`position`을 발행본 전체에 하나로 이어 매기면(프리셋 1의 자료 다음 프리셋 2의 자료) 위 자리는 코드 변경 없이 그대로 동작한다. 질의응답 표 글자는 발행본 항목 20개 안에서 겹치지 않는다.

### 3. 받은 사람·작성자 사본 그리기와 근거 이동

- `PublishedSnapshotView`가 h2 「발행본 자료」와 항목 `<ol>`을 그리고, 항목마다 `id="published-item-{id}"`·`tabIndex={-1}`을 단다(`snapshot-view.tsx` 249~278행). 받은 사람 화면과 작성자 발행본 상세가 같은 부품을 쓴다.
- Catch 항목 부품은 「근거 자세히 보기」 접힘 상태를 자기 상태로 들고, 강조가 그 안을 가리키면 펼친다(`snapshot-view.tsx` 141~165·201~205행). 탭을 바꿔 부품이 내려가면 이 상태는 사라진다.
- 받은 사람 화면 순서: h1 → `RecipientGuide` → (조건) `ClaudeAnalyzePanel` → 발행 시각 → 발행본 자료 → 자리 2 AI 요약 → 자리 3 질의응답 → 자리 4 JD 요약(`recipient-view.tsx` 69~88·99~115행). 작성자 상세: h1 → 링크 패널 → AI 요약 → 발행본 자료(`publication-detail-view.tsx` 44~89행).
- 출처 단추는 `showEvidence(location)`을 부르고, 화면이 `resolveEvidenceTarget`로 사본에 대조해 `{ publishedItemId, highlight }`를 정한 뒤 `seq`를 올린다. 효과가 `document.getElementById(publishedItemDomId(...))`로 항목을 찾아 첫 `<mark>` 또는 항목 시작으로 스크롤하고 항목에 초점을 둔다(`recipient-screen.tsx` 58~75행, `publication-detail-screen.tsx` 123~138행 — 두 화면이 같은 코드를 따로 갖는다). 항목 요소가 없으면 아무 일도 없다. **답으로 돌아가는 단추와 「어디서 눌렀는지」 기록은 없다.**
- 질의응답 대화는 `QnaPanel`의 `useState`에만 있다(`qna-panel.tsx` 41행). 패널이 사본 부품 밖(자리 3)에 있어 사본 안을 바꿔도 대화는 남는다. 패널이 내려가면 사라진다.
- 출처 딱지 옆 항목 제목(#559)은 화면이 사본으로 만든 `itemTitleFinder`를 `itemTitleOf`로 넘긴다(`item-title.ts`, `recipient-view.tsx` 86행, `publication-detail-view.tsx` 85~86행).

### 4. 자료 화면의 탭 부품

- `MaterialsTabs({ active, onChange })`: `role="tablist"`, 탭마다 `role="tab"`·`aria-selected`·`aria-controls`·`id="materials-tab-{id}"`, 누르면 `onChange`(`materials-view.tsx` 20~35행). 탭 목록은 `TABS` 상수(「텍스트 자료」「PDF 자료」)이고 타입 `MaterialsTab = "text" | "pdf"`다.
- 화살표 키 처리·`tabIndex` 관리가 없어 탭 단추가 모두 Tab 순서에 든다. PDF 쪽만 `role="tabpanel"`로 감싸고(`materials-screen.tsx` 288행) 텍스트 쪽은 감싸지 않는다(300~312행).
- 탭을 바꾸면 텍스트 편집기를 닫고 미저장 확인을 거친다(`materials-screen.tsx` 273~278행).
- 다른 화면에서 다시 쓰려면 탭 목록·ID 앞붙임·이름을 props로 받게 일반화해야 한다.

### 5. Catch 목록(작성자 설명 걸러 보기·확인 필요·비공개 표시)

- `GET /v1/catches` 쿼리: `limit`(기본 20, 최대 100)·`repositoryId`·`sourceRequestId`·`authorDescription`(`written`|`unwritten`)·`cursor`(판본 3, 조건까지 묶음)(`owner-catch-input.ts` 51~100·129~141행).
- 순서: `last_work_at DESC NULLS LAST, catch_id ASC`(`owner-catch-store.ts` 50~53행). 설명 조건은 고정 SQL 조각 둘 가운데 하나(32~35행).
- 응답 칸: `hasAuthorDescription`(설명 원문은 읽지 않음), `confirmation`, `visibility`, `restriction`, `mismatch`, `revisitFacts` 등(`catch-reader.ts` 21~32행, `owner-catch-response.ts` 59~87행).
- 발행 화면은 `catches.list({ repositoryId: "", authorDescription: writtenOnly ? "written" : "all" }, cursor)`로 20개씩 부르고(`publish-screen.tsx` 147~153행), `catchSourceOf`가 `eligible = 확인됨 && 보호 아님`, 이유 글(「작업 사실과 나의 기여를 먼저 확인해야 발행에 넣을 수 있습니다」·「원본 저장소가 보호되어…」)을 정한다(`publish-sources.ts` 10~13·72~81행). **지금은 확인이 안 된 Catch를 고를 수 없다.** 비공개면서 고를 수 있는 Catch에는 비공개 안내가 붙는다(`publish-view.tsx` 125행).
- 고른 자료(`selected`)는 고르기 목록과 따로 있고 걸러 보기를 바꿔도 남는다(`publish-screen.tsx` 62~80·204~210행). 확인 단계는 `selected`로 비공개 수·설명 없는 수를 센다(`publish-view.tsx` 316~318행).

### 6. 텍스트 자료·PDF 지우기와 탈퇴

- 텍스트 자료: `DELETE /v1/text-materials/:id` → 행만 지운다. 발행 사본은 외래 키가 없어 남는다(`text-material-store.ts` 28~35·102~112행). 화면 확인 문장은 「이 자료를 삭제할까요? 이미 발행한 사본은 그대로 남고…」(`materials-screen.tsx` 226행).
- PDF: 소유 확인 → 파일 먼저 삭제 → 행 삭제(쪽 글 연쇄)(`pdf-materials.controller.ts` 144~157행, `pdf-material-store.ts` 156~167행). 확인 문장 `PDF_DELETE_CONFIRM`(`pdf-materials-api.ts` 205행).
- Catch: 지우는 경로가 없다(컨트롤러 다섯 경로뿐, `owner-catches.controller.ts`). 개인정보처리방침도 「Catch는 하나씩 지우는 기능이 없습니다」라고 적는다.
- 탈퇴: 1 세션 폐기·발행 링크 중지·MCP 행 삭제 → 2 회원 파일 → 3 자격정보 파일 → 4 `DELETE FROM member_account` 연쇄 + 회원 파일 다시 삭제(`withdrawal.service.ts` 47~65행). 회원 자료 표는 모두 `member_account`에 `ON DELETE CASCADE`라 새 표도 같은 외래 키면 탈퇴 코드를 고치지 않아도 지워진다. 화면 확인 문장 「탈퇴하면 계정과 자료, 발행 링크, Claude 연결이 바로 지워지고…」(`withdrawal.ts` 13행).

### 7. 개인정보처리방침 문구

- 저장 항목 표 「직접 올린 글과 PDF, JD, 발행본과 공유 링크, 발행본의 AI 요약·검색용 색인·JD 요약 결과」(`privacy-policy.tsx` 47행), 보관 「올린 글, JD, 발행본은 탈퇴 전에도 하나씩 지울 수 있고…」(75행), 권리 「하나씩 지우기: 올린 글, JD, 발행본은 각 화면에서 지울 수 있습니다.」(136행), Anthropic에 보내는 것 「발행본 내용(Catch, 자료 글, PDF에서 뽑은 글)…」(103행).
- 글을 바꾸면 `privacy-policy.md`(원문 사본)와 `privacy-policy.tsx`를 함께 고치고 `web/test/privacy-policy.test.mjs`의 원문 출처·SHA-256도 바꾼다. 원문은 #496 팀장 확정 문구이고 원문에 없는 문장을 더하지 않는다(README 7·20~22행).

### 8. 상단 메뉴와 주소

- `navItems` 상수 넷(내 자산·텍스트 자료·발행본·JD 관리), 현재 자리는 `pathname === href || pathname.startsWith(href + "/")`(`member-header.tsx` 15~20·31행).
- 발행 화면은 `/publications/new`, 상세는 `/publications/[publicationId]`(`routes.ts` 37~44행, `app/(member)/publications/`). 프리셋 주소를 `/publications/` 아래에 두면 「발행본」 메뉴도 현재 자리로 켜진다.

### 9. 마이그레이션 배치

- `api/src/database/migrations/<13자리 시각>-<이름>.ts`, 클래스 `<이름><시각>`, `name` 속성, `up`·`down`. SQL은 `queryRunner.query`로 직접. 제약 이름 `pk_<표>`, `uq_<표>_<칸들>`, `ck_<표>_<칸>_<8자리 해시>`, `fk_<표>_<칸>`, `ix_<표>_<칸>`. 회원 자료는 `REFERENCES "member_account" ON DELETE CASCADE`(마이그레이션 `1793162230851` 7~14행, `1794378756644` 7~13행).
- 엔티티는 데코레이터로 같은 제약을 적는다(`@Check`, `@ForeignKey(..., deleteWithParent)`, `@Unique`)(`publication.entity.ts`). 앱 기동은 마이그레이션을 돌리지 않는다(`database.config.ts` 47~48행). 배포 때 따로 돈다(feasibility 기록).
- 발행본에 연쇄되는 표: `published_item`(→ `published_pdf_page`), `publication_index`, `published_chunk`, `base_summary`, `jd_summary_run`(→ `jd_summary_result`)(외래 키 줄 검색).

### 10. 발행본을 읽는 다른 기능

- 받은 링크 읽기(MCP `read_shared_publication`): C-10 판정(grant 없음) → `readSnapshot` → 항목마다 `{ position, itemKind, title, content }`로 펴서 쪽을 만든다(`mcp-shared-publication-reader.ts` 36~46행, `mcp-shared-text.ts` 61~73행). 묶음 구분은 싣지 않는다.
- JD 요약: 사본을 읽지 않고 검색 조각만 쓴다(`jd-summary-processor.ts` 28~42행, `jd-generation-request.ts` 15~34행). 묶음 구분과 무관하다. `jd_summary_run`은 발행본에 연쇄 삭제된다.
- 질의응답: 스트림 전 확인 넷 사이에 사본을 읽고(`qna.controller.ts` 100~110·118~125행), `buildQnaSources`가 검색 결과에 같은 Catch의 기록 줄을 붙이고 머리글을 단다(`qna-sources.ts` 169~196행). 머리글에 Catch 제목·AI 초안·저장소 이름을 넣지 않는다(4행). 작성자 하루 합계 한도 300(`rag-answer-config.ts` 26행, #585).

## Handoff Summary

- **Intent-relevant finding**: 발행본은 항목마다 `position` 하나로만 순서를 갖고 묶음 칸이 없다(`publication.entity.ts` 58~89행, `published-snapshot.ts` 52~68행). `position`을 발행본 전체에 하나로 이어 매기면 조각 나누기(`chunker.ts` 55행)·요약 근거(`summary-sources.ts` 98행)·질의응답 머리글(`qna-sources.ts` 84·89~90행)·MCP cursor(`mcp-shared-page.ts` 92행)는 그대로 동작한다. 바뀌는 곳은 발행 요청 모양(`publish-input.ts` 113~124행 — 지금은 `items` 칸만 받고 그 밖은 400), 사본에 묶음(이름·순서·소속 항목)을 싣는 자리(새 칸 또는 표 + `readSnapshotIn` 170행), web 응답 검사 두 곳(`publications-api.ts` 107~119행, `recipient-api.ts` 27~67행), 사본 그리기(`snapshot-view.tsx` 249~278행)와 근거 이동(`recipient-screen.tsx` 66~73행·`publication-detail-screen.tsx` 131~138행), 탭 부품 일반화(`materials-view.tsx` 20~35행)다.
- **Risks / follow-up**:
  - 근거 이동은 DOM id로 항목을 찾으므로, 탭이 그 항목을 그리지 않으면 이동이 조용히 실패한다. 탭 바꾸기는 강조 대상을 정한 같은 상태 변경 안에서 해야 한다. 「답으로 돌아가기」를 위한 출처 단추 기록은 지금 없다.
  - 확인이 필요한 Catch는 지금 고르기 목록에서 고를 수 없다(`publish-sources.ts` 78행). 프리셋에 담게 하면 발행 때 409 `details.catchIds`로만 막히고, 응답은 Catch ID만 준다 — 「어느 프리셋의 어느 자료」는 web이 프리셋 내용으로 되짚어야 한다. 오류 필터는 `details`에서 `violations`·`existingRequestId`·`catchIds`만 복사한다(앞 저장소 `api-documentation.md` 공통 규칙).
  - 한 발행본은 같은 원본을 한 번만 받는다(`publish-input.ts` 101~103행). 같은 Catch가 두 프리셋에 담기면 지금 검사로는 400 `arrayUnique`다(입력 문서 §7 미결).
  - 기존 발행본을 지우는 마이그레이션은 발행본 PDF 사본 파일(`publicationPrefix`)을 지우지 못한다. 작성자 삭제 경로는 파일을 먼저 지운다(`publication-manage.service.ts` 141~147행). JD 요약 실행 기록도 연쇄로 지워진다.
  - 개인정보처리방침 글은 팀장 확정 원문 + SHA-256 시험으로 묶여 있어, 문장을 바꾸려면 확정 문구가 먼저 있어야 한다.
  - 자료 화면 탭 부품은 화살표 키가 없고 텍스트 쪽 tabpanel이 빠져 있다. 승인된 대략 화면(W5 접근성)은 화살표 키 이동을 더해 쓰기로 했으므로 자료 화면 탭도 함께 바뀐다.
  - 프리셋 주소를 `/publications/` 아래에 두면 상단 메뉴 「발행본」이 함께 켜진다(`member-header.tsx` 31행).
  - `ai-generation`(인용 요청·대조)은 이번 집중 범위 밖이라 `itemContext` 쓰는 줄만 확인했다. 프리셋 이름을 머리글에 넣으면 그 파일과 개인정보처리방침 4절(외부 AI로 보내는 것)이 함께 바뀐다.
