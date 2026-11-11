import type { ServerResponse } from 'node:http';
import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { clientAddressKey } from '../share-links/client-address';
import { emptyPublicationQuery } from './publish-input';
import { PublishedPdfViewService } from './published-pdf-view.service';
import { PublishedSnapshot } from './published-snapshot';
import { RecipientAccessService } from './recipient-access.service';

interface ClientRequest {
  /** Express가 `TRUST_PROXY_CIDRS`(app.setup.ts)를 따라 정한 요청 주소. `X-Forwarded-For`를 직접 읽지 않는다. */
  ip?: string;
}

/**
 * 비로그인 받은 사람 경로(U4 제출 3 W4, 계약 C-12). 10월 `RecipientController`·`PublicLinksController`를 이 컨트롤러 하나로 대체한다(BR9.1).
 * 회원 인증 예외 `@Public()`은 클래스가 아니라 메서드마다 붙인다(NFR1.1, docs/CatchU_security_checks.md). 같은 컨트롤러에 더해지는
 * 미지정 메서드는 예외를 상속하지 않는다. grant는 `X-Link-Grant` 머리글로만 받고 토큰·grant·비밀번호 값을 로그·오류에 넣지 않는다(NFR1.9).
 * /v1·오류 형식·no-store는 공통 bootstrap을 쓴다.
 */
@Controller('public/links')
export class RecipientLinksController {
  constructor(private readonly recipient: RecipientAccessService, private readonly pdfs: PublishedPdfViewService) {}

  /** 발행본 열람. 200 PublishedSnapshot, 401 LINK_PASSWORD_REQUIRED, 404 LINK_UNAVAILABLE. 정의 밖 쿼리는 400. */
  @Public()
  @Get(':token')
  read(
    @Param('token') token: string, @Headers('x-link-grant') grant: string | undefined, @Query() query: unknown,
  ): Promise<PublishedSnapshot> {
    emptyPublicationQuery(query);
    return this.recipient.read(token, grant);
  }

  /** 비밀번호 확인. 성공 200 `{ grant }`. 시도 제한은 정규화한 주소 단위로 센다. */
  @Public()
  @Post(':token/unlock')
  @HttpCode(200)
  unlock(@Param('token') token: string, @Body() body: unknown, @Req() request: ClientRequest): Promise<{ grant: string }> {
    // 신뢰 프록시를 설정하지 않으면 request.ip는 직접 연결 주소다.
    return this.recipient.unlock(token, body, clientAddressKey(request.ip));
  }

  /**
   * 발행 PDF 사본 열람(U8 W4, C-12 더하는 변경, BR6.1·BR6.2·BR6.5·BR6.7). 200 application/pdf 스트림, 401 LINK_PASSWORD_REQUIRED,
   * 404 LINK_UNAVAILABLE(링크 불가와 항목 불가를 구분하지 않음), 파일 없음·저장소 실패 500. 정의 밖 쿼리는 400. 시도 제한은 없다.
   */
  @Public()
  @Get(':token/items/:publishedItemId/pdf')
  async pdf(
    @Param('token') token: string, @Param('publishedItemId') publishedItemId: string,
    @Headers('x-link-grant') grant: string | undefined, @Query() query: unknown, @Res() response: ServerResponse,
  ): Promise<void> {
    emptyPublicationQuery(query);
    await this.pdfs.send(response, await this.pdfs.findForRecipient(token, grant, publishedItemId));
  }
}
