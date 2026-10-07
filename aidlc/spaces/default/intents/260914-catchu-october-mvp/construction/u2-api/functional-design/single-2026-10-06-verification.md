# 2026-10-06 u2-api 변경 기록 — 검증과 단독 실행 상태 (#219)

검사 위치는 `/Users/ljm/Desktop/github/CatchU`, 판본은 `37b50f055847f27d549f53e89029486dabd529c1`이다. 브랜치 `docs/링크-발급-빈도-제한-계약`의 PR·병합 전 변경을 [이번 질문](single-2026-10-06-questions.md)의 팀장(ljm0850) 결정 및 현재 계약과 대조했다. 계약·설계 산출물을 다시 쓰거나 저장하지 않았다.

## 결정·반영 대조

| 대상 | 확인한 내용 |
|---|---|
| BR2.12 logic | 같은 회원의 발급 빈도 상한 초과 시 입력 검사·비밀번호 해시·저장 없이 거부하는 조건을 맨 앞에 둠 |
| BR2.12 violation | 빈도 상한 초과 429 RATE_LIMITED와 남은 초의 Retry-After를 맨 앞에 둠 |
| functional-spec F6 | 발급의 0단계에 회원 발급 빈도 확인, 해시·저장 없이 429 RATE_LIMITED·Retry-After 반환 |
| 인증·멱등 경계 | contract-summary 117행이 회원 인증 다음 판정과 거부 시 링크·멱등 기록 없음, 같은 키 재요청을 명시. BR2.12·F6는 이 계약을 함께 적용 |
| 기존 규칙·추적 | BR2.12 source FR4.3·FR4.4 유지. FR4.3→BR2.12 BR2.14, FR4.4→BR2.12 BR2.13 유지. 발급 입력 길이·5개·제목 유일성·원자 발급·만료·중단 의미 유지 |
| 내부 구현·수신자 | 상한 예정값은 계약에 없음. api 배치 결정과 해시 N=2^15·r=8·p=3의 내부 구현 경계는 계약 질문 Q2에 기록. 수신자 unlock·조회 응답 집합 유지 |

다섯 파일의 원래 계약 변경은 37b50f0의 8행 추가·7행 삭제다. 이번 문서 기록은 그 변경을 재저장하거나 확장하지 않는다. NFR5 비용 통제와 #219의 해시 계산 전 요청 거부 필요성에 연결하며 실제 보호 구현 성공으로 세지 않는다.

## 검증과 보존

Ruby YAML.safe_load·JSON 파서와 Python/git 바이트 비교를 사용했다. 센서·명령 결과 원문은 [공통 도구 기록](../../../inception/contract-design/single-2026-10-06-tools.json)에 남긴다. 관련 계약 대조는 [계약 검증](../../../inception/contract-design/single-2026-10-06-verification.md)을 함께 따른다.

| 항목 | 결과 |
|---|---|
| rules YAML·추적 JSON | YAML 1개 블록·규칙 15개 파싱, BR2.12 source 및 FR4.3·FR4.4 연결 PASS |
| 계약 YAML·참조·응답 | YAML 4개·요약 블록 3개·$ref 203개 PASS, 발급·unlock·조회 응답 집합 일치 |
| 산출물·과거 기록 | 산출물 15개·과거 질문/검증/review 33개가 37b50f0과 바이트 동일 |
| required-sections | entities H2 4개·rules 3개·functional-spec 10개, 모두 findings 0·pass true |
| upstream-coverage | consumes 5개와 entities·rules·functional-spec 명시, unreferenced 빈 배열·pass true |
| traceability | pass false, 기존과 같은 missing_from_upstream_ids 23개. gaps·orphans·missing_from_table·invalid_entries·invalid_targets는 빈 배열 |
| 제품 검사 | 해당 없음: 이번 실행은 문서 기록. API·DB 시험·해시 성능 측정·배포 시험은 수행하지 않음 |
| 보존 | 본 흐름 Completed·relaxed·Unit 상태·aidlc-state.md·12월 intent·docs/·하네스·2.10.0 유지. 감사 착수 prefix와 미커밋 세션 기록 보존 |

```text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md --stage functional-design
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md --stage functional-design
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md --stage functional-design
aidlc engine sensor-upstream-coverage --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md --stage functional-design --consumes unit-of-work,unit-of-work-story-map,requirements,components,contract-summary --deliverables entities,rules,functional-spec
aidlc engine sensor-traceability --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/traceability.json --stage functional-design
```

추적 센서 원문:

```json
{"pass":false,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":["FR1.2","FR1.3","FR10","FR10.1","FR10.4","FR10.5","FR10.6","FR2","FR2.1","FR2.2","FR3.3","FR3.6","FR5","FR5.1","FR5.5","FR6.1","FR6.6","FR7.1","FR7.4","FR8.1","FR8.4","FR9.1","FR9.2"],"invalid_entries":[],"invalid_targets":[],"findings_count":23}
```

누락 목록과 다른 오류 배열 없음은 10/5 검증 원문과 동일하며, 그 문서가 대조한 9/30·9/24의 기존 한계를 유지한다. 이번 FR4.3·FR4.4 연결을 바꾸거나 실패를 PASS로 표시하지 않는다.

## 요약 확인·검토·완료 상태

u2-api 기록을 위해 `aidlc engine orchestrate next --stage functional-design --single`과 반환된 continue 두 번을 실행해 새 단독 실행을 열었다. 본 흐름 next와 Unit lifecycle 명령은 실행하지 않았다. 이번 질문의 별도 요약 확인 뒤 검토 요청·report --single을 각각 한 번만 실행한 결과는 아래에 기록한다.

새 기록과 기존 미커밋 세션 기록을 포함한 10월 감사 파일을 한 커밋으로 남기고 push하지 않는다. u1-web 산출물은 변경하지 않았다. 도구가 다른 Unit 폴더에 검토 사본을 만들면 경로와 u2-api 사본이라는 뜻을 기록하고 그대로 보존한다.

## 이번 요약 확인·독립 검토·완료 결과

- 2026-10-06T06:28:22Z: 새 single-stage:functional-design 시작, attempt `e4799f6afb2b8f27`. 본 흐름 Unit 상태는 변경하지 않았다.
- 별도 사용자 응답 `Looks correct` 뒤 2026-10-06T06:39:26Z 요약 확인 영수증 성공. 계약 확인에 사용된 HUMAN_TURN을 재사용하지 않았다.
- 2026-10-06T06:39:30Z 검토 요청 1회 성공. requestId `review:2d9870963d4b38d4edc5ca5dcacc5792`.
- aidlc-architecture-reviewer-agent 독립 검토 1회: **READY, 신규 지적 없음**. YAML·$ref 203개·응답 집합·BR2.12/F6·FR4.3/FR4.4를 독립 대조하고 전달된 계약 5개·u2-api 산출물 4개가 37b50f0과 같은지 확인했다. 센서는 전달된 실행 원문을 대조하고 중복 실행하지 않았다. 기존 traceability FAIL 23개는 보존했다.
- 검토 종료 영수증 REVIEW_COMPLETED 성공 후 report --single을 한 번만 실행해 kind:done을 받았다. 단독 실행만 완료됐으며 본 흐름 Current Stage는 그대로다.

요약 확인 원문:

```json
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"functional-design","summary_authorization_id":"593bf18999f8995eb3304c8bb35ddcb17dbdf0dc72ade6440e17f8d38255ee73"}
```

검토 요청 원문:

```json
{"emitted":"REVIEW_REQUESTED","stage":"functional-design","requestId":"review:2d9870963d4b38d4edc5ca5dcacc5792","reviewFile":"aidlc/spaces/default/intents/260914-catchu-october-mvp/.aidlc-engine/reviews/functional-design/stage/e4799f6afb2b8f27/1.review.md","recordVerdict":"aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict '<READY|NOT-READY>' --project-dir /Users/ljm/Desktop/github/CatchU","change_notices":["aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/traceability.json was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off)."]}
```

검토 종료 기록 원문:

```json
{"emitted":"REVIEW_COMPLETED","stage":"functional-design","reviewRecord":".aidlc-engine/reviews/functional-design/stage/e4799f6afb2b8f27/1.json","reviewMarkdown":"construction/u1-web/functional-design/reviews/review-04.md"}
```

단독 완료 결과 원문:

```json
{"kind":"done","reason":"Single-stage run of \"functional-design\" committed under synthetic workflow \"single-stage:functional-design\". The main workflow's Current Stage is untouched."}
```

CHANGE_ACCEPTED 4개는 감사와 위 검토 요청 원문에 그대로 남겼다. 이번 실행에서 네 산출물을 다시 쓰거나 저장했다는 뜻으로 해석하지 않으며, 알림을 없애는 재저장·설정 변경은 하지 않았다. SUMMARY_ARTIFACT_UNAUTHORIZED는 반환되지 않았다.

공식 검토 기록은 `.aidlc-engine/reviews/functional-design/stage/e4799f6afb2b8f27/1.json`이다. 도구가 반환한 읽기용 검토 사본은 `construction/u1-web/functional-design/reviews/review-04.md`이며 파일 내용은 **u2-api** 검토다. 경로를 이동하거나 내용을 다시 쓰지 않았고 u1-web 검토·산출물 변경으로 세지 않는다. 계약 단계의 검토/완료 거부와 이 u2-api 단독 완료는 별도 결과다.

## 최종 보존·커밋 범위

검토·단독 완료 처리 후에도 계약·각 Unit 설계 산출물 15개와 과거 질문·검증·review 33개는 37b50f0과 바이트 동일하다. 착수 시 추적 파일 939개 중 기존 변경은 10월 감사 파일 한 개이며 그 착수 prefix와 기존 미커밋 세션 기록은 그대로다. 12월 intent 및 과거 도구 review 기록 39개도 착수 SHA-256과 동일하다. 본 흐름 aidlc-state.md·Completed·relaxed·Unit 상태·docs/·하네스·2.10.0은 변경하지 않았다. aidlc-state.md를 커밋 대상에 넣지 않는다.

커밋 범위는 이번 질문 2개·검증 2개·공통 도구 기록 1개·도구의 u2-api 검토 읽기용 사본 1개·10월 감사 1개, 총 7개 파일이다. 별도 `.local-handoffs/`는 제외한다. 사용자 지정 메시지로 한 커밋을 남기며 push하지 않는다. 계약 단독 실행은 열린 상태, u2-api 단독 실행은 완료 상태로 구분한다.
