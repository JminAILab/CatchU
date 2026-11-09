# Claude 연결 ClaudeMcp — 12월 intent U6

구직자 본인의 Claude 웹·Desktop이 자기 Catch와 텍스트 자료를 읽게 하는 모듈(`src/claude-mcp/`)이다. OAuth 규칙은 공식 SDK `@modelcontextprotocol/sdk`의 인증 도구가 맡고, U6은 그 저장 단계, `/v1/mcp`와 조회 도구 둘, 회원 빈도 제한, 연결 상태·승인·전체 해제를 둔다. 화면은 [web/src/features/claude-connection](../../web/src/features/claude-connection/README.md)에 있다.

기준 문서: [계약 C-06·C-13·C-14·C-15](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md), [결정 기록](../../aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/decisions.md) ADR-009, [U6 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/functional-spec.md) W1~W7·S1~S24, [업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md) BR1~BR8, [U6 비기능 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/nfr-design/). 규칙 ID는 그 문서의 것이다.

기본 앱(`AppModule`)에 등록한다. 받은 사람 도구 `read_shared_publication`은 U9가 더한다.

## 주소

| 경로 | 누구 | 응답 | 오류 |
|---|---|---|---|
| `POST /v1/mcp` | Claude(MCP 토큰, `Authorization: Bearer`) | `200` JSON. 세션 없는 Streamable HTTP | 401(`WWW-Authenticate`의 `resource_metadata`, 이유 구분 없음), 403 `AUTH_ORIGIN_FORBIDDEN`, 406·415(전송 형식), 500(토큰 확인 중 DB 실패) |
| `GET`·`DELETE /v1/mcp` | 없음 | `405`, `Allow: POST` | 403 `AUTH_ORIGIN_FORBIDDEN` |
| `GET /.well-known/oauth-protected-resource/v1/mcp` | Claude | 보호 자원 메타데이터 | |
| `GET /.well-known/oauth-authorization-server` | Claude | 인증 서버 메타데이터 | |
| `POST /register` | Claude | `201`. 공개 클라이언트로만 저장, 비밀값 없음 | 400 `invalid_redirect_uri`·`invalid_client_metadata`, 429(SDK IP 제한), 500 |
| `GET /authorize` | 회원 브라우저 | `302` `{AUTH_WEB_ORIGIN}/profile/claude/authorize` | 400(없는 클라이언트·등록에 없는 돌아갈 주소, 그 주소로 보내지 않음), 등록된 돌아갈 주소로 `error` 302(S256 아닌 PKCE·다른 `resource`), 429, 500 |
| `POST /token` | Claude | `{ access_token, token_type, expires_in }`. 갱신 토큰·`scope` 없음 | 400 `invalid_grant`·`invalid_client`·`unsupported_grant_type`, 429, 500 |
| `GET /v1/me/mcp-connection` | 회원(Bearer) | `{ state, expiresAt, mcpUrl }`. `state`는 `NONE`·`ACTIVE`·`EXPIRED` | 400 `VALIDATION_FAILED`(쿼리), 401 `AUTH_*` |
| `POST /v1/me/mcp-connection/authorizations` | 회원(Bearer, 허용 출처) | `200 { redirectTo }`(302 아님) | 400 `VALIDATION_FAILED`·`MCP_AUTHORIZATION_INVALID`, 401 `AUTH_*`, 403 `AUTH_ORIGIN_FORBIDDEN`, 409 `MCP_CONSENT_REQUIRED` |
| `DELETE /v1/me/mcp-connection` | 회원(Bearer, 허용 출처) | `204`. 반복해도 같다 | 400 `VALIDATION_FAILED`(본문·쿼리), 401 `AUTH_*`, 403 `AUTH_ORIGIN_FORBIDDEN` |

- `/revoke`는 없다. 해제는 화면의 전체 해제와 탈퇴뿐이다(BR1.1, BR7.2). 웹 로그아웃은 연결을 끊지 않는다(BR7.3).
- SDK 라우터는 앱 루트에 건다. Nest 경로가 아니라 전역 Guard를 거치지 않는다. `/v1/mcp`도 메서드에만 `@Public()`을 붙이고 토큰은 SDK `requireBearerAuth`와 저장 단계가 요청마다 확인한다. 회원 Access 토큰은 `/v1/mcp`에서, MCP 토큰은 회원 API에서 모두 401이다(NFR1.1, NFR1.2).
- `/v1/mcp`는 토큰 확인 전에 `Origin`을 본다. 값이 있고 공개 주소와 다르면 403이고 없으면 통과한다(NFR1.6). 승인과 해제는 U2 동의 기록과 같은 `assertSessionOrigin`을 쓴다(NFR1.7).
- 승인 본문은 `{ clientId, redirectUri, state?, codeChallenge, resource?, decision: "APPROVE" | "DENY", consent? }`이고 정의하지 않은 칸은 거부한다. 회원은 Access 토큰에서만 정한다. 돌아갈 주소는 그 등록의 목록과 지금의 허용 목록 모두에 정확히 있어야 한다. SDK의 `/authorize`는 loopback 주소끼리면 포트를 무시하므로 포트까지 비교하는 곳은 승인 요청이다.
- 코드와 토큰은 난수 32바이트이고 SHA-256만 저장한다. 코드는 5분·한 번이고, 토큰 수명은 기본 7일이다. 같은 회원·클라이언트의 토큰은 교환 때 교체하고 그 회원의 만료 행을 함께 지운다(BR4.1~BR4.4).
- 코드·토큰·자료가 담긴 응답은 `Cache-Control: no-store`다. Nest 경로는 기존 `NoStoreInterceptor`, `/token`·`/register`·`/authorize`는 SDK가 붙인다(NFR1.10). 연결 API 세 경로의 DB 실패는 500 `INTERNAL_ERROR`다.

## 앞단이 api로 보내야 할 경로

`/v1/mcp`와 연결 API는 앞단이 이미 api로 보내는 `/v1` 아래에 있다. 앱 루트의 OAuth 주소는 앞단(Caddy, ALB)이 따로 api로 보내야 하고, 빠지면 Claude가 연결하지 못한다(BR1.1). 개발 서버(#389)와 EKS(#276)의 경로 작업이 이 목록을 따른다.

- `/authorize`
- `/token`
- `/register`
- `/.well-known/oauth-protected-resource*`
- `/.well-known/oauth-authorization-server*`

`/profile/claude`, `/profile/claude/authorize`는 web 경로다.

## 조회 도구

`tools/list`에는 아래 둘뿐이고 쓰기·JD 요약·의미 검색 도구는 없다. 두 도구 모두 `title`과 `readOnlyHint: true`가 있고, 입력은 `cursor`(선택)뿐이며 정의하지 않은 입력은 거부한다(BR5.1). 회원은 토큰에서만 정한다(BR5.2).

| 도구 | 읽는 것 | 순서 |
|---|---|---|
| `list_my_catches` | 그 회원(`owner_id`)의 공개·비공개 Catch와 근거 주소. `draft_content`는 읽지 않는다 | `catch_id` |
| `list_my_text_materials` | 그 회원(`member_id`)의 텍스트 자료. PDF 글은 읽지 않는다 | `created_at`, `text_material_id` |

- 호출 한 번에 50행까지 읽고 응답을 40,000자까지 채운다. 값은 `mcp-limits.ts` 한곳에 있다. 남은 행은 `nextCursor`로 이어 읽고 더 없으면 `null`이다. 50행을 모두 넣으면 다음이 있는지 모른 채 `nextCursor`를 주므로 자료 수가 50의 배수면 마지막 호출이 빈 목록과 `null`이다.
- 항목 하나가 상한을 넘으면 텍스트 자료는 `body`를 빈 글로 하고 `bodyOmitted: true`를, Catch는 글 칸을 비우고 `omitted: true`를 붙여 다음 항목으로 넘어간다. 말없이 자르지 않는다(BR6.5).
- 도구 오류는 `isError`와 글 하나 `{ error, message }`이고 `error`는 `RATE_LIMITED`, `INVALID_CURSOR`, `INTERNAL_ERROR`다(BR5.7). 응답에 입력 원문·SQL·stack을 넣지 않는다.
- `cursor`는 위치만 담은 불투명 문자열이고 회원에 묶지 않는다. 다른 회원의 `cursor`를 보내도 토큰 회원의 행만 나온다.

## 빈도 제한

- `tools/call`만 회원당 1분 고정 창으로 세고 61번째부터 DB를 읽지 않고 `RATE_LIMITED`다. `initialize`, `tools/list`는 세지 않는다. 60은 시작 값이고 첫 실제 연결에서 `mcp_rate_limited`가 나오는지 보고 조정한다(BR6.1, NFR6.4).
- 새 설정 없이 `CATCHU_QUEUE_REDIS_URL`·`CATCHU_QUEUE_PREFIX`를 읽고 전용 연결을 하나 연다. 키는 `{prefix}:mcp-rate:{memberId}:{분 창}`이고 만료로 사라진다. 횟수를 DB·로그에 쌓지 않는다(BR6.2, BR6.4).
- 주소가 없으면 연결하지 않고 제한 없이 돌며 기동 때 「MCP 빈도 제한 꺼짐」을 한 번 남긴다. Redis 오류나 1초 초과는 세지 않고 통과시키고 오류 이름만 경고로 남긴다(BR6.2, BR6.3).
- 인증 전 주소는 회원을 모르므로 SDK 기본 IP 제한을 쓴다. 등록 시간당 20회, 토큰 15분 50회, 승인 시작 15분 100회다. `TRUST_PROXY_CIDRS`가 있어야 실제 주소로 세고, 집계는 프로세스 메모리에 있어 api를 다시 띄우면 풀린다(BR2.5).

## 설정

새 설정은 모두 선택이고 새 비밀값은 없다. 값의 규칙은 [환경변수 표](environment.md)에 있다.

| 이름 | 쓰임 |
|---|---|
| `MCP_ACCESS_TOKEN_TTL_SECONDS` | 접근 토큰 수명. 기본이자 상한이 7일이다. 만료 재승인을 확인할 때만 줄인다 |
| `MCP_DEV_PUBLIC_ORIGIN` | 개발·test의 공개 주소. 터널로 실제 Claude를 붙여 볼 때만 쓴다. 터널은 로컬 api를 개발 로그인까지 함께 노출하므로 합성 자료만 쓰고 확인 뒤 바로 닫는다 |
| `MCP_DEV_REDIRECT_URIS` | 개발·test에서 Claude 콜백 말고 더 받을 돌아갈 주소 |

공개 주소(OAuth 메타데이터, MCP 주소, `WWW-Authenticate`, `mcpUrl`)는 기동 때 한 번 정하고 요청의 Host나 전달 헤더로 만들지 않는다(BR1.2).

| `NODE_ENV` | `MCP_DEV_PUBLIC_ORIGIN` 없음 | 값 있음 |
|---|---|---|
| `development`·`test` | `http://127.0.0.1:{PORT}` | 그 값 |
| 그 밖(`production`·미지정 포함) | `AUTH_WEB_ORIGIN` | 기동 실패 |

승인 화면으로 보내는 주소는 어느 칸이든 `AUTH_WEB_ORIGIN`이다. `ClaudeMcpModule`이 `AppModule`에 있으므로 개발용 값이 운영에 남아 있으면 api 전체가 뜨지 않는다. 운영의 돌아갈 주소는 코드의 상수 `https://claude.ai/api/mcp/auth_callback` 하나다(BR2.2).

## 로그 사건

Nest `Logger`(`ClaudeMcp`)에 객체 하나로 남긴다. 사건마다 아래 칸만 가진 타입이라(`mcp-log.ts`) 코드·토큰·해시·`state`·`cursor`·회원 ID·자료 글이 들어갈 자리가 없다. 오류 메시지를 옮기지 않고 형식을 확인한 오류 이름만 남긴다(NFR6.2, NFR6.3).

| 사건 | 수준 | 칸 | 남기는 때 |
|---|---|---|---|
| `mcp_rate_limit_off` | warn | `message` | 기동 때 큐 주소가 없으면 한 번 |
| `mcp_rate_limit_error` | warn | `error` | 셈 명령의 오류·1초 초과, 연결의 첫 오류 |
| `mcp_rate_limited` | warn | `tool` | 분당 한도를 넘은 호출 |
| `mcp_tool_failed` | error | `tool`, `error` | 도구의 예상하지 못한 오류 |
| `mcp_token_check_failed` | error | `error` | 토큰 확인 중 DB 실패 |
| `mcp_origin_rejected` | warn | 없음 | `/v1/mcp`의 `Origin` 거부 |
| `mcp_token_exchange_refused` | warn | `reason`(`code_missing`, `code_expired`, `code_used`, `redirect_uri`, `client`, `resource`) | U6 코드가 내는 토큰 교환 거부. 응답은 모두 `invalid_grant`다 |
| `mcp_oauth_failed` | error | `step`(`register`, `client`, `token`), `error` | SDK에 넘긴 저장 단계의 DB 실패 |
| `mcp_transport_close_failed` | error | `error` | 요청이 끝난 뒤 전송을 닫다 실패함 |

`client`는 `/authorize`와 `/token`이 함께 부르는 클라이언트 조회이고, `token`은 코드 challenge 읽기와 코드 교환이다. 남기지 않는 것: `/v1/mcp`의 401, 입력 오류, `INVALID_CURSOR`, 정상 도구 호출·승인·토큰 발급. Nest 처리기 안에서 끝나는 실패(상태 조회·승인·해제)는 기존 `ApiExceptionFilter`가 남긴다.

## 시험

`test/claude-mcp/`가 실제 `AppModule`과 테스트 DB에서 합성 회원·합성 자료로 돈다. DB 실패와 Redis 멈춤만 바꿔 끼운다. 합성 Claude는 SDK의 `client/auth.js`와 `Client`로 찾기·등록·승인 시작·토큰 교환·도구 호출을 부르는 시험 도우미다.

```bash
# api 폴더에서. 테스트 DB는 README 「DB 테스트」, Valkey는 docs/analysis-queue.md 「시험」대로 띄운다.
CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6379 npm test -- test/claude-mcp/*.test.cjs
CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6379 TEST_COVERAGE_INCLUDE='dist/claude-mcp/**' npm run test:coverage -- test/claude-mcp/*.test.cjs
```

- `CATCHU_TEST_REDIS_URL`이 없으면 실제 Redis 시험은 건너뛴다. 건너뛴 시험은 통과로 세지 않는다.
- 탈퇴와 표는 `test/u2/withdrawal.test.cjs`, `test/db/member-cascade-delete.test.cjs`, `test/integration/result-application-b.test.cjs`도 실제 표로 본다.

**이 시험은 합성이고 실제 Claude 연결의 증거가 아니다.** 실제 Claude 웹·Desktop 연결과 다른 계정이 시작한 연결의 확인(기능 명세 S22~S24)은 사람이 하고 결과를 [통합 확인](../../docs/CatchU_통합확인.md) 표에 통과·실패·미실행으로 남긴다. 승인 주소·`state`·토큰·응답 글은 이슈·PR·AI에 남기지 않고 결과만 적는다(NFR6.5).

## 받아들인 한계

- 처음 가입한 회원은 프로필 설정을 거치며 승인 흐름을 잃어 Claude에서 다시 시작해야 한다.
- Claude 쪽에서 연결을 지워도 서버는 알 수 없어 토큰은 만료나 전체 해제까지 유효하다.
- 승인에 쓰인 적 있는 `mcp_client` 행은 남는다. 회원을 가리키지 않아 탈퇴로도 지워지지 않는다.
- Claude가 콜백을 `claude.com`으로 바꾸면 등록이 거부되므로 코드의 상수를 고쳐야 한다.
- 등록 IP 한도를 넘으면 모든 회원의 새 연결이 최대 1시간 막힌다. 이미 연결된 회원의 도구 호출은 영향이 없다. 토큰 없는 `/v1/mcp` 요청과 `tools/list`에는 빈도 제한이 없다.
- 큐 주소가 없는 환경(개발 서버, 큐를 켜기 전의 EKS)에서는 빈도 제한이 꺼진다.
- SDK 안에서 끝나는 실패(PKCE 틀림, 요청 형식 오류, 등록 IP 한도)는 U6 코드를 거치지 않아 로그가 남지 않는다. 응답으로는 드러난다.
- 글을 뺀 항목도 `title`과 Catch의 근거 주소는 남기므로 제목이 상한에 가까우면 쪽이 40,000자를 넘을 수 있다. U4의 제목·본문 상한이 정해지면 글을 뺀 항목 크기와 최악의 메모리(50행 × 본문 상한)를 다시 본다.
- 다른 Claude 계정이 시작한 연결을 승인했을 때 Claude가 콜백을 거부하는지(S24) Unit 제출 전까지 확인하지 못했다. 승인 화면은 구별할 정보가 없고 막는 장치는 안내 문구뿐이라, Claude가 거부하지 않으면 그 계정의 Claude가 회원의 자료를 읽는다. 첫 실제 연결에서 확인하고 읽게 되면 막을 방법을 다시 정한다.

## 첫 실제 연결에서 볼 것

공식 문서만으로 정할 수 없어 실제 Claude로 확인한다(기능 명세 「Assumptions & Open Questions」).

- Claude 요청에 `Origin`이 있는지. 있으면 그 값을 허용 목록에 더한다(NFR1.6).
- 갱신 토큰 없이 만료될 때 Claude의 표시, 공개 클라이언트 응답 수용, SDK 기본 메타데이터에 `refresh_token`이 보이는 것의 영향.
- 도구 오류가 Claude 화면에 어떻게 보이는지, 40,000자에 가까운 한글 쪽이 잘리지 않는지. 잘리거나 실패하면 `MCP_PAGE_CHARS`를 낮춘다.
- Claude에서 넘어온 직후 `SameSite=Strict` 쿠키로 로그인이 복원되는지, 긴 `state`로도 로그인 뒤 돌아오는지(2,048자를 넘는 주소는 복귀하지 못하고 `/home`으로 간다), 지워진 등록으로 다시 시도할 때 Claude가 새로 등록하는지.
- 다른 Claude 계정이 시작한 연결을 승인했을 때 Claude가 콜백을 거부하는지(S24). 승인 화면은 직접 시작한 연결과 남이 시작한 연결을 구별할 정보가 없고 막는 장치는 안내 문구뿐이다. 팀원의 Claude가 시험 회원의 자료를 읽게 되면 막을 방법을 다시 정한다.
