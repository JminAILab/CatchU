import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const portValue = process.env.PORT ?? '3001';
  const port = Number(portValue);
  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT는 1~65535 사이의 정수여야 합니다.');
  }

  const app = await configureApp(await NestFactory.create(AppModule));
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
  Logger.log(`API 실행: http://127.0.0.1:${port}/health`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : 'API 기동 실패', undefined, 'Bootstrap');
  process.exitCode = 1;
});
