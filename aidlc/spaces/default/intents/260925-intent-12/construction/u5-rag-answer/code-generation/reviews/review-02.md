## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-30T09:47:54Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | api/src/rag-answer/question-rewriter.ts > buildRewriteUserText | 앞 대화와 질문을 `<message role=...>…</message>`·`<question>…</question>` 꼬리표 안에 이스케이프 없이 그대로 끼운다. 받은 사람이 `</conversation>` 같은 글을 넣으면 자료 경계를 벗어날 수 있다. rules.md가 이 위험을 한계로 받아들였고 출력은 화면에 보이지 않으며 답은 게이트가 대조하므로 차단 사유는 아니다. | 다음 정리 때 꼬리표 문자(`<`, `>`)를 치환하거나, 한계로 받아들였다는 점을 코드 주석과 `api/docs/rag-answer.md`에 한 줄 남긴다. | Resolved (reviewer) |
| R-02 | Minor | api/src/rag-answer/base-summary-store.ts > saveDone, markRegenerating | [다시 만들기]로 행이 PENDING으로 돌아간 뒤에도, 앞서 돌던 작업의 늦은 결과는 `status <> 'FAILED' AND deadline_at > now` 조건만 보므로 새 PENDING 행에 DONE으로 써질 수 있다. 같은 발행본의 결과라 내용 오염은 아니지만, runKey를 구분한 취지(새 작업의 결과만 받기)와 어긋날 수 있다. | 의도된 동작이면 BR5.4 근거를 `api/docs/rag-answer.md`에 한 줄로 남기고, 아니면 접수마다 세대 값을 행에 두어 조건에 넣는다. | Resolved (reviewer) |
| R-03 | Minor | api/src/rag-answer/qna.controller.ts > stream | 헤더를 보낸 뒤 `answerQuestion`이 예상 밖 예외를 던지면 `finally`에서 응답만 닫히고 SSE `error` 이벤트 없이 끝난다. `answerQuestion`이 예외를 결과로 바꾸므로 지금 경로에서는 일어나기 어렵다. | 예상 밖 예외에도 `error`(`ANSWER_FAILED`) 이벤트를 쓰고 로그를 남기도록 `catch` 한 갈래를 더하거나, 일어날 수 없는 이유를 주석으로 적는다. | Resolved (reviewer) |
| R-04 | Minor | api/scripts/rag-eval/rag-eval.cjs > createMeasureDeps, aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/code-generation/code-summary.md > 실행하지 않은 시험과 이유 | `measure` 모드는 사본 읽기에 쓸 U4 `PublicationAccess`가 없어 `TODO(U4 합류)`에서 멈추므로, NFR3 품질 측정과 FR19 통합 확인은 이번 산출물에 없다. 요약이 이를 합성 통과와 구분해 밝히고 있고 계획 Step 12와도 일치한다. | U4 합류 뒤 앱 등록 PR과 함께 `measure` 한 번과 FR19 통합 확인을 할 담당·시점을 남은 일 목록 그대로 추적한다. | Unresolved |
| R-05 | Minor | api/src/rag-answer/qna.controller.ts > stream() catch 갈래 | 예상 밖 예외 경로에서는 `result`가 null이라 `qna.completed` 로그가 남지 않고 `qna.stream-failed`만 남는다. 이미 센 질문 횟수와 로그 쪽 결과 수가 어긋나 보일 수 있다. 비밀이 새는 문제는 아니며 운영 집계 시의 참고 사항이다. | 집계 기준이 `qna.completed`라면 `qna.stream-failed`도 함께 센다는 점을 `api/docs/rag-answer.md`의 로그 설명에 한 줄 적는다. | New |

> R-01 Reviewer note: `api/src/rag-answer/question-rewriter.ts`에 `escapeTagText`(`&`를 먼저, 그다음 `<`·`>`)가 생겼고 `buildRewriteUserText`가 앞 대화와 질문 모두에 쓴다. `api/test/rag-answer/question-rewriter.test.cjs:55`에 `</conversation>`이 든 질문·앞 대화를 넣은 시험이 있고 통과한다.

> R-02 Reviewer note: 사람의 결정대로 코드는 그대로 두었다. `api/docs/rag-answer.md` 「알려진 한계」에 늦은 실패가 새 PENDING 행을 FAILED로 바꿀 수 있고, 이는 계약 C-02 「에러 대응 최소선 6」의 받아들인 한계이며 AiRun payload가 ID 하나뿐이라는 이유가 적혔다. 내가 요청한 문서화 조건을 채운다.

> R-03 Reviewer note: `qna.controller.ts` `stream()`에 `catch`가 생겨 SSE `error {code: 'ANSWER_FAILED'}`를 쓰고 `qna.stream-failed`(오류 이름만)를 남긴 뒤 `finally`에서 닫는다. `rag-answer-log.ts`에 항목이 있고 `qna-controller.test.cjs:200`이 이벤트와 로그를 확인한다.

> R-04 Reviewer note: `measure` 모드가 U4 `PublicationAccess` 없이는 `TODO(U4 합류)`에서 멈추는 상태는 그대로다. 사람의 결정으로 U5 이슈에서 추적하며 코드 변경은 없다. 합성 통과와 구분해 밝혀 두었고 차단 사유는 아니다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `npm --prefix api run typecheck` | 오류 없이 종료 | 통과 |
| `npm --prefix api run lint` | 경고·오류 없음(`--max-warnings=0`) | 통과 |
| U5 api 시험 명령(unit-test-instructions.md, 파일 11개) | tests 82, pass 81, fail 0, skipped 1 | 통과. 건너뛴 1건은 수정 요청과 무관하다. |
| `(cd web && node --test test/rag-answer-*.test.mjs)` | tests 22, pass 22, fail 0 | 통과 |

수정 요청 (4)~(6)은 파일에서 확인했다. `INDEX_NOT_READY` 문구는 `error-codes.ts:77`과 `CONVENTIONS.md:211`에서 "아직 쓸 수 없습니다"다. Claude 콘솔 지출 한도 문구는 `question-counter.ts`와 `rag-answer.md`에서 찾지 못했다. `traceability.json` NFR6.5 Deferred 문구는 "EKS 큐 연결 뒤"로 바뀌었다.

### Summary

수정 요청 여섯 항목이 코드·문서·시험에 모두 반영되었고 이전 지적 R-01~R-03은 해소되었으며, R-02는 받아들인 한계로 문서화되었다. 남은 R-04는 U4 합류 뒤 추적할 일이고, 새 지적은 Minor 한 건이라 승인을 막지 않는다.
