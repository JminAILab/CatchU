# api — ERD v1

## 모델 정본

개발 기준 ERD v1의 승인 검토본. 업무 엔티티 10개와 멱등·반영 연결용 기술 기록 3개를 구분한다. YAML이 논리 모델 정본이며 관계도는 [functional-spec](functional-spec.md)의 파생 뷰다. 확정된 저장 기술로 옮길 때 아래 제약을 유지한다. 코드·DDL은 개발 이슈에서 작성한다.

```yaml
model: api-erd-v1
conventions:
  id: "불투명한 비어 있지 않은 문자열; ID 형식/길이는 API를 축소하지 않는 물리 매핑으로 정함"
  required: "required=false만 null 허용; PK는 required/unique, 모든 FK는 대상 존재 필요"
  time: "시간대가 있는 서버 시각; API date-time으로 직렬화"
  collection: "필수 목록의 빈 값은 []; 의미상 최소 개수는 개별 제약을 따름"
  external_reference: "외부 ID는 서비스 DB FK가 아님; 접수 맥락과 대조"
  deletion: "이 모델은 삭제/cascade/보관 기한을 결정하지 않음; 보류 정책 없이 참조가 끊어지는 삭제를 제공하지 않음"
entities:
  - name: MemberAccount
    owner: A
    description: "인증된 서비스 회원과 소유권 기준"
    attributes:
      - {name: memberId, type: id, required: true, unique: true, primary: true}
      - {name: identityReference, type: external-id, required: true, unique: true, constraints: "인증 주체 네임스페이스를 포함한 안정 키"}
      - {name: accountState, type: authentication-state, required: true, constraints: "A가 현재 사용 가능한 회원인지 판정; 공개 enum 추가 아님"}
    constraints: ["JWT 주체와 memberId를 서버에서 연결; 요청 본문의 memberId를 소유권으로 채택하지 않음"]
  - name: MemberProfile
    owner: A
    description: "회원의 자가 입력 프로필 정본"
    attributes:
      - {name: profileId, type: id, required: true, unique: true, primary: true}
      - {name: memberId, type: id, required: true, unique: true, references: MemberAccount.memberId}
      - {name: displayName, type: string, required: true, default: ""}
      - {name: introduction, type: string, required: true, default: ""}
      - {name: desiredRole, type: string, required: true, default: ""}
      - {name: skills, type: "list<string>", required: true, default: []}
      - {name: inputProvenance, type: enum, required: true, allowed: [SELF_REPORTED], default: SELF_REPORTED}
    constraints: ["회원당 최대 1행; 제공 가능한 회원은 기본 프로필과 함께 준비", "publicProfile은 별도 저장하지 않고 PublicProfile 허용 필드로 투영"]
  - name: GitHubConnection
    owner: A
    description: "현재 연동 상태와 자격정보 참조; 비밀 토큰 원문은 모델에 넣지 않음"
    attributes:
      - {name: connectionId, type: id, required: true, unique: true, primary: true}
      - {name: memberId, type: id, required: true, unique: true, references: MemberAccount.memberId}
      - {name: externalAccountReference, type: external-id, required: false}
      - {name: accountLogin, type: string, required: false}
      - {name: credentialReference, type: secret-reference, required: false}
      - {name: connectionState, type: enum, required: true, allowed: [CONNECTED, DISCONNECTED, REAUTH_REQUIRED]}
    constraints: ["행 없음은 DISCONNECTED로 투영", "CONNECTED의 실제 접근 가능 여부는 A가 확인; 상세 보관/갱신은 OQ-A1/F1"]
  - name: AnalysisRequest
    owner: E
    description: "새 동의로 접수된 요청; 현재 시도와 진행 잠금의 정본"
    attributes:
      - {name: requestId, type: id, required: true, unique: true, primary: true}
      - {name: memberId, type: id, required: true, references: MemberAccount.memberId}
      - {name: repositoryId, type: external-id, required: true}
      - {name: consentId, type: id, required: true, unique: true, references: AnalysisConsent.consentId}
      - {name: currentAttemptId, type: id, required: true, unique: true, references: AnalysisAttempt.attemptId}
      - {name: retryOfRequestId, type: id, required: false, references: AnalysisRequest.requestId}
      - {name: submittedAt, type: instant, required: true}
      - {name: updatedAt, type: instant, required: true}
      - {name: requestState, type: enum, required: true, allowed: [ACCEPTED], default: ACCEPTED}
      - {name: lifecycle, type: enum, required: true, allowed: [ACTIVE, CLOSED], default: ACTIVE}
    constraints:
      - "사용자당 ACTIVE 최대 1개"
      - "동의와 현재 시도는 같은 requestId; 동의 memberId/repositoryId와 일치"
      - "retryOfRequestId는 본인·같은 저장소의, 등록 Catch 없이 실패 확정·반영 실패로 닫힌 요청만(BR2.4); 자기 참조/순환 금지"
      - "동의 범위는 AnalysisConsent 정본을 참조; analysisScope 중복 저장하지 않음"
  - name: AnalysisConsent
    owner: E
    description: "해당 요청에만 연결된 새 사용자 동의; 재사용하지 않음"
    attributes:
      - {name: consentId, type: id, required: true, unique: true, primary: true}
      - {name: requestId, type: id, required: true, unique: true, references: AnalysisRequest.requestId}
      - {name: memberId, type: id, required: true, references: MemberAccount.memberId}
      - {name: repositoryId, type: external-id, required: true}
      - {name: accepted, type: boolean, required: true, allowed: [true]}
      - {name: noticeRevision, type: id, required: true}
      - {name: scopeRevision, type: id, required: true}
      - {name: consentedScope, type: allowed-scope-value, required: true, constraints: "해당 판본의 허용 자료 종류/범위를 고정한 값; 전체 자료 허가 아님"}
      - {name: consentedAt, type: instant, required: true}
    constraints: ["요청과 1:1; 접수 시 현재 고지·범위 판본과 대조", "접수 후 동의 대상/범위를 변경하거나 다른 요청에 연결하지 않음"]
  - name: AnalysisAttempt
    owner: E
    description: "분석 처리 의미와 서비스 반영 상태를 분리한 기록; F 결과 원문 저장소 아님"
    attributes:
      - {name: attemptId, type: id, required: true, unique: true, primary: true}
      - {name: requestId, type: id, required: true, references: AnalysisRequest.requestId}
      - {name: processing, type: enum, required: true, allowed: [QUEUED, RUNNING, UNCERTAIN, SUCCEEDED, EMPTY, PARTIAL_FAILED, FAILED], default: QUEUED}
      - {name: application, type: enum, required: true, allowed: [NOT_READY, PENDING, APPLYING, RECOVERING, APPLIED, APPLY_FAILED], default: NOT_READY}
      - {name: sourceMode, type: enum, required: true, allowed: [MOCK, LIVE]}
      - {name: eligibleCandidateCount, type: integer, required: true, min: 0, default: 0}
      - {name: ownerResultsReady, type: boolean, required: true, default: false}
      - {name: failures, type: "list<Failure>", required: true, default: [], constraints: "공통 계약 stage/code/message/candidateId만; 원문/비밀값 제외"}
      - {name: failureConfirmationReference, type: operational-reference, required: false, constraints: "확정 실패 판단의 비원문 근거(F 실패 결과 또는 E 처리 시한 판정, 시한 판정은 code PROCESSING_DEADLINE_EXCEEDED); HTTP·조회 timeout/조회 오류만으로 채우지 않음"}
    constraints: ["등록 Catch 목록은 CandidateRegistration에서 유도; 별도 배열 정본 없음", "현재 MVP는 새 요청에 새 시도; 자동 새 시도/재분석 기능을 추가하지 않음"]
  - name: CatchAsset
    owner: B
    description: "등록된 작업·기여·초안·최소 질문의 서비스 정본"
    attributes:
      - {name: catchId, type: id, required: true, unique: true, primary: true}
      - {name: title, type: string, required: false, min_length: 1, constraints: "F가 생성한 값을 저장하며 구직자는 수정할 수 없음. 없으면 null이며 값이 있으면 1자 이상(빈 문자열 금지)"}
      - {name: ownerId, type: id, required: true, references: MemberAccount.memberId}
      - {name: sourceRequestId, type: id, required: true, references: AnalysisRequest.requestId}
      - {name: sourceResultId, type: external-id, required: true}
      - {name: sourceCandidateId, type: external-id, required: true}
      - {name: workIdentity, type: external-work-key, required: true, constraints: "F 제안·B/E 검토 OQ-F2; 의미/범위 버전을 포함해 중복 검사"}
      - {name: workFacts, type: "list<string>", required: true, min_items: 1}
      - {name: subjectContribution, type: string, required: true, min_length: 1}
      - {name: draftStatus, type: enum, required: true, allowed: [GENERATED, FAILED, NOT_GENERATED]}
      - {name: draftContent, type: string, required: false}
      - {name: reflectionStatus, type: enum, required: true, allowed: [GENERATED, FAILED, NOT_GENERATED]}
      - {name: reflectionQuestions, type: "list<string>", required: true}
      - {name: registrationAssessment, type: registration-decision, required: true, constraints: "근거/기여·적합성 및 실패 영향 분리 판단; 새 공개 DTO 아님"}
      - {name: workFactsConfirmed, type: boolean, required: true, default: false}
      - {name: contributionConfirmed, type: boolean, required: true, default: false}
      - {name: mismatch, type: boolean, required: true, default: false}
      - {name: visibility, type: enum, required: true, allowed: [PRIVATE, PUBLIC], default: PRIVATE}
      - {name: sourceMode, type: enum, required: true, allowed: [MOCK, LIVE]}
    constraints:
      - "unique(ownerId, workIdentity); 제목/표현 변경으로 동일 작업 재등록 금지"
      - "unique(sourceRequestId, sourceResultId, sourceCandidateId); 외부 ID 단독 전역 유일성은 추정하지 않음"
      - "sourceRequest의 memberId=ownerId; sourceMode와 결과/후보 맥락 일치"
      - "등록 Catch는 CatchEvidence 1개 이상과 원자적으로 준비; evidenceReferences 속성 없음"
      - "GENERATED일 때만 draftContent 문자열; FAILED/NOT_GENERATED이면 null"
      - "최소 질문 실패/미생성은 상태 보존; 수신자 공개와 답변 저장 없음"
      - "repositoryId는 sourceRequest에서 유도해 회원 Catch 응답 필드와 목록의 repositoryId 필터에 사용; CatchAsset에 repositoryId 칼럼을 추가하지 않음. restriction은 해당 RepositoryProtection으로 현재 계산"
  - name: CatchEvidence
    owner: B
    description: "등록 Catch의 근거 사본 정본; F 자료에 의존하지 않음(F는 결과를 보존하지 않음)"
    attributes:
      - {name: catchEvidenceId, type: id, required: true, unique: true, primary: true}
      - {name: catchId, type: id, required: true, references: CatchAsset.catchId}
      - {name: sourceEvidenceId, type: external-id, required: true}
      - {name: sourceUrl, type: uri, required: true}
      - {name: sourceRevision, type: string, required: true, min_length: 1}
      - {name: representedFacts, type: "list<string>", required: true, min_items: 1}
      - {name: contributionScope, type: string, required: true}
      - {name: coverageLimits, type: "list<string>", required: true}
      - {name: position, type: integer, required: true, min: 1, constraints: "받은 evidence 목록에서의 위치(1부터). 근거 목록 순서가 표시 순서이며 회원·수신자 응답은 이 순서로 근거를 돌려줌"}
    constraints: ["unique(catchId, sourceEvidenceId); 다른 Catch의 근거 일부 중첩 허용", "근거 출처는 Catch의 원 요청/범위와 일치"]
  - name: RepositoryProtection
    owner: B
    description: "회원·저장소별 확인된 원본 보호 판단; 단순 조회 오류와 분리"
    attributes:
      - {name: protectionId, type: id, required: true, unique: true, primary: true}
      - {name: ownerId, type: id, required: true, references: MemberAccount.memberId}
      - {name: repositoryId, type: external-id, required: true}
      - {name: confirmedSourceState, type: confirmed-source-observation, required: false}
      - {name: observationProvenance, type: operational-reference, required: false}
      - {name: observedAt, type: instant, required: false}
      - {name: observationFailure, type: safe-error-value, required: false}
      - {name: appliedRestriction, type: enum, required: true, allowed: [NONE, SOURCE_PRIVATE]}
    constraints: ["unique(ownerId, repositoryId)", "SOURCE_PRIVATE는 확인 증거 필요; 조회 오류만으로 설정/해제하지 않음", "보호 해제/원본 재공개 정책은 보류; 관측 방법 OQ-B3"]
  - name: ShareLink
    owner: C
    description: "소유자의 현재 공개 Catch 전체를 여는 링크; 자산 연결 없음"
    attributes:
      - {name: linkId, type: id, required: true, unique: true, primary: true}
      - {name: ownerId, type: id, required: true, references: MemberAccount.memberId}
      - {name: title, type: string, required: true, min_length: 1, constraints: "trim 결과를 저장; 빈 제목 거부"}
      - {name: linkTokenReference, type: secret-lookup-key, required: true, unique: true}
      - {name: passwordProtectionReference, type: password-verifier-reference, required: false}
      - {name: issuedAt, type: instant, required: true}
      - {name: expiresAt, type: instant, required: true}
      - {name: stoppedAt, type: instant, required: false}
    constraints:
      - "valid(t) = stoppedAt is null AND t < expiresAt"
      - "valid(t)인 행에서 ownerId별 count <= 5 및 (ownerId, trim(title)) 유일"
      - "expiresAt = issuedAt + 30*24시간; 중단 반복은 같은 상태, 재개 없음"
      - "state는 stoppedAt/현재시각으로 유도; 만료 배치 지연으로 접근을 허용하지 않음"
      - "링크–Catch FK/join/snapshot 없음; 비밀번호 원문·grant를 본 엔티티에 저장하지 않음"
technical_records:
  - name: IdempotencyRecord
    owner: "A/E/C의 생성 operation"
    description: "생성 POST의 영속 중복 방지; 업무 엔티티 아님"
    attributes:
      - {name: idempotencyId, type: id, required: true, unique: true, primary: true}
      - {name: memberId, type: id, required: true, references: MemberAccount.memberId}
      - {name: operation, type: enum, required: true, allowed: [createAnalysisRequest, createShareLink]}
      - {name: key, type: string, required: true, min_length: 1, max_length: 128}
      - {name: requestFingerprint, type: safe-fingerprint, required: true}
      - {name: requestId, type: id, required: false, references: AnalysisRequest.requestId}
      - {name: linkId, type: id, required: false, references: ShareLink.linkId}
      - {name: responseReference, type: durable-response-reference, required: true, constraints: "기존 생성 응답/상태를 안전하게 재응답할 수 있는 값; 원문 입력/토큰/비밀번호 로그 아님"}
    constraints: ["unique(memberId, operation, key)", "requestId/linkId 중 operation에 맞는 하나만 존재; 대상 소유자 일치", "키 예약·자원 생성·응답 연결은 원자적; 기록 존재 중 연결 유지"]
  - name: ResultApplicationRecord
    owner: E
    description: "검증된 외부 결과의 수신/반영 메타데이터; F 원문 결과는 저장하지 않음"
    attributes:
      - {name: applicationRecordId, type: id, required: true, unique: true, primary: true}
      - {name: requestId, type: id, required: true, references: AnalysisRequest.requestId}
      - {name: attemptId, type: id, required: true, unique: true, references: AnalysisAttempt.attemptId}
      - {name: resultId, type: external-id, required: true}
      - {name: payloadFingerprint, type: safe-fingerprint, required: true}
      - {name: receivedAt, type: instant, required: true}
    constraints: ["unique(requestId, attemptId, resultId); 현재 시도당 검증된 종결 결과 하나", "시도/요청/본인/저장소/동의/범위/sourceMode 일치 후만 생성", "다른 payload/늦은 시도는 기존 기록을 덮어쓰지 않음"]
  - name: CandidateRegistration
    owner: "B 판정 정본, E 결과 연결"
    description: "후보별 등록 또는 기존 동일 작업 참조; 커밋 뒤 같은 결과를 다시 받을 때의 재진입 키(같은 catchId)"
    attributes:
      - {name: registrationId, type: id, required: true, unique: true, primary: true}
      - {name: applicationRecordId, type: id, required: true, references: ResultApplicationRecord.applicationRecordId}
      - {name: candidateId, type: external-id, required: true}
      - {name: catchId, type: id, required: true, references: CatchAsset.catchId}
      - {name: disposition, type: enum, required: true, allowed: [CREATED, EXISTING]}
      - {name: ownerViewReady, type: boolean, required: true}
    constraints: ["unique(applicationRecordId, candidateId); 하나의 후보는 하나의 Catch", "같은 owner와 검증한 동일 작업만 EXISTING; 기존 Catch 본문/출처/공개 상태 변경 없음", "Catch·근거·등록 연결이 함께 커밋; E는 이 연결에서 등록 목록/준비 여부 복원"]
relationships:
  - {from: MemberAccount, to: MemberProfile, cardinality: "1 : 0..1", via: memberId}
  - {from: MemberAccount, to: GitHubConnection, cardinality: "1 : 0..1", via: memberId}
  - {from: MemberAccount, to: AnalysisRequest, cardinality: "1 : 0..N", via: memberId}
  - {from: AnalysisRequest, to: AnalysisConsent, cardinality: "1 : 1", via: "requestId / consentId"}
  - {from: AnalysisRequest, to: AnalysisAttempt, cardinality: "1 : 1..N", via: "requestId; currentAttemptId은 같은 요청의 하나"}
  - {from: MemberAccount, to: CatchAsset, cardinality: "1 : 0..N", via: ownerId}
  - {from: AnalysisRequest, to: CatchAsset, cardinality: "1 : 0..N", via: sourceRequestId}
  - {from: CatchAsset, to: CatchEvidence, cardinality: "1 : 1..N", via: catchId}
  - {from: MemberAccount, to: RepositoryProtection, cardinality: "1 : 0..N", via: ownerId}
  - {from: MemberAccount, to: ShareLink, cardinality: "1 : 0..N", via: ownerId}
  - {from: MemberAccount, to: IdempotencyRecord, cardinality: "1 : 0..N", via: memberId}
  - {from: AnalysisRequest, to: IdempotencyRecord, cardinality: "0..1 : 0..N", via: requestId}
  - {from: ShareLink, to: IdempotencyRecord, cardinality: "0..1 : 0..N", via: linkId}
  - {from: AnalysisAttempt, to: ResultApplicationRecord, cardinality: "1 : 0..1", via: attemptId}
  - {from: ResultApplicationRecord, to: CandidateRegistration, cardinality: "1 : 0..N", via: applicationRecordId}
  - {from: CatchAsset, to: CandidateRegistration, cardinality: "1 : 1..N", via: catchId}
```

## 물리 스키마 전환 제약

| 경계 | 반드시 보존할 제약 |
|---|---|
| 키·참조 | PK/FK·필수 값·enum·복합 유일성을 마이그레이션에 포함. 소유자/요청 일치는 복합 참조 또는 같은 트랜잭션 검증으로 보장. 외부 ID는 F 테이블 FK로 만들지 않음 |
| 요청 생성 | 요청·동의·첫 시도 ID를 미리 할당하고 한 트랜잭션에서 연결. 순환 FK는 커밋 시 참조 검사가 가능한 매핑으로 해결하고 중간 미완료 행을 노출하지 않음. ACTIVE 회원 단위 유일성을 최종 방어로 유지 |
| 시간 조건 | valid(t) 제목/개수 판정과 발급을 같은 회원에 직렬화하고 동일 판정 시각을 사용. 시간 의존 조건은 정적 unique만으로 완료 처리하지 않음. 만료된 제목 재사용 가능; 활성 표시용 파생 플래그 지연에 의존하지 않음 |
| 등록·반영 | 후보 키/작업 키 동시 충돌은 같은 Catch 참조로 수렴. B의 Catch+근거+CandidateRegistration과 E 반영 완료 기록은 F4의 한 트랜잭션으로 저장. 실패·커밋 뒤 응답·확인 유실은 [functional-spec의 두 경우](functional-spec.md#동시성과-일관성)를 따름. 결과 payload fingerprint는 안전한 정규화 의미 비교이며 원문 결과 저장을 대체하지 않음 |
| 보안·보관 | secret-reference/fingerprint의 암호·키 관리와 응답 재생 저장 상세는 담당 설계. 삭제 cascade/TTL을 추정하지 않음. Redis만의 유실 가능한 락/키를 영속 중복 방지 정본으로 삼지 않음 |

MemberProfile의 desiredRole/skills는 기존 jobRole/technologyTags의 API 명칭 매핑이다. 공개 프로필·Catch restriction·링크 state·registeredCatchIds는 정본에서 유도하므로 중복 열이 아니다. Account/GitHub 인증 세부 상태를 새 제품 정책으로 확대하지 않는다.

F의 AnalysisResult·WorkCandidate·AnalysisEvidence·DraftOutcome는 이 모델에 **없다**. B가 등록한 자료만 CatchAsset/CatchEvidence에 보유하며 미등록 F 결과는 보존·재전달하지 않는다(2026-10-06 결정, [#23](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)). RepositoryProtection과 CatchAsset의 연결은 sourceRequest의 소유자·저장소 일치 조회이며 링크–자산 연결이 아니다.

## 담당자 확인 요청

- 1 F/H/I·2 A/E: 외부 ID·동의/시도·수신 메타데이터와 #86/#87의 참조·원자성 확인.
- 3 C/D: 시간 의존 링크 유일성/한도·현재 권한·grant 미결의 물리 반영 확인.
- 4 B: 근거 1:N·서비스 정본·등록 연결·기존 작업 참조 확인. **PR #89 병합 전 필수**.

## 추적 정보

[작성 확인](functional-design-questions.md) · [components](../../../inception/domain-design/components.md) · [API 계약](../../../inception/contract-design/contract-summary.md) · [common.yaml](../../../inception/contract-design/common.yaml) · [worker 메시지](../../../inception/contract-design/worker-messages.yaml). 자료 조건: [#37](https://github.com/JminAILab/CatchU/issues/37).

