# EKS 기능 켜기(5단계)

EKS([#276](https://github.com/JminAILab/CatchU/issues/276))의 api에서 큐 연결·worker 요청 정보 조회을 켠 내용과, 그 값을 더한 판본을 띄우는 순서·켠 뒤 확인이다. 단계의 뜻은 [README.md](README.md) 「단계와 시작 조건」 5단계, Secret의 이름과 키는 [k8s/README.md](k8s/README.md) 「Secret과 ConfigMap」에 있다. worker는 2단계부터 큐·조회 주소·판정 값으로 떠 있어 이 단계에서 바뀌지 않는다.

## 켠 것

| 기능 | api 실행 파일의 값 | Secret `catchu-api`의 키 | 함께 필요한 것 |
|---|---|---|---|
| 큐 연결([분석 큐](../../api/docs/analysis-queue.md)) | `CATCHU_QUEUE_PREFIX=catchu` | `CATCHU_QUEUE_REDIS_URL`(worker와 같은 주소) | NetworkPolicy의 api → 큐 6379(이미 열려 있다) |
| worker 요청 정보 조회([내부 조회](../../api/docs/worker-context.md)) | `WORKER_CONTEXT_ENABLED=true` | `WORKER_CONTEXT_API_KEY`(worker와 같은 키) | NetworkPolicy의 worker → api 3001, ALB·WAF의 `/v1/internal` 404(이미 있다) |

- **큐 연결:** api가 대기 중인 분석 시도를 큐로 보내고 worker의 진행 알림·결과를 받아 반영한다. 11월 기능의 백그라운드 실행([AiRun](../../api/docs/ai-run.md))도 같은 주소를 쓰며, 주소가 없으면 그 실행이 모두 처리 시한으로 실패한다. 받기가 예상 밖으로 멈추면 api가 종료 코드 1로 끝나고 쿠버네티스가 다시 띄운다(`/health`는 큐를 보지 않는다).
- **결과 수신**은 큐 연결 안에 있어 따로 켜는 값이 없다.
- **내부 조회:** worker가 분석을 시작할 때 클러스터 안 주소로 `/v1/internal` 경로를 불러 접수 기록·선정 범위·GitHub 자격정보를 받는다. 이 경로는 worker Pod에서만 닿는다(NetworkPolicy가 api 3001을 ALB와 worker에서만 받고, ALB와 WAF는 `/v1/internal`을 404로 돌려준다).
- **키끼리의 조건:** 조회 키는 서명 키 둘과 달라야 api가 뜬다. `make-secrets.sh`가 세 값이 서로 다른지 먼저 본다.

## 적용 순서

기능을 켜는 PR은 api 실행 파일이 읽는 Secret 키를 늘린다. Secret에 그 키가 없는 채로 교체하면 새 api가 뜨지 못해 `deploy.sh`가 6으로 멈추고 api·worker가 멈춘 채 남는다. `deploy.sh`는 이것을 미리 확인하지 않는다(자동 배포 역할은 Secret을 읽지 못한다). 그래서 **그 PR이 `main`에 반영되기 전에**(자동 배포가 그 판본을 띄우기 전에) Secret을 먼저 맞춘다. 이미 떠 있는 api·worker는 영향을 받지 않는다(환경변수는 시작할 때만 읽는다). 아래 `k`는 [k8s/README.md](k8s/README.md) 「적용(2단계)」의 줄임이다.

1. 배포 대상을 `none`으로 둔다([cd/README.md](cd/README.md) 「켜기와 멈추기」). 손으로 적용하는 것을 바꾸는 동안의 규칙이다.
2. 그 PR이 든 작업 폴더에서 `bash deploy/aws/scripts/check-target.sh --cluster`로 '일치'를 본 뒤 `bash deploy/aws/scripts/make-secrets.sh`를 다시 실행한다. 실행 전에 `k get secret catchu-api -o jsonpath='{.metadata.annotations.catchu\.io/ssm-versions}'`로 판 번호를 적어 두고, 실행 뒤 출력에서 새 키가 더해졌고 기존 키의 판 번호가 그대로인지 본다. 판 번호가 달라진 키가 있으면 그사이 SSM 값이 바뀐 것이니 띄우기 전에 원인을 본다([k8s/README.md](k8s/README.md) 「값을 바꿀 때」).
3. 그 판본을 띄운다. `main`에 반영한 뒤 `bash deploy/aws/scripts/deploy.sh --commit <main 커밋 40자>`로 손으로 교체하거나, 배포 대상을 `eks`로 되돌리고 Actions에서 `deploy-dev-server`를 `main`으로 실행한다. api 실행 파일이 바뀌었으므로 api·worker가 한 번 멈췄다 뜬다.
4. 아래 「켠 뒤 확인」을 한다.

## 켠 뒤 확인

- **큐 연결:** api 로그에 `AnalysisQueue` 문맥의 오류(`ANALYSIS_QUEUE_ERROR`·`ANALYSIS_DISPATCH_PAUSED`)가 이어지지 않는지 본다: `k logs deploy/api | grep -E 'ANALYSIS_QUEUE_ERROR|ANALYSIS_DISPATCH_PAUSED'`. 아무것도 나오지 않으면 정상이다. 처음부터 붙으면 연결을 알리는 줄도 없다(`ANALYSIS_QUEUE_CONNECTED`는 오류 뒤 다시 붙었을 때만 남는다). 큐 장애 조치([README.md](README.md) 「완료 기준 대응」의 `test-failover`) 뒤 api가 다시 뜨지 않고 `ANALYSIS_QUEUE_ERROR` → `ANALYSIS_QUEUE_CONNECTED` 순서로 남는지, worker도 준비 상태로 돌아오는지 본다. 2단계의 장애 조치 확인은 api에 큐 연결이 없을 때 한 것이라 api 쪽은 이때 처음 본다.
- **내부 조회:** worker Pod에서 없는 시도 ID로 불러 경로가 등록됐고 키가 맞는지 본다. 아래 명령은 키를 화면에 찍지 않고 응답만 낸다. `404`와 본문의 이유 `ATTEMPT_NOT_ACTIVE`가 나오면 정상이다(경로가 없을 때의 404에는 이유가 없다). 401이면 두 Secret의 키가 다르고, 시간 초과면 NetworkPolicy를 본다. 바깥에서는 `curl -s -o /dev/null -w '%{http_code}\n' https://catchu.dev/v1/internal/analysis-attempts/x/context`가 404여야 한다(전환 전이면 `--resolve`로 ALB를 가리킨다).
  ```bash
  k exec deploy/worker -- /app/worker/.venv/bin/python -c "import os,urllib.request,urllib.error
  r=urllib.request.Request('http://api.catchu.svc.cluster.local:3001/v1/internal/analysis-attempts/00000000-0000-4000-8000-000000000000/context',headers={'X-Worker-Key':os.environ['WORKER_CONTEXT_API_KEY']})
  try: print(urllib.request.urlopen(r,timeout=5).status)
  except urllib.error.HTTPError as e: print(e.code, e.read().decode()[:200])"
  ```

## 아직 못 본 것

실제 클러스터가 있어야 확인된다. 위 순서로 띄운 뒤 「켠 뒤 확인」에서 보고, 결과는 #276 댓글에 남긴다.

- api가 실제 큐(ElastiCache)에 TLS·비밀번호로 붙는지와 장애 조치 뒤 다시 붙는지(worker는 2단계에서 봤다)
- 실제 worker Pod에서 내부 조회가 닿고 키가 맞는지
