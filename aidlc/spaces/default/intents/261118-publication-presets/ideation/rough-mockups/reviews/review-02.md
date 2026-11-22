## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-11-18T13:48:36Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > 화면 목록(「범위 묶음」 열), W3 | 범위 문서의 S7(텍스트 자료·PDF를 지울 때 프리셋에 담긴 자료 처리, 탈퇴 때 프리셋 삭제, 방침 문구)은 Must인데, 화면 목록의 범위 묶음 열에 S7이 없고 user-flow에도 이 흐름이 없다. 지원자가 프리셋에 담긴 텍스트 자료나 PDF를 자료 화면에서 지우면 무슨 안내가 보이는지 그려져 있지 않다. 프리셋 편집(W3)에서 원본이 지워진 항목이 어떻게 보이는지도 없다. 다듬은 화면과 요구사항 단계가 이 자리를 추측하게 된다. | 자료 지우기 확인 화면에 프리셋 영향 안내가 들어가는지, W3의 담긴 자료 목록에서 지워진 항목이 어떻게 보이는지(남기고 표시할지, 자동으로 빠질지)를 한 줄로 그린다. 그리지 않는다면 요구사항 단계로 넘기는 열린 질문에 올린다. 탈퇴·방침은 화면 변경이 없다고 적는다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W4 상태표 | W2에는 불러오는 중, 비었음, 불러오기 실패 상태가 있는데 W4의 「프리셋 고르기」에는 없다. 프리셋 목록을 불러오지 못했을 때 「프리셋 없음」으로 잘못 보이면 지금 화면의 「조회 실패를 0건으로 보이지 않는다」 원칙을 어긴다. 항목이 0개인 프리셋을 고를 수 있는지도 정해져 있지 않다. | W4 상태표에 불러오는 중과 불러오기 실패(「다시 불러오기」, 0개로 보이지 않음)를 더한다. 항목이 0개인 프리셋을 고를 수 있는지는 열린 질문에 더한다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W5 「출처 단추를 눌러 다른 탭의 글로 옮겨 갔을 때」, user-flow.md > F4 4~5단계 | 돌아가기가 「출처 단추를 누른 답」으로만 적혀 있다. 출처 단추는 AI 요약에도 있으므로 요약에서 누른 경우 어디로 돌아가는지가 빠졌다. 가리킨 글이 지금 보이는 탭에 이미 있을 때 [답으로 돌아가기]가 보이는지, 돌아간 뒤 초점이 어디에 놓이는지도 정해져 있지 않다. | 요약에서 누른 경우도 같은 방식으로 요약으로 돌아간다고 적는다. 같은 탭 안의 출처에도 [답으로 돌아가기]가 보이는지와 돌아간 뒤 초점 위치를 접근성 줄이나 열린 질문에 한 줄 더한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W3 도식 「( ) 작성자 설명을 쓴 Catch만 보기」 | 표기 설명에서 `( )`는 「고르기 칸」이다. 지금 코드(`web/src/features/publications/publish-view.tsx`)에서 이 항목은 체크박스(`input type="checkbox"`)이고, 같은 도식에서 체크박스는 `[ ]`로 그렸다. 지금 화면 표시를 코드 그대로 쓴다는 프로젝트 규칙과 표기가 어긋난다. | 표기를 `[ ]`로 맞추거나, `( )`가 무엇을 뜻하는지 표기 줄에서 구분해 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W3 상태표 「담긴 자료의 원본이 지워짐」 | 「자동으로 빠진다」 바로 뒤에 「담긴 목록에 남겨 두고 표시하지 않는다」가 이어져 서로 반대로 읽힌다. 빠진다는 뜻인지, 목록에 남기되 숨긴다는 뜻인지 개발자가 가를 수 없다. | 지운 자료는 담긴 목록에서도 사라지고 자리표시도 남기지 않는다는 한 문장으로 고친다. | New |
| R-06 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W5 접근성 줄 | 「탭 줄에서 Tab을 누르면 누른 탭의 자료로 들어간다」는 어느 탭에 초점이 있을 때인지, 탭 줄에 Tab으로 들어오는 첫 자리가 어디인지가 모호하다. 열린 질문에는 돌아가기 단추 도달만 있고 이 부분은 없다. | 탭 줄 안의 Tab 동작을 한 줄로 다시 쓰거나 다듬은 화면 단계 열린 질문에 올린다. | New |

> R-01 Reviewer note: 화면 목록의 W3 행에 S7이 들어갔다. W3 상태표에 「담긴 자료의 원본이 지워짐」 행이 생겼다. wireframes.md의 「자료 지우기·탈퇴·개인정보처리방침 (S7)」 절과 user-flow.md F6이 지우기 확인 문장의 안내, 탈퇴는 화면 변경 없음, 방침은 문구만 바뀜을 적고 있다.

> R-02 Reviewer note: W4 상태표에 불러오는 중과 불러오기 실패가 생겼고, 항목 0개 프리셋은 열린 질문에 올라 있다. user-flow F3 오류 경로도 맞춰져 있다.

> R-03 Reviewer note: W5와 F4 4~5단계에 요약에서 누른 경우, 같은 탭 출처에서도 돌아가기가 보임, 돌아간 뒤 초점이 눌렀던 출처 단추라는 것이 적혀 있다. W6에도 같은 동작이 적혀 있다. 코드의 `summaryFailedOwner` 메시지로 보아 작성자 화면에도 AI 요약이 있어 W6 서술과 어긋나지 않는다.

> R-04 Reviewer note: W3 도식과 표기 안내가 `[ ]`로 맞춰졌다.

### Summary

이전 지적 네 건이 모두 반영됐다. 남은 것은 문장 모호함 두 건뿐이라 요구사항 단계로 넘겨도 개발자가 되묻지 않고 시작할 수 있다. 승인해도 된다.
