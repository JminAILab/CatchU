# Functional Design 사후 기록 — 2026-09-30 u1-web 비밀번호 차단 안내

## 사용자 결정과 반영 범위

근거는 [#150 팀장 결정(2026-09-29)](https://github.com/JminAILab/CatchU/issues/150#issuecomment-5883572995), dev에 병합된 #173(`a2649c6`)의 첫 부모 대비 diff와 이번 사용자 지시다. #173은 csyg0616이 2026-09-30 승인했다. 앞선 u2-api 단독 실행의 완료 뒤 새로운 functional-design 단독 실행에서 u1-web 기록을 남긴다.

### Q1. #173이 수신자 화면 설계에 반영한 내용은 무엇인가?

[Answer]: functional-spec.md의 「화면 상태 전이」 표 중 수신 접근 행 하나에 LINK_UNLOCK_LIMITED는 차단 안내로 보여 주고 Retry-After의 남은 시간을 표시한다고 적었다. 같은 행의 금지 항목에 차단을 비밀번호 오류로 표시하는 것을 넣었다. 기존 LINK_UNAVAILABLE 공통 안내, LINK_PASSWORD_REQUIRED/LINK_PASSWORD_INVALID 비밀번호 분기, 상세 사유 노출·grant를 통한 현재 권한 우회 금지는 유지했다. 이번에는 해당 행을 다시 고치지 않고 결정·병합 diff·현재 계약과 일치하는지 기록한다.

### Q2. 검증·독립 검토와 보존 범위는 무엇인가?

[Answer]: #173의 web 변경이 해당 행 하나인지, 현재 functional-spec.md의 차단 안내·Retry-After 표시가 계약의 429 LINK_UNLOCK_LIMITED·남은 초 헤더와 맞는지 확인한다. 기존 화면 흐름·상태·traceability 및 9/23·9/24 질문·검증·검토 기록을 보존한다. aidlc-architecture-reviewer-agent가 --single 범위로 독립 검토하고 READY일 때 report --single을 한 번 실행한다. 의견이 나오면 산출물을 고치지 않고 검증 문서에 원문을 남겨 팀장에게 보고한다.

## 검증과 보존 범위

- functional-spec.md와 traceability.json, 공유 계약·api·worker 산출물을 다시 저장하지 않는다. 실제 화면 구현이나 API 연결 시험은 이번 기록에 포함하지 않는다.
- 현재 화면 행과 계약의 오류 코드·헤더, 한 행 변경 범위, 파일 바이트 보존 및 적용되는 센서 결과를 확인한다. 기존 센서 한계는 그대로 구분해 기록한다.
- CHANGE_ACCEPTED 알림은 이전 저장 기록과 이번 확인의 차이로 남기며 재저장·설정 변경으로 없애지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED로 거부되면 한 번만 기록하고 멈춰 보고한다.
- 본 흐름 Completed·relaxed, 버전 2.10.0, 12월 intent를 유지한다. 상태·감사 파일은 직접 편집하지 않는다. 이번 질문·검증과 도구가 남긴 기록, 허용된 상태 항목명 변경·10월 감사만 커밋하고 dev PR을 만든다. 이슈·PR 댓글 수정, #148·#150 종료, 리뷰어 지정·병합은 하지 않는다.

## Consolidated Summary Confirmation

u1-web의 수신 접근 행에 이미 반영된 LINK_UNLOCK_LIMITED 차단 안내, Retry-After 남은 시간 표시, 차단을 비밀번호 오류로 표시하지 않는 규칙을 #150 결정·#173 병합 diff·현재 계약과 대조해 기록한다. 이미 dev에 병합된 변경의 사후 기록이며, 이번 실행에서 산출물을 다시 쓰지 않는다. 기존 파일을 보존하고 독립 검토 후 READY이면 단독 완료를 한 번 기록한다. 세 곳의 결과와 산출물 diff가 비어 있음을 최종 확인한 뒤 기록만 커밋·푸시해 dev PR로 제출한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
