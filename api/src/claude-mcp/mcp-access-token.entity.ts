import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';
import { McpConnection } from './mcp-connection.entity';

/**
 * 접근 토큰 하나(U6 기능 설계 entities, BR4.2). 불투명 난수이고 원문은 저장하지 않는다.
 * 복합 외래 키로 그 회원의 연결에만 달리므로 연결을 지우면 토큰도 없어진다(C-06).
 */
@Entity('mcp_access_token')
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@ForeignKey(() => McpConnection, ['memberId', 'mcpClientId'], ['memberId', 'mcpClientId'], deleteWithParent)
@Unique(['memberId', 'mcpClientId'])
export class McpAccessToken {
  /** 토큰 원문의 SHA-256 */
  @PrimaryColumn({ type: 'text' })
  tokenHash!: string;

  @Column({ type: 'uuid' })
  memberId!: string;

  @Column({ type: 'text' })
  mcpClientId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;
}
