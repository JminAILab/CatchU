import { Module } from '@nestjs/common';
import { createCheckedAiGenerationGate } from './checked-gate';

/** 소비 Unit(U5·U10)은 `@Inject(AI_GENERATION_GATE)`로 C-01 AiGenerationGate를 받는다. */
export const AI_GENERATION_GATE = Symbol('AI_GENERATION_GATE');

/**
 * U2 게이트를 Nest에 등록한다. 키는 CATCHU_GENERATION_API_KEY에서 읽고 로그·오류에 넣지 않는다.
 * 키가 없어도 api는 기동하며, 부를 때 AiProviderError(CALL_FAILED/NOT_CONFIGURED)로 끝난다(U1 「앱 미등록과 쓰는 조건」을 이어감).
 * HTTP 경로가 없어 기본 앱(AppModule)에는 넣지 않고, 쓰는 Unit의 모듈이 imports에 넣는다.
 */
@Module({
  providers: [{ provide: AI_GENERATION_GATE, useFactory: () => createCheckedAiGenerationGate({ apiKey: process.env.CATCHU_GENERATION_API_KEY }) }],
  exports: [AI_GENERATION_GATE],
})
export class AiGenerationModule {}
