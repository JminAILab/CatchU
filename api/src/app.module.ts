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
import { RecipientModule } from './recipient/recipient.module';
import { MaterialsModule } from './materials/materials.module';
import { AiConsentModule } from './ai-consent/ai-consent.module';
import { WithdrawalModule } from './withdrawal/withdrawal.module';
import { PublishedIndexModule } from './published-index/published-index.module';
import { ClaudeMcpModule } from './claude-mcp/claude-mcp.module';
import { JdManagementModule } from './jd/jd.module';

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
    RecipientModule,
    MaterialsModule,
    // 12월 intent U2: 첫 이용 동의 API(C-04), 탈퇴 DELETE /v1/me(C-06). 파일 저장 설정이 있으면 여기서 기동 때 검사한다.
    AiConsentModule,
    WithdrawalModule,
    // 12월 intent U3: 발행본 색인·검색(C-08·C-09). 기동 때 임베딩 키를 판정하고 EMBED_PUBLICATION 처리기를 AiRun에 한 번 등록한다(#431).
    // 큐 주소가 있으면 AiRun이 앱 기동 뒤 ai-run 큐 소비를 시작한다(docs/ai-run.md).
    PublishedIndexModule,
    // 12월 intent U6: Claude 본인 연결(C-15). /v1/mcp와 연결 관리 API를 두고 기동 때 앱 루트에 OAuth 주소를 건다(docs/claude-mcp.md).
    ClaudeMcpModule,
    JdManagementModule,
    // #232는 #252의 실제 선정 공급자(DatabaseRepositorySelectionSource)를 받는 WorkerContextModule.register로 별도 조립한다.
    // 기본 앱에 가짜 선정/동의 해석을 등록하지 않는다(docs/worker-context.md).
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
})
export class AppModule {}
