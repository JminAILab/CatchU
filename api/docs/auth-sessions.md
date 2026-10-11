# 세션 유지·갱신·로그아웃 — #250

## 적용 기준과 범위

[팀장 결정](https://github.com/JminAILab/CatchU/issues/250#issuecomment-6097542703)에 따라 Access 15분, 세션 생성부터 최대 7일, 마지막 정상 Refresh 갱신부터 24시간을 적용한다. 최초 갱신 전에는 생성 시각을 사용하며 갱신으로 7일을 연장하지 않는다. 사람이 조작하지 않는 시간을 별도로 감지하지 않는다. 자동 갱신으로 24시간 기준은 연장될 수 있다.

로그아웃은 현재 브라우저가 쿠키로 공유하는 세션만 종료한다. 다른 기기의 세션은 유지한다. 동일 브라우저 탭들은 같은 쿠키를 사용한다. Google·개발 로그인 모두 세션을 저장한 후 Access JWT와 Refresh 쿠키를 발급한다. JWT에는 회원 UUID와 세션 UUID가 들어가며, 공통 Guard는 서명·만료 검증 후 DB의 해당 세션·회원 ACTIVE 상태를 확인한다. 세션 ID 없는 기존 토큰은 재로그인이 필요하다. 인증 통과가 GitHub 연결·분석 동의·자원 소유권을 보장하지는 않는다.

API 경로·응답·새 오류 코드와 저장 모델은 팀장이 담당자에게 맡긴 설계를 구현한 **연결 검토안**이다. 공식 API 명세 승인이나 실제 화면 연결 완료가 아니다. 승인 문서는 수정하지 않는다. 화면 연결은 [#251](https://github.com/JminAILab/CatchU/issues/251), 기존 호출 기반은 [#106](https://github.com/JminAILab/CatchU/issues/106)과 맞춘다.

## 저장과 트랜잭션

- `auth_session`: UUID·회원 FK·생성 시각·절대 만료·마지막 정상 갱신 시각·폐기 시각. 최초 마지막 갱신 시각은 생성 시각이다.
- `session_refresh_token`: UUID·세션 FK·난수 32바이트 토큰의 SHA-256 해시·생성/사용 시각. 원문은 저장하지 않는다. 사용한 해시를 유지해 재사용·응답 유실 후 종료를 판단한다. 세션당 미사용 토큰 한 개의 부분 유일성 제약을 둔다.
- Google 회원 연결·프로필 준비·세션·최초 Refresh 저장과 Access 서명은 같은 `EntityManager`에서 처리한다. 개발 회원 준비도 같은 트랜잭션을 사용한다. 최종 커밋 후에만 Access와 쿠키를 응답한다.
- 갱신·로그아웃은 같은 세션 행을 `FOR UPDATE`로 잠근 뒤 토큰 상태를 다시 읽는다. 갱신은 기존 토큰 사용 표시·새 토큰 저장·정상 갱신 시각 변경을 한 트랜잭션으로 처리한다.
- 사용된 토큰의 재사용은 해당 세션을 폐기한다. 폐기를 커밋한 뒤 401을 반환해 거부 예외가 폐기를 롤백하지 않게 한다. DB 조회·저장·서명·커밋 실패는 기존 공통 `500 INTERNAL_ERROR`로 처리하고 성공 응답·새 쿠키·쿠키 제거를 보내지 않는다.
- 로그아웃 이후 시작한 보호 API와 갱신은 거부한다. 이미 Guard를 통과해 실행 중인 업무 요청을 취소하는 기능은 포함하지 않는다.

마이그레이션은 기존 회원 기반 이후 `CreateAuthSessions1791648335731`을 적용한다. `npm run migration:generate`로 생성했고 전용 DB에서 적용→되돌리기→재적용을 확인한다. 기존 DB에서 초기화·기존 마이그레이션 수정은 하지 않는다. 만료 세션·사용 기록의 정기 삭제 작업은 이번 범위에 없다.

## 교체·동시 갱신·응답 유실

성공한 갱신마다 Refresh를 교체한다. 사용한 Refresh가 다시 도착하면 세션 전체를 폐기한다. 난수 원문을 복구하거나 이전 토큰으로 새 토큰을 재전달하는 유예 방식은 두지 않는다. [Refresh 재사용 탐지 원칙](https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2)을 참고한 선택이며 CatchU의 교체·엄격 거부 규칙은 이번 연결 검토안이다.

같은 토큰의 동시 갱신은 잠금 순서상 첫 요청만 발급에 성공할 수 있고, 두 번째 요청은 재사용으로 세션을 폐기한다. 첫 200 응답의 Access도 이후 사용할 수 없다. 갱신 응답을 잃고 이전 쿠키로 재요청해도 재인증이 필요하다. 이 제약을 감추기 위해 재사용 검사를 생략하지 않는다.

로그아웃은 현재 또는 사용된 Refresh로 같은 세션을 찾아 폐기하므로 갱신/로그아웃 경쟁이나 교체 응답 유실 뒤에도 해당 세션을 종료할 수 있다. DB 커밋 후 응답만 잃었다면 같은 쿠키로 로그아웃을 반복해 204와 제거 쿠키를 받는다. DB 실패에는 재시도 여부를 사용자/화면에서 판단하며 서버가 성공으로 보정하지 않는다.

여러 탭의 갱신 직렬화, 갱신 응답 유실 후 재인증, 로그아웃 후 늦은 응답 무시, 화면·미저장 입력 보존은 #251에서 검토한다. @csyg0616의 답변 없음은 동의가 아니다. 로그아웃이 먼저 커밋했는데 늦은 갱신 응답이 쿠키를 다시 설정해도 서버 세션은 폐기돼 사용할 수 없다.

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

2026-10-08의 실제 Google 로그인·반복 로그인·프로필 보존 사용자 재현은 #249/PR #257의 이전 판본 기록이다. 이번 세션/쿠키가 연결된 최종 판본에서 실제 Google 로그인·브라우저 쿠키·다중 탭을 재검증한 결과로 확대하지 않는다. 해당 실제 재현과 #251 화면 연결은 남은 검토 사항이다.
