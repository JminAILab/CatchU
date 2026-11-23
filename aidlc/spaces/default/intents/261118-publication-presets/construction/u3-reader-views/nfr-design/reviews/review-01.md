## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T12:19:52Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/nfr-design/logical-components.md > 텍스트 자료 화면 탭 행 (그리고 performance-design.md > 3) | 기능 설계 검토가 요구한 것은 거절 때 초점 처리만이 아니라 자료 화면의 h1·안내 문장·패널 배치(지금 `materials-screen.tsx`가 PDF 탭이면 `MaterialsTabs`와 `tabpanel`을 한 번, 텍스트 탭이면 다른 반환에서 `MaterialsTabs`를 한 번 더 그리는 두 갈래 반환을 TabStrip 하나로 어떻게 합치는지)를 정하는 것이었다. 이 단계는 `onChange`가 boolean을 돌려주는 것만 정했고, 두 갈래 반환 처리와 「텍스트 쪽 `tabpanel`은 비어 있고 `hidden`」(`functional-spec.md` 흐름 4)을 `panels`·`keepInactive:false` 입력에 어떻게 얹는지(TabStrip 하나가 두 갈래를 모두 감싸는지, 탭 줄이 두 반환에 각각 있는지)는 여전히 적혀 있지 않다. 이대로면 TabStrip 인스턴스가 탭마다 새로 만들어져 `aria-controls` 대상과 거절 시 초점이 구현자마다 달라진다. | `logical-components.md`(또는 `performance-design.md` 3)에 자료 화면에서 TabStrip을 한 번만 그리고 그 안 패널에 h1·안내·본문을 어떻게 놓는지, 두 갈래 반환을 하나로 합치는지를 적는다. 시나리오 「저장하지 않은 입력이 있고 확인을 거절한 경우: 탭·초점이 텍스트 자료에 남음」을 확인 수단 표에 넣는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/nfr-design/performance-design.md > 3, security-design.md > 3 (TabStrip 키) | 승인된 interaction-spec TabStrip 표는 `onChange`를 `(id: string) => void`로 정했는데 이 설계는 boolean 반환으로 바꿨다. 하위 호환이라 동작은 깨지지 않으나, 다듬은 화면 표와 어긋난 채 이유(Q1 A)만 이 단계 문서에 있다. | 설계 문서에 「interaction-spec의 `void`에서 `boolean`으로 넓힘, 반환값을 무시하는 호출은 `true`로 본다」를 한 줄 적고, 반환값이 `undefined`일 때의 해석을 정한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/nfr-design/performance-design.md > 1 (hidden 패널) | 「`hidden` 패널은 `display: none`이라 낭독기·찾기에서 빠진다」고 단정했다. `hidden` 속성은 패널에 `display:flex` 같은 CSS 클래스가 붙으면 덮어써져 열리지 않은 패널이 그대로 보이므로 이 보장은 CSS가 지켜 줄 때만 성립한다. 서버 렌더링 시험은 속성 유무만 보아 이를 잡지 못한다. | TabStrip 패널에 표시 방식을 거는 클래스를 붙이지 않거나 `[hidden]{display:none}`을 명시하는 규칙을 설계에 적고, 브라우저 확인 항목(Build and Test)에 「열리지 않은 패널이 실제로 보이지 않음」을 넣는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/nfr-design/logical-components.md > 공유하는 것 | `isPublishedItem`이 다른 응답을 깨는지 「코드 생성이 찾아 확인한다」고 미뤘으나 지금 코드로 이미 닫힌다. `isPublishedItem`은 `isPublishedSnapshot` 안에서만 쓰이고(`publications-api.ts` L121), `isPublishedSnapshot`을 쓰는 곳은 `isPublicationDetail`과 `readPublishedSnapshot`뿐이다. 발행본 목록(`isPublicationPage`)과 중지 결과(`isStopResult`)는 항목 검사를 쓰지 않아 영향이 없다. 다만 사본 칸 없는 옛 시험 자료(fixture)와 받은 사람 README 설명이 새 검사에 걸릴 수 있다. | 영향 범위를 「`isPublicationDetail`·`readPublishedSnapshot` 두 곳」으로 확정해 적고, 프리셋 칸이 없는 기존 시험 자료와 `recipient/README.md` 서술을 같이 고칠 파일에 넣는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (none declared) | n/a | 이 단계에 검증 도구가 없다. `traceability.json`의 12개 NFR 번호가 `performance-design`·`security-design`의 절과 맞는 것을 눈으로 대조했다. `pickItem`(`recipient-api.ts`)이 칸을 골라 옮기고 `isPublishedItem` 호출처가 위 두 곳뿐임을 코드에서 직접 확인했다. 앞 검토 지적은 기능 설계 Major 1(`pickItem`)·Minor 1(패널 `tabIndex=0`)·Minor 2(`RecipientSlots` 나눔), NFR 요구 Major 1(번호 대응 표)·Major 2(확인 수단 표)·Minor 1(빈 이름·같은 순번 다른 이름)·Minor 2(숨긴 패널)가 이 설계에서 해소됐고, 기능 설계 Major 2는 초점 거절만 해소되고 위 Major에 적은 자료 화면 구조가 남았다. |

### Summary

앞 단계 지적은 대부분 해소됐고 TabStrip boolean 반환과 패널 `tabIndex=0`은 interaction-spec 취지와 모순되지 않는다. 다만 기능 설계 검토의 자료 화면 두 갈래 반환 구조가 여전히 미정이고(Major 1건), `hidden`의 CSS 덮어쓰기 위험과 spec 시그니처 변경 기록 등 Minor 3건이 있어 허용 범위 안이라 READY다.
