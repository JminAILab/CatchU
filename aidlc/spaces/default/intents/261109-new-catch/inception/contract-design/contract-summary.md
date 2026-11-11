# 새 Catch — 계약 요약

입력:
- Unit `inception/units-generation/unit-of-work.md`·`unit-of-work-dependency.md`(NC1~NC3)
- 구성 요소 `inception/domain-design/components.md`, 설계 결정 `inception/domain-design/decisions.md`
- 요구사항 `inception/requirements-analysis/requirements.md`
- 이 단계의 답 `contract-design-questions.md`(Q1~Q4 모두 A, Q4 덧붙임)
- 지금 계약과 코드:
  - 결과 메시지 `api/contracts/repository-analysis/worker-messages.yaml`(Result 판본 "3")
  - 사본 모양 `api/src/publications/published-snapshot.ts`(C-07)
  - 본인 Catch 입력·응답 `api/src/catches/owner-catch-input.ts`·`owner-catch-response.ts`
  - 분석 고지 `api/src/analysis-intake/analysis-notice.ts`
  - 한계·기여 범위 문장 `worker/app/candidates/build.py`

## 한눈에

- **모양이 바뀌는 계약은 넷이다.**
  - C1(NC1): 본인 Catch 목록 요청 조건 「작성자 설명」, 응답 칸 `hasAuthorDescription`, 커서 판본 2
  - C2(NC3): 본인 Catch 목록 새 정렬과 커서 판본 3, 응답 칸 `revisitFacts`
  - C3(NC2): 발행 사본(C-07·C-10·C-12)에 선택 칸 넷. 저장소 이름, 작성 시점, 작업 전체 한계, 근거별 `ownCommit`이다.
  - C4(NC3): 결과 메시지 Result 판본 "4". 후보에 다시 볼 곳 사실과 첫·마지막 작업 시각이 붙는다.
- **글만 바뀌는 계약은 하나다.** C5(NC3): 분석 고지 v3의 4절 한 줄. 판본 이름은 그대로다(Q2 A).
- **고정하는 문장 대조는 하나다.** C6(NC2): api가 worker의 한계·기여 범위 문장과 같은 상수를 두고, 시험 하나가 둘이 같은지 본다(Q1 A, Q4 덧붙임).
- **고정하지 않는 Unit 사이 접점은 하나다.** C7(NC1 → NC2): web 공통 부품의 TypeScript 함수 모양이다. 기능 설계가 정한다.
- 바깥에 새로 여는 API는 없다. worker와 결과 메시지는 C4 말고는 바뀌지 않는다(Q1 A). 그래서 NC2는 web·api만 고치고, NC2와 NC3 사이에 의존이 생기지 않는다(Unit 의존의 「조건」이 지켜진다).

## Contracts

| # | Provider Unit | Consumer | Mechanism | Owner |
|---|---|---|---|---|
| C1 | NC1 `nc1-sections-and-links` (api Catches 본인 목록) | External: 지원자 web(내 자산·발행 화면) | 동기 HTTP(기존 `GET /v1/catches`, `GET /v1/catches/{catchId}`) | api(`api/docs/catch-owner-read-preparation.md`) |
| C2 | NC3 `nc3-revisit-facts` (api Catches 본인 목록·상세) | External: 지원자 web(내 자산) | 동기 HTTP(C1과 같은 경로) | api(C1과 같은 문서) |
| C3 | NC2 `nc2-snapshot-fields` (api Publications) | External: 면접관 web(`GET /v1/public/links/{token}`), 지원자 web(`GET /v1/publications/{publicationId}`), api PublishedIndex·RagAnswer(사본 읽기) | 동기 HTTP와 공유 스키마(사본 jsonb, C-07) | api(`api/src/publications/published-snapshot.ts`, `api/docs/publications.md`) |
| C4 | NC3 `nc3-revisit-facts` (worker AnalysisProcessing) | NC3 `nc3-revisit-facts` (api ResultReception·Catches) | 비동기 메시지(BullMQ 결과 큐), 공유 스키마 | 공유 계약(`api/contracts/repository-analysis/worker-messages.yaml`) |
| C5 | NC3 `nc3-revisit-facts` (api AnalysisNotice) | External: 지원자 web(분석 접수) | 동기 HTTP(기존 고지 조회·분석 접수) | api |
| C6 | NC2 `nc2-snapshot-fields` (api 문장 상수) | worker CandidateGrouping 문장(바뀌지 않음) | 문장 대조 시험 | api(상수와 시험), worker(문장 원본) |
| C7 | NC1 `nc1-sections-and-links` (web AuthorDescriptionSections·GithubLinkName) | NC2 `nc2-snapshot-fields` (web SnapshotView 표지) | web 안 TypeScript 함수(고정 안 함) | NC1 기능 설계 |

## C1. 본인 Catch 목록 「작성자 설명」 조건 (NC1, FR7.2·FR8.3·FR8.6)

- **요청:** 목록 요청에 선택 조건 `authorDescription`을 더한다.
  - 값은 `written`(씀), `unwritten`(안 씀)이다. 없으면 전체다. 그 밖 값은 지금처럼 400이다.
  - 「작성자 설명이 있는지」는 저장된 설명이 비어 있지 않은지로 정한다. 저장 경로가 빈 글을 `null`로 저장하므로(`author-description-input.ts`) `author_description IS NOT NULL`과 같다.
- **응답:** 목록·상세 응답의 Catch마다 `hasAuthorDescription`(참·거짓)을 더한다. 목록과 상세는 같은 응답 모양(`OwnerCatchResponse`)을 쓴다.
- **커서:** 판본 `v: 2`로 올린다. 범위 값(`scope`)에 `authorDescription` 조건을 함께 묶는다. 다른 조건이나 `v: 1` 커서는 400이다.
  - 정렬은 지금처럼 `catch_id`다. 정렬은 C2에서 바뀐다.
- **바뀌지 않는 것:** 다른 칸과 오류 응답, 공개 Catch 응답(`public-catch-store.ts` `publicResponse`)이다. 공개 목록의 순서와 커서도 그대로다.
- **깨지는 변경:** 커서 판본만 깨지는 변경이다. 배포 직후 web이 가진 `v: 1` 커서는 400을 받는다. 400을 받았을 때 web이 어떻게 하는지는 기능 설계에서 정한다(Open questions).

```yaml
openapi: "3.0.3"
info: {title: "본인 Catch 목록 — 작성자 설명 조건(C1, NC1)", version: "new-catch-nc1"}
paths:
  /v1/catches:
    get:
      parameters:
        - {name: limit, in: query, schema: {type: string, pattern: "^[1-9][0-9]{0,2}$"}}
        - {name: repositoryId, in: query, schema: {type: string}}
        - {name: sourceRequestId, in: query, schema: {type: string}}
        - {name: authorDescription, in: query, schema: {type: string, enum: [written, unwritten]}, description: "없으면 전체. 새 칸"}
        - {name: cursor, in: query, schema: {type: string, maxLength: 1024, pattern: "^[A-Za-z0-9_-]+$"}, description: "base64url JSON {v:2, scope, after}. scope는 회원·repositoryId·sourceRequestId·authorDescription을 묶은 sha256"}
      responses:
        "200":
          description: 지금 목록 응답에서 항목마다 hasAuthorDescription 하나만 더한다
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: {$ref: "#/components/schemas/OwnerCatchResponseAdditions"}
        "400": {description: "모르는 조건 값, 다른 조건의 커서, v:1 커서"}
components:
  schemas:
    OwnerCatchResponseAdditions:
      type: object
      description: 지금 OwnerCatchResponse 칸은 그대로 두고 아래만 더한다(목록·상세 같은 모양)
      required: [hasAuthorDescription]
      properties:
        hasAuthorDescription: {type: boolean}
```

## C2. 본인 Catch 목록 정렬과 다시 볼 곳 사실 (NC3, FR12.2·FR14.2~FR14.4)

- **정렬:** 기본 순서는 마지막 작업 시각(`catch_asset`의 새 칸) 내림차순이다.
  - 시각이 없는 Catch는 맨 아래에 둔다.
  - 같은 시각 안과 시각 없는 Catch 안에서는 지금처럼 `catch_id` 오름차순으로 늘 같게 한다.
  - 커서 비교도 같은 순서(마지막 작업 시각 내림차순, 없음은 맨 뒤, `catch_id` 오름차순)를 따른다.
  - 작업 시각은 응답에 싣지 않는다(FR14.3).
- **커서:** 판본 `v: 3`으로 올린다. `after`는 마지막 항목의 (마지막 작업 시각 또는 없음, `catch_id`) 한 쌍이다.
  - 범위 값은 C1과 같다.
  - `v: 1`·`v: 2` 커서는 400이다.
  - 새 순서에서 빠지거나 겹치는 Catch가 없다(AC11.2.1).
- **응답:** Catch마다 `revisitFacts`(배열)를 더한다. 3단계 전 Catch와 사실 없는 Catch는 빈 배열이다. 칸 모양은 C4의 `RevisitFact`와 같다.
- **바뀌지 않는 것:** 공개 Catch 응답과 공개 목록은 그대로다. 공개 응답은 허용 칸만 골라 담으므로 `revisitFacts`가 새지 않는다.

```yaml
openapi: "3.0.3"
info: {title: "본인 Catch 목록 — 작업 시각순과 다시 볼 곳 사실(C2, NC3)", version: "new-catch-nc3"}
paths:
  /v1/catches:
    get:
      parameters:
        - {name: cursor, in: query, schema: {type: string, maxLength: 1024}, description: "base64url JSON {v:3, scope, after:{lastWorkAt: string|null, catchId: uuid}}"}
      responses:
        "200": {description: "C1 응답에 항목마다 revisitFacts를 더한다. 순서는 lastWorkAt 내림차순, 없음은 맨 아래, 같으면 catchId 오름차순. 커서 비교도 같은 순서"}
        "400": {description: "v:1·v:2 커서, 다른 조건의 커서"}
  /v1/catches/{catchId}:
    get:
      responses:
        "200": {description: "같은 응답 모양. revisitFacts 포함"}
components:
  schemas:
    OwnerCatchResponseAdditionsNc3:
      type: object
      required: [revisitFacts]
      properties:
        revisitFacts:
          type: array
          items: {$ref: "worker-messages.yaml#/components/schemas/RevisitFact"}
```

## C3. 발행 사본의 선택 칸 넷 (NC2, FR9·FR10.2, C-07·C-10·C-12)

- **더하는 칸:** `CatchSnapshot`에 선택 칸 셋을, 근거 항목마다 선택 칸 하나를 더한다. 모두 선택 칸이라 옛 사본(칸 없음)도 그대로 맞는다(FR9.6).
  - `repositoryName`: 「소유자/저장소」 글. 발행 때 저장소 등록에서 읽는다. 읽는 길은 기능 설계에서 정한다.
  - `authorDescriptionEditedMonth`: `"YYYY-MM"`. 발행 때 `author_description_updated_at`을 한국 시간으로 바꾼 달이다. 작성자 설명이 없으면 칸을 넣지 않는다(FR9.2). 발행 뒤에 고쳐도 사본은 바뀌지 않는다(가정 A7).
  - `workLimits`: 글 배열. C6의 대조로 근거 한계에서 골라낸 작업 전체 한계다. 같은 문장은 한 번만 담고, 없으면 칸을 넣지 않는다(FR9.3·FR9.4).
  - `evidence[].ownCommit`: 참·거짓. 근거의 기여 범위가 C6의 본인 커밋 기여 범위 두 문장 가운데 하나면 참이다(FR10.1·FR10.2, Q4 A). 옛 사본처럼 칸이 없으면 거짓으로 읽는다.
- **넣지 않는 것:** 다시 볼 곳 사실과 작업 시각은 사본에 넣지 않는다(FR12.2, FR14.3).
- **읽는 쪽:**
  - C-10 `readSnapshot`과 C-12 받은 사람 경로는 저장된 사본을 그대로 돌려준다. 받은 사람 web(`recipient-api.ts` `pickItem`)과 작성자 발행본 web(`publications-api.ts` `isCatchSnapshot`)은 새 칸이 있으면 옮기고, 없으면 받아들인다(FR9.7).
  - PublishedIndex(`chunker.ts`)와 RagAnswer(`summary-sources.ts`)는 읽는 칸만 검사하고 다른 칸이 있어도 거부하지 않으므로 바뀌지 않는다(FR9.5). 새 칸이 조각과 요약 근거에 들지 않는다는 시험만 더한다.

```yaml
# shared-schema: C-07 CatchSnapshot 더함 (published_item.snapshot jsonb, C-10 readSnapshot·C-12 응답 같은 모양)
CatchSnapshot:
  type: object
  required: [workFacts, subjectContribution, evidence, authorDescription, aiDraft, mismatch]
  properties:
    workFacts: {type: array, items: {type: string}}
    subjectContribution: {type: string}
    evidence:
      type: array
      items:
        type: object
        required: [sourceUrl, sourceRevision, representedFacts]
        properties:
          sourceUrl: {type: string}
          sourceRevision: {type: string}
          representedFacts: {type: array, items: {type: string}}
          ownCommit: {type: boolean, description: "새 선택 칸. 없으면 false로 읽는다"}
    authorDescription: {type: [string, "null"]}
    aiDraft: {type: [string, "null"]}
    mismatch: {type: boolean}
    repositoryName: {type: string, minLength: 1, description: "새 선택 칸. 소유자/저장소"}
    authorDescriptionEditedMonth: {type: string, pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$", description: "새 선택 칸. 한국 시간 달. 작성자 설명이 없으면 없음"}
    workLimits: {type: array, minItems: 1, items: {type: string, minLength: 1}, uniqueItems: true, description: "새 선택 칸. 없으면 칸 없음"}
```

## C4. 결과 메시지 Result 판본 "4" (NC3, FR12.1·FR14.1·FR15.1)

- **판본:** Result의 `schemaVersion`을 `"3"`에서 `"4"`로 올린다. 다른 메시지(Request·ProcessingEvent·ResultReceipt)는 그대로다.
- **Candidate에 더하는 필수 칸:** 후보는 본인 커밋이 하나 이상일 때만 만들어지고, 작성 시각이 없는 커밋은 수집이 거부하므로 두 시각은 늘 있다.
  - `revisitFacts`: 배열. 사실이 없으면 빈 배열이다.
  - `firstWorkAt`, `lastWorkAt`: 날짜·시각 글. 작업 식별값이 같은 후보를 합친 뒤의 본인 커밋 목록으로 정한다(ADR-003).
- **RevisitFact 모양(Q3 A):** 종류, 파일 경로, 관련 커밋 식별값만 담는다. 문장과 링크는 web이 만든다.
- **배포:** Candidate가 `additionalProperties: false`라 깨지는 변경이다. api와 worker를 함께 배포한다(FR15.1, 제약 4). 합성(MOCK) 경로의 가짜 생성기와 고정 자료(`worker/fixtures/m1-synthetic/`)도 새 칸을 채운다.
- **배포 때 남은 결과:** 배포는 진행 중인 분석이 없을 때 한다. 큐에 남은 판본 "3" 결과는 api가 거부한다. 출시 전·DB 초기화 전이라 그때 끝나지 못한 분석은 다시 하면 된다.

```yaml
# AsyncAPI 성격의 공유 스키마 더함 (worker-messages.yaml components.schemas)
Result:
  properties:
    schemaVersion: {type: string, enum: ["4"]}
Candidate:
  additionalProperties: false
  required: [revisitFacts, firstWorkAt, lastWorkAt]   # 지금 required 목록에 더한다
  properties:
    revisitFacts:
      type: array
      items: {$ref: "#/components/schemas/RevisitFact"}
    firstWorkAt: {type: string, format: date-time}
    lastWorkAt: {type: string, format: date-time}
RevisitFact:
  type: object
  additionalProperties: false
  required: [kind, paths, commits]
  properties:
    kind:
      type: string
      enum: [REWORKED_LINES, MOVED_FILE, EXTENSION_CHANGED, REVERTED, TEST_FILES_PRESENT]
    paths:
      type: array
      items: {type: string, minLength: 1}
      description: "REWORKED_LINES 하나, MOVED_FILE·EXTENSION_CHANGED 둘(앞, 뒤), REVERTED 0개 이상, TEST_FILES_PRESENT 하나 이상"
    commits:
      type: array
      items: {type: string, pattern: "^[0-9a-f]{40}$"}
      description: "REWORKED_LINES 둘(앞 커밋, 뒤 커밋), REVERTED 둘(되돌린 커밋, 되돌려진 커밋), MOVED_FILE·EXTENSION_CHANGED 하나 이상, TEST_FILES_PRESENT 하나 이상. 모두 같은 작업의 본인 커밋"
```

- **수 상한:** 사실 수와 경로 길이의 상한은 기능 설계에서 정한다(Open questions).

## C5. 분석 고지 v3의 4절 한 줄 (NC3, FR15.2)

- 4절(Catch에 남는 것)에 「다시 볼 곳 사실(종류·파일 경로·커밋 식별값)을 Catch에 남기고 본인만 본다」는 한 줄을 더한다. 문장은 남기지 않는다(C4 Q3 A). 판본 이름 `catchu-real-analysis-notice-v3`는 그대로다(Q2 A, #504와 같은 방식).
- 첫·마지막 작업 시각도 Catch에 남는다. 고지에 함께 적을지는 문구 PR에서 팀장이 정한다.
- 같은 판본 이름의 동의가 바뀌기 전 글에 대한 것인지는 판본 이름으로 가를 수 없다. 출시 직전 DB 초기화로 그 전 동의는 사라진다.
- 판정: 문구를 바꾼 PR에 팀장 승인이 남는다.

## C6. worker·api 문장 대조 (NC2, Q1 A·Q4 덧붙임)

- **api 상수:** api에 문장 상수 여섯을 둔다. worker `build.py`의 원본과 글자까지 같다.
  - 작업 전체 한계 고정 문장 둘: `_LISTS_INCOMPLETE`, `_EARLIER_LIST_INCOMPLETE`
  - 같은 작업 경고 고정 앞부분 둘: 「같은 작업을 다시 낸 것일 수 있다(」, 「cherry-pick으로 옮긴 같은 변경일 수 있다(」
  - 본인 커밋 기여 범위 문장 둘: `_OWN_COMMIT_SCOPE`, `_OWN_COMMIT_ELSEWHERE_SCOPE`
- **고르는 규칙:** 발행 때 근거 한계(`coverageLimits`)에서 고정 문장과 같거나 고정 앞부분으로 시작하는 문장만 `workLimits`로 고른다. 근거의 기여 범위가 두 기여 범위 문장 가운데 하나면 `ownCommit`이 참이다.
- **시험:** 시험 하나가 worker 원본 문장과 api 상수 여섯이 같은지 본다. 문구가 어긋나면 한계와 표지가 조용히 사라지기 때문이다. 시험을 어디서 어떻게 돌릴지는 기능 설계에서 정한다.
- worker 문장은 이 intent에서 바꾸지 않는다.

## C7. web 공통 부품 (NC1 → NC2, 고정 안 함)

- AuthorDescriptionSections와 GithubLinkName의 함수 모양은 NC1 기능 설계가 정한다. NC2는 그 위에 표지 판정을 더한다.
- 단위만 고정한다. 합계 글자 수는 코드 포인트, 칸 시작 위치와 원문 주소 길이는 UTF-16 코드 단위다(ADR-001).

## Contract ownership rules

- **주인:**
  - C1·C2·C3·C5·C6은 api가 주인이고, 바꾸는 Unit이 같은 PR에서 문서(`api/docs/`)와 시험을 함께 고친다.
  - C4는 공유 계약 파일이 정본이고, api와 worker를 같은 PR에서 고친다.
- **더하는 변경:**
  - 사본(C3)은 선택 칸만 더한다. 읽는 쪽은 모르는 칸을 무시하고 없는 칸을 견딘다.
  - 본인 Catch 응답(C1·C2)은 칸을 더하고, web은 새 칸을 검사해 받는다.
- **깨지는 변경:**
  - 결과 메시지(C4)는 판본을 올리고 함께 배포한다.
  - 본인 목록 커서(C1·C2)는 커서 판본을 올리고, 옛 커서는 400이다.
- **바뀌지 않는 것:** 공개 Catch 응답, 받은 사람 AI 근거 딱지 둘, 링크 판별 규칙, worker 한계·기여 범위 문장.

## Open questions

| Contract | Question | Blocks |
|---|---|---|
| C1·C2 | 커서 판본이 오른 뒤 web이 옛 커서로 400을 받으면 첫 쪽부터 다시 불러올지, 오류를 보일지 | NC1·NC3 기능 설계 |
| C3 | `repositoryName`을 발행 때 어디서 읽을지(저장소 등록 표, 분석 요청의 저장소 좌표). 그 길로 이름을 못 읽는 경우의 처리도 함께 정한다. 저장소 식별값이 없으면 지금도 발행 자체가 거부된다(`publish.service.ts`의 `PublishIntegrityError('sourceRequest')`) | NC2 기능 설계 |
| C3 | `workLimits` 항목 수 상한. 같은 작업 경고는 괄호 안이 달라 「같은 문장은 한 번」만으로는 수가 정해지지 않는다. 시연 저장소의 실제 개수를 보고 정한다 | NC2 기능 설계 |
| C4 | `revisitFacts` 수와 경로 길이 상한 | NC3 기능 설계 |
| C4 | 지운 파일 항목에도 GitHub가 파일 내용 식별값을 주는지(실제 응답 하나로 확인, ADR-002) | NC3 기능 설계 |
| C6 | 문장 대조 시험을 어느 서비스 시험에 두고 어떻게 다른 서비스의 원본을 읽을지 | NC2 기능 설계 |
| C6 | 지금 CI(`ci.yml`)는 api 시험을 api 경로가 바뀔 때만 돌린다. worker 문장만 바뀐 PR에서도 대조 시험이 돌게 하는 방법 | NC2 기능 설계 |

## Sources

- `inception/units-generation/unit-of-work.md`, `inception/units-generation/unit-of-work-dependency.md`
- `inception/domain-design/components.md`, `inception/domain-design/decisions.md` ADR-001~004
- `inception/requirements-analysis/requirements.md` FR7·FR8·FR9·FR10·FR12·FR14·FR15, 가정 A7
- `inception/contract-design/contract-design-questions.md` Q1~Q4
- 지금 코드: `api/contracts/repository-analysis/worker-messages.yaml`, `api/src/publications/published-snapshot.ts`, `api/src/catches/owner-catch-input.ts`, `api/src/catches/owner-catch-response.ts`, `api/src/catches/author-description-input.ts`, `api/src/analysis-intake/analysis-notice.ts`, `worker/app/candidates/build.py`
