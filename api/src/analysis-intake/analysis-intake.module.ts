import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GitHubConnectionModule } from '../github-connection/github-connection.module';
import { MemberRepositoriesModule } from '../member-repositories/member-repositories.module';
import { AnalysisIntakeController } from './analysis-intake.controller';
import { AnalysisIntakeService } from './analysis-intake.service';
import { AnalysisNoticeService } from './analysis-notice';

// 실제 회원 접수(#323)는 #252 선정 공급의 접수 재확인과 #231 연결 상태 갱신을 쓴다.
@Module({ imports: [AuthModule, GitHubConnectionModule, MemberRepositoriesModule], controllers: [AnalysisIntakeController],
  providers: [AnalysisIntakeService, AnalysisNoticeService] })
export class AnalysisIntakeModule {}
