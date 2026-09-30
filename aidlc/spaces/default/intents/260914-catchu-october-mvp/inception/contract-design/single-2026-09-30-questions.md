# Contract Design 사후 기록 — 2026-09-30 링크 중단·비밀번호 차단

## 사용자 결정과 반영 범위

근거는 [#148 팀장 결정(2026-09-29)](https://github.com/JminAILab/CatchU/issues/148#issuecomment-5882528372), [#150 팀장 결정(2026-09-29)](https://github.com/JminAILab/CatchU/issues/150#issuecomment-5883572995), dev에 병합된 #170(`a7dcc87`)·#173(`a2649c6`)의 첫 부모 대비 diff와 이번 사용자 지시다. #170은 csyg0616이 2026-09-29, #173은 같은 검토자가 2026-09-30 승인했다. 이번 작업은 기존 결정과 현재 파일을 대조해 기록한다.

### Q1. #148·#170의 링크 중단 응답에서 무엇이 결정·반영됐는가?

[Answer]: member-api.yaml과 contract-summary.md에 본인 유효 링크는 200 STOPPED, 반복 중단은 200으로 기존 중단 상태 유지, 본인 만료 링크는 200으로 EXPIRED 유지, 타인·없는 링크는 404 RESOURCE_UNAVAILABLE로 적었다. 네 경우 중 만료 링크의 EXPIRED 유지가 새 결정이다. 소유 확인을 상태 확인보다 먼저 하고, 이미 중단한 링크는 만료 시각이 지나도 STOPPED를 유지한다. 수신자 판정은 발행자의 중단 요청에 적용하지 않는다. 9a34954에서 표현을 “업무 판정은 200과 404만 쓰고 403·409는 쓰지 않는다(401·500은 회원 경로 공통)”로 좁혔다. 회원 명세의 공통 응답 목록을 이번 기록에서 다시 고치지 않는다.

### Q2. #150·#173의 비밀번호 차단 응답에서 무엇이 결정·반영됐는가?

[Answer]: common.yaml에 남은 초를 나타내는 RetryAfter 헤더와 Error429 응답을 추가했고, recipient-api.yaml의 비밀번호 확인(unlock) POST에만 429를 추가했다. contract-summary.md에는 링크 판정 → unlock의 시도 제한 → 비밀번호 조건 → 현재 허용 자료 순서, grant 조회 GET에는 시도 제한을 적용하지 않음, 차단 중에는 올바른 비밀번호도 429 LINK_UNLOCK_LIMITED로 거부함, 오류 코드 표의 429 행, OQ-C1의 “(결정)” 행을 반영했다. 남은 시간은 Retry-After 헤더로만 보내며 오류 본문에 새 필드를 넣지 않았다. grant 수명 2시간과 시도 제한 15분에 10번·15분 차단 등 구체 값은 담당자 설계로 구분하고 계약에 넣지 않았다.

### Q3. 열린 단독 실행과 이번 사후 기록은 어떻게 구분하는가?

[Answer]: 2026-09-23T07:02:00Z에 시작한 single-stage:contract-design 실행을 유지한다. 같은 차수에 9/23 R-01·R-02, 9/24 변경, 이번 #170·#173 사후 기록이 쌓이며 날짜별 질문·검증 파일로 구분한다. 이번 검토 요청과 report --single은 각각 한 번만 실행한다. 단계 폴더의 모든 질문 파일에 단독 확인을 요구하는 알려진 결함으로 거부되면 재호출·질문 파일 이동·추가 영수증 생성·검사 우회 없이 받은 결과를 검증 문서에 남기고 실행을 열어 둔다.

## 검증과 보존 범위

- 계약 YAML 4개와 계약 요약의 YAML 블록을 파싱하고 모든 `$ref`를 해석한다. unlock 응답은 200·400·401·404·429·500, 수신자 조회 두 개는 200·400·401·404·500인지 대조한다.
- required-sections·upstream-coverage 센서를 확인하고 결과를 별도 검증 문서에 남긴다.
- 계약 YAML·contract-summary.md를 포함한 기존 산출물과 9/23·9/24 질문·검증 파일·review.md를 바이트 단위로 보존한다. 문제가 발견돼도 고치지 않고 보고한다.
- 산출물을 이번 실행에서 다시 저장하지 않는다. relaxed의 CHANGE_ACCEPTED 알림은 그대로 기록한다. SUMMARY_ARTIFACT_UNAUTHORIZED로 거부되면 한 번만 기록하고 멈춰 보고한다.
- 본 흐름 Completed 상태와 12월 intent를 보존한다. 상태·감사 파일을 직접 편집하지 않는다. 2.10.0 버전과 설정을 유지하고 refresh·--force·본 흐름 next·park·compose를 실행하지 않는다.
- 새 질문·검증 파일, 도구가 갱신한 기록, 9/23 이후 미커밋 세션 기록을 포함한 10월 감사 파일을 커밋한다. 사용자가 허용한 aidlc-state.md의 Change Control → Guard Policy 항목명 변경도 포함하며 값 relaxed는 유지한다. docs/와 이슈·PR 댓글을 수정하거나 #148·#150을 닫지 않는다.

## Consolidated Summary Confirmation

링크 중단 응답과 비밀번호 시도 제한의 차단 응답에 관한 두 팀장 결정, #170·#173의 실제 반영 내용, 현재 계약 파일의 일치를 기록한다. 이미 dev에 병합된 변경의 사후 기록이며, 이번 실행에서 산출물을 다시 쓰지 않는다. 9/23부터 열린 동일 차수에 이번 날짜의 기록을 추가하고 기존 기록을 보존한다. YAML·참조·응답 코드·센서·파일 보존을 확인하며 검토와 완료 요청은 각각 한 번만 실행해 성공 또는 거부를 그대로 남긴다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
