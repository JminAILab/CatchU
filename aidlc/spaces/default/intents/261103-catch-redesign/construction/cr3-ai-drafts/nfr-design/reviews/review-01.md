## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06T01:37:03Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/security-design.md > 비밀값 (NFR5.1~NFR5.3) 첫 항목, logical-components.md > LIVE 조립 | 판정 키를 `SECRET_ENV`에 더하고 "기동 때 읽고 환경에서 지운다"고만 적었다. 그런데 지금 코드(`worker/app/consumer/settings.py`의 `LiveSettings`·`LIVE_ENV`·`_live`, `child.py`의 `live_assembly`)에서는 부모가 읽은 비밀값을 환경에서 지운 뒤 `ChildSettings.live`로만 자식에게 넘기고, `LiveSettings`에는 생성 키 칸만 있다. 판정 키 칸과 공급자 값을 `LiveSettings`·`ChildSettings`로 나르는 길이 설계에 없으면, 이대로 구현한 운영에서 자식은 키를 못 받아 AI 쪽이 조용히 꺼진 채로 돈다. 또 `_live`는 운영에서 `LIVE_ENV`가 없으면 오류로 기동을 막는데, 설계의 "운영에서 openai인데 키가 없으면 꺼진 채 기동한다(오류가 아니다)"가 이 검사와 어떻게 맞는지(판정 키를 `LIVE_ENV`에 넣을지 말지) 정해져 있지 않다. | 판정 키·공급자 값이 설정 읽기 → `LiveSettings`/`ChildSettings` → `live_assembly` → 판정 어댑터 생성기로 가는 길을 쓴다. 판정 키를 `LIVE_ENV`에 넣는지, 없을 때 `_live`가 오류를 내지 않는 조건, 잘못된 공급자 값이 기동을 막는 자리를 정한다. 키가 자식에게 도달하는 시험(운영 모양 설정으로 판정 켜짐)을 설계에 적는다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/security-design.md > 공급자 호출 (NFR1.5) 표의 OpenAI 행 | Claude 어댑터(`worker/app/generation/claude.py`)는 접속 주소를 코드에 고정해 `*_BASE_URL` 환경변수가 주소·키를 바꾸지 못하게 하고, 프록시 환경변수를 읽지 않고, redirect를 따라가지 않고, `_DeadlineBackend`로 20초가 네트워크 대기 한 번이 아니라 호출 전체의 마감이 되게 한다. OpenAI 행은 "시간 제한 20초·응답 256 KiB·다시 시도 끔"과 `OPENAI_API_KEY`만 무시한다고 적었다. 공식 SDK는 `OPENAI_BASE_URL`도 환경에서 읽으므로, 그 값이 환경에 있으면 기록의 글·비공개 저장소 줄·판정 키가 엉뚱한 주소로 간다. 또 SDK의 시간 제한은 대기 한 번마다 걸려서 천천히 흘려보내는 응답이 20초 마감과 `CallBudget`을 넘길 수 있다. 처리 위치 "미국"을 어떻게 지키는지(요청 설정인지 엔드포인트인지)도 정해져 있지 않고 코드 생성에 미뤘다. | OpenAI 어댑터가 Claude 어댑터와 같은 수준으로 지킬 것을 표에 적는다: 접속 주소 고정과 `OPENAI_BASE_URL`·조직·프로젝트 환경변수 무시, 프록시 환경변수 미사용, redirect 미추적, 호출 전체 마감, 응답 본문 상한을 받는 방식. 미국 처리 위치를 지키는 설정 이름을 적거나, 코드 생성 전에 닫을 확인 항목으로 따로 둔다. | New |
| R-03 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/performance-design.md > 상한, security-design.md > 공급자 호출 (Claude 행 "지금 ClaudeProvider 규칙 그대로") | 판정 답의 크기와 출력 한도가 설계 어디에도 없다. 지금 `ClaudeProvider`는 `max_tokens=max(request.max_output_bytes, 4000)`이고 생성 한도 `max_output_bytes`도 4,000 B다. 재료 판정은 질문 400개마다 확률·고르기·점수를 받으므로 이 한도에서 잘려 `max_tokens` 멈춤이 되고, 응답 전체를 못 읽어 JUDGEMENT_RESPONSE_UNREADABLE이 된다(Claude 공급자일 때 큰 후보는 늘 재료 판정이 실패). OpenAI는 256 KiB 본문 상한만 있고 출력 토큰 한도가 없다. 400개 답이 20초 시간 제한 안에 나오는지도 따져 놓지 않았다. 요구사항은 "따로 바이트 상한을 두지 않는다"고만 했다. | Catch 판정과 재료 판정 각각의 최대 질문 수에서 나오는 답 크기를 어림해 공급자별 출력 한도(`max_tokens` 등)를 정하고, `limits.py`에 판정용 출력 상한을 둔다. 질문 400개 답이 20초에 못 들어오면 질문 상한이나 시간 제한을 조정하거나, 그 위험을 FR10 확인 항목으로 명시한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/performance-design.md > 호출 순서 (Q1 A), 상한 | 생성을 시작하는 확인은 지금 `CallBudget.can_generate`(생성 시간 제한 45초)뿐이다. 설계는 "끝난 Catch는 판정까지 마친다"고 하면서도, 생성은 됐는데 남은 시간이 20초 미만이면 BR2.6대로 설명이 NOT_GENERATED가 되어 방금 쓴 생성 호출이 버려진다. 생성 시작 때 판정 몫 시간을 함께 남기는지 정해져 있지 않다. 또 판정 호출 수를 세는 자리(`CallBudget`에 판정 칸을 더하는지)와 생성 호출 상한과의 관계도 적혀 있지 않다. | 생성 시작 조건에 판정 시간 제한을 더할지(45+20초) 정하고, `CallBudget`에 판정 호출 두 종류의 세기·확인 메서드를 어떻게 더하는지 한 줄 적는다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/traceability.json > upstream_ids, coverage | 상류 비기능 요구사항 NFR2.6(판정 건수 로그), NFR3.2(판정 결과 건수), NFR7.1(판정 설명 문서 분리·36,000 B 이하)이 `upstream_ids`와 `coverage`에 없다. NFR2.6·NFR3.2는 관측 설계 본문이 다루지만 추적에서 빠졌고, NFR7.1(`worker/docs/generation-judgement.md`, 문서 크기 검사)은 어느 설계 문서에도 설계 항목이 없다. | `upstream_ids`와 `coverage`에 NFR2.6·NFR3.2를 관측 설계로, NFR7.1을 해당 설계 문서(예: 논리 구성 요소의 문서 항목)로 추가하고, NFR7.1의 설계 내용을 한 줄 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 해당 단계에 지정된 검증 도구 | 실행하지 않음 | 이 단계 정의에서 따로 돌릴 도구를 받지 못했다. 코드 대조(`settings.py`, `child.py`, `claude.py`, `limits.py`, `flow.py`)로 위 사실을 직접 확인했다. |

### Summary

보안·성능·신뢰성 설계의 큰 틀(요청 조립 한 곳, 다시 시도 없음, 건수만 로그)은 상류 요구사항과 맞는다. 그러나 판정 키가 자식 프로세스까지 가는 길, OpenAI 어댑터의 주소·마감 보호, 판정 답의 출력 한도라는 세 곳이 지금 코드와 맞대면 비어 있어서, 그대로 구현하면 AI 쪽이 조용히 꺼지거나 판정이 늘 실패하거나 자료가 엉뚱한 주소로 갈 수 있다. 이 셋을 닫으면 구현 가능하다.
