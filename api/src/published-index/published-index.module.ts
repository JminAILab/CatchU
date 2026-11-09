// U3 발행본 색인·검색의 Nest 조립(#431). 기본 앱(AppModule)이 가져오므로 api 기동 때 아래 두 일이 돈다.
// 1) 임베딩 제공자 판정: 키 있음 → Voyage, 키 없음·development/test → 합성, 그 밖 → 기동 오류(BR6.1, embedding-provider.ts)
// 2) AiRun에 EMBED_PUBLICATION 처리기 등록: 종류마다 하나(C-02, BR5.1)
// U4·U5·U10은 자기 모듈 imports에 이 모듈을 넣고 @Inject(PUBLISHED_INDEX_WRITER)·@Inject(PUBLISHED_SEARCH)로 받는다.
// Nest는 같은 모듈을 한 번만 만들므로 여러 모듈이 가져와도 판정과 처리기 등록은 한 번이다.
import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiRun } from '../ai-run/ai-run';
import { AiRunModule } from '../ai-run/ai-run.module';
import { createEmbedPublicationHandler } from './embed-publication-handler';
import { readEmbeddingConfig } from './embedding-config';
import { createEmbeddingProvider } from './embedding-provider';
import type { EmbeddingProvider } from './embedding-types';
import { createPublishedIndexWriter } from './published-index-writer';
import { createPublishedSearch } from './published-search';

/** C-08 PublishedIndexWriter. U4가 받는다. */
export const PUBLISHED_INDEX_WRITER = Symbol('PUBLISHED_INDEX_WRITER');
/** C-09 PublishedSearch. U4·U5·U10이 받는다. */
export const PUBLISHED_SEARCH = Symbol('PUBLISHED_SEARCH');
/** 검색과 처리기가 함께 쓰는 임베딩 제공자. 다른 모듈에는 내보내지 않는다(시험만 app.get으로 읽는다). */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

@Module({
  imports: [AiRunModule],
  providers: [
    // 모듈을 만들 때(api 기동 때) 한 번 판정한다. 키 없음 + 운영이면 여기서 기동이 멈추고 오류에 키 값은 없다.
    { provide: EMBEDDING_PROVIDER, useFactory: () => createEmbeddingProvider(readEmbeddingConfig(process.env), process.env) },
    { provide: PUBLISHED_INDEX_WRITER, inject: [DataSource, AiRun],
      useFactory: (dataSource: DataSource, aiRun: AiRun) => createPublishedIndexWriter({ dataSource, aiRun }) },
    { provide: PUBLISHED_SEARCH, inject: [DataSource, EMBEDDING_PROVIDER],
      useFactory: (dataSource: DataSource, provider: EmbeddingProvider) => createPublishedSearch({ dataSource, provider }) },
  ],
  exports: [PUBLISHED_INDEX_WRITER, PUBLISHED_SEARCH],
})
export class PublishedIndexModule implements OnModuleInit {
  constructor(
    private readonly aiRun: AiRun,
    private readonly dataSource: DataSource,
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
  ) {}

  /** AiRun은 앱 기동이 끝난 뒤(모든 모듈 초기화 뒤) 소비를 시작하므로 첫 작업보다 먼저 등록된다. */
  onModuleInit(): void {
    this.aiRun.registerHandler('EMBED_PUBLICATION',
      createEmbedPublicationHandler({ dataSource: this.dataSource, provider: this.provider }));
  }
}
