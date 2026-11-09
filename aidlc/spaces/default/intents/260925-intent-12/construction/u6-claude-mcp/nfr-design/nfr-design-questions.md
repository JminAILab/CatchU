# U6 Claude MCP 본인 연결 — 비기능 설계 질문

입력: [U6 비기능 요구사항](../nfr-requirements/)(성능·보안·규모·신뢰성·관측·기술 선택), [U6 기능 명세](../functional-design/functional-spec.md), [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-15, api의 현재 구성(`api/src/app.setup.ts`, `api/src/common/errors/api-exception.filter.ts`, `api/src/common/http/no-store.interceptor.ts`). 외부 근거: [Lazy authentication](https://claude.com/docs/connectors/building/lazy-authentication.md) 「Answer a protected call with 401 before the MCP SDK runs」, SDK 1.32.2의 `server/auth/middleware/bearerAuth.js`.

이미 정해진 것(다시 묻지 않음): 비기능 요구사항의 값과 판단 전부(50행, `Origin` 확인, 허용 출처 검사, SDK v1 1.32.2, Redis 없음·오류는 통과, 기록 항목). 회로 차단기·캐시·재시도·자동 확장·지표는 두지 않는다(NFR4, NFR6).

## Q1. [백엔드] `/v1/mcp`의 토큰 확인과 401 응답(토큰 없음·틀림·만료·해제·탈퇴)을 어디서 낼까요?

앞 단계 검토 지적 두 개(토큰 실패 응답의 이유 구분, 토큰 없는 요청의 본문 상한)를 이 결정으로 닫는다. SDK의 `requireBearerAuth`는 헤더 없음과 형식 틀림에 서로 다른 문구를 응답에 싣는다(`bearerAuth.js:30,34`). 기능 설계 S9는 다섯 경우를 "이유 구분 없음"으로 정했다. 한편 계약 C-15의 주석은 "OAuth 표준 401은 공식 SDK가 처리하고"라고 적고 있어, 자체 확인을 쓰면 이 주석과 달라진다. Claude 공식 문서의 예시는 HTTP 처리기에서 SDK 전송 객체를 만들기 전에 직접 401을 낸다(status와 `WWW-Authenticate`가 신호이고 본문은 참고용).

A. `/v1/mcp`를 Nest 처리기(메서드에만 `@Public()`)에 두고 작은 자체 확인으로 언제나 같은 401을 낸다. S9를 글자 그대로 지킨다. 본문 상한은 기존 파서의 100KB 하나로 정해지고, `no-store`와 500 로그는 기존 Interceptor·`ApiExceptionFilter`가 맡아 사건 `mcp_token_check_failed`가 필요 없어진다. 함수 하나가 늘고, C-15 주석을 고치는 줄이 따로 내는 C-15 PR에 더해진다.
B. SDK `requireBearerAuth`를 Nest 미들웨어로 쓰고 토큰 확인 함수의 오류 문구를 하나로 고정한다. C-15 주석을 고치지 않는다. 토큰을 보낸 경우의 이유는 구분되지 않지만 헤더 없음·형식 틀림은 SDK 문구로 구분되어 S9의 "토큰 없음"과 어긋난다(호출자 자신이 보낸 헤더에 관한 것이라 숨길 정보는 아니다). 미들웨어 연결과 `mcp_token_check_failed` 로그가 든다.
X. Other (please specify)

[Answer]: B. 아래 내용이 맞는지 확인하고, 문제없으면 반영해 줘. 틀리거나 문제가 있는 것은 반영하기 전에 근거와 함께 알려 줘. ① 비교에 ADR-009가 빠졌다. ADR-009 결과의 "공식 SDK의 인증 도구를 써서 OAuth 규칙을 직접 구현하지 않는다"(inception/domain-design/decisions.md)와 A의 자체 확인이 어긋나는지 따져 줘. ② 어긋난다면 B(requireBearerAuth)로 한다. 토큰 확인 함수는 없는 토큰·만료·해제·회원 상태 실패를 모두 같은 문구 하나로 거부하고, 만료도 SDK보다 먼저 직접 거부해 SDK가 따로 내는 만료 문구(bearerAuth.js)가 나오지 않게 한다. SDK 1.32.2 소스에서 실제로 그런 문구가 있는지도 확인해 줘. ③ 남는 차이는 헤더 없음·형식 틀림 문구뿐이고, 요청을 보낸 쪽이 이미 아는 사실이라 토큰 상태가 드러나지 않는다. S9의 "이유 구분 없음"은 토큰 상태를 가리킨다고 해석으로 적어 줘. ④ 어느 쪽이든 401의 WWW-Authenticate에 resource_metadata가 붙는지 확인해 줘(Claude가 승인 서버를 찾는 데 필요하다).

## Consolidated Summary Confirmation

담당 답변

- 토큰 확인과 401(Q1): A의 자체 확인은 ADR-009 결과의 "공식 SDK의 인증 도구를 써서 OAuth 규칙을 직접 구현하지 않는다"(`decisions.md`)와 어긋나므로 SDK `requireBearerAuth`를 쓴다. C-15의 "OAuth 표준 401은 공식 SDK가 처리"도 그대로 둔다.
- 토큰 확인 함수: 없는 토큰·만료·해제·회원 상태 실패를 모두 같은 문구 하나로 거부한다. 만료도 SDK보다 먼저 직접 거부한다.
- S9 해석: "이유 구분 없음"은 토큰 상태를 가리킨다. 남는 차이는 헤더 없음·형식 틀림 문구뿐이고 보낸 쪽이 이미 아는 사실이다.
- `resource_metadata`: SDK는 `resourceMetadataUrl`을 넘길 때만 붙이므로 언제나 넘기고, S1·S9에서 확인한다.

Q1 답을 확인하면서 더 정한 것

- 붙이는 자리: 선택지 B의 "Nest 미들웨어" 대신 Nest 처리기 안에서 `requireBearerAuth`를 부른다. 저장소에 Nest 미들웨어가 하나도 없고, 처리기 안이면 기존 `NoStoreInterceptor`가 먼저 돌아 SDK가 쓴 401·500에도 `no-store`가 붙으며 `Origin` 거부는 기존 필터가 응답한다. 선택지 B에 적은 "미들웨어 연결" 비용이 없어진다.
- 만료 비교: SQL의 `now()`가 아니라 앱 시계로 비교한다. SDK도 앱 시계로 다시 보므로 DB와 앱의 시계 차이로 SDK 문구가 나오지 않는다. `expiresAt`은 내림 없이 `getTime() / 1000`이다. 내리면 마지막 1초 동안 SDK 문구가 나온다.
- 받아들이는 한계: 토큰이 정확히 만료되는 순간의 극히 짧은 틈(토큰 확인 함수와 SDK 확인 사이)에는 `Token has expired`가 나올 수 있다. 상태와 `resource_metadata`는 같고 문구만 다르다(에러 대응 최소선 6).
- `mcp_oauth_failed`의 단계 이름: 요구사항의 `register`·`authorize`·`token`을 `register`·`client`·`token`으로 쓴다. 클라이언트 조회(`getClient`)는 `/authorize`와 `/token`이 함께 부르므로 어느 쪽인지 알 수 없고, `/authorize`의 DB 작업은 이 조회뿐이다.

질문하지 않고 가장 단순한 안으로 정한 것

- 위치: `api/src/claude-mcp`의 `ClaudeMcpModule` 하나를 `AppModule`에 등록한다. `app.setup.ts`는 고치지 않는다. SDK 라우터는 이 모듈의 `onModuleInit`에서 앱 루트에 건다. 기존 끝처리보다 앞이다(임시 앱으로 확인).
- `POST /v1/mcp`의 순서: Nest 파서 100KB → 전역 Guard(메서드의 `@Public()`) → `no-store` → `Origin` → `requireBearerAuth` → 요청마다 새 서버·전송 객체. `GET`·`DELETE`는 `Origin`을 본 뒤 405와 `Allow: POST`다.
- 도구 결과: 글 하나에 `JSON.stringify` 결과를 담는다. `structuredContent`·`outputSchema`는 두지 않는다(같은 글이 두 벌 나가지 않게). 입력 스키마의 오류 문구를 고정해 정의하지 않은 입력 이름이 응답에 나오지 않게 한다.
- 빈도 집계: 전용 Redis 연결(`enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `commandTimeout: 1000`)에서 `EVAL` 한 번으로 증가와 만료를 함께 한다. 스크립트는 첫 호출일 때 만료 120초를 건다.
- 쪽 나누기: 정확히 `LIMIT 50`이다. 저장소의 `limit+1`은 쓰지 않는다(NFR4.2의 "최대 50행"). 50행이 모두 들어가면 마지막 행을 `nextCursor`로 주므로, 자료 수가 50의 배수면 마지막에 빈 쪽 한 번과 `null`이 나온다.
- 글자 수: 항목마다 `JSON.stringify(item).length`를 더하고 봉투와 `nextCursor` 몫으로 200자를 미리 뺀다. Catch 근거 주소는 조회 한 번으로 읽고 저장된 순서로 담는다(`catch-reader.ts`와 같은 정렬). 두 조회를 트랜잭션으로 묶지 않는다(에러 대응 최소선 6).
- `cursor`: base64url JSON이다. Catch는 `{v:1, after}`, 텍스트 자료는 `{v:1, createdAt, id}`다. `createdAt`은 DB의 마이크로초까지 글자로 둔다(JS Date는 밀리초로 잘려 같은 행이 다시 나올 수 있다). 길이·왕복·칸·UUID·날짜 확인에 실패하면 모두 `INVALID_CURSOR`다. 회원에 묶지 않는다(BR5.2, S12).

임시 앱으로 확인해 알게 된 것

- Nest 파서는 `/v1` 아래만이 아니라 앱 전체에 걸린다(`express-adapter.js:234-244`). 그래서 토큰 유무와 상관없이 본문 상한은 100KB 하나이고(`/v1/mcp`, `/register`, `/token`), 넘으면 400 `INVALID_REQUEST`다. SDK의 4MiB 경로는 쓰이지 않는다.
- 받아들이는 차이 셋(실제 Claude는 보내지 않는 요청): 토큰 없는 깨진 JSON은 401이 아니라 400이다. `/register`·`/token`의 깨진 본문과 상한 초과는 OAuth 오류 형식이 아니라 REST 오류 형식이다. `/token`은 폼 외에 JSON 본문도 받지만 PKCE 이하의 확인은 같다.
- 한 요청에 묶은 도구 호출은 하나씩 돌아 하나씩 세고, 묶음 101개는 SDK가 400으로 거부한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
