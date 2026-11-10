## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-05T10:43:30Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/scalability-requirements.md > 확인 사항 「글 길이」·「한계」 | 「기록의 글은 길이 상한 없이 담는다」와 「매우 긴 첫 줄 하나가 발행본 글자 합계를 빨리 채울 수 있다」는 지금 코드와 맞지 않는다. `worker/app/generation/redact.py`의 `mask_text`는 2,000자(`MAX_LINE_CHARS`)를 넘는 줄을 통째로 가린다. 보안 요구사항 NFR1.2·NFR1.3이 같은 검사를 쓰므로, 2,000자를 넘는 첫 줄은 기록의 글이 되지 못하고 합계도 채우지 못한다. 실제 상한은 2,000자인데 확인 방법(300자 시험)은 이 경계를 건드리지 않는다. 또한 api 청크 나누기(`MAX_CHUNK_LENGTH` 1000, `embedding-config.ts`)가 1,000자를 넘는 줄을 여러 조각으로 나눈다는 점도 적혀 있지 않다. | 한계 문단을 고쳐 「가리기 검사 때문에 2,000자 넘는 첫 줄은 기록의 글이 없다」를 실제 상한으로 적는다. 확인 방법에 경계 시험(2,000자·2,001자)과 1,000자 넘는 줄의 청크 분할 시험을 더한다. 기능 설계 BR2.3의 「자르지 않는다」와 이 상한이 어떻게 이어지는지 한 줄로 밝힌다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/security-requirements.md > NFR1.2·NFR1.3·NFR1.4·NFR1.6 | 인셉션 NFR1의 뜻은 「외부 AI 처리」(Claude에는 바뀐 줄만, 판정 공급자에는 판정 입력만, 판정 입력의 기록의 글은 신뢰할 수 없는 입력)다. 가리기 검사 통과(NFR1.2)·검사 함수 한 곳(NFR1.3)·화면 글자 렌더(NFR1.4)·로그 비노출(NFR1.6)은 외부 AI 처리가 아니라 FR5.1·BR2.4·FR8.1·team.md 「Code Style」에서 온 요구다. 단계 규칙은 부모가 맞지 않으면 번호를 억지로 붙이지 말고 번호 없는 「확인 사항」으로 두라고 한다. NFR1.1(생성 요청에 기록의 글 없음)과 NFR1.5(근거 글을 지시로 따르지 않는지 확인)만 NFR1의 뜻에서 나온다. | NFR1.2·1.3·1.4·1.6을 번호 없는 「확인 사항」(근거 FR5.1·FR8.1·BR2.4·team.md)으로 옮기고 traceability.json의 NFR1 target에서 뺀다. 내용은 바꾸지 않아도 된다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/reliability-requirements.md > NFR6.1, traceability.json > NFR6 | 인셉션 NFR6은 결과 메시지 판본을 올리고 api·worker를 함께 배포한다고 요구하고, 확인은 「판본 문자열이 같은 새 값」이다. NFR6.1은 「판본을 안 바꾸니 함께 배포 조건이 없다」로 정반대다. 이 항목은 NFR6에서 물려받은 요구가 아니라 CR1에 NFR6이 적용되지 않는다는 선언이다. 그런데 traceability는 NFR6을 OK로 둔다. | NFR6 coverage를 N/A로 바꾸고 이유(판본·함께 배포는 계약을 바꾸는 Unit이 맡는다)를 적는다. NFR6.1은 「CR1은 계약을 바꾸지 않으므로 함께 배포 조건이 없다」는 확인 사항으로 옮긴다. NFR6.2(옛·새 Catch 혼재 표시)는 호환 관점이라 유지해도 된다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/security-requirements.md > NFR1.6 | 확인 방법이 「지금 `workFacts[0]` 로그 비노출 시험과 같은 방식」이다. 지금 시험(`worker/tests/test_consumer_processor.py`)은 `workFacts[0]`과 `subjectContribution`만 로그에 없는지 본다. CR1 뒤 기록의 글은 작업 사실 둘째 줄(`workFacts[1]`)과 제목에 들어가므로, 그대로 두면 새 노출 경로를 시험이 보지 못한다. 생성 로그 `_log`(flow.py)는 건수만 남기게 되어 있어 코드 위험은 낮다. | 확인 방법에 「`workFacts[1]`(기록의 글)과 제목 원문이 로그에 없다」를 명시하고, 기록의 글이 든 후보로 시험하도록 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/performance-requirements.md > 확인 사항 「처리 시간」 | 「생성 쪽 처리 시간 한도를 넘지 않아야 한다」는 기준이 숫자가 아니다. `generation-limits.md`의 한도는 마감 3,600초 − 여유 60초와 호출별 시간 제한인데, 재료 고르기는 호출 없는 계산이므로 어느 값에 견주는지 모호하다. | 합성 후보(커밋 3,000)의 재료 고르기가 걸리는 시간에 구체적 상한(예: 전체 마감의 일부 또는 초 단위 값)을 적거나, 「시험이 마감 안에서 끝난다」를 판정으로 명시한다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/scalability-requirements.md > 확인 사항 「12월 AI 근거 조각」 | 1,000자를 넘는 기록의 글 줄이 조각 둘 이상이 된다는 서술만 있고 확인 방법이 없다. 지난 검토가 요청한 조각 나누기 시험이 빠졌다. 막는 문제는 아니고 현재 처리를 바꾸지 않으므로 영향은 작다. | 코드 생성 때 1,000자 초과 줄이 조각 둘 이상으로 나뉘는 기존 시험을 확인해 요약에 남기거나, 한 줄 확인 항목을 더한다. | Unresolved |
| R-07 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/nfr-requirements/tech-stack-decisions.md > 「고르지 않은 것」 둘째 항목 | 「(NFR1.3)」을 근거로 적었는데 security-requirements.md에는 NFR1.1과 NFR1.2만 있다. 가리기 검사를 한 곳에 두는 요구는 이제 번호 없는 「검사 한 곳」 확인 사항이라서, 이 번호는 어디에도 연결되지 않는다. | 근거 표기를 「보안 요구사항 확인 사항 『검사 한 곳』, BR2.4」로 고친다. | New |

> R-06 Reviewer note: scalability-requirements.md 「12월 AI 근거 조각」에는 1,000자 초과 줄이 조각 둘 이상이 된다는 서술만 있고 확인 방법이 없다. 막는 문제는 아니다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 코드 상수 대조 (grep) | `MAX_LINE_CHARS = 2_000`(HEAD의 `worker/app/generation/redact.py`), `MAX_CHUNK_LENGTH = 1000`, `SNAPSHOT_TEXT_TOTAL_MAX = 60_000` | 확장성·보안 문서가 적은 수치가 모두 맞다. 작업 트리에서는 redact가 `worker/app/redact.py`로 옮겨져 있다. 이 NFR 문서가 말하는 이동 방향과 같아서 문제가 아니다. |
| 인셉션 NFR1~NFR7 대조 | traceability.json의 OK 4건과 N/A 3건에 근거가 있다 | 상류 NFR이 빠짐없이 다뤄졌고, N/A 사유도 NFR 본문과 일치한다. |

### Summary

요구사항 문서들은 상류 NFR1~NFR7을 빠짐없이 다루고, 코드 상수와도 맞는다. 기록의 글 2,000자 상한, 1,000자 조각, 60,000자 합계도 실제 코드와 일치한다. 개발자가 추가 질문 없이 설계 단계로 넘어갈 수 있으므로 READY다. 남은 것은 조각 나누기 확인 방법이 없다는 지난 Minor(R-06)와, 존재하지 않는 NFR1.3을 가리키는 표기 하나뿐이고, 둘 다 막지 않는다.
