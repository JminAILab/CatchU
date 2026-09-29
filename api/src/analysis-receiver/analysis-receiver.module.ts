import { DynamicModule, Logger, Module } from '@nestjs/common';
import { AnalysisReceiver } from './analysis-receiver.service';
import { DevAnalysisInjection, readDevInjectionConfig } from './dev-analysis-injection';
import { ReceiverStore, RejectionLog } from './receiver.types';
import { WorkerMessageValidator } from './worker-message.validator';

@Module({})
export class AnalysisReceiverModule {
  // DB 어댑터가 준비될 때 조립한다. AppModule에는 대역 저장소를 등록하지 않는다.
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
