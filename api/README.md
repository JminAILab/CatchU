# api — API 서버

NestJS로 만드는 첫 MVP의 API 서버다. 인증·회원·프로필·GitHub 연동, 분석 요청·작업 상태, 본인 자산 조회·공개/숨김, 공유 링크·수신자 접근을 다룬다. 수집·분석 처리는 worker와 연결한다. 세부 범위는 [MVP 범위 문서](../aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/scope-definition/scope-document.md)와 해당 작업의 합의된 기준을 확인한다.

현재 구현은 외부 서비스 연결 없이 실행되는 `GET /health`와 [#87 API 인증 기반](https://github.com/JminAILab/CatchU/issues/87)이다. 모든 API에 공통 인증 Guard를 적용하며, 명시한 공개 경로만 제외한다. 실제 로그인·회원 DB·제품 기능·worker 연결은 후속 작업이다.

## 작업 시작

- [공통 작업관리](../docs/CatchU_작업관리.md)를 읽고 해당 이슈의 범위·완료 기준·관련 계약을 확인한다.
- api 초기화 담당이 모든 API 기능·결함을 맡는 것은 아니다. 기능 담당자가 api와 web을 함께 수정할 수 있으며, 각 작업의 책임·연결 상대는 이슈에서 확인한다.
- 착수·브랜치·기술·검사 기준은 [코딩 운영](../docs/CatchU_작업관리.md#코딩-운영)을 따른다. [아키텍처 검토초안 PR #70](https://github.com/JminAILab/CatchU/pull/70)은 설계 입력으로 참고한다.

## 초기화 기준과 도구

- 관련 작업: [상위 이슈 #81](https://github.com/JminAILab/CatchU/issues/81), [API 초기화 #83](https://github.com/JminAILab/CatchU/issues/83).
- 최초 브랜치 생성 기준: `13f03276c06616e7c95fceb80b870a1491ce17ac`.
- 실제 구현 시작 기준: `272905bb184db7335c96ec1782817897f0afa9ab` (`api/init`).
- 구현 시작 기준에 포함된 PR #92의 `project.md`·`team.md` 변경은 유지한다. 이번 API 초기화에서 직접 수정한 내용과 구분한다.

| 도구                                    | 사용 버전                       |
| --------------------------------------- | ------------------------------- |
| Node.js / npm                           | `24.21.0` / `11.19.0`           |
| NestJS common·core·platform-express     | `12.0.4`                        |
| TypeScript / ts-node                    | `5.9.3` / `10.9.2`              |
| ESLint / @eslint/js / typescript-eslint | `10.11.0` / `10.0.1` / `8.70.1` |
| jose (Access JWT 서명·검증)            | `6.2.12`                       |

직접 의존성은 `package.json`, 전이 의존성을 포함한 설치본은 `package-lock.json`으로 고정한다. 전역 Nest CLI나 루트 workspace는 필요하지 않다.

초기 NestJS 11 의존성에서 보고된 multer 취약점을 해소하기 위해 NestJS 12로 갱신했다. 현재 잠금 파일의 multer는 `2.4.0`이다. ESLint도 10으로 갱신하고 기존 flat config를 유지했다. Node.js 24.21.0과 TypeScript 5.9.3·typescript-eslint 8.70.1의 호환 범위를 확인했으며 실제 검사·실행 결과는 아래에 기록한다. `--force`·`--legacy-peer-deps`는 사용하지 않았다.

호환성 참고: [NestJS 마이그레이션](https://docs.nestjs.com/migration-guide), [ESLint 10 마이그레이션](https://eslint.org/docs/latest/use/migrate-to-10.0.0), [typescript-eslint 의존성 범위](https://typescript-eslint.io/users/dependency-versions/). NestJS 12는 ESM 배포이지만, 이 프로젝트는 지정 Node.js의 ESM 로딩 지원으로 CommonJS 빌드·실행을 유지한다.

## 설치와 환경변수

이하 명령의 실행 폴더는 `api/`이다. Windows PowerShell에서 `npm.ps1` 실행 정책에 막히면 같은 명령을 `npm.cmd`로 실행한다.

```powershell
cd api
node -v
npm -v
npm ci
```

인증 기반 추가 후에는 서명 키와 토큰 수명이 필수다. `.env.example`에는 실제 키나 기본 서명 키를 제공하지 않는다. 아래처럼 터미널 환경에 준비하거나, 예시를 참고해 로컬 `api/.env`를 작성한다. 기존 `.env`가 있다면 덮어쓰지 않는다. 필수 설정이 누락되거나 형식이 잘못되면 서버가 실패 종료하므로 `/health`도 기동되지 않는다.

| 구분 | 이름   | 기본값 | 의미                             |
| ---- | ------ | ------ | -------------------------------- |
| 선택 | `PORT` | `3001` | HTTP 포트. 정수 `1~65535`만 허용 |
| 필수 | `AUTH_JWT_SECRET` | 없음 | 안전한 난수 32바이트를 64자리 hex로 표현한 서명 키. 환경별로 별도 준비 |
| 필수 | `AUTH_ACCESS_TOKEN_TTL_SECONDS` | 없음 | Access JWT 수명(초). 양의 안전한 정수이며 현재 시각과 합산 가능해야 함 |
| 선택 | `DEV_LOGIN_ENABLED` | 비활성 | 정확히 `true`일 때만 개발 로그인 활성화 요청 |
| 선택 | `NODE_ENV` | 미지정 | 운영 배포에서는 반드시 `production`. 개발 로그인 플래그보다 우선하여 거부 |

실행 명령이 `.env`를 읽으며, 이미 터미널 환경에 지정된 값이 우선한다. DB·큐·worker 설정은 필요하지 않다. `.env`·의존성·빌드 결과를 제외하는 기존 `.gitignore`를 유지한다. 키를 바꾸면 이전 키로 발급한 토큰은 사용할 수 없다.

PowerShell에서 로컬 검토용 설정을 준비하는 예시다. 생성한 키는 변수에만 받아 화면에 출력하지 않는다. `900`초는 이 재현의 예시이며 제품의 최종 수명 정책이 아니다.

```powershell
$env:AUTH_JWT_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:AUTH_ACCESS_TOKEN_TTL_SECONDS = '900'
$env:NODE_ENV = 'development'
$env:DEV_LOGIN_ENABLED = 'true'
```

운영 비밀값은 배포 환경의 비밀 관리 수단으로 주입한다. 실제 키·토큰·Authorization 헤더를 파일 예시, 터미널 출력, 로그, 이슈, PR, 화면 캡처에 넣지 않는다. 요청/응답 전체를 기록하는 디버그·HTTP 상세 출력도 사용하지 않는다. 위 환경변수는 현재 터미널의 자식 프로세스에만 전달된다.

## 개발 실행·응답 확인·종료

```powershell
npm run start:dev
```

기본 주소는 `http://127.0.0.1:3001`이다. Node watch가 소스 변경 시 재시작한다. 별도 터미널에서 다음을 실행한다.

```powershell
curl.exe -i http://127.0.0.1:3001/health
```

기대 결과는 HTTP `200`, JSON 본문 `{"status":"ok"}`이다. 이 경로는 외부 서비스를 호출하지 않으며 DB·큐·worker의 준비 상태나 버전·환경정보를 반환하지 않는다.

서버를 실행한 터미널에서 `Ctrl+C`로 종료한다. Windows에서 일괄 작업 종료 확인이 나오면 `Y`를 입력한다. watch 프로세스도 종료해야 자동 재실행이 멈춘다.

## 검사와 빌드 후 실행

| 명령                | 확인 범위                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`      | ESLint 정적 검사. 경고도 실패 처리                                                                                   |
| `npm run typecheck` | 산출물 생성 없이 TypeScript 타입 검사                                                                                |
| `npm test`          | 빌드 후 `test/**/*.test.cjs` 전체 탐색. health·인증 HTTP 테스트 및 실제 main 진입점의 설정 로딩/기동 실패 검사. 서버·임시 설정은 검사 후 정리 |
| `npm run build`     | `src/`를 `dist/`로 컴파일                                                                                            |
| `npm start`         | `dist/main.js` 실행. 먼저 빌드 필요                                                                                  |

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

빌드 후 실행도 개발 실행과 같은 주소·응답을 확인하고 같은 방법으로 종료한다. 개발 서버와 빌드 서버를 같은 포트에서 동시에 실행하지 않는다. 테스트는 실제 로컬 HTTP를 호출하며, 외부 서비스·제품 기능·소유권·DB·worker 연결 검증은 포함하지 않는다. 테스트는 매번 무작위 키를 생성하므로 개발자의 `.env`나 실제 비밀값이 필요하지 않다.

[#95 후속 참고](https://github.com/JminAILab/CatchU/pull/95)에 따라 기존 빌드를 유지하면서 하위 폴더까지 테스트 탐색을 확대했다. `test/runtime/bootstrap.test.cjs`는 실제 소스/빌드 진입점을 실행해 env 파일 적용, 터미널의 운영 환경 설정 우선, 필수 인증 설정 누락·공란·잘못된 수명에 따른 실패 종료를 검사한다. 개발 watch의 자동 재시작과 배포 바인딩 변경은 이번 추가 검사 범위가 아니다.

## 파일 역할과 모듈 추가 위치

| 파일                                    | 역할                                               |
| --------------------------------------- | -------------------------------------------------- |
| `package.json` / `package-lock.json`    | 실행·검사 명령, 도구 버전, 재현 가능한 의존성 설치 |
| `src/main.ts`                           | 환경변수 검사, HTTP 서버 시작, 종료 훅             |
| `src/app.module.ts`                     | 최상위 Nest 모듈과 기능 모듈 연결                  |
| `src/health/health.controller.ts`       | `GET /health` 응답                                 |
| `src/auth/auth.module.ts`              | 인증 설정과 토큰 서비스, 전역 `APP_GUARD` 등록 |
| `src/auth/access-token.guard.ts`       | Bearer 토큰 검증 후 요청에 인증 회원 정보 저장 |
| `src/auth/auth.decorators.ts`          | `@CurrentMemberId()` 접근자와 `@Public()` 제외 표시 |
| `src/auth/access-token.service.ts`     | JWT 서명·검증과 필수 claim 검사. 기능 코드와 분리 |
| `src/auth/auth.config.ts`              | 인증 환경설정 검증. 기본 키 없음, 운영 개발 로그인 차단 |
| `src/auth/dev-login.controller.ts`     | 개발용 토큰 발급. 기본 비활성, 회원 DB 조회 없음 |
| `test/health.test.cjs`                  | 빌드된 앱의 최소 HTTP 실행 검사                    |
| `test/auth.test.cjs`                    | 테스트 안에만 보호 컨트롤러 구성, 인증 정상·거부 및 로그 비노출 검사 |
| `test/runtime/bootstrap.test.cjs`       | 소스/빌드 main의 실제 설정 로딩·기동·실패 종료 검사 |
| `tsconfig.json` / `tsconfig.build.json` | 엄격한 타입 검사, 데코레이터, 빌드 설정            |
| `eslint.config.mjs`                     | TypeScript·JavaScript 정적 검사                    |
| `.env.example`                          | 인증 필수 설정과 실행 선택 설정. 비밀값은 공란 |
| `.gitignore`                            | 로컬 설정·의존성·빌드 결과 제외. 기존 내용 유지    |

후속 기능은 `src/<기능>/`에 모듈·컨트롤러·서비스를 두고 `AppModule`의 `imports`에 해당 모듈을 연결한다. health 컨트롤러에 제품 기능을 추가하지 않는다. 기능별 정상·거부·실패 검사는 해당 이슈의 완료 기준에 맞춰 추가한다.

### B Catch 등록 연결 준비 — #105

[분석 결과를 Catch로 저장하는 연결안](docs/catch-registration-proposal.md)은 E가 B에 넘길 값, B의 반환값, 하나의 트랜잭션으로 저장할 순서와 네 테이블의 작성 분담을 정리한 **검토용 제안**이다. 실행 가능한 등록 함수·DB 구현은 아직 없다. E 담당과의 입출력·분담 확인, #86 DB 기반·#103 합성 자료·#104 선행 테이블에 맞춰 구현한다.

## 인증 기반 사용과 후속 경계 — #87

작업 브랜치는 `api/auth-foundation`, 구현 시작 기준은 `origin/dev`의 `9b67570a0e220a81de2e33f8a8deabb3b8e5d34e`다. 앞의 초기화 기준은 #83의 과거 기록이며 이번 인증 작업 기준과 구분한다.

기준은 [회원 인증 계약 M](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md)과 [#87의 #104 경계 안내](https://github.com/JminAILab/CatchU/issues/87#issuecomment-5815415143)다. `Authorization: Bearer <CatchU Access JWT>`를 검증해 회원 ID를 요청 내부에 저장한다. 현재 토큰 없음·잘못된 서명·만료·필수 식별 값 누락은 일반 NestJS `UnauthorizedException`으로 401을 반환하며, [#88 공통 오류 처리](https://github.com/JminAILab/CatchU/issues/88) 연결은 아직 반영하지 않았다.

#88 담당자가 공통 예외 이름과 사용 예시를 공유하면, 토큰 없음은 `AUTH_REQUIRED`, 변조·만료는 `AUTH_INVALID`로 연결하고 관련 테스트를 보완할 예정이다. `/v1` 전역 설정 연결에 따른 호출 주소·테스트·README 재현 안내도 그때 함께 확인한다. 아래 기존 자동 테스트 통과 기록은 현재 인증 구현에 대한 결과이며, #88 연결 후 통합 검증은 아직 수행하지 않았다.

기능 컨트롤러에는 Guard를 다시 붙일 필요가 없다. `@CurrentMemberId()`만 사용하며 JWT claim, 개발 로그인 플래그, 요청 body/query의 회원 ID에 의존하지 않는다. 이 인증 통과는 회원 행의 존재, GitHub 연동, 분석 동의, 자원 소유권을 보장하지 않는다. 각 후속 기능에서 해당 계약에 따른 검사가 필요하다.

인증 없이 허용할 메서드에만 다음처럼 표시한다. 컨트롤러 클래스에 붙이면 그 클래스 전체가 공개되므로 범위를 신중히 선택한다. `/health`는 메서드에 명시되어 있다.

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';

@Controller('example-public')
export class ExamplePublicController {
  @Public()
  @Get()
  read() { return { public: true }; }
}
```

개발 전용 `POST /auth/dev-login`은 JSON `{ "memberId": "검토용-회원-ID" }` 하나만 받아 `accessToken`, `tokenType: "Bearer"`, `expiresIn`(초)을 반환한다. 비어 있거나 공백인 ID·다른 타입·추가 필드는 400이다. 기본 비활성 및 `NODE_ENV=production`에서는 403이며 토큰을 발급하지 않는다. 설정 변경은 서버 재시작 후 반영된다. 공개 경로 표시가 있어도 이 개발 로그인 차단 조건을 먼저 검사한다.

현재 내부 토큰 구현은 HS256, 발급자 `catchu-api`, 대상 `catchu-member-api`, `sub` 회원 ID와 `iat`·`exp`를 서명·검증한다. 서명 알고리즘을 제한하고 비어 있는/공백 회원 ID, 누락된 만료·발급 시각, 잘못된 대상·발급자도 거부한다. 이는 #87 개발 기반의 내부 형식이며 기능 코드의 의존 대상이나 실제 OAuth 발급 계약이 아니다. 토큰 원문과 검증 라이브러리의 상세 오류는 로그·오류 응답에 포함하지 않는다.

[#104](https://github.com/JminAILab/CatchU/issues/104)에서 개발 로그인에 받은 ID와 회원 행을 연결한다. 지금은 받은 ID를 그대로 사용하는 대역이며 회원·프로필 행 생성, DB 조회, 개발 GitHub 연동 대역은 없다. 이 연결을 바꿔도 기능 코드의 `@CurrentMemberId()` 사용 방식은 유지한다. 실제 Google/GitHub 로그인, Refresh Token·재발급·로그아웃, 소유권 검사, 쿠키·CORS·CSRF와 실제 발급 정책은 이번 범위 밖이다.

## 검토자 재현 — README만 보고 보호 API 추가·호출

아래 절차는 **다른 팀원의 실행 확인이 아직 필요**하다. 자동 테스트의 보호 컨트롤러는 테스트 프로세스에만 있으므로 일반 개발 서버에서 호출할 제품 API를 추가한 것으로 보지 않는다.

1. 별도 검토 작업본에서 위 설치·인증 설정 준비를 수행한다.
2. 검토용 `src/auth-check/auth-check.controller.ts`를 아래 내용으로 만들고, `AppModule`에 해당 클래스를 import해 기존 `controllers` 배열에 추가한다. 기존 `imports: [AuthModule]`와 health는 유지한다. 실제품 기능은 해당 기능 모듈에 같은 접근자를 사용한다.

```typescript
import { Controller, Get } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';

@Controller('auth-check')
export class AuthCheckController {
  @Get()
  read(@CurrentMemberId() memberId: string) {
    return { memberId };
  }
}
```

3. `npm run start:dev`로 실행한다. 별도 PowerShell에서 아래 명령을 실행한다. 실제 토큰 문자열을 명령 인수에 붙여 넣거나 출력하지 않고 변수로 전달한다.

```powershell
# 토큰 없이 보호 경로: HTTP 401 확인
try {
  Invoke-RestMethod -Uri http://127.0.0.1:3001/auth-check
} catch {
  Write-Output ('HTTP ' + [int]$_.Exception.Response.StatusCode)
}

# 개발 로그인 응답 전체를 출력하지 않는다.
$authReply = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/auth/dev-login `
  -ContentType 'application/json' -Body '{"memberId":"review-member-87"}'
$authHeaders = @{ Authorization = 'Bearer ' + $authReply.accessToken }
try {
  Invoke-RestMethod -Uri http://127.0.0.1:3001/auth-check -Headers $authHeaders
} finally {
  Remove-Variable authReply, authHeaders -ErrorAction SilentlyContinue
}
```

4. 인증 후 `memberId`가 `review-member-87`인지, 토큰 없이 `/health`는 200인지 확인한다. 아래 검증 전에 `NODE_ENV`와 `DEV_LOGIN_ENABLED`의 기존 값·설정 유무를 터미널 환경변수와 `.env`별로 기록하고, 검토 후 원래 상태로 복원한다. 필수 인증 키와 토큰 수명 설정은 유지하며, 비밀값이나 환경변수 전체를 출력하지 않는다. **기본 비활성화:** 서버를 종료하고 터미널 환경변수와 `.env` 양쪽에서 `DEV_LOGIN_ENABLED`를 제거한 뒤 재시작하여 개발 로그인이 403인지 확인한다. **운영 환경 거부:** 서버를 종료하고 터미널에서 `NODE_ENV=production`, `DEV_LOGIN_ENABLED=true`로 설정한 뒤 재시작하여 개발 로그인이 403인지 확인한다.
5. 검토용 컨트롤러와 등록만 제거하고 검사 명령을 실행한다. 기존 파일은 통째로 되돌리지 않는다. 서버를 `Ctrl+C`로 종료하고 이 재현에서 추가한 환경변수만 정리하거나 터미널을 닫는다. 비밀값·토큰 없이 검토 환경, 검토 판본, HTTP 상태와 ID 일치 여부만 공유한다. 작성자 외 재현 완료 여부는 실제 검토자의 확인을 기다린다.

## 실행 실패 시 확인

- `EADDRINUSE`: 지정 포트가 사용 중인지 확인하고 자신이 실행한 이전 서버를 종료하거나 선택 포트를 바꾼다. 다른 사람의 프로세스를 임의 종료하지 않는다.
- `PORT` 오류: `.env`와 현재 터미널 환경의 값을 확인한다.
- 인증 설정 오류: 오류에 나온 변수 이름을 기준으로 누락·형식을 확인한다. 키·토큰 값은 출력하거나 공유하지 않는다. 개발 로그인 403은 플래그와 운영 환경 차단 조건을 확인한다.
- `dist/main.js` 없음: `npm run build`를 먼저 실행한다.
- 설치·도구 버전 오류: `node -v`, `npm -v`, 실행 경로와 `api/`에서 실행 중인지 확인한다.
- `spawn EPERM`: 테스트·watch의 자식 프로세스 실행을 제한하는 환경인지 확인한다. 검사 설정을 약화하지 않고 실행 권한이 허용된 환경에서 같은 명령을 재실행한다.

## 아직 필요한 입력

| 필요한 입력                                               | 결정할 곳                                                                                        | 결정 전 가능한 작업                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| DB·ORM 세부 설정, 스키마·마이그레이션 방식                | 후속 데이터 설계와 관련 기능·공통 환경 준비 작업                                                 | 필요한 자료·제약과 개발 환경 요구 정리                                         |
| 큐 선정·버전, API↔worker 메시지·오류 계약                 | PR #70의 검증 과제와 후속 계약; 연결 쟁점은 [#23](https://github.com/JminAILab/CatchU/issues/23) | 분석 요청·상태·결과 전달의 의미와 질문 정리                                    |
| 결과 검사·자산 저장·작업 완료 반영, 중복·실패 처리의 책임 | E·B·F 연결 계약과 실제 기능 담당자 간 합의                                                       | 책임 경계·반영 순서의 초안과 미결 정리. api 초기화 담당에게 자동 배정하지 않음 |
| 인증·외부 서비스·DB·큐의 개발·테스트 환경                 | 관련 계약과 공통 환경 준비 작업                                                                  | 필요한 설정·계정·실제 연결 검증 범위 정리                                      |

DB·큐의 공통 준비 방법은 공통 환경 준비 작업에서 마련하고, api 쪽에서는 필요한 접속·실행 조건을 제공한다. 각 사용자는 그 안내로 자신의 환경을 준비한다. DB 모델·마이그레이션·메시지 처리 구현은 해당 기능의 책임과 계약에 따라 나눈다. 연결을 추가할 때 환경변수·공통 준비 안내·실제 및 모의 연결 범위와 자료 변경 명령의 영향을 문서화한다.

서버 로그는 요청 처리·분석 작업 상태·결과 반영·실패를 구분해 확인할 수 있게 준비한다. 로깅 도구와 식별자 전달 형식은 후속 설정·계약에서 정하며, 기록·공유 시 자료 보호는 공통 작업관리를 따른다.

개발 준비 완료는 공통 작업관리의 확인 목록으로 판단한다. 확인한 사람·환경·기준 커밋, 작성자 외 재현 여부와 실제·모의 연결 범위는 초기화 이슈·PR에 남긴다. 로컬 실행 확인과 NCP 배포 검증은 각각 기록한다.

## 로컬 검증 기록 — 2026-09-23

Codex가 Windows 환경에서 위 구현 시작 커밋을 기준으로 작성한 미커밋 `api/` 작업본을 검사했다. 실제 실행 파일은 `C:\Program Files\nodejs\node.exe`, Node.js `v24.21.0`, npm `11.19.0`이었다.

| 검사                                 | 결과                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| `npm ci`                             | 성공. 설치 시 audit 보고 취약점 0건                              |
| `npm run lint` / `npm run typecheck` | 통과                                                             |
| `npm test`                           | 실제 HTTP 검사 1건 통과, 테스트 서버 종료                        |
| `npm run build`                      | 통과                                                             |
| `npm run start:dev` 및 HTTP 조회     | 포트 3001, HTTP 200, `{"status":"ok"}` 확인 후 서버 종료         |
| `npm start` 및 HTTP 조회             | 빌드 결과 실행, 포트 3001, HTTP 200, 같은 본문 확인 후 서버 종료 |
| 임시 미사용 변수                     | lint가 오류로 감지, 종료 코드 1                                  |
| 임시 잘못된 반환 타입                | typecheck가 TS2322로 감지, 종료 코드 2                           |
| 임시 오류 원복                       | 원본 바이트 복원 확인, lint·typecheck·build 재통과               |

제한된 실행 환경에서는 최초 테스트·watch 실행이 `spawn EPERM`으로 실패했다. 자식 프로세스 실행이 허용된 환경에서 동일 명령으로 재실행해 통과했으며, 검사를 생략하거나 기준을 낮추지 않았다. 개발·빌드 검증 서버 종료 후 포트 3001 접속이 거부되는 것도 확인했다.

작성자 외 재현, DB·큐·인증·worker 통합, NCP 배포는 검증하지 않았다. 이번 기록은 이슈 완료나 팀 승인 기록이 아니다. 후속 PR 작성 시 실제 명령·결과는 양식의 `추적 정보`, 수행하지 않은 검사와 한계는 `확인`에 옮긴다.

## #87 로컬 검증 기록 — 2026-09-25

`api/auth-foundation`의 미커밋 작업본을 Windows / Node.js `v24.21.0` / npm `11.19.0`에서 검사했다. Node 실행 경로는 `C:\Program Files\nodejs\node.exe`다. #83의 위 과거 기록과 구분한다.

| 명령·검사 | 결과 |
| --- | --- |
| `npm ci` | 잠금 파일로 설치 성공, 설치 시 취약점 보고 0건 |
| `npm run lint` / `npm run typecheck` | 통과 |
| `npm test` | 빌드 후 하위 폴더를 포함한 자동 테스트 17건 통과 |
| `npm run build` | 통과 |
| 인증 HTTP 검사 | 토큰 없음·변조·만료·필수 식별 값 누락 401, 개발 토큰의 ID 접근, 공개 health, 기본 비활성·운영 개발 로그인 403, 토큰/키 로그 비노출 확인 |
| 실제 소스·빌드 main 실행 | 임시 env 파일로 기동·health 200·토큰 발급 확인. 터미널 production 우선, 필수 인증 설정 오류의 종료 코드 1 확인 |
| 검증 프로세스·임시 설정 | HTTP 테스트 서버 종료, main 자식 프로세스 종료 후 포트 접근 거부, 테스트가 만든 임시 env 파일·폴더 정리 |

최초 `npm test`는 실행 환경의 자식 프로세스 제한으로 `spawn EPERM`이 발생했다. 실행 권한 승인 후 동일 명령으로 통과했고, 테스트 탐색·main 설정 검사를 추가한 뒤 전체를 다시 실행했다. 검사 설정을 약화하거나 자동 센서 결과를 테스트 결과로 대체하지 않았다.

다른 팀원이 README만 보고 보호 API를 추가·호출하는 재현은 아직 미수행이다. 실제 OAuth·회원 DB·소유권·외부 서비스·배포 통합도 이번 검사에 포함하지 않는다. 이번 기록은 #87 완료·승인이나 #104 연결 완료를 의미하지 않는다.
