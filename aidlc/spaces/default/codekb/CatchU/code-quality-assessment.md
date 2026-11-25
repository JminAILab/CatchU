# 코드 품질 평가 — CatchU

> 기준: 2026-11-09 전체 다시 스캔(커밋 `a1d0fbb4`) 위에 2026-11-16 집중 스캔(커밋 `eb0d5a6c`)과 2026-11-19 집중 스캔(커밋 `aa241a4c`)을 합쳤다. 시험·빌드·린트는 돌리지 않았다. 아래 숫자는 파일을 세고 읽은 결과이며 통과 여부가 아니다. 11-19에 다시 확인한 것은 「발행·사본·화면 시험」, 「기술 부채」의 11-19 줄, 「이 intent(#597)가 닿는 자리」, 「앞 intent(#559) 결과」, 그 앞 intent 절의 1·2단계 결과다. 나머지는 11-09·11-16 글 그대로다.

## 시험

| 서비스 | 시험 위치 | 틀 | 파일 수 | 특징 |
|---|---|---|---|---|
| api | `api/test/**/*.test.cjs` | Node `node:test` | 168(도우미 포함, 11-09) | 빌드한 `dist/`를 시험. 실제 PostgreSQL 시험 DB 필요(`_test`로 끝나는 이름만), 두 줄(두 DB)로 나눠 돈다. 실제 Valkey 시험은 `CATCHU_TEST_REDIS_URL`이 있을 때만. 실제 외부 AI 시험(`live-*.test.cjs`)은 따로 |
| web | `web/test/*.test.mjs` | Node `node:test` | 84(11-19 목록, 도우미 `*.mjs` 포함) | `.ts`·`.tsx`를 바로 불러 화면 모델·검사기·문구를 시험. 브라우저 없이 그리기 결과 검사(`u2-render.mjs`) |
| worker | `worker/tests/` | pytest 9.1.1 | 54(11-09) | 합성 GitHub, 실제 git 합성 저장소, 합성 제공자, 실제 Redis(CI는 Valkey로 늘 돈다) |
| deploy | `deploy/**/*.test.sh` | bash | 6(11-09) | 생성·배포 스크립트의 안전 장치 시험 |

- **커버리지**: 세 서비스 모두 명령은 있다(api `npm run test:coverage`, web `npm run test:coverage`, worker `pytest --cov`). CI는 재지 않는다. 팀 규칙은 「팀장이 넣은 서비스별 명령을 쓰고 Unit이 따로 도구를 들이지 않는다」(`team.md` 「Testing Posture」).
- **시험 방식**: 팀 관행은 custom(시나리오·기대·실패 조건을 먼저 정하고 세부 시험은 구현 뒤). 시험 이름과 주석이 요구사항 ID(BR·NFR·FR)를 단다.

### 발행·사본·화면 시험 (11-19 확인, 파일 이름만 — 내용은 열지 않음)

| 대상 | 시험 파일 | 이 intent(#597)에서 |
|---|---|---|
| 발행 요청·트랜잭션 | `api/test/publications/publish-api.test.cjs`, `publish-pdf.test.cjs` | 요청 모양·순서 번호·거부 위치가 바뀌면 여기가 먼저 깨진다 |
| 작성자 관리·C-10 | `publications-manage-api.test.cjs`, `publication-access-db.test.cjs`, `in-memory-publication-access.test.cjs`, `publications-module.test.cjs`, `app-routes.test.cjs` | 사본에 칸을 더하면 C-10 읽기 시험이 바뀐다. 경로를 더하면 `app-routes` |
| 받은 사람 열람 | `recipient-api.test.cjs`, `recipient-pdf.test.cjs`, `recipient-unlock-policy.test.cjs` | 사본 모양 |
| 조각·요약 근거·질의응답 근거 | `api/test/published-index/chunker.test.cjs`, `api/test/rag-answer/summary-sources.test.cjs`, `qna-sources.test.cjs`, `qna-controller.test.cjs`, `rag-eval.test.cjs` | `position`을 이어 매기면 그대로 통해야 한다. 새 사본 칸이 조각·근거에 0건인지 같은 꼴로 지킨다 |
| 받은 링크 읽기 | `api/test/claude-mcp/mcp-shared-page.test.cjs`, `mcp-shared-reader.test.cjs`, `mcp-shared-text.test.cjs`, `mcp-shared-publication.test.cjs` | S9에서 프리셋 구분을 실으면 바뀐다 |
| 탈퇴 | `api/test/claude-mcp/mcp-withdrawal.test.cjs`, `web/test/u2-withdrawal.test.mjs`, api `u2` 폴더 | 프리셋 표가 연쇄로 지워지는지 더할 자리 |
| 자료 | `api/test/materials/`, `web/test/materials-screen.test.mjs`, `materials.test.mjs`, `pdf-materials-api.test.mjs` | 지우기 확인 문장·탭 부품 |
| web 발행·사본 | `web/test/publish.test.mjs`, `publications-owner.test.mjs` | 발행 화면 모델이 프리셋 고르기로 바뀌면 크게 바뀐다 |
| web 받은 사람·근거 이동 | `web/test/recipient.test.mjs`, `recipient-pdf.test.mjs`, `u9-recipient-claude.test.mjs` | 탭·출처의 탭 이동·돌아가기. `resolveEvidenceTarget`은 순수 함수라 시험하기 쉽다 |
| web 패널 | `rag-answer-item-title.test.mjs`, `rag-answer-qna-panel.test.mjs`, `rag-answer-api.test.mjs`, `rag-answer-state.test.mjs`, `rag-answer-sse-reader.test.mjs` | 돌아가기에 필요한 「누른 자리」를 넘기면 바뀐다 |
| 메뉴·방침 | `web/test/member-navigation.test.mjs`, `privacy-policy.test.mjs`(원문 SHA-256 대조) | 메뉴 「프리셋」, 방침 문구 |

### 받은 사람 AI 시험 (11-16 확인, 시험 이름과 검색 결과 줄만 읽음)

| 대상 | 시험 파일 | 덮는 것 |
|---|---|---|
| 조각 나누기 | `api/test/published-index/chunker.test.cjs`(13개) | Catch 조각의 칸 순서·출처 종류·근거 주소, `aiDraft` 조각 없음, null 작성자 설명, 문단·줄·1,000자 나누기와 대리쌍, PDF 쪽, 항목·칸 순서, 모양 오류, NC2 새 칸 넷·본인 커밋 표지가 조각에 0건, NC3 다시 볼 곳 사실·작업 시각이 0건 |
| 조각 저장·검색·임베딩 | `published-index-writer.test.cjs`, `published-search.test.cjs`, `embed-publication-handler.test.cjs`, `embedding-provider.test.cjs`, `queue-embedding.test.cjs`, `published-index-module.test.cjs`, `live-embedding.test.cjs`(실제 Voyage, 따로) | 트랜잭션 안 저장, 상태 전이, 검색 순서·범위, 처리기 실패·늦은 결과 |
| 인용 요청 | `api/test/ai-generation/citation-request.test.cjs` | 근거 없음 `SKIP`, 빈 줄 근거, 문서 = 줄마다 글 블록·`context`, 시스템 지시 조립 |
| 줄·응답·위치·따옴표 | `citation-lines.test.cjs`, `response-items.test.cjs`, `quote-citations.test.cjs`, `ai-generation-gate.test.cjs`(U1), `live-citation.test.cjs`(실제 Claude, 따로) | 항목 판정, 잘림, 위치 연결 실패, 따옴표 인용 |
| 게이트 대조·스트림 | `api/test/u2/ai-gate-checks.test.cjs`, `ai-gate-stream.test.cjs`, `ai-gate-jd.test.cjs` | 대조로 버림과 `dropReasons`, 스트림 항목 순서, 잘림, `REFUSED`·`NO_ITEMS`·`CALL_FAILED` |
| 질의응답·요약 | `api/test/rag-answer/*`(11-19 목록 13개, `qna-sources.test.cjs`·`live-question-counter.test.cjs` 포함) | 확인 넷과 사본 읽기 순서, SSE 사건, 다시 쓰기, 요약 근거 칸, 근거 붙이기 |
| JD 요약 | `api/test/jd/jd-summary.test.cjs`, `jd-integration.test.cjs` | JD 요청 검사, 게이트 연결 |

- 질의응답 품질은 시험이 아니라 평가 스크립트로 잰다: `npm run rag-eval`(`api/scripts/rag-eval/`)과 기록 `api/docs/rag-evaluation/`. 평가 스크립트는 앱과 같은 `buildQnaSources`로 요청을 만든다(`qna-sources.ts` 2행, 11-19 확인).

## 린트·타입·서식 (11-09)

| 서비스 | 도구 | 설정 | 엄격함 |
|---|---|---|---|
| api | ESLint 10 + typescript-eslint, `tsc --noEmit` | `api/eslint.config.mjs`, `tsconfig.json` | 경고도 실패(`--max-warnings=0`) |
| web | ESLint 9 + `eslint-config-next`(core-web-vitals·typescript), `tsc --noEmit` | `web/eslint.config.mjs`, `tsconfig.json` | 기본 |
| worker | Ruff(E4·E7·E9·F·I·UP·B) + `ruff format`, mypy strict(`app`·`tests`) | `worker/pyproject.toml` | 엄격 |

억제 표시는 worker 4곳뿐이다(`processing/collection_file.py` 45행 `type: ignore`, `processing/confirm.py` 390행 `noqa: E731`·430행 `type: ignore`, `consumer/parent.py` 422행 `type: ignore`). api·web 제품 코드에는 `eslint-disable`·`@ts-ignore`가 없다. TODO·FIXME·HACK 표시도 제품 코드에 없다(11-19에 읽은 파일에도 없었다). `qna-sources.ts`는 `no-control-regex`에 걸리지 않게 정규식을 유니코드 속성으로 썼다고 주석에 적는다(29행).

## CI/CD (11-09)

- `.github/workflows/ci.yml`: `dev`·`intent/**` 대상 PR과 push. `changes`(경로 판정, CI 판정 시험, 문서 크기 검사) → 바뀐 서비스만 `web`(`npm run check`)·`api`(lint·typecheck·test·공용 합성 자료 검사, PostgreSQL·Valkey 서비스)·`worker`(ruff·format·mypy·pytest)·`deps-audit`. 외부 action은 커밋 SHA 고정, 토큰을 작업 폴더에 남기지 않음.
- `.github/workflows/images.yml`: 이미지 검사(`deploy/scripts/check-images.mjs`)와 CD 스크립트 시험.
- `.github/workflows/deploy-dev-server.yml`: `main` push → 계획·검사·배포(ECR push, SSM으로 서버 교체, 확인).
- Dependabot은 action 갱신만(주 1회). 기반 이미지 갱신 알림은 아직 없다(`deploy/README.md`).
- 팀 규칙: 보호 브랜치는 PR·승인 1건·merge commit만. CI가 필수 상태 검사다.

## 문서

- 서비스 README 셋이 설치·실행·검사·환경변수를 자세히 적는다. 기능 안내는 `api/docs/`, `worker/docs/`, `web/src/features/*/README.md`에 나눴다. 코드 주석이 결정·요구사항 번호와 이유를 촘촘히 적는다(한국어).
- 문서 크기 상한을 CI가 본다(`.github/scripts/check-doc-sizes.sh`). AI 도구가 큰 파일을 잘라 읽는 문제를 줄이려는 것이다(`api/README.md` 7행).
- 위험: 같은 규칙이 코드 주석·`api/docs`·`worker/docs`·web README·AI-DLC 기능 설계에 여러 번 적혀 있어 한 곳만 고치면 어긋난다(이 프로젝트의 learned 규칙도 같은 내용). 이 intent에서 같은 내용이 여러 곳에 있는 것(11-19 확인):
  - 받은 사람 화면 순서: `recipient-view.tsx` 머리 주석(38~42행), `web/src/features/recipient/README.md` 「화면 순서(C-11 자리)」.
  - 발행 화면 흐름·상한: `publish-screen.tsx` 머리 주석(125~135행), `web/src/features/publications/README.md` 「발행 (W3)」, `api/docs/publications.md`(이름만), `publications-config.ts`·`publications-api.ts` 14행.
  - 패널 붙이는 방법·props: `web/src/features/rag-answer/README.md` 「붙이는 방법(U4)」, `recipient-slots.ts` 머리 주석, `recipient-view.tsx` 93~98행 주석.
  - 탭: `web/src/features/materials/README.md` 「PDF 자료 탭 (U8)」.
  - 저장·지우기 항목: `privacy-policy.md`·`privacy-policy.tsx`·시험 SHA-256, 자료 지우기 확인 문장 둘(`materials-screen.tsx` 226행, `pdf-materials-api.ts` 205행), 탈퇴 확인 문장(`withdrawal.ts` 13행).

## 품질 빠른 평가

| 항목 | 평가 | 근거 |
|---|---|---|
| 이름 | good | 파일·함수 이름이 하는 일을 말한다(`buildCatchSnapshot`, `assertCatchesEligible`, `buildChunkDrafts`, `buildQnaSources`, `resolveEvidenceTarget`, `createPublishModel`). 한국어 주석이 업무 낱말을 맞춘다 |
| 함수 크기 | fair | api는 대체로 짧다. `PublishService.store`는 65줄로 한 트랜잭션의 단계를 순서대로 담는다(11-19). worker 판정 파일은 한 파일에 단계가 많다(`grouping.py` 1,880줄 등). web `createPublishModel`은 한 함수가 약 190줄이지만 안쪽 함수로 나뉜다(11-19) |
| 오류 처리 | good | 무결성 오류를 전용 예외로 던지고 0건·성공으로 숨기지 않는다. 남의 것·없는 것은 같은 404. 발행 실패 때 PDF 접두어를 한 번 정리하고 원래 오류를 그대로 응답한다(`publish.service.ts` 168~175행). 다만 근거 이동은 항목 요소가 없으면 조용히 아무것도 하지 않는다(11-19, 아래 부채 표) |
| 시험 있음 | good | 핵심 경로마다 시험 파일이 있다. DB·큐·git을 실제로 쓰는 시험이 많다. 화면 판단은 순수 함수로 빼 시험한다. `.tsx` 그리기는 시험이 덜 닿는다(`gated-item-view.tsx`·탭 부품) |
| 중복 | fair | 사본 모양 검사·복사가 여섯 곳, 사본 칸 순서 목록이 세 곳(`chunker.ts`·`summary-sources.ts`·`recipient-slots.ts`), 근거 이동 코드가 두 화면에 같은 모양으로(11-19), `assertMemberExists`가 모듈마다 따로, UUID 검사 정규식이 여러 파일에, 같은 상한 값이 api·web·worker에 따로 있다 |
| 죽은 코드 | fair | `PublicCatchStore`(제품에서 안 씀), `share_link` 표·엔티티, U1 최소 게이트(`ClaudeAiGenerationGate`)는 시험과 실제 호출 시험만 쓴다 |

## 기술 부채

| 신호 | 자리 | 영향 |
|---|---|---|
| (11-19) 발행본 안에 묶음 개념이 없고 `position` 하나가 순서·조각·표 글자·cursor를 모두 맡는다 | `publication.entity.ts` 58~89행, `qna-sources.ts` 22~23·84행, `mcp-shared-page.ts` 11~15행 | 프리셋을 더할 때 `position`을 발행본 전체로 이어 매기지 않으면 여러 자리가 함께 깨진다 |
| (11-19) 근거 이동이 DOM id로 항목을 찾고, 없으면 조용히 끝난다 | `recipient-screen.tsx` 66~73행, `publication-detail-screen.tsx` 131~138행 | 탭을 더하면 다른 탭의 항목을 가리킬 때 이동이 실패한다. 실패를 알 길이 없다 |
| (11-19) 근거 이동 코드 두 벌 | 위 두 파일 | 탭 바꾸기·돌아가기를 두 번 고쳐야 한다 |
| (11-19) 탭 부품이 자료 화면 상수에 묶였고 키보드 동작이 덜 됐다 | `materials-view.tsx` 20~35행, `materials-screen.tsx` 288·300행 | 다시 쓰려면 일반화가 먼저다. 텍스트 쪽 `aria-controls`가 없는 id를 가리킨다 |
| (11-19) 출처 단추가 「누른 자리」를 넘기지 않는다 | `gated-item-view.tsx` 32~35행 | 「답으로 돌아가기」를 하려면 단추가 자기 자리(요소·답 번호)를 화면에 알려야 한다 |
| (11-19) 발행 거부 응답에 묶음 위치가 없다 | `publish.service.ts` 319~338행, `pdf-publish.ts` 56~60행 | 「어느 프리셋의 어느 자료」(S6)는 web이 고른 프리셋으로 되짚어야 한다 |
| (11-19) 행만 지우는 마이그레이션은 발행본 PDF 사본 파일을 남긴다 | `publication-manage.service.ts` 141~147행(작성자 삭제는 파일 먼저) | 기존 발행본 버리기(S8)를 SQL로 하면 파일 저장소에 고아 파일이 남는다. 탈퇴 때 회원 접두어로 지워지긴 한다(`withdrawal.service.ts` 49·53행) |
| (11-19) 받은 사람 web이 계약 칸만 옮긴다 | `recipient-api.ts` 27~67행 | 사본에 칸을 더하고 여기를 빠뜨리면 받은 사람 화면에서만 칸이 사라진다(작성자 상세는 보임) |
| (11-19) 같은 상한 값이 여러 곳 | `publications-config.ts` 31·34~36행, web `publications-api.ts` 14행, `pdf-extraction-spec.ts`, worker 설정 | 상한을 프리셋 단위로 바꾸면 모두 함께 바꿔야 한다 |
| (11-16, #559에서 해소) 근거 하나의 기록 줄이 따로 모델에 감 | `qna-sources.ts` `attachGroups` | 맞은 Catch의 같은 근거 줄을 붙이게 됐다. 조각 나누기 자체는 그대로다 |
| (11-16, #559에서 해소) 모델 문서 머리글이 자료 종류뿐 | `citation-request.ts` 35~37행 | `itemContext`가 붙는다 |
| (11-16) 인용 대조가 인용한 줄만 본다 | `api/src/ai-generation/fact-check.ts` 113~121행 | 11-19에 다시 확인하지 않음 |
| (11-16) 조각을 다시 나누는 길이 없다 | `published-index-writer.ts` 21~25행 | 기존 발행본을 버리면 이 intent에는 문제가 없다 |
| 쓰지 않는 공개 조회 | `api/src/catches/public-catch-store.ts`, `catches.module.ts` 11~12행(11-09) | 「공개」의 뜻이 둘로 보인다 |
| 남은 10월 표 | `api/src/share-links/share-link.entity.ts`, `share_link` 표(11-09) | 결정(OQ-U4-3) 전까지 남김 |
| 사본 모양이 흩어짐 | `published-snapshot.ts`, `snapshot-builder.ts`, `chunker.ts`, `summary-sources.ts`, `mcp-shared-text.ts`, web `publications-api.ts`·`recipient-api.ts`(11-19) | 칸 하나에 일곱 파일 |
| 계약 판본을 함께 받지 않음 | `worker-messages.yaml` 머리 주석(11-09) | 결과 칸을 더하면 api·worker를 같이 배포해야 한다 |
| 임시값 | `publications-config.ts`(발행 빈도 1분 10회, 11-19 확인) | 회의 결정 대기(OQ-U4-2). 전체 글 60,000자는 팀장 결정으로 닫혔다(OQ-U4-4, 26행 주석) |
| 시험용 구현이 `src`에 | `publications/in-memory-publication-access.ts`, `analysis-receiver/dev-analysis-injection.ts`, `rag-answer/question-rewriter.ts` `createSyntheticQuestionRewriter` | 앱 모듈에 넣지 않게 주석으로만 막는다 |
| 링크 판별의 한글 끊김 | `web/src/lib/github-source-url.ts` 15~18행(11-09) | 한글 파일 이름이 든 GitHub 주소는 한글 앞에서 끊긴다 |

## 이 intent(#597)가 닿는 자리 (11-19 확인)

승인된 범위 문서의 묶음 S1~S9와 대략 화면 W1~W6에 대해, 지금 코드의 자리와 **함께 고칠 파일**이다. 같은 규칙을 적은 문서도 넣었다(프로젝트 규칙: 규칙을 바꾸면 같은 규칙을 적은 다른 문서를 모두 함께 고친다). 계약 원본(`aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md`)은 열지 않았고, 코드 주석이 그 번호를 가리키는 자리만 적었다. 어느 안을 고를지는 적지 않았다(설계 단계).

| 묶음 | 지금 자리 | 함께 고칠 파일 |
|---|---|---|
| S1 프리셋 만들기·고치기·지우기 | 프리셋 표·경로·화면이 없다(`preset` 이름이 `api/src`·`web/src`에 없음). 고르기 재료는 있다: Catch 목록 `GET /v1/catches?authorDescription=written`(`owner-catch-input.ts`·`owner-catch-store.ts`), 텍스트 자료·PDF 목록, 고르기 부품 `SourcePickerView`·`createSourceLoader`·`catchSourceOf`·`pdfSourceOf`(`publish-view.tsx` 82~190행, `publish-screen.tsx` 91~123행, `publish-sources.ts`), 순서 단추 `SelectedListView`(195~230행) | 새 api 모듈(표 엔티티·마이그레이션·저장소·컨트롤러·입력 검사, 회원 행 `FOR KEY SHARE`·남의 것 404 관례), `app.module.ts`, web 새 기능 폴더(목록 W2·편집 W3)와 주소(`web/src/app/(member)/…`, `lib/routes.ts`, web README 「페이지 주소」), 옮겨 쓰는 발행 고르기 부품, `web/src/features/publications/README.md` 「발행 (W3)」. 확인이 필요한 Catch를 담게 하면 `catchSourceOf`의 `eligible` 판단(78행)을 프리셋 쪽에서는 표시로만 바꾼다 |
| S2 프리셋으로 발행 | 요청은 `items[{kind, sourceId}]`뿐, 정의 밖 칸은 400(`publish-input.ts` 113~124행). 배열 순서 = `position`(`publish.service.ts` 243~249행). 항목 20·같은 원본 한 번·전체 글 60,000자는 발행본 전체(84~105행, `publish.service.ts` 232~236행). 화면은 `createPublishModel`의 `selected`·`add`·`move`·`buildRequest`(`publish-screen.tsx` 170~266행), 확인 단계 `PublishConfirmView`(`publish-view.tsx` 290~330행), 상한 `PUBLISH_LIMITS`(`publications-api.ts` 14행) | `publish-input.ts`(새 요청 모양), `publish.service.ts`(프리셋을 읽어 펼치면 잠금 순서에 프리셋 표 추가, 사본에 묶음 복사), `publications-config.ts`(프리셋 5개 상한), web `publish-screen.tsx`·`publish-view.tsx`·`publish-sources.ts`·`publications-api.ts`(`PublishRequest`·`publishDraftErrors`·`publishFailureLines`), `api/docs/publications.md`, 시험 `publish-api.test.cjs`·`publish-pdf.test.cjs`·`web/test/publish.test.mjs`. 같은 Catch가 두 프리셋에 있으면 지금 400 `arrayUnique`(입력 문서 §7 미결) |
| S3 두 화면의 탭 | 사본은 한 목록으로 그린다(`snapshot-view.tsx` 249~278행). 사본에 묶음 칸이 없다(`published-snapshot.ts` 52~68행, `publication.entity.ts`). 탭 부품은 자료 화면에만(`materials-view.tsx` 20~35행) | 사본 모양(`published-snapshot.ts`, 표 또는 jsonb 칸 + 마이그레이션), `db-publication-access.ts` `readSnapshotIn`, `in-memory-publication-access.ts`, web `publications-api.ts` `isPublishedSnapshot`, `recipient-api.ts` `pickItem`·`readPublishedSnapshot`, `snapshot-view.tsx`(탭 줄, 누른 탭의 프리셋 이름 전체), 탭 부품 일반화(`materials-view.tsx`·`materials-screen.tsx` — 화살표 키, 텍스트 쪽 tabpanel), `materials.module.css`, 시험 `recipient.test.mjs`·`publications-owner.test.mjs`·`materials-screen.test.mjs`, README 셋(publications·recipient·materials) |
| S4 요약·질의응답 배치 | 받은 사람 화면 순서는 자료 → 요약 → 질의응답 → JD(`recipient-view.tsx` 85~86·99~115행). 작성자 상세는 요약 → 자료(`publication-detail-view.tsx` 84~88행). 질의응답 대화는 `QnaPanel` 상태(`qna-panel.tsx` 41행) | `recipient-view.tsx`(요약을 자료 위로, 패널은 탭 밖 그대로), `recipient-view.tsx` 머리 주석 표, `web/src/features/recipient/README.md` 「화면 순서(C-11 자리)」. 패널 `key={token}`을 그대로 두면 탭을 바꿔도 대화가 남는다 |
| S5 출처의 탭 이동·답으로 돌아가기 | `showEvidence(location)` → `resolveEvidenceTarget` → `target` → DOM id로 찾아 스크롤·초점(`recipient-screen.tsx` 55~75행, `publication-detail-screen.tsx` 121~138행, `recipient-slots.ts` 41~52행). 단추는 위치만 넘긴다(`gated-item-view.tsx` 32~35행). 돌아가기 없음 | 두 화면(열린 탭 상태를 화면이 갖고, 강조 대상을 정할 때 탭도 함께 바꿈, 돌아갈 자리 기록), `recipient-slots.ts`(위치 → 탭을 찾는 순수 함수를 둘 자리), `snapshot-view.tsx`([답으로 돌아가기] 자리, 옮겨 간 글 바로 위), `gated-item-view.tsx`·`base-summary-panel.tsx`·`qna-panel.tsx`(누른 단추를 알리는 길 — C-11 evidence-highlight 모양을 바꾸면 자리 4 JD 패널 props도 같은 형), `web/src/features/rag-answer/README.md` 「붙이는 방법」, 시험 `recipient.test.mjs`(`resolveEvidenceTarget` 763행 근처, 11-16 기록)·`rag-answer-*.test.mjs` |
| S6 지원자에게 알리는 것 | 확인 필요·보호 이유는 `catchSourceOf`(`publish-sources.ts` 72~81행), 비공개 안내는 `PRIVATE_CATCH_NOTICE`(`publish-view.tsx` 125·207행), 항목 수·글자 수 안내는 지금 발행 화면에 없다(전체 글은 서버가 발행 때 셈, 화면은 상한 초과 문구만 `TOTAL_TEXT_LIMIT_TEXT`). 409 표시는 `flagged.catchIds`(`publish-screen.tsx` 285~288행). 「고쳐도 보낸 링크는 그대로」 비슷한 문구는 발행본 상세 `FIXED_COPY_NOTICE`(`publication-format.ts`, 이름만) | 프리셋 목록·편집 화면(표시·수·글자 수 — 글자 수는 서버의 `snapshotTextLength`와 같은 셈이어야 맞는다: Catch 조각 대상 칸 + 텍스트 본문 + PDF 쪽 글, 코드 포인트), 발행 화면 실패 문구(어느 프리셋의 어느 자료), `publications-api.ts` `publishFailureLines`·`CATCH_REJECTION_TEXT`. 프리셋 목록에서 글자 수를 보이려면 Catch 본문 길이를 줄 길이 필요(지금 Catch 목록은 작성자 설명 원문을 주지 않음 — `catch-reader.ts` 4행) |
| S7 지우기·탈퇴·방침 | 텍스트 자료 행 삭제(`text-material-store.ts` 102~112행), PDF 파일 → 행(`pdf-materials.controller.ts` 144~157행), 확인 문장 둘(`materials-screen.tsx` 226행, `pdf-materials-api.ts` 205행). 탈퇴는 `member_account` 연쇄(`withdrawal.service.ts` 52행). 방침 문구(`privacy-policy.tsx` 47·75·136행) | 프리셋 표 외래 키(자료 쪽 `ON DELETE CASCADE`면 `materials` 코드 그대로, `member_account` 쪽 CASCADE면 탈퇴 코드 그대로), 확인 문장 둘과 그 시험, `privacy-policy.md`·`privacy-policy.tsx`·`web/test/privacy-policy.test.mjs`(SHA-256) — 문구는 팀장 확정 먼저(README 7·20행), 탈퇴 시험(`mcp-withdrawal.test.cjs`·u2) |
| S8 기존 발행본 버리기 | 발행본 삭제는 파일 접두어 → 행(`publication-manage.service.ts` 126~152행). 행을 지우면 항목·쪽·조각·색인·요약·JD 실행이 연쇄로 지워진다 | 마이그레이션으로 지우면 발행본 PDF 사본 파일(`publicationPrefix`)이 남는다 — 파일까지 지우려면 api 코드 경로(작성자 삭제와 같은 순서)가 필요하다. 열리지 않게만 두면(`stopped_at`) 파일·행이 남고 사본 읽기 코드는 묶음 없는 행을 견뎌야 한다. JD 요약 실행(받은 사람 회원의 기록)도 사라진다 |
| S9 받은 링크 읽기·JD 요약 | MCP는 `{ position, itemKind, title, content }`로 펴고 cursor가 `position`(`mcp-shared-publication-reader.ts` 42~45행, `mcp-shared-page.ts`). JD 요약은 조각만 씀(`jd-summary-processor.ts`) | `position`을 이어 매기면 두 기능 코드는 그대로다. 프리셋 구분을 실으면 `mcp-shared-page.ts`(`SharedPageItem`·`SharedPage`, C-15)·`mcp-shared-text.ts`·`mcp-shared-publication-reader.ts`와 시험 `mcp-shared-*.test.cjs`, 받은 링크 읽기 담당 리뷰(제약 C-O3) |
| W1 상단 메뉴 | `navItems` 넷(`member-header.tsx` 15~20행), 현재 자리 앞부분 일치(31행) | `member-header.tsx`, `lib/routes.ts`, `member-navigation.test.mjs`. 프리셋 주소를 `/publications/` 아래에 두면 「발행본」도 켜진다 |
| 외부 AI(C-R4) | 머리글에 Catch 제목·AI 초안·저장소 이름을 넣지 않는다(`qna-sources.ts` 4행). 요약 근거도 제목을 넣지 않는다(`summary-sources.ts` 2행) | 프리셋 이름을 머리글·근거에 넣으면 `qna-sources.ts`·`summary-sources.ts`·`citation-request.ts`(이번에 다시 읽지 않음), 방침 4절(`privacy-policy.tsx` 103행)·외부 AI 동의 고지, 평가 다시 재기. 넣지 않으면 닿지 않는다 |

### 지키고 있는 경계(바꾸면 안 되는 것)

- 발행본은 발행 당시 자료를 고정한 사본이다. 원본과 외래 키가 없고, 받은 사람 경로는 사본만 읽는다(`db-publication-access.ts` 155~160행, FR4.3). 프리셋을 고치거나 지워도 발행본은 바뀌지 않아야 하므로 프리셋 이름·순서도 사본에 복사해야 한다.
- 발행 때 권한·선택·크기를 트랜잭션 안에서 다시 확인한다(잠근 뒤 다시 읽은 원본으로 자격·전체 글, `publish.service.ts` 230~236행, FR4.7).
- 고른 비공개 Catch는 발행이 커밋될 때만 공개로 바뀐다(254~257행, FR1.5).
- 인용 위치는 사본 칸 하나 안의 UTF-16 범위다(C-01). Catch의 AI 설명 초안·제목은 검색 조각·모델 입력에 넣지 않는다(FR6.4). 시험이 지킨다(`chunker.test.cjs`, `summary-sources.test.cjs`).
- 받은 사람 질의응답은 그 발행본 조각만 찾는다(NFR1.1). AI 요약·질의응답은 발행본 전체가 근거다(FR2.7·FR6.2) — 탭은 화면만 나눈다.
- 질문·답·근거 글은 로그에 남기지 않는다(`rag-answer-log.ts`, `GateLog`).
- 받은 사람 화면 글은 React 텍스트로만 그리고 GitHub 주소만 링크다(`snapshot-view.tsx` 41~92행, NFR1.10). 프리셋 이름도 같은 방식이어야 한다.

## 앞 intent(#559) 결과 (11-19 확인)

11-16에 적은 계획 다섯 가운데 코드로 확인한 것:

| 계획 | 11-19 코드 |
|---|---|
| ① 같은 근거 줄을 함께 보내기 | 조각 나누기는 그대로 두고 검색 뒤 사본에서 붙이는 길(11-16 「길 A」)로 했다. `buildQnaSources`가 맞은 Catch의 GitHub 기록 줄을 ① 같은 근거 → ② 작업 사실·나의 기여 → ③ 남은 근거 순으로 Catch마다 12·전체 40줄까지 붙인다(`qna-sources.ts` 107~196행). 질의응답이 질문마다 사본을 읽는다(`qna.controller.ts` 104행) |
| ② 어느 Catch인지 알게 하기 | 근거마다 `itemContext`(표 글자 + 작업 사실 둘째 줄) 머리글, `context` 뒤에 붙음(`qna-sources.ts` 82~101행, `citation-request.ts` 35~37행). Catch 제목은 넣지 않았다 |
| ③ `QNA_INSTRUCTION` | 앞 문장을 바꿨다(「첫 항목에는 질문에 대한 답」, 「찾은 자료에서는 확인되지 않는다」, `rag-answer-config.ts` 56~62행). 끝 상수는 그대로다 |
| ④ 출처 딱지 옆 항목 제목 | `item-title.ts` + `GatedItemView` `itemTitleOf`(Tab 순서 밖 `<span>`), 받은 사람·작성자 화면이 사본으로 만들어 넘긴다. C-11 `RecipientSlotProps` 모양은 그대로 |
| ⑤ 답 0개 원인 | 게이트 실패 로그와 평가 기록에 항목 아닌 줄 수·끝난 이유·버린 이유별 수(커밋 `126ae048`, 게이트 파일은 11-19에 다시 읽지 않음). 질의응답 끝 로그에 `unattachedLineCount` |

## 그 앞 intent(261109-new-catch)가 닿던 자리 (11-09 기록, 1·2단계만 11-19 확인)

입력 문서(`docs/ai-dlc-input-catch/CatchU_새_Catch_입력.md`)와 승인된 대략 화면(`aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md`)의 1~3단계가 고칠 자리였다.

### 1단계 — 지원자 화면 (11-19 결과 확인)

11-09에 적은 「바꿀 것」 가운데 이번 범위에서 코드로 확인한 것:

- 「설명 씀/안 씀」 서버 걸러 보기: `GET /v1/catches`가 `authorDescription=written|unwritten`을 받고 cursor 범위에 묶는다(`owner-catch-input.ts` 51~55·98행, `owner-catch-store.ts` 32~35행). 목록 응답에 `hasAuthorDescription`이 있다(`catch-reader.ts` 29행).
- 발행 화면 「작성자 설명을 쓴 Catch만 보기」(처음 꺼짐, 켜면 첫 쪽부터 다시)와 작은 줄의 저장소 이름·「설명 안 씀」, 확인 단계 「작성자 설명이 없는 Catch가 N개 있습니다」: `publish-screen.tsx` 143~153·204~210행, `publish-view.tsx` 59~63·100~110·318행, `publish-sources.ts` 15~23·60~65행. 고른 자료는 고르기 목록과 따로 있어 걸러 보기로 사라져도 남는다(11-09 기록과 같음).
- 발행 화면 「저장소마다 3~5개를 권합니다」: `publish-view.tsx` 93행.
- 작성자 설명 칸 제목별 보기와 GitHub 링크 이름: `snapshot-view.tsx` 94~131행(`splitSections`, `GithubLink`), 11-19 확인. 지원자 상세 화면 쪽(`web/src/features/assets/`)은 다시 확인하지 않았다.
- 본인 목록 정렬은 마지막 작업 시각순이 됐다(NC3, `owner-catch-store.ts` 50~53행).

### 2단계 — 면접관 화면 (11-19 결과 확인)

- 사본 선택 칸 `repositoryName`·`authorDescriptionEditedMonth`·`workLimits`·근거 `ownCommit`이 api(`published-snapshot.ts` 10~32행, `snapshot-builder.ts` 62~80행)와 web 검사·옮기기(`publications-api.ts` 87~94행, `recipient-api.ts` 31~49행), 그리기(`snapshot-view.tsx` 163~232행)에 들어가 있다. 칸이 없는 옛 사본도 올바르다.
- 「이 작업의 본인 커밋」 표지: `snapshot-view.tsx` 52~60행.
- 작성자 자료 옮기는 말: `AUTHOR_MATERIAL_VOICE_INSTRUCTION`(`rag-answer-config.ts` 52~53행).

### 3단계 — 분석 쪽 (11-09, 다시 확인하지 않음)

| 바꿀 것 | 지금 자리 | 함께 고칠 파일 |
|---|---|---|
| 다시 고친 줄·옮긴 파일·확장자 바꿈·되돌림 | 재료: `worker/app/collection/records.py`(patch·status·previous_path). 파일 내용 식별값은 그때 버렸다 | `worker/app/collection/normalize.py`(식별값 남기기), 새 판정 모듈, `worker/docs/candidate-text.md` |
| 시험 파일 「있음」(좁은 분류) | `worker/app/generation/title.py` `classify`(재료 순서용, 그대로 둠) | 새 좁은 분류, `worker/docs/generation-material.md` |
| 작업 시각(첫·마지막 본인 커밋) | `CommitRecord.authored_at`. 그때 Catch·사본·응답에 시각 칸 없음(11-19: `catch_asset.first_work_at`·`last_work_at`이 생겼다) | `worker/app/processing/generation.py`·`result.py`, `api/contracts/repository-analysis/worker-messages.yaml`(Result 판본), `api/src/analysis-receiver/receiver.types.ts`·`worker-message.validator.ts`, `api/src/catches/registration-batch.ts`·`new-catch-content.ts`·`entities/catch-asset.entity.ts` + 마이그레이션, `owner-catch-*`(정렬·cursor), `worker/fixtures/m1-synthetic/`, `api/docs/repository-analysis-u7.md`, `worker/docs/repository-analysis-u7.md` |
| 「다시 볼 곳」의 커밋 링크(본인만 보는 새 칸) | 그때 없음(11-19: 본인 응답에 `revisitFacts`가 생겼다, `owner-catch-response.ts` 85~86행) | `owner-catch-response.ts`·`types.ts`·`isCatch`, `assets-view.tsx` `CatchDetail`, `web/test/assets-view.test.mjs` |
| 고지 4절(결과 문장을 Catch에 남기면) | `api/src/analysis-intake/analysis-notice.ts`(`catchu-real-analysis-notice-v3`) | `api/docs/analysis-intake.md`, 팀장 PR 승인 |
| 기존 Catch에 값 채우기 | 등록은 기존 Catch를 고치지 않음(`registration-service.ts` 206행), 소속 커밋은 재분석에서 빠짐 | DB 초기화 시점 결정 또는 「Catch 재생성」(입력 문서 §7) |

### 그때 지키던 경계

- 작성자 설명은 결과 반영·등록 경로가 쓰지 않는다(엔티티 초기값 없음, 저장 경로 하나).
- 사본의 `aiDraft`·제목은 받은 사람 AI 근거가 아니다(`chunker.ts` 104행 주석, `summary-sources.ts` 2행). 11-19에도 같다.
- 작업 사실 문장에 CatchU가 센 숫자·날짜를 쓰지 않는다(`build.py` 27~36행).
- 받은 사람 경로는 원본 Catch를 읽지 않는다(`db-publication-access.ts` 155~160행). 11-19에도 같다.
