import { Module } from '@nestjs/common';
import { ErrorsModule } from './common/errors';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ErrorsModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
