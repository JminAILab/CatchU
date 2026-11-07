# CR2 소속 저장 — 엔티티

입력: 구성 요소 `inception/domain-design/components.md`(CatchRegistry 엔티티), ADR-001·ADR-002, 계약 C1·C2, 요구사항 FR1, 이 단계의 답 `functional-design-questions.md`(Q1 A, Q2 A).

새 엔티티는 소속 기록(CommitAssignment) 하나다. 기존 Catch(CatchAsset)는 칸을 바꾸지 않고 유일 조건 하나만 더한다. worker 쪽 값(소속 커밋 집합, 후보의 본인 커밋 목록)은 저장하지 않는 계산 값이라 아래 「계산 값」에 따로 적는다.

```yaml
entities:
  - name: CommitAssignment
    description: >
      한 회원·한 GitHub 저장소 안에서 커밋 SHA 하나가 어느 Catch에 속하는지 적은 기록.
      처음 등록될 때 한 번 쓰고 바꾸지 않는다. Catch를 따라서만 지워진다.
    owner_component: CatchRegistry
    identifier: [memberId, githubRepositoryId, commitSha]
    attributes:
      - name: memberId
        type: uuid
        required: true
        references: CatchAsset.ownerId (catchId와 한 쌍)
        constraints: 그 Catch의 주인과 같아야 한다(DB 외래 키로 막음)
      - name: githubRepositoryId
        type: string
        required: true
        constraints: >
          분석 요청의 저장소 ID(analysis_request.repository_id, GitHub 저장소 ID) 그대로.
          빈 문자열이 아니다. 불투명 문자열로 다룬다(대소문자·앞 0을 바꾸지 않음)
      - name: commitSha
        type: string
        required: true
        constraints: 소문자 16진수 40자
      - name: catchId
        type: uuid
        required: true
        references: CatchAsset.catchId (memberId와 한 쌍)
      - name: assignedAt
        type: timestamp
        required: true
        default: 쓴 트랜잭션의 시각
    entity_constraints:
      - (memberId, githubRepositoryId, commitSha) 유일. 같은 열쇠의 두 번째 쓰기는 무시한다(오류 아님)
      - (catchId, memberId)는 CatchAsset(catchId, ownerId)를 가리키는 외래 키이고, Catch가 지워지면 함께 지워진다
      - 회원·분석 요청을 직접 가리키는 외래 키는 두지 않는다(지우는 길은 Catch 하나)
    relationships:
      - target: CatchAsset
        cardinality: many-to-one
        direction: CommitAssignment -> CatchAsset
        note: Catch 하나에 소속 기록 0개 이상. CR2 배포 전에 만든 Catch는 0개일 수 있다

  - name: CatchAsset
    description: 기존 Catch. 칸은 바꾸지 않는다.
    owner_component: CatchRegistry
    identifier: [catchId]
    attributes:
      - {name: catchId, type: uuid, required: true, unique: true}
      - {name: ownerId, type: uuid, required: true, references: 회원}
      - {name: workIdentity, type: string, required: true}
      - {name: title, type: string, required: false}
      - {name: workFacts, type: list<string>, required: true}
      - {name: draft, type: object, required: true}
      - {name: authorDescription, type: string, required: false}
      - {name: authorDescriptionUpdatedAt, type: timestamp, required: false}
    entity_constraints:
      - 지금 있는 것 그대로 — (ownerId, workIdentity) 유일, (sourceRequestId, sourceResultId, sourceCandidateId) 유일, 회원·분석 요청 삭제 때 함께 지워짐
      - 더하는 것 — (catchId, ownerId) 유일(소속 기록의 한 쌍 외래 키가 가리킬 대상, ADR-002)
    relationships:
      - target: CommitAssignment
        cardinality: one-to-many
        direction: CatchAsset -> CommitAssignment
```

## 계산 값(저장하지 않음)

| 이름 | 어디서 | 뜻 |
|---|---|---|
| 소속 커밋 집합(`assignedCommitShas`) | api WorkerContext가 시도마다 만들어 worker에 넘긴다(C1) | 그 시도의 회원·GitHub 저장소 ID의 소속 기록 SHA 전체. 순서·상한 없음. 없으면 빈 집합. 분석이 거듭되며 누적되므로 결정 기록 ADR-003의 「최대 3,000」(요청 하나가 모으는 커밋 수)보다 커질 수 있다. worker는 응답을 1 MiB(약 24,000개)까지 받는다(CR2 비기능 요구사항 Q1) |
| 후보의 본인 커밋 목록(`ownCommitShas`) | worker CandidateGrouping이 후보마다 만든다(C2) | 지금 근거 20건을 고르던 바로 그 본인 커밋 목록 전체(소속 커밋을 뺀 뒤 남은 변경의 것). 1개 이상, 중복 없음, 최대 3,000 |
| 뺀 뒤 단위 | worker CandidateGrouping 안 | 단위를 지금 규칙대로 다 정한 뒤 소속 변경을 뺀 단위(Q1 A). 남은 본인 기여 변경이 없으면 버린다 |

## 요약

- 소속 기록은 회원·저장소·SHA로 하나이고, Catch를 (Catch ID, 회원) 한 쌍으로 가리킨다. 회원이 Catch 주인과 다르면 DB가 거부한다.
- 소속 기록은 쓰기만 하고 고치지 않는다. 같은 열쇠가 다시 오면 무시한다.
- Catch는 지금처럼 회원 삭제·분석 요청 삭제로 지워지고, 소속 기록은 그 Catch를 따라 지워진다. 탈퇴 서비스 코드는 바꾸지 않는다.
- worker는 소속 기록을 저장하지 않는다. 시도마다 받은 집합으로 계산만 한다.
