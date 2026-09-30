import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { LinkAccessService } from './link-access.service';

interface ClientRequest {
  socket: { remoteAddress?: string };
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
    // 신뢰 프록시 설정 전이라 직접 연결 주소로 센다(#150 9/29 결정). 부하분산기를 두면 배포에서 신뢰 설정을 함께 해야 한다.
    return this.access.unlock(token, body, request.socket.remoteAddress ?? 'unknown');
  }
}
