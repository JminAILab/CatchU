import { DynamicModule, Logger, Module } from '@nestjs/common';
import { AnalysisReceiver } from './analysis-receiver.service';
import { DevAnalysisInjection, readDevInjectionConfig } from './dev-analysis-injection';
import { ReceiverStore, RejectionLog } from './receiver.types';
import { WorkerMessageValidator } from './worker-message.validator';
import { DataSource } from 'typeorm';
import { DatabaseModule } from '../database/database.module';
import { DatabaseReceiverStore } from './database-receiver.store';
import { AnalysisRegistrationService } from './analysis-registration.service';
import { RepositoryObservationSource } from './repository-observation.source';

@Module({})
export class AnalysisReceiverModule {
  /** 실제 수신 저장·B 등록을 조립한다. 내부 호출만 제공하며 worker 공개 라우트를 만들지 않는다. */
  static registerDatabase(options: {
    contractDirectory: string;
    observations: RepositoryObservationSource;
    log?: RejectionLog;
  }): DynamicModule {
    const logger = new Logger('AnalysisRegistration');
    const log = options.log ?? { record: (kind: 'Result' | 'ProcessingEvent', code: string) => logger.warn({ kind, code }) };
    return {
      module: AnalysisReceiverModule,
      imports: [DatabaseModule],
      providers: [
        { provide: DatabaseReceiverStore, inject: [DataSource],
          useFactory: (db: DataSource) => new DatabaseReceiverStore(db) },
        { provide: AnalysisReceiver, inject: [DatabaseReceiverStore],
          useFactory: (store: DatabaseReceiverStore) => new AnalysisReceiver(store,
            new WorkerMessageValidator(options.contractDirectory), log) },
        { provide: AnalysisRegistrationService, inject: [AnalysisReceiver, DataSource],
          useFactory: (receiver: AnalysisReceiver, db: DataSource) => new AnalysisRegistrationService(
            receiver, db, options.observations, { failed: code => logger.error({ stage: 'APPLICATION', code }) }) },
        { provide: DevAnalysisInjection, inject: [DatabaseReceiverStore, AnalysisRegistrationService],
          useFactory: (store: DatabaseReceiverStore, registration: AnalysisRegistrationService) => new DevAnalysisInjection(store, {
            receiveResult: input => registration.receiveResult(input, async () => {}),
            receiveProgress: input => registration.receiveProgress(input),
          }, readDevInjectionConfig()) },
      ],
      exports: [DatabaseReceiverStore, AnalysisReceiver, AnalysisRegistrationService, DevAnalysisInjection],
    };
  }

  // 독립 저장소로 수신 로직만 조립한다. 실제 DB/B 연결은 위 registerDatabase를 사용한다.
  static register(options: {
    store: ReceiverStore;
    contractDirectory: string;
    log?: RejectionLog;
  }): DynamicModule {
    const logger = new Logger('AnalysisReceiver');
    const log: RejectionLog = options.log ?? { record: (kind, code) => logger.warn({ kind, code }) };
    return {
      module: AnalysisReceiverModule,
      providers: [
        {
          provide: AnalysisReceiver,
          useFactory: () => new AnalysisReceiver(options.store, new WorkerMessageValidator(options.contractDirectory), log),
        },
        {
          provide: DevAnalysisInjection,
          inject: [AnalysisReceiver],
          useFactory: (receiver: AnalysisReceiver) => new DevAnalysisInjection(options.store, receiver, readDevInjectionConfig()),
        },
      ],
      exports: [AnalysisReceiver, DevAnalysisInjection],
    };
  }
}
