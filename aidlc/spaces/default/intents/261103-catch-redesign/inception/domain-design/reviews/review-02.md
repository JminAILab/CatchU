## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-03T15:16:09Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261103-catch-redesign/inception/domain-design/components.md > DraftGeneration depends_on CandidateGrouping, CandidateGrouping behaviour | 지금 `worker/app/generation/material.py`의 `gather`는 같은 수집 결과로 `group(outcome)`을 다시 불러 후보의 `work_identity`와 단위를 맞추고, 못 찾으면 `ValueError("후보에 맞는 묶음 단위가 없다")`를 낸다. 새 설계에서 CandidateGrouping은 이미 소속된 커밋을 뺀 뒤 묶고 PR 없는 묶음의 열쇠를 남은 새 커밋으로 새로 만든다. 그런데 DraftGeneration의 CandidateGrouping 호출은 「같은 수집 결과」만 입력으로 적혀 있고 소속 커밋 목록이 DraftGeneration에 전달된다는 말이 없다. 목록 없이 다시 계산하면 열쇠가 어긋나 재분석 후보의 재료 찾기가 실패한다(NFR4 같은 입력 같은 결과도 깨진다). | DraftGeneration 쪽 호출에 소속 커밋 목록을 함께 넘긴다고 적는다. 또는 CandidateGrouping이 후보 만들기 때 낸 단위·열쇠 결과를 재계산 없이 DraftGeneration에 넘기는 안으로 바꾸고, 그 경계를 components.md의 interaction에 쓴다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261103-catch-redesign/inception/domain-design/components.md > AnalysisProcessing (responsibilities 「판정 공급자 조립」) vs Judgement dependents | AnalysisProcessing은 LIVE 조립에서 판정 공급자를 만든다고 적혀 있지만 depends_on에 Judgement가 없고 Judgement의 dependents에도 AnalysisProcessing이 없다. 조립이 Judgement 어댑터를 직접 아는 숨은 결합이다. 다이어그램·요약 표에도 이 변이 없다. | AnalysisProcessing depends_on에 Judgement를 더하고 Judgement dependents·다이어그램·Component Summary 표를 맞춘다. 순환은 생기지 않는다. 아니면 조립 책임을 DraftGeneration 쪽으로 옮긴다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/inception/domain-design/decisions.md > ADR-002 Decision 「지우는 길은 하나다」 | `catch_asset`에는 이미 `fk_catch_asset_source_request_id`(AnalysisRequest, deleteWithParent)가 있어, 분석 요청이 지워져도 Catch와 따라서 소속 기록이 지워진다. 「회원→Catch→소속 기록 하나」라는 서술은 정확하지 않다. 소속 기록 쪽에서는 (catch_id, member_id) 외래 키 연쇄 하나뿐이라는 뜻으로만 맞다. | 문장을 「소속 기록은 Catch를 따라서만 지워진다」로 고치고 Catch 쪽 삭제 경로가 회원·분석 요청 둘임을 적는다. 탈퇴 시험 범위는 그대로다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/inception/domain-design/components.md > CatchRegistry behaviour 「이미 소속된 SHA는 바꾸지 않는다」, decisions.md > ADR-001 | 유일 조건 (회원, 저장소 ID, SHA)에 이미 있는 SHA가 들어왔을 때 조용히 건너뛰는지 트랜잭션을 실패시키는지 적혀 있지 않다. 지금 `registerCandidates`는 `orIgnore`와 이미 저장된 수신 기록의 재응답 경로를 쓰므로, 재전달·재시도에서 어느 쪽인지 정해야 한다. 소속 목록이 시도 시점의 것이라 접수 규칙(A4)이 깨지면 어긋날 수 있다. | 이미 있는 SHA는 같은 Catch면 건너뛰고 다른 Catch면 결과 반영을 실패시킨다는 식으로 한 줄로 정해 적는다. 기능 설계로 미룰 거면 미룬다고 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/inception/domain-design/components.md > DraftGeneration·Judgement | worker는 후보가 api에서 기존 Catch로 이어질지 모른다. 이어지면 제목·설명 초안·판정 결과는 버려지므로(FR1.5), 같은 열쇠 Catch가 이미 있는 후보에도 Claude와 판정 호출이 나간다. 포트폴리오 MVP에서는 공수 대비 호출 낭비일 뿐 오류는 아니다. | 기능 설계에서 이 낭비를 허용한다고 한 줄 남기거나, 맥락 조회가 기존 Catch의 열쇠 목록도 주는 안의 공수를 비교해 적는다. 요구사항 밖 기능을 더하지는 않는다. | Resolved (reviewer) |

> R-01 Reviewer note: components.md의 DraftGeneration depends_on(CandidateGrouping)과 CandidateGrouping dependents, 그림, ADR-003이 모두 후보 판정에 넘긴 것과 같은 소속 커밋 목록으로 단위·열쇠를 다시 계산한다고 적는다(같은 입력이면 같은 열쇠, NFR4).

> R-02 Reviewer note: AnalysisProcessing depends_on에 Judgement가 있고, Judgement dependents에 AnalysisProcessing이 있다. 그림의 AP-->JD 화살표, 요약 표 두 줄, 텍스트 대체 설명이 같다.

> R-03 Reviewer note: ADR-002 결정과 CatchRegistry 동작, Entity Ownership 표가 소속 기록은 Catch를 따라서만 지워지고 Catch는 회원 삭제와 분석 요청 삭제 두 길로 지워진다고 적는다.

> R-04 Reviewer note: CatchRegistry 동작과 ADR-001 결정에 이미 기록된 SHA는 같은 Catch든 다른 Catch든 조용히 건너뛰고 저장된 소속을 바꾸지 않으며 결과 반영을 실패시키지 않는다고 적혔다.

> R-05 Reviewer note: ADR-001 Consequences에 「받아들인 낭비」 한 줄로 기존 Catch로 이어질 후보에도 생성·판정 호출이 나가고 결과가 버려지는 것을 허용한다고 적혔다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| aidlc engine sensor-traceability --stage domain-design | `{"pass":true,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":[],"invalid_entries":[],"invalid_targets":[],"findings_count":0}` | 추적성 틈·고아·잘못된 대상이 없다. |
| depends_on/dependents 대칭 수동 대조 | 12개 구성 요소 전부 대칭, 순환 없음 | 모든 depends_on이 상대의 dependents에 있고 그 반대도 같다. AnalysisProcessing->Judgement와 DraftGeneration->CandidateGrouping 포함. |

### Summary

이전 지적 다섯 건이 components.md와 decisions.md에 모두 반영되었고, 의존 목록·그림·요약 표가 서로 맞으며 새 구조 문제는 찾지 못했다. 개발자가 추가 설계 질문 없이 구현할 수 있다.
