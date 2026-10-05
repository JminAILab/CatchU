import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { ShareLinkResponse } from './share-link-response';
import { ShareLinkPage, ShareLinksService } from './share-links.service';

interface RawRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
}

/** 중단 PUT은 경로만으로 대상을 정한다. 본문이나 쿼리가 붙으면 무엇을 바꾸려는 요청인지 모호하므로 400으로 거절한다. */
function assertNoBodyOrQuery(request: RawRequest): void {
  const length = Number(request.headers['content-length'] ?? 0);
  if (length > 0 || request.headers['transfer-encoding'] !== undefined) {
    throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'body', reason: 'isEmpty' }] } });
  }
  if (Object.keys(request.query).length > 0) {
    throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'query', reason: 'whitelistValidation' }] } });
  }
}

@Controller('share-links')
export class ShareLinksController {
  constructor(private readonly shareLinks: ShareLinksService) {}

  /** 내 링크 목록(회원 API listShareLinks). 쿼리는 `cursor`·`limit`만 받는다. */
  @Get()
  list(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>): Promise<ShareLinkPage> {
    return this.shareLinks.list(memberId, query);
  }

  /** 신규 발급 201, 같은 키·같은 본문 재요청 200(회원 API createShareLink). */
  @Post()
  async create(
    @CurrentMemberId() memberId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    // 본문은 계약의 추가 필드 거부·제목 trim 규칙을 validateShareCreate로 검사하므로 DTO 변환을 거치지 않는다.
    @Body() body: unknown,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<ShareLinkResponse> {
    const result = await this.shareLinks.create(memberId, idempotencyKey, body);
    response.status(result.replayed ? 200 : 201);
    return result.link;
  }

  /** 링크 중단(회원 API stopShareLink). 본인 링크는 첫 중단·반복 중단·만료 링크 모두 200, 타인·없는 링크는 404. */
  @Put(':linkId/stop')
  @HttpCode(200)
  stop(@CurrentMemberId() memberId: string, @Param('linkId') linkId: string, @Req() request: RawRequest): Promise<ShareLinkResponse> {
    assertNoBodyOrQuery(request);
    return this.shareLinks.stop(memberId, linkId);
  }
}
