# U7 저장소·분석 — 엔티티
## 근거와 적용 범위

작성일: 2026-10-29. [확인한 작성안](functional-design-questions.md)을 상세화한 U7 기능 설계다. 구현·실측 완료 기록이 아니다.

입력: [unit-of-work.md](../../../inception/units-generation/unit-of-work.md)(U7), [unit-of-work-story-map.md](../../../inception/units-generation/unit-of-work-story-map.md)(US1.2·US1.3), [stories.md](../../../inception/user-stories/stories.md)(수용 기준 12개), [requirements.md](../../../inception/requirements-analysis/requirements.md)(FR1.2·1.3·1.6·1.7·19.1), [components.md](../../../inception/domain-design/components.md)(RepositoryAnalysis), [contract-summary.md](../../../inception/contract-design/contract-summary.md)(공통 전제·C-03·C-04·C-06).

## 논리 모델 정본

기존 요청·동의·시도를 재사용하고, 회원별 직접 등록과 결과 이유를 표현하는 정보만 더한다. 아래는 논리 모델이며 물리 테이블·열 형식은 구현에서 기존 구조에 맞춘다. MemberAccount·GitHubConnection·Catch·DailyExecutionCount는 외부 소유 참조이며 새로 정의하지 않는다. token이나 자격정보 원문은 이 모델에 넣지 않는다.

```yaml
entities:
  - name: RepositoryRegistration
    description: 회원이 직접 등록하고 서버가 GitHub 식별자를 확인한 저장소
    attributes:
      - {name: registrationId, type: Identifier, required: true, unique: true}
      - {name: memberId, type: Identifier, required: true, references: MemberAccount.memberId}
      - {name: repositoryId, type: OpaqueString, required: true, minLength: 1}
      - {name: owner, type: String, required: true, minLength: 1}
      - {name: name, type: String, required: true, minLength: 1}
      - {name: repositoryUrl, type: HttpsUrl, required: true, constraints: "서버가 확인한 github.com 저장소 루트 주소"}
      - {name: scopeRevision, type: OpaqueString, required: true, constraints: "불변 수집 범위 정의를 참조"}
      - {name: registeredAt, type: Instant, required: true}
      - {name: lastVerifiedAt, type: Instant, required: true}
    constraints:
      - "memberId와 repositoryId의 조합은 유일하다"
      - "소유자 이름과 저장소 이름은 표시용이며 동일성은 repositoryId로 판단한다"
      - "등록 성공 당시 공개 확인은 이후의 공개 상태를 보장하지 않는다"
      - "회원 삭제 시 등록도 삭제하며 사용자용 등록 삭제 기능은 이 Unit에서 추가하지 않는다"
  - name: AnalysisConsent
    description: 접수 시각의 고지와 수집 범위를 고정한 요청별 동의
    attributes:
      - {name: consentId, type: Identifier, required: true, unique: true}
      - {name: requestId, type: Identifier, required: true, unique: true, references: AnalysisRequest.requestId}
      - {name: memberId, type: Identifier, required: true, references: MemberAccount.memberId}
      - {name: repositoryId, type: OpaqueString, required: true}
      - {name: accepted, type: Boolean, required: true, allowedValues: [true]}
      - {name: noticeRevision, type: OpaqueString, required: true, minLength: 1}
      - {name: scopeRevision, type: OpaqueString, required: true, minLength: 1}
      - {name: consentedScope, type: ScopeSnapshot, required: true}
      - {name: consentedAt, type: Instant, required: true}
    constraints:
      - "동의·요청·등록의 회원과 저장소 식별자가 같아야 한다"
      - "ScopeSnapshot은 허용 자료 종류와 불변 범위 판본, 실행 대상 좌표를 복원할 등록 참조를 가진다"
      - "이미 받은 동의는 변경하지 않으며 요청 삭제 시 함께 삭제한다"
  - name: AnalysisRequest
    description: 기존 분석 접수와 최신 시도를 연결하는 회원별 요청
    attributes:
      - {name: requestId, type: Identifier, required: true, unique: true}
      - {name: memberId, type: Identifier, required: true, references: MemberAccount.memberId}
      - {name: registrationId, type: Identifier, required: true, references: RepositoryRegistration.registrationId}
      - {name: repositoryId, type: OpaqueString, required: true}
      - {name: consentId, type: Identifier, required: true, unique: true, references: AnalysisConsent.consentId}
      - {name: currentAttemptId, type: Identifier, required: true, unique: true, references: AnalysisAttempt.attemptId}
      - {name: retryOfRequestId, type: Identifier, required: false, default: null, references: AnalysisRequest.requestId}
      - {name: requestState, type: Enum, required: true, allowedValues: [ACCEPTED], default: ACCEPTED}
      - {name: lifecycle, type: Enum, required: true, allowedValues: [ACTIVE, CLOSED], default: ACTIVE}
      - {name: submittedAt, type: Instant, required: true}
      - {name: updatedAt, type: Instant, required: true}
    constraints:
      - "같은 회원의 ACTIVE 요청은 기존 규칙대로 최대 한 건이다"
      - "재요청 참조는 자신이 아닌 같은 회원·저장소의 최신 종료 요청이다"
      - "재요청은 원 요청을 수정하지 않고 별도 요청을 생성한다"
      - "회원 삭제 시 요청·동의·시도와 기존 결과 관계를 연쇄 삭제한다"
  - name: AnalysisAttempt
    description: 기존 수집·생성·결과 반영 상태와 판정 근거
    attributes:
      - {name: attemptId, type: Identifier, required: true, unique: true}
      - {name: requestId, type: Identifier, required: true, references: AnalysisRequest.requestId}
      - {name: sourceMode, type: Enum, required: true, allowedValues: [LIVE, MOCK]}
      - {name: processing, type: Enum, required: true, allowedValues: [QUEUED, RUNNING, UNCERTAIN, SUCCEEDED, EMPTY, PARTIAL_FAILED, FAILED], default: QUEUED}
      - {name: application, type: Enum, required: true, allowedValues: [NOT_READY, PENDING, APPLYING, RECOVERING, APPLIED, APPLY_FAILED], default: NOT_READY}
      - {name: deadlineAt, type: Instant, required: true, constraints: "접수 시각과 적용 처리 시한에서 결정되는 논리 속성"}
      - {name: eligibleCandidateCount, type: Integer, required: true, min: 0, default: 0}
      - {name: ownerResultsReady, type: Boolean, required: true, default: false}
      - {name: failures, type: FailureList, required: true, default: []}
      - {name: failureConfirmationReference, type: OpaqueString, required: false, default: null}
      - {name: ownCommitObservation, type: Enum, required: true, allowedValues: [UNKNOWN, NONE, FOUND], default: UNKNOWN}
      - {name: observedOwnCommitCount, type: Integer, required: false, min: 0, default: null}
      - {name: collectionLimitNotes, type: StringList, required: true, default: []}
    constraints:
      - "ownCommitObservation은 수집에서 확인한 본인 커밋의 존재 여부다"
      - "NONE은 본인 커밋 여부 판단에 필요한 조회가 정상 완료되고 판정을 막는 범위 한계가 없으며 확인 개수가 0일 때만 쓴다"
      - "FOUND는 연결 계정의 커밋이 실제 확인됐을 때만 쓴다; 후보가 0이어도 FOUND일 수 있다"
      - "UNKNOWN의 개수 null은 0이 아니다; 실패·중단을 NONE으로 바꾸지 않는다"
      - "새 관측 정보는 기존 수신 결과와 함께 검증·저장하고 본인 상태 응답에 전달한다"
      - "Catch가 참조하는 원 요청과 회원은 기존 결과 반영 규칙으로 대조한다"
relationships:
  - {from: MemberAccount, to: RepositoryRegistration, cardinality: "1 -> 0..N", deletion: cascade}
  - {from: RepositoryRegistration, to: AnalysisRequest, cardinality: "1 -> 0..N", constraint: 동일 회원과 저장소}
  - {from: AnalysisRequest, to: AnalysisConsent, cardinality: "1 -> 1", deletion: cascade}
  - {from: AnalysisRequest, to: AnalysisAttempt, cardinality: "1 -> 1..N", deletion: cascade}
  - {from: AnalysisRequest, to: AnalysisRequest, cardinality: "후속 0..N -> 원 요청 0..1", constraint: retryOfRequestId}
  - {from: AnalysisRequest, to: Catch, cardinality: "1 -> 0..N", constraint: 기존 결과 반영 관계 재사용}
```

## 모델 해석과 외부 경계

- 새 등록은 회원별로 격리한다. 다른 회원이 같은 GitHub 저장소를 등록해도 그 회원의 분석·동의·Catch는 공유하지 않는다.
- 등록의 표시 좌표는 갱신할 수 있지만 요청별 동의에 고정된 실행 범위 참조는 소급 변경하지 않는다. 이름 변경이나 저장소 재생성은 실행 전 식별자 대조로 구별한다.
- ownCommitObservation은 U7 내부의 결과 이유 정보다. 수신 메시지·저장·상태 응답·화면까지 함께 추가하며, 이를 추가하지 않고 기존 EMPTY만으로 본인 기록 없음을 추정하지 않는다.
- deadlineAt은 도메인 설계의 논리 개념이다. 현재 구현의 접수 시각 기반 시한을 재사용할 수 있으며 새 시한 표를 요구하지 않는다.
- 하루 횟수 저장은 U2의 DailyExecutionCount(C-03) 소유다. U7은 별도 한도 표를 만들지 않는다.

