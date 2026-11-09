## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-30T07:40:13Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/reliability-design.md > NFR5.1 연쇄 삭제 | `base_summary` 칸 목록에 기본키가 없다. 기능 명세 엔티티(`baseSummaryId`, `publicationId`, `status`, `deadlineAt`, `items`, `generatedAt`, `updatedAt`)와 달리 `base_summary_id`가 빠졌고 `publication_id`만 UNIQUE다. 구현자가 기본키를 추측해야 하고, 저장소 마이그레이션은 `pk_`·`uq_`·`fk_`·`ck_` 이름 규칙(`CreatePublicationTables`)과 엔티티 `deleteWithParent`를 쓰는데 이 설계는 외래 키 선언 방식을 말하지 않는다 | 마이그레이션 칸 목록에 `base_summary_id uuid` 기본키를 더해 기능 명세와 맞추고, 외래 키를 엔티티 `deleteWithParent`로 선언해 기존 이름 규칙을 따른다고 적는다. 기본키가 필요 없다고 판단하면 기능 명세 엔티티에서 뺄 것을 명시한다 | New |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/performance-design.md > NFR4.4 Redis 1초 | 질문 횟수 연결을 `lazyConnect: true` + `enableOfflineQueue: false`로 만들면, 연결 전에 보내는 첫 `INCR`는 항상 실패한다. 설치된 ioredis 6.0.0 `Redis.js`는 연결이 `ready`가 아니면 `enableOfflineQueue`가 꺼진 경우 즉시 "Stream isn't writeable and enableOfflineQueue options is false"로 거부한다. 설계는 `connect()`를 언제 부르는지 적지 않아, 기동 뒤 첫 질문(과 재연결 직후 질문)이 늘 `REDIS_ERROR`로 통과하고 질문 수 상한이 그만큼 비는 구조가 된다. 시험이 합성 계수기만 쓰면 이 결함이 안 잡힌다. 연결 `error` 이벤트 처리기와 앱 종료 때 연결을 닫는 일도 설계에 없다(AiRun은 둘 다 한다) | 모듈 초기화에서 `connect()`를 한 번 부르거나(기동은 막지 않음) `lazyConnect`를 빼는 쪽으로 정한다. `error` 이벤트에서 이름만 한 번 로그를 남기고 종료 때 `quit/disconnect`를 부른다고 적는다. 실제 Redis 또는 ioredis 시험으로 "연결된 뒤 첫 질문이 센다"를 확인하는 시험을 더한다 | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/observability-design.md > NFR6.1 `qna.completed` 칸 `droppedCount` | `droppedCount(게이트가 끝에 주면)`라고 했지만 `generateStream`은 `GatedItem`만 내보내고 `droppedCount`를 호출자에게 돌려주지 않는다. 게이트가 자기 `ai_gate_result` 로그에만 남긴다(`checked-gate.ts`, `ai-generation.types.ts`). 쓸 수 없는 칸이다 | `droppedCount` 칸을 빼고 버린 수는 게이트 로그에서 본다고 적는다. U5는 `itemCount`만 직접 센다 | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/logical-components.md > 다른 쪽에 넘기는 것 / 앱 등록 시점(Q1) | U5 앱 등록이 U4 DB `PublicationAccess` 합류 뒤로 미뤄질 수 있는데, U4가 발행 커밋 뒤 `BASE_SUMMARY`를 넣는 시점과의 순서가 적혀 있지 않다. 처리기가 등록되기 전에 U4가 넣으면 AiRun은 `ai_run_unknown_kind`로 실패 처리하고 재시도하지 않아, 그 기간 발행본의 요약은 모두 10분 뒤 `FAILED`가 된다 | U4에 넘기는 항목에 "U5 `BASE_SUMMARY` 처리기 등록과 같은 때 또는 뒤에 발행 뒤 등록을 켠다. 먼저 켜면 그 기간 발행본은 작성자가 [다시 만들기]로 복구한다"를 명시한다 | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/performance-design.md > NFR4.3 SSE 머리·keep-alive·끊김 | keep-alive 타이머를 `finally`에서만 지운다. 끊긴 뒤 게이트 대기가 최대 45초 이어지는 동안 타이머가 이미 닫힌 응답에 계속 쓴다 | 요청 `close` 이벤트에서도 타이머를 지운다고 적는다 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json 직접 확인 | U5 비기능 요구사항 파일의 NFR1.1~NFR7.2 40개가 모두 `upstream_ids`와 `coverage`에 있고 상태 OK다 | 누락 없음 |
| 인용 코드 대조 | `PublicationAccess`, `PublishedSearch.getIndexState`, `AiRun.enqueueAfterCommit`, `DailyRunLimit.consume(…, manager)`, `createGuardedFetch`, `CLAUDE_MODEL_IDS`·`THINKING_OFF`, `IndexNotReady`, `publication` 표(`CreatePublicationTables`)가 설계가 말한 모양으로 있다 | 교차 참조 통과 |
| ioredis 6.0.0 소스 확인 | `enableOfflineQueue: false`이면 연결 전 명령을 바로 거부한다 | 두 번째 Major의 근거 |

### Summary

모든 요구사항이 설계에 대응하고 인용한 기존 코드와 계약이 맞다. 구현 전에 `base_summary` 기본키 누락과 Redis 지연 연결 설정 결함 두 가지를 고쳐야 한다. 둘 다 작은 수정이라 Critical은 없고 READY로 판단했다.
