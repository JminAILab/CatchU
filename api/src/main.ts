import 'reflect-metadata';
import { isIP } from 'node:net';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createApplicationModule, startAnalysisQueue } from './application.module';
import { AnalysisDeadlineScheduler } from './analysis-deadline/analysis-deadline.module';
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

  const app = await NestFactory.create(createApplicationModule());
  try {
    await configureApp(app);
    app.enableShutdownHooks();
    await app.listen(port, host);
    // 주기 작업은 실제 서버에서만 돈다. AppModule을 띄우는 테스트는 시작하지 않는다.
    app.get(AnalysisDeadlineScheduler).start();
    // 큐 연결(#233)은 큐 주소가 있을 때만 조립되어 여기서 시작한다. 받기가 멈추면 앱을 닫고 종료 코드 1로 끝낸다.
    startAnalysisQueue(app);
  } catch (error) {
    // 이미 열린 DB 연결 풀을 닫는다. 닫지 않으면 유휴 연결이 시한(10초)까지 프로세스를 붙잡아 종료가 늦어진다.
    await app.close().catch((closeError: unknown) => {
      Logger.error(closeError instanceof Error ? closeError.message : 'API 종료 실패', undefined, 'Bootstrap');
    });
    throw error;
  }
  Logger.log(`API 실행: http://${family === 6 ? `[${host}]` : host}:${port}/health`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : 'API 기동 실패', undefined, 'Bootstrap');
  process.exitCode = 1;
});
