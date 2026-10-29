// DELETE /v1/me(U2 기능 설계 W7·BR7.1·BR7.5, 비기능 NFR1.1). 공통 Guard가 확인한 회원 본인만 탈퇴한다.
// 본문·쿼리는 받지 않고, Refresh 쿠키를 다루므로 세션 경로와 같은 허용 출처 검사를 한다.
import { Body, Controller, Delete, HttpCode, Inject, Query, Req, Res } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { SESSION_CONFIG, SessionConfig } from '../auth/session.config';
import { assertSessionOrigin, clearRefreshCookie, CookieResponse, SessionRequest } from '../auth/session-http';
import { assertEmptyInput } from '../google-login/google-input';
import { WithdrawalService } from './withdrawal.service';

@Controller('me')
export class WithdrawalController {
  constructor(private readonly withdrawal: WithdrawalService, @Inject(SESSION_CONFIG) private readonly session: SessionConfig) {}

  /** 4단계까지 커밋된 뒤에만 204와 Refresh 쿠키 제거를 보낸다(BR7.5). */
  @Delete()
  @HttpCode(204)
  async withdraw(@CurrentMemberId() memberId: string, @Req() request: SessionRequest, @Res({ passthrough: true }) response: CookieResponse,
    @Body() body: unknown, @Query() query: Record<string, unknown>): Promise<void> {
    assertSessionOrigin(request, this.session);
    assertEmptyInput(body, query);
    await this.withdrawal.withdraw(memberId);
    clearRefreshCookie(response, this.session);
  }
}
