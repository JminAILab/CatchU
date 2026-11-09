# U5 RAG 응답 — 성능 설계

## Sources

작성일: 2026-10-30. 입력: [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U5 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W1·W2·W4, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01·C-09·C-12, [비기능 설계 질문·답변](nfr-design-questions.md), api 현재 코드(`checked-gate.ts` `generateStream`).

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.1 바로 답하기 | 질의응답 컨트롤러는 Nest 응답 객체에 직접 쓴다. 확인 단계가 모두 통과한 뒤에만 `writeHead(200, …)`와 `flushHeaders()`로 첫 바이트를 보내고, `for await (const item of gate.generateStream(req))` 안에서 항목마다 `event: item` 한 덩어리를 바로 쓴다. 모아 두는 버퍼가 없다. 큐·AiRun을 거치지 않는다 |
| NFR4.2 단계별 시간 제한 | 다시 쓰기 10초는 SDK `timeout`(security-design NFR2.2), 질문 임베딩 10초는 U3 검색 안, 답 생성은 게이트 기본 45초. U5는 질문 전체 타이머를 두지 않는다. 어느 단계든 던지면 `error ANSWER_FAILED`(IndexNotReady면 `INDEX_NOT_READY`) 한 번 쓰고 닫는다 |
| NFR4.3 SSE 머리·keep-alive·끊김 | 머리 `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive`. 머리를 쓴 직후 15초 간격 타이머를 걸어 `: keep-alive\n\n`을 쓰고, 요청 `close` 이벤트와 `finally` 두 곳에서 타이머를 지운다(끊긴 뒤 게이트를 기다리는 동안 닫힌 응답에 쓰지 않게). 요청 `close` 이벤트에서 `aborted` 깃발도 세우고, 생성 반복 안에서 깃발을 보면 `break`해 for-await가 게이트 스트림의 `return`을 부르게 한다(게이트는 그 finally에서 Claude 스트림을 닫는다). 게이트가 다음 이벤트를 기다리는 중이면 `return`은 그 기다림이 끝난 뒤 처리되므로 닫힘이 최대 게이트 시간 제한(45초)까지 늦을 수 있다(reliability-design의 한계). 이미 시작한 다시 쓰기는 끝까지 두고 결과를 버리며, 깃발이 서 있으면 검색·생성을 부르지 않는다 |
| NFR4.4 Redis 1초 | 질문 횟수 전용 ioredis 연결은 AiRun과 같은 방식으로 만든다. `lazyConnect`는 쓰지 않아 만들 때 바로 연결을 시작하며(기동은 막지 않음), `commandTimeout: 1000`, `enableOfflineQueue: false`, `maxRetriesPerRequest: 0`이다. `error` 이벤트 처리기를 달아 오류 이름만 로그로 남기고, 앱 종료 훅에서 `quit()` 뒤 `disconnect()`로 닫는다. `INCR` 실패·시간 초과(연결 전·재연결 중 포함)는 그 자리에서 잡아 통과(BR3.2)로 바꾼다. "연결된 뒤 첫 질문이 센다"는 `queue-embedding.test.cjs`처럼 `CATCHU_TEST_REDIS_URL`이 있을 때만 도는 실제 Redis 시험으로 확인한다(비기능 설계 수정 요청 R-02) |
| NFR4.5 요약 읽기 | 받은 사람·작성자 읽기는 `base_summary`를 `publication_id`로 한 번 읽고(유일 색인), 행이 없을 때만 `readSnapshot`의 `publishedAt`을 쓴다. 지난 PENDING의 FAILED 저장은 조건부 UPDATE 한 번. AI 호출 없음. web은 화면을 열 때 한 번만 부른다 |
| NFR4.6 목표 없음 | 지연·처리량 목표와 그 측정 장치를 두지 않는다. 단계별 걸린 시간은 로그 칸으로만 남는다(observability-design) |
