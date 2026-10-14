import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ErrorsModule } from './common/errors';
import { NoStoreInterceptor } from './common/http/no-store.interceptor';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { ShareLinksModule } from './share-links/share-links.module';
import { MemberProfileModule } from './member-profile/member-profile.module';
import { CatchesModule } from './catches/catches.module';
import { MemberRepositoriesModule } from './member-repositories/member-repositories.module';
import { GoogleLoginModule } from './google-login/google-login.module';
import { AnalysisDeadlineModule } from './analysis-deadline/analysis-deadline.module';

@Module({
  imports: [
    ErrorsModule,
    AuthModule,
    DatabaseModule,
    ShareLinksModule,
    CatchesModule,
    MemberRepositoriesModule,
    MemberProfileModule,
    GoogleLoginModule,
    AnalysisDeadlineModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
})
export class AppModule {}
