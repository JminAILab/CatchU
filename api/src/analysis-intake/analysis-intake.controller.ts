import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { AnalysisHistoryService } from './analysis-history';
import { AnalysisIntakeService } from './analysis-intake.service';

/** 계약에 쿼리가 없는 조회 경로. 쿼리가 붙으면 입력값을 담지 않고 400이다. */
function assertNoQuery(query: Record<string, unknown>): void {
  if (Object.keys(query).length) {
    throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'query', reason: 'whitelistValidation' }] } });
  }
}

@Controller()
export class AnalysisIntakeController {
  constructor(private readonly intake: AnalysisIntakeService, private readonly history: AnalysisHistoryService) {}
  @Get('analysis-notice')
  notice(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new ApiError('VALIDATION_FAILED');
    return this.intake.notice(memberId);
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
  /** 본인 분석 이력(#140). 쿼리는 `cursor`·`limit`만 받는다. */
  @Get('analysis-requests')
  list(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>) {
    return this.history.list(memberId, query);
  }
  /** 개별 분석 상태(#140). 계약에 쿼리가 없으므로 붙으면 400이다. */
  @Get('analysis-requests/:requestId')
  status(@CurrentMemberId() memberId: string, @Param('requestId') requestId: string,
    @Query() query: Record<string, unknown>) {
    assertNoQuery(query);
    return this.history.get(memberId, requestId);
  }
  /** 홈용 본인 분석 접수 이력 유무(#428). 계약에 쿼리가 없으므로 붙으면 400이다. */
  @Get('me/analysis-summary')
  summary(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>) {
    assertNoQuery(query);
    return this.history.summary(memberId);
  }
}
