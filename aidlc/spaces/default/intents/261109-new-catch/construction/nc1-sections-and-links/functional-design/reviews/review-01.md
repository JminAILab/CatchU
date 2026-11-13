## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10T04:21:30Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261109-new-catch/construction/nc1-sections-and-links/functional-design/rules.md > BR1.2·BR1.3·BR7.5, frontend-components.md > 2.1 `Section.start`, 3.4 | 칸 글의 위치를 `start` 하나와 `[start, start + text.length)`로 정한다. 그런데 BR1.2는 같은 칸 제목 줄이 두 번 나오면 뒤 칸 글을 앞 칸 글 뒤에 빈 줄 하나를 두고 잇고, 첫 칸 제목 줄 앞의 글은 「더 쓰기」 글보다 앞에 둔다. 이렇게 이은 칸의 글은 저장된 글 안에서 이어진 구간이 아니다. 중간에 다른 칸 글과 제목 줄이 끼고, 이을 때 넣은 빈 줄은 저장된 글에 없다. 이 갈래는 한계로 적힌 「칸 안에 제목 줄과 같은 줄을 쓴 경우」에서 실제로 생기며, 이때 BR7.5의 칸 안 범위 계산이 어긋나 엉뚱한 글자를 강조한다. | 이은 칸이 생기는 경우의 위치 규칙을 정한다. 예를 들어 칸을 이어진 조각 목록(조각마다 start와 text)으로 돌려주고 BR7.5가 조각마다 겹침을 계산하게 하거나, 이은 칸은 강조하지 않는다고 적는다. 이은 칸에 대한 BR1.3·BR7.5 시험 시나리오도 `frontend-components.md` 5절에 더한다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc1-sections-and-links/functional-design/rules.md > BR2.2 | 링크 이름 규칙이 다루지 않는 주소 꼴이 있다. (1) `/blob/feature/x/src/a.ts`처럼 브랜치 이름에 `/`가 있으면 판본 자리와 경로를 가를 수 없어 「a.ts · 브랜치 feature」처럼 틀린 이름이 나온다. (2) `/tree/main`처럼 경로가 없을 때의 「경로 끝 이름」, `#L10C2`·`#readme` 같은 조각, `/pull/12/files`나 `/commit/<값>/…` 같은 뒤 경로가 붙은 주소가 어느 갈래인지 정해져 있지 않다. 구현자가 추측해야 한다. | 위 꼴마다 이름을 정한다(예: 가를 수 없거나 알 수 없는 꼴은 주소 전체로 돌린다). 판본에 `/`가 든 브랜치는 한계로 적는다. 갈래마다 시험 줄을 AC2.2 시험에 더한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc1-sections-and-links/functional-design/frontend-components.md > 4. API 연결 | api에서 바꾸는 곳을 `owner-catch-input.ts`와 `owner-catch-store.ts`만 적었다. 지금 코드에서 목록·상세가 쓰는 `READ_COLUMNS`(`catch-reader.ts`)는 `author_description`을 읽지 않고, 응답 모양은 `owner-catch-response.ts`가 정한다. 계약 C1은 `api/docs/`의 문서와 시험을 같은 PR에서 고치라고 한다. 이 파일들이 빠져 있어 `hasAuthorDescription`을 어디서 읽어 싣는지 불분명하다. `public-catch-store.ts`도 `toOwnerCatchResponse`를 쓰므로 공개 응답을 바꾸지 않는다는 보장 자리도 적는 편이 안전하다. | api 변경 파일 목록에 `catch-reader.ts`의 읽기 칸 추가, `owner-catch-response.ts`의 응답 칸 추가, `api/docs/` 문서를 더하고, 공개 Catch 응답 시험이 그대로 통과해야 한다고 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc1-sections-and-links/functional-design/functional-spec.md > W2, frontend-components.md > 3.2·3.3 | 목록 조건과 새 응답 칸을 web이 받는 쪽의 변경이 빠져 있다. `catch-api.ts`는 응답을 항목별로 검사하고 `types.ts`의 `CatchAsset`에는 `hasAuthorDescription`이 없다. 또 내 자산 화면에는 미리보기 방식(`dataMode !== "api"`)이 있어 목록을 화면 안에서 거르는데, 새 조건 칸이 미리보기에서 어떻게 거르는지 정해져 있지 않다. | 응답 검사·타입·`catchSourceOf`에 새 칸을 더한다고 적고, 미리보기 방식에서 작성자 설명 조건을 어떻게 다루는지(예: 고정 자료에 값을 두고 같은 조건으로 거르기) 한 줄 정한다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc1-sections-and-links/functional-design/rules.md > BR1.2·BR1.6, frontend-components.md > 3.1 `dirty` | 옛 글에 칸 제목 줄이 섞여 있거나 같은 칸 제목 줄이 두 번 있으면, 나눈 뒤 합친 글은 저장된 글과 달라진다(칸 순서가 바뀌고 빈 줄이 늘어난다). BR1.6의 왕복 보장은 칸 제목 줄이 없는 옛 글에만 적용된다. `dirty`는 `joined !== savedText`라서 이때 아무것도 안 고쳤는데도 열자마자 「저장하지 않은 변경이 있습니다」가 보이고, 저장하면 글이 조용히 재배열된다. | 이 갈래를 한계로 적거나, `dirty`를 사용자가 칸을 고쳤는지로 판정하도록 정한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| aidlc engine sensor-traceability (functional-design, traceability.json) | pass: true, gaps 0, orphans 0, missing_from_table 0, missing_from_upstream_ids 0, invalid_entries 0, invalid_targets 0, findings_count 0 | US·규칙 추적에는 구조상 빠진 곳이 없다. 아래 요약의 지적은 추적 표가 잡지 못하는 의미 수준의 것이다. |

### Summary

규칙·흐름·부품이 상류 요구사항, 계약 C1·C7, 지금 코드(커서 `v: 1` 검사, 4,000자 코드 포인트 세기, 빈 설명의 null 저장, 사본 강조 위치 계산)와 대체로 맞고 구현자가 추측할 곳이 적다. 다만 이은 칸의 강조 위치 계산(Major 1건)은 구현 전에 정해 두어야 하고, 나머지 Minor 4건(링크 이름 꼴, api·web 변경 파일 누락, 열자마자 변경 표시)은 코드 생성 단계에서 보강하면 된다. Major가 2건 이하이고 Critical이 없어 READY다.
