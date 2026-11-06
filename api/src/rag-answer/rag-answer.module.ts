// U5 RAG 응답 모듈(logical-components, 비기능 설계 Q1 「앱 등록 시점」).
// 컨트롤러 둘(질의응답·기본 요약)과 BASE_SUMMARY 처리기 등록, 다시 쓰기·질문 횟수 자리를 조립한다.
// C-10 PublicationAccess는 register()로 받는다. 기본 앱(AppModule)은 U4 PublicationsModule이 내보낸 DB 구현을 넣는다.
// 메모리 가짜는 시험에서만 쓰고 어느 경우에도 앱에 넣지 않는다.
import {
  type DynamicModule, Inject, type InjectionToken, Module, type ModuleMetadata, type OnApplicationShutdown, type OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AI_GENERATION_GATE, AiGenerationModule } from '../ai-generation/ai-generation.module';
import type { AiGenerationGate } from '../ai-generation/ai-generation.types';
import { readAnalysisQueueConfig } from '../analysis-queue/analysis-queue.config';
import { AiRun } from '../ai-run/ai-run';
import { AiRunModule } from '../ai-run/ai-run.module';
import { DailyRunLimitModule } from '../daily-run-limit/daily-run-limit.module';
import type { PublicationAccess } from '../publications/publication-access';
import { PublishedIndexModule } from '../published-index/published-index.module';
import { createBaseSummaryHandler } from './base-summary-handler';
import { QnaController } from './qna.controller';
import { createQuestionCounter, QUESTION_COUNTER, type QuestionCounter } from './question-counter';
import { createQuestionRewriter, QUESTION_REWRITER } from './question-rewriter';
import { SSE_KEEP_ALIVE_MS } from './rag-answer-config';
import { createRagAnswerLogger } from './rag-answer-log';
import { PUBLICATION_ACCESS, RAG_ANSWER_OPTIONS, type RagAnswerOptions } from './rag-answer-tokens';
import { SummaryController } from './summary.controller';

export { PUBLICATION_ACCESS, RAG_ANSWER_OPTIONS } from './rag-answer-tokens';

/** PublicationAccess 공급 방법. U4 모듈을 imports에 넣고 그 토큰을 useExisting으로 가리키거나, 만들기 함수를 넘긴다. */
export type PublicationAccessSource =
  | { useExisting: InjectionToken }
  | { useFactory: (...args: never[]) => PublicationAccess | Promise<PublicationAccess>; inject?: InjectionToken[] }
  | { useValue: PublicationAccess };

export interface RagAnswerModuleOptions {
  publicationAccess: PublicationAccessSource;
  /** PublicationAccess를 내보내는 모듈(U4). */
  imports?: ModuleMetadata['imports'];
}

@Module({})
export class RagAnswerModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly aiRun: AiRun,
    private readonly dataSource: DataSource,
    @Inject(PUBLICATION_ACCESS) private readonly publicationAccess: PublicationAccess,
    @Inject(AI_GENERATION_GATE) private readonly gate: AiGenerationGate,
    @Inject(QUESTION_COUNTER) private readonly counter: QuestionCounter,
    @Inject(RAG_ANSWER_OPTIONS) private readonly options: RagAnswerOptions,
  ) {}

  static register(options: RagAnswerModuleOptions): DynamicModule {
    return {
      module: RagAnswerModule,
      imports: [AiGenerationModule, AiRunModule, DailyRunLimitModule, PublishedIndexModule, ...(options.imports ?? [])],
      controllers: [QnaController, SummaryController],
      providers: [
        { provide: PUBLICATION_ACCESS, ...options.publicationAccess },
        // 키는 만들기 함수에서만 읽는다. 비면 기동은 되고 부를 때마다 NOT_CONFIGURED(security-design NFR2.3).
        { provide: QUESTION_REWRITER, useFactory: () => createQuestionRewriter({ apiKey: process.env.CATCHU_GENERATION_API_KEY }) },
        // 큐와 같은 Redis 설정(CATCHU_QUEUE_REDIS_URL·CATCHU_QUEUE_PREFIX). 없으면 늘 통과, 틀리면 기동 실패(AiRun과 같은 판정).
        { provide: QUESTION_COUNTER, useFactory: () => createQuestionCounter(readAnalysisQueueConfig()) },
        { provide: RAG_ANSWER_OPTIONS, useFactory: (): RagAnswerOptions => (
          { clock: () => new Date(), keepAliveMs: SSE_KEEP_ALIVE_MS, logger: createRagAnswerLogger() }) },
      ],
    };
  }

  /** AiRun은 앱 기동이 끝난 뒤 소비를 시작하므로 첫 작업보다 먼저 등록된다. 종류마다 한 번(C-02). */
  onModuleInit(): void {
    this.aiRun.registerHandler('BASE_SUMMARY', createBaseSummaryHandler({
      dataSource: this.dataSource, publicationAccess: this.publicationAccess, gate: this.gate,
      clock: this.options.clock, logger: this.options.logger,
    }));
  }

  /** 질문 횟수 전용 Redis 연결을 닫는다(quit 뒤 disconnect, NFR4.4). */
  async onApplicationShutdown(): Promise<void> {
    await this.counter.close();
  }
}
