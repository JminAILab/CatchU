# 2026-09-30 u1-web 사후 기록 — 검증과 단독 실행 상태

이미 dev에 병합된 #173(`a2649c6`)의 수신자 차단 안내 한 행을 [#150 팀장 결정](https://github.com/JminAILab/CatchU/issues/150#issuecomment-5883572995), [이번 질문 파일](single-2026-09-30-questions.md)과 현재 계약에 대조했다. 이번 실행에서 산출물을 수정하거나 다시 저장하지 않았다.

## 반영·검증

검사 위치는 `/Users/ljm/Desktop/github/CatchU`, 기준 dev·HEAD는 `a2649c6`이다.

| 항목 | 결과 |
|---|---|
| #173 변경 범위 | 첫 부모 대비 functional-spec.md의 줄 수는 같고 「화면 상태 전이」의 수신 접근 행 하나만 다름 |
| 차단 표시 | LINK_UNLOCK_LIMITED를 차단 안내로 표시하고 Retry-After의 남은 시간을 표시함. 차단을 비밀번호 오류로 표시하는 것을 금지함 |
| 계약 대조 | 수신자 unlock의 429 LINK_UNLOCK_LIMITED·Retry-After 남은 초와 일치. 기존 LINK_UNAVAILABLE 및 401 비밀번호 분기를 유지 |
| 파일 보존 | functional-spec.md·traceability.json은 dev와 바이트 동일. 착수 시 추적 파일 176개 해시와 비교해 감사 파일 외 기존 파일 변경 없음 |
| required-sections | functional-spec H2 7개, findings 0, pass true |
| upstream-coverage | unit-of-work·unit-of-work-story-map·requirements·components·contract-summary의 5개 참조 누락 0, pass true |
| traceability | pass false/findings 43: 전역 FR 20개 누락, 화면 W 대상 22개에 BR 식별자를 요구, rules.md 부재. gaps·orphans·missing_from_table·invalid_entries는 비어 있음 |
| 기존 한계 대조 | [9/24 검증](single-2026-09-24-verification.md)의 동일한 web 43건과 일치. ui Unit은 entities/rules를 만들지 않는 기존 적용을 유지하며 가짜 규칙·추적 항목을 추가하지 않음 |
| linter/type-check | 해당 없음: TS/JS/TSX 코드 변경·생성 없는 문서 사후 기록 |
| 실제 화면·API 연결 | 미수행: 문서 정합성 대조이며 제품 동작 검증으로 보고하지 않음 |

## 요약 확인·검토·완료 기록

- 앞선 u2-api 단독 실행은 2026-09-30T02:52:26Z에 완료됐다. 이후 새 `single-stage:functional-design` 실행을 열었고 이번 attempt는 `b30dec05fd8ace46`이다. u1-web의 지정 범위만 검토한다.
- 04:19:56Z의 이번 세션 HUMAN_TURN 뒤 04:22:25Z에 SUMMARY_CONFIRMATION_RECORDED 성공. Looks correct, 확인 식별자 `7729dc00a3248690810fc4bd6cba61173b6ac883f38d820e1b945cdd74cd6af8`.
- 04:22:26Z: `aidlc engine log review --stage functional-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1` 성공. 요청 `review:eb3ae9d3ebdf77392bc71f4f5fec2d4a`.
- 독립 검토 결과: **READY, 신규 의견 없음**. 화면 차단 안내·Retry-After 표시와 기존 401/404 분기·권한 보호가 #150 결정 및 현재 계약과 일치한다. 검토자는 화면 흐름 W1~W8에 대한 추적 대상도 대조했다.
- 같은 검토 명령에 `--verdict READY`를 추가해 REVIEW_COMPLETED 성공. 공식 record는 `.aidlc-engine/reviews/functional-design/stage/b30dec05fd8ace46/1.json`, 도구가 생성한 읽기용 사본은 `construction/u1-web/functional-design/reviews/review-02.md`다. 무시 대상 원본을 강제로 추가하지 않는다. 아래에 검토 원문도 보존한다.
- `aidlc engine orchestrate report --single --stage functional-design --result completed`를 한 번 실행해 `kind: done`을 받았다. 메시지는 `Single-stage run of "functional-design" committed under synthetic workflow "single-stage:functional-design". The main workflow's Current Stage is untouched.`이며 이번 단독 실행은 완료됐다.

## 사후 기록 알림과 보존

functional-spec.md·traceability.json에 CHANGE_ACCEPTED가 반환됐다. 두 파일 경로의 앞부분은 `aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/`이다.

```text
functional-spec.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).
traceability.json was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).
```

이전 저장 기록과 이번 확인의 차이를 그대로 남겼다. 알림 해소를 위한 재저장·추가 확인·설정 변경은 없고 검토 요청에서 SUMMARY_ARTIFACT_UNAUTHORIZED는 발생하지 않았다. 앞선 u2-api 검토의 도구 사본은 같은 web reviews/review-01.md 경로에 생성됐으므로 u2-api 검증 문서에 그 검토 원문을 보존했다. 이번 web의 검토와 혼동하지 않는다.

본 흐름 Completed·relaxed, 2.10.0, 12월 intent, docs/, 과거 질문·검증·승인을 보존한다. 상태·감사를 직접 고치지 않았으며 감사의 기존 후행 공백도 보존했다. 실제 제품 구현·이슈 종료·PR 병합은 이번 작업에 포함하지 않는다.

최종 커밋 전 확인: 계약 YAML·계약 요약과 세 유닛의 functional-spec·rules·entities·traceability 중 존재하는 산출물 15개 모두 dev diff가 비어 있다. 착수 해시 대비 기존 추적 파일은 감사 외 동일하고, 상태 파일은 HEAD 대비 허용된 Change Control → Guard Policy 한 줄만 다르며 Completed를 유지한다. 새 질문·검증 6개의 확인 답변·필수 요약 문장·문자·후행 공백 검사도 통과했다. 커밋 범위는 이 6개와 도구가 생성한 review-01.md(u2-api)·review-02.md(u1-web), 허용된 상태 파일·10월 감사 파일 총 10개다. 9/23 이후 감사는 같은 기록 파일에 누적된 미커밋 세션 이력을 보존하라는 사용자 지시에 따라 함께 포함한다.

아래는 도구가 보존한 이번 독립 검토의 원문 사본이다.

## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-09-30T04:24:25Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|

지정된 #173의 u1-web 사후 기록 범위에서 새 제품 정합성 결함은 발견하지 않았다. 산출물 수정은 수행하지 않았다.

### 검토 근거

- 확인된 `construction/u1-web/functional-design/single-2026-09-30-questions.md`, functional-spec.md, traceability.json을 읽고 공유 Unit 정의·FR 매핑·요구사항·구성요소·계약과 대조했다. 같은 세션에서 읽은 공통 지식과 [#150 결정 댓글](https://github.com/JminAILab/CatchU/issues/150#issuecomment-5883572995)의 GitHub API 확인 결과를 재사용했다. 이번 검토에서 다른 Unit의 construction 파일을 읽지 않았다.
- `git diff a2649c6^1 a2649c6 -- <u1-web의 functional-spec.md>`로 확인한 변경은 「화면 상태 전이」의 수신 접근 행 하나다. LINK_UNLOCK_LIMITED를 차단으로 안내하고 Retry-After의 남은 시간을 표시하며 차단을 비밀번호 오류로 표시하지 않도록 추가했다. 이는 #150에서 401 비밀번호 오류 안내와 차단을 구별하려고 429를 신설한 결정과 일치한다.
- 공유 contract-summary.md의 「P — 수신자 API」·오류 표와 common.yaml의 RetryAfter·Error429는 429 LINK_UNLOCK_LIMITED 및 차단 해제까지 남은 초를 Retry-After 헤더로 정의한다. 수신 접근 행은 그 헤더를 소비하며 오류 본문이나 grant 응답에 새 필드를 요구하지 않는다. recipient-api.yaml의 unlock 응답이 Error429를 참조한다.
- 기존 LINK_UNAVAILABLE의 없는/중단/만료 공통 안내, LINK_PASSWORD_REQUIRED/LINK_PASSWORD_INVALID의 비밀번호 분기, 상세 사유 노출 및 grant만으로 현재 권한 우회 금지는 보존됐다. W7과 API 소비 경계는 api의 현재 접근 판정을 표시하는 web 책임을 유지한다. 429를 GET의 새 응답으로 추가하거나 화면이 접근 권한을 독자 판정하도록 바꾸지 않았다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-required-sections | PASS: functional-spec H2 7개 | 기본 문서 구조 충족. |
| sensor-upstream-coverage | PASS: 상류 5개, 누락 0 | functional-spec을 대상으로 consumes와 deliverables를 명시해 실행했다. |
| sensor-traceability | FAIL: findings_count 43 | missing_from_upstream_ids 20개, BR 대상 요구 22개, rules.md 부재 1개. 기존 ui 산출물 적용과 센서 간 한계이며 아래에 해석을 남긴다. |
| JSON 파싱 및 화면 흐름 ID 대조 | PASS: coverage 22행의 모든 W1~W8 대상이 functional-spec에 존재 | 실재하는 화면 흐름을 참조하며 가짜 BR ID를 추가하지 않았다. |
| git show dev 바이트 비교 | PASS: functional-spec.md·traceability.json 동일 | 기존 제품 산출물 보존. |
| 병합 diff 대조 | PASS: 수신 접근 행 하나 변경 | 기록한 범위와 #173의 u1-web 변경이 일치한다. |
| linter / type-check | N/A | 해당 TS/JS 코드 산출물이 없는 문서 검토다. |
| 실제 화면·API 연결 시험 | 미수행 | 구현 동작이나 배포 검증을 주장하지 않는다. |

traceability 센서의 missing_from_upstream_ids는 FR1.2, FR1.3, FR10, FR10.1, FR10.4, FR10.5, FR10.6, FR3.3, FR3.6, FR5, FR5.1, FR5.5, FR6.1, FR6.6, FR7.1, FR7.4, FR8.1, FR8.4, FR9.1, FR9.2다. 공유 Unit 매핑에서 Deferred/N/A인 항목들로, 현재 web 관련 FR 22개를 추적하는 표의 이번 변경 누락으로 보지 않는다. gaps/orphans/missing_from_table/invalid_entries는 모두 빈 배열이다.

나머지 23개는 센서가 모든 target에 BRx.y를 요구하고 rules.md를 찾기 때문에 발생한다. stage 정의의 produces_kinds 및 공유 unit-of-work.md는 ui인 U1에 functional-spec·traceability를 적용하고 entities·rules를 요구하지 않는다. 해당 표의 W1~W8은 실제 화면 흐름 ID로 확인했다. 이 결과는 PASS로 바꾸지 않고 기존 검증 한계로 기록하며, 이번 사후 기록을 위해 산출물이나 센서 설정을 수정하지 않는다.

### Summary

#173의 수신 접근 행은 #150의 차단 안내 결정과 현재 429·Retry-After 계약에 일치하며 기존 401/404 분기와 권한 보호를 유지한다. 지정된 사후 정합성 기록 범위는 READY이며 실제 화면 구현의 완료를 인증하지 않는다.
