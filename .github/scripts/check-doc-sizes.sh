#!/usr/bin/env bash
# AI가 읽는 문서가 크기 상한을 넘었는지 확인한다(#201·#202). 단위는 바이트(1 KB = 1,000 B)이고 상한 "미만"이어야 통과한다.
# 대상과 상한의 정본은 #201 본문 「범위」의 문서 크기 검사다. 대상을 더하거나 바꾸면 이 목록도 함께 고친다.
# 저장소 루트에서 실행한다: bash .github/scripts/check-doc-sizes.sh
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# "상한 경로" 한 줄에 하나. 경로의 *는 폴더 경계를 넘지 않는다(git pathspec glob).
# 와일드카드 없는 경로가 없으면 경고만 하고, 와일드카드에 맞는 파일이 없으면 넘어간다.
TARGETS='
36000 docs/CatchU_작업관리.md
19000 docs/CatchU_coding_procedures.md
36000 web/README.md
36000 api/README.md
36000 worker/README.md
36000 api/CONVENTIONS.md
36000 api/docs/*.md
36000 worker/docs/*.md
36000 web/src/features/*/README.md
36000 docs/CatchU_큐_기술검증.md
36000 docs/CatchU_queue_verification_results.md
36000 docs/CatchU_queue_requirements.md
36000 docs/CatchU_작업동일성_판별기준.md
36000 docs/CatchU_수집통제_임시자료.md
36000 docs/CatchU_통합검증표.md
36000 docs/CatchU_work_identity_*.md
36000 docs/CatchU_collection_control_*.md
36000 docs/CatchU_integration_rows_*.md
36000 docs/CatchU_security_checks.md
'
# Codex는 루트부터 작업 폴더까지의 AGENTS.md를 이어 붙여 읽고 그 합이 32 KiB를 넘으면 뒤를 버린다.
AGENTS_LIMIT=32768

in_actions=${GITHUB_ACTIONS:-false}
summary=${GITHUB_STEP_SUMMARY:-/dev/null}
failed=0
rows=''

size_of() { wc -c < "$1" | tr -d ' '; }

report() { # 결과 크기 상한 경로 [설명]
  rows="${rows}| $1 | $2 | $3 | \`$4\`${5:+ $5} |"$'\n'
  printf '%-4s %8s / %-6s %s%s\n' "$1" "$2" "$3" "$4" "${5:+ $5}"
}

annotate() { # 수준 경로 메시지
  if [ "$in_actions" = true ]; then
    echo "::$1 file=$2::$3"
  else
    echo "$1: $3" >&2
  fi
}

check() { # 경로 크기 상한 [설명]
  if [ "$2" -ge "$3" ]; then
    failed=1
    report '초과' "$2" "$3" "$1" "${4:-}"
    annotate error "$1" "$1${4:+ $4} 크기 $2 B가 상한 $3 B 이상이다. 절을 나누거나 다른 문서로 옮겨 상한 아래로 줄인다."
  else
    report '통과' "$2" "$3" "$1" "${4:-}"
  fi
}

while read -r limit pattern; do
  [ -n "${limit:-}" ] || continue
  matched=0
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    matched=1
    check "$file" "$(size_of "$file")" "$limit"
  done < <(git -c core.quotePath=false ls-files -- ":(glob)$pattern")
  if [ "$matched" -eq 0 ]; then
    case "$pattern" in
      *'*'*) report '없음' '-' "$limit" "$pattern" ;;
      *)
        report '없음' '-' "$limit" "$pattern" '(목록의 파일이 없음)'
        annotate warning "$pattern" "목록의 파일이 저장소에 없다: $pattern. 옮겼거나 지웠다면 이 검사의 목록을 고친다."
        ;;
    esac
  fi
done <<< "$TARGETS"

while IFS= read -r file; do
  [ -n "$file" ] || continue
  dir=$(dirname "$file")
  total=0
  [ -f AGENTS.md ] && total=$(size_of AGENTS.md)
  if [ "$dir" != . ]; then
    prefix=''
    IFS=/ read -ra parts <<< "$dir"
    for part in "${parts[@]}"; do
      prefix="${prefix:+$prefix/}$part"
      [ -f "$prefix/AGENTS.md" ] && total=$((total + $(size_of "$prefix/AGENTS.md")))
    done
  fi
  check "$file" "$total" "$AGENTS_LIMIT" '(루트부터 합산)'
done < <(git -c core.quotePath=false ls-files -- ':(glob)AGENTS.md' ':(glob)**/AGENTS.md')

{
  echo '### 문서 크기 검사'
  echo
  echo '| 결과 | 크기(B) | 상한(B 미만) | 파일 |'
  echo '|---|---:|---:|---|'
  printf '%s' "$rows"
} >> "$summary"

exit "$failed"
