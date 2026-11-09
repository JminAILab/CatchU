import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import { lengthBetween } from '../database/checks';

/**
 * Claude가 등록한 OAuth 클라이언트 하나(U6 기능 설계 entities, 계약 C-15).
 *
 * - 비밀값 칸이 없는 공개 클라이언트다(BR2.1). 회원을 가리키지 않아 탈퇴를 따라 지워지지 않는다(C-06).
 * - 승인에 쓰인 적 없고 7일이 지난 행은 다음 등록 요청 때 지운다(BR2.4).
 */
@Entity('mcp_client')
@Check(lengthBetween('client_name', 0, 200))
@Check('cardinality("redirect_uris") >= 1')
@Check('array_position("redirect_uris", NULL) IS NULL')
export class McpClient {
  /** OAuth client_id. SDK가 만든 값이지만 요청으로 들어오므로 없는 값이 형식 오류가 되지 않게 text로 둔다. */
  @PrimaryColumn({ type: 'text' })
  mcpClientId!: string;

  /** 클라이언트가 스스로 적은 값이라 화면에 보이지 않는다(BR3.5). */
  @Column({ type: 'text', nullable: true })
  clientName!: string | null;

  @Column({ type: 'text', array: true })
  redirectUris!: string[];

  @Column({ type: 'timestamptz' })
  registeredAt!: Date;

  /** 승인 버튼으로 코드를 처음 만들 때 한 번 채운다(BR3.7). */
  @Column({ type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;
}
