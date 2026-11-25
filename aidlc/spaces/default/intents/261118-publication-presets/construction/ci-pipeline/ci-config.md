# CI Config — 261118-publication-presets

근거: `ci-pipeline-questions.md`(Q1 A, 2026-11-22 팀장, 요약 확인), `.github/workflows/ci.yml`, `web/package.json` `check`, `api/package.json` `test`, `construction/build-and-test/build-and-test-summary.md`·`test-results.md`, 네 단위 `code-generation/code-summary.md`, `team.md` Deployment(공유 인프라·CI 변경은 팀장).

## 결정

CI 설정 파일을 바꾸지 않는다(Q1 A). 이 intent는 새 서비스·이미지·환경변수·의존성이 없고, 더한 시험 파일은 모두 지금 CI 명령이 고르는 범위 안이다.

## 지금 CI가 이 intent에 하는 일

| 단계(`ci.yml`) | 언제 | 명령 | 이 intent에서 덮는 것 |
|---|---|---|---|
| `changes` | `dev`·`intent/**` PR·push | `.github/scripts/test-ci-changes.py`, 문서 크기 검사 | 바뀐 경로(web·api·문서)만 아래 단계를 켬. `web/README.md`(35,722 B)가 상한 36,000 B 안인지 |
| `web` | web이 바뀌면 | `npm ci` → `npm run check`(lint → typecheck → `node --test test/*.test.mjs` → build → 시작 확인) | U2·U3·U4 web 시험 전부(`presets`·`publish`·`api-response`·`reader-tabs`·`recipient*`·`publications-owner`·`materials-screen`·`pdf-materials-api`·`jd-recipient-binding`·`u9-recipient-claude`·`privacy-policy`) |
| `api` | api가 바뀌면 | `npm ci` → lint → typecheck → `npm test`(pgvector 16 DB 서비스, 마이그레이션 먼저 적용, 전체 시험) → 분석 고정 자료 검사 | U1 시험 전부(`presets/`·`publications/publish-presets`·`first-copy`·`integration/preset-publish-chain`·회귀 묶음), U2 `catches/publishable-filter`, U1 마이그레이션 |
| 의존성 감사 | 바뀐 서비스 | `.github/scripts/check-deps-audit.sh` | 새 의존성이 없어 바뀌는 것 없음 |

`images.yml`(이미지 올리기)과 배포는 이 intent가 바꾸지 않는다.

## 이 intent에서 CI 밖에 두는 것

| 일 | 누가·언제 | 근거 |
|---|---|---|
| 커버리지 재기(줄 80%) | Build and Test가 로컬에서 잼(api 98.46%, web 92.87%). CI는 재지 않음 | Q1 A |
| 실제 브라우저 확인 | 팀장, Build and Test(2026-11-22 확인) | `build-and-test/test-results.md` |
| 배포 전 `members/*/publications/` 파일 지우기 | 팀장, main 배포 전(S3는 `--dryrun` 먼저) | U1 NFR2.15, `api/docs/presets.md` 「배포」 |

## 바꿀 때

커버리지 문턱을 CI에 넣으려면 `ci.yml`의 web·api 단계를 `test:coverage`로 바꾸고 문턱을 정해야 한다(Q1 B). 공용 기반이라 팀장이 따로 한다.
