## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06
**Iteration:** 1
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
| R-08 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/functional-design/rules.md > BR9.1 logic; functional-spec.md > W6 1번 | BR9.1은 "공개 저장소는 같은 명령이 실제 GitHub에서 받아 파일로 남긴다", W6은 "비공개 CatchU는 수집 결과 파일을 넣는다"고 적는다. 그런데 Step 20으로 확인 명령이 확인 전용 인자(`allow_private_repository`)로 비공개 `JminAILab/CatchU`도 직접 모은다(code-summary 「Step 20」). 요구사항 FR10.1("수집 결과를 직접 넣는 개발용 실행")도 같은 낡은 문장이다. 설계가 틀린 것은 아니고(입력 파일을 받는 길은 그대로 있다) 코드의 세부 변경이라 승인 기준을 흔들지 않는다. | 설계를 다시 열 필요는 없다. 다음에 이 문서를 고칠 일이 있으면 BR9.1·W6에 「확인 명령에서만 비공개 저장소 직접 수집도 허용하고 운영 처리 경로는 허용하지 않는다」 한 줄을 더한다. 그때까지는 code-summary 「Step 20」이 이 차이의 기록이다. | New |
| R-09 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/functional-design/rules.md > BR3.4 1) · BR2.5 (이전 검토 R-07) | RECORD_WHOLE 답만 빠진 경우를 BR3.4 1)이 어떻게 읽는지(전체 미달이 아닌 것으로 본다) 아직 한 줄로 적혀 있지 않고 시나리오도 없다. 이전 반복에서 코드 생성 단계에서 정해도 되는 보완으로 남긴 항목이며, 구현된 코드와 시험이 이미 있어 막는 것은 아니다. | 위와 같이 다음 수정 때 한 줄을 더한다. 필수 아님. | New |

> R-07 Not re-checked this round

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 설계와 구현 기록 대조(FR10, code-summary 「FR10 확인」) | 기준(틀린 제목 0건, 틀린 문장 1건 이하)을 넘었고 결정은 「AI 쪽을 켠다, 판정 키는 v3 배포 뒤」 | BR1.1·BR8.1(FR10을 넘었을 때만 v3)·BR9.3과 일치. 설계 변경 없이 흐름이 이어진다. |
| BR8.1~BR8.3 대조(code-summary 「고지 v3」) | 판본 `catchu-real-analysis-notice-v3`, 2·3·4절만 변경, 합성 고지 그대로, 받는 곳에 OpenAI 추가, api·web `AI_NOTICE_VERSION` 둘 다 `2026-11-v2`, 공급자 Claude일 때 Anthropic 문구, 문구는 PR에서 팀장 승인 | BR8.2·BR8.3과 일치. 판정 키는 v3 배포 뒤에만 서버에 넣는다는 운영 절차(BR8.1)도 기록에 있다. |
| BR9.1·FR10.1 대조(code-summary 「Step 20」) | 비공개 직접 수집은 `confirm.py`의 `collect_live` 하나에서만 켜고, 운영 `live.py`는 넘기지 않으며 시험이 이를 고정 | BR9.1 문구보다 넓지만 설계 원칙(운영 경로는 확인용 자료를 싣지 않음, C5)을 어기지 않는다. 위 Minor 참고. |
| 이전 검토(review-02)의 Major 3건(R-01~R-03) 재확인 | BR2.5/BR3.5/BR4.1, BR2.6, BR6.1·BR2.3 문장이 그대로 있고 서로 모순 없음 | 되살아난 것 없음. |

### Summary

기능 설계 문서는 바뀌지 않았고, 그 뒤에 결정·구현된 FR10 통과, 고지 v3, 확인 명령의 비공개 저장소 수집과도 충돌하지 않는다. Critical·Major는 없다. BR9.1·W6의 비공개 저장소 입력 문장이 코드보다 좁다는 Minor 하나만 남는다.
