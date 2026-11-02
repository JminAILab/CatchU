# U6 Claude MCP 본인 연결 — 코드 생성 요약

## Sources

작성일: 2026-11-02. 입력: [코드 생성 계획](code-generation-plan.md)(승인, Testing Contract `sha256:19386d629b3092339d296f2cdf4cb18982564dbd19832a03198ee5687fbc32b6`), [단위 시험 안내](unit-test-instructions.md), [기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md)·[엔티티](../functional-design/entities.md), [비기능 설계](../nfr-design/)와 [비기능 요구사항](../nfr-requirements/), [계약 요약](../../../inception/contract-design/contract-summary.md) C-06·C-13·C-14·C-15, 그리고 [#447](https://github.com/JminAILab/CatchU/pull/447)로 통합 브랜치에 합쳐진 C-15 수정(`48d206a`). 기준 코드: 통합 브랜치 `intent/260925-intent-12`의 `e20241a`를 받은 로컬 `fadedc0`와 이 작업의 미커밋 변경. 커밋·푸시·PR은 하지 않았다.

## 결과 요약

- 계획 Step 1~14를 끝냈다. Step 15의 컨테이너 삭제는 리뷰가 시험을 돌린 뒤인 승인 뒤에 한다(아래 「떠 있는 컨테이너」).
- U6 시험은 api 119개와 web 29개이고 모두 통과했다. 줄 커버리지는 api 99.10%, web 85.66%로 80% 이상이다. **모두 합성 연결이고 실제 Claude 연결(S22~S24)은 돌리지 않았다.**
- api 전체 시험은 **실패 5건으로 종료 코드 1이다.** 5건 모두 U6 코드에 닿기 전에 환경 문제로 멈췄다. 그중 U7 체인 시험 4건은 이 PC에 worker 환경이 없어, U6과 함께 통과하는지 **확인하지 못했다.**

## 만든·고친 파일

전체 목록은 [source-manifest.json](source-manifest.json)에 있다(62개). 지운 파일은 없다.

| 위치 | 파일 | 내용 |
|---|---|---|
| `api/src/claude-mcp/` | `mcp-config.ts`, `mcp-limits.ts`, `mcp-log.ts` | 설정 읽기와 공개 주소 판정, 고정 값, 로그 사건 타입 |
| | `mcp-client.entity.ts`, `mcp-connection.entity.ts`, `mcp-authorization-code.entity.ts`, `mcp-access-token.entity.ts` | 표 넷 |
| | `mcp-oauth.provider.ts` | SDK `OAuthServerProvider` 저장 단계. `revokeToken` 없음 |
| | `mcp.controller.ts` | `/v1/mcp`(POST, GET·DELETE는 405) |
| | `mcp-tools.ts`, `mcp-material-reader.ts`, `mcp-page.ts` | 조회 도구 둘, 회원 조건 SQL, 쪽 만들기와 `cursor` |
| | `mcp-rate-limiter.ts` | 회원당 분당 60회(Redis 전용 연결) |
| | `mcp-connection.service.ts`, `mcp-connection.controller.ts`, `mcp-authorization.dto.ts` | 연결 상태·승인·전체 해제 |
| | `claude-mcp.module.ts`, `sdk-globals.d.ts` | 모듈과 SDK 라우터 등록, SDK 타입 파일이 쓰는 이름 하나 |
| `api/src/` | `app.module.ts`, `common/errors/error-codes.ts`, `database/migrations/1793588083309-CreateMcpTables.ts` | 등록 한 줄, 새 오류 코드 둘, 표 넷 |
| `api/` | `package.json`, `package-lock.json`, `.env.example`, `README.md`, `CONVENTIONS.md`, `docs/claude-mcp.md`(새), `docs/environment.md`, `docs/member-withdrawal-deletion.md` | 의존성, 새 선택 설정 셋, 문서 |
| `api/test/` | `claude-mcp/support.cjs`, `claude-mcp/*.test.cjs` 10개(새), `db/member-cascade-delete.test.cjs`, `integration/result-application-b.test.cjs`, `u2/withdrawal.test.cjs` | U6 시험과 기존 시험 맞추기 |
| `web/src/` | `features/claude-connection/`(새 8개), `app/(member)/profile/claude/page.tsx`, `.../authorize/page.tsx`, `lib/routes.ts`, `features/profile/profile-detail.tsx`, `features/start-guide/member-start-steps.ts`, `features/start-guide/README.md` | 승인 화면, 연결 관리 화면, 진입 링크 |
| `web/` | `README.md`, `test/u6-claude-authorize.test.mjs`, `test/u6-claude-connection.test.mjs`, `test/u6-harness.mjs`, `test/u2-start-guide.test.mjs` | 문서와 시험 |

## 주요 결정

- **OAuth 규칙은 SDK에 맡긴다(ADR-009).** `mcpAuthRouter`·`requireBearerAuth`를 쓰고 `McpOAuthProvider`는 표 읽기·쓰기와 업무 규칙의 거부만 한다. `revokeToken`이 없어 `/revoke`가 생기지 않는다.
- **토큰 상태 실패 넷은 고정 문구 하나다.** 없는 토큰·만료·해제·회원 상태 실패는 상태, `WWW-Authenticate`, 본문이 글자까지 같다. 이 문구는 헤더에 들어가 비ASCII면 헤더 설정이 실패하므로 영어로 두었고, 도구 오류 문구는 사람이 읽으므로 한국어로 두었다.
- **코드 소비는 조건부 UPDATE이고 교환 전체가 READ COMMITTED 트랜잭션 하나다.** 거부는 트랜잭션 안에서 던져 되돌리고 로그는 되돌린 뒤 남긴다. 교환과 해제의 겹침은 실제 DB에서 잠금 대기 2개를 `pg_stat_activity`로 확인한 뒤 풀어, 토큰·연결이 남지 않음을 시험으로 봤다.
- **돌아갈 주소의 포트까지 비교하는 곳은 승인 요청이다.** SDK `/authorize`는 loopback 주소끼리면 포트를 무시한다. 승인 요청은 그 등록의 목록과 지금의 허용 목록 모두에 정확히 있어야 받는다.
- **조회 SQL은 `$n` 매개변수를 쓰는 정적 문장뿐이다.** 첫 조건은 언제나 토큰의 회원이고 `draft_content`와 PDF 표는 SQL에 없다.
- **로그는 사건별 칸만 가진 union 타입이다.** 토큰·코드·해시·`state`·자료 글·`cursor`·회원 ID가 들어갈 자리가 없다.
- **web은 판정(`claude-connection.ts`), 상태 없는 표시(`*-view.tsx`), 요청·이동(`*-screen.tsx`·`*-panel.tsx`)으로 나눴다.** 이동은 api 응답의 `redirectTo`로만 한다.
- **구현 중 정한 해석.** 기능 명세가 값까지 정하지 않아 아래처럼 정했다.
  - 교환 때 `redirect_uri`가 없으면 저장된 주소와 같지 않은 경우로 보고 `invalid_grant`다.
  - 그 회원의 연결 행이 여럿이면 기존 동의 시각은 `min(consented_at)`이다.
  - `mcp_token_exchange_refused`의 `reason` 값은 `code_missing`, `code_expired`, `code_used`, `redirect_uri`, `client`, `resource`다.
  - 승인 화면에서 상태 조회가 실패하면 조회 실패 안내만 보이고 승인·취소 버튼을 두지 않는다. 동의 여부를 모른 채 안내를 고르지 않기 위해서다.
  - 전체 해제 버튼은 상태와 상관없이 둔다. `NONE`이어도 교환하지 않은 코드를 지울 수 있고 반복해도 204다(BR7.2).

## 의존성과 타입 확인

| 패키지 | 판본 | 위치 |
|---|---|---|
| `@modelcontextprotocol/sdk` | 1.32.2 | dependencies |
| `zod` | 4.6.7 | dependencies |
| `@types/express` | 5.0.6 | devDependencies(계획의 조건부 항목이 실제로 필요했다) |

- **타입 확인:** express 타입 오류 8건은 `@types/express`로 풀렸다. 그 뒤 남은 `TS2304 HeadersInit`(SDK `dist/esm/shared/transport.d.ts`)은 담당이 고른 안대로 `api/src/claude-mcp/sdk-globals.d.ts`로 풀었다. 서버 코드에 DOM 전역을 들이지 않고 라이브러리 타입 검사를 끄지 않는 가장 좁은 해결이고, `@types/node`가 같은 이름을 더하면 지운다. `tsconfig.json`·`tsconfig.build.json`·`eslint.config.mjs`는 고치지 않았다.
- **개발 기동:** `test/runtime/bootstrap.test.cjs`의 「개발 소스 main」(`-r ts-node/register src/main.ts`)이 통과했다.
- **잠금 파일:** `node_modules/express`는 5.2.1 한 벌, `zod`는 4.6.7 한 벌이다.
- **의존성 취약점:** `bash .github/scripts/check-deps-audit.sh api`는 이 PC에 `jq`가 없어 **실행하지 못했다.** 계획대로 같은 스크립트가 쓰는 `npm audit --package-lock-only --include=dev`로 봤다. moderate 11, high 0, critical 0이고, 11건 모두 eslint·typescript-eslint 개발 도구 경로의 `minimatch` 권고다. U6이 더한 의존성 경로에는 없다. 스크립트의 실패 기준은 high 이상이다.

## 시험 결과와 커버리지

모두 저장소 맨 위에서 [단위 시험 안내](unit-test-instructions.md)의 명령 그대로 돌렸다. api는 마지막 수정 뒤에 다시 돌린 값이고, web은 그 수정(`api/`만 고침) 앞에 돌린 값이다.

| 명령 | 결과 | 수 |
|---|---|---|
| api U6 시험 전부(고친 시험 3개 포함) | 통과 | 150: 통과 149, 실패 0, 건너뜀 1(「U6 표가 아직 없으면」) |
| api U6 줄 커버리지 | 통과 | 119: 통과 119, 건너뜀 0 |
| web U6 + 시작 안내 | 통과 | 32: 통과 32, 건너뜀 0 |
| web U6 줄 커버리지 | 통과 | 29: 통과 29, 건너뜀 0 |
| `npm --prefix api run lint` | 통과 | |
| `npm --prefix api run typecheck` | 통과 | |
| `(cd web && npm run check)` | 통과 | lint·typecheck, 시험 817개 통과, build, 스모크 |
| 작업 전용 DB에서 `migration:revert` → `migration:run` → `migration:generate … --check` | 통과 | 차이 없음. `result-application-b`도 격리 스키마에서 표 27→31과 U6 되돌리기를 본다 |
| api 전체 `npm --prefix api test` | **실패 5건, 종료 코드 1** | 아래 표 |

| 파일 | 시험 수 | | 파일 | 시험 수 |
|---|---|---|---|---|
| `mcp-config` | 10 | | `mcp-tools` | 10 |
| `mcp-page` | 10 | | `mcp-connection` | 21 |
| `mcp-rate-limit` | 12 | | `mcp-withdrawal` | 5 |
| `mcp-oauth-register` | 15 | | `mcp-logs` | 5 |
| `mcp-oauth-token` | 17 | | web `u6-claude-authorize` | 18 |
| `mcp-endpoint` | 14 | | web `u6-claude-connection` | 11 |

**커버리지(표 맨 아래 값).**

- api `dist/claude-mcp/**`: **줄 99.10%**, 분기 90.14%, 함수 100%. 17개 파일이 모두 표에 있어 불러오지 않은 파일이 없다. `sdk-globals.d.ts`는 타입뿐이라 출력이 없다.
- web `src/features/claude-connection/**`: **줄 85.66%**, 분기 99.36%, 함수 97.56%. 불러오지 않은 파일이 없다. 파일별로 `claude-connection.ts`·`use-connection-lookup.ts`·`claude-authorize-screen.tsx`·`claude-connection-panel.tsx`는 100%, `claude-connection-view.tsx` 89.23%, `claude-authorize-view.tsx` 84.44%, `claude-connection.module.css` 20.99%다. css는 시험이 대역으로 불러오면서 표에 들어가 평균을 낮춘다. `.tsx`의 빠진 줄 번호는 변환 결과라 원본과 다를 수 있다.
- `web/src/app/(member)/profile/claude/**`의 페이지 두 파일은 한 줄 조립이고 시험 안내대로 범위 밖이다.

**api 전체 시험.**

| 줄 | 시험 | 통과 | 실패 | 건너뜀 |
|---|---|---|---|---|
| 사전(`build-output`) | 1 | 1 | 0 | 0 |
| 둘째 줄(대기) | 35 | 35 | 0 | 0 |
| 첫째 줄 | 1697 | 1689 | 5 | 3 |
| **합계** | **1733** | **1725** | **5** | **3** |

| 실패한 시험 | 멈춘 자리 | 분류 |
|---|---|---|
| `test/integration/u7-analysis-chain.test.cjs` I4·I5·I6·I8 | 65행 `assert.ok(existsSync(PYTHON), …)`. `worker/.venv`가 이 PC에 없다 | 러너 표시는 실패, 실질은 실행하지 못함 |
| `test/u2/file-storage.test.cjs`의 U2 S22(U6 S22와 다른 번호) | 108행 `symlink`의 Windows `EPERM` | 환경 실패. 심볼릭 링크 단언은 돌지 않았다 |

이 두 시험 파일과 `api/src/file-storage`는 `git diff`에 없다. 건너뜀 3건은 실제 Claude 인용 호출 S8(`CATCHU_GENERATION_API_KEY` 없음), 실제 Voyage S12(`CATCHU_EMBEDDING_API_KEY` 없음), 「U6 표가 아직 없으면」이다. U6의 기동 로그나 표 목록 때문에 깨진 기존 시험은 없다.

**실제 응답 헤더(NFR1.8).** 단위 시험은 `next.config`의 헤더 규칙을 본다. 실제 응답은 빌드한 web을 빈 포트 3411에 띄워 한 번 확인하고 그 프로세스만 끝냈다. `/profile/claude`와 `/profile/claude/authorize` 모두 200이고, CSP는 `frame-ancestors 'none'`으로 끝나며 `Referrer-Policy`는 `strict-origin-when-cross-origin`이다.

**합성과 실제의 구분.**

- 실제로 쓴 것: PostgreSQL(작업 전용 컨테이너), Valkey(작업 전용 컨테이너), 127.0.0.1의 HTTP, 실제 `AppModule`·전역 Guard·오류 필터.
- 합성·대역: 합성 Claude(SDK `client/auth.js`와 `Client`로 된 시험 도우미), DB 실패(실패하는 연결), Redis 끊김(닫힌 포트)·멈춤(답하지 않는 TCP 서버), web의 `fetch`·이동·클립보드(기록용).
- **확인하지 않은 것:** 실제 Claude 연결, 실제 브라우저에서의 화면·CSS 배치, web과 api를 실제로 이은 흐름.

## 보안 점검 거부 사례와 결과

[보안 점검](../../../../../../../../docs/CatchU_security_checks.md)의 거부 사례는 모두 시험으로 돌렸고 통과했다.

| 사례 | 파일 | 시험 |
|---|---|---|
| 두 회원: 남의 자료 | `mcp-tools` | S12 B 토큰과 A의 `cursor`로 읽어도 B의 행만 나온다(Catch·텍스트 자료) |
| 두 회원: 남의 연결 | `mcp-connection` | S17 B의 해제는 A의 연결·토큰·코드를 바꾸지 않고 A의 토큰은 그대로 통과한다 |
| 두 회원: 본문으로 회원 바꾸기 | `mcp-connection` | S6 정의하지 않은 필드와 틀린 형식은 400 `VALIDATION_FAILED`이고 회원을 본문으로 바꿀 수 없다 |
| 두 회원: 탈퇴·정리 | `mcp-withdrawal`, `mcp-oauth-token` | S19 한 회원의 탈퇴는 다른 회원의 행을 지우지 않는다. S8 만료 행 정리도 그 회원 것만 지운다 |
| 잘못된 입력: `cursor` | `mcp-tools`, `mcp-page` | S12 잘못된 `cursor`는 `INVALID_CURSOR`이고 DB를 읽지 않으며 값을 응답에 옮기지 않는다. 형식 틀림·없는 날짜 모두 거부한다 |
| 잘못된 입력: 도구 인자 | `mcp-tools` | S12 추가 입력과 틀린 형식은 입력 오류이고 입력 이름·값을 돌려주지 않는다 |
| 잘못된 입력: 승인 요청 | `mcp-connection` | S6 클라이언트·돌아갈 주소·`resource`가 틀리면 승인·취소 모두 400 `MCP_AUTHORIZATION_INVALID`이고 코드가 나가지 않는다 |
| 잘못된 입력: 등록·승인 시작 | `mcp-oauth-register` | S3 돌아갈 주소·이름 거부, S5 없는 클라이언트·등록에 없는 주소·S256 아닌 PKCE·다른 `resource`·포트만 다른 loopback |
| 잘못된 입력: NUL 문자 | `mcp-oauth-register`, `mcp-oauth-token`, `mcp-connection` | `client_id`·`client_name`·승인 칸의 NUL은 DB 오류가 아니라 4xx이고 `mcp_oauth_failed`를 남기지 않는다 |
| 잘못된 입력: 전송 형식 | `mcp-endpoint` | Accept가 맞지 않으면 406, JSON이 아니면 415, 100KB를 넘으면 400 |
| 잘못된 입력: web | `u6-claude-authorize` | 필수 값이 없거나 돌아갈 주소가 http(s)가 아니면 버튼이 없다. `redirectTo`가 http(s)일 때만 이동한다 |
| 틀린 토큰·코드(U6에 비밀번호는 없다) | `mcp-endpoint` | S9 토큰 상태 넷이 글자까지 같다. 헤더 없음·형식 틀림·쿼리 토큰도 401이다. NFR1.2 회원 토큰과 MCP 토큰은 서로의 경로에서 401이다 |
| 틀린 토큰·코드 | `mcp-oauth-token` | S7 없는 코드, 두 번 쓴 코드, 5분 지난 코드, 틀린 PKCE는 `invalid_grant`이고 틀린 PKCE는 코드를 소비하지 않는다 |
| 꺼진 개발용 기능 | `mcp-config`, `mcp-oauth-register` | S2 운영에 개발용 값이 있으면 기동을 멈추고 오류에는 설정 이름만 있다. 운영은 `127.0.0.1` 기본값을 쓰지 않는다. S3 개발 목록 주소는 운영 설정의 저장 단계가 거부한다 |
| 다른 출처 | `mcp-endpoint`, `mcp-connection` | NFR1.6 다른 `Origin`은 토큰 유무·메서드와 상관없이 403이다. NFR1.7 승인·해제는 허용 출처가 아니면 403이고 행이 바뀌지 않는다 |
| 로그·오류 응답 | `mcp-logs` | S20 합성 Claude 전체 흐름: 정상 호출에는 U6 로그가 없고, 거부를 섞어도 로그·오류 응답에 코드·토큰·해시·`state`·자료 글이 없다 |

## 시나리오와 시험 파일

| 시나리오 | 파일 |
|---|---|
| S1 | `mcp-oauth-register`, `mcp-endpoint` |
| S2 | `mcp-config` |
| S3·S4·S5 | `mcp-oauth-register` |
| S6·S17·S18 | `mcp-connection` |
| S7·S8 | `mcp-oauth-token` |
| S9·S13 | `mcp-endpoint` |
| S10·S11·S12 | `mcp-tools` |
| S14·S15 | `mcp-page`, `mcp-tools` |
| S16 | `mcp-rate-limit` |
| S19 | `mcp-withdrawal`, `member-cascade-delete`, U2 `withdrawal` |
| S20 | `mcp-logs` |
| S21 | web `u6-claude-authorize`, `u6-claude-connection`, `u2-start-guide` |
| S22·S23·S24 | 미실행(아래) |

S5의 S256 아닌 PKCE와 다른 `resource`는 기능 명세대로 승인 화면으로 넘어가지 않는다. SDK는 이 경우 등록으로 확인된 주소로 `error=invalid_request`를 돌려보내고 코드는 없다. 시험 안내 표의 「나머지는 오류이고 그 주소로 보내지 않음」은 확인되지 않은 주소에 해당한다고 읽었다.

## 실행하지 않은 시험과 이유

- **S22·S23·S24(미실행):** 실제 Claude 웹·Desktop과 다른 계정이 필요하고 담당이 한다. S1~S21 통과는 실제 연결 성공이 아니다. S22의 첫 연결이 '최소 연결 첫 결과'이고 결과는 `docs/CatchU_통합확인.md`에 남긴다.
- **U7 체인 I4·I5·I6·I8(실행하지 못함):** 이 PC에 `worker/.venv`와 `uv`가 없다. U6과 함께 통과하는지 확인하지 못했다. CI api job이나 worker 환경에서 확인해야 한다.
- **U2 `file-storage` S22의 심볼릭 링크 단언(실행하지 못함):** Windows 권한으로 도달하지 못했다.
- **실제 Claude API·Voyage 시험(건너뜀):** 키가 없다. 기존 동작이다.
- **`check-deps-audit.sh`(실행하지 못함):** `jq`가 없다. 위 대체 확인을 적었다.
- **브라우저에서의 화면·CSS 배치(하지 않음):** web 시험은 문구·구조만 본다.

## 계획과 다른 점

| 항목 | 내용과 이유 |
|---|---|
| `api/src/claude-mcp/sdk-globals.d.ts` | 「파일 배치」에 없다. 담당이 고른 안이다 |
| 시험 안내 한 줄 | Git Bash에서 `--tmpfs` 경로가 바뀌어 DB 명령이 실패한다는 줄을 더했다. 담당이 정했다 |
| 로그 사건 `mcp_transport_close_failed` | 관측 설계는 8종이다. 설계 의사 코드의 `transport.close(); server.close();`는 거부가 처리되지 않으면 프로세스를 멈출 수 있어, 잡아서 오류 이름만 남기는 9번째 사건을 더했다(error, 칸 `error`). `api/docs/claude-mcp.md` 표에 있다 |
| NUL 문자 거부 | 계획에 없던 입력 거부다. 결과 확인 중 `client_id`·`client_name`·승인 칸의 NUL이 DB 오류로 500과 오류 로그가 되는 것을 찾았다. 인증 없이도 부를 수 있고 BR3.1의 「없는 클라이언트」와 어긋나므로 고쳤다. `catchIdInput`의 기존 NUL 거부와 같은 방식이고, 저장 단계 두 곳과 DTO `@Matches` 셋, 시험 네 자리를 더했다 |
| 조회 SQL | 설계의 `[AND …]` 선택 조건 대신 `($2 IS NULL OR …)`인 정적 문장 하나다. 문자열을 잇지 않기 위함이고 뜻은 같다. 같은 모양이 `analysis-request.dispatcher.ts`에도 있다 |
| 마이그레이션 `down` | 생성물의 `"public".` 접두사를 손으로 지웠다. 다른 마이그레이션과 같게 해서 격리 스키마 되돌리기가 public을 건드리지 않게 했다 |
| `use-connection-lookup.ts`, `web/test/u6-harness.mjs` | 목록에 없다. 두 화면의 같은 조회 hook과 시험 hook 구동을 한곳에 뒀다 |
| `web/src/features/start-guide/README.md` | Touches에 없다. 고친 링크를 설명하는 같은 문장이라 함께 고쳤다 |
| `member-cascade-delete.test.cjs`의 `SHARED_TABLES`, `member-withdrawal-deletion.md`의 문장 | `mcp_client`를 시험 자료에 넣으니 표 목록에 설명이 필요했다. 회원을 가리키지 않아 탈퇴 뒤에도 남는다는 C-06 설계를 드러낸다 |
| 표 개수 | 계획의 예시 26→30이 아니라 가져온 뒤 최신 값으로 27→31이고, U6 되돌리기 뒤 27이다. 계획의 규칙("최신 값 + 4")대로다 |
| 시험 수 | 계획 약 80개, 실제 148개(api 119, web 29)다. 시나리오·거부 사례를 시험 이름으로 남긴 결과이고, 파일당 5~8개를 넘는 파일이 있다 |
| NFR1.8 시험 | 단위 시험은 헤더 규칙을 보고 실제 응답은 수동으로 한 번 확인했다. 시험 묶음에서 빌드된 서버 응답을 볼 수 없다 |
| 컨테이너 생성 시점 | 타입 확인과 함께 돌리느라 Step 2보다 먼저 만들었다. 이름과 포트는 시험 안내와 같다 |

C-15 수정은 계획대로 합의돼 [#447](https://github.com/JminAILab/CatchU/pull/447)로 합쳐졌고(`48d206a`) 코드 모양과 같다. 팀장 리뷰는 `title: string|null`, `INVALID_CURSOR`·`INTERNAL_ERROR`, `omitted`·`bodyOmitted` 모두에 동의했다. 이 폴더의 `contract-summary.md`에는 가져오기 전이라 아직 없고, 고치지 않았다.

## U2 파일을 고친 줄과 이유

Unit PR 본문에 옮겨 U2 담당인 팀장의 확인을 받는다.

- **`api/test/u2/withdrawal.test.cjs`:** 3~4행 머리말과 26~27행 주석을 실제 표를 쓴다는 내용으로 고쳤다. `INSERT INTO ${table} VALUES ($1, $2)` 반복을 `mcp_client`·`mcp_connection`·`mcp_authorization_code`·`mcp_access_token`에 실제 모양으로 넣는 `db.query` 네 번(127~136행)으로 바꿨다. 이유: 표가 들어오면 옛 줄이 실패하고, 머리말의 U2 완료 조건이 "U6를 합친 뒤 실제 표로 이 시험을 다시 돌리는 것"이다. 시험용 표 코드와 「U6 표가 아직 없으면」 시험은 고치지 않았다.
- **`web/test/u2-start-guide.test.mjs`:** 16행 허용 목록에 `routes.profileClaude`를 더하고, 19~20행에 `publish-claude`의 주소를 보는 주석과 단언을 더했다.
- **`web/src/features/start-guide/member-start-steps.ts`:** 4~5행 머리말을 고치고, 22행 `publish-claude`의 링크를 `{ label: "공유 링크", href: routes.links }`에서 `{ label: "Claude 연결", href: routes.profileClaude }`로 바꿨다. 제목은 그대로다. 이유: 그 파일 머리말의 "그 Unit이 전용 화면을 더하면 그 주소로 바꾼다"다(BR7.5).
- **`web/src/features/start-guide/README.md`:** 같은 링크를 설명하는 한 문장을 고쳤다.
- **실제 표로 돈 탈퇴 시험:** U2 S24·S25·S26·S27이 모두 통과했다. 「U6 표가 아직 없으면 1단계는 MCP 표를 건너뛰며 탈퇴는 끝난다」는 건너뜀으로 나오고 사유는 `U6 실제 표가 있어 "표 없음" 경우를 만들 수 없다`이다.

## 남은 위험과 미결

- **Claude 요청의 `Origin`:** 값이 있으면 `/v1/mcp`가 전부 403이 된다. S22 첫 연결에서 바로 드러나며 그때 허용 값을 더한다(NFR1.6).
- **남이 시작한 연결(S24):** 승인 화면은 구별하지 못하고 막는 장치는 안내 문구뿐이다. 팀원의 Claude가 시험 회원의 자료를 읽게 되면 막을 방법을 다시 정한다. 협조할 팀원 계정을 Unit 제출 전까지 맞춘다.
- **U4 상한:** 글을 뺀 항목도 `title`과 근거 주소를 남겨 제목이 상한에 가까우면 쪽이 40,000자를 넘을 수 있다. U4 상한이 정해지면 최악의 메모리와 함께 다시 본다.
- **U7 체인 넷:** Build and Test에서 worker 환경을 만들지 CI 결과로 볼지 정해야 한다.
- **세 번째 Redis 연결 오류 함수:** `McpRateLimiter.watch`가 `AiRun.watch`, U5 `api/src/rag-answer/question-counter.ts`에 이어 같은 모양의 세 번째다. Unit 밖 코드라 합치지 않았고 Unit PR 본문에 적어 팀장 판단에 맡긴다.
- **U2 문서:** `api/docs/withdrawal.md` 28행의 "`mcp_*` 표가 통합 브랜치에 아직 없으면…"은 U6이 합쳐지면 낡는다. U2 문서라 고치지 않았고 Unit PR 본문에 적는다.
- **빈도 제한 꺼짐:** 큐 주소가 없는 환경(개발 서버, 큐를 켜기 전의 EKS)에서 꺼진다. 받아들인 한계로 `api/docs/claude-mcp.md`에 적었다.
- **`MCP_ACCESS_TOKEN_TTL_SECONDS`:** 팀장에게 요청하는 일은 계획대로 S22 직전에 남아 있다.
- **첫 실제 연결에서 볼 것:** 큰 쪽의 동작, 도구 오류 표시, 긴 `state`의 복귀, 갱신 토큰 없는 만료 표시는 `api/docs/claude-mcp.md` 「첫 실제 연결에서 볼 것」에 있다.

## 떠 있는 컨테이너

`catchu-u6-db-test`(127.0.0.1:55436), `catchu-u6-redis-test`(127.0.0.1:56379)는 리뷰가 시험을 돌리므로 남겨 두고, 코드 생성 승인 뒤에 이름을 하나씩 지정해 지운다. 다른 컨테이너는 건드리지 않았다.
