import { Body, Controller, HttpCode, Inject, Post, Query, Res } from '@nestjs/common';
import { SESSION_CONFIG, SessionConfig } from '../auth/session.config';
import { CookieResponse, writeRefreshCookie } from '../auth/session-http';
import { Public } from '../auth/auth.decorators';
import { GoogleLoginService } from './google-login.service';
import { assertEmptyInput, parseGoogleLogin } from './google-input';

@Controller('auth/google')
export class GoogleLoginController {
  constructor(private readonly google: GoogleLoginService, @Inject(SESSION_CONFIG) private readonly config: SessionConfig) {}

  @Public()
  @Post('authorization')
  @HttpCode(200)
  start(@Body() body: unknown, @Query() query: Record<string, unknown>) {
    assertEmptyInput(body, query);
    return this.google.start();
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.google.login(parseGoogleLogin(body, query));
    if ('cancelled' in result) return result;
    writeRefreshCookie(response, this.config, result.refreshToken, result.cookieExpiresAt);
    return { ...result.access, suggestedDisplayName: result.suggestedDisplayName };
  }
}
