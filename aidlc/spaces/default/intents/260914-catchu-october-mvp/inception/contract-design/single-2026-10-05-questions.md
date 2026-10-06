# Contract Design 변경 기록 — 2026-10-05 공유 링크 발급 입력 길이

## 사용자 결정과 반영 범위

근거는 2026-10-05 팀장(ljm0850)의 이번 사용자 지시와 `f1cb8d9deeae09b68d534f3437895cc9ff7fe8b1`이다. 브랜치는 `docs/링크-발급-입력-길이-계약`, 분기 기준은 `00e9753cd9b26e76d3de09beac9de4412de4ed6f`이며 이 시점은 PR·병합 전이다. 구현은 [#221](https://github.com/JminAILab/CatchU/issues/221)(담당 csyg0616), 상위는 [#212](https://github.com/JminAILab/CatchU/issues/212)다. 이번 실행에서 산출물을 다시 쓰지 않는다.

### Q1. 무엇을 결정했고 계약에 무엇이 반영됐는가?

[Answer]: 발급 본문의 제목은 trim 후 1~50자, 선택 비밀번호는 trim·정규화 없이 입력 그대로 8~64자다. 길이는 유니코드 코드 포인트로 세며 DB char_length와 같은 단위를 사용한다. 길이 위반은 400/VALIDATION_FAILED다. contract-summary.md 117행과 common.yaml 219행 ShareCreate가 해당 내용이다. title은 minLength 1과 trim 후 1~50자 설명을 두고, password는 minLength 8·maxLength 64와 입력 그대로라는 설명을 둔다. 비밀번호 생략은 허용한다. 수신자 unlock은 비어 있지 않은 문자열만 요구하는 기존 minLength 1을 유지하며 발급의 8~64자 검사를 적용하지 않는다.

### Q2. 값의 근거와 이번에 결정하지 않는 것은 무엇인가?

[Answer]: [NIST SP 800-63B-4 §3.1.1.2](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver)는 비밀번호 단독 인증에 최소 15자를 요구하고, 다중 요소 인증의 일부인 비밀번호는 최소 8자를 허용한다. 최대 허용 길이는 적어도 64자를 권고하며 유니코드 코드 포인트 하나를 한 글자로 센다. [OWASP ASVS 5.0 §6.2.1·6.2.9](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x15-V6-Authentication.md)는 최소 8자(15자 강력 권고)와 적어도 64자 허용을 제시한다. 팀장은 무작위 토큰 URL 및 [#150](https://github.com/JminAILab/CatchU/issues/150)의 시도 제한을 함께 고려해 링크 비밀번호 8~64자를 선택했다. 이는 서비스의 위험 판단 기록이며 토큰 URL·시도 제한만으로 NIST의 다중 요소 인증이나 표준 전체 준수를 인정하는 기록이 아니다. URL과 비밀번호를 함께 전달하면 15자 기준을 충족한다고 보지 않는다. 제목은 공개 표준이 정한 값이 아니라 FR4.2의 수신자에게 보이지 않는 관리용 이름이며, 상한을 나중에 늘려도 기존 값과 충돌하지 않아 50자로 작게 시작한다. 수신자 unlock 길이 검사([#195](https://github.com/JminAILab/CatchU/issues/195)), 흔한 비밀번호 목록 대조, 유니코드 정규화는 이번에 추가하지 않는다. entities.md의 제목 상한도 넣지 않으며 #221 구현 PR에서 계약 값에 맞춰 DB 칼럼 상한을 정한다. 코딩 절차 「코딩 운영」의 DB 관계·유일성 밖 내부 구현은 담당자가 정하는 경계를 유지한다.

### Q3. 열린 단독 실행과 이번 기록은 어떻게 구분하는가?

[Answer]: 감사 기록에서 2026-09-23T07:02:00Z의 single-stage:contract-design 시작과 이후 해당 실행의 완료 기록이 없음을 확인했다. 새 차수 없이 9/23·9/24·9/30 기록에 이번 날짜의 질문·검증을 이어 붙인다. 이번 요약 확인 뒤 검토 요청과 report --single을 각각 한 번만 실행한다. 단계 폴더 전체 질문 파일의 단독 확인을 요구하는 알려진 결함으로 거부되면 재시도·질문 파일 이동·추가 영수증·우회 없이 결과 원문을 검증 문서에 남기고 실행을 열어 둔다.

## 검증과 보존 범위

- 계약 YAML 4개와 contract-summary.md의 YAML 블록 파싱 및 모든 `$ref` 해석, ShareCreate 조건, createShareLink POST의 400, unlock password의 minLength 1을 대조한다. required-sections 및 consumes·deliverables를 명시한 upstream-coverage 센서를 실행한다.
- 계약·기능 설계 산출물은 f1cb8d9와, entities.md는 로컬 dev 대신 00e9753과 바이트 비교한다. 9/23·9/24·9/30 질문·검증·review 파일을 보존하고 어긋나면 수정하지 않고 보고한다.
- CHANGE_ACCEPTED 알림은 그대로 기록한다. 알림 해소용 재저장·설정 변경은 하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED로 거부되면 한 번만 기록하고 멈춰 보고한다.
- 10월 intent를 명시적으로 선택한다. 2.10.0·설정·본 흐름 Completed·relaxed·Unit 상태와 12월 intent를 보존한다. 상태·감사를 직접 편집하지 않고 refresh·--force·본 흐름 next·park·compose를 실행하지 않는다.
- 기록 대상은 계약 설계와 u2-api 기능 설계 두 곳이다. u1-web 산출물은 제외한다. docs/·이슈·PR·계약·설계 산출물은 수정하지 않는다.
- 새 질문·검증·도구 기록과 9/30~10/4의 미커밋 세션 기록을 포함한 10월 감사를 한 커밋으로 남긴다. aidlc-state.md는 도구가 바꾼 경우만 포함하고 변경 내용을 보고한다. push하지 않는다.

## Consolidated Summary Confirmation

팀장이 정한 발급 제목 trim 후 1~50자·선택 비밀번호 입력 그대로 8~64자·코드 포인트 기준·길이 위반 400과 그 근거를, PR·병합 전 f1cb8d9의 계약 변경에 연결해 기록한다. 수신자 unlock·흔한 비밀번호 대조·정규화·ERD 상한은 범위 밖으로 유지한다. 이번 실행에서 산출물을 다시 쓰지 않는다. 9/23부터 열린 같은 계약 설계 차수에 기록을 추가하고 기존 기록을 보존하며 검토 요청과 단독 완료 요청은 각각 한 번만 실행해 결과를 그대로 남긴다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
