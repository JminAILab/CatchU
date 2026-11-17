# 코드 구조 — CatchU

> 기준: 2026-11-09 전체 다시 스캔(커밋 `a1d0fbb4`) 위에 2026-11-16 집중 스캔(커밋 `eb0d5a6c`)을 합쳤다. 11-16에 다시 읽은 곳은 「받은 사람 AI 쪽 배치」 절과 파일 종류 표에 「11-16」을 붙인 줄이다. 나머지는 11-09 글 그대로다. 폴더마다 맡은 일은 `component-inventory.md`, 의존 방향은 `dependencies.md`에 적었다. 여기서는 배치 규칙과 파일 종류, 되풀이되는 코드 모양을 적는다.

## 최상위 배치

| 경로 | 무엇 | 비고 |
|---|---|---|
| `web/` | Next.js 앱(배포 단위) | `src/app`(주소), `src/features`(기능), `src/components`(공통 부품), `src/lib`(호출·응답 해석·주소), `test/`, `scripts/` |
| `api/` | NestJS 서버(배포 단위) | `src/<기능>/`(Nest 모듈 하나), `src/database/migrations/`, `contracts/`, `docs/`, `test/`, `scripts/` |
| `worker/` | Python 처리기(배포 단위) | `app/<단계>/`, `tests/`, `docs/`, `fixtures/m1-synthetic/` |
| `deploy/` | 이미지·한 호스트 실행·개발 서버 CD·EKS 설정 | `aws/`(EKS·RDS·WAF 스크립트), `dev-server/`(Caddy·CD), `env/`(값 이름 예시) |
| `.github/` | CI·이미지·개발 서버 배포 워크플로, 이슈·PR 양식, Dependabot | AI-DLC 것은 없다 |
| `docs/` | 팀 문서 정본(작업관리·코딩 절차·보안 점검·결정 기록), AI-DLC 입력 스냅샷 | `docs/queue-verification/`은 큐 검증 키트(코드) |
| `scripts/` | AI-DLC 2.8.1 호환 도우미 둘 | 제품 코드 아님 |

최상위 폴더는 배포 단위와 1:1이다(루트 `README.md`). 세 서비스 사이에는 코드 import가 없고, 공유하는 것은 계약 YAML과 합성 결과 세트뿐이다.

## api (`api/src/`)

- **폴더 하나 = Nest 모듈 하나**. 모듈 파일 `*.module.ts`, HTTP는 `*.controller.ts`, 업무는 `*.service.ts` 또는 `*-store.ts`, 입력 검사는 `*-input.ts`, 응답 모양은 `*-response.ts`, 표는 `*.entity.ts`, 설정 읽기는 `*.config.ts`/`*-config.ts`, 로그 사건은 `*-log.ts`.
- **앱 조립**: `app.module.ts`(기본 앱: 인증·DB·Catch·발행·검색·질의응답·MCP 등)와 `application.module.ts`(제품 진입점에서만 붙이는 것: worker 내부 조회, 분석 큐). `main.ts`는 포트·주소 검사 → 조립 → `configureApp`(`app.setup.ts`: 보안 헤더·CORS·프록시·`/v1` 접두사·끝 오류 응답) → `listen` → 처리 시한 주기 시작 → 큐 시작.
- **DB**: TypeORM 엔티티와 손으로 고친 마이그레이션(`src/database/migrations/`). 앱 기동은 스키마를 바꾸지 않는다(`synchronize` 꺼짐). 이름은 `snake-naming.strategy.ts`가 바꾼다. 제약 이름은 `pk_`·`uq_`·`ck_`·`fk_`·`ix_` 접두사.
- **질의**: 조회·잠금이 중요한 곳은 `manager.query`로 SQL을 직접 쓴다(`owner-catch-store.ts`, `publish.service.ts`, `db-publication-access.ts`, `published-search.ts`, `base-summary-store.ts`). 값은 늘 매개변수(`$1`)로 넘기고, 조립하는 SQL 조각은 코드 상수뿐이다.
- **시험**: `api/test/**/*.test.cjs`가 빌드한 `dist/`를 불러 시험한다. DB 시험은 `test/support/test-database.cjs`의 `openTestDataSource`·`resetTestDatabase`를 쓴다. 실행기 `scripts/test-with-db.cjs`가 두 줄(두 DB)로 나눠 돈다.

### 받은 사람 AI 쪽 배치 (11-16 확인)

| 모듈 | 단계 | 파일 |
|---|---|---|
| `published-index` | 조각 나누기(순수 함수) | `chunker.ts` `buildChunkDrafts`·`splitFieldRanges` |
| | 발행 트랜잭션 안 쓰기·다시 준비 | `published-index-writer.ts`(C-08) |
| | 임베딩 처리기 | `embed-publication-handler.ts`, 제공자 `embedding-provider.ts`(판정)·`voyage-embedding-provider.ts`·`synthetic-embedding-provider.ts`, 경계 `embedding-types.ts` |
| | 상태·검색 | `published-search.ts`(C-09 `getIndexState`·`search`) |
| | 표·값·로그 | `published-chunk.entity.ts`, `publication-index.entity.ts`, `embedding-config.ts`, `published-index-log.ts` |
| `ai-generation` | 입구 검사·공통 지시 | `gate-policy.ts`(`AI_INPUT_MAX_CHARS` 80,000, `COMMON_GUARD_INSTRUCTION`) |
| | 요청 만들기 | `citation-lines.ts`(줄 나누기), `citation-request.ts`(인용 문서·대응표·시스템 지시) |
| | 호출 | `claude-citation-client.ts`(SDK, 한 번·스트림), `guarded-fetch.ts` |
| | 응답 읽기 | `response-items.ts`(줄 → 항목), `citation-locator.ts`(블록 범위 → 사본 위치), `quote-citations.ts`(따옴표 인용, #528) |
| | 대조 | `fact-check.ts`(낱말 대조), `jd-checks.ts`(JD 역할·찾지 못함 안내) |
| | 게이트 | `checked-gate.ts`(U2, 앱이 쓰는 것), `ai-generation.gate.ts`(U1 최소 경로·공용 만들기 함수), `ai-generation.module.ts`, `ai-generation.types.ts` |
| `rag-answer` | 질의응답 | `qna.controller.ts`(SSE·확인 넷), `qna-service.ts`(다시 쓰기 → 검색 → 생성), `question-input.ts`, `question-rewriter.ts`, `question-counter.ts`, `korean-date.ts` |
| | 기본 요약 | `summary-sources.ts`(사본 칸 → 근거), `base-summary-handler.ts`, `base-summary-store.ts`, `base-summary.entity.ts`, `summary.controller.ts` |
| | 공통 | `rag-answer-config.ts`(값·지시문), `rag-answer-log.ts`, `link-access-errors.ts`, `rag-answer-tokens.ts`, `rag-answer.module.ts` |

- 각 단계는 순수 함수와 외부 호출을 나눈다. 조각 나누기·줄 나누기·위치 계산·대조·사본 → 근거는 DB와 네트워크가 없는 순수 함수이고, 외부 호출은 `voyage-embedding-provider.ts`·`claude-citation-client.ts`·`question-rewriter.ts`에만 있다.
- 설정 값은 `embedding-config.ts`·`rag-answer-config.ts`·`gate-policy.ts`·`ai-generation.gate.ts`(출력 4,000토큰·45초) 네 곳에 있다. 지시문은 `rag-answer-config.ts`(질의응답·기본 요약·다시 쓰기), `citation-request.ts`(항목 형식), `gate-policy.ts`(공통 방어), `jd-checks.ts`·`api/src/jd-summary/jd-generation-request.ts`(JD)에 나뉜다.

### 파일 종류 분류(api)

| 분류 | 예 |
|---|---|
| Model/Entity | `catches/entities/*.entity.ts`, `publications/publication.entity.ts`, `member-analysis/member-analysis.entity.ts`(표 일곱 개), `published-index/published-chunk.entity.ts`·`publication-index.entity.ts`(11-16), `rag-answer/base-summary.entity.ts`(11-16), `ai-generation/ai-generation.types.ts`(C-01 모양, 11-16) |
| Controller | `*/**.controller.ts`. 이번 범위는 `rag-answer/qna.controller.ts`·`summary.controller.ts`(11-16) |
| Service/UseCase | `publish.service.ts`, `publication-manage.service.ts`, `recipient-access.service.ts`, `result-application.service.ts`, `analysis-intake.service.ts`, `withdrawal.service.ts`, `rag-answer/qna-service.ts`·`base-summary-handler.ts`, `published-index/embed-publication-handler.ts`, `ai-generation/checked-gate.ts`(11-16) |
| Repository/DAO | `owner-catch-store.ts`, `author-description-store.ts`, `text-material-store.ts`, `db-publication-access.ts`, `catch-reader.ts`, `run-status-store.ts`, `rag-answer/base-summary-store.ts`, `published-index/published-index-writer.ts`·`published-search.ts`(11-16) |
| Utility/Helper | `snapshot-builder.ts`, `share-links/link-token.ts`·`link-password.ts`·`link-grant.ts`, `published-index/chunker.ts`, `rag-answer/summary-sources.ts`·`korean-date.ts`, `ai-generation/citation-lines.ts`·`citation-request.ts`·`citation-locator.ts`·`response-items.ts`·`quote-citations.ts`·`fact-check.ts`·`jd-checks.ts`(11-16) |
| Configuration | `*.config.ts`, `publications-config.ts`, `mcp-config.ts`, `queue-spec.ts`, `ai-run-spec.ts`, `rag-answer/rag-answer-config.ts`, `published-index/embedding-config.ts`, `ai-generation/gate-policy.ts`(11-16) |
| Middleware | `auth/access-token.guard.ts`, `common/errors/api-exception.filter.ts`, `common/errors/validation.pipe.ts`, `common/http/no-store.interceptor.ts`, `common/http/security-headers.ts`, `cors.ts`, `trust-proxy.ts`, `ai-generation/guarded-fetch.ts`(11-16) |
| Migration | `database/migrations/*.ts` |
| Test | `api/test/**` |

## worker (`worker/app/`)

- **단계별 패키지**: `collection`(수집) → `candidates`(작업 단위·후보 문장) → `generation`(생성) + `judgement`(판정) → `processing`(요청 검사·조립·결과) → `consumer`(큐). `contract`는 계약 검사, `request_context`는 api 내부 조회, `redact.py`는 비밀값 가리기.
- **자료형**: 거의 모든 값이 `@dataclass(frozen=True)`이고 `__post_init__`에서 모양을 검사한다(`collection/records.py`, `processing/generation.py`). 상태는 `Literal`과 `StrEnum`.
- **순수 계산과 외부 호출 분리**: 후보 판정·생성 재료 고르기는 GitHub를 부르지 않는 순수 함수다(`grouping.py`, `record_text.py`). 외부 호출은 `collection/gateway.py`·`transport.py`(GitHub), `generation/claude.py`, `judgement/openai_judge.py`·`claude.py`에만 있다.
- **모듈 설명**: 파일 첫 docstring이 규칙·결정 번호·단계를 길게 적는다. 규칙을 고칠 때 이 설명과 `worker/docs/*.md`를 함께 고친다.
- **시험**: `worker/tests/`(pytest). 합성 GitHub(`github_synthetic.py`), 실제 git 합성 저장소(`git_synthetic.py`, git이 없으면 건너뜀), 합성 제공자(`generation_scenarios.py`), 선언형 사례(`candidate_scenarios.py`).

### 파일 종류 분류(worker)

| 분류 | 예 |
|---|---|
| Model/Entity | `collection/records.py`, `processing/generation.py`, `judgement/provider.py`, `candidates/identity.py`의 단위 자료형 |
| Controller/Handler | `consumer/parent.py`, `consumer/child.py`, `main.py`(`/health`) |
| Service/UseCase | `processing/live.py`, `processing/pipeline.py`, `generation/flow.py`, `generation/judged.py`, `candidates/build.py` |
| Repository/DAO | 없음(DB 없음). 외부 읽기는 `collection/gateway.py`, `request_context/client.py` |
| Utility/Helper | `generation/patch.py`, `generation/title.py`, `generation/groups.py`, `candidates/record_text.py`, `redact.py` |
| Configuration | `consumer/settings.py`, `request_context/settings.py`, `collection/limits.py`, `generation/limits.py` |
| Test | `worker/tests/**`, `worker/fixtures/m1-synthetic/` |

## web (`web/src/`)

- **주소**: `app/(guest)`(비로그인), `app/(member)`(회원 가드), `app/s/[token]`(면접관). 괄호 폴더는 주소에 나오지 않는다. 주소 상수는 `lib/routes.ts`와 README 「페이지 주소」 표를 함께 고친다. `app/preview/`는 개발용 미리보기다.
- **기능 폴더**: `features/<기능>/`에 `*-api.ts`(호출과 응답 검사), `*-store.ts`(상태), `*-screen.tsx`(상태·동작 조립), `*-view.tsx`(그리기만), `*.module.css`, `README.md`. 예: `features/publications/publish-screen.tsx` + `publish-view.tsx`.
- **`features/rag-answer/`(11-16 확인)**: `rag-answer-api.ts`(요약 GET·다시 만들기 POST·질문 SSE와 응답 모양 검사), `sse-reader.ts`(SSE 해석, 순수), `rag-answer-state.ts`(상태 → 안내·버튼, 순수), `rag-answer-messages.ts`(문구 표), `base-summary-panel.tsx`·`qna-panel.tsx`(패널), `gated-item-view.tsx`(항목 표시, 두 패널 공용), `rag-answer.module.css`. 패널은 다른 기능 화면이 단다: 받은 사람 `features/recipient/recipient-view.tsx` `RecipientSlots`(자리 2·3), 작성자 `features/publications/publication-detail-view.tsx`(요약만). 근거 강조는 다는 화면의 `showEvidence`가 맡는다.
- **응답 검사**: 화면은 api 응답을 믿지 않고 `isCatch`·`isPublishedSnapshot`·`parseGatedItem` 같은 검사 함수로 모양을 확인한 뒤에만 쓴다. 손상된 200은 「조회 실패」로 바꾼다(`features/assets/catch-api.ts` 21~35행).
- **화면 출력**: 사용자 글과 AI 글은 React 텍스트로만 그린다. GitHub 주소만 링크로 바꾼다(`lib/github-source-url.ts`, `snapshot-view.tsx` `LinkedText`). `data-testid`를 거의 모든 동작 요소에 단다.
- **시험**: `web/test/*.test.mjs`(Node `node:test`). `.ts`·`.tsx`를 바로 불러 시험하고, `assets-view.tsx`는 시험이 직접 변환해 부른다(README 「검사」). `features/rag-answer`의 `.tsx` 패널은 시험이 불러오지 않는다(그 폴더 README 「시험」, 11-16 확인).

## 되풀이되는 모양

- **오류는 삼키지 않는다**: 무결성 오류는 전용 예외(`CatchReadIntegrityError`, `PublishIntegrityError`, `ChunkSourceError`)로 던지고 공통 필터가 500으로 끝낸다. 0건이나 성공으로 바꾸지 않는다. 외부 호출 실패는 원문 메시지 없이 고정 이름으로 바꾼다(`EmbeddingProviderError`, `AiProviderError`, `QuestionRewriteFailed`, 11-16 확인).
- **비동기 작업은 결과 종류로 끝낸다(11-16 확인)**: 백그라운드 처리기는 제공자 실패를 `FAILED`로 쓰고 정상 반환하며, DB 오류만 로그 뒤 다시 던진다. 결과 쓰기는 잠금 → 시각 읽기 → 조건부 UPDATE이고 바뀐 행이 0이면 늦은 결과로 버린다(`embed-publication-handler.ts`, `base-summary-handler.ts`). 질의응답은 예외 대신 `QnaRunResult`(단계·결과·오류 코드)로 돌려준다.
- **로그는 표의 칸만(11-16 확인)**: 사건마다 정해진 칸만 가진 타입이라 질문·답·근거 글·키가 들어갈 자리가 없다(`published-index-log.ts`, `rag-answer-log.ts`, `checked-gate.ts` `GateLog`).
- **남의 것과 없는 것은 같은 404**: 조회 조건에 소유자를 넣고, UUID 형식이 아닌 ID도 같은 404다(`owner-catch-store.ts`, `author-description-store.ts`, `publication-manage.service.ts`, `rag-answer/link-access-errors.ts`).
- **회원 행 `FOR KEY SHARE`**: 회원 자료를 읽고 쓰는 트랜잭션은 먼저 회원 행을 잡아 탈퇴의 연쇄 삭제와 겹치지 않게 한다.
- **cursor는 위치일 뿐**: base64url JSON에 판본·범위 해시·마지막 ID를 담고, 조회 조건은 매번 인증 회원으로 다시 건다(`owner-catch-input.ts` 26~33행, `publish-input.ts` 132~158행).
- **입력 검사**: 정의하지 않은 칸은 거부하고, 길이는 유니코드 코드 포인트로 센다(질문·조각 위치는 UTF-16 단위). 오류 응답에 입력값을 싣지 않는다(`author-description-input.ts`, `publish-input.ts`, `question-input.ts`).
- **값은 한 파일에**: 상한·임시값은 `*-config.ts`·`*-spec.ts`·`limits.py` 한곳에 두고 「임시값」이라고 적는다(`publications-config.ts` 18~28행).
