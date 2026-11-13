## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T06:42:02Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/performance-requirements.md > NFR4.3 | 사본 크기를 "항목 20개, 텍스트 자료 본문 20,000자, PDF 50쪽"으로만 묶고 "PDF 쪽별 글 길이 상한은 없다"고 적었다. 그러나 `api/src/publications/publications-config.ts:28`에 발행본 전체 글 상한 `SNAPSHOT_TEXT_TOTAL_MAX = 60_000`(임시값)이 있고 `publish.service.ts:167-170`이 발행 트랜잭션에서 이를 검사한다. 이 상한은 쪽 수 × 사본 크기 비용의 실제 위쪽 경계인데 적히지 않았다. 지금 `snapshotTextLength`는 PDF 쪽 글을 세지 않는 것으로 보이며(U8 합류 뒤 달라질 수 있음), 그 경우 PDF 글은 이 상한 밖이다 | NFR4.3에 `SNAPSHOT_TEXT_TOTAL_MAX`(임시값)를 비용 경계로 적고, PDF 쪽 글이 이 합계에 드는지 U8 코드 합류 뒤 확인한다고 한 줄 남긴다 | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/performance-requirements.md > NFR4.1 | 첫 조각 최소 진행이 40,000자를 넘기지 않는 근거로 "발행본 제목 50자, 텍스트 자료 제목 100자"만 든다. Catch 항목의 제목 길이 상한은 적히지 않았고(`snapshot-builder.ts`의 `title: string \| null`), 근거 줄(sourceUrl·판본)과 머리말도 항목 머리 칸에 들지 않는다. 이 상한이 막으려는 것은 최소 진행이 상한을 깨는 경우인데, 그 전제가 Catch 제목에 대해서는 확인되지 않았다 | Catch 제목의 상한 출처를 확인해 NFR4.1에 더하거나, 상한이 없다면 "고정 칸이 짧다"는 문장을 제목 길이 상한 확인 시험(S12·S13)으로 대신한다 | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/scalability-requirements.md > NFR4.5 와 「알려진 한계」 | NFR4.5는 "넘으면 `RATE_LIMITED`이고 DB를 읽지 않는다"를 요구사항으로 쓰지만, 「알려진 한계」는 큐 주소가 없으면 빈도 제한이 꺼진다고 적는다. 이 도구는 쪽마다 사본 전체를 다시 읽고(NFR4.3) 개발 서버에서 큐 연결 전에는 한도가 전혀 없다. 한계로는 적혀 있으나 NFR4.5의 확인 방법이 켜진 경우만 다룬다 | NFR4.5의 확인에 "큐 연결이 있을 때"라는 조건을 적고, 큐가 꺼진 상태는 알려진 한계로만 두되 S23 개발 서버 확인 때 큐 연결 여부를 함께 적도록 한다 | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/security-requirements.md > NFR2.2 | 남는 위험(작성자 글이 받은 사람의 비공개 자료 도구와 같은 대화에 놓임)의 수용을 "C-15 계약 PR에서 팀장에게 확인받는다"로 미룬다. 이 NFR 단계 승인 시점에는 수용 근거가 기능 설계 BR5.4(승인됨)뿐이고, 팀장 확인은 아직 일어나지 않았다. 확인 칸의 근거가 "계약 PR 리뷰 기록"인데 그 기록은 아직 없다 | 승인 전에 이 수용이 NFR 단계의 결정인지 계약 PR의 선행 조건인지 정해 두고, 팀장이 거부하면 되돌아갈 자리(도구 설명 문구 강화 또는 동의 문구 변경)를 한 줄 적는다 | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/observability-requirements.md > NFR6.1 | 새 로그 사건 `mcp_link_denied`는 요구사항 NFR6(FR19 확인 표, 별도 관제 화면 없음)에 직접 근거가 없고 Q1 답변 B가 근거다. 담당이 명시적으로 고른 안이라 범위 위반은 아니지만, 거부는 중지·만료 같은 정상 결과이고 `LINK_UNAVAILABLE` 호출마다 warn 로그가 남는다. 토큰·링크는 싣지 않으므로 보안 문제는 없다 | 조치 불필요. 승인 때 이 사건이 S23 확인 증거 하나를 위한 것임을 알고 가면 된다 | Unresolved |

> R-01 Reviewer note: NFR4.3이 `SNAPSHOT_TEXT_TOTAL_MAX` 60,000자(임시값)를 비용 경계로 적고, PDF 글이 합계 밖이라는 점도 적었다. `snapshot-builder.ts:54-62`의 `snapshotTextLength`가 PDF 항목(`body`·`workFacts` 둘 다 없음)을 0으로 세므로 서술이 코드와 맞다.

> R-02 Reviewer note: NFR4.1이 "Catch 제목은 길이 상한이 없다"는 사실을 적고 짧다는 전제를 버렸다. 제목만으로 자리가 넘치는 경우는 최소 진행 예외로 두고 S12에 긴 제목 시험 둘을 더했다.

> R-03 Reviewer note: NFR4.5가 "큐 연결이 있을 때"로 조건을 좁혔다. 큐가 꺼진 상태는 「알려진 한계」에 두고 S23 때 큐 연결 여부를 확인 표에 적도록 NFR6.3에 이었다.

> R-04 Reviewer note: NFR2.2가 팀장 확인을 C-15 계약 PR 병합의 선행 조건으로 정하고, 거부 시 되돌아갈 자리(기능 설계, U6 동의 문구에 위험을 알리는 줄 추가안)를 적었다.

> R-05 Reviewer note: 조치 불필요. `mcp_link_denied`는 S23 확인 증거를 위한 것임을 알고 승인하면 된다. 토큰·링크를 싣지 않아 보안 문제는 없다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 단계 정의의 검증 도구 | 실행하지 않음 | 이 검토에서 도구를 따로 돌리지 않았다. 대신 `snapshot-builder.ts`·`publish.service.ts`·`publications-config.ts`를 읽어 NFR4.3의 코드 주장을 대조했고 일치했다. 도구 미실행만으로 NOT-READY로 하지 않는다. |

### Summary

앞 지적 R-01~R-04는 문서에서 고쳐졌고 코드 주장과도 맞는다. R-05는 조치가 필요 없는 안내로 남는다. 새로 올릴 지적은 없어 구현자가 추가 질문 없이 설계 단계로 넘어갈 수 있다.
