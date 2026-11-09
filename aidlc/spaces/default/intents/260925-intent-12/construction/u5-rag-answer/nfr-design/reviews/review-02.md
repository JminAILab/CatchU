## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-30T07:48:20Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/reliability-design.md > NFR5.1 연쇄 삭제 | `base_summary` 칸 목록에 기본키가 없다. 기능 명세 엔티티(`baseSummaryId`, `publicationId`, `status`, `deadlineAt`, `items`, `generatedAt`, `updatedAt`)와 달리 `base_summary_id`가 빠졌고 `publication_id`만 UNIQUE다. 구현자가 기본키를 추측해야 하고, 저장소 마이그레이션은 `pk_`·`uq_`·`fk_`·`ck_` 이름 규칙(`CreatePublicationTables`)과 엔티티 `deleteWithParent`를 쓰는데 이 설계는 외래 키 선언 방식을 말하지 않는다 | 마이그레이션 칸 목록에 `base_summary_id uuid` 기본키를 더해 기능 명세와 맞추고, 외래 키를 엔티티 `deleteWithParent`로 선언해 기존 이름 규칙을 따른다고 적는다. 기본키가 필요 없다고 판단하면 기능 명세 엔티티에서 뺄 것을 명시한다 | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/performance-design.md > NFR4.4 Redis 1초 | 질문 횟수 연결을 `lazyConnect: true` + `enableOfflineQueue: false`로 만들면, 연결 전에 보내는 첫 `INCR`는 항상 실패한다. 설치된 ioredis 6.0.0 `Redis.js`는 연결이 `ready`가 아니면 `enableOfflineQueue`가 꺼진 경우 즉시 "Stream isn't writeable and enableOfflineQueue options is false"로 거부한다. 설계는 `connect()`를 언제 부르는지 적지 않아, 기동 뒤 첫 질문(과 재연결 직후 질문)이 늘 `REDIS_ERROR`로 통과하고 질문 수 상한이 그만큼 비는 구조가 된다. 시험이 합성 계수기만 쓰면 이 결함이 안 잡힌다. 연결 `error` 이벤트 처리기와 앱 종료 때 연결을 닫는 일도 설계에 없다(AiRun은 둘 다 한다) | 모듈 초기화에서 `connect()`를 한 번 부르거나(기동은 막지 않음) `lazyConnect`를 빼는 쪽으로 정한다. `error` 이벤트에서 이름만 한 번 로그를 남기고 종료 때 `quit/disconnect`를 부른다고 적는다. 실제 Redis 또는 ioredis 시험으로 "연결된 뒤 첫 질문이 센다"를 확인하는 시험을 더한다 | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/observability-design.md > NFR6.1 `qna.completed` 칸 `droppedCount` | `droppedCount(게이트가 끝에 주면)`라고 했지만 `generateStream`은 `GatedItem`만 내보내고 `droppedCount`를 호출자에게 돌려주지 않는다. 게이트가 자기 `ai_gate_result` 로그에만 남긴다(`checked-gate.ts`, `ai-generation.types.ts`). 쓸 수 없는 칸이다 | `droppedCount` 칸을 빼고 버린 수는 게이트 로그에서 본다고 적는다. U5는 `itemCount`만 직접 센다 | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/logical-components.md > 다른 쪽에 넘기는 것 / 앱 등록 시점(Q1) | U5 앱 등록이 U4 DB `PublicationAccess` 합류 뒤로 미뤄질 수 있는데, U4가 발행 커밋 뒤 `BASE_SUMMARY`를 넣는 시점과의 순서가 적혀 있지 않다. 처리기가 등록되기 전에 U4가 넣으면 AiRun은 `ai_run_unknown_kind`로 실패 처리하고 재시도하지 않아, 그 기간 발행본의 요약은 모두 10분 뒤 `FAILED`가 된다 | U4에 넘기는 항목에 "U5 `BASE_SUMMARY` 처리기 등록과 같은 때 또는 뒤에 발행 뒤 등록을 켠다. 먼저 켜면 그 기간 발행본은 작성자가 [다시 만들기]로 복구한다"를 명시한다 | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/performance-design.md > NFR4.3 SSE 머리·keep-alive·끊김 | keep-alive 타이머를 `finally`에서만 지운다. 끊긴 뒤 게이트 대기가 최대 45초 이어지는 동안 타이머가 이미 닫힌 응답에 계속 쓴다 | 요청 `close` 이벤트에서도 타이머를 지운다고 적는다 | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/nfr-design/reliability-design.md > NFR5.1 연쇄 삭제 | 외래 키 이름을 `fk_base_summary_publication`으로 적었는데, 기존 마이그레이션의 이름은 `fk_<표>_<칸>` 형태다(`fk_published_item_publication_id`, `fk_publication_member_id`). `ck_base_summary_status`도 기존 검사 제약이 `ck_<표>_<칸>_<해시>`로 생성되는 것과 다르다. 이름을 손으로 정하면 엔티티가 만드는 이름과 어긋나 마이그레이션 차이가 날 수 있다 | 외래 키 이름은 `fk_base_summary_publication_id`로 고치고, 검사 제약 이름은 엔티티 선언에서 생성되는 이름을 따른다고 적는다(구현 때 생성 마이그레이션으로 확인) | New |

> R-01 Reviewer note: reliability-design NFR5.1에 `base_summary_id uuid` 기본 키(`pk_base_summary`), `publication_id` UNIQUE, `deleteWithParent` 외래 키, pk_/uq_/fk_/ck_ 규칙이 적혔다. 실제 코드와 대조하면 `deleteWithParent`는 `{ onDelete: 'CASCADE' }`이고 `CreatePublicationTables`·U3 `publication_index`도 같은 접두사 규칙을 쓴다. 다만 이름 세부는 아래 새 지적(Minor) 참고

> R-02 Reviewer note: performance-design NFR4.4와 logical-components가 lazyConnect 제거, 생성 즉시 연결, `enableOfflineQueue: false`, `commandTimeout: 1000`, `error` 처리기, 종료 때 `quit()` 뒤 `disconnect()`, 실제 Redis 시험(`CATCHU_TEST_REDIS_URL`일 때만)을 일관되게 말한다. AiRun의 `watch`(error 처리기)·`closeAll`(disconnect)·`enableOfflineQueue: false` 패턴, `test/published-index/queue-embedding.test.cjs` 존재와 맞다

> R-03 Reviewer note: `qna.completed`에서 droppedCount가 빠지고 게이트 로그(`ai_gate_result`)에서 본다고 적혔다. `generateStream`은 `AsyncIterable<GatedItem>`만 돌려주므로 맞다. `base-summary.handled`의 droppedCount는 `generate()`가 `GatedOutput.droppedCount`를 돌려주므로 유효하다

> R-04 Reviewer note: logical-components 「다른 쪽에 넘기는 것」 U4 항목에 켜는 시점(U5 처리기 등록과 같은 때 또는 뒤), 먼저 켤 때의 결과(AiRun `ai_run_unknown_kind` 실패, 10분 뒤 `FAILED`), [다시 만들기] 복구가 적혔다

> R-05 Reviewer note: performance-design NFR4.3에 keep-alive 타이머를 요청 `close` 이벤트와 `finally` 두 곳에서 지운다고 적혔다

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensors | 자동 실행 | 이 검토에서는 직접 실행하지 않았다 |
| traceability.json 수동 확인 | droppedCount 관련 어긋남 없음(grep 결과 없음) | 고친 내용과 충돌하지 않는다 |

### Summary

사람이 정한 다섯 가지 수정(R-01~R-05)이 설계 문서에 분명하고 서로 어긋나지 않게 반영됐고, 인용한 코드와도 맞다. 남은 것은 제약 이름 규칙의 작은 불일치 하나이며 승인을 막지 않는다.
