# u2-api Functional Design 단독 후속 기록 — 2026-10-13 처리 시한 (#237)

## 기록 지위·대상·응답 방식

팀장(ljm0850)이 2026-10-13 Chat으로 준 사실과 기록 지시에서 답을 추출했다. 이미 커밋된 u2-api 설계를 다시 쓰지 않는다. 계약 결정·기각 이유·위험·유보 범위의 전체 기록은 [계약 질문·답](../../../inception/contract-design/single-2026-10-13-processing-deadline-questions.md)에 보존했다. 원격 의견·상태는 팀장이 제공한 근거이며 이번에 원격으로 재검증했다고 주장하지 않는다.

- 대상 intent: 260914-catchu-october-mvp. 브랜치: docs/분석-처리-시한-계약. 보존 판본: 7e3b92b23cac43167c92f475c3b5ca69af9327bf.
- 실행 binary/runtime와 브랜치 하네스 frameworkVersion: 2.11.0. 본 흐름 functional-design / Completed와 Guard Policy relaxed는 유지한다.
- 계약의 9/23 열린 단독 실행은 이번 요약 확인 기록에 성공했지만 검토·완료 요청이 각각 1회 SUMMARY_RECEIPT_MISSING으로 거부됐다. 원문은 [계약 검증 기록](../../../inception/contract-design/single-2026-10-13-processing-deadline-verification.md)에 보존했고 우회·재시작·추가 확인 기록·재시도는 하지 않았다.
- u2-api 대상 새 단독 실행을 시작했다. --single의 반환은 Unit 필드 없는 functional-design run-stage이며 기존 단독 기록 방식과 같이 작업 대상은 이 질문 파일·검증·검토 입력으로 u2-api에 한정한다. 본 흐름 반복이나 Unit 진행 상태를 바꾸지 않는다. 반환된 임의 산출물 경로의 기존 파일을 다시 쓰지 않는다.

## 질문·답

### Q1. E의 주기 판정으로 어떤 요청을 닫는가?

[Answer]: [#23의 2026-10-06 팀장 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)에 따라 접수(submittedAt) 후 계약의 처리 시한 안에 끝나지 않은 ACTIVE 요청을 E(api)가 주기 판정으로 닫는다. 시한 숫자는 계약 요약 「공통 오류·요청 안전성」에만 한 번 적고 u2-api는 계약 값을 참조한다. 실행이 멈췄다는 증거는 요구하지 않으며, 결과를 받았지만 반영이 끝나지 않은 요청도 닫는다. CLOSED는 E가 더 처리·반영하지 않는다는 표시여서 F 실행이 남아 있을 수 있다. 시한 전 HTTP·조회 timeout과 조회 실패는 실패 확정 근거가 아니다.

### Q2. 처리 중과 반영 대기의 시한 초과를 어떻게 구분하는가?

[Answer]: 처리 중(QUEUED/RUNNING/UNCERTAIN)은 FAILED/APPLIED/CLOSED로 닫고 failures에 stage DISPATCH·code PROCESSING_DEADLINE_EXCEEDED·message "정해진 시간 안에 분석을 마치지 못했습니다."를 더한다. 서버의 failureConfirmationReference에도 같은 code를 남긴다. 반영 대기(PENDING)는 processing 결과를 유지한 APPLY_FAILED/CLOSED이며 stage APPLICATION·같은 code·message "정해진 시간 안에 결과를 반영하지 못했습니다."다. 반영 대기 시한 초과에는 서버의 실패 확정 증거를 추가하지 않는다. 시한 전에는 단순 시간 경과/조회 실패로 FAILED/CLOSED를 만들지 않는다. RUNNING → UNCERTAIN 전이를 두지 않으며 뒤늦은 진행 알림으로 종결을 되돌리지 않는다.

### Q3. 반영 실패와 닫기·반영 경합을 어떻게 다루는가?

[Answer]: F4의 B 등록·E 반영 완료 기록은 기존 한 트랜잭션으로 저장한다. 반영 실패는 그 트랜잭션의 변경을 전부 되돌리고 APPLY_FAILED로 기록하며 처리 시한을 기다리지 않고 E의 다음 주기 판정에서 CLOSED로 닫는다. 같은 결과의 재반영·복구는 없고 RECOVERING은 목록에 남기되 쓰지 않는다. 처리 시한 닫기와 결과 수신·반영이 겹치면 요청→시도 순서로 잠근 뒤 현재 상태를 재판정한다. 닫기가 먼저면 늦은 결과는 PAYLOAD_CONFLICT로 거부하고 이미 받은 반영 대기 결과도 반영하지 않는다. 반영이 먼저 완료·CLOSED면 뒤의 시한 판정은 ACTIVE 조건을 다시 확인해 바꾸지 않는다. 커밋 후 같은 결과를 우연히 다시 받는 기존 등록 연결 참조와, 결과 보존·계획된 F 재전달·E 재반영 경로는 구분한다.

### Q4. 실패 재요청 조건과 식별자는 무엇인가?

[Answer]: 등록 Catch 0건이고 CLOSED인 두 경우만 허용한다. ① FAILED/APPLIED/CLOSED·적합 후보 0·등록 0·확정 근거(F 실패 결과 또는 E 시한 판정). ② APPLY_FAILED/CLOSED·등록 0(처리 결과·적합 후보 수 무관). 둘 다 retry.allowed=true·reason FAILURE_WITHOUT_RESULTS이며 새 consentId·requestId·attemptId와 retryOfRequestId를 연결한다. 새 동의의 고지·대상·범위를 확인하며 기존 Catch·공개·링크를 바꾸지 않는다. 정상 EMPTY·유효 결과가 반영된 부분 실패·닫히지 않은 요청은 대상이 아니다. 요청 ID 생략으로 우회하지 않는다. [#23 댓글 6032920990](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6032920990)의 E 답처럼 E DB 시도 ID·attemptId·큐 작업 ID에는 같은 UUID를 사용한다. [PR #240](https://github.com/JminAILab/CatchU/pull/240)의 10/7 리뷰에서 E 담당 yeongyeon1802가 10/6 결정에 이견이 없다고 밝힌 사실은 당시 담당 확인으로 연결한다.

### Q5. 복구 제외·받아들인 위험·상위 요구의 해석은 무엇인가?

[Answer]: 서버·worker·큐·DB가 끊기는 흔치 않은 장애는 앱에서 복구하지 않는다. worker 시도 기록·결과 보존·운영자 확인 절차가 있어야 실패 근거를 추가 확인한 뒤 닫을 수 있으므로, 기존 증거 우선 종결 원칙과 결과 원문 보관안(1-가·1-나)을 거뒀다. 9/29 결과 보존 14일도 철회했고 worker는 결과를 보내면 끝이다. 큐에서 사라진 요청 재전송·worker 실행 차단 기록·결과 보존/재전달·반영 복구·RUNNING → UNCERTAIN은 두지 않으며 같은 작업을 큐가 다시 주는 횟수는 0이다. 큐 자료 유실로 같은 시도가 드물게 다시 실행되거나 앞 시도가 아직 도는 중 시한 CLOSED 뒤 재요청이 들어올 위험은 수용했다. 한 시도에 먼저 받은 결과 하나만 수락하고 닫힌 시도 결과를 PAYLOAD_CONFLICT로 거부해 Catch가 늘지 않게 한다.

M05의 '자료 손실 없음'·FR1.4의 '기존 자료/링크 보존'은 이미 저장된 Catch·공개·링크를 뜻하며 반영 전 결과는 시한 실패 뒤 재요청으로 다룬다. M07·NFR4는 재시작·재배포 후 DB 자료·공개/숨김/링크 상태 유지, 관리형 DB 자동 백업 켜짐·보관 기간 확인으로 해석한다([#24의 10/6 결정](https://github.com/JminAILab/CatchU/issues/24#issuecomment-6012203241), PR #241 AWS). 복원 시험은 12월이다. NFR7에 따라 드문 중복·남은 자료 정리는 식별자·상태·시각만 본다. 요구사항·도메인·Unit의 과거 문구와 승인 기록은 소급 수정하지 않는다.

### Q6. 이번 검토 대상과 후속 구현 범위는 무엇인가?

[Answer]: 이미 고친 u2-api functional-spec.md의 F2/F4/F8·상태 전이·retry·경합·OQ-F1, rules.md의 BR2.4/BR2.6, entities.md의 재요청·실패 근거·F 비보존·등록 연결 문장을 검토한다. 5개 지정 산출물은 7e3b92b와 바이트 동일하게 보존한다. #262 제목 null·근거 순서 등 기존 내용도 유지한다. 팀장이 제공한 Codex 독립 점검·수정안 검토·재검증에서 고친 rules L53, contract-summary L90, u1-web L37의 과거 경과와 이번 검토를 구분한다.

실제 구현은 #237(담당 ljm0850, 상위 #134)이다. api/src/result-application/result-application.service.ts L50~57의 ACTIVE 동안 APPLY_FAILED 재반영 길은 #237에서 닫는다. worker 총 처리 상한은 #121(시한보다 충분히 짧게, 20분은 제안), 끝난 시도에 '모름' 응답은 #232에서 맞춘다. u3-worker 기능 설계의 결과 보존 문장과 api/docs/·api/README.md·docs의 파생 큐/임시자료 문서·에이전트 문서는 이번에 고치지 않는다. 12월 입력 이관도 설계 재개 때 한다. 제품 코드·DB·큐·worker·화면·배포 검증이나 PR/이슈 변경은 이번 기록 작업에 포함하지 않는다.

### Q7. 센서·독립 검토와 중단 조건을 어떻게 기록하는가?

[Answer]: YAML 4파일·문서 YAML 5블록의 파싱은 계약 검증에서 통과했다. u2-api required-sections 3파일과 upstream-coverage는 PASS다. traceability는 FAIL이며 missing_from_upstream_ids 23개, 나머지 gaps/orphans/invalid 항목은 없다. 10/9(2.10.0)의 23개 결과 JSON 및 ID 목록과 정확히 같다. traceability.json을 고치거나 PASS로 바꾸지 않는다.

이 u2-api 요약에 별도의 사람 Looks correct를 받은 뒤 aidlc-architecture-reviewer-agent 독립 검토 --single을 한 번 실행한다. READY이며 의견이 없을 때만 report --single을 한 번 실행한다. NOT-READY·의견·거부면 산출물을 수정하지 않고 원문을 남기고 멈춘다. CHANGE_ACCEPTED를 원문 기록하고 재저장·설정 변경으로 없애지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED면 한 번 기록하고 멈춘다. 도구가 u1-web/functional-design/reviews/review-09부터 리뷰 사본을 만들면 그대로 보존하고 u2-api 검토의 사본임을 밝힌다. u2-api done 후에만 별도 요약 확인을 받는 u1-web 실행을 연다. 이 요약 확인을 u1-web에 재사용하지 않는다.

## Consolidated Summary Confirmation

이미 커밋된 u2-api 처리 시한 설계의 정렬을 질문·검증 기록으로 보존한다. 시한 초과 처리 중 요청은 FAILED/APPLIED/CLOSED·DISPATCH 실패 항목과 서버 근거, 반영 대기는 processing 결과 유지·APPLY_FAILED/CLOSED·APPLICATION 실패 항목으로 구분한다. 반영 실패는 시한을 기다리지 않고 다음 주기 판정에서 닫고 RECOVERING·재반영을 쓰지 않는다. 등록 0건인 허용 실패 CLOSED만 FAILURE_WITHOUT_RESULTS로 새 동의 재요청하며, 시한 종결/결과 경합과 늦은 결과 PAYLOAD_CONFLICT 방어를 유지한다. 저장된 Catch·공개·링크 보존과 운영 DB 상태/백업 확인의 상위 요구 해석, 앱 안 복구 제외와 받아들인 위험·유보 범위는 위 답에 연결했다. 산출물·기존 기록·12월·본 흐름 상태는 그대로 보존한다. traceability FAIL 23개는 10/9와 정확히 같고 그대로 남긴다. 이 별도 확인 뒤 독립 검토를 한 번 실행하고 READY·의견 없음일 때만 완료 요청을 한 번 하며, 거부/의견이면 원문을 보존하고 멈춘다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
