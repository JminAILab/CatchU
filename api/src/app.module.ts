import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ErrorsModule } from './common/errors';
import { NoStoreInterceptor } from './common/http/no-store.interceptor';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { AnalysisDeadlineModule } from './analysis-deadline/analysis-deadline.module';
import { MemberProfileModule } from './member-profile/member-profile.module';
import { CatchesModule } from './catches/catches.module';
import { MemberRepositoriesModule } from './member-repositories/member-repositories.module';
import { GoogleLoginModule } from './google-login/google-login.module';
import { AnalysisIntakeModule } from './analysis-intake/analysis-intake.module';
import { MaterialsModule } from './materials/materials.module';
import { AiConsentModule } from './ai-consent/ai-consent.module';
import { WithdrawalModule } from './withdrawal/withdrawal.module';
import { PublishedIndexModule } from './published-index/published-index.module';
import { ClaudeMcpModule } from './claude-mcp/claude-mcp.module';
import { JdManagementModule } from './jd/jd.module';
import { JdSummaryModule } from './jd-summary/jd-summary.module';
import { PUBLICATION_ACCESS, PublicationsModule } from './publications/publications.module';
import { RagAnswerModule } from './rag-answer/rag-answer.module';

@Module({
  imports: [
    ErrorsModule,
    AuthModule,
    DatabaseModule,
    AnalysisDeadlineModule,
    CatchesModule,
    MemberRepositoriesModule,
    MemberProfileModule,
    GoogleLoginModule,
    AnalysisIntakeModule,
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
    // 12월 intent U4: 발행·작성자 발행본 관리 API(/v1/publications), C-10 DB 구현(PUBLICATION_ACCESS), 받은 사람 경로(/v1/public/links/...).
    // 10월 ShareLinksModule(공유 링크 발급·목록·중지)·RecipientModule(공개 프로필·Catch 목록·상세)은 제출 3(W6)에서 이 모듈로 대체했다
    // (docs/publications.md). share_link 표·엔티티는 OQ-U4-3 결정 전까지 남는다.
    PublicationsModule,
    // 12월 intent U5: 질의응답(SSE)·AI 기본 요약 경로와 BASE_SUMMARY 처리기(기동 때 AiRun에 한 번 등록). C-10은 U4의 DB 구현을
    // 그 모듈이 내보낸 토큰으로 받는다. 메모리 가짜(in-memory-publication-access.ts)는 앱에 넣지 않는다(docs/rag-answer.md).
    RagAnswerModule.register({ imports: [PublicationsModule], publicationAccess: { useExisting: PUBLICATION_ACCESS } }),
    // U10: #468 병합과 #416 OQ5·OQ6 결정에 따라 실제 C-10을 사용한다. C-11은 web의 JdRecipientPanel이 연결한다.
    JdSummaryModule.register({ publicationAccess: { useExisting: PUBLICATION_ACCESS }, imports: [PublicationsModule] }),
    // #232는 #252의 실제 선정 공급자(DatabaseRepositorySelectionSource)를 받는 WorkerContextModule.register로 별도 조립한다.
    // 기본 앱에 가짜 선정/동의 해석을 등록하지 않는다(docs/worker-context.md).
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
})
export class AppModule {}
