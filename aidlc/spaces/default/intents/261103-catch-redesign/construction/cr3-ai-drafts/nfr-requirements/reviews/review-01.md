## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06T01:11:49Z
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

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 직접 대조(BR1.1·BR1.4·BR2.6·BR8.1, worker/app/consumer/settings.py SECRET_ENV, limits.py) | 위 두 Major 외 참조 일치 | NFR2.2·2.3의 20초·300번은 limits.py 값과 맞고, 비밀 환경변수 제거 방식도 기존 SECRET_ENV와 같다. 이 단계에 정의된 검증 도구는 따로 실행하지 않았다. |

### Summary

물려받은 NFR1~NFR7은 추적표에서 빠짐없이 덮이고 수치도 기능 설계와 맞는다. 다만 공급자를 CLAUDE로 둘 때의 끄기와 고지 순서가 비어 있어, 코드 생성 전에 이 두 가지를 보완하면 구현할 수 있다. Major 2건이라 기준상 READY이나 이 둘은 반드시 반영해야 한다.
