# 2026-10-05 u2-api 변경 기록 — 검증과 단독 실행 상태

PR·병합 전 `f1cb8d9deeae09b68d534f3437895cc9ff7fe8b1`의 발급 입력 길이 변경을 [이번 질문 파일](single-2026-10-05-questions.md)의 팀장 결정 및 현재 계약과 대조했다. 브랜치는 `docs/링크-발급-입력-길이-계약`, 분기 기준은 `00e9753cd9b26e76d3de09beac9de4412de4ed6f`다. 이번 실행에서 산출물을 수정하거나 다시 저장하지 않았다.

## 결정·반영 대조

| 대상 | 현재 파일 대조 |
|---|---|
| BR2.12 statement | 발급 입력 길이 확인을 규칙의 역할에 추가 |
| BR2.12 logic | 제목 trim 후 1~50자, 선택 비밀번호 입력 그대로 8~64자, 유니코드 코드 포인트 계산. 기존 원자 발급·유효 링크 수·제목 유일성·만료·중단 의미 유지 |
| BR2.12 violation | 길이 위반 400 VALIDATION_FAILED 추가. 기존 409·404 의미 유지 |
| BR2.12 source | FR4.3·FR4.4 그대로 |
| traceability.json | FR4.4→BR2.12 BR2.13, FR4.3→BR2.12 BR2.14 그대로 |
| 공유 계약 | contract-summary.md 117행과 ShareCreate가 발급 조건·400 응답을 규정. createShareLink POST의 400 존재. unlock password는 기존 minLength 1이며 발급 8~64자 범위 검사 제외 |
| 결정·제외 범위 | ljm0850의 2026-10-05 결정·#221(csyg0616, 상위 #212). 표준을 참고한 팀장의 서비스 판단이며 NIST 다중 요소 인증 준수로 계산하지 않음. 흔한 비밀번호 목록·정규화·#195 unlock·ERD 제목 상한은 이번 변경 밖 |

전체 변경은 계약 2개 파일의 각 1줄과 rules.md의 3줄, 합계 3개 파일 5줄 교체이며 줄 수 변화는 없다. 물리 DB 칼럼 상한은 #221 구현 PR에서 계약 값에 맞춰 정한다. [계약 질문의 근거](../../../inception/contract-design/single-2026-10-05-questions.md)와 [계약 검증](../../../inception/contract-design/single-2026-10-05-verification.md)을 함께 따른다.

## 검증과 보존

검사 위치는 `/Users/ljm/Desktop/github/CatchU`다. Ruby YAML.safe_load·JSON 파서와 Python/git 바이트 비교를 사용했다. 실제 API·DB 실행 시험 또는 구현 완료의 증거는 아니다.

| 항목 | 결과 |
|---|---|
| rules YAML | 1개 블록·15개 규칙 파싱 통과 |
| source·추적 | BR2.12 source와 FR4.4→BR2.12·BR2.13, FR4.3→BR2.12·BR2.14 대조 통과 |
| 계약 YAML·참조 | YAML 4개·요약 블록 3개 및 모든 $ref 202개 해석 성공. 입력 조건과 발급 POST 400·unlock minLength 1 확인 |
| entities.md | 00e9753과 바이트 동일. 로컬 dev는 비교 기준으로 사용하지 않음 |
| 산출물 보존 | 계약·각 Unit 기능 설계 산출물 15개가 f1cb8d9와 바이트 동일 |
| 기존 기록 보존 | 계약·기능 설계 폴더의 질문·검증·review 30개가 f1cb8d9와 바이트 동일. 9/23·9/24·9/30 포함 |
| required-sections | entities H2 4개·rules 3개·functional-spec 10개, 모두 pass true/findings 0 |
| upstream-coverage | 상류 5개 및 entities·rules·functional-spec를 명시해 실행. unreferenced 빈 배열, pass true |
| traceability | pass false: missing_from_upstream_ids 23개. gaps·orphans·missing_from_table·invalid_entries·invalid_targets는 모두 빈 배열 |
| 독립 검토 | 리뷰어가 YAML·참조·입력 조건·FR 연결·바이트 비교를 별도로 수행하고 기존 센서 원문을 대조. READY, 새 지적 사항 없음 |
| linter/type-check | 해당 없음: TS/JS/TSX 생성·수정 없는 문서 기록 |
| 상태·주변 파일 | 본 흐름 Completed·relaxed, Unit 상태, aidlc-state.md, 12월 intent·docs/·하네스·2.10.0 유지. 기존 파일 중 10월 감사만 도구로 추가됨 |

센서는 다음 인자로 실행했다. required-sections는 아래 output-path의 파일 이름을 entities.md·rules.md·functional-spec.md로 바꿔 각각 실행했다. 도움말 탐색에서 output-path 없이 거부된 호출은 검증 결과로 계산하지 않았다.

```text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md --stage functional-design
aidlc engine sensor-upstream-coverage --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md --stage functional-design --consumes unit-of-work,unit-of-work-story-map,requirements,components,contract-summary --deliverables entities,rules,functional-spec
aidlc engine sensor-traceability --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/traceability.json --stage functional-design
```

추적 센서 원문:

```json
{"pass":false,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":["FR1.2","FR1.3","FR10","FR10.1","FR10.4","FR10.5","FR10.6","FR2","FR2.1","FR2.2","FR3.3","FR3.6","FR5","FR5.1","FR5.5","FR6.1","FR6.6","FR7.1","FR7.4","FR8.1","FR8.4","FR9.1","FR9.2"],"invalid_entries":[],"invalid_targets":[],"findings_count":23}
```

9/30의 23개 목록과 같고 9/24-r01도 같은 개수·다른 오류 배열 없음으로 기록한다. 독립 검토에서 unit-of-work-story-map과 대조해 FR2 계열은 U3 주책임, 나머지는 Deferred/N/A임을 확인했다. 이번 FR4.3·FR4.4 연결의 누락이 아니며 기존 Unit 범위 한계로 보존한다. 센서 실패를 PASS로 바꾸거나 추적 항목을 추가하지 않았다.

## 요약 확인·검토·완료 기록

- 2026-10-05T00:53:16Z: 새 `single-stage:functional-design` STAGE_STARTED. attempt `3f8c12476c226bae`. 실제 검토 범위는 u2-api이며 본 흐름 Unit 상태를 바꾸지 않았다.
- 첫 사용자 응답 “둘 다 Looks correct”에 따라 두 질문 파일에 Looks correct를 적었으나, 01:06:15Z의 u2-api 확인 기록은 같은 HUMAN_TURN이 계약 확인에 이미 사용됐다는 이유로 거부됐다. 이를 확인 성공으로 계산하거나 사람 입력을 합성하지 않았다.
- 사용자에게 이유와 같은 B 요약을 다시 제시했고 별도 응답 “1. **Looks correct**”의 01:09:38Z HUMAN_TURN 뒤 01:09:44Z SUMMARY_CONFIRMATION_RECORDED 성공. 확인 식별자는 `2ab4f69730d9fbe7970539f227712803a51c43a7ee50ef6952ca5f8027e90ec4`다. 질문 내용과 선택은 바꾸지 않았다.
- 01:09:48Z 검토 요청 1회 성공. 요청 ID `review:2597e92a2bedc1b235c609d08031c6ef`, fingerprint `sha256:f2c950ac8e9ce63d7ef4e9055e5f2a2c231064e13c89be967202d235b8f3b63b`.
- aidlc-architecture-reviewer-agent 독립 검토 1회: **READY, 신규 의견 없음**. 리뷰어는 지정된 reviewFile만 작성했다.
- terminal review 기록이 REVIEW_COMPLETED로 성공한 뒤 `report --single`을 한 번 실행해 kind:done을 받았다. 본 흐름의 Current Stage는 그대로다.

첫 요약 확인 기록 거부 원문:

```text
Cannot record the summary choice because no human reply has arrived after this question, or that turn was already used by another decision. End the turn, wait for the human's choice, then try again. This needs a fresh human turn: wait for the person to reply, then record it again.
```

검토 요청 결과 원문:

```json
{"emitted":"REVIEW_REQUESTED","stage":"functional-design","requestId":"review:2597e92a2bedc1b235c609d08031c6ef","reviewFile":"aidlc/spaces/default/intents/260914-catchu-october-mvp/.aidlc-engine/reviews/functional-design/stage/3f8c12476c226bae/1.review.md","recordVerdict":"aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict '<READY|NOT-READY>' --project-dir /Users/ljm/Desktop/github/CatchU","change_notices":["aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/traceability.json was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off)."]}
```

검토 완료 기록 결과 원문:

```json
{"emitted":"REVIEW_COMPLETED","stage":"functional-design","reviewRecord":".aidlc-engine/reviews/functional-design/stage/3f8c12476c226bae/1.json","reviewMarkdown":"construction/u1-web/functional-design/reviews/review-03.md"}
```

단독 완료 결과 원문:

```json
{"kind":"done","reason":"Single-stage run of \"functional-design\" committed under synthetic workflow \"single-stage:functional-design\". The main workflow's Current Stage is untouched."}
```

공식 record는 `.aidlc-engine/reviews/functional-design/stage/3f8c12476c226bae/1.json`이다. 무시 대상 record를 강제로 추가하지 않는다. 사람이 읽는 사본은 도구가 [construction/u1-web/functional-design/reviews/review-03.md](../../u1-web/functional-design/reviews/review-03.md)에 저장했다. 내용은 이번 u2-api 검토이며 u1-web 검토로 세지 않는다. 사본을 이동·재작성하지 않았으며 기존 review-01·review-02도 보존한다.

## 사후 기록 알림과 보존 범위

검토 요청에서 entities.md·rules.md·functional-spec.md·traceability.json이 현재 요약 확인 없이 저장된 산출물이라는 CHANGE_ACCEPTED 4개가 반환됐다. 위 요청 원문의 change_notices에 전체 경로와 문구를 그대로 보존했다. 과거 저장 기록과 이번 확인의 차이를 알린 것이며 이번 실행의 산출물 재저장을 뜻하지 않는다. 알림을 없애기 위한 재저장·설정 변경은 하지 않았다. SUMMARY_ARTIFACT_UNAUTHORIZED는 발생하지 않았다.

새 질문·검증 4개, 도구가 만든 리뷰 사본 1개, 9/30~10/4 미커밋 세션 기록을 포함한 10월 감사 파일을 한 커밋으로 남긴다. aidlc-state.md는 도구 변경이 없어 포함하지 않는다. docs/·이슈·PR·계약·설계 산출물은 수정하지 않고 push하지 않는다. 계약 쪽 단독 완료 거부와 이번 u2-api 단독 완료 성공은 별개의 결과다.

아래는 독립 검토 원문이다.

## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-05T01:13:21Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|

이번 제한된 변경에서 새 지적 사항은 없다.

### 검토 범위와 판단 근거

- 대상은 `construction/u2-api/functional-design/functional-spec.md`와 같은 폴더의 rules.md·entities.md·traceability.json이다. 2026-10-05 확인된 질문 및 전달된 공유 inception의 Unit·FR 매핑·요구사항·구성요소·계약을 대조했다. 다른 Unit의 construction 파일은 읽지 않았다.
- `rules.md > BR2.12`의 발급 제목 trim 후 1~50자, 선택 비밀번호 원문 8~64자, 유니코드 코드 포인트 계산, 위반 시 400 VALIDATION_FAILED는 `inception/contract-design/contract-summary.md > P — 수신자 API` 117행과 `common.yaml > ShareCreate`에 일치한다. 발급 입력 검사이며 중단 PUT이나 수신자 unlock에 새 길이 범위를 적용하지 않는다.
- `functional-spec.md > 업무 흐름 F6·F7` 및 규칙 요약은 rules.md의 규칙을 사용한다. 기존 회원 단위 원자 발급·유효 제목 유일성·최대 5개·30일 만료·중단·수신 접근 분기는 이번 변경으로 달라지지 않았다. 새로운 구성요소나 의존 관계를 추가하지 않는다.
- ShareCreate의 title은 raw 문자열 maxLength 없이 trim 이후 50자 상한을 설명으로 규정한다. 비밀번호는 선택 필드이며 제공하면 8~64자를 검사한다. unlock password는 minLength 1만 유지한다. `entities.md > ShareLink.title`의 물리 상한은 확인된 질문 Q2에 따라 #221 구현 PR에서 정하므로 이번 기록 범위의 미정 아키텍처 결함으로 세지 않는다.
- BR2.12 source는 FR4.3·FR4.4를 보존한다. traceability의 FR4.3→BR2.12 BR2.14와 FR4.4→BR2.12 BR2.13이 실제 존재하는 규칙으로 해석된다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-required-sections | 전달된 실행 원문 PASS: entities H2 4개, rules 3개, functional-spec 10개 | `/tmp/catchu-20261005-aidlc/sensors.json`의 명령과 결과를 확인했다. |
| sensor-upstream-coverage | 전달된 실행 원문 PASS: 상류 5개, unreferenced 빈 배열 | consumes=unit-of-work,unit-of-work-story-map,requirements,components,contract-summary 및 deliverables=entities,rules,functional-spec를 명시한 실행이다. |
| sensor-traceability | 전달된 실행 원문 FAIL: missing_from_upstream_ids 23개 | gaps·orphans·missing_from_table·invalid_entries·invalid_targets는 빈 배열이다. 과거 기록·Unit 매핑과 독립 대조한 결과는 아래와 같다. FAIL을 PASS로 바꾸지 않았다. |
| 독립 Ruby YAML·참조 검사 | PASS: 계약 YAML 4개, 요약 YAML 블록 3개, $ref 202개 모두 해석 | ShareCreate 속성과 createShareLink POST의 400 응답, unlock password의 minLength 1을 파싱 객체로 검사했다. |
| 독립 Ruby rules·entities YAML / traceability JSON 검사 | PASS: 규칙 15개, BR2.12 source 및 대상 FR 연결 일치 | 엔티티 YAML도 파싱했다. 잘못된 참조나 이번 변경에 따른 규칙 연결 손실이 없다. |
| 독립 Python·git 바이트 비교 | PASS: 검토 범위 산출물 9개가 f1cb8d9와 동일; entities.md는 00e9753과 동일 | 비교한 9개는 u2-api 산출물 4개와 계약 요약·YAML 4개다. 로컬 dev를 기준으로 쓰지 않았다. |
| git diff 00e9753 f1cb8d9 | 지정된 3개 파일에서 5줄 교체 확인 | BR2.12의 statement·logic·violation와 계약 요약 1줄, ShareCreate 1줄에 한정된다. |

검토 요청의 재실행 금지 범위에 따라 센서는 다시 호출하지 않고 위의 기존 실행 원문을 사용했다. YAML·참조·입력 조건·추적 연결·바이트 비교는 리뷰어가 별도로 셸에서 실행했다. 문서 기록 검토이므로 애플리케이션 linter/type-check, 실제 API·DB 실행 시험은 수행하지 않았다.

### 기존 추적 센서 한계

누락 목록은 FR1.2, FR1.3, FR10, FR10.1, FR10.4, FR10.5, FR10.6, FR2, FR2.1, FR2.2, FR3.3, FR3.6, FR5, FR5.1, FR5.5, FR6.1, FR6.6, FR7.1, FR7.4, FR8.1, FR8.4, FR9.1, FR9.2다. `construction/u2-api/functional-design/single-2026-09-30-verification.md`의 23개 목록과 일치하고 9/24-r01 검증 문서도 같은 23개 및 다른 오류 배열 없음으로 기록한다. `inception/units-generation/unit-of-work-story-map.md`의 각 행과 독립 대조하여 FR2 계열은 U3 주책임, 나머지는 Deferred/N/A임을 확인했다. 이번 길이 변경의 FR4.3·FR4.4 누락은 없으며, 기존 Unit 범위 센서 한계를 새 결함으로 세지 않는다.

### Summary

확인된 발급 입력 길이 결정은 공유 계약과 u2-api 규칙·추적 연결에 일관되게 반영되어 있어 해당 변경 범위는 구현할 수 있다. 이 판정은 실제 API·DB 검증, PR 승인·병합 또는 NIST 다중 요소 인증·표준 전체 준수를 의미하지 않는다.
