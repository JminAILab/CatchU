import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';

/** JD 원문. UTF-16 상한은 API가 검사하고 DB는 비어 있는 값만 막는다. */
@Entity('jd')
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@Unique(['memberId', 'jdId'])
@Index(['memberId', 'updatedAt', 'jdId'])
@Check('char_length("title") > 0 AND char_length("body") > 0')
export class Jd {
  @PrimaryColumn({ type: 'uuid' }) jdId: string = randomUUID();
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'text' }) title!: string;
  @Column({ type: 'text' }) body!: string;
  @Column({ type: 'timestamptz' }) createdAt!: Date;
  @Column({ type: 'timestamptz' }) updatedAt!: Date;
}
