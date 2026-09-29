import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { lengthBetween } from '../database/checks';

/** 발급 시각부터 정확히 30×24시간(ERD ShareLink). */
export const SHARE_LINK_TTL_HOURS = 720;

/**
 * 공유 링크(ERD ShareLink, C 소유). 소유자의 현재 공개 Catch 전체를 여는 링크이며 Catch와 연결하지 않는다.
 *
 * - 상태(ACTIVE·STOPPED·EXPIRED)는 칼럼으로 저장하지 않고 `stoppedAt`과 현재 시각으로 구한다(share-link-state.ts).
 * - 유효 링크의 제목 유일·5개 한도는 시간에 따라 달라지므로 정적 unique로 풀지 않고,
 *   회원 단위로 직렬화한 트랜잭션에서 판정한다(share-link-issuance.ts).
 * - 비밀번호 원문·열람 증표(grant)는 저장하지 않는다. `passwordProtectionReference`는 scrypt 검증값이다.
 * - `ownerId`의 회원 외래 키는 회원 테이블(#104)이 생긴 뒤 마이그레이션과 함께 추가한다.
 */
@Entity('share_link')
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
   * 수신자 URL의 토큰을 찾는 키.
   * 미확정: 현재는 목록·발급 응답의 `url`을 다시 만들기 위해 토큰 자체를 저장하는 제안안으로 구현했다(PR #162 「정해야 할 것」 1).
   * ERD `secret-lookup-key`와의 해석을 확인해 3-3 마이그레이션 생성 전에 확정하며, 바뀌면 이 칼럼과 발급 테스트를 함께 고친다.
   * 로그·오류·별도 응답 필드에는 노출하지 않는다.
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
