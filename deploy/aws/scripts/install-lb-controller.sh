#!/usr/bin/env bash
# Load Balancer Controller(Helm 차트 aws-load-balancer-controller 3.6.2, 컨트롤러 v3.6.2)를 kube-system에 설치한다(#276 1단계, 클러스터를 만든 뒤).
# Ingress(k8s/ingress.yaml)를 보고 ALB·대상 그룹·리스너 규칙을 만들고, catchu.dev ACM 인증서(create-certificate.sh)와 WAF catchu-edge를 붙인다.
# AWS 권한은 cluster.yaml의 Pod Identity(eksctl 기본 묶음 + WAF 목록 조회)로 받는다. 기본 묶음이 v3.6.2 공식 IAM 정책의 동작 80개를
# 모두 담는 것을 2026-10-30에 대조했다(eksctl 0.231.0).
# 차트는 helm repo를 더하지 않고 받아 해시를 본 뒤 그 파일로 설치한다. 해시는 2026-10-30 차트 목록(index.yaml)의 3.6.2 digest다.
# 설정: Pod는 인스턴스 메타데이터에 닿지 못하므로(cluster.yaml disablePodIMDS) 리전과 VPC를 넘긴다. 서비스 계정 이름은 Pod Identity 연결과 같다.
#   Service 생성을 가로채는 웹훅은 끈다. LoadBalancer 형식 Service를 쓰지 않는데, 켜 두면 컨트롤러가 멈춘 동안 클러스터 어디서도 Service를 만들지 못한다.
# 쿠버네티스 권한(차트 기본, 2026-10-30 확인): Secret 읽기·nodes/proxy·exec는 없다. 모든 namespace의 ConfigMap을 이름으로 읽고 고치는 권한과
#   Ingress·Service·Pod 상태를 고치는 권한은 있다. 상류 기본값이라 끄는 설정이 없고, 컨트롤러는 ALB 전체를 바꾸는 AWS 권한을 이미 가진 구성 요소로 본다.
# 인자 없이 실행하면 확인만 한다(차트를 받아 해시까지 본다). --apply를 주면 설치하고 준비될 때까지(최대 5분) 기다린 뒤 확인 값을 찍는다.
# 이미 설치돼 있으면 멈춘다. 설치가 실패했으면 helm uninstall aws-load-balancer-controller -n kube-system --kubeconfig ~/.kube/catchu 뒤 다시 실행한다.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"

mode=check
case "${1:-}" in
  --apply) mode=apply ;;
  '') ;;
  *) catchu_die "사용법: $0 [--apply]" ;;
esac

release=aws-load-balancer-controller
namespace=kube-system
repo=https://aws.github.io/eks-charts
chart_version=3.6.2
chart_sha256=9255bf39873b6cb31106dbe61dc87c3617bff4197783b5b94381811a13f99c3c

catchu_require_tools aws jq kubectl helm shasum
catchu_guard_aws
catchu_guard_cluster

n=$(catchu_count "Pod Identity 연결 ${namespace}/${release}" eks list-pod-identity-associations --cluster-name "$CATCHU_CLUSTER" \
  --namespace "$namespace" --service-account "$release" --query 'length(associations)')
[ "$n" = 1 ] || catchu_die "Pod Identity 연결 ${namespace}/${release}이 하나가 아니다(${n}). cluster.yaml로 만든 클러스터인지 본다"
vpc=$(aws_catchu eks describe-cluster --name "$CATCHU_CLUSTER" --query cluster.resourcesVpcConfig.vpcId --output text) ||
  catchu_die "클러스터의 VPC를 조회하지 못했다"
[[ $vpc =~ ^vpc-[0-9a-f]+$ ]] || catchu_die "클러스터의 VPC ID가 아니다(${vpc})"

installed=$(helm list --namespace "$namespace" --all --filter "^${release}\$" --short) || catchu_die "helm 설치 목록을 읽지 못했다"
found=()
[ -z "$installed" ] || found+=("helm 설치 ${release}(${namespace})")
catchu_require_clean ${found[@]+"${found[@]}"}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
helm pull "$release" --repo "$repo" --version "$chart_version" --destination "$tmp" > /dev/null ||
  catchu_die "차트 ${release} ${chart_version}를 받지 못했다"
chart="$tmp/${release}-${chart_version}.tgz"
sum=$(shasum -a 256 "$chart" | awk '{ print $1 }')
[ "$sum" = "$chart_sha256" ] || catchu_die "차트 해시가 기록과 다르다(${sum}). 설치하지 않는다"
catchu_info "차트 ${release} ${chart_version}: 해시 일치"

catchu_info "만들 것: helm 설치 ${release}(${namespace}, VPC ${vpc}, Service 가로채기 웹훅 끔)"
if [ "$mode" != apply ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

helm install "$release" "$chart" --namespace "$namespace" --wait --timeout 5m \
  --set clusterName="$CATCHU_CLUSTER" --set region="$CATCHU_REGION" --set vpcId="$vpc" \
  --set serviceAccount.name="$release" --set enableServiceMutatorWebhook=false > /dev/null
catchu_info "helm 설치 ${release}: 함"

ready=$(kubectl --namespace "$namespace" get deployment "$release" -o jsonpath='{.status.readyReplicas}/{.spec.replicas}')
class=$(kubectl get ingressclass alb -o jsonpath='{.spec.controller}')
webhooks=$(kubectl get mutatingwebhookconfiguration aws-load-balancer-webhook -o jsonpath='{.webhooks[*].name}')
secrets=$(kubectl auth can-i list secrets --all-namespaces --as="system:serviceaccount:${namespace}:${release}" || true)
catchu_info "확인 값:"
jq -n --arg ready "$ready" --arg class "$class" --arg webhooks "$webhooks" --arg secrets "$secrets" \
  '{readyReplicas: $ready, ingressClassAlb: $class, mutatingWebhooks: ($webhooks | split(" ")), canListSecrets: $secrets}'
[ "$ready" = 2/2 ] || catchu_die "컨트롤러 Pod 2개가 준비되지 않았다(${ready})"
[ "$class" = ingress.k8s.aws/alb ] || catchu_die "IngressClass alb가 이 컨트롤러를 가리키지 않는다(${class:-없음})"
case " $webhooks " in *" mservice.elbv2.k8s.aws "*) catchu_die "Service 가로채기 웹훅이 켜져 있다" ;; esac
[ "$secrets" = no ] || catchu_die "컨트롤러가 Secret 목록을 읽을 수 있다(${secrets})"
