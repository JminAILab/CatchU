# 기술 스택 — CatchU

> 기준: 2026-11-09 전체 다시 스캔, 커밋 `a1d0fbb4`. 판본은 `api/package.json`, `web/package.json`, `worker/pyproject.toml`, `api/README.md` 표, `worker/README.md` 표, `deploy/README.md`에서 옮겼다. 잠금 파일 내용은 열지 않았다. 의존 방향과 외부 서비스 쪽 조건은 `dependencies.md`에 있다.

## 언어와 실행 환경

| 대상 | 판본 | 고정 위치 |
|---|---|---|
| Node.js / npm (api·web) | 24.21.0 / 11.19.0 | `engines`, `web/.node-version`, `web/.npmrc`(`engine-strict=true`) |
| TypeScript | 5.9.3(api), `^5`(web) | `package.json` |
| Python (worker) | 3.12.10 | `worker/.python-version`, `requires-python` |
| uv | 0.12.18 | `worker/README.md` |
| PostgreSQL | 16 + pgvector 0.8.7(`pgvector/pgvector:0.8.7-pg16-trixie`, digest 고정) | `api/README.md`, `deploy/README.md` |
| 큐 서버 | Valkey 8.1.6(`valkey/valkey:8.1.6-alpine`) | `api/README.md`, CI |
| 이미지 기반 | `node:24.21.0-trixie-slim`(web·api), `debian:trixie-slim` + uv가 설치한 CPython 3.12.10(worker) | `deploy/README.md`, Dockerfile |

## api (`@catchu/api`, CommonJS 빌드)

| 라이브러리 | 판본 | 쓰임 |
|---|---|---|
| `@nestjs/common`·`core`·`platform-express` | 12.0.4 | 웹 틀 |
| `@nestjs/typeorm` / `typeorm` / `pg` | 12.0.1 / 1.1.1 / 8.23.0 | DB·마이그레이션 |
| `bullmq` / `ioredis` | 6.3.11 / 6.0.0 | 분석 큐·`ai-run` 큐·질문 횟수 |
| `@anthropic-ai/sdk` | 0.133.0 | Claude 인용 호출(`claude-haiku-5-5`, `claude-sonnet-5-5` 상수) |
| `@modelcontextprotocol/sdk` | 1.32.2 | Claude 연결(MCP 서버·OAuth) |
| `jose` | 6.2.12 | Access JWT |
| `ajv` / `ajv-formats` / `yaml` | 8.20.0 / 3.0.1 / 2.9.1 | 메시지 계약 검사 |
| `zod` | 4.6.7 | MCP 도구 입력 모양 |
| `class-validator` / `class-transformer` | 0.15.1 / 0.5.1 | 입력 검증 파이프 |
| `reflect-metadata` / `rxjs` | 0.2.2 / 7.8.2 | Nest 실행 |
| 개발: `eslint` / `@eslint/js` / `typescript-eslint` / `globals` | 10.11.0 / 10.0.1 / 8.70.1 / 16.5.0 | 린트 |
| 개발: `ts-node`, `@types/*` | 10.9.2 등 | 개발 실행·타입 |
| `overrides` | `multer` 2.5.0(취약점), typeorm의 `ioredis`를 6으로 | `api/package.json` 59~66행 |

## web (`catchu-web`)

| 라이브러리 | 판본 | 쓰임 |
|---|---|---|
| `next` | 16.4.1 | 앱 틀(운영 이미지는 standalone 출력) |
| `react` / `react-dom` | 19.2.8 | 화면 |
| 개발: `eslint` `^9`, `eslint-config-next` 16.4.1, `typescript` `^5`, `@types/*` | — | 린트·타입 |

web은 런타임 의존이 셋뿐이다. 상태 관리·요청 라이브러리 없이 `src/lib`의 자체 함수를 쓴다. 스타일은 CSS Modules와 `globals.css` 변수, 글꼴은 Pretendard(`web/public/landing/`).

## worker (`catchu-worker`)

| 라이브러리 | 판본 | 쓰임 |
|---|---|---|
| `fastapi` / `uvicorn` | 0.141.1 / 0.53.0 | `GET /health` |
| `bullmq` / `redis` | 3.3.0 / 7.4.1 | 큐 소비자 |
| `anthropic` | 1.13.0 | 생성(`claude-haiku-5-5` 기본, `claude-sonnet-5-5`)·판정(Claude) |
| `openai` | 3.46.0 | 판정 공급자(Decisions, `gpt-6-luna`) |
| `httpx2` / `httpcore2` | 2.13.0 | GitHub·api 호출, SDK 전송 |
| `jsonschema` / `referencing` / `pyyaml` | 4.26.0 / 0.37.0 / 6.0.3 | 메시지 계약 검사 |
| `rfc3339-validator` / `rfc3986-validator` | 0.1.4 / 0.1.1 | 형식 검사 |
| 개발: `mypy` / `pytest` / `pytest-cov` / `ruff` | 2.3.1 / 9.1.1 / 7.1.0 / 0.16.8 | 타입·시험·커버리지·린트 |

## 외부 서비스

| 서비스 | 쓰는 곳 | 설정 이름 |
|---|---|---|
| Google OAuth | `api.google-login` | `GOOGLE_LOGIN_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| GitHub OAuth App / REST / GraphQL | `api.github-connection`, `worker.collection` | `GITHUB_CONNECTION_ENABLED`, `GITHUB_OAUTH_*`, `GITHUB_CREDENTIAL_*` |
| Anthropic Claude | `api.ai-generation`·`api.rag-answer`, `worker.generation`·`worker.judgement` | `CATCHU_GENERATION_API_KEY`, `CATCHU_JUDGEMENT_API_KEY`·`CATCHU_JUDGEMENT_PROVIDER` |
| OpenAI | `worker.judgement` | `CATCHU_JUDGEMENT_PROVIDER`, `CATCHU_JUDGEMENT_API_KEY` |
| Voyage AI(`voyage-4-lite`) | `api.published-index` | `CATCHU_EMBEDDING_API_KEY`(운영 필수, 개발·시험은 합성 제공자) |

api 환경변수 전체 표의 정본은 `api/docs/environment.md`이고, worker는 `worker/docs/queue-consumer.md` 「설정」, web은 `web/README.md` 「환경변수」(`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_DEV_LOGIN_ENABLED`, `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION`)다.

## 배포·운영 도구

| 도구 | 쓰임 |
|---|---|
| Docker / Docker Compose | 운영 이미지, 한 호스트 실행(`deploy/compose.single.yaml`) |
| Caddy | 개발 서버 앞단 TLS(`deploy/dev-server/Caddyfile`) |
| AWS(EC2·ECR·SSM·Route 53) | 개발 서버와 CD(`deploy/dev-server/cd/`) |
| AWS(EKS 1.37·RDS·EFS·WAF·CloudWatch·SNS) + eksctl·Fluent Bit | 12월 최종 환경 설정(`deploy/aws/`, 아직 자원 없음) |
| GitHub Actions | CI·이미지 검사·개발 서버 배포. 외부 action은 커밋 SHA로 고정 |
| Dependabot | 주 1회 action 갱신 PR |
