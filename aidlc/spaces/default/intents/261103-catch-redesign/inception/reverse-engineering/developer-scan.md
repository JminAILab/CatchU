# 역공학 개발자 스캔 — Catch 개편(261103-catch-redesign)

- 저장소: `CatchU`(작업 공간 루트, 등록되지 않은 루트 저장소)
- 기준 커밋: `9923226cdd9992befce3b1da8ff0d1e94ae80ba2`(작업 브랜치에 통합 브랜치 `a0d56760`을 합친 merge commit)
- 범위: 기존 저장소(CURRENT)에 합치는 집중 스캔(`kind: partial`). 앞 실행(`6cd0f160`)의 깊은 범위 45개는 그대로 이어 두고, 이번에 292f443d..a0d56760 가운데 U4 #461의 Catch 작성자 설명·텍스트 자료와 api 안내 문서 둘을 더 깊게 읽었다. #466(Redis 오류 감시)은 범위 밖이다.
- 방법: 파일 도구로 폴더를 하나씩 열고 읽었다. 바뀐 파일은 `git diff 292f443d a0d56760`으로 찾았다. 프로젝트의 시험·빌드·프로그램은 실행하지 않았다.

## Developer Code Scan Results

### Scan Coverage
- **Analyzed deeply**:
  - (앞 실행에서 이어 둠) worker/app/candidates/build.py
  - (앞 실행에서 이어 둠) worker/app/candidates/identity.py
  - (앞 실행에서 이어 둠) worker/app/collection/evidence.py
  - (앞 실행에서 이어 둠) worker/app/collection/limits.py
  - (앞 실행에서 이어 둠) worker/app/collection/records.py
  - (앞 실행에서 이어 둠) worker/app/contract/worker_messages.py
  - (앞 실행에서 이어 둠) worker/app/generation/flow.py
  - (앞 실행에서 이어 둠) worker/app/generation/limits.py
  - (앞 실행에서 이어 둠) worker/app/generation/material.py
  - (앞 실행에서 이어 둠) worker/app/generation/outcome.py
  - (앞 실행에서 이어 둠) worker/app/generation/provider.py
  - (앞 실행에서 이어 둠) worker/app/generation/render.py
  - (앞 실행에서 이어 둠) worker/app/generation/request.py
  - (앞 실행에서 이어 둠) worker/app/generation/title.py
  - (앞 실행에서 이어 둠) worker/app/processing/generation.py
  - (앞 실행에서 이어 둠) worker/app/processing/live.py
  - (앞 실행에서 이어 둠) worker/app/processing/pipeline.py
  - (앞 실행에서 이어 둠) worker/app/processing/request_check.py
  - (앞 실행에서 이어 둠) worker/app/processing/result.py
  - (앞 실행에서 이어 둠) worker/docs/candidate-text.md
  - (앞 실행에서 이어 둠) api/src/analysis-intake/analysis-notice.ts
  - (앞 실행에서 이어 둠) api/src/analysis-queue/analysis-request.dispatcher.ts
  - (앞 실행에서 이어 둠) api/src/analysis-receiver/analysis-registration.service.ts
  - (앞 실행에서 이어 둠) api/src/analysis-receiver/receiver.types.ts
  - (앞 실행에서 이어 둠) api/src/analysis-receiver/repository-registration.port.ts
  - (앞 실행에서 이어 둠) api/src/analysis-receiver/worker-message.validator.ts
  - (앞 실행에서 이어 둠) api/src/result-application/registration.port.ts
  - (앞 실행에서 이어 둠) api/src/result-application/result-application.service.ts
  - (앞 실행에서 이어 둠) api/src/catches/new-catch-content.ts
  - (앞 실행에서 이어 둠) api/src/catches/registration-batch.ts
  - (앞 실행에서 이어 둠, 이번에 등록·작성자 설명 관계로 다시 읽음) api/src/catches/registration-service.ts
  - (앞 실행에서 이어 둠) api/src/catches/entities/candidate-registration.entity.ts
  - (앞 실행에서 이어 둠, 이번에 작성자 설명 칸으로 다시 읽음) api/src/catches/entities/catch-asset.entity.ts
  - (앞 실행에서 이어 둠) api/src/catches/entities/catch-evidence.entity.ts
  - (앞 실행에서 이어 둠) api/src/withdrawal/withdrawal.service.ts
  - (앞 실행에서 이어 둠) api/src/ai-consent/ai-consent.gate.ts
  - (앞 실행에서 이어 둠) api/src/worker-context/worker-context.controller.ts
  - (앞 실행에서 이어 둠) api/src/worker-context/worker-context.service.ts
  - (앞 실행에서 이어 둠) api/src/worker-context/worker-context.types.ts
  - (앞 실행에서 이어 둠) api/src/publications/published-snapshot.ts
  - (앞 실행에서 이어 둠, 이번에 탈퇴 표 목록으로 다시 읽음) api/docs/member-withdrawal-deletion.md
  - (앞 실행에서 이어 둠) web/src/features/recipient/recipient-format.ts
  - (앞 실행에서 이어 둠) web/src/features/assets/types.ts
  - (앞 실행에서 이어 둠) web/src/components/ai-consent/ai-consent-notice.ts
  - (앞 실행에서 이어 둠) web/src/components/ai-consent/README.md
  - (이번 실행) api/src/catches/author-description-input.ts
  - (이번 실행) api/src/catches/author-description-store.ts
  - (이번 실행) api/src/catches/author-description.controller.ts
  - (이번 실행) api/src/catches/catches.module.ts
  - (이번 실행) api/src/materials
  - (이번 실행) web/src/features/assets/author-description-api.ts
  - (이번 실행) web/src/features/assets/author-description-editor.tsx
  - (이번 실행) web/src/features/assets/author-description-panel.tsx
  - (이번 실행, 앞 실행의 훑음에서 올림) web/src/features/assets/assets-view.tsx
  - (이번 실행) web/src/features/materials
  - (이번 실행) api/docs/publications.md
  - (이번 실행) api/docs/withdrawal.md
- **Skimmed only**:
  - (앞 실행에서 이어 둠) worker/app/candidates/grouping.py (모듈 설명 1~290행과 「6. 나누기와 단위 목록」 1620~1950행만 읽음)
  - (앞 실행에서 이어 둠) worker/app/candidates/same_change.py (정의 목록만)
  - (앞 실행에서 이어 둠) worker/app/collection/collect.py (1~200행)
  - (앞 실행에서 이어 둠) worker/app/generation/claude.py (머리 설명·상수·정의 목록)
  - (앞 실행에서 이어 둠) worker/app/generation/redact.py (1~120행)
  - (앞 실행에서 이어 둠) worker/app/generation/response.py (머리 설명)
  - (앞 실행에서 이어 둠) worker/app/consumer/ (child.py의 LIVE 조립, settings.py의 키 이름만)
  - (앞 실행에서 이어 둠) worker/app/request_context/ (정의 목록만)
  - (앞 실행에서 이어 둠) worker/docs/ (candidate-decision.md 「나누기」, generation.md 「경계」~「보내기 전」, 나머지는 제목만)
  - (앞 실행에서 이어 둠) worker/tests/ (파일 이름만)
  - (앞 실행에서 이어 둠) worker/pyproject.toml, worker/.env.example
  - (앞 실행에서 이어 둠) api/contracts/repository-analysis/ (스냅샷 밖. worker-messages.yaml을 읽고 common.yaml은 Draft·Reflection·Failure만 찾음)
  - (앞 실행에서 이어 둠) api/src/analysis-intake/analysis-intake.service.ts (1~90행)
  - (앞 실행에서 이어 둠) api/src/published-index/chunker.ts (1~110행, 이번에 `authorDescription`·`TEXT_MATERIAL` 줄 검색)
  - (앞 실행에서 이어 둠) api/src/catches/ 의 응답·조회 파일(owner-catch-response.ts·public-catch-store.ts는 title·authorDescription 처리만 검색)
  - (앞 실행에서 이어 둠) api/src/publications/ 의 나머지 파일(title 검색만)
  - (앞 실행에서 이어 둠) api/src/recipient/ (파일 목록만)
  - (앞 실행에서 이어 둠) api/docs/ (폴더 단위. repository-analysis-u7.md·catch-registration-rules.md·analysis-intake.md·analysis-queue.md·analysis-receiver.md·result-application.md는 제목과 재분석 문단만)
  - (앞 실행에서 이어 둠) web/src/features/recipient/recipient-screen.tsx (95~274행), recipient-api.ts (필드 목록), recipient.module.css (제목 꾸밈 검색)
  - (앞 실행에서 이어 둠, 이번에 바뀐 부분 확인) web/src/features/assets/assets.module.css (제목 꾸밈 검색, `.descriptionInput` 추가 확인)
  - (앞 실행에서 이어 둠) .github/workflows/ci.yml, api/package.json, web/package.json (작업·명령·주요 판본 검색. 이번 범위에서 바뀌지 않음)
  - (이번 실행) api/src/catches/owner-catch-input.ts (import한 `catchIdInput`·`isUuid`·`emptyCatchQuery` 이름만)
  - (이번 실행) api/src/database/migrations/1793162230851-CreatePublicationTables.ts, 1793162230852-AddCatchAuthorDescription.ts (`text_material`·`author_description` 줄 검색)
  - (이번 실행) api/src/app.module.ts (`MaterialsModule` 등록 diff)
  - (이번 실행) api/src/claude-mcp/mcp-material-reader.ts, api/src/rag-answer/summary-sources.ts (`author_description`·`text_material` 읽는 줄 검색)
  - (이번 실행) api/test/catches/author-description-api.test.cjs (시나리오 머리와 S2 검색), api/test/materials/text-materials-api.test.cjs (파일 이름과 docs 설명)
  - (이번 실행) web/src/features/assets/assets-connected.tsx, assets-member-page.tsx (바뀐 부분 diff)
  - (이번 실행) web/src/features/assets/README.md (「Catch 작성자 설명 편집」 절 diff)
  - (이번 실행) web/src/lib/save-outcome.ts (전체, 짧음), web/src/lib/routes.ts, web/src/components/header/member-header.tsx (diff)
  - (이번 실행) web/src/app/(member)/materials/page.tsx (diff)
- **Left out**:
  - node_modules/
  - .venv/
  - __pycache__/
  - .pytest_cache/
  - dist/
  - .next/
  - worker/uv.lock (잠금 파일)
  - .claude/, .kiro/, .codex/, .cursor/, .opencode/, .aidlc/, aidlc/ (AI-DLC 설치·작업 공간. 292f443d..a0d56760에 든 U4 설계 기록도 여기에 해당)

### Packages Found
- worker — 서비스 — Python 3.12.10(FastAPI·BullMQ 소비자) — GitHub 수집, 후보 묶음·작업 동일성, 설명 초안·질문·제목 생성, 결과 메시지 조합
- api — 서비스 — TypeScript(NestJS 12) — 분석 접수·고지·동의, 큐 보내기·받기, 결과 수신·반영, Catch 등록·조회·작성자 설명 저장, 텍스트 자료, 발행·검색 조각, 탈퇴, worker 맥락 조회
- web — 앱 — TypeScript(Next.js 16, React 19) — 구직자 Catch 목록·상세와 작성자 설명 편집(assets), 텍스트 자료 화면(materials, `/materials`), 받은 사람 화면(recipient), 외부 AI 첫 이용 동의 창(ai-consent)
- api/contracts/repository-analysis — 계약 — OpenAPI 3.0 YAML — api와 worker가 함께 읽는 분석 요청·결과 메시지 스키마 v2

### Build System
- **Type**: worker는 uv(`pyproject.toml`, `uv.lock`), api·web은 npm(`package.json`). 컨테이너 이미지는 각 서비스 `Dockerfile`.
- **Config Files**: worker/pyproject.toml(ruff·mypy strict·pytest·coverage 설정 포함), api/package.json, web/package.json, .github/workflows/ci.yml. 292f443d..a0d56760은 이 설정 파일들을 바꾸지 않았다.
- **Build Dependencies**: worker의 `app/contract/worker_messages.py`가 `api/contracts/repository-analysis/*.yaml`을 저장소 경로로 직접 읽는다(복사하지 않음). api의 `analysis-receiver/worker-message.validator.ts`도 같은 YAML을 Ajv로 읽는다. 두 서비스가 한 계약 파일에 묶여 있다. U4 작성자 설명·텍스트 자료는 이 계약과 무관하다.

### APIs Discovered
- 큐 메시지(BullMQ/Redis) — api `analysis-queue/analysis-request.dispatcher.ts` → worker 소비자 — 분석 요청(Request) 1종, worker → api 진행 알림(ProcessingEvent)·결과(Result), api → worker 수신 확인(ResultReceipt) 3종
- 내부 HTTP — api `worker-context/worker-context.controller.ts` — `GET /internal/analysis-attempts/:attemptId/context` 1개(worker 전용 인증)
- 회원 HTTP(작성자 설명, 계약 C-14) — api `catches/author-description.controller.ts` — `GET`·`PUT /v1/catches/{catchId}/description` 2개
- 회원 HTTP(텍스트 자료, 계약 C-13) — api `materials/text-materials.controller.ts` — `GET`·`POST /v1/text-materials`, `GET`·`PUT`·`DELETE /v1/text-materials/{id}` 5개
- 생성 제공자 경계(Python Protocol) — worker `generation/provider.py` — `GenerationProvider.complete(ProviderRequest) -> str` 1개, 목적 `GENERATE`·`REWRITE_TITLE`
- 외부 API — worker `generation/claude.py` — Anthropic Messages API(모델 `claude-haiku-5-5`, 추론 위치 `us`, 재시도 0)
- 화면이 쓰는 API 모양 — web `features/recipient/recipient-api.ts`의 `PublicCatch`(title·workFacts·subjectContribution·evidence·draft), web `features/assets/types.ts`의 `CatchAsset`, web `features/assets/author-description-api.ts`의 `AuthorDescription`, web `features/materials/materials-api.ts`의 `TextMaterial`·`TextMaterialPage`

### Frameworks & Libraries
- anthropic (Python) — 1.13.0 — Claude 생성 호출
- bullmq (Python) — 3.3.0 — worker 큐 소비자
- fastapi — 0.141.1 — worker 상태 확인
- jsonschema — 4.26.0 / referencing 0.37.0 — worker 쪽 계약 검사
- httpx2·httpcore2 — 2.13.0 — GitHub·Claude HTTP 전송(마감 제어)
- @nestjs/core — 12.0.4 — api 프레임워크
- typeorm — 1.1.1 / pg 8.23.0 — api 영속(PostgreSQL). U4 저장소는 `manager.query` SQL을 쓴다
- bullmq (Node) — 6.3.11 — api 큐 보내기·받기
- ajv — 8.20.0 — api 쪽 계약 검사
- @anthropic-ai/sdk — 0.133.0 — api의 받은 사람 쪽 AI(요약·질의응답)
- next — 16.4.1 / react — 19.2.8 — web
- OpenAI SDK — 없음(어느 서비스에도 없다)
- U4 #461은 새 라이브러리를 더하지 않았다(`node:crypto`로 커서 범위 해시)

### Test Coverage
- **Test Directories**: worker/tests/(시험 파일 35개와 시나리오·합성 대역), api/test/(스냅샷 밖, CI의 `npm test`. U4가 `test/catches/author-description-api.test.cjs`·`test/materials/text-materials-api.test.cjs`를 더함), web/test/(`node --test test/*.test.mjs`. U4가 `author-description.test.mjs`·`author-description-editor.test.mjs`·`assets-description-reload.test.mjs`·`materials.test.mjs`·`materials-screen.test.mjs`·`unsaved-traverse-guard.test.mjs`를 더함)
- **Test Frameworks**: pytest 9.1.1 + pytest-cov(worker), Node 내장 `node --test`(api·web)
- **Coverage Config**: present(worker/pyproject.toml `[tool.coverage.run] source = ["app"]`). api·web은 이 스캔에서 확인하지 않았다.

### Code Quality Indicators
- **Linting**: worker ruff(`E4,E7,E9,F,I,UP,B`)·ruff format·mypy strict(pyproject.toml). api eslint `--max-warnings=0`·typecheck. web `npm run check`.
- **CI/CD**: .github/workflows/ci.yml(changes·docs-size·web·api·worker·deps-audit 작업), deploy-dev-server.yml, images.yml
- **Documentation**: 모듈 머리 설명이 아주 자세하다(팀장 결정 날짜·이슈 번호·업무 규칙 ID를 근거로 단다). worker/docs·api/docs·web 기능 폴더 README에 기능별 문서가 있고, 문서 크기 상한 36,000 B를 CI(docs-size)가 본다. 스캔 범위의 TODO·FIXME·HACK·`eslint-disable` 표시는 0건이다.

### Technical Debt Signals
- (앞 실행) worker/app/candidates/grouping.py는 88,725 B의 한 파일에 소속·병합·같은 변경·배정·커밋 묶음·나누기 6단계가 모두 있다(관계 조회 relations.py도 75,786 B).
- (앞 실행) 계약 판본 `"2"`가 여러 곳에 문자열로 박혀 있다: worker/app/processing/pipeline.py 66행, worker/app/processing/result.py 79행, api/src/analysis-queue/analysis-request.dispatcher.ts 66행, api/src/analysis-receiver/receiver.types.ts 19·59·76행, worker-messages.yaml `enum: ["2"]`.
- (앞 실행, 행 번호 갱신) 자동 생성 안내 문장이 두 화면에 따로 복제돼 있다: web/src/features/recipient/recipient-format.ts 18~23행(`generatedNotice`)과 web/src/features/assets/assets-view.tsx 80~90행(`GeneratedContentNotice`).
- (앞 실행) 문서가 크기 상한에 가깝다: worker/docs/generation.md 35,312 B, worker/docs/relation-collection.md 35,793 B, worker/docs/candidate-decision.md 34,053 B(상한 36,000 B).
- (앞 실행) worker/app/candidates/grouping.py 모듈 설명 40~45행과 worker/docs/candidate-decision.md 「나누기」는 이슈 조회가 허용된 요청에서 한 PR을 이슈로 나누는 규칙을 적고 있어, 이 intent의 결정(나누지 않음)과 어긋난다.
- (앞 실행) api의 고지 상수(`AI_NOTICE_VERSION`)와 web의 같은 상수가 손으로 맞춰진다(api/src/ai-consent/ai-consent.gate.ts 13행, web/src/components/ai-consent/ai-consent-notice.ts 8행). 시험(web `test/u2-consent.test.mjs`)이 대조한다고 README가 적는다.
- (이번 실행) U4 길이 상한이 api·web에 따로 있다: 작성자 설명 4,000(api/src/catches/author-description-input.ts 4행, web/src/features/assets/author-description-api.ts 5행, author-description-panel.tsx 6행), 텍스트 자료 제목 100·본문 20,000(api/src/materials/text-material-input.ts 5행, web/src/features/materials/materials-api.ts 5행).
- (이번 실행) api 저장소 둘이 회원 확인(`assertMemberExists`)·`ownerId`·UUID 검사를 각자 가진다(api/src/catches/author-description-store.ts 66~76행, api/src/materials/text-material-store.ts 125~147행, text-material-input.ts 9·25행).
- (이번 실행) web/src/features/assets/README.md가 27,540 B로 커졌다(상한 36,000 B).

## Handoff Summary
- **Intent-relevant finding**:
  - (이번 실행) **작성자 설명은 Catch 행의 두 칸이다.** `catch_asset.author_description`(text)·`author_description_updated_at`(timestamptz)이고, 둘이 함께 NULL이거나 함께 값이도록 CHECK가 막는다(api/src/catches/entities/catch-asset.entity.ts 38·97~105행, 마이그레이션 `1793162230852-AddCatchAuthorDescription`). 따로 된 표나 외래 키가 없으므로 설명은 Catch ID 하나, 곧 (회원, `work_identity`) 유일 키 하나에 묶인다(같은 파일 20행). 엔티티에 초기값을 두지 않아 이 칸을 모르는 저장 코드가 설명을 덮지 않는다(97~100행 설명, ADR-004).
  - (이번 실행) **쓰는 곳은 하나다.** `AuthorDescriptionStore.save`(api/src/catches/author-description-store.ts 45~63행)가 `member_account`를 `FOR KEY SHARE`로 잡고(74행) `UPDATE catch_asset SET author_description = $3, author_description_updated_at = CASE WHEN $3 IS NULL THEN NULL ELSE clock_timestamp() END WHERE owner_id = $1 AND catch_id = $2`(53~59행)로 두 칸만 바꾼다. 입력은 0~4,000 코드 포인트, 앞뒤 공백뿐이면 NULL로 지운다(author-description-input.ts 18~28행). 덮어쓰기이며 버전 비교가 없다. 경로는 `GET`·`PUT /v1/catches/{catchId}/description`이고 남의 것·없는 것·형식이 틀린 ID는 같은 404다. 10월 본인 Catch 응답과 공개 Catch 응답에는 설명 칸이 없다.
  - (이번 실행) **재분석 때**: 등록 `registerCandidates`는 새 Catch 삽입 값에 설명 칸을 넣지 않아 NULL로 시작하고(api/src/catches/registration-service.ts 164~172행), 같은 열쇠면 행을 쓰지 않고 `EXISTING`으로만 잇는다(185~192행). 그래서 같은 `wi1`이 다시 오면 설명과 저장 시각이 그대로다. 시험 S2(api/test/catches/author-description-api.test.cjs 240~250행)가 이를 실제 등록 코드로 확인한다. 반대로 `wi1`이 바뀌면 새 Catch가 설명 없이 생기고 설명은 옛 Catch에 남는다. 설명을 옮기는 단계는 없다(api/docs/publications.md 31행도 같은 동작을 적는다).
  - (이번 실행) **탈퇴 때**: 설명을 따로 지우는 단계가 없다. 탈퇴 4단계(api/docs/withdrawal.md 13~18행)의 회원 행 삭제가 `catch_asset`을 연쇄로 지우고(api/docs/member-withdrawal-deletion.md 19행, 엔티티 22행 `deleteWithParent`) 설명 두 칸도 함께 사라진다. 텍스트 자료(`text_material`)도 회원을 따라 지워진다(같은 문서 11행, 마이그레이션의 `fk_text_material_member_id … ON DELETE CASCADE`). 설명·자료 저장 트랜잭션이 회원 행을 `FOR KEY SHARE`로 잡아 그 사이의 회원 행 삭제는 저장이 끝날 때까지 기다린다. 1단계는 발행 링크를 멈추고, 발행본·발행 사본은 회원 → 발행본 연쇄로 지워진다. withdrawal.md의 이번 변경은 U4·U6 표가 이제 통합 브랜치 마이그레이션에 모두 있다는 문장 정리다.
  - (이번 실행) **화면**: 작성자 설명 편집은 구직자 Catch 상세의 근거 아래, 「Catch 설명 초안」(AI) 위에 「작성자 설명」 제목으로 들어간다(web/src/features/assets/assets-view.tsx 290행, author-description-panel.tsx 31~36행). `AssetsConnected`가 `descriptionApi`를 받을 때만 그리고, 상세마다 `key=catchId`로 새로 마운트해 열 때 현재 설명을 읽는다. 읽지 못하면 빈 설명으로 추정하지 않는다(author-description-editor.tsx 39~57행). 받은 사람 화면에는 아직 설명이 나오지 않는다.
  - (이번 실행) **텍스트 자료**는 Catch와 관계없는 회원 단위 표 `text_material`이다(제목 1~100, 본문 1~20,000, 목록 최신순 커서). 발행 사본은 원본과 외래 키가 없어 원본을 지워도 남는다. Catch 개편과 직접 닿지 않는다.
  - (앞 실행) 이슈 번호로 나누기는 worker/app/candidates/grouping.py `_split`(1652~1738행)이 `_units`(1904~1923행)에서 부른다. 이슈 조회가 허용되고 본인 커밋이 서로 다른 이슈를 둘 이상 가리키면 부분(`Part`)으로 나누고, 그 부분이 worker/app/candidates/identity.py `work_identity`(80~113행)의 `part` 값이 돼 `wi1` 열쇠가 달라진다. 끄는 자리는 `_split`의 `issues_allowed` 갈래 하나다(1674~1678행은 이슈 조회 미허용 요청에서 이미 나누지 않고 한계만 남긴다).
  - (앞 실행) 커밋→Catch 소속을 저장하는 곳은 없다. Catch는 api/src/catches/registration-service.ts 155~193행이 (회원, `workIdentity`)로 찾고 없으면 만든다. catch_asset에는 저장소 칸이 없고 `source_request_id`로 저장소를 찾는다(catch-asset.entity.ts 20·23행, registration-service.ts 62~67행). 근거에는 본인 커밋을 최근 20건까지만 싣는다(worker/app/candidates/build.py 86행 `EVIDENCE_COMMIT_CAP`).
  - (앞 실행) 분석 요청·결과 메시지는 api/contracts/repository-analysis/worker-messages.yaml의 `Request`·`Candidate`가 `additionalProperties: false`라 칸을 더하려면 계약과 판본(`schemaVersion` `"2"`)을 api·worker가 함께 바꿔야 한다. 요청은 api 보내기(analysis-request.dispatcher.ts 65~85행)가 DB 접수 기록으로 만들어 큐에 넣는다. worker는 같은 시도에 대해 api 맥락 조회(worker-context.service.ts 121~178행)도 따로 부른다.
  - (앞 실행) 제목은 지금 worker/app/candidates/build.py 311행에서 `None`이고, worker/app/generation/flow.py 268~276행이 모델이 지목한 대상으로 「{대상} {종류} {동작}」 조각 제목(worker/app/generation/title.py 146~169행, 40자 상한 limits.py 37행)을 만든다. 기록의 글(PR 제목 records.py 91행, PR을 연 계정 104행, 커밋 메시지 71행)은 수집돼 있지만 후보에도 생성 입력에도 들어가지 않는다.
  - (앞 실행) 작업 사실 첫 줄은 build.py가 만든다: 「PR #n, 상태 …」(451행), 「PR 없이 병합한 병합 커밋 {SHA 12자}」(488행), 「…본인 커밋 {SHA 12자}」·「…묶음(가장 최근 커밋 {SHA 12자})」(531·535행). 생성 흐름은 작업 사실을 바꾸지 않는다(flow.py `_apply` 450~484행, candidate-text.md 29행).
  - (앞 실행) AI 초안 재료는 worker/app/generation/request.py `select`(312~379행)가 근거 순서의 커밋 → GitHub가 준 파일 순서 → 줄 순서로 24,000 B(limits.py 26행)까지 담는다. 파일 종류 판정은 title.py `classify`(109~143행, 시험 → 문서 → 설정 → 코드 우선)에만 있다.
  - (앞 실행) 생성 제공자 경계(worker/app/generation/provider.py 50~60행)는 글을 돌려주는 `complete` 하나뿐이고 목적은 `GENERATE`·`REWRITE_TITLE`뿐이다. 판정(확률·고르기·점수)을 받는 자리, OpenAI 키 설정, OpenAI SDK는 없다. LIVE 조립은 worker/app/consumer/child.py 99~122행이 Claude 하나만 만든다.
  - (앞 실행) 분석 고지 v2(api/src/analysis-intake/analysis-notice.ts 22~56행, 판본 `catchu-real-analysis-notice-v2`)의 2절은 「정해진 문장」, 3절은 「보내지 않는 것: 커밋 메시지, PR과 이슈의 글」을 적는다. 첫 이용 고지 판본 `2026-11-v1`과 받는 곳 두 곳(Claude·Voyage)은 web ai-consent-notice.ts 8·11행과 api ai-consent.gate.ts 13행에 있다.
  - (앞 실행) 받은 사람 화면의 자동 생성 안내는 web/src/features/recipient/recipient-format.ts `generatedNotice`(18~23행)가 「{제목과 설명|제목|설명}은 CatchU가 GitHub 기록에서 자동으로 만들었습니다」를 만들고, 목록(recipient-screen.tsx 110행)과 상세(232~237행)가 쓴다. 제목은 줄 수 제한 없이 그대로 보인다(recipient.module.css·assets.module.css에 `line-clamp` 없음).
  - (앞 실행) 탈퇴는 회원 행 삭제의 연쇄 삭제로 지운다(api/src/withdrawal/withdrawal.service.ts 45행, api/docs/member-withdrawal-deletion.md 41행 「새 표의 외래 키는 연쇄 삭제」, 같은 문서 59행 시험이 연쇄 삭제가 아닌 외래 키를 잡는다).
- **Risks / follow-up**:
  - (이번 실행) 작성자 설명은 `wi1`이 같은 Catch에만 남는다. 재분석에서 같은 작업이 다른 열쇠로 오면 사용자가 쓴 설명이 옛 Catch에 남고 새 Catch는 빈 설명이 된다. 소속 저장 설계는 이 경우도 줄이는지 함께 확인해야 한다.
  - (이번 실행) Catch 개편이 기존 Catch의 제목·작업 사실·초안을 재분석 때 새로 쓰는 쪽으로 가면, 그 쓰기는 설명 두 칸을 넣지 말아야 한다(엔티티에 초기값을 두지 않은 이유). TypeORM으로 읽은 엔티티 전체를 다시 저장하는 방식은 설명을 읽은 시점 값으로 되돌릴 수 있다.
  - (이번 실행) 나누기 끄기 등으로 출시 전 DB를 초기화하면 이미 쓴 작성자 설명·텍스트 자료도 함께 사라진다.
  - (이번 실행) 구직자 상세에 사람이 쓴 「작성자 설명」과 AI의 「Catch 설명 초안」이 함께 있어, 자동 생성 안내(assets-view.tsx 80~90행)의 「설명」이 무엇을 가리키는지 안내를 고칠 때 정해야 한다. 받은 사람 화면에는 발행 제출 2 뒤 설명이 들어올 수 있다.
  - (이번 실행) U4 길이 상한은 api·web에 상수로 따로 있다. 바꾸면 다섯 곳을 함께 고친다.
  - (앞 실행) 나누기를 끄면 이슈 조회가 허용된 요청에서 그동안 부분으로 만든 Catch와 `wi1` 값이 달라진다. 출시 전 DB 초기화 전제가 깨지면 기존 Catch와 이어지지 않는다.
  - (앞 실행) 결과 메시지에 후보마다 소속 커밋 전체를 실으면 크기가 커진다(수집 상한 `max_commits` 3000, worker/app/collection/limits.py 29행). 결과는 큐를 거쳐 오고 api가 결과 지문(`resultFingerprint`)으로 대조한다.
  - (앞 실행) 요청에 이미 소속된 커밋 목록을 실을 곳이 둘이다: 큐로 가는 `Request` 메시지, 또는 worker가 시도마다 부르는 맥락 조회 응답. 입력 문서는 「요청에 실어」라고 적었지만, 큐 작업 크기와 계약 판본 영향이 다르다. 요구사항·설계에서 정해야 한다.
  - (앞 실행) 판본 바꿈은 큐에 남은 옛 판본 작업과 겹친다. 양쪽 검사기가 판본 하나만 받는다(worker-messages.yaml `enum: ["2"]`).
  - (앞 실행) 기록의 글을 제목·작업 사실에 쓰면 지금까지 화면과 12월 AI에 나가지 않던 글이 나간다. 가리기(worker/app/generation/redact.py)는 지금 변경 줄에만 돈다. 작업 사실은 발행 때 검색 조각(GITHUB_RECORD)이 된다(api/src/published-index/chunker.ts 104행, 조각 길이 상한 1,000자).
  - (앞 실행) 작업 사실에 「쓸 만한 기록의 글」 한 줄을 더하려면 판정 결과가 필요하다. 그런데 작업 사실은 후보 판정(#118, build.py)이 만들고 생성 흐름은 바꾸지 않는다는 경계가 있다. 이 경계를 어디서 풀지 설계에서 정해야 한다.
  - (앞 실행) 제목 칸은 DB에 길이 상한이 없다(catch-asset.entity.ts 24·43행, `char_length >= 1`만). 생성 쪽 상한 40자(limits.py 37행)는 조각 제목에만 걸린다.
  - (앞 실행) 발행 사본의 항목 제목은 비지 않은 문자열이어야 한다(api/src/publications/published-snapshot.ts 37행). Catch 제목이 null일 때의 대체는 이 스캔 범위 밖(U4 발행 코드)이다.
  - (앞 실행) 생성 문서 worker/docs/generation.md는 상한까지 688 B 남았다. 판정 설명은 새 문서로 써야 한다(입력 문서 §5-5와 같다).
