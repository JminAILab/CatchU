import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ErrorsModule } from './common/errors';
import { NoStoreInterceptor } from './common/http/no-store.interceptor';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [ErrorsModule, AuthModule, DatabaseModule],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
})
export class AppModule {}
