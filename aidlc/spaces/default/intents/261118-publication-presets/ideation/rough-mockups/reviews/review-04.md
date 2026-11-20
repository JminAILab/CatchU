## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-11-19T00:14:32Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > 화면 목록(「범위 묶음」 열), W3 | 범위 문서의 S7(텍스트 자료·PDF를 지울 때 프리셋에 담긴 자료 처리, 탈퇴 때 프리셋 삭제, 방침 문구)은 Must인데, 화면 목록의 범위 묶음 열에 S7이 없고 user-flow에도 이 흐름이 없다. 지원자가 프리셋에 담긴 텍스트 자료나 PDF를 자료 화면에서 지우면 무슨 안내가 보이는지 그려져 있지 않다. 프리셋 편집(W3)에서 원본이 지워진 항목이 어떻게 보이는지도 없다. 다듬은 화면과 요구사항 단계가 이 자리를 추측하게 된다. | 자료 지우기 확인 화면에 프리셋 영향 안내가 들어가는지, W3의 담긴 자료 목록에서 지워진 항목이 어떻게 보이는지(남기고 표시할지, 자동으로 빠질지)를 한 줄로 그린다. 그리지 않는다면 요구사항 단계로 넘기는 열린 질문에 올린다. 탈퇴·방침은 화면 변경이 없다고 적는다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W4 상태표 | W2에는 불러오는 중, 비었음, 불러오기 실패 상태가 있는데 W4의 「프리셋 고르기」에는 없다. 프리셋 목록을 불러오지 못했을 때 「프리셋 없음」으로 잘못 보이면 지금 화면의 「조회 실패를 0건으로 보이지 않는다」 원칙을 어긴다. 항목이 0개인 프리셋을 고를 수 있는지도 정해져 있지 않다. | W4 상태표에 불러오는 중과 불러오기 실패(「다시 불러오기」, 0개로 보이지 않음)를 더한다. 항목이 0개인 프리셋을 고를 수 있는지는 열린 질문에 더한다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W5 「출처 단추를 눌러 다른 탭의 글로 옮겨 갔을 때」, user-flow.md > F4 4~5단계 | 돌아가기가 「출처 단추를 누른 답」으로만 적혀 있다. 출처 단추는 AI 요약에도 있으므로 요약에서 누른 경우 어디로 돌아가는지가 빠졌다. 가리킨 글이 지금 보이는 탭에 이미 있을 때 [답으로 돌아가기]가 보이는지, 돌아간 뒤 초점이 어디에 놓이는지도 정해져 있지 않다. | 요약에서 누른 경우도 같은 방식으로 요약으로 돌아간다고 적는다. 같은 탭 안의 출처에도 [답으로 돌아가기]가 보이는지와 돌아간 뒤 초점 위치를 접근성 줄이나 열린 질문에 한 줄 더한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W3 도식 「( ) 작성자 설명을 쓴 Catch만 보기」 | 표기 설명에서 `( )`는 「고르기 칸」이다. 지금 코드(`web/src/features/publications/publish-view.tsx`)에서 이 항목은 체크박스(`input type="checkbox"`)이고, 같은 도식에서 체크박스는 `[ ]`로 그렸다. 지금 화면 표시를 코드 그대로 쓴다는 프로젝트 규칙과 표기가 어긋난다. | 표기를 `[ ]`로 맞추거나, `( )`가 무엇을 뜻하는지 표기 줄에서 구분해 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W3 상태표 「담긴 자료의 원본이 지워짐」 | 「자동으로 빠진다」 바로 뒤에 「담긴 목록에 남겨 두고 표시하지 않는다」가 이어져 서로 반대로 읽힌다. 빠진다는 뜻인지, 목록에 남기되 숨긴다는 뜻인지 개발자가 가를 수 없다. | 지운 자료는 담긴 목록에서도 사라지고 자리표시도 남기지 않는다는 한 문장으로 고친다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W5 접근성 줄 | 「탭 줄에서 Tab을 누르면 누른 탭의 자료로 들어간다」는 어느 탭에 초점이 있을 때인지, 탭 줄에 Tab으로 들어오는 첫 자리가 어디인지가 모호하다. 열린 질문에는 돌아가기 단추 도달만 있고 이 부분은 없다. | 탭 줄 안의 Tab 동작을 한 줄로 다시 쓰거나 다듬은 화면 단계 열린 질문에 올린다. | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W1 상단 메뉴와 발행본 목록 | 상단 메뉴가 5개 항목에 프로필까지 놓이게 된다. 지금 `member-header.tsx`는 항목 4개를 한 줄로 그린다. Q7에서 좁은 화면 배치를 따로 설계하지 않기로 했으므로 메뉴가 넘칠 때 어떻게 보이는지 적혀 있지 않다. 승인을 막을 일은 아니다. | 다듬은 화면 단계에서 메뉴 5개가 지금 헤더 폭 기준 안에 들어가는지 한 줄로 확인해 적는다. | New |
| R-08 | Minor | aidlc/spaces/default/intents/261118-publication-presets/ideation/rough-mockups/wireframes.md > W1 발행본 목록 스케치 | 발행본 목록의 [새로 발행]은 코드에서 단추가 아니라 링크(`Link`)로 그려진다. 스케치는 `[단추]` 표기를 쓴다. 이 단계가 자리와 순서만 정하는 것이어서 영향은 작다. | 다듬은 화면 단계에서 링크 모양의 단추라는 점을 한 줄로 밝히거나 지금 표기 그대로 둔다. | New |

### Summary

Q1을 B로 바꾼 내용이 W1~W4, user-flow의 전체 흐름·F1·F3·정보 구조와 질문 파일 답에 어긋남 없이 반영되었다. W1의 [프리셋 관리] 링크와 W2의 <발행본으로> 링크는 사라졌고, 프리셋이 없을 때 발행 화면의 링크는 프리셋 화면(W2)을 가리킨다. 「지금」으로 적은 표시(메뉴 4개, 「발행할 자료 고르기」, 「고른 항목과 순서 (n/20)」, 「내 발행본」, 받은 사람 화면 순서)는 `web/src` 코드와 일치한다. 남은 것은 승인을 막지 않는 Minor 두 건뿐이다.
