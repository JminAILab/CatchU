# Build and Test Summary — 261118-publication-presets

근거: `build-instructions.md`, `integration-test-instructions.md`, `test-results.md`, `cross-unit-traceability.md`, 네 단위의 코드 생성 기록.

## 빌드 상태

빌드 성공. api·web lint, typecheck, `web run build`가 모두 exit 0. 새 의존성·환경변수 없음. 시험 DB는 pgvector가 있는 5433.

## 만든 시험 안내

| 파일 | 내용 |
|---|---|
| `build-instructions.md` | 준비·빌드·전체 시험·자주 걸리는 것 |
| `integration-test-instructions.md` | 단위 사이 경계 5개와 그 시험, 브라우저에서만 볼 것(Standard 전략) |
| 단위별 `unit-test-instructions.md`(4개) | 코드 생성이 만든 단위 명령 |

성능·보안 시험 안내 파일은 Standard 전략이라 따로 만들지 않았다. 해당 요구는 단위 시험이 덮는다.

## 커버리지 기대와 결과

| 범위 | 기대 | 결과 |
|---|---|---|
| api 전체 | 줄 80% 이상(mvp) | 98.46% |
| web 전체 | 줄 80% 이상(mvp) | 92.87% |
| 단위별 | 따로 정한 문턱 없음 | — |

## Target Verification Matrix

`test-results.md` 「Target Verification Matrix」와 같다. 요약:

| 판정 | 수 | 대상 |
|---|---|---|
| Met | 15 | COV-API, COV-WEB, BUILD, U1-PERF·SCALE·REL·SEC·DATA·OBS, U2-REQ·SEC, U3-REQ·SEC, U4-TEXT |
| N/A | 3 | CI-MERGE(CI Pipeline이 뒤에 맡음), U1-N/A(설계 결정), U2-LIMIT(팀장이 받아들인 한계) |
| Met(브라우저) | 1 | U4-BROWSER(팀장 확인 2026-11-22) |
| Unverified | 3 | U2-BROWSER(화면 낭독기·개발 모드 못 봄, 나머지 팀장 브라우저 통과)·U3-BROWSER(다른 탭 출처 이동·거절 초점 못 봄, 나머지 통과), U1-DEPLOY(첫 PR 본문은 아직 없음) |
| Not Met | 0 | — |

## 되돌아가기

- Loop-back 1(2026-11-21): 팀장 브라우저 확인에서 U2 편집 화면 결함 둘(첫 저장 뒤 빈 새 프리셋으로 다시 그려져 프리셋이 또 생김, 개발 모드에서 저장 중에 멈춤)을 찾아 U2 Code Generation을 다시 열어 고쳤다(57b51f58·6c382740, U2 재승인 885f9714). 자세한 것은 `test-results.md` 「Loop-Back Log」.

## 준비 상태

- 빌드 준비: 됨.
- 시험 준비: 됨. 되돌아가기 뒤 다시 돈 모든 명령이 통과했다.
- 배포 준비: 아직. 브라우저 확인과 dev PR 본문의 배포 전 안내·받아들인 한계가 남았고, 배포 전에 사람이 `members/*/publications/` 파일을 지워야 한다(`api/docs/presets.md` 「배포」).

## 알려진 한계와 남은 것

- 브라우저 확인(U2 고친 뒤·U3)은 로그인한 실제 브라우저에서 사람이 한다. 목록은 `integration-test-instructions.md`.
- U1 회귀 묶음의 S9 시험이 첫 실행에서 983초 기다리다 멈췄다. 다시 돌려 1.19초에 통과했고, 되돌아가기 뒤 실행에서도 다시 생기지 않았다. 원인을 밝히지 못해 기록만 남긴다.
- U2 PR 본문에 적을 한계: 320px 머리글 넘침(U2 전부터), 옮긴 화면의 상세 실패 때 「저장했습니다.」가 안 보임, 옮기기 전에 떠나면 안내가 한 번 늦게 보일 수 있음.
- U1 NFR2.15: dev PR 본문에 배포 전 파일 지우기 안내(지울 곳 `members/*/publications/`만, S3는 `--dryrun` 먼저)를 넣는다.
- U4의 시행일(2026-11-30)은 main 배포가 늦어지면 다시 고친다.
- 받은 사람 README의 낡은 서술 둘(4번 자리 「U10 제공 전」)은 이번 범위 밖이라 그대로 두었다.
