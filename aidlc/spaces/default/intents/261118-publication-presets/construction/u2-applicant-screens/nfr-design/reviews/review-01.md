## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T08:22:35Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/nfr-design/security-design.md > 1. 본인 Catch 목록의 `publishable` (SQL 조건) | 「기록 문제 Catch를 SQL에서 미리 빼지 않는다」는 의도는 맞고, 기록 문제가 지금 본인 목록에서 500이 되는 것도 코드(`owner-catch-response.ts`의 보호 관측 검사)로 확인했다. 그런데 SQL 모양이 적혀 있지 않다. `READ_FROM`은 `repository_protection`을 LEFT JOIN으로 읽으므로 보호 관측이 없는 Catch는 `p.applied_restriction`이 NULL이다. 구현자가 `p.applied_restriction <> 'SOURCE_PRIVATE'`처럼 쓰면 NULL 줄이 조용히 빠져 500 대신 목록에서 사라진다. 같은 결과 시험은 정상 자료만 섞어 이 경우를 잡지 못한다 | 조건을 `p.applied_restriction IS DISTINCT FROM 'SOURCE_PRIVATE'`처럼 NULL을 남기는 꼴로 못 박고, 보호 관측이 없는 확인·공개 Catch가 `publishable=true`에서 500이 되는 시험을 한 줄 더한다 | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/nfr-design/security-design.md > 1 의사 코드의 「커서 범위」 줄 | 의사 코드는 커서 범위를 `[…, publishable]`로 항상 포함하는 것처럼 적었지만, 바로 아래 글은 `publishable`이 없으면 배열에 넣지 않는다고 한다. 지금 `cursorScope`는 공개 목록 커서도 함께 쓰는 한 함수(`Pick<CatchPageFilters, …>`)라, 의사 코드대로 읽으면 옛 커서가 깨진다 | 의사 코드를 「publishable이 있을 때만 배열 끝에 덧붙임」으로 고치고, 옛 커서(publishable 없음)가 그대로 받아들여지는 시험을 이름 붙여 적는다(공개 목록 커서는 건드리지 않음) | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/nfr-design/security-design.md > 4. 기록 남기지 않기 와 logical-components.md > 부품과 실패 범위 | web에서 `publishable=true`를 실제로 보내는 곳은 `web/src/features/assets/catch-api.ts`(필터 타입 `CatchListFilter`, 쿼리 조립 106행 부근, 클라이언트 쪽 걸러내기 73~74행)인데 두 문서의 부품·변경 파일 목록에 없다. 이 파일은 내 자산 화면도 쓰는 공용이라, 바꾸는 범위를 정하지 않으면 내 자산 화면의 쿼리가 달라질 수 있다 | 공용 파일로 부품 표와 NFR4.1 확인 대상에 넣고, `publishable`이 없을 때 쿼리가 지금과 같다는 점을 공유 항목에 적는다 | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/nfr-design/performance-design.md > 4. 저장 중과 그 뒤 | 첫 저장 뒤 `replaceState`가 「지금 GitHub 콜백 화면이 같은 방법」이라고 하지만, 콜백 화면은 같은 경로에서 쿼리만 지운다(`window.location.pathname` 그대로). 이 설계는 `/presets/new`에서 `/presets/{id}`로 경로가 바뀌어 같은 사례가 아니다. 또 저장 성공 뒤 상세를 다시 불러오는 동안 사용자가 자료를 더 담으면 그 응답이 글자 수·이유만 맞추는지 항목까지 덮는지가 적혀 있지 않다 | 근거 문장을 「쿼리가 아니라 경로를 바꾸는 점이 다르다」로 고치고, 화면 구성이 경로가 아닌 화면 상태의 프리셋 ID로만 정해지는지(경로·params를 읽지 않음) 시험으로 묶는다. 다시 불러온 응답은 글자 수·이유 칸만 갱신한다고 한 줄 정한다 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (선언된 도구 없음) | 해당 없음 | 직접 대조: 옛 커서 유효성(범위가 `publishable` 없을 때 지금 배열 그대로), 공개 목록 400(모르는 키), 기록 문제 500(`owner-catch-response.ts`), `catchIds`가 쓰이는 곳은 `publications-api.ts`·`publish-screen.tsx`이고 계약 P-2·기능 설계가 지우기로 정해 일치, `traceability.json`의 NFR 18개가 모두 설계 절에 대응 |

### Summary

세 설계 문서와 추적표는 NFR 요구 18개를 빠짐없이 덮고 현재 코드의 커서 범위·기록 문제 500·응답 해석과 모순이 없다. 막는 지적은 없고, SQL의 NULL 처리, 커서 범위 의사 코드, 공용 web 호출 파일 누락, 경로 변경 `replaceState` 근거를 코드 생성 전에 다듬으면 된다.
