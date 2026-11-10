## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-07T10:42:13Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr2-commit-assignment/functional-design/functional-spec.md > W5 3단계, rules.md > BR1.3·BR1.5 | 커밋 묶음에서 소속 변경을 뺀 뒤 단위가 가진 나머지 값(`parent_links`, `same_change_links`, `notes`, `merged_in`, `moved_out`, `inner_placed`, `sources`)을 어떻게 하는지 정해져 있지 않다. 지금 코드 `worker/app/candidates/build.py`의 `_bundle_links`는 커밋이 둘 이상인 묶음에 이은 근거(`parent_links`나 `same_change_links`)가 하나도 없으면 `ValueError`로 분석을 멈춘다. W5는 d4·d5가 서로는 같은 파일을 고치지 않고 d1~d3을 거쳐서만 이어진 경우를 정상으로 정했다. 이때 남은 변경 사이의 직접 링크만 남기면 링크가 비어 분석이 결함으로 끝나고, 링크를 그대로 두면 묶음 설명(`groupingBasis`)이 이미 다른 Catch 소속인 d3을 이은 근거로 적는다. 어느 쪽인지 알 수 없어 US1.3(AC1.3.1)을 그대로 구현하면 갈린다. | 뺀 뒤 단위의 이은 근거·한계·집계 값을 값마다 정한다(빼기 전 값을 그대로 쓰는지, 남은 변경으로 다시 만드는지). 소속 커밋을 거쳐 이어진 묶음의 설명 문장을 정하고, 링크가 비어도 `ValueError`가 나지 않는 규칙을 적는다. 시험 목록(7절)에 d4·d5가 d3으로만 이어진 경우를 넣는다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr2-commit-assignment/functional-design/functional-spec.md > 7. 함께 고칠 문서와 시험 | 함께 고칠 문서 목록이 바뀌는 규칙을 적은 문서를 다 담지 못했다. BR1.6은 생성 재료 찾기가 「같은 수집 결과로 `group(outcome)`을 다시 부른다」는 규칙을 바꾸는데, 이 문장이 `worker/docs/generation-material.md` 9행·15행, `worker/docs/generation.md`의 재료 찾기 절, `worker/docs/candidate-text.md` 33행에 있다. worker 항목은 `request-context.md`와 「후보 판정 문서」만 적는다. 또 재분석 규칙(「같은 작업은 기존 Catch를 유지하고 새 작업만 비공개 Catch로 추가한다」)을 적은 `api/docs/repository-analysis-u7.md`의 「기존 Catch를 보존하는 재분석」 둘째 단락은 37행만 적히고 이 단락이 빠졌다. 프로젝트 규칙(규칙을 바꿀 때 같은 규칙의 다른 문서를 모두 목록에 넣는다)과 어긋난다. | 7절 목록에 `worker/docs/generation-material.md`, `worker/docs/generation.md`(재료 찾기), `worker/docs/candidate-text.md` 33행, `api/docs/repository-analysis-u7.md`의 재분석 단락을 더한다. 저장소를 `재분석`·`group(outcome)`·`workIdentity 중복`으로 다시 찾아 빠진 문서가 없는지 확인한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr2-commit-assignment/functional-design/rules.md > BR2.1, BR3.2, functional-spec.md > W2 | 합성(MOCK) 후보의 `ownCommitShas`가 정해져 있지 않다. 계약은 후보마다 1개 이상을 필수로 하는데(`contract-summary.md` C2), 합성 결과는 가짜 생성기(`worker/app/processing/fake_generator.py`)가 시험 자료에서 후보를 읽어 만든다. W2는 소속 집합이 빈다는 것만 적었고, MOCK 후보가 어떤 값을 싣는지, api가 `sourceMode`가 MOCK인 결과의 소속도 쓰는지는 없다. | 합성 후보가 싣는 값(고정 가짜 SHA 등)과 MOCK 결과의 소속 쓰기 여부를 W2에 한 줄로 정한다. 시험 자료·합성 요청 쪽 변경도 7절에 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr2-commit-assignment/functional-design/rules.md > BR3.2 | 「등록하지 않는 후보(지금 등록 묶음에서 빠지는 후보)는 소속을 쓰지 않는다」에 해당하는 후보가 지금 코드에 없다. `api/src/catches/registration-batch.ts`의 검사는 부적합 후보를 빼지 않고 예외를 던져 반영 전체를 실패시킨다. 규칙이 존재하지 않는 경로를 가리켜 구현자가 없는 분기를 만들 수 있다. | 이 문장을 지우거나, 실제로 등록에서 빠지는 후보가 있다면 그 조건을 적는다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr2-commit-assignment/functional-design/entities.md > 계산 값 `assignedCommitShas` | 소속 목록은 저장소 하나의 모든 분석에 걸쳐 쌓이는 값이라 요청 하나의 수집 상한 3,000과 같지 않다. 그런데 ADR-003은 맥락 조회 응답이 「최대 3,000 SHA」라고 적었고 이 엔티티 문서는 「상한 없음」이다. 두 문서가 어긋난 채 남는다. | ADR-003의 크기 설명을 「저장소의 본인 커밋 누적, 상한 없음(Q2 A)」으로 맞추거나, 이 문서에 그 차이를 한 줄로 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (단계 정의에 검증 도구 없음) | 해당 없음 | 지금 코드(`grouping.py`, `build.py`, `material.py`, `live.py`, `registration-service.ts`, `registration-batch.ts`, `result-application.service.ts`, `worker-messages.yaml`)와 7절의 문서 줄 번호(work_identity_cases 21행, 작업동일성_판별기준 35행, work_identity_rules 19·86행, u7 37행)를 직접 대조했다. 줄 번호는 모두 맞았다. 가정 A4(회원마다 `ACTIVE` 요청 하나, 결과 반영과 같은 트랜잭션에서 `CLOSED`)와 EMPTY 결과의 `FOUND` 관측(수집 단계에서 정해짐)도 코드로 확인했다. |

### Summary

Q1 A·Q2 A에 맞춘 구조(소속 기록은 등록과 같은 트랜잭션, 맥락 조회로 전달, 결과 판본 3)는 코드와 어긋나지 않고 추적표도 맞다. 다만 Q1 A로 정한 묶음이 소속 커밋을 거쳐서만 이어진 경우의 이은 근거 처리가 빠져 US1.3을 구현할 때 `ValueError`나 잘못된 설명이 나올 수 있고, 함께 고칠 문서 목록에서도 재료 찾기·재분석 문서가 빠졌으니 승인 전에 이 두 가지를 반영해 달라.
