import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ErrorsModule } from './common/errors';
import { NoStoreInterceptor } from './common/http/no-store.interceptor';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { AnalysisDeadlineModule } from './analysis-deadline/analysis-deadline.module';
import { ShareLinksModule } from './share-links/share-links.module';
import { MemberProfileModule } from './member-profile/member-profile.module';
import { CatchesModule } from './catches/catches.module';
import { MemberRepositoriesModule } from './member-repositories/member-repositories.module';
import { GoogleLoginModule } from './google-login/google-login.module';
import { AnalysisIntakeModule } from './analysis-intake/analysis-intake.module';

@Module({
  imports: [
    ErrorsModule,
    AuthModule,
    DatabaseModule,
    AnalysisDeadlineModule,
    ShareLinksModule,
    CatchesModule,
    MemberRepositoriesModule,
    MemberProfileModule,
    GoogleLoginModule,
    AnalysisIntakeModule,
    // #232는 #252의 실제 선정 공급자를 받는 WorkerContextModule.register로 별도 조립한다.
    // 기본 앱에 가짜 선정/동의 해석을 등록하지 않는다(docs/worker-context.md).
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
})
export class AppModule {}
