#!/usr/bin/env bash
# 자동 배포(#342)의 EKS 교체 단계. GitHub Actions 러너에서 deploy-dev-server 워크플로의 deploy job이 부른다.
# 교체는 손으로 쓰는 deploy/aws/scripts/deploy.sh를 그대로 부른다. 이 스크립트는 러너를 그 스크립트의 전제에 맞추고,
# 되돌리기를 확인하고, 결과를 실행 기록에 남긴다.
#   1. 전제 맞추기: OIDC로 받은 임시 키를 프로필 catchu로 옮기고 키 환경변수를 지운다(deploy.sh는 프로필 catchu만 쓰고
#      키 환경변수가 있으면 멈춘다). 기대 계정 번호는 역할 주소(environment 비밀값)에서 읽는다. kubeconfig ~/.kube/catchu를 만든다.
#   2. 되돌리기 확인: 지금 떠 있는 판본(api Deployment의 catchu.io/source-revision)이 배포할 커밋의 조상이 아니면 되돌리기다.
#      그 사이에 DB 구조 변경(api/src/database/migrations)이 있으면 멈춘다. migration은 되돌리지 않으므로 옛 판본이 새 구조 위에서 돌게 된다.
#      떠 있는 판본이 없으면(처음 설치) 넘어간다. 지난 교체가 migration 뒤에 멈춘 상태는 이 확인으로 잡지 못한다(deploy.sh가 2로 멈춘다).
#   3. deploy.sh --commit <커밋>. --resume은 붙이지 않는다. 지난 교체가 멈춘 채면 deploy.sh가 아무것도 바꾸지 않고 2로 멈추고,
#      사람이 원인을 확인한 뒤 손으로 이어 간다(deploy/aws/k8s/README.md 「앱 교체(deploy.sh)」).
# 종료 코드: 0 완료 또는 바꿀 것 없음. 2 아무것도 바꾸지 않고 멈춤(입력, 되돌리기 확인, deploy.sh의 시작 전 확인). 3~8 deploy.sh와 같다.
# 필요한 환경: COMMIT, DEPLOY_ROLE_ARN, AWS_ACCESS_KEY_ID·AWS_SECRET_ACCESS_KEY·AWS_SESSION_TOKEN(워크플로가 OIDC로 받음),
#   GITHUB_ACTIONS=true, GITHUB_STEP_SUMMARY. 도구: aws·kubectl·git·jq(deploy.sh가 쓴다).
# 러너 밖에서는 돌지 않는다. 손으로 배포할 때는 deploy.sh를 직접 쓴다(이 스크립트는 ~/.aws/credentials를 새로 쓴다).
set -euo pipefail

PROFILE=catchu
REGION=ap-northeast-2
CLUSTER=catchu
NAMESPACE=catchu
MIGRATIONS=api/src/database/migrations
here=$(cd "$(dirname "$0")" && pwd)
summary=${GITHUB_STEP_SUMMARY:-/dev/null}

stop_before() { # 아무것도 바꾸지 않고 멈춘다(2).
  echo "::error::$*"
  printf '### EKS 교체\n\n- 결과: 시작 전에 멈춤(2). 아무것도 바꾸지 않았다\n- 사유: %s\n' "$*" >> "$summary"
  exit 2
}

[ "${GITHUB_ACTIONS:-}" = true ] || { echo "멈춤: 이 스크립트는 GitHub Actions 러너에서만 돈다. 손으로는 deploy/aws/scripts/deploy.sh를 쓴다" >&2; exit 2; }
[[ "${COMMIT:-}" =~ ^[0-9a-f]{40}$ ]] || stop_before "COMMIT 형식이 틀렸다"
[[ "${DEPLOY_ROLE_ARN:-}" =~ ^arn:aws:iam::([0-9]{12}):role/[A-Za-z0-9+=,.@_-]+$ ]] || stop_before "environment 비밀값 AWS_DEPLOY_ROLE_ARN이 역할 주소 형식이 아니다"
account=${BASH_REMATCH[1]}
for name in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; do
  [ -n "${!name:-}" ] || stop_before "임시 권한(${name})이 없다. 앞 단계 「AWS 권한 받기」를 본다"
done
repo=$(git -C "$here" rev-parse --show-toplevel) || stop_before "저장소 위치를 찾지 못했다"

# ---------- 1. deploy.sh의 전제 맞추기 ----------
credentials=$HOME/.aws/credentials
[ ! -e "$credentials" ] || stop_before "러너에 ~/.aws/credentials가 이미 있다. 덮어쓰지 않는다"
mkdir -p "$HOME/.aws" "$HOME/.kube"
(
  umask 077
  printf '[%s]\naws_access_key_id = %s\naws_secret_access_key = %s\naws_session_token = %s\n' \
    "$PROFILE" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "$AWS_SESSION_TOKEN" > "$credentials"
)
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export CATCHU_EXPECTED_ACCOUNT=$account
kubeconfig=$HOME/.kube/catchu
aws eks update-kubeconfig --name "$CLUSTER" --kubeconfig "$kubeconfig" --profile "$PROFILE" --region "$REGION" > /dev/null ||
  stop_before "kubeconfig를 만들지 못했다(클러스터 ${CLUSTER} 조회 실패)"

# ---------- 2. 되돌리기 확인 ----------
current=$(kubectl --kubeconfig "$kubeconfig" --namespace "$NAMESPACE" get deployment api --ignore-not-found \
  -o jsonpath='{.spec.template.metadata.annotations.catchu\.io/source-revision}') ||
  stop_before "지금 떠 있는 판본을 조회하지 못했다"
if [ -z "$current" ]; then
  relation='떠 있는 판본 없음(처음 설치)'
elif [ "$current" = "$COMMIT" ]; then
  relation='지금 떠 있는 판본과 같은 커밋'
else
  [[ "$current" =~ ^[0-9a-f]{40}$ ]] || stop_before "지금 떠 있는 판본의 커밋 표식이 40자 커밋이 아니다"
  git -C "$repo" cat-file -e "${current}^{commit}" 2> /dev/null ||
    stop_before "지금 떠 있는 판본 ${current:0:12}를 이 저장소에서 찾지 못해 되돌리기인지 판단할 수 없다"
  if git -C "$repo" merge-base --is-ancestor "$current" "$COMMIT"; then
    relation="${current:0:12} 다음 판본"
  else
    changed=$(git -C "$repo" diff --name-only "$COMMIT" "$current" -- "$MIGRATIONS") ||
      stop_before "되돌릴 커밋과 지금 판본 사이의 DB 구조 변경을 비교하지 못했다"
    if [ -n "$changed" ]; then
      stop_before "되돌리려는 ${COMMIT:0:12}와 지금 판본 ${current:0:12} 사이에 DB 구조 변경이 있다($(printf '%s' "$changed" | tr '\n' ' ')). migration은 되돌리지 않으므로 배포하지 않는다"
    fi
    relation="${current:0:12}에서 되돌리기(그 사이 DB 구조 변경 없음)"
  fi
fi
echo "배포할 커밋 ${COMMIT:0:12}: ${relation}"

# ---------- 3. 교체 ----------
log=$(mktemp)
set +e
bash "$here/../scripts/deploy.sh" --commit "$COMMIT" 2>&1 | sed -u "s/${account}/<계정>/g" | tee "$log"
code=${PIPESTATUS[0]}
set -e

record=$(sed -n '/^교체 기록(커밋 /,$p' "$log")
[ -n "$record" ] || record=$(tail -n 5 "$log")
if [ "$code" != 0 ]; then
  result="멈춤(종료 코드 ${code})"
elif grep -q '바꿀 것 없음' "$log"; then
  result='바꿀 것 없음(같은 판본·구성이 정상으로 돌고 있다)'
else
  result='교체 완료'
fi
{
  printf '### EKS 교체\n\n- 커밋: `%s`\n- 지금 판본과의 관계: %s\n- 결과: %s\n\n```\n' "$COMMIT" "$relation" "$result"
  printf '%s\n' "$record"
  printf '```\n'
} >> "$summary"

if [ "$code" != 0 ]; then
  echo "::error::EKS 교체가 종료 코드 ${code}로 멈췄다. 다음 행동은 deploy/aws/cd/README.md 「실패했을 때」와 deploy/aws/k8s/README.md 「앱 교체(deploy.sh)」의 종료 코드 ${code}"
  exit "$code"
fi
