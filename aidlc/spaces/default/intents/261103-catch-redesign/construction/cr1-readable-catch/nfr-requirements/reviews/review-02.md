## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-05T04:23:38Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/scalability-requirements.md > 확인 사항 「글 길이」·「한계」 | 「기록의 글은 길이 상한 없이 담는다」와 「매우 긴 첫 줄 하나가 발행본 글자 합계를 빨리 채울 수 있다」는 지금 코드와 맞지 않는다. `worker/app/generation/redact.py`의 `mask_text`는 2,000자(`MAX_LINE_CHARS`)를 넘는 줄을 통째로 가린다. 보안 요구사항 NFR1.2·NFR1.3이 같은 검사를 쓰므로, 2,000자를 넘는 첫 줄은 기록의 글이 되지 못하고 합계도 채우지 못한다. 실제 상한은 2,000자인데 확인 방법(300자 시험)은 이 경계를 건드리지 않는다. 또한 api 청크 나누기(`MAX_CHUNK_LENGTH` 1000, `embedding-config.ts`)가 1,000자를 넘는 줄을 여러 조각으로 나눈다는 점도 적혀 있지 않다. | 한계 문단을 고쳐 「가리기 검사 때문에 2,000자 넘는 첫 줄은 기록의 글이 없다」를 실제 상한으로 적는다. 확인 방법에 경계 시험(2,000자·2,001자)과 1,000자 넘는 줄의 청크 분할 시험을 더한다. 기능 설계 BR2.3의 「자르지 않는다」와 이 상한이 어떻게 이어지는지 한 줄로 밝힌다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/security-requirements.md > NFR1.2·NFR1.3·NFR1.4·NFR1.6 | 인셉션 NFR1의 뜻은 「외부 AI 처리」(Claude에는 바뀐 줄만, 판정 공급자에는 판정 입력만, 판정 입력의 기록의 글은 신뢰할 수 없는 입력)다. 가리기 검사 통과(NFR1.2)·검사 함수 한 곳(NFR1.3)·화면 글자 렌더(NFR1.4)·로그 비노출(NFR1.6)은 외부 AI 처리가 아니라 FR5.1·BR2.4·FR8.1·team.md 「Code Style」에서 온 요구다. 단계 규칙은 부모가 맞지 않으면 번호를 억지로 붙이지 말고 번호 없는 「확인 사항」으로 두라고 한다. NFR1.1(생성 요청에 기록의 글 없음)과 NFR1.5(근거 글을 지시로 따르지 않는지 확인)만 NFR1의 뜻에서 나온다. | NFR1.2·1.3·1.4·1.6을 번호 없는 「확인 사항」(근거 FR5.1·FR8.1·BR2.4·team.md)으로 옮기고 traceability.json의 NFR1 target에서 뺀다. 내용은 바꾸지 않아도 된다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/reliability-requirements.md > NFR6.1, traceability.json > NFR6 | 인셉션 NFR6은 결과 메시지 판본을 올리고 api·worker를 함께 배포한다고 요구하고, 확인은 「판본 문자열이 같은 새 값」이다. NFR6.1은 「판본을 안 바꾸니 함께 배포 조건이 없다」로 정반대다. 이 항목은 NFR6에서 물려받은 요구가 아니라 CR1에 NFR6이 적용되지 않는다는 선언이다. 그런데 traceability는 NFR6을 OK로 둔다. | NFR6 coverage를 N/A로 바꾸고 이유(판본·함께 배포는 계약을 바꾸는 Unit이 맡는다)를 적는다. NFR6.1은 「CR1은 계약을 바꾸지 않으므로 함께 배포 조건이 없다」는 확인 사항으로 옮긴다. NFR6.2(옛·새 Catch 혼재 표시)는 호환 관점이라 유지해도 된다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/security-requirements.md > NFR1.6 | 확인 방법이 「지금 `workFacts[0]` 로그 비노출 시험과 같은 방식」이다. 지금 시험(`worker/tests/test_consumer_processor.py`)은 `workFacts[0]`과 `subjectContribution`만 로그에 없는지 본다. CR1 뒤 기록의 글은 작업 사실 둘째 줄(`workFacts[1]`)과 제목에 들어가므로, 그대로 두면 새 노출 경로를 시험이 보지 못한다. 생성 로그 `_log`(flow.py)는 건수만 남기게 되어 있어 코드 위험은 낮다. | 확인 방법에 「`workFacts[1]`(기록의 글)과 제목 원문이 로그에 없다」를 명시하고, 기록의 글이 든 후보로 시험하도록 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/performance-requirements.md > 확인 사항 「처리 시간」 | 「생성 쪽 처리 시간 한도를 넘지 않아야 한다」는 기준이 숫자가 아니다. `generation-limits.md`의 한도는 마감 3,600초 − 여유 60초와 호출별 시간 제한인데, 재료 고르기는 호출 없는 계산이므로 어느 값에 견주는지 모호하다. | 합성 후보(커밋 3,000)의 재료 고르기가 걸리는 시간에 구체적 상한(예: 전체 마감의 일부 또는 초 단위 값)을 적거나, 「시험이 마감 안에서 끝난다」를 판정으로 명시한다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/scalability-requirements.md > 확인 사항 「12월 AI 근거 조각」 | 1,000자를 넘는 기록의 글 줄이 조각 둘 이상이 된다는 서술만 있고 확인 방법이 없다. 지난 검토가 요청한 조각 나누기 시험이 빠졌다. 막는 문제는 아니고 현재 처리를 바꾸지 않으므로 영향은 작다. | 코드 생성 때 1,000자 초과 줄이 조각 둘 이상으로 나뉘는 기존 시험을 확인해 요약에 남기거나, 한 줄 확인 항목을 더한다. | New |

> R-01 Reviewer note: 확장성 문서가 가리기 검사의 2,000자 상한(`MAX_LINE_CHARS`, `mask_text`는 2,000자 초과만 가림)을 실제 상한으로 적고, 2,000자·2,001자 경계 시험을 더했다. 코드와 맞다. 1,000자 넘는 줄의 조각 나누기는 서술만 있고 시험은 없다(아래 새 지적).

> R-02 Reviewer note: 가리기·검사 한 곳·화면 그리기·로그를 번호 없는 확인 사항으로 옮겼고(근거 FR5.1·BR2.4·FR8.1·team.md), NFR1은 NFR1.1·NFR1.2(근거 글을 지시로 따르지 않는지 확인)만 남았다. traceability target도 맞다.

> R-03 Reviewer note: traceability에서 NFR6이 N/A이고 이유가 적혀 있다. NFR6.1은 신뢰성 문서의 확인 사항으로 옮겨졌다.

> R-04 Reviewer note: 로그 확인이 `workFacts[1]`과 제목 원문을 명시하고, 기록의 글이 든 후보로 시험하도록 적혀 있다.

> R-05 Reviewer note: 커밋 3,000인 합성 후보에서 재료 고르기 5초라는 숫자 기준이 설계 제안값으로 적혔고, 생성 호출 제한 45초·마감과의 관계도 설명됐다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 코드 대조: `worker/app/generation/redact.py` `mask_text` | 길이 > 2,000이면 통째로 가림, 2,000자는 통과 | 확장성의 경계 서술과 맞다 |
| 요구사항 대조: 인셉션 NFR1·NFR6 | NFR1은 외부 AI 처리, NFR6은 판본 올림과 함께 배포 | 번호 정리와 NFR6 N/A 처리가 타당하다 |

### Summary

지난 5건이 모두 문서에서 해소되었고 번호 대응이 인셉션 NFR의 뜻과 맞는다. 조각 나누기 시험이 빠진 Minor 1건만 남아 구현자가 추측 없이 만들 수 있으므로 READY다.
