# 10월 원본 보호 예외 — 계약 설계 검증 기록 (2026-10-15)

## 계약 요약 확인 이후의 실제 결과

팀장의 별도 응답 Looks correct를 질문 파일에 기록한 뒤 log answer를 한 번 실행했다. SUMMARY_CONFIRMATION_RECORDED 성공, summary_authorization_id a93c8b31fb6e45308087545e394872b67815127d1b2ff4a5cf6cad59c2847a65이다.

검토 요청은 한 번 실행했고 exit 1, SUMMARY_RECEIPT_MISSING으로 거부됐다. 독립 검토는 시작되지 않았고 READY 판정·리뷰 사본은 없다. report --single도 한 번 실행했고 exit 0이지만 kind:error다. 거부 메시지는 단계 폴더의 본 흐름 질문 파일(contract-design-questions.md)에 단독 실행 확인이 없다는 내용으로, 2026-10-14 인증 계약 기록과 같은 알려진 결함이다. 원문은 아래와 [도구 기록](single-2026-10-15-protection-exception-tools.json)의 같은 id에 보존한다. 9/23 단독 실행은 열린 채 둔다. 재시도·질문 파일 이동·추가 요약 확인·restart-stage·본 흐름 next 등 우회는 하지 않았다.

### contract-summary-answer

````text
aidlc engine log answer --stage contract-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-15-protection-exception-questions.md --details 'Looks correct'
````

exit_code: 0

````text
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"contract-design","choice":"Looks correct","summary_authorization_id":"a93c8b31fb6e45308087545e394872b67815127d1b2ff4a5cf6cad59c2847a65"}
````

### contract-review-request

````text
aidlc engine log review --stage contract-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1
````

exit_code: 1. 출력 원문은 도구 기록의 contract-review-request에 있다. 요지: "Cannot start review for contract-design: no fresh human-backed consolidated summary confirmation is recorded", reason_codes `SUMMARY_RECEIPT_MISSING`, 제안된 처리 restart-stage(실행하지 않음).

### contract-report

````text
aidlc engine orchestrate report --single --stage contract-design --result completed
````

exit_code: 0, kind:error. 출력 원문은 도구 기록의 contract-report에 있다. 요지: "Refusing to complete contract-design: no fresh human-backed consolidated summary confirmation is recorded".

## 판본과 실행 범위

- 작업 위치 /Users/ljm/Desktop/github/CatchU, HEAD `85ebe1f0443d139996b6b916a5a0335c01cf31b1`(브랜치 없음, PR #309 브랜치 판본과 같음), merge-base `90e5a12d921ba8242b5bf727f2d022b359513663`.
- 실행 하네스: Claude Code, aidlc 2.11.0 (runtime 2.11.0). intent 커서 `260914-catchu-october-mvp`.
- 같은 폴더를 쓰는 다른 세션(#233 구현 세션)은 이 기록 동안 멈춰 있도록 팀장이 조정했다.

## 기존 단독 실행과 보존 기준선

감사 조각에서 Workflow single-stage:contract-design의 STAGE_STARTED는 2026-09-23T07:02:00Z 한 건이고 STAGE_COMPLETED는 없다. 이번에 더해진 계약 단독 실행 이벤트는 2026-10-15T13:21:32Z DECISION_RECORDED, 2026-10-15T13:23:54Z SUMMARY_CONFIRMATION_RECORDED다.

## 검사 결과

| 검사 | 결과 |
|---|---|
| 필수 절(sensor-required-sections, contract-summary.md) | 통과, H2 11개, 지적 0 |
| 상류 연결(sensor-upstream-coverage, unit-of-work) | 통과, 지적 0 |
| 산출물 보존(확인 전·후 `85ebe1f0`과 비교: 계약 요약·common·member·recipient YAML·u2-api 기능 설계·aidlc-state.md·12월 intent) | 차이 없음 |
| PR 변경 범위(`90e5a12d`..`85ebe1f0`) | contract-summary.md 한 파일, +2 −2 |
| 기록 뒤 aidlc/ 아래 변경 | 10월 감사 파일 수정, 이번 기록 파일 추가뿐 |

traceability 센서는 계약 단계에 traceability.json이 없어 10/14 기록과 같이 실행하지 않았다. u2-api 기능 설계는 바뀌지 않아 새 단독 실행을 열지 않았다.

## 요약 확인 요청 당시 상태

````text
aidlc engine log decision --stage contract-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-15-protection-exception-questions.md --decision 'Does this all look correct before I generate the artifact?' --options 'Looks correct,Request changes'
````

exit_code: 0

````text
{"emitted":"DECISION_RECORDED","stage":"contract-design"}
````

DECISION_RECORDED 성공. 질문 파일의 요약 답은 비워 두고 팀장 응답을 기다렸다. 팀장이 대화에서 Looks correct로 답한 뒤 답 칸을 채우고 log answer를 실행했다.
