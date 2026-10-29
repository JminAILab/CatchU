// 계정당 하루 실행 제한(계약 C-03 DailyRunLimit, U2 기능 설계 W1·BR1.1~BR1.7, 비기능 NFR4.3·NFR4.7).
// 실행을 접수할 때 1을 쓰고 돌려주지 않는다. 판정은 DB 조건부 쓰기 한 문장뿐이며 프로세스 메모리에 횟수를 두지 않는다.
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/** 계정당 하루 실행 한도. 바꾸려면 코드 PR로 바꾼다(BR1.7). 응답·화면에 이 값을 내보내지 않는다(BR1.4). */
export const DAILY_RUN_LIMIT = 30;

/** 한국 시간(UTC+9, 서머타임 없음)의 날짜 경계(BR1.2). */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 하루 횟수를 쓰는 실행 종류(BR1.1). 질의응답·[검색 다시 준비]는 consume을 부르지 않는다. */
export const DAILY_RUN_KINDS = ['ANALYSIS', 'BASE_SUMMARY', 'JD_SUMMARY'] as const;
export type DailyRunKind = (typeof DAILY_RUN_KINDS)[number];

export type DailyRunDecision = 'ALLOWED' | 'LIMIT_REACHED';

/**
 * 행이 없으면 1로 만들고, 있으면 한도 미만일 때만 1 더한다(NFR4.3). 별도 SELECT·잠금이 없다.
 * 같은 행을 동시에 쓰면 PostgreSQL이 뒤 문장을 앞 문장 커밋 뒤의 값으로 다시 판정하므로 남은 1회를 둘이 함께 쓰지 않는다(BR1.3).
 */
const CONSUME_SQL = `INSERT INTO daily_execution_count (member_id, usage_date, count) VALUES ($1, $2, 1)
  ON CONFLICT (member_id, usage_date) DO UPDATE SET count = daily_execution_count.count + 1
  WHERE daily_execution_count.count < $3
  RETURNING count`;

/** now를 한국 시간으로 옮긴 날짜 'YYYY-MM-DD'(BR1.2). */
export function koreanUsageDate(now: Date): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('now는 유효한 Date여야 합니다.');
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

@Injectable()
export class DailyRunLimit {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 그 회원의 오늘 횟수에 1을 쓴다. 호출 Unit은 LIMIT_REACHED면 접수를 멈추고 `new ApiError('DAILY_LIMIT_REACHED')`를 던진다.
   * manager를 넘기면 그 트랜잭션 안에서 쓰므로 호출자가 트랜잭션을 되돌리면 횟수도 되돌아간다(C-03 발행).
   * DB 오류(없는 회원의 외래 키 위반 포함)는 그대로 던지고 접수하지 않는다(BR1.3).
   */
  async consume(memberId: string, kind: DailyRunKind, now: Date, manager?: EntityManager): Promise<DailyRunDecision> {
    if (!DAILY_RUN_KINDS.includes(kind)) throw new TypeError('하루 횟수를 쓰지 않는 실행 종류입니다.');
    const usageDate = koreanUsageDate(now);
    const runner = manager ?? this.dataSource.manager;
    const rows: unknown = await runner.query(CONSUME_SQL, [memberId, usageDate, DAILY_RUN_LIMIT]);
    if (!Array.isArray(rows)) throw new Error('하루 실행 횟수 쓰기 결과 모양이 맞지 않습니다.');
    return rows.length > 0 ? 'ALLOWED' : 'LIMIT_REACHED';
  }
}
