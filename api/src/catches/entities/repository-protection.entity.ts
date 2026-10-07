import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { MemberAccount } from '../../member-analysis/member-analysis.entity';

@Entity('repository_protection')
@Unique('uq_repository_protection_owner_repository', ['ownerId', 'repositoryId'])
@ForeignKey(() => MemberAccount, ['ownerId'], ['memberId'], { name: 'fk_repository_protection_owner_id' })
@Check('ck_repository_protection_repository_id', 'char_length("repository_id") >= 1')
@Check('ck_repository_protection_restriction', '"applied_restriction" IN (\'NONE\', \'SOURCE_PRIVATE\')')
export class RepositoryProtectionEntity {
  @PrimaryColumn({ name: 'protection_id', type: 'uuid' })
  protectionId: string = randomUUID();

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ name: 'repository_id', type: 'text' })
  repositoryId!: string;

  @Column({ name: 'confirmed_source_state', type: 'jsonb', nullable: true })
  confirmedSourceState!: unknown | null;

  @Column({ name: 'observation_provenance', type: 'jsonb', nullable: true })
  observationProvenance!: unknown | null;

  @Column({ name: 'observed_at', type: 'timestamptz', nullable: true })
  observedAt!: Date | null;

  @Column({ name: 'observation_failure', type: 'jsonb', nullable: true })
  observationFailure!: unknown | null;

  // 행 생성자는 확인된 판단을 명시한다. 조회 실패·행 부재를 NONE으로 추정하지 않는다.
  @Column({ name: 'applied_restriction', type: 'varchar' })
  appliedRestriction!: 'NONE' | 'SOURCE_PRIVATE';
}
