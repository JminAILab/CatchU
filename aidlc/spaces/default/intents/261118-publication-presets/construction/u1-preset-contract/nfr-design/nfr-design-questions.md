# NFR Design — u1-preset-contract 질문

근거: NFR 요구 `construction/u1-preset-contract/nfr-requirements/`(성능·보안·확장·안정·관측·기술 결정)와 그 검토 review-01(Minor 3건), 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`, 계약 `inception/contract-design/contract-summary.md`, 지금 코드(`api/src/publications/publications.controller.ts`, `api/src/common/errors/api-exception.filter.ts`, `api/src/publications/publish.service.ts`).

사람에게 새로 물을 것은 없다. NFR 요구 단계에서 수치·제한·기록 문제 처리를 정했고, 남은 것은 지금 코드를 따르는 설계다. 아래 정리를 확인받은 뒤 문서를 쓴다.

NFR 요구 검토의 Minor 3건은 이렇게 정한다.

- R-01(NFR2.1 「CSRF 검사」): 지금 Bearer 회원 경로(`publications.controller.ts`)에는 CSRF 검사가 없고 Origin 검사는 쿠키 세션 경로에만 있다. 프리셋·세기 경로는 지금 발행 경로와 같은 Bearer 인증 가드만 쓰고, CSRF 검사를 더하지 않는다. NFR2.1의 「CSRF 검사」는 「지금 회원 경로와 같은 인증」으로 읽는다.
- R-02(오류 필터): 오류 응답 필터(`api-exception.filter.ts` `withDetails`)가 `blockedSources`를 옮기고 `catchIds`를 더 옮기지 않게 고치는 일은 이 단위의 코드 변경 목록에 넣는다(기능 설계 functional-spec 「경로 요약」 아래 문장, 계약 P-2).
- R-03(이유와 500이 섞일 때): 목록·상세·세기는 발행과 같은 판정 함수를 자료마다 부르고, 기록 문제(원 요청 불일치·보호 관측 없음·불완전)가 하나라도 있으면 다른 자료의 이유와 상관없이 그 요청 전체가 500이다(NFR2.10). 발행은 지금 순서(확인 필요가 먼저, 그다음 기록 문제)를 그대로 둔다.

## Consolidated Summary Confirmation

- 성능: 목록·상세·세기는 회원의 프리셋 행 → 항목 행 → 종류별 원본(Catch·근거·소속 기록·보호 관측 / 텍스트 자료 / PDF와 쪽 글)을 ID 묶음으로 한 번씩 읽는다. 캐시는 두지 않는다
- 보안: 프리셋·세기 경로는 지금 발행 경로와 같은 Bearer 인증 가드만 쓰고 CSRF 검사를 더하지 않는다. 모든 SQL은 요청 회원 조건을 붙인다. 오류 필터는 blockedSources를 옮기고 catchIds를 뺀다. 받은 링크 열람·작성자 상세 응답 변환에서 isFirstCopy를 뺀다
- 확장: 상한(프리셋 50 × 항목 20, 발행 20개·60,000자) 안에서 지금 api 프로세스와 PostgreSQL만 쓴다
- 안정: 저장은 한 트랜잭션, 발행은 지금 순서(PDF 복사 → 트랜잭션 → 실패면 정리). 목록·상세·세기에서 기록 문제가 하나라도 있으면 요청 전체 500. 같은 프리셋 동시 저장의 500은 받아들인다
- 관측: 프리셋 저장·지우기 성공·실패를 ID와 오류 코드로 한 줄씩 남기고, 발행 로그는 새 코드를 그대로 찍는다

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
