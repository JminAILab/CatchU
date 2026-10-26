import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../../database/foreign-keys';
import { CatchAssetEntity } from './catch-asset.entity';
import { ResultApplicationRecord } from '../../result-application/result-application.entity';

export type CandidateDisposition = 'CREATED' | 'EXISTING';

@Entity('candidate_registration')
@ForeignKey(() => ResultApplicationRecord, ['applicationRecordId'], ['applicationRecordId'], deleteWithParent)
@Unique(['applicationRecordId', 'candidateId'])
@Check('char_length("candidate_id") >= 1')
@Check('"disposition" IN (\'CREATED\', \'EXISTING\')')
export class CandidateRegistrationEntity {
  @PrimaryColumn({ name: 'registration_id', type: 'uuid' })
  registrationId: string = randomUUID();

  @Column({ name: 'application_record_id', type: 'uuid' })
  applicationRecordId!: string;

  @Column({ name: 'candidate_id', type: 'text' })
  candidateId!: string;

  @Column({ name: 'catch_id', type: 'uuid' })
  catchId!: string;

  @ManyToOne(() => CatchAssetEntity, { nullable: false, ...deleteWithParent })
  @JoinColumn({ name: 'catch_id', referencedColumnName: 'catchId' })
  catchAsset!: CatchAssetEntity;

  @Column({ name: 'disposition', type: 'varchar' })
  disposition!: CandidateDisposition;

  @Column({ name: 'owner_view_ready', type: 'boolean' })
  ownerViewReady!: boolean;
}
