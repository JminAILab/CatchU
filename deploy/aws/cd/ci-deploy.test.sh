#!/usr/bin/env bash
# 자동 배포의 EKS 교체 단계(ci-deploy.sh, #342) 회귀 시험. aws·kubectl을 합성 명령으로, deploy.sh를 합성 스크립트로 바꾼
# 합성 git 저장소에서 ci-deploy.sh를 실제로 실행한다. AWS·클러스터에는 닿지 않는다. 필요한 것은 bash·git·python3뿐이다.
# 끝에서 권한 파일(iam-deploy.json·iam-trust.json·k8s/deploy-rbac.yaml)에 이슈 범위 밖 권한이 들어오지 않았는지 글자로 본다.
# 보는 것: deploy.sh의 전제(프로필 catchu, 키 환경변수 없음, 기대 계정 번호, kubeconfig)를 맞추는지, 되돌리기에서 DB 구조 변경이
#   있으면 deploy.sh를 부르지 않고 멈추는지, --resume을 붙이지 않는지, deploy.sh의 종료 코드를 그대로 내는지, 실행 요약에 계정 번호가 없는지.
# deploy.sh 자체의 동작(같은 판본이면 바꾸지 않음, 멈춘 상태에서는 --resume 없이 멈춤)은 deploy/aws/scripts/deploy.test.sh가 본다.
# 사용: bash deploy/aws/cd/ci-deploy.test.sh   (작업 폴더 어디서든. 실패가 하나라도 있으면 종료 코드 1)
# GitHub Actions의 images 워크플로(cd-scripts job)도 같은 명령을 쓴다.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BIN=$WORK/bin
S=$WORK/state
OUT=$WORK/out.log
ACCOUNT=123456789012
ROLE="arn:aws:iam::${ACCOUNT}:role/catchu-github-eks-deploy"
pass=0
fail=0

# ---------- 합성 aws·kubectl ----------
mkdir -p "$BIN"
cat > "$BIN/aws" <<'EOF'
#!/usr/bin/env bash
# 합성 aws: eks update-kubeconfig만 안다. 부른 인자와 그때의 키 환경변수 유무를 남기고 kubeconfig 파일을 만든다.
S=${STUB_STATE:?}
printf 'aws %s | key-env=%s\n' "$*" "${AWS_ACCESS_KEY_ID:+있음}" >> "$S/calls"
case "$1 $2" in
  "eks update-kubeconfig")
    [ -z "${STUB_KUBECONFIG_ERROR:-}" ] || { echo "An error occurred (AccessDeniedException): synthetic" >&2; exit 254; }
    prev=""
    for a in "$@"; do
      [ "$prev" = --kubeconfig ] && : > "$a"
      prev=$a
    done ;;
  *) echo "합성 aws가 모르는 호출: $*" >&2; exit 99 ;;
esac
EOF
cat > "$BIN/kubectl" <<'EOF'
#!/usr/bin/env bash
# 합성 kubectl: api Deployment의 커밋 표식 조회만 안다. STUB_CURRENT가 지금 떠 있는 판본이다(비면 Deployment 없음).
S=${STUB_STATE:?}
printf 'kubectl %s\n' "$*" >> "$S/calls"
case "$*" in
  *"--namespace catchu get deployment api --ignore-not-found -o jsonpath="*source-revision*)
    [ -z "${STUB_GET_ERROR:-}" ] || { echo "error: You must be logged in to the server (Unauthorized)" >&2; exit 1; }
    printf '%s' "${STUB_CURRENT:-}" ;;
  *) echo "합성 kubectl이 모르는 호출: $*" >&2; exit 99 ;;
esac
EOF
chmod +x "$BIN/aws" "$BIN/kubectl"

# ---------- 합성 저장소 ----------
# C1 → C2(migration 파일 추가) → C3(코드만 바뀜) → C4(시험 대상 ci-deploy.sh와 합성 deploy.sh. 러너의 도구 판본에 해당한다)
REPO=$WORK/repo
g() { git -C "$REPO" -c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false -c core.hooksPath=/dev/null "$@"; }
git -c init.defaultBranch=main init -q "$REPO"
mkdir -p "$REPO/api/src/database/migrations" "$REPO/deploy/aws/cd" "$REPO/deploy/aws/scripts"
echo one > "$REPO/api/src/database/migrations/1-First.ts"
echo v1 > "$REPO/app.txt"
g add -A && g commit -q -m c1
C1=$(g rev-parse HEAD)
echo two > "$REPO/api/src/database/migrations/2-Second.ts"
g add -A && g commit -q -m c2
C2=$(g rev-parse HEAD)
echo v3 > "$REPO/app.txt"
g commit -q -am c3
C3=$(g rev-parse HEAD)
cp "$HERE/ci-deploy.sh" "$REPO/deploy/aws/cd/ci-deploy.sh"
cat > "$REPO/deploy/aws/scripts/deploy.sh" <<'EOF'
#!/usr/bin/env bash
# 합성 deploy.sh: 받은 인자와 전제(프로필 파일, 키 환경변수, 기대 계정 번호, kubeconfig)를 남기고 STUB_DEPLOY_CODE로 끝난다.
S=${STUB_STATE:?}
{
  printf 'args=%s\n' "$*"
  printf 'key-env=%s\n' "${AWS_ACCESS_KEY_ID:-}${AWS_SECRET_ACCESS_KEY:-}${AWS_SESSION_TOKEN:-}"
  printf 'expected=%s\n' "${CATCHU_EXPECTED_ACCOUNT:-}"
  printf 'profile=%s\n' "$(tr '\n' ';' < "$HOME/.aws/credentials")"
  printf 'credentials-mode=%s\n' "$(ls -l "$HOME/.aws/credentials" | cut -c1-10)"
  printf 'kubeconfig=%s\n' "$([ -f "$HOME/.kube/catchu" ] && echo 있음)"
} > "$S/deploy"
if [ "${STUB_DEPLOY_CODE:-0}" = 0 ] && [ -n "${STUB_NO_CHANGE:-}" ]; then
  echo "2026-11-17T00:00:00Z 바꿀 것 없음: 커밋의 판본·구성이 이미 정상으로 돌고 있다." >&2
  exit 0
fi
echo "2026-11-17T00:00:00Z 이미지 주소 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/catchu-api" >&2
printf '교체 기록(커밋 %s)\n  이미지 digest: web sha256:aa, api sha256:bb\n  migration 성공: catchu-migrate-x(종료 코드 0)\n' "$2" >&2
exit "${STUB_DEPLOY_CODE:-0}"
EOF
g add -A && g commit -q -m tools
SUT=$REPO/deploy/aws/cd/ci-deploy.sh

reset_state() {
  rm -rf "$S" "$WORK/home"
  mkdir -p "$S" "$WORK/home"
  : > "$S/calls"
  : > "$S/summary"
}
run_sut() { # 배포할 커밋. 합성 응답을 바꿀 값(STUB_*)과 바꿀 환경(ROLE_ARN·ACTIONS·KEY)은 호출 앞에 붙인다.
  (cd "$REPO" && env PATH="$BIN:$PATH" HOME="$WORK/home" STUB_STATE="$S" COMMIT="$1" \
    DEPLOY_ROLE_ARN="${ROLE_ARN-$ROLE}" GITHUB_ACTIONS="${ACTIONS-true}" GITHUB_STEP_SUMMARY="$S/summary" \
    AWS_ACCESS_KEY_ID="${KEY-ASIASYNTHETICKEY}" AWS_SECRET_ACCESS_KEY=synthetic-secret AWS_SESSION_TOKEN=synthetic-token \
    AWS_REGION=ap-northeast-2 AWS_DEFAULT_REGION=ap-northeast-2 \
    bash "$SUT") > "$OUT" 2>&1
  echo $?
}
check() { # 이름, 결과(0이면 통과)
  if [ "$2" = 0 ]; then
    pass=$((pass + 1)); echo "통과 $1"
  else
    fail=$((fail + 1)); echo "실패 $1"; sed 's/^/    /' "$OUT" | tail -15
  fi
}
deployed() { [ -f "$S/deploy" ]; }       # deploy.sh를 불렀는지
got() { grep -qxF "$1" "$S/deploy"; }     # deploy.sh가 본 값
no_account() { ! grep -q "$ACCOUNT" "$OUT" "$S/summary"; }

# ---------- 전제 맞추기와 교체 ----------
reset_state; rc=$(STUB_CURRENT=$C1 run_sut "$C3")
check "다음 판본: 종료 0, deploy.sh를 --commit만 붙여 부른다(--resume 없음)" "$( [ "$rc" = 0 ] && got "args=--commit $C3"; echo $?)"
check "다음 판본: 사이에 DB 구조 변경이 있어도 앞으로 가는 배포는 막지 않는다" "$(deployed; echo $?)"
check "전제: deploy.sh에는 키 환경변수가 없다" "$(got 'key-env='; echo $?)"
check "전제: 기대 계정 번호는 역할 주소에서 읽는다" "$(got "expected=$ACCOUNT"; echo $?)"
check "전제: 프로필 catchu에 임시 키 세 개" "$(got 'profile=[catchu];aws_access_key_id = ASIASYNTHETICKEY;aws_secret_access_key = synthetic-secret;aws_session_token = synthetic-token;'; echo $?)"
check "전제: 키 파일은 소유자만 읽는다" "$(got 'credentials-mode=-rw-------'; echo $?)"
check "전제: kubeconfig ~/.kube/catchu를 프로필 catchu로 만든다(키 환경변수 없이)" "$(got 'kubeconfig=있음' && grep -qxF "aws eks update-kubeconfig --name catchu --kubeconfig $WORK/home/.kube/catchu --profile catchu --region ap-northeast-2 | key-env=" "$S/calls"; echo $?)"
check "기록: 요약에 커밋·관계·결과·교체 기록(digest·migration)" "$(grep -qF "커밋: \`$C3\`" "$S/summary" && grep -qF "${C1:0:12} 다음 판본" "$S/summary" && grep -qF '결과: 교체 완료' "$S/summary" && grep -qF '이미지 digest: web sha256:aa' "$S/summary" && grep -qF 'migration 성공' "$S/summary"; echo $?)"
check "기록: 출력과 요약에 계정 번호가 없다" "$(no_account; echo $?)"

reset_state; rc=$(run_sut "$C3")
check "처음 설치(떠 있는 판본 없음): deploy.sh를 부른다" "$( [ "$rc" = 0 ] && deployed && grep -qF '처음 설치' "$S/summary"; echo $?)"

reset_state; rc=$(STUB_CURRENT=$C3 STUB_NO_CHANGE=1 run_sut "$C3")
check "같은 커밋: deploy.sh에 맡기고 요약에 「바꿀 것 없음」" "$( [ "$rc" = 0 ] && deployed && grep -qF '결과: 바꿀 것 없음' "$S/summary"; echo $?)"

# ---------- 되돌리기 ----------
reset_state; rc=$(STUB_CURRENT=$C3 run_sut "$C2")
check "되돌리기(그 사이 DB 구조 변경 없음): deploy.sh를 부른다" "$( [ "$rc" = 0 ] && got "args=--commit $C2" && grep -qF '되돌리기(그 사이 DB 구조 변경 없음)' "$S/summary"; echo $?)"

reset_state; rc=$(STUB_CURRENT=$C3 run_sut "$C1")
check "되돌리기(그 사이 DB 구조 변경 있음): 2로 멈추고 deploy.sh를 부르지 않는다" "$( [ "$rc" = 2 ] && ! deployed; echo $?)"
check "되돌리기 멈춤: 오류 줄과 요약에 바뀐 migration 파일" "$(grep -q '^::error::.*api/src/database/migrations/2-Second.ts' "$OUT" && grep -qF '시작 전에 멈춤(2)' "$S/summary" && grep -qF '2-Second.ts' "$S/summary"; echo $?)"

reset_state; rc=$(STUB_CURRENT=0123456789abcdef0123456789abcdef01234567 run_sut "$C3")
check "떠 있는 판본을 저장소에서 찾지 못하면 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed; echo $?)"
reset_state; rc=$(STUB_CURRENT=main run_sut "$C3")
check "떠 있는 판본의 표식이 커밋이 아니면 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed; echo $?)"
reset_state; rc=$(STUB_GET_ERROR=1 run_sut "$C3")
check "떠 있는 판본 조회가 실패하면 '없음'으로 보지 않고 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed; echo $?)"

# ---------- 멈춤 ----------
for code in 2 3 4 5 6 7 8; do
  reset_state; rc=$(STUB_CURRENT=$C1 STUB_DEPLOY_CODE=$code run_sut "$C3")
  check "deploy.sh 종료 코드 ${code}: 같은 코드로 끝나고 요약·오류 줄에 남긴다" "$( [ "$rc" = "$code" ] && grep -qF "결과: 멈춤(종료 코드 ${code})" "$S/summary" && grep -q "^::error::EKS 교체가 종료 코드 ${code}로 멈췄다" "$OUT" && no_account; echo $?)"
done

reset_state; rc=$(STUB_KUBECONFIG_ERROR=1 run_sut "$C3")
check "kubeconfig를 만들지 못하면 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed; echo $?)"
reset_state; rc=$(ROLE_ARN='' run_sut "$C3")
check "역할 주소가 없으면 아무것도 쓰지 않고 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed && [ ! -e "$WORK/home/.aws/credentials" ] && [ ! -s "$S/calls" ]; echo $?)"
reset_state; rc=$(ROLE_ARN="arn:aws:iam::${ACCOUNT}:user/someone" run_sut "$C3")
check "역할 주소가 역할이 아니면 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed && no_account; echo $?)"
reset_state; rc=$(KEY='' run_sut "$C3")
check "임시 권한이 없으면 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed && [ ! -e "$WORK/home/.aws/credentials" ]; echo $?)"
reset_state; rc=$(run_sut main)
check "커밋 형식이 틀리면 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed; echo $?)"
reset_state; rc=$(ACTIONS='' run_sut "$C3")
check "러너 밖에서는 아무것도 쓰지 않고 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed && [ ! -e "$WORK/home/.aws/credentials" ]; echo $?)"
reset_state; mkdir -p "$WORK/home/.aws"; echo keep > "$WORK/home/.aws/credentials"; rc=$(run_sut "$C3")
check "이미 있는 키 파일은 덮어쓰지 않고 2로 멈춘다" "$( [ "$rc" = 2 ] && ! deployed && [ "$(cat "$WORK/home/.aws/credentials")" = keep ]; echo $?)"

# ---------- 권한 파일: 범위 밖 권한이 들어오지 않았는지(글자로 본다) ----------
iam_scope() { # iam-deploy.json: ECR(앱 저장소 네 개의 올리기·조회)과 클러스터 catchu 조회뿐인지
  python3 -I -c '
import json, sys
statements = json.load(open(sys.argv[1], encoding="utf-8"))["Statement"]
as_list = lambda v: [v] if isinstance(v, str) else v
allowed = {"arn:aws:ecr:ap-northeast-2:ACCOUNT_ID:repository/catchu-" + n for n in ("web", "api", "api-migration", "worker")}
allowed.add("arn:aws:eks:ap-northeast-2:ACCOUNT_ID:cluster/catchu")
problems = []
for s in statements:
    sid = s.get("Sid")
    if s.get("Effect") != "Allow" or "Action" not in s or "Resource" not in s:
        problems.append(f"{sid}: Allow·Action·Resource 꼴이 아니다")
        continue
    actions = as_list(s["Action"])
    for a in actions:
        service = a.split(":")[0]
        if "*" in a or service not in ("ecr", "eks"):
            problems.append(f"{sid}: 범위 밖 동작 {a}")
        elif service == "eks" and a != "eks:DescribeCluster":
            problems.append(f"{sid}: 클러스터 조회 밖 동작 {a}")
        elif service == "ecr" and any(w in a for w in ("Delete", "Policy", "Mutability", "Create", "Replicat")):
            problems.append(f"{sid}: 올리기·조회 밖 동작 {a}")
    if actions == ["ecr:GetAuthorizationToken"]:
        continue
    for r in as_list(s["Resource"]):
        if r not in allowed:
            problems.append(f"{sid}: 범위 밖 자원 {r}")
print("\n".join(problems))
sys.exit(1 if problems else 0)
' "$1"
}
iam_scope "$HERE/iam-deploy.json" > "$OUT" 2>&1
check "AWS 권한: ECR(앱 저장소 네 개의 올리기·조회)과 클러스터 catchu 조회뿐" $?
sed 's|"arn:aws:eks:ap-northeast-2:ACCOUNT_ID:cluster/catchu"|"*"|; s|"eks:DescribeCluster"|"ssm:SendCommand"|' "$HERE/iam-deploy.json" > "$WORK/widened.json"
iam_scope "$WORK/widened.json" > "$OUT" 2>&1
check "AWS 권한 확인이 범위 밖 동작·자원을 잡는다" "$( [ $? = 1 ] && grep -q 'ssm:SendCommand' "$OUT"; echo $?)"
: > "$OUT"
sub='"token.actions.githubusercontent.com:sub": "repo:JminAILab@312341191/CatchU@1332558334:environment:eks"'
check "AWS 신뢰: environment eks에서 돈 실행만" "$(grep -qF "$sub" "$HERE/iam-trust.json" && [ "$(grep -c 'githubusercontent.com:sub' "$HERE/iam-trust.json")" = 1 ] && ! grep -q 'StringLike' "$HERE/iam-trust.json"; echo $?)"
rbac=$(grep -v '^ *#' "$HERE/../k8s/deploy-rbac.yaml")
check "쿠버네티스 권한: Secret·exec·지우기·전체 허용이 없고 namespace catchu 안의 Role뿐" "$( ! grep -qE 'secrets|pods/(exec|attach|portforward|ephemeralcontainers)|delete|ClusterRole|\*' <<< "$rbac" && [ "$(grep -c '^  namespace: catchu$' <<< "$rbac")" = 2 ]; echo $?)"

echo "합계 통과 ${pass} / 실패 ${fail}"
[ "$fail" = 0 ]
