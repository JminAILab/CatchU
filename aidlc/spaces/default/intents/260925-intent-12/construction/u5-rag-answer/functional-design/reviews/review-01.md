## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-30T05:44:29Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md > BR4.1 (그리고 functional-spec.md > W2, 「다른 Unit에 넘기는 것」 U2·U1 항목) | 질문 다시 쓰기는 게이트(C-01)를 거치지 않고 "AiGeneration의 Claude 연결 설정(API 키)"을 직접 쓴다고 하면서 "계약 변경 요청은 없다"고 적었다. 그런데 C-01이 공개한 것은 `generate`·`generateStream` 둘뿐이고 Claude 클라이언트나 연결 설정은 계약에 없다. 그러면 U5가 U1·U2의 비공개 내부 모듈에 기대게 되어, 합성 제공자로 먼저 개발하는 방식(납품 계획 B8)으로는 이 호출을 시험할 수 없다. 호출 시간 제한과 실패 종류(AiProviderError 여부)도 정해져 있지 않다. 이 호출은 게이트의 공통 방어 문구·기계 대조도 받지 않는다. 앞 대화는 신뢰할 수 없는 입력인데, 그 결과가 검색어이자 생성 `userText`가 된다. 가정으로만 적혀 있다. | (1) 다시 쓰기가 무엇을 통해 Claude를 부르는지 정한다. U2가 계약 없이 쓰게 둔 클라이언트 주입 자리를 밝히거나, 더하는 변경으로 계약에 그 자리를 요청한다. (2) 그 호출의 시간 제한과 실패 종류를 적고, 합성 제공자로 시험하는 방법을 적는다. (3) 방어 문구를 U5가 직접 붙이는지, 앞 대화의 지시가 검색어를 오염시키는 경우를 어떻게 받아들이는지 가정 절에 분명히 적는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md > BR10.7 (그리고 functional-spec.md > W7 6단계, 「다른 Unit에 넘기는 것」 U3 항목) | 평가 스크립트의 "전체 넣기"가 U3의 `published_chunk`를 `seq` 순서로 직접 읽는다. C-09에는 조각 목록을 주는 함수가 없고, U3 명세의 「다른 Unit에 넘기는 것」에도 U5의 직접 읽기는 적혀 있지 않다. 그런데 U5 명세는 U3에 "계약 변경 요청은 없다"고 적었다. C-07은 U5가 발행본 표를 직접 쿼리하지 않는다고 했다. `search`의 `publicationText`는 조각 글 전체를 이어 주지만 위치(location)는 없다. | 직접 읽기를 계속 쓸 거면 U3 담당에게 평가용 읽기 전용 사용을 알리고 U3의 넘기는 것 목록에 올린다. 아니면 `search`로 `limit` 50개를 받은 조각과 `publicationText`로 전체 넣기를 구성해 표를 건드리지 않는 방법을 검토한다. 어느 쪽이든 CI 밖 일회성 스크립트라는 범위를 명세에 적는다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md > BR7.2, entities.md > BaseSummary entity_constraints | [다시 만들기]는 `DONE` 행도 바로 `PENDING`, `items = []`로 바꾼다. 그래서 잘 만들어진 요약이 있어도 작성자가 누르는 순간 받은 사람에게는 "만드는 중"으로 바뀐다. 재생성이 실패하면 기존 요약은 사라지고 하루 횟수만 줄어든다. C-02가 [다시 만들기]를 PENDING으로 쓴다고 정했으므로 계약과는 맞다. 그러나 이 결과를 작성자가 알고 누르는지는 명세에 없다. | 이 동작을 한계로 가정 절에 적는다. 최소한 [다시 만들기] 버튼 근처에 "기존 요약이 지워지고 새로 만드는 동안 받은 사람에게 보이지 않는다"는 안내를 둘지 정한다. 이전 요약을 보존하는 안은 칸이 늘어나므로 포트폴리오 범위에서는 안내 쪽을 권한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md > BR5.1, BR5.5 | 기본 요약은 사본 필드를 전부 근거로 넣고 자르지 않는다. 합이 80,000자를 넘으면 `AiInputTooLarge`로 `FAILED`가 되고, [다시 만들기]를 눌러도 같은 결과로 하루 횟수만 쓴다. 요구사항 「개발 담당 결정」은 "정상 링크가 AI 입력 상한 안에 들도록" U4가 발행 크기 상한을 정한다고 했다. 그러나 U5 명세는 이 의존을 가정으로 적지 않았고, 게이트가 세는 80,000자에 지시문이 들어가는지도 쓰지 않았다. | 가정 절에 "U4의 발행 크기 상한이 근거 글 합 80,000자 안에 들도록 정해진다"를 적고, 통합 때 확인할 항목으로 올린다. 상한이 그보다 크면 U4와 조율한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json 대조 (직접 확인) | PASS | coverage 대상의 BR 번호가 모두 rules.md에 있다. rules.md의 BR1.1~BR10.7 전부가 coverage 대상 또는 reverse(BR8.3, BR9.2)에 있다. upstream_ids 21개가 stories.md의 AC4.2.1~7, AC6.2.1~8, AC19.3.1~6과 일치한다. |
| 센서 (required-sections, upstream-coverage, linter, type-check, traceability) | 실행하지 않음 | 지시에 따라 센서는 자동 실행에 맡겼다. 이 검토의 근거는 수작업 대조뿐이다. |

### Summary

C-01·C-02·C-03·C-09·C-10·C-11·C-12와 U2 BR3.1·BR3.7, U3 명세에 대해 상태 전이·접근 순서·늦은 결과 처리·횟수 계산이 서로 맞고 추적 대응도 빠짐이 없다. 구현자가 질문 없이 만들 수 있는 수준이다. 가장 큰 걸림은 질문 다시 쓰기가 계약에 없는 Claude 연결을 직접 쓴다는 점(Major 1건)이라, 승인 전에 호출 경로와 시험 방법을 정하는 것이 좋다. 나머지 세 건은 Minor이며 승인을 막지 않는다.
