# EKS 로그 수집

EKS(#276)에서 앱 로그를 CloudWatch에 모으는 설정과 설치·확인 순서다. 2026-10-29 팀장 결정(경보·로그는 MVP 수준)을 따른다. 단계·승인·처음 준비(프로필·kubeconfig)는 [../README.md](../README.md)를 따른다.

**아직 설치하지 않았다.** 로그 그룹은 1단계에서 클러스터보다 먼저, 수집기는 클러스터를 만든 뒤 앱보다 먼저 설치한다.

## 무엇을 어디에

- 수집기: aws-for-fluent-bit(Helm 차트 0.2.0, 이미지 3.2.1 = Fluent Bit 4.2.2, arm64 있음). kube-system에 노드마다 하나 도는 DaemonSet이다.
- 모으는 것: namespace `catchu`(web·api·worker·migration·동의 기록 확인)의 컨테이너 로그만. kube-system·`catchu-ops`(DB 관리 psql)·노드 로그는 모으지 않는다. ALB 접근 로그와 WAF 로그는 따로 꺼 두었다.
- 보내는 곳: 로그 그룹 `/catchu/eks/app`, 보존 14일. 스트림은 컨테이너 로그 파일마다 하나(`app-kube.var.log.containers.<Pod>_catchu_<컨테이너>-<ID>.log`)이고, 이벤트는 로그 줄 원문이다.
- 토큰 줄 버림: 모양을 아는 토큰이 든 줄은 통째로 보내지 않는다. 버리는 꼴은 [`fluent-bit-values.yaml`](fluent-bit-values.yaml) 주석에 있다.
- 권한: 수집기는 Pod Identity(`cluster.yaml`)로 이 그룹에 스트림 만들기·쓰기만 한다. 그룹을 만들거나 보존 기간을 바꾸지 못한다. 호스트 망을 쓰지 않아 노드 권한에도 닿지 않는다.
- 비용: 수집·보관량만큼 낸다. 지금 규모에서는 예산 계산에 따로 잡지 않았다.

받아들이는 한계:
- 꼴이 정해지지 않은 비밀값(DB 비밀번호 등)은 거르지 못한다. 앱이 값을 로그에 쓰지 않는 것이 먼저다(코딩 절차 「자료와 실행 로그」).
- 한 줄이 32KiB를 넘으면 그 줄은 버려진다(차트 기본 `Skip_Long_Lines On`).
- 수집기가 멈춰도 경보는 울리지 않는다(10/29 결정의 경보 4개 밖). 로그가 비어 있는 것으로 안다.

## 파일

| 파일 | 하는 일 |
|---|---|
| [`../scripts/create-log-group.sh`](../scripts/create-log-group.sh) | 로그 그룹 `/catchu/eks/app`을 보존 14일로 만든다(확인 모드·`--apply`, 깨끗할 때 한 번) |
| [`fluent-bit-values.yaml`](fluent-bit-values.yaml) | 수집기 Helm 설정값. 수집 경로(catchu만), 토큰 줄 버림, 보낼 그룹 |
| [`log-check-pod.yaml`](log-check-pod.yaml) | 2단계 확인용 일회 Pod. 표식이 든 보통 줄 하나와 가짜 토큰 줄 둘을 찍는다 |
| [`../scripts/logs.test.sh`](../scripts/logs.test.sh) | 설정값의 이미지·수집 경로·필터로 실제 Fluent Bit을 Docker에서 돌려 시험한다(「시험」) |

## 설치(1단계)

1. **클러스터 전, 로그 그룹:** 확인 모드로 본 뒤 만든다. 끝에 찍히는 `retentionInDays: 14`를 증거로 남긴다.
   ```bash
   bash deploy/aws/scripts/create-log-group.sh
   bash deploy/aws/scripts/create-log-group.sh --apply
   ```
2. **클러스터 뒤, 앱 전, 수집기:** 차트 파일을 받아 해시를 본 뒤 그 파일로 설치한다. 해시는 2026-10-29에 차트 목록(`index.yaml`)의 0.2.0 digest와 대조한 값이다. 다르면 설치하지 않는다.
   ```bash
   bash deploy/aws/scripts/check-target.sh --cluster
   helm repo add eks https://aws.github.io/eks-charts
   d=$(mktemp -d) && helm pull eks/aws-for-fluent-bit --version 0.2.0 -d "$d"
   shasum -a 256 "$d/aws-for-fluent-bit-0.2.0.tgz"   # 666c244b9cfca211be57cf97d9e224157f581d41f413eb89744575fbc9b8980c
   helm install aws-for-fluent-bit "$d/aws-for-fluent-bit-0.2.0.tgz" -n kube-system -f deploy/aws/logging/fluent-bit-values.yaml --kubeconfig ~/.kube/catchu
   kubectl --kubeconfig ~/.kube/catchu -n kube-system rollout status ds/aws-for-fluent-bit --timeout 5m
   ```
   노드 2대에 하나씩 Running인지 본다: `kubectl --kubeconfig ~/.kube/catchu -n kube-system get pod -l app.kubernetes.io/name=aws-for-fluent-bit -o wide`. 설정값을 바꾸면 같은 파일로 `helm upgrade`한다.

## 확인(2단계, 앱을 띄운 뒤)

#276 완료 기준의 "로그 그룹 보존 14일, 가짜 표식 0건" 증거다. 계정 번호는 가려서 남긴다.

1. 확인 Pod를 띄우고 표식(`CATCHUMARK-<숫자>`)을 읽는다.
   ```bash
   kubectl --kubeconfig ~/.kube/catchu create -f deploy/aws/logging/log-check-pod.yaml
   kubectl --kubeconfig ~/.kube/catchu -n catchu logs log-check
   ```
2. 1~2분 뒤 CloudWatch에서 그 표식을 찾는다. **keep 줄 하나만** 나와야 한다. 0건이면 수집이 안 되는 것이고(수집기 로그에서 AccessDenied 등을 본다: `kubectl --kubeconfig ~/.kube/catchu -n kube-system logs -l app.kubernetes.io/name=aws-for-fluent-bit --tail 50`), drop 줄이 나오면 토큰 줄 버림이 듣지 않는 것이다.
   ```bash
   aws logs filter-log-events --log-group-name /catchu/eks/app --filter-pattern '"CATCHUMARK-<숫자>"' --query 'events[].message' --profile catchu --region ap-northeast-2
   ```
3. 보존 기간과, 수집기가 다른 그룹을 스스로 만들지 않았는지 본다. `/catchu/eks/app 14` 한 줄만 나와야 한다.
   ```bash
   aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, `catchu`) || contains(logGroupName, `fluent`)].[logGroupName,retentionInDays]' --output text --profile catchu --region ap-northeast-2
   ```
4. `kubectl --kubeconfig ~/.kube/catchu -n catchu delete pod log-check`

## 지우기

[../README.md](../README.md) 「삭제 순서」 B에서 Load Balancer Controller와 함께 `helm uninstall aws-for-fluent-bit -n kube-system --kubeconfig ~/.kube/catchu`, 클러스터를 지운 뒤 `aws logs delete-log-group --log-group-name /catchu/eks/app --profile catchu --region ap-northeast-2`. Pod Identity 연결은 클러스터와 함께 지워진다.

## 시험

```bash
bash deploy/aws/scripts/logs.test.sh   # Docker가 돌고 있어야 한다. 이미지를 처음 받을 때 인터넷이 필요하다
```

- 확인하는 것: 설정값의 필터가 토큰 꼴마다 든 줄(가짜 값)을 버리고, 비슷하지만 값이 아닌 줄과 보통 줄은 남기는지, 확인 Pod의 keep 줄은 남고 drop 줄은 버려지는지, `catchu-ops`·kube-system 파일은 모으지 않는지. 시험은 정규식을 따로 옮기지 않고 설정값 파일에서 읽는다.
- 확인하지 못하는 것: CloudWatch로 보내기(권한·그룹·스트림), 실제 노드의 로그 파일 이름, 차트가 만드는 전체 설정. 이것은 위 「확인」으로 본다. 차트 0.2.0으로 그린 설정은 2026-10-29에 `helm template`으로 한 번 보았다(PR 본문).
- 생성 스크립트 `create-log-group.sh`는 [`../scripts/create-scripts.test.sh`](../scripts/create-scripts.test.sh)에서 시험한다.
