import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { lengthBetween } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';

@Entity()
@Unique(['memberId', 'repositoryId'])
@Unique(['memberId', 'registrationId', 'repositoryId'])
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@Check(lengthBetween('repository_id', 1))
@Check(lengthBetween('owner', 1, 39))
@Check(lengthBetween('name', 1, 100))
@Check(lengthBetween('scope_revision', 1, 200))
export class RepositoryRegistration {
  @PrimaryColumn({ type: 'uuid' }) registrationId: string = randomUUID();
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'text' }) repositoryId!: string;
  @Column({ type: 'text' }) owner!: string;
  @Column({ type: 'text' }) name!: string;
  @Column({ type: 'text' }) repositoryUrl!: string;
  @Column({ type: 'text' }) scopeRevision!: string;
  @Column({ type: 'timestamptz' }) registeredAt!: Date;
  @Column({ type: 'timestamptz' }) lastVerifiedAt!: Date;
}
