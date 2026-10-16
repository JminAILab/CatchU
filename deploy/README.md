# CatchU 배포 이미지와 단일 실행

web·api·worker 운영 이미지를 만들고, 한 호스트에서 API 한 프로세스·worker 한 실행으로 띄우고 바꾸는 방법이다([#275](https://github.com/JminAILab/CatchU/issues/275)). AWS 실행 자원(EKS·DB·큐·공개 주소·비밀값 주입)은 [#276](https://github.com/JminAILab/CatchU/issues/276)에서 정하고, 실제 배포 결과는 [#277](https://github.com/JminAILab/CatchU/issues/277)에서 확인한다. 그 값이 필요한 EKS 실행 파일과 운영 web 이미지는 아직 만들지 않았다(「#276에서 받을 값」).

명령은 모두 저장소 루트에서 실행한다. 서비스별 설치·개발 실행·검사는 각 서비스 README를 따른다.

12월 전 개발 단계에는 이 한 호스트 실행을 AWS 서버 한 대에 올려 운영한다(앞단 Caddy 포함): [dev-server/README.md](dev-server/README.md).

## 구성

| 파일 | 하는 일 |
|---|---|
| [`web/Dockerfile`](../web/Dockerfile) | web 이미지. Next standalone 서버(`node server.js`), 포트 3000 |
| [`api/Dockerfile`](../api/Dockerfile) | api 이미지(기본 단계, `node dist/main.js`, 포트 3001)와 migration 이미지(`--target migration`) |
| [`worker/Dockerfile`](../worker/Dockerfile) | worker 이미지. 분석 요청 큐 소비자(`/health` 포트 8000)와 합성(MOCK) 처리 명령 |
| [`.dockerignore`](../.dockerignore) | 빌드 맥락에 Dockerfile이 복사하는 경로(잠금 파일·설정·`src`·`app`·합성 자료·계약 YAML 두 개)만 넣는다 |
| [`compose.single.yaml`](compose.single.yaml) | 한 호스트 실행. api·worker·web 각 1개, migration은 따로 실행 |
| [`compose.local-db.yaml`](compose.local-db.yaml), [`local-db/`](local-db) | 로컬 합성 DB·큐(검증·재현 전용). DB는 TLS와 앱·migration 계정 분리를 운영과 같은 방식으로 재현한다. 큐는 내부 망의 평문 Valkey 8.1.6이고 worker를 시험 모드로 띄운다(운영 큐의 TLS·비밀번호는 재현하지 않는다) |
| [`env/`](env) | 실행 값 예시(이름만). 실제 파일은 저장소 밖에 둔다 |
| [`scripts/make-local-env.sh`](scripts/make-local-env.sh) | 저장소 밖에 합성 환경 폴더(합성 비밀값·시험용 CA)를 만든다 |
| [`scripts/replace-single.sh`](scripts/replace-single.sh) | 처음 설치와 계획 교체 절차를 차례로 실행한다 |
| [`scripts/check-images.mjs`](scripts/check-images.mjs) | 이미지 검사. GitHub Actions `images` 워크플로([`../.github/workflows/images.yml`](../.github/workflows/images.yml))도 같은 명령을 쓴다 |

## 이미지

### 고정한 판본

| 항목 | 값 |
|---|---|
| web·api 기반 | `node:24.21.0-trixie-slim`(Debian 13, npm 11.19.0 포함). Dockerfile에 digest로 고정 |
| worker 기반 | `debian:trixie-slim` 위에 uv 0.12.18이 설치한 CPython 3.12.10. 공식 `python:3.12.10` 이미지는 2025-05 이후 다시 빌드되지 않아 그 뒤의 기반 OS 패키지 갱신(보안 갱신 포함)이 들어 있지 않으므로 쓰지 않는다(Python 판본은 그대로). 다만 이 Python에 묶여 들어온 OpenSSL(3.0.16)·SQLite 등은 Debian 갱신으로 바뀌지 않고 Python 패치 판본을 올릴 때만 바뀐다 |
| 의존성 | 각 서비스 잠금 파일(`package-lock.json`, `uv.lock`) 그대로 설치 |
| 로컬 합성 DB | `postgres:16`(CI 테스트 DB와 같은 주 판본). digest로 고정 |

기반 이미지 digest를 바꿀 때는 같은 PR에서 이미지 검사를 다시 돌린다. 기반 이미지 갱신을 자동으로 알려 주는 설정(Dependabot docker)은 아직 없다.

### 빌드

```bash
docker build -f web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=https://<공개 출처> --build-arg SOURCE_REVISION=$(git rev-parse HEAD) -t <레지스트리>/catchu-web:<판본> .
docker build -f api/Dockerfile --build-arg SOURCE_REVISION=$(git rev-parse HEAD) -t <레지스트리>/catchu-api:<판본> .
docker build -f api/Dockerfile --target migration --build-arg SOURCE_REVISION=$(git rev-parse HEAD) -t <레지스트리>/catchu-api-migration:<판본> .
docker build -f worker/Dockerfile --build-arg SOURCE_REVISION=$(git rev-parse HEAD) -t <레지스트리>/catchu-worker:<판본> .
```

- 빌드 맥락은 저장소 루트(`.`)다. `.dockerignore`가 전부 막고 Dockerfile이 복사하는 경로(잠금 파일·설정·`src`·`app`·합성 자료·계약 YAML 두 개)만 연다. 서비스 폴더의 테스트·문서·다른 자료, `.git`, 하네스, 로컬 인계 파일은 들어가지 않고, 연 경로 안의 `.env*`·키·인증서·`node_modules`도 다시 뺀다. Dockerfile에서 새 경로를 복사하면 `.dockerignore`와 검사 스크립트의 허용 목록을 함께 고친다.
- 빌드하는 컴퓨터의 아키텍처로 만들어진다. 운영 노드 아키텍처는 #276에서 받고, 그 아키텍처에서 빌드·기동을 다시 확인한다. 다른 아키텍처 이미지나 에뮬레이션 결과로 대신하지 않는다.
- `docker buildx`의 기본 빌더가 `docker-container` 방식이면 `--load`를 붙여야 이미지가 로컬 목록에 들어온다.
- 빌드 입력(`--build-arg`)은 이미지 기록에 남으므로 공개 값만 넣는다. 비밀값은 실행할 때 주입한다.

**web은 공개 주소마다 다시 빌드한다.** `NEXT_PUBLIC_API_BASE_URL`과 보안 헤더(CSP `connect-src`·HSTS)가 빌드 결과에 굳고, 실행 환경변수로 바꿀 수 없다. 값은 web과 같은 공개 https 출처이며 경로를 붙이지 않는다(`/v1`은 호출 함수가 붙인다). 빌드 단계에서 값을 확인해, 비었거나 경로가 붙었거나 로컬이 아닌 http 주소면 빌드를 멈춘다. standalone 출력(`node server.js`)은 이미지 빌드에서만 켠다(`CATCHU_STANDALONE_BUILD=1`). 개발·CI의 `npm run build`·`npm run start`는 그대로다. 개발 로그인 표시(`NEXT_PUBLIC_DEV_LOGIN_ENABLED=true`)도 거부한다. 넣은 주소는 이미지 표식 `io.catchu.web.public-api-base-url`로 확인한다. `http://127.0.0.1:3001`로 만든 이미지는 로컬 검증용이며 운영에 올리지 않는다.

**api 운영 이미지에는 운영 의존성만 있다.** `npm ci --omit=dev --omit=optional`로 설치한다. ts-node·typescript는 잠금 파일에서 TypeORM의 선택 의존성으로도 잡혀 있어 `--omit=dev`만으로는 남기 때문이다. 이 조합은 api 전용이며, web은 SWC·sharp가 선택 의존성이라 쓰지 않는다. 결과 수신 검증기가 읽을 계약 YAML은 `/app/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/`에 둔다. 수신 모듈은 아직 앱에 연결돼 있지 않으므로 api가 떠도 YAML을 읽지는 않는다(연결은 #105·#233 범위).

**worker 이미지는 `/app/worker`에서 실행한다.** 계약 YAML(위와 같은 경로)과 합성 자료(`/app/worker/fixtures/m1-synthetic`)를 저장소와 같은 상대 위치에 둔다. 개발 그룹(ruff·mypy·pytest 등)은 넣지 않는다. 기본 명령은 분석 요청 큐 소비자(`python -m app.consumer`, [#121](https://github.com/JminAILab/CatchU/issues/121))다. 운영 모드에서 큐 설정이 없거나 틀리면 기동하지 않는다(종료 코드 2). SIGTERM을 받으면 새 작업을 멈추고 분석 중인 작업을 실패로 남긴 뒤 끝난다. 25초를 넘기면 스스로 강제 종료하며 종료 코드가 137이라 교체 절차는 7로 멈춘다([worker 큐 소비자](../worker/docs/queue-consumer.md)). 합성 처리는 `docker run --rm <worker 이미지> .venv/bin/python -m app.processing <시나리오>`로 실행한다.

세 이미지 모두 숫자 UID 1000으로 실행하고 앱 파일은 쓰기 권한이 없다. 읽기 전용 루트 파일시스템과 권한 제거(`cap_drop: ALL`)에서 동작하며, 쓰기 경로는 `/tmp`뿐이다.

## 실행 환경 값

실제 값 파일은 **저장소 밖 폴더**에 둔다. `make-local-env.sh`와 `replace-single.sh`는 저장소 안 환경 폴더를 거부하고, 실수로 `deploy/env/`에 만든 파일은 Git이 추적하지 않는다. `docker compose`를 직접 쓸 때는 경로를 검사하지 않으므로 같은 규칙을 지킨다. 예시는 [`env/`](env)에 이름만 있다.

| 파일 | 내용 |
|---|---|
| `compose.env` | 실행 묶음. 네 이미지, 환경 폴더, DB CA 파일, 포트. 비밀값 없음. `docker compose --env-file`로 읽는다 |
| `api.env` | api 값. 인증·grant 키, DB 앱 계정, 공개 주소 등 |
| `migration.env` | migration 전용 DB 계정 |
| `worker.env` | worker 큐 설정. 큐 주소(비밀번호 포함, 운영은 `rediss://`)·접두사·동시 수 |
| `db.env`, `tls/` | 로컬 합성 DB 전용(`make-local-env.sh`가 만든다) |

- **운영 값의 기준**은 [api 환경변수](../api/docs/environment.md)와 같다. `AUTH_JWT_SECRET`·`LINK_GRANT_SECRET`은 64자리 hex로 서로 달라야 하고, 환경마다 한 번 만들어 고정한다. 재배포 때 새로 만들면 로그인과 비밀번호 링크 열람이 끊긴다. `AUTH_ACCESS_TOKEN_TTL_SECONDS=900`, `CORS_ALLOWED_ORIGINS`는 비운다(web·api 같은 출처). `AUTH_WEB_ORIGIN`에는 그 공개 https 출처를 끝 슬래시 없이 넣는다. 이 세 값 중 하나라도 어긋나면 api가 기동하지 않는다.
- `compose.single.yaml`이 `NODE_ENV=production`, `BIND_HOST=0.0.0.0`, `PORT`, `PGSSLMODE=verify-full`, `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED=1`을 고정한다(worker는 `NODE_ENV=production`만. 합성 겹침 파일만 worker를 `test`로 바꾼다). env 파일에 같은 이름을 넣어도 이 값이 쓰인다. `NODE_OPTIONS` 같은 실행 옵션은 env 파일에 넣지 않는다.
- api·migration 이미지의 기본값도 `PGSSLMODE=verify-full`이다. 값을 빠뜨려도 평문으로 붙지 않고 인증서를 검증한다.
- DB TLS: pg는 `PGSSLROOTCERT`를 읽지 않으므로 DB 서버 인증서를 발급한 CA 파일을 읽기 전용으로 넣고 `NODE_EXTRA_CA_CERTS`로 알려 준다. `DB_HOST`는 인증서의 이름과 같아야 하며 IP로 접속하면 거부된다. CA 파일 경로가 틀려도 Node는 경고만 내고 진행할 수 있으므로, 접속 성공 여부로 확인한다.
- 비밀값은 Git·이미지·예시·빌드 입력·로그·PR에 넣지 않는다. 환경변수로 주입하므로 이 호스트에서 `docker inspect` 권한이 있는 사람은 값을 볼 수 있다. Docker 사용 권한은 운영 담당으로 제한한다.

## 처음 실행(로컬 합성 환경)

작성자 외 재현도 이 절차를 따른다. 필요한 것은 Docker Engine 25 이상, Docker Compose 2.24 이상, openssl, git이다. 포트 3000·3001·8000을 비워 두거나 `compose.env`에서 바꾼다. 합성 DB 이미지(`postgres:16`, digest 고정)는 없으면 `replace-single.sh`가 받는다.

```bash
docker build -f web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 -t catchu-web:local .
docker build -f api/Dockerfile -t catchu-api:local .
docker build -f api/Dockerfile --target migration -t catchu-api-migration:local .
docker build -f worker/Dockerfile -t catchu-worker:local .
deploy/scripts/make-local-env.sh ~/catchu-local-env
deploy/scripts/replace-single.sh --env-file ~/catchu-local-env/compose.env --local-db --migrate
```

**Windows에서 실행할 때(아직 확인하지 않은 절차):** 스크립트는 bash 전용이라 PowerShell에서는 돌지 않는다. Docker Desktop의 WSL2 연동을 켜고, WSL2 안의 Linux(예: Ubuntu) 터미널에서 위 명령을 실행한다.

- 저장소와 합성 환경 폴더를 WSL2 안의 Linux 경로(예: `~/CatchU`, `~/catchu-local-env`)에 둔다. `/mnt/c/...` 아래에서는 실행 권한·파일 권한(0600)·줄바꿈(CRLF) 때문에 스크립트와 인증서가 깨질 수 있다.
- WSL2 안에서 `git`으로 clone하고, `openssl`이 있는지, `docker version`·`docker compose version`이 되는지 먼저 확인한다(검사 스크립트를 돌릴 때만 Node 24.21.0이 더 필요하다).
- 처음 따라 한 사람이 막힌 곳과 해결 방법을 PR에 남기고, 확인되면 이 문단의 "아직 확인하지 않은"을 지운다.

정상 확인과 종료:

```bash
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3001/health
curl -i http://127.0.0.1:8000/health
docker compose --env-file ~/catchu-local-env/compose.env -f deploy/compose.single.yaml -f deploy/compose.local-db.yaml stop
docker compose --env-file ~/catchu-local-env/compose.env -f deploy/compose.single.yaml -f deploy/compose.local-db.yaml --profile migration down -v
```

- web `/`는 200과 `CatchU web` 화면, api `/health`는 200과 `{"status":"ok"}`, worker `/health`는 200과 `{"status":"ok","consumer":"running"}`(합성 큐에 붙어 기다리는 중)다. api health는 기동할 때 DB 접속에 성공했다는 데까지만 말하고, 큐·분석 연결 성공을 뜻하지 않는다. worker health도 분석 성공을 뜻하지 않는다.
- 마지막 명령(`down -v`)은 이 구성의 컨테이너·망·합성 DB 볼륨만 지운다. 합성 환경 폴더는 직접 지운다.
- 합성 CA·DB 서버 인증서는 만든 날부터 30일 뒤 만료된다. 만료되면 api가 DB에 접속하지 못해 교체가 종료 코드 6으로 멈춘다. 이어서 쓰려면 위 `down -v`, 환경 폴더 삭제, `make-local-env.sh`부터 다시 한다(합성 DB 자료도 새로 만든다).
- 로컬 구성에는 web과 api를 같은 출처로 묶는 앞단이 없다. production 모드 api는 교차 출처 호출을 받지 않으므로, 브라우저 화면에서 api를 부르는 흐름은 같은 출처 경로 분배가 있는 AWS 환경(#276·#277)에서 확인한다. 합성 공유 링크 주소·로그인 출처(`https://catchu-single.invalid`)로는 링크를 열거나 로그인 유지(갱신·로그아웃)를 확인할 수 없다.
- 합성 DB는 TLS 연결만 받고(평문 거부), migration 계정이 스키마를 소유하며 앱 계정은 자료 읽기·쓰기만 한다([`local-db/init-roles.sh`](local-db/init-roles.sh)). 운영 DB의 계정·권한(동의 기록 직접 삭제 불가, 시간 상한 포함)은 #276에서 정한다. worker는 DB 망에 연결하지 않는다.

## migration

migration은 별도 이미지로 **한 번 실행하고 끝난다.** 앱은 기동할 때 스키마를 바꾸지 않고(`synchronize`·`migrationsRun` 꺼짐) migration을 기다리거나 대신 실행하지 않는다. 컨테이너 안에서는 같은 소스의 TypeORM 명령(`migration:run`, ts-node)을 쓴다.

- `replace-single.sh --migrate`가 migration 이미지마다 정해진 이름(`<이름>-migration-<이미지 ID 앞 12자>`)으로 한 번 실행하고, 종료 코드 0을 확인한 뒤에만 api를 시작한다. 실행 전에 migration 이미지나 같은 이름의 실행을 Docker에서 확인하지 못하면 migration을 시작하지 않고 멈춘다(종료 코드 2, 서비스는 멈춘 상태). 성공한 실행 컨테이너는 기록을 남긴 뒤 지운다. 지우지 못하면 적용은 확인된 상태로 새 실행을 시작하지 않고 멈춘다(종료 코드 8). 다시 실행하거나 강제로 지우지 않는다.
- 이전 migration 실행 컨테이너가 남아 있으면(실패·결과 불명, 또는 8로 멈춰 지우지 못한 성공 실행) `--migrate`가 없어도 어떤 실행도 시작하지 않는다(종료 코드 5). 앞선 8의 기록과 실행 이름·종료 코드 0이 같고 `compose.env`를 바꾸지 않았다면 적용은 이미 확인됐으므로 지운 뒤 `--migrate` 없이 다시 실행한다. 그 밖에는 결과를 확인하고 직접 지운 뒤 다시 실행한다.
- 대기 중인 migration은 한 트랜잭션으로 적용된다. TypeORM에는 동시 실행 잠금이 없으므로 **두 개를 동시에 실행하지 않는다.** 이미 적용된 뒤 다시 실행하면 `No migrations are pending`으로 끝난다(순차 재실행만 확인했다).
- **실패하면** 실행 컨테이너를 남기고 멈춘다. 로그와 DB의 `migrations` 표·스키마를 확인하기 전에는 다시 실행하거나 새 api를 시작하지 않는다.
- **결과가 불분명하면**(명령이 끊김, Docker 오류 등) 실행 상태와 DB 적용 이력을 예상 migration 목록과 대조하고 담당자가 판단한다. DB 세션이 없다는 것만으로 다시 실행해도 된다고 보지 않는다.
- 자동 재실행·자동 되돌리기(`migration:revert`)는 하지 않는다. 운영 DB에서 시험 삼아 되돌리지 않는다.
- EKS에서는(#276 확정 뒤) controller 없는 일회 Pod(`restartPolicy: Never`)를 배포별 고정 이름으로 `kubectl create`한다. cluster·namespace·이름·UID·소스 SHA·이미지 digest·대상 DB·migration 목록과 종료 코드를 기록한다. 응답이 끊기거나 `AlreadyExists`면 조회하고, 결과를 확인하기 전에는 지우거나 다른 이름으로 다시 만들지 않는다. Job은 대체 Pod를 만들 수 있어 쓰지 않는다.

## 계획 교체

계획 교체는 **중단을 허용한다.** 이전 실행이 끝난 것을 확인한 뒤에만 다음 실행을 시작해 api·worker가 겹치지 않게 한다. `replace-single.sh`가 아래 2~5를 차례로 하고, 각 단계의 컨테이너 ID·이미지·시각과 중단 시간을 출력한다. 그 출력을 교체 기록으로 남긴다.

1. 준비: 지금·다음 이미지 digest와 소스 SHA, 스키마 호환, 환경 값 변경을 확인한다. `compose.env`의 이미지 값을 바꾼다.
2. 유입 차단: web·api를 멈춘다(로컬에는 앞단이 없다. AWS에서는 #276의 앞단에서 막는다).
3. worker·api를 멈추고 **종료를 확인한다.** 같은 이름이나 같은 구성 표식(compose 라벨)의 web·api·worker가 하나라도 실행 중이면 새 실행을 시작하지 않고 멈춘다. 대기 상한(`--stop-timeout`, 기본 30초)을 넘으면 Docker가 강제 종료(종료 코드 137)하는데, 이 경우도 정상 교체로 보지 않고 멈춘다. 실행 여부나 종료 코드를 Docker에서 조회하지 못해도 멈춘다. 세 서비스를 모두 확인한 뒤 판단하며, 3으로 멈출 때도 이미 확인한 강제 종료와 교체 전에 실행 중이던 서비스를 출력에 함께 적는다. 교체를 시작할 때 각 서비스가 실행 중이었는지 조회하지 못하면 강제 종료를 가릴 수 없으므로 아무것도 멈추지 않고 끝낸다. 컨테이너가 아직 없는 처음 설치는 멈춘 것으로 보고 진행한다.
4. 필요하면 migration을 한 번 실행한다(위 절).
5. api → worker → web 순서로 시작하고 각각 health를 기다린다. 세 서비스를 모두 띄운 뒤 세 서비스가 지금도 healthy인지 다시 확인한다. 뒤 서비스를 띄우는 동안 앞 서비스가 다시 시작되는 중이거나(`restart: unless-stopped`) 비정상이면 완료로 보지 않고 세 서비스를 다시 멈춘다. 그 사이 다시 시작됐다가 이미 healthy로 돌아온 경우는 이 확인으로 잡지 못한다. 확인 뒤 유입을 연다.

```bash
deploy/scripts/replace-single.sh --env-file <환경 폴더>/compose.env [--local-db] [--migrate]
```

- 진행 중이던 요청·분석이 끝까지 처리된다고 보장하지 않는다. worker는 SIGTERM을 받으면 새 작업을 멈추고 분석 중인 작업을 끝내 큐에 실패로 남긴다(남은 일을 마치는 방식은 없다). 그 요청은 처리 시한에 닫히고 회원이 다시 요청한다. health·순간적인 큐 0건은 그 근거가 아니다.
- api 재기동으로 메모리에 있던 요청 빈도 제한 기록과 진행 중인 Google 로그인 시도가 사라진다. DB에 있는 자료·공개 상태·링크는 남는다.
- 중단된 분석을 처리 시한(접수 후 60분) 뒤 닫는 정책은 [계약](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md) 「공통 오류·요청 안전성」에 정해졌고, 실제 적용은 [#237](https://github.com/JminAILab/CatchU/issues/237) 구현 뒤다. 지금 코드가 바로 실패로 닫는다고 보지 않는다. 컨테이너 재시작은 운영 복구로 허용하지만 중단된 분석을 다시 실행해도 된다는 뜻은 아니다.
- 같은 호스트의 중복은 고정 컨테이너 이름과 위 3의 확인으로 막는다. 다른 호스트·다른 구성(EKS 포함)이 같은 DB·큐에 붙어 있는 것은 이 스크립트가 알 수 없다. **같은 운영 DB·큐에 Compose 실행과 EKS 실행을 동시에 연결하지 않는다.** 장애 때 자동으로 생기는 대체 실행(노드 장애 등)은 이 수동 규칙으로 막지 못하며 #276에서 구성·대체 정책을 정한다.

| `replace-single.sh` 종료 코드 | 상태와 다음 행동 |
|---|---|
| 0 | 교체 완료 |
| 2 | 사용법·이미지 없음·compose 설정 오류, 또는 설정·이미지를 Docker에서 확인하지 못했다(아무것도 멈추지 않았다). 또는 합성 DB가 뜨지 않았거나, 멈춘 뒤 migration 준비 조회(migration 이미지·같은 이름 실행 확인)가 실패했다(서비스는 멈춘 상태이고 migration은 시작하지 않았다). 출력의 원인을 확인하고 Docker가 응답하는지 본 뒤, 같은 인자로(`--migrate`를 썼다면 반드시 그대로 붙여) 다시 실행한다. `--migrate`를 빼고 다시 실행하면 migration 전 스키마로 새 api가 뜬다 |
| 3 | 종료 확인 실패(남은 실행이 있거나 Docker가 상태·종료 코드를 알려 주지 않음). 교체를 시작할 때의 상태 조회(아무것도 멈추지 않았다), 중지 뒤 종료 확인(새 실행은 시작하지 않았다), 새 실행 실패 뒤 다시 멈출 때(새로 시작한 서비스가 떠 있을 수 있다) 모두 해당한다. 중지 명령 하나가 실패해도 세 서비스 모두 중지를 시도한 뒤 판단한다. 다음 행동은 아래 「실패 시 정지와 되돌리기」 |
| 4 | migration 실패. 서비스는 멈춘 상태다. 남긴 실행 컨테이너 로그와 DB 이력을 확인한다 |
| 5 | migration 결과 불명이거나 이전 migration 실행이 남아 있다. 서비스는 멈춘 상태다. 남은 실행이 앞선 8의 기록과 같으면 8의 다음 행동을 따른다. 그 밖에는 담당자가 판단하고, 남은 실행은 확인 뒤 직접 지운다 |
| 6 | 새 실행 확인 실패(health 실패, 완료 확인 때 healthy가 아닌 서비스, 실행 수 이상, 실행·health 상태 조회 실패). 이미 시작한 서비스까지 다시 멈추고 세 서비스의 종료를 조회로 확인한 상태다. `docker logs`로 원인을 본다 |
| 7 | 이전 실행이 대기 상한 안에 끝나지 않아 강제 종료됐다. 서비스는 멈춘 상태다. 원인을 확인한 뒤 다시 실행하면 이어서 진행한다 |
| 8 | migration은 성공했다(명령과 실행 컨테이너의 종료 코드 0 확인). 성공한 실행 컨테이너를 지우지 못해 새 실행을 시작하지 않았다. 서비스는 멈춘 상태다. 출력에 남은 실행 이름의 컨테이너가 `exited 0`인지 확인하고 `docker rm <이름>`으로 지운 뒤, `compose.env`를 바꾸지 않고(같은 이미지로) `--migrate` 없이 다시 실행하면 이어서 진행한다. 지우지 않고 다시 실행하면 남은 실행으로 보고 5로 멈춘다 |

## 실패 시 정지와 되돌리기

- 정지: `docker compose --env-file <compose.env> -f deploy/compose.single.yaml stop`. 종료 코드 4~8과, 멈춘 뒤에 난 2(합성 DB·migration 준비 실패)로 멈춘 경우에는 서비스가 멈춘 상태이니 그대로 두고 원인을 본다. 3은 실행이 남아 있을 수 있으므로 남은 실행을 확인하고 이 명령으로 멈춘 뒤 원인을 본다(교체 전 상태 조회 실패로 끝난 3은 예외, 다음 항목). 남은 실행이 compose 밖에서 같은 표식으로 띄운 것이면 이 명령으로는 멈추지 않으니, `docker ps --filter label=com.docker.compose.project=<이름>`으로 찾아 `docker stop <컨테이너 ID>`로 멈춘다.
- 3의 출력이 「교체 전 … 실행 상태를 확인하지 못했습니다」이면 아무것도 멈추지 않은 상태다. 지금 돌고 있는 실행은 그대로 두고, Docker가 응답하는지 확인한 뒤 다시 실행한다.
- 3의 출력에 「교체 전 실행 중」이 있으면 중지 뒤 종료 확인에서 멈춘 것이고, 새 실행은 시작하지 않았다. 다시 실행하기 전에 거기 적힌 서비스마다 종료 코드를 `docker inspect -f '{{.State.ExitCode}}' <컨테이너 이름>`으로 확인한다. 출력에 「강제 종료(137)」가 있거나, 종료 코드가 137이거나 확인할 수 없으면 7과 같이 원인부터 확인한다. 다시 실행할 때는 이미 멈춘 서비스를 강제 종료 판정에 넣지 않기 때문이다.
- 되돌리기: **이전 이미지가 지금 DB 스키마와 호환될 때만** `compose.env`에 이전 이미지 값을 넣고 `--migrate` 없이 `replace-single.sh`를 실행한다. 호환되지 않거나 불분명하면 멈춘 상태를 유지하고 담당자 판단을 받는다. DB 자동 복원·자동 down migration은 하지 않는다.

## 검사

```bash
node deploy/scripts/check-images.mjs [--keep] [--report <저장소 밖 JSON 경로>]
```

이 컴퓨터의 아키텍처로 네 이미지를 만들고, 저장소 밖 임시 폴더의 합성 환경(합성 비밀값·합성 DB·시험용 사설 CA)에서 확인한다. 실제 GitHub·LLM·AWS·운영 DB에는 연결하지 않는다. 포트 23000·23001·28000을 쓰고, 실행마다 다른 이름(`catchu-check-<무작위>`)으로 컨테이너·망·볼륨·이미지 태그를 만든다. 셸에 남은 `COMPOSE_*`·`CATCHU_*` 값은 넘기지 않는다. 다른 검사가 남긴 `catchu-check-*` 자원이 있거나 그 조회가 실패하면 건드리지 않고 멈춘다. 끝나면 만든 컨테이너·망·DB 볼륨·임시 폴더·미끼 파일과(`--keep`이 아니면) 검사 이미지를 지우고 남은 것이 없는지 조회한다. 자원이 남았거나 Docker 조회가 실패해 확인하지 못하면 실패로 끝내고, 프로젝트 이름·남은 이름·확인하지 못한 조회와 직접 확인할 명령을 알려 준다. 임시 폴더는 합성 비밀값이 있어 이때도 지운다(남은 자원은 프로젝트 이름만으로 찾을 수 있다). `--keep`이면 검사 이미지만 남긴다.

- 빌드 맥락: 허용 목록 밖 파일이 하나도 없는지, 허용한 폴더 안의 `.env*`·키 미끼와 서비스 폴더의 다른 자료 미끼가 빠지는지
- 이미지: UID 1000, `/app`·`/opt`·`/usr/local`에 쓰기 가능한 파일 없음과 넣은 경로(`/app`, worker `/opt/uv-python`)의 root 소유(세 이미지), web 정적 자산·환경 파일 없음, api 개발 도구 부재와 운영 모듈, 실제 검증기의 계약 YAML 읽기, worker Python 3.12.10·개발 그룹 부재·운영 의존성(BullMQ·redis 포함)·기본 TLS 문맥의 시스템 CA 디렉터리·`WEB_CONCURRENCY`와 관계없이 프로세스 1개·MOCK 시나리오 9개, web 빌드 입력 거부(외부 http·`/v1`·경로·빈 값·개발 로그인), Dockerfile에 비밀값 이름의 빌드 입력·환경변수 없음
- 실행: 처음 설치 순서(컨테이너가 없는 상태를 조회 실패와 구분해 진행), web 화면·JS·CSS·보안 헤더, api health와 앱 계정의 TLS DB 조회, worker health(합성 큐에 붙은 소비자), 서비스별 프로세스 1개, 합성 큐의 MOCK 요청 1건을 자식 프로세스로 처리(읽기 전용·권한 제거 상태), migration 이력·소유자·앱 계정 권한, 순차 재실행
- 거부: DB TLS(틀린 CA, 인증서에 없는 호스트, 평문, `PGSSLMODE`를 빠뜨린 실행)를 api·migration 각각, env 파일로 인증서 검증 끄기, 운영 키 누락·형식 오류·두 키 같음, http CORS·공유 링크 주소, 로그인 출처(`AUTH_WEB_ORIGIN`) 누락·http, production 개발 로그인, worker의 DB 접근, 운영 모드 worker의 큐 설정 오류(주소 없음·평문 주소·질의 문자열·MOCK 켜기, 출력에 큐 비밀번호 없음)
- 교체: 새 api 판본 교체에서 이전 종료 뒤 새 시작, 멈춤 조건 다섯 가지(같은 표식의 실행이 남음 3, migration 실패 4, 실패한 migration 실행이 남음 5, 새 실행 health 실패 6, 대기 상한 초과 강제 종료 7)와 각각 서비스가 멈춘 상태로 남는지, SIGTERM 종료 코드·시간. 가짜 docker로 해당 호출만 실패시켜 다음도 본다: web 중지 명령만 실패하면 api·worker는 멈추고 web만 남은 채 3, 새 실행 실패 뒤 상태 조회가 실패하면 3(종료 확인 기록 없음), 새 실행 실패 뒤 api 중지만 실패하면 api만 남은 채 3, 교체를 시작할 때 상태 조회가 실패하면 아무것도 멈추지 않은 채 3, 중지 뒤 종료 코드 조회가 실패하면 migration·새 실행 없이 3, web 강제 종료(137)와 api 조회 실패가 겹치면 3이고 출력에 web 137과 교체 전 실행 중 서비스가 함께 적히는지, migration 성공 뒤 실행 컨테이너 삭제가 실패하면 성공 기록과 컨테이너를 남긴 채 8이고 그대로 다시 실행하면 5, 지운 뒤 다시 실행하면 이어서 시작, 세 서비스를 멈춘 뒤 migration 이미지 조회가 실패하면 migration을 시작하지 않고 2. 또 web을 띄운 직후 api를 실제로 다시 시작시켜(health starting) 완료로 보지 않고 세 서비스를 다시 멈춘 채 6인지 본다
- 정리: 자원 조회가 실패하거나(조회별·docker 없음·시간 초과) 실제로 자원(`--keep`이 아니면 검사 이미지 포함)이 남으면 정리 통과로 보지 않는지, 시작 전 다른 검사 자원 확인도 조회 실패를 자원 없음으로 보지 않는지
- 비밀값: 합성 비밀값이 실행 로그·출력에 없는지, 로그·이미지 기록을 모으지 못하면 통과로 보지 않는지. 합성 비밀값은 이미지를 만든 뒤에 생기므로 이미지 쪽 확인은 맥락 미끼와 Dockerfile 이름 검사가 맡는다

GitHub Actions의 `images` 워크플로가 같은 명령을 x86_64 러너에서 실행한다. **main으로 가는 배포 PR**과 **수동 실행**(Actions 화면의 Run workflow에서 브랜치를 골라 실행)에서만 돌고, dev 대상 PR의 CI(`ci.yml`)에는 들어 있지 않다. 이미지 관련 파일(Dockerfile·`.dockerignore`·`deploy/`·잠금 파일·DB 구조·실행 진입점·계약 YAML·합성 자료)을 바꾼 dev PR은 병합 전에 그 브랜치로 수동 실행해 확인한다. main 대상 PR에서는 이 검사(`images`)와 자동 배포 스크립트 회귀 시험(`cd-scripts`)이 필수 상태 검사다([레포 컨벤션 「main의 검증」](../docs/CatchU_레포_컨벤션.md#2-브랜치), 2026-10-16 [#277](https://github.com/JminAILab/CatchU/issues/277) 결정).

이 검사가 대신하지 않는 것: 운영 노드 아키텍처의 최종 이미지 기동, 운영 DB의 역할별 TLS·평문 거부, 실제 앞단의 같은 출처 경로·신뢰 프록시·연결 유지 시간, 운영 큐(TLS·비밀번호)와 api의 실제 큐 연결(#233)·실제 분석, 작성자 외 재현.

## #276에서 받을 값과 남은 일

실제 값은 아직 받지 않았다. 받은 항목부터 반영하며, #276 전체 종료를 기다리지 않는다. 비밀값은 원문 대신 참조·주입 방식·권한을 받는다.

| 받을 값 | 반영할 곳 |
|---|---|
| 노드 CPU 아키텍처·OS, EKS 판본, cluster·namespace, 리소스 범위 | 최종 이미지 빌드 플랫폼, EKS 실행 파일 |
| 레지스트리 경로·push/pull 권한 | 이미지 게시(#275는 게시하지 않는다) |
| 실제 공개 https 출처, `/v1` 경로 보존 분배 | 운영 web 빌드, `SHARE_LINK_WEB_BASE_URL`·`AUTH_WEB_ORIGIN` |
| 앞단 대상 유형·`X-Forwarded-For` 처리·유휴 시간, 유입 차단·노드 종료 확인 경로 | `TRUST_PROXY_CIDRS`, 연결 유지 시간(web `KEEP_ALIVE_TIMEOUT`은 ms. api에는 연결 유지 시간 설정이 없어 앞단 유휴 시간과 어긋나면 간헐 502가 날 수 있으므로 배포 전에 api 담당과 조율한다), 교체 절차 2·3단계 |
| worker→DB 차단과 나가는 연결 제한의 집행 수단(NetworkPolicy·보안 그룹·egress 규칙) | EKS 실행 파일, 운영 Compose 호스트의 망 구성. 공유 노드 보안 그룹이나 같은 호스트 IP만으로 분리됐다고 보지 않는다 |
| DB 주소·판본, 앱·migration 계정과 비밀값 참조, CA 파일과 주입 방식 | `api.env`·`migration.env`·CA 파일 |
| 큐 주소·비밀번호 참조(ElastiCache Valkey 8.1, TLS) | `worker.env`의 `CATCHU_QUEUE_REDIS_URL`(`rediss://`), api 실행 값(#233) |
| GitHub 연결의 자격정보 보관 폴더(`GITHUB_CREDENTIAL_DIRECTORY`)용 지속 volume·UID/GID·권한, 암호화 키·OAuth 값 참조, #232 내부 자격정보 경로·인증키 참조 | GitHub 연결 코드(PR #254)는 dev에 있고 기본은 꺼짐이다(`GITHUB_CONNECTION_ENABLED`, 값은 [api 환경변수](../api/docs/environment.md)). 켜려면 api에 쓰기 가능한 지속 volume을 더해야 한다(지금 구성은 읽기 전용 루트라 `/tmp` 말고 쓸 곳이 없고, `/tmp`는 재시작하면 지워진다). #232 내부 경로는 공개 `/v1/*` 분배에서 제외한다 |

EKS 실행 파일을 쓸 때 지킬 조건: api·worker `replicas: 1`과 업데이트 방식 `Recreate`, 자동 확장(HPA) 없음, `runAsNonRoot`·`runAsUser: 1000`·`readOnlyRootFilesystem`과 `/tmp` 빈 볼륨, api·migration의 `PGSSLMODE=verify-full`·DB CA 파일 읽기 전용 mount·`NODE_EXTRA_CA_CERTS`, web의 `HOSTNAME=0.0.0.0` 명시, worker에서 DB로의 접근 차단, api·worker·DB·큐를 외부에 여는 Service 없음, worker health는 내부용(큐에 처음 붙기 전에는 503이므로 시작 확인 시간을 넉넉히 둔다), worker 종료 유예는 30초 이상(앱 안 종료 예산 25초), migration은 위 일회 Pod. `Recreate`는 업데이트 순서일 뿐 장애 때 대체 실행과의 중복을 막지 않는다. Google 로그인은 시작 경로의 앞단 보호를 #277에서 확인하기 전에는 켜지 않는다.

제공 판본이 나오면 실행 값·종료 방법을 다시 확인할 기능: 로그인 유지의 화면 연결(#251. api 쪽 #250은 `AUTH_WEB_ORIGIN`까지 반영), GitHub 연결 켜기와 내부 자격정보 조회(#231·#232), 결과 수신 공급(#105), api 쪽 큐 연결(#233)과 worker의 LIVE 처리(#121), 처리 시한 정리(#237).
