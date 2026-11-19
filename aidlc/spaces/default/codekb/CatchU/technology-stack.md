# 기술 스택 — CatchU

> 기준: 2026-11-09 전체 다시 스캔(커밋 `a1d0fbb4`). 판본은 `api/package.json`, `web/package.json`, `worker/pyproject.toml`, `api/README.md` 표, `worker/README.md` 표, `deploy/README.md`에서 옮겼다. 잠금 파일 내용은 열지 않았다. 2026-11-16 집중 스캔(커밋 `eb0d5a6c`)과 2026-11-19 집중 스캔(커밋 `aa241a4c`)은 판본 파일을 다시 열지 않았고, 코드 상수로 고정한 모델·주소·값만 「받은 사람 AI가 고정한 값」(11-16)과 「발행·화면 쪽이 고정한 값」(11-19) 절에 더했다. 의존 방향과 외부 서비스 쪽 조건은 `dependencies.md`에 있다.

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
| `@nestjs/typeorm` / `typeorm` / `pg` | 12.0.1 / 1.1.1 / 8.23.0 | DB·마이그레이션(손으로 고친 마이그레이션, 앱 기동 때 돌리지 않음) |
| `bullmq` / `ioredis` | 6.3.11 / 6.0.0 | 분석 큐·`ai-run` 큐·질문 횟수 |
| `@anthropic-ai/sdk` | 0.133.0 | Claude 인용 호출·스트림, 질문 다시 쓰기 |
| `@modelcontextprotocol/sdk` | 1.32.2 | Claude 연결(MCP 서버·OAuth, 도구 셋) |
| `jose` | 6.2.12 | Access JWT |
| `ajv` / `ajv-formats` / `yaml` | 8.20.0 / 3.0.1 / 2.9.1 | 메시지 계약 검사 |
| `zod` | 4.6.7 | MCP 도구 입력 모양 |
| `class-validator` / `class-transformer` | 0.15.1 / 0.5.1 | 입력 검증 파이프 |
| `reflect-metadata` / `rxjs` | 0.2.2 / 7.8.2 | Nest 실행 |
| 개발: `eslint` / `@eslint/js` / `typescript-eslint` / `globals` | 10.11.0 / 10.0.1 / 8.70.1 / 16.5.0 | 린트 |
| 개발: `ts-node`, `@types/*` | 10.9.2 등 | 개발 실행·타입 |
| `overrides` | `multer` 2.5.0(취약점), typeorm의 `ioredis`를 6으로 | `api/package.json` 59~66행 |

Voyage는 SDK 없이 `fetch` 한 번으로 부른다(`voyage-embedding-provider.ts`, 11-16 확인). PDF 업로드는 multer(`api/src/materials/multer.d.ts` 타입 선언)로 받는다(11-19 목록 확인).

## web (`catchu-web`)

| 라이브러리 | 판본 | 쓰임 |
|---|---|---|
| `next` | 16.4.1 | 앱 틀(운영 이미지는 standalone 출력) |
| `react` / `react-dom` | 19.2.8 | 화면 |
| 개발: `eslint` `^9`, `eslint-config-next` 16.4.1, `typescript` `^5`, `@types/*` | — | 린트·타입 |

web은 런타임 의존이 셋뿐이다. 상태 관리·요청 라이브러리 없이 `src/lib`의 자체 함수(`view-store.ts`의 `createViewStore` + `useSyncExternalStore`)를 쓴다. 질의응답 SSE도 라이브러리 없이 자체 해석기(`features/rag-answer/sse-reader.ts`)로 읽는다. **탭·드래그 라이브러리도 없다.** 탭은 자료 화면의 자체 부품(`features/materials/materials-view.tsx` `MaterialsTabs`)이고 순서는 단추로만 바꾼다(11-19 확인). 스타일은 CSS Modules와 `globals.css` 변수, 글꼴은 Pretendard(`web/public/landing/`).

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

## 받은 사람 AI가 고정한 값 (11-16 확인)

| 대상 | 값 | 자리 |
|---|---|---|
| Claude 모델 | `HAIKU` = `claude-haiku-5-5`, `SONNET` = `claude-sonnet-5-5`(질의응답만 허용) | `api/src/ai-generation/claude-citation-client.ts` 14~17행, `gate-policy.ts` |
| 질의응답·다시 쓰기 모델 | `QNA_MODEL = 'HAIKU'`(바꾸려면 코드 PR) | `api/src/rag-answer/rag-answer-config.ts` 42행(11-19 행 번호) |
| Claude 호출 | 주소 `https://api.anthropic.com` 고정, 처리 위치 `us`, 재시도 0, 생각 끔(Haiku `disabled`, Sonnet `between_tools`), 출력 4,000토큰, 45초, 응답 본문 256 KiB | `claude-citation-client.ts`, `ai-generation.gate.ts` 17~18행, `guarded-fetch.ts` |
| Claude 인용 | 인용 문서 `source.type: content`(줄마다 글 블록), `citations.enabled`, 응답 인용 `content_block_location` | `citation-request.ts`, `claude-citation-client.ts` 242~256행 |
| 임베딩 | Voyage `voyage-4-lite`, 1024차원, 문서 30초·질문 10초, 128개씩, 응답 8 MiB | `api/src/published-index/embedding-config.ts` |
| 조각 | 1,000자(UTF-16) 이하, pgvector 정확 비교(근사 색인 없음) | `embedding-config.ts` 25행, `published-chunk.entity.ts` |
| 질의응답 근거(11-19) | 검색 8, 붙이는 줄 Catch마다 12·전체 40, 머리글 둘째 줄 200자, 표 글자 「가」~「버」 20개 | `rag-answer-config.ts` 12~19행, `qna-sources.ts` 22~23행 |
| 질문 수(11-19) | 링크당 하루 100, 작성자당 하루 합계 300(#585), Redis 명령 1초 | `rag-answer-config.ts` 21~36행 |

## 발행·화면 쪽이 고정한 값 (11-19 확인)

| 대상 | 값 | 자리 |
|---|---|---|
| 발행 요청 | 제목 1~50, 비밀번호 8~64(코드 포인트), 항목 1~20 | `api/src/publications/publications-config.ts` 34~36행, web `publications-api.ts` 14행(같은 값을 따로 가짐) |
| 발행본 전체 글 | 60,000 코드 포인트(PDF 쪽 글 포함) | `publications-config.ts` 31행(`SNAPSHOT_TEXT_TOTAL_MAX`), 주석이 가리키는 같은 값: `pdf-extraction-spec.ts` `PDF_TEXT_TOTAL_MAX`, worker `app/pdf_extraction/settings.py` `TEXT_LIMIT`, web `PUBLISH_LIMITS.totalText` |
| 발행 빈도 | 회원당 1분 10회(임시값) | `publications-config.ts` 22행 |
| 링크 수명 | 발행 시각 + 2,160시간(90일), DB CHECK | `publication.entity.ts` 9·22행 |
| 발행본 목록 | 기본 20, 최대 100 | `publications-config.ts` 39행 |
| Catch 목록 | 기본 20, 최대 100, cursor 판본 3 | `api/src/catches/owner-catch-input.ts` 33·87~92행 |
| PDF 자료 | 회원당 20벌, 업로드 10분 5건·진행 중 전체 8건·회원당 2건(#574) | `pdf-materials.controller.ts` 30행 주석, 커밋 `03ccfa94`(값 파일은 이번에 열지 않음) |
| 제목 없는 Catch 이름 | 「제목 없는 Catch」 | api `publications-config.ts` 42행, web `publish-sources.ts` 7행 |

## 외부 서비스

| 서비스 | 쓰는 곳 | 설정 이름 |
|---|---|---|
| Google OAuth | `api.google-login` | `GOOGLE_LOGIN_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| GitHub OAuth App / REST / GraphQL | `api.github-connection`, `worker.collection` | `GITHUB_CONNECTION_ENABLED`, `GITHUB_OAUTH_*`, `GITHUB_CREDENTIAL_*` |
| Anthropic Claude | `api.ai-generation`·`api.rag-answer`·`api.jd-summary`, `worker.generation`·`worker.judgement` | `CATCHU_GENERATION_API_KEY`(api, 없어도 기동하고 부를 때 `NOT_CONFIGURED`), `CATCHU_JUDGEMENT_API_KEY`·`CATCHU_JUDGEMENT_PROVIDER` |
| OpenAI | `worker.judgement` | `CATCHU_JUDGEMENT_PROVIDER`, `CATCHU_JUDGEMENT_API_KEY` |
| Voyage AI(`voyage-4-lite`) | `api.published-index` | `CATCHU_EMBEDDING_API_KEY`(운영 필수, 개발·시험은 합성 제공자. SDK 기본 `VOYAGE_API_KEY`는 읽지 않음) |
| AWS S3(파일 저장 `s3` 드라이버) | `api.file-storage` | 이번에 열지 않음(`api/docs/environment.md`가 정본) |

api 환경변수 전체 표의 정본은 `api/docs/environment.md`이고, worker는 `worker/docs/queue-consumer.md` 「설정」, web은 `web/README.md` 「환경변수」(`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_DEV_LOGIN_ENABLED`, `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION`)다.

## 배포·운영 도구

| 도구 | 쓰임 |
|---|---|
| Docker / Docker Compose | 운영 이미지, 한 호스트 실행(`deploy/compose.single.yaml`) |
| Caddy | 개발 서버 앞단 TLS(`deploy/dev-server/Caddyfile`) |
| AWS(EC2·ECR·SSM·Route 53) | 개발 서버와 CD(`deploy/dev-server/cd/`) |
| AWS(EKS 1.37·RDS·EFS·WAF·CloudWatch·SNS) + eksctl·Fluent Bit | 12월 최종 환경 설정(`deploy/aws/`, 11-09 기록. 그 뒤 노드 이미지·metrics-server 판본을 올린 커밋 `a67dc278`이 있다) |
| GitHub Actions | CI·이미지 검사·개발 서버 배포. 외부 action은 커밋 SHA로 고정 |
| Dependabot | 주 1회 action 갱신 PR |
