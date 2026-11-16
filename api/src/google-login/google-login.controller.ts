import { Body, Controller, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { SESSION_CONFIG, SessionConfig } from '../auth/session.config';
import { assertSessionOrigin, CookieResponse, SessionRequest, writeRefreshCookie } from '../auth/session-http';
import { Public } from '../auth/auth.decorators';
import { GoogleLoginService } from './google-login.service';
import { assertEmptyInput, parseGoogleLogin } from './google-input';

/**
 * 시작·완료 모두 web 화면에서 보낸 요청만 받는다(갱신·로그아웃과 같은 Origin 검사, 입력 해석·시도 소비보다 먼저).
 * api는 폼 본문도 해석하므로, 이 검사가 없으면 다른 사이트가 자기 state·확인값·code를 폼으로 보내
 * 방문자 브라우저에 그 계정의 Refresh 쿠키를 심을 수 있다. 시작자 확인값은 이 경우를 막지 못한다(세 값 모두 보낸 쪽 것이다).
 */
@Controller('auth/google')
export class GoogleLoginController {
  constructor(private readonly google: GoogleLoginService, @Inject(SESSION_CONFIG) private readonly config: SessionConfig) {}

  @Public()
  @Post('authorization')
  @HttpCode(200)
  start(@Req() request: SessionRequest, @Body() body: unknown, @Query() query: Record<string, unknown>) {
    assertSessionOrigin(request, this.config);
    assertEmptyInput(body, query);
    return this.google.start();
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Req() request: SessionRequest, @Body() body: unknown, @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: CookieResponse) {
    assertSessionOrigin(request, this.config);
    const result = await this.google.login(parseGoogleLogin(body, query));
    if ('cancelled' in result) return result;
    writeRefreshCookie(response, this.config, result.refreshToken, result.cookieExpiresAt);
    return { ...result.access, suggestedDisplayName: result.suggestedDisplayName };
  }
}
