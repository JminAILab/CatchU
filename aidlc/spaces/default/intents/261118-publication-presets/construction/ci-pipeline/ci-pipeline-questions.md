# CI Pipeline Questions — 261118-publication-presets

근거: `.github/workflows/ci.yml`(지금 CI), `web/package.json` `check`, `api/package.json` `test`, `construction/build-and-test/build-and-test-summary.md`·`test-results.md`, 팀 관행 `team.md` Testing Posture·Deployment(공유 인프라·CI 변경은 팀장), Testing Contract `scope_floor`(80% 줄 커버리지, 병합 전 CI 실행).

## 정해 둔 것(지금 저장소에서 확인)

- CI 도구: GitHub Actions `.github/workflows/ci.yml`. `dev`·`intent/**`로 가는 PR과 push에서 돈다.
- 브랜치: 작업 브랜치 → `dev` PR(승인 1건, merge commit) → `main`(`docs/CatchU_레포_컨벤션.md`). 이 intent의 브랜치는 `api/publication-presets`.
- 병합 전 검사: web `npm run check`(lint → typecheck → `test/*.test.mjs` 전체 → build → 시작 확인), api lint·typecheck·`npm test`(pgvector 16 DB, 전체 시험), 바뀐 경로만 도는 `changes` 단계, 문서 크기 검사, 의존성 감사. 이 intent가 더한 시험 파일(`web/test/presets.test.mjs`·`reader-tabs.test.mjs`, `api/test/presets/`·`publications/publish-presets.test.cjs`·`catches/publishable-filter.test.cjs`·`integration/preset-publish-chain.test.cjs` 등)은 모두 지금 명령의 범위 안이라 따로 더할 것이 없다.
- 이미지 저장소: 지금처럼 `images.yml`이 ECR로 올린다. 이 intent는 새 서비스·이미지가 없다.

## Q1. [팀장] 커버리지 80% 바닥을 CI에서 막을지

지금 CI는 시험을 돌리지만 커버리지를 재지 않고 문턱도 없다. 이번 Build and Test에서 잰 줄 커버리지는 api 98.46%, web 92.87%다.

A. CI를 바꾸지 않는다(권장). 지금 CI가 이번 intent의 시험을 병합 전에 모두 돌린다. 커버리지는 Build and Test에서 잰 값을 기록으로 둔다. 바꿀 파일 0개
B. web·api CI 단계를 `test:coverage`로 바꾸고 줄 80% 아래면 실패하게 한다. 커버리지가 떨어지는 PR을 병합 전에 막는다. 대신 `ci.yml`과 측정 문턱 설정을 새로 고쳐야 하고(팀장 몫, 이 intent 밖의 공용 기반), api 시험 시간이 늘 수 있다(로컬 test:coverage 445초)
X. Other (please specify)

[Answer]: A

## Assumptions & Open Questions

- U1의 배포 전 파일 지우기(`members/*/publications/`)는 CI·배포 자동화에 넣지 않고 사람이 한다(U1 NFR2.15, `api/docs/presets.md` 「배포」).

## Consolidated Summary Confirmation

- CI 도구·브랜치·병합 전 검사·이미지 저장소는 지금 저장소 그대로이고, 이 intent의 시험은 지금 CI 명령 범위 안이다.
- Q1 A: `ci.yml`을 바꾸지 않는다. 커버리지는 Build and Test에서 잰 값(api 98.46%, web 92.87%)을 기록으로 둔다.
- 배포 전 파일 지우기는 사람이 한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
