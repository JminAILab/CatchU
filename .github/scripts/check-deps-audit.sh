#!/usr/bin/env bash
# 서비스 잠금 파일의 알려진 취약점을 개발 의존성까지 포함해 검사한다(#215). 의존성은 설치하지 않고 잠금 파일만 읽는다.
# web·api(npm audit)는 high 이상이면 실패한다. worker(uv audit)는 심각도를 구분하지 않아 알려진 취약점이 하나라도 있으면 실패한다.
# 고친 판본이 없는 취약점은 EXCEPTIONS 파일에 적으면 고친 판본이 나올 때까지만 넘어간다. web·api 예외를 확인하려면 gh 로그인이 필요하다.
# 저장소 루트에서 실행한다: bash .github/scripts/check-deps-audit.sh web api worker
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

EXCEPTIONS=.github/deps-audit-exceptions.txt
NPM_BLOCKING=' high critical ' # npm audit 심각도 중 실패로 치는 것

in_actions=${GITHUB_ACTIONS:-false}
summary=${GITHUB_STEP_SUMMARY:-/dev/null}
failed=0
rows=''

report() { # 결과 서비스 심각도 패키지 취약점 설명
  rows="${rows}| $1 | $2 | $3 | $4 | $5 | ${6//|/\\|} |"$'\n'
  printf '%s %s %s %s %s %s\n' "$@"
}

annotate() { # 수준 경로 메시지
  if [ "$in_actions" = true ]; then
    echo "::$1 file=$2::$3"
  else
    echo "$1: $3" >&2
  fi
}

fail() { # 경로 메시지 서비스 심각도 패키지 취약점 설명
  failed=1
  report '실패' "$3" "$4" "$5" "$6" "$7"
  annotate error "$1" "$2"
}

exceptions() { # 서비스 → 그 서비스의 예외 ID(한 줄에 하나)
  awk -v s="$1" '$1 == s { print $2 }' "$EXCEPTIONS"
}

patched_count() { # 취약점ID 생태계 패키지 → GitHub 취약점 DB에 있는 고친 판본 수
  gh api "/advisories/$1" --jq "[.vulnerabilities[] | select(.package.ecosystem == \"$2\" and .package.name == \"$3\")
    | .first_patched_version | select(. != null)] | length" < /dev/null
}

audit_npm() { # 서비스
  local service=$1 lock="$1/package-lock.json" ignored json advisories id severity name title n
  ignored=$(exceptions "$service")
  # 취약점이 있으면 종료 코드가 0이 아니므로 종료 코드 대신 결과 JSON으로 판정한다.
  json=$(cd "$service" && npm audit --package-lock-only --json) || true
  if ! jq -e '.metadata.vulnerabilities' > /dev/null 2>&1 <<< "$json"; then
    fail "$lock" 'npm audit 결과를 받지 못했다. 다시 실행하고, 계속되면 로그의 npm 오류를 확인한다.' \
      "$service" '-' '-' '-' 'npm audit 결과 없음'
    return
  fi
  # npm은 취약점 하나를 의존 경로의 패키지마다 되풀이해 보여 주므로 취약점·패키지 단위로 모은다.
  advisories=$(jq -r '[.vulnerabilities[].via[] | objects] | unique_by([.url, .name]) | .[]
    | [((.url | capture("(?<id>GHSA(-[0-9a-z]{4}){3})") | .id)? // .url), .severity, .name, .title] | @tsv' <<< "$json")
  if [ -z "$advisories" ]; then
    report '통과' "$service" '-' '-' '-' '알려진 취약점 없음'
    return
  fi
  while IFS=$'\t' read -r id severity name title; do
    if [[ "$NPM_BLOCKING" != *" $severity "* ]]; then
      report '참고' "$service" "$severity" "$name" "$id" "$title"
    elif ! grep -qxF "$id" <<< "$ignored"; then
      fail "$lock" "$name $id($severity): 고친 판본으로 의존성을 올린다. 고친 판본이 없으면 이유와 함께 $EXCEPTIONS에 적는다." \
        "$service" "$severity" "$name" "$id" "$title"
    elif ! n=$(patched_count "$id" npm "$name") || ! [[ "$n" =~ ^[0-9]+$ ]]; then
      fail "$lock" "$name $id: 예외 목록의 취약점에 고친 판본이 있는지 확인하지 못했다. gh 로그인과 GitHub API 응답을 확인한다." \
        "$service" "$severity" "$name" "$id" '고친 판본 확인 실패'
    elif [ "$n" -gt 0 ]; then
      fail "$lock" "$name $id: 예외 목록의 취약점에 고친 판본이 나왔다. 의존성을 올리고 $EXCEPTIONS에서 이 줄을 지운다." \
        "$service" "$severity" "$name" "$id" '고친 판본이 나옴'
    else
      report '예외' "$service" "$severity" "$name" "$id" "고친 판본 없음. $title"
    fi
  done <<< "$advisories"
}

audit_uv() { # 서비스
  local service=$1 lock="$1/uv.lock" ignored id args=()
  ignored=$(exceptions "$service")
  for id in $ignored; do args+=(--ignore-until-fixed "$id"); done
  # uv audit은 아직 실험 기능이라 그 경고를 끄는 preview 플래그를 준다. 결과 형식이 바뀔 수 있어 종료 코드로만 판정한다.
  if (cd "$service" && uv audit --frozen --preview-features audit-command ${args[@]+"${args[@]}"}); then
    report '통과' "$service" '-' '-' '-' "알려진 취약점 없음${ignored:+ (고친 판본이 없을 때만 넘기는 예외: ${ignored//$'\n'/, })}"
  else
    fail "$lock" "알려진 취약점이 있거나 검사가 실패했다(로그 참고). 고친 판본으로 의존성을 올린다. 고친 판본이 없으면 이유와 함께 $EXCEPTIONS에 적는다." \
      "$service" '-' '-' '-' 'uv audit 실패(로그 참고)'
  fi
}

[ "$#" -gt 0 ] || { echo "사용법: bash $0 web api worker" >&2; exit 2; }

for service in "$@"; do
  if [ -f "$service/package-lock.json" ]; then
    audit_npm "$service"
  elif [ -f "$service/uv.lock" ]; then
    audit_uv "$service"
  else
    fail "$service" "$service에 package-lock.json이나 uv.lock이 없다." "$service" '-' '-' '-' '잠금 파일 없음'
  fi
done

{
  echo '### 의존성 취약점 검사'
  echo
  echo "npm은 high 이상, uv는 모든 알려진 취약점에서 실패한다. 고친 판본이 없는 취약점의 예외는 \`$EXCEPTIONS\`에 있다."
  echo
  echo '| 결과 | 서비스 | 심각도 | 패키지 | 취약점 | 설명 |'
  echo '|---|---|---|---|---|---|'
  printf '%s' "$rows"
} >> "$summary"

exit "$failed"
