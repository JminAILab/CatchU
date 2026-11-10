// worker-messages.yaml(요청·진행·수신 응답 v2, 결과 v3)의 전송 자료와 수신 내부 자료. HTTP 계약이 아니다.
export type ProcessingState = 'QUEUED' | 'RUNNING' | 'UNCERTAIN' |
  'SUCCEEDED' | 'EMPTY' | 'PARTIAL_FAILED' | 'FAILED';
export type ApplicationState = 'NOT_READY' | 'PENDING' | 'APPLYING' |
  'APPLIED' | 'APPLY_FAILED' | 'RECOVERING';
export type Outcome = Extract<ProcessingState, 'SUCCEEDED' | 'EMPTY' | 'PARTIAL_FAILED' | 'FAILED'>;

export interface RequestContext {
  requestId: string;
  attemptId: string;
  memberId: string;
  repositoryId: string;
  consentId: string;
  scopeRevision: string;
  sourceMode: 'MOCK' | 'LIVE';
}

export interface ProcessingEvent {
  schemaVersion: '2';
  messageId: string;
  requestId: string;
  attemptId: string;
  state: 'RECEIVED' | 'RUNNING' | 'UNCERTAIN';
  observedAt: string;
}

export interface Candidate {
  candidateId: string;
  title: string | null;
  workIdentity: string;
  workFacts: string[];
  subjectContribution: string;
  groupingBasis: string;
  groupingLimitations: string[];
  eligibility: {
    workFactsVerified: true;
    contributionVerified: true;
    independentOfFailures: true;
  };
  evidence: {
    evidenceId: string;
    sourceUrl: string;
    sourceRevision: string;
    representedFacts: string[];
    contributionScope: string;
    coverageLimits: string[];
  }[];
  draft: { status: 'GENERATED' | 'FAILED' | 'NOT_GENERATED'; content: string | null };
  reflection: { status: 'GENERATED' | 'FAILED' | 'NOT_GENERATED'; questions: string[] };
  // 본인 커밋 목록 전체(Result v3, CR2 계약 C2). 1~3,000개, 중복 없음, 소문자 40자. 등록이 그 Catch의 소속으로 쓴다.
  ownCommitShas: string[];
}

export interface CommitObservation {
  ownCommitObservation: 'UNKNOWN' | 'NONE' | 'FOUND';
  observedOwnCommitCount: number | null;
  collectionLimitNotes: string[];
}

export interface Result extends RequestContext, CommitObservation {
  // Result만 "3"이다(CR2). 진행 상태·수신 응답·요청은 "2" 그대로다. "2" 결과는 스키마 검사가 거부한다.
  schemaVersion: '3';
  messageId: string;
  resultId: string;
  outcome: Outcome;
  candidates: Candidate[];
  notProvided: { reason: 'INSUFFICIENT_EVIDENCE' | 'BELOW_CRITERIA' | 'UNDETERMINED'; count: number }[];
  failures: {
    stage: 'COLLECTION' | 'ANALYSIS' | 'DRAFT' | 'REFLECTION' | 'APPLICATION' | 'DISPATCH';
    code: string;
    message: string;
    candidateId?: string;
  }[];
  finishedAt: string;
}

export type ReceiptIds = Pick<Result, 'resultId' | 'requestId' | 'attemptId'>;
export type RejectionCode = 'CONTEXT_MISMATCH' | 'STALE_ATTEMPT' | 'PAYLOAD_CONFLICT' | 'SCHEMA_INVALID';
export type ResultReceipt = ReceiptIds & { schemaVersion: '2'; messageId: string } & (
  { disposition: 'ACCEPTED'; code: 'OK' } |
  { disposition: 'DUPLICATE'; code: 'ALREADY_RECEIVED' } |
  { disposition: 'REJECTED'; code: RejectionCode }
);

export interface ResultMetadata extends ReceiptIds {
  applicationRecordId: string;
  payloadFingerprint: string;
  receivedAt: string;
}

export interface ReceiveResult {
  receipt: ResultReceipt | null;
  // #105 호출부가 이후에 사용할 입력. 여기서는 등록 함수를 호출하지 않는다.
  // 원문은 이 반환값에서만 전달하며 수신 메타데이터에 저장하지 않는다.
  accepted?: { result: Result; metadata: ResultMetadata };
}

export type ProgressDecision = 'OBSERVED' | 'TERMINAL_UNCHANGED' | RejectionCode;

export interface AttemptSnapshot {
  context: RequestContext;
  lifecycle?: 'ACTIVE' | 'CLOSED';
  processing: ProcessingState;
  application: ApplicationState;
  received: ResultMetadata | null;
}

export interface ReceiverTransaction {
  readonly snapshot: AttemptSnapshot | null;
  saveObservation(event: ProcessingEvent, processing: ProcessingState): Promise<void>;
  saveResult(metadata: ResultMetadata, state: CommitObservation & {
    processing: Outcome;
    application: 'PENDING';
    eligibleCandidateCount: number;
    failures: Result['failures'];
  }): Promise<void>;
}

/**
 * #104/#105의 DB 어댑터 연결점. 메모리 구현을 운영 저장소로 등록하지 않는다.
 * - 요청/현재 시도 조회, 판정, 변경을 같은 트랜잭션에서 직렬화한다.
 * - callback은 한 번 실행하며 Promise는 커밋 이후에만 resolve한다.
 * - 예외/커밋 실패는 전체 rollback 후 reject한다.
 * - 시도당 결과 하나와 (requestId, attemptId, resultId) 유일성을 DB에서도 보장한다.
 * - saveResult는 수신 메타데이터와 상태만 저장한다. F 원문/Catch는 저장하지 않는다.
 */
export interface ReceiverStore {
  withRequest<T>(requestId: string, work: (tx: ReceiverTransaction) => Promise<T>): Promise<T>;
}

export interface RejectionLog {
  // 외부 입력(식별자, 오류 원문 포함)을 받지 않는 고정 코드 기록.
  record(kind: 'Result' | 'ProcessingEvent', code: RejectionCode | 'UNIDENTIFIABLE' | 'STORAGE_UNAVAILABLE'): void;
}
