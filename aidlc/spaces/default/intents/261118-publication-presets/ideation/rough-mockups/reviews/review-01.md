## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-11-18T13:22:21Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > 화면 목록(「범위 묶음」 열), W3 | 범위 문서의 S7(텍스트 자료·PDF를 지울 때 프리셋에 담긴 자료 처리, 탈퇴 때 프리셋 삭제, 방침 문구)은 Must인데, 화면 목록의 범위 묶음 열에 S7이 없고 user-flow에도 이 흐름이 없다. 지원자가 프리셋에 담긴 텍스트 자료나 PDF를 자료 화면에서 지우면 무슨 안내가 보이는지 그려져 있지 않다. 프리셋 편집(W3)에서 원본이 지워진 항목이 어떻게 보이는지도 없다. 다듬은 화면과 요구사항 단계가 이 자리를 추측하게 된다. | 자료 지우기 확인 화면에 프리셋 영향 안내가 들어가는지, W3의 담긴 자료 목록에서 지워진 항목이 어떻게 보이는지(남기고 표시할지, 자동으로 빠질지)를 한 줄로 그린다. 그리지 않는다면 요구사항 단계로 넘기는 열린 질문에 올린다. 탈퇴·방침은 화면 변경이 없다고 적는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W4 상태표 | W2에는 불러오는 중, 비었음, 불러오기 실패 상태가 있는데 W4의 「프리셋 고르기」에는 없다. 프리셋 목록을 불러오지 못했을 때 「프리셋 없음」으로 잘못 보이면 지금 화면의 「조회 실패를 0건으로 보이지 않는다」 원칙을 어긴다. 항목이 0개인 프리셋을 고를 수 있는지도 정해져 있지 않다. | W4 상태표에 불러오는 중과 불러오기 실패(「다시 불러오기」, 0개로 보이지 않음)를 더한다. 항목이 0개인 프리셋을 고를 수 있는지는 열린 질문에 더한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W5 「출처 단추를 눌러 다른 탭의 글로 옮겨 갔을 때」, user-flow.md > F4 4~5단계 | 돌아가기가 「출처 단추를 누른 답」으로만 적혀 있다. 출처 단추는 AI 요약에도 있으므로 요약에서 누른 경우 어디로 돌아가는지가 빠졌다. 가리킨 글이 지금 보이는 탭에 이미 있을 때 [답으로 돌아가기]가 보이는지, 돌아간 뒤 초점이 어디에 놓이는지도 정해져 있지 않다. | 요약에서 누른 경우도 같은 방식으로 요약으로 돌아간다고 적는다. 같은 탭 안의 출처에도 [답으로 돌아가기]가 보이는지와 돌아간 뒤 초점 위치를 접근성 줄이나 열린 질문에 한 줄 더한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W3 도식 「( ) 작성자 설명을 쓴 Catch만 보기」 | 표기 설명에서 `( )`는 「고르기 칸」이다. 지금 코드(`web/src/features/publications/publish-view.tsx`)에서 이 항목은 체크박스(`input type="checkbox"`)이고, 같은 도식에서 체크박스는 `[ ]`로 그렸다. 지금 화면 표시를 코드 그대로 쓴다는 프로젝트 규칙과 표기가 어긋난다. | 표기를 `[ ]`로 맞추거나, `( )`가 무엇을 뜻하는지 표기 줄에서 구분해 적는다. | New |

### Summary

지금 화면 서술은 코드와 대조해 맞았다. 상단 메뉴 4개, 발행 화면 구역 이름(「발행할 자료 고르기」, 「고른 항목과 순서 (n/20)」), 받은 사람 화면의 지금 순서(자료 다음에 요약), 자료 화면 탭에 화살표 키 동작이 없다는 점이 모두 코드와 같다. Q1~Q7과 승인된 범위 S1~S6의 화면은 W1~W6과 F1~F5로 빠짐없이 이어진다. 걸림은 Must인 S7을 화면이나 흐름으로 그리지 않은 점이다. 요구사항 단계 전에 한 줄이라도 정하는 것이 좋지만, 엔지니어링이 막히는 수준은 아니다. 나머지는 빈 상태와 접근성 보완이다.
