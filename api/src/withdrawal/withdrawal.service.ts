// 회원 탈퇴(계약 C-06 withdrawal-order, U2 기능 설계 W7·BR7.2~BR7.5, 비기능 NFR1.2·NFR5.1·NFR5.5·NFR6.7).
// 1 접근 차단(한 트랜잭션) → 2 회원 파일 → 3 GitHub 자격정보 파일 → 4 회원 행(연쇄 삭제). 앞 단계가 실패하면 뒤 단계를 하지 않는다.
// 2·3단계는 대상이 없으면 성공이라 실패 뒤 다시 요청해도 같은 자리에서 막히지 않는다. 1단계 효과는 되돌리지 않는다.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { FILE_STORAGE, type FileStorage, memberPrefix } from '../file-storage/file-storage';
import { CredentialVault } from '../github-connection/credential-vault';
import { isCredentialReference } from '../github-connection/github-connection.service';

export type WithdrawalStep = 1 | 2 | 3 | 4;

/**
 * 1단계에서 막는 다른 Unit의 표(계약 C-07 publication, C-15 mcp_*). 표가 아직 없으면(그 Unit이 통합 브랜치에 합쳐지기 전)
 * 막을 행도 없으므로 건너뛴다. 이름은 계약에 고정된 값이며, 합친 뒤 탈퇴 통합 시험(U2 완료 조건)이 실제 표로 확인한다.
 */
const BLOCK_ACCESS_STATEMENTS: readonly { table: string; sql: string }[] = [
  { table: 'publication', sql: 'UPDATE publication SET stopped_at = $2 WHERE member_id = $1 AND stopped_at IS NULL' },
  { table: 'mcp_access_token', sql: 'DELETE FROM mcp_access_token WHERE member_id = $1' },
  { table: 'mcp_authorization_code', sql: 'DELETE FROM mcp_authorization_code WHERE member_id = $1' },
  { table: 'mcp_connection', sql: 'DELETE FROM mcp_connection WHERE member_id = $1' },
];

/** 로그에 남길 오류 이름. 메시지·경로·SQL은 남기지 않는다(NFR6.7). */
function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : 'Error';
}

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger('Withdrawal');

  constructor(
    private readonly dataSource: DataSource,
    @Inject(FILE_STORAGE) private readonly files: FileStorage,
    private readonly vault: CredentialVault,
  ) {}

  /** 4단계까지 끝나야 돌아온다. 어느 단계든 실패하면 500 WITHDRAWAL_FAILED(BR7.4). */
  async withdraw(memberId: string): Promise<void> {
    await this.step(1, () => this.dataSource.transaction('READ COMMITTED', (manager) => this.blockAccess(manager, memberId, new Date())));
    await this.step(2, () => this.files.deletePrefix(memberPrefix(memberId)));
    await this.step(3, () => this.deleteGitHubCredential(memberId));
    await this.step(4, async () => { await this.dataSource.query('DELETE FROM member_account WHERE member_id = $1', [memberId]); });
  }

  /** BR7.2: 모든 세션 폐기, 중지되지 않은 발행 링크 중지, MCP 토큰·승인 코드·연결 삭제를 한 트랜잭션에서 한다. */
  private async blockAccess(manager: EntityManager, memberId: string, now: Date): Promise<void> {
    await manager.query('UPDATE auth_session SET revoked_at = $2 WHERE member_id = $1 AND revoked_at IS NULL', [memberId, now]);
    for (const { table, sql } of BLOCK_ACCESS_STATEMENTS) {
      const [{ exists }] = await manager.query('SELECT to_regclass($1) IS NOT NULL AS exists', [table]) as { exists: boolean }[];
      if (!exists) continue;
      await manager.query(sql, table === 'publication' ? [memberId, now] : [memberId]);
    }
  }

  /** 3단계: 자격정보 파일이 있으면 지운다. 연결·참조가 없거나 파일이 이미 없으면 성공이다. */
  private async deleteGitHubCredential(memberId: string): Promise<void> {
    const rows = await this.dataSource.query('SELECT credential_reference FROM github_connection WHERE member_id = $1', [memberId]) as
      { credential_reference: string | null }[];
    for (const { credential_reference: reference } of rows) {
      if (isCredentialReference(reference)) await this.vault.remove(reference);
    }
  }

  private async step(step: WithdrawalStep, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error({ event: 'withdrawal_failed', step, error: errorName(error) });
      throw new ApiError('WITHDRAWAL_FAILED');
    }
  }
}
