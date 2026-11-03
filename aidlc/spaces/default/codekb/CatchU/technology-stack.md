# 기술 스택 — CatchU

> 범위: 2026-11-03 집중 스캔(`kind: partial`), 기준 커밋 `9923226c`. 판본은 `worker/pyproject.toml`, `api/package.json`, `web/package.json`에서 읽었다(잠금 파일은 열지 않았다). 통합 브랜치 합치기(292f443d..a0d56760)는 세 설정 파일을 바꾸지 않았다. 의존 관계는 [dependencies.md](dependencies.md)에 있다.

## 언어와 실행 환경

| 서비스 | 언어 | 실행 환경 | 근거 |
|---|---|---|---|
| worker | Python | 3.12.10(`requires-python = "==3.12.10"`, `.python-version`) | worker/pyproject.toml |
| api | TypeScript 5.9.3 | Node.js(NestJS) | api/package.json |
| web | TypeScript 5 | Node.js(Next.js) | web/package.json |
| 계약 | OpenAPI 3.0.3 YAML | — | api/contracts/repository-analysis/ |

## 프레임워크

| 이름 | 판본 | 쓰는 곳 | 용도 |
|---|---|---|---|
| FastAPI | 0.141.1 | worker | 상태 확인 |
| uvicorn | 0.53.0 | worker | FastAPI 실행 |
| bullmq(Python) | 3.3.0 | worker | 분석 요청 큐 소비 |
| NestJS(`@nestjs/core`) | 12.0.4 | api | 서비스 프레임워크 |
| TypeORM | 1.1.1 | api | PostgreSQL 영속, 마이그레이션. U4 작성자 화면 API는 엔티티 저장 대신 `DataSource.transaction` 안의 SQL(`manager.query`)을 쓴다 |
| bullmq(Node) | 6.3.11 | api | 요청 보내기, 결과·알림 받기 |
| Next.js | 16.4.1 | web | 화면(작성자 설명 편집·`/materials` 포함) |
| React | 19.2.8 | web | 화면. U4 화면은 `useSyncExternalStore`와 자체 `createViewStore`로 상태를 둔다 |

## 주요 라이브러리

| 이름 | 판본 | 쓰는 곳 | 용도 |
|---|---|---|---|
| anthropic(Python SDK) | 1.13.0 | worker `generation/claude.py` | Claude 생성 호출(모델 `claude-haiku-5-5`, 추론 위치 `us`, 재시도 0, 생각 끔, 구조화 출력) |
| httpx2·httpcore2 | 2.13.0 | worker | GitHub·Claude 전송, 호출 마감 제어, 응답 크기 상한 |
| jsonschema·referencing | 4.26.0·0.37.0 | worker `contract/` | 계약 검사(Draft 7) |
| rfc3339-validator·rfc3986-validator | 0.1.4·0.1.1 | worker | 계약 `date-time`·`uri` 형식 검사 |
| pyyaml | 6.0.3 | worker | 계약 YAML 읽기 |
| redis | 7.4.1 | worker | 큐 연결 |
| ajv | 8.20.0 | api `analysis-receiver/` | 계약 검사 |
| pg | 8.23.0 | api | PostgreSQL 드라이버 |
| @anthropic-ai/sdk | 0.133.0 | api | 받은 사람 쪽 AI(요약·질의응답 등, 이 스캔 범위 밖) |
| (Voyage 임베딩) | — | api `published-index/voyage-embedding-provider.ts` | 검색 조각 임베딩(파일 이름만 확인) |
| `node:crypto` | Node 내장 | api `materials/text-material-input.ts` | 텍스트 자료 커서의 회원별 범위 해시(SHA-256) |

**없는 것**: OpenAI SDK나 OpenAI 호출 코드는 어느 서비스에도 없다. Catch 개편의 판정 공급자(OpenAI Decisions API)는 새 외부 의존이 된다. U4 작성자 설명·텍스트 자료는 새 라이브러리를 들이지 않았다.

## 저장소와 인프라

| 이름 | 쓰는 곳 | 비고 |
|---|---|---|
| PostgreSQL(pgvector 이미지) | api | 분석 요청·시도·동의·수신 기록·Catch(작성자 설명 칸 포함)·근거·텍스트 자료·발행·조각. 시각은 `clock_timestamp()` |
| Redis | api·worker | BullMQ 큐. 요청 작업 자료가 여기 남는다(완료·실패 보관 포함). 작성자 설명·텍스트 자료는 Redis를 거치지 않는다 |
| AWS(개발 서버 EC2, 12월 EKS) | 배포 | 팀 문서 기준. 이 스캔은 배포 파일을 읽지 않았다 |
| GitHub API | worker | REST·GraphQL(연결 PR 묶음 조회) |
| Anthropic Claude API | worker·api | worker는 분석 생성, api는 받은 사람 쪽 |

## 개발·검사 도구

| 도구 | 판본 | 쓰는 곳 |
|---|---|---|
| uv | — | worker 의존 관리(`uv sync --locked`) |
| pytest·pytest-cov | 9.1.1·7.1.0 | worker 시험·커버리지 |
| ruff | 0.16.8 | worker 린트·포맷 |
| mypy | 2.3.1(strict) | worker 형식 검사 |
| eslint | — | api(`--max-warnings=0`)·web |
| `node --test` | Node 내장 | api(`scripts/test-with-db.cjs`, 실제 테스트 DB)·web(`test/*.test.mjs`) |
| GitHub Actions | — | `.github/workflows/ci.yml`(changes·docs-size·web·api·worker·deps-audit) |

## 비밀값

- worker LIVE 처리에 `CATCHU_GENERATION_API_KEY`(Claude), `WORKER_CONTEXT_API_URL`·`WORKER_CONTEXT_API_KEY`가 필요하다(worker/.env.example, `consumer/settings.py`). SDK 환경변수(`ANTHROPIC_API_KEY` 등)는 쓰지 않고 설정 객체로 넘긴다.
- OpenAI 판정 키 자리는 없다. 팀 문서상 OpenAI 키는 SSM·EKS에 두고(팀장 인프라), 키가 있을 때만 AI 쪽을 켠다.
- 작성자 설명·텍스트 자료는 새 비밀값을 요구하지 않는다.
