## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-30T09:27:49Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | api/src/rag-answer/question-rewriter.ts > buildRewriteUserText | 앞 대화와 질문을 `<message role=...>…</message>`·`<question>…</question>` 꼬리표 안에 이스케이프 없이 그대로 끼운다. 받은 사람이 `</conversation>` 같은 글을 넣으면 자료 경계를 벗어날 수 있다. rules.md가 이 위험을 한계로 받아들였고 출력은 화면에 보이지 않으며 답은 게이트가 대조하므로 차단 사유는 아니다. | 다음 정리 때 꼬리표 문자(`<`, `>`)를 치환하거나, 한계로 받아들였다는 점을 코드 주석과 `api/docs/rag-answer.md`에 한 줄 남긴다. | New |
| R-02 | Minor | api/src/rag-answer/base-summary-store.ts > saveDone, markRegenerating | [다시 만들기]로 행이 PENDING으로 돌아간 뒤에도, 앞서 돌던 작업의 늦은 결과는 `status <> 'FAILED' AND deadline_at > now` 조건만 보므로 새 PENDING 행에 DONE으로 써질 수 있다. 같은 발행본의 결과라 내용 오염은 아니지만, runKey를 구분한 취지(새 작업의 결과만 받기)와 어긋날 수 있다. | 의도된 동작이면 BR5.4 근거를 `api/docs/rag-answer.md`에 한 줄로 남기고, 아니면 접수마다 세대 값을 행에 두어 조건에 넣는다. | New |
| R-03 | Minor | api/src/rag-answer/qna.controller.ts > stream | 헤더를 보낸 뒤 `answerQuestion`이 예상 밖 예외를 던지면 `finally`에서 응답만 닫히고 SSE `error` 이벤트 없이 끝난다. `answerQuestion`이 예외를 결과로 바꾸므로 지금 경로에서는 일어나기 어렵다. | 예상 밖 예외에도 `error`(`ANSWER_FAILED`) 이벤트를 쓰고 로그를 남기도록 `catch` 한 갈래를 더하거나, 일어날 수 없는 이유를 주석으로 적는다. | New |
| R-04 | Minor | api/scripts/rag-eval/rag-eval.cjs > createMeasureDeps, aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/code-generation/code-summary.md > 실행하지 않은 시험과 이유 | `measure` 모드는 사본 읽기에 쓸 U4 `PublicationAccess`가 없어 `TODO(U4 합류)`에서 멈추므로, NFR3 품질 측정과 FR19 통합 확인은 이번 산출물에 없다. 요약이 이를 합성 통과와 구분해 밝히고 있고 계획 Step 12와도 일치한다. | U4 합류 뒤 앱 등록 PR과 함께 `measure` 한 번과 FR19 통합 확인을 할 담당·시점을 남은 일 목록 그대로 추적한다. | New |

### 검토 메모

- **설계 충실도:** 스트림 전 확인 순서(본문 검증 → 링크 → 색인 → 횟수)와 SSE 흐름이 BR1~BR4와 맞다. 정의하지 않은 칸 400 거부, `<AiNoticeLine />` 재사용, 오류 코드 두 개 추가, 응답 `close` 기준 끊김 판정은 code-summary 「계획과 다른 점」에 근거와 함께 적혀 있어 정당하다.
- **질문 횟수 계수기:** MULTI(INCR, EXPIREAT 다음 한국 자정), 전용 연결, 오프라인 큐 끔, 1초 상한, 실패 시 BYPASSED 후 통과(fail-open)가 BR3.2대로 구현됐고 실제 Redis 시험(1/1)도 있다. 거부된 질문도 값을 되돌리지 않는다.
- **다시 쓰기 보안:** 주소를 코드 상수로 고정, `authToken: null`, 재시도 0, 지키는 fetch, `logLevel: 'warn'`, 실패는 종류만 담은 `QuestionRewriteFailed`로 묶여 질문·제공자 원문이 새지 않는다.
- **`base_summary`:** 늦은 결과는 조건부 UPDATE의 바뀐 행 0으로 `DISCARDED` 처리하고, AI 호출 중에는 트랜잭션을 열지 않으며, DB 오류는 로그 뒤 다시 던진다(삼키지 않음). 접수(202)와 완료는 읽기 시 시한 판정으로 구분된다. 작성자 경로는 `resolveForOwner`를 먼저 부르고 하루 횟수 소비와 행 PENDING 쓰기는 한 트랜잭션이다.
- **앱 미등록:** `app.module.ts`에 넣지 않은 것은 의도대로이며 `RagAnswerModule.register` 기동 시험으로 처리기 등록·경로·종료를 확인했다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `npm --prefix api run lint` | 통과(경고 0) | 문제 없음 |
| `npm --prefix api run typecheck` | 통과 | 문제 없음 |
| `npm --prefix web run lint` | 통과 | 문제 없음 |
| `npm --prefix web run typecheck` | 통과 | 문제 없음 |
| U5 api 단위 범위 명령(테스트 DB 사용) | tests 80, pass 79, fail 0, skipped 1 | 건너뜀은 `CATCHU_TEST_REDIS_URL`이 없을 때의 실제 Redis 시험이며, code-summary가 별도 실행 통과를 보고했다. 이번 검토에서는 다시 돌리지 않았다 |
| `(cd web && node --test` U5 3개 파일`)` | tests 22, pass 22, fail 0 | 문제 없음 |

### Summary

Critical·Major 없이 계획·설계와 일치하고, 계획과 다른 점도 근거가 적혀 있으며, 검사와 시험이 모두 통과했다. 남은 것은 프롬프트 꼬리표 이스케이프, 다시 만들기 중 늦은 결과 처리, 예상 밖 예외의 SSE 마무리, `measure` 평가의 U4 합류 후 실행이라는 Minor뿐이어서 READY로 본다.
