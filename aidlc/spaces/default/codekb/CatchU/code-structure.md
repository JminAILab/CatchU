# 코드 구조 — CatchU

> 기준: 2026-11-09 전체 다시 스캔, 커밋 `a1d0fbb4`. 폴더마다 맡은 일은 `component-inventory.md`, 의존 방향은 `dependencies.md`에 적었다. 여기서는 배치 규칙과 파일 종류, 되풀이되는 코드 모양을 적는다.

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
- **DB**: TypeORM 엔티티와 손으로 고친 마이그레이션(`src/database/migrations/` 25개). 앱 기동은 스키마를 바꾸지 않는다(`synchronize` 꺼짐). 이름은 `snake-naming.strategy.ts`가 바꾼다. 제약 이름은 `pk_`·`uq_`·`ck_`·`fk_`·`ix_` 접두사.
- **질의**: 조회·잠금이 중요한 곳은 `manager.query`로 SQL을 직접 쓴다(`owner-catch-store.ts`, `publish.service.ts`, `db-publication-access.ts`). 값은 늘 매개변수(`$1`)로 넘기고, 조립하는 SQL 조각은 코드 상수뿐이다(`owner-catch-store.ts` 121행 주석).
- **시험**: `api/test/**/*.test.cjs`가 빌드한 `dist/`를 불러 시험한다. DB 시험은 `test/support/test-database.cjs`의 `openTestDataSource`·`resetTestDatabase`를 쓴다. 실행기 `scripts/test-with-db.cjs`가 두 줄(두 DB)로 나눠 돈다.

### 파일 종류 분류(api)

| 분류 | 예 |
|---|---|
| Model/Entity | `catches/entities/*.entity.ts`, `publications/publication.entity.ts`, `member-analysis/member-analysis.entity.ts`(표 일곱 개), `published-index/*.entity.ts` |
| Controller | `*/**.controller.ts` 20개 |
| Service/UseCase | `publish.service.ts`, `publication-manage.service.ts`, `recipient-access.service.ts`, `result-application.service.ts`, `analysis-intake.service.ts`, `qna-service.ts`, `base-summary-handler.ts`, `withdrawal.service.ts` |
| Repository/DAO | `owner-catch-store.ts`, `author-description-store.ts`, `text-material-store.ts`, `db-publication-access.ts`, `catch-reader.ts`, `base-summary-store.ts`, `run-status-store.ts` |
| Utility/Helper | `snapshot-builder.ts`, `chunker.ts`, `summary-sources.ts`, `korean-date.ts`, `share-links/link-token.ts`·`link-password.ts`·`link-grant.ts` |
| Configuration | `*.config.ts`, `publications-config.ts`, `rag-answer-config.ts`, `embedding-config.ts`, `mcp-config.ts`, `queue-spec.ts`, `ai-run-spec.ts` |
| Middleware | `auth/access-token.guard.ts`, `common/errors/api-exception.filter.ts`, `common/errors/validation.pipe.ts`, `common/http/no-store.interceptor.ts`, `common/http/security-headers.ts`, `cors.ts`, `trust-proxy.ts` |
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
- **응답 검사**: 화면은 api 응답을 믿지 않고 `isCatch`·`isPublishedSnapshot` 같은 검사 함수로 모양을 확인한 뒤에만 쓴다. 손상된 200은 「조회 실패」로 바꾼다(`features/assets/catch-api.ts` 21~35행).
- **화면 출력**: 사용자 글은 React 텍스트로만 그린다. GitHub 주소만 링크로 바꾼다(`lib/github-source-url.ts`, `snapshot-view.tsx` `LinkedText`). `data-testid`를 거의 모든 동작 요소에 단다.
- **시험**: `web/test/*.test.mjs`(Node `node:test`). `.ts`·`.tsx`를 바로 불러 시험하고, `assets-view.tsx`는 시험이 직접 변환해 부른다(README 「검사」).

## 되풀이되는 모양

- **오류는 삼키지 않는다**: 무결성 오류는 전용 예외(`CatchReadIntegrityError`, `PublishIntegrityError`, `ChunkSourceError`)로 던지고 공통 필터가 500으로 끝낸다. 0건이나 성공으로 바꾸지 않는다(각 파일 주석).
- **남의 것과 없는 것은 같은 404**: 조회 조건에 소유자를 넣고, UUID 형식이 아닌 ID도 같은 404다(`owner-catch-store.ts`, `author-description-store.ts`, `publication-manage.service.ts`).
- **회원 행 `FOR KEY SHARE`**: 회원 자료를 읽고 쓰는 트랜잭션은 먼저 회원 행을 잡아 탈퇴의 연쇄 삭제와 겹치지 않게 한다.
- **cursor는 위치일 뿐**: base64url JSON에 판본·범위 해시·마지막 ID를 담고, 조회 조건은 매번 인증 회원으로 다시 건다(`owner-catch-input.ts` 26~33행, `publish-input.ts` 132~158행).
- **입력 검사**: 정의하지 않은 칸은 거부하고, 길이는 유니코드 코드 포인트로 센다. 오류 응답에 입력값을 싣지 않는다(`author-description-input.ts`, `publish-input.ts`).
- **값은 한 파일에**: 상한·임시값은 `*-config.ts`·`*-spec.ts`·`limits.py` 한곳에 두고 「임시값」이라고 적는다(`publications-config.ts` 18~28행).
