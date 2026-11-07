## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-requirements/reliability-requirements.md > 확인 사항 (끄는 방법), NFR3.1 | 「끄는 방법은 판정 키를 비우는 것」, 「못 넘으면 판정 키를 넣지 않은 채 합친다」는 공급자가 OPENAI일 때만 맞다. 기능 설계 BR1.1은 CATCHU_JUDGEMENT_PROVIDER=CLAUDE이면 기존 생성 키(worker 기동에 필수인 CATCHU_GENERATION_API_KEY)로 켜진다고 하므로, CLAUDE로 설정된 서버에서는 키를 비워도 끌 수 없다. 판정 공급자가 오래 멈출 때의 유일한 끄기 수단이 이 경우 없다. | 끄는 방법을 공급자별로 다시 쓴다. 예를 들어 운영 설정은 OPENAI 고정에 키 없음으로 끄고 CLAUDE는 시험용으로만 쓴다고 못박거나, CLAUDE일 때 끄는 설정을 하나 정한다. NFR3.1의 「키를 넣지 않은 채 합친다」도 같은 범위로 고친다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-requirements/security-requirements.md > NFR5.3, NFR1.5 | 고지 v3 전에는 서버에 판정 키를 넣지 않는다는 조건(NFR5.3)이 OpenAI 키에만 걸려 있다. 그런데 CLAUDE 공급자는 기존 키로 바로 켜지고, 이때 기록의 글(본인 PR 제목·커밋 첫 줄)이 처음 Anthropic으로 간다. 고지 v2는 바뀐 줄만 보낸다고 적고 있으므로(BR8.2는 공급자가 Claude면 고지에 적는다고 함), 공급자가 CLAUDE이면 v3 없이 새 항목이 외부로 나간다. 이 길을 막는 요구사항이 없다. | NFR5.3을 「공급자와 관계없이 판정 호출이 켜지는 배포(OPENAI 키 투입 또는 CLAUDE 지정)는 고지 v3 배포 뒤에만」으로 넓히고, 확인 방법에 배포 안내의 같은 줄을 적는다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-requirements/security-requirements.md > NFR1.5 | 「응답 저장 끔 설정이 있으면 켜고」는 조건부 문장이라, 설정이 없거나 쓰지 못할 때 어떻게 하는지 정해져 있지 않고 시험도 통과 기준이 모호하다. | 사용할 SDK 호출에서 그 설정이 있는지 코드 생성 전에 확인해, 있으면 필수로, 없으면 고지 문구로만 알린다고 한 줄로 확정한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-requirements/performance-requirements.md > NFR2.2·확인 사항 | 분석 전체 시간에 숫자 목표가 없다. 최악의 경우(생성 호출에 판정 호출이 더해짐) 마감 3,600초 안에서 어떤 Catch가 판정을 못 받는지 순서(Catch마다 생성 직후 판정인지, 생성을 모두 마친 뒤 판정인지)가 요구사항에 없어, 마감 근처에서 이미 생성한 초안이 버려지는 규모가 달라진다. | 판정 시점의 순서를 한 줄로 정하거나 기능 설계 문서를 가리키고, FR10 확인에서 잰 전체 시간으로 마감 여유를 판단하는 기준을 적는다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-requirements/scalability-requirements.md > 동시 분석 | 요청당 판정 최대 600번에 worker 동시 처리 수를 곱한 호출량과 OpenAI 사용량 한도·비용을 확인 때 본다고만 하고, 비용 추정이나 한도에 닿을 때(429)의 동작을 적지 않았다. 실패 코드는 있으나 한도 초과가 어느 코드인지도 불분명하다. | 시작 값으로 예상 호출 수·비용 규모를 한 줄 적고, 429가 JUDGEMENT_CALL_FAILED로 처리됨을 명시한다. | New |
| R-06 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-requirements/security-requirements.md > NFR1.5 확인 방법 | 문장 본문은 「저장 끔 설정이 없으면 그대로 보내고 고지에 적는다」로 대안을 이미 덮는다. 그러나 확인 방법 칸은 여전히 「어댑터 시험: 요청에 저장 끔 설정이 있다」다. OpenAI Decisions 요청에는 그 인자가 없어(code-summary 「계획과 다른 점」 1) 이 시험은 둘 수 없었고, 실제로는 요청 본문이 `model`·`input`·`questions`뿐이라는 시험으로 바뀌었다. 확인 방법이 구현과 어긋난다. 「고지 v3 3절」도 실제 고지의 절 위치와 맞는지 적혀 있지 않다. | 확인 방법을 「요청 본문이 허용 칸뿐이고 저장 끔 인자는 없다 + 고지 v3에 기본 보관(남용 감시 기록 최대 30일)이 적혀 있다」로 고친다. 절 번호는 「고지 v3」 이름으로만 가리킨다. | New |
| R-07 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-requirements/tech-stack-decisions.md > 기술 선택 표 OpenAI 판정 호출 | 「요청마다 저장 끔」을 Claude 어댑터와 같은 규칙으로 쓴다고 적혔으나 SDK에 인자가 없어 구현되지 않았다. 출력 크기도 실제로는 질문 400개와 응답 본문 256 KiB로 묶고, 미국 처리는 클라이언트 `data_residency`로 한다. 표가 구현과 어긋난다. | 저장 끔을 「SDK에 없어 못 쓴다, 기본 보관을 고지에 적는다」로 고치고 미국 처리 방식(`data_residency`)을 적는다. | New |
| R-08 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-requirements/security-requirements.md > NFR1.6 | 비공개 저장소 수집은 확인 명령에서만 허용한다는 경계(`allow_private_repository`, 기본 거짓, 운영 `live.py`는 넘기지 않음)가 NFR에 없다. 이 경계는 코드와 시험에만 있다. NFR1~NFR5 어느 것도 이 변경과 모순되지는 않는다(NFR1.6은 처음부터 비공개 저장소 코드 줄을 확인표에 담는다고 적었다). | NFR1.6에 「비공개 저장소 수집은 FR10 확인 명령만 허용하고 운영 LIVE 처리는 공개 저장소만 모은다(운영 경로 시험으로 확인)」를 한 줄 더한다. | New |
| R-09 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/nfr-requirements/performance-requirements.md > NFR2.2 | NFR2.2는 「남은 시간이 20초보다 짧으면 판정을 보내지 않는다」만 적는다. 구현은 생성을 「남은 시간 ≥ 45초+20초」, 재료 판정을 「≥ 20+45+20초」일 때만 시작한다. 판정 몫을 미리 남기는 순서는 NFR에 없어, 마감 가까이에서 어떤 Catch가 판정을 못 받는지 기준이 NFR만으로는 안 나온다. | NFR2.2에 판정 몫을 미리 확인하는 순서(재료 판정 → 생성 → Catch 판정, 각 시작 조건)를 한 줄 적거나 기능 설계를 가리킨다. | New |

> R-01 Not re-checked this round

> R-02 Not re-checked this round

> R-03 Not re-checked this round

> R-04 Not re-checked this round

> R-05 Not re-checked this round

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 직접 대조: worker/app/generation/limits.py | `judgement_timeout_seconds = 20.0`, 요청당 판정 상한 300 | NFR2.2·2.3 수치와 맞는다. |
| 직접 대조: claude.py | `max_retries=0` | NFR2.5의 「SDK 다시 시도 끔」과 맞는다. |
| code-summary 대조: FR10 | 재료 판정 가장 긴 것 2.4초, 분석 TheMe 34.8초·algo-problem 28.8초 | NFR2.2(20초)와 3,600초 마감 안이다. 질문 수가 400에 가까운 경우는 확인표에 남지 않아(한계 3) 최악 경우는 아직 모른다. |
| 점검 항목: NFR5.3 | 고지 v3 배포 뒤에만 `CATCHU_JUDGEMENT_API_KEY`와 `CATCHU_JUDGEMENT_PROVIDER=claude`를 넣는다 | 결정이 그대로이고 code-summary 「운영에 켤 때」와 일치한다. |
| 점검 항목: NFR1.6 / 확인 명령 | 비공개 `JminAILab/CatchU` 수집은 확인 명령만 쓰고, 확인표는 저장소 밖에 쓰며 저장소 안 경로는 바로가기까지 거부한다 | 어느 NFR과도 모순되지 않는다. 위 Minor는 경계를 문서에 올리자는 것이다. |

### Summary

NFR 문서는 변경 없이도 여전히 유효하고 Critical·Major는 없다. NFR1.5의 대안(저장 끔이 없으면 그대로 보내고 고지에 기본 보관을 적음)은 본문이 이미 덮어 구현과 맞는다. 다만 NFR1.5의 확인 방법과 기술 선택 표가 만들어진 결과(저장 끔 인자 없음)와 어긋나므로, 문서 정리 차원에서 Minor 네 건을 고치면 좋다.

READY
