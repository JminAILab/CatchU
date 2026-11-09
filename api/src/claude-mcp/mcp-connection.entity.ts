import { randomUUID } from 'node:crypto';
import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';
import { McpClient } from './mcp-client.entity';

/**
 * 한 회원과 한 클라이언트의 연결 기록(U6 기능 설계 entities, 계약 C-15).
 *
 * - 그 회원의 행이 하나라도 있으면 동의한 것이다(BR3.3).
 * - 탈퇴 코드가 표 이름과 member_id를 이름으로 부른다(BR7.4). 바꾸면 오류 없이 토큰이 남는다.
 */
@Entity('mcp_connection')
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@ForeignKey(() => McpClient, ['mcpClientId'], ['mcpClientId'], deleteWithParent)
@Unique(['memberId', 'mcpClientId'])
export class McpConnection {
  @PrimaryColumn({ type: 'uuid' })
  connectionId: string = randomUUID();

  @Column({ type: 'uuid' })
  memberId!: string;

  @Column({ type: 'text' })
  mcpClientId!: string;

  /** 승인 코드의 consentedAt을 옮겨 쓴다(BR4.3). */
  @Column({ type: 'timestamptz' })
  consentedAt!: Date;

  /** 접근 토큰 만료와 같은 값을 같은 트랜잭션에 쓴다. 접근 판정은 토큰의 만료로 한다(BR4.7). */
  @Column({ type: 'timestamptz' })
  expiresAt!: Date;
}
