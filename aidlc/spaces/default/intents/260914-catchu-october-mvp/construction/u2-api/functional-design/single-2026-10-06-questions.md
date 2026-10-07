# Functional Design 변경 기록 — 2026-10-06 u2-api 링크 발급 빈도 제한 (#219)

## 사용자 결정과 반영 범위

근거는 2026-10-06 팀장(ljm0850)의 이번 사용자 지시, [#219](https://github.com/JminAILab/CatchU/issues/219)(상위 [#212](https://github.com/JminAILab/CatchU/issues/212)), 비용 통제 요구사항 NFR5와 `37b50f055847f27d549f53e89029486dabd529c1`이다. 브랜치는 `docs/링크-발급-빈도-제한-계약`, 분기 기준은 `729a52dd3e314ed70d00b28b39641cdea4179bbe`다. PR·병합 전 변경을 기록하며 이번 실행에서 산출물을 다시 쓰거나 저장하지 않는다. #223의 `0d956e7`처럼 u2-api의 새 single-stage:functional-design 기록으로 진행하며 본 흐름·Unit 상태는 보존한다.

### Q1. BR2.12와 F6의 판정 순서는 무엇인가?

[Answer]: 같은 회원의 링크 발급 빈도 상한을 회원 인증 다음, 입력 검사·비밀번호 해시·저장보다 먼저 확인한다. 상한을 넘으면 429/RATE_LIMITED와 다시 보낼 수 있을 때까지 남은 초의 Retry-After를 반환한다. 거부한 요청은 링크·멱등 기록을 남기지 않아 같은 키로 다시 보낼 수 있다. BR2.12 logic·violation 앞부분과 F6의 0단계가 해당 변경이다. 기존 BR2.12 source [FR4.3, FR4.4], 발급 입력 길이·유효 링크 수·제목 유일성·회원 단위 원자 발급·만료·중단 의미 및 추적 연결은 유지한다.

### Q2. 설계와 계약의 경계는 무엇인가?

[Answer]: 여러 API가 함께 쓸 수 있는 RATE_LIMITED를 쓰고, 수신자 비밀번호 시도 제한의 LINK_UNLOCK_LIMITED와 구분한다. 상한 값(예정: 회원당 1분 10회)은 #173과 같은 이유로 api 설계에 두며 계약에 적지 않는다. api 배치 결정과 앞단을 선택하지 않은 팀장 근거는 [계약 질문 Q2](../../../inception/contract-design/single-2026-10-06-questions.md)에 기록한다. 수신자 unlock·조회 계약은 유지한다. 비밀번호 해시 강화 N=2^15·r=8·p=3는 코드 PR의 내부 구현이고 이번 계약 변경이 아니다.

### Q3. 무엇을 검증하고 어떤 경우 멈추는가?

[Answer]: 계약 YAML·요약 블록·모든 $ref, 발급·unlock·조회 응답 집합, BR2.12와 F6 및 FR4.3·FR4.4 추적 연결을 대조한다. required-sections·upstream-coverage에 consumes·deliverables를 명시하고 기존 추적 센서 실패는 과거 기록과 비교해 그대로 남긴다. 요약 확인 뒤 검토 요청과 report --single은 각각 한 번만 실행한다. 알려진 질문 파일 확인 결함으로 거부되면 결과 원문을 기록하고 단독 실행을 열어 두며 재시도·이동·추가 영수증·우회를 하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED이면 한 번만 기록하고 멈춰 보고한다. 독립 검토 의견이 있으면 산출물을 고치지 않고 보고한다. 도구가 다른 Unit 폴더에 리뷰 사본을 만들면 그대로 보존하고 u2-api 검토의 사본임을 기록한다.

## 검증과 보존 범위

- 계약·기능 설계 산출물과 9/23·9/24·9/30·10/5 질문·검증·review 기록은 37b50f0과 바이트 동일해야 한다. 제품 API·DB 시험 및 #219 해시 성능 측정은 이번 문서 기록의 검증이 아니다.
- CHANGE_ACCEPTED 알림은 그대로 기록한다. 알림을 없애려 재저장하거나 설정을 바꾸지 않는다.
- 10월 intent만 사용한다. 12월 intent·2.10.0·설정·본 흐름 Completed·relaxed·Unit 상태를 보존하고 상태·감사를 직접 편집하지 않는다. refresh·--force·본 흐름 next·park·compose를 실행하지 않는다.
- u1-web 산출물과 docs/·이슈·PR·계약·설계 산출물은 수정하지 않는다. 새 질문·검증·도구 기록과 기존 미커밋 세션 기록이 붙은 10월 감사 파일을 지정 메시지의 한 커밋으로 남긴다. aidlc-state.md는 도구 변경 때만 포함·보고하며 push하지 않는다.

## Consolidated Summary Confirmation

u2-api BR2.12와 F6의 회원 발급 빈도 판정을 계약의 429/RATE_LIMITED·Retry-After·거부 시 기록 없음과 대조해 사후 기록한다. 상한 값은 api 설계에 두며 기존 발급 규칙·추적 연결·수신자 계약을 유지한다. 계약·설계 산출물은 37b50f0 그대로 보존하며 독립 검토와 단독 완료 요청은 각각 한 번만 실행한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
