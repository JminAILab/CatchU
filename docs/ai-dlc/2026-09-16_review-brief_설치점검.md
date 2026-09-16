# review-brief 설치 점검 — 2026-09-16

관련 작업: #37, PR #58, intent `260914-catchu-october-mvp`의 feasibility 작성 전 확인.

## 결론과 변경 범위

**최신 상태: 아래 「전용 진입점 보완」의 사용자 허용 후 정상화·13개 검증을 완료했다.** 첫 시도에서는 동일 버전 수정 빌드가 배포본 무결성 검사에 실패해 원본 실행 파일로 복원했다. 그 실패·복원 기록은 아래에 보존한다. 공식 산출물 작성 전 확인·단계 승인은 기술 수정 허용과 별개다.

- 설치 명령/런타임 및 프로젝트 스탬프: 모두 **2.8.1 유지**. 업데이트·refresh를 실행하지 않았다.
- 제품 문서 변경과 분리한 수정: `.codex/tools/aidlc.ts`의 `loadDelegate`에 `TOOLS.reviewBrief` → 기존 `aidlc-review-brief.ts` import 등록 **두 줄** 추가.
- 요약/리뷰 내용 생성 함수, 단계 연결, 상태·감사·승인 로직은 변경하지 않았다. 과거 승인·질문 답변을 소급 수정하지 않았다.
- 재현 가능한 읽기 전용 검사: `scripts/test-aidlc-review-brief.mjs`.

## 실패 명령과 이전 기록 대조

```sh
aidlc engine review-brief summary --stage feasibility --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/feasibility/feasibility-questions.md
```

오류: `aidlc-review-brief.ts does not export main(argv)` (종료 1).

실제로는 해당 파일에 `export function main(argv: string[]): void`가 있다. CLI 명령 등록도 있지만 컴파일 실행기의 `loadDelegate` 분기에는 등록이 없어 `null`이 반환된다. 오류 메시지는 이 경우와 진짜 함수 누락을 구분하지 않는다. 설치 배포 소스와 프로젝트의 `aidlc.ts`가 수정 전 동일함도 확인했다.

| 기록 | 이번 오류와의 관계 |
|---|---|
| 이전 intent 감사 `260909-catchu-definition-review/audit/macui-macbookpro-local-fc6dadc9c037.md`, 2026-09-09T04:21:27Z | 같은 등록 누락 진단이 남아 있다. 당시 설치 해결을 입증하는 기록은 아니다. |
| 현재 intent의 `ideation/intent-capture/memory.md`, 2026-09-14T07:14:13Z | summary와 review에서 동일 오류, runtime-graph 생성 후에도 재현, 미해결 기록. 이전 대응은 독립 리뷰 원문 직접 제시였으며 전역 생략 규칙으로 승격하지 않았다고 명시한다. |
| 현재 intent 감사 `macui-macbookpro-local-3cf6d8f9dcd7.md`, 2026-09-14T07:14:02Z | 사용자의 “후속 단계에서 생략 규칙으로 저장하지 말라”는 지시. 뒤늦은 답변 기록 시도는 새 human reply 없음으로 거부됐으므로 성공한 승인으로 세지 않는다. |

이번에는 사용자의 명시적 설치 점검·최소 수정 요청에 따라 소스를 대조했다. 이전 단계의 출력 대체를 재사용하지 않았다.

## 수정·검증·복원

설치된 2.8.1의 Codex 배포 소스만 임시 경로에 복사하고 동일한 두 줄 패치를 적용했다. 재귀 비교에서 달라진 파일은 `tools/aidlc.ts` 하나였다. 기존 설치된 Bun 1.4.2로 컴파일했으며 새 도구 설치·소스 다운로드는 하지 않았다.

```sh
bun build --compile <임시 배포 소스>/tools/aidlc.ts --outfile <임시 경로>/aidlc
node scripts/test-aidlc-review-brief.mjs <임시 경로>/aidlc /Users/ljm/Desktop/github/CatchU-feasibility aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/feasibility/feasibility-questions.md
```

검사 7개 통과: 버전, summary, context, review 출력, questions-file 누락 거부, intent 외부 파일 거부, 잘못된 stage 거부. 검사 전후 현재 intent 전체 파일 목록·내용 해시와 프로젝트 버전 스탬프가 동일했다. `review --why first`는 출력 경로 검사일 뿐 실제 리뷰 완료·품질 판정이 아니다.

설치 파일 교체 권한 확인 후 원본을 백업하고 임시 빌드로 교체했다. 정상 `aidlc` 진입점에서도 위 7개 검사가 통과했으나 `aidlc doctor`가 `Installed runtime 2.8.1 is incomplete: executable does not match version.json`으로 실패했다.

설치 소스 `aidlc-lifecycle.ts`의 `installVersion`은 동일 버전의 기존 asset 해시가 다르면 거부한다. 따라서 배포본 `version.json`의 해시나 VERIFIED 기록을 직접 변경하지 않았고, 같은 버전 재설치로 안전하게 해결됐다고 주장하지 않는다. 권한 확인 후 원본 실행 파일로 복원했다.

| 대상 | SHA-256 |
|---|---|
| 원본 실행 파일 및 복원 후 파일 | `4ef0db7501adbdb0e8a1ed25600d51ae074eaa6e7f70c81a9491a751328f14aa` |
| 임시 수정 빌드 | `0f3c5888ea936605a6a7392efc4276d12ac9db58ac3b9c36d3fc02f140d883f4` |
| 변경하지 않은 프로젝트 스탬프 | `11b711cbaa45fd4ed751da755ec7015f65e93bcc9a3ca5a5fbc44b2047b7c85d` |
| 변경하지 않은 현재 intent 상태 파일 | `d39e5da82506b9e0d99140a36241d2ecfd4a2e8cd5b3e37bb0098435c4adc868` |

원본 백업: `/Users/ljm/.local/share/aidlc/versions/2.8.1/aidlc.before-review-brief-20260916`.
임시 빌드/소스: `/private/tmp/catchu-aidlc-review-brief.Jaw3zr` (프레임워크 자료만 포함, 제품 실험 원문 없음). 빌드가 작업 루트에 남긴 잔여 실행 파일은 이 임시 경로로 이동했다.

복원 후 doctor: 설치 불일치 문제 해소, 0 problems. 최신 버전 안내·미커밋 기록·runtime-graph 미생성 3 warnings는 기존 경고다. 그 경고를 없애려고 버전·상태를 변경하지 않았다. 원래 등록 누락은 복원된 배포 바이너리에 남아 있으므로 **정상화 완료가 아니다**.

## refresh 및 다음 조치

> 이 절은 첫 시도 종료 시점의 기록이다. 실제 채택한 보완·원복·refresh 기준은 다음 절을 따른다.

- 프로젝트 refresh 시 `.codex/tools/aidlc.ts`의 두 줄이 덮어써질 수 있다. 동일 2.8.1을 유지한다면 재적용 대상이지만, **프로젝트 소스 패치만으로 설치된 바이너리가 바뀌지는 않는다**. 테스트 스크립트·이 점검 기록은 프로젝트 관리 파일이다.
- 향후 수정된 공식 배포본을 쓰려면 별도 버전 변경 승인이 필요하다. 이번에는 실행하지 않는다.
- 버전 변경 없는 대안은 `review-brief`에만 한정하여 동일 버전의 기존 도구를 실행하는 별도 진입점 보완이다. 이는 공식 배포본 교체와 다른 로컬 유지보수 방식이므로 적용 전에 사용자에게 방향을 확인한다. 승인/감사/상태 명령은 기존 경로를 유지해야 한다.
- 그 대안도 채택하지 않으면 소스 패치·검증만 보존하고 설치 오류 해소를 기다린다. 어느 경우든 실제 요약 안내 정상 출력 후에만 원래 작성 전 확인을 다시 제시한다.
- 이번 사용자 답변은 누락 영향 기준 정리에 대한 동의 및 설치 수정 요청이다. feasibility 공식 승인·시간 배정·LLM 추가 API 호출 승인이 아니다. LLM 재검증 2~4시간은 추정치로 유지한다.

## 전용 진입점 보완 — 사용자 허용 후 최신 결과

사용자가 원래 2.8.1 바이너리·무결성 기준을 유지하고 review-brief만 기존 동일 버전 구현을 호출하도록 허용했다. 이 허용을 feasibility 내용 확인이나 공식 승인으로 기록하지 않는다.

### 실제 변경과 경계

- 기계 실행 진입점 `/Users/ljm/.local/bin/aidlc`의 기존 포인터 검증 뒤에 **네 줄**을 추가했다. 활성 버전이 2.8.1이고 첫 두 인수가 정확히 `engine review-brief`일 때만 로컬 보완 파일을 실행한다. 나머지는 원래 배포 바이너리로 그대로 전달한다. 플래그는 이 정규 명령 뒤에 둔다. 다른 명령 배열·버전·하네스까지 지원 범위를 확장하지 않았다.
- 로컬 보완 파일 정본: `scripts/aidlc-review-brief-entry.ts`. 설치 사본: `/Users/ljm/.local/share/aidlc/local/catchu-review-brief-entry.ts`. 배포 런타임·해시 기준 밖의 로컬 파일이며, 배포본인 것처럼 등록하지 않는다.
- 기존 `inspectInstalledVersion("2.8.1", "codex")`를 매 호출 실행하여 바이너리·런타임 무결성을 확인한다. 검사 구현·기준·manifest는 바꾸지 않았다. 실패하면 기존 구현을 호출하지 않는다.
- 이어 설치된 원본 `runtime/codex/.codex/tools/aidlc.ts`의 `main(argv)`를 호출한다. 기존 CLI 인수·프로젝트·버전 pin·명령 정책 검사와 기존 review-brief의 활성 intent·질문 경로 검사까지 실행한다. 작성 전 확인·승인·상태·감사 로직을 복사하거나 새로 구현하지 않았다.
- 소스 파일 위치를 프로젝트로 오인하지 않도록 기본 프로젝트 위치만 기존 환경변수 또는 현재 작업 폴더로 전달한다. 명시적 `--project-dir`가 우선한다. 소스 경로를 바꾸는 테스트용 `AIDLC_DISPATCH_TOOLS_DIR` 지정은 거부한다.
- 기존 설치된 `/opt/homebrew/bin/bun` 1.4.2를 사용한다. 새 런타임 설치·버전 변경 없음. 이전 커밋의 프로젝트 `aidlc.ts` 두 줄 패치는 이번 경로에 불필요하므로 제거하여 배포 소스와 동일하게 돌렸다.

실행 진입점에 추가한 내용(기존 `exec "$target" "$@"` 바로 앞):

```sh
# CatchU local compatibility: only review-brief on the unchanged 2.8.1 release.
if [ "$active_version" = "2.8.1" ] && [ "${1-}" = "engine" ] && [ "${2-}" = "review-brief" ]; then
  exec /opt/homebrew/bin/bun "$versions_root/../local/catchu-review-brief-entry.ts" "$target" "$@"
fi
```

### 검증 결과

```sh
node scripts/test-aidlc-review-brief.mjs /Users/ljm/.local/bin/aidlc /Users/ljm/Desktop/github/CatchU-feasibility aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/feasibility/feasibility-questions.md
aidlc doctor
```

- 후보 진입점과 실제 설치 진입점에서 **13개 검사 통과**: 버전, summary/context/review 출력, 명시 프로젝트 경로 성공, 질문 파일 누락·없는 파일·intent 밖 파일·과거 intent 파일·상위 경로 탈출·없는 stage·중복 project-dir·존재하지 않는 approve 하위 명령 거부.
- 테스트 중 현재 intent 전체 파일 목록·내용(상태·감사·질문 포함), 활성 intent 커서, 버전 포인터, 배포 바이너리, `version.json`, `runtime-integrity.json`, 프로젝트 스탬프의 해시가 모두 불변이었다. 승인/단계 변경 명령은 호출하지 않았다.
- doctor **0 problems, 기존 3 warnings**. 배포 바이너리 SHA-256은 원래 `4ef0db75…`이며 version.json `9f2a47de6d49259c805a0e4e903f6855779b1da2b83a571c7a3a15acac35ce44`, runtime-integrity.json `a6a17d6eba1f1542052379fc9020d0da146b376265a7b2820c3087deebef08ee`도 변경하지 않았다. doctor가 자동 남긴 진단 감사 행은 읽기 전용 회귀 검사와 구분하며 직접 편집하지 않는다.
- 초기 후보 검사는 로컬 보완 파일 설치 전 호출해 파일 없음으로 실패했고, 파일 설치 후 재검증했다. 잘못된 approve 명령은 기존 CLI가 하위 도구보다 앞서 종료 2로 거부하여 테스트 기대값을 맞췄다. 검증을 통과시키기 위해 제품/승인 로직을 수정하지 않았다.
- 검증용 review 출력은 실제 리뷰 완료가 아니다. 실제 feasibility 작성 전 요약 안내가 출력됐다는 것과 내용 확인·공식 승인도 구분한다.

### 원복과 refresh 주의사항

실행 진입점 원본 백업은 `/Users/ljm/.local/bin/aidlc.before-review-brief-entry-20260916`이며 SHA-256은 `3f14cf846ac3520adac628d90179365b98a41c6ef3fa86cc42253d947f5c6ce9`다. 원복은 권한 확인 후 이 파일을 `/Users/ljm/.local/bin/aidlc`로 복원하면 된다. 로컬 보완 파일은 더 이상 호출되지 않으며 배포 바이너리 복원이나 상태·감사 수정은 필요 없다. 원복하면 배포본의 기존 등록 누락 오류가 다시 발생한다.

프로젝트 refresh가 이 기계 로컬 파일을 보존한다고 보장하지 않는다. 기계 설치/launcher 재생성 때 분기가 사라질 수 있다. **재적용 전** 실제 활성 버전·원본 무결성·Bun 경로를 확인하고, 2.8.1에 같은 오류가 남아 있는 경우에만 위 네 줄과 정본 파일을 재설치한 뒤 13개 검사·doctor를 다시 수행한다. 다른 버전에 자동 적용하거나 배포 해시 기준을 수정하지 않는다. 팀원의 기계에는 자동 설치되지 않는다. 프로젝트 `.codex/tools/aidlc.ts`의 이전 두 줄 패치는 이제 재적용하지 않는다.
