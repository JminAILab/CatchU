import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApiExceptionFilter } from './api-exception.filter';

/** 전역 오류 필터를 등록한다. AppModule을 쓰는 실행·테스트 모두에 같은 필터가 적용된다. */
@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class ErrorsModule {}
