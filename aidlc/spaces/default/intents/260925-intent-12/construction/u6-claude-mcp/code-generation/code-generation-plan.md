# U6 Claude MCP 본인 연결 — 코드 생성 계획

## Summary

- Builds: Claude 웹·Desktop 본인 연결. api `claude-mcp`(OAuth 저장 단계, `/v1/mcp`, 조회 도구 둘, 회원 빈도 제한, 연결 상태·승인·전체 해제)와 web `/profile/claude`·`/profile/claude/authorize`
- Touches: `api/src/claude-mcp/`(새 폴더), 새 마이그레이션 1개, `api/src/app.module.ts`, `api/src/common/errors/error-codes.ts`, `api/package.json`·잠금 파일, `api/test/claude-mcp/`(새 폴더), 기존 시험 3개, `api/docs/` 3개, `api/README.md`, `api/CONVENTIONS.md`, `api/.env.example`, `web/src/features/claude-connection/`(새 폴더), `web/src/app/(member)/profile/claude/`(새 폴더), `web/src/lib/routes.ts`, `web/src/features/profile/profile-detail.tsx`, `web/src/features/start-guide/member-start-steps.ts`, `web/README.md`, web 시험 3개. Unit과 따로 내는 C-15 PR은 `contract-summary.md` 한 파일이다
- Tests: `node:test` 시험 파일 12개, 약 80개(순수 함수 약 20개, 테스트 DB·실제 HTTP 통합 약 45개, Redis 시험 약 5개, web 화면 약 12개). 합성 시험으로 보고하며 실제 Claude 확인(S22~S24)은 이 단계에서 돌리지 않는다

## Sources

작성일: 2026-11-01, 수정 2026-11-02. 입력: [기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W1~W7·S1~S24·「다른 Unit에 넘기는 것」, [업무 규칙](../functional-design/rules.md)(rules) BR1~BR8, [엔티티](../functional-design/entities.md)(entities), [기술 선택](../nfr-requirements/tech-stack-decisions.md), 비기능 설계의 [보안](../nfr-design/security-design.md)(security-design)·[성능](../nfr-design/performance-design.md)(performance-design)·[규모](../nfr-design/scalability-design.md)·[신뢰성](../nfr-design/reliability-design.md)·[관측](../nfr-design/observability-design.md)·[논리 구성 요소](../nfr-design/logical-components.md)와 [질문·답변](../nfr-design/nfr-design-questions.md), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-06·C-13·C-14·C-15, [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U6, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR13·NFR1, [스토리](../../../inception/user-stories/stories.md)의 US13.1·US13.2, [납품 계획](../../../inception/delivery-planning/bolt-plan.md)의 B5. 규약: [api 규약](../../../../../../../../api/CONVENTIONS.md), [api README](../../../../../../../../api/README.md), [web README](../../../../../../../../web/README.md), [코딩 절차](../../../../../../../../docs/CatchU_coding_procedures.md), [보안 점검](../../../../../../../../docs/CatchU_security_checks.md). 현재 코드: 통합 브랜치 `intent/260925-intent-12`(8ab5917)의 `api/tsconfig.json`, `api/package-lock.json`, `api/test/u2/withdrawal.test.cjs`, `api/test/integration/result-application-b.test.cjs`, `api/test/db/member-cascade-delete.test.cjs`, `web/test/u2-start-guide.test.mjs`, `web/src/components/auth/member-guard.tsx`. 작업 기록(2026-11-01 원격에서 읽음): [#440](https://github.com/JminAILab/CatchU/issues/440) 본문과 Project 칸, [#389 댓글](https://github.com/JminAILab/CatchU/issues/389#issuecomment-6544236461), [#276](https://github.com/JminAILab/CatchU/issues/276) 본문, 통합 브랜치 대상 PR [#421](https://github.com/JminAILab/CatchU/pull/421)·[#423](https://github.com/JminAILab/CatchU/pull/423). 2026-11-02 원격에서 읽음: 통합 브랜치 최신 5152e7e와 8ab5917의 차이, [#442](https://github.com/JminAILab/CatchU/pull/442)(U5), [#444](https://github.com/JminAILab/CatchU/pull/444)(단계 승인마다 커밋), `api/src/rag-answer/question-counter.ts`. 규칙: [레포 컨벤션 §2.1](../../../../../../../../docs/CatchU_레포_컨벤션.md#21-ai-dlc-intent-브랜치-예외), 계약 요약 「Contract ownership rules」, [U2 코드 생성 계획](../../u2-shared-foundation/code-generation/code-generation-plan.md) Step 1. 외부: SDK 1.32.2의 `dist/esm/server/auth/**/*.d.ts`.

## 구현 범위와 스토리 대응

| 스토리 | U6이 맡는 부분 | 계획 단계 |
|---|---|---|
| US13.1 연결·해제 | OAuth 주소와 저장 단계(AC13.1.1), 만료 뒤 재승인(AC13.1.2), 전체 해제(AC13.1.3), 회원 빈도·응답 크기(AC13.1.4) | Step 4·5·6·8·9·11 |
| US13.2 본인 자료 읽기 | 첫 연결 동의(AC13.2.1), 조회 도구 둘(AC13.2.2), 쓰기·요약·검색 도구 없음(AC13.2.3), 다른 회원 자료 격리(AC13.2.4) | Step 7·9·11 |
| 둘 다 | 설정, 모듈 등록, 시험, 문서, 추적 | Step 1·2·3·10·12·13·14·15 |

C-15의 도구 이름·입력은 계약 그대로 둔다. 계약에 더하는 오류·칸과 Catch `title`의 자료형은 Unit PR보다 먼저 따로 내는 C-15 PR로 합의해 고친다(Step 1).

## 현재 코드에서 정한 것 (설계 뒤 확인한 사실)

- **SDK 타입이 지금 api 설정으로 컴파일되는지는 아직 확인하지 못했다.** 임시 앱은 JS 연결만 확인했다. `api/tsconfig.json`에 `skipLibCheck`가 없고 `api/node_modules/@types`에 `express`가 없는데, SDK의 타입 파일(`server/auth/router.d.ts`, `middleware/bearerAuth.d.ts`, `provider.d.ts` 등)은 `express`를 불러온다. 그래서 `npm run typecheck`·`npm run build`가 실패할 가능성이 높다. Step 1에서 먼저 돌려 본다. 실패하면 **`@types/express`를 정확한 판본으로 `devDependencies`에 더한다.** `skipLibCheck`를 켜면 api 전체의 라이브러리 타입 검사가 꺼지고 `Response` 타입이 조용히 `any`가 되므로 공용 설정은 고치지 않는다. 더 늘어나는 것은 개발 의존성뿐이고 운영 동작은 그대로다. 이것은 기술 선택 표(SDK·zod)에 없던 항목이라 계획 승인 때 함께 확인받는다. 이 방법으로 풀리지 않으면 코드를 더 쓰지 않고 멈추고 묻는다.
- **U6 표가 들어오면 U2 탈퇴 시험이 바로 깨진다.** `api/test/u2/withdrawal.test.cjs`는 표가 없을 때 시험용 표를 만들고 `INSERT INTO mcp_* VALUES ($1, $2)`로 자료를 넣는다. 실제 표는 칸이 더 많아 이 줄이 실패하고 CI가 빨개진다. 파일 머리말 3~4줄은 "U6를 합친 뒤 실제 표로 이 시험을 다시 돌리는 것이 U2 완료 조건이다"라고 적고 있다. 그래서 자료 넣는 줄과 낡는 주석만 U6 PR에서 실제 표 모양으로 고친다. 표가 없을 때의 시험과 시험용 표 코드는 표가 있으면 스스로 건너뛰므로 고치지 않는다(S19).
- **표 전체를 보는 기존 시험 둘도 함께 고친다.** `api/test/integration/result-application-b.test.cjs`(마이그레이션 목록·표 개수·되돌리기 순서, U3·U5와 같은 방식), `web/test/u2-start-guide.test.mjs`(시작 안내 링크 허용 목록에 `/profile/claude`). `api/test/db/member-cascade-delete.test.cjs`는 C-06대로 고친다.
- **U2 파일을 고친 내용은 PR 본문에 적어 팀장 확인을 받는다.** U2 담당이 팀장이다. U6 PR 본문에 `withdrawal.test.cjs`, `u2-start-guide.test.mjs`와 그 링크의 원본인 `member-start-steps.ts`의 고친 줄과 이유를 적는다. 탈퇴 시험의 이유는 위 머리말의 U2 완료 조건이고, 시작 안내의 이유는 `member-start-steps.ts` 머리말의 "그 Unit이 전용 화면을 더하면 그 주소로 바꾼다"이다. 실제 표로 돈 탈퇴 시험 결과와, 「U6 표가 아직 없으면」 시험이 건너뜀으로 남는다는 사실도 함께 적는다.
- **이 Unit의 이슈는 [#440](https://github.com/JminAILab/CatchU/issues/440)이다.** 새로 만들지 않는다. 라벨 `release-december`, 담당 `yeongyeon1802`, Project `CatchU · 10월 MVP`, Status `진행 중`, 우선순위 `P1`을 원격에서 읽어 확인했고 채울 칸이 없다. 기능 영역은 작업관리 「착수」대로 비워 둔다. 합친 팀장이 닫는다.
- **C-15 수정은 팀장과 합의해 Unit PR보다 먼저 합친다.** 레포 컨벤션 §2.1 「경계·계약 PR」은 계약 문서 수정을 Unit 제출과 따로 내라고 정한다. 바뀌는 것의 분류는 계약 요약 「Contract ownership rules」와 코딩 절차 「코딩 운영」을 따른다.
  - 깨는 변경: Catch `title: string|null`. 지금 C-15의 `title`에는 null 표시가 없어(옆의 `authorDescription: string|null`과 다르다) 자료형을 바꾸는 변경이다. 실제 칸 `catch_asset.title`은 이미 NULL을 허용하므로 표는 바뀌지 않는다.
  - 합의 대상: 새 오류 `INVALID_CURSOR`·`INTERNAL_ERROR`. 규칙의 "오류를 바꾸거나 지우는"에 딱 들지 않아 분류가 애매하다.
  - 더하는 변경: `bodyOmitted`·`omitted`(새 선택 필드).
  - 합의 상대는 팀장이다. C-15의 소비자는 외부인 Claude라 가져다 쓰는 Unit이 없다. 오류 둘을 더할 `common-errors`는 U9 도구 `read_shared_publication`도 함께 쓰는 자리이고 U9 담당은 11/13에 정하므로(납품 계획 B10), U9에도 적용된다는 점을 함께 묻는다.
  - C-15 PR이 합의돼 통합 브랜치에 합쳐지기 전에는 U6 Unit PR을 올리지 않는다. 로컬 코드 생성은 계속한다. 규칙의 "멈추고"는 합의 전에 공유 브랜치에 넣지 않는 것으로 읽었고, 그때까지 코드는 이 폴더 밖으로 나가지 않는다. U2 계획의 「기다리지 않음」은 U2가 더하는 변경이었기 때문이라 여기에 쓰지 않는다. 합의 결과가 달라지면 고칠 곳은 `mcp-page.ts`·`mcp-tools.ts`와 그 시험뿐이다. 응답 크기·빈도 값은 계약 밖이라 S22 결과로 이 PR을 다시 고칠 일은 없다.
- **단계 승인마다 커밋한다(레포 컨벤션 §2.1 「커밋」 행).** 이 폴더의 8ab5917 뒤에 통합 브랜치로 들어온 규칙이다(#444). 기능 설계·비기능 요구사항·비기능 설계는 승인됐지만 아직 커밋하지 않았으므로 Step 1 맨 앞에서 단계마다 따로 커밋한다. 메시지는 `docs:`와 담당이 질문 답·승인 때 적은 이유이고, 없으면 지어내지 않고 정한 것만 쓴다. 코드 생성과 Build and Test는 승인을 기록한 뒤 다음 단계에 들어가기 전에 커밋한다. 커밋은 이 폴더에만 남고, 푸시는 Unit 제출 때 담당 확인 뒤에 한다.
- **통합 브랜치가 5152e7e로 움직였다(2026-11-02 원격 비교, 20커밋).** U5(#442)가 합쳐져 마이그레이션 `1793348947970-CreateBaseSummaryTable`이 들어왔고 `result-application-b.test.cjs`의 표 개수가 26이 됐다. U7(#433)이 열려 있어 더 늘 수 있으므로 U6은 가져온 뒤의 최신 개수에 4를 더한다(지금이면 30). `error-codes.ts`, `member-cascade-delete.test.cjs`, `api/docs/member-withdrawal-deletion.md`, `api/README.md`, `api/CONVENTIONS.md`는 U5 줄 뒤에 더하면 된다. U2 탈퇴 시험, 시작 안내 시험, `api/package-lock.json`, `.claude/`, `aidlc-state.md`, 계약 문서는 바뀌지 않았다.
- **마이그레이션은 개발 DB가 아니라 작업 전용 컨테이너에서 만든다.** 규약 순서의 개발 DB 자리에 `DB_*` 셸 환경변수로 작업 전용 테스트 DB를 넣는다. `catchu-db`와 그 볼륨은 건드리지 않는다.
- **로그인 복귀는 그대로 된다.** 회원 경로 가드가 경로와 쿼리를 `next`로 넘기고 `/profile`이 허용 목록에 있어(`member-guard.tsx`, `member-navigation.ts`) `routes` 외의 고칠 곳이 없다. 2,048자를 넘는 주소는 복귀하지 못하고 `/home`으로 간다. 실제 Claude의 `state` 길이는 S22에서 함께 본다.
- **SDK IP 제한이 시험에도 걸린다.** 등록은 시간당 20회라서(BR2.5) 시험은 등록 자체를 보는 경우에만 `/register`를 부르고 나머지는 시험 자료로 `mcp_client` 행을 넣는다.
- **Docker는 켜져 있다(2026-11-02 확인, 서버 29.5.2).** Step 2의 시험 DB·Redis에 쓴다.

## 파일 배치

`api/src/claude-mcp/`(logical-components):

| 파일 | 내용 |
|---|---|
| `mcp-config.ts` | `readMcpConfig(env)`, 공개 주소 판정, Claude 콜백 상수, 돌아갈 주소 목록, 토큰 수명 |
| `mcp-limits.ts` | `MCP_PAGE_ROWS`, `MCP_PAGE_CHARS`, `MCP_PAGE_RESERVE`, 분당 60회, 코드 5분 |
| `mcp-log.ts` | 사건 8종의 칸만 가진 타입과 남기는 함수(observability-design 표) |
| `mcp-client.entity.ts`, `mcp-connection.entity.ts`, `mcp-authorization-code.entity.ts`, `mcp-access-token.entity.ts` | 표 넷(entities) |
| `mcp-oauth.provider.ts` | `McpOAuthProvider`(SDK `OAuthServerProvider`). `revokeToken` 없음 |
| `mcp.controller.ts` | `McpController`(`/v1/mcp`) |
| `mcp-tools.ts` | `McpTools.forMember(memberId)` |
| `mcp-material-reader.ts` | `McpMaterialReader` |
| `mcp-page.ts` | `buildPage`, `cursor` 만들기·확인(순수 함수) |
| `mcp-rate-limiter.ts` | `McpRateLimiter` |
| `mcp-connection.service.ts`, `mcp-connection.controller.ts`, `mcp-authorization.dto.ts` | 상태·승인·전체 해제 |
| `claude-mcp.module.ts` | `ClaudeMcpModule` |

`web/src/features/claude-connection/`: `claude-connection.ts`(요청·결과 판정, 순수), `claude-authorize-view.tsx`·`claude-authorize-screen.tsx`(승인 화면), `claude-connection-view.tsx`·`claude-connection-panel.tsx`(연결 관리), `claude-connection.module.css`, `README.md`. 주소는 `web/src/app/(member)/profile/claude/page.tsx`, `.../authorize/page.tsx`.

## 단계

### Step 1: 착수 확인과 구조·설정 뼈대 (US13.1·US13.2, BR1.2~BR1.4, NFR1.9, 기술 선택)

- [x] 승인된 세 단계를 커밋한다(레포 컨벤션 §2.1 「최신화」는 커밋한 뒤 가져오라고 정한다). `functional-design/`, `nfr-requirements/`, `nfr-design/`를 단계마다 따로 커밋하고 감사 기록 두 파일은 마지막 커밋에 넣는다. `code-generation/`과 `aidlc-state.md`는 넣지 않는다. 푸시하지 않는다.
- [x] `git pull --no-rebase --no-edit origin intent/260925-intent-12`로 통합 브랜치 최신을 받는다(레포 컨벤션 §2.1). 멈추면 원인을 알린다. 새 마이그레이션이 들어왔으면 그 뒤 시각으로 만든다.
- [x] C-15 수정 PR을 준비한다(코드 아님). #421과 같이 `contract-summary.md` 한 파일만 담는다.
  - 브랜치: Unit 폴더를 건드리지 않도록 임시 폴더에서 `origin/intent/260925-intent-12`로부터 새로 딴다: `git worktree add --no-track -b docs/u6-contract-c15 C:/labs/CatchU-u6-c15 origin/intent/260925-intent-12`. Unit 폴더의 설계 산출물·감사 기록·`aidlc-state.md`와 단계 커밋은 넣지 않는다.
  - 내용: C-15의 `common-errors`에 `INVALID_CURSOR`·`INTERNAL_ERROR`, 도구 출력에 `bodyOmitted`·`omitted`, Catch `title: string|null`뿐이다. 401 주석과 해제 문구는 고치지 않는다.
  - 커밋: `docs:` 접두사와 바꾼 이유 한 줄.
  - PR: 대상은 `intent/260925-intent-12`이고 `.github/pull_request_template.md` 항목을 채운다. 결과물은 커밋 고정 링크로 적고 이슈는 `Refs #440`이다. 「리뷰 요청」에 깨는 변경(`title`)이 들어 있다는 것, 새 오류도 합의 대상이고 U9 도구에도 적용된다는 것, `bodyOmitted`·`omitted`는 더하는 변경이라는 것, C-15에 가져다 쓰는 Unit이 없어 팀장에게 합의를 요청한다는 것을 분명히 적는다. Reviewers에 `ljm0850`을 지정하고 지정 결과를 확인한다. merge commit은 팀장이 한다.
- [x] 푸시 전에 담당 확인을 받는다. 실행할 푸시 명령, 바뀐 파일 목록, 커밋 메시지, PR 대상 브랜치와 본문을 보여 주고, 확인을 받기 전에는 푸시하지 않는다. 푸시는 임시 폴더에서 `git push origin HEAD:docs/u6-contract-c15`로 한다. Unit 폴더의 로컬 브랜치 이름이 통합 브랜치와 같으므로 브랜치를 적지 않은 `git push`는 하지 않는다(레포 컨벤션 §2.1). 올린 뒤 임시 폴더는 `git worktree remove C:/labs/CatchU-u6-c15`로 지운다.
- [x] 합의를 기다리는 동안 로컬 코드 생성은 계속한다. 리뷰에서 이름이나 분류가 바뀌면 `mcp-page.ts`·`mcp-tools.ts`와 그 시험만 고친다.
- [x] 의존성: `npm --prefix api install --save-exact @modelcontextprotocol/sdk@1.32.2 zod@4.6.7`. 잠금 파일에 `node_modules/express`가 5.2.1 한 벌인지 보고, `bash .github/scripts/check-deps-audit.sh api`를 돌려 결과를 적는다(`gh`·`jq`가 없으면 같은 스크립트가 쓰는 `npm audit --package-lock-only --include=dev`로 보고 그 사실을 적는다).
- [x] 타입 확인: 위 「현재 코드에서 정한 것」의 첫 항목. SDK를 불러오는 파일을 둔 상태로 `npm --prefix api run typecheck`와 `npm --prefix api run build`를 돌린다. `express` 타입 오류면 `@types/express`를 더한다. 도구 등록의 타입 깊이 오류는 그 줄의 타입 명시로 풀고, 공용 설정·설계를 바꿔야 하면 멈추고 묻는다. 정한 판본을 code-summary에 적는다.
- [x] `mcp-config.ts`, `mcp-limits.ts`, `mcp-log.ts`를 만든다. 공개 주소 판정은 functional-spec 「공개 주소 판정」 표 그대로이고, `AUTH_WEB_ORIGIN`은 기존 `readSessionConfig`로 읽는다. `MCP_DEV_REDIRECT_URIS`는 쉼표로 구분한다. 개발 판정은 `isDevelopmentOrTest`다. 오류 메시지에는 설정 이름만 넣는다.
- [x] `error-codes.ts`에 `MCP_CONSENT_REQUIRED`(409), `MCP_AUTHORIZATION_INVALID`(400)와 문구를 더하고 `api/CONVENTIONS.md` 오류 표에 같이 적는다. 둘은 U6 안 API의 코드다(코딩 운영 「자기 Unit 안에서만 쓰는 API 세부」).

### Step 2: 시험 실행기 확인 (팀 Testing Posture, plan_profile 실행기 단계)

- [x] 작업 전용 컨테이너를 만든다: `catchu-u6-db-test`(pgvector, `127.0.0.1:55436`, `--tmpfs`), `catchu-u6-redis-test`(`valkey/valkey:8.1.6-alpine`, `127.0.0.1:56379`). 포트가 차 있으면 다른 포트를 쓰고 `unit-test-instructions.md`를 고친다. 명령은 그 문서에 있다.
- [x] 기존 실행기가 도는지 본다: `test/db/member-cascade-delete.test.cjs` 한 파일, web은 `test/u2-start-guide.test.mjs` 한 파일. 정확한 명령은 `unit-test-instructions.md`에 있다.

### Step 3: 시나리오 먼저 (팀 Testing Posture)

- [x] 시나리오 정본은 이미 승인된 functional-spec S1~S24다. 시험 파일별 나눔과 기대 결과·실패 조건은 `unit-test-instructions.md` 「시나리오 표」에 구현 전에 확정해 두었다. 이 표를 바꿔야 하면 코드에 맞추지 않고 이유를 code-summary에 적는다.
- [x] S5에는 담당 결정대로 포트만 다른 loopback 주소 경우를 넣었다. `/authorize`는 통과해 승인 화면까지 가고, 승인 요청이 400 `MCP_AUTHORIZATION_INVALID`로 거부해 코드가 그 주소로 나가지 않는다(security-design 「돌아갈 주소의 "정확히 일치"」).

### Step 4: 저장 — 엔티티와 마이그레이션 (US13.1·US13.2, entities, BR7.4, C-06, NFR4.7, NFR5.1)

- [x] 표 넷을 entities 그대로 만든다. `mcp_client.mcp_client_id`는 `text`다(entities의 string. 없는 `client_id`가 형식 오류 500이 되지 않는다). `redirect_uris`는 `text[]`, 시각은 `timestamptz`, 외래 키는 모두 `deleteWithParent`(`mcp_access_token`은 복합 외래 키 `(member_id, mcp_client_id)` → `mcp_connection`). `unique(member_id, mcp_client_id)`는 연결·토큰에 건다. 새 색인은 `mcp_authorization_code.member_id` 하나뿐이다.
- [x] 표 이름과 `member_id` 칸이 `withdrawal.service.ts`가 부르는 이름과 같은지 코드로 대조한다.
- [x] 작업 전용 DB에 `migration:run` 뒤 `migration:generate -- src/database/migrations/CreateMcpTables`로 만든다. 생성 SQL에 다른 표 변경·의도하지 않은 `DROP`이 없는지 읽고, `migration:run`·`migration:revert`·다시 `migration:run`으로 `down`까지 확인한다.

### Step 5: 업무 로직 — OAuth 저장 단계 (US13.1, BR2·BR3.1·BR4, NFR1.1·NFR1.4·NFR1.5·NFR4.4·NFR4.6·NFR4.10·NFR4.12)

- [x] `clientsStore.getClient`, `registerClient`: 비밀값 제거와 `none`, 돌아갈 주소가 1개 이상이고 모두 허용 목록과 정확히 일치(아니면 `CustomOAuthError('invalid_redirect_uri')`), 이름 200자(`InvalidClientMetadataError`), 함께 미승인 7일 정리(BR2.1~BR2.4).
- [x] `authorize`: `resource` 확인(BR4.6) 뒤 `{AUTH_WEB_ORIGIN}/profile/claude/authorize`로 302, 쿼리는 `client_id`, `redirect_uri`, `state`, `code_challenge`, `resource`(BR3.1).
- [x] `challengeForAuthorizationCode`, `exchangeAuthorizationCode`: reliability-design 「트랜잭션 경계」 순서 그대로. 거부는 트랜잭션 안에서 `InvalidGrantError`로 되돌리고 `mcp_token_exchange_refused`는 되돌린 뒤 남긴다. 응답은 `access_token`, `token_type`, `expires_in`뿐이다(BR4.3~BR4.6).
- [x] `exchangeRefreshToken`은 언제나 `InvalidGrantError`다. `verifyAccessToken`은 security-design 「토큰 확인 함수」 그대로다(같은 고정 문구, 앱 시계, 내리지 않은 `expiresAt`, DB 실패는 `mcp_token_check_failed` 뒤 다시 던짐).
- [x] 저장 단계 감싸기 하나로 `mcp_oauth_failed`(`register`·`client`·`token`)를 남기고 `OAuthError`는 그대로 던진다.

### Step 6: API — `/v1/mcp` 처리기 (US13.1, BR4.8·BR5.6, NFR1.1·NFR1.2·NFR1.6·NFR1.10)

- [x] `McpController`: security-design 「`/v1/mcp` 요청이 지나는 순서」 그대로. `@Public()`은 세 메서드에만 붙인다. POST는 `Origin` → `requireBearerAuth`(`resourceMetadataUrl`만 넘김) → 요청마다 새 서버·전송 객체(`sessionIdGenerator: undefined`, `enableJsonResponse: true`)이고, GET·DELETE는 `Origin` 뒤 405와 `Allow: POST`다.

### Step 7: 업무 로직 — 조회 도구 (US13.2, BR5·BR6.5, NFR1.3·NFR2.1·NFR2.2·NFR4.2·NFR4.3·NFR5.2)

- [x] `mcp-page.ts`: performance-design 「쪽 만들기」·「`cursor`」 그대로. `LIMIT 50`이고 `limit+1`은 쓰지 않는다. 글을 뺀 항목 모양은 BR6.5다.
- [x] `McpMaterialReader`: performance-design 「조회」의 칸을 적은 SQL 셋. 첫 조건은 언제나 회원이고 값은 매개변수로만 넘긴다. `draft_content`와 PDF 표는 SQL에 없다.
- [x] `McpTools.forMember`: 도구 둘을 `title`, `annotations.readOnlyHint: true`, 설명 문장, `z.strictObject({ cursor })`(고정 오류 문구)로 등록한다. 감싸기 하나가 빈도 → `cursor` → 조회 → 쪽 만들기 순서와 오류 변환을 맡는다. 결과는 글 하나의 `JSON.stringify(page)`이고 `structuredContent`·`outputSchema`는 없다.

### Step 8: 외부 저장소 — 빈도 제한 (US13.1 AC13.1.4, BR6.1~BR6.4, NFR4.3·NFR4.8·NFR4.11)

- [x] `McpRateLimiter`: `readAnalysisQueueConfig()`로 주소를 읽는다. 없으면 연결 없이 `mcp_rate_limit_off`를 한 번 남기고 언제나 통과한다. 있으면 전용 연결(`enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `commandTimeout: 1000`)과 `EVAL` 한 번(`INCR`, 값이 1이면 만료 120초). 오류·1초 초과는 `mcp_rate_limit_error` 뒤 통과한다. 연결 오류는 첫 오류만 남기고(`AiRun.watch`와 같은 짧은 함수를 U6에 둠) `onApplicationShutdown`에서 닫는다. 같은 모양이 U5 `question-counter.ts`에도 들어와 U6이 세 번째다. Unit 밖 코드는 고치지 않고(코딩 절차 「코딩 전 범위와 기존 변경 확인」) Unit PR 본문에 적어 합칠지를 팀장 판단에 맡긴다.

### Step 9: API — 연결 상태·승인·전체 해제 (US13.1·US13.2, BR3.2~BR3.7·BR7.1·BR7.2·BR7.3, NFR1.7·NFR4.12)

- [x] `McpConnectionService`: 상태 계산(BR7.1), 승인 트랜잭션(BR3.7), 전체 해제 트랜잭션(코드 → 토큰 → 연결, BR7.2). 승인 요청은 클라이언트·돌아갈 주소(포트까지 정확히)·`resource`를 다시 확인하고 동의를 판단한다(BR3.2, BR3.3).
- [x] `McpConnectionController`: `GET`·`DELETE /v1/me/mcp-connection`, `POST …/authorizations`(200 `{ redirectTo }`). 쓰기 둘은 첫 줄에서 `assertSessionOrigin`을 부른다. 본문은 DTO와 전역 검증 파이프다. 회원은 `@CurrentMemberId()`에서만 나온다. `redirectTo`는 `URL`로 만들어 `code`·`state`나 `error`를 쿼리에 붙인다.

### Step 10: 모듈 등록 (US13.1, BR1.1, NFR1.5)

- [x] `ClaudeMcpModule`: 위 구성 요소를 묶고 `onModuleInit`에서 `HttpAdapterHost`로 `mcpAuthRouter({ provider, issuerUrl, resourceServerUrl })`를 앱 루트에 건다. `api/src/app.module.ts`에 등록 한 줄과 U 주석을 더한다. `app.setup.ts`는 고치지 않는다.

### Step 11: 화면 — web (US13.1·US13.2, BR3.2~BR3.6·BR7.1·BR7.2·BR7.5, NFR1.8, S21)

- [x] 코드를 쓰기 전에 설치된 Next.js 문서(`web/node_modules/next/dist/docs/`)에서 두 주소의 페이지 파일 규칙을 확인한다(web README 「작업 규칙」).
- [x] `routes.ts`에 `profileClaude`, `profileClaudeAuthorize`를 더하고 web README 「페이지 주소」·「파일 역할」 표를 함께 고친다. 담당 칸은 U6이다.
- [x] 승인 화면: 쿼리는 `window.location.search`로 읽는다. `GET /me/mcp-connection`으로 상태를 읽어 `NONE`이면 동의 안내를, 그 밖이면 재승인 안내를 호스트와 함께 보인다. 두 화면 모두 「직접 시작한 연결이 아니면 취소하세요」를 보인다. `clientName`은 쓰지 않는다. 승인·취소는 `api.member`로 POST하고, 응답의 `redirectTo`가 http(s) 주소일 때만 `window.location.assign`으로 이동한다. 요청 중에는 버튼을 막고, `MCP_CONSENT_REQUIRED`면 동의 안내를 다시 보이고, 그 밖의 실패는 오류를 보이고 이동하지 않는다. 자동으로 다시 보내지 않는다.
- [x] 연결 관리 화면: 상태, `mcpUrl` 복사(복사 실패도 표시), 확인 뒤 전체 해제. 조회 실패는 빈 상태로 바꾸지 않고 기존 `LookupFailedState`를 쓴다. 요청 중을 성공으로 보이지 않는다.
- [x] 판정은 `.ts`에, 표시는 상태 없는 `*-view.tsx`에 둔다(`features/withdrawal`과 같은 나눔). 누를 수 있는 요소마다 `data-testid`를 붙이고, 서버 값은 React 텍스트로만 그린다.
- [x] `profile-detail.tsx`에 `/profile/claude` 링크를, `member-start-steps.ts`의 `publish-claude`에 같은 주소를 넣고 그 파일 머리말의 U6 부분을 고친다(BR7.5).

### Step 12: 시험 — 구현 뒤 세부 시험 (팀 Testing Posture, S1~S21, 보안 점검 거부 사례)

Step 4~11을 구현한 뒤 쓴다. 시험 자료는 모두 공개 가능한 합성 글이다. 파일별 시나리오는 `unit-test-instructions.md`에 있다.

- [x] `api/test/claude-mcp/support.cjs`(시험 파일 아님): 앱 띄우기, 합성 Claude(`@modelcontextprotocol/sdk`의 `client/auth.js`와 `Client`로 찾기·등록·승인 시작·토큰 교환·도구 호출), 합성 회원 A·B 자료, 비밀값 찾기 도우미.
- [x] `mcp-config`, `mcp-page`, `mcp-rate-limit`, `mcp-oauth-register`, `mcp-oauth-token`, `mcp-endpoint`, `mcp-tools`, `mcp-connection`, `mcp-withdrawal`, `mcp-logs`의 `.test.cjs` 10개(`api/test/claude-mcp/`). 실제 AppModule과 테스트 DB를 쓰고 DB 실패·Redis 멈춤만 logical-components 「시험에서 바꿔 끼우는 자리」대로 바꿔 끼운다.
- [x] `web/test/u6-claude-authorize.test.mjs`, `web/test/u6-claude-connection.test.mjs`(`u2-render.mjs`로 화면을 그린다).
- [x] 두 회원 거부 시험을 포함한다: B 토큰과 A `cursor`(S12), B 회원의 해제가 A에 영향 없음(S17), 정의하지 않은 입력 거부(S6·S12).

### Step 13: 기존 시험 맞추기와 회귀 (C-06, S19)

- [x] `api/test/db/member-cascade-delete.test.cjs`: `MEMBER_ROWS`에 세 표를, `memberWithAllData`에 `mcp_client`와 세 표의 실제 모양 행을 더한다.
- [x] `api/test/u2/withdrawal.test.cjs`: 자료 넣는 줄과 머리말 주석을 실제 표 모양으로 고친다(위 「현재 코드에서 정한 것」). 고친 줄은 code-summary에 적어 PR 본문에 옮긴다.
- [x] `api/test/integration/result-application-b.test.cjs`: 마이그레이션 목록 끝에 `CreateMcpTables…`, 표 개수는 가져온 뒤의 최신 값에 4를 더하고(지금이면 26→30), 되돌리기 맨 앞에 U6 되돌리기(넷이 사라지고 나머지는 그대로)를 더한다.
- [x] `web/test/u2-start-guide.test.mjs`: 허용 링크에 `routes.profileClaude`를 더한다.
- [x] U6 범위 시험을 돌리고 줄 커버리지를 공용 명령으로 잰다. `dist/claude-mcp/**`와 `src/features/claude-connection/**` 모두 80% 이상이어야 한다. 시험이 불러오지 않은 파일은 0%로 따로 센다. 못 미치면 기준을 낮추지 않고 빠진 경로의 시험을 더한다.
- [x] `npm --prefix api run lint`, `npm --prefix api run typecheck`, `web`의 `npm run check`를 통과시킨다.
- [x] api 전체 시험 `npm --prefix api test`를 돌린다. `AppModule`에 U6이 들어가 기동 로그(`mcp_rate_limit_off`)나 표 목록을 보는 다른 시험이 깨지지 않았는지 보는 단계다. 실패하면 U6 때문인지 먼저 가리고, 결과는 통과·실패·실행하지 못함으로 적는다.

### Step 14: 설정·문서 (BR1.4, C-06, NFR6.1, 코딩 절차 「코딩 운영」)

- [x] `api/.env.example`, `api/docs/environment.md`에 새 선택 설정 셋을 더한다. 값은 비워 둔다.
- [x] `api/docs/member-withdrawal-deletion.md`에 `mcp_connection`(회원, 클라이언트 등록), `mcp_authorization_code`(회원, 클라이언트 등록), `mcp_access_token`(회원, 연결) 행과 마이그레이션 이름을 더한다.
- [x] `api/docs/claude-mcp.md`(새 기능 문서): 주소, 앞단이 api로 보내야 할 경로, 설정, 로그 사건, 시험 방법, 받아들인 한계. `api/README.md`에서 잇고 `api/CONVENTIONS.md` 「파일 역할」에 `src/claude-mcp/` 행을 더한다.
- [x] `web/src/features/claude-connection/README.md`(기능 안내)를 쓰고 web README에서 잇는다.
- [x] 배포 설정·CI는 고치지 않는다(team.md Deployment). 새 배포 단위·Dockerfile·IaC 변경은 없다.

### Step 15: 정리·추적

- [x] `code-summary.md`: 만든·고친 파일, 주요 결정, 정한 `@types/express` 판본과 타입 확인 결과, 커버리지, 거부 사례와 결과, 실행하지 않은 시험과 이유(S22~S24는 미실행), 계획과 다른 점.
- [x] `source-manifest.json`: 이 Unit이 만든·고친 모든 경로.
- [x] `traceability.json`: AC13.1.1~AC13.2.4, BR1.1~BR8.1, NFR1.1~NFR1.10·NFR2.1·NFR2.2·NFR4.1~NFR4.13·NFR5.1~NFR5.3·NFR6.1~NFR6.5를 구현·시험 파일에 잇는다.
- [x] 이 단계 끝에 `docker rm -f -v catchu-u6-db-test`, `docker rm -f -v catchu-u6-redis-test`를 하나씩 돌리고 지운 이름을 보고에 남긴다. Build and Test는 같은 이름으로 다시 만든다.

## 이 단계 밖의 일

- **S22~S24 실제 Claude 확인:** 담당이 실제 Claude로 한다. S22의 첫 연결이 팀 규칙의 '최소 연결 첫 결과'이고, 결과는 `docs/CatchU_통합확인.md`에 통과·실패·미실행으로 남긴다. S1~S21 통과를 실제 연결 성공으로 보고하지 않는다. 개발 서버 확인은 U6이 `main`까지 올라간 뒤에 할 수 있고(#440 「선행 조건과 미결」), 그 전의 기본 호환 확인은 터널로 할 수 있다(functional-spec).
- **팀장에게 넘긴 것:** 앱 루트 경로 목록(`/revoke` 없음), 설정, 개발 서버의 「MCP 빈도 제한 꺼짐」, EKS `api.yaml`의 큐 주소는 [#389 댓글](https://github.com/JminAILab/CatchU/issues/389#issuecomment-6544236461)로 넘겼다. 다시 올리지 않는다. #276에도 따로 올리지 않는다. #276 본문이 "U6가 정한 MCP·OAuth 주소(#389의 개발 서버 경로와 같은 목록)"를 따른다고 적고 있고 담당이 같은 팀장이며, 그 댓글이 EKS 몫까지 적어 같은 내용을 두 곳에 두게 되기 때문이다.
- **아직 넘기지 않은 것 하나:** 그 댓글에는 `MCP_ACCESS_TOKEN_TTL_SECONDS`가 없다. 개발 서버에서 만료 재승인을 확인할 때 값을 잠시 줄여야 하므로(functional-spec 「다른 Unit에 넘기는 것」) S22 직전에 팀장에게 요청한다.
- **Unit 제출:** 푸시·PR은 담당이 요청할 때 하고, 푸시 전에 Step 1과 같이 푸시 명령·바뀐 파일·커밋 메시지·PR 대상·본문을 보여 주고 확인을 받는다. 통합 브랜치 대상이고 `aidlc-state.md`는 커밋하지 않는다. C-15 PR이 합의돼 통합 브랜치에 합쳐지기 전에는 Unit PR을 올리지 않는다. PR 본문에 #440과 위의 U2 파일 변경을 적어 팀장 확인을 받고, 기능 설계를 #440에 잇는다. U4 담당에게 본문·제목 길이 상한을 묻고, S24에 협조할 팀원 계정을 제출 전까지 맞춘다.

## Testing Contract

```json
{
  "version": 1,
  "methodology": "custom",
  "source": "team",
  "ordering": "각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
  "scope": "mvp",
  "test_strategy": "standard",
  "project_type": "brownfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: custom\n- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.\n- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. Unit에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다."
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Meet an 80% line-coverage floor.",
      "Run the selected tests in CI before merge."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "custom",
    "runner_step": "Verify the existing test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Verify the existing test runner/configuration and record the exact unit-scoped command.",
      "Custom ordering - 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
      "Implementation and tests - preserve that exact ordering; do not convert it to layer-local TDD.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:b6cb6e0b1ba6bb0736259ab7987a5841cfc41f21a49cf2fb5eade7c786b2dc66",
  "contract_sha256": "sha256:19386d629b3092339d296f2cdf4cb18982564dbd19832a03198ee5687fbc32b6"
}
```

계약의 단계 순서를 이 계획에 이렇게 맞췄다: 구조·설정 뼈대(Step 1), 실행기 확인(Step 2), 시나리오 먼저(Step 3, 기능 설계 S1~S21이 이미 정함), 구현 뒤 세부 시험(Step 4~11 → Step 12·13), 설정(Step 14), 문서·추적(Step 14·15). 층별로는 Data model은 Step 4, Repository는 Step 5·7, Business logic은 Step 5·7·8·9, API는 Step 6·9, Frontend는 Step 11이다. CI는 고치지 않는다. 새 시험은 `api/test/` 아래 `.test.cjs`와 `web/test/` 아래 `.test.mjs`라 기존 `npm test`와 CI가 그대로 찾는다.

## Assumptions & Open Questions

- [assumption] 통합 브랜치의 `text_material`·`catch_asset.author_description`은 C-13·C-14 모양으로 이미 있으므로(마이그레이션 `1793162230851`·`1793162230852`) 시험은 실제 표에 합성 행을 넣는다.
- [assumption] SDK의 `client/auth.js`와 `Client`도 서버 도구와 같이 CommonJS로 불러올 수 있다. Step 12에서 안 되면 합성 Claude만 `fetch`로 같은 순서를 따른다.
- 미결(Step 1에서 닫음): SDK 타입이 지금 설정으로 컴파일되는지와 `@types/express` 판본.
- 미결(팀장 합의): C-15 수정. 합쳐지기 전에는 Unit PR을 올리지 않는다.
- 미결(S22): Claude 요청의 `Origin` 유무, 큰 쪽의 동작, 도구 오류 표시, 긴 `state`의 복귀. 코드를 고칠 일이 생기면 그때 다시 정한다.
