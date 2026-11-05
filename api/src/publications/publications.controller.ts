import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { PublicationManageService } from './publication-manage.service';
import { emptyPublicationQuery } from './publish-input';
import { PublishService } from './publish.service';

/**
 * 작성자 발행본 API(U4 W3·W5, 기능 명세 「작성자 API」). 인증은 전역 Guard, /v1·오류 형식·no-store는 공통 bootstrap을 쓴다.
 * 클래스·메서드에 `@Public()`을 붙이지 않는다(NFR1.1). 받은 사람 경로(/public/links/...)는 제출 3의 다른 컨트롤러다.
 * C-09 합의 전이라 `POST .../reindex`는 없다(OQ-U4-5).
 */
@Controller('publications')
export class PublicationsController {
  constructor(private readonly publisher: PublishService, private readonly publications: PublicationManageService) {}

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
