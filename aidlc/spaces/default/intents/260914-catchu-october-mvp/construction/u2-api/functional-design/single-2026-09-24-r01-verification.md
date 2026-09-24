# 2026-09-24 R-01 정정 — 검증과 새 단독 실행 완료

기준 수정본은 `dce0223`이다. [이전 검토](../../u1-web/functional-design/single-2026-09-24-verification.md)의 단일 트랜잭션·장애 설명 R-01을 이번 별도 실행에서 해결했다. 이전 검토의 New 표기와 완료 기록은 당시 기록으로 보존하고 소급 수정하지 않는다. [이번 질문·확인](single-2026-09-24-r01-questions.md)에 사용자가 `Looks correct`로 답한 뒤 두 파일을 수정했다.

## 반영·검증

| 항목 | 결과 |
|---|---|
| functional-spec.md 39행 F4 | B 저장·반환·E 반영 기록인 3~5단계를 한 트랜잭션으로 명시. 실패/경계 칸에서 롤백·동일 결과 복구와 커밋 뒤 확인 유실을 구분 |
| functional-spec.md 75·76행 | 반영 트랜잭션 실패는 변경 전체 롤백·APPLY_FAILED·기존 수신 기록 유지·같은 결과로 처음부터 반영·유일성 키로 중복 방지·F 재실행 없음. 커밋 뒤 응답·확인 유실은 기존 등록 연결로 같은 catchId 반환 |
| entities.md 197행 | CandidateRegistration을 “재전달·반영 복구 때의 재진입 키”로 설명 |
| entities.md 232행 | 등록·반영 설명을 같은 트랜잭션과 functional-spec의 실패 두 경우에 연결. 사용자 작성 전 확인에 포함한 정정이며 키·payload 제약 유지 |
| 모델 보존 | entities YAML 파싱 통과. CandidateRegistration description만 기준 값으로 되돌린 파싱 객체 전체가 dce0223와 동일. 속성·제약·관계·유일성 변경 없음 |
| 계약 형식 | 공유 YAML 4개·contract-summary YAML 3개 파싱, `$ref` 198개 해석, required/properties 43개 검사 통과 |
| 변경 범위 | Python 행 비교로 지정 설명 네 곳 외 두 파일의 모든 내용 동일. 상대 링크·앵커·code fence 확인. 기준 597개 파일 해시에서 대상 두 파일·감사 외 기존 파일 보존 |
| 계약·기존 기록 | contract-summary.md 90행 재진입 요구와 파일 전체, 계약 YAML, api rules/traceability, 다른 유닛, 기존 검토·승인 기록 유지 |
| required-sections | entities H2 4개·functional-spec H2 10개, findings 0, PASS |
| upstream-coverage | unit-of-work·unit-of-work-story-map·requirements·components·contract-summary의 5개 출처 누락 0, PASS |
| traceability | FAIL: missing_from_upstream_ids 23개. 기존 타 유닛·보류 FR 대조 결과와 동일. gaps/orphans/missing_from_table/invalid_entries/invalid_targets는 모두 없음 |
| linter/type-check | 해당 없음. 문서 설명 변경이며 적용 대상 TS/JS/TSX 코드 추가 없음 |
| 공백·보존 | git diff --check 통과. main aidlc-state.md·하네스·버전 스탬프·docs·intents.json·260920 web-mock-demo 기존 변경 보존 |

검사 위치는 `/Users/ljm/Desktop/github/CatchU-mvp-recovery-20260922`이며 이번 미커밋 수정본을 검사했다. Ruby YAML 파싱과 Python/git 비교를 사용했다. `aidlc engine sensor-required-sections`는 변경 문서마다, `sensor-upstream-coverage`와 `sensor-traceability`는 api 단위로 각각 한 번 실행했다. 기존 추적 센서 한계를 통과로 바꾸거나 가짜 규칙·추적 항목을 만들지 않았다.

정상 커밋, 반영 트랜잭션 실패 후 동일 결과 복구, 커밋 뒤 응답·확인 유실의 문서 조건을 독립 검토했다. 실제 DB/API·실패 주입 시험은 제품 구현 단계에서 수행할 범위이며 이번 문서 검증 결과로 대신하지 않는다.

## 확인·검토·완료 기록

- 이전 단독 실행은 2026-09-24T08:38:56Z에 완료됐다. 이번 실행은 08:49:16Z의 새 `single-stage:functional-design` STAGE_STARTED에서 시작했다. 이전 attempt `8341c5931957f34b`와 이번 `7cb2bb5e58676d24`가 분리됐다.
- 10:10:41Z: 사용자 `Looks correct` 뒤 SUMMARY_CONFIRMATION_RECORDED 성공. 확인 식별자는 `1e4c70f40c6492a84e2cbf869bf79969c2b1b3cd7057697be1fe38b7baf4acb6`이다.
- 10:12:57Z: `aidlc engine log review --stage functional-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1` 성공. Request ID는 `review:05022e15661e048118825dfd160b8c3b`이다.
- 독립 reviewer는 **READY, 트랜잭션 R-01 Resolved, 신규 의견 없음**으로 판정했다. 아래 사본은 이번 공식 검토 본문 그대로다. 본 흐름의 과거 ProcessingEvent·비밀번호 코드 R-01과 구분한다.
- 10:16:55Z: 같은 review 명령에 `--verdict READY`를 추가한 REVIEW_COMPLETED 기록 성공. 요청·산출물 fingerprint는 `sha256:6cb39999ad903250230f086a01fe6158bb3e98e0d9694801a6ed2f2968094325`로 일치한다.
- 공식 검토 record는 `.aidlc-reviews/functional-design/stage/7cb2bb5e58676d24/1.json`, digest는 `sha256:f041b6b8c062e0cfa1868ba2a5d37f97d39a3634784c76470c969e08b500422d`다. ignored record를 직접 수정하거나 강제로 stage하지 않고 아래 사본과 도구 감사 기록을 공유한다.
- 10:17:00Z: `aidlc engine orchestrate report --single --stage functional-design --result completed` 한 번으로 `kind: done`과 STAGE_COMPLETED를 받았다. 이번 단독 실행은 정상으로 닫혔다.

기존 relaxed 설정에 따른 CHANGE_ACCEPTED는 보존했다. 이전 검토 이후 변경과 api 산출물의 저장 확인 식별자 차이를 도구가 기록한 것이며, 이번 사용자 확인은 산출물 수정 전에 성공했다. 설정 변경·추가 확인 생성·확인 식별자를 맞추기 위한 재저장·검사 우회·실패 호출 재실행은 하지 않았다. rules·traceability는 수정하지 않았다.

본 흐름은 Completed 그대로이며 상태·감사는 도구가 기록한 것 외에 직접 수정하지 않았다. 이전 Contract·Units·Delivery의 열린 단독 실행은 이번 수정 대상이 아니므로 그대로 유지한다. 버전은 2.8.1, 커밋 대상은 두 산출물·이번 질문/검증·이번 감사 기록이다. PR #89의 팀장 확인과 병합은 별도이며 이번에 병합하지 않는다.

## 결론

**9/24 트랜잭션 R-01은 해결됐고, 이번 Functional Design의 새 단독 실행은 정식 검토·완료까지 성공했다.** 관계·유일성·계약 YAML·contract-summary.md의 재진입 요구를 바꾸지 않았다. 추가 설계 수정 의견은 없으며 실제 구현의 두 실패 시나리오 시험은 E↔B 등록 개발 이슈에서 수행한다.

아래는 공식 검토 record의 본문 사본이다.

## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-09-24T10:15:29Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md > 업무 흐름 F4(39행), 동시성과 일관성의 반영 트랜잭션 실패·커밋 뒤 응답·확인 유실(75~76행), OQ-B1(109행) | 이전 검토에서는 OQ-B1의 B 등록·E 완료 단일 트랜잭션 결정과 B 자료 보존 후 E 메타데이터만 복원한다는 설명이 충돌했다. 현재 F4는 3~5단계를 한 트랜잭션으로 명시한다. 반영 실패는 해당 변경 전체 롤백·수신 기록 보존·APPLY_FAILED·같은 결과 복구로, 커밋 뒤 응답·확인 유실은 기존 등록 연결에 따른 같은 catchId 반환으로 구분했다. entities.md의 CandidateRegistration 설명과 등록·반영 제약도 이 경계에 맞춰졌다. | 완료. 이번 R-01에 대한 추가 수정은 필요하지 않다. 실제 구현에서 트랜잭션 실패와 커밋 후 확인 유실의 두 시나리오를 검증한다. | Resolved |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 독립 Ruby YAML 파싱·구조 비교 | PASS | entities.md의 CandidateRegistration description을 기준 `dce0223` 값으로 되돌린 파싱 객체 전체가 기준과 같다. 모든 속성·제약·관계·유일성을 보존했다. |
| 독립 Python 변경 범위 비교 | PASS | entities.md의 지정 설명 두 곳, functional-spec.md의 F4 및 기존 장애 행을 대체한 두 행을 제외하면 기준 `dce0223`와 같다. 상태 전이·OQ-B1·F3 수신 및 ProcessingEvent 구분을 바꾸지 않았다. |
| 독립 Python 보존·연결 확인 | PASS | 공유 계약 요약·YAML 4개, api rules/traceability, 전달된 web functional-spec과 worker rules가 기준과 동일하다. entities의 functional-spec 상대 경로와 「동시성과 일관성」 앵커가 해석된다. |
| 오케스트레이터가 전달한 계약 검증 | PASS: 공유 YAML 4개·요약 YAML 3개, `$ref` 198개, required/properties 43개 | 이번 수정으로 계약 형식이나 참조를 변경하지 않았다. reviewer는 aidlc·센서를 재호출하지 않았다. |
| required-sections / upstream-coverage | 전달받은 결과 PASS: entities 4개 H2·functional-spec 10개 H2, 상위 출처 5개 누락 없음 | 문서 구조·상위 연결의 검사 결과다. 원자성의 의미는 reviewer가 F3·F4·OQ-B1·장애 두 경우를 읽어 별도로 대조했다. |
| traceability | 전달받은 결과 FAIL: missing_from_upstream_ids 23개 | 기존 타 유닛·보류 FR 대조의 결과이며 이번 추적표는 무변경이다. gaps/orphans/invalid_entries/invalid_targets는 없다. 기존 한계를 PASS로 바꾸거나 센서를 재실행하지 않았다. |
| linter / type-check | N/A | 이번 변경은 문서 설명이며 적용 대상 TS/JS 코드가 없다. |

### Summary

9/24 트랜잭션 Major R-01을 해결한 것으로 확인했다. 정상 경로에서는 B 등록과 E 반영 완료를 함께 커밋한다. 반영 트랜잭션 실패 때는 그 변경을 모두 되돌리되 앞서 저장한 수신 기록을 유지하고, 같은 결과를 다시 반영하며 기존 유일성으로 중복을 막는다. 커밋 뒤 응답·확인만 유실된 경우에는 이미 저장한 등록 연결로 같은 catchId를 반환한다. 어느 경우에도 F 재실행을 추가하지 않는다.

보존한 contract-summary.md 90행은 재진입·중복 방지 요구이며 B만 별도로 커밋하라는 요구가 아니다. 같은 문서 OQ-B1의 원자성 결정과 이번 F4의 명시적 트랜잭션 범위를 함께 적용하면, B 저장과 E 기록 사이의 실패도 전체 롤백 대상으로 해석된다. CandidateRegistration의 기존 연결·유일성 제약과 충돌하지 않는다. 이전에 모호했던 “E 메타데이터만 복원” 설명은 이번 기능 설계에서 제거됐다.

이번 R-01은 `construction/u1-web/functional-design/single-2026-09-24-verification.md`에 보존된 2026-09-24T08:37:04Z 트랜잭션 검토 의견을 이어받은 것이다. 본 흐름의 오래된 ProcessingEvent R-01과 web 비밀번호 코드 R-01은 별개 기록이며, 이번 두 파일 설명 정정으로 그 해결 내용을 바꾸지 않았다. 이전 리뷰 사본은 소급 수정하지 않았다.

미해결 Critical·Major·Minor 및 신규 의견은 없다. READY는 이번 설계 정정의 검토 결과이며 실제 DB/API 시험이나 PR 병합·단독 실행 완료의 증거가 아니다. 실제 함수 입출력·테이블 생성 순서와 결과 보존/전달 구현은 기존 담당 개발 이슈의 범위다. 검토자는 지정 리뷰 파일만 작성했다.
