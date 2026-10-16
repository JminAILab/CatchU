import { Body, Controller, Header, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { Public } from './auth.decorators';
import { SessionService } from './session.service';
import { SESSION_CONFIG, SessionConfig } from './session.config';
import { CookieResponse, writeRefreshCookie } from './session-http';
import { DataSource } from 'typeorm';
import { DevLoginDto } from './dev-login.dto';
import { DevLoginGuard } from './dev-login.guard';
import { DevMemberService } from '../member-analysis/dev-member.service';

@Controller('auth/dev-login')
export class DevLoginController {
  constructor(private readonly sessions: SessionService, private readonly members: DevMemberService,
    private readonly dataSource: DataSource, @Inject(SESSION_CONFIG) private readonly config: SessionConfig) {}

  @Public()
  @UseGuards(DevLoginGuard)
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(@Body() body: DevLoginDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.dataSource.transaction(async manager => {
      const memberId = await this.members.resolveMember(body.memberId, manager);
      return this.sessions.create(manager, memberId);
    });
    writeRefreshCookie(response, this.config, result.refreshToken, result.cookieExpiresAt);
    return result.access;
  }
}
