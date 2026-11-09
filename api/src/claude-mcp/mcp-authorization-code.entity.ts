import { Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';
import { McpClient } from './mcp-client.entity';

/**
 * 승인 코드 하나(U6 기능 설계 entities, BR4.1). 원문은 저장하지 않고 5분 동안 한 번만 쓴다.
 * 전체 해제는 usedAt이 빈 행만 지운다(BR7.2). 쓴 행은 다시 토큰으로 바꿀 수 없다.
 */
@Entity('mcp_authorization_code')
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@ForeignKey(() => McpClient, ['mcpClientId'], ['mcpClientId'], deleteWithParent)
@Index(['memberId'])
export class McpAuthorizationCode {
  /** 코드 원문의 SHA-256 */
  @PrimaryColumn({ type: 'text' })
  codeHash!: string;

  @Column({ type: 'uuid' })
  memberId!: string;

  @Column({ type: 'text' })
  mcpClientId!: string;

  /** PKCE S256 값(BR3.1, BR4.3) */
  @Column({ type: 'text' })
  codeChallenge!: string;

  /** 승인 때 확인한 돌아갈 주소. 토큰 교환 때 정확히 같아야 한다(BR4.3). */
  @Column({ type: 'text' })
  redirectUri!: string;

  /** 요청에 있으면 MCP 주소와 같다고 확인한 값(BR4.6) */
  @Column({ type: 'text', nullable: true })
  resource!: string | null;

  /** 그 회원의 기존 동의 시각, 없으면 이번 동의 시각(BR3.7) */
  @Column({ type: 'timestamptz' })
  consentedAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  /** 토큰 교환에 쓴 시각. 비어 있어야 쓸 수 있다. */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null;
}
