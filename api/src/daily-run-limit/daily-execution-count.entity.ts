// 회원 한 명의 하루 실행 횟수(C-03 표 daily_execution_count, U2 entities DailyExecutionCount).
// 한도 값 30은 DB 제약으로 두지 않고 코드 상수로 판정한다(BR1.3·BR1.7). 회원을 따라 지워진다(BR7.7).
import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';

@Entity()
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@Check('"count" >= 0')
export class DailyExecutionCount {
  @PrimaryColumn({ type: 'uuid' }) memberId!: string;
  /** 한국 시간 날짜 'YYYY-MM-DD'(BR1.2). pg는 date를 문자열로 돌려준다. */
  @PrimaryColumn({ type: 'date' }) usageDate!: string;
  @Column({ type: 'integer' }) count!: number;
}
