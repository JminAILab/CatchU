import { EntityManager } from 'typeorm';

/** 잠금 대기 후 최신 커밋을 읽어야 하므로 공유 생성 함수는 READ COMMITTED만 받는다. */
export async function requireCreationTransaction(manager: EntityManager): Promise<void> {
  if (!manager.queryRunner?.isTransactionActive) throw new Error('Creation requires an active transaction');
  const [{ transaction_isolation: isolation }] = await manager.query('SHOW transaction_isolation');
  if (isolation !== 'read committed') throw new Error('Creation requires READ COMMITTED isolation');
}
