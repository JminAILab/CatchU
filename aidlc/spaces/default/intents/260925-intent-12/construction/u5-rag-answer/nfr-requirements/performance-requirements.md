# U5 RAG 응답 — 성능 요구사항

## Sources

작성일: 2026-10-30. 입력: [U5 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U5 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·FR6.2·FR6.8, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01·C-02·C-09·C-12, 기존 코드 `api/src/ai-generation/ai-generation.gate.ts`(게이트 시간 제한 45초), U3 비기능 요구사항(질문 임베딩 10초), [비기능 질문·답변](nfr-requirements-questions.md) Q1·Q2·Q3.

## 범위

NFR4는 질의응답을 바로 답하는 경로와 SSE로 처리하라고만 하고, 그 밖의 처리 시간·가동률·복구 수치는 새로 만들지 않는다. 그래서 이 문서는 새 지연 목표 없이 단계별 시간 제한과 스트림 전달 방식만 정한다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.1 | 질의응답은 큐에 넣지 않고 그 요청 안에서 처리하며, 검증·링크·색인·횟수 확인을 통과하면 SSE를 열고 첫 바이트를 바로 보낸다. 게이트가 항목 하나를 통과시킬 때마다 그대로 `item`으로 보낸다(모아 두지 않음) | 합성 게이트가 항목을 차례로 낼 때 응답이 차례로 흘러나오는지 시험 | NFR4, FR6.2, AC6.2.2, 기능 설계 BR2.3·BR4.5 |
| NFR4.2 | 단계별 시간 제한: 다시 쓰기 10초(U5), 질문 임베딩 10초(U3 검색), 답 생성은 게이트 시간 제한(기본 45초)을 그대로 쓴다. 질문 전체 상한은 따로 두지 않는다. 어느 단계든 시간이 넘으면 `error ANSWER_FAILED`로 끝내고 재시도하지 않는다 | 합성 제공자 지연으로 각 단계 시간 초과 시험(다시 쓰기는 U5 시험, 나머지는 해당 Unit 시험에 기댐) | NFR4, Q1·Q2, 기능 설계 BR4.1·BR4.6 |
| NFR4.3 | SSE 응답 머리는 `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`이고, 연결이 열린 동안 15초마다 `: keep-alive` 주석 한 줄을 보낸다. 스트림이 끝나거나 연결이 끊기면 멈춘다. 받은 사람 연결이 끊기면 U5는 게이트 스트림 읽기를 멈추고, 게이트가 그때 Claude 스트림을 닫는다(`checked-gate.ts` `generateStream`의 finally). 이미 시작한 다시 쓰기 호출(10초·200토큰)은 끝까지 두고 결과를 버리며, 남은 단계(검색·생성)는 부르지 않는다 | 응답 머리 확인, 가짜 시계로 keep-alive 주기 시험, 끝난 뒤 타이머가 남지 않는지 확인, 연결 끊김 뒤 게이트 스트림 읽기가 멈추는지 시험 | Q2, AC6.2.2, 기능 설계 BR4.8, 비기능 수정 요청(R-02) |
| NFR4.4 | 질문 횟수 Redis 명령은 1초 안에 끝나지 않으면 실패로 보고 질문을 통과시킨다(기록만). 연결이 끊긴 동안 명령을 쌓아 두지 않아 질문이 Redis를 기다리지 않는다 | 응답 없는 Redis 대역으로 1초 뒤 통과 시험 | Q3, 기능 설계 BR3.2 |
| NFR4.5 | 받은 사람 요약 읽기는 DB 읽기 한두 번(행 없음이면 사본의 발행 시각 읽기 한 번)으로 끝나고 AI를 부르지 않는다. 화면은 자동으로 다시 확인하지 않는다 | 요약 읽기 경로에 AI 호출이 없음을 시험 | NFR4, 기능 설계 BR6.2, 기능 설계 Q3 |
| NFR4.6 | 새 응답 시간 목표(p95 등)·처리량 목표는 두지 않는다. 시연 규모에서 질문 하나는 길게는 1분 남짓 걸릴 수 있고, 이것을 성능 결함으로 보지 않는다 | 해당 없음(목표를 만들지 않음) | NFR4, C06 |
