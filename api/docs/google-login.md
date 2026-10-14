# 실제 Google 로그인 — #249

## 범위와 결정 근거

[#249 실제 Google 로그인 API](https://github.com/JminAILab/CatchU/issues/249)와 [이번 구현에서 사용자가 수용한 연결안](https://github.com/JminAILab/CatchU/issues/249#issuecomment-6053701691)을 반영한다. API 경로·응답은 이번 구현의 **연결 검토안**이며 공식 API 계약 승인을 뜻하지 않는다. 실제 연결의 확인 범위와 미검증 항목은 아래 「실제 연결 재현 현황」에서 구분한다.

- 서버가 Google 인증 코드를 교환한다. 일회용 state·nonce·PKCE와 요청 시작자 확인값을 검증한다.
- 검증된 Google `sub`를 내부 `catchu:google:<sub>` 식별자로 사용한다. Google의 두 허용 issuer 표기는 같은 Google 식별 영역이다. 이메일·개발 회원·다른 인증 수단과 자동 연결하거나 병합하지 않는다.
- 최초 로그인은 기존 회원·빈 기본 프로필을 같은 DB 트랜잭션으로 만든다. 같은 sub의 동시 요청은 잠금·기존 유일성 제약으로 같은 회원을 사용한다. 기존 회원이 비활성이면 인증을 거부하며, 프로필 누락을 빈 프로필로 복구하지 않는다.
- Google 이름은 이름 미저장 회원의 `suggestedDisplayName`으로만 반환하며 저장하지 않는다. 이미 저장한 표시 이름·소개·희망 직무·기술 목록·GitHub 연결은 덮어쓰지 않는다. 이름 제안은 선택적 외부 값이며 [프로필 저장 입력 제한](member-profile.md)을 통과한 저장본이 아니다. 화면에서 확인·수정한 후 기존 프로필 API로 저장해야 한다.
- #250에서 회원 연결과 같은 트랜잭션으로 세션·Refresh를 저장하고 기존 Access 발급기로 15분 토큰을 발급한다. 최종 DB 커밋 전에는 성공 응답이나 쿠키를 반환하지 않는다. Google access/refresh token은 저장·전달하지 않는다.
- [#250 세션 후속 연결](auth-sessions.md)은 세션 저장·Refresh 쿠키·갱신·로그아웃과 공통 Guard의 DB 유효성 확인을 추가한다. 이 문서의 #249 외부 인증 검증과 구분한다.
- 최초 프로필 화면 자체는 [#137 프로필 화면 API 연결](https://github.com/JminAILab/CatchU/issues/137), 실제 로그인 화면 연결은 [#251 실제 인증 화면 연결](https://github.com/JminAILab/CatchU/issues/251)에서 다룬다.

Google 기준은 [서버 인증 코드 흐름](https://developers.google.com/identity/protocols/oauth2/web-server)과 [OpenID Connect 검증·sub 기준](https://developers.google.com/identity/openid-connect/openid-connect)을 따른다. Google 공개키로 RS256 서명을 검증하고 issuer·audience·nonce·sub·iat·exp 및 존재하는 azp를 확인한다. 발급 시각(iat)에만 서버 시각보다 최대 5초 미래를 허용한다. 초 단위 계산과 작은 시계 차이로 정상 토큰이 거부되지 않도록 선택한 짧은 허용값이며, 6초 이상 미래는 거부한다. 만료(exp)·서명·issuer·audience·nonce 및 다른 검증에는 이 오차를 적용하지 않는다. 외부 전송 대상은 Google 토큰·공개키 HTTPS 주소로 고정하고 리다이렉트하지 않는다. 요청은 10초, 응답 본문은 64 KiB로 제한한다.

### 화면 연결 기준

[화면 담당자의 연결 접점 리뷰](https://github.com/JminAILab/CatchU/pull/257#issuecomment-6097352980)를 반영한 기준이며, 실제 화면 구현은 [#251](https://github.com/JminAILab/CatchU/issues/251)에서 연결한다.

- 최초 프로필 입력 여부는 로그인 성공 후 `GET /v1/me`의 `profile.displayName === ""`로 판단한다. `suggestedDisplayName`의 null은 이름이 이미 저장됐거나 Google 이름이 없는 경우 모두 가능하므로 화면 이동 기준으로 사용하지 않는다. 이름 제안은 최초 입력에 전달하는 값으로만 사용한다.
- Google 로그인 완료 API의 `401 AUTH_INVALID`는 로그인 시도·인증 코드·Google 토큰 검증 실패일 수 있으며, 기존 CatchU 회원 세션 만료로 일괄 처리하지 않는다. 현재 web의 `api.member`는 `AUTH_REQUIRED`·`AUTH_INVALID` 응답을 받으면 보관 중인 회원 토큰을 정리한다. #251에서는 로그인 시작·완료 호출을 이 회원 인증 오류 처리 경로와 구분해야 한다. 요청에서 회원 토큰을 생략하는 것만으로 응답의 오류 처리까지 분리되지는 않는다.
- 완료 API에 전달할 취소 오류는 `access_denied`만 지원한다. 다른 Google 오류는 화면에서 실패로 안내하고, 사용자가 다시 시도하기를 선택하면 새 인증을 시작한다. 지원하지 않는 오류를 완료 API로 보내면 `400 VALIDATION_FAILED`와 `details.violations`를 반환한다. 컨트롤러의 입력 검증이 인증 시도 소비 전에 실행되므로 이 단계에서는 시도를 소비하지 않는다. 입력 검증 통과 후의 취소·외부 교환·DB 실패는 아래 일회용 처리 기준을 따른다.

시작자 확인값·복귀 경로의 `sessionStorage` 보관은 후속 제안이며 확정된 정책이 아니다. 세션 유지·갱신·로그아웃은 [#250 후속 안내](auth-sessions.md), 이름 저장 회원의 프로필 설정 화면 접근·복귀·저장 후 재진입 처리는 [PR #261](https://github.com/JminAILab/CatchU/pull/261) 범위로 구분한다.

## API 연결안

두 경로는 로그인 시작을 위해 메서드 단위로 인증 제외한다. 성공·오류에 기존 `Cache-Control: no-store`를 적용한다. 추가 본문·query 필드는 기존 공통 입력 오류로 거부한다.

| 동작 | 요청 | 응답 |
|---|---|---|
| 시작 | `POST /v1/auth/google/authorization`, 빈 객체 `{}` | `{authorizationUrl, loginAttemptToken, expiresIn: 600}` |
| 완료 | `POST /v1/auth/google/login`, `{state, loginAttemptToken, code}` | `{accessToken, tokenType, expiresIn: 900}` + `suggestedDisplayName: string 또는 null`, #250 Refresh 쿠키 |
| Google 승인 취소 | 완료 경로에 `{state, loginAttemptToken, error: "access_denied"}` (code와 동시 지정 불가) | `{cancelled: true}`, 회원·토큰 생성 없음 |

`authorizationUrl`에는 `openid profile`만 요청한다. 이메일을 회원 연결 기준으로 사용하지 않아 email scope는 요청하지 않는다. `loginAttemptToken`은 인증을 시작한 브라우저가 보관했다가 완료 요청에 보내는 별도 비밀 확인값이며 Google URL·콜백 query에 넣지 않는다. 시작 응답·콜백 URL·code·state·확인값·토큰은 로그나 대화에 공유하지 않는다.

state의 보관 시간 600초는 **인증 요청의 시간 제한**이며 CatchU 로그인·세션 수명이 아니다. 서버 메모리에 최대 1,000건을 보관하며 만료된 항목은 회수한다. 입력 검증을 통과하고 시작자 확인값이 일치하는 요청은 교환 전에 소비하고 취소·교환 실패·DB 실패 뒤에도 재사용할 수 없다. API 재시작·다른 인스턴스·만료·성공 뒤 재전달은 새 인증을 시작해야 한다. 다중 인스턴스의 공유 보관소·시작 경로의 배포 단계 남용 제어는 후속 연결 검토 대상이다. 시작자 확인값은 state와 별도로 저장하며 비교 실패만으로 정상 요청을 소비하지 않는다.

| 오류 | 처리 |
|---|---|
| 형식 오류·추가 필드·code와 취소 동시 지정·지원하지 않는 error | `400 VALIDATION_FAILED`, `details.violations` |
| 없는·만료·소비한 state, 시작자 불일치, 잘못된 코드·서명·claim | `401 AUTH_INVALID` |
| Google 로그인 비활성 | `404 RESOURCE_UNAVAILABLE` |
| 외부 통신·공개키 조회·설정 문제·DB·커밋·서명 발급 실패 | `500 INTERNAL_ERROR` |

오류에는 코드·nonce·토큰·외부 응답·SQL·원문 예외를 넣지 않는다. 기존 공통 필터의 안전한 오류 분류 로그를 재사용한다. 보호 API는 검증된 CatchU Access JWT의 회원 UUID를 사용하며 Google sub나 입력 memberId로 대체하지 않는다.

## 개발용 앱 등록과 설정

기존 [API 환경변수·DB 준비](../README.md)를 먼저 따른다. `GOOGLE_LOGIN_ENABLED` 미지정 또는 false이면 Google 비밀 설정 없이 기동한다. true일 때 다음 세 값이 필수다. 실제 값을 예시 파일·Git·PR·대화에 넣지 않는다.

| 설정 | 의미 |
|---|---|
| `GOOGLE_CLIENT_ID` | 웹 OAuth 클라이언트의 `.apps.googleusercontent.com` ID |
| `GOOGLE_CLIENT_SECRET` | 같은 클라이언트의 비밀값. 로컬 무시된 `.env`에만 보관 |
| `GOOGLE_REDIRECT_URI` | Google에 등록한 콜백과 정확히 같은 주소. 운영은 HTTPS, development/test만 loopback HTTP |

2026-10-08 사용자 검증 환경에서는 앱 등록·로컬 설정과 실제 로그인 재현을 마쳤다. 아래는 다른 개발자가 자신의 환경을 준비하는 절차이며, 기존 검증 환경의 비밀값을 재사용하거나 공유하지 않는다.

1. Google Cloud Console에서 개발용 프로젝트를 선택하거나 만든 뒤 **Google Auth platform**을 연다.
2. 첫 설정이 필요하면 **Branding**에서 앱 이름(예: CatchU 로컬 개발)과 본인의 지원·연락 이메일을 입력한다. **Audience**는 해당 계정에서 선택 가능한 개발 대상에 맞춰 설정하고, 테스트 사용자 목록을 사용하는 경우 자신의 검증 계정을 추가한다. 조직 전용 범위나 공개 배포를 임의로 선택하지 않는다.
3. **Clients → Create client → Web application**을 선택한다. 이름은 예를 들어 CatchU 로컬 Google 로그인이다. 승인된 리디렉션 URI에 `http://localhost:3000/google/callback`을 등록한다. 현재 검토용 로컬 주소이며 `.env`에도 정확히 같은 값을 사용한다. 이 서버 교환 흐름에는 브라우저 Google SDK를 사용하지 않아 JavaScript origin을 추가할 필요가 없다.
4. Client ID·secret은 본인 로컬에서만 보관하고 아래 「앱 등록 이후의 로컬 설정·실재현」에 따라 Git에서 무시되는 `api/.env`에 설정한다. 다운로드 파일도 Git 작업 폴더에 저장하지 않는다.

이는 콜백 **화면 구현**이 아니다. 현재 콜백 페이지가 없다면 브라우저에 연결 실패·없는 페이지가 표시될 수 있다. 이후 검증 단계에서 콜백 query를 로컬에서만 읽어 시작자 확인값과 함께 완료 API로 전달한다. 채팅·이슈·PR에는 URL query나 코드를 붙이지 않는다. 노출되었으면 새 state·PKCE로 시작한다. 실제 화면 연결은 #251 범위다.

## 코드 위치와 검사 범위

### 앱 등록 이후의 로컬 설정·실재현

등록 완료 후 이 작업의 `api/.env`만 준비한다. `git ls-files -- .env`의 결과가 없어야 하고 `git check-ignore .env`가 무시됨을 확인해야 한다. 기존 설정이 있으면 값을 보존하고 필요한 Google 세 항목과 `GOOGLE_LOGIN_ENABLED=true`만 본인이 추가한다. `NODE_ENV=development`, 기존 인증 키·수명·DB 설정도 유지한다. 설정 전체나 비밀값을 출력하지 않는다. 로컬 설정은 소스·자동 검사와 별도로 관리하며 Git에 포함하지 않는다.

README대로 DB 마이그레이션을 적용하고 API를 실행한다. 다른 작업 서버·포트를 재사용하거나 종료하지 않는다. 아래는 **사용자가 자신의 로컬 터미널에서 수행하는 절차**이며 이번 자동 검사의 수행 기록이 아니다. Google에 등록한 콜백과 설정의 주소가 같아야 한다. API 주소는 본인이 실행한 포트로 맞춘다.

```powershell
$apiBase = 'http://127.0.0.1:3001'
$started = Invoke-RestMethod -Method Post -Uri "$apiBase/v1/auth/google/authorization" -ContentType 'application/json' -Body '{}'
# 시작 응답을 출력하지 않고 본인 브라우저에서 승인한다.
Start-Process $started.authorizationUrl
# 브라우저 콜백 주소 전체는 로컬에서만 복사하고, 아래 입력도 화면에 표시하지 않는다.
$callbackInput = Read-Host '콜백 주소를 로컬에서 입력(채팅에 보내지 않음)' -AsSecureString
$localAddress = [uri]([Net.NetworkCredential]::new('', $callbackInput).Password)
Add-Type -AssemblyName System.Web
$callbackQuery = [System.Web.HttpUtility]::ParseQueryString($localAddress.Query)
$completion = @{ state = $callbackQuery['state']; loginAttemptToken = $started.loginAttemptToken }
try {
  if ($callbackQuery['error']) {
    if ($callbackQuery['error'] -ne 'access_denied') {
      throw 'Google 승인 실패: 완료 API로 보내지 않고 사용자가 선택하면 새 인증을 시작한다.'
    }
    $completion.error = 'access_denied'
  } else { $completion.code = $callbackQuery['code'] }
  $login = Invoke-RestMethod -Method Post -Uri "$apiBase/v1/auth/google/login" -ContentType 'application/json' -Body ($completion | ConvertTo-Json -Compress)
  if ($login.cancelled) { [pscustomobject]@{ Cancelled = $true } }
  else {
    $me = Invoke-RestMethod -Uri "$apiBase/v1/me" -Headers @{ Authorization = "Bearer $($login.accessToken)" }
    [pscustomobject]@{ LoginSucceeded = [bool]$login.accessToken; MemberReadSucceeded = [bool]$me.memberId;
      SuggestedNamePresent = [bool]$login.suggestedDisplayName; DisplayNameSaved = ($me.profile.displayName -ne '') }
  }
} catch { Write-Error '검증 실패: 원문을 공유하지 말고 상태·공통 오류 코드만 확인한 뒤 새 인증을 시작하세요.' }
finally { $completion = $null; $callbackQuery = $null; $localAddress = $null; $callbackInput = $null; $started = $null }
```

이 절차는 PowerShell 전사·녹화가 없는 보호된 로컬 터미널에서 실행한다. 자동 검사는 이 수동 절차 대신 HTTP·DB 테스트를 사용한다. API가 재시작되었거나 600초가 지났거나 요청 완료가 실패하면 기존 code/state를 다시 사용하지 않는다. Google 승인 거부는 `{cancelled:true}`이며 정상 토큰 발급과 구분한다. 최초 조회한 회원 ID는 로컬 메모리에만 보관하고 다른 인증 요청을 새로 시작한 뒤 조회 ID와 비교하면 반복 로그인의 동일 회원 여부를 확인할 수 있다. 이름 저장 후 재로그인하면 기존 이름이 유지되고 제안은 null이어야 한다. 사용자 계정·회원 ID·토큰·원문 응답은 PR에 남기지 않고 성공 여부만 기록한다. 실제 공개 콜백 페이지·사용자 화면은 이 검사에서 제공하지 않는다. 검사가 끝나면 본인 검증용 API만 종료하고 `$login`, `$me`도 비운다.

### 구현 파일·자동 검사

- `src/google-login/google.config.ts`: 활성화·필수 설정·콜백 주소 검사.
- `google-input.ts`, `google-login.controller.ts`: 공개 시작·완료 입력과 기존 오류/앱 설정 재사용.
- `login-attempts.ts`: 일회용 요청·시작자 확인·PKCE·만료·보관 상한.
- `google-provider.ts`: 고정 외부 교환·공개키 검증과 안전한 오류 분류.
- `google-login.service.ts`: 검증된 Google 주체의 회원·프로필 조회/생성과 기존 Access JWT 발급.
- `google-login.module.ts`: 설정·제공자 의존성 연결. `AuthModule`의 기존 발급기를 공유한다.
- `test/google-login.test.cjs`: 합성 서명된 Google ID token으로 설정·claim·요청·외부 오류 검사. 고정 시각에서 iat +1초·+5초 허용, +6초·+300초 거부와 만료 시각의 엄격한 거부를 확인한다. +300초 사례는 exp를 iat 이후로 설정해 미래 발급 시각 검사를 분리한다.
- `test/db/google-login-api.test.cjs`: 실제 로컬 API·전용 PostgreSQL에서 중복·경쟁·실패·최종 커밋 롤백·프로필 보존·비밀 비노출 검사. 외부 Google HTTP와 공개키만 대역이며 실제 Google 연결 완료로 세지 않는다.

API 폴더에서 `npm run lint`, `npm run typecheck`, `npm run build` 후 README대로 전용 `TEST_DB_*`를 지정해 `npm test -- test/google-login.test.cjs test/db/google-login-api.test.cjs`, 전체는 `npm test`를 실행한다. 기존 DB를 초기화하지 않는다. 자동 검사와 실제 Google 재현은 별도 근거이며, 관련 검사는 전체 검사의 일부이므로 건수를 합산하지 않는다.

### 실제 연결 재현 현황

[2026-10-08 사용자 직접 재현 기록](https://github.com/JminAILab/CatchU/issues/249#issuecomment-6053701691)과 [PR #257 검증 기록](https://github.com/JminAILab/CatchU/pull/257)을 근거로 다음 범위를 확인했다. 사용자가 로컬 명령을 실행하고 성공 여부를 제공한 결과이며 CLI 자동 검사를 다시 수행한 기록이 아니다.

- 최초 실제 Google 로그인에서 Access JWT 발급과 보호된 `GET /v1/me` 호출이 성공했다. 최초 입력용 `suggestedDisplayName`은 제공되고 표시 이름은 자동 저장되지 않았다.
- 같은 Google 계정의 반복 로그인은 동일 회원으로 연결되며 표시 이름 미저장 상태를 유지했다.
- 검증용 표시 이름 저장 응답과 직후 회원 조회가 일치했다. 저장 후 재로그인에서도 동일 회원과 검사 당시 프로필 값이 유지됐으며, `suggestedDisplayName` 필드는 존재하고 null이었다.
- 소개·희망 직무·기술 목록은 당시 값의 보존을 비교했다. 각 항목에 비어 있지 않은 새 값을 입력해 실제 Google 흐름에서 검사한 것은 아니다.

실제 Google 승인 취소·외부 오류·다른 실제 계정 간 분리·동시 최초 로그인은 이 수동 재현에 포함하지 않았다. 해당 분기는 합성 제공자 응답과 실제 로컬 API·전용 DB의 자동 검사로 확인하며, 실제 Google 환경 검사와 구분한다. 세션 유지·갱신·로그아웃은 [#250 세션 기능](https://github.com/JminAILab/CatchU/issues/250), 실제 화면 연결은 [#251 인증 화면 연결](https://github.com/JminAILab/CatchU/issues/251)의 별도 범위다.
