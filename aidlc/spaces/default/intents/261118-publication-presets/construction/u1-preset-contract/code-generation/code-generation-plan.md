# Code Generation Plan — u1-preset-contract

## Summary

- Builds: 프리셋 저장·세기 API, 발행 판정 규칙 떼기, 프리셋 ID 발행, 사본의 프리셋 칸과 앞선 사본 거르기(조각·요약·질의응답 머리글·받은 링크 읽기), 변경 전 발행본 버리는 마이그레이션
- Touches: 새 `api/src/presets/`·`api/src/publishable-source/`, `api/src/publications/`(입력·발행·사본·응답), `api/src/published-index/`, `api/src/rag-answer/`, `api/src/claude-mcp/`, `api/src/common/errors/`, 마이그레이션 1개, `api/docs/` 7개, `api/CONVENTIONS.md`, `api/test/` 시험
- Tests: 새 시험 파일 6개(약 45건, 단위·DB 통합·api 끝까지 잇는 시험 1개)와 기존 시험 고침(발행·사본·요약·질의응답·받은 링크 읽기·조각·연쇄 삭제)

근거: 기능 설계 `construction/u1-preset-contract/functional-design/`(entities·rules·functional-spec, 검토 review-01), NFR 요구 `nfr-requirements/`(검토 review-01), NFR 설계 `nfr-design/`(검토 review-01), 계약 `inception/contract-design/contract-summary.md`, 단위 `inception/units-generation/unit-of-work.md`·`unit-of-work-story-map.md`, Bolt 계획 `inception/delivery-planning/bolt-plan.md` B1, 요구사항 `inception/requirements-analysis/requirements.md`.

이 단위는 api만 바꾼다. web은 바꾸지 않는다(사본 칸이 늘어도 web 응답 검사는 모르는 칸을 무시한다). 이 단위가 dev에 들어간 뒤 U2가 들어올 때까지 dev 발행 화면은 발행에 실패한다(단위 Q2).

## 앞 단계 검토에서 넘어와 이 계획에 넣은 것

| 출처 | 반영 |
|---|---|
| 기능 설계 R-02 | 프리셋 항목 position은 저장 때 1부터 빈틈없이, 원본 삭제 연쇄로 빈자리 허용, 읽을 때 position 순(Step 6) |
| 기능 설계 R-03·NFR4.3 | 받은 링크 열람·작성자 상세 응답 둘 다에서 isFirstCopy를 뺀다(Step 7) |
| 기능 설계 R-04·NFR2.12 | isFirstCopy를 사본 항목 필수 칸으로, 기존 시험 사본과 `in-memory-publication-access.ts`도 고친다(Step 7, Step 11) |
| 기능 설계 R-05·NFR2.13 | 발행 전체 글 합계를 편 항목마다 더한다(PDF도 두 번)(Step 8) |
| 기능 설계 R-06 | violations field: 프리셋 저장 `name`·`items`, 세기 `items`, 발행 `presetIds`·`presetIds[i]`(Step 6, Step 8) |
| 기능 설계 R-07 | 제목 없는 Catch는 세기·프리셋 응답도 `UNTITLED_CATCH_TITLE`(Step 4) |
| 기능 설계 R-08·NFR2.9 | 같은 프리셋 동시 저장의 500을 받아들인다(잠금 없음) |
| NFR 요구 R-01 | 프리셋 경로는 Bearer 인증 가드만, CSRF 검사 없음(Step 6) |
| NFR 요구 R-02 | 오류 필터가 blockedSources를 옮기고 catchIds를 뺀다(Step 9) |
| NFR 요구 R-03·NFR2.10 | 읽기 경로에서 기록 문제가 하나라도 있으면 요청 전체 500(Step 4) |
| NFR 설계 Major 1 | 목록·상세·세기는 읽기 전용 REPEATABLE READ 한 트랜잭션(본인 Catch 목록·받은 링크 열람과 같음). 같은 스냅샷에서 항목의 원본 행이 없으면 500(Step 6) |
| NFR 설계 Major 2 | 판정을 「종류별 묶음 읽기」와 「미리 읽은 Map만 받는 순수 판정 함수」로 나눠 조회 수를 고정한다. 발행은 같은 판정 함수를 잠근 행에 쓴다(Step 4) |
| NFR 설계 Minor | 펴기는 빈도·본문·동의 다음(W4 순서)(Step 8). PDF 글자 수는 SQL 집계(`sum(char_length)`)로(Step 4). 목록 색인 `(member_id, created_at, preset_id)`(Step 5) |

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
      "text": "- **Methodology**: custom\n- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.\n- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. 작업에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다."
    },
    {
      "layer": "project",
      "text": "- ALWAYS Unit 확인 명령은 --timeout-ms 3600000(60분)으로 돌린다. 시작 전에 pmset -g batt로 충전기 연결을, sysctl -n vm.loadavg로 부하(1분 평균 6 미만)를 보고, 끝나면 결과와 함께 api·web·worker 각각 걸린 시간을 알린다. 기본 상한 30분은 배터리로 돌 때 api 시험 도중에 걸려 멈췄다. (learned 2026-11-10)"
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
  "input_sha256": "sha256:2c6dfe11bf7b84b526de04b91c6ffa1bf16c0999abc8c900b38b4489cf6c37b7",
  "contract_sha256": "sha256:6ff05b9b42bd7dbad0e63d173bb508a9fb24b4a1436e3bdb2f5706fc9118f55c"
}
```

## Steps

### Step 1: 구조 잡기 — [x]

- 새 폴더 `api/src/presets/`(PresetLibrary)와 `api/src/publishable-source/`(PublishableSource)를 만든다. `api/src/application.module.ts`에 `PresetsModule`을 등록한다.
- 이야기: US1.1~US1.6, US2.1~US2.5

### Step 2: 시험 실행기 확인 — [x]

- 지금 실행기 `api/scripts/test-with-db.cjs`가 인자로 준 파일만 첫째 DB에서 돈다. 이 단위 명령은 `unit-test-instructions.md`에 적는다. pgvector가 있는 5433 DB를 쓰도록 `TEST_DB_PORT=5433`를 명령에 붙인다.
- 지금 발행·사본 시험이 바꾸기 전 트리에서 통과하는지 이 명령으로 먼저 돌려 본다(기준선).

### Step 3: 시나리오·기대 결과·실패 조건 먼저 정하기 — [x]

팀 관행 순서대로 시험 코드보다 먼저 아래를 `unit-test-instructions.md` 「시나리오」 표로 확정한다(시험 파일은 Step 11에서 쓴다).

- 저장: 이름 1~50자·공백·51자, 50개째·51개째, 항목 0·20·21개, 중복, 60,000자 경계, 남의 자료, 고치기 통째 교체와 실패 때 그대로, 지우기(BR1.1~BR1.9)
- 세기: 1·50·51개, 중복, 남의 자료, 이유 넷과 null, 제목 없는 Catch(BR2.1~BR2.4)
- 목록·상세: 50개 한 번에, 조회 수 고정(프리셋 1개와 50개), 숨긴 Catch·보호·추출 미완료 이유, 길어진 원본의 overLimit, 기록 문제 Catch로 500, 스냅샷 안 원본 없음 500
- 발행: presetIds 1~5·중복·옛 items 400, 남의 프리셋 404, 빈 프리셋 400, 20개 초과, 같은 자료 두 프리셋(사본 둘·두 번 세기·PDF 두 번 세기), 막힘 넷(blockedSources, catchIds 없음), 공개 전환 없음, 순서 번호 이어 매김, presetOrdinal·presetName 복사
- 앞선 사본: 판정 함수, 조각·요약 근거·질의응답 머리글·받은 링크 읽기가 앞선 사본만 씀, 받은 사람·작성자 응답에 isFirstCopy·source_id 없음
- 마이그레이션·삭제: up·down, 변경 전 발행본이 지워지고 옛 링크 404, 탈퇴 때 프리셋 지워짐, 텍스트 자료·PDF 지우면 그 항목만 빠짐
- 이야기: 위 묶음 전부

### Step 4: 발행 판정 규칙 떼기(PublishableSource) — [x]

- `api/src/publications/snapshot-builder.ts`의 사본 내용 만들기·`snapshotTextLength`·`codePointLength`·`UNTITLED_CATCH_TITLE` 쓰임을 `api/src/publishable-source/source-content.ts`로 옮기고, 발행 쪽 import를 바꾼다(파일은 옮긴 뒤 지운다).
- `publish.service.ts`의 `assertCatchesEligible`을 둘로 나눈다(NFR 설계 Major 2).
  - 읽기: `api/src/publishable-source/source-reader.ts` — 종류별 ID 묶음 SQL(Catch 행·근거·소속 기록·보호 관측 / 텍스트 자료 / PDF 행과 쪽 글 합계 `sum(char_length(text)) FILTER (WHERE readable)`). 잠그지 않는 변형(읽기 경로용)과 지금 잠금 SQL을 쓰는 변형(발행용)을 둔다.
  - 판정: `api/src/publishable-source/eligibility.ts` — 미리 읽은 Map만 받는 순수 함수. 자료마다 이유 하나(확인 필요 → 보호 → 비공개, PDF 추출 미완료). 원 요청 불일치·보호 관측 없음·불완전이면 지금처럼 `PublishIntegrityError`를 던진다(NFR2.10).
- 발행은 같은 판정 함수를 잠근 행에 쓰고, 지금 순서(확인 필요 → 기록 문제 → 보호)를 지킨 뒤 비공개를 붙인다(Step 8).
- **중간 확인**: 이 단계 직후 지금 발행 시험(`api/test/publications/publish-api.test.cjs`, `publish-pdf.test.cjs`)이 그대로 통과한다(Bolt B1 완료 조건).
- 이야기: US1.6, US2.2, US2.4

### Step 5: 마이그레이션과 엔티티 — [x]

- `api/src/database/migrations/<13자리 시각>-AddPublicationPresets.ts` 하나: up = `preset`(회원 연쇄 삭제, 색인 `(member_id, created_at, preset_id)`) → `preset_item`(프리셋·catch_asset·text_material·pdf_material 연쇄 삭제, 셋 중 하나만 CHECK, `(preset_id, position)` 유일, 종류별 `(preset_id, <칸>)` 부분 유일) → `DELETE FROM publication` → `published_item`에 `preset_ordinal integer NOT NULL CHECK (1~5)`, `preset_name text NOT NULL` 추가. down = 칸 둘 제거 → 표 둘 제거(지운 발행본은 되살리지 않음). 제약 이름은 지금 규칙(`pk_`·`uq_`·`ck_`·`fk_`·`ix_`).
- 엔티티: `api/src/presets/preset.entity.ts`, `preset-item.entity.ts`(지금 엔티티처럼 `@Check`·`@ForeignKey(..., deleteWithParent)`), `api/src/publications/publication.entity.ts`에 칸 둘.
- `api/src/database/foreign-keys.ts` 등 외래 키 목록이 있으면 새 외래 키를 더한다.
- 이야기: US2.5, US3.1(AC3.1.4), US4.1, US4.2

### Step 6: 프리셋 저장·세기 API(PresetLibrary) — [x]

- `api/src/presets/preset-input.ts`: 본문 허용 칸(`name`·`items` / `items`), UUID·kind 모양, 개수·중복. violations field는 `name`·`items`(R-06).
- `api/src/presets/preset-store.ts`: 목록·상세·세기는 읽기 전용 REPEATABLE READ 한 트랜잭션에서 프리셋 행 → 항목 행 → `source-reader`(잠그지 않는 변형) → `eligibility`로 ItemMeasure·PresetSummary를 만든다. 항목이 가리키는 원본 행이 같은 스냅샷에 없으면 500(NFR 설계 Major 1). 만들기·고치기·지우기는 READ COMMITTED 한 트랜잭션(NFR2.7), 50개 확인(409 `PRESET_LIMIT_REACHED`), 자료 소유·존재(404), 60,000자(400 `maxTotalLength`), 고치기는 이름·updatedAt을 바꾸고 항목을 모두 지운 뒤 다시 쓴다. 프리셋 행은 잠그지 않는다(R-08).
- `api/src/presets/presets.controller.ts`: `GET/POST /v1/presets`, `GET/PUT/DELETE /v1/presets/:presetId`, `POST /v1/presets/measure`. 지금 발행 경로와 같은 Bearer 인증 가드와 `CurrentMemberId`(CSRF 없음, NFR 요구 R-01). 경로 ID가 UUID가 아니면 404.
- `api/src/presets/presets-log.ts`: 저장·지우기 성공·실패를 회원 ID·프리셋 ID·오류 코드로만(NFR4.5).
- `api/src/presets/presets.module.ts`: 발행 모듈에 펴기 함수(트랜잭션 밖 한 번 읽기, 회원 조건)를 내보낸다.
- 이야기: US1.1~US1.6, US2.2

### Step 7: 사본의 프리셋 칸과 앞선 사본(SnapshotContract) — [x]

- `api/src/publications/published-snapshot.ts`: 사본 항목에 `presetOrdinal`·`presetName`·`isFirstCopy`(필수)를 더하고, 판정 함수 `markFirstCopies(items: {itemKind, sourceId, position}[])`를 둔다(BR4.1).
- `api/src/publications/db-publication-access.ts` `readSnapshotIn`: 칸 셋과 `item_kind`·`source_id`를 읽어 판정 함수로 isFirstCopy를 싣는다. source_id는 사본 객체에 싣지 않는다.
- `api/src/publications/in-memory-publication-access.ts`: 같은 칸을 만든다(NFR 설계 Minor).
- 응답 변환: `api/src/publications/recipient-access.service.ts`(받은 링크 열람)와 `api/src/publications/publication-manage.service.ts`(작성자 상세)에서 isFirstCopy를 뺀다(R-03).
- 이야기: US2.3, US2.5, US3.1

### Step 8: 프리셋 ID로 발행(Publications) — [x]

- `api/src/publications/publish-input.ts`: 허용 칸 `title`·`password`·`presetIds`(1~5, UUID, 중복 없음). `items`는 정의 밖이라 400. `publications-config.ts`의 상한 상수는 그대로 쓴다.
- `api/src/publications/publish.service.ts`: 빈도 → 본문 → 동의 → 프리셋 펴기(PresetLibrary, 트랜잭션 밖 한 번, 남의·없는 프리셋 404) → 빈 프리셋 400 `presetIds[i]`·`emptyPreset` → 편 항목 20개 초과 400 `presetIds`·`maxItems` → PDF 추출 확인(막히면 400 `extractionIncomplete` + blockedSources)·항목마다 PDF 사본 복사 → 트랜잭션(회원 → 하루 횟수 → 중복 없는 ID 집합 잠금 → 판정(확인 필요 → 기록 문제 → 보호 → 비공개 `CATCH_PRIVATE`) → 근거·소속 → 편 항목마다 사본 → 전체 글은 편 항목마다 더함(PDF 두 번, R-05) → 400 `presetIds`·`maxTotalLength` → publication·published_item(`preset_ordinal`·`preset_name`) → 조각) → 커밋 뒤 등록. 비공개 Catch를 공개로 바꾸는 쓰기를 지운다(BR3.6).
- `api/src/publications/pdf-publish.ts`: 추출 미완료 오류를 blockedSources(편 항목의 프리셋별)로 바꾼다.
- `api/src/common/errors/error-codes.ts`: `PRESET_LIMIT_REACHED`(409 「프리셋은 50개까지 만들 수 있습니다.」), `CATCH_PRIVATE`(409 「비공개 Catch는 발행할 수 없습니다.」).
- 이야기: US2.1~US2.5

### Step 9: 오류 필터 — [x]

- `api/src/common/errors/api-exception.filter.ts` `withDetails`: `blockedSources`를 옮긴다(줄마다 presetId·sourceId는 UUID일 때만, kind는 세 값일 때만, 다른 속성 버림). `catchIds` 복사를 지운다(NFR4.2). 다른 곳에서 catchIds를 쓰는지 찾아 함께 정리한다.
- 이야기: US2.4

### Step 10: 앞선 사본을 쓰는 읽기 셋과 조각 — [x]

- `api/src/published-index/published-index-writer.ts` `readItems`: `source_id`를 더 읽고 `markFirstCopies`로 거른 항목만 `buildChunkDrafts`에 넘긴다. seq는 그대로 1부터(BR4.2).
- `api/src/rag-answer/summary-sources.ts`: isFirstCopy인 항목만 근거로(BR4.3).
- `api/src/rag-answer/qna-sources.ts` `buildItemContexts`: isFirstCopy인 항목만으로 표 글자·둘째 줄 수를 센다(BR4.3). 프리셋 이름을 읽지 않는다.
- `api/src/claude-mcp/mcp-shared-publication-reader.ts`·`mcp-shared-text.ts`: isFirstCopy인 항목만 싣고 빠진 position은 건너뛴다. cursor 모양은 그대로(BR4.4).
- 이야기: US3.3, US3.6

### Step 11: 시험 쓰기와 고치기 — [x]

새 시험(Step 3의 시나리오를 코드로):

- `api/test/publishable-source/eligibility.test.cjs`: 판정 순서·이유 넷·기록 문제 예외·글자 셈(PDF 집계 포함)·제목 대체(약 8건)
- `api/test/presets/preset-input.test.cjs`: 칸·이름·개수·중복·UUID(약 7건)
- `api/test/presets/presets-api.test.cjs`(DB): 만들기·고치기·지우기·50개·남의 것 404·목록 50개 한 번에·조회 수 고정·이유 표시·overLimit·기록 문제 500·세기 1~50(약 14건)
- `api/test/publications/publish-presets.test.cjs`(DB): presetIds 검사·빈 프리셋·20개·같은 자료 두 프리셋(사본 둘·두 번 셈·PDF 두 번)·막힘 넷과 blockedSources·공개 전환 없음·순서 번호와 프리셋 칸(약 10건)
- `api/test/publications/first-copy.test.cjs`: `markFirstCopies`, 받은 사람·작성자 응답에 isFirstCopy·source_id 없음(약 5건)
- `api/test/integration/preset-publish-chain.test.cjs`(DB, 끝까지 잇는 확인): 프리셋 둘(같은 Catch) → 발행 → 받은 링크 사본의 프리셋 칸 → 조각·받은 링크 읽기에 겹친 사본 한 번 → 탈퇴 때 프리셋 지워짐·자료 지우면 그 항목만 빠짐(약 3건)

고칠 기존 시험:

- `api/test/publications/publish-api.test.cjs`(items → presetIds, catchIds → blockedSources, 145행 PUBLIC 전환 → 비공개는 CATCH_PRIVATE), `publish-pdf.test.cjs`, `publication-access-db.test.cjs`, `in-memory-publication-access.test.cjs`, `recipient-api.test.cjs`, `publications-manage-api.test.cjs`
- 사본 객체를 만드는 시험에 isFirstCopy·presetOrdinal·presetName을 넣는다: `api/test/rag-answer/summary-sources.test.cjs`·`qna-sources.test.cjs`·`support.cjs`, `api/test/claude-mcp/mcp-shared-*.test.cjs`·`support.cjs`, `api/test/published-index/chunker.test.cjs`·`published-index-writer.test.cjs`·`support.cjs`, `api/test/jd/`의 사본 쓰는 시험
- `api/test/db/member-cascade-delete.test.cjs`(새 표 둘), `api/test/db/publication-tables.test.cjs`(칸 둘), `api/test/errors.test.cjs`(필터의 blockedSources·catchIds 제거)

앞선 사본 시험(파일별, 고칠 기존 시험에 더한다):

- `api/test/rag-answer/summary-sources.test.cjs`: 같은 Catch가 두 프리셋에 든 사본에서 그 근거가 요약 근거에 한 번만 쓰인다(BR4.3, ADR-006 팀장 결정).
- `api/test/rag-answer/qna-sources.test.cjs`: 같은 Catch가 두 프리셋에 든 사본에서 그 근거가 질의응답 근거에 한 번만 쓰이고, 머리글 표 글자가 건너뛰지 않고 이어지며, 둘째 줄의 같은 작업 수에 겹친 사본이 세지지 않는다(BR4.3, ADR-006 팀장 결정).
- `api/test/claude-mcp/mcp-shared-text.test.cjs`: 쪽 경계 바로 뒤 항목이 겹친 사본일 때, 다음 쪽이 그 겹친 사본을 건너뛰고 그다음 앞선 사본부터 이어진다(BR4.4).
- 이야기: 위 전부

### Step 12: 문서 — [x]

- `api/docs/member-withdrawal-deletion.md`: preset(회원), preset_item(프리셋·Catch·텍스트 자료·PDF) 행(C-06)
- `api/docs/publications.md`: 발행 요청 presetIds, 막힘 응답 blockedSources, 새 코드 둘, 공개 전환 없음, 사본 칸, 변경 전 발행본 버리기와 배포 전 파일 지우기 안내
- `api/docs/catch-visibility.md`: 발행이 비공개 Catch를 공개로 바꾸지 않음
- `api/docs/recipient-publication.md`·`recipient-read.md`: 사본 칸 둘, isFirstCopy·source_id를 싣지 않음
- `api/docs/published-index.md`·`rag-answer.md`·`claude-mcp.md`: 앞선 사본만 씀
- 새 `api/docs/presets.md`: 경로·검사·오류·세기 상한 50
- `api/CONVENTIONS.md`: 「파일 역할과 모듈 추가 위치」 표에 `src/presets/`(프리셋 저장·세기, [docs/presets.md](docs/presets.md))와 `src/publishable-source/`(발행 판정 규칙: 종류별 묶음 읽기와 순수 판정 함수) 줄을 더하고, 「공통 오류 처리」 표의 409 줄에 `PRESET_LIMIT_REACHED`·`CATCH_PRIVATE`를 더한다(같은 규칙을 적은 다른 문서 함께 고치기)
- 첫 PR 본문에 넣을 것(코드 밖): dev 발행 화면은 U2까지 실패, 배포 전 `members/*/publications/`만 지움(S3 `--dryrun` 먼저, `members/*/materials/`·`members/` 전체는 지우지 않음, 로컬은 선택)
- 이야기: US4.2, US3.1

### Step 13: 단위 확인과 기록 — [x]

- `unit-test-instructions.md`의 단위 명령을 돌려 통과를 확인한다. Unit 확인 명령은 Build and Test·단위 확인 때 `--timeout-ms 3600000`으로 돈다.
- `code-summary.md`와 `source-manifest.json`(이 단위가 만들고 고치고 지운 소스 경로 전부)을 쓴다.

## 이야기와 단계

| 이야기 | 단계 |
|---|---|
| US1.1~US1.5 | Step 5, 6, 11 |
| US1.6 | Step 4, 6, 11 |
| US2.1·US2.2·US2.4 | Step 4, 8, 9, 11 |
| US2.3·US2.5 | Step 7, 8, 11 |
| US3.1 | Step 5(AC3.1.4), 7 |
| US3.3 | Step 10, 11 |
| US3.6 | Step 10, 11 |
| US4.1·US4.2 | Step 5, 11, 12 |
