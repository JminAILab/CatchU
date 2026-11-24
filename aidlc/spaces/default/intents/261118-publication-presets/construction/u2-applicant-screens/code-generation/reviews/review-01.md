## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T09:04:12Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/code-generation/code-summary.md > 이 단계에서 돌리지 않은 시험 / web/src/features/presets/preset-editor-screen.tsx > save() 첫 저장 뒤 deps.replaceUrl | 첫 저장 뒤 `window.history.replaceState`가 Next 16에서 화면을 다시 만들지 않는다는 점(NFR 설계 Q1 A의 핵심 전제)은 서버 렌더링 시험이 마운트 효과를 돌리지 않아 코드 생성 단계에서 확인되지 않았다. 시험은 `replaceUrl` 의존성을 가짜로 바꿔 PUT 전환만 증명한다. 모델 상태가 `useState`에 있어 화면이 다시 만들어지면 입력이 사라질 수 있다. | Build and Test에서 브라우저로 새 프리셋 저장 후 이름·담은 자료가 그대로 남고 다음 저장이 PUT인지, 새로고침·뒤로가기도 정상인지 확인하고 결과를 기록한다. | New |
| R-02 | Minor | web/test/presets.test.mjs > NFR4.1 프리셋 화면 파일은 console을 부르지 않는다 | NFR4.1 기계 확인이 `features/presets/`만 훑는다. 이 단위가 고친 `features/publications/`·`lib/api-response.ts`·`features/assets/catch-api.ts`·api 두 파일은 시험으로 묶이지 않았다. 이번 검토에서 직접 grep으로 `console.`·`Logger` 0건을 확인했으나 이후 변경에서 되살아날 수 있다. | 이름·제목·ID가 오가는 `features/publications/`까지 같은 검사를 넓히거나, 범위를 의도했다면 시험 이름에 그 범위를 적는다. | New |
| R-03 | Minor | web/src/features/publications/publications-api.ts > PDF_EXTRACTION_INCOMPLETE_TEXT, 코드 요약 계획과 다른 점 4·5 | 발행 화면 문구에서 「PDF 목록을 다시 불러온 뒤…」와 「발행본 전체 글이 상한을 넘었을 수도 있습니다」를 뺀 것은 근거(발행 화면에 PDF 목록이 없어짐, 400 `presetIds`로 따로 안내)가 있고 시험도 있으나, 승인된 기능 설계 문구와의 차이가 설계 쪽에는 기록되지 않았다. | Build and Test 기록에 이 문구 차이를 한 줄 남겨 사람이 승인 때 보게 한다(코드 변경 불필요). | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `(cd web && node --test test/presets.test.mjs test/publish.test.mjs test/api-response.test.mjs)` | tests 58, pass 58, fail 0 | 계획 표의 web 쪽 행(두 번째 저장 PUT, 늦은 응답 버리기, 막힘 줄, `blockedSources` 해석, BR4.2 이유 순서)에 대응하는 시험이 있고 통과한다. 코드 요약의 수치(58건)와 같다. |
| `TEST_DB_PORT=5433 npm --prefix api test -- test/catches/publishable-filter.test.cjs test/catches/owner-catch-http.test.cjs` | tests 63, pass 63, fail 0 | `IS DISTINCT FROM`의 NULL 보호(기록 문제 500), 옛 커서 호환·조건 다른 커서 400, `eligibility.ts`와 같은 결과 집합, 공개 목록 400이 모두 통과한다. |
| 기록 남기지 않기 grep(`console.`·`Logger`) | `web/src/features/presets`, `features/publications`, `(member)/presets`, `api-response.ts`, `catch-api.ts`, api 두 파일에서 0건 | NFR4.1 충족. |

### Summary

앞 단계 검토에서 넘어온 계획 표의 항목(replaceState와 상태 ID로 정하는 모드, 늦은 응답 세대 번호, `IS DISTINCT FROM`, 커서 범위를 `publishable`이 있을 때만 덧붙임, `blockedSources` 세 칸 해석, 저장 뒤 글자 수·이유만 맞춤, 로그 금지)이 코드와 시험 양쪽에서 확인되고 BR4.2 이유 순서·BR4.6 막힘 줄도 규칙과 일치한다. 계획 밖 파일 둘(`member-navigation.ts`, `u9-recipient-claude.test.mjs`)은 각각 web README의 복귀 허용 규칙과 확인 단계 부품의 칸 이름 변경에서 비롯한 한 줄 수정으로 단위와 관련이 있다. 남은 것은 브라우저에서만 확인되는 replaceState 동작 등 Minor뿐이라 READY다.
