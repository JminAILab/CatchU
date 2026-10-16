# 세션 유지·갱신·로그아웃 — #250

## 적용 기준과 범위

[팀장 결정](https://github.com/JminAILab/CatchU/issues/250#issuecomment-6097542703)에 따라 Access 15분, 세션 생성부터 최대 7일, 마지막 정상 Refresh 갱신부터 24시간을 적용한다. 최초 갱신 전에는 생성 시각을 사용하며 갱신으로 7일을 연장하지 않는다. 사람이 조작하지 않는 시간을 별도로 감지하지 않는다. 자동 갱신으로 24시간 기준은 연장될 수 있다.

로그아웃은 현재 브라우저가 쿠키로 공유하는 세션만 종료한다. 다른 기기의 세션은 유지한다. 동일 브라우저 탭들은 같은 쿠키를 사용한다. Google·개발 로그인 모두 세션을 저장한 후 Access JWT와 Refresh 쿠키를 발급한다. JWT에는 회원 UUID와 세션 UUID가 들어가며, 공통 Guard는 서명·만료 검증 후 DB의 해당 세션·회원 ACTIVE 상태를 확인한다. 세션 ID 없는 기존 토큰은 재로그인이 필요하다. 인증 통과가 GitHub 연결·분석 동의·자원 소유권을 보장하지는 않는다.

API 경로·응답·새 오류 코드는 [API 명세의 회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#m--회원-api), 저장 모델은 [api ERD](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md)에 반영했으며 그쪽이 정본이다. 실제 화면 연결 완료를 뜻하지는 않는다. 화면 연결은 [#251](https://github.com/JminAILab/CatchU/issues/251), 기존 호출 기반은 [#106](https://github.com/JminAILab/CatchU/issues/106)과 맞춘다.

서버 구현의 기존 검토 근거는 [PR #269의 제품 판본](https://github.com/JminAILab/CatchU/commit/a7e9e58d11c1617625d50a5a5809996bf72c3fab)이다. 최신 dev 통합 판본·직접 회귀 검사·CI는 [PR #269 검사 기록](https://github.com/JminAILab/CatchU/pull/269)에서 구분한다. 아래 연결 합의 정리는 서버 정책·응답 계약을 변경하지 않는다.

## 서버 리뷰와 화면 연결의 경계

#250의 서버 완료 기준은 재발급·거부·재사용·폐기, DB 실패, 쿠키·Origin·no-store·비노출, 만료·경쟁·재기동과 검증 범위 기록이다. 서버 자동 검사에서 확인한 항목과 실제 브라우저 미검증을 PR에 따로 기록한다. #251 전체 구현·통합 검증 완료를 이 서버 PR의 추가 필수 조건으로 삼지 않는다. 정상 동시 사용의 로그인 유지 요구는 그대로 두고 화면 연결에서 확인한다.

[최신 접점 합의](https://github.com/JminAILab/CatchU/pull/269#issuecomment-6136224638)와 [A 담당 확인](https://github.com/JminAILab/CatchU/pull/269#issuecomment-6136281714)에 따라 기본 인증 상태는 `restoring` / `signed-in` / `signed-out` / `reauth-required`, Google 완료 결과는 `signed-in` / `cancelled` / `failed`, 로그아웃 결과는 `done` / `failed` / `unknown`으로 연결한다. 이는 web의 연결 합의이며 서버 응답 필드 추가가 아니다. 같은 세션의 Access 갱신만으로 회원 조회·화면을 초기화하지 않고, 기존 경로별 조회·실패 후 재시도·프로필 저장 후 재확인을 유지한다. #261의 회원 조회·이동 흐름을 재사용하며 비로그인 회원 경로 진입은 로그인 화면으로, 로그아웃 성공은 비로그인 홈으로 이동한다. Google 완료 API의 401은 기존 회원 인증 만료와 구분한다.

공통 인증·탭 내부/탭 간 갱신 제어·`useMemberLookup`·`MemberGuard` 연결은 C 담당, Google 버튼·콜백·재인증 안내와 `MemberShell`의 미저장 확인·공통 로그아웃 호출·진행/실패/불명 표시는 A 담당 범위로 합의했다. 두 작업을 합친 뒤 실제 Google 로그인부터 로그아웃까지 통합 브라우저 검증·결과 기록은 C 담당이 맡는다. 세부 진행 상태는 #251과 하위 작업에서 확인한다.

`failed.reason` 실제 값, 중복 호출·늦은 응답 처리 분담, `unknown` 재요청 조건·안내 문구와 공동 파일의 변경 위치·반영 순서는 연결 전에 맞출 사항이다. 실패·불명은 완료로 표시하지 않고 화면·입력을 유지하며, 종료 확인 중 갱신·보호 동작을 보류한다. `unknown`을 인증 유효로 확정하지 않는다. 접점 합의 완료가 실제 화면 구현·브라우저 검증 완료를 뜻하지 않는다.

## 저장과 트랜잭션

- `auth_session`: UUID·회원 FK·생성 시각·절대 만료·마지막 정상 갱신 시각·폐기 시각. 최초 마지막 갱신 시각은 생성 시각이다.
- `session_refresh_token`: UUID·세션 FK·난수 32바이트 토큰의 SHA-256 해시·생성/사용 시각. 원문은 저장하지 않는다. 사용한 해시를 유지해 재사용·응답 유실 후 종료를 판단한다. 세션당 미사용 토큰 한 개의 부분 유일성 제약을 둔다.
- Google 회원 연결·프로필 준비·세션·최초 Refresh 저장과 Access 서명은 같은 `EntityManager`에서 처리한다. 개발 회원 준비도 같은 트랜잭션을 사용한다. 최종 커밋 후에만 Access와 쿠키를 응답한다.
- 갱신·로그아웃은 같은 세션 행을 `FOR UPDATE`로 잠근 뒤 토큰 상태를 다시 읽는다. 갱신은 기존 토큰 사용 표시·새 토큰 저장·정상 갱신 시각 변경을 한 트랜잭션으로 처리한다.
- 사용된 토큰의 재사용은 해당 세션을 폐기한다. 폐기를 커밋한 뒤 401을 반환해 거부 예외가 폐기를 롤백하지 않게 한다. DB 조회·저장·서명·커밋 실패는 기존 공통 `500 INTERNAL_ERROR`로 처리하고 성공 응답·새 쿠키·쿠키 제거를 보내지 않는다.
- 로그아웃 폐기가 커밋된 이후 시작한 보호 API와 갱신은 거부한다. 이미 Guard를 통과해 실행 중인 업무 요청을 취소하는 기능은 포함하지 않는다.

마이그레이션은 기존 회원 기반 이후 `CreateAuthSessions1791648335731`을 적용한다. `npm run migration:generate`로 생성했고 전용 DB에서 적용→되돌리기→재적용을 확인한다. 기존 DB에서 초기화·기존 마이그레이션 수정은 하지 않는다. 만료 세션·사용 기록의 정기 삭제 작업은 이번 범위에 없다.

## 교체·동시 갱신·응답 유실

성공한 갱신마다 Refresh를 교체한다. 사용한 Refresh가 다시 도착하면 세션 전체를 폐기한다. 난수 원문을 복구하거나 이전 토큰으로 새 토큰을 재전달하는 유예 방식은 두지 않는다. [Refresh 재사용 탐지 원칙](https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2)을 참고한 선택이며 CatchU의 교체·엄격 거부 규칙은 API 명세의 세션 규칙이다.

같은 토큰의 동시 갱신은 잠금 순서상 첫 요청만 발급에 성공할 수 있고, 두 번째 요청은 재사용으로 세션을 폐기한다. 첫 200 응답의 Access도 이후 사용할 수 없다. 갱신 응답을 잃고 이전 쿠키로 재요청해도 재인증이 필요하다. 이 제약을 감추기 위해 재사용 검사를 생략하지 않는다.

로그아웃은 현재 또는 사용된 Refresh로 같은 세션을 찾아 폐기하므로 갱신/로그아웃 경쟁이나 교체 응답 유실 뒤에도 해당 세션을 종료할 수 있다. DB 커밋 후 응답만 잃었다면 같은 쿠키로 로그아웃을 반복해 204와 제거 쿠키를 받는다. DB 실패에는 재시도 여부를 사용자/화면에서 판단하며 서버가 성공으로 보정하지 않는다.

[팀장 PR 검토](https://github.com/JminAILab/CatchU/pull/269#pullrequestreview-5483416011)는 현재 교체·재사용 폐기 방식을 유지할 수 있게 하면서도 **정상 동시 API 호출·다중 탭·브라우저 탭 복원에서는 로그인이 유지돼야 한다**고 정했다. 같은 이전 Refresh를 동시에 보내는 위 서버 시험은 재사용 거부의 검사이며 정상 다중 탭 사용의 로그인 유지 증거가 아니다. #251의 공통 인증에서 탭 내부의 갱신 중복 방지와 탭 사이의 순서 제어·결과 반영을 연결한다. web 처리로 기준을 충족하지 못하면 서버 보완(유예 등)을 함께 검토할 수 있으나 이번 문서로 채택하지 않는다.

이번 검토에서 확정된 #250 서버 수정 요구는 발견하지 못했다. 앞으로도 서버 보완이 불필요하다고 확정한 것은 아니다.

[화면 담당 의견](https://github.com/JminAILab/CatchU/issues/250#issuecomment-6110641249)과 [API 담당의 최신 답변](https://github.com/JminAILab/CatchU/issues/250#issuecomment-6115494725)은 입력 보존·재인증·늦은 응답 처리의 연결 기준을 맞춘 기록이다. 서버 갱신 완료 후 새 쿠키 반영 전에 탭 이동·종료 등으로 응답을 잃은 경우도 수용한 **갱신 응답 유실 후 재인증** 한계로 이해하고, 이전 Refresh를 반복 전송하는 대신 입력을 보존해 안내한다. 정상 사용의 중복 갱신을 이 한계에 포함하지 않는다. 실제 브라우저 검증이나 PR 승인 기록으로 확대하지 않는다.

오류 응답과 처리 결과 불명은 다음과 같이 구분한다.

| 확인한 결과 | 현재 구현·시험의 의미 | 화면 연결 기준 |
|---|---|---|
| 정확한 Origin·입력 거부 응답(403·400) | 갱신·폐기 전에 거부하며 쿠키와 세션을 변경하지 않는다 | 인증 만료와 섞지 않고 설정·입력 오류를 처리한다 |
| API 트랜잭션에서 롤백이 확인되는 DB 조회·저장·서명·커밋 실패의 500 | 성공·새 쿠키·제거 쿠키를 보내지 않는다. 저장 중 제약 실패·지연 커밋 실패 시험은 이전 Refresh와 세션 보존을 확인한다 | 롤백 보장 오류의 재시도는 별도로 판단한다. 구체 허용 조건·횟수·공통 호출 분기는 연결 검토 사항이다 |
| Refresh 재사용 등의 401 | 재사용은 **폐기를 커밋한 뒤** 거부한다. 모든 오류가 롤백인 것은 아니다 | 이전 Refresh를 반복하지 않고 재인증 처리한다 |
| 응답을 받지 못함·갱신 성공 결과를 확인할 수 없음 | 서버 커밋과 브라우저 쿠키 반영 여부를 알 수 없다 | 롤백으로 추정하지 않는다. 입력 보존·재인증 안내를 적용하며 정상 다중 탭 사용과 구분한다 |

상태 500만으로 프록시·통신 단절·DB 커밋 결과 불명까지 롤백을 보장한다고 확대하지 않는다. 현재 시험은 오류를 주입해 실제 롤백을 확인한 조건의 증거다. 변경 요청(분석·생성 등)은 갱신·재인증 후 자동 재전송하지 않는다.

로그아웃 실패·응답 유실은 완료로 표시하지 않고 화면·입력을 유지하며, 종료 확인 중에는 갱신·보호 동작을 보류한다. 같은 로그인 세션의 Access 갱신은 화면·작성 중 입력을 보존한다. 로그아웃·새 로그인·회원 전환 이후 이전 갱신·조회 응답이 로그인이나 이전 자료를 복원하지 않도록 처리한다. 로그아웃이 먼저 커밋했는데 늦은 갱신 응답이 쿠키를 다시 설정해도 서버 세션은 폐기돼 사용할 수 없다. 서버의 폐기 유지가 web의 늦은 응답 무시·입력 보존을 대신하지는 않는다.

## 회원·로그인 세션 식별의 미결

web 인증 세대와 탭 간 전환 알림을 **우선 검토할 방향**으로 기록한다. 같은 로그인 세션의 Access 갱신, 로그아웃 후 같은 회원의 새 로그인, 다른 회원으로의 전환을 구분해야 한다. 단순 갱신은 입력을 유지하고, 새 로그인은 이전 요청·늦은 응답과 구분하며, 회원 전환은 이전 회원 자료·요청 참조·생성 요청 키를 재사용하지 않는다.

`GET /v1/me`의 회원 ID로 다른 회원 여부는 확인할 수 있지만 같은 회원의 새 로그인은 식별할 수 없다. 회원 조회 실패를 같은 회원으로 간주하지 않는다. 탭 간 알림을 놓친 탭과 복원된 탭도 현재 로그인 상태를 확인할 수 있어야 한다. 새로고침 후 세션 확인이 끝나기 전에는 로그인 화면 이동을 보류한다.

현재 로그인·갱신 응답에는 web용 세션 식별 필드가 따로 없다. JWT 안의 `sid`는 서버 내부 형식이며 web 연결 계약으로 직접 해석하도록 채택하지 않는다. 인증 세대·탭 알림으로 위 조건을 처리할 수 있는지 확인하고, 부족하면 서버가 제공할 식별 정보·응답 계약을 API와 화면 담당자가 함께 정한다. 추가 식별 정보의 불필요·필요 여부와 형식은 미결이다.

## API 연결안

| 요청 | 입력 | 성공 | 거부·실패 |
|---|---|---|---|
| 기존 Google·개발 로그인 | 기존 입력 유지 | `{accessToken, tokenType: "Bearer", expiresIn: 900}`, Google은 기존 이름 제안도 유지. `Set-Cookie`로만 Refresh 전달 | 기존 인증·입력·실행 제한 유지. DB/커밋 실패는 500 |
| `POST /v1/auth/refresh` | 정확한 `Origin`, Refresh 쿠키, 빈 본문/`{}`. Access 불필요 | 기존 Access 응답 + 교체 쿠키 | 자격정보 없음·변조·만료·폐기·재사용은 `401 AUTH_INVALID`와 쿠키 제거. Origin 거부는 `403 AUTH_ORIGIN_FORBIDDEN`이며 쿠키 미변경. DB 실패는 500 |
| `POST /v1/auth/logout` | 정확한 `Origin`, 현재 또는 사용된 Refresh 쿠키. Access 불필요 | 폐기 커밋 후 `204`, 빈 본문, 쿠키 제거 | Origin 거부는 전용 403. DB 실패는 500, 쿠키 미변경 |

두 새 경로는 회원 Access 검사 대신 Origin·Refresh로 보호하는 메서드 단위 `@Public()`이다. 추가 body/query는 기존 `400 VALIDATION_FAILED`로 거부하며 토큰을 소비하지 않는다. 모든 성공·거부·실패에 기존 `Cache-Control: no-store`를 적용한다. 원문 토큰·해시·SQL·외부 오류를 응답 오류나 로그에 담지 않는다.

Origin 검사를 통과한 로그아웃은 쿠키 없음·알 수 없는/잘못된 쿠키·이미 종료·만료된 세션에도 204와 제거 쿠키를 보낸다. 쿠키가 없으면 특정 세션을 찾을 수 없으며 다른 세션을 추정해 종료하지 않는다. 따라서 화면은 쿠키 없는 204만으로 별도 보관 Access가 속한 세션 폐기를 확인했다고 해석하지 않는다. 같은 이름의 중복 쿠키는 임의 선택하지 않으며 갱신은 거부한다.

## 쿠키·Origin·운영과 로컬

쿠키 이름은 `catchu_refresh`, Path는 `/v1/auth`이다. 로그인·갱신·로그아웃의 동일 경로에서 설정/제거하고 일반 회원 API로 Refresh가 전송되는 범위를 줄인다. Path는 보안 경계의 대체 수단이 아니다. `HttpOnly`, `SameSite=Strict`, Domain 생략(host-only), 만료는 `min(세션 절대 만료, 마지막 정상 갱신+24시간)`이다. 제거할 때도 같은 이름·Path·속성을 사용하고 `Max-Age=0`과 과거 Expires를 보낸다([쿠키 속성](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)).

- 운영: `NODE_ENV=production`, `AUTH_WEB_ORIGIN=https://정확한-web-출처`, `CORS_ALLOWED_ORIGINS`는 공란. web/API 동일 출처에 API `/v1`을 제공한다. HTTPS 쿠키는 항상 `Secure`이다. Wildcard·끝 슬래시·null·Origin 누락은 허용하지 않는다. 요청 Host나 전달 헤더로 허용 Origin을 만들지 않는다.
- 개발·test: `AUTH_WEB_ORIGIN` 기본은 `http://localhost:3000`. HTTP는 localhost·127.0.0.1·::1 loopback에만 허용하며 이때만 Secure를 생략한다. 같은 호스트·스킴으로 web/API를 열어야 한다. `localhost`와 `127.0.0.1`을 섞지 않는다. 다른 포트에서 호출하면 정확한 개발 CORS 출처와 `credentials: "include"`가 필요하다. 허용된 개발 CORS는 credentials를 지원하지만 갱신·로그아웃은 별도의 정확한 AUTH_WEB_ORIGIN 검사도 수행한다.
- `AUTH_ACCESS_TOKEN_TTL_SECONDS=900`은 필수다. 15분 정책과 다른 값이면 기동 실패한다. 세션 7일·24시간은 사용자 결정의 고정값이며 임의로 줄이거나 연장하는 환경설정은 두지 않는다.
- Strict는 OAuth 복귀 문제를 아직 확인하지 않아 그대로 적용한다. 실제 브라우저에서 문제가 확인되면 근거와 함께 팀장이 허용한 Lax 전환을 검토한다. 현재 구현에는 자동 전환이나 None 완화가 없다.

설정 전체 목록은 [환경변수](environment.md), 설치·DB 준비는 [README](../README.md)를 따른다. 기존 .env·전역 설정·다른 DB는 변경하지 않는다.

## 안전한 재현과 검증 경계

로컬 개발 로그인은 기존 명시 활성화 조건을 유지한다. 실제 Google 로그인은 기존 [Google 안내](google-login.md)를 따른다. 보호 API는 Bearer Access만 사용하며 쿠키로 회원 ID를 대체하지 않는다.

PowerShell 7에서 응답과 쿠키를 변수로만 보관한다. 아래는 같은 호스트의 로컬 HTTP 검사 예시다. 먼저 기존 터미널 설정을 기록하고 검토 후 복원한다. 비밀 키는 기존 안전한 설정을 사용하고 출력하지 않는다.

```powershell
$api='http://localhost:3001'
$headers=@{Origin='http://localhost:3000'} # AUTH_WEB_ORIGIN과 정확히 같게
$login=Invoke-RestMethod -Method Post -Uri "$api/v1/auth/dev-login" -ContentType application/json -Body '{"memberId":"session-review"}' -SessionVariable browser
$me=Invoke-RestMethod -Uri "$api/v1/me" -Headers @{Authorization="Bearer $($login.accessToken)"}
$renewed=Invoke-RestMethod -Method Post -Uri "$api/v1/auth/refresh" -Headers $headers -WebSession $browser
$ended=Invoke-WebRequest -Method Post -Uri "$api/v1/auth/logout" -Headers $headers -WebSession $browser
$ended.StatusCode -eq 204 # 이후 이전 Access의 보호 API 호출은 401
Remove-Variable login,me,renewed,ended,browser
```

쿠키·응답 원문·Access·서명 키를 출력하거나 이슈/PR에 붙이지 않는다. 위 HTTP 클라이언트 검사는 브라우저의 SameSite·Secure 저장/전송 검증이 아니다. 실제 브라우저 재현은 #251 연결 시 Network 원문을 공유하지 않고 성공/거부 결과만 기록한다.

자동 검사는 `test/db/auth-session-api.test.cjs`에서 실제 Nest API·전용 PostgreSQL을 사용한다. 회원 자료는 개발 대역이며 외부 Google 교환은 기존 Google API 테스트의 합성 제공자로 검사한다. 세션 시각은 주입된 시계를 고정해 경계를 확인한다. DB 오류·제약/지연 커밋 실패와 동일 검사 프로세스에서 Nest 앱·HTTP 서버 종료 후 재기동을 구분해 검사한다. 운영 프로세스 재배포나 실제 브라우저 검사는 수행하지 않는다. 기존 NUL·서로게이트·프로필 입력·공유 링크 검사는 전체 API 회귀에 포함한다.

2026-10-08의 실제 Google 로그인·반복 로그인·프로필 보존 사용자 재현은 #249/PR #257의 이전 판본 기록이다. 이번 세션/쿠키 연결 판본의 실제 Google 로그인·브라우저 쿠키·다중 탭 재검증 결과로 확대하지 않는다. [기존 제품 판본의 CI 기록](https://github.com/JminAILab/CatchU/actions/runs/38128565848)은 API·문서 크기 통과와 경로 조건으로 생략된 web·worker·의존성 검사를 구분한다. dev 통합 후 직접 검사와 새 HEAD CI 결과는 [PR #269 검사 기록](https://github.com/JminAILab/CatchU/pull/269)에서 실행 판본과 함께 확인한다.

실제 브라우저 검증은 다음 준비와 순서가 필요하다. 아래는 실행 계획이며 통과 기록이 아니다.

1. 위 접점 합의를 기준으로 API·web 담당자가 검증할 판본과 남은 세부 접점·세션 식별 미결을 확인한다. [확인한 dev의 web 판본](https://github.com/JminAILab/CatchU/tree/4c50c44900074a70d43417d38a053a42c1a86ff1/web)은 Google 진입 연결 전, `credentials: "omit"`, 회원 인증 401에서 토큰 제거, 토큰 변경 때 자산·링크 화면 재생성 방식이다. 이후 판본은 해당 코드를 다시 확인하며 API만 연결해 전체 #251 동작이 구현됐다고 보지 않는다.
2. 전용 검증 DB와 앱을 분리해 준비한다. 이번 세션 마이그레이션이 적용된 API와 #251 연결 web을 사용하고, 기존 DB·.env·서명 키·다른 작업 서버를 덮어쓰지 않는다. 자동 검사를 재실행할 때도 전용 TEST_DB를 사용한다.
3. web/API 호스트·스킴을 맞추고 AUTH_WEB_ORIGIN을 정확히 지정한다. 서로 다른 로컬 포트라면 개발 CORS 허용 출처와 인증 요청의 쿠키 포함을 맞춘다. 운영 동일 출처·Secure·Strict 조건의 HTTPS 확인은 로컬 HTTP 검사와 따로 한다.
4. 사용자가 본인 Google 개발 앱·테스트 계정·정확한 redirect URI·로컬 비밀 설정을 준비하고 브라우저에서 실제 승인·복귀한다. PowerShell 로그인만으로 브라우저 쿠키 저장·전송을 검증했다고 기록하지 않는다.
5. 쿠키 속성·인증 경로 전송, 정상 Origin과 누락·불일치 거부, OAuth 복귀 직후 세션 확인·갱신·보호 API를 확인한다. Strict에서 실제 문제가 확인되면 팀장이 허용한 Lax 전환을 근거와 함께 검토한다.
6. 합성 미저장 입력으로 동시 API 401·여러 탭·브라우저 탭 복원·새로고침 복원을 재현한다. 로그인 유지와 같은 세션 갱신 때 화면·입력 보존을 확인한다.
7. 갱신 응답을 쿠키 반영 전에 잃는 조건과 롤백 보장 오류 응답을 구분해 재현한다. 단순 브라우저 오프라인 전환만으로 서버 커밋 후 응답 유실을 입증하지 않는다. API·화면 담당자가 안전한 지연/응답 차단 방법과 판정 증거를 준비한다. 응답 유실 때 입력 보존·재인증과 변경 요청 자동 재전송 금지를 확인한다.
8. 로그아웃 성공·실패·응답 유실·반복 요청, 갱신과의 경쟁, 같은 회원 새 로그인·다른 회원 전환·알림을 놓친 탭·복원 탭의 늦은 응답 무시를 확인한다. 다른 기기 세션 유지와 쿠키 없는 204의 해석도 확인한다.
9. 판본·브라우저/환경·사례별 기대/실제 결과·미확인을 기록한다. 계정·회원 자료·토큰·쿠키·OAuth query·Network 원문은 공유하지 않는다. 프로세스 재배포·AWS 실제 배치 검증은 로컬 재기동 및 브라우저 검사와 구분한다.
