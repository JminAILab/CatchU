# api — API 서버

NestJS로 만드는 첫 MVP의 API 서버다. 인증·회원·프로필·GitHub 연동, 분석 요청·작업 상태, 본인 자산 조회·공개/숨김, 공유 링크·수신자 접근을 다룬다. 수집·분석 처리는 worker와 연결한다. 세부 범위는 [MVP 범위 문서](../aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/scope-definition/scope-document.md)와 해당 작업의 합의된 기준을 확인한다.

현재 구현은 `GET /health`, [#87 API 인증 기반](https://github.com/JminAILab/CatchU/issues/87), [#88 공통 오류 처리](https://github.com/JminAILab/CatchU/issues/88), [#86 DB 연결·마이그레이션 기반](https://github.com/JminAILab/CatchU/issues/86)이다. 모든 API에 공통 인증 Guard를 적용하며, 명시한 공개 경로만 제외한다. api는 PostgreSQL에 연결된 상태로만 기동한다(「로컬 DB 준비」). [#139 분석 메시지 수신 모듈](https://github.com/JminAILab/CatchU/issues/139)은 저장소 연결 전 독립 로직으로 제공하며 `AppModule`에는 등록하지 않는다. 실제 로그인·기능 테이블(회원 등)·제품 기능·worker 연결은 후속 작업이다.

## 공통 오류 처리 — API 명세 v1

정본은 [API 명세 v1 공통 오류·요청 안전성](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#공통-오류요청-안전성)과 [common.yaml의 Error](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml)다. 오류 본문은 `{code, message, details?}`이며 화면은 문구 대신 `code`로 분기한다. `details`는 `violations: [{field, reason}]`와 `existingRequestId`만 허용한다. 입력값·SQL·stack·토큰을 응답에 넣지 않는다.

| 기본 구분 | HTTP | 코드 |
|---|---|---|
| 입력 | 400 | INVALID_REQUEST, VALIDATION_FAILED |
| 미인증·수신자 비밀번호 | 401 | AUTH_REQUIRED, AUTH_INVALID, LINK_PASSWORD_REQUIRED, LINK_PASSWORD_INVALID |
| 권한·선행 조건 | 403 | GITHUB_CONNECTION_REQUIRED, REPOSITORY_NOT_ALLOWED, CONSENT_REQUIRED |
| 없음·열람 불가 | 404 | RESOURCE_UNAVAILABLE, LINK_UNAVAILABLE |
| 충돌 | 409 | ANALYSIS_IN_PROGRESS, RETRY_NOT_ALLOWED, REANALYSIS_DEFERRED, IDEMPOTENCY_CONFLICT, CONFIRMATION_REQUIRED, SOURCE_RESTRICTED, LINK_TITLE_CONFLICT, LINK_LIMIT_REACHED |
| 서버 오류 | 500 | INTERNAL_ERROR |

기능에서는 `src/common/errors`의 `ApiError`를 던진다. HTTP 상태는 코드에 따라 정해진다.

```typescript
import { ApiError } from '../common/errors'; // 현재 파일 위치에 맞게 상대 경로 조정

throw new ApiError('CONSENT_REQUIRED');
// 진행 중 요청을 안내할 때:
throw new ApiError('ANALYSIS_IN_PROGRESS', { details: { existingRequestId: requestId } });
```

새 오류 코드는 계약 변경 이슈로 상태·의미·문구를 합의한 뒤 `error-codes.ts`의 상태/기본 문구, 이 표, 기능 테스트를 함께 추가한다. 과거 승인 문서를 소급 수정하지 않는다. 기존 코드의 사용자 문구를 지정할 때도 내부 예외의 message를 그대로 전달하지 않는다.

전역 ValidationPipe는 class-validator 데코레이터가 있는 DTO 클래스의 검증 실패·추가 필드를 `400 VALIDATION_FAILED`와 필드/규칙 이름으로 응답한다. `unknown`·인터페이스·직접 수동 검증은 DTO 검증 대상이 아니다.

[9/28 팀장 결정](https://github.com/JminAILab/CatchU/issues/88#issuecomment-5861430583)에 따라 명세 밖 예외를 처리한다.

- 코드 없는 403·409는 상태를 유지하고 `INTERNAL_ERROR`와 경고 로그를 남긴다. 업무 코드가 있는 거부는 `ApiError`를 사용한다.
- 본문 크기 초과(413 예외 포함)는 `400 INVALID_REQUEST`, 안내는 `요청 본문이 너무 큽니다.`다.
- 없는 경로는 `404 RESOURCE_UNAVAILABLE`이다. `/v1` 밖에서도 HTML 대신 같은 형식으로 응답한다.
- 예상 밖 예외는 `500 INTERNAL_ERROR`와 일반 안내다. 5xx 로그는 `ApiError`를 포함해 예외 분류명과 코드 위치(`파일:줄:칸`)만 남긴다. 분류명은 `error.name` 원문이 아니라 `instanceof` 기반으로 고른 허용 목록의 고정 분류명(`ApiError`·`ForbiddenException`·`TypeError`·`Error` 등)이며, 목록 밖의 하위 클래스는 가장 가까운 상위 분류로 기록한다. 코드 위치는 stack 문자열이 아니라 V8의 구조화된 호출 위치에서 따로 수집하므로 원문 메시지가 섞이지 않으며, 함수 이름은 기록하지 않는다. 수집 기록이 없으면 위치를 생략한다(`src/common/errors/stack-frames.ts`). 요청 주소는 토큰이 들어가는 실제 경로 대신 등록된 경로 틀만 기록하고, 없으면 `[unmatched]`로 표시한다.

전역 설정은 `configureApp`에 모았다. 기능 경로는 `/v1` 아래, `GET /health`는 접두사 없이 유지하며 성공·오류 응답에 `Cache-Control: no-store`를 붙인다. `npm test`는 실제 로컬 HTTP 서버에서 위 상태/본문/헤더/로그, ValidationPipe, 인증 Guard를 검증한다. 오류 재현 전용 경로는 `test/errors.test.cjs`에만 있고 제품 앱에 추가하지 않는다.

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
| ajv / ajv-formats / yaml (분석 메시지 계약 검사) | `8.20.0` / `3.0.1` / `2.9.1` |
| TypeORM / @nestjs/typeorm / pg          | `1.1.1` / `12.0.1` / `8.23.0`   |
| PostgreSQL (로컬·테스트 Docker 이미지)  | `postgres:16`                   |

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

인증 기반 추가 후에는 서명 키와 토큰 수명이, DB 기반 추가 후에는 `DB_*` 접속 설정이 필수다. `.env.example`에는 실제 키나 기본 서명 키를 제공하지 않고, DB 값은 로컬 컨테이너 전용 예시만 둔다. 아래처럼 터미널 환경에 준비하거나, 예시를 참고해 로컬 `api/.env`를 작성한다. 기존 `.env`가 있다면 덮어쓰지 않는다. 필수 설정이 누락되거나 형식이 잘못되면 서버가 실패 종료하므로 `/health`도 기동되지 않는다.

| 구분 | 이름   | 기본값 | 의미                             |
| ---- | ------ | ------ | -------------------------------- |
| 선택 | `PORT` | `3001` | HTTP 포트. 정수 `1~65535`만 허용 |
| 선택 | `BIND_HOST` | `127.0.0.1` | HTTP 바인딩 주소. IP 주소만 허용하고 `localhost` 같은 이름은 기동 실패. `0.0.0.0`은 같은 네트워크의 다른 기기에서도 접속되므로 컨테이너 등 필요할 때만 쓴다 |
| 필수 | `AUTH_JWT_SECRET` | 없음 | 안전한 난수 32바이트를 64자리 hex로 표현한 서명 키. 환경별로 별도 준비 |
| 필수 | `AUTH_ACCESS_TOKEN_TTL_SECONDS` | 없음 | Access JWT 수명(초). 양의 안전한 정수이며 현재 시각과 합산 가능해야 함 |
| 선택 | `DEV_LOGIN_ENABLED` | 비활성 | 정확히 `true`일 때만 개발 로그인 활성화 요청 |
| 선택 | `DEV_ANALYSIS_INJECTION_ENABLED` | 비활성 | 분석 주입 모듈을 조립한 경우에만 사용. 정확히 `true`이고 `NODE_ENV`가 `development` 또는 `test`여야 허용. 이 설정만으로 HTTP 경로가 생기지 않음 |
| 선택 | `NODE_ENV` | 미지정 | 운영 배포에서는 반드시 `production`. 개발 로그인 플래그보다 우선하여 거부 |
| 필수 | `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 없음 | 개발 DB 접속. 로컬 값은 「로컬 DB 준비」의 `docker run`과 `.env.example`이 같다. `DB_PORT`는 정수 `1~65535` |
| 선택 | `TEST_DB_HOST` / `TEST_DB_PORT` / `TEST_DB_USER` / `TEST_DB_PASSWORD` / `TEST_DB_NAME` | `127.0.0.1` / `5433` / `catchu` / `catchu_local` / `catchu_test` | `npm test`가 쓰는 테스트 DB(「DB 테스트」). 이름은 `_test`로 끝나야 함 |

실행 명령과 마이그레이션 명령이 `.env`를 읽으며, 이미 터미널 환경에 지정된 값이 우선한다. DB 값은 `.env.example`의 `DB_*` 줄을 `.env`에 옮기면 된다. 큐·worker 설정은 필요하지 않다. `.env`·의존성·빌드 결과를 제외하는 기존 `.gitignore`를 유지한다. 키를 바꾸면 이전 키로 발급한 토큰은 사용할 수 없다.

PowerShell에서 로컬 검토용 설정을 준비하는 예시다. 생성한 키는 변수에만 받아 화면에 출력하지 않는다. `900`초는 이 재현의 예시이며 제품의 최종 수명 정책이 아니다.

```powershell
$env:AUTH_JWT_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:AUTH_ACCESS_TOKEN_TTL_SECONDS = '900'
$env:NODE_ENV = 'development'
$env:DEV_LOGIN_ENABLED = 'true'
```

운영 비밀값은 배포 환경의 비밀 관리 수단으로 주입한다. 실제 키·토큰·Authorization 헤더를 파일 예시, 터미널 출력, 로그, 이슈, PR, 화면 캡처에 넣지 않는다. 요청/응답 전체를 기록하는 디버그·HTTP 상세 출력도 사용하지 않는다. 위 환경변수는 현재 터미널의 자식 프로세스에만 전달된다.

## 로컬 DB 준비

api는 기동할 때 PostgreSQL에 접속한다. 접속하지 못하면 `DB에 접속하지 못했습니다(<주소>/<DB>)` 안내와 함께 종료 코드 1로 끝나며 `/health`도 열리지 않는다. `/health`는 DB를 조회하지 않는다. 로컬 PostgreSQL은 Docker로 띄운다(Docker Desktop 등 필요, Compose 파일 없음). 개발 DB는 이름 있는 볼륨에 자료를 보관하고, 테스트 DB(「DB 테스트」)와 분리한다.

```powershell
docker run -d --name catchu-db -p 127.0.0.1:5432:5432 -e POSTGRES_USER=catchu -e POSTGRES_PASSWORD=catchu_local -e POSTGRES_DB=catchu -v catchu-db-data:/var/lib/postgresql/data postgres:16
```

`.env.example`의 `DB_*` 값이 이 명령과 같다. 이 비밀번호는 내 컴퓨터의 로컬 컨테이너 전용이며 다른 환경에 쓰지 않는다. 5432가 이미 쓰이면 `-p 127.0.0.1:<다른 포트>:5432`로 바꾸고 `DB_PORT`를 같게 맞춘다. 비밀번호·사용자는 볼륨을 처음 만들 때 정해지므로, 나중에 바꾸려면 볼륨을 지우고 다시 만든다.

실행 순서:

1. DB 실행: 처음 한 번 위 `docker run`, 이후에는 `docker start catchu-db`
2. `npm run migration:run`: 아직 적용하지 않은 마이그레이션을 개발 DB에 적용한다. 앱 기동은 스키마를 바꾸지 않는다(`synchronize` 꺼짐).
3. `npm run start:dev`, 또는 `npm run build` 뒤 `npm start`

테이블 확인: `docker exec catchu-db psql -U catchu -d catchu -c '\dt'`

DB를 멈추거나 자료를 지우는 명령의 영향:

| 명령 | 영향 |
| --- | --- |
| `docker stop catchu-db` | DB만 멈춘다. 자료는 볼륨에 남고 `docker start catchu-db`로 다시 쓴다 |
| `npm run migration:revert` | 마지막으로 적용한 마이그레이션 1개를 되돌린다. 그 마이그레이션이 만든 테이블과 그 안의 자료가 지워진다 |
| `docker rm -f catchu-db` | 컨테이너만 지운다. 볼륨이 남아 있으면 같은 `docker run`으로 자료가 돌아온다 |
| `docker volume rm catchu-db-data` | 개발 DB 자료 전체를 지운다. 되돌릴 수 없다. 다시 `docker run`과 `npm run migration:run`부터 한다 |

PostgreSQL 주 버전: 로컬·테스트는 `postgres:16`이다. NCP Cloud DB for PostgreSQL은 13~17을 제공한다([릴리스 노트](https://guide.ncloud-docs.com/docs/clouddbforpostgresql-releasenote), 2026-09-28 확인: 16.14는 2026-07-23, 17.11은 2026-09-17 추가). 배포 DB의 주 버전과 SSL 등 관리형 DB 접속 옵션은 NCP 배포 작업을 재개할 때 확인한다(「아직 필요한 입력」).

## 개발 실행·응답 확인·종료

```powershell
npm run start:dev
```

기본 주소는 `http://127.0.0.1:3001`이다(`BIND_HOST`·`PORT`로 바꾼다). Node watch가 소스 변경 시 재시작한다. 별도 터미널에서 다음을 실행한다.

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
| `npm test`          | 빌드 후 테스트 DB에 마이그레이션을 적용하고 `test/**/*.test.cjs`를 한 파일씩 실행. health·인증 HTTP, 실제 main 진입점의 설정 로딩/기동 실패, DB 규약·테스트 DB, 분석 수신·개발 주입 대역 검사. **테스트 DB 필요**(「DB 테스트」). 서버·임시 설정은 검사 후 정리 |
| `npm run test:analysis-fixtures` | 별도 준비한 #103 공용 합성 자료로 수신 처리 검사. 자료 경로는 아래 #139 절 참고. 자료가 없으면 실패하며 묵시적으로 생략하지 않음 |
| `npm run build`     | 이전 `dist/`를 지운 뒤 `src/`를 `dist/`로 컴파일. 소스에서 지운 엔티티·마이그레이션이 `dist/`에 남아 탐색되지 않게 한다 |
| `node --test test/worker-messages.test.cjs` | 빌드 없이 [M1 합성 결과 세트](../worker/fixtures/m1-synthetic/README.md)의 사례·음성 대조가 worker와 같은 스키마 판정을 내는지만 검사. `npm test`에도 포함 |
| `npm start`         | `dist/main.js` 실행. 먼저 빌드 필요                                                                                  |
| `npm run migration:run` / `migration:revert` / `migration:generate` | 개발 DB(`.env`의 `DB_*`)에 마이그레이션 적용·마지막 1개 되돌리기·엔티티와의 차이로 새 마이그레이션 생성(「엔티티와 마이그레이션」) |

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

빌드 후 실행도 개발 실행과 같은 주소·응답을 확인하고 같은 방법으로 종료한다. 개발 서버와 빌드 서버를 같은 포트에서 동시에 실행하지 않는다. 테스트는 실제 로컬 HTTP와 테스트 DB를 쓰며, 외부 서비스·제품 기능·소유권·worker 연결 검증은 포함하지 않는다. 테스트는 매번 무작위 키를 생성하므로 실제 비밀값이 필요하지 않고, `.env`에서는 `TEST_DB_*`만 읽는다.

[#95 후속 참고](https://github.com/JminAILab/CatchU/pull/95)에 따라 기존 빌드를 유지하면서 하위 폴더까지 테스트 탐색을 확대했다. `test/runtime/bootstrap.test.cjs`는 실제 소스/빌드 진입점을 실행해 env 파일 적용, 터미널의 운영 환경 설정 우선, 필수 인증 설정 누락·공란·잘못된 수명, DB 비밀번호 누락·DB 접속 불가에 따른 실패 종료를 검사한다. `BIND_HOST`가 없으면 `127.0.0.1`에만, `::1`로 주면 그 주소에만 열리는지와 IP가 아닌 값의 실패 종료도 검사한다(IPv6 루프백이 없는 환경에서는 두 주소 비교 검사를 건너뛴다). 개발 watch의 자동 재시작은 검사 범위가 아니다.

## DB 테스트

`npm test`는 빌드 → 테스트 DB에 마이그레이션 적용 → 테스트 실행 순서로 돈다(`scripts/test-with-db.cjs`). AppModule을 쓰는 기존 테스트도 DB에 접속하므로, **테스트 DB가 없으면 `npm test`는 이 절을 안내하며 실패한다.** 테스트 DB는 개발 DB와 다른 컨테이너이고, 자료를 메모리(`--tmpfs`)에만 두어 컨테이너를 지우면 사라진다.

```powershell
docker run -d --name catchu-db-test -p 127.0.0.1:5433:5432 -e POSTGRES_USER=catchu -e POSTGRES_PASSWORD=catchu_local -e POSTGRES_DB=catchu_test --tmpfs /var/lib/postgresql/data postgres:16
```

- 접속값은 터미널 환경변수 → `api/.env`의 `TEST_DB_*` → 위 명령과 같은 기본값 순서로 정한다. 실행기는 이 값을 테스트에 `DB_*`로 넘기므로 테스트는 개발 DB를 쓰지 않는다.
- DB 이름이 `_test`로 끝나지 않으면 실행기와 초기화 함수가 거부한다.
- 포트·이름을 바꾸려면 `docker run`의 `-p`·`--name`과 `TEST_DB_PORT`를 함께 바꾼다. 여러 작업 폴더에서 동시에 테스트하면 폴더마다 다른 컨테이너·포트를 쓴다.
- 파일 하나만 실행: `npm test -- test/db/timestamptz.test.cjs`. `node --test`로 직접 실행하면 `DB_*`가 없어 실패한다.
- 테스트 DB를 새로 만들려면 `docker rm -f catchu-db-test` 뒤 다시 `docker run`한다. 다음 `npm test`가 마이그레이션을 처음부터 적용한다.

DB를 쓰는 테스트를 추가할 때:

- `test/support/test-database.cjs`의 `openTestDataSource()`로 접속하고, 각 테스트 앞(`beforeEach`)에서 `resetTestDatabase(dataSource)`를 불러 앞선 테스트의 자료 없이 시작한다. 초기화는 마이그레이션 기록을 뺀 모든 테이블을 비운다.
- 테스트 파일은 한 번에 하나씩 돈다(`--test-concurrency=1`). 동시 요청 검사는 한 테스트 안에서 연결을 여러 개 열어 만든다.
- 확인용 테이블이 필요하면 그 테스트 안에서 만들고 지운다. 제품 테이블은 마이그레이션으로만 만든다.

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
| `src/analysis-receiver/analysis-receiver.service.ts` | 진행/결과 수신, 맥락·중복·순서 검사, 커밋 이후 수신 확인 |
| `src/analysis-receiver/receiver.types.ts` | 메시지 타입과 DB 연결용 `ReceiverStore` 트랜잭션 경계 |
| `src/analysis-receiver/worker-message.validator.ts` | 계약 YAML에서 한 번 컴파일한 스키마 검사. 입력 보정·외부 참조 다운로드 없음 |
| `src/analysis-receiver/dev-analysis-injection.ts` | 본인 MOCK 요청에 공용 템플릿 채움·내부 주입, 환경 차단 |
| `src/analysis-receiver/analysis-receiver.module.ts` | 저장소와 계약 경로를 명시해 수신 모듈 조립. 기본 앱에는 미등록 |
| `test/analysis/` / `test/helpers/receiver-harness.cjs` | 수신·인증 연결·주입 검사와 테스트 전용 메모리 저장소. 실제 DB 구현 아님 |
| `test/health.test.cjs`                  | 빌드된 앱의 최소 HTTP 실행 검사                    |
| `test/auth.test.cjs`                    | 테스트 안에만 보호 컨트롤러 구성, 인증 정상·거부 및 로그 비노출 검사 |
| `test/runtime/bootstrap.test.cjs`       | 소스/빌드 main의 실제 설정 로딩·기동·실패 종료 검사 |
| `src/database/database.config.ts`       | DB 환경설정 검증과 앱·마이그레이션 명령이 함께 쓰는 접속·매핑 설정(엔티티·마이그레이션 위치, `synchronize` 끔, 세션 UTC) |
| `src/database/database.module.ts`       | 앱의 DB 연결. 접속 실패 시 짧게 재시도한 뒤 기동 중단 |
| `src/database/data-source.ts`           | 마이그레이션 명령과 테스트 실행기가 쓰는 DataSource |
| `src/database/snake-naming.strategy.ts` | 테이블·칼럼 snake_case, 제약·인덱스의 결정적 이름 |
| `src/database/checks.ts`                | `@Check()`용 식: enum 허용 값, 문자열 길이 |
| `src/database/migrations/`              | 모든 마이그레이션의 한 위치 |
| `scripts/test-with-db.cjs`              | `npm test` 실행기: 테스트 DB 확인·마이그레이션 적용·테스트 순차 실행 |
| `scripts/clean-dist.cjs`                | `npm run build`의 첫 단계: 이전 빌드 결과 `dist/` 삭제 |
| `test/support/test-database.cjs`        | 테스트 DB 접속, `_test` 이름 확인, 테스트 사이 자료 초기화 |
| `test/db/*.test.cjs`                    | DB 규약으로 생성되는 SQL, 시각 왕복, 테스트 DB 격리, 트랜잭션 전달, 재빌드 뒤 지운 마이그레이션 미탐색 검사 |
| `test/worker-messages.test.cjs`         | M1 합성 결과 세트의 worker 메시지 스키마 v1 판정 검사 |
| `test/helpers/worker-messages.cjs`      | 테스트 전용 메시지 검사 도우미. 계약 YAML·합성 세트를 원본 경로에서 읽음. 운영 코드에서 쓰지 않음 |
| `tsconfig.json` / `tsconfig.build.json` | 엄격한 타입 검사, 데코레이터, 빌드 설정            |
| `eslint.config.mjs`                     | TypeScript·JavaScript 정적 검사                    |
| `.env.example`                          | 인증·DB 필수 설정과 실행·테스트 DB 선택 설정. 인증 비밀값은 공란, DB 값은 로컬 컨테이너 전용 |
| `.gitignore`                            | 로컬 설정·의존성·빌드 결과 제외. 기존 내용 유지    |

후속 기능은 `src/<기능>/`에 모듈·컨트롤러·서비스와 엔티티(`*.entity.ts`)를 두고 `AppModule`의 `imports`에 해당 모듈을 연결한다. health 컨트롤러에 제품 기능을 추가하지 않는다. 기능별 정상·거부·실패 검사는 해당 이슈의 완료 기준에 맞춰 추가한다.

## 엔티티와 마이그레이션 — 기능 담당자 안내

- 엔티티: `src/<기능>/<이름>.entity.ts`. 이름이 `.entity.ts`로 끝나면 앱과 마이그레이션 명령이 자동으로 찾는다. 서비스에서 Repository를 주입받으려면 기능 모듈의 `imports`에 `TypeOrmModule.forFeature([엔티티])`를 넣는다.
- 마이그레이션: `src/database/migrations/` 한 곳. 파일은 생성 명령으로 만든다.
- 테이블은 ERD의 속성·필수 값·enum·유일성을 따른다. 관계·유일성이 ERD와 달라지면 계약 수정이다([코딩 운영](../docs/CatchU_작업관리.md#코딩-운영)).

순서:

1. `git fetch origin` 뒤 작업 브랜치를 `origin/dev` 기준으로 최신화한다([레포 컨벤션 §3](../docs/CatchU_레포_컨벤션.md)).
2. `npm run migration:run`: 다른 사람이 병합한 마이그레이션까지 개발 DB에 적용한다. 빼먹으면 다음 단계가 남의 테이블까지 다시 만드는 마이그레이션을 생성한다.
3. 엔티티를 추가하거나 고친다(「DB 물리 규약」).
4. `npm run migration:generate -- src/database/migrations/<변경이름>`: 개발 DB와 엔티티의 차이로 `<시각>-<변경이름>.ts`가 생긴다. 예: `CreateMemberAccount`.
5. 생성된 SQL을 읽는다. 규약의 타입·제약 이름인지, 의도하지 않은 `DROP`이나 다른 테이블 변경이 없는지 본다. 생성기가 표현하지 못하는 부분(예: 순환 FK의 DEFERRABLE)은 손으로 고친다.
6. `npm run migration:run`으로 적용하고, `npm run migration:revert`로 되돌린 뒤 다시 적용해 `down`도 확인한다.
7. 엔티티와 마이그레이션을 같은 PR에 넣는다. `npm test`가 테스트 DB에 새 마이그레이션을 적용해 함께 검사한다.

- **dev에 병합된 마이그레이션은 고치지 않는다.** 이미 적용한 DB에는 고친 파일이 다시 실행되지 않으므로, 바꿀 것은 새 마이그레이션으로 추가한다.
- 두 PR이 각각 마이그레이션을 추가하면 나중에 병합되는 쪽이 rebase 뒤 2~6단계를 다시 한다. 실행 순서는 파일 이름의 시각이다.
- 다른 브랜치에서 적용한 마이그레이션이 개발 DB에 남아 있으면 4단계 결과에 그 테이블의 `DROP`이 섞인다. 그 브랜치에서 `migration:revert`로 되돌리거나 「로컬 DB 준비」의 볼륨 삭제 뒤 다시 적용한다.

## DB 물리 규약

[ERD v1](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md)이 물리 매핑으로 넘긴 항목(ID 형식, 시각, enum 저장, 이름)을 PostgreSQL에서 이렇게 정한다. 이름은 `src/database/snake-naming.strategy.ts`가 만들고, `test/db/conventions.test.cjs`가 생성 SQL로 확인한다.

| 항목 | 규칙 |
| --- | --- |
| 테이블 | 엔티티 클래스 이름의 단수 snake_case(`MemberAccount` → `member_account`). 약어가 있으면 이름을 적는다: `@Entity('github_connection')`(자동 변환은 `git_hub_connection`) |
| 칼럼 | 속성 이름의 snake_case(`sourceRequestId` → `source_request_id`). 칼럼 이름은 따로 쓰지 않는다 |
| 내부 ID(ERD `id`) | `uuid`. `@PrimaryColumn({ type: 'uuid' })`로 두고 저장 전에 앱이 `randomUUID()`(`node:crypto`)로 채운다. DB 생성값(`@PrimaryGeneratedColumn`)은 쓰지 않는다. 요청·동의·첫 시도처럼 서로 참조하는 행을 한 트랜잭션에서 미리 연결해야 하기 때문이다 |
| 참조 | 참조 대상과 같은 `uuid` 칼럼 속성을 두고, 관계에는 `@JoinColumn({ name: '<그 칼럼>' })`을 붙인다. ERD가 삭제·cascade를 정하지 않았으므로 `onDelete`는 두지 않는다 |
| 외부 ID(ERD `external-id`·`external-work-key`) | `text`. 서비스 DB의 FK를 걸지 않는다 |
| 문자열 길이 | ERD에 길이 제한이 있으면 `text` + `@Check(lengthBetween('<칼럼>', 최소, 최대))`. 예: 멱등 key 1~128 |
| 시각 | 모든 시각 칼럼에 `type: 'timestamptz'`를 적는다. `@CreateDateColumn`·`@UpdateDateColumn`도 `{ type: 'timestamptz' }`를 적는다(생략하면 시간대 없는 `timestamp`). 앱은 `Date`로 다루며, DB 세션 시간대는 UTC다 |
| enum | `varchar` + `@Check(inValues('<칼럼>', [허용 값]))`. DB 네이티브 enum(`type: 'enum'`)은 쓰지 않는다. 값 추가·제거가 마이그레이션에서 까다롭다. 허용 값을 바꾸면 CHECK 이름이 바뀌어 생성 명령이 교체 SQL을 만든다 |
| 제약 이름 | 규칙이 만든다: `pk_<테이블>`, `fk_<테이블>_<칼럼>`, `uq_<테이블>_<칼럼들>`, `ix_<테이블>_<칼럼들>[_<조건 해시>]`, `ck_<테이블>_<칼럼>_<식 해시>`. 63자를 넘으면 해시로 줄인다. 데코레이터에 제약 이름을 쓰지 않는다 |
| 복합 유일성 | `@Unique(['ownerId', 'workIdentity'])`(속성 이름) |
| 부분 유일성 | `@Index(['memberId'], { unique: true, where: `"status" = 'ACTIVE'` })`. `where` 안의 칼럼은 큰따옴표로 감싼 DB 이름으로 쓴다 |
| 시간에 따라 달라지는 유일성 | 정적 unique로 풀지 않는다(예: ShareLink의 유효 기간 안 제목 유일·개수 제한). 같은 회원 단위로 직렬화한 트랜잭션 안에서 판정하며, 방법은 해당 기능 이슈에서 정한다 |
| 순환 FK | 요청·동의·첫 시도처럼 서로 참조하면 FK를 `DEFERRABLE INITIALLY DEFERRED`로 두어 커밋 때 검사한다. 적용은 [#104](https://github.com/JminAILab/CatchU/issues/104)에서 한다 |
| ID 형식 확인 | 경로·메시지로 받은 ID가 uuid 형식이 아니면 조회 전에 걸러 명세의 응답(없는 자원과 같은 404 등)으로 돌려준다. 그대로 조회하면 PostgreSQL 오류(`22P02`)가 서버 오류(500)가 된다 |

```typescript
import { randomUUID } from 'node:crypto';
import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { inValues, lengthBetween } from '../database/checks';

const STATES = ['ACTIVE', 'CLOSED'] as const;

@Entity()
@Check(inValues('state', STATES))
@Check(lengthBetween('external_key', 1, 128))
@Unique(['ownerId', 'externalKey'])
@Index(['ownerId'], { unique: true, where: `"state" = 'ACTIVE'` })
export class ExampleItem {
  @PrimaryColumn({ type: 'uuid' })
  exampleItemId: string = randomUUID();

  @Column({ type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'text' })
  externalKey!: string;

  @Column({ type: 'varchar' })
  state!: (typeof STATES)[number];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

## 트랜잭션 규약

팀장 결정(9/28): 여러 영역의 저장을 한 트랜잭션으로 묶을 때(예: [#105](https://github.com/JminAILab/CatchU/issues/105)의 E 반영 기록과 B 등록) 호출하는 쪽이 트랜잭션을 열고 그 `EntityManager`를 넘긴다. 넘겨받는 쪽 함수는 manager를 인자로 받고, 안의 DB 작업은 모두 그 manager로 한다(`manager.getRepository(...)`, `manager.query(...)`). 넘겨받은 함수 안에서 주입받은 전역 `DataSource`·`Repository`를 쓰면 다른 연결에서 따로 커밋되어, 바깥 트랜잭션이 실패해도 롤백되지 않는다. 확인 테스트는 `test/db/transaction.test.cjs`다.

```typescript
// 호출하는 쪽
await this.dataSource.transaction(async (manager) => {
  await manager.getRepository(MyRecord).save(record);
  await this.otherArea.save(manager, input);
});

// 넘겨받는 쪽
async save(manager: EntityManager, input: Input): Promise<void> {
  await manager.getRepository(OtherEntity).save(/* ... */); // 넘겨받은 manager만 쓴다
}
```

## 인증 기반 사용과 후속 경계 — #87

작업 브랜치는 `api/auth-foundation`, 구현 시작 기준은 `origin/dev`의 `9b67570a0e220a81de2e33f8a8deabb3b8e5d34e`다. 앞의 초기화 기준은 #83의 과거 기록이며 이번 인증 작업 기준과 구분한다.

기준은 [회원 인증 계약 M](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md)과 [#87의 #104 경계 안내](https://github.com/JminAILab/CatchU/issues/87#issuecomment-5815415143)다. `Authorization: Bearer <CatchU Access JWT>`를 검증해 회원 ID를 요청 내부에 저장한다. 현재 토큰 없음·잘못된 서명·만료·필수 식별 값 누락은 일반 NestJS `UnauthorizedException`을 던지며, #88 필터가 모두 `401 AUTH_REQUIRED` 형식으로 응답한다.

토큰 없음 `AUTH_REQUIRED`와 변조·만료 `AUTH_INVALID`의 구분은 #87 후속 작업이다. 개발 로그인의 추가 필드를 `VALIDATION_FAILED`로 구분하는 작업도 #87에 남는다. #88은 기존 인증 동작을 유지하며 공통 응답 형식과 `/v1` 경로 연결을 검사한다. 아래 날짜별 과거 검증 기록은 당시 상태를 나타낸다.

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

개발 전용 `POST /v1/auth/dev-login`은 JSON `{ "memberId": "검토용-회원-ID" }` 하나만 받아 `accessToken`, `tokenType: "Bearer"`, `expiresIn`(초)을 반환한다. 비어 있거나 공백인 ID·다른 타입·추가 필드는 현재 `400 INVALID_REQUEST`다. 기본 비활성 및 `NODE_ENV=production`에서는 `403 INTERNAL_ERROR`이며 토큰을 발급하지 않는다. 설정 변경은 서버 재시작 후 반영된다. 공개 경로 표시가 있어도 이 개발 로그인 차단 조건을 먼저 검사한다.

현재 내부 토큰 구현은 HS256, 발급자 `catchu-api`, 대상 `catchu-member-api`, `sub` 회원 ID와 `iat`·`exp`를 서명·검증한다. 서명 알고리즘을 제한하고 비어 있는/공백 회원 ID, 누락된 만료·발급 시각, 잘못된 대상·발급자도 거부한다. 이는 #87 개발 기반의 내부 형식이며 기능 코드의 의존 대상이나 실제 OAuth 발급 계약이 아니다. 토큰 원문과 검증 라이브러리의 상세 오류는 로그·오류 응답에 포함하지 않는다.

[#104](https://github.com/JminAILab/CatchU/issues/104)에서 개발 로그인에 받은 ID와 회원 행을 연결한다. 지금은 받은 ID를 그대로 사용하는 대역이며 회원·프로필 행 생성, DB 조회, 개발 GitHub 연동 대역은 없다. 이 연결을 바꿔도 기능 코드의 `@CurrentMemberId()` 사용 방식은 유지한다. 실제 Google/GitHub 로그인, Refresh Token·재발급·로그아웃, 소유권 검사, 쿠키·CORS·CSRF와 실제 발급 정책은 이번 범위 밖이다.

## 검토자 재현 — README만 보고 보호 API 추가·호출

아래 절차는 **다른 팀원의 실행 확인이 아직 필요**하다. 자동 테스트의 보호 컨트롤러는 테스트 프로세스에만 있으므로 일반 개발 서버에서 호출할 제품 API를 추가한 것으로 보지 않는다.

1. 별도 검토 작업본에서 위 설치·인증 설정 준비와 「로컬 DB 준비」를 수행한다.
2. 검토용 `src/auth-check/auth-check.controller.ts`를 아래 내용으로 만들고, `AppModule`에 해당 클래스를 import해 기존 `controllers` 배열에 추가한다. 기존 `imports`와 health는 유지한다. 실제품 기능은 해당 기능 모듈에 같은 접근자를 사용한다.

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
  Invoke-RestMethod -Uri http://127.0.0.1:3001/v1/auth-check
} catch {
  Write-Output ('HTTP ' + [int]$_.Exception.Response.StatusCode)
}

# 개발 로그인 응답 전체를 출력하지 않는다.
$authReply = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/v1/auth/dev-login `
  -ContentType 'application/json' -Body '{"memberId":"review-member-87"}'
$authHeaders = @{ Authorization = 'Bearer ' + $authReply.accessToken }
try {
  Invoke-RestMethod -Uri http://127.0.0.1:3001/v1/auth-check -Headers $authHeaders
} finally {
  Remove-Variable authReply, authHeaders -ErrorAction SilentlyContinue
}
```

4. 인증 후 `memberId`가 `review-member-87`인지, 토큰 없이 `/health`는 200인지 확인한다. 아래 검증 전에 `NODE_ENV`와 `DEV_LOGIN_ENABLED`의 기존 값·설정 유무를 터미널 환경변수와 `.env`별로 기록하고, 검토 후 원래 상태로 복원한다. 필수 인증 키와 토큰 수명 설정은 유지하며, 비밀값이나 환경변수 전체를 출력하지 않는다. **기본 비활성화:** 서버를 종료하고 터미널 환경변수와 `.env` 양쪽에서 `DEV_LOGIN_ENABLED`를 제거한 뒤 재시작하여 개발 로그인이 403인지 확인한다. **운영 환경 거부:** 서버를 종료하고 터미널에서 `NODE_ENV=production`, `DEV_LOGIN_ENABLED=true`로 설정한 뒤 재시작하여 개발 로그인이 403인지 확인한다.
5. 검토용 컨트롤러와 등록만 제거하고 검사 명령을 실행한다. 기존 파일은 통째로 되돌리지 않는다. 서버를 `Ctrl+C`로 종료하고 이 재현에서 추가한 환경변수만 정리하거나 터미널을 닫는다. 비밀값·토큰 없이 검토 환경, 검토 판본, HTTP 상태와 ID 일치 여부만 공유한다. 작성자 외 재현 완료 여부는 실제 검토자의 확인을 기다린다.

## 분석 메시지 수신과 개발용 주입 — #139

이 구현은 [#139의 독립 준비 범위](https://github.com/JminAILab/CatchU/issues/139)다. 기준은 [메시지 계약](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml), [수신·상태 전이 정본](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#업무-흐름), [수신 기록 모델](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md)이다. 실제 큐/worker 연결이나 HTTP 주입 API를 추가하지 않는다.

### 수신 결과와 저장 경계

- `AnalysisReceiver.receiveProgress(input)`: `ProcessingEvent` 자체 스키마와 현재 요청·시도를 검사한다. `RECEIVED`는 관측만 저장하고 실행 시작으로 바꾸지 않는다. `QUEUED → RUNNING/UNCERTAIN`만 적용하며, 진행 간 미정 전이는 관측만 남긴다. 종결 이후 진행은 종결 상태를 유지한다. 반환하는 내부 판정값은 `ResultReceipt`가 아니다.
- `AnalysisReceiver.receiveResult(input)`: `resultId/requestId/attemptId` 세 값 중 누락·빈 값·타입 오류가 있으면 `{ receipt: null }`과 고정 거부 코드만 남긴다. 식별 가능하면 스키마, 후보/실패 수에 따른 종결 의미, 접수된 회원·저장소·동의·범위·자료 모드 및 현재 시도를 대조한다. 접수 자료가 없거나 맥락이 다르면 `CONTEXT_MISMATCH`, 이전 시도는 `STALE_ATTEMPT`다.
- 같은 결과 ID/내용은 `DUPLICATE/ALREADY_RECEIVED`, 현재 시도의 다른 결과 또는 다른 내용은 `REJECTED/PAYLOAD_CONFLICT`다. 지문은 객체 키 순서를 정렬하고 전송 `messageId`를 제외한 SHA-256이다. 배열 순서와 `finishedAt`을 포함한 나머지 내용은 보존하여 충돌을 묵인하지 않는다.
- 새 정상 결과는 수신 메타데이터와 `processing=outcome`, `application=PENDING`, 적합 후보 수를 함께 저장한다. **저장소의 커밋이 성공한 뒤에만 `ACCEPTED/OK`를 반환한다.** 저장·커밋 실패는 일반화한 `ReceiverStorageError`로 끝나며 성공 Receipt를 반환하지 않는다. 외부 입력·저장소 오류 원문을 로그에 넣지 않는다.
- 정상 0건·부분 실패·실패·초안 없는 적합 후보를 보존한다. 반환값의 `accepted.result/metadata`는 [#105 등록 연결](https://github.com/JminAILab/CatchU/issues/105)이 사용할 입력이며, 이 모듈은 B의 Catch 생성이나 `APPLIED/CLOSED`, 본인 열람 준비를 설정하지 않는다. 중복 반환에는 새 `accepted` 입력이 없다. 반영 복구는 #105에서 기존 수신/등록 상태와 다시 전달된 같은 결과를 확인해 연결해야 한다.

`ReceiverStore.withRequest`는 요청·현재 시도 조회, 판정, 저장을 같은 원자 구간에서 수행하고 **커밋 이후에만 resolve**해야 한다. 예외와 커밋 실패는 rollback하며, 현재 시도당 종결 결과 하나와 수신 식별자 유일성을 DB에서도 보장해야 한다. 서로 다른 인스턴스의 동시 수신도 DB에서 직렬화해야 한다. 테스트의 메모리 저장소는 이 경계를 흉내 낸 것이므로 실제 DB의 잠금·유일성·장애 복구 검증을 대신하지 않는다.

수신 기록에는 식별자·지문·수신 시각만 저장하고 F 결과 원문을 복제하지 않는다. Receipt 전송과 그 이후 #105 호출은 연결 담당 코드에서 구분한다. 수신 확인 이후 장애 시 원문 재전달·보존 보장은 [임시 결과 보존과 전달 방식의 미결(OQ-F1)](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#open-questions)이다. 이 모듈의 메타데이터만으로 복구 가능하다고 판단하지 않는다.

### 내부 주입 사용과 검사

`AnalysisReceiverModule.register({ store, contractDirectory })`에 위 트랜잭션을 구현한 저장소와 `worker-messages.yaml`·`common.yaml`이 있는 절대 경로를 넘긴다. 현재 저장소의 계약 디렉터리는 `aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design`이다. 실행·배포 시 두 파일을 함께 제공해야 하며, 스키마를 읽지 못하면 모듈 조립에 실패한다. 테스트는 저장소 정본을 읽고, 승인 파일을 변경하지 않는다.

개발 내부 호출은 `DevAnalysisInjection.inject(memberId, requestId, kind, template, caseId)`다. `kind`는 `Result` 또는 `ProcessingEvent`다. 회원 ID는 [#87 인증 접근자](src/auth/auth.decorators.ts)의 `CurrentMemberId`에서 전달하고 요청 body의 회원 ID로 대체하지 않는다. 저장소에서 본인 요청인지 확인한 다음 MOCK 접수 맥락으로만 `{{requestId}}`·`{{attemptId}}`·`{{memberId}}`·`{{repositoryId}}`·`{{consentId}}`·`{{scopeRevision}}`·`{{caseId}}`를 채운다. 템플릿에 없는 ID는 생성하지 않으며 타인 요청·다른 요청으로의 바꿔치기·LIVE 자료 주입을 거부한다.

설정 없음, `true` 이외 값, `NODE_ENV=production` 또는 환경 미지정이면 주입을 거부한다. `DEV_LOGIN_ENABLED`와는 별도 설정이다. `test/analysis/dev-injection.test.cjs`의 테스트 전용 컨트롤러가 실제 공통 Guard·CurrentMemberId와 연결해 인증 없음·타인 요청·운영 차단을 검사한다. **이 컨트롤러와 메모리 저장소는 제품 `AppModule`에 등록하지 않는다.** 현 단계에서 실행 가능한 개발 주입 재현은 아래 자동 검사이며, 실제 DB 요청을 주입하는 실행 경로는 후속 연결이다.

```powershell
# api/에서 실행. 실제 .env나 외부 계정 없이 대역 수신·개발 주입 및 기존 검사를 실행한다.
npm ci
npm run lint
npm run typecheck
npm test
```

[#103 공용 합성 자료](https://github.com/JminAILab/CatchU/issues/103)는 다른 담당의 정본이므로 이 PR에 복사하지 않는다. 기본 경로 `worker/fixtures/m1-synthetic`에 자료가 있으면 `npm run test:analysis-fixtures`를 실행한다. 별도 판본으로 검사할 때는 그 판본의 `cases.json`·`events/`·`results/` 디렉터리를 준비하고 다음처럼 실행한다.

```powershell
$previousFixtureDir = $env:ANALYSIS_FIXTURE_DIR
try {
  $env:ANALYSIS_FIXTURE_DIR = 'C:\검토자료\m1-synthetic'
  npm run test:analysis-fixtures
} finally {
  if ($null -eq $previousFixtureDir) { Remove-Item Env:ANALYSIS_FIXTURE_DIR -ErrorAction SilentlyContinue }
  else { $env:ANALYSIS_FIXTURE_DIR = $previousFixtureDir }
}
```

자료가 없거나 기대 수신 판정과 다르면 실패한다. 이 검사는 공용 자료의 수신/처리 기대값만 검증하며, manifest의 Catch 개수·등록 판정은 B 구현 검증으로 취급하지 않는다. 검사 판본과 결과는 PR에 기록한다. 테스트의 요청·동의·시도는 합성 대역으로, #138의 실제 DB 접수 결과가 아니다.

### 실제 연결에 남은 작업

| 연결 | 필요한 결과 |
| --- | --- |
| [#104 요청·시도 모델](https://github.com/JminAILab/CatchU/issues/104) + [#105 수신 기록 테이블](https://github.com/JminAILab/CatchU/issues/105) | [E/B 합의](https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865412468)에 따른 실제 `ReceiverStore` 어댑터, 트랜잭션/유일성/저장 실패/동시 수신 검사. 테이블이 준비되면 #105 전체 완료를 기다리지 않고 연결 |
| [#138 분석 접수 API](https://github.com/JminAILab/CatchU/issues/138) | 실제 DB에 접수한 본인 요청·동의·현재 시도를 읽어 #103 템플릿을 채우고 주입하는 재현. 수신 로직 준비와 별도 완료 기준 |
| [#105 등록·반영](https://github.com/JminAILab/CatchU/issues/105) | 수신 기록 저장 후 B 전달, Catch 저장과 E 반영 기록의 공유 트랜잭션, 반영 실패/재진입 연결. ACCEPTED를 APPLIED로 해석하지 않음 |
| [#77 전송 검증](https://github.com/JminAILab/CatchU/issues/77)·[#116 인계·보존](https://github.com/JminAILab/CatchU/issues/116) | 실제 전달·실행 불명·수신 후 장애와 원문 재전달/보존 연결. 큐 전송이나 자동 재분석은 이 모듈에 포함하지 않음 |

## 실행 실패 시 확인

- `EADDRINUSE`: 지정 포트가 사용 중인지 확인하고 자신이 실행한 이전 서버를 종료하거나 선택 포트를 바꾼다. 다른 사람의 프로세스를 임의 종료하지 않는다.
- `PORT` 오류: `.env`와 현재 터미널 환경의 값을 확인한다.
- `BIND_HOST는 IP 주소여야 합니다`: `localhost` 같은 이름 대신 `127.0.0.1`·`::1`·`0.0.0.0`처럼 IP로 적는다. 빈 값도 실패한다.
- 인증 설정 오류: 오류에 나온 변수 이름을 기준으로 누락·형식을 확인한다. 키·토큰 값은 출력하거나 공유하지 않는다. 개발 로그인 403은 플래그와 운영 환경 차단 조건을 확인한다.
- `DB 설정이 없습니다: DB_...`: `.env`나 터미널 환경에 `DB_*`가 있는지 확인한다(`.env.example` 참고).
- `DB에 접속하지 못했습니다(...)`: `docker ps`로 DB 컨테이너가 실행 중인지 보고, 멈춰 있으면 `docker start catchu-db`. `ECONNREFUSED`면 주소·포트를, `password authentication failed`면 `DB_USER`·`DB_PASSWORD`가 볼륨을 처음 만들 때의 값과 같은지 확인한다.
- `docker run`의 `port is already allocated`: 5432(테스트는 5433)를 다른 PostgreSQL이 쓰고 있다. 자신이 띄운 컨테이너면 그것을 쓰고, 아니면 「로컬 DB 준비」대로 포트를 바꾼다.
- `npm test`의 `테스트 DB(...)에 접속하지 못했습니다`: 「DB 테스트」의 명령으로 테스트 DB를 띄운다.
- `migration:generate`가 남의 테이블을 만들거나 지우는 SQL을 만든다: 「엔티티와 마이그레이션」 2단계를 빼먹었거나 다른 브랜치의 마이그레이션이 개발 DB에 남아 있다.
- `dist/main.js` 없음: `npm run build`를 먼저 실행한다.
- 설치·도구 버전 오류: `node -v`, `npm -v`, 실행 경로와 `api/`에서 실행 중인지 확인한다.
- `spawn EPERM`: 테스트·watch의 자식 프로세스 실행을 제한하는 환경인지 확인한다. 검사 설정을 약화하지 않고 실행 권한이 허용된 환경에서 같은 명령을 재실행한다.

## 아직 필요한 입력

| 필요한 입력                                               | 결정할 곳                                                                                        | 결정 전 가능한 작업                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 배포 DB의 PostgreSQL 주 버전, SSL 등 관리형 DB 접속 옵션  | NCP 배포 작업 재개 때([#24](https://github.com/JminAILab/CatchU/issues/24))                      | 로컬·테스트는 NCP가 제공하는 주 버전 중 `postgres:16`을 쓴다(「로컬 DB 준비」) |
| 큐 선정·버전, API↔worker 메시지·오류 계약                 | PR #70의 검증 과제와 후속 계약; 연결 쟁점은 [#23](https://github.com/JminAILab/CatchU/issues/23) | 분석 요청·상태·결과 전달의 의미와 질문 정리                                    |
| 결과 검사·자산 저장·작업 완료 반영, 중복·실패 처리의 책임 | E·B·F 연결 계약과 실제 기능 담당자 간 합의                                                       | 책임 경계·반영 순서의 초안과 미결 정리. api 초기화 담당에게 자동 배정하지 않음 |
| 인증·외부 서비스·큐의 개발·테스트 환경                    | 관련 계약과 공통 환경 준비 작업                                                                  | 필요한 설정·계정·실제 연결 검증 범위 정리                                      |

DB는 「로컬 DB 준비」·「DB 테스트」로 준비한다. web·api·worker·PostgreSQL을 함께 띄우는 순서와 서비스끼리 맞출 설정값은 [로컬 통합 실행 안내](../docs/CatchU_로컬통합실행.md)에 있다. 큐의 공통 준비 방법은 공통 환경 준비 작업에서 마련하고, api 쪽에서는 필요한 접속·실행 조건을 제공한다. 각 사용자는 그 안내로 자신의 환경을 준비한다. DB 모델·마이그레이션·메시지 처리 구현은 해당 기능의 책임과 계약에 따라 나눈다. 연결을 추가할 때 환경변수·공통 준비 안내·실제 및 모의 연결 범위와 자료 변경 명령의 영향을 문서화한다.

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
