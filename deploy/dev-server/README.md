# 개발 서버(서버 한 대)

12월 전 개발 단계에 AWS 서버 한 대로 web·api·worker와 DB를 띄워, 실제 https 주소에서 화면과 api를 시험하는 방법이다. 로그인·GitHub·LLM 같은 실제 연결은 켜는 데 필요한 것이 남아 있다(아래 「개발 단계라 받아들이는 한계」). 2026-10-15 팀장 결정으로 지금은 이 구성으로 운영하고, 11월 중순~말에 EKS로 옮긴다([#276](https://github.com/JminAILab/CatchU/issues/276)). 이 문서는 사람이 실행하는 수동 절차다. `main` 반영 때 같은 절차를 자동으로 하는 방법은 [cd/README.md](cd/README.md)에 있다.

앱 실행·교체·migration·검사는 [deploy/README.md](../README.md)의 한 호스트 실행을 그대로 쓴다. 이 문서는 그 위에 더하는 것만 적는다.

## 구성

| 위치 | 내용 |
|---|---|
| AWS | EC2 `t4g.large`(arm64, Amazon Linux 2023) 한 대, 탄력적 IP, 보안 그룹(들어옴 80·443만, SSH 없음), 서버 역할 `catchu-dev-server`(Session Manager·ECR 읽기. `/catchu/*` 파라미터 읽기는 거부 규칙 `catchu-dev-deny-parameter-read`로 막음), ECR 저장소 4개, Route 53의 도메인 A 기록 |
| 앱·DB·큐 | [`compose.single.yaml`](../compose.single.yaml) + [`compose.local-db.yaml`](../compose.local-db.yaml). Compose 이름 `catchu-dev`. DB는 내부 망에만 있고 worker는 그 망에 없다. 큐(Valkey 8.1.6)는 worker만 붙는 내부 망에 평문으로 연다. 이 겹침 파일 때문에 worker는 시험 모드(`NODE_ENV=test`)로 뜬다 |
| 앞단 | [`compose.caddy.yaml`](compose.caddy.yaml) + [`Caddyfile`](Caddyfile). Compose 이름 `catchu-dev-edge`. 서버 망(host)에서 80·443을 받는다 |

Caddy가 하는 일:
- 인증서를 Let's Encrypt에서 자동으로 받고 갱신하며, http를 https로 돌려보낸다.
- `/v1/internal`·`/v1/internal/*`는 404, `/v1/*`는 api(127.0.0.1:3001), 나머지는 web(127.0.0.1:3000)으로 보낸다. web과 api가 같은 출처가 된다([#250](https://github.com/JminAILab/CatchU/issues/250) 조건).
- HSTS를 `max-age=300`으로 붙인다. 앱이 보낸 같은 헤더는 이 값 하나로 바뀐다.
- 접근 로그를 쓰지 않는다(공유 링크 토큰이 든 주소가 남지 않게). 앱이 멈췄을 때(502 등) 남는 오류 로그에는 요청 주소와 헤더가 들어가므로, 주소는 통째로 지우고 헤더도 남기지 않는다. 공유 링크 토큰·로그인 콜백의 code·state 자리만 가리면, 주소를 조금 바꾼 형태(`//`, `%73` 등)가 가리는 규칙을 빠져나간다.

앱과 다른 Compose 묶음이라 `replace-single.sh`로 앱을 교체해도 Caddy는 그대로 돈다. 교체하는 동안 사용자는 502를 받는다.

## 환경 폴더

`/opt/catchu/env`(root만 읽기). 배치는 [`make-local-env.sh`](../scripts/make-local-env.sh)와 같고 다음이 다르다.

- 서명 키(`AUTH_JWT_SECRET`·`LINK_GRANT_SECRET`)와 DB 앱·migration 계정 비밀번호는 SSM `/catchu/prod/*` 값을 서버 안에서 읽어 쓴다. 11월 EKS에서도 같은 값을 써서 로그인과 링크 증표가 이어진다. 값은 출력하지 않는다.
  - 다 쓴 뒤에는 서버 역할의 거부 규칙(`catchu-dev-deny-parameter-read`, `/catchu/*` 읽기 거부)으로 서버가 이 값을 다시 읽지 못하게 한다. 환경 파일을 다시 만들 때만 이 규칙을 잠시 지웠다가 다시 건다. 서버 망을 쓰는 Caddy는 서버의 AWS 권한에 닿을 수 있기 때문이다(아래 「개발 단계라 받아들이는 한계」).
- Postgres 관리자 비밀번호는 서버에서 만들어 `db.env`에만 둔다. DB용 사설 CA·서버 인증서(이름 `db`)는 120일짜리다.
- `worker.env`: `CATCHU_QUEUE_REDIS_URL=redis://queue:6379`, `CATCHU_QUEUE_PREFIX=catchu`, `CATCHU_WORKER_CONCURRENCY=1`, **`CATCHU_WORKER_MOCK=false`**. 시험 모드에서는 이 값을 빼면 합성(MOCK) 처리가 켜지므로 꼭 적는다([worker 설정](../../worker/docs/queue-consumer.md)).
- `compose.env`: `CATCHU_SINGLE_NAME=catchu-dev`, 이미지 네 개는 ECR digest(`…@sha256:…`), `CATCHU_DOMAIN=<도메인>`(Caddy용).
- `api.env`: `SHARE_LINK_WEB_BASE_URL`·`AUTH_WEB_ORIGIN`에 `https://<도메인>`(끝 슬래시 없이), `TRUST_PROXY_CIDRS`에 앱 Compose 망의 게이트웨이 주소 하나(`/32`).
  - Caddy는 서버 망에서 127.0.0.1로 api에 붙고, Docker는 그 연결을 망의 게이트웨이 주소로 넘긴다. 그래서 api에는 Caddy가 그 주소로 보인다. 처음 띄운 뒤 `docker network inspect catchu-dev_default -f '{{(index .IPAM.Config 0).Gateway}}'`로 확인해 넣는다. 망을 지웠다 다시 만들면 바뀔 수 있으니 다시 확인한다.

## 순서

서버 명령은 Session Manager 셸에서 root로 실행한다. 저장소의 필요한 파일(`deploy/` 중 compose 파일·`local-db/`·`scripts/replace-single.sh`·`dev-server/`)을 서버의 저장소 밖 작업 폴더로 옮겨 그 루트에서 실행한다.

1. **이미지:** 서버와 같은 arm64 컴퓨터에서 [빌드](../README.md#빌드)와 [이미지 검사](../README.md#검사)를 한 뒤 ECR에 올린다. web은 `NEXT_PUBLIC_API_BASE_URL=https://<도메인>`으로 만든다.
   - 빌드 명령에 `--provenance=false --sbom=false`를 더한다. Docker Desktop의 containerd 이미지 저장소는 빌드에 출처 증명을 붙이는데, 그대로 올리면 ECR 태그가 실행 이미지가 아닌 증명 문서에 붙을 수 있고 태그를 덮어쓸 수 없어 지우고 다시 올려야 한다.
   - 올린 뒤 태그마다 `aws ecr batch-get-image`로 manifest를 받아, 층이 여러 개이고 `in-toto` 층이 없는(실행 이미지인) 것을 확인한다.
2. **이미지 받기:** 서버에서 `aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin <계정>.dkr.ecr.ap-northeast-2.amazonaws.com` 뒤 네 이미지를 digest로 받고 `docker logout`한다. `compose.env`의 이미지 값을 `<레지스트리>/<저장소>@sha256:…`로 바꾼다.
3. **앱:** `deploy/scripts/replace-single.sh --env-file /opt/catchu/env/compose.env --local-db --migrate`
   - 처음 띄운 뒤 아래 두 가지를 하고, `--migrate` 없이 같은 명령을 한 번 더 실행해 api에 반영한다.
     - 앱 망 게이트웨이 주소를 `api.env`의 `TRUST_PROXY_CIDRS`에 넣는다(위 「환경 폴더」).
     - 앱 DB 계정에 잠금 대기 상한 3초를 건다([#220 합의](https://github.com/JminAILab/CatchU/issues/220#issuecomment-6206164416)): `docker exec catchu-dev-db psql -U postgres -d catchu -c "ALTER ROLE catchu_app SET lock_timeout = '3s'"`. migration 계정에는 걸지 않는다. 계정 설정은 새 연결부터 적용되므로 api를 다시 띄워야 한다.
   - DB 볼륨을 지우고 다시 만들면(초기화) 계정도 새로 만들어지므로 잠금 대기 상한을 다시 걸고 api를 다시 띄운다.
4. **앞단:** 도메인 A 기록이 이 서버의 탄력적 IP를 가리킨 뒤 `docker compose --env-file /opt/catchu/env/compose.env -f deploy/dev-server/compose.caddy.yaml up -d`. 인증서 보관 볼륨(`catchu-dev-edge_caddy-data`)은 지우지 않는다. 지우면 다시 발급받다가 Let's Encrypt 발급 횟수 제한에 걸릴 수 있다.
   - 서버의 배포 파일 폴더를 통째로 바꿨다면 같은 명령에 `--force-recreate`를 붙여 다시 띄운다. 이미 뜬 Caddy는 옛 Caddyfile을 계속 붙들고 있다. 인증서는 보관 볼륨에서 다시 쓴다.
5. **확인:** `https://<도메인>/` 화면, `http://`가 `https://`로 이동, `/v1/internal/…` 404, 응답의 HSTS가 `max-age=300` 하나, api·worker·web health, worker 컨테이너에서 DB(`db:5432`)에 닿지 않음, 앱 계정 새 연결의 잠금 대기 상한이 `3s`(`docker exec catchu-dev-db psql -U catchu_app -d catchu -tAc 'show lock_timeout'`), 로그에 비밀값 없음.

## 개발 단계라 받아들이는 한계

- 서버가 하나라 고장 나면 고칠 때까지 멈춘다. DB 백업은 두지 않는다(합성·시험 자료, 12월 전 초기화).
- 큐는 합성 큐(평문, 영속성 없음)이고 worker는 시험 모드다. 운영 큐(TLS·비밀번호)와 운영 모드 worker는 11월 EKS에서 쓴다. 운영 모드에서만 도는 worker 설정 검사도 그때 처음 확인된다.
- api의 큐 연결([#233](https://github.com/JminAILab/CatchU/issues/233))은 켜지 않는다. `api.env`에 `CATCHU_QUEUE_REDIS_URL`을 넣지 않는다. api는 운영 모드라 평문 `redis://` 주소로는 기동하지 않고, api는 큐 망에 붙어 있지도 않다. 그래서 분석 요청은 대기로 남다가 처리 시한에 닫힌다.
- worker는 합성 처리를 끄고 LIVE 설정(요청 정보 조회 주소·키, 생성 키)도 넣지 않으므로, 분석 요청을 처리 전에 거부한다([#121](https://github.com/JminAILab/CatchU/issues/121)). 시험 모드라 LIVE 설정이 없어도 기동은 한다.
- worker의 바깥 연결 제한은 코드 쪽 통제([#117](https://github.com/JminAILab/CatchU/issues/117))뿐이다. 네트워크 차단은 11월 EKS의 NetworkPolicy에서 한다. worker의 DB 차단은 Docker 내부 망으로 된다.
- 로그인(Google·GitHub)·GitHub 연결·LLM은 아직 켜지 않았다. GitHub 연결을 켜려면 OAuth 앱 등록·암호화 키와 함께 api가 쓸 수 있는 지속 보관 폴더(`GITHUB_CREDENTIAL_DIRECTORY`)가 필요하다. 이 구성의 api는 읽기 전용 루트와 임시 `/tmp`만 있어 그 폴더가 없으므로, 켤 때 함께 만든다([배포 안내 「#276에서 받을 값과 남은 일」](../README.md#276에서-받을-값과-남은-일)).
- 앞단(Caddy)에 요청 빈도 제한이 없다. Google 로그인도 시작 경로(`POST /v1/auth/google/authorization`) 보호 없이 켠다(2026-10-26 팀장 결정). api는 로그인 시작 요청을 메모리에 10분 동안 최대 1,000건 보관하므로, 누가 시작 요청을 몰아 보내면 그동안 다른 사람이 로그인을 시작하지 못한다([Google 로그인 안내](../../api/docs/google-login.md)). 자료가 새지는 않고, api를 다시 띄우면 보관한 요청이 지워져 풀린다. 개발 서버는 팀 확인용이고 EKS로 옮길 때까지만 쓰므로 이 위험을 받아들인다. EKS에서는 WAF가 주소당 5분 20회를 넘는 시작 요청을 막는다([#276 10/19 결정](https://github.com/JminAILab/CatchU/issues/276#issuecomment-6260130109)).
- Caddy는 서버 망(host)에서 돌아 서버의 AWS 권한(인스턴스 메타데이터)에 닿는다. 다른 컨테이너는 hop 제한으로 막힌다. Caddy가 뚫려도 비밀값 파라미터는 읽지 못하게 서버 역할에 거부 규칙을 둔다(위 「환경 폴더」). 11월 EKS에서는 ALB가 앞단을 맡아 이 예외가 없어진다.
- 서버 접속은 SSH가 아니라 AWS Session Manager다. 비밀값은 환경변수로 들어가므로 서버에서 `docker inspect`를 쓸 수 있는 사람은 값을 볼 수 있다.
