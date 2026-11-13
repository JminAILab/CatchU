## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06
**Iteration:** 1
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
| R-08 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/performance-design.md > 상한 > 판정 출력 상한 | 설계는 OpenAI 어댑터에 「SDK의 출력 토큰 상한 인자」를 넘긴다고 적었지만, 만든 SDK(`openai==3.46.0`)의 Decisions 요청에는 그 인자가 없다(code-summary 「계획과 다른 점」1). 인자가 없을 때의 대안은 설계에 없고, 실제로는 질문 수 상한 400과 응답 본문 256 KiB 상한이 대신한다. 따라서 「8,000토큰 상한에 걸려 잘리면 JUDGEMENT_RESPONSE_UNREADABLE」은 OpenAI 경로에서는 일어나지 않고 본문 크기 초과로만 같은 코드가 나온다. 설계 문서와 구현이 어긋난다. | 출력 상한 항목에 「OpenAI는 인자가 없으면 질문 수 상한(400)과 본문 상한(256 KiB)으로 묶고, 초과는 JUDGEMENT_RESPONSE_UNREADABLE」을 대안으로 적는다. | New |
| R-09 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/security-design.md > 공급자 호출 > OpenAI 행 | 「요청마다 응답 저장 끔(있으면)」과 「미국이 아니면 켜지 않는다」는 대안 경로가 열려 있어 이번 빌드(저장 끔 인자 없음, `data_residency="us"` 고정)를 설계가 허용한다. 다만 저장 끔이 없을 때 남는 위험(공급자의 기본 보관 최대 30일)을 고지 v3에 적는다는 점은 설계에 한 줄도 없고, 빌드 쪽 판단(`generation-judgement.md`, 고지 v3 3절)으로만 있다. 허용 조건이 코드 생성자의 판단에 맡겨져 있다. | 「저장 끔 인자가 없으면 공식 안내의 기본 보관 기간을 확인해 고지 v3와 `generation-judgement.md`에 적고 팀장이 승인한다」를 설계에 명시한다. | New |
| R-10 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/security-design.md > FR10 확인 명령 | 설계는 「공개 저장소 수집」만 말하는데, 만든 명령은 확인 전용 인자 `allow_private_repository`로 비공개 `JminAILab/CatchU`도 모은다. 운영 `live.py`는 이 인자를 넘기지 않고 시험으로 지켜지지만, 이 예외가 보안 설계에 없다. 또 파일은 0o600으로 만들지만 출력 폴더는 기본 권한(`mkdir(parents=True)`)이라 다른 계정이 파일 이름을 볼 수 있다. 폴더 안 비공개 저장소의 줄 원문을 담는 파일의 이름·존재 노출이다. | 보안 설계에 「확인 명령만 비공개 허용, 운영 경로는 넘기지 않는다(시험으로 확인)」를 적고, 출력 폴더를 본인만 열 수 있게(0o700) 만들거나 그렇지 않을 때의 한계를 기록한다. | New |
| R-11 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-design/traceability.json | 위 세 항목이 바뀌면 NFR1.5·NFR1.6 추적 항목의 설계 설명도 맞춰야 한다. 지금은 설계 본문이 구현과 다른 채 추적에는 충족으로 표시되어 있다. | 설계 문서를 고칠 때 추적의 해당 항목을 함께 갱신한다. | New |

> R-06 Not re-checked this round

> R-07 Not re-checked this round

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 정적 대조(설계 ↔ code-summary) | 성능(생성 45+20, 재료 20+45+20, 호출 300번씩), 관측(`aiDropReasons`·`materialJudgementReasons` 건수만), 신뢰성(실패 코드 셋·재시도 없음), 확장성(질문 400) 모두 구현과 일치 | 이 네 문서는 변경 없이 유효하다 |
| 코드 대조(`worker/app/processing/collection_file.py`, `confirm.py`) | 파일은 `O_EXCL`+0o600, 폴더는 `mkdir(parents=True, exist_ok=True)`, `allow_private_repository=True`는 `confirm.py`에서만 | 위 세 번째 Minor를 뒷받침한다 |
| 실행한 시험 | 없음(code-summary의 오케스트레이터 재실행 결과 worker 655 passed 등을 인용만 함) | 이 단계는 설계 검토라 시험을 새로 돌리지 않았다 |

### Summary

성능·확장성·신뢰성·관측 설계는 만든 코드와 맞고 Critical·Major는 없다. OpenAI에 저장 끔·출력 토큰 상한 인자가 없는 경우의 대안, FR10 비공개 수집 예외, 출력 폴더 권한은 설계에 적혀 있지 않아 Minor로 남기며, 구현 가능성을 막지 않아 READY로 본다.
