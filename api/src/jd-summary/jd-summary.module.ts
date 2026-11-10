import { type DynamicModule, Inject, type InjectionToken, Module, type ModuleMetadata, type OnModuleInit } from '@nestjs/common';
import { AI_GENERATION_GATE, AiGenerationModule } from '../ai-generation/ai-generation.module';
import type { AiGenerationGate } from '../ai-generation/ai-generation.types';
import { AiConsentModule } from '../ai-consent/ai-consent.module';
import { AiRun } from '../ai-run/ai-run';
import { AiRunModule } from '../ai-run/ai-run.module';
import { DailyRunLimitModule } from '../daily-run-limit/daily-run-limit.module';
import type { PublicationAccess } from '../publications/publication-access';
import { PUBLISHED_SEARCH, PublishedIndexModule } from '../published-index/published-index.module';
import type { PublishedSearch } from '../published-index/published-search';
import { JdSummaryController } from './jd-summary.controller';
import { createJdLogger } from './jd-summary-log';
import { createJdSummaryHandler } from './jd-summary-processor';
import { JdSummaryService } from './jd-summary.service';
import { JdSummaryStore } from './jd-summary-store';
import { JD_PUBLICATION_ACCESS, JD_SUMMARY_OPTIONS, type JdSummaryOptions } from './jd-summary-tokens';

type PublicationAccessSource = { useExisting: InjectionToken }
  | { useFactory: (...args: never[]) => PublicationAccess | Promise<PublicationAccess>; inject?: InjectionToken[] }
  | { useValue: PublicationAccess };

/** #416 실제 C-10 제공자가 준비된 조립 지점에서만 등록한다. AppModule에 합성 제공자를 넣지 않는다. */
@Module({})
export class JdSummaryModule implements OnModuleInit {
  constructor(private readonly aiRun: AiRun, private readonly store: JdSummaryStore,
    @Inject(PUBLISHED_SEARCH) private readonly search: PublishedSearch,
    @Inject(AI_GENERATION_GATE) private readonly gate: AiGenerationGate,
    @Inject(JD_SUMMARY_OPTIONS) private readonly options: JdSummaryOptions) {}

  static register(options: { publicationAccess: PublicationAccessSource; imports?: ModuleMetadata['imports'] }): DynamicModule {
    return { module: JdSummaryModule, imports: [AiGenerationModule, AiConsentModule, AiRunModule, DailyRunLimitModule, PublishedIndexModule, ...(options.imports ?? [])],
      controllers: [JdSummaryController], providers: [JdSummaryService, JdSummaryStore,
        { provide: JD_PUBLICATION_ACCESS, ...options.publicationAccess },
        { provide: JD_SUMMARY_OPTIONS, useFactory: (): JdSummaryOptions => ({ clock: () => new Date(), logger: createJdLogger() }) }] };
  }
  onModuleInit(): void {
    this.aiRun.registerHandler('JD_SUMMARY', createJdSummaryHandler({ store: this.store, search: this.search, gate: this.gate, ...this.options }));
  }
}
