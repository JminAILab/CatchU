## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06T01:41:33Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/security-design.md > 비밀값 (NFR5.1~NFR5.3) 첫 항목, logical-components.md > LIVE 조립 | 판정 키를 `SECRET_ENV`에 더하고 "기동 때 읽고 환경에서 지운다"고만 적었다. 그런데 지금 코드(`worker/app/consumer/settings.py`의 `LiveSettings`·`LIVE_ENV`·`_live`, `child.py`의 `live_assembly`)에서는 부모가 읽은 비밀값을 환경에서 지운 뒤 `ChildSettings.live`로만 자식에게 넘기고, `LiveSettings`에는 생성 키 칸만 있다. 판정 키 칸과 공급자 값을 `LiveSettings`·`ChildSettings`로 나르는 길이 설계에 없으면, 이대로 구현한 운영에서 자식은 키를 못 받아 AI 쪽이 조용히 꺼진 채로 돈다. 또 `_live`는 운영에서 `LIVE_ENV`가 없으면 오류로 기동을 막는데, 설계의 "운영에서 openai인데 키가 없으면 꺼진 채 기동한다(오류가 아니다)"가 이 검사와 어떻게 맞는지(판정 키를 `LIVE_ENV`에 넣을지 말지) 정해져 있지 않다. | 판정 키·공급자 값이 설정 읽기 → `LiveSettings`/`ChildSettings` → `live_assembly` → 판정 어댑터 생성기로 가는 길을 쓴다. 판정 키를 `LIVE_ENV`에 넣는지, 없을 때 `_live`가 오류를 내지 않는 조건, 잘못된 공급자 값이 기동을 막는 자리를 정한다. 키가 자식에게 도달하는 시험(운영 모양 설정으로 판정 켜짐)을 설계에 적는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/security-design.md > 공급자 호출 (NFR1.5) 표의 OpenAI 행 | Claude 어댑터(`worker/app/generation/claude.py`)는 접속 주소를 코드에 고정해 `*_BASE_URL` 환경변수가 주소·키를 바꾸지 못하게 하고, 프록시 환경변수를 읽지 않고, redirect를 따라가지 않고, `_DeadlineBackend`로 20초가 네트워크 대기 한 번이 아니라 호출 전체의 마감이 되게 한다. OpenAI 행은 "시간 제한 20초·응답 256 KiB·다시 시도 끔"과 `OPENAI_API_KEY`만 무시한다고 적었다. 공식 SDK는 `OPENAI_BASE_URL`도 환경에서 읽으므로, 그 값이 환경에 있으면 기록의 글·비공개 저장소 줄·판정 키가 엉뚱한 주소로 간다. 또 SDK의 시간 제한은 대기 한 번마다 걸려서 천천히 흘려보내는 응답이 20초 마감과 `CallBudget`을 넘길 수 있다. 처리 위치 "미국"을 어떻게 지키는지(요청 설정인지 엔드포인트인지)도 정해져 있지 않고 코드 생성에 미뤘다. | OpenAI 어댑터가 Claude 어댑터와 같은 수준으로 지킬 것을 표에 적는다: 접속 주소 고정과 `OPENAI_BASE_URL`·조직·프로젝트 환경변수 무시, 프록시 환경변수 미사용, redirect 미추적, 호출 전체 마감, 응답 본문 상한을 받는 방식. 미국 처리 위치를 지키는 설정 이름을 적거나, 코드 생성 전에 닫을 확인 항목으로 따로 둔다. | Resolved (reviewer) |
| R-03 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/performance-design.md > 상한, security-design.md > 공급자 호출 (Claude 행 "지금 ClaudeProvider 규칙 그대로") | 판정 답의 크기와 출력 한도가 설계 어디에도 없다. 지금 `ClaudeProvider`는 `max_tokens=max(request.max_output_bytes, 4000)`이고 생성 한도 `max_output_bytes`도 4,000 B다. 재료 판정은 질문 400개마다 확률·고르기·점수를 받으므로 이 한도에서 잘려 `max_tokens` 멈춤이 되고, 응답 전체를 못 읽어 JUDGEMENT_RESPONSE_UNREADABLE이 된다(Claude 공급자일 때 큰 후보는 늘 재료 판정이 실패). OpenAI는 256 KiB 본문 상한만 있고 출력 토큰 한도가 없다. 400개 답이 20초 시간 제한 안에 나오는지도 따져 놓지 않았다. 요구사항은 "따로 바이트 상한을 두지 않는다"고만 했다. | Catch 판정과 재료 판정 각각의 최대 질문 수에서 나오는 답 크기를 어림해 공급자별 출력 한도(`max_tokens` 등)를 정하고, `limits.py`에 판정용 출력 상한을 둔다. 질문 400개 답이 20초에 못 들어오면 질문 상한이나 시간 제한을 조정하거나, 그 위험을 FR10 확인 항목으로 명시한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/performance-design.md > 호출 순서 (Q1 A), 상한 | 생성을 시작하는 확인은 지금 `CallBudget.can_generate`(생성 시간 제한 45초)뿐이다. 설계는 "끝난 Catch는 판정까지 마친다"고 하면서도, 생성은 됐는데 남은 시간이 20초 미만이면 BR2.6대로 설명이 NOT_GENERATED가 되어 방금 쓴 생성 호출이 버려진다. 생성 시작 때 판정 몫 시간을 함께 남기는지 정해져 있지 않다. 또 판정 호출 수를 세는 자리(`CallBudget`에 판정 칸을 더하는지)와 생성 호출 상한과의 관계도 적혀 있지 않다. | 생성 시작 조건에 판정 시간 제한을 더할지(45+20초) 정하고, `CallBudget`에 판정 호출 두 종류의 세기·확인 메서드를 어떻게 더하는지 한 줄 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/traceability.json > upstream_ids, coverage | 상류 비기능 요구사항 NFR2.6(판정 건수 로그), NFR3.2(판정 결과 건수), NFR7.1(판정 설명 문서 분리·36,000 B 이하)이 `upstream_ids`와 `coverage`에 없다. NFR2.6·NFR3.2는 관측 설계 본문이 다루지만 추적에서 빠졌고, NFR7.1(`worker/docs/generation-judgement.md`, 문서 크기 검사)은 어느 설계 문서에도 설계 항목이 없다. | `upstream_ids`와 `coverage`에 NFR2.6·NFR3.2를 관측 설계로, NFR7.1을 해당 설계 문서(예: 논리 구성 요소의 문서 항목)로 추가하고, NFR7.1의 설계 내용을 한 줄 적는다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/performance-design.md > 상한 > 마감 확인 | 생성을 시작할 때 남겨 두는 시간은 「생성 45초 + Catch 판정 20초」뿐이다. 큰 후보는 그 앞에서 재료 판정(최대 20초)이 먼저 돌아 시간을 쓰므로, 재료 판정이 끝난 뒤에는 이미 확인한 몫이 줄어 생성이 시작되지 못하거나 생성 결과가 판정 없이 남을 수 있다. | 큰 후보의 시작 확인에 재료 판정 20초를 더하거나(재료 판정 + 생성 + Catch 판정), 재료 판정 뒤 생성 시작 확인을 한 번 더 한다고 적는다. | New |
| R-07 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/performance-design.md > 상한 > 판정 출력 상한 | Catch 판정 출력 상한 2,000토큰은 질문 수 상한(400개)과 짝지어 따지지 않았다. 질문 하나 답이 약 8~10토큰이면 Catch 판정은 약 200개 질문까지만 안전하다. 또 출력 상한을 OpenAI 어댑터에 어떻게 넘기는지(최대 출력 토큰 인자)는 Claude의 `max_tokens`만 적혀 있다. | Catch 판정 한 요청의 질문 수가 2,000토큰 안에 든다는 근거(대상 수 상한)를 한 줄 적고, OpenAI 어댑터도 같은 출력 상한을 넘긴다고 명시한다. | New |

> R-01 Reviewer note: 보안 설계 「비밀값」에 `LiveSettings`→`ChildSettings.live`→`live_assembly`로 칸 둘(`judgement_provider`, `judgement_api_key`)을 나르는 길이 적혔고, `_live` 필수 셋에 판정 키를 넣지 않는 이유와 「OpenAI+키 없음=꺼진 채 기동」, 「Claude=생성 키로 켜짐」 관계가 정해졌다. 실제 `settings.py`의 `SECRET_ENV`·`LiveSettings`·`_live` 구조와 맞는다.

> R-02 Reviewer note: OpenAI 행에 주소 코드 고정(환경변수 미사용), `trust_env` 끔, redirect 미추적, 호출 전체 마감, 미국 처리 확인과 미국이 아니면 켜지 않는 조건이 들어갔다. 코드 생성 때 공식 문서로 확인하는 항목은 남았지만 실행 가능한 기준이다.

> R-03 Reviewer note: 판정 출력 상한(Catch 2,000토큰·재료 8,000토큰)과 `[id, 값]` 짧은 답 꼴, 잘림=읽을 수 없는 응답 처리, 20초 안에 드는지는 FR10에서 실측해 기록하는 방법이 적혔다.

> R-04 Reviewer note: 생성 시작 때 「45초+판정 20초」 몫을 확인하고, `CallBudget`이 판정 호출을 종류별로 따로 센다고 적혔다. 다만 아래 새 지적 1(재료 판정 몫)이 남는다.

> R-05 Reviewer note: `traceability.json`에 NFR2.6·NFR3.2·NFR7.1이 들어갔고, NFR7.1은 논리 구성 요소의 문서 행(`generation-judgement.md`, 36,000 B 확인)으로 연결된다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 정적 대조(NFR ID↔traceability.json) | 19개 NFR 모두 대응 항목 있음 | 이전 추적 누락 해소 |
| 코드 대조(`worker/app/consumer/settings.py`) | `SECRET_ENV`·`LiveSettings`·`_live` 존재 | 키 전달 길 설명과 모순 없음 |

### Summary

이전 Major 3건과 Minor 2건이 모두 해소되어 구현자가 추측 없이 만들 수 있는 수준이다. 남은 것은 재료 판정 시간 몫과 Catch 판정 출력 상한 근거라는 Minor 두 건뿐이다.
