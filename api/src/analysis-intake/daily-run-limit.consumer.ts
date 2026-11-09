import type { EntityManager } from 'typeorm';

/** U2 C-03을 연결하는 U7 소비 자리. 계수 표·KST 계산·제품 대역은 U7에서 만들지 않는다. */
export const ANALYSIS_DAILY_RUN_LIMIT = Symbol('ANALYSIS_DAILY_RUN_LIMIT');
export interface AnalysisDailyRunLimit {
  consume(memberId: string, kind: 'ANALYSIS', now: Date, manager: EntityManager): Promise<'ALLOWED' | 'LIMIT_REACHED'>;
}
