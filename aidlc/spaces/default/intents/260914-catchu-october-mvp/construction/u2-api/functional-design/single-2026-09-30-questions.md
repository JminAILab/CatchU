# Functional Design 사후 기록 — 2026-09-30 u2-api 링크 중단·비밀번호 차단

## 사용자 결정과 반영 범위

근거는 [#148 팀장 결정](https://github.com/JminAILab/CatchU/issues/148#issuecomment-5882528372), [#150 팀장 결정](https://github.com/JminAILab/CatchU/issues/150#issuecomment-5883572995), dev에 병합된 #170(`a7dcc87`)·#173(`a2649c6`)의 첫 부모 대비 diff와 이번 사용자 지시다. 두 결정은 2026-09-29에 내려졌고 csyg0616의 PR 승인은 각각 9/29·9/30이다. 기존 완료된 functional-design 단독 실행 뒤 새 실행에서 u2-api의 사후 기록을 진행한다. 기존 산출물·질문·검증·검토·감사를 소급 수정하지 않는다.

### Q1. #170이 api 규칙에 반영한 중단 응답은 무엇인가?

[Answer]: rules.md의 BR2.12에 소유 확인을 상태 확인보다 먼저 하고 본인 링크의 첫 중단·반복 중단·만료 링크 중단 모두 현재 ShareLink를 200으로 반환하도록 적었다. 중단 상태는 만료 시각 뒤에도 STOPPED, 만료 링크는 EXPIRED를 유지한다. 타인·없는 링크는 404 RESOURCE_UNAVAILABLE이며 중단의 업무 판정에 403·409를 쓰지 않는다. BR2.13의 적용 시점에서 중단 PUT을 빼 회원 중단과 수신자 접근을 분리했다. 네 중단 응답 중 만료 링크의 EXPIRED 유지가 새 결정이다.

### Q2. #173이 api 규칙·업무 흐름·상태 표에 반영한 내용은 무엇인가?

[Answer]: rules.md의 BR2.13에 링크 불가 여부를 먼저 판단하고 unlock 요청의 시도 제한을 비밀번호 검사보다 앞에 두었다. 차단 중이면 비밀번호를 검사하지 않고 429 LINK_UNLOCK_LIMITED로 거부하며 남은 초는 Retry-After 헤더로 보낸다. functional-spec.md의 F6에는 이미 중단·만료된 링크의 중단 요청은 stoppedAt을 기록하지 않고 현재 상태를 200으로 반환한다고 적었다. F7에는 링크 판정 → unlock 시도 제한 → 비밀번호/grant → 현재 자료 순서를 적었고 조회 GET에는 시도 제한을 적용하지 않는다. ShareLink 상태 표에는 STOPPED·EXPIRED에서 나가는 전이가 없음을 명시했다. 이 내용은 이미 병합됐으며 이번에 다시 쓰지 않는다.

### Q3. 무엇을 검증하고 어떤 조건에서 완료하는가?

[Answer]: rules.md의 YAML을 파싱하고 traceability.json의 FR4.3→BR2.12, FR4.5→BR2.13 연결을 규칙 본문과 대조한다. FR4.3에 함께 연결된 BR2.14도 그대로 보존한다. entities.md와 기존 산출물·기록을 바이트 단위로 확인한다. aidlc-architecture-reviewer-agent의 독립 검토를 --single로 기록하고 READY일 때 report --single을 한 번 실행한다. 검토 의견이 나오면 산출물을 고치지 않고 검증 문서에 원문을 남겨 팀장에게 보고한다.

## 검증과 보존 범위

- u2-api의 rules.md·functional-spec.md에 반영된 #170·#173 내용과 현재 계약을 대조한다. 산출물 변경과 실제 API·DB 실행 시험은 수행하지 않는다.
- rules YAML 파싱, FR4.3·FR4.5와 해당 규칙의 양방향 출처 연결, 중단과 수신자 적용 시점 분리, F6·F7 및 ShareLink 종결 상태를 확인한다. 어긋나면 수정하지 않고 보고한다.
- entities.md·traceability.json과 9/23·9/24 질문·검증·검토를 보존한다. 적용 센서 결과와 기존 추적 센서 한계는 구분해 기록한다.
- 이전 저장 확인에 묶인 산출물의 CHANGE_ACCEPTED 알림은 그대로 기록한다. 알림 해소를 위한 재저장·설정 변경은 하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED로 거부되면 한 번만 기록하고 멈춰 보고한다.
- 2.10.0과 본 흐름 Completed·relaxed, 12월 intent를 유지한다. 상태·감사는 직접 편집하지 않는다. 새 질문·검증·도구 기록과 허용된 상태 항목명 변경·10월 감사 파일만 커밋 범위에 포함한다.

## Consolidated Summary Confirmation

u2-api의 BR2.12 중단 응답, BR2.13의 수신자 판정·unlock 시도 제한, F6의 중단·만료 반복 요청, F7의 판정 순서와 GET 제외, ShareLink의 종결 상태를 두 결정과 병합 diff에 연결해 기록한다. 이미 dev에 병합된 변경의 사후 기록이며, 이번 실행에서 산출물을 다시 쓰지 않는다. YAML·추적 연결·entities 보존을 확인하고 독립 검토 후 READY이면 단독 완료를 한 번 기록한다. 의견이나 거부는 원문으로 남겨 보고한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
