import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { lengthBetween } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';

/**
 * 지원자 한 명이 만든 발행용 자료 묶음(발행 프리셋 U1 entities.md Preset, 계약 P-6). 발행 때 탭 하나가 된다.
 *
 * - 회원 행을 따라 지워진다(탈퇴, docs/member-withdrawal-deletion.md).
 * - 이름 길이(앞뒤 공백을 뺀 1~50자)와 회원당 50개 상한은 DB 제약이 아니라 API 검사다(BR1.2·BR1.3). DB는 이름 1자 이상만 막는다.
 * - 항목 수·글자 수·발행할 수 없는 자료는 저장하지 않고 읽을 때 센다(ADR-005).
 * - 목록은 만든 시각, 같으면 presetId 순이다(BR1.9). 색인 (member_id, created_at, preset_id)이 이 순서를 받친다(NFR 설계 검토 R-05).
 */
@Entity('preset')
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@Check(lengthBetween('name', 1))
@Index(['memberId', 'createdAt', 'presetId'])
export class Preset {
  @PrimaryColumn({ type: 'uuid' })
  presetId: string = randomUUID();

  @Column({ type: 'uuid' })
  memberId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'timestamptz' })
  createdAt!: Date;

  /** 만들 때 createdAt과 같고, 고칠 때마다 새로 쓴다 */
  @Column({ type: 'timestamptz' })
  updatedAt!: Date;
}
