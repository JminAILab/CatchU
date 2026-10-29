import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { lengthBetween } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';

/**
 * 작성자의 텍스트 자료 한 벌(계약 C-13, U4 소유). U6은 member_id로만 걸러 읽는다.
 *
 * - 제목·본문의 길이 상한은 DB 제약이 아니라 U4 API 검증이다(U4 기능 설계). DB는 계약대로 제목 1자 이상만 막는다.
 * - 저장마다 `updatedAt`을 갱신하고 마지막 저장이 남는다. 충돌 감지는 없다(FR2.4).
 */
@Entity('text_material')
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@Check(lengthBetween('title', 1))
@Index(['memberId'])
export class TextMaterial {
  @PrimaryColumn({ type: 'uuid' })
  textMaterialId: string = randomUUID();

  @Column({ type: 'uuid' })
  memberId!: string;

  @Column({ type: 'text' })
  title!: string;

  /** 공백·줄바꿈을 가공하지 않고 저장한다 */
  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz' })
  updatedAt!: Date;
}
