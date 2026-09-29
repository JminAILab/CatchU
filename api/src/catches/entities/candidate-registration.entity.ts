import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { CatchAssetEntity } from './catch-asset.entity';

export type CandidateDisposition = 'CREATED' | 'EXISTING';

@Entity('candidate_registration')
@Unique(['applicationRecordId', 'candidateId'])
@Check('char_length("candidate_id") >= 1')
@Check('"disposition" IN (\'CREATED\', \'EXISTING\')')
export class CandidateRegistrationEntity {
  @PrimaryColumn({ name: 'registration_id', type: 'uuid' })
  registrationId: string = randomUUID();

  // E의 ResultApplicationRecord를 이 엔티티에서 새로 정의하지 않는다.
  @Column({ name: 'application_record_id', type: 'uuid' })
  applicationRecordId!: string;

  @Column({ name: 'candidate_id', type: 'text' })
  candidateId!: string;

  @Column({ name: 'catch_id', type: 'uuid' })
  catchId!: string;

  @ManyToOne(() => CatchAssetEntity, { nullable: false })
  @JoinColumn({ name: 'catch_id', referencedColumnName: 'catchId' })
  catchAsset!: CatchAssetEntity;

  @Column({ name: 'disposition', type: 'varchar' })
  disposition!: CandidateDisposition;

  @Column({ name: 'owner_view_ready', type: 'boolean' })
  ownerViewReady!: boolean;
}
