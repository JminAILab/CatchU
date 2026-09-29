import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from './auth.decorators';
import { AccessTokenService } from './access-token.service';
import { DevLoginDto } from './dev-login.dto';
import { DevLoginGuard } from './dev-login.guard';

@Controller('auth/dev-login')
export class DevLoginController {
  constructor(private readonly tokens: AccessTokenService) {}

  @Public()
  @UseGuards(DevLoginGuard)
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(@Body() body: DevLoginDto) {
    // #104에서 회원 행과 연결한다. 지금은 DB 존재 여부를 보장하지 않는다.
    return this.tokens.issue(body.memberId);
  }
}
