import { Body, Controller, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { ApiError } from '../common/errors';
import { Public } from './auth.decorators';
import { SESSION_CONFIG, SessionConfig } from './session.config';
import { assertSessionOrigin, clearRefreshCookie, CookieResponse, readRefreshCookie, SessionRequest, writeRefreshCookie } from './session-http';
import { SessionService } from './session.service';
import { assertEmptyInput } from '../google-login/google-input';

@Controller('auth')
export class SessionController {
  constructor(private readonly sessions: SessionService, @Inject(SESSION_CONFIG) private readonly config: SessionConfig) {}

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: SessionRequest, @Res({ passthrough: true }) response: CookieResponse,
    @Body() body: unknown, @Query() query: Record<string, unknown>) {
    assertSessionOrigin(request, this.config);
    assertEmptyInput(body, query);
    try {
      const result = await this.sessions.refresh(readRefreshCookie(request));
      writeRefreshCookie(response, this.config, result.refreshToken, result.cookieExpiresAt);
      return result.access;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'AUTH_INVALID') clearRefreshCookie(response, this.config);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: SessionRequest, @Res({ passthrough: true }) response: CookieResponse,
    @Body() body: unknown, @Query() query: Record<string, unknown>) {
    assertSessionOrigin(request, this.config);
    assertEmptyInput(body, query);
    await this.sessions.logout(readRefreshCookie(request));
    clearRefreshCookie(response, this.config);
  }
}
