## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T11:36:33Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/functional-design/frontend-components.md > 응답 검사 `publications-api.ts` (바뀜) | 받은 사람 응답은 `web/src/features/recipient/recipient-api.ts`의 `readPublishedSnapshot`이 `pickItem`으로 항목 칸을 하나씩 골라 새 객체를 만든다(`publishedItemId`·`position`·`title`·종류별 사본만 복사). 설계는 `isPublishedItem` 검사만 고치고 받은 사람 쪽은 「같은 검사를 쓰는지 확인」이라고만 적었다. 검사는 통과해도 `pickItem`이 `presetOrdinal`·`presetName`을 떨어뜨려, 받은 사람 화면(`PublishedSnapshotView`와 출처 이동)은 탭 묶음 기준 칸이 없는 채로 그려진다. 작성자 상세는 영향이 없어 두 화면이 다르게 깨진다. | `frontend-components.md`의 「응답 검사」 표와 `functional-spec.md` 흐름 1에 `recipient-api.ts`의 `pickItem`이 두 칸을 그대로 옮기도록 고친다고 명시하고 「함께 고칠 파일」에 넣는다. 시험 시나리오에 「받은 사람 응답이 `readPublishedSnapshot`을 지나도 두 칸이 남는다」를 더한다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/functional-design/functional-spec.md > 흐름 4 텍스트 자료 화면, frontend-components.md > TabStrip 키보드·`materials-screen.tsx` | 지금 `MaterialsScreen.changeTab`은 텍스트에서 PDF로 갈 때 저장하지 않은 입력이 있으면 `window.confirm`을 띄우고 거절하면 탭을 바꾸지 않는다. 그런데 TabStrip의 `onChange`는 반환값이 없고, BR1.2는 화살표를 누르면 새 탭으로 초점을 옮긴다고 정한다. 거절하면 선택 탭은 그대로인데 초점은 선택되지 않은 탭(`tabindex=-1`)에 남아, 역할·Tab 순서 설계가 어긋난다. 또 화살표를 누를 때마다 확인 창이 뜬다. 같은 화면은 탭에 따라 h1·안내 문장·본문이 다른 두 갈래 반환이라 「두 탭 모두 `tabpanel`, 열리지 않은 패널은 빈 `hidden`」을 어느 구조에 얹는지도 적혀 있지 않다. | 변경을 거절당했을 때 TabStrip이 초점을 선택된 탭에 되돌리는 방식(예: `onChange`가 수락 여부를 돌려주거나, 초점 이동을 선택 확정 뒤에 함)을 `frontend-components.md`에 정하고 시나리오에 「미저장 입력이 있고 확인을 거절한 경우」를 더한다. 자료 화면의 h1·안내·패널 배치(두 갈래 반환을 하나로 합치는지)도 적는다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/functional-design/rules.md > BR1.3 | 「다시 Tab이면 열린 패널 안의 첫 초점 요소(없으면 패널)로 간다」고 했지만 패널을 초점 받게 하는 방법(`tabpanel`의 `tabIndex=0`)이 `frontend-components.md` TabStrip 그리기에 없다. 텍스트 자료만 든 탭은 링크가 없으면 초점 요소가 없어, 열린 패널로 들어가는 동작이 구현자마다 달라진다. | TabStrip 그리기 행에 `tabpanel`이 안에 초점 요소가 없을 때만 `tabIndex=0`을 받는지(또는 항상 받는지)를 적고 시험에 넣는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/functional-design/frontend-components.md > 받은 사람 화면 `recipient-view.tsx` (바뀜) | 지금 AI 요약(슬롯 2)·질문하기(슬롯 3)·JD 요약(슬롯 4)은 `RecipientSlots` 한 부품이 차례로 그리고, 발행본 자료(`PublishedSnapshotView`)는 그 바깥에서 먼저 그려진다. 설계는 「1번 자리와 2번 자리 순서를 바꾼다」고만 적어, 요약만 자료 위로 올리려면 `RecipientSlots`를 둘로 나눠야 한다는 점이 빠져 있다. | `RecipientSlots`를 요약 쪽과 질문·JD 쪽으로 나누는 것(또는 같은 효과의 방법)과 `data-testid`·`key` 유지를 명시한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (none declared) | n/a | 이 단계에 검증 도구가 없다. `traceability.json`의 AC 24개가 `stories.md`의 US2.3·US3.1~US3.5·US4.1·US4.4와 맞고, BR 참조(BR1.1~BR5.2)가 `rules.md`에 모두 있음을 눈으로 대조했다. |

### Summary

승인된 interaction-spec의 TabStrip·SourceJump와 어긋나는 동작은 없고, 어긋나는 한 전제(다른 탭 항목을 그려 두지 않음)는 Q2 B로 사람이 정해 기록됐다. 다만 받은 사람 응답을 항목별로 골라 복사하는 `pickItem`이 프리셋 두 칸을 떨어뜨리는 점과, 자료 화면의 미저장 확인 창이 화살표 이동과 부딪히는 점은 코드 생성 전에 설계에 반영해야 한다(Major 2건이라 READY 기준 안이다).
