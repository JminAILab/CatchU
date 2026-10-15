import { Inject, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatabaseModule } from '../database/database.module';
import { PeriodicTask } from '../common/periodic-task';
import { ANALYSIS_DEADLINE_CHECK_INTERVAL_MS, AnalysisDeadlineService } from './analysis-deadline.service';

/** 처리 시한 판정을 주기 실행에 연결한다. 시작은 실제 서버 진입점(main)만 하고, 앱 종료 때 멈춘다. */
@Injectable()
export class AnalysisDeadlineScheduler implements OnModuleDestroy {
  private readonly task: PeriodicTask;

  constructor(@Inject(AnalysisDeadlineService) service: AnalysisDeadlineService) {
    const logger = new Logger('AnalysisDeadline');
    this.task = new PeriodicTask({
      name: 'analysis-deadline',
      intervalMs: ANALYSIS_DEADLINE_CHECK_INTERVAL_MS,
      run: async () => { await service.closeOverdue(); },
      failed: (task, errorName) => logger.error({ event: 'PERIODIC_TASK_FAILED', task, error: errorName }),
    });
  }

  start(): void { this.task.start(); }

  // DB 연결이 닫히기 전에 진행 중인 판정을 끝낸다.
  async onModuleDestroy(): Promise<void> { await this.task.stop(); }
}

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: AnalysisDeadlineService, inject: [DataSource],
      useFactory: (db: DataSource) => {
        const logger = new Logger('AnalysisDeadline');
        return new AnalysisDeadlineService(db, {
          closed: (requestId, attemptId, decision) => logger.log({ event: 'ANALYSIS_REQUEST_CLOSED', requestId, attemptId, decision }),
          unexpected: (requestId, processing, application) =>
            logger.warn({ event: 'ANALYSIS_DEADLINE_UNEXPECTED_STATE', requestId, processing, application }),
          failed: (requestId, error) => logger.error({ event: 'ANALYSIS_DEADLINE_CLOSE_FAILED', requestId, error }),
        });
      },
    },
    AnalysisDeadlineScheduler,
  ],
  exports: [AnalysisDeadlineService, AnalysisDeadlineScheduler],
})
export class AnalysisDeadlineModule {}
