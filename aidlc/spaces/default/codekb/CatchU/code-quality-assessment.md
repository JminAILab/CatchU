# 코드 품질 평가 — CatchU

> 기준: 2026-11-09 전체 다시 스캔, 커밋 `a1d0fbb4`. 시험·빌드·린트는 돌리지 않았다. 아래 숫자는 파일을 세고 읽은 결과이며 통과 여부가 아니다.

## 시험

| 서비스 | 시험 위치 | 틀 | 파일 수 | 특징 |
|---|---|---|---|---|
| api | `api/test/**/*.test.cjs` | Node `node:test` | 168(도우미 포함) | 빌드한 `dist/`를 시험. 실제 PostgreSQL 시험 DB 필요(`_test`로 끝나는 이름만), 두 줄(두 DB)로 나눠 돈다. 실제 Valkey 시험은 `CATCHU_TEST_REDIS_URL`이 있을 때만. 실제 외부 AI 시험(`live-*.test.cjs`)은 따로 |
| web | `web/test/*.test.mjs` | Node `node:test` | 67 | `.ts`·`.tsx`를 바로 불러 화면 모델·검사기·문구를 시험. 브라우저 없이 그리기 결과 검사(`u2-render.mjs`) |
| worker | `worker/tests/` | pytest 9.1.1 | 54 | 합성 GitHub, 실제 git 합성 저장소, 합성 제공자, 실제 Redis(CI는 Valkey로 늘 돈다) |
| deploy | `deploy/**/*.test.sh` | bash | 6 | 생성·배포 스크립트의 안전 장치 시험 |

- **커버리지**: 세 서비스 모두 명령은 있다(api `npm run test:coverage`, web `npm run test:coverage`, worker `pytest --cov`). CI는 재지 않는다. 팀 규칙은 「팀장이 넣은 서비스별 명령을 쓰고 Unit이 따로 도구를 들이지 않는다」(`team.md` 「Testing Posture」).
- **시험 방식**: 팀 관행은 custom(시나리오·기대·실패 조건을 먼저 정하고 세부 시험은 구현 뒤). 시험 이름과 주석이 요구사항 ID(BR·NFR·FR)를 단다.
- **intent 관련 시험**: `api/test/catches/author-description-api.test.cjs`, `owner-catch-http.test.cjs`, `owner-catch-response.test.cjs`, `registration-postgres.test.cjs`, `api/test/publications/publish-api.test.cjs`·`recipient-api.test.cjs`·`publications-manage-api.test.cjs`, `api/test/published-index/chunker.test.cjs`, `api/test/rag-answer/summary-sources.test.cjs`, `api/test/claude-mcp/mcp-tools.test.cjs`, `api/test/db/member-cascade-delete.test.cjs`, `web/test/assets-view.test.mjs`·`author-description*.test.mjs`·`publish.test.mjs`·`publications-owner.test.mjs`·`recipient.test.mjs`, `worker/tests/test_candidate_*.py`·`test_generation_title.py`.

## 린트·타입·서식

| 서비스 | 도구 | 설정 | 엄격함 |
|---|---|---|---|
| api | ESLint 10 + typescript-eslint, `tsc --noEmit` | `api/eslint.config.mjs`, `tsconfig.json` | 경고도 실패(`--max-warnings=0`) |
| web | ESLint 9 + `eslint-config-next`(core-web-vitals·typescript), `tsc --noEmit` | `web/eslint.config.mjs`, `tsconfig.json` | 기본 |
| worker | Ruff(E4·E7·E9·F·I·UP·B) + `ruff format`, mypy strict(`app`·`tests`) | `worker/pyproject.toml` | 엄격 |

억제 표시는 worker 4곳뿐이다(`processing/collection_file.py` 45행 `type: ignore`, `processing/confirm.py` 390행 `noqa: E731`·430행 `type: ignore`, `consumer/parent.py` 422행 `type: ignore`). api·web 제품 코드에는 `eslint-disable`·`@ts-ignore`가 없다. TODO·FIXME·HACK 표시도 제품 코드에 없다.

## CI/CD

- `.github/workflows/ci.yml`: `dev`·`intent/**` 대상 PR과 push. `changes`(경로 판정, CI 판정 시험, 문서 크기 검사) → 바뀐 서비스만 `web`(`npm run check`)·`api`(lint·typecheck·test·공용 합성 자료 검사, PostgreSQL·Valkey 서비스)·`worker`(ruff·format·mypy·pytest)·`deps-audit`. 외부 action은 커밋 SHA 고정, 토큰을 작업 폴더에 남기지 않음.
- `.github/workflows/images.yml`: 이미지 검사(`deploy/scripts/check-images.mjs`)와 CD 스크립트 시험.
- `.github/workflows/deploy-dev-server.yml`: `main` push → 계획·검사·배포(ECR push, SSM으로 서버 교체, 확인).
- Dependabot은 action 갱신만(주 1회). 기반 이미지 갱신 알림은 아직 없다(`deploy/README.md`).
- 팀 규칙: 보호 브랜치는 PR·승인 1건·merge commit만. CI가 필수 상태 검사다.

## 문서

- 서비스 README 셋이 설치·실행·검사·환경변수를 자세히 적는다. 기능 안내는 `api/docs/`(44개), `worker/docs/`(15개), `web/src/features/*/README.md`에 나눴다. 코드 주석이 결정·요구사항 번호와 이유를 촘촘히 적는다(한국어).
- 문서 크기 상한을 CI가 본다(`.github/scripts/check-doc-sizes.sh`). AI 도구가 큰 파일을 잘라 읽는 문제를 줄이려는 것이다(`api/README.md` 7행).
- 위험: 같은 규칙이 코드 주석·`api/docs`·`worker/docs`·AI-DLC 기능 설계에 여러 번 적혀 있어 한 곳만 고치면 어긋난다(이 프로젝트의 learned 규칙도 같은 내용).

## 품질 빠른 평가

| 항목 | 평가 | 근거 |
|---|---|---|
| 이름 | good | 파일·함수 이름이 하는 일을 말한다(`buildCatchSnapshot`, `assertCatchesEligible`, `choose_record_text`). 한국어 주석이 업무 낱말을 맞춘다 |
| 함수 크기 | fair | api는 대체로 짧다. worker 판정 파일은 한 파일에 단계가 많다(`grouping.py` 1,880줄, `relations.py` 1,584줄, `flow.py` 943줄, `build.py` 805줄, `generation/claude.py` 786줄) |
| 오류 처리 | good | 무결성 오류를 전용 예외로 던지고 0건·성공으로 숨기지 않는다. 남의 것·없는 것은 같은 404. 비동기 접수와 완료를 나눈다(커밋 뒤 등록, 실패는 로그와 시한) |
| 시험 있음 | good | 핵심 경로마다 시험 파일이 있다. DB·큐·git을 실제로 쓰는 시험이 많다 |
| 중복 | fair | 사본 모양 검사·복사가 다섯 곳, 회원 행 확인(`assertMemberExists`)이 모듈마다 따로, UUID 검사 정규식이 여러 파일에 있다 |
| 죽은 코드 | fair | `PublicCatchStore`(제품에서 안 씀), `share_link` 표·엔티티, 10월 기록 문서·수동 확인 도구(`api/scripts/verify-share-links-browser.cjs` 등, 지금 코드에서 동작 안 함, `api/README.md` 5행) |

## 기술 부채

| 신호 | 자리 | 영향 |
|---|---|---|
| 쓰지 않는 공개 조회 | `api/src/catches/public-catch-store.ts`, `catches.module.ts` 11~12행 | 「공개」의 뜻이 둘로 보인다. 지우거나 시험 전용으로 옮길 후보 |
| 남은 10월 표 | `api/src/share-links/share-link.entity.ts`, `share_link` 표 | 결정(OQ-U4-3) 전까지 남김. 탈퇴 연쇄 삭제 목록에 그대로 있다 |
| 만든 시각 없음 | `catch_asset`(마이그레이션 `1790600000000`) | 목록이 무작위 UUID 순서다. 시각순 정렬·표시는 새 칸이 필요 |
| 사본 모양이 흩어짐 | `published-snapshot.ts`, `snapshot-builder.ts`, `chunker.ts`, `summary-sources.ts`, `web/.../publications-api.ts`, `web/.../recipient-api.ts` | 칸 하나에 여섯 파일 |
| 계약 판본을 함께 받지 않음 | `worker-messages.yaml` 머리 주석 | 결과 칸을 더하면 api·worker를 같이 배포해야 하고, 그 사이 도는 분석은 거부될 수 있다 |
| 임시값 | `publications-config.ts`(발행 빈도 1분 10회, 전체 글 60,000자) | 회의 결정 대기(OQ-U4-2·OQ-U4-4) |
| 시험용 구현이 `src`에 | `publications/in-memory-publication-access.ts`, `analysis-receiver/dev-analysis-injection.ts` | 앱 모듈에 넣지 않게 주석으로만 막는다 |
| 링크 판별의 한글 끊김 | `web/src/lib/github-source-url.ts` 15~18행 | 한글 파일 이름이 든 GitHub 주소는 한글 앞에서 끊긴다 |

## 이 intent가 닿는 자리

입력 문서(`docs/ai-dlc-input-catch/CatchU_새_Catch_입력.md`)와 승인된 대략 화면(`aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md`)의 1~3단계가 고칠 자리와 **함께 고칠 파일**이다. 같은 규칙을 적은 문서도 넣었다(프로젝트 규칙: 규칙을 바꾸면 같은 규칙을 적은 다른 문서를 모두 함께 고친다).

### 1단계 — 지원자 화면

| 바꿀 것 | 지금 자리 | 함께 고칠 파일 |
|---|---|---|
| 작성자 설명을 칸 제목별로 쓰고 보기(한 칸 4,000자 그대로) | `web/src/features/assets/author-description-panel.tsx`(textarea 하나), `author-description-editor.tsx`, `author-description-api.ts` | `web/src/features/publications/snapshot-view.tsx`(보기 나누기), `web/src/features/assets/README.md`, `api/docs/publications.md`(C-14 설명), `api/src/catches/author-description-input.ts`(상한은 그대로) |
| 「설명 씀/안 씀」 걸러 보기. 저장소 걸러 보기처럼 목록 요청 조건으로 **서버에서 거르기로 정했다**(대략 화면 1절. 목록은 20개씩 오므로 받은 목록 안에서만 거르면 다음 쪽의 Catch가 빠진다) | `api/src/catches/owner-catch-input.ts` `ownerCatchQuery`(지금 받는 쿼리 칸은 `limit`·`repositoryId`·`sourceRequestId`·`cursor`뿐이고 그 밖 칸은 400)·`cursorScope`(커서가 회원·`repositoryId`·`sourceRequestId`를 함께 묶는다. 새 조건도 묶어야 다른 조건의 커서를 거부한다), `owner-catch-store.ts` `list`의 `conditions`(22~35행, 저장소 조건과 같은 꼴로 더한다), `catch-reader.ts` `READ_COLUMNS`(지금 작성자 설명 칸을 읽지 않는다), `owner-catch-response.ts`, `web/src/features/assets/types.ts`·`catch-api.ts` `list`(지금 쿼리는 `limit`·`repositoryId`·`cursor`, 62~68행)·`isCatch`. 「받은 목록 안에서만 거름」은 지금 **공개 상태** 걸러 보기의 설명이다(`assets-view.tsx` 9·113행, `web/src/features/assets/README.md` 70행) | `api/docs/catch-owner-read-preparation.md`(9행 목록 걸러 보기), `web/src/features/assets/README.md`(53·54·70행 걸러 보기 설명), `assets-view.tsx` 걸러 보기 칸과 빈 결과 안내, `assets-store.ts`·`assets-connected.tsx`(목록 요청과 주소의 걸러 보기 복원), `api/test/catches/owner-catch-*.test.cjs`, `web/test/assets-*.test.mjs` |
| 생각해 볼 질문 옆 안내 문구 | `assets-view.tsx` 272~276행 | `web/test/assets-view.test.mjs` |
| 상세 칸 순서 바꿈: Catch 설명 초안·생각해 볼 질문을 작성자 설명 위로 올리고, 근거 아래에 「다시 볼 곳」 자리를 둔다(대략 화면 2절) | `assets-view.tsx` `CatchDetail` 253~277행. 지금 순서는 근거(253행) → 작성자 설명 `{descriptionEditor}`(266행) → Catch 설명 초안(268행) → 생각해 볼 질문(272행) → 현재 확인 상태(277행)다 | 같은 순서를 적은 곳: `assets-view.tsx` 21행 주석(「근거와 AI 초안 사이에 둔다(BR1.3)」), `web/src/features/assets/README.md` 27행, `web/test/assets-view.test.mjs` |
| 발행 화면 「저장소마다 3~5개 권장」 | `web/src/features/publications/publish-view.tsx` `SourcePickerView` 63~65행 | `web/src/features/publications/README.md` |
| 작성자 설명 안 GitHub 링크를 주소 전체 대신 「파일 · 줄 · 판본」 같은 이름으로 보이기(커밋·PR 이름, 다른 저장소면 「소유자/저장소 ·」 앞붙임 포함, 대략 화면 「GitHub 링크 이름」). 화면에서만 계산하고 API는 그대로 | `web/src/features/publications/snapshot-view.tsx` `LinkedText`·`linkedSegments`(지금 링크 글자로 주소 전체 `segment.url`을 보인다, 50~51행). 링크 찾기는 `web/src/lib/github-source-url.ts` `splitGithubLinks`(판별 규칙은 그대로 둔다) | 이름을 짓는 새 함수(`github-source-url.ts` 곁. 받은 사람 화면 `recipient-format.ts`가 같은 판별 함수를 다시 내보낸다), `web/test/publications-owner.test.mjs`(400행이 링크 글자 = 주소 전체를 검사), `web/src/features/publications/README.md` 16·21행, `web/src/features/recipient/README.md` 49행. 주의: `LinkedText`는 텍스트 자료 본문에도 쓴다(151행). 강조 위치는 원문 주소 길이로 세므로(`linkedSegments`의 offset) 보이는 이름이 짧아져도 원문 길이로 세야 한다. 다른 저장소인지는 사본 근거 `sourceUrl`과 견준다 |
| 지원자 상세의 「발행하면 면접관에게 열릴 링크」 목록(h4 제목, 8칸 전체, 합계 글자 수 바로 위). 위 링크와 같은 판별·이름 규칙 | 없음. 편집 칸은 `web/src/features/assets/author-description-panel.tsx`(textarea 하나 46행, 글자 수 50행) | 위 줄과 같은 `splitGithubLinks`와 이름 함수를 함께 써야 면접관 화면과 이름이 어긋나지 않는다. `author-description-panel.tsx`, `web/test/author-description*.test.mjs` |
| 발행 화면 Catch 항목의 저장소 이름과 「설명 안 씀」 | `publish-view.tsx` `SourcePickerView` 항목(85~89행: 제목, 공개·비공개와 불일치, 고를 수 없는 이유, 비공개 안내), `web/src/features/publications/publish-sources.ts` `CatchSource`(`catchId`·`title`·`visibility`·`mismatch`·`eligible`·`reason`만. `catchSourceOf`가 `CatchAsset`에서 뽑는다). 목록 응답에는 저장소 이름이 없고(`types.ts` 47행 주석) 작성자 설명이 있는지도 없다. 내 자산 화면은 따로 받은 저장소 목록(`RepositoryOption`)에서 이름을 찾지만 발행 화면은 저장소 목록을 불러오지 않는다 | `publish-sources.ts` `CatchSource`·`catchSourceOf`, 위 「설명 씀/안 씀」 줄과 같은 「작성자 설명이 있는지」 칸(`owner-catch-response.ts`·`types.ts`·`isCatch`), 저장소 이름을 얻는 길(저장소 목록을 함께 부르거나 응답에 칸을 더하거나 둘 중 하나), `web/src/features/publications/README.md` 「발행 (W3)」, `web/test/publish.test.mjs` |
| 「작성자 설명을 쓴 Catch만 보기」 칸(처음 꺼짐, 1절과 같은 목록 요청 조건으로 서버에서 거름) | `web/src/features/publications/publish-screen.tsx` 121행의 목록 요청 `client.catches.list("", cursor, signal)`(저장소 조건 없이 20개씩, `createSourceLoader`가 첫 쪽·더 보기를 맡는다). `catch-api.ts` `list`는 내 자산 화면(`assets-store.ts` 70·101행)과 함께 쓴다 | `catch-api.ts` `list`의 새 조건(위 서버 걸러 보기 줄과 같은 쿼리 칸), `SourcePickerView`(체크 칸, 걸러 본 개수 알림), `publish-screen.tsx`(칸을 바꾸면 첫 쪽부터 다시 불러옴), `web/test/publish.test.mjs` |
| 확인 단계 안내 「작성자 설명이 없는 Catch가 N개 있습니다」(발행은 막지 않음) | `publish-view.tsx` `PublishConfirmView` 225·245행이 비공개 Catch 수를 `SelectedItem.visibility`로 세어 같은 꼴 안내를 보인다. 확인 단계는 고르기 목록이 아니라 고른 자료(`SelectedItem[]`)만 받는다 | `publish-sources.ts` `SelectedItem`(지금 `kind`·`sourceId`·`title`·`visibility`)에 「작성자 설명이 있는지」를 `visibility`처럼 싣는다, `publish-screen.tsx` `toggleCatch`(161~168행, 고를 때 `CatchSource`에서 옮겨 담는다), `web/test/publish.test.mjs` |
| 짚어 볼 곳 링크(한글 파일 이름) | `web/src/lib/github-source-url.ts` | 작성자 설명 안내 문구 |

- **고른 자료는 고르기 목록과 따로 있다.** `publish-screen.tsx`의 화면 상태(`PublishScreenState`)는 고르기 목록(`catches`·`materials`)과 고른 자료(`selected`)를 따로 든다. 목록을 다시 불러와도(`loadSources` → `createSourceLoader`의 `load`가 목록만 비우고 다시 채운다) `selected`는 그대로다. 지원자가 빼는 동작(`remove`·`toggleCatch`) 말고 `selected`를 비우는 곳은 발행을 마친 뒤 완료 화면의 [새로 발행](`reset`, 240~243행, `step === "done"`일 때만)뿐이고, 발행이 실패하면 그대로 둔다(216행 주석). 그래서 「작성자 설명을 쓴 Catch만 보기」를 켜 목록에서 사라진 Catch도 고른 채로 남고, 확인 단계의 수 안내는 목록이 아니라 `selected`로 세야 한다.

### 2단계 — 면접관 화면

| 바꿀 것 | 지금 자리 | 함께 고칠 파일 |
|---|---|---|
| 사본에 저장소 이름·작성 시점·조회 한계 | `published-snapshot.ts` `CatchSnapshot`, `snapshot-builder.ts` `buildCatchSnapshot`·`CatchSourceRow`, `publish.service.ts` `CATCH_LOCK_SQL`·`EVIDENCE_SQL`(지금 `coverageLimits`·저장소 이름·`author_description_updated_at`을 읽지 않음) | `api/src/published-index/chunker.ts`(새 칸은 조각에서 빼야 함 — 지금 코드는 모르는 칸을 무시), `api/src/rag-answer/summary-sources.ts`(같음), `web/src/features/publications/publications-api.ts` `isCatchSnapshot`, `web/src/features/recipient/recipient-api.ts` `pickItem`(새 칸을 옮기지 않으면 사라짐), `snapshot-view.tsx`, `api/docs/publications.md`·`recipient-publication.md`·`published-index.md`·`rag-answer.md`, `api/test/publications/*`, `web/test/recipient.test.mjs`·`publications-owner.test.mjs` |
| 옛 사본 견디기 | `db-publication-access.ts` `readSnapshotIn`은 jsonb를 그대로 돌려준다 | 위 다섯 읽는 곳이 칸 없음을 받아들여야 한다 |
| 링크 표지 「이 작업의 본인 커밋」 | 없음. 사본 근거 `sourceUrl`·`sourceRevision`(본인 커밋 최근 20건까지)과 비교 | `snapshot-view.tsx` `LinkedText` |
| 요약·질의응답 지시(작성자 자료 옮기는 말) | `api/src/rag-answer/rag-answer-config.ts` | `api/docs/rag-answer.md` |

### 3단계 — 분석 쪽

| 바꿀 것 | 지금 자리 | 함께 고칠 파일 |
|---|---|---|
| 다시 고친 줄·옮긴 파일·확장자 바꿈·되돌림 | 재료: `worker/app/collection/records.py`(patch·status·previous_path). 파일 내용 식별값은 지금 버림 | `worker/app/collection/normalize.py`(식별값 남기기), 새 판정 모듈, `worker/docs/candidate-text.md` |
| 시험 파일 「있음」(좁은 분류) | `worker/app/generation/title.py` `classify`(재료 순서용, 그대로 둠) | 새 좁은 분류, `worker/docs/generation-material.md`(지금 분류 설명과 구분) |
| 작업 시각(첫·마지막 본인 커밋) | `CommitRecord.authored_at`. Catch·사본·응답에 시각 칸 없음 | `worker/app/processing/generation.py`·`result.py`, `api/contracts/repository-analysis/worker-messages.yaml`(Result 판본), `api/src/analysis-receiver/receiver.types.ts`·`worker-message.validator.ts`, `api/src/catches/registration-batch.ts`·`new-catch-content.ts`·`entities/catch-asset.entity.ts` + 마이그레이션, `owner-catch-*`(정렬·cursor), `worker/fixtures/m1-synthetic/`, `api/docs/repository-analysis-u7.md`, `worker/docs/repository-analysis-u7.md` |
| 「다시 볼 곳」의 커밋 링크(본인만 보는 새 칸, 근거 아래. 사실이 없으면 칸을 그리지 않음, 대략 화면 2절) | 없음. 지금 상세의 근거 링크는 `assets-view.tsx` 257~258행이다(`dataMode === "api"`이고 `sourceMode === "LIVE"`이며 `safeEvidenceUrl`을 통과할 때만 「원본 근거 열기」 새 탭 링크, 아니면 주소 글자). `safeEvidenceUrl`(292~294행)은 http·https의 아무 호스트나 받아 `isGithubSourceUrl`(github.com의 https만)보다 넓다. 이 링크에는 「(새 탭)」 글이 붙어 있지 않다 | 위 「다시 고친 줄…」 줄의 결과를 Catch 응답까지 옮기는 길(`owner-catch-response.ts`·`types.ts`·`isCatch`), `assets-view.tsx` `CatchDetail`, `web/test/assets-view.test.mjs` |
| 고지 4절(결과 문장을 Catch에 남기면) | `api/src/analysis-intake/analysis-notice.ts`(`catchu-real-analysis-notice-v3`) | `api/docs/analysis-intake.md`, 팀장 PR 승인 |
| 기존 Catch에 값 채우기 | 등록은 기존 Catch를 고치지 않음(`registration-service.ts` 206행), 소속 커밋은 재분석에서 빠짐 | DB 초기화 시점 결정 또는 「Catch 재생성」(입력 문서 §7) |

### 지키고 있는 경계(바꾸면 안 되는 것)

- 작성자 설명은 결과 반영·등록 경로가 쓰지 않는다(엔티티 초기값 없음, 저장 경로 하나).
- 사본의 `aiDraft`·제목은 받은 사람 AI 근거가 아니다(`chunker.ts` 104행 주석, `summary-sources.ts` 2행).
- 작업 사실 문장에 CatchU가 센 숫자·날짜를 쓰지 않는다(`build.py` 27~36행). 작업 시각을 면접관에게 보이지 않는다는 입력 문서의 안과 맞는다.
- 받은 사람 경로는 원본 Catch를 읽지 않는다(`db-publication-access.ts` 155~160행).
