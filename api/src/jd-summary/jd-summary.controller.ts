import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { JdSummaryService } from './jd-summary.service';

/** public 경로여도 회원 Guard는 필수이며 @Public을 쓰지 않는다. */
@Controller('public/links/:token/jd-summaries')
export class JdSummaryController {
  constructor(private readonly service: JdSummaryService) {}
  @Post() @HttpCode(202)
  accept(@CurrentMemberId() memberId: string, @Param('token') token: string,
    @Headers('x-link-grant') grant: string | undefined, @Body() body: unknown) {
    return this.service.accept(memberId, token, grant, body);
  }
  @Get()
  list(@CurrentMemberId() memberId: string, @Param('token') token: string,
    @Headers('x-link-grant') grant: string | undefined, @Query('cursor') cursor: unknown) {
    return this.service.list(memberId, token, grant, cursor);
  }
  @Get(':runId')
  detail(@CurrentMemberId() memberId: string, @Param('token') token: string,
    @Headers('x-link-grant') grant: string | undefined, @Param('runId') runId: string) {
    return this.service.detail(memberId, token, grant, runId);
  }
}
