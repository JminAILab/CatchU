#!/usr/bin/env bash
# SSM /catchu/prod/ 아래에 새 비밀값 하나를 SecureString으로 넣는다(#276). 이미 있으면 바꾸지 않고 멈춘다.
# 값을 바꾸는 일(누출됐을 때)은 이 스크립트로 하지 않는다(deploy/aws/k8s/README.md 「Secret과 ConfigMap」의 바꾸는 순서).
# 값은 화면·명령 인자·셸 기록에 남기지 않는다. AWS CLI가 표준 입력을 받지 않으므로 0600 임시 파일로 넘기고 곧바로 지운다
# (create-efs.sh와 같은 방식).
#
# 사용: bash deploy/aws/scripts/put-parameter.sh --random <SSM 이름>   32바이트 난수의 64자리 hex
#         예: /catchu/prod/worker/WORKER_CONTEXT_API_KEY
#       bash deploy/aws/scripts/put-parameter.sh --stdin <SSM 이름>    표준 입력의 첫 줄(콘솔에서 발급한 값)
#         예: /catchu/prod/worker/CATCHU_GENERATION_API_KEY. 터미널에서 치면 화면에 찍히지 않는다.
#         보이는 ASCII(공백·제어 문자 없음) 4096자 이하만 받는다.
# 종료 코드: 0 만듦 / 1 멈춤(만들지 않았다)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"

usage="사용법: $0 --random|--stdin <SSM 이름(/catchu/prod/<영역>/<이름>)>"
[ "$#" = 2 ] || catchu_die "$usage"
mode=$1
name=$2
case $mode in --random | --stdin) ;; *) catchu_die "$usage" ;; esac
[[ $name =~ ^/catchu/prod/[a-z][a-z0-9-]*/[A-Za-z0-9_.-]+$ ]] || catchu_die "SSM 이름은 /catchu/prod/<영역>/<이름> 꼴이어야 한다(${name})"

catchu_require_tools aws jq openssl
catchu_guard_aws
n=$(catchu_count "SSM ${name}" ssm describe-parameters --parameter-filters "Key=Name,Option=Equals,Values=${name}" --query 'length(Parameters)')
[ "$n" = 0 ] || catchu_die "SSM ${name}가 이미 있다. 덮어쓰지 않는다"

if [ "$mode" = --random ]; then
  value=$(openssl rand -hex 32) || catchu_die "난수를 만들지 못했다"
elif [ -t 0 ]; then
  printf '%s 값(화면에 찍히지 않음): ' "$name" >&2
  IFS= read -rs value || true
  printf '\n' >&2
else
  IFS= read -r value || true
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# 값 검사와 요청 JSON 만들기는 jq가 한다(값은 파이프로만 넘긴다). 멈출 때 값은 찍지 않는다.
# shellcheck disable=SC2016 # jq 변수다.
printf '%s' "$value" | jq -Rs --arg name "$name" 'if test("^[!-~]{1,4096}$") | not then error("값 형식") else
  {Name: $name, Type: "SecureString", Value: ., Tags: [{Key: "project", Value: "catchu"}, {Key: "issue", Value: "276"}]} end' \
  > "${tmp}/request.json" 2> /dev/null ||
  catchu_die "값이 비었거나 공백·제어 문자가 있거나 4096자를 넘는다(값은 찍지 않음)"
value=''
# --overwrite를 주지 않으므로 그사이 같은 이름이 생겼으면 AWS가 거부한다.
version=$(aws_catchu ssm put-parameter --cli-input-json "file://${tmp}/request.json" --query Version --output text) ||
  catchu_die "SSM ${name}를 만들지 못했다"
rm -f "${tmp}/request.json"
catchu_info "SSM ${name}: 만듦(판 ${version}, SecureString, 값은 찍지 않음)"
