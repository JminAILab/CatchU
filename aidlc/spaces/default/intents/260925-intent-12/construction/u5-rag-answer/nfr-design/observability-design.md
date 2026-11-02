# U5 RAG 응답 — 관측 설계

## Sources

작성일: 2026-10-30. 입력: [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U5 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 「에러 대응 최소선」, [비기능 설계 질문·답변](nfr-design-questions.md).

## 설계

로그는 Nest `Logger`로 사건마다 JSON 한 줄을 남긴다. 칸은 아래 타입으로만 만들어 글 원문이 들어갈 자리가 없게 한다.

| 요구사항 | 사건 | 칸 |
|---|---|---|
| NFR6.1 | `qna.completed`(성공·실패 모두) | `publicationId`, `stage`(끝난 단계), `outcome`(`OK`·`REWRITE_FAILED`·`SEARCH_FAILED`·`INDEX_NOT_READY`·`GENERATION_FAILED`·`CLIENT_CLOSED`), `rewritten`, `rewriteMs`, `rewriteInputTokens`, `rewriteOutputTokens`, `searchMs`, `chunkCount`, `generateMs`, `itemCount`(U5가 직접 센 보낸 항목 수). 버린 수는 `generateStream`이 돌려주지 않으므로 칸을 두지 않고 게이트 로그(`ai_gate_result`)에서 본다(비기능 설계 수정 요청 R-03) |
| NFR6.1 | `qna.rejected`(스트림 전 거부) | `outcome`(`VALIDATION_FAILED`·`LINK_UNAVAILABLE`·`LINK_PASSWORD_REQUIRED`·`INDEX_NOT_READY`·`QUESTION_LIMIT_REACHED`), `publicationId`(링크 판정 뒤에만) |
| NFR6.2 | `base-summary.handled` | `publicationId`, `outcome`(`DONE`·`FAILED`·`DISCARDED`·`SKIPPED`), `failure`(오류 이름), `itemCount`, `droppedCount`, `durationMs` |
| NFR6.2 | `base-summary.regenerate-accepted` | `publicationId`, `enqueue`(`ENQUEUED`·`ENQUEUE_FAILED`) |
| NFR6.4 | `qna.count-bypassed`(경고) | `publicationId`, `reason`(`NO_REDIS`·`REDIS_ERROR`·`REDIS_TIMEOUT`) |

| 요구사항 | 설계 |
|---|---|
| NFR6.3 넣지 않는 것 | 위 타입에 글 칸이 없다. 오류는 `error.name`과 HTTP 상태만 칸으로 옮긴다. 요청 주소는 U5가 로그에 쓰지 않는다. 경로 기록은 이미 막혀 있다: api 예외 로그는 `safePath`로 경로 틀만, 개발 서버 Caddy는 접근 로그 없음·오류 로그의 주소·머리 제거, EKS ALB 접근 로그 꺼짐. EKS WAF(`catchu-edge`) 로깅이 요청 주소를 남기는지는 이 저장소 설정만으로 확인할 수 없어 팀장 공용 기반의 확인 몫으로 둔다(logical-components 「다른 쪽에 넘기는 것」). 시험은 합성 제공자로 한 질문을 돌린 뒤 로그 출력에 질문·앞 대화·토큰 문자열이 없는지 본다 |
| NFR6.5 통합 확인 | U4·U3과 실제 연결한 뒤 개발 서버에서 받은 링크로 요약을 보고 질문해 근거 강조가 붙은 답을 받는 흐름, 링크 중지 뒤 질의응답 404를 FR19 확인 표에 날짜·대상 버전·결과로 적는다. 합성 시험 통과를 이 표에 적지 않는다 |
| NFR6.6 장치 없음 | 지표 수집기·대시보드·경보를 더하지 않는다 |
