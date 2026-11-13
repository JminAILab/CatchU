## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-03T15:45:25Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/inception/contract-design/contract-summary.md > C2 "판본 문자열을 같은 값으로 함께 바꿀 곳은 셋이다" | 코드와 대조하면 "3"으로 올릴 Result 판본 위치가 잘못 적혀 있다. worker에서 Result 판본은 `result.py`의 `_envelope`(79행) 한 곳뿐이다. `pipeline.py` 66행은 ProcessingEvent이고 `synthetic.py` 45행은 합성 Request라서 둘 다 "2"로 남아야 한다. 이 둘을 따라 올리면 worker 자체 스키마 검사(`_require_valid`)와 api 검사가 깨진다. 반대로 api 쪽은 `receiver.types.ts`의 `Result.schemaVersion`(59행)과 `Candidate` 타입(후보 필드 3개만 있음)에 `ownCommitShas`를 더해야 하고, 두 번째 검사기인 `api/test/helpers/worker-messages.cjs`도 같은 규칙이어야 하는데 목록에 없다. | 같은 값으로 바꿀 곳을 계약 파일, `receiver.types.ts`의 Result와 Candidate 타입, `result.py`의 `_envelope`, 시험 보조 `worker-messages.cjs`로 고쳐 적고, `pipeline.py`·`synthetic.py`는 "2" 그대로임을 적는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/inception/contract-design/contract-summary.md > C2 "수집 상한이 후보당 3,000커밋이므로 상한도 3,000이다" 및 Open questions C2 | `worker/app/collection/limits.py`의 `max_commits=3000`은 후보당이 아니라 요청 전체 상한이다. 한 후보의 본인 커밋은 이 값을 넘을 수 없으므로 `maxItems: 3000`은 안전한 상한이다. 다만 사유 문장이 틀렸고, 단위가 겹치면 후보 합계가 3,000을 넘을 수 있어 메시지 크기 가늠도 "후보 수에 비례"로만 남는다. | 사유를 "요청 전체 수집 상한(`max_commits`)이 후보 하나의 한도"로 고쳐 적는다. 메시지 크기 확인(Open questions)은 후보당 3,000이 아니라 요청 전체 기준으로 CR2 NFR에서 본다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/inception/contract-design/contract-summary.md > C3 `noticeRevision: "v2 → v3"` | 코드에는 분석 고지가 둘이다. 실제 자료용은 `catchu-real-analysis-notice-v2`, 합성용은 `catchu-synthetic-analysis-notice-v1`이고, 접수는 두 판본을 따로 대조한다(`analysis-intake.service.ts` 56·69행). 요약은 "v2 → v3"라고만 적어 어느 쪽이 바뀌는지 모호하다. 판본 꼴은 이미 Open question으로 CR3 기능 설계에 넘겼다. | 바뀌는 것은 실제 자료용 고지(`realNotice`)뿐이고 합성 고지는 그대로임을 한 줄로 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 코드 대조: `decode.py` `_ROOT_KEYS` 집합 정확 일치 | 확인됨 | C1을 깨지는 변경으로 보고 함께 배포하는 판단이 맞다. 최상위 칸이 8개에서 9개로 늘면 옛 worker가 거부한다. |
| 코드 대조: `worker-messages.yaml` | 확인됨 | Result, Request, ProcessingEvent, ResultReceipt가 각자 판본 "2"를 가진다. Result만 올리는 결정이 구조상 가능하다. `additionalProperties: false`라서 칸을 더하는 것은 깨지는 변경이다. |
| 코드 대조: `worker-context.md`의 오류 표 | 확인됨 | 401(AUTH_REQUIRED·AUTH_INVALID), 400, 404 이유 코드 5개, 500이 요약과 같다. |
| 코드 대조: `build.py`의 본인 커밋 목록 | 확인됨 | `own`은 중복 없는 비어 있지 않은 목록이다(`own_changes`가 비면 건너뜀). 근거는 `own[:20]`이므로 `minItems: 1`과 `uniqueItems`가 맞다. |
| 코드 대조: `AI_NOTICE_VERSION` 두 곳, `common.yaml`의 `NOT_GENERATED` | 확인됨 | 값 `2026-11-v1` 두 곳과 설명 없음 상태가 모두 있다. C4와 C5의 주장이 맞다. |

### Summary

C1~C5의 필드 이름, 오류 코드, 깨지는 변경 판단, FR/ADR/NFR 연결은 현재 코드와 계약에 맞고 함께 배포 묶음도 빠진 것이 없다. 남은 것은 판본 문자열을 바꿀 위치 목록의 오기(pipeline·synthetic은 Result가 아님)와 상한 사유 문구, 합성 고지 구분이며 모두 구현을 막지 않는 Minor다.
