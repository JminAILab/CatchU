import { resolve } from 'node:path';
import { DynamicModule, INestApplication, Logger, Module } from '@nestjs/common';
import { readAnalysisQueueConfig } from './analysis-queue/analysis-queue.config';
import { AnalysisQueueModule, AnalysisQueueRunner } from './analysis-queue/analysis-queue.module';
import { OctoberRepositoryObservationSource } from './analysis-receiver/october-repository-observation.source';
import { SelectedRepositoryRegistrationSource } from './analysis-receiver/selected-repository-registration.source';
import { AppModule } from './app.module';
import { readWorkerContextAuthConfig } from './auth/worker-context-auth';
import { DatabaseRepositorySelectionSource } from './member-repositories/repository-selection.source';
import { WorkerContextModule } from './worker-context/worker-context.module';

// 결과 수신 검증기가 읽는 계약 YAML. 저장소와 api 이미지(Dockerfile)는 api/와 같은 높이의 같은 상대 위치에 둔다.
const CONTRACT_DIRECTORY = resolve(__dirname, '../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design');

/** 제품 조립의 큐 실행기. 큐 주소가 없어 큐 연결을 조립하지 않았으면 null이다. */
const ANALYSIS_QUEUE = Symbol('ANALYSIS_QUEUE');

@Module({})
class ApplicationModule {}

/**
 * 제품 진입점에서 설정을 읽고 내부 조회와 큐 연결을 조립한다. 모듈 import 시점에는 환경을 확정하지 않는다.
 * 내부 조회는 활성화한 경우에만 #252의 실제 DB 선정 공급을 연결하며, 시험 공급자나 합성 동의로 대체하지 않는다.
 * 큐 연결(#233)은 큐 주소가 있을 때만 조립하고, 주소가 틀리면 여기서 기동을 멈춘다.
 */
export function createApplicationModule(): DynamicModule {
  const workerContext = readWorkerContextAuthConfig();
  const queue = readAnalysisQueueConfig();
  return {
    module: ApplicationModule,
    imports: [
      AppModule,
      ...(workerContext.enabled ? [WorkerContextModule.register({
        selectionSource: new DatabaseRepositorySelectionSource(),
      })] : []),
      // 10월 정책 공급자(#314)에 #319의 저장 당시 좌표를 넘긴다. 이 좌표 공급은 LIVE 전용이라 후보가 있는 MOCK 결과는
      // Catch로 등록되지 않는다(CATCH_NOT_READY). MOCK용 합성 좌표는 넣지 않는다(api/docs/selected-repository-coordinates.md).
      ...(queue ? [AnalysisQueueModule.register({
        queue,
        contractDirectory: CONTRACT_DIRECTORY,
        observationsFactory: db => new OctoberRepositoryObservationSource(new SelectedRepositoryRegistrationSource(db)),
      })] : []),
    ],
    providers: [queue
      ? { provide: ANALYSIS_QUEUE, useExisting: AnalysisQueueRunner }
      : { provide: ANALYSIS_QUEUE, useValue: null }],
  };
}

/**
 * main이 listen 뒤에 부른다. 큐 연결을 조립했으면 보내기·받기를 시작하고 true를 돌려준다.
 * 받기가 예상 밖으로 멈추면 실행기가 보내기까지 멈춘 뒤, 여기서 앱을 닫고 exit(1)을 부른다. 다시 띄우는 것은 실행 환경의 몫이다.
 * /health는 큐를 보지 않으므로 프로세스가 끝나야 실행 환경이 알아챈다(api/docs/analysis-queue.md 「수명주기」).
 */
export function startAnalysisQueue(app: INestApplication, exit: (code: number) => void = code => process.exit(code)): boolean {
  const runner = app.get<AnalysisQueueRunner | null>(ANALYSIS_QUEUE);
  if (!runner) return false;
  runner.start(() => {
    Logger.error('분석 큐 받기가 멈춰 API를 닫고 종료 코드 1로 끝냅니다.', undefined, 'Bootstrap');
    app.close().catch((error: unknown) => {
      Logger.error(error instanceof Error ? error.message : 'API 종료 실패', undefined, 'Bootstrap');
    }).finally(() => exit(1));
  });
  return true;
}
