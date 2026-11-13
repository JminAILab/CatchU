## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-11T04:25:38Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc3-revisit-facts/functional-design/functional-spec.md > 2절 흐름 W1 4단계, rules.md > BR2.1 | RevisitFacts에 넘기는 「ownCommitShas에 든 커밋 기록」을 어디서 찾는지 적혀 있지 않다. 지금 코드에서 `build_candidates`는 후보 목록(`GenerationOutput`)만 돌려주고, 커밋 기록 사전(`grouping.commits`)은 그 안에 있어 LiveGenerator에서는 보이지 않는다. 같은 사전은 `outcome.commits`와 `outcome.relations.commits`를 합친 것이라, 앞쪽만 쓰면 관계 조회로만 본 커밋이 조용히 빠진다. 기록이 없는 식별값을 어떻게 다루는지도 없다. | 커밋 기록의 출처(`outcome.commits`와 `relations.commits`의 합, 식별값으로 찾기)를 BR2.1이나 W1에 한 줄로 적고, 기록이 없는 식별값은 판정에서 건너뛴다고 정한다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc3-revisit-facts/functional-design/rules.md > BR5.2, BR8.1, BR9.2 와 entities.md > RevisitFact constraints | 종류별 개수(REWORKED_LINES는 경로 1·커밋 2, REVERTED는 경로 0·커밋 2 등)는 entities.md에만 있다. 계약 C4의 스키마는 종류와 무관한 배열이고, BR5.2는 「개수」를 Ajv가 본다고만 하며 종류별 검사인지 밝히지 않는다. web 응답 검사(BR8.1)도 「꼴」만 본다고 한다. BR9.2는 `commits[1]`·`paths[0]`을 바로 쓰므로 개수가 어긋난 값이 한 번이라도 저장되면 화면이 undefined를 그리거나 깨진다. | BR5.2에 종류별 개수 검사(스키마의 if/then 또는 등록 입력 검사)가 어느 쪽 책임인지 적고, BR8.1의 web 검사에도 같은 개수 확인을 넣거나 BR9.2가 개수가 어긋난 항목을 건너뛴다고 정한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc3-revisit-facts/functional-design/rules.md > BR3.5 | 시험 파일 판정이 쓰는 커밋의 모든 파일 상태를 보므로, 시험 파일을 지우기만 한 작업(status removed)도 「시험 파일 있음」이 된다. 요구 FR13.1·AC13.2는 「바꾼」 작업의 시험 파일이고, 지운 파일은 BR3.1에서 이미 따로 뺀다. 지운 시험 파일을 포함하는지 정하지 않았다. | BR3.5에 지운 파일(removed)을 세는지 빼는지 한 문장으로 정하고 S9·S10 옆에 경계 시나리오 하나를 더한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-traceability(읽기 전용 실행 안 함, `--write-upstream`이 쓰기라 손으로 대조) | traceability.json의 coverage 17개(AC9.1.1~AC11.2.1)가 stories.md US9.1~US11.2의 수락 기준과 하나씩 맞고, 대상 BR(BR1.1·BR2.1·BR2.3·BR3.1~3.5·BR4.1·BR6.2·BR6.3·BR7.1~7.2·BR8.1·BR9.1~9.3)이 모두 rules.md에 있다 | 빠진 AC도 없는 BR도 없다 |
| 코드 대조: worker | `ChangedFile`에 `sha`를 담는 칸이 없고 `normalize.commit_changes`가 `sha`를 읽지 않는다(BR1.1 「새 칸」 주장이 맞다). `CommitRecord`에 `parents`·`message`·`authored_at`이 있어 BR2.1·BR3.4·BR4.1 입력이 모두 있다. `_merge_same_identity`가 `own_commit_shas`를 합친다 | 사실 주장이 맞다 |
| 코드 대조: api | 본인 목록 커서는 지금 `CURSOR_VERSION = 2`, `after`는 uuid 글 하나이며 `ORDER BY c.catch_id ASC`다. NC1 BR5.2의 v2·400 처리와 이 Unit의 v3 올림이 이어진다. BR7.2의 다음 쪽 조건은 `last_work_at DESC NULLS LAST, catch_id ASC` 순서와 같다(시각 있는 쪽과 null 쪽 모두 빠짐·겹침 없음) | 맞다 |
| 화면 대조(`assets-view.tsx`, interaction-spec 6절, mockups 2절) | 「생각해 볼 질문」 제목이 `h3` + 작은 글자 「본인만 확인」 꼴이고 근거 `h3` 다음에 자리가 있다. 항목 문장의 조사는 사람이 Q5 덧붙임으로 정했고 설계가 그대로 옮겼다 | 어긋남 없음 |

### Summary

경로와 참조가 모두 이어지고 계약 C2·C4·C5, NC1 커서 규칙, 지금 코드와 어긋나는 곳이 없어 구현에 막히지 않는 설계다. 남은 것은 커밋 기록 출처, 종류별 개수 검사 책임, 지운 시험 파일 처리 세 가지로 모두 한두 문장으로 정할 수 있는 Minor다.
