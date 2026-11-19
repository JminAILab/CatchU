## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-19T14:07:38Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/contract-design/contract-summary.md > P-1 `POST /presets` 409 PRESET_LIMIT_REACHED | 질의응답(Q3 확정 요약)은 「지금 오류 코드 + 비공개 Catch용 새 코드 하나」라고 했는데, 산출물은 51번째 프리셋용 새 코드 PRESET_LIMIT_REACHED를 하나 더 추가한다. 지금 `error-codes.ts`에는 비슷한 한도 코드(LINK_LIMIT_REACHED 409 등)가 있어 같은 계열로 읽히지만, 사람이 확정한 「새 코드는 하나」와 숫자가 어긋난다. | 게이트에서 새 코드가 둘(CATCH_PRIVATE, PRESET_LIMIT_REACHED)임을 사람이 알고 승인하게 하거나, 51번째를 기존 코드(VALIDATION_FAILED 또는 LINK_LIMIT_REACHED 식의 409)로 돌린다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/contract-design/contract-summary.md > P-2 `POST /publications` 응답과 requestBody | 항목이 0개인 프리셋을 발행 요청에 넣었을 때 서버가 어떻게 답하는지 정해져 있지 않다. 요구사항 FR2.4는 화면에서 못 고르게 할 뿐이고, 계약의 400 violations 목록(presetIds 개수·중복, 항목 20개, 60,000자)에는 빈 프리셋이 없다. 프리셋 저장은 0개를 허용(P-1 「항목 0~20개」)하므로 이 경로가 실제로 열려 있다. 전부 빈 프리셋이면 발행본이 항목 0개가 될 수도 있다. | violations에 빈 프리셋(예: presetIds[i]·emptyPreset) 한 줄을 더하거나, U1 기능 설계 Open question에 올려 서버 거부를 확정한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/contract-design/contract-summary.md > P-2 `blockedSources`와 rules | 409에서는 `details.blockedSources`와 「지금처럼」 `details.catchIds`를 함께 싣고 400 추출 미완료는 violations(`items[i].sourceId`, 지금 `pdf-publish.ts:57-58`)와 blockedSources를 함께 싣는지 불분명하다. `items` 칸이 없어지므로 지금의 `items[{position}].sourceId` 경로는 의미가 없어진다. 또 `kind`에 TEXT_MATERIAL이 있으나 텍스트 자료가 막히는 이유(미확인·보호는 Catch 전용)는 없다. 같은 사실을 두 칸에 실으면 U2가 어느 쪽을 읽을지 갈린다. | U2가 읽을 칸을 blockedSources 하나로 정하고 catchIds를 유지하는지 여부와 추출 미완료 400의 violations 모양(유지·폐기)을 한 줄로 적는다. PresetDetail의 `unpublishableReason`(PRIVATE 등)과 발행 오류 코드(CATCH_PRIVATE 등)의 대응도 한 줄로 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/contract-design/contract-summary.md > P-1 POST /presets 51번째 검사 | 프리셋 50개 상한은 같은 회원이 동시에 두 번 만들 때 서버가 어떻게 지키는지(회원 행 잠금 등)가 계약에도 Open questions에도 없다. P-2의 잠금 질문만 올라 있다. | Open questions에 「51번째 거부와 동시 생성」 한 줄을 U1 기능 설계 몫으로 더한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 코드 대조 `web/src/features/publications/publications-api.ts` `isPublishedItem` (107~114행) | 모르는 칸을 검사하지 않음 | 「칸을 더해도 U3 전의 화면은 열린다」는 P-3 주장이 맞다 |
| 코드 대조 `api/src/common/errors/api-exception.filter.ts` `withDetails` (143~157행) | violations·existingRequestId·catchIds만 옮김 | blockedSources를 옮기는 칸 추가 필요(P-2 주장)가 맞다. 이 계약이 정확히 그 변경을 적고 있다 |
| 코드 대조 `api/src/publications/publish.service.ts` 206~256행, `pdf-publish.ts` 55~72행 | 현재 409 CONFIRMATION_REQUIRED·SOURCE_RESTRICTED(catchIds), 400 extractionIncomplete, 비공개 Catch는 PUBLIC으로 바꿈 | 「바뀌는 12월 계약」의 C-08(10월 공개 전환 로직 제거)과 막힘 코드 서술이 지금 코드와 맞는다 |
| 단위 의존 검증(U1→U2, U1→U3, U4 경계 없음) | 계약 P-1~P-6의 제공·소비 방향이 unit-of-work-dependency와 일치, 순환 없음 | 경계마다 스펙이 있다 |

### Summary

경계(P-1~P-6)는 제공 단위가 U1 하나로 정해져 있고, 지금 코드(오류 필터 허용 칸, 발행 거부 코드, web의 느슨한 사본 검사)와 승인된 상류 결정(ADR-002·003·006, FR5.1)에 어긋나는 곳이 없어 구현에 들어갈 수 있다. 남은 것은 새 오류 코드가 사람이 확정한 개수보다 하나 많다는 점, 빈 프리셋 발행 응답과 막힘 칸 중복 같은 U2가 읽을 응답 모양의 빈틈으로, 모두 U1 기능 설계에서 닫을 수 있는 Minor다.
