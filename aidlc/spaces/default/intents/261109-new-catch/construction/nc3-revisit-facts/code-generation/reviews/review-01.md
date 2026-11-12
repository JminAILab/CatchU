## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-11T07:44:58Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| - | - | - | No findings | No action required | Resolved |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| worker pytest (test_revisit_facts, test_collection_flow, test_candidate_flow, test_live_processing, test_processing) | 226 passed in 2.56s | 규칙 다섯, 자체 검사(`check_facts`), live.py 단일 예외 삼킴, 수집의 blob_sha 시험 통과 |
| api test 10개 파일(worker-messages, receiver, u7-worker-context, registration-batch, registration-postgres, revisit-facts-migration, owner-catch-http, owner-catch-response, publish-api, chunker) | tests 248, pass 248, fail 0 | 시험 DB(catchu-db-test)로 등록·마이그레이션·커서·본인 응답·발행 사본 시험 통과 |
| api `test:analysis-fixtures` | tests 16, pass 16, fail 0 | 합성 결과 7개가 Result "4" 계약을 통과 |
| web node --test (assets-revisit-facts, assets-view, assets-api) | tests 92, pass 92, fail 0 | 칸 위치·링크 조건·문장·응답 검사 통과 |

### Summary

세 서비스의 시험을 모두 돌려 통과를 확인했고, 코드를 규칙·계약·계획과 대조해 반박하려 했으나 막는 결함을 찾지 못했다. 확인한 것은 다음과 같다.

- worker `check_facts`의 종류별 경로·커밋 수, 30개·20개·1,024자 상한, 본인 커밋 소속, 겹침 검사가 api `isRevisitFact`·`validateRevisitFacts`, web `isRevisitFact`와 같은 표다.
- `except Exception`은 live.py `_facts` 한 곳뿐이고, 로그에는 requestId·attemptId·예외 형 이름만 싣고 그 후보 사실만 빈 값으로 둔다.
- 본인 목록 커서 판본 3의 `last_work_at DESC NULLS LAST, catch_id ASC`와 다음 쪽 조건(시각 있음일 때 `<` 또는 `=`이면서 ID 큼 또는 NULL, 시각 없음일 때 NULL이면서 ID 큼)이 정렬과 맞아 NULL 경계에서 빠지거나 겹치지 않는다. 공개 목록 커서는 판본 2 그대로 따로 분리되어 있다.
- 발행·MCP 질의는 열을 골라 읽고 `revisit_facts`·시각 열을 읽지 않으며, 응답은 `lastWorkAt`을 싣지 않는다.
- 마이그레이션 up·down과 CHECK 둘이 엔티티와 대응한다.
- web 링크는 고정 호스트, 저장소 이름·식별값 꼴 검사, 실제 자료 화면과 LIVE에서만, `rel="noopener noreferrer"`와 숨은 「(새 탭)」으로 만든다. 「에서」「의」는 식별값 뒤에만 붙는다.
- 계획이 함께 고치라고 한 문서(앞 단계 설계 문서 세 파일, api·worker·web 문서, 합성 자료 README·results 7개)가 모두 수정되어 있고, 옛 결과 판본 "3"을 가리키는 줄은 찾지 못했다.
