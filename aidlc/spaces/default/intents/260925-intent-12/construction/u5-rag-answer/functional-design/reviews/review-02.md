## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-30T06:17:45Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md > BR4.1 (그리고 functional-spec.md > W2, 「다른 Unit에 넘기는 것」 U2·U1 항목) | 질문 다시 쓰기는 게이트(C-01)를 거치지 않고 "AiGeneration의 Claude 연결 설정(API 키)"을 직접 쓴다고 하면서 "계약 변경 요청은 없다"고 적었다. 그런데 C-01이 공개한 것은 `generate`·`generateStream` 둘뿐이고 Claude 클라이언트나 연결 설정은 계약에 없다. 그러면 U5가 U1·U2의 비공개 내부 모듈에 기대게 되어, 합성 제공자로 먼저 개발하는 방식(납품 계획 B8)으로는 이 호출을 시험할 수 없다. 호출 시간 제한과 실패 종류(AiProviderError 여부)도 정해져 있지 않다. 이 호출은 게이트의 공통 방어 문구·기계 대조도 받지 않는다. 앞 대화는 신뢰할 수 없는 입력인데, 그 결과가 검색어이자 생성 `userText`가 된다. 가정으로만 적혀 있다. | (1) 다시 쓰기가 무엇을 통해 Claude를 부르는지 정한다. U2가 계약 없이 쓰게 둔 클라이언트 주입 자리를 밝히거나, 더하는 변경으로 계약에 그 자리를 요청한다. (2) 그 호출의 시간 제한과 실패 종류를 적고, 합성 제공자로 시험하는 방법을 적는다. (3) 방어 문구를 U5가 직접 붙이는지, 앞 대화의 지시가 검색어를 오염시키는 경우를 어떻게 받아들이는지 가정 절에 분명히 적는다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md > BR10.7 (그리고 functional-spec.md > W7 6단계, 「다른 Unit에 넘기는 것」 U3 항목) | 평가 스크립트의 "전체 넣기"가 U3의 `published_chunk`를 `seq` 순서로 직접 읽는다. C-09에는 조각 목록을 주는 함수가 없고, U3 명세의 「다른 Unit에 넘기는 것」에도 U5의 직접 읽기는 적혀 있지 않다. 그런데 U5 명세는 U3에 "계약 변경 요청은 없다"고 적었다. C-07은 U5가 발행본 표를 직접 쿼리하지 않는다고 했다. `search`의 `publicationText`는 조각 글 전체를 이어 주지만 위치(location)는 없다. | 직접 읽기를 계속 쓸 거면 U3 담당에게 평가용 읽기 전용 사용을 알리고 U3의 넘기는 것 목록에 올린다. 아니면 `search`로 `limit` 50개를 받은 조각과 `publicationText`로 전체 넣기를 구성해 표를 건드리지 않는 방법을 검토한다. 어느 쪽이든 CI 밖 일회성 스크립트라는 범위를 명세에 적는다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md > BR7.2, entities.md > BaseSummary entity_constraints | [다시 만들기]는 `DONE` 행도 바로 `PENDING`, `items = []`로 바꾼다. 그래서 잘 만들어진 요약이 있어도 작성자가 누르는 순간 받은 사람에게는 "만드는 중"으로 바뀐다. 재생성이 실패하면 기존 요약은 사라지고 하루 횟수만 줄어든다. C-02가 [다시 만들기]를 PENDING으로 쓴다고 정했으므로 계약과는 맞다. 그러나 이 결과를 작성자가 알고 누르는지는 명세에 없다. | 이 동작을 한계로 가정 절에 적는다. 최소한 [다시 만들기] 버튼 근처에 "기존 요약이 지워지고 새로 만드는 동안 받은 사람에게 보이지 않는다"는 안내를 둘지 정한다. 이전 요약을 보존하는 안은 칸이 늘어나므로 포트폴리오 범위에서는 안내 쪽을 권한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md > BR5.1, BR5.5 | 기본 요약은 사본 필드를 전부 근거로 넣고 자르지 않는다. 합이 80,000자를 넘으면 `AiInputTooLarge`로 `FAILED`가 되고, [다시 만들기]를 눌러도 같은 결과로 하루 횟수만 쓴다. 요구사항 「개발 담당 결정」은 "정상 링크가 AI 입력 상한 안에 들도록" U4가 발행 크기 상한을 정한다고 했다. 그러나 U5 명세는 이 의존을 가정으로 적지 않았고, 게이트가 세는 80,000자에 지시문이 들어가는지도 쓰지 않았다. | 가정 절에 "U4의 발행 크기 상한이 근거 글 합 80,000자 안에 들도록 정해진다"를 적고, 통합 때 확인할 항목으로 올린다. 상한이 그보다 크면 U4와 조율한다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md > BR4.1, BR4.7 | `QuestionRewriter` 실제 구현이 게이트 밖에서 SDK를 직접 부르므로 두 가지가 정해지지 않았다. (1) BR4.7의 HAIKU·SONNET 설정을 SDK 모델 ID로 옮기는 곳이 게이트와 같은 값을 쓰는지, (2) 게이트는 키가 비면 만들지 않는데 `QuestionRewriter`는 키가 비었을 때 어떻게 하는지(기동 때 판정인지, 첫 호출 때 `ANSWER_FAILED`인지). 구현자가 추측해야 한다. | 코드 착수 때 확인할 항목으로 가정 절에 한 줄 적는다. 모델 ID는 게이트가 쓰는 값을 재사용하고, 키가 비면 게이트와 같은 기동 판정을 따르도록 정한다. 막는 결함은 아니다. | New |

> R-01 Reviewer note: BR4.1·W2·「다른 Unit에 넘기는 것」 U2·U1 항목이 같은 내용으로 맞는다. U5 소유 `QuestionRewriter`와 자체 주입 토큰, `@anthropic-ai/sdk`와 `CATCHU_GENERATION_API_KEY`(ai-generation.gate.ts 21·39행에서 확인), 합성 구현으로 시험, 10초 제한, 모든 실패를 `ANSWER_FAILED` error 하나로 끝냄(BR4.6), 재시도 없음, 지시문에 앞 대화 지시 무시를 넣음, C-01 변경 없음이 모두 적혀 있다. 검색어 오염은 가정 절과 BR1.3에 한계로 적혔다.

> R-02 Reviewer note: BR10.7·W7 6단계·U3 항목·가정 절에 CI 밖 일회성 스크립트의 읽기 전용 사용으로 범위가 일관되게 적혔고, U3 문서를 고치지 않는 이유(담당 동일)도 적혔다.

> R-03 Reviewer note: 가정 절 한계 항목에 DONE 요약이 PENDING으로 바뀌고 실패 시 기존 요약이 사라진다는 점, 안내 문구를 두지 않는다는 결정이 적혔다.

> R-04 Reviewer note: 가정 절과 U4 항목에 U4 발행 크기 상한 의존, 80,000자에 지시문이 들지 않는다는 점, 통합 확인 항목이 적혔다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json 수동 대조 | PASS | coverage 대상 BRx.y가 모두 rules.md에 있고, rules.md의 모든 규칙이 coverage 대상 또는 reverse(BR8.3·BR9.2)에 있다. |
| 다른 Unit 규칙 인용 형식 | PASS | rules.md는 다른 Unit 규칙을 `BRx.y` 형식으로 인용하지 않고 「U2 게이트 규칙 3.x」·「U3 Q4」로 적는다. |
| 게이트 키 이름 확인 | PASS | `api/src/ai-generation/ai-generation.gate.ts`가 `CATCHU_GENERATION_API_KEY`를 쓴다. |

### Summary

사람이 정한 네 가지 해결이 rules.md, functional-spec.md, 가정 절에 서로 어긋남 없이 반영됐고 추적 대응도 맞는다. 남은 것은 `QuestionRewriter`의 모델 ID와 키 누락 처리를 적는 Minor 한 건이며, 구현자가 막힐 정도는 아니다.
