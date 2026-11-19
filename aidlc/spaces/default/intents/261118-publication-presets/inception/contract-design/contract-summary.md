# Contract Summary — 발행 프리셋

근거: 단위 `inception/units-generation/unit-of-work.md`와 의존 `inception/units-generation/unit-of-work-dependency.md`(U1→U2, U1→U3, U4는 경계 없음), 구성 요소 `inception/domain-design/components.md`와 결정 `inception/domain-design/decisions.md`(ADR-002·003·004·006·007·009), 요구사항 `inception/requirements-analysis/requirements.md`(FR1.3~FR1.14, FR2.2~FR2.11, FR5.1, FR6.1~FR6.3, NFR2·NFR4), 12월 계약 `aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md`(C-06·C-07·C-08·C-10·C-12·C-15·C-17), 이 단계 질문 `contract-design-questions.md`(Q1~Q3), 지금 코드(`api/src/publications/publish.service.ts`·`pdf-publish.ts`, `api/src/common/errors/api-exception.filter.ts`·`error-codes.ts`).

## 공통 전제

- **깊이(Q1):** 12월 C-12와 같이 경로·메서드·핵심 칸·오류 코드만 고정한다. 요청 칸의 검증 값과 그 밖의 응답 칸은 U1 기능 설계가 정하고, U2·U3 기능 설계는 그것을 따른다.
- **12월 계약과의 관계(Q2):** 12월 계약 문서는 승인 기록이라 고치지 않고, 코딩 절차의 기준 문서 줄도 고치지 않는다. 이 작업이 바꾸는 계약은 이 문서의 「바뀌는 12월 계약」에만 둔다.
- **이어 쓰는 것:** 오류 본문 `{ code, message, details? }`, 회원 API 인증(Bearer Access 토큰과 Refresh 쿠키)·CSRF·`/v1` 접두어, 12월 계약의 「에러 대응 최소선」(실패를 숨기지 않음, 다시 시도는 사람이 함, 자동 재시도 없음, 함께 바뀌어야 하는 것만 한 트랜잭션).
- **판본:** 판본 번호를 두지 않는다. 모든 경계가 같은 api 프로세스 안의 모듈 호출이거나 한 web이 부르는 HTTP이고, 모든 단위가 한 작업 브랜치에서 2026-11-30까지 dev에 들어간다.
- **자료 보호:** 프리셋 이름과 담긴 자료 내용을 로그와 오류 응답에 싣지 않는다(NFR4). 오류 응답에는 프리셋 ID와 자료 ID만 싣는다.

## Contracts

| # | Provider Unit | Consumer | Mechanism | Owner |
|---|---|---|---|---|
| P-1 | u1-preset-contract | u2-applicant-screens | HTTP REST `/v1/presets` | U1 담당 |
| P-2 | u1-preset-contract | u2-applicant-screens | HTTP REST `POST /v1/publications`(요청과 막힘 응답) | U1 담당 |
| P-3 | u1-preset-contract | u3-reader-views, External: 받은 사람 브라우저(C-12) | 공유 DB 칸(C-07) + api 안 TS 인터페이스(C-10) + HTTP 응답 | U1 담당 |
| P-4 | u1-preset-contract | u1-preset-contract 안의 조각 나누기·기본 요약·질의응답 머리글·받은 링크 읽기(12월에는 다른 담당의 코드) | api 안 TS 인터페이스(「앞선 사본인가」) | U1 담당, 받은 링크 읽기 담당·JD 요약 담당이 계약 PR에서 함께 봄 |
| P-5 | u1-preset-contract | External: Claude 웹·Desktop(C-15 `read_shared_publication`) | MCP 도구 | U1 담당, 받은 링크 읽기 담당이 계약 PR에서 함께 봄 |
| P-6 | u1-preset-contract | 탈퇴·자료 지우기(C-06) | 공유 DB 규칙(외래 키 삭제 규칙) | U1 담당 |

U4(u4-privacy-policy)는 다른 단위와 경계가 없다.

## 계약 명세

### P-1 프리셋 경로

작성자(로그인 회원)만 부른다. 프리셋은 그 회원의 것만 읽고 쓰며, 남의 프리셋 ID와 없는 프리셋 ID는 구분하지 않고 404다(NFR2). 항목 수·글자 수·발행할 수 없는 자료는 저장하지 않고 읽을 때마다 센다(ADR-005).

```yaml
openapi: 3.0.3
info: { title: 발행 프리셋 — 프리셋 경로, version: "2026-11-19" }
servers: [{ url: /v1 }]
paths:
  /presets:
    get:
      summary: 내 프리셋 목록(50개까지 한 번에, 만든 순서, NFR6)
      responses:
        "200": "{ presets: PresetSummary[] }"
        "401": AUTH_REQUIRED
    post:
      summary: 프리셋 만들기
      requestBody: "{ name: string, items: PresetItemRef[] }"     # 이름 1~50자(앞뒤 공백 뺀 뒤), 항목 0~20개, 순서 = 배열 순서
      responses:
        "201": "{ presetId: uuid }"
        "400": VALIDATION_FAILED          # 이름·항목 수·같은 자료 두 번·전체 글 60,000자 넘음(violations로 칸과 이유)
        "401": AUTH_REQUIRED
        "404": RESOURCE_UNAVAILABLE       # 담으려는 자료가 없거나 남의 것
        "409": PRESET_LIMIT_REACHED       # 51번째(FR1.3), 새 코드
  /presets/{presetId}:
    get:
      summary: 프리셋 하나(편집 화면)
      responses:
        "200": PresetDetail
        "401": AUTH_REQUIRED
        "404": RESOURCE_UNAVAILABLE
    put:
      summary: 프리셋 고쳐 저장(만들 때와 같은 검증, FR1.13)
      requestBody: "{ name: string, items: PresetItemRef[] }"
      responses:
        "200": "{ presetId: uuid }"
        "400": VALIDATION_FAILED
        "401": AUTH_REQUIRED
        "404": RESOURCE_UNAVAILABLE
    delete:
      summary: 프리셋 지우기(이미 만든 발행본은 그대로, FR2.11)
      responses:
        "204": 지움
        "401": AUTH_REQUIRED
        "404": RESOURCE_UNAVAILABLE
components:
  PresetItemRef: "{ kind: CATCH | TEXT_MATERIAL | PDF_MATERIAL, sourceId: uuid }"
  PresetSummary:
    presetId: uuid
    name: string                       # 화면은 글자로만 그린다(NFR3)
    itemCount: integer
    textLength: integer                # 발행과 같은 셈(PublishableSource)
    overLimit: boolean                 # 전체 글 60,000자 넘음(FR1.14)
    unpublishableCount: integer        # 발행할 수 없는 자료 수(FR1.2, FR1.11)
  PresetDetail:
    presetId: uuid
    name: string
    items: "[{ kind, sourceId, title: string, unpublishableReason: PRIVATE | CONFIRMATION_REQUIRED | SOURCE_RESTRICTED | EXTRACTION_INCOMPLETE | null }]"
    # 자료마다의 글자 수를 싣는지는 U1 기능 설계의 첫 질문(아래 Open questions)
```

발행할 수 없게 된 자료가 담긴 채로 다른 것을 고쳐 저장할 수 있는지, 새로 담는 자료에 같은 자격을 요구하는지는 U1 기능 설계가 정한다(components.md Open Questions).

### P-2 발행 요청과 막힘 응답

12월에는 발행 요청이 U4 안의 web↔api라 계약이 아니었다. 이 작업에서는 U1이 api를, U2가 발행 화면을 맡아 단위 사이 경계가 된다. 요청 모양이 바뀌는 깨는 변경이며, U1의 계약 PR이 dev에 들어간 뒤 U2가 들어올 때까지 dev 발행 화면은 발행에 실패한다(units-generation Q2).

```yaml
openapi: 3.0.3
info: { title: 발행 프리셋 — 발행 요청, version: "2026-11-19" }
servers: [{ url: /v1 }]
paths:
  /publications:
    post:
      summary: 프리셋으로 발행(ADR-002)
      requestBody: "{ title: string, password?: string, presetIds: uuid[] }"   # 1~5개, 고른 순서, 같은 ID 두 번 안 됨. items 칸은 없어짐(정의 밖 칸은 지금처럼 400)
      responses:
        "201": 지금 응답 그대로(발행본 ID·링크 등)
        "400": "VALIDATION_FAILED — violations(presetIds 개수·중복, 항목이 0개인 프리셋, 항목 20개 넘음, 전체 글 60,000자 넘음 maxTotalLength), PDF 추출 미완료는 extractionIncomplete + details.blockedSources"
        "404": RESOURCE_UNAVAILABLE      # 고른 프리셋이 없거나 남의 것, 또는 프리셋 안 자료가 없음
        "409": "CONFIRMATION_REQUIRED | SOURCE_RESTRICTED | CATCH_PRIVATE — details.blockedSources"
        "429": "지금 그대로(빈도·DAILY_LIMIT_REACHED)"
components:
  blockedSources: "[{ presetId: uuid, kind: CATCH | TEXT_MATERIAL | PDF_MATERIAL, sourceId: uuid }]"
rules:
  - 한 응답은 이유 하나만 말한다. 지금 순서대로 먼저 걸린 이유의 코드와, 그 이유로 막힌 자료를 프리셋별로 싣는다(Q3)
  - 같은 자료가 두 프리셋에 있으면 blockedSources에 프리셋마다 한 줄씩 싣는다
  - CATCH_PRIVATE(409)는 새 코드다. 비공개 Catch를 공개로 바꾸는 동작은 없어진다(FR2.9)
  - 막힌 자료는 details.blockedSources 하나로만 알린다. 발행 거부만 쓰던 details.catchIds는 빼고, 추출 미완료도 items[i].sourceId 경로(violations) 대신 blockedSources로 알린다(2026-11-19 승인 검토 팀장 결정, R-03)
  - 항목이 0개인 프리셋을 presetIds에 넣으면 400 VALIDATION_FAILED violations로 거부한다(R-02). 화면에서 못 고르게 하는 것(FR2.4)과 별개로 서버도 막는다
  - 오류 응답 필터는 details에서 blockedSources를 옮기는 칸을 더하고 catchIds 칸을 뺀다(UUID와 정해진 kind 값만 옮김)
  - 막힘 이유와 프리셋 편집 화면의 이유(P-1 unpublishableReason)는 이렇게 대응한다: CONFIRMATION_REQUIRED ↔ CONFIRMATION_REQUIRED, SOURCE_RESTRICTED ↔ SOURCE_RESTRICTED, CATCH_PRIVATE ↔ PRIVATE, extractionIncomplete ↔ EXTRACTION_INCOMPLETE. 텍스트 자료는 막히는 이유가 없어 blockedSources에 오지 않는다(kind 값은 모양을 맞추려고 셋을 둔다)
  - 프리셋을 펴는 순서와 상한 세기: 고른 프리셋 순서, 그 안에서 프리셋 안 자료 순서. 같은 자료가 두 프리셋에 있으면 두 번 센다(FR2.4)
```

### P-3 사본의 프리셋 칸

C-07 표와 C-10 사본 읽기, C-12 받은 사람 응답에 프리셋 칸 둘을 더한다(ADR-003). 순서 번호는 발행본 전체에 이어 매긴다(FR6.1).

```yaml
# shared-schema: C-07 변경
table published_item:
  preset_ordinal: integer NOT NULL CHECK (preset_ordinal BETWEEN 1 AND 5)   # 고른 프리셋 순서
  preset_name: text NOT NULL                                               # 발행 당시 이름 복사. 같은 발행본·같은 순번이면 같은 이름(발행 코드가 지키고 시험)
  position: 그대로(발행본 전체에 1부터 이어 매김, unique(publication_id, position))
migration: 변경 전 발행본 행을 먼저 지우므로(FR5.1) NOT NULL 칸을 기본값 없이 더한다
# shared-schema: C-10 PublishedSnapshot 변경
PublishedSnapshot.items[]:
  presetOrdinal: integer
  presetName: string
  isFirstCopy: boolean        # P-4. api 안 소비자만 본다
# C-12 GET /public/links/{token} 응답(받은 사람 브라우저)
items[]: presetOrdinal, presetName 을 더한다. isFirstCopy 는 Publications가 응답에서 뺀다. 원본 ID는 어디에도 싣지 않는다
# 작성자 발행본 상세 응답도 presetOrdinal, presetName 을 더한다
```

web은 모르는 칸을 무시하므로(`publications-api.ts` `isPublishedItem`) 칸을 더해도 U3 전의 화면은 그대로 열린다.

### P-4 「앞선 사본인가」

```yaml
# shared-schema: api 안 (SnapshotContract, ADR-006)
rule: 같은 (item_kind, source_id)의 항목 가운데 position이 가장 작은 항목만 isFirstCopy = true
compute: Publications의 사본 읽기(readSnapshot)가 계산해 싣는다. 조각 나누기(C-08 chunkInTransaction)는 published_item에서 source_id를 더 읽어 같은 함수를 부른다
consumers:
  - 조각 나누기(C-08): isFirstCopy인 항목만 조각으로 만든다. seq는 지금처럼 발행본 전체에 1부터
  - 기본 요약 근거: isFirstCopy인 항목만
  - 질의응답 머리글: isFirstCopy인 항목만으로 표 글자를 매기고 둘째 줄의 같은 작업 수를 센다(겹친 사본이 없으면 지금과 글자까지 같다)
  - 받은 링크 읽기(P-5): isFirstCopy인 항목만
  - JD 요약: 조각 검색을 쓰므로 함께 따른다(코드 변경 없음)
not-exposed: source_id와 isFirstCopy는 받은 사람 응답(C-12)에 싣지 않는다
```

### P-5 받은 링크 읽기(C-15 변경)

```yaml
# shared-schema: MCP tools (C-15 read_shared_publication 변경)
read_shared_publication:
  input:  그대로 { link, cursor? }
  output: 모양 그대로 { notice, title, publishedAt, expiresAt, items: [{ position, itemKind, title, content, continued? }], nextCursor }
  changes:
    - items는 isFirstCopy인 항목만 순서대로 싣는다. 빠진 사본의 position은 건너뛴다(Q9, FR6.2에 더함, AC3.6.2를 대신함)
    - 프리셋 구분과 이름은 싣지 않는다(FR6.2, ADR-007)
    - cursor 모양({ position, offset })은 그대로다
```

### P-6 새 표의 연쇄 삭제(C-06 적용)

```yaml
# shared-schema: DB 규칙(C-06 그대로 적용)
table preset:
  preset_id: uuid PK
  member_id: uuid NOT NULL  FK member_account ON DELETE CASCADE
  name: text NOT NULL
  created_at, updated_at: timestamptz NOT NULL
table preset_item:
  preset_item_id: uuid PK
  preset_id: uuid NOT NULL  FK preset ON DELETE CASCADE
  position: integer NOT NULL
  catch_id: uuid NULL       FK catch_asset ON DELETE CASCADE
  text_material_id: uuid NULL FK text_material ON DELETE CASCADE
  pdf_material_id: uuid NULL  FK pdf_material ON DELETE CASCADE
  check: 셋 가운데 정확히 하나만 채움
  # 한 프리셋 안 같은 자료 한 번(유일 조건), 순서 유일 조건은 U1 기능 설계
withdrawal-table: U1의 PR에서 api/docs/member-withdrawal-deletion.md 표에 preset(회원), preset_item(프리셋·Catch·텍스트 자료·PDF) 행을 더한다
check: 회원 연쇄 삭제 시험(test/db/member-cascade-delete.test.cjs)과 자료 지우기 시험을 U1이 함께 돌린다
```

## 바뀌는 12월 계약

12월 계약 문서(`260925-intent-12/inception/contract-design/contract-summary.md`)는 고치지 않는다. 이 작업이 반영되면 아래처럼 바뀐다.

| 12월 계약 | 이 작업에서 | 이 문서 |
|---|---|---|
| C-06 새 표와 따라 지워지는 부모 | preset(회원), preset_item(프리셋·Catch·텍스트 자료·PDF)이 더해진다 | P-6 |
| C-07 published_item | preset_ordinal·preset_name 칸이 더해지고, position은 발행본 전체에 이어 매긴다. 「작성자가 고른 순서」는 「고른 프리셋 순서, 그 안에서 프리셋 안 자료 순서」가 된다 | P-3 |
| C-08 publish-sequence 3단계 | 「비공개 Catch 공개 전환(10월 로직)」이 없어진다. 조각 나누기는 앞선 사본만 조각으로 만든다 | P-2, P-4 |
| C-10 PublishedSnapshot | items에 presetOrdinal·presetName·isFirstCopy가 더해진다 | P-3, P-4 |
| C-12 GET /public/links/{token} | 응답 items에 presetOrdinal·presetName이 더해진다(isFirstCopy는 빠짐) | P-3 |
| C-15 read_shared_publication | 겹친 사본은 앞선 것만 싣는다 | P-5 |
| 발행 거부 응답(12월 U4 기능 설계, 오류 필터) | details.catchIds와 추출 미완료의 items[i].sourceId 경로 대신 details.blockedSources 하나로 알린다. 빈 프리셋은 400 | P-2 |
| C-17 PDF 발행 순서 | PDF 사본 파일은 항목마다 따로 복사한다(같은 PDF가 두 프리셋에 있으면 두 벌). 잠그는 원본 ID는 중복을 없앤 집합이다 | P-2 |

## Contract ownership rules

- **주인은 제공 단위다.** P-1~P-6 모두 U1 담당이 인터페이스·표·마이그레이션을 가진다.
- **계약 PR 먼저:** U1은 발행 요청·사본 계약 변경을 먼저 PR로 올려 팀원 3, 받은 링크 읽기 담당, JD 요약 담당의 리뷰를 받는다(requirements Constraints). 이 PR에는 P-4·P-5의 코드 변경이 함께 들어 담당이 자기 코드 변경을 같이 본다.
- **깨는 변경:** P-2(요청 모양)와 P-5(겹친 사본 빼기)는 깨는 변경이다. 위 계약 PR의 리뷰로 합의한다. 그 밖의 칸 더하기(P-3)는 더하는 변경이고, 소비자는 모르는 칸을 무시한다.
- **단위 안 세부:** 검증 값과 그 밖의 응답 칸은 U1 기능 설계가 정하고 그 승인으로 끝난다. U2·U3은 고치지 않고 U1 담당에게 요청한다.
- **기준 문서:** 코딩 절차의 기준 문서 줄은 고치지 않는다(Q2). 이 작업이 바꾼 계약은 이 문서의 「바뀌는 12월 계약」이 기준이다.

## Open questions

| Contract | Question | Blocks |
|---|---|---|
| P-1 | 편집 화면이 자료마다의 글자 수를 얻는 곳(PresetDetail에 싣는지, 따로 묻는지). 못 얻으면 다듬은 화면 M3의 막힘 이유와 글자 수 표시를 다시 정한다 | u2-applicant-screens(U1 기능 설계 첫 질문) |
| P-1 | 발행할 수 없게 된 자료가 담긴 프리셋을 고쳐 저장할 때와 새로 담는 자료의 자격 검사 | u2-applicant-screens(U1 기능 설계) |
| P-2 | 발행 트랜잭션에서 프리셋 행을 잠그는 방식과 잠금 순서에서의 자리, 프리셋 저장·지우기와 발행이 함께 돌 때의 결과 | 없음(U1 안, U1 기능 설계) |
| P-2 | 막힘 이유를 고르는 순서(미확인 → 보호 → 비공개 → 추출 미완료 → 상한)를 지금 순서에 어떻게 넣는지 | u2-applicant-screens(U1 기능 설계) |
| P-3 | 변경 전 발행본 PDF 사본 파일을 지우는 방법(마이그레이션은 파일 저장소를 지우지 못함) | 없음(U1 안, U1 기능 설계) |
| P-4 | isFirstCopy 칸 이름과 받은 사람 응답에서 빼는 코드 위치 | 없음(U1 안, U1 기능 설계) |
| — | 본인 Catch 목록의 「담을 수 있는 Catch만」 조건(쿼리 이름, cursor와 함께 쓰는 법) | 없음(U2 안, U2 기능 설계) |
