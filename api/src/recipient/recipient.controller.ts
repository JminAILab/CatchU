import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { RecipientService } from './recipient.service';

/**
 * 비로그인 수신자 조회 경로(수신자 API `getPublicCollection`·`getPublicCatch`).
 * 회원 인증 예외 `@Public()`은 클래스가 아니라 메서드마다 붙인다([보안 점검](../../../docs/CatchU_security_checks.md)).
 * grant는 `X-Link-Grant` 헤더로만 받는다. 값을 로그·오류에 넣지 않는다.
 */
@Controller('public/links')
export class RecipientController {
  constructor(private readonly recipient: RecipientService) {}

  @Public()
  @Get(':token')
  collection(@Param('token') token: string, @Headers('x-link-grant') grant: string | undefined, @Query() query: unknown) {
    return this.recipient.collection(token, grant, query);
  }

  @Public()
  @Get(':token/catches/:catchId')
  catch(
    @Param('token') token: string, @Param('catchId') catchId: string,
    @Headers('x-link-grant') grant: string | undefined, @Query() query: unknown,
  ) {
    return this.recipient.catch(token, grant, catchId, query);
  }
}
