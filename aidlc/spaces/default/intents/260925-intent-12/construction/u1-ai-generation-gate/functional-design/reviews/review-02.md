## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-27T01:38:40Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/rules.md > BR1.4, BR4.1; entities.md > CitationLine.sourceIndex | entities.md는 `sourceIndex`가 "요청 sources 안 위치 = 인용 문서 번호와 대응"이라고 적는다. 그런데 BR1.4와 W1 3단계는 넘길 줄이 없는 근거(공백뿐인 근거)에는 문서를 만들지 않는다. 앞쪽 근거가 하나라도 빠지면 Claude가 돌려주는 문서 번호가 sources 위치보다 작아진다. BR4.1은 "문서 번호로 근거를 찾고"라고만 적고 어떤 번호 체계인지 정하지 않았다. 구현자가 둘을 같은 번호로 보면 인용이 다른 근거의 위치로 조용히 연결된다. 원문 위치 연결이 틀린 채 통과하는 것이라 이 관문이 막으려는 오류이고, BR4.4로도 걸러지지 않는다. S1~S7 어디에도 빈 근거가 중간에 낀 사례가 없다. | 인용 문서 번호와 sources 위치를 잇는 대응표(문서 번호 → sourceIndex)를 BR1.4/BR4.1에 명시하고, entities.md의 `sourceIndex` 설명을 그에 맞게 고친다. 또는 줄이 없는 근거도 빈 자리 문서로 넘겨 번호를 같게 유지한다. 앞쪽 근거가 비어 있어도 뒤 근거의 인용이 올바른 근거·위치로 연결되는 시나리오를 S2 또는 새 시나리오로 추가한다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/functional-spec.md > 주요 시나리오와 확인 S8; rules.md > BR2.2 | S8은 "출력 상한을 낮춰" 실제 호출 한 번으로 관문 네 가지가 보인다고 하고, 이를 '최소 연결 첫 결과' 승인 자료로 쓴다. 그런데 상한 값이 정해져 있지 않다. 게이트 기본 상한도, 시험용 낮춘 값도, 설정을 어디서 주입하는지도 없다. 상한을 낮추면 잘림 위치를 정할 수 없어서, 항목 중간에서 잘려 항목 하나가 버려지는 경우도 상한 앞에서 모두 끝나 잘림이 없는 경우도 나온다. 반대로 첫 항목 전에 잘리면 `NO_ITEMS`가 된다. 실행마다 결과가 달라질 수 있어 "잘린 마지막 항목이 처리된다"를 승인 판정 기준으로 쓰기 어렵다. 같은 이유로 이 호출 한 번이 인용 보존·위치 연결까지 보인다고 보장되지 않는다. | S8의 합격 판정을 객관적으로 적는다. 예를 들어 인용 항목 1개 이상과 위치 일치를 확인하고, 잘림은 별도로 기록한 응답(S6)이나 상한을 단계적으로 낮춘 여러 호출 중 `droppedCount`가 1 이상인 호출로 증명한다. 게이트 기본 출력 상한의 값 또는 정하는 방법과 시험에서 낮추는 방식(설정 주입 지점)을 BR2.2에 정한다. | Unresolved |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/entities.md > AiProviderError.reason; 요약 | 요약은 "계약의 칸을 늘리거나 바꾸지 않는다"고 하지만 `AiProviderError.reason`(4가지 원인)은 C-01에 없는 칸이다. 같은 요약 끝에 "계약의 오류 이름은 그대로"라고 적었지만, 이 칸을 U2 코드와 C-01 문서가 공유하는지, 로그 전용인지 정해져 있지 않다. 호출 Unit(U5·U10)이 이 칸에 기대면 계약 밖 의존이 생긴다. | `reason`이 U1 내부·로그용인지 C-01에 더하는 선택 필드인지 정한다. 후자라면 계약의 "더하는 변경" 절차(계약 문서 수정, 소비 Unit 담당에게 알림)를 따른다. 요약의 "칸을 늘리지 않는다" 문장도 고친다. | Unresolved |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/rules.md > BR3.4, BR5.5 | '- '로 시작하지 않는 줄은 `droppedCount`에 세지 않고 로그에도 남지 않는다(BR5.5의 기록 항목에 없다). 모델이 `* `나 `1.` 같은 다른 목록 표기를 쓰면 정상 항목이 조용히 사라진다. 그 결과 `NO_ITEMS`가 나오면 원인이 보이지 않고, 일부만 사라지면 아무 신호가 없다. | 항목으로 인정하지 않은 줄 수를 로그에 남긴다. 줄 내용은 남기지 않는다. `droppedCount`에 세지 않는다는 결정은 유지해도 된다. | Unresolved |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/rules.md > BR3.2, BR5.1 | 두 경계가 정해져 있지 않다. (1) 줄바꿈만 있는 조각에 인용이 붙으면 "첫 번째 줄바꿈 아닌 글자"가 없어 어느 줄에도 붙지 않는다. (2) 출력 상한으로 끝났더라도 응답이 항목 줄 끝의 줄바꿈 직전에서 멈추면 완성된 마지막 항목을 끝나지 않은 줄로 보고 버린다. 뒤 줄바꿈이 오기 전에는 완성 여부를 알 수 없어서, 완성된 항목이 버려질 수 있다. 후자는 `droppedCount`로 보이므로 한계로 적는 정도면 충분하다. | (1)은 인용을 버린다고 한 줄로 정한다. (2)는 알려진 한계로 적는다. | Unresolved |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/functional-spec.md > 범위, Assumptions & Open Questions | U1은 숨긴 지시 방어 문구와 입력 상한 없이 `userText`·근거 글을 모델에 보낸다(Q1 A). 이 선택 자체는 승인된 범위이지만, `generate()`가 U2의 방어·상한이 붙기 전에 HTTP 경로나 호출 Unit에 연결될 수 있다는 점은 어디에도 막혀 있지 않다. 호출 시간 제한 값도 BR2.4가 "시간 초과"를 말하면서 정하지 않았다. | U2가 방어 문구와 입력 상한을 붙이기 전에는 `generate()`를 시험과 S8 밖(API 경로, 호출 Unit)에서 쓰지 않는다는 조건을 한 줄 더한다. 호출 시간 제한을 이 Unit이 정할지 호출 Unit의 시한에 맡길지도 적는다. | Unresolved |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/traceability.json > coverage AC6.3.5 | functional-spec.md 추적 표는 AC6.3.5의 대응 규칙을 BR1.3, BR4.1, BR4.4로 적는데, traceability.json은 BR4.1, BR4.4만 적는다. 위치 계산이 BR1.3(줄 UTF-16 위치)에 의존하므로 JSON이 빠져 있다. | traceability.json의 AC6.3.5 target에 BR1.3을 더해 두 문서를 맞춘다. | Unresolved |
| R-08 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/traceability.json > coverage AC6.3.1 | 이 항목은 BR1.4를 포함하지만, functional-spec.md 추적 표의 AC6.3.1 규칙 열은 BR1.1~BR1.3, BR2.3, BR3.1, BR3.2, BR4.2, BR4.3으로 BR1.4가 없다. 두 문서의 대응이 다르다. | functional-spec.md 추적 표의 AC6.3.1 규칙 열에 BR1.4를 더해 JSON과 맞춘다. 또는 둘 중 한쪽을 기준으로 정한다. | New |

> R-01 Reviewer note: BR1.4가 문서 번호 → 근거 대응표를 만들도록 정했고, BR4.1이 그 표로 근거를 찾는다. entities.md에 CitationDocument가 생겼고 sourceIndex 설명도 고쳐졌다. 빈 근거가 앞에 낀 사례는 S9로 추가되었다.

> R-02 Reviewer note: S8 합격 기준이 모양 기준(①~⑤)으로 바뀌었고, 시험 상수로 상한을 낮추며 상한 전에 끝나면 다시 돌리도록 했다. Major 사유는 해소되었다. 다만 BR2.2의 "게이트를 만들 때 주는 설정"은 기본 상한 값이나 정하는 방법을 아직 적지 않았다. 구현자가 임의로 정하게 된다.

> R-03 Reviewer note: entities.md 요약은 여전히 "계약의 칸을 늘리거나 바꾸지 않는다"고 적으면서 `AiProviderError.reason`을 둔다. 로그 구분용이라는 설명은 추가되었으나, C-01에 더하는 선택 필드인지 U1 내부 값인지 정해져 있지 않다.

> R-04 Reviewer note: BR3.4는 변하지 않았다. '- '로 시작하지 않는 줄은 세지도 않고 BR5.5의 기록 항목에도 없다. 다른 목록 표기 때문에 항목이 사라져도 신호가 없다.

> R-05 Reviewer note: BR3.2(줄바꿈뿐인 조각에 붙은 인용)와 BR5.1(항목 줄 끝 줄바꿈 직전에서 멈춘 응답)의 경계가 정해지지 않았다.

> R-06 Reviewer note: U2의 방어 문구·입력 상한이 붙기 전에는 `generate()`를 시험과 S8 밖에서 쓰지 않는다는 조건이 없다. 호출 시간 제한 값과 그 주체도 BR2.4에 정해지지 않았다.

> R-07 Reviewer note: traceability.json의 AC6.3.5 대상은 여전히 "BR4.1, BR4.4"다. functional-spec.md 추적 표는 BR1.3, BR4.1, BR4.4다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (none declared) | 해당 없음 | 이 stage에는 검증 도구가 선언되어 있지 않다. 대신 rules.md, entities.md, functional-spec.md, traceability.json의 규칙 ID와 엔티티 이름을 서로 대조했고, 끊긴 참조는 없었다. |

### Summary

핵심 위험이던 문서 번호와 sources 위치의 불일치(R-01)는 대응표와 S9로 해소되었다. S8도 모양 기준으로 바뀌어 승인 자료로 쓸 수 있다. 남은 항목은 모두 Minor이며 승인을 막지 않는다. 승인 전에 R-02(기본 출력 상한)와 R-06(`generate()`를 쓸 수 있는 범위와 호출 시간 제한)을 정하는 것이 좋다.
