# Catch 개편 — 계약 요약

입력:
- Unit `inception/units-generation/unit-of-work.md`·`unit-of-work-dependency.md`
- 구성 요소 `inception/domain-design/components.md`, 설계 결정 `inception/domain-design/decisions.md`
- 요구사항 `inception/requirements-analysis/requirements.md`
- 이 단계의 답 `contract-design-questions.md`(Q1 A, Q2 A, Q3 A)
- 지금 계약 `api/contracts/repository-analysis/worker-messages.yaml`·`common.yaml`, 맥락 조회 문서 `api/docs/worker-context.md`

## 한눈에

- **모양이 바뀌는 계약은 둘이고, 둘 다 CR2(`cr2-commit-assignment`) 안에 있다.**
  - C1. worker가 부르는 맥락 조회 응답에 소속 커밋 목록이 더해진다.
  - C2. 결과 메시지의 후보에 본인 커밋 전체 칸이 더해지고, 결과 메시지의 판본이 "3"으로 오른다.
- **값만 바뀌는 계약은 둘이고, CR3(`cr3-ai-drafts`) 안에 있다.**
  - C3. 분석 고지 판본이 v3가 된다.
  - C4. 첫 이용 고지 판본(`AI_NOTICE_VERSION`)이 오른다.
- **모양이 그대로인 바깥 경계:** C5. web이 읽는 구직자·받은 사람 Catch 응답.
- **고정하지 않는 Unit 사이 접점:** C6·C7. worker 안의 Python 자료다(Q3 A).
- 바깥(회원·공개 인터넷)에 새로 여는 API는 없다.

## Contracts

| # | Provider Unit | Consumer | Mechanism | Owner |
|---|---|---|---|---|
| C1 | CR2 `cr2-commit-assignment` (api WorkerContext) | CR2 `cr2-commit-assignment` (worker AnalysisProcessing) | 동기 HTTP(내부, `GET /v1/internal/analysis-attempts/{attemptId}/context`) | api(`api/docs/worker-context.md`) |
| C2 | CR2 `cr2-commit-assignment` (worker AnalysisProcessing) | CR2 `cr2-commit-assignment` (api ResultReceiving·CatchRegistry) | 비동기 메시지(BullMQ 결과 큐), 공유 스키마 | 공유 계약(`api/contracts/repository-analysis/worker-messages.yaml`) |
| C3 | CR3 `cr3-ai-drafts` (api AnalysisNotice) | External: 구직자 web(분석 접수) | 동기 HTTP(기존 고지 조회·분석 접수) | api |
| C4 | CR3 `cr3-ai-drafts` (api·web AiConsentNotice) | External: 구직자 web(첫 이용 고지) | 동기 HTTP(기존 첫 이용 동의)와 web 상수 | api·web 함께 |
| C5 | CR1 `cr1-readable-catch`·CR3 `cr3-ai-drafts` (api CatchRegistry 조회) | External: 구직자·받은 사람 web | 동기 HTTP(기존 Catch 목록·상세) | api(모양 바뀌지 않음) |
| C6 | CR1 `cr1-readable-catch` (worker CandidateGrouping) | CR2 `cr2-commit-assignment`, CR3 `cr3-ai-drafts` | worker 안 Python 자료(고정 안 함) | CR1 기능 설계 |
| C7 | CR1 `cr1-readable-catch` (worker DraftGeneration의 재료 고르기·제목 결정) | CR3 `cr3-ai-drafts` | worker 안 Python 자료(고정 안 함) | CR1 기능 설계 |

## C1. 맥락 조회 응답의 소속 커밋 목록 (FR1.2, ADR-003)

- 최상위에 `assignedCommitShas`를 더한다.
- 담는 것은 그 시도의 회원과 저장소의 소속 기록 SHA 전체다. 저장소는 GitHub 저장소 ID로 정한다.
- 순서는 정하지 않는다. 중복은 없다. 소속이 없으면 빈 배열이다.
- 크기 상한은 두지 않는다(Q2 A).
- 다른 칸과 오류 응답(401·400·404 이유 코드·500)은 바꾸지 않는다.
- worker는 칸 목록이 정확히 맞아야 응답을 받는다(`worker/app/request_context/decode.py`). 그래서 이 칸을 더하는 것은 깨지는 변경이다. api와 worker를 함께 배포한다(NFR6).

```yaml
openapi: "3.0.3"
info: {title: "worker 맥락 조회 응답 — 소속 커밋 목록 추가(C1)", version: "catch-redesign"}
paths:
  /v1/internal/analysis-attempts/{attemptId}/context:
    get:
      security: [{workerKey: []}]
      parameters:
        - {name: attemptId, in: path, required: true, schema: {type: string, format: uuid}}
      responses:
        "200":
          description: 지금 응답 모양에 assignedCommitShas 하나만 더한다. Cache-Control no-store.
          content:
            application/json:
              schema:
                type: object
                additionalProperties: false
                required: [attemptId, requestId, consentId, noticeRevision, allowedResourceTypes, sourceMode, credential, selection, assignedCommitShas]
                properties:
                  attemptId: {type: string}
                  requestId: {type: string}
                  consentId: {type: string}
                  noticeRevision: {type: string}
                  allowedResourceTypes: {type: array, items: {type: string, enum: [COMMIT, PULL_REQUEST, ISSUE]}}
                  sourceMode: {type: string, enum: [LIVE]}
                  credential: {description: "지금과 같다(api/docs/worker-context.md)", type: object}
                  selection: {description: "지금과 같다", type: object}
                  assignedCommitShas:
                    description: 그 회원·GitHub 저장소 ID의 소속 기록 SHA 전체. 순서 없음, 상한 없음.
                    type: array
                    uniqueItems: true
                    items: {type: string, pattern: "^[0-9a-f]{40}$"}
        "400": {description: "지금과 같다(INVALID_REQUEST)"}
        "401": {description: "지금과 같다(AUTH_REQUIRED·AUTH_INVALID)"}
        "404": {description: "지금과 같다(RESOURCE_UNAVAILABLE와 이유 코드 5개)"}
        "500": {description: "지금과 같다(INTERNAL_ERROR). 소속 기록 조회 장애도 여기다"}
components:
  securitySchemes:
    workerKey: {type: apiKey, in: header, name: X-Worker-Key}
```

## C2. 결과 메시지 v3 — 후보의 본인 커밋 전체 (FR1.4, NFR6)

- `Candidate`에 `ownCommitShas`를 더한다.
  - 담는 것은 그 후보의 본인 커밋 전체다. 지금 근거(`evidence`) 최근 20건을 고르던 바로 그 본인 커밋 목록이고, 다른 계정의 커밋은 담지 않는다(Q1 A).
  - 1개 이상, 중복 없음이다. 상한은 3,000이다. 요청 하나가 모으는 커밋 전체의 상한(`worker/app/collection/limits.py`의 `max_commits`, 3,000)이 후보 하나가 가질 수 있는 커밋의 한도이기 때문이다.
  - api는 이 목록을 그대로 소속 기록에 쓴다. 이미 기록된 SHA는 조용히 건너뛴다(ADR-001).
- 판본 문자열은 `Result`만 "2"에서 "3"으로 올린다. 큐 요청(`Request`)·상태·수신 응답(`ResultReceipt`)은 "2" 그대로다(ADR-003, FR1.2).
- api는 "3"만 받는다. "2" 결과는 지금의 스키마 거부(`REJECTED`·`SCHEMA_INVALID`)로 끝난다. 큐에 남은 옛 판본 작업이 실패로 끝나도 된다(NFR6).
- 결과 판본과 `ownCommitShas`를 함께 바꿀 곳은 다음과 같다.
  - 계약 파일(`Result.schemaVersion`, `Candidate.ownCommitShas`)
  - api 수신 타입(`api/src/analysis-receiver/receiver.types.ts`의 `Result.schemaVersion`과 `Candidate` 타입)
  - worker 결과 조합(`worker/app/processing/result.py`의 `_envelope`). worker의 Result 판본은 이 한 곳뿐이다.
  - api 시험 보조 검사기(`api/test/helpers/worker-messages.cjs`). 계약 파일을 읽어 검사하므로 규칙은 따라 바뀌고, 이 검사기로 만드는 결과 시험 자료만 "3"과 `ownCommitShas`로 고친다.
- 판본을 "2" 그대로 두는 곳도 있다. 따라 올리면 worker와 api의 스키마 검사가 깨진다.
  - `worker/app/processing/pipeline.py`의 진행 상태 메시지(ProcessingEvent)
  - `worker/app/processing/synthetic.py`의 합성 요청 메시지(Request)

```yaml
# api/contracts/repository-analysis/worker-messages.yaml 변경분(shared-schema)
components:
  schemas:
    Candidate:
      required: [candidateId, title, workIdentity, workFacts, subjectContribution, groupingBasis, groupingLimitations, eligibility, evidence, draft, reflection, ownCommitShas]
      properties:
        ownCommitShas:
          description: 후보의 본인 커밋 전체(근거 20건을 고르던 목록 전체). 다른 계정 커밋은 담지 않는다.
          type: array
          minItems: 1
          maxItems: 3000
          uniqueItems: true
          items: {type: string, pattern: "^[0-9a-f]{40}$"}
    Result:
      properties:
        schemaVersion: {type: string, enum: ["3"]}
    # Request·Status·ResultReceipt의 schemaVersion은 "2" 그대로다.
```

## C3. 분석 고지 v3 (FR9.1)

- 바뀌는 것은 실제 자료용 분석 고지(지금 `catchu-real-analysis-notice-v2`)뿐이다. 합성용 고지(`catchu-synthetic-analysis-notice-v1`)는 그대로다. 두 판본은 `api/src/analysis-intake/analysis-notice.ts`에 따로 있고, 접수는 각각 따로 대조한다.
- 분석 고지의 판본 값과 문구만 바뀐다. 접수 요청의 `consent.noticeRevision` 모양은 그대로다.
- api가 현재 판본을 돌려주고 접수 때 같은지 대조하는 동작도 그대로다(`api/src/analysis-intake/`).
- AI 쪽을 켜는 배포와 함께 넣는다. 문구는 그 PR에서 팀장이 승인한다.
- 옛 판본으로 접수하면 지금처럼 `CONSENT_REQUIRED`다.

```yaml
shared-schema: analysis-notice
change: value-only
real_notice: "catchu-real-analysis-notice-v2 → v3"   # 실제 판본 문자열 꼴은 지금 공급자의 꼴을 따른다
synthetic_notice: unchanged                           # catchu-synthetic-analysis-notice-v1
sections_changed: [2, 3, 4]  # FR9.1의 2·3·4절
request_shape: unchanged     # consent: {accepted, noticeRevision, scopeRevision}
```

## C4. 첫 이용 고지 판본 (FR9.2)

- 받는 곳 목록에 OpenAI를 더한다. api와 web의 `AI_NOTICE_VERSION` 두 상수를 같은 새 값으로 함께 올린다(지금 `2026-11-v1`).
- 모양은 바뀌지 않는다. AI 쪽을 켜는 배포와 함께 넣는다.

```yaml
shared-schema: ai-consent-notice
change: value-only
constants:
  - api/src/ai-consent/ai-consent.gate.ts#AI_NOTICE_VERSION
  - web/src/components/ai-consent/ai-consent-notice.ts#AI_NOTICE_VERSION
rule: two constants hold the same new value in the same deploy
recipients_added: [OpenAI]
```

## C5. 구직자·받은 사람 Catch 응답 (모양 그대로)

- 제목·작업 사실·설명 초안은 지금 칸에 담긴다. 바뀌는 것은 담기는 글이다.
  - CR1: 기록의 글 제목, 작업 사실 첫 줄의 종류와 둘째 줄
  - CR3: AI 제목, 판정을 넘은 설명 문장
- 설명 초안이 없는 상태(`NOT_GENERATED`)는 이미 있다. 화면이 숨기기만 한다(FR8.2).
- 안내 문장 고치기(FR8.3·FR8.4)와 목록 2줄 제한(FR8.1)은 web 안의 일이다. 응답은 바뀌지 않는다.

```yaml
shared-schema: catch-read-responses
change: none
note: 작업 사실은 지금처럼 문자열 배열이다. 첫 줄 종류, 둘째 줄(있을 때) 기록의 글이다. 둘째 줄은 없을 수 있다.
draft_status_used: [NOT_GENERATED]   # 지금 common.yaml의 값
```

## C6·C7. worker 안 Unit 사이 접점 (고정하지 않음, Q3 A)

- CR1이 의존 그래프의 바닥이라, CR2·CR3은 합쳐진 CR1 코드 위에 쌓인다.
- 칸 이름과 모양은 CR1 기능 설계가 정한다. 여기서는 무엇이 접점인지만 적는다.

```yaml
shared-schema: worker-internal-seams
pinned: false
seams:
  - id: C6
    provider: cr1-readable-catch (CandidateGrouping)
    consumers: [cr2-commit-assignment, cr3-ai-drafts]
    what:
      - 후보의 기록의 글(종류: PR 제목 또는 본인 커밋 첫 줄, 글)과 가리기 결과
      - 작업 사실 줄(첫 줄 종류, 규칙으로 정한 둘째 줄)
      - 후보 판정 함수의 입력(CR2가 소속 커밋 목록 인자를 더한다)
  - id: C7
    provider: cr1-readable-catch (DraftGeneration 재료 고르기·제목 결정)
    consumers: [cr3-ai-drafts]
    what:
      - 재료 순서(코드 → 시험 → 설정 → 문서 → 그 밖)와 변경 묶음
      - AI 쪽을 껐을 때의 제목 결정(기록의 글 또는 조각 제목)
rule: CR3은 작업 사실 둘째 줄을 지울 수만 있고 더하지 않는다(ADR-005)
```

## 계약 소유 규칙

- **C1:** api가 소유한다. 모양은 `api/docs/worker-context.md`에 적는다. worker는 칸 목록을 정확히 대조하므로, 칸을 더하는 것도 깨지는 변경이다. api와 worker를 같은 배포에 넣는다.
- **C2:** 공유 계약 파일이 정본이다. 바꿀 때는 계약 파일, api 수신 타입, worker 결과 조합, api 시험 보조 검사기의 결과 시험 자료를 한 PR에서 함께 고친다. Result 판본 문자열은 모두 같다.
  - 지금 계약은 `additionalProperties: false`라서 칸을 더해도 깨지는 변경이다. "모르는 칸은 무시한다"는 이 계약에 적용하지 않는다.
  - 깨지는 변경은 판본을 올리고 함께 배포한다. 옛 판본을 함께 받는 처리는 만들지 않는다(NFR6).
- **C3·C4:** api가 고지 판본을 소유한다. C4는 web 상수도 같은 값으로 함께 바꾼다. 문구는 팀장이 PR에서 승인한다.
- **C5:** 이 intent에서 모양을 바꾸지 않는다. 모양 변경이 필요해지면 계약 설계로 돌아온다.
- **C6·C7:** CR1 기능 설계가 정한다. CR2·CR3이 모양을 바꾸려면 자기 Unit 안에서 바꾸고, 부딪힘은 나중에 합치는 Unit이 푼다. 합친 뒤에는 NFR4·NFR2 시험을 다시 돌린다(Unit 의존 문서).

## 배포 묶음

| 묶음 | 함께 바뀌는 것 | 조건 |
|---|---|---|
| CR2 배포 | C1(api·worker), C2(계약·api·worker) | 진행 중인 분석이 없을 때. 옛 판본 작업은 실패해도 된다 |
| CR3을 켜는 배포 | C3(api), C4(api·web) | AI 쪽을 켜는 배포와 함께. FR10 기준을 넘었을 때 |

## Open questions

| Contract | Question | Blocks |
|---|---|---|
| C2 | 요청 하나가 모으는 커밋은 최대 3,000개지만, 단위가 겹치면 후보들의 `ownCommitShas` 합계는 3,000을 넘을 수 있다. 결과 메시지 하나가 큐·수신 쪽 크기 제한에 걸리는지는 요청 전체 기준으로 CR2 비기능 요구사항에서 확인한다 | CR2 `cr2-commit-assignment` (NFR 단계) |
| C3 | v3 판본 문자열의 실제 꼴(지금 공급자가 쓰는 꼴)은 CR3 기능 설계에서 코드로 확인한다 | CR3 `cr3-ai-drafts` (기능 설계) |

C1 목록 크기는 상한을 두지 않기로 정했다(Q2 A). 길이가 문제가 되면 그때 정한다.
