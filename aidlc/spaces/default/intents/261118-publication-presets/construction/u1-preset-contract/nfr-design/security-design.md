# Security Design — u1-preset-contract(U1)

근거: NFR 요구 `construction/u1-preset-contract/nfr-requirements/performance-requirements.md`·`security-requirements.md`·`scalability-requirements.md`·`reliability-requirements.md`·`observability-requirements.md`·`tech-stack-decisions.md`, 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`, 계약 `inception/contract-design/contract-summary.md`, 이 단계 질문 `nfr-design-questions.md`, 지금 코드. 보안 점검 `docs/CatchU_security_checks.md`.

## 인증·권한

| 요구 | 설계 |
|---|---|
| NFR2.1 | 프리셋 경로 다섯과 세기 경로는 지금 발행 경로(`publications.controller.ts`)와 같은 Bearer 인증 가드와 현재 회원 ID 주입을 쓴다. 지금 Bearer 회원 경로에는 CSRF 검사가 없고 Origin 검사는 쿠키 세션 경로에만 있으므로 더하지 않는다(NFR 요구 검토 R-01, 이 단계 정리) |
| NFR2.2 | 프리셋 한 개를 읽고 고치고 지우는 SQL은 모두 `member_id = 현재 회원 AND preset_id = $id` 조건이다. 0행이면 404 RESOURCE_UNAVAILABLE. 경로 ID가 UUID가 아니어도 404로 같게 답한다 |
| NFR2.3 | 담을 자료·세기 자료를 읽는 SQL은 모두 회원 조건을 붙인다. 요청한 ID 수와 읽은 행 수가 다르면 404다 |
| NFR2.4 | 발행의 프리셋 펴기 SQL도 회원 조건을 붙이고, 고른 ID 수와 읽은 프리셋 수가 다르면 404로 끝낸다. 이때 PDF 복사·트랜잭션 전이라 아무것도 쓰이지 않는다 |
| NFR2.5 | 프리셋 항목의 외래 키는 주인을 보지 않으므로 저장 때 NFR2.3으로 지킨다. 발행 트랜잭션의 잠금 SQL은 지금처럼 회원 조건으로 다시 읽는다 |

## 입력

| 요구 | 설계 |
|---|---|
| NFR2.6 | 경로마다 지금 `publish-input.ts`와 같은 방식의 입력 함수를 둔다: 허용 칸 목록 밖이면 400, UUID·kind 모양 검사, 개수·중복 검사. 발행 입력은 `items`를 허용 칸에서 빼고 `presetIds`를 넣는다 |
| NFR3.1 | 이름은 앞뒤 공백만 빼고 그대로 저장·응답한다. 서버는 HTML을 만들지 않는다 |

## 자료 보호

| 요구 | 설계 |
|---|---|
| NFR4.1 | 프리셋 로그 함수는 회원 ID·프리셋 ID·오류 코드만 인자로 받는다(지금 `publications-log.ts`처럼) |
| NFR4.2 | 오류 필터 `withDetails`에 blockedSources 복사를 더한다: 배열의 각 줄에서 presetId·sourceId는 UUID일 때만, kind는 세 값일 때만 옮기고 나머지 속성은 버린다. catchIds 복사는 지운다(NFR 요구 검토 R-02) |
| NFR4.3 | 사본 읽기 결과에서 isFirstCopy를 빼는 변환을 받은 링크 열람 응답과 작성자 상세 응답 두 곳에 둔다. source_id는 사본 객체에 처음부터 싣지 않는다 |
| NFR4.4 | 요약 근거·질의응답 머리글을 만드는 코드는 presetName을 읽지 않는다 |
