## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10T23:12:44Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261109-new-catch/construction/nc2-snapshot-fields/nfr-design/security-design.md > 1절 권한과 데이터 범위, performance-design.md > 소속 기록 조회 SQL | NFR5.3은 `ownCommit`을 「회원·저장소·catch_id가 같은 commit_assignment」로만 정하라고 하는데, 새 질의와 판정은 `member_id`, `catch_id`, `commit_sha`만 쓰고 저장소(`github_repository_id`)와 근거 주소의 소유자·저장소 이름은 견주지 않는다. 같은 Catch 안에서는 저장소가 하나라 대부분 같은 결과지만, 포크처럼 다른 저장소의 같은 식별값을 가리키는 근거 주소가 있어도 표지가 붙을 수 있다. 잠금 조회가 이미 읽는 `r.repository_id`와 등록의 `owner`·`name`을 판정에 쓰지 않고 있고, api 쪽 시험 목록에도 「다른 저장소의 같은 식별값」 사례가 없다. | 질의에 Catch의 저장소 ID 조건(`github_repository_id`)을 더하거나, 근거 주소의 `/<소유자>/<저장소>`가 읽어 온 등록의 `owner`·`name`과 같을 때만 판정에 쓴다고 정한다. 그렇게 하지 않는다면 `(catch_id, commit_sha)`만으로 충분한 이유를 한 줄 적는다. api 시험에 「다른 저장소 주소의 같은 식별값은 거짓」 사례를 더한다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc2-snapshot-fields/nfr-design/reliability-design.md > 2절 안전망 시험 | 등록 이름이 null인 경우는 DB 외래 키 때문에 실제로 만들 수 없다고 적으면서, 「서비스 시험에서 경고 줄이 하나 남는지」 본다고 한다. 지금 발행 시험은 실제 DB에 행을 넣어 돌리므로(`api/test/publications/publish-api.test.cjs`) 이 갈래를 서비스까지 끌어올 방법이 정해지지 않았다. | 경고 줄 시험을 어떻게 만들지(잠금 조회 결과를 바꿔 끼우는 가짜, 또는 트랜잭션 결과의 표시 값을 직접 넘기는 단위 시험) 한 줄로 정한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc2-snapshot-fields/nfr-design/performance-design.md > 발행 읽기 설계 표 | 잠금 조회의 기존 별칭 `r`이 `analysis_request`인데, 저장소 등록을 `r.registration_id`로 잇는다고만 적어 별칭 충돌 가능성이 있다. 또 조인 키를 `registration_id` 하나와 `member_id`로 적었지만 분석 요청의 외래 키는 (회원, 등록, 저장소) 세 칸이다. | 코드 계획에서 등록 표에 다른 별칭을 쓰고 조인 조건을 외래 키와 같은 세 칸으로 맞춘다고 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-traceability (nfr-design) | pass: true, gaps·orphans·invalid 모두 0 | 추적 파일은 상류 요구와 맞는다. |
| 현재 코드 대조 | `PublicationsLog`·`publishSucceeded` 위치, `commit_assignment` 기본 키와 `(catch_id, member_id)` 색인, `build.py`의 한계 문장 한 줄 따옴표 꼴, `ci.yml`의 `worker/app/*` 변경 시 api 시험 실행, `shared-fixtures.check.cjs`의 경로 기준이 설계 설명과 맞는다. | 검토 R-01~R-04는 모두 설계에 반영됐다. |

### Summary

NFR 설계는 이전 검토의 Minor 네 건을 구체적으로 풀었고 구현 가능한 수준이지만, 소속 기록 판정에 저장소 조건이 빠져 NFR5.3의 「저장소가 같음」 요구를 설계가 직접 닫지 않은 점이 하나 있다. 해당 Major는 한 건이라 막지 않으며, 다음 단계에서 위 조치를 반영하면 된다.
