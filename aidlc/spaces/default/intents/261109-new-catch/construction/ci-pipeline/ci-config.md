# 새 Catch — CI 설정

입력: Build and Test 결과(`construction/build-and-test/`), 세 Unit 코드 요약, 저장소의 `.github/workflows/`. 이 단계의 답은 `ci-pipeline-questions.md`(Q1 A, Q2 A)다.

## 결정

- 이번 intent에서 CI는 고치지 않는다(Q1 A).
  - 지금 `dev-ci`가 이 intent가 바꾼 경로를 모두 검사한다.
  - `dev`에는 필수 검사 다섯 개가 걸려 있다.
- 새로 만든 워크플로 파일·설정·산출물 저장소는 없다.
- **운영 메모:** 통합 브랜치(`intent/260925-intent-12`)에는 보호 규칙이 없다. 그래서 Unit PR은 CI 통과를 확인한 뒤 합친다(팀장 덧붙임).

## 지금 워크플로

| 파일 | 언제 | 무엇 |
|---|---|---|
| `.github/workflows/ci.yml`(`dev-ci`) | `dev`·`intent/**`로 가는 PR과 push, 수동 실행 | 아래 job 다섯 |
| `.github/workflows/images.yml` | `main`으로 가는 PR, 수동 실행 | 운영 이미지 검사, 개발 서버 배포 스크립트 시험 |
| `.github/workflows/deploy-dev-server.yml` | `main` push, 수동 실행 | 개발 서버(EC2) 배포 |

이 intent는 `images.yml`·`deploy-dev-server.yml`을 바꾸지 않는다. 개발 서버 배포는 `main` 반영 때만 일어난다.

## `dev-ci`의 job

| job | 도는 조건 | 하는 일 | 상한 |
|---|---|---|---|
| `changes` | 늘 | 바뀐 경로로 web·api·worker·의존성 검사를 고르고, 경로 고르기 회귀 시험(`.github/scripts/test-ci-changes.py`)과 문서 크기 검사(`check-doc-sizes.sh`)를 돈다 | 5분 |
| `web` | web이 고른 경로가 바뀜 | `npm ci` → `npm run check`(린트·타입·시험·빌드·`next start` 기동 확인) | 15분 |
| `api` | api가 고른 경로가 바뀜 | 시험 DB(pgvector)·Valkey 서비스, `npm run lint`·`typecheck`·`npm test`, 공용 자료 확인(`test/analysis/shared-fixtures.check.cjs`) | 15분 |
| `worker` | worker가 고른 경로가 바뀜 | Valkey 서비스, `ruff check`·`ruff format --check`·`mypy`·`pytest` | 15분 |
| `deps-audit` | 의존성 목록·잠금 파일이 바뀜 | `.github/scripts/check-deps-audit.sh` | 5분 |

- CI의 api·worker job에는 `CATCHU_TEST_REDIS_URL`이 있다. 로컬 Build and Test에서 건너뛴 실제 큐·Redis 시험 38개도 CI에서는 돈다.
- CI는 커버리지를 재지 않는다. 커버리지는 Build and Test에서 서비스별 전체 명령으로 쟀다(api 98.49%·web 93.65%·worker 96%).

## 이 intent의 경로와 고르기 결과

통합 브랜치와 갈라진 지점(`a30112a2`)에서 이 브랜치까지 바뀐 서비스 경로와, 그 경로에서 도는 검사:

| 바뀐 경로 | 도는 검사 |
|---|---|
| `api/src`·`api/test`·`api/scripts`·`api/docs` | api |
| `api/contracts/repository-analysis/`(결과 판본 "4") | api, worker |
| `web/src/features/assets`·`publications`·`recipient`, `web/src/lib`, `web/test` | web. `web/src/features/assets`·`recipient`·`web/src/lib`·`publications/snapshot-view.tsx`는 api도 |
| `worker/app`·`worker/tests` | worker, api(U7 연결 시험, NC2 문장 대조 시험이 `worker/app/candidates/build.py`를 읽음) |
| `worker/fixtures` | worker, api |
| `worker/docs`·`worker/README.md` | worker |

- 의존성 목록·잠금 파일(`package.json`·`package-lock.json`·`pyproject.toml`·`uv.lock`)과 `.github/`는 바뀌지 않았다. 그래서 `deps-audit`는 돌지 않는다.
  - 세 Unit 코드 요약도 같다. NC1은 「새 의존성·환경변수·마이그레이션·CI 변경 없음」이다. NC2·NC3에는 새 의존성과 CI 변경이 없다.
  - NC3에는 마이그레이션 하나와 「진행 중인 분석이 없을 때 api·worker 함께 배포」가 있다.
- 그래서 NC1~NC3의 PR과 통합 브랜치 → `dev` PR에서 web·api·worker 검사가 모두 돈다.
- NC2 계약 C6의 열린 질문 「worker 문장만 바뀐 PR에서도 대조 시험이 돌게」는 지금 규칙(`worker/app/*` → api)으로 이미 풀려 있다.

## 로컬에서 확인한 것 (2026-11-12)

| 명령 | 결과 |
|---|---|
| `python3 .github/scripts/test-ci-changes.py` | 6개 통과 |
| `bash .github/scripts/check-doc-sizes.sh` | 종료 코드 0 |
| CI job과 같은 명령 | Build and Test `test-results.md`. web은 `check` 대신 `lint`·`typecheck`·`test:coverage`로 돌렸다 |

## 브랜치 흐름

- Unit PR: `worker/새-catch-ncN` → `intent/260925-intent-12`, merge commit.
  - NC1은 #517로 병합됐고, NC2는 #520이 열려 있다. NC3 PR은 이 intent를 닫은 뒤에 연다.
- 통합 브랜치 → `dev`: PR, 작성자 외 승인 1건, 필수 검사 다섯 개, merge commit.
- `dev` → `main`: PR. `main` PR에서는 `images.yml`이 돌고, 병합하면 `deploy-dev-server.yml`이 개발 서버에 배포한다.

## Sources

- `.github/workflows/ci.yml`, `.github/workflows/images.yml`, `.github/workflows/deploy-dev-server.yml`, `.github/scripts/test-ci-changes.py`
- GitHub 브랜치 규칙 조회(`gh api repos/{owner}/{repo}/rules/branches/...`, 2026-11-12): `dev` 필수 검사 `changes`·`web`·`api`·`worker`·`deps-audit`, 통합 브랜치 규칙 없음
- 세 Unit 코드 요약: `construction/nc1-sections-and-links/code-generation/code-summary.md`, `construction/nc2-snapshot-fields/code-generation/code-summary.md`, `construction/nc3-revisit-facts/code-generation/code-summary.md`
- `construction/build-and-test/test-results.md`, `build-and-test-summary.md`
- `ci-pipeline-questions.md` Q1 A와 덧붙임
- `inception/contract-design/contract-summary.md` C6
