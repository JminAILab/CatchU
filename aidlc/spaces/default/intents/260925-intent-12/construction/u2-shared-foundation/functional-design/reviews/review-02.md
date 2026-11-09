## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-27T09:49:57Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md > BR4.1, BR4.2 (U1 BR2.3, BR3.4와의 접점) | JD 요약의 머리줄 방식이 U1 규칙과 두 군데서 어긋난다. (1) U1 BR2.3은 모든 호출의 시스템 지시에 "머리말·맺음말 없음" 형식 지시를 고정으로 붙이는데, BR4.1은 같은 호출에 머리줄 셋을 쓰라고 지시한다. 두 지시가 한 프롬프트에 함께 들어가면 서로 충돌한다. (2) U1 BR3.4는 "- "로 시작하지 않는 줄을 내보내지 않고 그 줄의 인용까지 버린다. BR4.2는 "U1이 항목을 묶을 때" 머리줄을 보고 역할을 붙인다고 하지만, 머리줄 위치를 U2가 어떻게 받는지는 명세에 없다. U1 코드는 이미 통합 브랜치에 있어 이 접점이 U1 변경인지 U2의 앞 단계인지 정해지지 않았다. | JD_SUMMARY일 때 U1의 "머리말 없음" 지시를 어떻게 바꾸거나 건너뛸지 적는다. 또 머리줄을 인식하는 자리(U1 항목 묶기에 역할 표지를 내보내게 하는지, U2가 응답 줄을 먼저 훑는지)와 U1 쪽 변경 필요 여부를 정한다. U1 변경이 필요하면 U1 담당에게 알릴 것으로 남긴다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md > BR4.7, BR3.3 (예외 목록) | "찾지 못함" 항목은 JD 줄에서 뽑은 모든 영어 표기를 대상으로 하고, 예외는 약어 15개뿐이다. 실제 JD 줄은 "experience with Docker and Kubernetes"처럼 일반 영어 낱말이 섞이는 일이 흔한데, 그러면 experience, with, and 같은 낱말도 자료에 없으면 "찾지 못함" 항목이 되어 화면에 잡음이 쏟아진다. S16은 Kubernetes 한 개만 시험하므로 이 경우를 걸러내지 못한다. | 기술·제품 이름만 대상으로 좁히는 기준을 정한다(예: 영문 대문자가 든 표기만, 또는 JD 줄 안 기술 이름 후보 목록). 표기 수 상한도 하나 둔다. 일반 영어 낱말이 섞인 JD 줄 시나리오를 S16 옆에 더한다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/functional-spec.md > Assumptions & Open Questions 2, 계약 변경 제안 C-01 | BR4.7이 만드는 서버 항목에 붙일 `kind` 값이 미결이다. 계약의 `kind`는 CITED 또는 AI_INTERPRETATION뿐인데, BR3.9는 AI_INTERPRETATION을 'AI 해석'으로 표시하게 한다. 서버 문장을 'AI 해석'으로 보이게 두면 표시가 틀리고, 이 값이 정해지기 전에는 U2도 U10도 이 항목을 구현할 수 없다. | 계약 수정 PR에서 정할 선택지 두세 개(예: `kind` 값 추가, `jdRole`만으로 구분하고 U10이 표시 분기)를 이점·공수와 함께 적고, U10 담당 합의를 U2 코드 생성 착수 전 조건으로 명시한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md > BR4.5 | AC6.3.6은 숫자·PR 번호를 "같은 요구사항의 근거 칸이 인용한 근거 원문"에서 찾으라고 하고, C-01도 "그 JD 요구사항 줄"이라 쓴다. 규칙은 "같은 응답의 근거 항목"으로 쓰는데, 한 호출이 요구사항 한 줄인지 여럿인지 명세 어디에도 적혀 있지 않다. 여럿이면 다른 요구사항의 근거 숫자로 질문이 통과한다. | 한 호출은 요구사항 한 줄(userText 한 줄)이라는 전제를 BR4.5 또는 소비 규칙에 적고, 이를 U10 담당에게 확인받는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/functional-spec.md > Assumptions & Open Questions 4, BR7.2 | 탈퇴 1단계가 U4의 발행본 표와 U6의 MCP 표를 직접 갱신·삭제하는데, 두 표는 아직 통합 브랜치에 없다. 시험은 임시로 만든 표로 하게 되어 실제 표 모양과 어긋날 수 있고, U2가 다른 Unit 표 이름에 묶인다. | 두 표의 이름·칸을 C-07·C-06에서 확인해 명세에 못 박는다. 또는 탈퇴 1단계의 U4·U6 부분을 각 Unit이 등록하는 정리 함수 호출로 바꿀지 검토한다. 어느 쪽이든 U4·U6 합친 뒤 통합 시험을 완료 조건으로 적는다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/traceability.json > coverage AC20.1.1 | AC20.1.1은 처음 쓰는 AI 기능에 분석도 포함하는데, BR2.6은 분석에 이 동의를 요구하지 않는다고 한다. 추적은 AC20.1.1을 OK로만 적어 분석 부분이 10월 요청별 동의로 대신된다는 점이 드러나지 않는다. | AC20.1.1 항목에 BR2.6을 함께 달고, 분석 고지는 10월 동의 화면이 맡는다는 범위 설명을 한 줄 더한다. | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md > BR3.7, BR4.7 | BR4.7이 "찾지 못함" 서버 안내를 결과 끝에 더하면, AI 문장이 모두 버려져도 items가 비지 않는다. BR3.7은 0개를 "결과 없음"으로 보이는 일을 U10에 맡기는데, 안내 항목만 남은 경우도 "결과 없음"인지 정하지 않았다. | U10이 "결과 없음"을 판정할 때 SERVER_NOTICE 항목을 세지 않는다는 한 줄을 BR3.7 또는 U10 소비 규칙에 더하고, C-01 제안 때 U10 담당과 맞춘다. | New |

> R-01 Reviewer note: BR4.1이 JD_SUMMARY일 때만 U1 BR2.3의 고정 형식 지시를 JD용 지시로 바꾸고, BR4.2가 U1 BR3.4 앞 단계에서 머리줄을 인식한다. U1 코드를 U2가 직접 고친다는 점과 기존 U1 시험 통과 조건(S12c)도 적혀 있다. U1 BR2.3·BR3.4 원문과 어긋나지 않는다.

> R-02 Reviewer note: BR4.7이 대문자가 든 영어 표기만, 한글 없는 줄은 첫 낱말 제외, 한 줄 최대 3개로 좁혔고 대조 대상도 이번 sources 글로 못 박았다. S16b·S16c·S16d가 일반 낱말, 상한, 대조 대상을 시험한다. 남은 한계는 가정 6에 적혀 있다.

> R-03 Reviewer note: kind 값 `SERVER_NOTICE`를 정했고 BR3.9가 'AI 해석' 표시를 붙이지 않게 했다. C-01 변경 제안과 U10 소비 규칙, 가정 2의 U2 코드 생성 전 합의 조건이 서로 맞는다.

> R-04 Reviewer note: BR4.5가 한 호출 = 요구사항 한 줄(userText 한 줄)을 전제로 적고, C-01 제안과 U10 소비 규칙에도 같은 전제를 넣어 U10 담당 합의 대상에 올렸다.

> R-05 Reviewer note: BR7.2와 가정 4가 `publication.stopped_at`과 mcp_connection·mcp_authorization_code·mcp_access_token으로 못 박았고, contract-summary(C-06 약 231행, 518~519행)의 이름과 일치한다. U4·U6를 합친 뒤 통합 시험이 U2 완료 조건이다.

> R-06 Reviewer note: traceability.json의 AC20.1.1 대상에 BR2.6이 들어갔고, BR2.6과 U7 소비 규칙이 분석 고지는 10월 요청별 동의 화면이 맡는다고 설명한다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability (traceability.json 직접 읽기) | upstream_ids 39개 모두 coverage에 있고, 대상 BR이 rules.md에 존재한다. N/A 두 건은 사유가 적혀 있다 | 통과로 본다. AC20.1.1이 BR2.6을 포함한다 |
| required-sections / upstream-coverage / linter / type-check | 이 검토에서 실행하지 못함. 도구를 직접 호출할 수 없고 산출물 읽기로만 확인했다 | 도구 결과가 없다는 사실만 기록한다. 읽기로 본 범위에서 이상은 없다 |

### Summary

이전 열린 지적 여섯 건이 모두 해결됐다. 명세, 규칙, 추적이 변경 결정(JD_SUMMARY 한정 U1 수정, 대문자 든 표기 최대 3개, SERVER_NOTICE, 한 호출 = 요구사항 한 줄, 탈퇴 1단계 표 이름 고정, AC20.1.1과 BR2.6 연결)을 서로 맞게 적고 있다. 남은 것은 안내 항목만 남는 경우의 "결과 없음" 판정이라는 Minor 한 건이며 구현을 막지 않는다.
