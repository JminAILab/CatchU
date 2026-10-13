import { Body, Controller, Get, Headers, Post, Query, Res } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { AnalysisIntakeService } from './analysis-intake.service';
import { AnalysisNoticeService } from './analysis-notice';

@Controller()
export class AnalysisIntakeController {
  constructor(private readonly intake: AnalysisIntakeService, private readonly notices: AnalysisNoticeService) {}
  @Get('analysis-notice')
  notice(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new ApiError('VALIDATION_FAILED');
    return this.notices.current();
  }
  @Post('analysis-requests')
  async create(@CurrentMemberId() memberId: string, @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown, @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: { status(code: number): unknown }) {
    if (Object.keys(query).length) throw new ApiError('VALIDATION_FAILED');
    const result = await this.intake.create(memberId, key, body);
    response.status(result.existing ? 200 : 202);
    return result.status;
  }
}
