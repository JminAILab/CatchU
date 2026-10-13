import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalysisIntakeController } from './analysis-intake.controller';
import { AnalysisIntakeService } from './analysis-intake.service';
import { AnalysisNoticeService } from './analysis-notice';

@Module({ imports: [AuthModule], controllers: [AnalysisIntakeController],
  providers: [AnalysisIntakeService, AnalysisNoticeService] })
export class AnalysisIntakeModule {}
