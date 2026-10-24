import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../database/foreign-keys';
import { AnalysisAttempt } from '../member-analysis/member-analysis.entity';

/** E 수신 메타데이터 정본. 결과 원문·후보·비밀값은 저장하지 않는다. */
@Entity('result_application_record')
@Unique(['attemptId'])
@Unique(['requestId', 'attemptId', 'resultId'])
@ForeignKey(() => AnalysisAttempt, ['attemptId', 'requestId'], ['attemptId', 'requestId'], deleteWithParent)
@Check('char_length("result_id") >= 1')
@Check(`"payload_fingerprint" ~ '^[0-9a-f]{64}$'`)
export class ResultApplicationRecord {
  @PrimaryColumn({ type: 'uuid' }) applicationRecordId: string = randomUUID();
  @Column({ type: 'uuid' }) requestId!: string;
  @Column({ type: 'uuid' }) attemptId!: string;
  @Column({ type: 'text' }) resultId!: string;
  @Column({ type: 'text' }) payloadFingerprint!: string;
  @Column({ type: 'timestamptz' }) receivedAt!: Date;
}
