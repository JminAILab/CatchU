import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn, Unique } from 'typeorm';
import { inValues, lengthBetween } from '../database/checks';
import { ShareLink } from '../share-links/share-link.entity';

const deferred = { deferrable: 'INITIALLY DEFERRED' as const };

@Entity()
@Unique(['identityReference'])
@Check(lengthBetween('identity_reference', 1))
@Check(lengthBetween('account_state', 1))
export class MemberAccount {
  @PrimaryColumn({ type: 'uuid' }) memberId: string = randomUUID();
  @Column({ type: 'text' }) identityReference!: string;
  // 내부 인증 상태. 공개 API enum이나 실제 OAuth 정책을 정의하지 않는다.
  @Column({ type: 'varchar' }) accountState!: string;
}

@Entity()
@Unique(['memberId'])
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'])
@Check(inValues('input_provenance', ['SELF_REPORTED']))
export class MemberProfile {
  @PrimaryColumn({ type: 'uuid' }) profileId: string = randomUUID();
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'text', default: '' }) displayName = '';
  @Column({ type: 'text', default: '' }) introduction = '';
  @Column({ type: 'text', default: '' }) desiredRole = '';
  @Column({ type: 'text', array: true, default: [] }) skills: string[] = [];
  @Column({ type: 'varchar', default: 'SELF_REPORTED' }) inputProvenance = 'SELF_REPORTED' as const;
}

@Entity('github_connection')
@Unique(['memberId'])
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'])
@Check(inValues('connection_state', ['CONNECTED', 'DISCONNECTED', 'REAUTH_REQUIRED']))
export class GitHubConnection {
  @PrimaryColumn({ type: 'uuid' }) connectionId: string = randomUUID();
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'text', nullable: true }) externalAccountReference: string | null = null;
  @Column({ type: 'text', nullable: true }) accountLogin: string | null = null;
  @Column({ type: 'text', nullable: true }) credentialReference: string | null = null;
  @Column({ type: 'varchar' }) connectionState!: 'CONNECTED' | 'DISCONNECTED' | 'REAUTH_REQUIRED';
}

@Entity()
@Unique(['consentId'])
@Unique(['currentAttemptId'])
@Unique(['requestId', 'memberId', 'repositoryId'])
@Unique(['requestId', 'memberId'])
@Index(['memberId'], { unique: true, where: `"lifecycle" = 'ACTIVE'` })
// 본인 이력(#140)과 재요청 판정의 최근 요청은 회원별 접수 시각·requestId 역순으로 읽는다. 전체 이력을 훑고 정렬하지 않게 한다.
@Index(['memberId', 'submittedAt', 'requestId'])
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'])
@ForeignKey(() => AnalysisConsent, ['consentId', 'requestId', 'memberId', 'repositoryId'],
  ['consentId', 'requestId', 'memberId', 'repositoryId'], deferred)
@ForeignKey(() => AnalysisAttempt, ['currentAttemptId', 'requestId'], ['attemptId', 'requestId'], deferred)
@ForeignKey(() => AnalysisRequest, ['retryOfRequestId', 'memberId', 'repositoryId'],
  ['requestId', 'memberId', 'repositoryId'], deferred)
@Check(inValues('request_state', ['ACCEPTED']))
@Check(inValues('lifecycle', ['ACTIVE', 'CLOSED']))
@Check(lengthBetween('repository_id', 1))
@Check('"retry_of_request_id" IS NULL OR "retry_of_request_id" <> "request_id"')
export class AnalysisRequest {
  @PrimaryColumn({ type: 'uuid' }) requestId: string = randomUUID();
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'text' }) repositoryId!: string;
  @Column({ type: 'uuid' }) consentId!: string;
  @Column({ type: 'uuid' }) currentAttemptId!: string;
  @Column({ type: 'uuid', nullable: true }) retryOfRequestId: string | null = null;
  @Column({ type: 'timestamptz' }) submittedAt!: Date;
  @Column({ type: 'timestamptz' }) updatedAt!: Date;
  @Column({ type: 'varchar', default: 'ACCEPTED' }) requestState = 'ACCEPTED' as const;
  @Column({ type: 'varchar', default: 'ACTIVE' }) lifecycle: 'ACTIVE' | 'CLOSED' = 'ACTIVE';
}

@Entity()
@Unique(['requestId'])
@Unique(['consentId', 'requestId', 'memberId', 'repositoryId'])
@ForeignKey(() => AnalysisRequest, ['requestId', 'memberId', 'repositoryId'],
  ['requestId', 'memberId', 'repositoryId'], deferred)
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'])
@Check('"accepted" = true')
@Check(lengthBetween('repository_id', 1))
@Check(lengthBetween('notice_revision', 1))
@Check(lengthBetween('scope_revision', 1))
@Check(`jsonb_typeof("consented_scope") = 'object'`)
export class AnalysisConsent {
  @PrimaryColumn({ type: 'uuid' }) consentId: string = randomUUID();
  @Column({ type: 'uuid' }) requestId!: string;
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'text' }) repositoryId!: string;
  @Column({ type: 'boolean' }) accepted!: boolean;
  // 외부 고지·범위 판본은 API의 불투명 문자열을 보존한다.
  @Column({ type: 'text' }) noticeRevision!: string;
  @Column({ type: 'text' }) scopeRevision!: string;
  @Column({ type: 'jsonb' }) consentedScope!: Record<string, unknown>;
  @Column({ type: 'timestamptz' }) consentedAt!: Date;
}

export const PROCESSING_STATES = ['QUEUED', 'RUNNING', 'UNCERTAIN', 'SUCCEEDED', 'EMPTY', 'PARTIAL_FAILED', 'FAILED'] as const;
export const APPLICATION_STATES = ['NOT_READY', 'PENDING', 'APPLYING', 'RECOVERING', 'APPLIED', 'APPLY_FAILED'] as const;

@Entity()
@Unique(['attemptId', 'requestId'])
@ForeignKey(() => AnalysisRequest, ['requestId'], ['requestId'], deferred)
@Check(inValues('processing', PROCESSING_STATES))
@Check(inValues('application', APPLICATION_STATES))
@Check(inValues('source_mode', ['MOCK', 'LIVE']))
@Check('"eligible_candidate_count" >= 0')
@Check(`jsonb_typeof("failures") = 'array'`)
export class AnalysisAttempt {
  @PrimaryColumn({ type: 'uuid' }) attemptId: string = randomUUID();
  @Column({ type: 'uuid' }) requestId!: string;
  @Column({ type: 'varchar', default: 'QUEUED' }) processing: (typeof PROCESSING_STATES)[number] = 'QUEUED';
  @Column({ type: 'varchar', default: 'NOT_READY' }) application: (typeof APPLICATION_STATES)[number] = 'NOT_READY';
  @Column({ type: 'varchar' }) sourceMode!: 'MOCK' | 'LIVE';
  @Column({ type: 'integer', default: 0 }) eligibleCandidateCount = 0;
  @Column({ type: 'boolean', default: false }) ownerResultsReady = false;
  @Column({ type: 'jsonb', default: [] }) failures: {
    stage: string; code: string; message: string; candidateId?: string;
  }[] = [];
  @Column({ type: 'text', nullable: true }) failureConfirmationReference: string | null = null;
}

export type CreationOperation = 'createAnalysisRequest' | 'createShareLink';

@Entity()
@Unique(['memberId', 'operation', 'key'])
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'])
@ForeignKey(() => AnalysisRequest, ['requestId', 'memberId'], ['requestId', 'memberId'], deferred)
// 링크가 있고 그 소유자가 이 기록의 회원임을 DB에서도 보장한다(#147).
@ForeignKey(() => ShareLink, ['linkId', 'memberId'], ['linkId', 'ownerId'])
@Check(inValues('operation', ['createAnalysisRequest', 'createShareLink']))
@Check(lengthBetween('key', 1, 128))
@Check(`"request_fingerprint" ~ '^[0-9a-f]{64}$'`)
@Check(lengthBetween('response_reference', 1))
@Check(`("operation" = 'createAnalysisRequest' AND "request_id" IS NOT NULL AND "link_id" IS NULL)
  OR ("operation" = 'createShareLink' AND "link_id" IS NOT NULL AND "request_id" IS NULL)`)
export class IdempotencyRecord {
  @PrimaryColumn({ type: 'uuid' }) idempotencyId: string = randomUUID();
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'varchar' }) operation!: CreationOperation;
  @Column({ type: 'text' }) key!: string;
  @Column({ type: 'text' }) requestFingerprint!: string;
  @Column({ type: 'uuid', nullable: true }) requestId: string | null = null;
  @Column({ type: 'uuid', nullable: true }) linkId: string | null = null;
  @Column({ type: 'text' }) responseReference!: string;
}
