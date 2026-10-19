# shellcheck shell=bash
# deploy/aws 스크립트의 공통 확인(#276). 계정·리전·클러스터가 다르면 멈춘다.
# 이 Mac의 기본 AWS 프로필은 다른 회사 계정이다. 그래서 모든 AWS 호출은 aws_catchu로 하고, aws_catchu는 늘 --profile catchu를 붙인다
# (명령줄 --profile은 키 환경변수보다 우선한다). 키 환경변수가 남아 있으면 그것부터 멈춘다.
#
# 쓰는 법(스크립트 맨 앞):
#   . "$(dirname "$0")/lib/guard.sh"
#   catchu_require_tools aws jq     # 없으면 멈춤, 판본이 README 기준과 다르면 경고
#   catchu_guard_aws                # 키 환경변수·프로필·리전·계정
#   catchu_guard_cluster            # kubectl을 쓰는 스크립트만: kubeconfig가 catchu 클러스터를 가리키는지
#
# 기대 계정 번호는 저장소에 적지 않고 저장소 밖에서 읽는다: 환경변수 CATCHU_EXPECTED_ACCOUNT, 없으면 파일
# ~/.config/catchu/aws-account-id(12자리 숫자 한 줄). 화면에는 계정 번호를 찍지 않고 일치 여부만 찍는다.

CATCHU_PROFILE=catchu
CATCHU_REGION=ap-northeast-2
CATCHU_CLUSTER=catchu
CATCHU_KUBECONFIG="$HOME/.kube/catchu"
CATCHU_ACCOUNT_FILE="$HOME/.config/catchu/aws-account-id"

# README.md 「처음 준비」에 적은 판본. 다르면 경고만 한다.
CATCHU_TOOL_VERSIONS='aws 2.28.11
eksctl 0.231.0
kubectl 1.37.1
helm 4.3.0'

catchu_die() {
  printf '멈춤: %s\n' "$*" >&2
  exit 1
}

catchu_info() {
  printf '%s\n' "$*" >&2
}

aws_catchu() {
  command aws --profile "$CATCHU_PROFILE" --region "$CATCHU_REGION" "$@"
}

# 개수를 세는 조회(--query '... length(...)'). 조회가 실패하거나 숫자가 아니면 멈춘다. 실패를 '없음'이나 '있음'으로 보지 않기 위해서다.
# 명령 치환 안에서는 set -e가 이어지지 않으므로(bash 3.2) 부르는 쪽은 n=$(catchu_count …) 꼴로 따로 대입한다.
catchu_count() {
  local what=$1 n
  shift
  n=$(aws_catchu "$@" --output text) || catchu_die "${what} 조회에 실패했다"
  [[ $n =~ ^[0-9]+$ ]] || catchu_die "${what} 조회 결과가 개수가 아니다(${n})"
  printf '%s\n' "$n"
}

catchu_tool_version() {
  case $1 in
    aws) command aws --version 2>&1 | sed -E 's#^aws-cli/([0-9.]+).*#\1#' ;;
    eksctl) command eksctl version 2>/dev/null | sed -E 's/^([0-9.]+).*/\1/' ;;
    kubectl) command kubectl version --client -o json 2>/dev/null | jq -r '.clientVersion.gitVersion' | sed 's/^v//' ;;
    helm) command helm version --short 2>/dev/null | sed -E 's/^v([0-9.]+).*/\1/' ;;
  esac
}

catchu_require_tools() {
  local tool want have
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || catchu_die "${tool} 명령이 없다"
    want=$(printf '%s\n' "$CATCHU_TOOL_VERSIONS" | awk -v t="$tool" '$1 == t { print $2 }')
    [ -n "$want" ] || continue
    have=$(catchu_tool_version "$tool" || true)
    if [ "$have" != "$want" ]; then
      catchu_info "경고: ${tool} 판본이 ${have:-알 수 없음}이다(README 기준 ${want})"
    fi
  done
}

catchu_guard_aws() {
  local name expected actual
  # 키 환경변수는 AWS_PROFILE보다 먼저 쓰인다. aws_catchu는 --profile로 피하지만, 다른 도구(eksctl·kubectl 토큰)는 피하지 못한다.
  for name in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN; do
    if [ -n "${!name:-}" ]; then
      catchu_die "환경변수 ${name}가 있다. unset ${name} 뒤 다시 실행한다"
    fi
  done
  if [ -n "${AWS_PROFILE:-}" ] && [ "$AWS_PROFILE" != "$CATCHU_PROFILE" ]; then
    catchu_die "AWS_PROFILE이 ${CATCHU_PROFILE}가 아니다(${AWS_PROFILE})"
  fi
  for name in AWS_REGION AWS_DEFAULT_REGION; do
    if [ -n "${!name:-}" ] && [ "${!name}" != "$CATCHU_REGION" ]; then
      catchu_die "${name}가 ${CATCHU_REGION}가 아니다(${!name})"
    fi
  done
  export AWS_PROFILE="$CATCHU_PROFILE" AWS_REGION="$CATCHU_REGION" AWS_DEFAULT_REGION="$CATCHU_REGION"

  expected=${CATCHU_EXPECTED_ACCOUNT:-}
  if [ -z "$expected" ] && [ -r "$CATCHU_ACCOUNT_FILE" ]; then
    expected=$(tr -d '[:space:]' < "$CATCHU_ACCOUNT_FILE")
  fi
  if ! [[ $expected =~ ^[0-9]{12}$ ]]; then
    catchu_die "기대 계정 번호가 없다. ${CATCHU_ACCOUNT_FILE}에 12자리 숫자 한 줄로 적는다(README.md 「처음 준비」)"
  fi
  actual=$(aws_catchu sts get-caller-identity --query Account --output text) ||
    catchu_die "계정 조회에 실패했다. 프로필 ${CATCHU_PROFILE}의 키를 확인한다"
  if [ "$actual" != "$expected" ]; then
    catchu_die "계정 불일치: 프로필 ${CATCHU_PROFILE}가 기대한 계정이 아니다"
  fi
  catchu_info "계정 확인: 일치(프로필 ${CATCHU_PROFILE}, 리전 ${CATCHU_REGION})"
}

catchu_guard_cluster() {
  local server endpoint
  if [ -n "${KUBECONFIG:-}" ] && [ "$KUBECONFIG" != "$CATCHU_KUBECONFIG" ]; then
    catchu_die "KUBECONFIG가 ${CATCHU_KUBECONFIG}가 아니다(${KUBECONFIG})"
  fi
  [ -r "$CATCHU_KUBECONFIG" ] || catchu_die "${CATCHU_KUBECONFIG}가 없다(README.md 「처음 준비」)"
  export KUBECONFIG="$CATCHU_KUBECONFIG"
  server=$(command kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}') ||
    catchu_die "kubeconfig의 현재 클러스터를 읽지 못했다"
  endpoint=$(aws_catchu eks describe-cluster --name "$CATCHU_CLUSTER" --query cluster.endpoint --output text) ||
    catchu_die "${CATCHU_CLUSTER} 클러스터를 조회하지 못했다"
  if [ -z "$server" ] || [ "$server" != "$endpoint" ]; then
    catchu_die "kubectl이 가리키는 클러스터가 ${CATCHU_CLUSTER}가 아니다. aws eks update-kubeconfig로 ${CATCHU_KUBECONFIG}를 다시 만든다"
  fi
  catchu_info "클러스터 확인: 일치(${CATCHU_CLUSTER}, ${CATCHU_KUBECONFIG})"
}
