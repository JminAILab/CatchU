## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T12:08:45Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/nfr-requirements/traceability.json > coverage NFR1·NFR4·NFR5 | 요구사항의 NFR4는 「이름·자료 내용을 로그에 남기지 않음」, NFR5는 「불러오는 중·비었음·실패를 다른 화면으로 보이고 조회 실패를 0건으로 보이지 않음」인데, 이 단위는 NFR4.1·NFR4.2(응답 칸 선별·모양 검사)와 NFR5.1~NFR5.5(요청 수·패널 유지·열린 탭 유지)를 같은 번호 아래 OK로 묶었다. 번호만 겹치고 내용이 달라, 상류 NFR5가 이 단위에서 덮였는지 읽는 사람이 판단할 수 없다. NFR1.2(깜빡임 없음)도 접근성 항목 아래 있다. | 이 단위 요구에 상류와 겹치지 않는 번호(예: UNFR-…)를 붙이거나 추적 표에 상류 문장과 이 단위 요구의 대응을 풀어 적는다. 상류 NFR5의 「조회 실패를 0건으로 보이지 않음」은 NFR4.2가 덮는다고 NFR5 줄에 명시하고, 나머지 요구는 상류 번호 없는 이 단위 요구로 분리한다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/nfr-requirements/performance-requirements.md > NFR5.1·NFR5.2·NFR5.3 확인 칸 + tech-stack-decisions.md > 시험 | 확인 방법을 「화면 시험: 요청 0」「같은 부품 인스턴스·PDF 요청 수 그대로」로 적었지만, 기술 결정은 서버 렌더링 시험(`u2-render.mjs`)과 순수 함수 시험만 있고 브라우저 시험 도구가 없다고 한다. 서버 렌더링으로는 탭 전환 중 요청 수나 부품이 다시 만들어졌는지를 잴 수 없다. 이 세 요구는 시험할 수단이 지정되지 않았다. | 각 요구가 어느 수단으로 확인되는지 적는다(예: 탭 바꾸기를 상태 함수로 빼 패널을 `key`·`hidden`만 바꾸는 렌더 결과를 서버 렌더링으로 대조, 요청 수는 PDF 가져오기 함수 호출 수를 주입해 센다). 그렇게 못 하는 항목은 사람이 로컬에서 확인한다고 표에 명시한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/nfr-requirements/security-requirements.md > NFR4.2 | 응답 검사가 `presetName`은 「글자」, `presetOrdinal`은 1~5 정수만 요구한다. 빈 문자열이면 이름 없는 탭이 생기고(화면 낭독기가 읽을 이름 없음), 같은 순번에 이름이 서로 다른 항목이 섞인 응답이나 매우 긴 이름은 정해진 처리가 없다. 요구사항 FR1.4는 이름 1~50자다. | NFR4.2에 `presetName`이 비어 있지 않음을 더하고(상한 50자는 계약이 보장하므로 화면은 CSS 말줄임으로만 방어), 같은 `presetOrdinal` 항목 사이의 이름이 다를 때는 첫 항목 이름을 쓴다고 정한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u3-reader-views/nfr-requirements/performance-requirements.md > NFR5.4 | 「항목 최대 20개라 지금과 같은 양」이라고 적었다. 같은 자료가 두 프리셋에 있으면 두 번 세어 발행 상한이 20개이므로 맞지만, 열리지 않은 패널의 텍스트 자료 본문(전체 글 60,000자)도 숨긴 채 DOM에 그려진다는 점은 적지 않았다. | 숨긴 패널의 글도 DOM에 있어 화면 낭독기·페이지 내 찾기에는 `hidden`으로 빠지는지 한 줄로 확인해 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (none declared) | 해당 없음 | 이 단계에 선언된 검증 도구가 없다. `recipient-api.ts` `pickItem`이 지금 칸을 골라 옮기고(L27~62) `isPublishedItem`이 `publications-api.ts` L110에 있음을 직접 확인했다. |

### Summary

새 경로·저장·외부 호출이 없는 화면 단위라 보안·성능 요구는 대체로 코드·계약 P-3과 맞는다. 다만 요구 번호가 상류 NFR과 겹치면서 뜻이 달라 추적이 흐리고, 요청 수·부품 유지 요구의 확인 수단이 지정되지 않았다(Major 2건, 허용 범위 안이라 READY).
