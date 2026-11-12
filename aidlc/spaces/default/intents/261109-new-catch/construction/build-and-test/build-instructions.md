# 새 Catch — 빌드 안내

입력: 세 Unit의 코드 요약과 Unit 시험 안내
- `construction/nc1-sections-and-links/code-generation/`
- `construction/nc2-snapshot-fields/code-generation/`
- `construction/nc3-revisit-facts/code-generation/`

이 intent는 새 배포 단위를 만들지 않는다. 기존 api(NestJS)·worker(Python)·web(Next.js)을 고쳤다. 빌드 방법은 각 서비스 README와 같다.

## 준비

| 무엇 | 명령·값 |
|---|---|
| Node | `.nvmrc`의 판본 |
| api·web 의존성 | `npm --prefix api ci`, `npm --prefix web ci` |
| worker 의존성 | `(cd worker && uv sync --locked)` |
| api 시험 DB | `api/README.md` 「DB 테스트」의 docker 명령으로 띄운 `catchu-db-test`(127.0.0.1:5433). 시험 실행기가 시험 DB에 마이그레이션을 적용한다 |
| 전원·부하 | 충전기를 연결하고 `pmset -g batt`로 확인한다. `sysctl -n vm.loadavg`로 1분 평균이 6 미만인지 본 뒤 돌린다(프로젝트 규칙) |

## 새로 생긴 설정·마이그레이션

- **마이그레이션:** `api/src/database/migrations/1794378756644-AddCatchRevisitFacts.ts`(NC3, `catch_asset`의 `revisit_facts`·`first_work_at`·`last_work_at`과 검사). api를 배포하기 전에 적용한다. NC1·NC2는 마이그레이션이 없다.
- **환경변수:** 새 이름은 없다.
- **결과 메시지 판본:** NC3에서 "4"로 올랐다.
  - api와 worker를 같은 배포에 넣고, 진행 중인 분석이 없을 때 배포한다(FR15.1, NC3 NFR7.3).
  - 판본 "3" 결과는 api가 거부한다.
- **worker 규칙 스위치:** `worker/app/candidates/revisit.py`의 `ENABLED_KINDS`다.
  - 지금은 다시 고침·옮김 둘만 켜져 있다(FR15.4 측정 결과).
  - 설정 파일이나 환경변수로는 바꾸지 않는다.

## 빌드

| 서비스 | 명령 | 확인 |
|---|---|---|
| api | `npm --prefix api run build` | 종료 코드 0, `api/dist/` 생성 |
| web | `npm --prefix web run build` | 종료 코드 0 |
| worker | 빌드 단계 없음. `(cd worker && uv run --locked ruff check . && uv run --locked ruff format --check . && uv run --locked mypy)` | 종료 코드 0 |

## 빌드 확인

intent 검증 명령(`verification-command.txt`)이 린트·타입 검사·빌드·시험·커버리지를 모두 돈다:

```bash
npm --prefix api run lint && npm --prefix api run typecheck && npm --prefix api run test:coverage && npm --prefix web run lint && npm --prefix web run typecheck && npm --prefix web run test:coverage && (cd worker && uv run --locked ruff check . && uv run --locked mypy && uv run --locked pytest --cov --cov-report=term-missing)
```

- 이 단계에서는 이 명령의 각 부분을 따로 돌려 서비스별 시간을 쟀다.
- 결과는 `test-results.md`에 있다.

## 자주 나는 문제

| 증상 | 원인·조치 |
|---|---|
| api DB 시험이 시간 초과·`ECONNRESET`으로 실패 | 기기 부하다. 충전기를 연결하고 부하를 본 뒤 그 파일만 다시 돌린다 |
| `npm test`가 시험 전에 `CREATEDB` 권한으로 멈춤 | 시험 DB 계정에 권한이 없다. `api/README.md` 「DB 테스트」의 명령으로 만든 `catchu-db-test`를 쓴다 |
| api가 결과를 `SCHEMA_INVALID`로 거부 | worker가 옛 판본("3") 결과를 보냈다. api와 worker를 같은 판본으로 맞춘다 |
| 로컬 api가 합성 임베딩으로 뜸(로그에 `EMBEDDING_PROVIDER_SYNTHETIC`) | `CATCHU_EMBEDDING_API_KEY`를 불러오지 않았다. 질의응답 측정 전에 비밀값 파일을 값 출력 없이 함께 불러온다 |
| 평가 스크립트 `measure`가 질문 하나에서 멈춤 | 답 0개는 「답 실패」로 남고 다음 질문으로 간다. 그 밖의 생성 실패는 질문 번호를 로그에 알리고 멈춘다(`api/docs/rag-answer.md`) |
| 로컬 실제 분석에서 `http://127.0.0.1:3000`으로 로그인이 안 됨 | `http://localhost:3000/login`으로 연다 |
