# 2026-09-30 u2-api 사후 기록 — 검증과 단독 실행 상태

이미 dev에 병합된 #170(`a7dcc87`)·#173(`a2649c6`)의 규칙·업무 흐름 변경을 [이번 질문 파일](single-2026-09-30-questions.md)의 결정과 대조했다. 이번 실행에서 산출물을 수정하거나 다시 저장하지 않았다.

## 결정·반영 대조

| 근거·대상 | 현재 파일 |
|---|---|
| [#148 결정](https://github.com/JminAILab/CatchU/issues/148#issuecomment-5882528372)·#170 rules.md | BR2.12에 소유 확인 우선, 본인 첫 중단·반복·만료 중단의 200 현재 상태, 타인·없는 링크의 404 RESOURCE_UNAVAILABLE와 403·409 제외가 있다. BR2.13의 trigger는 수신자 조회/unlock이며 중단 PUT이 없다. |
| [#150 결정](https://github.com/JminAILab/CatchU/issues/150#issuecomment-5883572995)·#173 rules.md | BR2.13의 링크 불가 판정 뒤 unlock 시도 제한을 검사하고 차단 중에는 비밀번호 검사 없이 429 LINK_UNLOCK_LIMITED·Retry-After로 거부한다. |
| #173 functional-spec.md F6 | 이미 중단·만료된 링크의 중단 요청은 stoppedAt을 기록하지 않고 현재 상태를 200으로 반환한다. |
| #173 functional-spec.md F7 | 링크 판정 → unlock 시도 제한 → 비밀번호/grant → 현재 자료 순서이며 GET에는 제한을 적용하지 않는다. |
| #173 ShareLink 상태 표 | STOPPED·EXPIRED에서 나가는 전이가 없다. 중단 뒤 만료 시각이 지나도 STOPPED, 만료 링크 중단은 EXPIRED를 유지한다. |

## 검증과 보존

검사 위치는 `/Users/ljm/Desktop/github/CatchU`, 기준 dev·HEAD는 `a2649c6`이다. Ruby YAML 파서, JSON 파서와 git/Python 바이트 비교를 사용했다. 실제 API·DB 동작 시험이나 구현 완료를 뜻하지 않는다.

| 항목 | 결과 |
|---|---|
| rules YAML | 1개 블록·15개 규칙 파싱 통과 |
| FR4.3→BR2.12 | traceability의 target 및 규칙 source 일치. 링크 POST·중단 PUT trigger와 중단 응답 본문 일치. 함께 연결된 BR2.14도 보존 |
| FR4.5→BR2.13 | traceability의 target 및 규칙 source 일치. 수신자 조회/unlock trigger와 비밀번호·차단 본문 일치 |
| entities.md | dev와 바이트 동일. 관계·속성·유일성 변경 없음 |
| 산출물·기존 기록 | 착수 시 10월 intent 추적 파일 176개 해시와 비교해 감사 파일 외 기존 파일 변경 없음. 계약 YAML·계약 요약·각 유닛 기능 설계 산출물의 dev diff 없음 |
| required-sections | functional-spec H2 10개, rules 3개, entities 4개. 모두 pass true/findings 0 |
| upstream-coverage | entities·rules·functional-spec의 상류 unit-of-work·unit-of-work-story-map·requirements·components·contract-summary 참조 누락 0, pass true |
| traceability sensor | pass false: missing_from_upstream_ids 23개. gaps·orphans·missing_from_table·invalid_entries·invalid_targets는 모두 비어 있음. 9/24 검증 문서에 기록된 타 유닛·보류 FR 대조 한계와 동일하며 이번 대상 연결 불일치가 아님 |
| linter/type-check | 해당 없음: TS/JS/TSX 코드나 해당 코드 블록을 생성·수정하지 않은 문서 사후 기록 |

추적 센서가 보고한 목록: FR1.2, FR1.3, FR10, FR10.1, FR10.4, FR10.5, FR10.6, FR2, FR2.1, FR2.2, FR3.3, FR3.6, FR5, FR5.1, FR5.5, FR6.1, FR6.6, FR7.1, FR7.4, FR8.1, FR8.4, FR9.1, FR9.2. 기존 traceability를 고치거나 이 결과를 PASS로 바꾸지 않았다.

## 요약 확인·검토·완료 기록

- 2026-09-30T02:41:08Z: 새 `single-stage:functional-design` STAGE_STARTED. attempt는 `3e547722e2a80623`이다. 이번 제품 검토 범위는 u2-api이며 본 흐름 Unit 상태는 변경하지 않았다.
- 02:46:57Z의 이번 세션 HUMAN_TURN 뒤 02:47:08Z에 SUMMARY_CONFIRMATION_RECORDED 성공. Looks correct, 확인 식별자 `6a20bf391d39bf5c646e26b66d46d99a68038debd144037c2ba7c9d797d61bc5`.
- 02:47:12Z: `aidlc engine log review --stage functional-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1` 성공. 요청 `review:c91797345af948e83ff93313f9b5daf1`, fingerprint `sha256:c1240a9cc806c1e8d4e1e0818d9b70082056eccdeecd9afce4f671972cbb655a`.
- 독립 검토 결과: **READY, 신규 의견 없음**. 검토자는 두 결정 댓글을 GitHub API로 직접 확인하고 u2-api로 제한한 병합 diff, 규칙·계약·상태 흐름, YAML·센서·바이트 보존을 대조했다. 실제 API·DB 시험은 수행하지 않았다.
- `aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict READY --project-dir /Users/ljm/Desktop/github/CatchU`로 REVIEW_COMPLETED 성공. 공식 record는 `.aidlc-engine/reviews/functional-design/stage/3e547722e2a80623/1.json`이다. 무시 대상 record를 강제로 추가하지 않는다.
- 도구가 반환한 사람이 읽는 사본 경로는 `construction/u1-web/functional-design/reviews/review-01.md`다. 내용은 이번 u2-api 검토이며 u1-web 검토로 계산하지 않는다. stage-level 단독 실행의 저장 위치 차이를 그대로 기록하고 직접 경로를 이동하거나 산출물을 다시 쓰지 않았다. 아래에도 이번 검토 원문을 보존한다.
- `aidlc engine orchestrate report --single --stage functional-design --result completed`를 한 번 실행해 `kind: done`을 받았다. 메시지는 `Single-stage run of "functional-design" committed under synthetic workflow "single-stage:functional-design". The main workflow's Current Stage is untouched.`이며 이번 단독 실행은 완료됐다.

## 사후 기록 알림과 보존 범위

검토 요청에서 entities.md·rules.md·functional-spec.md·traceability.json 각각에 다음 알림이 반환됐다. 경로 앞부분은 `aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/`이다.

```text
entities.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).
rules.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).
functional-spec.md was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).
traceability.json was saved without the current summary confirmation. Continuing (Guard Policy: relaxed or off).
```

CHANGE_ACCEPTED는 과거 저장 기록과 이번 확인의 차이이며, 이번 실행에서 산출물을 다시 저장했다는 뜻이 아니다. 알림을 없애기 위한 재저장·추가 확인·설정 변경을 하지 않았다. SUMMARY_ARTIFACT_UNAUTHORIZED는 검토 요청에서 발생하지 않았다.

기존 감사의 후행 공백 8건은 계약 검증 문서에 기록했고 직접 편집하지 않았다. 본 흐름 Completed·relaxed와 2.10.0, 12월 intent, docs/, 과거 질문·검토·승인 기록을 보존한다. 상태 파일의 허용된 항목명 변경과 9/23 이후 미커밋 세션 감사는 이번 커밋에 함께 포함한다.

아래는 도구가 보존한 이번 독립 검토의 원문 사본이다.

## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-09-30T02:50:55Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|

이번에 지정된 #170·#173의 u2-api 사후 기록 범위에서 새 제품 정합성 결함은 발견하지 않았다. 기존 산출물은 수정하지 않았다.

### 검토 범위와 근거

- `construction/u2-api/functional-design/`의 2026-09-30 확인된 질문, rules.md, functional-spec.md, entities.md, traceability.json을 검토했다. 공유 inception의 Unit 정의·FR 매핑·요구사항·구성요소 및 계약 요약·회원/수신자 API·공통 DTO를 대조했다. 다른 Unit의 construction 파일은 읽지 않았다.
- [#148 결정 댓글](https://github.com/JminAILab/CatchU/issues/148#issuecomment-5882528372)과 [#150 결정 댓글](https://github.com/JminAILab/CatchU/issues/150#issuecomment-5883572995)을 GitHub API로 직접 확인했다. `a7dcc87^1..a7dcc87`, `a2649c6^1..a2649c6` diff는 u2-api의 해당 산출물로 제한해 확인했다.
- BR2.12는 소유 확인을 상태 확인보다 앞에 두고, 본인 유효 링크는 STOPPED, 반복 중단은 기존 STOPPED, 만료 링크는 EXPIRED를 200으로 반환한다. 타인·없는 링크는 404 RESOURCE_UNAVAILABLE이며 중단 업무 판정에서 403·409를 쓰지 않는다. BR2.13에서 중단 PUT이 제외되어 수신자 404 LINK_UNAVAILABLE 판정과 섞이지 않는다. 회원 경로의 공통 인증 401·서버 오류 500은 계약 요약과 함께 해석된다.
- F6의 이미 중단·만료된 링크에 대한 stoppedAt 추가 기록 금지와 ShareLink 상태 표의 종결 상태 유지가 BR2.12 및 계약의 상태 의미와 일치한다. entities.md의 시간 기반 유효성·중단 반복 제약도 이 동작을 방해하지 않는다.
- BR2.13과 F7은 링크 판정 후 unlock 시도 제한, 그 뒤 비밀번호/grant 확인 순서를 유지한다. 차단 중에는 올바른 비밀번호도 검사 전에 거부하며, 429 LINK_UNLOCK_LIMITED와 남은 초의 Retry-After를 반환한다. GET 두 경로에는 시도 제한이 적용되지 않는다. common.yaml의 Error429가 Retry-After 헤더를 참조하며 오류 본문에 남은 시간 필드를 추가하지 않는다.
- 시도 횟수·기간·grant 보관 등 담당자 설계 값을 새 계약 값으로 확장하지 않았다. 이 검토는 두 병합 변경의 정합성 검토이며, 기존 OQ의 구현·배포 완료를 인증하지 않는다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| Ruby YAML.safe_load | PASS: rules YAML 1블록·15규칙, member-api/recipient-api/common YAML | 문서 파싱 가능. 최초 Python 시도는 PyYAML 미설치로 실행되지 않았고 설치 없이 Ruby로 검증했다. |
| FR/규칙 양방향 대조 | PASS: FR4.3 → BR2.12 BR2.14, FR4.5 → BR2.13 및 각 규칙 source | 요청된 연결과 규칙 본문이 일치하며 FR4.3의 BR2.14 연결도 유지된다. |
| sensor-required-sections | PASS: functional-spec H2 10개, rules 3개, entities 4개 | 선언 산출물의 기본 문서 구조가 충족된다. |
| sensor-upstream-coverage | PASS: 상류 5개, 누락 0 | consumes와 deliverables를 명시하여 실행했다. 인자 미지정 시의 no upstream 응답은 검증 근거로 사용하지 않았다. |
| sensor-traceability | FAIL: missing_from_upstream_ids 23개; gaps/orphans/missing_from_table/invalid_entries/invalid_targets는 모두 빈 배열 | 아래의 기존 Unit 범위 한계를 유지한다. 센서 FAIL을 PASS로 바꾸지 않았다. |
| linter / type-check | N/A | 검토 산출물에 해당 센서의 TS/JS 코드 대상이 없다. 실제 코드 검사 성공을 주장하지 않는다. |
| git show dev와 바이트 비교 | PASS: entities.md, rules.md, functional-spec.md, traceability.json 모두 동일 | 이미 병합된 산출물을 이번 검토에서 다시 쓰지 않았다. |
| API·DB 실행 시험 | 미수행 | 문서 정합성 검토이며 실제 구현의 동작·동시성·부하 검증은 아니다. |

traceability 센서의 누락 목록은 FR1.2, FR1.3, FR10, FR10.1, FR10.4, FR10.5, FR10.6, FR2, FR2.1, FR2.2, FR3.3, FR3.6, FR5, FR5.1, FR5.5, FR6.1, FR6.6, FR7.1, FR7.4, FR8.1, FR8.4, FR9.1, FR9.2다. 공유 unit-of-work-story-map.md와 대조하면 FR2 계열은 U3 주책임이고 나머지는 Deferred/N/A다. u2-api 추적표는 주 배정 FR 19개를 명시적으로 추적하며 이번 중단·만료·비밀번호 범위의 FR4.3·FR4.4·FR4.5는 포함되어 있다. 따라서 이 센서 결과는 이번 변경의 누락이나 새 아키텍처 결함으로 세지 않되 검증 한계로 남긴다.

### Summary

#170·#173의 u2-api 규칙·업무 흐름·ShareLink 종결 상태는 두 결정 및 현재 공유 계약과 일치한다. 지정된 사후 기록 범위는 READY이며, 산출물 수정이나 실제 API·DB 시험은 수행하지 않았다.
