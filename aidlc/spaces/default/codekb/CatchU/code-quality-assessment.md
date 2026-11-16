# 코드 품질 평가 — CatchU

> 기준: 2026-11-09 전체 다시 스캔(커밋 `a1d0fbb4`) 위에 2026-11-16 집중 스캔(커밋 `eb0d5a6c`)을 합쳤다. 시험·빌드·린트는 돌리지 않았다. 아래 숫자는 파일을 세고 읽은 결과이며 통과 여부가 아니다. 11-16에 다시 확인한 것은 「받은 사람 AI 시험」, 「기술 부채」의 11-16 줄, 「이 intent(#559)가 닿는 자리」다. 나머지는 11-09 글 그대로다.

## 시험

| 서비스 | 시험 위치 | 틀 | 파일 수 | 특징 |
|---|---|---|---|---|
| api | `api/test/**/*.test.cjs` | Node `node:test` | 168(도우미 포함, 11-09) | 빌드한 `dist/`를 시험. 실제 PostgreSQL 시험 DB 필요(`_test`로 끝나는 이름만), 두 줄(두 DB)로 나눠 돈다. 실제 Valkey 시험은 `CATCHU_TEST_REDIS_URL`이 있을 때만. 실제 외부 AI 시험(`live-*.test.cjs`)은 따로 |
| web | `web/test/*.test.mjs` | Node `node:test` | 67(11-09) | `.ts`·`.tsx`를 바로 불러 화면 모델·검사기·문구를 시험. 브라우저 없이 그리기 결과 검사(`u2-render.mjs`) |
| worker | `worker/tests/` | pytest 9.1.1 | 54(11-09) | 합성 GitHub, 실제 git 합성 저장소, 합성 제공자, 실제 Redis(CI는 Valkey로 늘 돈다) |
| deploy | `deploy/**/*.test.sh` | bash | 6(11-09) | 생성·배포 스크립트의 안전 장치 시험 |

- **커버리지**: 세 서비스 모두 명령은 있다(api `npm run test:coverage`, web `npm run test:coverage`, worker `pytest --cov`). CI는 재지 않는다. 팀 규칙은 「팀장이 넣은 서비스별 명령을 쓰고 Unit이 따로 도구를 들이지 않는다」(`team.md` 「Testing Posture」).
- **시험 방식**: 팀 관행은 custom(시나리오·기대·실패 조건을 먼저 정하고 세부 시험은 구현 뒤). 시험 이름과 주석이 요구사항 ID(BR·NFR·FR)를 단다.

### 받은 사람 AI 시험 (11-16 확인, 시험 이름과 검색 결과 줄만 읽음)

| 대상 | 시험 파일 | 덮는 것 |
|---|---|---|
| 조각 나누기 | `api/test/published-index/chunker.test.cjs`(13개) | Catch 조각 6개의 칸 순서·출처 종류·근거 주소, `aiDraft` 조각 없음(37행), null 작성자 설명, 문단·줄·1,000자 나누기와 대리쌍, PDF 쪽, 항목·칸 순서(116행), 모양 오류(124행), NC2 새 칸 넷·본인 커밋 표지가 조각에 0건(166행), NC3 다시 볼 곳 사실·작업 시각이 0건(188행) |
| 조각 저장·검색·임베딩 | `published-index-writer.test.cjs`, `published-search.test.cjs`(6), `embed-publication-handler.test.cjs`, `embedding-provider.test.cjs`, `queue-embedding.test.cjs`, `published-index-module.test.cjs`, `live-embedding.test.cjs`(실제 Voyage, 따로) | 트랜잭션 안 저장, 상태 전이, 검색 순서·범위, 처리기 실패·늦은 결과 |
| 인용 요청 | `api/test/ai-generation/citation-request.test.cjs`(6) | 근거 없음 `SKIP`, 빈 줄 근거, 문서 = 줄마다 글 블록·`context`는 출처 종류 설명(28행), 시스템 지시 조립·`publicationText` 안 보냄(42행) |
| 줄·응답·위치·따옴표 | `citation-lines.test.cjs`, `response-items.test.cjs`(11), `quote-citations.test.cjs`(10), `ai-generation-gate.test.cjs`(U1), `live-citation.test.cjs`(실제 Claude, 따로) | 항목 판정, 잘림, 위치 연결 실패, 따옴표 인용 |
| 게이트 대조·스트림 | `api/test/u2/ai-gate-checks.test.cjs`(10), `ai-gate-stream.test.cjs`(6), `ai-gate-jd.test.cjs` | 대조로 버림과 `ai_gate_result`의 `dropReasons`(checks 77~78행), 스트림 항목 순서, 잘림, `REFUSED`·`NO_ITEMS`·`CALL_FAILED`(stream 73행), #528 따옴표 인용 |
| 질의응답·요약 | `api/test/rag-answer/qna-controller.test.cjs`(14), `question-input.test.cjs`, `question-rewriter.test.cjs`, `question-counter.test.cjs`, `summary-sources.test.cjs`(6), `base-summary-handler.test.cjs`, `summary-controller.test.cjs`, `rag-answer-app.test.cjs`, `rag-eval.test.cjs`(9, 평가 스크립트), `rag-eval-input.json` | 확인 넷 순서, SSE 사건, 다시 쓰기, 요약 근거 칸 |
| JD 요약(같은 검색·게이트) | `api/test/jd/jd-summary.test.cjs`, `jd-integration.test.cjs` | JD 요청 검사, 게이트 연결 |
| web 질의응답·요약 | `web/test/rag-answer-api.test.mjs`(9), `rag-answer-state.test.mjs`(8), `rag-answer-sse-reader.test.mjs` | 응답 모양 검사, SSE 해석, `askDisplay`(`done` 항목 0개 → 근거 못 찾음 안내, 59행) |
| web 근거 강조 | `web/test/recipient.test.mjs` 763~766행(`resolveEvidenceTarget`), `publications-owner.test.mjs` | 항목·칸·범위 대조 |
| **시험 없음** | `web/src/features/rag-answer/gated-item-view.tsx`, `base-summary-panel.tsx`, `qna-panel.tsx` | 출처 딱지 그리기. 그 폴더 README 「시험」: `.tsx` 패널은 시험이 불러오지 않는다 |

- 질의응답 품질은 시험이 아니라 평가 스크립트로 잰다: `npm run rag-eval`(`api/scripts/rag-eval/`, 질문 10개, 앞 5·8·12개 적중과 통과·버린 항목 수)과 기록 `api/docs/rag-evaluation/`(2026-11-12, 2026-11-12-528, 2026-11-14-text-header). 설명은 `api/docs/rag-answer.md` 「RAG 품질 평가(US19.3)」.

## 린트·타입·서식 (11-09)

| 서비스 | 도구 | 설정 | 엄격함 |
|---|---|---|---|
| api | ESLint 10 + typescript-eslint, `tsc --noEmit` | `api/eslint.config.mjs`, `tsconfig.json` | 경고도 실패(`--max-warnings=0`) |
| web | ESLint 9 + `eslint-config-next`(core-web-vitals·typescript), `tsc --noEmit` | `web/eslint.config.mjs`, `tsconfig.json` | 기본 |
| worker | Ruff(E4·E7·E9·F·I·UP·B) + `ruff format`, mypy strict(`app`·`tests`) | `worker/pyproject.toml` | 엄격 |

억제 표시는 worker 4곳뿐이다(`processing/collection_file.py` 45행 `type: ignore`, `processing/confirm.py` 390행 `noqa: E731`·430행 `type: ignore`, `consumer/parent.py` 422행 `type: ignore`). api·web 제품 코드에는 `eslint-disable`·`@ts-ignore`가 없다. TODO·FIXME·HACK 표시도 제품 코드에 없다(11-16에 네 폴더를 다시 읽었을 때도 없었다).

## CI/CD (11-09)

- `.github/workflows/ci.yml`: `dev`·`intent/**` 대상 PR과 push. `changes`(경로 판정, CI 판정 시험, 문서 크기 검사) → 바뀐 서비스만 `web`(`npm run check`)·`api`(lint·typecheck·test·공용 합성 자료 검사, PostgreSQL·Valkey 서비스)·`worker`(ruff·format·mypy·pytest)·`deps-audit`. 외부 action은 커밋 SHA 고정, 토큰을 작업 폴더에 남기지 않음.
- `.github/workflows/images.yml`: 이미지 검사(`deploy/scripts/check-images.mjs`)와 CD 스크립트 시험.
- `.github/workflows/deploy-dev-server.yml`: `main` push → 계획·검사·배포(ECR push, SSM으로 서버 교체, 확인).
- Dependabot은 action 갱신만(주 1회). 기반 이미지 갱신 알림은 아직 없다(`deploy/README.md`).
- 팀 규칙: 보호 브랜치는 PR·승인 1건·merge commit만. CI가 필수 상태 검사다.

## 문서

- 서비스 README 셋이 설치·실행·검사·환경변수를 자세히 적는다. 기능 안내는 `api/docs/`, `worker/docs/`, `web/src/features/*/README.md`에 나눴다. 코드 주석이 결정·요구사항 번호와 이유를 촘촘히 적는다(한국어).
- 문서 크기 상한을 CI가 본다(`.github/scripts/check-doc-sizes.sh`). AI 도구가 큰 파일을 잘라 읽는 문제를 줄이려는 것이다(`api/README.md` 7행).
- 위험: 같은 규칙이 코드 주석·`api/docs`·`worker/docs`·AI-DLC 기능 설계에 여러 번 적혀 있어 한 곳만 고치면 어긋난다(이 프로젝트의 learned 규칙도 같은 내용). 받은 사람 AI에서는 `context` 글자가 `citation-request.ts`와 `api/docs/ai-generation.md` 39행에, 질의응답 단계 순서가 `qna-service.ts`와 `api/docs/rag-answer.md` 48행에, 조각 칸 순서가 `chunker.ts`·`summary-sources.ts`·`recipient-slots.ts`·`api/docs/published-index.md` 「조각 나누기」에 함께 적혀 있다(11-16 확인).

## 품질 빠른 평가

| 항목 | 평가 | 근거 |
|---|---|---|
| 이름 | good | 파일·함수 이름이 하는 일을 말한다(`buildCatchSnapshot`, `assertCatchesEligible`, `choose_record_text`, `buildChunkDrafts`, `buildCitationRequest`, `passesCitedCheck`). 한국어 주석이 업무 낱말을 맞춘다 |
| 함수 크기 | fair | api는 대체로 짧다(받은 사람 AI 네 폴더의 함수도 대부분 30줄 안쪽, 11-16). worker 판정 파일은 한 파일에 단계가 많다(`grouping.py` 1,880줄, `relations.py` 1,584줄, `flow.py` 943줄, `build.py` 805줄, `generation/claude.py` 786줄) |
| 오류 처리 | good | 무결성 오류를 전용 예외로 던지고 0건·성공으로 숨기지 않는다. 남의 것·없는 것은 같은 404. 비동기 접수와 완료를 나눈다. 다만 질의응답 스트림에서 모델 항목이 모두 버려지면 오류 없이 `done`이 되어 「근거를 못 찾음」과 구분되지 않는다(11-16, 아래 부채 표) |
| 시험 있음 | good | 핵심 경로마다 시험 파일이 있다. DB·큐·git을 실제로 쓰는 시험이 많다. 받은 사람 화면의 항목 표시 부품(`gated-item-view.tsx`)은 시험이 없다(11-16) |
| 중복 | fair | 사본 모양 검사·복사가 다섯 곳, 사본 칸 순서 목록이 세 곳(`chunker.ts`·`summary-sources.ts`·`recipient-slots.ts`, 11-16), `affectedRows`·`isForeignKeyViolation`·`findGuardedFetchError`가 모듈마다 따로(11-16), 회원 행 확인(`assertMemberExists`)이 모듈마다 따로, UUID 검사 정규식이 여러 파일에 있다 |
| 죽은 코드 | fair | `PublicCatchStore`(제품에서 안 씀), `share_link` 표·엔티티, 10월 기록 문서·수동 확인 도구. U1 최소 게이트(`ClaudeAiGenerationGate`)는 시험과 실제 호출 시험만 쓴다(`ai-generation.gate.ts` 1~3행 주석, 11-16) |

## 기술 부채

| 신호 | 자리 | 영향 |
|---|---|---|
| (11-16) 근거 하나의 기록 줄이 줄마다 따로 조각·근거 | `api/src/published-index/chunker.ts` 118~123행 | 같은 커밋·PR의 다른 줄은 검색 상위 8개에 같이 들 때만 모델에 간다. 모델은 줄 하나만 보고 답하거나, 다른 줄 낱말을 써서 대조로 버려진다 |
| (11-16) 모델 문서 머리글이 자료 종류뿐 | `api/src/ai-generation/citation-request.ts` 22~26·52행 | 여러 Catch의 조각이 섞여도 모델이 어느 Catch 것인지 모른다. 문서 순서도 점수 순이라 항목 순서가 아니다 |
| (11-16) 인용 대조가 인용한 줄만 본다 | `api/src/ai-generation/fact-check.ts` 113~121행 | 근거를 넓게 보내도 인용하지 않은 줄의 낱말은 대조 대상이 아니다 |
| (11-16) 스트림 「모두 버림」이 정상 끝 | `api/src/ai-generation/checked-gate.ts` 204~218행, `api/src/rag-answer/qna-service.ts` 118~133행, `web/src/features/rag-answer/rag-answer-state.ts` 74~78행 | 화면은 「근거를 찾지 못했습니다」를 보이지만 실제로는 근거가 있었고 답이 버려진 경우다. 원인은 `ai_gate_result`에만 있다 |
| (11-16) 실패 로그에 줄 수가 없다 | `checked-gate.ts` 140~145행(`ai_gate_failed`) | `NO_ITEMS` 때 모델이 항목 아닌 줄을 몇 줄 썼는지(형식을 안 지켰는지) 알 수 없다 |
| (11-16) 조각을 다시 나누는 길이 없다 | `published-index-writer.ts` 21~25행 | 나누기를 바꿔도 이미 발행한 발행본은 옛 조각으로 답한다 |
| (11-16) 항목 표시 부품 시험 없음 | `web/src/features/rag-answer/gated-item-view.tsx` | 딱지 옆 제목을 더할 때 그리기 결과를 확인할 시험이 없다 |
| 쓰지 않는 공개 조회 | `api/src/catches/public-catch-store.ts`, `catches.module.ts` 11~12행(11-09) | 「공개」의 뜻이 둘로 보인다 |
| 남은 10월 표 | `api/src/share-links/share-link.entity.ts`, `share_link` 표(11-09) | 결정(OQ-U4-3) 전까지 남김 |
| 만든 시각 없음 | `catch_asset`(마이그레이션 `1790600000000`, 11-09) | 목록이 무작위 UUID 순서다 |
| 사본 모양이 흩어짐 | `published-snapshot.ts`, `snapshot-builder.ts`, `chunker.ts`, `summary-sources.ts`, `web/.../publications-api.ts`, `web/.../recipient-api.ts`(11-09) | 칸 하나에 여섯 파일 |
| 계약 판본을 함께 받지 않음 | `worker-messages.yaml` 머리 주석(11-09) | 결과 칸을 더하면 api·worker를 같이 배포해야 한다 |
| 임시값 | `publications-config.ts`(발행 빈도 1분 10회, 전체 글 60,000자, 11-09) | 회의 결정 대기(OQ-U4-2·OQ-U4-4) |
| 시험용 구현이 `src`에 | `publications/in-memory-publication-access.ts`, `analysis-receiver/dev-analysis-injection.ts`, `rag-answer/question-rewriter.ts` `createSyntheticQuestionRewriter`(11-16) | 앱 모듈에 넣지 않게 주석으로만 막는다 |
| 링크 판별의 한글 끊김 | `web/src/lib/github-source-url.ts` 15~18행(11-09) | 한글 파일 이름이 든 GitHub 주소는 한글 앞에서 끊긴다 |

## 이 intent(#559)가 닿는 자리 (11-16 확인)

GitHub 이슈 #559(받은 사람 질의응답이 틀리게 답한 자리)의 계획 변경 다섯과 **함께 고칠 파일**이다. 같은 규칙을 적은 문서도 넣었다(프로젝트 규칙: 규칙을 바꾸면 같은 규칙을 적은 다른 문서를 모두 함께 고친다). 계약 원본(`aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md`)은 이번에 열지 않았고, 코드 주석이 그 번호를 가리키는 자리만 적었다.

| 바꿀 것 | 지금 자리 | 함께 고칠 파일 |
|---|---|---|
| ① 같은 근거(커밋·PR)의 기록 줄을 함께 모델에 보내기 | `chunker.ts` `catchFields`(105~128행)가 `evidence[i].representedFacts[j]`마다 칸 하나로 고르고 `splitFieldRanges`가 칸 안에서만 나눈다. 검색(`published-search.ts` 124~144행)은 조각 8개를 점수 순으로만 준다. `chunkToSource`(`qna-service.ts` 48~57행)는 조각 하나를 근거 하나로 옮긴다 | 길 A(검색 단위는 그대로, 근거를 넓힘): `qna-service.ts`(맞은 조각의 같은 `evidence[i]` 다른 줄을 근거로 더함 — 그 글은 사본에 있으므로 C-10 `readSnapshot` 또는 조각 표 `fieldPath` 조회가 필요), 입력 상한 80,000자(`gate-policy.ts`)와 JD 쪽 6개·1,000자 검사(`jd-generation-request.ts` 32행)를 넘지 않는지. 길 B(조각을 근거 단위로 합침): `chunker.ts`, `published-chunk.entity.ts`(조각이 여러 칸에 걸치면 `fieldPath`·`charStart`·`charEnd` 한 벌로 위치를 못 적는다) + 마이그레이션, `citation-request.ts`·`citation-locator.ts`(블록마다 근거 칸을 대응), `quote-citations.ts`, `summary-sources.ts`(기본 요약도 같은 규칙인지), `jd-generation-request.ts`, web `recipient-slots.ts` `resolveEvidenceTarget`(칸 하나만 강조). 두 길 모두: `api/docs/published-index.md` 「조각 나누기」·「알려진 한계」, `api/docs/rag-answer.md` 「단계 순서」, `api/test/published-index/chunker.test.cjs`, `api/test/rag-answer/qna-controller.test.cjs`, 옛 발행본을 다시 나누는 길(`published-index-writer.ts`는 지금 다시 나누지 않음) |
| ② 조각마다 어느 Catch의 것인지 검색·모델이 알게 하기 | 모델: `SOURCE_KIND_CONTEXT`(`citation-request.ts` 22~26행)를 `context`에 그대로 넣는다(52행). 검색: 임베딩 글은 조각 글 그대로(`embed-publication-handler.ts` 136~141행)이고 질문 임베딩과만 비교한다. 쓸 수 있는 값은 `ChunkHit.publishedItemId`, 항목 `position`, 사본 `repositoryName`(선택 칸), 근거 `sourceUrl`이다. Catch 제목·AI 초안은 넣지 않는다(FR6.4, `chunker.ts` 104행) | 모델 쪽: `citation-request.ts`(`AiSource`에 항목 표시를 실을 칸이 없다 — `ai-generation.types.ts` `AiSource`에 칸을 더하면 C-01 모양이 바뀐다), `qna-service.ts` `chunkToSource`, `summary-sources.ts`, `jd-generation-request.ts`(같은 게이트를 쓰므로 함께 받거나 빈 값), `api/docs/ai-generation.md` 39행, `api/test/ai-generation/citation-request.test.cjs` 28행. 검색 쪽(임베딩 글에 머리말을 붙이면): `embed-publication-handler.ts`, `published_chunk.text`는 사본 원문 그대로여야 하므로(위치 검사 BR1.2) 임베딩에만 붙이는 별도 글이 필요, 옛 발행본 벡터는 그대로. 인용 대조는 `context` 글자를 보지 않는다(`fact-check.ts`) |
| ③ 질의응답 지시 `QNA_INSTRUCTION` 수정 | `rag-answer-config.ts` 43~45행. 끝 문장 `AUTHOR_MATERIAL_VOICE_INSTRUCTION`(40~41행)은 기본 요약(55행)·JD 요약(`jd-generation-request.ts` 7~8행)과 같은 상수다. 항목 형식 지시는 `citation-request.ts` `ITEM_FORMAT_INSTRUCTION`, 공통 방어 문구는 `gate-policy.ts` `COMMON_GUARD_INSTRUCTION`이 앞뒤로 붙는다 | 질의응답만 바꿀 때는 앞 문장만 바꾸고 상수는 그대로 둔다. `api/docs/rag-answer.md` 「값」, 확인은 `npm run rag-eval`(질문 10개)·`api/docs/rag-evaluation/`에 새 기록, `api/test/rag-answer/rag-eval.test.cjs`. 상수를 바꾸면 기본 요약·JD 요약도 바뀐다(상수 주석 37~39행: 바꾸면 질의응답 10개를 다시 잰다) |
| ④ 출처 딱지 옆에 근거가 속한 항목 제목 | `gated-item-view.tsx` 23~31행: 인용마다 `<blockquote>` + `sourceLabel` 단추. 부품 props는 `items`·`showEvidence`·`testId`뿐이고 사본이 없다. 제목은 `PublishedSnapshotItem.title`(사본)에 있고, 사본은 받은 사람 `recipient-view.tsx` 84행·작성자 `publication-detail-view.tsx` 86행만 갖는다. 패널 props: 받은 사람 C-11 `RecipientSlotProps`(`recipient-slots.ts` 21~31행), 작성자 `{ publicationId, showEvidence }` | `gated-item-view.tsx`, `base-summary-panel.tsx`·`qna-panel.tsx`(props로 받아 넘김), `recipient-view.tsx` `RecipientSlots`(97~113행)·`recipient-screen.tsx`(slotProps 만들기 77~83행), `publication-detail-view.tsx` 84행, `recipient-slots.ts` `RecipientSlotProps`(C-11 모양을 바꾸면 자리 4 `JdRecipientPanel`도 같은 props를 받는다), `web/src/features/rag-answer/README.md` 「붙이는 방법」 props 표, `web/src/features/recipient/README.md`, 시험(지금 `gated-item-view.tsx` 시험 없음 — `web/test/rag-answer-*.test.mjs` 꼴의 순수 함수로 「위치 → 제목」을 빼면 시험할 수 있다). 사본에 없는 `publishedItemId`면 제목을 붙이지 않는다(`resolveEvidenceTarget`이 null을 주는 경우와 같다). 제목은 모델에 보내지 않는다 |
| ⑤ 답 항목 0개 실패 원인 확인 | 세 길(`architecture.md` 「답 항목 0개의 세 길」): 조각 0개(`qna-service.ts` 112행), 모델 항목 0개 → `NO_ITEMS`(`checked-gate.ts` 217행, 로그 `ai_gate_failed`), 모두 버려짐 → 정상 `done`(로그 `ai_gate_result`의 `itemCount: 0`·`dropReasons`). 질의응답 끝 로그 `qna.completed`에는 `chunkCount`·`itemCount`·`outcome`·`failure`가 있다 | 로그 확인만이면 코드 변경 없음. 운영 로그에서 같은 요청의 `ai_gate_result`/`ai_gate_failed`와 `qna.completed`를 시각으로 짝지어 본다(두 로그에 공통 요청 ID가 없다 — `requestId`는 Claude 요청 ID라 `qna.completed`에 없음). 로그 칸을 더하면 `checked-gate.ts` `GateLog`·`fail`, `rag-answer-log.ts`, `api/docs/ai-generation.md` 「로그」, `api/docs/rag-answer.md` 「로그 사건」, `api/test/u2/ai-gate-stream.test.cjs` |

### 지키고 있는 경계(바꾸면 안 되는 것)

- 인용 위치는 사본 칸 하나 안의 UTF-16 범위다(C-01). 위치 = 근거 `location.charStart` + 줄 시작이고, 근거 `text`는 그 범위의 원문 그대로다(`citation-locator.ts`, `chunker.ts` `toDraft` 위치 검사).
- Catch의 AI 설명 초안·제목은 검색 조각·모델 입력에 넣지 않는다(FR6.4). 시험이 지킨다(`chunker.test.cjs` 37·166·188행, `summary-sources.test.cjs`).
- 받은 사람 질의응답은 그 발행본 조각만 찾는다. 범위를 넓히거나 자료를 빼는 인자가 없다(`published-search.ts` 119~123행 주석, NFR1.1).
- JD 요약도 같은 조각·검색·게이트를 쓴다. 조각 모양을 바꾸면 JD 요청 검사(`jd-generation-request.ts`)가 먼저 깨진다.
- 질문·답·근거 글은 로그에 남기지 않는다(`rag-answer-log.ts`, `GateLog`).

## 앞 intent(261109-new-catch)가 닿던 자리 (11-09, 다시 확인하지 않음)

입력 문서(`docs/ai-dlc-input-catch/CatchU_새_Catch_입력.md`)와 승인된 대략 화면(`aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md`)의 1~3단계가 고칠 자리와 **함께 고칠 파일**이었다. 아래 글은 2026-11-09 기록이며, 그 뒤 들어간 변경은 다시 확인하지 않았다.

### 1단계 — 지원자 화면

| 바꿀 것 | 지금 자리 | 함께 고칠 파일 |
|---|---|---|
| 작성자 설명을 칸 제목별로 쓰고 보기(한 칸 4,000자 그대로) | `web/src/features/assets/author-description-panel.tsx`(textarea 하나), `author-description-editor.tsx`, `author-description-api.ts` | `web/src/features/publications/snapshot-view.tsx`(보기 나누기), `web/src/features/assets/README.md`, `api/docs/publications.md`(C-14 설명), `api/src/catches/author-description-input.ts`(상한은 그대로) |
| 「설명 씀/안 씀」 걸러 보기. 저장소 걸러 보기처럼 목록 요청 조건으로 **서버에서 거르기로 정했다**(대략 화면 1절. 목록은 20개씩 오므로 받은 목록 안에서만 거르면 다음 쪽의 Catch가 빠진다) | `api/src/catches/owner-catch-input.ts` `ownerCatchQuery`(지금 받는 쿼리 칸은 `limit`·`repositoryId`·`sourceRequestId`·`cursor`뿐이고 그 밖 칸은 400)·`cursorScope`(커서가 회원·`repositoryId`·`sourceRequestId`를 함께 묶는다. 새 조건도 묶어야 다른 조건의 커서를 거부한다), `owner-catch-store.ts` `list`의 `conditions`(22~35행, 저장소 조건과 같은 꼴로 더한다), `catch-reader.ts` `READ_COLUMNS`(지금 작성자 설명 칸을 읽지 않는다), `owner-catch-response.ts`, `web/src/features/assets/types.ts`·`catch-api.ts` `list`(지금 쿼리는 `limit`·`repositoryId`·`cursor`, 62~68행)·`isCatch`. 「받은 목록 안에서만 거름」은 지금 **공개 상태** 걸러 보기의 설명이다(`assets-view.tsx` 9·113행, `web/src/features/assets/README.md` 70행) | `api/docs/catch-owner-read-preparation.md`(9행 목록 걸러 보기), `web/src/features/assets/README.md`(53·54·70행 걸러 보기 설명), `assets-view.tsx` 걸러 보기 칸과 빈 결과 안내, `assets-store.ts`·`assets-connected.tsx`(목록 요청과 주소의 걸러 보기 복원), `api/test/catches/owner-catch-*.test.cjs`, `web/test/assets-*.test.mjs` |
| 생각해 볼 질문 옆 안내 문구 | `assets-view.tsx` 272~276행 | `web/test/assets-view.test.mjs` |
| 상세 칸 순서 바꿈: Catch 설명 초안·생각해 볼 질문을 작성자 설명 위로 올리고, 근거 아래에 「다시 볼 곳」 자리를 둔다(대략 화면 2절) | `assets-view.tsx` `CatchDetail` 253~277행. 그때 순서는 근거(253행) → 작성자 설명 `{descriptionEditor}`(266행) → Catch 설명 초안(268행) → 생각해 볼 질문(272행) → 현재 확인 상태(277행)였다 | 같은 순서를 적은 곳: `assets-view.tsx` 21행 주석(「근거와 AI 초안 사이에 둔다(BR1.3)」), `web/src/features/assets/README.md` 27행, `web/test/assets-view.test.mjs` |
| 발행 화면 「저장소마다 3~5개 권장」 | `web/src/features/publications/publish-view.tsx` `SourcePickerView` 63~65행 | `web/src/features/publications/README.md` |
| 작성자 설명 안 GitHub 링크를 주소 전체 대신 「파일 · 줄 · 판본」 같은 이름으로 보이기(커밋·PR 이름, 다른 저장소면 「소유자/저장소 ·」 앞붙임 포함, 대략 화면 「GitHub 링크 이름」). 화면에서만 계산하고 API는 그대로 | `web/src/features/publications/snapshot-view.tsx` `LinkedText`·`linkedSegments`(그때 링크 글자로 주소 전체 `segment.url`을 보였다, 50~51행). 링크 찾기는 `web/src/lib/github-source-url.ts` `splitGithubLinks`(판별 규칙은 그대로 둔다) | 이름을 짓는 새 함수(`github-source-url.ts` 곁. 받은 사람 화면 `recipient-format.ts`가 같은 판별 함수를 다시 내보낸다), `web/test/publications-owner.test.mjs`(400행이 링크 글자 = 주소 전체를 검사), `web/src/features/publications/README.md` 16·21행, `web/src/features/recipient/README.md` 49행. 주의: `LinkedText`는 텍스트 자료 본문에도 쓴다(151행). 강조 위치는 원문 주소 길이로 세므로(`linkedSegments`의 offset) 보이는 이름이 짧아져도 원문 길이로 세야 한다. 다른 저장소인지는 사본 근거 `sourceUrl`과 견준다 |
| 지원자 상세의 「발행하면 면접관에게 열릴 링크」 목록(h4 제목, 8칸 전체, 합계 글자 수 바로 위). 위 링크와 같은 판별·이름 규칙 | 없음. 편집 칸은 `web/src/features/assets/author-description-panel.tsx`(textarea 하나 46행, 글자 수 50행) | 위 줄과 같은 `splitGithubLinks`와 이름 함수를 함께 써야 면접관 화면과 이름이 어긋나지 않는다. `author-description-panel.tsx`, `web/test/author-description*.test.mjs` |
| 발행 화면 Catch 항목의 저장소 이름과 「설명 안 씀」 | `publish-view.tsx` `SourcePickerView` 항목(85~89행: 제목, 공개·비공개와 불일치, 고를 수 없는 이유, 비공개 안내), `web/src/features/publications/publish-sources.ts` `CatchSource`(`catchId`·`title`·`visibility`·`mismatch`·`eligible`·`reason`만. `catchSourceOf`가 `CatchAsset`에서 뽑는다). 목록 응답에는 저장소 이름이 없고(`types.ts` 47행 주석) 작성자 설명이 있는지도 없다. 내 자산 화면은 따로 받은 저장소 목록(`RepositoryOption`)에서 이름을 찾지만 발행 화면은 저장소 목록을 불러오지 않는다 | `publish-sources.ts` `CatchSource`·`catchSourceOf`, 위 「설명 씀/안 씀」 줄과 같은 「작성자 설명이 있는지」 칸(`owner-catch-response.ts`·`types.ts`·`isCatch`), 저장소 이름을 얻는 길(저장소 목록을 함께 부르거나 응답에 칸을 더하거나 둘 중 하나), `web/src/features/publications/README.md` 「발행 (W3)」, `web/test/publish.test.mjs` |
| 「작성자 설명을 쓴 Catch만 보기」 칸(처음 꺼짐, 1절과 같은 목록 요청 조건으로 서버에서 거름) | `web/src/features/publications/publish-screen.tsx` 121행의 목록 요청 `client.catches.list("", cursor, signal)`(저장소 조건 없이 20개씩, `createSourceLoader`가 첫 쪽·더 보기를 맡는다). `catch-api.ts` `list`는 내 자산 화면(`assets-store.ts` 70·101행)과 함께 쓴다 | `catch-api.ts` `list`의 새 조건(위 서버 걸러 보기 줄과 같은 쿼리 칸), `SourcePickerView`(체크 칸, 걸러 본 개수 알림), `publish-screen.tsx`(칸을 바꾸면 첫 쪽부터 다시 불러옴), `web/test/publish.test.mjs` |
| 확인 단계 안내 「작성자 설명이 없는 Catch가 N개 있습니다」(발행은 막지 않음) | `publish-view.tsx` `PublishConfirmView` 225·245행이 비공개 Catch 수를 `SelectedItem.visibility`로 세어 같은 꼴 안내를 보인다. 확인 단계는 고르기 목록이 아니라 고른 자료(`SelectedItem[]`)만 받는다 | `publish-sources.ts` `SelectedItem`(그때 `kind`·`sourceId`·`title`·`visibility`)에 「작성자 설명이 있는지」를 `visibility`처럼 싣는다, `publish-screen.tsx` `toggleCatch`(161~168행, 고를 때 `CatchSource`에서 옮겨 담는다), `web/test/publish.test.mjs` |
| 짚어 볼 곳 링크(한글 파일 이름) | `web/src/lib/github-source-url.ts` | 작성자 설명 안내 문구 |

- **고른 자료는 고르기 목록과 따로 있다.** `publish-screen.tsx`의 화면 상태(`PublishScreenState`)는 고르기 목록(`catches`·`materials`)과 고른 자료(`selected`)를 따로 든다. 목록을 다시 불러와도 `selected`는 그대로다. 지원자가 빼는 동작(`remove`·`toggleCatch`) 말고 `selected`를 비우는 곳은 발행을 마친 뒤 완료 화면의 [새로 발행](`reset`, 240~243행, `step === "done"`일 때만)뿐이고, 발행이 실패하면 그대로 둔다(216행 주석). 그래서 「작성자 설명을 쓴 Catch만 보기」를 켜 목록에서 사라진 Catch도 고른 채로 남고, 확인 단계의 수 안내는 목록이 아니라 `selected`로 세야 한다.

### 2단계 — 면접관 화면

| 바꿀 것 | 지금 자리 | 함께 고칠 파일 |
|---|---|---|
| 사본에 저장소 이름·작성 시점·조회 한계 | `published-snapshot.ts` `CatchSnapshot`, `snapshot-builder.ts` `buildCatchSnapshot`·`CatchSourceRow`, `publish.service.ts` `CATCH_LOCK_SQL`·`EVIDENCE_SQL` | `api/src/published-index/chunker.ts`(새 칸은 조각에서 빼야 함 — 코드는 모르는 칸을 무시. 11-16 확인: 빠져 있고 시험이 지킨다), `api/src/rag-answer/summary-sources.ts`(같음), `web/src/features/publications/publications-api.ts` `isCatchSnapshot`, `web/src/features/recipient/recipient-api.ts` `pickItem`(새 칸을 옮기지 않으면 사라짐), `snapshot-view.tsx`, `api/docs/publications.md`·`recipient-publication.md`·`published-index.md`·`rag-answer.md`, `api/test/publications/*`, `web/test/recipient.test.mjs`·`publications-owner.test.mjs` |
| 옛 사본 견디기 | `db-publication-access.ts` `readSnapshotIn`은 jsonb를 그대로 돌려준다 | 위 다섯 읽는 곳이 칸 없음을 받아들여야 한다 |
| 링크 표지 「이 작업의 본인 커밋」 | 그때 없음. 사본 근거 `sourceUrl`·`sourceRevision`(본인 커밋 최근 20건까지)과 비교 | `snapshot-view.tsx` `LinkedText` |
| 요약·질의응답 지시(작성자 자료 옮기는 말) | `api/src/rag-answer/rag-answer-config.ts`(11-16 확인: `AUTHOR_MATERIAL_VOICE_INSTRUCTION`으로 들어갔다) | `api/docs/rag-answer.md` |

### 3단계 — 분석 쪽

| 바꿀 것 | 지금 자리 | 함께 고칠 파일 |
|---|---|---|
| 다시 고친 줄·옮긴 파일·확장자 바꿈·되돌림 | 재료: `worker/app/collection/records.py`(patch·status·previous_path). 파일 내용 식별값은 그때 버렸다 | `worker/app/collection/normalize.py`(식별값 남기기), 새 판정 모듈, `worker/docs/candidate-text.md` |
| 시험 파일 「있음」(좁은 분류) | `worker/app/generation/title.py` `classify`(재료 순서용, 그대로 둠) | 새 좁은 분류, `worker/docs/generation-material.md` |
| 작업 시각(첫·마지막 본인 커밋) | `CommitRecord.authored_at`. 그때 Catch·사본·응답에 시각 칸 없음 | `worker/app/processing/generation.py`·`result.py`, `api/contracts/repository-analysis/worker-messages.yaml`(Result 판본), `api/src/analysis-receiver/receiver.types.ts`·`worker-message.validator.ts`, `api/src/catches/registration-batch.ts`·`new-catch-content.ts`·`entities/catch-asset.entity.ts` + 마이그레이션, `owner-catch-*`(정렬·cursor), `worker/fixtures/m1-synthetic/`, `api/docs/repository-analysis-u7.md`, `worker/docs/repository-analysis-u7.md` |
| 「다시 볼 곳」의 커밋 링크(본인만 보는 새 칸) | 그때 없음. 상세의 근거 링크는 `assets-view.tsx` 257~258행, `safeEvidenceUrl`(292~294행) | `owner-catch-response.ts`·`types.ts`·`isCatch`, `assets-view.tsx` `CatchDetail`, `web/test/assets-view.test.mjs` |
| 고지 4절(결과 문장을 Catch에 남기면) | `api/src/analysis-intake/analysis-notice.ts`(`catchu-real-analysis-notice-v3`) | `api/docs/analysis-intake.md`, 팀장 PR 승인 |
| 기존 Catch에 값 채우기 | 등록은 기존 Catch를 고치지 않음(`registration-service.ts` 206행), 소속 커밋은 재분석에서 빠짐 | DB 초기화 시점 결정 또는 「Catch 재생성」(입력 문서 §7) |

### 그때 지키던 경계

- 작성자 설명은 결과 반영·등록 경로가 쓰지 않는다(엔티티 초기값 없음, 저장 경로 하나).
- 사본의 `aiDraft`·제목은 받은 사람 AI 근거가 아니다(`chunker.ts` 104행 주석, `summary-sources.ts` 2행). 11-16에도 같다.
- 작업 사실 문장에 CatchU가 센 숫자·날짜를 쓰지 않는다(`build.py` 27~36행).
- 받은 사람 경로는 원본 Catch를 읽지 않는다(`db-publication-access.ts` 155~160행).
