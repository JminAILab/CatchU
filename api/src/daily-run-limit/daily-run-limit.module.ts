import { Module } from '@nestjs/common';
import { DailyRunLimit } from './daily-run-limit';

/** 소비 Unit(U4·U5·U7·U10)이 imports에 넣어 DailyRunLimit을 주입받는다(C-03). HTTP 경로는 없다. */
@Module({ providers: [DailyRunLimit], exports: [DailyRunLimit] })
export class DailyRunLimitModule {}
