# API 문서 — CatchU

> 기준: 2026-11-09 전체 다시 스캔, 커밋 `a1d0fbb4`. 경로는 컨트롤러 데코레이터에서 직접 모았다. 각 경로의 세부 규칙 정본은 `api/docs/<기능>.md`와 계약(12월 intent C-xx)이며, 여기서는 목록과 이 intent가 닿는 응답 모양만 적는다.

## 공통 규칙

- 기능 경로는 `/v1` 아래, `GET /health`만 접두사가 없다(`api/src/app.setup.ts` 37행).
- **인증**: 전역 Guard(`auth/access-token.guard.ts`)가 `Authorization: Bearer <Access JWT>`(15분)를 본다. 예외는 메서드마다 `@Public()`을 붙인다. 세션 갱신·로그아웃은 쿠키와 `AUTH_WEB_ORIGIN` 검사.
- **오류 모양**: 공통 필터(`common/errors/api-exception.filter.ts`)가 모든 예외를 `{ code, message, details? }`로 쓴다. `details`는 `violations[{ field, reason }]`, `existingRequestId`, 발행 거부의 `catchIds`(UUID만)만 복사하고 다른 키는 버린다(143~157행). 코드는 `common/errors/error-codes.ts`에 30여 개가 있다(예: `VALIDATION_FAILED`, `AUTH_REQUIRED`, `AUTH_INVALID`, `RESOURCE_UNAVAILABLE`, `CONFIRMATION_REQUIRED`, `SOURCE_RESTRICTED`, `AI_CONSENT_REQUIRED`, `RATE_LIMITED`, `DAILY_LIMIT_REACHED`, `LINK_UNAVAILABLE`, `LINK_PASSWORD_REQUIRED`, `LINK_PASSWORD_INVALID`, `LINK_UNLOCK_LIMITED`, `INDEX_NOT_READY`, `QUESTION_LIMIT_REACHED`, `INTERNAL_ERROR`). 입력값은 오류에 싣지 않는다.
- **캐시**: 모든 응답에 `no-store`(`common/http/no-store.interceptor.ts`). 보안 헤더는 `common/http/security-headers.ts`.
- **429**: `Retry-After`(정수 초)를 붙인다.
- **목록**: `cursor`(불투명 base64url)·`limit`(기본 20, 최대 100). 정의하지 않은 쿼리는 400.

## 경로 목록

| 메서드·경로 | 인증 | 맡은 모듈 | 하는 일 |
|---|---|---|---|
| `GET /health` | 공개 | `api.health` | `{"status":"ok"}`. DB·큐를 보지 않음 |
| `POST /v1/auth/dev-login` | 공개(개발·시험 설정만) | `api.auth` | 개발 회원 로그인 |
| `POST /v1/auth/refresh` | 공개(쿠키) | `api.auth` | Access 재발급·Refresh 교체 |
| `POST /v1/auth/logout` | 공개(쿠키) | `api.auth` | 세션 폐기, 204 |
| `POST /v1/auth/google/authorization` | 공개 | `api.google-login` | Google 인가 주소 발급 |
| `POST /v1/auth/google/login` | 공개 | `api.google-login` | 인가 코드 교환·회원 연결·세션 |
| `GET /v1/me` | 회원 | `api.member-profile` | 본인 회원·프로필 |
| `PUT /v1/me/profile` | 회원 | `api.member-profile` | 프로필 전체 저장 |
| `DELETE /v1/me` | 회원 | `api.withdrawal` | 탈퇴 4단계, 204 |
| `POST /v1/me/github/authorization` | 회원 | `api.github-connection` | GitHub 인가 주소 |
| `POST /v1/me/github/connection` | 회원 | `api.github-connection` | 코드 교환·연결 저장 |
| `DELETE /v1/me/github/connection` | 회원 | `api.github-connection` | 연결 해제 |
| `POST /v1/me/repositories` | 회원 | `api.member-repositories` | 공개 저장소 직접 등록 |
| `GET /v1/me/repositories` | 회원 | `api.member-repositories` | 등록 저장소 목록 |
| `GET /v1/analysis-notice` | 회원 | `api.analysis-intake` | 분석 고지(실제 회원은 `catchu-real-analysis-notice-v3`) |
| `POST /v1/analysis-requests` | 회원, `Idempotency-Key` | `api.analysis-intake` | 분석 접수. 새 접수 202, 같은 키 200 |
| `GET /v1/analysis-requests` | 회원 | `api.analysis-intake` | 본인 분석 이력 |
| `GET /v1/analysis-requests/:requestId` | 회원 | `api.analysis-intake` | 개별 분석 상태 |
| `GET /v1/me/analysis-summary` | 회원 | `api.analysis-intake` | 홈용 접수 이력 유무 |
| `GET /v1/internal/analysis-attempts/:attemptId/context` | worker 서비스 키(`X-Worker-Key`), `WORKER_CONTEXT_ENABLED=true`일 때만 등록 | `api.worker-context` | 접수 맥락·GitHub 토큰·선택 범위·소속 커밋 |
| `GET /v1/catches` | 회원 | `api.catches` | 본인 Catch 목록(`repositoryId`·`sourceRequestId` 걸러 보기) |
| `GET /v1/catches/:catchId` | 회원 | `api.catches` | 본인 Catch 상세 |
| `PUT /v1/catches/:catchId/confirmation` | 회원 | `api.catches` | 작업 사실·나의 기여 확인(둘 다 `true`만) |
| `PUT /v1/catches/:catchId/mismatch` | 회원 | `api.catches` | 불일치 표시 켜기·끄기 |
| `PUT /v1/catches/:catchId/visibility` | 회원 | `api.catches` | 공개 상태(공개 조건 검사) |
| `GET /v1/catches/:catchId/description` | 회원 | `api.catches` | 작성자 설명 읽기 |
| `PUT /v1/catches/:catchId/description` | 회원 | `api.catches` | 작성자 설명 저장(덮어쓰기) |
| `GET /v1/text-materials` | 회원 | `api.materials` | 텍스트 자료 목록 |
| `POST /v1/text-materials` | 회원 | `api.materials` | 만들기 |
| `GET /v1/text-materials/:id` | 회원 | `api.materials` | 읽기 |
| `PUT /v1/text-materials/:id` | 회원 | `api.materials` | 고치기 |
| `DELETE /v1/text-materials/:id` | 회원 | `api.materials` | 지우기, 204 |
| `GET /v1/ai-consent` | 회원 | `api.ai-consent` | 외부 AI 첫 이용 동의 상태(판본 `2026-11-v2`) |
| `POST /v1/ai-consent` | 회원 | `api.ai-consent` | 동의 기록, 204 |
| `POST /v1/publications` | 회원 | `api.publications` | 발행, 201 |
| `GET /v1/publications` | 회원 | `api.publications` | 본인 발행본 목록(발행 시각 최신순) |
| `GET /v1/publications/:publicationId` | 회원 | `api.publications` | 발행본 상세(사본 포함) |
| `PUT /v1/publications/:publicationId/stop` | 회원 | `api.publications` | 링크 중지 |
| `DELETE /v1/publications/:publicationId` | 회원 | `api.publications` | 발행본 삭제(파일 접두어 먼저), 204 |
| `GET /v1/publications/:publicationId/summary` | 회원 | `api.rag-answer` | 작성자용 기본 요약 |
| `POST /v1/publications/:publicationId/summary/regenerate` | 회원 | `api.rag-answer` | 기본 요약 다시 만들기, 202 |
| `GET /v1/public/links/:token` | 공개, 비밀번호 링크는 `X-Link-Grant` | `api.publications` | 면접관용 사본(`PublishedSnapshot`) |
| `POST /v1/public/links/:token/unlock` | 공개 | `api.publications` | 비밀번호 확인 → `{ grant }`(2시간) |
| `GET /v1/public/links/:token/summary` | 공개(+grant) | `api.rag-answer` | 면접관용 기본 요약 |
| `POST /v1/public/links/:token/questions` | 공개(+grant) | `api.rag-answer` | 질의응답, SSE 스트림 |
| `GET /v1/me/mcp-connection` | 회원 | `api.claude-mcp` | Claude 연결 상태 |
| `POST /v1/me/mcp-connection/authorizations` | 회원 | `api.claude-mcp` | 연결 승인 |
| `DELETE /v1/me/mcp-connection` | 회원 | `api.claude-mcp` | 전체 해제, 204 |
| `POST·GET·DELETE /v1/mcp` | 공개(MCP 접근 토큰은 SDK가 확인) | `api.claude-mcp` | MCP Streamable HTTP. 도구 `list_my_catches`·`list_my_text_materials` |
| OAuth 주소(인가 서버 메타데이터, `/authorize`, `/token`, `/register`) | 공개 | `api.claude-mcp` | MCP SDK `mcpAuthRouter`를 기동 때 앱 루트에 붙인다(`claude-mcp.module.ts`) |

worker의 HTTP는 `GET /health`(포트 8000) 하나다(`worker/app/main.py`).

## 이 intent가 닿는 응답 모양

### 본인 Catch (`GET /v1/catches`, `GET /v1/catches/:catchId`, 세 PUT)

`OwnerCatchResponse`(`api/src/catches/owner-catch-response.ts` 53~78행):

```
catchId, title(null 가능), repositoryId, sourceRequestId, sourceResultId, sourceCandidateId,
workFacts[], subjectContribution,
evidence[{ catchEvidenceId, sourceEvidenceId, sourceUrl, sourceRevision, representedFacts[], contributionScope, coverageLimits[] }],
draft{ status, content }, reflection{ status, questions[] },
confirmation{ workFactsConfirmed, contributionConfirmed }, mismatch, visibility, restriction, sourceMode
```

- 목록은 `{ items, page: { nextCursor } }`이고 `catch_id` 오름차순이다. 저장소 이름·만든 시각·작성자 설명 여부 칸이 없다.
- 응답을 만들 때 원 요청·보호 관측·근거가 하나라도 맞지 않으면 500(정상 0건으로 숨기지 않음).
- web 검사기 `isCatch`(`web/src/features/assets/catch-api.ts` 22~35행)는 모르는 칸을 무시한다.

### 작성자 설명 (`GET`·`PUT /v1/catches/:catchId/description`)

- 요청 본문 `{ description: string }`. 다른 칸은 400. 4,000 코드 포인트 상한, NUL·고립 대리쌍 거부. 앞뒤 공백만이면 지운 것으로 본다(`author-description-input.ts`).
- 응답 `{ authorDescription: string|null, authorDescriptionUpdatedAt: date|null }`. 덮어쓰기이며 판본 비교가 없다.

### 발행 (`POST /v1/publications`)

- 요청 `{ title(1~50자, trim), password?(8~64자, 그대로), items: [{ kind: "CATCH"|"TEXT_MATERIAL", sourceId(uuid) }] }`, 항목 1~20개, 중복 거부, 배열 순서가 `position`(`publish-input.ts`, `publications-config.ts`).
- 응답 201 `{ publicationId, url, state: "ACTIVE", publishedAt, expiresAt, passwordProtected }`. 토큰은 `url` 안에만 있다.
- 실패: 429(1분 10회, 임시값), 400, `AI_CONSENT_REQUIRED`(AI 동의 없음), 409 `CONFIRMATION_REQUIRED`·`SOURCE_RESTRICTED`(`details.catchIds`), 400 `maxTotalLength`(조각 대상 글 합계 60,000자, 임시값), 404(남의 것·없는 것), 하루 횟수 초과.

### 발행 사본 (`GET /v1/public/links/:token`, 작성자 상세의 `snapshot`)

`PublishedSnapshot`(`api/src/publications/published-snapshot.ts`):

```
{ title, publishedAt, expiresAt,
  items: [{ publishedItemId, position, itemKind: "CATCH"|"TEXT_MATERIAL"|"PDF_MATERIAL", title, snapshot, pdfPages|null }] }
CATCH snapshot: { workFacts[], subjectContribution, evidence[{ sourceUrl, sourceRevision, representedFacts[] }],
                  authorDescription|null, aiDraft|null, mismatch }
TEXT_MATERIAL snapshot: { body }
```

- 항목 `title`은 Catch 제목(없으면 「제목 없는 Catch」)을 발행 때 복사한 값이다.
- 근거의 `contributionScope`·`coverageLimits`, 저장소 이름, 작성 시점은 사본에 없다.
- 판정 실패: 404 `LINK_UNAVAILABLE`(없음·중지·만료·작성자 비활성 구분 없음), 401 `LINK_PASSWORD_REQUIRED`, 회원 행 없음은 500.

### MCP 도구 `list_my_catches`

- 항목 `{ catchId, title, visibility, workFacts, subjectContribution, authorDescription, evidenceUrls, mismatch }`, `draft_content`는 읽지 않는다(`claude-mcp/mcp-page.ts` 110~119행, `mcp-material-reader.ts` 9~11행). `catch_id` 오름차순 50행 단위, 글자 수 상한을 넘으면 본문을 뺀 모양(`omitted: true`).

## 큐 메시지 (api ↔ worker)

정본은 `api/contracts/repository-analysis/worker-messages.yaml`(OpenAPI 3.0.3 형식, `paths` 없음)과 `common.yaml`(Draft·Reflection·Failure 등).

| 메시지 | 판본 | 방향 | 큐 |
|---|---|---|---|
| `Request` | `"2"` | api → worker | `analysis-requests`(작업 ID = 시도 ID, 재시도 없음) |
| `ProcessingEvent` | `"2"` | worker → api | `worker-messages`(`RECEIVED`·`RUNNING`·`UNCERTAIN`) |
| `Result` | `"3"` | worker → api | `worker-messages` |
| `ResultReceipt` | `"2"` | api → worker(수신 확인 조회) | 결과 작업의 반환값 |

- `Result`는 요청 맥락 + `outcome`(`SUCCEEDED`·`EMPTY`·`PARTIAL_FAILED`·`FAILED`) + `candidates[]` + `notProvided[]` + `failures[]` + 본인 커밋 관측(`ownCommitObservation`, `observedOwnCommitCount`, `collectionLimitNotes`)이다.
- `Candidate`: `candidateId, title|null, workIdentity, workFacts[], subjectContribution, groupingBasis, groupingLimitations[], eligibility{세 칸 모두 true}, evidence[1..], draft, reflection, ownCommitShas[1..3000]`. **`additionalProperties: false`** 이며 옛 판본을 함께 받지 않는다(파일 머리 주석). 칸을 더하면 판본을 올리고 두 서비스를 함께 배포한다.
- 큐 이름·옵션은 `api/src/analysis-queue/queue-spec.ts`와 `worker/app/consumer/queues.py`가 같은 값을 전제한다.

## api 안 백그라운드 작업 (`ai-run` 큐)

| 작업 | 등록 자리 | runKey | 처리 |
|---|---|---|---|
| `EMBED_PUBLICATION` | 발행 커밋 뒤(`publish.service.ts` 124행), 다시 준비(`published-index-writer.ts`) | `EMBED_PUBLICATION-{publicationId}`(+ 다시 준비는 무작위 꼬리) | 조각 임베딩(Voyage `voyage-4-lite`), `publication_index` 상태 |
| `BASE_SUMMARY` | 발행 커밋 뒤, 다시 만들기 | `BASE_SUMMARY-{publicationId}` | 사본 필드 근거로 Claude 인용 요약, `base_summary` |

큐 주소가 없으면 등록이 `ENQUEUE_FAILED`로 끝나고 상태는 처리 시한으로 `FAILED`가 된다(`api/src/ai-run/ai-run.ts` 머리 주석).
