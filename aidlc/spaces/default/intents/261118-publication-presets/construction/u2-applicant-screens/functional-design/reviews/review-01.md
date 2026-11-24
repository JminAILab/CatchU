## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T07:32:06Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/functional-design/functional-spec.md > 흐름 2 「저장」 결과 표의 201(만들기) 줄 | 새 프리셋 첫 저장 뒤 주소를 `/presets/new`에서 `/presets/{presetId}`로 바꾸고 「저장했습니다.」를 보인다고 했다. 그런데 두 주소는 서로 다른 페이지 파일이라(`presets/new/page.tsx`, `presets/[presetId]/page.tsx`) 주소를 바꾸면 편집 화면이 새로 만들어진다. 그러면 「저장했습니다.」 상태와 이미 불러온 고르기 목록 셋·글자 수 세기 결과가 사라지고, 화면이 다시 불러오는 중으로 돌아간다. 상태 다이어그램의 saved 상태와 M3의 「저장됨: 편집 화면에 남고」를 어떻게 지킬지 설계에 없어 개발자가 추측해야 한다. | 첫 저장 뒤에 화면이 새로 만들어지지 않게 하는 방법(예: 한 편집 화면을 두 주소가 함께 쓰고 주소만 기록 없이 바꾸는 방식)이나, 새로 만들어져도 「저장했습니다.」를 이어 보이는 방법 중 하나를 정해 적는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/functional-design/frontend-components.md > 새 기능 폴더 presets / 상태·입력·API 한눈에 | 편집 화면의 Catch 작은 줄은 「저장소 이름 · 설명 안 씀 · 불일치 표시됨」을 그대로 쓴다고 했다(functional-spec 열린 항목). 저장소 이름은 지금 발행 화면이 저장소 목록을 따로 불러와(`createRepositoryOptionsStore`) 찾는다. 그런데 발행 화면은 그 불러오기를 없애는 것으로 적었고, 편집 화면의 부품·API 표에는 저장소 목록 호출이 없다. 누가 이름을 찾는지 비어 있다. | 편집 화면이 저장소 목록을 불러와 `repositoryId`로 이름을 찾는다고 부품 표와 API 줄에 적는다(실패하면 이름만 뺀다는 지금 규칙 포함). | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/functional-design/frontend-components.md > api `api/src/catches/` 표 와 web 변경 목록 | web의 본인 Catch 호출 `web/src/features/assets/catch-api.ts`(`CatchListFilter`, `list`, `matchesFilter`)가 `publishable=true`를 보낼 수 있게 고쳐야 하는데 변경 목록에 없다. 내 자산 화면도 같은 호출을 쓴다. api 쪽도 `pageFilters`가 공개 목록과 공유돼 `publishable`이 공개 목록에서 받아지는지, 커서 범위 해시에 칸을 더하면 이미 받은 커서가 모두 400이 되는지(없을 때는 해시를 그대로 두는지)를 정하지 않았다. 보호 정보가 없는 Catch는 지금 목록에서 500인데 `publishable=true` SQL은 조용히 빼 버릴 수 있어 같은 결과 시험의 범위도 정해야 한다. | `catch-api.ts` 변경을 목록에 더하고, `publishable`은 본인 목록에서만 받으며(공개 목록은 400), 쿼리가 없을 때 커서 범위가 그대로라는 것, 보호 정보가 없는 Catch의 결과를 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/functional-design/functional-spec.md > 흐름 3 「제목과 확인」과 frontend-components.md > publications-api.ts | `publishDraftErrors`(항목 1~20개 안내 문구, `itemCount`), `PUBLISH_LIMITS.items`, `FIELD_TEXT.items`가 프리셋 1~5개 기준으로 어떻게 바뀌는지 없다. 프리셋을 0개 골랐을 때 문구가 정해져 있지 않고, 「[다음]은 … 쓸 수 있다」는 지금 동작(눌렀을 때 안내, 막지 않음)과 막아 두는 것 중 어느 쪽인지 읽기 나뉜다. | 프리셋 0개·6개 때 [다음]의 동작과 안내 문구를 적고, 위 상수와 문구를 바꾸는 것으로 변경 목록에 더한다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/functional-design/frontend-components.md > 발행 화면 표의 README.md 줄 | README는 오류 표의 409 줄과 요청 모양만 바뀐다고 했다. 실제 `web/src/features/publications/README.md`에는 고르기 목록, 비공개 공개 전환 안내, 「저장소마다 3~5개」 안내, 확인 단계의 작성자 설명 없는 Catch 안내, 항목 1~20개 입력 규칙, 404·400 줄이 있어 모두 이 설계와 어긋난다. api의 `catch-owner-read-preparation.md`도 쿼리 한 줄이 아니라 표 줄·커서 범위·필터 설명 세 곳이다. | 함께 고칠 문서 줄을 위 곳들까지 넓혀 적는다. | New |
| R-06 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/functional-design/functional-spec.md > 흐름 2 「상태」 다이어그램과 바로 아래 문장 | 다이어그램은 `deleting --> clean: 실패`이고 아래 문장은 「지우기 전 상태로 돌아간다(바뀐 입력이 있었으면 바뀜 그대로)」라서 서로 다르다. 또 이름이 빈 새 프리셋의 clean 상태에서 [저장]을 눌렀을 때와, 저장 중에 담기·순서를 바꿨을 때(성공 뒤 상세를 다시 불러 덮어쓰는지)가 없다. 저장 404는 「목록을 다시 불러와 주세요」인데 편집 화면에는 다시 불러오는 조작이 없다. | 다이어그램을 문장과 맞추고, clean에서의 [저장], 저장 중 입력 잠금 여부, 저장 404 뒤 사용자가 할 수 있는 일을 한 줄씩 정한다. | New |
| R-07 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/functional-design/frontend-components.md > 접근성(interaction-spec 대조) | 대조 표에 목록의 [새 프리셋](50개일 때 막힘)과 편집의 <프리셋 목록으로>가 없다. [새 프리셋]이 링크인지 단추인지 정하지 않아, 링크면 막힘을 `disabled`로 만들 수 없다. 막힘 안내와 막힌 요소의 읽힘·Tab 순서를 개발자가 정해야 한다. interaction-spec에도 이 요소는 없다. | 두 요소의 역할과 막힘 때 키보드·낭독 동작을 표에 더한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json 대조(stories.md AC 목록) | US1.1~US1.6, US2.1, US2.2, US2.4의 AC 40개가 모두 있고 매핑한 BR이 rules.md에 있음 | 빠진 AC 없음. N/A 4건(AC1.2.8·1.4.4·1.5.3·2.1.4·2.4.2)은 U1 담당으로 근거가 맞음 |
| 현재 코드 대조(publish-view.tsx, publications-api.ts, api-response.ts, member-header.tsx, routes.ts, owner-catch-input.ts, owner-catch-store.ts, publishable-source/eligibility.ts) | 설계가 적은 현재 표시·문구·판정 순서·`catchIds` 처리·메뉴 활성 판정이 코드와 일치 | 위 Minor 항목 외에 코드와 어긋난 서술은 못 찾음 |
| U1 API 문서 대조(api/docs/presets.md, publications.md) | 요청·응답 칸, 오류 코드, `blockedSources` 모양, 400 위반 칸 이름이 일치 | 경계는 맞음 |
| interaction-spec 대조 | 역할·키보드·초점 규칙이 일치하고 어긋남을 만든 곳 없음 | 위 접근성 Minor는 대조 표에 빠진 요소에 한함 |

### Summary

경계(U1 API와 `blockedSources` 계약), 화면 규칙, 현재 코드 서술, 추적 매핑은 대체로 맞다. 가장 큰 구멍은 새 프리셋 첫 저장 뒤 주소 전환에서 화면이 새로 만들어져 「저장했습니다.」와 불러온 목록이 사라질 수 있다는 점(Major 1개)이고, 나머지는 변경 목록과 문구를 채울 Minor다. 개발자가 코드 계획에서 보완하면 구현할 수 있어 READY다.
