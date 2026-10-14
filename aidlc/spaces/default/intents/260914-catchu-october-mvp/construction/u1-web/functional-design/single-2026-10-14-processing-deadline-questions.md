# u1-web Functional Design 단독 후속 기록 — 2026-10-14 처리 시한 (#237)

## 기록 지위·대상·선행 완료

팀장(ljm0850)이 2026-10-13 Chat으로 준 사실과 기록 지시에서 답을 추출한다. 이미 커밋된 web 기능 설계를 다시 쓰지 않는다. 제품 결정·기각 이유·받아들인 위험·상위 요구 해석과 유보 범위 전체는 [계약 질문·답](../../../inception/contract-design/single-2026-10-13-processing-deadline-questions.md)에 있다. 원격 의견·당시 상태는 팀장이 제공한 근거이며 이번 원격 조회/승인 확인의 결과로 꾸미지 않는다.

- 대상 intent: 260914-catchu-october-mvp. 브랜치: docs/분석-처리-시한-계약. 보존 판본: 7e3b92b23cac43167c92f475c3b5ca69af9327bf. 실행 binary/runtime·하네스는 2.11.0, 본 흐름 functional-design / Completed·Guard Policy relaxed는 유지한다.
- 계약 단독 실행은 9/23 시작에 이어 요약 확인이 성공했지만 검토·완료 요청 각각 1회가 SUMMARY_RECEIPT_MISSING으로 거부돼 열린 채 유지한다. 재시도·질문 이동·추가 확인 기록·복구 제안 우회 없음.
- [u2-api 검증](../../u2-api/functional-design/single-2026-10-13-processing-deadline-verification.md)에서 별도 사람 요약 확인·독립 검토 1회 READY·신규 의견 없음·완료 요청 1회 kind:done을 확인한 뒤에만 이번 u1-web 단독 실행을 열었다. u2-api 리뷰 사본 reviews/review-09.md는 이 폴더에 있지만 u1-web 검토로 세지 않는다.
- 새 실행 명령은 aidlc engine orchestrate next --stage functional-design --single이다. 반환은 Unit 필드 없는 functional-design·single:true·gate:false다. 작업 대상과 검토 입력을 u1-web 기존 functional-spec.md·traceability.json과 이번 Q&A로 한정한다. 본 흐름/Unit 상태를 변경하거나 산출물을 재저장하지 않는다.

## 질문·답

### Q1. 처리 시한·반영 실패와 조회 실패를 화면에서 어떻게 구분하는가?

[Answer]: 시간 초과 실패는 E(api)의 서버 판정으로 표시한다. web은 단순 시간 경과·HTTP timeout·조회 실패를 processing=FAILED/EMPTY로 바꾸지 않으며 새 분석을 자동 요청하지 않는다. 접수(submittedAt) 기준 처리 시한의 숫자는 계약 요약 「공통 오류·요청 안전성」에만 둔다. 서버는 시한 초과 ACTIVE를 실행 멈춤 증거 없이 닫으며, 처리 중이면 FAILED/APPLIED/CLOSED·stage DISPATCH·code PROCESSING_DEADLINE_EXCEEDED·message "정해진 시간 안에 분석을 마치지 못했습니다."다. 반영 대기면 processing 결과 유지·APPLY_FAILED/CLOSED·stage APPLICATION·같은 code·message "정해진 시간 안에 결과를 반영하지 못했습니다."다. web은 처리 실패와 반영 실패를 섞지 않는다. 조회 오류는 LOOKUP_FAILED/API code 안내와 재조회로 다룬다. code로 분기하고 message 문자열 비교로 상태를 결정하지 않는다.

### Q2. 분석 중·실패 아이콘과 반영 실패의 경계는 무엇인가?

[Answer]: W3와 내 자산 화면의 기존 의미를 유지한다. 대기·실행 중·실행 불명 및 lifecycle ACTIVE의 반영 대기·반영 중·반영 실패는 분석 중으로 묶되 실행 불명·반영 실패의 문구를 구분한다. APPLY_FAILED는 처리 시한을 기다리지 않고 E의 다음 주기 판정에서 CLOSED가 된다. CLOSED이고 반영 완료가 아니면 분석 중에 두지 않고 실패 아이콘으로 표시한다. 반영 실패로 닫힌 요청은 processing 결과를 분석 실패로 바꾸지 않고 반영 실패 문구로 구분한다. 서버가 FAILED로 확정한 처리 시한 초과도 실패로 표시한다. RECOVERING 값은 계약 목록에 남기되 쓰지 않으므로 '반영 복구 중' 안내를 만들지 않는다. RUNNING → UNCERTAIN을 새 화면 전이로 추가하지 않는다.

### Q3. 재요청 버튼·새 동의와 정상 0건/부분 실패는 어떻게 다루는가?

[Answer]: W8은 서버의 현재 retry.allowed가 true일 때만 재요청을 안내한다. 대상은 등록 Catch 0건인 두 CLOSED 실패 경우(FAILED/APPLIED/CLOSED·적합 후보 0·실패 확정 근거, 또는 APPLY_FAILED/CLOSED·처리 결과/적합 후보 수 무관)이며 reason은 FAILURE_WITHOUT_RESULTS다. web이 자체 판정으로 버튼을 열지 않는다. [동의하고 다시 요청]은 현재 고지·범위의 새 동의와 새 요청을 만들고 기존 동의를 재사용하지 않는다. retryOfRequestId 생략으로 우회하지 않는다. 정상 EMPTY·반영 완료된 부분 실패는 10월 재요청 대상이 아니고, 결과 준비는 ownerResultsReady와 registeredCatchIds로 판단한다. 후보 존재/F 종료만으로 결과 버튼을 활성화하지 않는다. 늦게 도착한 결과·이벤트를 web이 직접 해석하지 않는다.

### Q4. 앱 안 복구 제외와 자료 보존의 적용은 무엇인가?

[Answer]: [#23 10/6 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)에 따라 서버·worker·큐·DB가 끊기는 흔치 않은 장애는 앱에서 복구하지 않는다. 결과 보존·재전달·반영 복구·큐에서 사라진 요청 재전송·worker 실행 차단 기록·RUNNING → UNCERTAIN은 두지 않고 큐의 같은 작업 재전달 횟수는 0이다. 실패 근거 추가 확인에 필요한 worker 시도 기록·결과 보존·운영자 확인 절차를 없애는 결정이며 결과 원문 보관안과 14일 보존도 거뒀다. worker는 결과를 보내면 끝이다.

큐 자료 유실로 같은 시도가 드물게 다시 실행되거나 시한으로 닫힌 앞 시도가 도는 중 재요청이 들어올 위험은 수용했다. 서버는 한 시도에 먼저 받은 결과 하나만 수락하고 닫힌 시도 결과를 PAYLOAD_CONFLICT로 거부해 Catch가 늘지 않게 한다. web은 api 상태 정본을 소비한다. M05·FR1.4의 보존은 이미 저장된 Catch·공개·링크를 뜻하며 반영 전 결과는 시한 실패 뒤 재요청으로 다룬다. M07·NFR4는 재시작·재배포 후 DB 자료·공개/숨김/링크 상태 유지와 관리형 DB 자동 백업 켜짐·보관 기간 확인([#24 10/6](https://github.com/JminAILab/CatchU/issues/24#issuecomment-6012203241), PR #241 AWS), 복원 시험은 12월이다. NFR7의 운영 정리는 식별자·상태·시각만 보며 내용 열람 예외를 만들지 않는다. 상류 요구/과거 승인 문서는 소급 수정하지 않는다.

### Q5. 이미 반영된 web 변경과 보존할 내용·후속 범위는 무엇인가?

[Answer]: 변경 대상은 기존 functional-spec.md L18·L34·L37·L58·L61의 W8·분석 중/실패 표시·UNCERTAIN·APPLY_FAILED 전이 문장이다. 팀장이 제공한 과거 Codex 독립 점검·수정안 검토·재검증에서 u1-web L37을 고쳤으며 이번 독립 검토와 구분한다. 7e3b92b와 바이트가 같게 보존하고 #262의 제목 null·기존 화면·회원/수신자 계약·멱등·429 내용도 그대로 둔다. 새로운 entities.md/rules.md/frontend-components.md를 만들거나 UI-only 추적표를 BR ID로 고치지 않는다.

worker 총 처리 상한은 #121(계약 시한보다 충분히 짧게, 20분은 제안), 종결 시도에 '모름' 응답은 #232, E의 옛 ACTIVE/APPLY_FAILED 재반영 길 종료는 #237(담당 ljm0850, 상위 #134)의 실제 구현에서 한다. u3-worker 결과 보존 문장·api/docs/·api/README.md·docs 파생 문서·에이전트 문서는 이번에 고치지 않으며 12월 입력 이관은 설계 재개 때 한다. web 코드·실제 화면 동작·DB·큐·worker·배포·이슈·PR·Project 변경은 이번 기록 작업에 포함하지 않는다.

### Q6. 검증 결과와 독립 검토/완료 조건은 무엇인가?

[Answer]: required-sections·upstream-coverage는 PASS다. traceability는 FAIL 43개(상류 ID 누락 20개·BR target 요구 22개·rules.md가 없다는 reason)이며 10/9 결과 JSON 전체·ID/target 목록과 정확히 같다. ui Unit이 entities/rules를 제공하지 않는 기존 범위와 W1~W8 실제 화면 ID를 보존하고 센서를 PASS로 만들려고 파일/ID를 추가하지 않는다.

이 u1-web 요약에 새 사람 Looks correct를 받은 뒤 aidlc-architecture-reviewer-agent 독립 검토 --single을 한 번 실행한다. READY·의견 없음일 때만 report --single을 한 번 실행하며 NOT-READY·의견·거부면 산출물을 고치지 않고 원문을 남긴 뒤 멈춘다. CHANGE_ACCEPTED는 원문 보존하고 알림 제거 목적의 재저장·설정 변경은 하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED면 한 번 기록하고 멈춘다. 리뷰 사본은 도구가 만든 위치에 그대로 두며 reviews/review-09.md는 u2-api 검토, 이번 u1-web 리뷰는 이후 새 사본으로 구분한다. 이 확인에 계약/u2-api의 사람 답을 재사용하지 않는다.

## Consolidated Summary Confirmation

이미 커밋된 u1-web 설계를 다시 쓰지 않고 처리 시한·반영 실패와 실패 재요청의 표시 의미를 질문·검증 기록으로 보존한다. 시간만으로 화면이 실패를 확정하지 않고 E의 CLOSED·processing/application을 표시하며, ACTIVE의 반영 실패와 CLOSED의 반영 실패를 구분한다. 반영 실패를 처리 실패로 치환하거나 반영 복구 중으로 안내하지 않는다. 서버 retry.allowed가 true인 허용 실패만 새 동의 재요청하며 정상 0건·반영 완료된 부분 실패는 대상이 아니다. 기존 자료·권한·화면·#262 제목 null·멱등/429는 유지한다. 앱 안 복구 제외·상위 요구 해석·받아들인 위험과 유보 범위를 위 답에 연결한다. 지정 산출물·기존 기록·12월·본 흐름/Unit 상태는 그대로다. traceability FAIL 43개는 10/9와 동일하고 그대로 남긴다. 이 별도 확인 뒤 독립 검토 1회, READY·의견 없음일 때만 완료 요청 1회를 실행한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
