import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { clientAddressKey } from './client-address';
import { LinkAccessService } from './link-access.service';

interface ClientRequest {
  /** Express가 `TRUST_PROXY_CIDRS`(app.setup.ts)를 따라 정한 요청 주소. `X-Forwarded-For`를 직접 읽지 않는다. */
  ip?: string;
}

/** 비로그인 수신자 경로(수신자 API). 회원 인증 Guard를 거치지 않는다. */
@Public()
@Controller('public/links')
export class PublicLinksController {
  constructor(private readonly access: LinkAccessService) {}

  /** 비밀번호 확인(unlockLink). 성공 200 `{ grant }`. */
  @Post(':token/unlock')
  @HttpCode(200)
  unlock(@Param('token') token: string, @Body() body: unknown, @Req() request: ClientRequest): Promise<{ grant: string }> {
    // 신뢰 프록시를 설정하지 않으면 request.ip는 직접 연결 주소다. 시도 제한은 정규화한 주소 단위로 센다.
    return this.access.unlock(token, body, clientAddressKey(request.ip));
  }
}
