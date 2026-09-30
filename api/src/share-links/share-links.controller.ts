import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { ShareLinkResponse } from './share-link-response';
import { ShareLinksService } from './share-links.service';

@Controller('share-links')
export class ShareLinksController {
  constructor(private readonly shareLinks: ShareLinksService) {}

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
}
