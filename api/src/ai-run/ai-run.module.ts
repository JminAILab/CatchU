import { Module } from '@nestjs/common';
import { readAnalysisQueueConfig } from '../analysis-queue/analysis-queue.config';
import { AI_RUN_CONFIG, AiRun } from './ai-run';

/**
 * AiRun 제공(C-02). 처리기를 가진 Unit(U3·U5·U10)과 작업을 등록하는 Unit(U4·U5·U10)이 imports에 넣는다.
 * 큐 주소는 10월 분석 큐와 같은 설정을 읽는다(없으면 null, 틀리면 기동 실패). 기본 앱(AppModule)에는 넣지 않는다.
 */
@Module({
  providers: [{ provide: AI_RUN_CONFIG, useFactory: () => readAnalysisQueueConfig() }, AiRun],
  exports: [AiRun],
})
export class AiRunModule {}
