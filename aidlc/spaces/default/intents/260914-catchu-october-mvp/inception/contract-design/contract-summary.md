# CatchU API 명세 v1

## 계약의 지위와 경계

개발 기준 계약 v1의 승인 검토본이다. 이 단계 승인 후 v1을 개발 기준으로 사용하며 개발 중 보완은 계약 변경 이슈로 받는다. 아래 표·규칙과 연결된 YAML이 함께 정본이다. 단계 승인과 각 담당 PR 확인은 구분하며 B 확인은 [PR #89](https://github.com/JminAILab/CatchU/pull/89) 병합 전 필수다.

| # | Provider Unit | Consumer | Mechanism | Owner |
|---|---|---|---|---|
| M | U2 api | U1 web 회원 화면 | HTTPS JSON / Access JWT · [member-api.yaml](member-api.yaml) | 팀원 2 A/E, 4 B, 3 C |
| P | U2 api | External: 비로그인 수신자, U1 web | HTTPS JSON / 링크·선택 비밀번호 · [recipient-api.yaml](recipient-api.yaml) | 팀원 3 C, A/B 자료 제공 |
| W | U3 worker 결과·진행 / U2 api 요청·수신 확인 | U2 api E/B / U3 worker F | [worker-messages.yaml](worker-messages.yaml) 메시지 스키마만; 전송 #77 이후 | 팀원 1 F·2 E, B 등록 검토 |

[common.yaml](common.yaml)은 오류·공유 DTO 정본이다. 아래 OpenAPI는 YAML의 Path Item/Schema를 참조한 전체 경계 인덱스다. 요청 객체의 알 수 없는 필드는 거부하며, 응답 소비자는 알려진 필드로만 판단하고 추가 필드를 무시한다. 권한·필수 의미를 추가 필드 무시로 완화하지 않는다.

## M — 회원 API

```yaml
openapi: "3.0.3"
info: {title: "CatchU 회원 API v1", version: "1.0.0"}
servers: [{url: "/v1"}]
paths:
  "/me": {$ref: "./member-api.yaml#/paths/~1me"}
  "/me/profile": {$ref: "./member-api.yaml#/paths/~1me~1profile"}
  "/me/repositories": {$ref: "./member-api.yaml#/paths/~1me~1repositories"}
  "/analysis-notice": {$ref: "./member-api.yaml#/paths/~1analysis-notice"}
  "/analysis-requests": {$ref: "./member-api.yaml#/paths/~1analysis-requests"}
  "/analysis-requests/{requestId}": {$ref: "./member-api.yaml#/paths/~1analysis-requests~1{requestId}"}
  "/catches": {$ref: "./member-api.yaml#/paths/~1catches"}
  "/catches/{catchId}": {$ref: "./member-api.yaml#/paths/~1catches~1{catchId}"}
  "/catches/{catchId}/confirmation": {$ref: "./member-api.yaml#/paths/~1catches~1{catchId}~1confirmation"}
  "/catches/{catchId}/visibility": {$ref: "./member-api.yaml#/paths/~1catches~1{catchId}~1visibility"}
  "/catches/{catchId}/mismatch": {$ref: "./member-api.yaml#/paths/~1catches~1{catchId}~1mismatch"}
  "/share-links": {$ref: "./member-api.yaml#/paths/~1share-links"}
  "/share-links/{linkId}/stop": {$ref: "./member-api.yaml#/paths/~1share-links~1{linkId}~1stop"}
security: [{AccessJWT: []}]
components:
  securitySchemes:
    AccessJWT: {type: http, scheme: bearer, bearerFormat: JWT}
```

| 경로 묶음 | 의미·소유 | FR |
|---|---|---|
| me, me/profile, me/repositories | 본인 계정·프로필/연동 상태와 선정 지원 저장소. 프로필 직무/기술은 자가 입력; 검증 사실 아님 | FR11.1~11.3, FR1.1 |
| analysis-notice, analysis-requests | 현재 고지·새 동의 접수·이력/개별 상태·실패 후 명시 재요청 | FR1.1, FR1.4 |
| catches 및 confirmation/visibility/mismatch | 목록/상세·명시 확인·개별 공개/숨김·불일치 표시; 목록은 선택 repositoryId로 저장소 필터링하며 sourceRequestId와 함께 주면 둘 다 만족하는 Catch만 반환; 직접 편집/재생성 없음 | FR2.1~2.2, FR3.5, FR4.1 |
| share-links 및 stop | 대표 없이 발급·현재 상태 관리·중단; 제목 변경/복구/기간 연장 없음 | FR3.1~3.2, FR4.2~4.5 |

- 회원 경로는 `Authorization: Bearer <CatchU Access JWT>`가 필요하다. `memberId`는 검증한 토큰에서 얻으며 본문에서 지정하지 않는다. Guard 통과 뒤 기능 담당이 자원 소유·연동·동의를 검사한다. 다른 회원의 자원과 없는 자원은 동일 404/RESOURCE_UNAVAILABLE이다.
- Google 실제 로그인/GitHub OAuth·refresh·로그아웃의 제공자/쿠키 경로는 OQ-A1이다. 이 문서는 Access JWT 소비 계약을 고정하며 미합의 OAuth callback 등을 작동하는 계약으로 꾸미지 않는다. #87 개발용 로그인은 명시 설정에서만 켜고 production에서는 거부한다. 운영 OpenAPI에 개발 로그인 경로를 추가하지 않는다.
- 프로필은 displayName·introduction·desiredRole·skills를 자가 입력으로 취급한다. 값이 없는 문자열은 빈 문자열, 기술은 빈 배열이다. 서비스 기본값/길이 제한은 A의 기능 설계로 보완하며 공개 투영은 OQ-A2의 A/C 확인 대상이다.
- 회원 목록은 `items`와 `page.nextCursor`(마지막은 null)를 반환한다. 이 `items`·`page` 규칙은 회원 목록에만 적용되며 수신자 목록 응답은 `profile`·`catches`·`page`다. opaque cursor는 소유자/필터 경계에 묶이며 현재 권한을 다시 검사한다. cursor는 공개 상태 스냅샷이나 영구 접근권이 아니다. 기본 20·최대 100개는 v1 페이지 규격이다.

## 분석 접수·상태·재요청

| 분류 | enum / 응답 | 의미 |
|---|---|---|
| 접수 결과 | 신규 202 / 기존 작업 200 | 요청 수락이며 처리·반영 완료 아님. 저장·동의 연결에 실패하면 접수 성공을 반환하지 않음 |
| requestState | ACCEPTED | 영속 접수된 요청만 조회. 거절은 HTTP 오류이며 분석 요청을 만들지 않음 |
| lifecycle | ACTIVE / CLOSED | ACTIVE는 사용자당 1개 제한에 포함. CLOSED는 더 진행 중인 처리/반영/복구가 없다는 E 확인 |
| processing | QUEUED / RUNNING / UNCERTAIN | 대기·실행 중·실행 여부 불명. 시간 경과/조회 실패만으로 FAILED로 바꾸지 않음 |
| processing | SUCCEEDED / EMPTY / PARTIAL_FAILED / FAILED | 오류 없는 후보 존재 / 오류 없는 등록 적합 후보 0 / 실패와 분리된 적합 후보 존재 / 제공 가능한 유효 결과 없는 실패 |
| application | NOT_READY / PENDING / APPLYING / RECOVERING / APPLIED / APPLY_FAILED | 결과 전 / 전달받아 대기 / 반영 중 / 반영 복구 중 / 결과 의미·등록 처리 반영 완료 / 반영 실패 |
| 결과 진입 | ownerResultsReady + registeredCatchIds | B가 등록·본인 열람 준비를 확인한 Catch만 E가 전달. 후보 존재·F 종료만으로 true 불가 |
| 재요청 | retry.allowed + reason | E의 현재 서버 판정. 결과 열람 가능 여부와 별개 |

**전이·불변 조건**

- 접수는 QUEUED/NOT_READY/ACTIVE. F 진행은 RUNNING, 실행이 확인되지 않으면 UNCERTAIN을 유지한다. #77 이전에 큐 시간 초과로 실패 확정하는 규칙은 만들지 않는다.
- 검증된 종결 결과 수신 뒤 PENDING → APPLYING → APPLIED. 반영 오류는 APPLY_FAILED, 복구 작업이 실제 진행할 때만 RECOVERING이다. 둘 다 ACTIVE로 잠그며 새 분석을 실행하지 않는다. 저장 결과 재전달·반영 복구와 분석/LLM 재호출은 별개이고 이번 계약은 자동 분석 재시도를 허용하지 않는다.
- APPLIED는 결과/실패 의미의 반영도 포함한다. EMPTY도 결과 0건이라는 사실을 저장한 뒤 APPLIED/CLOSED이며 정상 완료다. FAILED는 실패가 확정되고 반영할 유효 결과가 없다는 사실이 저장된 뒤 APPLIED/CLOSED가 될 수 있다.
- SUCCEEDED는 후보 1개 이상이고 실패 0건, EMPTY는 후보 0개·실패 0건이다. PARTIAL_FAILED는 실패와 분리된 적합 후보 1개 이상과 실패 1건 이상, FAILED는 후보 0개·실패 1건 이상이다. 근거 부족·등록 기준 미달은 notProvided로 구분하며 그 자체를 시스템 오류로 만들지 않는다.
- 초안 실패라도 근거·기여/등록 조건을 충족한 후보를 제공한다. 초안/질문 실패는 해당 결과와 failures에 분리해 담는다. 본문은 GENERATED일 때만 문자열, 나머지는 null이다. 초안이 없다고 후보 없음/등록 불가로 바꾸지 않는다. 질문 실패의 보완 경로는 OQ-B2에 남긴다.
- 같은 사용자·저장소의 ACTIVE 요청에는 기존 작업을 200으로 반환한다. 다른 저장소 ACTIVE 요청은 409/ANALYSIS_IN_PROGRESS와 details.existingRequestId를 반환한다. 이 판정과 새 요청 생성은 사용자 단위로 원자적이다. 비동기 실행 개수와 별개이며 자동 대기열 접수를 만들지 않는다.
- 재요청은 FAILED/APPLIED/CLOSED, eligibleCandidateCount=0, registeredCatchIds=[], 진행/복구 없음, 서버의 실패 확정 증거가 있을 때만 허용한다. 새 consentId·requestId·attemptId를 만들고 retryOfRequestId로 실패 이력만 연결한다. 새 동의의 대상·범위·고지 판본을 다시 검사한다. 기존 자료/링크를 수정하지 않는다.
- 정상 완료(EMPTY 포함)의 재분석, 유효 결과가 있는 부분 실패의 추가 생성·초안 보완은 허용 API가 아니다. 단지 요청 ID를 빼고 POST하는 것으로 이를 우회하지 못한다. 서버가 본인·저장소의 선행 이력과 retryOfRequestId를 검사하고 409/REANALYSIS_DEFERRED 또는 RETRY_NOT_ALLOWED로 거부한다.
- 조회 불능은 HTTP 오류 또는 클라이언트 LOOKUP_FAILED다. processing에 LOOKUP_FAILED/EMPTY를 저장하거나 신규 POST를 자동 호출하지 않는다. 상태 응답은 한 판본으로 읽으며 updatedAt은 서버 관측 시각이다.

## B 등록·공개 및 E/F 반영 경계

| 연결 | 계약 |
|---|---|
| F → E | 요청/attempt·본인/저장소·동의/허용 범위가 일치하는 결과만 수락. E는 외부 식별자와 처리 의미를 관리 |
| E → B | Result.candidates의 근거·기여·초안/질문과 원 요청/결과/후보 식별자를 전달. api 내부 호출이며 공개 등록 endpoint를 만들지 않음 |
| B → E | candidateId별 등록 또는 기존 동일 작업 참조, catchId와 본인 열람 준비를 반환. B가 등록 조건·중복을 검사하고 E가 application/ownerResultsReady를 기록 |
| 서비스 정본 | CatchAsset의 초안 본문·최소 질문, CatchEvidence(1:N). F 엔티티는 서비스 DB에 저장하지 않으며 출처 ID만 참조 |
| 중복 | 같은 resultId·같은 의미의 재전달은 같은 수신 확인. 같은 ID의 다른 payload는 거부. B는 소유자·작업 동일성과 원 후보 식별을 검사; 제목만 바꾼 중복 등록 금지 |
| 공개 | 최초 PRIVATE. confirmation은 근거·본인 기여 확인만, PUBLIC은 별도 PUT에서 현재 확인·보호 조건 검사. PRIVATE은 기존 링크에도 즉시 다음 조회부터 적용 |
| 원본 보호 | 확인된 SOURCE_PRIVATE는 관련 Catch 수신 접근을 막음. 일시 원본 조회 실패는 비공개 확정이 아님. 관측 제공자·주기·실패 시 판단은 OQ-B3 |

B의 판정 결과·등록과 E 반영 확인은 재진입 가능해야 한다. E 기록 전에 B 저장이 끝나도 다시 처리해 Catch가 중복 생성되지 않아야 한다. 원자성·영속 키는 api ERD/기능 설계에서 구현 제약으로 연결한다. 이미 적용된 결과를 덮어쓰거나 종료된 attempt의 늦은 결과를 자동 반영하지 않는다. 불일치는 409 의미의 PAYLOAD_CONFLICT/STALE_ATTEMPT로 격리해 담당 확인하며 기존 결과를 보존한다.

workIdentity 생성은 F가 제안하고 B/E가 검토한다(OQ-F2). 같은 근거 일부를 공유해도 다른 작업임을 확인하면 별도 Catch, 같은 작업의 표현만 바꾸면 중복이다. 이 계약이 커밋마다 Catch를 만드는 규칙은 아니다.

## P — 수신자 API

```yaml
openapi: "3.0.3"
info: {title: "CatchU 비로그인 수신자 API v1", version: "1.0.0"}
servers: [{url: "/v1"}]
paths:
  "/public/links/{token}/unlock": {$ref: "./recipient-api.yaml#/paths/~1public~1links~1{token}~1unlock"}
  "/public/links/{token}": {$ref: "./recipient-api.yaml#/paths/~1public~1links~1{token}"}
  "/public/links/{token}/catches/{catchId}": {$ref: "./recipient-api.yaml#/paths/~1public~1links~1{token}~1catches~1{catchId}"}
security: []
components:
  securitySchemes:
    LinkGrant: {$ref: "./recipient-api.yaml#/components/securitySchemes/LinkGrant"}
```

- 판정 순서는 링크 존재/중단/만료 → 비밀번호 조건 → 현재 허용 자료다. 없는 URL·중단·만료는 동일 404/LINK_UNAVAILABLE와 “이 링크는 열람할 수 없습니다.”이며 details를 생략한다. 비밀번호 입력 전에 적용한다.
- 유효 링크의 비밀번호 미확인/무효 grant는 401/LINK_PASSWORD_REQUIRED, 잘못된 비밀번호는 401/LINK_PASSWORD_INVALID다. unlock 성공은 링크 한정 opaque grant를 반환하며 X-Link-Grant로 제시한다. 비밀번호 미설정 링크는 grant 없이 조회한다. 그 링크의 불필요한 unlock 요청은 400/INVALID_REQUEST다.
- grant는 링크에 묶이며 회원 JWT·영구 접근권이 아니다. 매 조회/unlock에서 현재 링크/권한을 다시 검사하고 grant만으로 중단·만료를 우회하지 못한다. 저장·수명·시도 제한은 C 설계 OQ-C1이다.
- 정상 목록은 **링크 소유자의 현재 공개 Catch 전체**를 페이지로 제공한다. 링크–자산 join/snapshot/선택 목록을 만들지 않는다. 현재 허용 자료 0개는 200+빈 배열, 자료 조회 실패는 500이며 빈 자료로 대체하지 않는다.
- 직접 Catch 조회는 같은 링크 소유자의 현재 PUBLIC·보호 제한 없음만 허용한다. 숨김·타인 소유·없음은 동일 404/RESOURCE_UNAVAILABLE “현재 열람할 수 없는 자료입니다.”이다. 비밀번호 미확인이면 Catch 존재를 검사해 알리지 않고 먼저 비밀번호 분기를 적용한다.
- PublicCatch는 title·근거·기여·초안 상태/본문만 제공한다. reflection·본인 확인/불일치·요청/결과/후보 ID·링크 제목을 내보내지 않는다. 없는 초안은 null로 표현하고 생성된 설명으로 표시하지 않는다.
- 모든 회원/수신자 응답에 Cache-Control: no-store를 적용한다. web도 응답/본문을 영속 캐시하지 않는다. 열린 화면을 실시간 회수하는 약속은 없으며 목록/상세/새로고침/unlock 등 다음 요청에 현재 권한을 적용한다.
- 제목은 trim 후 사용자별 ‘stoppedAt 없음 AND 현재 시각 < expiresAt’인 링크 사이에서 유일하고 유효 링크는 최대 5개다. 사용자 단위 원자적 판정·생성, 발행 후 30×24시간 고정 만료이며 대표·공개 Catch 수와 무관하게 발급 가능하다. 중단은 자산 상태를 바꾸지 않는다.

## 공통 오류·요청 안전성

| HTTP | code | 적용 |
|---|---|---|
| 400 | INVALID_REQUEST, VALIDATION_FAILED | 형태/입력 오류. details.violations=[{field,reason}] |
| 401 | AUTH_REQUIRED, AUTH_INVALID | 회원 토큰 없음/변조·만료. 내부 원인·토큰 없음 |
| 401 | LINK_PASSWORD_REQUIRED, LINK_PASSWORD_INVALID | 수신자 비밀번호 분기만. 로그인 유도와 구분 |
| 403 | GITHUB_CONNECTION_REQUIRED, REPOSITORY_NOT_ALLOWED, CONSENT_REQUIRED | 접수의 연동/대상/동의 조건 미충족 |
| 404 | RESOURCE_UNAVAILABLE, LINK_UNAVAILABLE | 존재/권한 은닉 규칙은 각 경계 표 적용 |
| 409 | ANALYSIS_IN_PROGRESS, RETRY_NOT_ALLOWED, REANALYSIS_DEFERRED | 접수 충돌/보류. 기존 작업 ID는 본인에게만 |
| 409 | IDEMPOTENCY_CONFLICT, CONFIRMATION_REQUIRED, SOURCE_RESTRICTED | 키 재사용 본문 충돌·공개 조건 실패 |
| 409 | LINK_TITLE_CONFLICT, LINK_LIMIT_REACHED | trim 제목 중복·유효 링크 5개 한도 |
| 500 | INTERNAL_ERROR | 서버·조회 실패. “처리 중 오류가 발생했습니다.” |

오류 JSON은 `{code, message, details?}`다. details는 명세의 violations 또는 existingRequestId만 사용하고 원문 입력값·비밀번호·token·stack·SQL·내부 제공자 응답을 넣지 않는다. web은 message 문구 비교가 아닌 code로 분기한다. 예상 밖 응답/네트워크 실패는 로컬 LOOKUP_FAILED로 분류하고 빈 결과나 작업 실패로 치환하지 않는다. #88의 전역 필터·ValidationPipe·web 해석 함수가 이 정본을 따른다.

생성 POST는 Idempotency-Key를 사용자·operation에 묶는다. 동일 키/정규화된 동일 본문은 기존 응답·자원 참조를 반환하고 다른 본문은 409다. 저장 전/응답 유실이 불명확하면 새 키로 자동 재전송하지 않는다. 요청/발급 기록이 존재하는 동안 중복 방지 연결을 유지하며 기록 삭제 후 키 재사용 규칙은 보관 정책 결정 없이 추정하지 않는다. Catch 확인/공개/표시와 링크 중단은 PUT 상태 지정으로 반복 적용해도 추가 생성이 없다.

HTTP timeout은 실패 확정 증거가 아니다. web은 재조회·사용자 재요청을 구분한다. 정량 timeout/처리 상한은 기술 검증 후 이슈로 보완하며 자동 외부 재시도·추가 호출을 허용하지 않는다.

## W — worker 메시지 계약

```yaml
openapi: "3.0.3"
info: {title: "CatchU api-worker 스키마 v1", version: "1.0.0"}
paths: {}
components:
  schemas:
    Request: {$ref: "./worker-messages.yaml#/components/schemas/Request"}
    ProcessingEvent: {$ref: "./worker-messages.yaml#/components/schemas/ProcessingEvent"}
    Result: {$ref: "./worker-messages.yaml#/components/schemas/Result"}
    ResultReceipt: {$ref: "./worker-messages.yaml#/components/schemas/ResultReceipt"}
```

| 메시지 | 조건 |
|---|---|
| Request | E가 영속 요청/새 동의에 연결한 requestId·attemptId·memberId·repositoryId·consentId와 허용 scope를 제공. scope의 허용 자료 종류는 요청마다 한정하며 전체 종류 열거가 수집 허가가 아님 |
| ProcessingEvent | RECEIVED/RUNNING은 F 관측, UNCERTAIN은 실행 불명. 순서 역전으로 종결 상태를 되돌리지 않음. 전달 방식·실행 불명 해소는 #77 |
| Result | 후보는 근거/기여와 실패 분리 확인을 충족한 것만. notProvided의 근거 부족/기준 미달과 failures의 수집/생성 오류를 구분. schemaVersion=1 |
| ResultReceipt | resultId·requestId·attemptId를 모두 식별할 수 있는 메시지에만 전송. E의 형식·맥락 검사 후 ACCEPTED/DUPLICATE/REJECTED. ACCEPTED는 DB/Catch 등록 완료가 아니며 E application이 별도로 표시 |
| mock 연결 | 같은 Request/Result를 합성 fixture·가짜 생성기로 연결. sourceMode=MOCK를 유지하고 실제 분석 성공으로 표시하지 않음. 제공자명·모델명·SDK·API 키 의존 필드 없음 |

ResultReceipt의 식별 가능 조건은 resultId·requestId·attemptId 세 필드가 각각 비어 있지 않은 문자열로 읽히는 것이다. 하나라도 누락·빈 값·잘못된 타입이어서 식별할 수 없으면 Receipt 없이 거부 기록만 남긴다. Receipt를 만들려고 식별자를 임의 생성하거나 추정해 채우지 않는다. 세 식별자는 유효하나 다른 필드가 스키마에 맞지 않으면 REJECTED/SCHEMA_INVALID Receipt를 보낼 수 있다. 식별 가능과 맥락 일치는 별개이며 기존 요청·동의·범위 검사를 통과해야 수락한다. 거부 기록에는 원문·비밀값을 남기지 않고, 기록 저장소·보관 및 전송 방식은 이번에 정하지 않는다.

credentialContextReference는 A/F 계약에서 해석할 작업 맥락의 식별자이며 토큰/권한 자체가 아니다. 메시지에 GitHub/LLM 비밀값을 넣지 않는다. 외부 입력의 memberId·consentId는 신뢰하지 않고 E의 접수 정본과 일치할 때만 처리/반영한다. F는 지정 scope 밖으로 확장하지 않는다. 수신 schema 검사·맥락 대조·중복 판정은 외부 실행을 일으키지 않는다.

후보 evidence는 비어 있지 않고 안정 sourceRevision과 관측 사실/귀속 범위·한계를 연결한다. 등록되지 않은 F Result·Candidate·Evidence·Draft의 저장 위치/수명은 OQ-F1이며 서비스 DB의 F 테이블로 옮기지 않는다. 등록 후 필요한 근거/초안/질문은 B 정본으로 복사하고 F 임시 저장소의 영구 접근에 의존하지 않는다.

## Contract ownership rules

- api A/E/B/C는 각 경계 제공 계약, F는 결과 생성·의미를 책임진다. web은 계약을 소비하며 사용자 권한·업무 정본을 갖지 않는다. 상세 함수/테스트는 해당 담당이 제안하고 연결 당사자가 PR 리뷰한다.
- 응답 필드·상태 의미·권한·DB 관계와 유일성 변경만 계약 수정이다. 이슈 → AI-DLC의 aidlc/ 계약 변경 → PR → 영향받는 담당 리뷰로 승인한다. 같은 계약의 내부 구현은 일반 PR이다. 개발 중 contract-design --single 기록과 완료 intent 처리 기준은 [followup](../domain-design/2026-09-23-followup.md)을 따른다.
- 기본 URI /v1과 schemaVersion=1을 사용한다. 깨지는 계약 변경은 제공자·소비자의 전환 이슈/리뷰를 선행한다. additive 응답은 소비자 무시 가능성을 검증하며 enum 의미/권한 변경을 사소한 추가로 취급하지 않는다.
- Delivery는 #83 이후 #86 DB/마이그레이션(1), #87 인증(2), #88 오류(3; web은 #82 의존)를 기능 개발 앞에 배치한다. 첫 연결 결과에 한 번의 마일스톤 승인을 표시한다. 매 코딩 게이트나 MVP 완료가 아니다.

## Open questions

미결은 해당 실제 연결만 제한한다. 이미 고정한 경계와 합성/모의 계약 개발을 ‘초안’으로 되돌리지 않는다.

| Contract | Question / 담당·시점 | Blocks |
|---|---|---|
| OQ-A1 M | 실제 Google/GitHub OAuth 경로·GitHub 앱 종류·refresh/logout·쿠키/CORS/CSRF·수명: A/2, 관련 실제 인증 연결 전 | 실제 로그인/재인증/연동. #87의 JWT 소비·개발용 로그인과 모의 API 개발은 가능 |
| OQ-A2 M/P | 프로필 4항목의 자가 입력/공개 투영과 GitHub 공개 정보 추가 여부: A/2·C/3, PR 영역 리뷰. 미확인 GitHub 항목은 현재 응답에 넣지 않음 | 실제 공개 프로필 제공 전 확인; 새로운 공개 항목은 계약 수정 |
| OQ-F1 W | A/F 자격정보 제공의 상세·F 임시 결과 보존 위치/수명·전송: F/H/1·A/E/2, #77 이후 실제 worker 연결 전 | 실제 수집/결과 보존·전송. 메시지/가짜 생성기에는 영향 없음 |
| OQ-F2 W/B | workIdentity·묶음 동일성 판별의 함수/충돌 검증: F/1 제안, B/4·E/2 리뷰, 실제 등록 연결 전 | 동일 작업 중복 방지의 실제 판정; v1 식별 필드/동작 규칙 유지 |
| OQ-B1 M/W (결정) | 2026-09-24 팀장 결정: B 등록(Catch·근거·등록 연결)과 E 반영 완료 기록을 한 트랜잭션으로 저장한다. 수신 기록은 그 전에 E가 저장한다. 등록 함수의 입출력과 테이블 생성 순서는 E↔B 등록 개발 이슈에서 정한다. | 트랜잭션 경계 확정. 실제 등록 연결의 함수 입출력·테이블 생성 순서는 개발 이슈에서 보완; 계약·ERD 관계와 유일성 유지 |
| OQ-B2 W/B | 실패 후 초안/최소 질문 보완·동의 재사용·재분석·기존 Catch/링크 변경: 팀장 + B/E/F/C, 해당 기능 추가 전 | 보완/재분석 endpoint를 제공하지 않음. Q1 허용 실패 재요청과 기존 공개는 별개 |
| OQ-B3 P | 원본 상태 관측 경로·주기/오류 처리·원본 재공개/연동 해제/보관: A/B/F/H, 해당 실제 보호 연결 전 | 관측이 필요한 실제 자료 공개. 확인된 SOURCE_PRIVATE 차단 규칙은 고정 |
| OQ-C1 P | grant 수명/브라우저 저장·비밀번호 시도 제한과 응답 시간 은닉 검증: C/3, 실제 비밀번호 연결 전 | 실제 보호 구현. 링크 중단/만료의 현재 판정과 401/404 계약 유지 |
| OQ-L W | 서비스 제공자·모델·조건: 팀장/1, 개발 중후반 실제 제공자 연결 전 | 실제 제공자 연결. SDK 없는 가짜 생성기 계약은 가능 |

## 담당자 확인 요청

- 팀원 1 F/H/I·2 A/E: W 결과/귀속·실패 확정·Q1/Q2·인증 경계와 #86/#87 연결 확인.
- 팀원 3 C/D: 현재 공개 자료·공통 거부/비밀번호·#88 오류 및 결과 진입의 구분 확인.
- 팀원 4 B: 근거/초안/질문 정본·중복/등록·열람 준비·공개 조건 확인. **PR #89 병합 전 필수**.

## 추적 정보

[확인한 작성 요약](contract-design-questions.md) · [unit-of-work](../units-generation/unit-of-work.md) · [unit-of-work-dependency](../units-generation/unit-of-work-dependency.md) · [components](../domain-design/components.md) · [requirements](../requirements-analysis/requirements.md) · [E의 #23 Q4~Q6](https://github.com/JminAILab/CatchU/issues/23#issuecomment-5787076387) · [코딩 운영 PR #72](https://github.com/JminAILab/CatchU/pull/72).

상류 문구 차이 목록(수정/재개 안 함): Requirements의 CI/커버리지·LLM 결정 시점, ‘복구 중 기존 작업 반환 미결’, 발행 후 공개 자산 변화 문구는 9/23 사용자 결정/PR #72 및 이번 Q1/Q2와 함께 적용한다. 기존 내용 변경/재분석은 여전히 보류다.

자료 사용·잔여 조건: [#37](https://github.com/JminAILab/CatchU/issues/37).
