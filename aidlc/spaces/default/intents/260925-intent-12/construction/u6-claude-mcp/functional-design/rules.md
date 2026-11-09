# U6 Claude MCP 본인 연결 — 업무 규칙

## Sources

작성일: 2026-10-31. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U6, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map)의 US13.1·US13.2, [사용자 스토리](../../../inception/user-stories/stories.md)(stories)의 US13.1·US13.2, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR1.5·FR13.1·FR13.2·FR13.5·FR13.6·FR14.1·FR14.6·FR14.8·FR16.3·FR19.1·NFR1, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 ClaudeMcp, [결정 기록](../../../inception/domain-design/decisions.md)의 ADR-009, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-06·C-13·C-14·C-15와 「에러 대응 최소선」, [기능 설계 질문·답변](functional-design-questions.md) Q1~Q6, [엔티티](entities.md), [기능 명세](functional-spec.md).

## 규칙

`source`의 Q는 [기능 설계 질문·답변](functional-design-questions.md)의 질문 번호다. 「요약 확인」은 같은 문서의 요약 확인에서 담당이 확인한, 질문하지 않고 가장 단순한 안으로 정한 내용이다. 받은 사람 도구는 U9, 텍스트 자료 표와 작성자 설명 칸은 U4, 탈퇴 순서는 U2 규칙이라 여기에 없다.

```yaml
rules:
  # BR1 주소와 설정
  - id: BR1.1
    statement: "MCP 주소는 {공개 주소}/v1/mcp이고 OAuth 주소는 앱 루트에 둔다. 해지 주소(/revoke)는 없다"
    category: constraint
    applies_to: 경로, OAuth 메타데이터
    trigger: 기동 때 경로를 등록할 때
    logic: "MCP는 앞단이 이미 api로 보내는 /v1 아래에 둔다. 앱 루트에 /authorize, /token, /register, /.well-known/oauth-protected-resource*, /.well-known/oauth-authorization-server*를 둔다. 해지 처리를 구현하지 않으므로 /revoke가 생기지 않는다. 해제는 CatchU 화면의 전체 해제뿐이다"
    violation: "해당 없음. 앞단이 이 목록을 api로 보내지 않으면 연결되지 않으므로 목록을 팀장에게 넘긴다(functional-spec 「다른 Unit에 넘기는 것」)"
    source: C-15 엔드포인트 세부는 U6 기능 설계, FR13.1, 요약 확인
  - id: BR1.2
    statement: 공개 주소는 개발·시험에서 MCP_DEV_PUBLIC_ORIGIN 또는 api 기본 주소이고, 그 밖에서는 AUTH_WEB_ORIGIN이다
    category: calculation
    applies_to: OAuth 메타데이터, MCP 주소, WWW-Authenticate, mcpUrl
    trigger: 기동 때 설정을 읽을 때
    logic: "IF NODE_ENV가 development 또는 test이면 THEN MCP_DEV_PUBLIC_ORIGIN, 없으면 http://127.0.0.1:{PORT}. ELSE AUTH_WEB_ORIGIN(production·미지정·그 밖 값 모두). 빈 값은 없는 것으로 본다. 요청의 Host나 전달 헤더로 만들지 않는다"
    violation: "그 밖 환경에 MCP_DEV_PUBLIC_ORIGIN 값이 있으면 기동 실패(BR1.4). AUTH_WEB_ORIGIN은 기존 설정 검사가 이미 https로 확인한다"
    source: 요약 확인(로컬의 api 주소), docs/CatchU_security_checks.md 설정·개발용 기능
  - id: BR1.3
    statement: 승인 화면으로 보내는 주소는 어느 환경이든 AUTH_WEB_ORIGIN이고, 복사할 MCP 주소는 web이 만들지 않고 api 응답으로 받는다
    category: constraint
    applies_to: /authorize 전달, GET /v1/me/mcp-connection의 mcpUrl
    trigger: 승인 화면으로 보낼 때, 연결 상태를 돌려줄 때
    logic: "승인 화면 주소 = {AUTH_WEB_ORIGIN}/profile/claude/authorize. mcpUrl = {BR1.2의 공개 주소}/v1/mcp"
    violation: 해당 없음
    source: 요약 확인(주소, 로컬의 api 주소)
  - id: BR1.4
    statement: 새 설정은 선택값 셋뿐이고, 값이 잘못되거나 개발용 값이 개발·시험 밖에 있으면 기동을 멈춘다
    category: validation
    applies_to: MCP_ACCESS_TOKEN_TTL_SECONDS, MCP_DEV_REDIRECT_URIS, MCP_DEV_PUBLIC_ORIGIN
    trigger: 기동 때
    logic: "MCP_ACCESS_TOKEN_TTL_SECONDS는 양의 정수, 기본 7일, 7일을 넘기면 기동 실패(만료 재승인을 확인할 때 줄이는 용도). MCP_DEV_REDIRECT_URIS는 정확히 일치로 비교할 주소 목록. MCP_DEV_PUBLIC_ORIGIN은 끝 슬래시 없는 출처. IF 뒤의 둘에 값이 있고 NODE_ENV가 development·test가 아니면 THEN 기동 실패"
    violation: 기동 실패. 값은 로그에 남기지 않고 설정 이름만 알린다
    source: Q1, Q2, 요약 확인(새 설정), docs/CatchU_security_checks.md 설정·개발용 기능

  # BR2 클라이언트 등록과 인증 전 제한
  - id: BR2.1
    statement: 공개 클라이언트로만 등록하고 비밀값을 만들거나 돌려주지 않는다
    category: constraint
    applies_to: McpClient, POST /register
    trigger: 등록 요청
    logic: "SDK 등록 처리는 요청의 인증 방식이 none이 아니면 client_secret을 만들어 저장 단계(registerClient)에 넘기고 그 반환값을 그대로 응답한다. 그래서 저장 단계가 비밀값을 지우고 token_endpoint_auth_method를 none으로 바꿔 돌려준다. 요청에 다른 인증 방식이 있어도 거부하지 않고 공개 클라이언트로 저장하며 응답에 client_secret이 없다"
    violation: 해당 없음
    source: C-15 tables, ADR-009, 요약 확인(코드·토큰)
  - id: BR2.2
    statement: "돌아갈 주소는 운영에서 https://claude.ai/api/mcp/auth_callback 하나만 정확히 일치로 받는다"
    category: validation
    applies_to: McpClient.redirectUris
    trigger: 등록 요청, 승인 요청, 토큰 교환
    logic: "허용 목록 = 코드의 상수 하나 + (개발·시험에서만) MCP_DEV_REDIRECT_URIS. 앞부분 일치·와일드카드는 없다. Claude Code용 localhost 콜백은 FR13.1 범위 밖이라 운영에서 받지 않는다"
    violation: 등록 거부(invalid_redirect_uri)
    source: Q2, FR13.1
  - id: BR2.3
    statement: clientName은 200자까지 받는다
    category: validation
    applies_to: McpClient.clientName
    trigger: 등록 요청
    logic: 200자를 넘으면 거부한다. 저장한 값은 화면에 보이지 않는다(BR3.5)
    violation: 등록 거부(invalid_client_metadata)
    source: docs/CatchU_security_checks.md 요청·메시지 입력, 요약 확인(승인에 쓰이지 않은 등록 정리)
  - id: BR2.4
    statement: 승인에 쓰인 적 없고 등록한 지 7일이 지난 등록을 다음 등록 요청 때 함께 지운다
    category: policy
    applies_to: McpClient
    trigger: 등록 요청을 받을 때
    logic: "DELETE 조건은 approvedAt이 비어 있고 registeredAt이 7일 이전인 행. 타이머를 두지 않는다. 승인에 쓰인 적 있는 등록은 지우지 않는다. 이 표를 가리키는 외래 키가 연쇄 삭제라 지우면 그 연결·토큰까지 사라지고, Claude가 저장한 client_id를 재승인 때 다시 쓰는지 문서에 없기 때문이다"
    violation: "해당 없음. 지운 등록으로 /authorize가 오면 invalid_client로 거부된다"
    source: 요약 확인(승인에 쓰이지 않은 등록 정리), C-06
  - id: BR2.5
    statement: 회원을 아직 모르는 인증 전 주소는 SDK 기본 IP 제한을 유지한다. FR13.6·C-15의 「IP로 세지 않음」에 대한 예외다
    category: policy
    applies_to: POST /register, POST /token, GET /authorize
    trigger: 인증 전 요청
    logic: "등록 시간당 20회, 토큰 15분 50회, 승인 시작 15분 100회. request.ip는 TRUST_PROXY_CIDRS가 있어야 실제 주소이고, 없으면 Caddy 뒤 모든 요청이 앞단 주소 하나로 보여 한도 하나를 나눠 쓴다(개발 서버·EKS에는 값이 있다). 등록·토큰 요청은 Claude 서버에서 오므로 모든 회원이 Claude 송신 주소(160.79.104.0/21)의 한도를 함께 쓴다. 승인 시작은 회원 브라우저 주소로 센다. 집계는 프로세스 메모리에 있어 프로세스마다 따로 세고 api를 다시 띄우면 풀린다"
    violation: "SDK의 429. 등록 한도를 넘으면 모든 회원의 새 연결이 최대 1시간 막히고, 이미 연결된 회원의 도구 호출은 영향이 없다"
    source: Q6, FR13.6

  # BR3 승인과 동의
  - id: BR3.1
    statement: /authorize는 클라이언트와 돌아갈 주소를 확인한 뒤 승인 화면으로 넘긴다
    category: validation
    applies_to: GET /authorize
    trigger: Claude가 회원 브라우저를 보낼 때
    logic: "IF 클라이언트가 없거나 redirect_uri가 그 등록에 없으면 THEN 돌아갈 주소로 보내지 않고 오류. PKCE는 S256만 받는다. 통과하면 client_id, redirect_uri, state, code_challenge, resource를 쿼리로 BR1.3의 승인 화면에 넘긴다. 로그인이 안 됐으면 기존 로그인 화면을 거쳐 돌아온다"
    violation: invalid_client 또는 invalid_request 오류 응답
    source: FR13.1, ADR-009, 요약 확인(승인 흐름)
  - id: BR3.2
    statement: "승인·거절은 web이 fetch로 POST /v1/me/mcp-connection/authorizations를 보내고, api는 돌아갈 주소를 JSON으로 답한다"
    category: constraint
    applies_to: 승인 요청 API, 승인 화면
    trigger: 승인·취소 버튼
    logic: "web은 회원 토큰을 메모리에만 두므로 폼 제출을 쓰지 않는다. 본문은 clientId, redirectUri, state, codeChallenge, resource, decision(APPROVE, DENY), consent이고 정의하지 않은 필드는 거부한다. 회원은 Access 토큰에서만 정한다. api는 클라이언트와 돌아갈 주소를 다시 확인하고 200 { redirectTo }로 답한다(302 아님). web은 그 값으로만 이동하고 쿼리의 주소로 직접 이동하지 않는다. 요청 중에는 버튼을 막는다"
    violation: "클라이언트·돌아갈 주소가 틀리면 400 MCP_AUTHORIZATION_INVALID, 화면은 오류를 보여 주고 어디로도 이동하지 않는다. 필드 오류는 400 VALIDATION_FAILED, 로그인 만료는 기존 401"
    source: 요약 확인(승인 흐름), docs/CatchU_security_checks.md 인증·요청 입력
  - id: BR3.3
    statement: 동의는 회원 단위로 판단한다. 그 회원의 연결 행이 하나라도 있으면 동의한 것이다
    category: authorization
    applies_to: McpConnection, 승인 요청 API
    trigger: APPROVE 요청
    logic: "IF 그 회원의 연결 행이 없고 consent가 true가 아니면 THEN 코드를 만들지 않는다. Claude는 새 연결마다 자기를 새 클라이언트로 등록하므로 클라이언트 단위로는 한 번 동의를 지킬 수 없다. 전체 해제나 탈퇴로 행이 없어지면 다시 동의한다"
    violation: 409 MCP_CONSENT_REQUIRED
    source: FR13.2, AC13.2.1, C-15 consent, FR14.6, 요약 확인(동의)
  - id: BR3.4
    statement: 만료 뒤 재승인도 회원이 버튼을 눌러야 하고 자동 발급은 없다
    category: policy
    applies_to: 승인 화면, 승인 요청 API
    trigger: 연결이 있는 회원의 승인 요청
    logic: 재승인은 동의를 다시 묻지 않지만 APPROVE 요청 없이는 코드를 만들지 않는다. /authorize는 회원 상태와 상관없이 항상 승인 화면으로 보낸다
    violation: 해당 없음
    source: FR13.1, AC13.1.2, 요약 확인(동의)
  - id: BR3.5
    statement: 승인 화면은 돌아갈 주소의 호스트와 안내를 보여 주고 클라이언트 이름은 보여 주지 않는다
    category: constraint
    applies_to: /profile/claude/authorize
    trigger: 승인 화면을 그릴 때
    logic: "돌아갈 주소의 호스트를 텍스트로 보여 준다. 동의·재승인 화면 모두 「직접 시작한 연결이 아니면 취소하세요」를 보여 준다. 연결 행이 없으면 공개·비공개 Catch와 현재·이후 저장할 텍스트 자료를 읽게 된다는 동의 안내를 더한다. clientName은 스스로 적은 값이라 쓰지 않는다. 이 화면은 직접 시작한 연결과 남이 시작한 연결을 구별하지 못한다. Claude 콜백이 남이 시작한 연결을 거부하는지는 functional-spec S24로 확인한다"
    violation: 해당 없음
    source: FR13.2, AC13.2.1, Q2, 요약 확인(동의)
  - id: BR3.6
    statement: 거절하면 코드를 만들지 않고 access_denied로 돌려보낸다
    category: policy
    applies_to: 승인 요청 API
    trigger: decision이 DENY
    logic: "BR3.2의 확인을 통과하면 redirectTo는 돌아갈 주소에 error=access_denied와 state를 붙인 값이다. 표는 바뀌지 않는다"
    violation: 확인에 실패하면 BR3.2의 400
    source: 요약 확인(승인 흐름)
  - id: BR3.7
    statement: 승인하면 등록의 approvedAt 채우기와 코드 만들기를 한 트랜잭션에 한다
    category: constraint
    applies_to: McpClient.approvedAt, McpAuthorizationCode
    trigger: decision이 APPROVE이고 BR3.2·BR3.3을 통과할 때
    logic: "등록 행이 있으면 approvedAt은 비어 있을 때만 채우고 이미 있으면 그대로 둔다. 등록 행이 없을 때만(정리로 지워짐) MCP_AUTHORIZATION_INVALID다. 이미 승인에 쓰인 등록으로 다시 승인해도 새 코드를 만든다. 코드의 consentedAt은 그 회원의 기존 동의 시각, 없으면 지금이다. redirectTo는 돌아갈 주소에 code와 state를 붙인 값이다"
    violation: 트랜잭션이 되돌아가고 코드는 남지 않는다
    source: 요약 확인(승인에 쓰이지 않은 등록 정리), 에러 대응 최소선 5

  # BR4 코드, 토큰과 인증
  - id: BR4.1
    statement: 승인 코드는 안전한 난수이고 5분 동안 한 번만 쓰며 SHA-256만 저장한다
    category: constraint
    applies_to: McpAuthorizationCode
    trigger: 코드를 만들 때, 교환할 때
    logic: 원문은 redirectTo로 한 번만 나간다. 저장·조회·로그에는 해시만 쓴다
    violation: 만료·이미 씀·없는 코드는 invalid_grant
    source: ADR-009, 요약 확인(코드·토큰)
  - id: BR4.2
    statement: 접근 토큰은 불투명 난수이고 수명은 7일이며 SHA-256만 저장한다
    category: constraint
    applies_to: McpAccessToken
    trigger: 토큰을 발급할 때
    logic: "수명 = MCP_ACCESS_TOKEN_TTL_SECONDS(기본 7일). 웹 로그인 세션 최대 7일과 맞춘다. 연결 행의 expiresAt에 같은 값을 쓴다"
    violation: 해당 없음
    source: Q1, ADR-009, FR13.1
  - id: BR4.3
    statement: 토큰 교환은 코드 소비, 연결 만들기, 토큰 발급을 한 트랜잭션에 한다
    category: constraint
    applies_to: POST /token
    trigger: authorization_code 요청
    logic: "SDK가 저장된 challenge로 PKCE를 먼저 확인하고 틀리면 코드를 소비하지 않고 invalid_grant다. 저장된 challenge를 읽는 단계에서도 없는 코드는 invalid_grant다. 통과하면 한 트랜잭션에서 1) usedAt이 비어 있고 만료 전인 코드만 조건부로 usedAt을 채운다. 갱신된 행이 없으면 invalid_grant. 2) 돌아갈 주소, 클라이언트, resource(BR4.6)를 확인하고 틀리면 되돌리고 invalid_grant. 3) (회원, 클라이언트)의 연결을 만들거나 갱신하고 consentedAt은 코드에서 옮긴다. 4) BR4.4. 응답은 access_token, token_type, expires_in뿐이다"
    violation: invalid_grant. 되돌리므로 행은 바뀌지 않는다
    source: FR13.1, ADR-009, 에러 대응 최소선 5, 요약 확인(코드·토큰)
  - id: BR4.4
    statement: 같은 회원·클라이언트의 토큰은 교체하고, 그 회원의 만료된 토큰·연결·승인 코드를 함께 지운다
    category: policy
    applies_to: McpAccessToken, McpConnection, McpAuthorizationCode
    trigger: 토큰 교환 트랜잭션 안에서
    logic: "그 짝의 기존 토큰을 지우고 새 토큰을 넣는다. expiresAt이 지금보다 이전인 그 회원의 행을 표마다 지운다. 타이머를 두지 않는다"
    violation: 트랜잭션이 되돌아간다
    source: 요약 확인(코드·토큰)
  - id: BR4.5
    statement: 갱신 토큰, offline_access, 권한 범위(scope)는 없다
    category: constraint
    applies_to: POST /token
    trigger: 토큰 요청
    logic: "응답에 refresh_token과 scope를 넣지 않는다. SDK는 refresh_token 요청을 갱신 처리(exchangeRefreshToken)로 넘기므로 그 처리가 항상 invalid_grant로 거부한다. 그 밖의 grant_type은 SDK가 거부한다. 만료되면 다시 승인한다"
    violation: refresh_token 요청은 invalid_grant, 그 밖의 grant_type은 unsupported_grant_type
    source: FR13.1, AC13.1.2, ADR-009
  - id: BR4.6
    statement: 요청에 resource가 있으면 MCP 주소와 같아야 한다
    category: validation
    applies_to: GET /authorize, 승인 요청 API, POST /token
    trigger: resource가 있는 요청
    logic: "정규형(스킴·호스트 소문자, 끝 슬래시·fragment·기본 포트 없음)으로 BR1.3의 mcpUrl과 비교한다. 없으면 검사하지 않는다"
    violation: "/authorize와 승인 요청은 BR3.1·BR3.2의 오류, /token은 invalid_grant"
    source: 요약 확인(코드·토큰)
  - id: BR4.7
    statement: MCP 요청마다 저장된 접근 토큰·만료·연결과 회원 상태를 확인한다
    category: authorization
    applies_to: POST /v1/mcp
    trigger: 모든 MCP 요청
    logic: "토큰의 SHA-256으로 찾고 expiresAt이 지금보다 뒤이며 (회원, 클라이언트)의 연결 행이 있고 회원이 ACTIVE(기존 세션 확인과 같은 기준)일 때만 통과한다. 캐시하지 않는다. 시험을 위한 우회를 두지 않는다"
    violation: BR4.8의 401
    source: C-15 auth-check, FR13.1, FR14.1, FR13.5, AC13.1.2, AC13.1.3, NFR1
  - id: BR4.8
    statement: 토큰 없음·만료·해제·탈퇴는 HTTP 401과 WWW-Authenticate로 돌려준다
    category: policy
    applies_to: POST /v1/mcp
    trigger: BR4.7을 통과하지 못할 때
    logic: "401과 resource_metadata가 {공개 주소}/.well-known/oauth-protected-resource/v1/mcp인 Bearer WWW-Authenticate를 돌려줘 Claude가 재승인을 안내하게 한다. 이유를 구분해 알리지 않는다. 토큰 확인 중 DB 실패는 401로 바꾸지 않고 500으로 돌려주고 로그를 남긴다"
    violation: 해당 없음
    source: C-15 common-errors UNAUTHORIZED, AC13.1.2, 요약 확인(오류)

  # BR5 조회 도구
  - id: BR5.1
    statement: 도구는 list_my_catches와 list_my_text_materials 둘이고 입력은 cursor뿐이며 모두 읽기 전용이다
    category: constraint
    applies_to: MCP 도구 목록
    trigger: tools/list, tools/call
    logic: "쓰기, JD 요약, 의미 검색 도구는 없다. 정의하지 않은 입력 필드는 거부한다. 두 도구에 title과 readOnlyHint true를 붙여 Claude가 호출마다 확인받지 않고 돌릴 수 있게 한다. C-15의 「모두 읽기 전용」을 그대로 표시하는 것이라 C-15 수정은 없다. 받은 사람 도구는 U9가 더한다"
    violation: 없는 도구는 MCP 오류, 추가 필드는 입력 오류
    source: FR13.2, FR13.5, AC13.2.2, AC13.2.3, C-15, docs/CatchU_security_checks.md LLM·검색 기능, Connector pre-submission checklist 「Provide tool annotations」
  - id: BR5.2
    statement: 회원은 토큰에서만 정하고 조회는 언제나 그 회원의 행만 읽는다
    category: authorization
    applies_to: list_my_catches, list_my_text_materials
    trigger: 도구 호출
    logic: "Catch는 owner_id, 텍스트 자료는 member_id로 거른다. 입력에 회원·자료 ID가 없다. cursor를 바꿔 보내도 위치만 달라질 뿐 다른 회원의 행은 나오지 않는다"
    violation: 해당 없음(다른 회원의 행은 조회 대상이 아니다)
    source: AC13.2.4, NFR1, C-13 read-rule, docs/CatchU_security_checks.md API 경로·권한
  - id: BR5.3
    statement: Catch 응답은 C-15 칸이며 공개·비공개를 모두 포함하고 AI 설명 초안은 내보내지 않는다
    category: constraint
    applies_to: list_my_catches
    trigger: 도구 호출
    logic: "catchId, title(string 또는 null), visibility, workFacts, subjectContribution, authorDescription(string 또는 null), evidenceUrls, mismatch. evidenceUrls는 catch_evidence.source_url을 저장된 순서로 담는다. draft_content는 읽지 않는다"
    violation: 해당 없음
    source: FR13.2, FR1.5, AC13.2.2, C-14, C-15
  - id: BR5.4
    statement: 텍스트 자료 응답은 C-15 칸이고 PDF 글은 없다
    category: constraint
    applies_to: list_my_text_materials
    trigger: 도구 호출
    logic: "textMaterialId, title, body, updatedAt. PDF 자료 표는 읽지 않는다. 공백·줄바꿈을 가공하지 않고 돌려준다"
    violation: 해당 없음
    source: FR13.2, AC13.2.2, C-13, C-15
  - id: BR5.5
    statement: 목록은 cursor로 나눠 읽는다
    category: calculation
    applies_to: nextCursor, INVALID_CURSOR
    trigger: 도구 호출
    logic: "Catch는 catch_id 순, 텍스트 자료는 created_at·text_material_id 순으로 마지막 위치 다음부터 읽는다. cursor는 위치만 담은 불투명 문자열이다. 더 없으면 nextCursor는 null이다"
    violation: 형식이 틀린 cursor는 도구 오류 INVALID_CURSOR
    source: C-15 쪽 단위 응답, AC13.2.2
  - id: BR5.6
    statement: MCP는 세션 없는 Streamable HTTP로 요청마다 독립 처리한다
    category: constraint
    applies_to: /v1/mcp
    trigger: MCP 요청
    logic: "서버에 MCP 세션을 저장하지 않고 요청마다 BR4.7부터 처리한다. POST만 받고 GET·DELETE는 405다"
    violation: 405
    source: C-15, FR13.1, 요약 확인(도구)
  - id: BR5.7
    statement: 도구 오류는 RATE_LIMITED, INVALID_CURSOR, INTERNAL_ERROR이고 원인을 하나로 묶지 않는다
    category: policy
    applies_to: tools/call
    trigger: 도구 처리가 실패할 때
    logic: "오류 이름과 짧은 안내를 도구 오류(isError)로 돌려준다. RATE_LIMITED는 BR6.1, INVALID_CURSOR는 BR5.5, INTERNAL_ERROR는 DB 실패이고 로그를 남긴다. 오류에 입력 원문·SQL·stack·토큰을 넣지 않는다"
    violation: 해당 없음
    source: C-15 common-errors, 에러 대응 최소선 1, 요약 확인(오류), docs/CatchU_security_checks.md 로그·오류 응답

  # BR6 빈도와 응답 크기
  - id: BR6.1
    statement: 도구 호출만 회원 기준으로 세고 분당 60회를 넘으면 도구 오류 RATE_LIMITED로 돌려준다
    category: policy
    applies_to: tools/call
    trigger: 토큰 확인을 통과한 tools/call
    logic: "1분 고정 창으로 회원마다 센다. 61번째 호출부터 DB를 읽지 않고 RATE_LIMITED를 돌려준다. initialize, tools/list는 세지 않는다. 60은 시작 값이고 첫 실제 연결 때 호출량을 보고 조정한다"
    violation: RATE_LIMITED
    source: Q3, FR13.6, AC13.1.4
  - id: BR6.2
    statement: 빈도 집계는 큐와 같은 Redis를 쓰고, 주소가 없으면 제한 없이 돌며 기동 로그를 한 번 남긴다
    category: policy
    applies_to: CATCHU_QUEUE_REDIS_URL
    trigger: 기동 때
    logic: "기존 큐 설정 읽기를 그대로 쓴다. 새 환경변수는 없다. IF 주소가 없으면 THEN 연결하지 않고 로그에 「MCP 빈도 제한 꺼짐」을 한 번 남긴다. EKS는 AI 처리에 같은 Redis가 필요해 제한이 함께 켜진다. 개발 서버에서 꺼지는 것은 받아들인 위험이다"
    violation: 해당 없음
    source: Q4, 에러 대응 최소선 1
  - id: BR6.3
    statement: Redis 주소가 있는데 Redis 오류가 나면 세지 않고 통과시키고 경고 로그만 남긴다
    category: policy
    applies_to: tools/call
    trigger: 빈도 집계가 실패하거나 1초 안에 끝나지 않을 때
    logic: "담당이 확인한 결정이다. 처음에 거부로 정했다가 U5와의 차이와 장애 영향을 확인하고 U5와 같게 바꿨다. 빈도 집계 명령에 1초 상한을 두고 넘으면 같은 오류로 친다. 그동안은 제한이 꺼진다. 연결은 AiRun과 같게 오프라인 대기 없이 한 번만 시도하고 종료 때 닫는다. 경고 로그에는 오류 이름만 남긴다"
    violation: 해당 없음
    source: Q5, U5 기능 설계 BR3.2, 에러 대응 최소선 1
  - id: BR6.4
    statement: 빈도 키는 회원과 분 창으로 만들고 만료에 맡기며 기간별 사용 횟수는 기록하지 않는다
    category: constraint
    applies_to: Redis 키
    trigger: 빈도를 셀 때
    logic: "키는 {prefix}:mcp-rate:{memberId}:{분 창}이고 창이 끝나면 저절로 사라진다. 탈퇴 때 지우지 않는다. DB·로그에 호출 횟수를 쌓지 않는다"
    violation: 해당 없음
    source: FR13.6, AC13.1.4, C-06
  - id: BR6.5
    statement: 한 쪽의 응답은 40,000자를 넘지 않게 하고 말없이 자르지 않는다
    category: calculation
    applies_to: list_my_catches, list_my_text_materials
    trigger: 응답을 만들 때
    logic: "직렬화한 응답 글 길이로 잰다. 넘을 항목은 다음 쪽으로 넘긴다. IF 항목 하나가 상한을 넘으면 THEN 텍스트 자료는 body를 빈 글로 하고 bodyOmitted를 true로, Catch는 catchId, title, visibility, mismatch, evidenceUrls를 남기고 workFacts를 빈 배열, subjectContribution을 빈 글, authorDescription을 null, omitted를 true로 해 다음으로 넘어가게 한다. 40,000자는 웹·Desktop 도구 결과 한도 약 150,000자보다 충분히 작은 시작 값이고 상수 한 곳에 둔다. 25,000토큰은 FR13.1 범위 밖인 Claude Code의 한도라 기준으로 삼지 않는다. 한글로 된 큰 쪽의 실제 동작은 functional-spec S22에서 확인하고, 잘리거나 실패하면 값을 낮춘다"
    violation: 해당 없음(큰 항목은 표시와 함께 글을 뺀다)
    source: FR13.6, AC13.1.4, C-15 쪽 단위 응답, Build an MCP server for Claude 「Design within the size and timeout limits」

  # BR7 연결 관리
  - id: BR7.1
    statement: "연결 상태는 NONE, ACTIVE, EXPIRED이고 GET /v1/me/mcp-connection이 mcpUrl과 함께 돌려준다"
    category: calculation
    applies_to: GET /v1/me/mcp-connection
    trigger: 연결 관리·승인 화면을 열 때
    logic: "IF 그 회원의 연결 행이 없으면 THEN NONE. IF 만료 전인 행이 있으면 THEN ACTIVE. ELSE EXPIRED. 응답은 { state, expiresAt, mcpUrl }이고 expiresAt은 가장 늦은 만료, NONE이면 null이다"
    violation: 로그인 만료는 기존 401
    source: FR13.1, 요약 확인(연결 관리)
  - id: BR7.2
    statement: 전체 해제는 그 회원의 접근 토큰·연결과 쓰지 않은 승인 코드를 한 트랜잭션으로 지운다
    category: policy
    applies_to: DELETE /v1/me/mcp-connection
    trigger: 연결 관리 화면에서 확인 뒤 해제
    logic: "READ COMMITTED 트랜잭션에서 usedAt이 빈 코드 → 토큰 → 연결 순으로 지운다. 코드를 먼저 지워 진행 중인 토큰 교환과 겹쳐도 토큰이 남지 않게 한다. 쓴 코드 행은 다시 토큰으로 바꿀 수 없어 접근 차단과 상관없고, 그 회원의 다음 토큰 교환 때 만료 행으로 지워지거나 탈퇴 때 지워진다. 응답은 204이고 반복해도 같다. 연결별 해제는 없다"
    violation: DB 실패는 500과 로그. 화면은 오류를 보여 주고 회원이 다시 누른다
    source: FR13.1, AC13.1.3, C-15 disconnect, ADR-009, 에러 대응 최소선 1·2·5
  - id: BR7.3
    statement: 웹 로그아웃은 Claude 연결을 끊지 않는다
    category: policy
    applies_to: McpConnection, McpAccessToken
    trigger: 웹 로그아웃
    logic: 세션 폐기는 MCP 표를 건드리지 않는다. 해제는 전체 해제와 탈퇴뿐이다
    violation: 해당 없음
    source: FR13.1, 요약 확인(연결 관리)
  - id: BR7.4
    statement: 탈퇴가 이름으로 부르는 세 표의 이름과 member_id 칸을 그대로 쓰고, 새 외래 키는 모두 연쇄 삭제다
    category: constraint
    applies_to: McpConnection, McpAuthorizationCode, McpAccessToken
    trigger: 마이그레이션을 만들 때, 탈퇴 때
    logic: "탈퇴 코드는 표가 없으면 건너뛰므로 이름이 달라지면 오류 없이 토큰이 남는다. 탈퇴 1단계가 세 표를 지워 접근을 막고 회원 행 삭제가 연쇄 삭제로 끝낸다. 같은 PR에서 삭제 문서와 연쇄 삭제 시험에 행을 더한다. 재가입하면 새 회원이라 다시 동의한다"
    violation: 연쇄 삭제 시험 실패
    source: FR14.1, FR14.6, FR14.8, C-06, C-15 tables
  - id: BR7.5
    statement: /profile/claude 화면에 MCP 주소 복사, 상태, 전체 연결 해제를 두고 프로필과 시작 안내에서 이어 준다
    category: constraint
    applies_to: /profile/claude
    trigger: 회원이 연결을 관리할 때
    logic: "상태는 BR7.1, 해제는 확인 뒤 BR7.2. 복사 주소는 api의 mcpUrl을 쓴다. /profile과 시작 안내의 발행·본인 Claude 연결 단계에서 이 화면으로 잇는다"
    violation: 조회·해제 실패는 화면에 오류를 보여 준다
    source: FR13.1, FR16.3, AC13.1.3, 요약 확인(연결 관리)

  # BR8 기록
  - id: BR8.1
    statement: 코드, 토큰과 그 해시, 사용자 자료를 로그·오류 응답에 남기지 않는다
    category: constraint
    applies_to: 로그, 오류 응답
    trigger: 모든 U6 처리
    logic: "로그에는 사건 이름, 도구 이름, 오류 이름만 남긴다. 값 대신 설정 이름을 적는다"
    violation: 시험에서 합성 토큰·코드·자료 글이 로그에 있으면 실패
    source: team.md Code Style, 요약 확인(코드·토큰), docs/CatchU_security_checks.md 로그·오류 응답
```

## 규칙 요약

| 묶음 | 규칙 | 한 줄 요약 |
|---|---|---|
| BR1 주소·설정 | BR1.1~BR1.4 | `/v1/mcp`와 앱 루트 OAuth 주소, `/revoke` 없음. 공개 주소는 개발·시험만 따로, 그 밖은 `AUTH_WEB_ORIGIN`. 새 설정은 선택값 셋, 개발용 값이 운영에 있으면 기동 실패 |
| BR2 등록·인증 전 제한 | BR2.1~BR2.5 | 공개 클라이언트, 콜백 하나 정확히 일치, 이름 200자, 안 쓴 등록 7일 뒤 정리, 인증 전 주소는 SDK IP 제한(예외) |
| BR3 승인·동의 | BR3.1~BR3.7 | 두 번 확인, fetch와 JSON `redirectTo`, 회원 단위 동의, 재승인도 버튼, 호스트와 안내 표시, 거절은 `access_denied`, 승인은 한 트랜잭션 |
| BR4 코드·토큰·인증 | BR4.1~BR4.8 | 코드 5분·1회, 토큰 7일, 해시만 저장, 교환 한 트랜잭션, 교체와 만료 행 정리, 갱신·범위 없음, 요청마다 확인, 실패는 401 |
| BR5 조회 도구 | BR5.1~BR5.7 | 도구 둘(`readOnlyHint`), 입력 `cursor`뿐, 회원은 토큰에서만, 초안·PDF 없음, 세션 없음, 오류 셋 |
| BR6 빈도·크기 | BR6.1~BR6.5 | 도구 호출만 회원당 분당 60회, Redis 없으면 꺼짐과 로그 한 번, Redis 오류는 통과와 경고, 횟수 기록 없음, 쪽당 40,000자 |
| BR7 연결 관리 | BR7.1~BR7.5 | 상태 셋, 전체 해제(쓰지 않은 코드 먼저), 로그아웃은 무관, 탈퇴용 이름 고정, `/profile/claude` |
| BR8 기록 | BR8.1 | 코드·토큰·해시·자료를 로그에 남기지 않음 |
