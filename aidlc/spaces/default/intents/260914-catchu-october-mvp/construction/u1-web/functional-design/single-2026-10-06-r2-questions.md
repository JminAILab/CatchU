# u1-web Functional Design 추가 기록 — 2026-10-06 링크 발급 429 재전송 (#219)

## 사용자 결정과 반영 범위

근거는 2026-10-06 팀장(ljm0850)의 이번 사용자 지시, [#219](https://github.com/JminAILab/CatchU/issues/219), [PR #235 Codex 지적](https://github.com/JminAILab/CatchU/pull/235#discussion_r4192563642)이다. 앞선 기록은 a7f6ddd이며 실제 보완 커밋은 `466a40272dfa0bbce64f807d563695690e47d58c`다. 지시문에 적힌 `466a40253`은 해석되지 않으나 HEAD와 PR head의 실제 커밋에 두 파일·각 한 줄 보완이 일치한다. 이번 대상은 u1-web 기능 설계 74행 「재전송」이며 산출물은 다시 쓰거나 저장하지 않는다. 계약 설계의 확인·검토·완료 요청은 [별도 계약 기록](../../../inception/contract-design/single-2026-10-06-r2-verification.md)에 남긴다. 그 확인을 이번 web 확인으로 재사용하지 않는다.

### Q1. 링크 발급 429에서 화면이 키를 어떻게 유지하는가?

[Answer]: 429 RATE_LIMITED는 처리하지 않은 요청으로 확정 결과가 아니며 앞선 같은 키 요청의 결과를 알려 주지 않는다. 응답을 모르던 요청이면 키를 유지하고 Retry-After 뒤 같은 키·같은 본문으로 다시 보낸다. 401과 같은 키 유지 취급이며 새 키를 만들어 복구 경로를 잃지 않도록 한다. 기능 설계의 기존 같은 사용자·operation·본문 유지 문장과 이번 429 문장이 함께 이 규칙을 말한다. 수신자 unlock의 429 LINK_UNLOCK_LIMITED를 회원 발급 응답과 섞지 않는다.

### Q2. 서버 판정과 후속 구현의 책임은 무엇인가?

[Answer]: 같은 키 재요청도 발급 빈도 검사보다 먼저 처리하지 않는다. 비밀번호 링크는 같은 키 재요청도 해시로 비밀번호를 비교하므로 빈도 제한에서 빼면 같은 키 반복만으로 해시를 무제한 계산할 수 있다는 팀장 판단을 유지한다. 회원 인증 다음·입력 검사·비밀번호 해시·저장보다 먼저 429/RATE_LIMITED, 남은 초는 Retry-After, 상한 값은 api 설계라는 앞선 결정을 바꾸지 않는다. web 코드 수정은 담당자 csyg0616에게 요청할 후속 작업이며 이번 기록에서는 코드 수정이나 담당자 메시지 발송을 하지 않는다. u2-api 산출물은 바뀌지 않았으므로 추가 기록 대상에서 제외한다.

### Q3. 이번 단독 실행·검증·보존 범위는 무엇인가?

[Answer]: 2026-10-06T08:15:30Z에 새 single-stage:functional-design을 열고 u1-web의 기존 functional-spec.md·traceability.json만 검토 대상으로 삼는다. ui Unit은 entities·rules 산출 대상이 아니며 선택 frontend-components도 새로 만들지 않는다. 필수 절·상류 참조 센서 통과와 9/24·9/30과 같은 기존 traceability 실패 43건을 구분한다. 검토 요청과 report --single은 각각 한 번만 실행한다. 거부되면 원문을 검증 문서에 남기고 실행을 열어 둔다. 재시도·질문 파일 이동·추가 영수증·우회 및 restart-stage·restore-or-jump 제안은 실행하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED이면 한 번만 기록하고 멈춰 보고한다. CHANGE_ACCEPTED는 그대로 기록하며 알림 해소용 재저장·설정 변경을 하지 않는다.

## 검증과 보존 범위

- 계약 요약 117행과 web 설계 74행의 429 = 처리하지 않음·키 유지·Retry-After 뒤 같은 키 규칙을 대조한다. 계약 YAML 4개·요약 YAML 블록 3개와 `$ref` 203개, a7f6ddd와 동일한 발급·unlock·수신자 조회 응답 집합의 검증 결과를 재사용한다.
- required-sections와 consumes unit-of-work,unit-of-work-story-map,requirements,components,contract-summary 및 deliverables functional-spec,traceability를 명시한 upstream-coverage를 수행했다. 추적 대상 W1~W8 존재 및 FR4.3 → W6·FR4.4 → W6 W7을 유지한다. 실제 화면·API 연결·DB·해시 성능 검증으로 세지 않는다.
- 산출물 15개와 과거 질문·검증·review 40개를 실제 보완 커밋과 바이트 비교한다. 같은 날 앞선 single-2026-10-06-* 파일, 12월 intent·2.10.0·설정·본 흐름 Completed·relaxed·Unit 상태를 보존한다. 어긋나면 고치지 않고 보고한다.
- refresh·--force·본 흐름 next·park·compose와 상태·감사 직접 편집을 하지 않는다. docs/·이슈·PR·계약·설계 산출물·web 코드 수정 없음. 새 질문·검증·도구 기록과 10월 감사의 기존 미커밋 세션 기록까지 한 커밋으로 남기며 .local-handoffs/ 제외, push 없음. aidlc-state.md는 도구 변경이 있을 때만 포함하고 내용을 보고한다.

## Consolidated Summary Confirmation

web은 링크 발급 429 RATE_LIMITED를 확정 결과로 보지 않고 키를 유지하며 Retry-After 뒤 같은 키·같은 본문으로 재전송한다. 같은 키 재요청에도 서버의 선행 빈도 검사를 유지하는 이미 반영된 계약과 기능 설계를 대조해 기록한다. 산출물을 다시 저장하지 않고 새 u1-web 단독 실행의 검토 요청·완료 보고를 각각 한 번만 실행하며 거부·CHANGE_ACCEPTED와 기존 추적 실패를 그대로 남긴다. 실제 web 구현 수정은 후속 작업이다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
