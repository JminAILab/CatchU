# API 문서 — CatchU (분석·Catch 경로와 작성자 화면 API)

> 범위: 2026-11-03 집중 스캔(`kind: partial`), 기준 커밋 `9923226c`. 이 intent가 바꿀 메시지·내부 경계·화면 모양과, U4 #461이 더한 Catch 작성자 설명·텍스트 자료 API만 적는다. 공개 HTTP API 전체(인증·공유 링크·발행·MCP 등)는 다루지 않는다.

## 1. api ↔ worker 메시지 계약 v2

- 정본: `api/contracts/repository-analysis/worker-messages.yaml`(OpenAPI 3.0.3, `info.version` 2.0.0, `paths: {}`), 공통 스키마 `common.yaml`.
- 읽는 곳: worker `app/contract/worker_messages.py`(jsonschema Draft 7, `nullable` 변환), api `src/analysis-receiver/worker-message.validator.ts`(Ajv). 둘 다 같은 파일을 직접 읽는다.
- 모든 메시지의 `schemaVersion`은 `enum: ["2"]` 하나다. 모든 객체가 `additionalProperties: false`라 **칸을 더하면 계약을 고쳐야 하고, 양쪽이 같은 판본을 받아야 한다.**
- 작성자 설명·텍스트 자료는 이 계약에 없다. worker는 이 둘을 받지도 만들지도 않는다.

### Request (api → worker, Redis 큐 작업 자료)

| 칸 | 형식 | 비고 |
|---|---|---|
| `schemaVersion` | `"2"` | |
| `messageId` | 문자열 | `request-{attemptId}` |
| `requestId`·`attemptId`·`memberId`·`repositoryId`·`consentId` | 문자열 | DB 접수 기록 |
| `noticeRevision` | 문자열 | 동의한 분석 고지 판본(실제 회원은 `catchu-real-analysis-notice-v2`) |
| `consentedAt`·`requestedAt` | date-time | |
| `allowedScope` | `{revision, repositoryId, allowedResourceTypes[COMMIT·PULL_REQUEST·ISSUE], selectionReference}` | `selectionReference`에는 시도 ID |
| `credentialContextReference` | 문자열 | 시도 ID |
| `sourceMode` | `MOCK`·`LIVE` | |

조립: `api/src/analysis-queue/analysis-request.dispatcher.ts` `buildRequestMessage`(65~85행). 동의 범위 모양 → 저장소·판본 대조 → 조립 → 계약 검사 순이다. **이미 소속된 커밋 목록 칸은 없다.**

worker 검사: `worker/app/processing/request_check.py` `check_request`가 계약 → 접수 맥락(요청·회원·저장소·동의·**고지 판본**·방식·범위) → 현재 시도 순으로 대조한다.

### ProcessingEvent (worker → api)

`schemaVersion`·`messageId`·`requestId`·`attemptId`·`state`(`RECEIVED`·`RUNNING`·`UNCERTAIN`)·`observedAt`.

### Result (worker → api)

| 칸 | 형식 | 비고 |
|---|---|---|
| 맥락 칸 | `requestId`·`attemptId`·`memberId`·`repositoryId`·`consentId`·`scopeRevision`·`sourceMode` | 요청과 같은 값 |
| `outcome` | `SUCCEEDED`·`EMPTY`·`PARTIAL_FAILED`·`FAILED` | 후보·실패 수로 정함(`outcome_for`) |
| `candidates[]` | `Candidate` | 아래 |
| `notProvided[]` | `{reason: INSUFFICIENT_EVIDENCE·BELOW_CRITERIA·UNDETERMINED, count}` | |
| `failures[]` | `{stage: COLLECTION·ANALYSIS·DRAFT·REFLECTION·APPLICATION·DISPATCH, code, message, candidateId?}` | `code`는 자유 문자열 |
| `ownCommitObservation`·`observedOwnCommitCount`·`collectionLimitNotes` | | U7 본인 커밋 관측(`oneOf`로 조합 제한) |
| `finishedAt` | date-time | |

#### Candidate

| 칸 | 형식 | 지금 만드는 곳 |
|---|---|---|
| `candidateId` | 문자열 | 결과 조합(`candidate-{id_label}-{attemptId}-{n}`) |
| `title` | 문자열 또는 `null`(최소 1자) | 생성(#120) 조각 제목, 없으면 null. 길이 상한 없음 |
| `workIdentity` | 문자열 | 후보(#118) `wi1:` 열쇠 |
| `workFacts[]` | 문자열 | 후보(#118). 첫 줄은 단위 이름(SHA 12자 포함), 둘째 줄은 다른 계정 커밋 섞임 |
| `subjectContribution` | 문자열 | 후보 |
| `groupingBasis`·`groupingLimitations[]` | 문자열 | 후보. 나누기 실패 한계 문장 포함 |
| `eligibility` | 세 칸 모두 `true` | |
| `evidence[]`(최소 1) | `{evidenceId, sourceUrl, sourceRevision, representedFacts[], contributionScope, coverageLimits[]}` | 후보. 단위 근거 + 본인 커밋 최근 20건 + 이슈 근거 |
| `draft` | `{status: GENERATED·FAILED·NOT_GENERATED, content}` | 생성 |
| `reflection` | `{status, questions[]}` | 생성 |

**후보의 소속 커밋 전체 칸은 없다.** 소속은 근거(`evidence[].sourceRevision`)에 최근 20건까지만 드러난다.

### ResultReceipt (api → worker)

`disposition`(`ACCEPTED`·`DUPLICATE`·`REJECTED`)과 `code`(`OK`·`ALREADY_RECEIVED`·`CONTEXT_MISMATCH`·`STALE_ATTEMPT`·`PAYLOAD_CONFLICT`·`SCHEMA_INVALID`). 세 식별자(`resultId`·`requestId`·`attemptId`)를 읽을 수 있을 때만 보낸다.

## 2. worker 전용 내부 HTTP

`GET /internal/analysis-attempts/:attemptId/context`(api `src/worker-context/worker-context.controller.ts`)

- 인증: `@WorkerContextOnly()`(worker 전용 키). 쿼리·본문·전송 인코딩이 있으면 `INVALID_REQUEST`.
- 허용: 현재 시도이고, 요청 `ACTIVE`·`ACCEPTED`, 시도 `QUEUED`·`RUNNING`, 방식 `LIVE`, 회원 `ACTIVE`, 동의 수락.
- 응답: `attemptId`·`requestId`·`consentId`·`noticeRevision`·`allowedResourceTypes`·`sourceMode`·`credential{memberId, repositoryId, scopeRevision, repository{owner,name}, linkedAccount{login, externalAccountId}, accessToken, expiresAt}`·`selection{repositoryId, wholeRepository: true}`.
- 거부: 404 `RESOURCE_UNAVAILABLE`, `details.violations[0].reason` = `ATTEMPT_NOT_ACTIVE`·`MEMBER_INACTIVE`·`SCOPE_UNVERIFIED`·`GITHUB_NOT_CONNECTED`·`GITHUB_REAUTH_REQUIRED`.
- 이 응답은 시도마다 한 번 DB를 읽어 만든다. 큐 작업과 달리 Redis에 남지 않는다.

## 3. api 내부 경계(공개 API 아님)

### 결과 반영 → Catch 등록

- `ResultApplicationService.apply(accepted)`(`src/result-application/result-application.service.ts`): 요청 → 시도 → 수신 기록 잠금, 맥락·지문 대조, 동의 대조, `RegistrationPort.register` 호출, 저장된 `candidate_registration`과 반환값 대조, 시도 `APPLIED`·요청 `CLOSED`.
- `RegistrationInput`: `applicationRecordId`·`requestId`·`attemptId`·`resultId`·`ownerId`·`sourceMode`·`candidates`(계약 `Candidate` 그대로).
- `RegistrationResult`: `candidateId`·`catchId`·`disposition`(`CREATED`·`EXISTING`)·`ownerViewReady`.
- 실패 이유: `INVALID_INPUT`·`REGISTRATION_INELIGIBLE`·`TRANSACTION_REQUIRED`·`INVALID_CONTEXT`·`CONTEXT_MISMATCH`·`REGISTRATION_MISMATCH`·`CATCH_NOT_READY`.
- `registerCandidates`(`src/catches/registration-service.ts`): 후보를 열쇠별로 묶고 열쇠 순으로 `pg_advisory_xact_lock([ownerId, workIdentity])`을 잡은 뒤 (회원, 열쇠)로 찾는다. 없으면 첫 후보로 `catch_asset`·`catch_evidence`를 넣고(`orIgnore`, 160~183행), 있으면 내용을 바꾸지 않고 `EXISTING`으로 잇는다(185~192행). 원 요청 저장소·방식이 다르면 `CONTEXT_MISMATCH`.
- **작성자 설명과의 관계**: 새 Catch 삽입 값(`...first.content.asset`)에 작성자 설명 칸이 없어 NULL로 들어간다. `EXISTING`은 행을 쓰지 않으므로 설명·저장 시각이 그대로다. 이 함수와 `ResultApplicationService` 어디에도 `author_description` 쓰기가 없다.

### 첫 이용 AI 동의

- `AiConsentGate.require(memberId)`: 현재 판본(`2026-11-v1`) 동의가 없으면 403 `AI_CONSENT_REQUIRED`.
- `AiConsentGate.record(memberId, noticeVersion, now)`: 판본이 현재와 다르면 400 `VALIDATION_FAILED`(`field: noticeVersion`, `reason: currentNoticeVersion`). web은 `POST /v1/ai-consent { noticeVersion }`으로 부른다(web README).

### 분석 고지

- `AnalysisNoticeService.real()`이 `{noticeRevision, text}`를 준다. 접수는 입력의 `consent.noticeRevision`이 이 값과 같아야 받는다(`analysis-intake.service.ts` 56행). 판본을 올리면 이전 판본 화면의 동의로는 접수되지 않는다.

## 4. worker 내부 경계

| 경계 | 모양 | 위치 |
|---|---|---|
| 생성기 | `Generator.generate(CheckedRequest) -> GenerationOutput`, 실행 불명이면 `ExecutionUnknown`·`TimeoutError` | `app/processing/generation.py` |
| 후보 판정 | `build_candidates(request, outcome) -> GenerationOutput`(title `None`, draft·reflection `NOT_GENERATED`) | `app/candidates/build.py` |
| 생성 | `run_generation(request, outcome, built, *, provider, clock, deadline, limits) -> GenerationRun` | `app/generation/flow.py` |
| 생성 제공자 | `GenerationProvider.complete(ProviderRequest) -> str`. `ProviderRequest{purpose: GENERATE·REWRITE_TITLE, instructions, data, timeout_seconds, max_output_bytes}`. 시간 초과는 `TimeoutError`, 그 밖은 `ProviderError`/`UnusableResponse(TOO_LARGE·UNREADABLE)`. 스스로 재시도하지 않음 | `app/generation/provider.py` |
| 판정 공급자 | **없음** | — |

### 생성 호출의 자료와 응답

- 자료(JSON): `{"commits":[{"id":"c1","files":[{"id":"c1f1","path":…,"status":…,"previousPath"?,"lines":[{"id":"c1f1:L4","change":"added|removed","text":…,"names"?:[…],"selectable"?:false}]}]}]}`. 커밋 SHA·메시지·PR 글은 없다.
- 응답(JSON 객체 하나): `fragments`(1~3, `ADDED_LINE_WITH`·`REMOVED_LINE_WITH`·`FILE_STATUS`), `title`(`CODE_NAME` 줄·이름 또는 `FILE_NAME` 파일), `questions`(1~3, `BACKGROUND`·`ALTERNATIVES`·`VERIFICATION`). 문장은 쓰지 않는다.
- 실패 코드: `GENERATION_CALL_FAILED`·`GENERATION_TIMEOUT`·`GENERATION_RESPONSE_UNREADABLE`·`GENERATION_RESPONSE_TOO_LARGE`(설명·질문 모두 실패), `GENERATION_RULE_VIOLATION`·`GENERATION_UNVERIFIED`(그 부분만 실패), `GENERATION_BUDGET_EXHAUSTED`(요청 단위 `ANALYSIS` 1건).

## 5. 화면이 받는 모양(web)

| 화면 | 자료형 | 이 intent와 닿는 칸 |
|---|---|---|
| 구직자 Catch 목록·상세 | `CatchAsset`(`web/src/features/assets/types.ts`) | `title`(null 가능), `workFacts`, `draft`, `evidence`. 작성자 설명은 이 자료형에 없고 아래 설명 API로 따로 읽는다 |
| 구직자 Catch 상세의 작성자 설명 | `AuthorDescription`(`web/src/features/assets/author-description-api.ts`) | `authorDescription`·`authorDescriptionUpdatedAt`(둘 다 null이거나 둘 다 값) |
| 텍스트 자료 화면 | `TextMaterial`·`TextMaterialItem`·`TextMaterialPage`(`web/src/features/materials/materials-api.ts`) | 이 intent와 닿지 않음 |
| 받은 사람 목록·상세 | `PublicCatch`(`web/src/features/recipient/recipient-api.ts`) | `title`, `workFacts`, `subjectContribution`, `evidence`, `draft`. 작성자 설명 칸 없음 |
| 동의 창 | `AI_CONSENT_TEXT`·`AI_NOTICE_VERSION`(`web/src/components/ai-consent/ai-consent-notice.ts`) | 받는 곳 목록 `AI_RECIPIENTS`(Claude·Voyage) |

목록 카드는 `title`(있으면)과 `workFacts[0]`을 보이고, 상세는 작업 사실 전체·나의 기여·근거·작성자 설명(구직자만)·설명 초안을 보인다. 제목 출처를 나타내는 칸은 응답에 없다.

## 6. 작성자 화면 API (U4 #461, 회원 인증)

공통: 전역 인증 Guard·Bearer 토큰·`/v1` 접두사·오류 형식·`no-store`는 공통 기반이다. 컨트롤러에 `@Public()`을 붙이지 않는다. 정의하지 않은 쿼리는 400 `VALIDATION_FAILED`(`field: query`, `whitelistValidation`). 모든 읽기·쓰기는 먼저 `member_account`를 `FOR KEY SHARE`로 잡아 회원이 없으면 `AUTH_INVALID`, 진행 중에는 회원 삭제를 막는다. 본문·제목은 로그·오류 응답에 넣지 않는다. 기준 문서는 `api/docs/publications.md`.

### Catch 작성자 설명 (계약 C-14)

`src/catches/author-description.controller.ts`·`author-description-store.ts`·`author-description-input.ts`, `CatchesModule`에 등록.

| 경로 | 요청 | 성공 | 오류 |
|---|---|---|---|
| `GET /v1/catches/{catchId}/description` | — | 200 `{ authorDescription, authorDescriptionUpdatedAt }` | 401, 404 |
| `PUT /v1/catches/{catchId}/description` | `{ description: string }` | 200 같은 모양 | 400, 401, 404 |

- 입력: 본문은 객체이고 `description` 하나만 허용(`isObject`·`whitelistValidation`·`isString`). NUL(`noNul`)·짝 없는 서로게이트(`isWellFormed`)·4,000 코드 포인트 초과(`maxLength`)는 400. 앞뒤 공백을 지워 0자면 NULL(설명 지우기), 그 밖은 쓴 그대로 저장한다.
- 저장: `UPDATE catch_asset SET author_description = $3, author_description_updated_at = CASE WHEN $3 IS NULL THEN NULL ELSE clock_timestamp() END WHERE owner_id = $1 AND catch_id = $2 RETURNING …`. 덮어쓰기이며 버전 비교가 없다. 다른 칸은 바꾸지 않는다.
- 남의 Catch·없는 Catch·UUID 형식이 아닌 ID는 같은 404 `RESOURCE_UNAVAILABLE`.
- 읽은 두 칸이 한쪽만 NULL이면 성공으로 내보내지 않고 오류를 던진다(DB CHECK와 같은 규칙).
- 10월 본인 Catch 응답(`GET /v1/catches/{catchId}`)과 공개 Catch 응답에는 설명 칸을 넣지 않았다. Claude 연결(MCP)의 `list_my_catches`와 RAG 요약 근거(`AUTHOR_MATERIAL`)는 설명을 읽는다(이 스캔에서는 훑음).

### 텍스트 자료 (계약 C-13)

`src/materials/`의 `MaterialsModule`(`text-materials.controller.ts`·`text-material-store.ts`·`text-material-input.ts`·`text-material.entity.ts`), `AppModule`에 등록.

| 경로 | 요청 | 성공 | 오류 |
|---|---|---|---|
| `GET /v1/text-materials` | `cursor`·`limit`(1~100, 기본 20) | 200 `{ items: [{ textMaterialId, title, updatedAt }], page: { nextCursor } }` | 400, 401 |
| `POST /v1/text-materials` | `{ title, body }` | 201 `{ textMaterialId, title, body, createdAt, updatedAt }` | 400, 401 |
| `GET /v1/text-materials/{id}` | — | 200 TextMaterial | 401, 404 |
| `PUT /v1/text-materials/{id}` | `{ title, body }` | 200 TextMaterial | 400, 401, 404 |
| `DELETE /v1/text-materials/{id}` | — | 204 | 401, 404 |

- 입력: 제목은 앞뒤 공백을 지운 값으로 1~100자를 세고 그 값을 저장한다. 본문은 공백뿐이면 거부하고 1~20,000자를 그대로 세고 그대로 저장한다. 위반 이유를 칸별로 모두 모아 `violations`로 돌려준다.
- 목록: 만든 시각 최신순, 같은 시각은 ID 역순. 항목에 본문이 없다. 커서는 `{v:1, scope, at, after}`의 base64url이며 `scope`는 회원별 SHA-256이다. 다른 회원의 커서·바꾼 커서·형식이 틀린 커서는 400 `cursor`·`isValid`. 커서는 위치일 뿐이고 조회는 언제나 인증 회원으로 거른다.
- 남의 것·없는 것·UUID 형식이 아닌 ID는 같은 404. 수정은 덮어쓰기. 삭제는 행만 지우고 발행 사본은 남는다.
- DB: `text_material`(제목 1자 이상 CHECK만, 길이 상한은 API 검사), `member_id` 색인, 회원 외래 키 `ON DELETE CASCADE`.
