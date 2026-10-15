# 실제 GitHub 계정 연결과 자격정보 제공 — #231

[실제 GitHub 연동 이슈](https://github.com/JminAILab/CatchU/issues/231)의 계정 연결·해제·상태와 내부 자격정보 제공을 구현한다. 기존 회원·프로필·GitHubConnection과 공통 Guard·오류 필터·no-store를 재사용한다. Google 로그인·CatchU 세션·웹 화면·worker 내부 조회 API는 추가하지 않는다.

## 선택한 방식과 이번 수명 결정

추가 scope 없는 GitHub OAuth App의 Authorization Code + S256 PKCE 방식을 사용한다. [공식 권한 안내](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps#available-scopes)상 scope 없음은 공개 계정·저장소 읽기를 허용한다. public_repo는 쓰기 권한도 포함하므로 요청하지 않는다. scope 생략 시 과거 승인한 넓은 권한이 돌아올 수 있어 교환 응답의 scope와 /user 응답의 X-OAuth-Scopes가 모두 빈 문자열인지 검사한다. 누락·추가 권한이면 연결을 성공 처리하지 않는다.

**2026-10-08 이번 작업 대화에서 확인한 방향:** 앱 설정에서 만료형 토큰을 사용하고 발급 응답의 expires_in으로 실제 만료 시각을 계산한다. 1시간·8시간을 코드에 고정하지 않으며 별도 CatchU 제공 기간을 추가하지 않는다. 요청 시작 시각 + expires_in초로 계산해 교환 대기 시간만큼 수명을 과대평가하지 않는다. expires_in 누락·문자열·0·음수·소수·범위 초과와 확인 도중 만료는 연결 실패다. 이 결정 자체를 공식 계약 승인이나 실제 앱 검증 기록으로 대신하지 않는다. [작업 결정 기록](https://github.com/JminAILab/CatchU/issues/231#issuecomment-6051068186)과 [GitHub 만료형 토큰 설정·응답](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#expiring-access-tokens)을 함께 본다.

자동 갱신은 제외한다. 함께 발급된 refresh_token은 보관·전달·로그에 넣지 않는다. 만료를 확인하면 REAUTH_REQUIRED로 전환하고 자격정보 제공을 중단한다. 회원은 GitHub 연결을 다시 진행해야 한다. 이는 CatchU Access JWT 만료와 다른 상태이며 프로필 조회·CatchU 로그인 자체를 종료하지 않는다. REAUTH_REQUIRED에는 최근 연결 계정명이 남지만 자격정보 참조는 제거한다.

## 인증된 회원의 API

아래 경로는 [API 명세의 회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#m--회원-api)에 반영했으며 명세가 정본이다. 사용자 입력 memberId를 받지 않고 Guard가 확인한 현재 회원 UUID만 사용한다.

| 경로 | 입력 / 성공 200 | 거부 |
|---|---|---|
| POST /v1/me/github/authorization | 본문 없음 또는 {}; authorizationUrl·state·expiresAt(이 값은 인증 절차 state의 수명) | 기능 비활성 403 GITHUB_CONNECTION_REQUIRED |
| POST /v1/me/github/connection | code·state 문자열; state CONNECTED·accountLogin | 형식·추가 필드 400 VALIDATION_FAILED, 인증 절차/권한/발급 응답 불일치 400 INVALID_REQUEST |
| DELETE /v1/me/github/connection | 본문 없음 또는 {}; state DISCONNECTED·accountLogin null | DB·보관 정리 실패 500 INTERNAL_ERROR |
| GET /v1/me | 기존 회원·프로필·github 상태 응답 유지 | 실제 보관 토큰 만료·파일 누락·인증 복호화 실패 확인 시 해당 연결만 REAUTH_REQUIRED로 갱신 |

공통 토큰 없음·변조·만료는 기존 401 인증 오류다. 없는·비활성 회원은 404 RESOURCE_UNAVAILABLE다. 파일 누락(ENOENT)·인증 복호화 실패(키 불일치·암호문 변조)는 해당 GitHub 연결을 REAUTH_REQUIRED로 전환하고 자격정보 참조를 제거한다. 유효한 CatchU 인증의 GET /v1/me는 200과 회원·프로필을 유지하고 resolveCredential은 null로 제공을 중단한다. 최근 연결 계정명은 유지한다.

위 이용 불가 판정은 다른 장애와 구분한다. 파일 권한·I/O 오류·알 수 없는 예외, 잘못된 보관 형식·다른 회원의 보관 참조, DB 조회·상태 전환 실패와 GitHub 통신·서버 장애는 500 INTERNAL_ERROR이며 연결 없음으로 숨기지 않는다. GitHub의 rate limit·일시 오류를 토큰 폐기로 바꾸지 않는다. DB 상태 전환은 기존 참조·CONNECTED를 조건으로 처리해 늦은 파일 누락 판단이 새 연결을 폐기하지 않게 한다. 폐기 커밋 후 파일 정리 실패는 기존처럼 오류이며 DB의 제공 중단은 유지된다. 실패 응답에는 토큰·외부 오류 원문·파일 경로를 포함하지 않는다. 성공·오류 모두 no-store다.

state는 회원별 무작위 값이며 10분 동안 한 번만 쓸 수 있다. 새 인증 URL은 이전 state를 대체한다. PKCE verifier는 서버에서만 보관한다. 실패 후에는 새 URL을 발급받는다. 브라우저 콜백에서 CatchU 인증을 유지한 채 받은 code·state를 완료 API로 보낸다. 연결 취소 시 완료 API를 호출하지 않으며 기존 연결을 보존한다. 최신 state·해제와 충돌하는 늦은 OAuth 응답은 연결을 덮어쓰지 않는다.

**배포 경계:** state·PKCE는 API 프로세스 메모리에만 있으므로 재시작 시 새 인증 URL이 필요하다. 시작·완료는 같은 API 인스턴스로 라우팅해야 한다. 여러 인스턴스에 분산하려면 공유 일회용 state 저장소를 먼저 연결해야 한다. 1,000개 상한·만료 정리는 인증 절차의 메모리 보호이며 제품 분석 동시 수와 관계없다.

## 토큰 보관과 #232 접점

GitHubConnection의 credentialReference에는 github-v1:UUID만 저장한다. 토큰 원문은 일반 DB 칼럼·응답·로그에 없다. CredentialVault는 별도 보관 디렉터리의 .enc 파일에 AES-256-GCM으로 토큰·회원·계정·만료를 인증 암호화한다. 각 파일은 새 nonce와 참조를 추가 인증 데이터로 사용한다. 신뢰할 수 있는 전용 디렉터리·별도 난수 키가 필요하며 운영 OS 권한·영속 저장·백업·키 주입은 배포 담당과 확인해야 한다. 키를 바꾸면 기존 암호문을 읽을 수 없으므로 키 회전을 임의 수행하지 않는다. 동기 보관 실패와 DB 저장·커밋 실패는 성공 응답이 아니며 새 암호문을 정리한다.

**단일 내부 함수:** GitHubConnectionModule을 import하고 GitHubConnectionService.resolveCredential(memberId)를 호출한다. 결과는 accountLogin·externalAccountReference·token(GitHubAccessToken)·expiresAt(Date)·memberId 또는 null이다. #232의 내부 조회 응답을 작성할 때만 token.reveal()을 사용한다. 객체의 문자열·JSON·inspect 출력은 토큰을 가린다. 일반 회원용 컨트롤러에서는 이 함수를 응답에 연결하지 않는다.

연결 없음·DISCONNECTED·REAUTH_REQUIRED·실제 자격정보 없는 개발 대역이면 null이다. 실제 파일 누락·인증 복호화 실패도 REAUTH_REQUIRED로 전환한 뒤 null이며 반복 호출에도 제공하지 않는다. 실제 토큰 인계 전 /user로 권한·계정을 다시 확인한다. 401 폐기·권한 확대·계정 불일치 확인은 REAUTH_REQUIRED/null, 네트워크·서버 장애는 INTERNAL_ERROR로 제공을 거부한다. 확인 중 연결이 해제·교체되면 이전 토큰을 반환하지 않는다. expiresAt은 **GitHub 발급 토큰의 확인된 사용 만료 시각**이며 state 수명·분석 처리 시한·CatchU JWT 수명이 아니다.

확인한 dev 판본(e09a633)에는 [#232 worker용 내부 조회](https://github.com/JminAILab/CatchU/issues/232)의 실제 조회 지점이 없다. 이 PR은 함수와 재사용 모듈을 제공하고, 내부 조회·worker CredentialResolver 연결은 #232에서 수행해야 한다. worker의 기존 검사는 현재 시각 + 최대 수집 시간보다 늦은 expiresAt만 허용한다([credentials.py](../../worker/app/collection/credentials.py)). 접수 직후·대기 중 토큰 만료나 조기 폐기로 수집이 실패할 수 있으며 접수 성공을 실행 보장으로 표시하지 않는다. 이미 인계된 토큰은 로컬 연결 해제로 회수되지 않으며 GitHub에서 만료·폐기되면 이후 호출이 실패한다.

연결 해제는 DB의 연결·참조를 먼저 제거하고 해당 암호문을 삭제한다. GitHub의 앱 승인 자체를 폐기하는 기능은 아니다. 보관 정리 실패는 오류를 반환하며 DB의 제공 중단은 유지된다. 교체·해제 후 이전 토큰을 받아 둔 worker의 즉시 차단이나 GitHub 권한 폐기는 별도 경계다. 프로세스 강제 종료가 DB와 파일 저장 사이에 발생하면 참조 없는 암호문이 남을 수 있다. 정리·운영 보관 정책은 배포 검토가 필요하며 자동 복구·자동 토큰 갱신을 추가하지 않았다.

## 필수·선택 설정과 실제 검토 절차

기본 GITHUB_CONNECTION_ENABLED=false면 기존 개발 대역과 회원 API를 유지한다. 켜면 아래 설정을 모두 요구하고 형식 오류 시 기동을 거부한다.

| 설정 | 필수 여부 / 준비 |
|---|---|
| GITHUB_CONNECTION_ENABLED | 선택, 정확히 true일 때 실제 연동 켜기 |
| GITHUB_OAUTH_CLIENT_ID | 활성화 시 필수, 별도로 등록한 OAuth App |
| GITHUB_OAUTH_CLIENT_SECRET | 활성화 시 필수, 로컬 .env/배포 비밀 관리 수단에만 주입 |
| GITHUB_OAUTH_CALLBACK_URL | 활성화 시 필수, GitHub 앱 등록과 같은 web 콜백. HTTPS가 필요하며 development·test의 허용 loopback에서만 HTTP 허용 |
| GITHUB_CREDENTIAL_DIRECTORY | 활성화 시 필수, 루트가 아닌 절대 경로. Git 추적 밖의 전용 영속 디렉터리, 서비스 계정만 읽기·쓰기 |
| GITHUB_CREDENTIAL_ENCRYPTION_KEY | 활성화 시 필수, 안전한 난수 32바이트의 64자리 hex. AUTH_JWT_SECRET·LINK_GRANT_SECRET과 다른 키 |

난수는 node:crypto.randomBytes(32)로 생성해 비밀 관리 수단이나 로컬 변수에만 받는다. 실제 값·전체 환경·HTTP 상세 출력·토큰 응답을 화면·이슈·PR에 출력하지 않는다. 기존 .env는 덮어쓰지 않으며 실제 비밀값은 문서·Git에 넣지 않는다. 설정 전체 목록은 [환경변수 표](environment.md)를 따른다.

2026-10-08에는 작성자의 개발용 앱·로컬 비밀 설정·DB·API 준비와 실제 연결을 확인했다([검증 기록](https://github.com/JminAILab/CatchU/issues/231#issuecomment-6051939540)). 아래는 다른 검토자가 자기 환경에서 수행할 절차이며 자동 검사나 재현 완료 기록이 아니다. 운영 앱·콜백·보관 권한은 A와 H가 배포 전에 확인해야 한다. App 설정에서 만료형 Access Token을 켜되 추가 scope는 요청하지 않는다. 기존 만료 없는 토큰이 자동 변경되는 것은 아니므로 다시 연결한다.

1. GitHub 앱 설정의 콜백·만료형 옵션을 확인하고 위 설정을 안전하게 준비한다. 로그·설정 전체를 공유하지 않는다.
2. 기존 인증으로 authorization URL을 받아 브라우저에서 승인한다. web 연결이 아직 없으면 검토용 클라이언트가 code·state를 변수에 받아 완료 API를 호출한다. URL/코드도 기록·첨부하지 않는다.
3. 완료가 200인지, GET /me가 CONNECTED·본인 GitHub 로그인인지 확인한다. 서버는 교환 응답의 빈 scope·양의 expires_in·/user의 빈 실제 권한 헤더를 검증한다.
4. 내부 검토 코드에서 resolveCredential을 받아 공개 저장소 조회를 수행하되 토큰을 출력하지 않는다. 공개 저장소 자료가 조회되는지와 비공개 권한이 없는지를 확인한다. 이 함수 자체는 저장소 선정이나 분석 동의·소유권 허가를 대신하지 않는다.
5. 실제 만료·GitHub 승인 폐기 후 함수가 null, 상태가 REAUTH_REQUIRED인지 확인한다. 재연결과 해제를 확인한다. CatchU 세션 유효 여부는 별도로 검사한다.

## 검사와 한계

test/github-client.test.cjs는 GitHub HTTP 응답 대역으로 scope·expires_in·PKCE 전달·신원·오류 비노출·설정 검증을 확인한다. HTTP 콜백은 development·test의 localhost·127.0.0.1·::1만 허용하며 production·미지정·공란·다른 환경과 비루프백 거부를 검사한다. test/db/github-connection-api.test.cjs는 실제 Nest HTTP·전용 PostgreSQL·암호문 파일로 연결·해제·만료·권한 경계·state 일회성·동시 완료·늦은 응답·암호문 무결성·보관/DB 저장/최종 커밋 실패를 확인한다. 파일 누락·키 불일치·암호문 변조는 회원 조회 200·REAUTH_REQUIRED·참조 제거·반복 미제공, 다른 보관 장애·DB 전환 실패는 500·CONNECTED 유지, 재연결 경쟁·인증 거부를 검사한다. GitHub 응답 대역과 실제 API·DB 범위를 구분하며 대역 시험을 실제 승인·철회 재현으로 해석하지 않는다.

전체 API 회귀·정적 검사 결과는 [PR #254](https://github.com/JminAILab/CatchU/pull/254)의 실제 수행 판본에 기록한다. 2026-10-08 실제 검증은 제품 판본 c22b399의 작성자 환경에서 수행한 기록이다. 사용자 직접 최초 연결·해제·재연결과 최초 연결의 자격정보 제공·추가 scope 없음·유효 만료 정보·공개 저장소 조회를 확인했다. CLI 후속 검사는 재연결 후 제공·공개 저장소 조회, 사용자가 실제 앱 승인을 철회한 뒤 GitHub 401·REAUTH_REQUIRED·참조 제거·보관 정리·반복 미제공과 동일 검사 토큰의 회원 조회 200을 확인했다. 실제 시간 경과에 따른 만료·권한 변화·#232 내부 조회/worker 인계·실제 web·작성자 외 재현·배포 검증은 남아 있다. 이번 리뷰 보완의 대역 회귀 검사를 이전 실제 GitHub 검증의 재실행으로 확대하지 않는다.

## 개발용 OAuth App 준비 순서

2026-10-08 착수 당시 앱·로컬 비밀 설정은 준비 전이었으나 같은 날 작성자 환경에서 준비와 실제 검증을 마쳤다. 아래는 신규 검토자가 직접 수행할 준비 안내이며 운영 준비 완료를 뜻하지 않는다. [GitHub 앱 등록 안내](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)를 따른다.

1. 본인 GitHub 계정에서 프로필 사진 → Settings → Developer settings → OAuth apps → New OAuth App(처음이면 Register a new application)으로 들어간다.
2. Application name은 개발용임을 구분할 이름(예: CatchU local development), Homepage URL은 http://localhost:3000, Authorization callback URL은 **http://localhost:3000/github/callback**으로 입력한다. 이는 로컬 검토 예시이며 배포 콜백은 H와 별도로 확인한다.
3. **Expire user access tokens**를 켠 상태로 등록한다. Device Flow는 사용하지 않는다. OAuth App은 별도 repo·public_repo·user scope를 추가하지 않는다. 앱의 Client ID를 확인하고 Client secret을 생성해 안전하게 보관한다. 실제 값은 대화·이슈·PR·Git에 올리지 않는다.
4. api/README.md에 따라 본인 로컬 DB와 인증 설정을 먼저 준비한다. api/.env가 없을 때만 .env.example을 복사하고, 이미 있으면 기존 값을 보존한다. git check-ignore .env와 git ls-files -- .env로 무시되며 추적되지 않는지 확인한다. 추적 중이면 비밀값을 넣기 전에 중단한다.
5. 아래 환경변수는 **현재 PowerShell과 그 자식 API 프로세스에만** 설정한다. 시스템·사용자 전역 설정을 바꾸지 않는다. .env에 보관할 경우 위 설정 이름으로 로컬 편집하며 기존 값은 덮어쓰지 않는다.

```powershell
# 실행 위치: 해당 작업 worktree의 api/
$env:GITHUB_CONNECTION_ENABLED = 'true'
$env:GITHUB_OAUTH_CLIENT_ID = Read-Host '개발용 OAuth App Client ID'
$secret = Read-Host '개발용 OAuth App Client secret' -AsSecureString
$env:GITHUB_OAUTH_CLIENT_SECRET = [System.Net.NetworkCredential]::new('', $secret).Password
$env:GITHUB_OAUTH_CALLBACK_URL = 'http://localhost:3000/github/callback'
$env:GITHUB_CREDENTIAL_DIRECTORY = Join-Path $env:LOCALAPPDATA 'CatchU/github-credentials'
# 신규 보관 위치에서 처음 준비할 때만 생성. 기존 암호문이 있으면 기존 키를 유지한다.
$env:GITHUB_CREDENTIAL_ENCRYPTION_KEY = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
npm run start:dev
```

기존 키가 있는 경우 위 생성 줄을 다시 실행하지 않는다. 키를 잃으면 기존 토큰을 복호화할 수 없다. 재시작 이후에도 같은 키를 비밀 관리 수단/무시된 로컬 설정에서 주입해야 한다. 보관 디렉터리와 키의 접근 권한은 본인/서비스 계정으로 제한하고 다른 사람과 공유하지 않는다.

6. GitHub 연결 **화면과 콜백 페이지는 이 PR에 없다.** web이 /github/callback을 처리하지 않으면 돌아온 페이지가 404여도 OAuth code·state는 주소의 쿼리에 있을 수 있다. 이를 성공 화면으로 해석하지 않는다. 검토용 클라이언트가 같은 CatchU 로그인으로 authorization API → GitHub 브라우저 승인 → code·state를 connection API로 보내야 완료된다. 서버의 GET 콜백 API를 호출하는 방식이 아니다. 기존 CatchU JWT·OAuth code·state는 변수에만 받아 출력·기록하지 않는다. state는 URL을 발급한 동일 API 프로세스에서만 유효하다.
7. 연결 완료와 공개 정보 조회·실제 권한·만료 응답 검증을 수행한 뒤, 비밀값 없이 앱의 설정 확인 여부·API 상태·검사한 판본만 PR에 남긴다. 10/8 작성자 검증과 이번 대역 검사는 구분하고, 새 검토자의 재현·남은 연결·배포 검증을 완료로 추정하지 않는다.
