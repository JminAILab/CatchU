# CatchU 로컬 통합 실행 안내

> **지위: 안내** · 한 컴퓨터에서 PostgreSQL·api·worker·web을 함께 띄우는 로컬 개발용 순서다. 작성자가 macOS에서, 작성자 외 1명이 Windows의 새 작업 폴더에서 1~4단계와 끄는 순서를 따라 해 확인했다([PR #174 리뷰][r174]). 5단계는 그 절을 추가한 [PR #185][p185]에서 Linux·Chromium으로 검증했고(「확인」), 안내 작성자가 macOS에서 따라 해 로그인 뒤 `/home` 이동, 새로고침 뒤 재로그인, 로그아웃을 확인했다([#107][i107]). 각 서비스의 설치·검사 상세는 서비스 README가 정본이다.

## 한눈에 보기

- 켜는 순서는 **PostgreSQL → api → worker → web**, 끄는 순서는 그 반대다.
- 포트: PostgreSQL `5432`, api `3001`, worker `8000`, web `3000`. api 테스트용 DB는 `5433`이다.
- api ↔ PostgreSQL과 web의 개발용 로그인·공통 API 호출을 연결한다. 1~5단계의 worker는 상태 확인만 뜨고 api와 연결하지 않는다. 큐를 붙여 실제 분석까지 가는 순서는 「실제 분석까지 띄우기」에 따로 있다.
- 비밀값은 api의 `AUTH_JWT_SECRET` 하나다. 각자 만들어 `api/.env`에만 두고 화면·로그·PR에 남기지 않는다.

## 준비물

| 도구 | 버전 | 쓰는 곳 | 설치 안내 |
|---|---|---|---|
| Docker (Docker Desktop 등) | pgvector가 든 PostgreSQL 16 이미지(`pgvector/pgvector:0.8.7-pg16-trixie`)를 받을 수 있으면 된다 | PostgreSQL | [api README 「로컬 DB 준비」](../api/README.md#로컬-db-준비) |
| Node.js / npm | `24.21.0` / `11.19.0` | api, web | [api README 「설치와 환경변수」](../api/README.md#설치와-환경변수), [web README 「설치」](../web/README.md#설치) |
| uv (Python `3.12.10`은 uv가 준비) | worker README 기준 | worker | [worker README 「설치와 가상환경」](../worker/README.md#설치와-가상환경) |

아래 명령은 macOS 셸(zsh)에서 확인했다. Windows PowerShell 명령은 각 서비스 README에 있다. 터미널은 api·worker·web 실행용 세 개와 확인용 하나를 연다. 모든 명령은 저장소 루트에서 시작한다.

## 켜는 순서

### 1. PostgreSQL

처음 한 번만 컨테이너를 만든다. 다음부터는 `docker start catchu-db`만 한다.

```sh
docker run -d --name catchu-db -p 127.0.0.1:5432:5432 -e POSTGRES_USER=catchu -e POSTGRES_PASSWORD=catchu_local -e POSTGRES_DB=catchu -v catchu-db-data:/var/lib/postgresql/data pgvector/pgvector:0.8.7-pg16-trixie
```

전에 `postgres:16`으로 만든 `catchu-db`가 있으면 `docker rm -f catchu-db` 뒤 위 명령을 다시 한다. 볼륨이 그대로라 자료는 남는다.

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

`Ready`가 나오면 브라우저에서 <http://localhost:3000>을 연다. 서비스 소개 화면(제목 "GitHub의 작업 기록을, 내 경험을 설명하는 근거로.")이 보이면 된다. 터미널에서 확인하려면:

```sh
curl -s http://localhost:3000/ | grep -o 'id="landing-title"'
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
| 링크 grant 서명 키 | `LINK_GRANT_SECRET`([#150][i150]) | api | 비우면 실행마다 임시 키(재시작하면 비밀번호 다시 입력). `NODE_ENV`가 `development`·`test`일 때만 비울 수 있다 | **비밀** | 없음. `AUTH_JWT_SECRET`과 다른 값. 그 밖(`production`·미지정 포함)에서 없으면 api 기동 실패 |
| 공유 링크 기준 주소 | `SHARE_LINK_WEB_BASE_URL`([#147][i147]) | api | 비우면 `http://localhost:3000` | 아님 | web을 여는 주소. 배포(`NODE_ENV=production`)에서는 https 주소가 없으면 api 기동 실패 |

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

## 실제 분석까지 띄우기

위 1~5단계는 개발용 로그인과 합성 자료까지다. 이 절은 내 컴퓨터에서 실제 Google 로그인 → GitHub 연결 → 공개 저장소 분석 → Catch 확인까지 간다. 큐(Valkey)와 DB는 컨테이너 두 개로 띄우고, 파일은 내 컴퓨터 폴더에 저장한다. AWS(S3 등)는 쓰지 않는다. 실행 도구는 `scripts/local-live/`에 있다.

**확인 상태(2026-11-12).** macOS에서 가짜 키로 환경 만들기·이주·세 서비스 기동·큐 연결까지 확인했다. 같은 구성의 실제 분석은 2026-11-03에 팀장 컴퓨터(macOS)에서 한 번 끝까지 갔다([#450 기록][c450]). 이 도구로 실제 키를 넣어 끝까지 가는 것과 Windows(WSL2)에서의 실행, 아래 키 발급 화면 순서는 아직 확인 전이다.

### 알고 시작할 것

- 팀원이 **본인 키로 공개 저장소를 분석하는 것은 팀장 허가 없이 한다**(2026-11-12 팀장 결정). 비용은 본인 Claude 계정에서 나간다. 2026-11-03에 작은 저장소 하나가 2분 26초, 약 0.04달러였다(Catch 46개). 큰 저장소의 시간과 비용은 아직 재지 않았다.
- 분석하면 그 저장소의 바뀐 줄이 내 Claude 계정(Anthropic)으로 전송된다. 임베딩은 합성 제공자로 떠서 Voyage로는 아무것도 보내지 않는다.
- 비공개 저장소는 접수에서 거부된다(`403`). 공개 저장소만 분석한다.
- 로그(`~/catchu-local-live/logs/`)에는 실제 자료가 남는다. 로그와 키를 이슈·PR·대화·AI 도구에 붙이지 않는다. 오류를 물을 때는 오류 문구 한 줄만 옮긴다.
- 개발용 로그인으로는 실제 분석을 할 수 없다. 개발용 로그인은 합성 고지와 합성 저장소만 받는다. 그래서 Google 로그인이 필요하다.

### Windows 준비

Windows에서는 **WSL2(Ubuntu) 안에서** 아래를 모두 실행한다. worker의 큐 소비자가 종료 신호를 Windows에서 지원되지 않는 방식으로 받아(`worker/app/consumer/service.py`의 `add_signal_handler`) PowerShell에서는 뜨지 않기 때문이다.

1. 관리자 PowerShell에서 `wsl --install`로 WSL2와 Ubuntu를 설치하고 다시 시작한다.
2. Docker Desktop의 설정에서 WSL 연동(Resources → WSL integration)에 Ubuntu를 켠다. Ubuntu 터미널에서 `docker ps`가 되면 된다.
3. Ubuntu 안에 Node.js·npm과 uv를 「준비물」의 버전으로 설치한다.
4. 저장소를 Ubuntu의 홈 폴더 아래에 받는다. `/mnt/c/` 아래는 느려서 쓰지 않는다.
5. 브라우저는 Windows에서 그대로 `http://localhost:3000`을 연다.

### 내 키 세 가지

각자 발급한다. 다른 사람의 키를 받아 쓰지 않는다. 화면 이름은 발급 사이트가 바꿀 수 있다.

| 키 | 발급하는 곳 | 넣을 값 |
|---|---|---|
| Claude API 키 | Claude 개발자 콘솔에서 결제 수단을 등록하고 API 키를 만든다 | `CATCHU_GENERATION_API_KEY` |
| GitHub OAuth App | GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App. Homepage URL `http://localhost:3000`, Authorization callback URL `http://localhost:3000/github/callback`. 만든 뒤 client secret을 새로 만든다 | `GITHUB_OAUTH_CLIENT_ID` · `GITHUB_OAUTH_CLIENT_SECRET` |
| Google OAuth 클라이언트 | Google Cloud 콘솔에서 프로젝트를 만들고, OAuth 동의 화면을 외부·테스트 상태로 두고 테스트 사용자에 내 Google 계정을 넣는다. 사용자 인증 정보에서 「웹 애플리케이션」 OAuth 클라이언트를 만들고 승인된 리디렉션 URI에 `http://localhost:3000/google/callback`을 넣는다 | `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` |

GitHub는 「GitHub Apps」가 아니라 「OAuth Apps」에서 만든다. GitHub App의 client ID처럼 점(`.`)이 든 값을 넣으면 api가 `GitHub 연동 키 설정 형식이 잘못되었습니다`로 뜨지 않는다. Voyage 키와 OpenAI 판정 키는 필요 없다.

### 순서

모든 명령은 저장소 루트에서 한다. 처음이면 의존성을 먼저 설치한다.

```sh
(cd api && npm ci)
(cd web && npm ci)
(cd worker && uv sync --locked)
```

**1. 환경 만들기(처음 한 번).** 환경 폴더 `~/catchu-local-live/`와 컨테이너 `catchu-live-db`(127.0.0.1:55432)·`catchu-live-queue`(127.0.0.1:56379)를 만든다. 다시 실행해도 이미 있는 것은 건드리지 않는다. 위 1~5단계의 `catchu-db`·`api/.env`와는 따로다.

```sh
bash scripts/local-live/setup.sh
```

**2. 키 적기.** `~/catchu-local-live/secrets.env`를 편집기로 열어 다섯 값을 `이름=값` 꼴로 적는다. 따옴표와 빈칸을 넣지 않는다.

**3. 이주(처음, 그리고 새 이주가 든 브랜치를 받았을 때).**

```sh
bash scripts/local-live/migrate.sh
```

**4. 띄우기.** 터미널 세 개에서 하나씩 띄운다. 로그는 화면에 나오지 않고 `~/catchu-local-live/logs/`에 쌓인다.

```sh
bash scripts/local-live/run-api.sh
```

```sh
bash scripts/local-live/run-worker.sh
```

```sh
bash scripts/local-live/run-web.sh
```

정상 확인(네 번째 터미널). 둘 다 `200`이고, worker 본문에 `"consumer":"running"`이 있으면 된다.

```sh
curl -i http://127.0.0.1:3001/health
curl -i http://127.0.0.1:8000/health
```

**5. 분석하기.** 브라우저에서 `http://localhost:3000/login`을 연다(`127.0.0.1:3000`으로 열지 않는다). Google로 로그인 → GitHub 연결 → 공개 저장소 주소 등록 → 고지에 동의하고 분석 요청 → 끝나면 내 화면에서 Catch와 근거를 본다.

### 판정을 켤지

기본은 꺼짐이다. 켤지는 각자 정한다. 켜려면 `~/catchu-local-live/worker.env`의 `# CATCHU_JUDGEMENT_PROVIDER=claude` 줄에서 맨 앞의 `#`과 빈칸을 지우고 worker를 다시 띄운다. 상세는 [worker 「판정」](../worker/docs/generation-judgement.md).

| | 꺼짐(기본) | 켬(`claude`) |
|---|---|---|
| 제목·설명 | 정해진 틀의 설명 문장과 규칙으로 만든 제목 | Claude가 바뀐 줄을 보고 제목 후보와 설명 문장을 쓰고, 판정이 틀려 보이는 것을 거른다 |
| Claude로 가는 자료 | 바뀐 줄 | 바뀐 줄에 더해 PR 제목과 커밋 메시지 첫 줄 |
| 호출 수 | Catch마다 생성 1번 | Catch마다 판정 1번이 더 붙는다(큰 작업은 2번). 시간과 비용이 그만큼 는다 |

### 막히는 곳

| 증상 | 할 일 |
|---|---|
| `... 값이 비어 있다` | `secrets.env`에 그 값을 적는다 |
| api가 `GitHub 연동 키 설정 형식이 잘못되었습니다`로 종료 | OAuth App의 client ID인지 본다(위 「내 키 세 가지」) |
| GitHub 연결을 마치고 돌아오면 로그인이 풀린다 | 브라우저를 `http://localhost:3000`으로 열었는지, `web.env`의 api 주소가 `http://localhost:3001`인지 본다. `127.0.0.1`이면 로그인 유지 쿠키가 실리지 않는다 |
| 분석 요청이 `403`으로 거부된다 | 비공개 저장소다. 공개 저장소만 된다 |
| 포트가 이미 쓰이고 있다 | 3000·3001·8000을 쓰는 이전 서버를 끈다. 컨테이너 포트는 `setup.sh`를 처음 돌리기 전에 `CATCHU_LOCAL_LIVE_DB_PORT`·`CATCHU_LOCAL_LIVE_QUEUE_PORT`로 바꾼다 |
| 컴퓨터를 다시 켠 뒤 api가 DB에 붙지 못한다 | Docker를 켠다. 컨테이너는 Docker가 켜지면 스스로 다시 뜬다 |
| worker가 Windows PowerShell에서 뜨지 않는다 | WSL2 안에서 실행한다(위 「Windows 준비」) |

### 정리

세 터미널에서 `Ctrl+C`로 끈다. 환경을 지우려면 아래를 한다. 둘째 줄은 내 키 파일, 저장해 둔 GitHub 접근 정보, 로그까지 지운다. GitHub에 남은 앱 승인은 GitHub 설정에서 따로 취소한다.

```sh
docker rm -f catchu-live-db catchu-live-queue
rm -rf ~/catchu-local-live
```

## 다루지 않는 것

Dockerfile·Compose, AWS 배포·복구([#24][i24]), CI는 이 안내의 범위가 아니다. 로컬에서 네 구성요소가 켜지는 것은 배포 검증이나 서비스 간 기능 연결 확인을 뜻하지 않는다.

[i24]: https://github.com/JminAILab/CatchU/issues/24
[i77]: https://github.com/JminAILab/CatchU/issues/77
[i106]: https://github.com/JminAILab/CatchU/issues/106
[i147]: https://github.com/JminAILab/CatchU/issues/147
[i150]: https://github.com/JminAILab/CatchU/issues/150
[i107]: https://github.com/JminAILab/CatchU/issues/107
[c450]: https://github.com/JminAILab/CatchU/issues/450#issuecomment-6594697237
[r174]: https://github.com/JminAILab/CatchU/pull/174#pullrequestreview-5349715690
[p185]: https://github.com/JminAILab/CatchU/pull/185
