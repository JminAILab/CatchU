# 범위 시험 안내 — #559 받은 사람 질의응답 고치기

## 시험 도구

- api: Node `node:test`(`.cjs`). 시험은 빌드한 `api/dist/`를 불러오므로 먼저 `npm run build`를 한다. 이 범위의 시험은 DB를 쓰지 않는다. 가짜 게이트·가짜 검색·가짜 `PublicationAccess`와 `api/test/rag-answer/support.cjs`·`api/test/u2/gate-fixtures.cjs`를 쓴다.
- web: Node `node:test`(`.mjs`). `.ts`를 바로 불러온다. `.tsx` 패널은 시험이 불러오지 않으므로(`web/src/features/rag-answer/README.md` 「시험」), 판단은 `item-title.ts` 순수 함수에 두고 시험한다.
- 설정 파일은 새로 만들지 않는다. 지금 실행기를 그대로 쓴다.

## 이 일의 시험 명령

저장소 루트에서 돈다. 명령 하나씩 따로 돌린다.

1. api 빌드:

   ```bash
   npm --prefix api run build
   ```

2. api 범위 시험:

   ```bash
   node --test api/test/u2/ai-gate-checks.test.cjs api/test/u2/ai-gate-stream.test.cjs api/test/ai-generation/citation-request.test.cjs api/test/rag-answer/qna-sources.test.cjs api/test/rag-answer/qna-controller.test.cjs api/test/rag-answer/rag-eval.test.cjs api/test/rag-answer/summary-sources.test.cjs
   ```

3. web 범위 시험:

   ```bash
   node --test web/test/rag-answer-item-title.test.mjs web/test/rag-answer-api.test.mjs web/test/rag-answer-state.test.mjs web/test/rag-answer-sse-reader.test.mjs web/test/recipient.test.mjs web/test/publications-owner.test.mjs
   ```

4. 정적 검사(각각 따로): `npm --prefix api run lint`, `npm --prefix api run typecheck`, `npm --prefix web run lint`, `npm --prefix web run typecheck`

Step 1(바꾸기 전)에는 아직 없는 두 새 파일 `api/test/rag-answer/qna-sources.test.cjs`와 `web/test/rag-answer-item-title.test.mjs`를 빼고 돌린다. 그 결과를 기준으로 남긴다. 시험 파일이 하는 일과 시나리오 번호는 다음과 같다(시나리오는 `code-generation-plan.md`의 S1~S15).

| 파일 | 새로·더함 | 시나리오 |
|---|---|---|
| `api/test/u2/ai-gate-checks.test.cjs` | 사례 더함(한 번 호출 실패 로그 칸) | S9 |
| `api/test/u2/ai-gate-stream.test.cjs` | 사례 더함(스트리밍 실패 로그 칸) | S9 |
| `api/test/ai-generation/citation-request.test.cjs` | 사례 더함(머리글 있음·없음) | S8 |
| `api/test/rag-answer/qna-sources.test.cjs` | 새 파일 | S1~S7, S13, S15(api), S16(머리글 글자를 답에 옮겨도 대조 통과) |
| `api/test/rag-answer/qna-controller.test.cjs` | 사례 더함(사본 읽기 NotFound 404, `qna.completed` 칸) | S10, S11 |
| `api/test/rag-answer/rag-eval.test.cjs` | 사례 더함(단계 A: 질문별 게이트 로그 수 칸 기록. 단계 B: synthetic에서 같은 근거 목록, 기록의 못 붙인 줄 수) | S17(단계 A), S12(단계 B) |
| `api/test/rag-answer/summary-sources.test.cjs` | 그대로(기본 요약 근거가 바뀌지 않음 확인) | FR3.2 |
| `web/test/rag-answer-item-title.test.mjs` | 새 파일 | S14, S15(화면) |
| `web/test/recipient.test.mjs`, `web/test/publications-owner.test.mjs`, `web/test/rag-answer-*.test.mjs` | 그대로 | NFR2(강조 동작 유지) |

## 시험 자료

- 사본은 시험 안에서 만든다. 다음 모양을 시험 파일 안 상수로 둔다(실제 발행본 자료·질문·답 원문은 쓰지 않는다).
  - Catch 셋. 줄 9개, 9개, 31개이고, 근거마다 두 줄이다.
  - `workFacts[1]`이 없는 Catch 하나, 200자를 넘는 둘째 줄 하나
  - 둘째 줄이 같은 Catch 둘, 줄바꿈·제어 문자·글 방향 제어 문자(U+202E 등)가 든 둘째 줄 하나, 다듬으면 빈 글이 되는 둘째 줄 하나
  - PDF 자료 항목 하나(머리글만 본다)
- 머리글 고정 글자 확인(S7·S16): 머리글에서 둘째 줄 부분을 뺀 고정 글자에 `/[0-9A-Za-z]/`가 없어야 한다. S16은 합성 응답 항목에 고정 글자를 넣고, 게이트의 대조(`fact-check.ts`)를 거쳐 항목이 남는지 본다.
  - 텍스트 자료 항목 하나
- 검색 결과(`ChunkHit`)도 손으로 만든 배열을 쓴다. 점수 순서를 바꿔 Catch 순서를 시험한다.
- 게이트 실패 로그는 시험용 로거로 잡고, 칸 이름과 값이 수·이름뿐인지 본다.

## 가짜·대역

- 질의응답 서비스·컨트롤러: 지금 시험처럼 가짜 검색·가짜 게이트·가짜 `PublicationAccess`를 쓴다. 이번에는 `readSnapshot`도 가짜로 둔다. `NotFound` 사례에서는 이름이 `NotFound`인 오류를 던진다.
- 평가 스크립트: synthetic 모드의 합성 임베딩·합성 게이트를 쓴다. 실제 Claude·Voyage를 부르지 않는다.

## 커버리지

- 이 범위에 새로 정한 커버리지 목표는 없다. 팀 규칙은 서비스별 `test:coverage` 명령을 쓰고 측정 도구나 CI를 바꾸지 않는 것이다. bugfix 범위는 목표 회귀 시험을 더하고 기존 시험을 모두 통과시킨다.
- 전체 시험(DB 시험 포함 `npm --prefix api test`, `npm --prefix web test`)과 커버리지는 빌드와 시험 단계에서 돌린다.

## 이 단계에서 돌리지 않는 것

- 실제 Claude·Voyage를 부르는 측정이다. 기준선(Step 5a)과 다시 재기(빌드와 시험 단계)가 여기에 든다. 팀장 확인 뒤에 돌리고, 범위 시험 명령에 넣지 않는다.
