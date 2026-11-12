# NC2 면접관 사본 칸과 표지 — 관측 설계

입력:
- NFR 요구 `construction/nc2-snapshot-fields/nfr-requirements/observability-requirements.md`와 검토 R-02
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/functional-spec.md`(W1)
- 이 단계의 답 `nfr-design-questions.md`(Q1 A)

## 안전망 경고 줄

- 사건 하나를 더한다: `PublicationLogEvent`에 `SNAPSHOT_REPOSITORY_NAME_MISSING`(이름은 코드 생성에서 다듬음).
- 칸: 지금 `PublicationLogEntry` 모양 그대로. `event`, `publicationId`, `memberId`만 채우고 `errorCode`·`jobKind`·`enqueue`는 null이다. 줄마다 같은 모양을 지킨다.
- 수준: `warn`.
- 남기는 때(Q1 A, 검토 R-02):
  1. 발행 트랜잭션 안에서 사본을 만들 때 저장소 등록 이름이 없어 `repositoryName`을 뺀 Catch가 하나라도 있으면 그 사실(참·거짓)을 트랜잭션 결과에 함께 돌려준다.
  2. 트랜잭션이 끝나 발행이 성공하면 지금 `publishSucceeded` 바로 옆에서, 그 값이 참일 때 경고 한 줄을 남긴다. Catch마다가 아니라 발행본마다 한 줄이다.
  3. 롤백되면 남기지 않는다. 그때는 지금처럼 `PUBLISH_FAILED`만 남는다.
- 싣지 않는 것: Catch ID, 저장소 이름·식별값, 제목, 작성자 글, SQL.

## 더하지 않는 것

- 지표·추적·알림·대시보드. 고른 한계 수, `ownCommit` 수, 표지 판정 결과의 로그.
- AI 지시를 바꿔도 AI 실행 로그는 그대로다.

## Sources

- `construction/nc2-snapshot-fields/nfr-requirements/observability-requirements.md`, `reviews/review-01.md`(R-02)
- `construction/nc2-snapshot-fields/functional-design/functional-spec.md`
- `nfr-design-questions.md` Q1 A
- 지금 코드: `api/src/publications/publications-log.ts`, `api/src/publications/publish.service.ts`(122행 `publishSucceeded`)
