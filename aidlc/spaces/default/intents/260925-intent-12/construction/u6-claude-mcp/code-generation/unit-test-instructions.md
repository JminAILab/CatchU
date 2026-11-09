# U6 Claude MCP 본인 연결 — 단위 시험 안내

## 시험 도구와 설정

- api: 기존 `node:test` 묶음과 실행기 `api/scripts/test-with-db.cjs`. 빌드(`dist/`) 뒤 테스트 DB에 마이그레이션을 적용하고 넘긴 파일만 돌린다. 새 시험 도구·설정 파일은 더하지 않는다(team.md Testing Posture, 기술 선택).
- web: 기존 `node --test`. `.tsx`는 `web/test/u2-render.mjs`로 변환해 불러오고 CSS 모듈은 빈 객체, `next/link`는 시험 대역이다. 이 시험은 문구·구조를 보며 CSS 배치는 브라우저에서 확인한다.
- 시험 파일: `api/test/claude-mcp/*.test.cjs`, 고친 `api/test/db/member-cascade-delete.test.cjs`, `api/test/u2/withdrawal.test.cjs`, `api/test/integration/result-application-b.test.cjs`, `web/test/u6-*.test.mjs`, 고친 `web/test/u2-start-guide.test.mjs`. `api/test/claude-mcp/support.cjs`는 이름이 `.test.cjs`로 끝나지 않아 따로 돌지 않는다.
- CI: `dev-ci`가 같은 시험을 돌린다. api job에는 `CATCHU_TEST_REDIS_URL`이 있다. CI 설정은 고치지 않는다.

## 작업 전용 컨테이너

개발 DB `catchu-db`와 볼륨 `catchu-db-data`는 쓰지 않는다. 이 Unit의 시험에는 아래 두 컨테이너를 만든다. 포트가 차 있으면 다른 포트를 쓰고 이 문서를 고친다.

```bash
docker run -d --name catchu-u6-db-test -p 127.0.0.1:55436:5432 -e POSTGRES_USER=catchu -e POSTGRES_PASSWORD=catchu_local -e POSTGRES_DB=catchu_test --tmpfs /var/lib/postgresql/data pgvector/pgvector:0.8.7-pg16-trixie
docker run -d --name catchu-u6-redis-test -p 127.0.0.1:56379:6379 valkey/valkey:8.1.6-alpine
```

Windows의 Git Bash에서는 `--tmpfs` 경로가 Windows 경로로 바뀌어 DB 명령이 `invalid mount path` 오류로 실패한다. 이때는 DB 명령 앞에 `MSYS_NO_PATHCONV=1`을 붙인다.

끝나면 이 둘만 이름을 하나씩 지정해 지운다. 여러 개를 고르는 삭제, prune, `docker volume rm`은 쓰지 않는다.

```bash
docker rm -f -v catchu-u6-db-test
docker rm -f -v catchu-u6-redis-test
```

## 이 Unit 시험 실행 명령

저장소 맨 위 폴더에서 그대로 돌린다. 값은 셸 환경변수로만 넘긴다.

실행기 확인(계획 Step 2, 첫 시험 파일을 쓰기 전):

```bash
TEST_DB_PORT=55436 npm --prefix api test -- test/db/member-cascade-delete.test.cjs
(cd web && node --test test/u2-start-guide.test.mjs)
```

마이그레이션(계획 Step 4, 작업 전용 DB에만):

```bash
export DB_HOST=127.0.0.1 DB_PORT=55436 DB_USER=catchu DB_PASSWORD=catchu_local DB_NAME=catchu_test
npm --prefix api run migration:run
npm --prefix api run migration:generate -- src/database/migrations/CreateMcpTables
npm --prefix api run migration:run
npm --prefix api run migration:revert
npm --prefix api run migration:run
```

api U6 시험 전부:

```bash
TEST_DB_PORT=55436 CATCHU_TEST_REDIS_URL=redis://127.0.0.1:56379 npm --prefix api test -- test/claude-mcp/mcp-config.test.cjs test/claude-mcp/mcp-page.test.cjs test/claude-mcp/mcp-rate-limit.test.cjs test/claude-mcp/mcp-oauth-register.test.cjs test/claude-mcp/mcp-oauth-token.test.cjs test/claude-mcp/mcp-endpoint.test.cjs test/claude-mcp/mcp-tools.test.cjs test/claude-mcp/mcp-connection.test.cjs test/claude-mcp/mcp-withdrawal.test.cjs test/claude-mcp/mcp-logs.test.cjs test/db/member-cascade-delete.test.cjs test/u2/withdrawal.test.cjs test/integration/result-application-b.test.cjs
```

api U6 줄 커버리지(팀장 공용 명령, 표 맨 아래 비율이 U6 값):

```bash
TEST_DB_PORT=55436 CATCHU_TEST_REDIS_URL=redis://127.0.0.1:56379 TEST_COVERAGE_INCLUDE='dist/claude-mcp/**' npm --prefix api run test:coverage -- test/claude-mcp/mcp-config.test.cjs test/claude-mcp/mcp-page.test.cjs test/claude-mcp/mcp-rate-limit.test.cjs test/claude-mcp/mcp-oauth-register.test.cjs test/claude-mcp/mcp-oauth-token.test.cjs test/claude-mcp/mcp-endpoint.test.cjs test/claude-mcp/mcp-tools.test.cjs test/claude-mcp/mcp-connection.test.cjs test/claude-mcp/mcp-withdrawal.test.cjs test/claude-mcp/mcp-logs.test.cjs
```

web U6 시험과 줄 커버리지(`web/`에서, 맨 아래 `all files`가 U6 값):

```bash
(cd web && node --test test/u6-claude-authorize.test.mjs test/u6-claude-connection.test.mjs test/u2-start-guide.test.mjs)
(cd web && node --test --experimental-test-coverage --test-coverage-include="src/features/claude-connection/**" test/u6-claude-authorize.test.mjs test/u6-claude-connection.test.mjs)
```

정적 검사(서비스 전체 설정이라 범위를 좁힐 수 없다):

```bash
npm --prefix api run lint
npm --prefix api run typecheck
(cd web && npm run check)
```

api 전체 회귀(`TEST_DB_PORT=55436 CATCHU_TEST_REDIS_URL=redis://127.0.0.1:56379 npm --prefix api test`)는 계획 Step 13의 마지막 항목으로 따로 돌리며 Unit 범위 명령이 아니다.

## 기대 커버리지

- `api/src/claude-mcp/`와 `web/src/features/claude-connection/`의 줄 커버리지 각각 80% 이상(mvp 범위 하한). api 표는 `dist/`의 컴파일된 JS 기준이다. web의 `.tsx`는 변환해 불러와 비율·빠진 줄 번호가 원본과 다를 수 있다.
- 시험이 한 번도 불러오지 않은 파일은 표와 비율에 들어가지 않으므로 0%로 따로 센다. `web/src/app/(member)/profile/claude/**`의 페이지 파일은 한 줄 조립이고 범위 밖이며, 그 사실을 code-summary에 적는다.
- 시험 수: 구성 요소마다 5~8개(Standard), 합계 약 80개. 단위 시험과 HTTP·DB·Redis 경계 통합 시험을 함께 둔다.
- 기준을 낮추거나 상한을 바꿔 통과시키지 않는다. 못 미치면 빠진 경로의 시험을 더하고, 그래도 안 되면 그 사실을 code-summary에 적는다.

## 시나리오 표 (구현 전에 확정, functional-spec S1~S21)

기대 결과와 실패 조건의 정본은 기능 명세 「주요 시나리오와 확인」이다. 아래는 어느 파일이 보는지와 비기능 설계에서 더해진 내용이다.

| 시험 파일 | 시나리오 | 기대 결과 | 실패 조건 |
|---|---|---|---|
| `mcp-config` | S2 공개 주소 표 4칸, `MCP_DEV_REDIRECT_URIS` 같은 칸, TTL 7일 초과·0·문자열, 빈 값 | 표대로 값이 정해지거나 설정 이름만 든 오류로 멈춤. 운영에서 `127.0.0.1` 기본값이 쓰이지 않음 | 운영에 개발용 값이 있는데 기동됨, 오류에 값이 들어감 |
| `mcp-page` | S14 작은 항목·쪽 경계·50의 배수, S15 상한 넘는 항목·경계 근처, `cursor` 형식(길이 1,025, base64url 왕복 불일치, 칸 더함, UUID 아님, 없는 날짜) | 모든 항목이 정확히 한 번, 마지막 `nextCursor`는 null, `JSON.stringify(page).length` ≤ 40,000, 글 뺀 항목 표시, `cursor` 오류는 모두 `INVALID_CURSOR` | 빠짐, 중복, 말없이 잘림, 같은 항목에서 멈춤 |
| `mcp-oauth-register` | S1 메타데이터 / S3 등록(정상, `client_secret_post`, 다른 주소, 빈 목록, 이름 201자, 개발 목록 주소의 개발·운영 각각) / S4 정리 / BR2.5 21번째 등록 / 등록 중 DB 실패 | S256, 공개 주소, `/revoke` 404. 비밀값 없음·`none`. `invalid_redirect_uri`·`invalid_client_metadata`. 8일 전 미승인 행만 지워짐. 429. 500과 `mcp_oauth_failed`(`register`) | 앞부분 일치 통과, 비밀값이 응답·표에 있음, 승인된 등록이 지워짐 |
| `mcp-oauth-register` | S5 `/authorize`: 정상, 없는 클라이언트, 등록에 없는 주소, S256 아닌 PKCE, 다른 `resource`, 운영 주소의 쿼리·포트 변형, **포트만 다른 loopback 주소**, 조회 중 DB 실패 | 정상과 포트만 다른 loopback은 승인 화면으로 302이고 쿼리 값이 그대로 넘어감. 그 loopback 주소로 승인 요청을 보내면 400 `MCP_AUTHORIZATION_INVALID`이고 코드 행이 없음. 나머지는 오류이고 그 주소로 보내지 않음. DB 실패는 500과 `mcp_oauth_failed`(`client`) | 확인 안 된 주소로 이동, 포트만 다른 주소로 코드가 나감 |
| `mcp-oauth-token` | S7 교환 10가지(정상, 없는 코드, 두 번, 5분 지남, PKCE 틀림, 주소 틀림, 다른 클라이언트, 다른 `resource`, `refresh_token`, 그 밖의 `grant_type`) / S8 재승인·만료 행 정리 / 교환 중 DB 실패 | 정상은 `access_token`·`token_type`·`expires_in`만, 표에는 해시만. 거부는 `invalid_grant`, 그 밖의 `grant_type`은 `unsupported_grant_type`, 표가 바뀌지 않음. 이전 토큰 401, 그 회원의 만료 행만 지워짐. 500과 `mcp_oauth_failed`(`token`) | 코드 재사용, 원문 저장, 다른 회원 행 삭제 |
| `mcp-endpoint` | S1 토큰 없는 POST / S9 토큰 상태 넷과 헤더 없음·형식 틀림·쿼리 토큰 / 토큰 확인 DB 실패 / S13 `tools/list`·없는 도구·GET·DELETE·세션 헤더 / `Origin` 거부(토큰 유무, 세 메서드) / 회원 토큰 섞임(NFR1.2) / `no-store` / 406·415·100KB 초과 / 묶음 2개 | 토큰 상태 넷은 상태·`WWW-Authenticate`·본문이 글자까지 같음. 헤더 없음·형식 틀림도 401과 `resource_metadata`. DB 실패는 500과 `mcp_token_check_failed`. 도구는 둘, `readOnlyHint: true`, 입력은 `cursor`뿐. 405와 `Allow: POST`. `Mcp-Session-Id` 없음. 403 `AUTH_ORIGIN_FORBIDDEN`과 `mcp_origin_rejected` | DB 실패를 401로 숨김, 도구가 더 있음, 세션이 생김 |
| `mcp-tools` | S10 Catch, S11 텍스트 자료, S12 B 토큰과 A `cursor`·잘못된 `cursor`·추가 입력, S14·S15 HTTP로 끝까지 읽기, 조회 DB 실패 | A 행만, C-15 칸, `title` null 포함, `draft_content` 글 없음, PDF 글 없음, 본문 그대로. B 행만. `INVALID_CURSOR`(DB 안 읽음). 입력 오류에 입력 이름 없음. `INTERNAL_ERROR`와 `mcp_tool_failed` | B의 행, 초안 글, 본문 변형 |
| `mcp-rate-limit` | S16: 61번째(DB 조회 없음)·다른 회원·다음 창·`tools/list`·묶음 호출은 하나씩·키 만료 120초(Redis 필요) / 주소 없음(로그 1회) / 끊김 / 멈춤(받기만 하는 TCP 서버, 호출이 약 1초 안에 끝남) | 표대로. 오류는 통과와 `mcp_rate_limit_error`(오류 이름만) | 호출이 1초 넘게 걸림, 오류가 숨겨짐, 횟수가 DB·로그에 남음 |
| `mcp-connection` | S6 승인 8가지 / S17 해제(정상, 반복, 쓰지 않은 코드, 진행 중 교환과 겹침, 다른 회원) / S18 상태 넷과 웹 로그아웃 / 허용 출처 거부(승인·해제) | 기능 명세 S6·S17·S18. 겹침은 실제 교환이 코드 행을 잡은 채 멈춘 동안 해제를 보내 토큰이 남지 않음을 본다. 출처 거부는 403이고 행이 바뀌지 않음. 조회는 출처를 보지 않음 | 동의 없이 코드, 302 응답, 해제 뒤 토큰이 남음, 로그아웃으로 끊김 |
| `mcp-withdrawal` | S19 실제 `DELETE /v1/me` 뒤 도구 호출·재가입·등록 행 | 세 표의 행 없음, 401, 새 회원 `NONE`, 승인에 쓰인 `mcp_client`는 남음 | 표 이름 어긋남으로 건너뜀, 토큰이 남음 |
| `mcp-logs` | S20 전체 흐름(쿼리의 토큰, 다른 `Origin`, 정의하지 않은 입력 이름 포함) / 사건별 칸 / 정상 호출 | 로그 출력과 오류 응답에 합성 코드·토큰·해시·`state`·자료 글이 없음. 칸이 관측 설계 표와 같음. 정상 호출에 U6 로그 없음 | 하나라도 있음 |
| `member-cascade-delete` | S19 회원 행 삭제 | 세 표의 그 회원 행 0, 다른 회원 그대로, 외래 키 모두 연쇄 삭제 | 행이 남음 |
| `withdrawal`(U2) | S19 U2 탈퇴 시험을 실제 표로 | 기존 시험이 그대로 통과. 「U6 표가 아직 없으면」 시험은 건너뜀으로 나옴 | 실패 |
| `result-application-b` | 마이그레이션 전체 왕복 | 표 개수가 가져온 뒤의 최신 값 + 4(지금이면 30개), U6 되돌리기로 넷만 사라짐 | 목록·개수 불일치 |
| web `u6-claude-authorize` | S21 동의, 재승인, 호스트 표시, `clientName` 없음, 요청 중 버튼, 승인·취소 뒤 `redirectTo`로만 이동, `MCP_CONSENT_REQUIRED`, 그 밖의 오류, 잘못된 쿼리, http(s) 아닌 `redirectTo` | 안내 문구와 호스트가 보임. 오류는 alert이고 이동 없음. 자동 재전송 없음 | 쿼리 주소로 이동, 이름 표시, 실패를 성공으로 보임 |
| web `u6-claude-connection` | S21 상태 셋, 복사 주소(복사 실패 포함), 해제 확인·성공·실패, 조회 실패 | `mcpUrl`을 그대로 보임. 조회 실패를 `NONE`으로 보이지 않음 | web이 만든 주소, 실패를 성공으로 보임 |
| web `u2-start-guide`(고침) | S21 시작 안내 링크 | `publish-claude`가 `/profile/claude` | 다른 주소 |

S22~S24는 담당이 실제 Claude로 하며 이 묶음에서 돌지 않는다. 합성 시험 통과를 실제 연결 성공으로 적지 않는다.

## 대역(모의) 사용

- **합성 Claude:** `support.cjs`가 SDK `client/auth.js`와 `Client`로 찾기·등록·승인 시작·토큰 교환·도구 호출을 부른다. 거부 경우는 같은 요청을 `fetch`로 보낸다. 실제 Claude 동작의 증거로 보고하지 않는다.
- **앱:** 실제 `AppModule`, `configureApp`, 전역 Guard, 오류 필터를 쓴다. 비어 있는 포트를 먼저 정해 `PORT`로 넘겨 공개 주소가 실제 시험 서버를 가리키게 한다(기본값 `http://127.0.0.1:{PORT}` 경로). 회원은 개발 로그인으로 만든 실제 세션이다(`test/u2/support.cjs`의 도우미와 같은 방식).
- **DB:** 대역 없이 실제 테스트 DB를 쓴다. 만료는 `expires_at`이 지난 행을 직접 넣어 만들고 시계를 바꿔 끼우지 않는다. DB 실패는 `app.get(...)`으로 얻은 저장 단계·자료 읽개의 연결 자리에 실패하는 시험용 연결을 넣는다.
- **겹침(S17):** 다른 연결에서 회원 행을 `FOR UPDATE`로 잡아 실제 교환을 연결 쓰기에서 멈춘다. 교환이 코드 행을 잡은 상태에서 해제를 보내고, `pg_stat_activity`로 대기를 확인한 뒤 풀어 둘 다 끝낸다.
- **Redis:** `CATCHU_TEST_REDIS_URL`이 있을 때 실제로 돌고, 없으면 그 시험만 건너뛰며 통과가 아니라 미실행으로 적는다. 끊김은 닫힌 포트, 멈춤은 받기만 하고 답하지 않는 시험용 TCP 서버다. 다음 창은 셈 함수에 넘기는 시각으로 만든다. 큐 키와 섞이지 않게 시험마다 다른 접두사를 쓴다.
- **로그:** `test/u2/support.cjs`의 `collectingLogger`로 모아 칸 이름과 값을 보고, 합성 토큰·코드·해시·`state`·자료 글을 문자열로 찾는다.
- **web:** `api.member` 자리에 기록용 함수를 넘겨 경로·본문을 보고, 이동은 기록용 `navigate`를 넘긴다. 복사는 기록용 `copy`를 넘긴다.

## 시험 자료

- 테스트 DB는 각 시험 앞에서 `resetTestDatabase`로 비운다(`test/support/test-database.cjs`).
- 회원 A·B를 만든다. A는 공개·비공개 Catch(설명 있음과 없음, `title`이 null인 것, `draft_content`가 있는 것, 근거 2개)와 텍스트 자료, 40,000자를 넘는 텍스트 자료와 Catch를 갖는다. B는 다른 글의 Catch·텍스트 자료를 갖는다. 모두 공개 가능한 합성 글이다.
- `mcp_client` 행은 시험 자료로 직접 넣는다. `/register`는 시간당 20회 제한(BR2.5)이 앱 하나에 걸리므로 등록 자체를 보는 경우에만 부르고, 21번째 시험은 그 파일 맨 뒤나 새 앱에서 한다.
- 토큰·코드는 시험마다 실제 흐름이나 `randomBytes`로 만들고, 합성 값이라도 시험 출력에 그대로 찍지 않는다.
