## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-27T10:20:34Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/rules.md > BR2.5, BR2.6 (functional-spec.md > W2 4단계, Assumptions & Open Questions 마지막 항목) | 겹침 한계는 이전 작업이 "늦게 성공"하는 경우만 다룬다. 이전 작업이 늦게 "실패"하면 BR2.5가 `status = 'PENDING'`만 확인하므로, [검색 다시 준비]로 새로 `PENDING`이 된 행을 `FAILED`로 덮어쓸 수 있다. 그러면 새 작업이 성공해도 BR2.4 재확인에서 버려져 작성자가 다시 눌러야 한다. 제공자 호출 시간 제한 값도 어디에도 없어 이런 늦은 실패가 가능하다. | 한계 항목에 "늦은 실패가 새 `PENDING`을 `FAILED`로 만들 수 있다"를 함께 적고 허용하거나, 제공자 호출 시간 제한을 처리 시한(10분)보다 짧게 정해 적는다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/functional-spec.md > W2 (처리기 오류 처리), rules.md > BR2.5 trigger | BR2.5의 `FAILED` 전환 조건은 제공자 오류·시간 초과·차원 불일치뿐이다. 1단계 읽기나 5단계 저장 트랜잭션이 DB 오류로 실패할 때 처리기가 어떻게 끝나는지(예외를 던지는지, 로그만 남기는지)는 적혀 있지 않다. 이 경우 행은 `PENDING`으로 남아 마감(10분) 뒤에야 `FAILED`가 된다. | 처리기가 예기치 못한 오류를 로그에 남기고 던지며 상태는 마감 판정에 맡긴다는 한 줄을 BR2.5에 더한다(에러 대응 최소선 3과 같은 취지). | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/functional-spec.md > W5 7단계, rules.md > BR5.8 | `catchEvidenceUrls`를 만들려면 검색 때 `published_item.snapshot`을 읽어야 한다. 그런데 계약 C-07은 "U3만 발행 트랜잭션 안에서 이 표를 읽고 그 밖은 C-10으로만 읽는다"고 하고, 검색은 트랜잭션 밖이다. 읽는 경로(U3이 표를 직접 읽는지, C-10 `readSnapshot`을 쓰는지)가 정해져 있지 않다. | BR5.8에 읽는 경로를 명시한다. 직접 읽는다면 C-07의 읽기 범위에 "C-09 검색 결과 구성"이 포함됨을 U4 담당과 확인해 둔다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/rules.md > BR5.5, BR5.6, BR2.2, BR6.1 | 포트폴리오 MVP 규칙에 비추어 보면, 질문 목록에 없던 항목이 몇 개 있다. `limit` 1~50 검사(BR5.5), 공백 질문의 빈 결과(BR5.6), 개발·시험에서 합성 제공자로 대체하고 그 밖에서는 기동을 멈추는 설정(BR6.1)이다. 조각 0개 발행본의 바로 `DONE`(BR2.2)만 요약 확인에서 명시됐다. 모두 작고 근거(C-09, 에러 대응 최소선, C07)를 달았으나 답변 기록에는 없다. | 승인 때 이 세 항목을 유지할지 확인한다. 줄이려면 BR5.6과 BR6.1의 "기동 중지" 부분이 가장 작게 뺄 수 있다. | Unresolved |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/functional-spec.md > Assumptions & Open Questions "미결(코드 착수 때 확인, Q2)", entities.md > PublishedChunk.embedding `vector(1024)` | 모델 이름·차원·묶음 상한·자료 보존과 학습 사용 조건이 아직 확인되지 않은 채 `vector(1024)`가 표 정의와 마이그레이션에 고정된다. 결과가 달라지면 열 정의가 바뀌는 깨는 변경이다. 발행본 글이 외부 제공자로 나가는 조건이기도 하다. | 마이그레이션 PR을 만들기 전에 확인하고 결과를 이 절에 적는 순서를 코드 착수 첫 단계로 못박는다. | Unresolved |

> R-01 Reviewer note: 「Assumptions & Open Questions」 마지막 항목과 BR2.6에 늦은 실패의 영향(새 PENDING 행이 FAILED가 되고 새 작업 결과도 BR2.4에서 버려져 작성자가 한 번 더 눌러야 함)이 한계로 적혀 있다. 호출 시간 제한 값은 사람이 그대로 두기로 했으므로 이 지적으로 다시 올리지 않는다.

> R-02 Reviewer note: BR2.5와 W2 4단계에 예기치 못한 오류는 발행본 ID와 오류 종류만 로그에 남기고 던지며 상태는 BR3.1 마감 판정에 맡긴다고 적혀 있다.

> R-03 Reviewer note: BR1.10과 `PublishedChunk.catchEvidenceUrls`로 근거 URL을 발행 트랜잭션 안에서 조각에 저장하고, BR5.8과 W5 7단계는 그 칸만 읽는다. C-07의 "U3만 발행 트랜잭션 안에서 이 표를 읽는다"와 C-09 `ChunkHit.catchEvidenceUrls`(Catch 항목이면 `evidence[].sourceUrl`, 아니면 빈 배열)에 맞는다. 계약 요약은 `published_chunk`의 칸을 U3 소유로 두므로(C-06 표 소유 행) 칸 추가는 계약 밖 변경이 아니다.

> R-04 Reviewer note: limit 1~50, 공백 질문 빈 결과, 개발·시험 밖 키 없으면 기동 중지는 질문 목록에 없던 항목이다. 사람이 그대로 두기로 했으며 승인 때 유지 여부만 확인하면 된다.

> R-05 Reviewer note: `vector(1024)`는 모델·차원·자료 보존 조건 확인(Q2) 전에 고정되어 있다. 사람이 그대로 두기로 했다. 코드 착수 때 확인한 뒤 마이그레이션 PR을 쓴다는 순서는 Open Questions 미결 항목에 있으나 PR 전 확인으로 명시되어 있지는 않다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability (수동 대조) | PASS | traceability.json의 upstream_ids 17개(AC4.1.1~4.1.9, AC6.2.1~6.2.8)가 stories.md의 US4.1·US6.2 수용 기준과 일치한다. rules.md의 BR1.1~BR6.2 전부가 coverage 또는 reverse에 있고, 새 BR1.10도 reverse에 `C-09 ChunkHit.catchEvidenceUrls, C-07 읽기 범위`로 대응한다. 대응이 빠지거나 없는 규칙을 가리키는 항목은 없다. |
| required-sections / upstream-coverage / linter / type-check | 실행하지 않음 | 이 검토에서는 수동 대조만 했다. 도구를 못 돌린 사실이며 그 자체로 NOT-READY 사유가 아니다. |

### Summary

수정본은 R-01~R-03을 닫았다. 근거 URL을 조각에 저장하는 방식은 C-07 읽기 범위와 C-09 ChunkHit 모양을 지키며 entities.md, rules.md, functional-spec.md, traceability.json 사이에서 서로 어긋나지 않는다. 새로 올릴 Critical·Major는 없고, 남은 R-04·R-05는 사람이 그대로 두기로 한 Minor라 승인 때 확인하면 된다. 구현자가 추가 설계 질문 없이 만들 수 있는 상태다.
