import { BadRequestException, Body, Controller, ForbiddenException, Header, HttpCode, Inject, Post } from '@nestjs/common';
import { AUTH_CONFIG, AuthConfig } from './auth.config';
import { Public } from './auth.decorators';
import { AccessTokenService, isMemberId } from './access-token.service';

@Controller('auth/dev-login')
export class DevLoginController {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly tokens: AccessTokenService,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(@Body() body: unknown) {
    if (!this.config.devLoginEnabled) throw new ForbiddenException();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !('memberId' in body) || !isMemberId(body.memberId)) {
      throw new BadRequestException();
    }
    // #104에서 회원 행과 연결한다. 지금은 DB 존재 여부를 보장하지 않는다.
    return this.tokens.issue(body.memberId);
  }
}
