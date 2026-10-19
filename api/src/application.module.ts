import { DynamicModule, Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { readWorkerContextAuthConfig } from './auth/worker-context-auth';
import { DatabaseRepositorySelectionSource } from './member-repositories/repository-selection.source';
import { WorkerContextModule } from './worker-context/worker-context.module';

@Module({})
class ApplicationModule {}

/**
 * 제품 진입점에서 설정을 읽고 내부 조회를 조립한다. 모듈 import 시점에는 환경을 확정하지 않는다.
 * 활성화한 경우에만 #252의 실제 DB 선정 공급을 연결하며, 시험 공급자나 합성 동의로 대체하지 않는다.
 */
export function createApplicationModule(): DynamicModule {
  const workerContext = readWorkerContextAuthConfig();
  return {
    module: ApplicationModule,
    imports: [
      AppModule,
      ...(workerContext.enabled ? [WorkerContextModule.register({
        selectionSource: new DatabaseRepositorySelectionSource(),
      })] : []),
    ],
  };
}
