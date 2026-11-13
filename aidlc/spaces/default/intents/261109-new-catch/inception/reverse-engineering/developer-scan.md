# 개발자 코드 스캔 — CatchU (새 Catch, 전체 다시 스캔)

- 저장소: 프로젝트 폴더 자체(codekb 이름 `CatchU`, 등록되지 않은 루트 저장소)
- 기준 커밋: `a1d0fbb4ef70f57e690823ae8aa13fdd2df9eeff`
- 날짜: 2026-11-09
- 범위: 저장소 전체(`./`). 앞 저장소(`aidlc/spaces/default/codekb/CatchU/`)는 방향만 잡는 데 읽었고, 아래 내용은 모두 지금 코드에서 다시 확인했다.
- 실행하지 않은 것: 프로젝트의 시험·빌드·프로그램. 파일 읽기와 검색만 했다.

## Developer Code Scan Results

### Scan Coverage
- **Analyzed deeply**:
  - `api/src/app.module.ts`, `api/src/application.module.ts`, `api/src/main.ts`, `api/src/app.setup.ts` (앱 조립·기동 순서)
  - `api/src/catches/` (엔티티 다섯 개, 등록 `registration-service.ts`·`registration-batch.ts`·`new-catch-content.ts`, 본인 조회 `owner-catch-store.ts`·`owner-catch-response.ts`·`owner-catch-input.ts`·`catch-reader.ts`, 작성자 설명 `author-description-*`, `public-catch-store.ts`, `catches.module.ts`)
  - `api/src/publications/` (엔티티, `publish.service.ts`, `publish-input.ts`, `snapshot-builder.ts`, `published-snapshot.ts`, `publication-manage.service.ts`, `db-publication-access.ts`, `publication-access.ts`, `recipient-access.service.ts`, 두 컨트롤러, `publications.module.ts`, `publications-config.ts`)
  - `api/src/published-index/chunker.ts`, `published-index-writer.ts`
  - `api/src/rag-answer/summary-sources.ts`
  - `api/src/claude-mcp/mcp-material-reader.ts`, `mcp-page.ts`
  - `api/src/worker-context/worker-context.service.ts`(소속 커밋을 넘기는 부분과 응답 모양), `worker-context.types.ts`
  - `api/src/analysis-receiver/receiver.types.ts`, `api/src/analysis-intake/analysis-intake.controller.ts`, `api/src/analysis-queue/queue-spec.ts`, `api/src/result-application/result-application.service.ts`(앞부분)
  - `api/src/database/migrations/` (표 목록과 `catch_asset`·`commit_assignment` 변경 이력)
  - `api/contracts/repository-analysis/worker-messages.yaml`
  - `api/README.md`, `api/docs/environment.md`, `api/package.json`
  - `worker/app/collection/records.py`, `worker/app/collection/evidence.py`
  - `worker/app/candidates/record_text.py`, `worker/app/candidates/build.py`(모듈 설명과 앞 300줄), `worker/app/candidates/grouping.py`(모듈 설명)
  - `worker/app/generation/title.py`(파일 종류 분류 `classify`)
  - `worker/app/processing/generation.py`(앞 130줄, 후보 자료 모양)
  - `worker/README.md`, `worker/pyproject.toml`
  - `web/src/features/assets/assets-view.tsx`, `types.ts`, `catch-api.ts`, `author-description-panel.tsx`
  - `web/src/features/publications/snapshot-view.tsx`, `publish-sources.ts`, `publish-view.tsx`(앞 150줄)
  - `web/src/features/recipient/recipient-view.tsx`, `recipient-api.ts`(사본 칸 고르기)
  - `web/src/lib/routes.ts`, `web/src/lib/github-source-url.ts`, `web/next.config.ts`, `web/package.json`, `web/README.md`(검사·환경변수·파일 역할·페이지 주소)
  - `docs/ai-dlc-input-catch/CatchU_새_Catch_입력.md` §4~§9 (이 intent의 입력)
- **Skimmed only**:
  - `api/src/` 나머지 폴더(파일 머리 설명·데코레이터·내보낸 이름만 봄): `ai-consent/`, `ai-generation/`, `ai-run/`, `analysis-deadline/`, `analysis-intake/`(컨트롤러 밖), `analysis-queue/`(규격 밖), `analysis-receiver/`(자료형 밖), `auth/`, `common/`, `daily-run-limit/`, `database/`(마이그레이션 밖), `file-storage/`, `github-connection/`, `google-login/`, `health/`, `materials/`, `member-analysis/`, `member-profile/`, `member-repositories/`, `rag-answer/`(근거 만들기 밖), `share-links/`, `withdrawal/`, `claude-mcp/`(자료 읽기 밖), `result-application/`(앞부분 밖)
  - `api/contracts/repository-analysis/common.yaml`, `api/docs/`, `api/CONVENTIONS.md`, `api/scripts/`, `api/test/`(파일 목록)
  - `worker/app/` 나머지(파일 머리 설명): `collection/`(records·evidence 밖), `candidates/`(identity·same_change, grouping 본문), `generation/`(title 밖), `judgement/`, `consumer/`, `processing/`(generation 앞부분 밖), `request_context/`, `contract/`, `redact.py`, `main.py`
  - `worker/docs/`, `worker/tests/`(파일 목록), `worker/fixtures/`
  - `web/src/` 나머지 기능 폴더와 공통 부품(파일 목록·머리 설명): `app/`, `components/`, `lib/`(routes·github-source-url 밖), `features/` 가운데 assets·publications·recipient 밖
  - `web/test/`, `web/scripts/`, `web/public/`
  - `deploy/`(README 두 개의 머리와 파일 목록), `.github/workflows/`(작업 이름과 단계), `.github/scripts/`, `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`, `.github/dependabot.yml`
  - `docs/`(파일 목록. `docs/ai-dlc-input-catch/` 밖은 열지 않음), `docs/queue-verification/`
  - `scripts/`(팀이 쓴 AI-DLC 호환 도우미 둘, 제품 코드 아님)
  - 루트 `README.md`, `AGENTS.md`의 팀 절(AI-DLC 관리 블록 밖), `.dockerignore`
- **Left out**:
  - `node_modules/`(api·web·docs/queue-verification)
  - `.venv/`(worker·docs/queue-verification)
  - `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`
  - `dist/`(api 빌드 결과), `.next/`(web 빌드 결과), `coverage/`
  - `worker/uv.lock`, `api/package-lock.json`, `web/package-lock.json`, `docs/queue-verification/uv.lock`·`package-lock.json`(잠금 파일, 내용은 열지 않음)
  - `web/public/landing/PretendardVariable.woff2`·`catchu-logo-transparent-v3.png`, `web/src/features/assets/docs/images/*.jpg`(이진 파일)
  - `.local-handoffs/`, `handoff/`(로컬 메모)
  - AI-DLC 설치와 작업 공간: `.claude/`, `.codex/`, `.agents/`(모두 `aidlc` 이름 스킬), `aidlc/`, `aidlc.settings.local.json`, `AGENTS.md`의 AI-DLC 관리 블록, `.gitignore`의 AI-DLC 관리 블록, `.mcp.json`의 AI-DLC MCP 서버

### Packages Found
- `web` — Next.js 앱(배포 단위) — TypeScript·React — 구직자 화면과 면접관(받은 사람) 링크 화면
- `api` — NestJS 서버(배포 단위) — TypeScript — 인증·회원·분석 접수·결과 반영·Catch·발행·검색·질의응답·Claude 연결
- `worker` — FastAPI 겉틀 + 큐 소비자(배포 단위) — Python 3.12 — GitHub 수집·작업 단위 판정·AI 설명·판정
- `api/contracts/repository-analysis` — 공유 계약(YAML) — OpenAPI 3.0.3 형식 — api와 worker가 함께 읽는 메시지 스키마
- `deploy` — 운영 이미지·한 호스트 실행·EKS 설정 — Docker Compose·셸·Kubernetes YAML
- `docs/queue-verification` — 큐 기술 검증 키트(9~10월) — Node·Python — BullMQ Node↔Python 호환 확인
- `scripts` — AI-DLC 호환 도우미 — TypeScript·Node — 제품과 무관

### Build System
- **Type**: npm(api·web, 루트 workspace 없음), uv(worker, `package = false`), Docker 다단계 빌드
- **Config Files**: `api/package.json`, `api/tsconfig.json`, `api/tsconfig.build.json`, `api/eslint.config.mjs`, `web/package.json`, `web/tsconfig.json`, `web/eslint.config.mjs`, `web/next.config.ts`, `web/.npmrc`, `worker/pyproject.toml`, `worker/.python-version`, `web/.node-version`, `api/Dockerfile`, `web/Dockerfile`, `worker/Dockerfile`, `.dockerignore`, `deploy/compose.single.yaml`, `deploy/compose.local-db.yaml`
- **Build Dependencies**: web → api(HTTP `/v1`, 빌드 의존 없음). api → `api/contracts/repository-analysis/*.yaml`(실행 때 읽음, 이미지에 복사). worker → 같은 YAML(시험·실행 때 읽음). api 시험 → `worker/fixtures/m1-synthetic`(합성 결과 세트 공유). 세 서비스 사이에 코드 import는 없다.

### APIs Discovered
- REST(Nest 컨트롤러) — `api/src/**/*.controller.ts` 20개 — 경로 51개(`/v1` 아래 50개 + `GET /health`, MCP·SSE 포함)
- MCP(Streamable HTTP) — `api/src/claude-mcp/mcp.controller.ts` — `/v1/mcp` POST·GET·DELETE, 도구 2개(`list_my_catches`, `list_my_text_materials`) + OAuth 주소(기동 때 앱 루트에 붙임)
- SSE — `api/src/rag-answer/qna.controller.ts` — `POST /v1/public/links/:token/questions`
- 큐 메시지(BullMQ) — `api/src/analysis-queue/queue-spec.ts`, `worker/app/consumer/queues.py` — 큐 `analysis-requests`(Request v2), `worker-messages`(ProcessingEvent v2·Result v3), `ai-run`(api 안 백그라운드 작업 2종)
- worker 내부 조회 — `GET /v1/internal/analysis-attempts/:attemptId/context`(서비스 키, 켤 때만 등록)
- worker HTTP — `worker/app/main.py` — `GET /health` 하나
- 경로 표는 `api-documentation.md`에 한 번만 적었다.

### Frameworks & Libraries
- NestJS — 12.0.4 — api 웹 틀
- TypeORM — 1.1.1 (+ `pg` 8.23.0, PostgreSQL 16 + pgvector 0.8.7) — DB 접근·마이그레이션
- BullMQ — 6.3.11(api) / 3.3.0(worker), ioredis 6.0.0 / redis-py 7.4.1 — 큐(Valkey 8.1.6)
- `@anthropic-ai/sdk` — 0.133.0(api), `anthropic` 1.13.0(worker) — Claude 호출
- `openai` — 3.46.0(worker) — 판정 공급자(Decisions)
- `@modelcontextprotocol/sdk` — 1.32.2 — Claude 연결
- ajv 8.20.0·yaml 2.9.1(api), jsonschema 4.26.0·PyYAML 6.0.3(worker) — 계약 검사
- jose 6.2.12 — Access JWT
- Next.js 16.4.1, React 19.2.8 — web
- FastAPI 0.141.1, Uvicorn 0.53.0, httpx2 2.13.0 — worker
- 전체 판본 표는 `technology-stack.md`에 한 번만 적었다.

### Test Coverage
- **Test Directories**: `api/test/`(168개, `*.test.cjs`, 빌드한 `dist/`를 시험), `web/test/`(67개, `*.test.mjs`), `worker/tests/`(54개, pytest), `deploy/**/*.test.sh`
- **Test Frameworks**: Node 기본 `node:test`(api·web), pytest 9.1.1(worker), bash 시험 스크립트(deploy)
- **Coverage Config**: present — api `npm run test:coverage`(Node 기본 커버리지, `TEST_COVERAGE_INCLUDE`), web `npm run test:coverage`, worker `[tool.coverage.run]`(pytest-cov 7.1.0). CI는 커버리지를 재지 않는다.

### Code Quality Indicators
- **Linting**: api ESLint 10(`api/eslint.config.mjs`, 경고도 실패), web ESLint 9 + `eslint-config-next`(`web/eslint.config.mjs`), worker Ruff 0.16.8(`[tool.ruff]`, 규칙 E4·E7·E9·F·I·UP·B)와 mypy strict(`app`·`tests`)
- **CI/CD**: `.github/workflows/ci.yml`(changes·web·api·worker·deps-audit, `dev`와 `intent/**` 대상), `.github/workflows/images.yml`(이미지 검사·CD 스크립트 시험), `.github/workflows/deploy-dev-server.yml`(main push → 개발 서버 배포), `.github/dependabot.yml`
- **Documentation**: 서비스마다 README와 기능별 문서(`api/docs/` 44개, `worker/docs/` 15개, `web/src/features/*/README.md`). 코드 주석이 근거 결정·요구사항 ID를 촘촘히 적는다(한국어). 문서 크기 상한 검사(`check-doc-sizes.sh`)가 있다.

### Technical Debt Signals
- `api/src/catches/public-catch-store.ts`: 제품 코드에서 쓰는 곳이 없다(10월 받은 사람 모듈을 지운 뒤 남음). `CatchesModule`이 공급·내보내고 시험만 부른다.
- `api/src/share-links/share-link.entity.ts`와 `share_link` 표: 10월 공유 링크를 발행본으로 대체한 뒤에도 남아 있다(코드 주석의 OQ-U4-3 결정 대기). 같은 폴더의 도구(토큰·비밀번호·시도 제한)는 발행본이 계속 쓴다.
- `catch_asset`에 만든 시각 칸이 없다. 본인 Catch 목록은 `catch_id`(무작위 UUID) 오름차순으로 나온다(`owner-catch-store.ts` 37~38행). 받은 사람 쪽 옛 목록도 같다.
- 사본 모양(C-07)을 여러 곳이 따로 검사·복사한다: `api/src/published-index/chunker.ts`(105~128행), `api/src/rag-answer/summary-sources.ts`(43~62행), `web/src/features/publications/publications-api.ts`(62~67행), `web/src/features/recipient/recipient-api.ts`(27~44행, 칸을 하나씩 골라 새 객체를 만든다). 칸을 더하면 이 넷과 `published-snapshot.ts`·`snapshot-builder.ts`를 함께 고쳐야 한다.
- 큰 파일: `worker/app/candidates/grouping.py` 1,880줄, `worker/app/collection/relations.py` 1,584줄, `worker/app/generation/flow.py` 943줄, `worker/app/candidates/build.py` 805줄, `worker/app/generation/claude.py` 786줄. 한 파일에 판정 단계가 여럿 있다(모듈 설명이 단계를 나눠 적는다).
- 주석의 판단 근거가 매우 길고 이슈·결정 번호가 촘촘하다. 정본 문서와 어긋날 위험이 있다(같은 규칙을 여러 곳에 적음).
- 린트 억제는 worker에 4곳뿐이다(`processing/collection_file.py` 45행, `processing/confirm.py` 390·430행, `consumer/parent.py` 422행). TODO·FIXME 표시는 제품 코드에 없다.
- 시험용 메모리 구현이 `src`에 있다: `api/src/publications/in-memory-publication-access.ts`, `api/src/analysis-receiver/dev-analysis-injection.ts`. 앱 모듈에는 넣지 않는다(주석으로 막음).

## Handoff Summary
- **Intent-relevant finding**: 새 Catch가 바꿀 다섯 자리의 지금 모양.
  1. 작성자 설명은 `catch_asset.author_description`(text, 4,000자 상한은 `api/src/catches/author-description-input.ts` 4행)과 `author_description_updated_at` 두 칸이며, 함께 NULL이거나 함께 값이다(`catch-asset.entity.ts` 40행 CHECK). 저장은 `AuthorDescriptionStore.save`의 `UPDATE` 하나(`author-description-store.ts` 53~59행). 칸 제목별 입력은 이 한 칸 안의 글 모양만 바꾸면 되며 DB 변경은 없다.
  2. 본인 Catch 목록 응답(`OwnerCatchResponse`, `owner-catch-response.ts` 53~78행)에 작성자 설명이 없고, 조회 SQL(`catch-reader.ts` 16~26행)도 그 칸을 읽지 않는다. 「설명 씀/안 씀」 걸러 보기는 응답 칸·SQL·web `isCatch`(`web/src/features/assets/catch-api.ts` 22~35행)·`CatchAsset` 타입을 함께 바꿔야 한다. 정렬 기준이 될 시각 칸이 `catch_asset`에 없다(마이그레이션 `1790600000000` 9~48행).
  3. 발행 사본 `CatchSnapshot`(`published-snapshot.ts` 6~14행)에는 저장소 이름·작성 시점·조회 한계 칸이 없다. 사본은 `buildCatchSnapshot`(`snapshot-builder.ts` 32~43행)이 잠근 원본에서 만들고, 발행 SQL(`publish.service.ts` 67~75행)은 저장소 이름을 읽지 않는다(`analysis_request.repository_id`만). 근거의 `coverageLimits`는 사본에 복사하지 않는다(36~38행).
  4. 받은 사람 화면은 사본 칸을 web에서 다시 고른다(`recipient-api.ts` 31~42행). 새 사본 칸은 여기서 넣지 않으면 조용히 사라진다. 작성자 발행본 상세와 받은 사람 화면은 같은 `PublishedSnapshotView`(`snapshot-view.tsx` 91~146행)를 쓴다. 작성자 설명 안의 GitHub 주소만 링크가 되며, 링크 판별이 한글에서 주소를 끊는다(`web/src/lib/github-source-url.ts` 15~18행).
  5. worker의 규칙 사실 재료는 이미 모은다: 커밋마다 `authored_at`·`committed_at`, 파일마다 `status`(renamed 포함)·`previous_path`·`patch`(`worker/app/collection/records.py` 43~78행). 파일 내용 식별값(blob sha)은 남기지 않는다. 시험 파일 분류는 `worker/app/generation/title.py` 37~43·131행의 `classify`가 있다. 작업 사실은 지금 1~2줄이고 CatchU가 센 숫자·날짜를 쓰지 않는다는 규칙이 있다(`build.py` 27~36행). 결과 계약 `Candidate`는 `additionalProperties: false`(`worker-messages.yaml` 72~113행)라 새 칸은 Result 판본을 올리고 api·worker를 함께 배포해야 한다.
- **Risks / follow-up**:
  - 발행본은 jsonb 사본이라 이미 발행한 사본에는 새 칸이 없다. 사본을 읽는 다섯 곳(위 Technical Debt Signals)이 칸 없음을 견뎌야 한다. `chunker.ts`는 모르는 칸은 무시하지만 있던 칸을 빼면 발행이 실패한다.
  - 작성자 설명 글 모양(칸 제목)을 바꾸면 받은 사람 AI 근거(`authorDescription` 한 필드 = 조각 `AUTHOR_MATERIAL`)와 MCP 도구 응답(`mcp-page.ts` 112~117행)에도 칸 제목 글자가 그대로 들어간다.
  - 고지 판본 `catchu-real-analysis-notice-v3`(`api/src/analysis-intake/analysis-notice.ts` 25행)과 AI 동의 판본 `2026-11-v2`(api·web 두 곳 상수)는 문구를 바꾸면 함께 올려야 한다.
  - 소속 기록 `commit_assignment`가 재분석 때 이미 쓴 커밋을 빼므로(`worker-context.service.ts` 114~121·172행, `grouping.py` 7단계), 3단계 규칙 사실을 기존 Catch에 채우려면 「Catch 재생성」이나 DB 초기화가 필요하다(입력 문서 §7과 같은 판단).
  - 이 스캔은 시험을 돌리지 않았다. 지금 시험이 통과하는지는 다음 단계에서 확인해야 한다.
