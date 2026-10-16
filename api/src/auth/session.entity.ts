import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn, Unique } from 'typeorm';
import { MemberAccount } from '../member-analysis/member-analysis.entity';

@Entity()
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'])
@Index(['memberId'])
@Check('"expires_at" > "created_at"')
@Check('"last_refreshed_at" >= "created_at" AND "last_refreshed_at" < "expires_at"')
export class AuthSession {
  @PrimaryColumn({ type: 'uuid' }) sessionId: string = randomUUID();
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'timestamptz' }) createdAt!: Date;
  @Column({ type: 'timestamptz' }) expiresAt!: Date;
  @Column({ type: 'timestamptz' }) lastRefreshedAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null = null;
}

@Entity()
@ForeignKey(() => AuthSession, ['sessionId'], ['sessionId'])
@Unique(['tokenHash'])
@Index(['sessionId'], { unique: true, where: '"used_at" IS NULL' })
@Check('"token_hash" ~ \'^[a-f0-9]{64}$\'')
export class SessionRefreshToken {
  @PrimaryColumn({ type: 'uuid' }) refreshId: string = randomUUID();
  @Column({ type: 'uuid' }) sessionId!: string;
  @Column({ type: 'text' }) tokenHash!: string;
  @Column({ type: 'timestamptz' }) createdAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) usedAt: Date | null = null;
}
