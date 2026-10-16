import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ApiExceptionFilter } from './api-exception.filter';
import { createValidationPipe } from './validation.pipe';

/**
 * 전역 오류 필터와 입력 검증 파이프를 등록한다.
 * AppModule을 쓰는 실행(main.ts)과 테스트 모두에 같은 처리가 적용된다.
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class ErrorsModule {}
