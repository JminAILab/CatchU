import 'reflect-metadata';
import { isIP } from 'node:net';
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
  // 호스트 이름은 받지 않는다. localhost처럼 IPv4·IPv6 중 어디에 열릴지 환경마다 달라지는 것을 막는다.
  const host = process.env.BIND_HOST ?? '127.0.0.1';
  const family = isIP(host);
  if (family === 0) {
    throw new Error('BIND_HOST는 IP 주소여야 합니다(예: 127.0.0.1, 0.0.0.0).');
  }

  const app = await configureApp(await NestFactory.create(AppModule));
  app.enableShutdownHooks();
  await app.listen(port, host);
  Logger.log(`API 실행: http://${family === 6 ? `[${host}]` : host}:${port}/health`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : 'API 기동 실패', undefined, 'Bootstrap');
  process.exitCode = 1;
});
