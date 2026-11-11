## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06T00:47:10Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/functional-design/rules.md > BR2.5, BR3.4, BR4.1 | 판정 호출은 성공했지만 RECORD_WHAT 답만 빠진 경우를 제목과 작업 사실 둘째 줄이 다르게 처리한다. BR2.5는 빠진 답을 0.5 미만(부실)으로 보고 BR3.4는 그 기록의 글을 제목에서 뺀다. 그러나 BR4.1은 "답이 없으면 지우지 않는다"고 하여 같은 기록의 글이 둘째 줄에는 남는다. CR1 BR2.7은 "둘째 줄과 제목의 판단이 서로 다르면 결함"이라고 못 박았고, FR6.2도 둘째 줄의 기준을 제목과 같은 부실 판단으로 둔다. 결과적으로 제목은 AI 후보나 조각 제목인데 작업 사실에는 부실로 본 바로 그 글이 실리는 Catch가 생긴다. | 빠진 RECORD_WHAT 답을 제목과 둘째 줄 양쪽이 같은 방식으로 다루게 규칙을 하나로 맞춘다. 예를 들어 둘 다 부실로 보고 둘째 줄도 지우거나, 둘 다 판정 없음으로 보고 기록의 글을 제목에 쓴다. 그에 맞춰 BR2.5의 간주 문장과 BR4.1의 예외 문장을 고치고 시나리오 하나(답 일부 누락)를 추가한다. RECORD_WHOLE 답이 빠진 경우도 BR2.5 표에 넣는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/functional-design/rules.md > BR2.1, BR2.2, BR3.5; functional-spec.md > W4, 상태 | 생성 호출이 실패하거나 건너뛴 Catch(재료 없음, 시간·호출 한도 소진, 전체 호출 실패)에서 Catch 판정을 보내는지 정해져 있지 않다. BR2.1은 "생성 응답을 받은 뒤"에 보낸다고 하고 상태도는 생성 실패를 판정 없이 FAILED·NOT_GENERATED로 끝내지만, W4는 질문(RECORD_WHAT·RECORD_WHOLE)을 후보의 기록의 글만으로 만들 수 있다. BR3.5는 "판정 요청이 실패했을 때"만 다룬다. 그래서 응답이 없는 Catch의 기록의 글 제목이 FR5.3의 판정을 거치는지 알 수 없다. 또 BR2.2는 생성과 같은 마감 확인을 따른다고 하지만, 남은 시간이 모자라 판정을 시작하지 못할 때의 결과(JUDGEMENT_TIMEOUT인지, 판정 없음으로 BR3.5를 따르는지)와 판정 호출의 시간 제한 값이 없다. 요청당 생성 호출 300회 한도는 실제로 일어나는 경로다. | W4와 BR2.1에 생성 응답이 없는 Catch의 처리를 정한다(판정을 보내는지, 보낸다면 질문 종류와 제목·둘째 줄의 결과). 마감이 모자라 판정을 못 보낸 경우를 BR3.5·BR5.4와 같은 모양으로 적고 판정 호출의 시간 제한을 정하거나 어디서 정하는지 적는다. 상태도에 이 경로를 더하고 시나리오를 추가한다. | Resolved (reviewer) |
| R-03 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/functional-design/rules.md > BR2.3, BR6.1; entities.md > MaterialJudgementRequest.files | 재료 판정 요청의 자료 출처와 가리기가 정해져 있지 않다. BR2.3은 재료 판정에도 적용되면서 판정 입력의 바뀐 줄을 "그 Catch의 생성 요청에 담긴 것과 같다(가린 줄 제외)"로 정의하는데, 재료 판정은 생성 전(W2)에 나가서 그 생성 요청이 아직 없다. 순환이다. 또 BR6.1과 entities는 큰 PR의 바뀐 파일 전부(산출물·잠금 파일·설정 파일 포함)의 "앞 5줄"을 보낸다고만 적고 비밀값 가리기 검사를 거치는지 말하지 않는다. 가리기 없이 `.env`류 파일의 앞 줄이 외부 공급자(OpenAI 또는 Anthropic)로 나가면 NFR1·NFR5와 Construction 보안 규칙에 어긋난다. | 재료 판정 요청의 앞 5줄이 어느 줄(바뀐 줄인지)이고 어디서 오는지 정한다. 생성 요청과 같은 가리기 검사를 통과한 줄만 넣고, 가린 줄이면 줄 없이 경로·상태·줄 수만 보낸다고 BR6.1과 entities.md에 적는다. BR2.3의 "생성 요청에 담긴 것과 같다"는 Catch 판정에만 걸고 재료 판정용 문장을 따로 둔다. 가린 줄이 요청에 없다는 시험을 S8에 더한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/functional-design/rules.md > BR3.2 | RECORD_WHOLE를 묻는 조건 "단위의 본인 커밋이 2개 이상"의 입력이 어디서 오는지 적혀 있지 않다. CR1 RecordText에는 종류·글·부실 여부만 있고 커밋 수가 없으며, 결과 메시지의 `ownCommitShas`는 CR2가 나중에 더한다. 지금 worker에는 `CandidateMaterial.own_commits`(근거 20건 밖 포함)가 있다. | 커밋 수를 읽는 칸을 명시하고(예: `CandidateMaterial.own_commits`의 크기), CR1 접점 모양을 바꾸지 않는다는 6절 문장과 맞는지 확인해 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/functional-design/rules.md > BR3.4, BR5.2; entities.md > JudgementAnswer.choiceProbabilities | TITLE_CHOICE의 확률이 합이 1인 분포인지 후보마다 독립인지, 0.9 이상이 둘 이상이거나 NONE이 0.9 이상일 때 무엇을 쓰는지 정해져 있지 않다. Claude 판정이 확률을 어떻게 내는지(공급자별 답 변환)도 없어 BR1.2의 "같은 질문 집합"을 시험할 기준이 약하다. | TITLE_CHOICE의 동점·다중 통과·NONE 처리 규칙을 한 줄로 정하고, 두 공급자 어댑터가 답을 JudgementAnswer로 바꾸는 방식을 NFR 설계로 넘긴다고 적는다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/functional-design/entities.md > JudgementQuestion; functional-spec.md > 상태 | JudgementQuestion에 질문이 가리키는 대상(후보 id, 문장 id, 파일 경로)이 없어 답을 MaterialVerdict·문장 판정에 되돌려 연결할 수 없다. 또 생성 응답에서 문장 칸이 없거나 모양이 틀린 경우(지금 코드는 설명 부분 FAILED)가 문장이 모두 떨어진 경우(NOT_GENERATED)와 구분되지 않고, 상태도에도 없다. | JudgementQuestion에 대상 칸을 더하고, 문장 칸 자체가 비었거나 읽을 수 없을 때의 상태(FAILED 또는 NOT_GENERATED)와 실패 코드를 BR5에 적는다. | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/functional-design/rules.md > BR2.5, BR3.4 1) | RECORD_WHOLE 답만 빠진 경우(RECORD_WHAT 답은 있음)에 BR3.4 1)의 「전체 미달도 아니면」이 어떻게 읽히는지 적혀 있지 않다. BR2.5는 「판정 없음」으로 본다고만 한다. 시나리오도 없다. | BR3.4 1)에 「RECORD_WHOLE 답이 없으면 전체 미달이 아닌 것으로 본다」 한 줄을 더하고, S26 옆에 RECORD_WHOLE 답만 빠진 시나리오를 추가한다. 코드 생성 단계에서 정해도 되는 작은 보완이다. | New |

> R-01 Reviewer note: BR2.5가 RECORD_WHAT·RECORD_WHOLE 답이 빠진 경우를 모두 「판정 없음」으로 정하고, BR3.5·BR4.1이 같은 기록의 글을 제목과 둘째 줄에서 같은 방식으로 다룬다. S26이 시나리오로 추가됐다. 다만 RECORD_WHOLE 답만 빠진 경우의 시나리오는 없다(아래 새 지적).

> R-02 Reviewer note: BR2.6과 W4 5번이 생성 응답이 없는 Catch와 마감 부족 경우를 나누어 적었다. 마감 부족은 NOT_GENERATED와 GENERATION_BUDGET_EXHAUSTED 1건으로 정했고, 판정 시간 제한 20초와 호출 상한 300번도 정했다. 상태도와 S27·S28이 있다.

> R-03 Reviewer note: BR6.1이 재료 판정 입력의 출처를 CR1 W3와 같은 자료로 정하고, 앞 5줄에 가리기 검사를 건다. BR2.3은 Catch 판정과 재료 판정을 나누어 적었다. S29가 시험으로 있다.

> R-04 Reviewer note: BR3.2가 `CandidateMaterial.own_commits`를 읽는다고 적었다. 이 칸은 worker/app/generation/material.py에 실제로 있다(frozenset).

> R-05 Reviewer note: BR3.4가 고르기 확률 합이 1이라 0.9 이상은 많아야 하나이고 NONE이 이기면 AI 후보를 쓰지 않는다고 정했다. BR1.2가 Claude 답을 합 1로 맞추는 방식을 정했다. S31이 있다.

> R-06 Reviewer note: JudgementQuestion에 target 칸이 생겼고, BR5.1이 문장 칸이 없거나 모양이 틀린 응답을 GENERATION_RESPONSE_UNREADABLE(FAILED)로 정했다. S30이 있다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json 대조(BR·S 참조 검사) | rules.md의 모든 BR이 참조되고 S 번호도 모두 풀림. BR2.7·BR5.6만 rules.md에 없음 | 두 ID는 CR1 규칙(BR2.7, BR5.6)의 인용이라 문제 없음 |
| CR1 접점 대조(C6·C7) | RecordText 칸, workFacts 둘째 줄을 위치로 지우기, BR2.7 다시 계산 금지가 CR1 entities.md·functional-spec.md 6절과 일치 | 접점 모양이 맞음 |

### Summary

이전 지적 6건은 모두 고쳐졌다. Critical과 Major는 남지 않았고, 새로 찾은 것은 코드 생성 단계에서 정해도 되는 Minor 하나뿐이라 개발자가 추측 없이 구현할 수 있는 수준이다.
