# EKS 기능 켜기(5단계)

EKS([#276](https://github.com/JminAILab/CatchU/issues/276))의 api에서 큐 연결·worker 요청 정보 조회·GitHub 연결을 켠 내용과, 그 값을 더한 판본을 띄우는 순서·켠 뒤 확인이다. 단계의 뜻은 [README.md](README.md) 「단계와 시작 조건」 5단계, Secret의 이름과 키는 [k8s/README.md](k8s/README.md) 「Secret과 ConfigMap」에 있다. worker는 2단계부터 큐·조회 주소·판정 값으로 떠 있어 이 단계에서 바뀌지 않는다.

## 켠 것

| 기능 | api 실행 파일의 값 | Secret `catchu-api`의 키 | 함께 필요한 것 |
|---|---|---|---|
| 큐 연결([분석 큐](../../api/docs/analysis-queue.md)) | `CATCHU_QUEUE_PREFIX=catchu` | `CATCHU_QUEUE_REDIS_URL`(worker와 같은 주소) | NetworkPolicy의 api → 큐 6379(이미 열려 있다) |
| worker 요청 정보 조회([내부 조회](../../api/docs/worker-context.md)) | `WORKER_CONTEXT_ENABLED=true` | `WORKER_CONTEXT_API_KEY`(worker와 같은 키) | NetworkPolicy의 worker → api 3001, ALB·WAF의 `/v1/internal` 404(이미 있다) |
| GitHub 연결([GitHub 연결](../../api/docs/github-connection.md)) | `GITHUB_CONNECTION_ENABLED=true`, `GITHUB_OAUTH_CALLBACK_URL=https://catchu.dev/github/callback`, `GITHUB_CREDENTIAL_DIRECTORY=/var/lib/catchu/github-credentials` | `GITHUB_OAUTH_CLIENT_ID`·`GITHUB_OAUTH_CLIENT_SECRET`·`GITHUB_CREDENTIAL_ENCRYPTION_KEY` | 토큰 보관 볼륨(「GitHub 토큰 보관 볼륨」). GitHub OAuth App은 개발 서버가 쓰던 배포용 앱 그대로다(콜백이 같은 `https://catchu.dev/github/callback`, [2026-11-10 확인 기록](https://github.com/JminAILab/CatchU/issues/276#issuecomment-6759990563)) |

- **큐 연결:** api가 대기 중인 분석 시도를 큐로 보내고 worker의 진행 알림·결과를 받아 반영한다. 11월 기능의 백그라운드 실행([AiRun](../../api/docs/ai-run.md))도 같은 주소를 쓰며, 주소가 없으면 그 실행이 모두 처리 시한으로 실패한다. 받기가 예상 밖으로 멈추면 api가 종료 코드 1로 끝나고 쿠버네티스가 다시 띄운다(`/health`는 큐를 보지 않는다).
- **결과 수신**은 큐 연결 안에 있어 따로 켜는 값이 없다.
- **내부 조회:** worker가 분석을 시작할 때 클러스터 안 주소로 `/v1/internal` 경로를 불러 접수 기록·선정 범위·GitHub 자격정보를 받는다. 이 경로는 worker Pod에서만 닿는다(NetworkPolicy가 api 3001을 ALB와 worker에서만 받고, ALB와 WAF는 `/v1/internal`을 404로 돌려준다).
- **GitHub 연결:** 회원이 GitHub 계정을 연결하면 api가 토큰을 암호화해 보관 폴더에 두고, 내부 조회 때 꺼내 준다. 시작·완료 사이의 state는 api 메모리에만 있다. api가 한 개라 문제없고, api가 다시 뜨면 진행 중이던 연결만 처음부터 한다.
- **LIVE 분석**도 따로 켜는 값이 없다. 실제 회원(Google 로그인)의 접수가 LIVE 시도를 만들고, worker는 운영 모드에서 LIVE만 처리한다. 세 기능이 모두 있어야 끝까지 돈다. GitHub 연결이 없으면 접수가 403이고, 큐 연결이 없으면 요청이 worker로 가지 않으며, 내부 조회가 없으면 worker가 수집 없이 실패한다.
- **키끼리의 조건:** 조회 키는 서명 키 둘·GitHub 보관 암호화 키와 다르고, 암호화 키는 서명 키 둘과 달라야 api가 뜬다. `make-secrets.sh`가 네 값이 서로 다른지 먼저 본다.

## 적용 순서

기능을 켜는 PR은 api 실행 파일이 읽는 Secret 키를 늘린다. Secret에 그 키가 없거나 GitHub 토큰 보관 볼륨의 요청(`github-credentials`)이 없는 채로 교체하면 새 api가 뜨지 못해 `deploy.sh`가 6으로 멈추고 api·worker가 멈춘 채 남는다. `deploy.sh`는 이것을 미리 확인하지 않는다(자동 배포 역할은 Secret을 읽지 못한다). 그래서 **그 PR이 `main`에 반영되기 전에**(자동 배포가 그 판본을 띄우기 전에) Secret과 볼륨을 먼저 맞춘다. 이미 떠 있는 api·worker는 영향을 받지 않는다(환경변수는 시작할 때만 읽는다). 아래 `k`는 [k8s/README.md](k8s/README.md) 「적용(2단계)」의 줄임이다.

1. 배포 대상을 `none`으로 둔다([cd/README.md](cd/README.md) 「켜기와 멈추기」). 손으로 적용하는 것을 바꾸는 동안의 규칙이다.
2. 그 PR이 든 작업 폴더에서 `bash deploy/aws/scripts/check-target.sh --cluster`로 '일치'를 본 뒤 `bash deploy/aws/scripts/make-secrets.sh`를 다시 실행한다. 실행 전에 `k get secret catchu-api -o jsonpath='{.metadata.annotations.catchu\.io/ssm-versions}'`로 판 번호를 적어 두고, 실행 뒤 출력에서 새 키가 더해졌고 기존 키의 판 번호가 그대로인지 본다. 판 번호가 달라진 키가 있으면 그사이 SSM 값이 바뀐 것이니 띄우기 전에 원인을 본다([k8s/README.md](k8s/README.md) 「값을 바꿀 때」).
3. 「GitHub 토큰 보관 볼륨」대로 마운트 시험을 하고 볼륨을 적용한다.
4. 그 판본을 띄운다. `main`에 반영한 뒤 `bash deploy/aws/scripts/deploy.sh --commit <main 커밋 40자>`로 손으로 교체하거나, 배포 대상을 `eks`로 되돌리고 Actions에서 `deploy-dev-server`를 `main`으로 실행한다. api 실행 파일이 바뀌었으므로 api·worker가 한 번 멈췄다 뜬다.
5. 아래 「켠 뒤 확인」을 한다.

## 켠 뒤 확인

- **큐 연결:** api 로그에 `AnalysisQueue` 문맥의 오류(`ANALYSIS_QUEUE_ERROR`·`ANALYSIS_DISPATCH_PAUSED`)가 이어지지 않는지 본다: `k logs deploy/api | grep -E 'ANALYSIS_QUEUE_ERROR|ANALYSIS_DISPATCH_PAUSED'`. 아무것도 나오지 않으면 정상이다. 처음부터 붙으면 연결을 알리는 줄도 없다(`ANALYSIS_QUEUE_CONNECTED`는 오류 뒤 다시 붙었을 때만 남는다). 큐 장애 조치([README.md](README.md) 「완료 기준 대응」의 `test-failover`) 뒤 api가 다시 뜨지 않고 `ANALYSIS_QUEUE_ERROR` → `ANALYSIS_QUEUE_CONNECTED` 순서로 남는지, worker도 준비 상태로 돌아와 실제 작업을 받는지 본다. 연결 복귀만으로 작업 처리 복귀까지 확인했다고 보지 않는다.
- **내부 조회:** worker Pod에서 없는 시도 ID로 불러 경로가 등록됐고 키가 맞는지 본다. 아래 명령은 키를 화면에 찍지 않고 응답만 낸다. `404`와 본문의 이유 `ATTEMPT_NOT_ACTIVE`가 나오면 정상이다(경로가 없을 때의 404에는 이유가 없다). 401이면 두 Secret의 키가 다르고, 시간 초과면 NetworkPolicy를 본다.
  ```bash
  k exec deploy/worker -- /app/worker/.venv/bin/python -c "import os,urllib.request,urllib.error
  r=urllib.request.Request('http://api.catchu.svc.cluster.local:3001/v1/internal/analysis-attempts/00000000-0000-4000-8000-000000000000/context',headers={'X-Worker-Key':os.environ['WORKER_CONTEXT_API_KEY']})
  try: print(urllib.request.urlopen(r,timeout=5).status)
  except urllib.error.HTTPError as e: print(e.code, e.read().decode()[:200])"
  ```
  바깥에서는 아래 여섯 주소가 모두 404여야 한다(전환 전이면 `--resolve`로 ALB를 가리킨다). 2단계에서도 404였지만 그때는 경로가 꺼져 있어 api에 닿아도 404였다. api는 경로의 대소문자를 가리지 않고 ALB 규칙은 가리므로, 대소문자 변형(`/v1/INTERNAL`·`/v1/Internal`)은 WAF만 막는다. 켠 뒤에는 키 없는 요청이 api에 닿으면 401이 나오므로, 이 둘이 404면 WAF가 막은 것이다. 401이 하나라도 나오면 WAF `catchu-edge`가 ALB에 붙어 있는지부터 본다.
  ```bash
  for p in /v1/internal /v1/INTERNAL /v1/Internal /V1/internal /v1//internal /v1/%69nternal; do curl -s -o /dev/null -w "%{http_code} $p\n" "https://catchu.dev$p/analysis-attempts/00000000-0000-4000-8000-000000000000/context"; done
  ```
- **GitHub 연결:** 보관 폴더가 접근점 그대로 붙었는지 본다(`1000 1000 700`이어야 한다).
  ```bash
  k exec deploy/api -- node -e "const s=require('fs').statSync(process.env.GITHUB_CREDENTIAL_DIRECTORY);console.log(s.uid,s.gid,(s.mode&0o777).toString(8))"
  ```
  화면에서 로그인한 뒤 프로필의 GitHub 연결을 끝까지 해 본다(GitHub 승인 화면 → `catchu.dev/github/callback` → 연결됨). GitHub가 브라우저를 `catchu.dev`로 돌려보내므로 `catchu.dev`가 ALB를 가리킨 뒤(전환 뒤)에만 끝까지 된다. EKS는 DB와 보관 폴더가 새것이라 개발 서버에서 연결했던 계정도 다시 연결한다. 암호문 파일이 하나 생겼는지 본다(파일 수만 찍는다).
  ```bash
  k exec deploy/api -- node -e "console.log(require('fs').readdirSync(process.env.GITHUB_CREDENTIAL_DIRECTORY).length)"
  ```
  다음 교체로 api가 다시 뜬 뒤에도 프로필이 연결됨으로 남는지 본다(볼륨이 Pod와 함께 없어지지 않는다는 확인).
- **실제 분석 한 번:** 연결한 계정의 공개 저장소를 골라 분석을 요청하고 결과 화면까지 본다. api 로그의 `ANALYSIS_REQUEST_ENQUEUED`(큐에 넣음) → worker 로그의 처리 → api 로그의 `WORKER_RESULT_RECEIVED`(`disposition`이 `ACCEPTED`) 순서로 남는다. 접수가 403이면 GitHub 연결을, 요청이 60분 뒤 실패로 닫히면 큐 연결과 내부 조회를 본다. worker의 실제 메모리 사용량도 재서 기록한다. 메모리 상한은 [#480](https://github.com/JminAILab/CatchU/issues/480)에서 정한다.

## GitHub 토큰 보관 볼륨

api는 회원의 GitHub 토큰을 암호화해 [`create-efs.sh`](scripts/create-efs.sh)가 만든 EFS에 둔다. 접근점이 사용자 번호 1000과 시작 폴더(`/github-credentials`, 0700)를 고정하고, 파일 시스템 정책이 접근점을 거치지 않은 마운트와 TLS가 아닌 접속을 거부한다. 마운트는 노드의 EFS 드라이버가 하므로 NetworkPolicy에는 2049를 열지 않는다. 파일 시스템 ID와 접근점 ID는 저장소에 적지 않고, 틀([`k8s/github-credentials-volume.yaml`](k8s/github-credentials-volume.yaml))의 자리를 조회한 값으로 채워 적용한다. 틀을 그대로 적용하면 라벨 값이 형식에 맞지 않아 거부된다.

**준비.** `bash deploy/aws/scripts/check-target.sh --cluster`로 '일치'를 본 뒤 ID를 조회한다. `echo`가 `fs-…`와 `fsap-…`를 찍어야 한다. 아래 명령은 zsh·bash 모두에서 쓸 수 있다.

```bash
fs=$(aws efs describe-file-systems --creation-token catchu-github-credentials --profile catchu --region ap-northeast-2 --query 'FileSystems[0].FileSystemId' --output text)
ap=$(aws efs describe-access-points --file-system-id "$fs" --profile catchu --region ap-northeast-2 --query 'AccessPoints[0].AccessPointId' --output text)
echo "$fs $ap"
fill() { [[ $fs == fs-* && $ap == fsap-* ]] || { echo "EFS ID를 찾지 못했다" >&2; return 1; }; sed -e "s/__EFS_FILE_SYSTEM__/${fs}/g" -e "s/__EFS_ACCESS_POINT__/${ap}/g" "$1"; }
ko() { kubectl --kubeconfig ~/.kube/catchu --namespace catchu-ops "$@"; }
```

**마운트 시험.** 시험 Pod 세 개를 `catchu-ops`에 띄우고 2분쯤 뒤에 본다. Pod는 5분 한도가 있어 그 뒤에는 `Failed`로 바뀐다.

```bash
fill deploy/aws/k8s/ops/efs-mount-test.yaml | ko apply -f -
ko get pod -l catchu.io/efs-mount-test
ko logs efs-test-ok
ko get events --field-selector reason=FailedMount -o custom-columns=POD:.involvedObject.name,MESSAGE:.message
```

| Pod | 기대 | 어긋나면 |
|---|---|---|
| `efs-test-ok`(접근점 + TLS) | `Completed`. 로그가 `folder 1000:1000 700`, `file 1000:1000 600`, `ok`, 남은 파일 수(처음에는 `0`) | 붙지 않으면 GitHub 연결 판본을 띄우지 않는다. 드라이버 권한이 모자라면 `efs-csi-controller-sa`에만 필요한 권한을 더한다. 그래도 붙지 않으면 팀장이 방법을 정한다 |
| `efs-test-no-ap`(접근점 없음) | `ContainerCreating`에 머물고 `FailedMount` 사건이 남는다 | 붙어서 `Error`로 끝나면(로그에 「거부되지 않고 붙었다」) 정책이 막지 못한 것이다. 띄우지 않고 팀장과 정한다 |
| `efs-test-no-tls`(접근점·TLS 없음) | 위와 같다 | 위와 같다 |

TLS만 뺀 접근점 마운트는 시험하지 않는다. 드라이버가 접근점이 있으면 `encryptInTransit` 값과 관계없이 TLS를 붙여서, 그렇게 적어도 TLS로 붙는다(2026-11-18 첫 시험에서 확인).

본 뒤에는 지운다. EFS의 파일은 남고, 시험 파일은 Pod가 스스로 지운다.

```bash
fill deploy/aws/k8s/ops/efs-mount-test.yaml | ko delete -f -
```

**볼륨 적용.** 시험이 기대대로면 적용하고 요청이 `Bound`인지 본다. 다시 적용해도 바뀌는 것이 없다. 볼륨 주소(`volumeHandle`)는 만든 뒤 고칠 수 없으므로, EFS를 다시 만들었으면 api를 멈춘 뒤 요청·볼륨을 지우고 다시 적용한다.

```bash
fill deploy/aws/k8s/github-credentials-volume.yaml | kubectl --kubeconfig ~/.kube/catchu apply -f -
kubectl --kubeconfig ~/.kube/catchu --namespace catchu get pvc github-credentials
```

암호화 키(`GITHUB_CREDENTIAL_ENCRYPTION_KEY`)를 바꾸면 보관된 토큰을 풀지 못해 회원이 GitHub를 다시 연결해야 한다([k8s/README.md](k8s/README.md) 「값을 바꿀 때」). 토큰은 8시간짜리라 EFS 백업은 꺼 두었다.

## 실제 연결 확인과 한계

실제 EKS에서 [11/18 준비 확인](https://github.com/JminAILab/CatchU/issues/276#issuecomment-6972639820)과 [기능 켜기 확인](https://github.com/JminAILab/CatchU/issues/276#issuecomment-6979461733)을 했다.

- api는 실제 큐에 붙었고 장애 조치 뒤 Pod 재시작 없이 27초 만에 다시 연결됐다. 같은 실행에서 worker는 재시작 전까지 새 요청을 받지 않았다. 연결 복귀와 작업 재개는 구분하며 후속 근거는 [#603](https://github.com/JminAILab/CatchU/issues/603)에서 본다.
- worker Pod에서 내부 조회는 맞는 키로 `404 ATTEMPT_NOT_ACTIVE`, 키 없이 401이었다. 바깥 변형 주소 여섯 개는 모두 404였다.
- 접근점·TLS EFS 마운트와 파일 쓰기·읽기·삭제는 성공했고, 접근점 없는 TLS 마운트와 접근점·TLS 없는 마운트는 거부됐다. 접근점이 있으면 드라이버가 TLS를 강제하므로 접근점을 둔 비TLS 연결만 따로 시험한 결과는 아니다.
- 실제 GitHub 연결과 api 재시작 뒤 연결 유지를 확인했다. 실제 분석 1건은 31분 30초·후보 238개로 api 수신 `ACCEPTED`였으며, worker 결과는 되돌아보기 실패 4건을 포함한 `PARTIAL_FAILED`였다. 메모리 최고 약 496Mi, 상한 1,536Mi, OOM 0이었다. 이 한 건의 시간·메모리를 모든 저장소에 일반화하지 않는다.

실행 파일의 형식과 Pod 보안 검사(`restricted`) 통과는 [`scripts/deploy.test.sh`](scripts/deploy.test.sh)가 조건을 보고, 이 문서를 처음 쓸 때 로컬 쿠버네티스 API 서버(1.37.1)에 올려 확인했다(노드와 EFS 드라이버가 없는 서버라 마운트는 보지 못한다).
