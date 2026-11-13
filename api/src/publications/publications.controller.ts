import type { ServerResponse } from 'node:http';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { PublicationManageService } from './publication-manage.service';
import { emptyPublicationQuery } from './publish-input';
import { PublishService } from './publish.service';
import { PublishedPdfViewService } from './published-pdf-view.service';

/**
 * 작성자 발행본 API(U4 W3·W5, 기능 명세 「작성자 API」). 인증은 전역 Guard, /v1·오류 형식·no-store는 공통 bootstrap을 쓴다.
 * 클래스·메서드에 `@Public()`을 붙이지 않는다(NFR1.1). 받은 사람 경로(/public/links/...)는 제출 3의 다른 컨트롤러다.
 * C-09 합의 전이라 `POST .../reindex`는 없다(OQ-U4-5).
 */
@Controller('publications')
export class PublicationsController {
  constructor(
    private readonly publisher: PublishService,
    private readonly publications: PublicationManageService,
    private readonly pdfs: PublishedPdfViewService,
  ) {}

  @Post()
  publish(@CurrentMemberId() memberId: string, @Body() body: unknown, @Query() query: unknown) {
    emptyPublicationQuery(query);
    return this.publisher.publish(memberId, body);
  }

  @Get()
  list(@CurrentMemberId() memberId: string, @Query() query: unknown) {
    return this.publications.list(memberId, query);
  }

  @Get(':publicationId')
  get(@CurrentMemberId() memberId: string, @Param('publicationId') id: string, @Query() query: unknown) {
    emptyPublicationQuery(query);
    return this.publications.get(memberId, id);
  }

  /**
   * 작성자 PDF 사본 열람(U8 W4, BR6.6). 본인 발행본의 PDF 항목만 열고 중지·만료 뒤에도 연다. 200 application/pdf 스트림,
   * 남의 발행본·없는 발행본·그 발행본에 없는 항목·PDF가 아닌 항목은 같은 404, 파일 없음·저장소 실패 500.
   */
  @Get(':publicationId/items/:publishedItemId/pdf')
  async pdf(
    @CurrentMemberId() memberId: string, @Param('publicationId') id: string, @Param('publishedItemId') publishedItemId: string,
    @Query() query: unknown, @Res() response: ServerResponse,
  ): Promise<void> {
    emptyPublicationQuery(query);
    await this.pdfs.send(response, await this.pdfs.findForOwner(memberId, id, publishedItemId));
  }

  @Put(':publicationId/stop')
  stop(@CurrentMemberId() memberId: string, @Param('publicationId') id: string, @Query() query: unknown) {
    emptyPublicationQuery(query);
    return this.publications.stop(memberId, id);
  }

  @Delete(':publicationId')
  @HttpCode(204)
  async remove(@CurrentMemberId() memberId: string, @Param('publicationId') id: string, @Query() query: unknown): Promise<void> {
    emptyPublicationQuery(query);
    await this.publications.remove(memberId, id);
  }
}
