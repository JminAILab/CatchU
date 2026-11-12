# NC2 면접관 사본 칸과 표지 — 엔티티

입력:
- Unit `inception/units-generation/unit-of-work.md` NC2(`nc2-snapshot-fields`, service)
- 구성 요소 `inception/domain-design/components.md`(Publications가 CatchSnapshot의 주인, Catches가 CatchAsset·CatchEvidence의 주인)
- 계약 `inception/contract-design/contract-summary.md` C3(사본 선택 칸 넷)·C6(문장 대조)
- 요구사항 `inception/requirements-analysis/requirements.md` FR9·FR10
- 이 단계의 답 `functional-design-questions.md` Q1·Q2

NC2는 DB 표와 칸을 새로 만들지 않는다. 바뀌는 것은 발행 사본(jsonb, C-07)에 더하는 선택 칸 넷이다. 발행할 때 읽는 기존 칸 몇 개를 더 읽는다. 아래 YAML이 정본이다. 굵게 적은 칸이 새것이고, 나머지는 바꾸지 않고 읽기만 한다.

```yaml
entities:
  - name: CatchSnapshot
    owner: Publications
    description: 발행할 때 Catch 하나를 고정해 담은 사본. published_item.snapshot(jsonb)에 저장되고, C-10 readSnapshot과 C-12 받은 사람 응답이 같은 모양을 돌려준다. 발행 뒤에는 바뀌지 않는다.
    storage: published_item.snapshot (jsonb), 새 표·DB 칸 없음
    attributes:
      - {name: workFacts, type: list<text>, required: true, note: 지금 그대로}
      - {name: subjectContribution, type: text, required: true, note: 지금 그대로}
      - {name: evidence, type: list<SnapshotEvidence>, required: true, note: 항목마다 선택 칸 ownCommit이 더해진다}
      - {name: authorDescription, type: text or null, required: true, note: 지금 그대로}
      - {name: aiDraft, type: text or null, required: true, note: 지금 그대로}
      - {name: mismatch, type: boolean, required: true, note: 지금 그대로}
      - name: repositoryName
        type: text
        required: false
        new: true
        constraints: [비어 있지 않음, "「소유자/저장소」 꼴(owner 1~39자, name 1~100자, 등록 표 검사와 같음)"]
        source: 발행 때 repository_registration.owner + "/" + repository_registration.name (BR1.1)
        absent_when: 등록 행을 읽지 못함(안전망, BR1.1) 또는 이 변경 전 사본
      - name: authorDescriptionEditedMonth
        type: text
        required: false
        new: true
        constraints: ["^[0-9]{4}-(0[1-9]|1[0-2])$"]
        source: 발행 때 catch_asset.author_description_updated_at을 한국 시간(UTC+9)으로 바꾼 해와 달 (BR1.2)
        absent_when: authorDescription이 null 또는 이 변경 전 사본
      - name: workLimits
        type: list<text>
        required: false
        new: true
        constraints: [항목 1개 이상, 항목은 비어 있지 않음, 같은 글자의 항목 없음, 개수 상한 없음(Q2 A)]
        source: 발행 때 모든 근거의 catch_evidence.coverage_limits에서 문장 대조로 고른 것 (BR1.3)
        absent_when: 고른 문장이 없음 또는 이 변경 전 사본
    entity_constraints:
      - 새 칸 넷은 조각 나누기·검색·요약 근거·글자 수 합산(snapshotTextLength)의 대상이 아니다(BR1.5).
      - 다시 볼 곳 사실과 작업 시각은 담지 않는다(계약 C3 「넣지 않는 것」).
      - 칸이 없는 사본(이 변경 전 사본)도 올바른 사본이다(FR9.6).
    relationships:
      - {to: Publication, cardinality: "many-to-one", direction: "CatchSnapshot -> Publication", note: 지금 그대로}

  - name: SnapshotEvidence
    owner: Publications
    description: CatchSnapshot.evidence의 항목 하나. 발행 때 catch_evidence 한 행을 옮긴다.
    attributes:
      - {name: sourceUrl, type: text, required: true, note: 지금 그대로}
      - {name: sourceRevision, type: text, required: true, note: 지금 그대로}
      - {name: representedFacts, type: list<text>, required: true, note: 지금 그대로}
      - name: ownCommit
        type: boolean
        required: false
        new: true
        source: 근거 sourceUrl이 `/<소유자>/<저장소>/commit/<16진수 40자>`이고 그 식별값이 이 Catch의 소속 기록(commit_assignment)에 있으면 true, 아니면 false (BR1.4, 2026-11-10 NFR 요구 때 기여 범위 문장 대조에서 바꿈)
        default_when_absent: false로 읽는다(이 변경 전 사본, BR2.2)
    relationships:
      - {to: CatchSnapshot, cardinality: "many-to-one", direction: "SnapshotEvidence -> CatchSnapshot"}

  - name: CatchEvidence
    owner: Catches
    description: Catch의 근거 한 행(catch_evidence). NC2는 바꾸지 않고 발행 때 한 칸을 더 읽는다.
    attributes:
      - {name: sourceUrl, type: text, required: true, note: ownCommit 판정에도 쓴다(BR1.4)}
      - {name: sourceRevision, type: text, required: true}
      - {name: representedFacts, type: list<text>, required: true}
      - {name: contributionScope, type: text, required: true, note: NC2는 읽지 않는다(2026-11-10 BR1.4 바꿈)}
      - {name: coverageLimits, type: list<text>, required: true, note: 발행 때 새로 읽는다(workLimits 고르기)}
    relationships:
      - {to: CatchAsset, cardinality: "many-to-one", direction: "CatchEvidence -> CatchAsset"}

  - name: CommitAssignment
    owner: Catches
    description: 소속 기록(commit_assignment). 한 회원·한 저장소 안에서 커밋 하나가 어느 Catch에 속하는지 적는다. 등록 때 그 Catch의 ownCommitShas로 한 번 쓰고 바꾸지 않는다. NC2는 바꾸지 않고 발행 때 읽기만 한다.
    attributes:
      - {name: memberId, type: uuid, required: true, note: 기본 키}
      - {name: githubRepositoryId, type: text, required: true, note: 기본 키, analysis_request.repository_id 그대로}
      - {name: commitSha, type: text, required: true, constraints: ["^[0-9a-f]{40}$"], note: 기본 키}
      - {name: catchId, type: uuid, required: true, note: "(catch_id, member_id)로 Catch를 가리키는 외래 키, 색인 있음"}
    relationships:
      - {to: CatchAsset, cardinality: "many-to-one", direction: "CommitAssignment -> CatchAsset"}

  - name: CatchAsset
    owner: Catches
    description: Catch 원본(catch_asset). NC2는 바꾸지 않고 발행 때 한 칸을 더 읽는다.
    attributes:
      - {name: authorDescription, type: text or null, required: true}
      - name: authorDescriptionUpdatedAt
        type: timestamp or null
        required: true
        note: 발행 때 새로 읽는다. DB 검사가 authorDescription이 null일 때만 null이게 한다(ck_catch_asset_author_description_87d1b056)
    relationships:
      - {to: AnalysisRequest, cardinality: "many-to-one", direction: "CatchAsset -> AnalysisRequest", via: source_request_id, note: 지금 발행 잠금 조회가 이미 잇는다}

  - name: RepositoryRegistration
    owner: member-repositories(이 intent의 구성 요소 밖, 바꾸지 않음)
    description: 회원이 등록한 저장소 한 행(repository_registration). NC2는 발행 때 owner·name을 읽기만 한다.
    attributes:
      - {name: registrationId, type: uuid, required: true, unique: true}
      - {name: memberId, type: uuid, required: true}
      - {name: repositoryId, type: text, required: true}
      - {name: owner, type: text, required: true, constraints: [1~39자]}
      - {name: name, type: text, required: true, constraints: [1~100자]}
    relationships:
      - to: AnalysisRequest
        cardinality: "one-to-many"
        direction: "AnalysisRequest -> RepositoryRegistration"
        via: "(member_id, registration_id, repository_id), analysis_request.registration_id NOT NULL, 외래 키 fk_analysis_request_member_id_registration_id_repository_id"

  - name: OwnCommitReference
    owner: GithubLinkName(web, 계산값)
    description: 사본 근거 가운데 본인 커밋 근거 하나를 표지 판정에 쓰려고 화면에서 만든 값. 저장하지 않는다.
    attributes:
      - {name: repository, type: text, required: true, note: 근거 sourceUrl의 「소유자/저장소」}
      - {name: commitId, type: text, required: true, constraints: ["^[0-9a-f]{40}$(근거 커밋 주소의 식별값을 소문자로)"]}
    entity_constraints:
      - ownCommit이 true이고 sourceUrl이 GitHub 커밋 주소(`/commit/<16진수 40자>`)인 근거에서만 만든다(BR4.1).
      - 같은 (repository, commitId)는 하나로 센다(BR4.3).
```

## 엔티티 요약

| 엔티티 | 주인 | NC2에서 바뀌는 것 |
|---|---|---|
| CatchSnapshot | Publications | 선택 칸 셋(`repositoryName`·`authorDescriptionEditedMonth`·`workLimits`)을 더한다 |
| SnapshotEvidence | Publications | 선택 칸 `ownCommit`을 더한다. 없으면 false로 읽는다 |
| CatchEvidence | Catches | 바꾸지 않음. 발행 때 `coverageLimits`를 더 읽는다 |
| CommitAssignment | Catches | 바꾸지 않음. 발행 때 고른 Catch의 `commitSha` 목록을 읽는다(ownCommit 판정) |
| CatchAsset | Catches | 바꾸지 않음. 발행 때 `authorDescriptionUpdatedAt`을 더 읽는다 |
| RepositoryRegistration | member-repositories | 바꾸지 않음. 발행 때 `owner`·`name`을 읽는다 |
| OwnCommitReference | GithubLinkName | 화면에서만 만드는 계산값. 저장하지 않는다 |

## Sources

- `inception/units-generation/unit-of-work.md` NC2
- `inception/domain-design/components.md` Publications·Catches·GithubLinkName, 「Entity Ownership」
- `inception/contract-design/contract-summary.md` C3·C6
- `inception/requirements-analysis/requirements.md` FR9.1~FR9.7, FR10.1~FR10.3, 가정 A1·A7
- `construction/nc2-snapshot-fields/functional-design/functional-design-questions.md` Q1·Q2
- `construction/nc2-snapshot-fields/nfr-requirements/nfr-requirements-questions.md` Q2 덧붙임(ownCommit을 소속 기록으로)
- 지금 코드: `api/src/catches/entities/commit-assignment.entity.ts`, `api/src/publications/published-snapshot.ts`, `api/src/publications/snapshot-builder.ts`, `api/src/publications/publish.service.ts`(`CATCH_LOCK_SQL`·`EVIDENCE_SQL`), `api/src/catches/entities/catch-evidence.entity.ts`, `api/src/member-repositories/repository-registration.entity.ts`, `api/src/database/migrations/1793162230852-AddCatchAuthorDescription.ts`, `api/src/database/migrations/1793245460352-AddRepositoryRegistration.ts`
