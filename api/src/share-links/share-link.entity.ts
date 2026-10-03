import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn, Unique } from 'typeorm';
import { lengthBetween } from '../database/checks';
import { MemberAccount } from '../member-analysis/member-analysis.entity';

/** 발급 시각부터 정확히 30×24시간(ERD ShareLink). */
export const SHARE_LINK_TTL_HOURS = 720;

/**
 * 공유 링크(ERD ShareLink, C 소유). 소유자의 현재 공개 Catch 전체를 여는 링크이며 Catch와 연결하지 않는다.
 *
 * - 상태(ACTIVE·STOPPED·EXPIRED)는 칼럼으로 저장하지 않고 `stoppedAt`과 현재 시각으로 구한다(share-link-state.ts).
 * - 유효 링크의 제목 유일·5개 한도는 시간에 따라 달라지므로 정적 unique로 풀지 않고,
 *   회원 단위로 직렬화한 트랜잭션에서 판정한다(share-link-issuance.ts).
 * - 비밀번호 원문·열람 증표(grant)는 저장하지 않는다. `passwordProtectionReference`는 scrypt 검증값이다.
 * - `unique(linkId, ownerId)`는 멱등 기록이 (linkId, memberId)로 이 링크를 참조해, 기록의 회원과 링크 소유자가
 *   같음을 DB에서도 보장하기 위한 것이다(IdempotencyRecord의 외래 키).
 */
@Entity('share_link')
@ForeignKey(() => MemberAccount, ['ownerId'], ['memberId'])
@Unique(['linkId', 'ownerId'])
@Check(lengthBetween('title', 1))
@Check(`"expires_at" = "issued_at" + interval '${SHARE_LINK_TTL_HOURS} hours'`)
@Check('"stopped_at" IS NULL OR "stopped_at" >= "issued_at"')
@Index(['ownerId'])
export class ShareLink {
  @PrimaryColumn({ type: 'uuid' })
  linkId: string = randomUUID();

  @Column({ type: 'uuid' })
  ownerId!: string;

  /** trim한 제목 */
  @Column({ type: 'text' })
  title!: string;

  /**
   * 수신자 URL의 토큰(ERD `secret-lookup-key`). 토큰 자체를 저장한다(제안, PR #162 리뷰에서 A·E 확인 대기).
   * 목록·발급·같은 키 재요청 응답이 모두 `url`을 다시 만들어야 해서, 되돌릴 수 없는 해시로는 저장하지 않는다.
   * 암호화 보관은 키 관리 방식이 정해지지 않아 쓰지 않는다. 대신 `url` 밖(별도 응답 필드·로그·오류)에는 내보내지 않는다.
   */
  @Column({ type: 'text', unique: true })
  linkTokenReference!: string;

  /** 비밀번호 검증값(link-password.ts). 비밀번호 없는 링크는 null */
  @Column({ type: 'text', nullable: true })
  passwordProtectionReference!: string | null;

  @Column({ type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  stoppedAt!: Date | null;
}
