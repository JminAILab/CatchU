# Contract Design 변경 기록 — 2026-10-06 링크 발급 빈도 제한 (#219)

## 사용자 결정과 반영 범위

근거는 2026-10-06 팀장(ljm0850)의 이번 사용자 지시, [#219](https://github.com/JminAILab/CatchU/issues/219)(상위 [#212](https://github.com/JminAILab/CatchU/issues/212)), 비용 통제 요구사항 NFR5다. 브랜치는 `docs/링크-발급-빈도-제한-계약`, 계약 변경은 `37b50f055847f27d549f53e89029486dabd529c1`, 분기 기준은 `origin/dev`의 `729a52dd3e314ed70d00b28b39641cdea4179bbe`다. PR·병합 전의 변경에 기록만 추가하며 계약·설계 산출물은 다시 쓰거나 저장하지 않는다. #223의 기록 커밋 `0d956e7`과 같은 방식이다.

### Q1. 발급 빈도를 넘은 요청의 계약은 무엇인가?

[Answer]: 같은 회원의 createShareLink 요청이 빈도 상한을 넘으면 회원 인증 다음, 입력 검사·비밀번호 해시·저장보다 먼저 429/RATE_LIMITED로 거부한다. 다시 보낼 수 있을 때까지 남은 초를 Retry-After 헤더로 보낸다. 거부한 요청은 링크·멱등 기록을 남기지 않아 같은 키로 다시 보낼 수 있다. 여러 API가 함께 쓸 수 있는 RATE_LIMITED를 쓰며, 수신자 비밀번호 시도 제한의 LINK_UNLOCK_LIMITED는 쓰지 않는다. 수신자 unlock 계약과 수신자 조회 두 경로의 응답은 유지한다.

### Q2. 상한 값·배치 위치·해시 강화는 어떻게 구분하는가?

[Answer]: 상한 값(예정: 회원당 1분 10회)은 계약에 적지 않고 #173과 같은 이유로 api 설계에 둔다. 이번 기록으로 예정값을 계약 또는 확정 구현값으로 승격하지 않는다. 빈도 제한은 api에 둔다. 팀장이 제시한 선택 근거는 배포 앞단(nginx, AWS WAF 등)이 해당 회원 단위로 셀 수 없고 AWS WAF가 근사치로 세어 몰린 요청을 막지 못한다는 판단이다. 이 기록은 해당 배포 설정의 실험 결과가 아니다. 비밀번호 해시 강화(N=2^15·r=8·p=3)는 코드 PR의 내부 구현이며 이번 계약 변경이 아니다. 수신자 unlock·시도 제한 계약은 바꾸지 않는다.

### Q3. 이번 기록과 기존 실행은 어떻게 구분하는가?

[Answer]: 2026-09-23T07:02:00Z에 열린 single-stage:contract-design에 이어 붙이고 새 차수를 만들지 않는다. 9/23·9/24·9/30·10/5 질문·검증·review 파일을 그대로 보존한다. 이번 요약 확인 뒤 검토 요청과 report --single을 각각 한 번만 실행한다. 단계 폴더 전체 질문 파일의 단독 확인 요구로 거부되면 재시도·질문 파일 이동·추가 영수증·우회 없이 결과 원문을 검증 문서에 남기고 실행을 열어 둔다. SUMMARY_ARTIFACT_UNAUTHORIZED이면 한 번만 기록하고 멈춰 보고한다. CHANGE_ACCEPTED는 그대로 기록하며 알림 해소용 재저장·설정 변경을 하지 않는다.

## 검증과 보존 범위

- 계약 YAML 4개·contract-summary.md의 YAML 블록을 파싱하고 모든 `$ref`를 해석한다. createShareLink 응답은 200·201·400·401·403·404·409·429·500, unlock은 200·400·401·404·429·500, 수신자 조회 두 개는 200·400·401·404·500인지 대조한다.
- contract-summary.md 117·131·188행, common.yaml RetryAfter, member-api.yaml createShareLink 429, u2-api rules.md BR2.12와 functional-spec.md F6를 사용자 결정과 대조한다. required-sections 및 consumes·deliverables를 명시한 upstream-coverage를 실행한다.
- 계약·각 Unit 기능 설계 산출물과 기존 질문·검증·review 기록을 37b50f0과 바이트 비교한다. 어긋나면 고치지 않고 보고한다.
- 10월 intent를 명시적으로 선택하며 12월 intent·2.10.0·설정·본 흐름 Completed·relaxed·Unit 상태를 보존한다. refresh·--force·본 흐름 next·park·compose를 실행하지 않고 상태·감사 파일을 직접 편집하지 않는다.
- 기록 대상은 계약 설계와 u2-api 기능 설계다. u1-web 산출물, docs/·이슈·PR·계약·설계 산출물은 수정하지 않는다.
- 새 질문·검증·도구 기록과 10월 감사 파일을 한 커밋으로 남긴다. 감사에 이미 붙어 있던 2026-10-05T12:28Z 이후 미커밋 세션 기록도 지우거나 고치지 않고 포함한다. aidlc-state.md는 도구 변경이 있을 때만 포함하고 보고한다. push하지 않는다.

## Consolidated Summary Confirmation

회원 인증 다음, 입력 검사·해시·저장보다 먼저 발급 빈도를 판정해 429/RATE_LIMITED와 Retry-After를 반환하고 링크·멱등 기록 없이 같은 키의 재요청을 허용하는 결정을 37b50f0에 연결해 기록한다. 상한 값은 api 설계에 두고 수신자 계약·해시 구현은 이번 계약 변경에서 제외한다. 기존 산출물과 기록을 보존하며 9/23 계약 단독 실행의 검토·완료 요청을 각각 한 번만 실행한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
