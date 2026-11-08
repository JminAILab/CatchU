# Catch 개편 — 빌드 안내

입력: 세 Unit의 코드 요약과 Unit 시험 안내
- `construction/cr1-readable-catch/code-generation/`
- `construction/cr2-commit-assignment/code-generation/`
- `construction/cr3-ai-drafts/code-generation/`

이 intent는 새 배포 단위를 만들지 않는다. 기존 api(NestJS)·worker(Python)·web(Next.js)을 고쳤다. 빌드 방법은 각 서비스 README와 같다.

## 준비

| 무엇 | 명령·값 |
|---|---|
| Node | `.nvmrc`의 판본(이 확인은 v24.21.0) |
| api·web 의존성 | `npm --prefix api ci`, `npm --prefix web ci` |
| worker 의존성 | `(cd worker && uv sync --locked)` |
| api 시험 DB | `api/README.md` 「DB 테스트」의 docker 명령으로 `catchu-db-test`(127.0.0.1:5433). 시험 실행기가 시험 DB에 마이그레이션을 적용한다 |
| 전원 | 노트북은 충전기를 연결하고 돌린다. 배터리로 돌 때 전체 시험이 60분을 넘었다(충전기 연결 뒤 약 12분) |

## 새로 생긴 설정·마이그레이션

- **마이그레이션:** `api/src/database/migrations/1794054790720-CreateCommitAssignment.ts`(CR2 소속 표). api를 배포하기 전에 적용한다.
- **환경변수:**
  - CR2에는 새 환경변수가 없다.
  - CR3의 AI 쪽은 `CATCHU_JUDGEMENT_PROVIDER`·`CATCHU_JUDGEMENT_API_KEY`가 있을 때만 켜진다. 둘은 고지 v3 배포 뒤에만 서버에 넣는다(`worker/docs/generation-judgement.md`).
  - 예시 파일에는 이름만 있다.
- **결과 메시지 판본:** "3"으로 올랐다. api와 worker를 같은 배포에 넣고, 진행 중인 분석이 없을 때 배포한다(CR2 코드 요약 「운영에 넣을 때」).

## 빌드

| 서비스 | 명령 | 확인 |
|---|---|---|
| api | `npm --prefix api run build` | 종료 코드 0, `api/dist/` 생성 |
| web | `npm --prefix web run build` | 종료 코드 0 |
| worker | 빌드 단계 없음. `(cd worker && uv run --locked ruff check . && uv run --locked mypy)` | 종료 코드 0 |

## 빌드 확인(이 단계에서 돌린 것)

- intent 검증 명령(위 빌드·린트·타입 검사·시험·커버리지 전체):
  `npm --prefix api run lint && npm --prefix api run typecheck && npm --prefix api run test:coverage && npm --prefix web run lint && npm --prefix web run typecheck && npm --prefix web run test:coverage && (cd worker && uv run --locked ruff check . && uv run --locked mypy && uv run --locked pytest --cov --cov-report=term-missing)`
- 결과는 `test-results.md`에 있다.

## 자주 나는 문제

| 증상 | 원인·조치 |
|---|---|
| api DB 시험이 시간 초과·`ECONNRESET`·교착으로 실패 | 기기 부하(재부팅 직후, 배터리 전원). 그 파일만 다시 돌려 통과하면 부하 탓이다. 충전기를 연결하고 부하(1분 평균 6 미만)를 본 뒤 다시 돌린다 |
| api `test/runtime/bootstrap.test.cjs`의 「개발 소스 main」이 시간 초과 | 개발 소스 기동이 느릴 때 생긴다. 파일만 다시 돌리면 5초에 통과한다 |
| worker 맥락 조회가 `CONTEXT_RESPONSE_INVALID` | api와 worker 판본이 다르다(맥락 조회 새 칸). 둘을 같은 판본으로 맞춘다 |
| api가 결과를 `SCHEMA_INVALID`로 거부 | worker가 옛 판본("2") 결과를 보냈다. 같은 판본으로 맞춘다 |
| 로컬 실제 분석에서 `http://127.0.0.1:3000`으로 로그인이 안 됨 | `http://localhost:3000/login`으로 연다(로컬 도구 README) |
