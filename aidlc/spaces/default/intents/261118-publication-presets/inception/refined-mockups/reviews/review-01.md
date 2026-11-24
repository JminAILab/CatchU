## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-11-19T06:35:10Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/inception/refined-mockups/mockups.md > 「화면 초안과 달라진 곳」 표, M5 (Q2) | 팀장 결정(Q2)으로 [답으로 돌아가기]를 항목 안 제목 바로 아래로 옮겼지만, 승인된 요구사항 FR3.6과 수락 기준 AC3.4.2는 여전히 「글 바로 위」라고 적혀 있다. 시험 담당이 AC3.4.2 그대로 시험하면 이 화면과 반대로 확인하게 된다. AC3.4.4는 요약에서 눌러도 「[답으로 돌아가기]」로 적었는데 이 화면은 「요약으로 돌아가기」로 쓴다. | 달라진 곳 표에 FR3.6·AC3.4.2·AC3.4.4와 user-flow의 해당 문장이 이 화면이 대신하는 문장이라는 것을 적고, 이후 단계가 어느 쪽을 따르는지 분명히 한다. 요구사항·이야기 쪽 정정은 다음 단계 입력으로 넘긴다고 적어도 된다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/refined-mockups/mockups.md > M3 「담을 자료 고르기」 그림 | 「불러온 20개의 Catch」 아래 항목을 `[Catch A  저장소 · 날짜]`로 그리고 이 부분이 지금 발행 화면 그대로라고 적었다. 지금 `publish-view.tsx`의 `catchSubline`은 날짜를 그리지 않고 「저장소 이름 · 공개 상태 · 설명 안 씀 · 불일치 표시됨」을 잇는다. 편집 화면에는 비공개 Catch가 없어 「공개」 표시도 늘 같은 값이 된다. | 그림의 작은 줄을 지금 코드가 그리는 글로 고치거나, 날짜를 더하는 것이면 바뀜으로 표시한다. 편집 화면에서 「공개」를 그대로 보일지 한 줄로 밝힌다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/refined-mockups/mockups.md > M3 상태 표 | AC1.2.5(프리셋 50개에서 새로 저장하면 저장되지 않고 「50개까지」 안내)의 상태가 M3에 없다. M2에서 [새 프리셋]을 막아도 다른 창이나 주소로 들어와 저장할 수 있고, 지금 표에는 일반 「저장하지 못했습니다」만 있어 이 경우 이유가 가려진다. | M3 상태 표에 「50개 가득 참」 행을 더하고 글(예: M2와 같은 「프리셋은 50개까지 만들 수 있습니다.」)과 입력이 남는지를 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/refined-mockups/mockups.md > M2 `<고치기>`, accessibility-checklist.md > A12 | 프리셋마다 같은 글자 `<고치기>` 링크가 반복되는데, 순서 단추처럼 이름을 붙이는 `aria-label` 규칙이 `<고치기>`에는 없다. 화면 낭독기로 링크 목록을 읽으면 어느 프리셋인지 알 수 없다. 같은 이름의 프리셋을 여러 개 만들 수 있어(FR1.4) 더 헷갈린다. | `<고치기>`의 읽히는 이름을 「(프리셋 이름) 고치기」 꼴로 정하고 접근성 점검 항목에 넣는다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/refined-mockups/mockups.md > M4 `PresetPicker`, interaction-spec.md > PresetPicker | 다섯 개를 고르면 나머지 단추가 막힌다고 했는데, 같은 단추에 「항목 20개 초과」 같은 이유도 있을 때 단추 안에 무엇을 보일지 정하지 않았다. 「이유는 하나만 보인다」의 순서(0개 → 발행 불가 → 상한)에 5개 가득 참이 들어 있지 않다. 같은 이름의 프리셋 둘이 고르기 목록·탭 줄에서 구분되지 않는 경우도 말이 없다(FR1.4 허용). | 5개 가득 참을 이유 순서의 어디에 두는지 한 줄로 정한다. 같은 이름 프리셋은 그대로 보이며 구분하지 않는다고 가정으로 적어도 된다. | New |

### Summary

지금 코드와 대조한 결과 발행 화면의 누르는 단추, 탭 부품, 이탈 경고 세 가지(`use-unsaved-guard`, `use-unsaved-changes`, `unsaved-traverse-guard`), 자료 삭제 문장, 항목의 `id`·`tabIndex`는 설명한 대로이고, 팀장 결정 두 가지(Q1, Q2)도 차이로 정확히 표시됐다. 엔지니어링이 질문 없이 시작할 수 있어 READY로 본다. 다만 Q2로 바뀐 [답으로 돌아가기] 자리가 승인된 수락 기준과 어긋난 채로 남아 있어 먼저 정리해야 하고, 나머지는 작은 빈틈이다.
