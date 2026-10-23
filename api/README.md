# api — API 서버

공유 링크 발급의 자동 통합 검사(`test/db/share-links-web-integration.test.cjs`)와 수동 재현 도구 `node scripts/verify-share-links-browser.cjs`의 실행 방법·판정 기준은 [#149 실행 안내](docs/share-links-integration-149.md)를 따른다. 실행 결과는 검증한 PR에 기록한다(첫 기록: [PR #266](https://github.com/JminAILab/CatchU/pull/266)).

> 코드를 고치기 전에 [api 코딩 규약](CONVENTIONS.md), 이 문서, 맡은 기능의 `api/docs/<기능>.md`를 한 파일씩 따로 열어 읽는다(여러 파일을 한 번에 출력하면 가운데가 잘릴 수 있다). 기능별 안내는 이 README에 덧붙이지 않고 `api/docs/<기능>.md`로 쓴다.

NestJS로 만드는 첫 MVP의 API 서버다. 인증·회원·프로필·GitHub 연동, 분석 요청·작업 상태, 본인 자산 조회·공개/숨김, 공유 링크·수신자 접근을 다룬다. 수집·분석 처리는 worker와 연결한다. 세부 범위는 [MVP 범위 문서](../aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/scope-definition/scope-document.md)와 해당 작업의 합의된 기준을 확인한다.

현재 구현은 `GET /health`, [#87 API 인증 기반](https://github.com/JminAILab/CatchU/issues/87), [#88 공통 오류 처리](https://github.com/JminAILab/CatchU/issues/88), [#86 DB 연결·마이그레이션 기반](https://github.com/JminAILab/CatchU/issues/86)이다. 모든 API에 공통 인증 Guard를 적용하며, 명시한 공개 경로만 제외한다. api는 PostgreSQL에 연결된 상태로만 기동한다(「로컬 DB 준비」). [#139 분석 메시지 수신 모듈](https://github.com/JminAILab/CatchU/issues/139)은 독립 수신 로직과 필수 공급자를 받는 실제 DB/E·B 조립을 제공하며 `AppModule`에는 자동 등록하지 않는다. [#104 회원·분석 선행 테이블](https://github.com/JminAILab/CatchU/issues/104)과 개발 회원·합성 연동·공통 멱등 처리를 제공한다. 기능 API는 [#135 본인 회원 조회·프로필 저장](docs/member-profile.md)(`GET /v1/me`, `PUT /v1/me/profile`), [#147 공유 링크 발급](https://github.com/JminAILab/CatchU/issues/147)(`POST /v1/share-links`)과 [#148 목록·중단](https://github.com/JminAILab/CatchU/issues/148)(`GET /v1/share-links`, `PUT /v1/share-links/{linkId}/stop`)이 있다([docs/share-links.md](docs/share-links.md)). 본인 Catch 조회·확인·불일치 API는 [docs/catch-owner-read-preparation.md](docs/catch-owner-read-preparation.md), 공개·숨김은 [docs/catch-visibility.md](docs/catch-visibility.md)를 따른다. 세션 유지·갱신·로그아웃은 [세션 안내 — #250](docs/auth-sessions.md)를 따른다. 실제 로그인 화면·나머지 기능 API·worker 연결은 후속 작업이다.

Google 인증 코드 교환·회원 연결 API와 앱 등록·검사 절차는 [실제 Google 로그인 — #249](docs/google-login.md)를 따른다. 2026-10-08 사용자 직접 재현으로 실제 로그인·보호 API 호출·반복 로그인·저장된 프로필 보존을 확인했다. 수동 미검증 항목과 자동 검사와 실제 화면 연결의 후속 범위는 기능 문서에서 구분한다. #250의 세션·쿠키 연결 판본에서 실제 Google/브라우저 재현은 별도로 남아 있다.

## 공통 오류 처리 — API 명세 v1

[api 코딩 규약](CONVENTIONS.md#공통-오류-처리--api-명세-v1)에 있다.

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
| BullMQ / ioredis (분석 큐 연결, 큐 검증 키트와 같은 판본) | `6.3.11` / `6.0.0` |
| PostgreSQL (로컬·테스트 Docker 이미지)  | `postgres:16`                   |
| Valkey (큐 시험 Docker 이미지)          | `valkey/valkey:8.1.6-alpine`    |

직접 의존성은 `package.json`, 전이 의존성을 포함한 설치본은 `package-lock.json`으로 고정한다. 전역 Nest CLI나 루트 workspace는 필요하지 않다. typeorm 1.1.1의 선택 peer(ioredis 5)가 ioredis 6과 충돌하므로 `overrides`로 typeorm도 같은 ioredis를 쓰게 했다(api는 TypeORM 캐시를 쓰지 않는다).

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

환경변수 목록(구분·기본값·의미)은 [docs/environment.md](docs/environment.md)에 있다. 새 환경변수는 그 표에 더한다.

실행 명령과 마이그레이션 명령이 `.env`를 읽으며, 이미 터미널 환경에 지정된 값이 우선한다. DB 값은 `.env.example`의 `DB_*` 줄을 `.env`에 옮기면 된다. 큐·worker 설정은 필요하지 않다. `.env`·의존성·빌드 결과를 제외하는 기존 `.gitignore`를 유지한다. 키를 바꾸면 이전 키로 발급한 토큰은 사용할 수 없다.

PowerShell에서 로컬 검토용 설정을 준비하는 예시다. 생성한 키는 변수에만 받아 화면에 출력하지 않는다. `900`초는 #250 팀장 결정의 Access 수명 15분이며 다른 값이면 기동을 거부한다. 정확한 web 출처·쿠키 조건은 [세션 안내](docs/auth-sessions.md)를 따른다.

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

운영 이미지와 별도 migration 이미지의 빌드·실행·교체는 [배포 안내](../deploy/README.md)를 따른다.

테이블 확인: `docker exec catchu-db psql -U catchu -d catchu -c '\dt'`

DB를 멈추거나 자료를 지우는 명령의 영향:

| 명령 | 영향 |
| --- | --- |
| `docker stop catchu-db` | DB만 멈춘다. 자료는 볼륨에 남고 `docker start catchu-db`로 다시 쓴다 |
| `npm run migration:revert` | 마지막으로 적용한 마이그레이션 1개를 되돌린다. 그 마이그레이션이 만든 테이블과 그 안의 자료가 지워진다 |
| `docker rm -f catchu-db` | 컨테이너만 지운다. 볼륨이 남아 있으면 같은 `docker run`으로 자료가 돌아온다 |
| `docker volume rm catchu-db-data` | 개발 DB 자료 전체를 지운다. 되돌릴 수 없다. 다시 `docker run`과 `npm run migration:run`부터 한다 |

PostgreSQL 주 버전: 로컬·테스트는 `postgres:16`을 유지한다. 배포 대상은 AWS다(2026-10-06 NCP에서 변경, [레포 컨벤션 §1](../docs/CatchU_레포_컨벤션.md#1-레포-구조)). 배포 DB 서비스·주 버전과 TLS·서버 인증서 검증 등 접속 옵션은 AWS 배포 작업을 재개할 때 확인한다(「아직 필요한 입력」). 로컬 검사 통과만으로 배포 DB 호환성·접속 검증을 마쳤다고 보지 않는다.

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
| `npm test`          | 빌드 후 테스트 DB에 마이그레이션을 적용하고 `test/**/*.test.cjs`를 두 줄로(줄마다 한 파일씩) 실행. health·인증 HTTP, 실제 main 진입점의 설정 로딩/기동 실패, DB 규약·테스트 DB, 분석 수신·개발 주입 대역 검사. **테스트 DB 필요**(「DB 테스트」). 서버·임시 설정은 검사 후 정리 |
| `npm run test:analysis-fixtures` | 별도 준비한 #103 공용 합성 자료로 수신 처리 검사. 자료 경로는 아래 #139 절 참고. 자료가 없으면 실패하며 묵시적으로 생략하지 않음. 이미 빌드했으면 `node --test test/analysis/shared-fixtures.check.cjs`로 빌드 없이 같은 검사(CI는 `npm test` 뒤에 이렇게 돈다) |
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
- 큐 연결(#233)의 실제 Valkey 시험은 `CATCHU_TEST_REDIS_URL`을 **셸 환경변수**로 줄 때만 돌고(`.env`로는 넘어가지 않는다), 없으면 건너뛴다. 준비 명령은 [docs/analysis-queue.md 「시험」](docs/analysis-queue.md#시험).
- 잠금 대기 상한 시험(#220)은 시험 전용 DB 계정을 만들었다 지우므로 테스트 DB 계정에 역할 생성 권한이 필요하다(위 명령의 `catchu`는 superuser). 권한이 없으면 로컬에서는 건너뛰고 `CI=true`에서는 실패한다([docs/lock-wait-limit.md 「시험」](docs/lock-wait-limit.md#시험)). 둘째 줄 DB를 만들 `CREATEDB`도 필요하며, 없으면 `npm test`가 시험 전에 멈춘다(권한을 주거나 `…_lock_test` DB를 미리 만든다).

DB를 쓰는 테스트를 추가할 때:

- `test/support/test-database.cjs`의 `openTestDataSource()`로 접속하고, 각 테스트 앞(`beforeEach`)에서 `resetTestDatabase(dataSource)`를 불러 앞선 테스트의 자료 없이 시작한다. 초기화는 마이그레이션 기록을 뺀 모든 테이블을 비운다.
- 테스트 파일은 줄마다 한 번에 하나씩 돈다(`--test-concurrency=1`). 잠금 대기 시험(`test/**/lock-wait-limit-*.test.cjs`)은 실행기가 만드는 둘째 DB(`…_lock_test`)에서 나머지와 동시에 돌고, `test/db/build-output.test.cjs`는 공용 `dist`를 다시 만들어 두 줄 앞에서 혼자 돈다. 서버 전체를 세는 조회(`pg_stat_activity`·`pg_locks`)는 `current_database()`로 한정한다. 동시 요청 검사는 한 테스트 안에서 연결을 여러 개 열어 만든다.
- 확인용 테이블이 필요하면 그 테스트 안에서 만들고 지운다. 제품 테이블은 마이그레이션으로만 만든다.

## 파일 역할과 모듈 추가 위치

[api 코딩 규약](CONVENTIONS.md#파일-역할과-모듈-추가-위치)에 있다.

## 엔티티와 마이그레이션 — 기능 담당자 안내

[api 코딩 규약](CONVENTIONS.md#엔티티와-마이그레이션--기능-담당자-안내)에 있다.

## DB 물리 규약

[api 코딩 규약](CONVENTIONS.md#db-물리-규약)에 있다.

## 트랜잭션 규약

[api 코딩 규약](CONVENTIONS.md#트랜잭션-규약)에 있다.

## B Catch 등록 저장 — #105

[Catch 등록 안내](docs/catch-registration-proposal.md)에서 저장 규칙, E 연결 조건, DB 적용·검사 방법을 확인한다.

## 인증 기반 사용과 후속 경계 — #87

[api 코딩 규약](CONVENTIONS.md#인증-기반-사용과-후속-경계--87)에 있다.

## 검토자 재현 — README만 보고 보호 API 추가·호출

[docs/auth-review.md](docs/auth-review.md)에 있다.

## 회원·분석 선행 테이블과 멱등 처리 — #104

[docs/member-analysis.md](docs/member-analysis.md)에 있다. #252·#323이 함께 쓰는 실제·개발 회원 구분(#322)도 이 문서에 있다.

## 선정 지원 저장소 조회 — #136

[docs/member-repositories.md](docs/member-repositories.md)에서 합성 연결·페이지·오류 구분과 재현 방법을 확인한다. 실제 회원의 DB 선정 공급과 #323·#232 접점·초기화·갱신 절차(#252)는 [docs/repository-selection.md](docs/repository-selection.md)에 있다.

## 분석 고지·접수·실패 재요청 — #138

[docs/analysis-intake.md](docs/analysis-intake.md)에서 합성·실제 고지(#322), 실제 회원 LIVE 접수(#323), 원자·동시·멱등 접수와 실패 재요청을 확인한다. 큐 전송·worker 실행은 포함하지 않는다.

## 본인 분석 이력·개별 상태 조회 — #140

[docs/analysis-history.md](docs/analysis-history.md)에 있다.

## 본인 회원·프로필 조회와 전체 저장 — #135

`GET /v1/me`, `PUT /v1/me/profile`의 입력 제한·이름 저장 판정·호출 예시·공개 경계는 [docs/member-profile.md](docs/member-profile.md)에 있다. 수신자 조회(#151)에 소유 회원 상태·공개 프로필을 주는 읽기 전용 공급 함수와 그 스냅샷 조건도 같은 문서에 있다.

## 실제 GitHub 계정 연결 — #231

추가 scope 없는 OAuth App 연결·해제, 발급 응답의 실제 만료 시각, 암호화 보관 설정과 #232의 단일 자격정보 제공 함수는 [docs/github-connection.md](docs/github-connection.md)를 따른다. 기능은 기본 비활성이며 실제 앱 설정·토큰 검증과 API·DB 대역 검사 범위를 구분한다.

## 비로그인 수신자 조회 — #151

`GET /v1/public/links/{token}`·`/catches/{catchId}`의 판정 순서·소유 회원 같은 시점 판정·재사용 경계는 [docs/recipient-read.md](docs/recipient-read.md)를 따른다. 기본 AppModule에 등록하며, 공개 프로필·소유 회원 상태는 A의 `OwnerProfileReader`를 쓴다.

## Worker 내부 분석 컨텍스트 — #232

제품 기동 시 실제 DB 선정 공급자를 연결하는 조건, 서비스 인증과 검사 범위는 [docs/worker-context.md](docs/worker-context.md)를 따른다. 기본 비활성이며 `WORKER_CONTEXT_ENABLED=true`와 유효한 별도 서비스 키를 준비해야 내부 조회 경로를 등록한다.

## E 수신 기록과 Catch 반영 연결 — #105

[반영 서비스](docs/result-application.md)와 [실제 수신 DB·E/B 조립](docs/receiver-registration.md)에 있다.

## 분석 메시지 수신과 개발용 주입 — #139

[docs/analysis-receiver.md](docs/analysis-receiver.md)에 있다.

## 분석 처리 시한 닫기 — #237

처리 시한(접수 후 60분)·판정 주기(1분)·닫는 규칙과 주기 실행 장치(`PeriodicTask`) 사용법은 [docs/analysis-deadline.md](docs/analysis-deadline.md)에 있다.

## 분석 요청 보내기와 알림·결과 받기(큐 연결) — #233

큐 설정은 `CATCHU_QUEUE_REDIS_URL`(큐 서버 주소, 없으면 모듈을 조립하지 않음)과 `CATCHU_QUEUE_PREFIX`(기본 `catchu`, worker와 같아야 함)다. 보내기 주기: 이전 보내기가 끝나고 5초 뒤 다음 보내기를 하며, 한 번에 대기 시도 100건을 읽는다. 큐 이름·작업 옵션·받기 규칙·수동 검증은 [docs/analysis-queue.md](docs/analysis-queue.md)에 있다. 큐 주소가 있으면 제품 main이 큐 연결을 조립해 `listen` 뒤 시작하고, 받기가 멈추면 종료 코드 1로 끝난다(켜는 조건·MOCK 결과의 한계도 같은 문서).

## 잠금 대기 상한 — #220

상한은 코드가 아니라 앱 DB 계정에 3초로 건다. 적용 위치, 경로별로 상한을 넘었을 때 남는 것, 측정과 판단이 필요한 결과는 [docs/lock-wait-limit.md](docs/lock-wait-limit.md)에 있다.

## 실행 실패 시 확인

- `EADDRINUSE`: 지정 포트가 사용 중인지 확인하고 자신이 실행한 이전 서버를 종료하거나 선택 포트를 바꾼다. 다른 사람의 프로세스를 임의 종료하지 않는다.
- `PORT` 오류: `.env`와 현재 터미널 환경의 값을 확인한다.
- `BIND_HOST는 IP 주소여야 합니다`: `localhost` 같은 이름 대신 `127.0.0.1`·`::1`·`0.0.0.0`처럼 IP로 적는다. 빈 값도 실패한다.
- 인증 설정 오류: 오류에 나온 변수 이름을 기준으로 누락·형식을 확인한다. 키·토큰 값은 출력하거나 공유하지 않는다. 개발 로그인 403은 `DEV_LOGIN_ENABLED=true`와 `NODE_ENV=development` 또는 `test`가 함께 지정됐는지 확인한다.
- `DB 설정이 없습니다: DB_...`: `.env`나 터미널 환경에 `DB_*`가 있는지 확인한다(`.env.example` 참고).
- `DB에 접속하지 못했습니다(...)`: `docker ps`로 DB 컨테이너가 실행 중인지 보고, 멈춰 있으면 `docker start catchu-db`. `ECONNREFUSED`면 주소·포트를, `password authentication failed`면 `DB_USER`·`DB_PASSWORD`가 볼륨을 처음 만들 때의 값과 같은지 확인한다.
- `docker run`의 `port is already allocated`: 5432(테스트는 5433)를 다른 PostgreSQL이 쓰고 있다. 자신이 띄운 컨테이너면 그것을 쓰고, 아니면 「로컬 DB 준비」대로 포트를 바꾼다.
- `npm test`의 `테스트 DB(...)에 접속하지 못했습니다`: 「DB 테스트」의 명령으로 테스트 DB를 띄운다.
- `migration:generate`가 남의 테이블을 만들거나 지우는 SQL을 만든다: 「엔티티와 마이그레이션」 2단계를 빼먹었거나 다른 브랜치의 마이그레이션이 개발 DB에 남아 있다.
- `dist/main.js` 없음: `npm run build`를 먼저 실행한다.
- 설치·도구 버전 오류: `node -v`, `npm -v`, 실행 경로와 `api/`에서 실행 중인지 확인한다.
- `spawn EPERM`: 테스트·watch의 자식 프로세스 실행을 제한하는 환경인지 확인한다. 검사 설정을 약화하지 않고 실행 권한이 허용된 환경에서 같은 명령을 재실행한다.

## 아직 필요한 입력

API↔worker의 메시지 형식은 [메시지 스키마 v1](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml), 수신 확인·상태 의미는 [worker 메시지 계약](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#w--worker-메시지-계약)과 [수신 업무 흐름](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#업무-흐름)·[상태 전이 정본](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#상태-전이-정본)을 따른다. 실제 전달 방식은 아래 검증이 남아 있지만 이 계약에 따른 독립 구현·MOCK 검사는 진행할 수 있다.

| 필요한 입력                                               | 결정할 곳                                                                                        | 결정 전 가능한 작업                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 배포 DB의 PostgreSQL 주 버전, SSL 등 관리형 DB 접속 옵션  | AWS 배포 작업 재개 때([#24](https://github.com/JminAILab/CatchU/issues/24))                      | 로컬·테스트는 `postgres:16`을 유지한다(「로컬 DB 준비」) |
| 큐 선정·버전과 실제 전달 방식 | [#77 큐 기술 검증](https://github.com/JminAILab/CatchU/issues/77): Node·Python 호환성, 중복 전달·worker 중단 시 분석 재실행 방지, 배포 서버 제약과 실행 불명 처리 확인 후 결정 | BullMQ로 정했다. 큐 송수신 모듈(#233)은 있고 `AppModule` 등록은 #252 좌표 제공자·#105 근거 보존 수정 뒤 |
| 현행 E·B·F 계약으로 해결되지 않는 연결 쟁점 | 기존 계약·기능 설계를 먼저 확인하고 실제 기능 담당자 사이에서 남은 쟁점을 조율 | 합의된 책임·반영 기준으로 독립 구현을 진행하고, 미결의 영향 범위만 보류. api 초기화 담당에게 자동 배정하지 않음 |
| 인증·외부 서비스·큐의 개발·테스트 환경                    | 관련 계약과 공통 환경 준비 작업                                                                  | 필요한 설정·계정·실제 연결 검증 범위 정리                                      |

DB는 「로컬 DB 준비」·「DB 테스트」로 준비한다. web·api·worker·PostgreSQL을 함께 띄우는 순서와 서비스끼리 맞출 설정값은 [로컬 통합 실행 안내](../docs/CatchU_로컬통합실행.md)에 있다. 큐의 공통 준비 방법은 공통 환경 준비 작업에서 마련하고, api 쪽에서는 필요한 접속·실행 조건을 제공한다. 각 사용자는 그 안내로 자신의 환경을 준비한다. DB 모델·마이그레이션·메시지 처리 구현은 해당 기능의 책임과 계약에 따라 나눈다. 연결을 추가할 때 환경변수·공통 준비 안내·실제 및 모의 연결 범위와 자료 변경 명령의 영향을 문서화한다.

서버 로그는 요청 처리·분석 작업 상태·결과 반영·실패를 구분해 확인할 수 있게 준비한다. 로깅 도구와 식별자 전달 형식은 후속 설정·계약에서 정하며, 기록·공유 시 자료 보호는 공통 작업관리를 따른다.

개발 준비 완료는 공통 작업관리의 확인 목록으로 판단한다. 확인한 사람·환경·기준 커밋, 작성자 외 재현 여부와 실제·모의 연결 범위는 초기화 이슈·PR에 남긴다. 로컬 실행 확인과 AWS 배포 검증은 각각 기록한다.

## 로컬 검증 기록 — 2026-09-23

[api 로컬 검증 기록](docs/verification-records.md#로컬-검증-기록--2026-09-23)에 있다.

## #87 로컬 검증 기록 — 2026-09-25

[api 로컬 검증 기록](docs/verification-records.md#87-로컬-검증-기록--2026-09-25)에 있다.
