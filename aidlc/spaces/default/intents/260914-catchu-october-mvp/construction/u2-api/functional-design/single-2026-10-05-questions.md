# Functional Design 변경 기록 — 2026-10-05 u2-api 공유 링크 발급 입력 길이

## 사용자 결정과 반영 범위

근거는 2026-10-05 팀장(ljm0850)의 이번 사용자 지시, [#221](https://github.com/JminAILab/CatchU/issues/221)(담당 csyg0616, 상위 [#212](https://github.com/JminAILab/CatchU/issues/212)), `00e9753cd9b26e76d3de09beac9de4412de4ed6f`에서 갈라진 `docs/링크-발급-입력-길이-계약`의 단일 변경 커밋 `f1cb8d9deeae09b68d534f3437895cc9ff7fe8b1`이다. PR·병합 전 변경을 기록하며 이번 실행에서 산출물을 다시 쓰지 않는다. 9/30처럼 새 single-stage:functional-design으로 기록하고 본 흐름 Unit 상태는 바꾸지 않는다.

### Q1. 규칙에 반영된 입력 조건은 무엇인가?

[Answer]: rules.md BR2.12의 statement·logic·violation 세 줄에 발급 입력 길이 검사와 위반 시 400 VALIDATION_FAILED를 추가했다. 제목은 trim 후 1~50자, 선택 비밀번호는 trim·정규화 없이 입력 그대로 8~64자이며 유니코드 코드 포인트로 센다. 기존 source [FR4.3, FR4.4], 유효 링크 수·제목 유일성·원자 발급·만료·중단 의미는 유지한다. traceability.json의 FR4.4→BR2.12·BR2.13, FR4.3→BR2.12·BR2.14를 보존한다. 계약 설계 변경과 합쳐 3개 파일 5줄 교체이며 줄 수 변화는 없다.

### Q2. 길이 결정 근거와 제외 범위는 무엇인가?

[Answer]: [이번 계약 질문의 Q2](../../../inception/contract-design/single-2026-10-05-questions.md)에 표준 원문과 팀장 판단을 구분했다. NIST SP 800-63B-4 §3.1.1.2의 단독 인증 15자·다중 요소 인증 일부 8자·최대 적어도 64자 허용 권고·코드 포인트 계산, OWASP ASVS 5.0 §6.2.1·6.2.9를 참고했다. 링크의 무작위 토큰 URL과 #150 시도 제한을 고려한 팀장 판단으로 8~64자를 택했으며 NIST 다중 요소 인증 또는 표준 전체 준수를 주장하지 않는다. URL과 함께 전달되면 15자 기준을 충족한다고 보지 않는다. 제목 50자는 FR4.2의 비공개 관리용 이름을 위한 서비스 결정이며 상한을 늘리는 호환성을 고려했다. unlock 입력 검사(#195), 흔한 비밀번호 목록 대조·유니코드 정규화는 추가하지 않는다. entities.md는 00e9753과 동일하게 두며 제목 DB 칼럼 상한은 #221 구현 PR에서 계약에 맞춰 정한다.

### Q3. 무엇을 검증하고 어떤 조건에서 완료하는가?

[Answer]: rules YAML과 추적 JSON을 파싱하고 BR2.12의 source 및 FR4.4·FR4.3 대상 연결을 대조한다. entities.md는 오래된 로컬 dev 대신 00e9753과 바이트 비교한다. required-sections·upstream-coverage는 consumes·deliverables를 명시해 확인하고, traceability 센서의 missing_from_upstream_ids가 9/24·9/30의 기존 실패와 같은 한계인지 대조해 FAIL 그대로 남긴다. 요약 확인 뒤 aidlc-architecture-reviewer-agent 독립 검토를 --single로 한 번 요청하고 READY이면 report --single을 한 번 실행한다. 의견이 나오면 산출물을 고치지 않고 원문을 검증 문서에 남겨 멈춰 보고한다. 도구가 읽기용 리뷰 사본을 다른 Unit 폴더에 저장하면 그대로 두고 경로를 기록하며 그 Unit의 검토로 세지 않는다.

## 검증과 보존 범위

- f1cb8d9 대비 계약·설계 산출물 diff가 없어야 한다. 9/23·9/24·9/30 질문·검증·review 파일은 바이트 동일하게 보존한다. 제품 API·DB 실행 시험은 이번 문서 기록의 범위가 아니다.
- CHANGE_ACCEPTED를 그대로 남긴다. 알림 해소를 위한 산출물 재저장·설정 변경을 하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED로 거부되면 한 번만 기록하고 멈춰 보고한다.
- 10월 intent에서만 실행하며 2.10.0·설정·본 흐름 Completed·relaxed·Unit 상태·12월 intent를 유지한다. 상태·감사는 직접 편집하지 않는다. refresh·--force·본 흐름 next·park·compose를 실행하지 않는다.
- docs/·이슈·PR·계약·설계 산출물과 u1-web 제품 산출물은 수정하지 않는다. 새 질문·검증·도구 기록·10월 감사(9/30~10/4 미커밋 세션 기록 포함)를 한 커밋으로 남기고 push하지 않는다. aidlc-state.md는 도구 변경이 있을 때만 포함·보고한다.

## Consolidated Summary Confirmation

PR·병합 전 f1cb8d9에 이미 반영된 BR2.12의 발급 제목·선택 비밀번호 길이와 400 응답을 계약·팀장 결정에 연결해 기록한다. source·FR 추적·entities·기존 기록을 보존하며 이번 실행에서 산출물을 다시 쓰지 않는다. 새 기능 설계 단독 실행의 범위는 u2-api뿐이고 본 흐름 Unit 상태를 바꾸지 않는다. 독립 검토는 한 번, READY이면 단독 완료도 한 번 실행하며 기존 추적 센서 실패·검토 의견·거부·다른 Unit 경로의 리뷰 사본을 사실대로 남긴다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
