import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from './auth.decorators';
import { AccessTokenService } from './access-token.service';
import { DevLoginDto } from './dev-login.dto';
import { DevLoginGuard } from './dev-login.guard';
import { DevMemberService } from '../member-analysis/dev-member.service';

@Controller('auth/dev-login')
export class DevLoginController {
  constructor(private readonly tokens: AccessTokenService, private readonly members: DevMemberService) {}

  @Public()
  @UseGuards(DevLoginGuard)
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(@Body() body: DevLoginDto) {
    const memberId = await this.members.resolveMember(body.memberId);
    return this.tokens.issue(memberId);
  }
}
