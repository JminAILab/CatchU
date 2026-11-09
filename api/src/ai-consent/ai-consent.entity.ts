// 외부 AI 전송 첫 이용 동의 한 건(C-04 표 ai_consent, U2 entities AiConsent).
// 회원·고지 판본마다 한 행이고 회원을 따라 지워진다(BR2.1·BR7.7).
import { randomUUID } from 'node:crypto';
import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';

@Entity()
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@Unique(['memberId', 'noticeVersion'])
export class AiConsent {
  @PrimaryColumn({ type: 'uuid' }) consentId: string = randomUUID();
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'text' }) noticeVersion!: string;
  @Column({ type: 'timestamptz' }) consentedAt!: Date;
}
