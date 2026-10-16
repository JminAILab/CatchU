#!/usr/bin/env bash
# 자동 배포(#313)의 바깥 확인. 배포 뒤 공개 주소에서 개발 서버 수동 절차 5단계의 바깥 항목을 본다. 하나라도 어긋나면 실패로 끝난다.
# 필요한 환경: DEV_SERVER_DOMAIN
set -uo pipefail

d=${DEV_SERVER_DOMAIN:?DEV_SERVER_DOMAIN이 필요하다}
fail=0
check() { # 이름, 기대, 실제
  if [ "$2" = "$3" ]; then echo "통과 $1: $3"; else echo "::error::$1: 기대 $2, 실제 $3"; fail=1; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }

# 교체 직후 web이 첫 요청을 받기까지 잠깐 걸릴 수 있어 첫 화면만 조금 기다린다.
for _ in $(seq 1 12); do [ "$(status "https://${d}/")" = 200 ] && break; sleep 5; done
check "첫 화면" 200 "$(status "https://${d}/")"
check "http→https 이동" "308 https://${d}/a?b=1" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "http://${d}/a?b=1")"
check "로그인 없는 api" 401 "$(status "https://${d}/v1/me")"
check "내부 경로 막힘" 404 "$(status "https://${d}/v1/internal/x")"
hsts=$(curl -sI --max-time 10 "https://${d}/" | tr -d '\r' | grep -i '^strict-transport-security:' | sed 's/^[^:]*: *//')
check "HSTS 한 줄" "max-age=300" "$hsts"
exit "$fail"
