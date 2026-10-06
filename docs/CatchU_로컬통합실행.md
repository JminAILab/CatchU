# CatchU 로컬 통합 실행 안내

> **지위: 안내** · 한 컴퓨터에서 PostgreSQL·api·worker·web을 함께 띄우는 로컬 개발용 순서다. 작성자가 macOS에서, 작성자 외 1명이 Windows의 새 작업 폴더에서 1~4단계와 끄는 순서를 따라 해 확인했다([PR #174 리뷰][r174]). 5단계는 그 절을 추가한 [PR #185][p185]에서 Linux·Chromium으로 검증했고(「확인」), 안내 작성자가 macOS에서 따라 해 로그인 뒤 `/home` 이동, 새로고침 뒤 재로그인, 로그아웃을 확인했다([#107][i107]). 각 서비스의 설치·검사 상세는 서비스 README가 정본이다.

## 한눈에 보기

- 켜는 순서는 **PostgreSQL → api → worker → web**, 끄는 순서는 그 반대다.
- 포트: PostgreSQL `5432`, api `3001`, worker `8000`, web `3000`. api 테스트용 DB는 `5433`이다.
- api ↔ PostgreSQL과 web의 개발용 로그인·공통 API 호출을 연결한다. worker는 아직 api와 연결 설정이 없고(큐는 [#77][i77]), 실제 기능 API와의 연결은 각 기능 작업에서 확인한다.
- 비밀값은 api의 `AUTH_JWT_SECRET` 하나다. 각자 만들어 `api/.env`에만 두고 화면·로그·PR에 남기지 않는다.

## 준비물

| 도구 | 버전 | 쓰는 곳 | 설치 안내 |
|---|---|---|---|
| Docker (Docker Desktop 등) | `postgres:16` 이미지를 받을 수 있으면 된다 | PostgreSQL | [api README 「로컬 DB 준비」](../api/README.md#로컬-db-준비) |
| Node.js / npm | `24.21.0` / `11.19.0` | api, web | [api README 「설치와 환경변수」](../api/README.md#설치와-환경변수), [web README 「설치」](../web/README.md#설치) |
| uv (Python `3.12.10`은 uv가 준비) | worker README 기준 | worker | [worker README 「설치와 가상환경」](../worker/README.md#설치와-가상환경) |

아래 명령은 macOS 셸(zsh)에서 확인했다. Windows PowerShell 명령은 각 서비스 README에 있다. 터미널은 api·worker·web 실행용 세 개와 확인용 하나를 연다. 모든 명령은 저장소 루트에서 시작한다.

## 켜는 순서

### 1. PostgreSQL

처음 한 번만 컨테이너를 만든다. 다음부터는 `docker start catchu-db`만 한다.

```sh
docker run -d --name catchu-db -p 127.0.0.1:5432:5432 -e POSTGRES_USER=catchu -e POSTGRES_PASSWORD=catchu_local -e POSTGRES_DB=catchu -v catchu-db-data:/var/lib/postgresql/data postgres:16
```

정상 확인:

```sh
docker exec catchu-db pg_isready -U catchu -d catchu
```

`accepting connections`가 나오면 된다. 이 비밀번호는 내 컴퓨터의 로컬 컨테이너 전용이다. 5432를 이미 다른 프로그램이 쓰고 있으면 「자주 막히는 곳」을 본다.

### 2. api

```sh
cd api
npm ci
```

`api/.env`를 처음 한 번 만든다. 아래 명령은 `.env.example`을 복사하면서 서명 키를 새로 만들어 넣고, 토큰 수명을 `900`초로, 개발용 로그인을 켠다. 키는 화면에 나오지 않는다. `.env`가 이미 있으면 덮어쓰지 않고 실패한다.

```sh
node -e "const fs=require('node:fs');const key=require('node:crypto').randomBytes(32).toString('hex');const text=fs.readFileSync('.env.example','utf8').replace(/^AUTH_JWT_SECRET=.*$/m,'AUTH_JWT_SECRET='+key).replace(/^AUTH_ACCESS_TOKEN_TTL_SECONDS=.*$/m,'AUTH_ACCESS_TOKEN_TTL_SECONDS=900').replace(/^DEV_LOGIN_ENABLED=.*$/m,'DEV_LOGIN_ENABLED=true');fs.writeFileSync('.env',text,{flag:'wx',mode:0o600})"
```

`900`초는 로컬 확인용 예시이고 제품 수명 정책이 아니다. PowerShell에서는 [api README 「설치와 환경변수」](../api/README.md#설치와-환경변수)대로 터미널 환경변수로 준비한다.

마이그레이션을 적용하고 api를 켠다. 앱은 켜질 때 스키마를 바꾸지 않으므로, 새 마이그레이션이 들어온 브랜치를 받으면 켜기 전에 `migration:run`을 다시 한다.

```sh
npm run migration:run
npm run start:dev
```

- `migration:run`: 끝에 `No migrations are pending`이 나오면 모두 적용된 것이다.
- `start:dev`: `API 실행: http://127.0.0.1:3001/health` 줄이 나오면 켜진 것이다.

정상 확인(확인용 터미널):

```sh
curl -i http://127.0.0.1:3001/health
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3001/v1/auth/dev-login -H 'Content-Type: application/json' -d '{"memberId":"local-member-1"}'
```

- 첫 줄: `HTTP/1.1 200 OK`와 `{"status":"ok"}`. 이 응답은 DB 상태를 보지 않는다. DB가 꺼져 있으면 api가 아예 켜지지 않는다.
- 둘째 줄: `200`. 개발용 로그인이 켜져 있다는 뜻이다. 토큰은 출력하지 않는다. `403`이면 `.env`의 `DEV_LOGIN_ENABLED`와 `NODE_ENV`를 본다.

**보호 경로 호출(선택).** 로그인이 필요한 제품 경로는 지금 공유 링크의 목록·발급·중단이다. 받은 토큰이 통하는지는 요청 내용이 필요 없는 내 링크 목록(`GET /v1/share-links`)으로 본다. 토큰은 변수에만 담는다.

```sh
TOKEN=$(curl -s -X POST http://127.0.0.1:3001/v1/auth/dev-login -H 'Content-Type: application/json' -d '{"memberId":"local-member-1"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).accessToken))")
curl -s -w ' %{http_code}\n' http://127.0.0.1:3001/v1/share-links
printf 'Authorization: Bearer %s\n' "$TOKEN" | curl -s -w ' %{http_code}\n' -H @- http://127.0.0.1:3001/v1/share-links
unset TOKEN
```

토큰 없이는 `AUTH_REQUIRED` 본문과 `401`, 토큰을 붙이면 내 링크 목록과 `200`이 나온다(링크가 없으면 `{"items":[],"page":{"nextCursor":null}}`). 개발용 로그인은 입력한 문자열로 회원을 찾거나 만들어 그 회원의 UUID를 토큰에 넣으므로, 같은 문자열로 다시 로그인하면 같은 회원으로 들어간다. 토큰에 담긴 회원 UUID를 직접 보려면 [api 「검토자 재현」](../api/docs/auth-review.md)의 확인용 컨트롤러를 잠시 붙였다가 지운다.

### 3. worker

```sh
cd worker
uv sync --locked
uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

`Application startup complete.`가 나오면 켜진 것이다. 정상 확인:

```sh
curl -i http://127.0.0.1:8000/health
```

`HTTP/1.1 200 OK`와 `{"status":"ok"}`가 나오면 된다. worker는 아직 환경변수가 없고 DB·api와 연결하지 않는다.

### 4. web

```sh
cd web
npm ci
npm run dev
```

`Ready`가 나오면 브라우저에서 <http://localhost:3000>을 연다. 제목 "CatchU web"이 보이면 된다. 터미널에서 확인하려면:

```sh
curl -s http://localhost:3000/ | grep -o 'CatchU web'
```

### 5. web에서 로그인해 api 부르기

1. `api/.env`에 `CORS_ALLOWED_ORIGINS=http://localhost:3000`을 넣고 api를 다시 켠다. 개발용 로그인에는 `DEV_LOGIN_ENABLED=true`와 `NODE_ENV=development`가 필요하다.
2. `web/.env.example`을 참고해 `web/.env.local`에 `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001`과 `NEXT_PUBLIC_DEV_LOGIN_ENABLED=true`를 넣는다. 기존 파일은 덮어쓰지 않는다. 값을 바꾸면 web을 다시 켠다.
3. `http://localhost:3000/login`에서 개발용 식별 문자열을 입력한다. api가 해당 회원을 찾거나 만들어 로그인하며, 요청 필드 이름은 `memberId`다. 성공하면 `/home`으로, 회원 경로에서 왔다면 검증된 `next`로 돌아간다.
4. 새로고침하면 메모리 토큰이 사라져 다시 로그인한다. 로그아웃하면 `/`로 이동한다. 이름 미저장 회원의 최초 입력 이동은 `GET /v1/me`(#135) 연결 뒤 확인한다.

기능 화면은 [web README 「API 호출」](../web/README.md#api-호출-106-pr②)의 `api.member`·`api.recipient`를 사용한다. 회원 호출만 Bearer 토큰을 첨부하고, 수신자 비밀번호 차단의 `Retry-After`는 `retryAfterSeconds`로 전달한다. 토큰 전달만 확인할 때는 2단계의 내 링크 목록 호출을 쓰며, 이것을 web 화면의 기능 연결 완료로 세지 않는다. 토큰 값을 화면·로그·공유 자료에 남기지 않는다.

## 끄는 순서

1. web, worker, api를 띄운 터미널에서 차례로 `Ctrl+C`를 누른다.
2. DB를 멈춘다. 자료는 볼륨에 남고 `docker start catchu-db`로 다시 쓴다.

```sh
docker stop catchu-db
```

다 껐는지는 `curl http://127.0.0.1:3001/health`처럼 각 주소가 연결 거부되는지로 본다. 자료를 지우는 명령(`migration:revert`, `docker volume rm`)의 영향은 [api README 「로컬 DB 준비」](../api/README.md#로컬-db-준비)의 표를 먼저 읽는다.

## 서비스끼리 맞출 설정값

이름은 각 서비스 `.env.example`과 같다. 아직 이름이 없는 설정은 정할 작업을 적었다.

| 설정 | 이름 | 쓰는 서비스 | 로컬 개발 값 | 비밀값 | 맞출 곳 |
|---|---|---|---|---|---|
| DB 접속 | `DB_HOST` · `DB_PORT` · `DB_USER` · `DB_PASSWORD` · `DB_NAME` | api | `127.0.0.1` · `5432` · `catchu` · `catchu_local` · `catchu` | 로컬 값은 아님. 배포 값은 비밀 | PostgreSQL 컨테이너의 `-p` 포트와 `POSTGRES_USER`·`POSTGRES_PASSWORD`·`POSTGRES_DB` |
| 테스트 DB 접속 | `TEST_DB_HOST` · `TEST_DB_PORT` · `TEST_DB_USER` · `TEST_DB_PASSWORD` · `TEST_DB_NAME` | api(`npm test`만) | `127.0.0.1` · `5433` · `catchu` · `catchu_local` · `catchu_test` | 아님 | 테스트 DB 컨테이너([api README 「DB 테스트」](../api/README.md#db-테스트)) |
| api 주소 | `BIND_HOST` · `PORT` | api | `127.0.0.1` · `3001` | 아님 | web이 부를 API 주소 |
| 토큰 서명 키 | `AUTH_JWT_SECRET` | api(지금은 api만 서명·검증) | 없음. 각자 만든다 | **비밀** | 없음 |
| 토큰 수명 | `AUTH_ACCESS_TOKEN_TTL_SECONDS` | api | 없음. 이 안내는 `900` | 아님 | 없음 |
| 개발용 로그인 | `DEV_LOGIN_ENABLED` · `NODE_ENV` | api | 이 안내는 `true` · `development` | 아님 | 배포에서는 `NODE_ENV=production`이라 켜지지 않는다 |
| web이 부를 API 주소 | `NEXT_PUBLIC_API_BASE_URL` | web | api 주소와 같게 | 아님 | api의 `BIND_HOST`·`PORT` |
| CORS 허용 주소 | `CORS_ALLOWED_ORIGINS` | api | web 주소(`http://localhost:3000`) | 아님 | web을 여는 주소 |
| worker 주소 | 환경변수 없음. 실행 명령의 `--host`·`--port` | worker | `127.0.0.1` · `8000` | 아님 | api→worker 연결 설정은 큐 작업([#77][i77])에서 정한다 |
| web 포트 | 환경변수 없음. 실행 인자 `-p` | web | `3000` | 아님 | CORS 허용 주소. `.env`의 `PORT`는 적용되지 않는다 |
| 링크 grant 서명 키 | `LINK_GRANT_SECRET`([#150][i150]) | api | 비우면 실행마다 임시 키(재시작하면 비밀번호 다시 입력) | **비밀** | 없음. `AUTH_JWT_SECRET`과 다른 값. 배포에서 없으면 api 기동 실패 |
| 공유 링크 기준 주소 | `SHARE_LINK_WEB_BASE_URL`([#147][i147]) | api | 비우면 `http://localhost:3000` | 아님 | web을 여는 주소. 배포(`NODE_ENV=production`)에서 없으면 api 기동 실패 |

`BIND_HOST`는 IP 주소만 받는다. `0.0.0.0`으로 바꾸면 같은 네트워크의 다른 기기에서도 api에 접속되므로 컨테이너처럼 다른 주소에서 들어와야 할 때만 쓴다.

## 자주 막히는 곳

| 증상 | 할 일 |
|---|---|
| `docker run`이 `port is already allocated`로 실패 | 5432를 다른 PostgreSQL이 쓰고 있다. 내가 전에 만든 `catchu-db`면 그것을 `docker start`한다. 아니면 `-p 127.0.0.1:5436:5432`처럼 바깥 포트를 바꾸고 `api/.env`의 `DB_PORT`를 같은 값으로 바꾼다 |
| api·worker·web이 포트 사용 중으로 실패(`EADDRINUSE`, `Address already in use`) | `lsof -nP -iTCP:<포트> -sTCP:LISTEN`으로 누가 쓰는지 본다. 내가 띄운 이전 서버면 끈다. 남의 프로세스는 끄지 않고 포트를 바꾼다(api `PORT`, worker `--port`, web `-p`). api 포트를 바꾸면 web이 부를 API 주소도 바꾼다 |
| api가 `DB에 접속하지 못했습니다(<주소>/<DB>)`를 내고 종료 | `docker ps`로 DB 컨테이너가 켜져 있는지 본다. 꺼져 있으면 `docker start catchu-db`. `ECONNREFUSED`면 `DB_HOST`·`DB_PORT`, `password authentication failed`면 볼륨을 처음 만들 때의 사용자·비밀번호와 `.env`가 같은지 본다 |
| api가 `AUTH_JWT_SECRET` 등 설정 이름을 말하며 종료 | `api/.env`에 그 값이 비었거나 형식이 틀렸다. 「2. api」의 `.env` 만들기를 다시 한다. 키를 출력해 확인하지 않는다 |
| api가 `BIND_HOST는 IP 주소여야 합니다`로 종료 | `localhost` 같은 이름 대신 `127.0.0.1`처럼 IP로 적는다 |
| 새 브랜치를 받은 뒤 API가 테이블 관련 오류를 낸다 | 마이그레이션을 적용하지 않았을 수 있다. api를 끄고 `npm run migration:run`을 한 뒤 다시 켠다 |
| web 화면에서 api 호출이 CORS 오류로 막힌다 | `CORS_ALLOWED_ORIGINS`가 web을 여는 출처와 정확히 같은지 확인하고 api를 다시 켠다. web의 `NEXT_PUBLIC_API_BASE_URL`도 api 주소와 맞춘다 |

## 다루지 않는 것

Dockerfile·Compose, NCP 배포·복구([#24][i24]), 실제 큐 연결([#77][i77]), CI는 이 안내의 범위가 아니다. 로컬에서 네 구성요소가 켜지는 것은 배포 검증이나 서비스 간 기능 연결 확인을 뜻하지 않는다.

[i24]: https://github.com/JminAILab/CatchU/issues/24
[i77]: https://github.com/JminAILab/CatchU/issues/77
[i106]: https://github.com/JminAILab/CatchU/issues/106
[i147]: https://github.com/JminAILab/CatchU/issues/147
[i150]: https://github.com/JminAILab/CatchU/issues/150
[i107]: https://github.com/JminAILab/CatchU/issues/107
[r174]: https://github.com/JminAILab/CatchU/pull/174#pullrequestreview-5349715690
[p185]: https://github.com/JminAILab/CatchU/pull/185
