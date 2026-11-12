# NC3 다시 볼 곳 사실과 작업 시각 — 엔티티

입력:
- Unit `inception/units-generation/unit-of-work.md` NC3(`nc3-revisit-facts`, service)
- 구성 요소 `inception/domain-design/components.md`(Catches가 CatchAsset의 주인, Collection·CandidateGrouping·RevisitFacts·AnalysisProcessing·ResultReception), 설계 결정 ADR-002~004
- 계약 `inception/contract-design/contract-summary.md` C2(본인 목록 정렬·커서·응답 칸), C4(결과 메시지 Result "4", RevisitFact)
- 요구사항 `inception/requirements-analysis/requirements.md` FR12·FR13·FR14·FR15, NFR1·NFR7
- 이 단계의 답 `functional-design-questions.md` Q1~Q5

NC3는 새 표를 만들지 않는다. `catch_asset`에 칸 셋을 더하고(ADR-004), worker 안의 파일 기록에 파일 내용 식별값 하나를, 결과 메시지 후보에 칸 셋을 더한다. 본인 목록 커서의 모양이 바뀐다. 아래 YAML이 정본이다. `new: true`가 이 Unit에서 더하는 것이고, 나머지는 바꾸지 않고 읽기만 한다. 칸 이름은 계약 C2·C4를 따른다.

```yaml
entities:
  - name: ChangedFile
    owner: Collection (worker.collection)
    description: 커밋 상세 응답의 변경 파일 하나를 정규화한 값(records.py). worker 안에서만 쓰고 결과 메시지·DB에 담지 않는다. 분석이 끝나면 지금처럼 버린다.
    storage: worker 메모리(분석 한 번 동안)
    attributes:
      - {name: path, type: text, required: true, note: 지금 그대로}
      - {name: status, type: text, required: true, allowed: [added, removed, modified, renamed, copied, changed, unchanged], note: GitHub 값 그대로}
      - {name: previous_path, type: text or null, required: false, note: 지금 그대로(renamed일 때)}
      - {name: patch, type: text or null, required: false, note: 지금 그대로. 줄 맞춰 보기(BR3.1)에만 쓰고 결과에 담지 않는다}
      - name: blob_sha
        type: text or null
        required: false
        new: true
        constraints: ["소문자 16진수 40자", "꼴이 아니면 null"]
        source: 커밋 상세 응답 파일 항목의 `sha`. removed면 지우기 전 내용, 그 밖에는 바뀐 뒤 내용의 식별값이다(2026-11-11 CatchU 커밋 b289406e 실제 응답으로 확인)
        note: 새 호출 없이 이미 받는 응답에서 남긴다(FR12.4, NFR1). 옮긴 곳 판정(BR3.2)에만 쓴다

  - name: RevisitFact
    owner: RevisitFacts (worker 새 구성 요소). 저장은 Catches
    description: 같은 작업 안 본인 커밋끼리 본 사실 하나. 문장과 링크는 담지 않고 web이 만든다(C4 Q3 A). 결과 메시지 Candidate.revisitFacts, catch_asset.revisit_facts, 본인 Catch 응답 revisitFacts가 같은 모양이다.
    storage: 결과 메시지(JSON), catch_asset.revisit_facts(jsonb 배열의 원소)
    new: true
    attributes:
      - name: kind
        type: enum
        required: true
        allowed: [REWORKED_LINES, MOVED_FILE, EXTENSION_CHANGED, REVERTED, TEST_FILES_PRESENT]
      - name: paths
        type: list<text>
        required: true
        constraints:
          - "REWORKED_LINES 1개(뒤 커밋의 경로), MOVED_FILE·EXTENSION_CHANGED 2개(앞, 뒤), REVERTED 0개, TEST_FILES_PRESENT 1~20개"
          - "경로마다 1~1,024자(코드 포인트), 같은 사실 안에서 겹치지 않음"
      - name: commits
        type: list<text>
        required: true
        constraints:
          - "소문자 16진수 40자"
          - "REWORKED_LINES 2개(앞 커밋, 뒤 커밋), REVERTED 2개(되돌린 커밋, 되돌려진 커밋), MOVED_FILE·EXTENSION_CHANGED 1~2개, TEST_FILES_PRESENT 1~20개"
          - "모두 같은 후보의 ownCommitShas 안에 있음, 같은 사실 안에서 겹치지 않음"
    entity_constraints:
      - additionalProperties 없음(C4)
      - 한 Catch에 0~30개(Q1 A, BR2.5)

  - name: Candidate (결과 메시지 Result "4")
    owner: AnalysisProcessing(만듦), ResultReception(검사)
    description: worker 결과 메시지의 후보. 지금 칸은 그대로 두고 필수 칸 셋을 더한다(C4). 판본 "3" 결과는 api가 거부한다.
    storage: BullMQ 결과 큐 메시지
    attributes:
      - {name: ownCommitShas, type: list<text>, required: true, note: 지금 그대로(1~3,000개)}
      - name: revisitFacts
        type: list<RevisitFact>
        required: true
        new: true
        constraints: ["0~30개", "사실이 없으면 빈 배열"]
      - name: firstWorkAt
        type: date-time
        required: true
        new: true
        constraints: ["UTC, 초 단위 RFC3339(예 2025-03-02T10:00:00Z)", "firstWorkAt <= lastWorkAt"]
        source: 합친 뒤 본인 커밋들의 작성 시각(authored) 가운데 가장 이른 값(BR4.1)
      - name: lastWorkAt
        type: date-time
        required: true
        new: true
        source: 같은 목록의 가장 늦은 작성 시각(BR4.1)

  - name: CatchAsset
    owner: Catches
    description: 지원자의 Catch 하나(catch_asset 표). 새 칸 셋은 등록 때 한 번 쓰고 그 뒤 바꾸지 않는다. 지원자 응답과 본인 목록 정렬만 읽는다.
    storage: catch_asset 표(PostgreSQL), 마이그레이션으로 칸 셋을 더함
    attributes:
      - {name: catchId, type: uuid, required: true, unique: true, note: 지금 그대로. 정렬 뒷순위}
      - {name: ownerId, type: uuid, required: true, references: member_account, note: 지금 그대로(회원 연쇄 삭제)}
      - {name: authorDescription, type: text or null, required: false, note: 지금 그대로(NC1 걸러 보기 조건)}
      - name: revisitFacts
        column: revisit_facts
        type: jsonb (list<RevisitFact>)
        required: true
        new: true
        default: "[]"
        constraints: ["DB 검사: jsonb 배열", "원소 모양 검사는 등록(BR6.1)과 응답(BR8.1)이 한다"]
        note: 마이그레이션 전 행과 사실 없는 Catch는 빈 배열이다
      - name: firstWorkAt
        column: first_work_at
        type: timestamptz or null
        required: false
        new: true
        note: 마이그레이션 전 행은 null. 응답에 싣지 않는다
      - name: lastWorkAt
        column: last_work_at
        type: timestamptz or null
        required: false
        new: true
        note: 마이그레이션 전 행은 null. 본인 목록 정렬과 커서에만 쓰고 응답에 싣지 않는다(FR14.3)
    entity_constraints:
      - "DB 검사: first_work_at과 last_work_at은 둘 다 null이거나 둘 다 있고 first_work_at <= last_work_at"
      - 사본(published_item.snapshot)·공개 Catch 응답·Claude 연결 읽기는 새 칸 셋을 읽지 않는다(ADR-004, BR6.3)

  - name: OwnerCatchCursor
    owner: Catches
    description: 본인 Catch 목록 「더 보기」 위치. base64url JSON. 권한 증명이 아니라 조회 위치다(지금 그대로).
    storage: 응답 page.nextCursor → 다음 요청 cursor
    attributes:
      - {name: v, type: integer, required: true, allowed: [3], new: true, note: "2에서 3으로 올림(C2). 1·2는 400"}
      - {name: scope, type: text, required: true, note: "지금 그대로: 회원·repositoryId·sourceRequestId·authorDescription을 묶은 sha256(NC1 BR5.2)"}
      - name: after
        type: object
        required: true
        new: true
        attributes:
          - {name: lastWorkAt, type: text or null, required: true, constraints: ["DB 값을 밀리초 ISO 글(toISOString)로 옮긴 글, 또는 null"]}
          - {name: catchId, type: uuid, required: true}
        note: "지금은 catchId 글 하나다. 공개 Catch 목록 커서는 바꾸지 않는다(BR7.3)"

  - name: OwnerCatchResponse
    owner: Catches
    description: 본인 Catch 목록 항목과 상세 응답(같은 모양). 지금 칸은 그대로 두고 하나를 더한다(C2).
    storage: HTTP 응답(GET /v1/catches, GET /v1/catches/{catchId})
    attributes:
      - {name: hasAuthorDescription, type: boolean, required: true, note: NC1 그대로}
      - name: revisitFacts
        type: list<RevisitFact>
        required: true
        new: true
        note: catch_asset.revisit_facts 그대로. 작업 시각 두 칸은 응답에 없다

relationships:
  - {from: CatchAsset, to: RevisitFact, cardinality: "1 to 0..30", direction: CatchAsset이 jsonb 배열로 담는다}
  - {from: Candidate, to: RevisitFact, cardinality: "1 to 0..30", direction: 결과 메시지 후보가 담는다}
  - {from: RevisitFact, to: Candidate.ownCommitShas, cardinality: "commits 원소 n to 1", direction: 사실의 커밋은 같은 후보의 본인 커밋을 가리킨다}
  - {from: Candidate, to: CatchAsset, cardinality: "1..n to 1(같은 workIdentity)", direction: 등록이 새 Catch에 첫 후보의 칸을 쓴다(BR6.1)}
  - {from: ChangedFile, to: RevisitFact, cardinality: "n to 0..n", direction: 판정 재료일 뿐 사실에 파일 내용·줄 글자를 담지 않는다}
```

## 요약

- **worker 안:** 파일 기록(ChangedFile)에 `blob_sha` 하나를 남긴다. 결과 메시지에는 담지 않는다.
- **결과 메시지:** Result 판본 "4"의 Candidate에 `revisitFacts`·`firstWorkAt`·`lastWorkAt` 필수 칸이 붙는다. 사실은 종류·경로·커밋 식별값뿐이다.
- **DB:** `catch_asset`에 `revisit_facts`(jsonb 배열, 기본 빈 배열), `first_work_at`·`last_work_at`(timestamptz, null 가능)을 더한다. 등록 때 한 번 쓴다.
- **응답과 커서:** 본인 응답에 `revisitFacts`가 붙고 작업 시각은 붙지 않는다. 본인 목록 커서는 판본 3이 되고 위치가 (마지막 작업 시각 또는 없음, Catch 식별값) 한 쌍이 된다.
- **넣지 않는 곳:** 발행 사본, 공개 Catch 응답, Claude 연결 읽기, 받은 사람 AI 재료에는 새 칸 셋이 없다.

## Sources

- `inception/units-generation/unit-of-work.md` NC3
- `inception/domain-design/components.md`, `inception/domain-design/decisions.md` ADR-002·ADR-003·ADR-004
- `inception/contract-design/contract-summary.md` C2·C4
- `inception/requirements-analysis/requirements.md` FR12·FR13·FR14·FR15, NFR1·NFR7
- `inception/units-generation/unit-of-work-story-map.md`, `inception/user-stories/stories.md` US9~US11
- `construction/nc3-revisit-facts/functional-design/functional-design-questions.md` Q1~Q5
- 지금 코드: `worker/app/collection/records.py`·`normalize.py`, `api/contracts/repository-analysis/worker-messages.yaml`, `api/src/catches/owner-catch-input.ts`·`owner-catch-store.ts`·`public-catch-store.ts`·`catch-reader.ts`
