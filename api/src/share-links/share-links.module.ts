import { Module } from '@nestjs/common';
import { OwnerProfileReaderModule } from '../member-profile/owner-profile-reader.module';
import { PRODUCT_ISSUE_RATE_LIMIT, SHARE_LINK_ISSUE_LIMITER } from './issue-rate-limit';
import { LinkAccessService } from './link-access.service';
import { LINK_GRANT_KEY, readLinkGrantKey } from './link-grant';
import { PublicLinksController } from './public-links.controller';
import { RequestRateLimiter } from './request-rate-limiter';
import { ShareLinksController } from './share-links.controller';
import { createUnlockControls, PRODUCT_UNLOCK_POLICY, UNLOCK_CONTROLS, UNLOCK_POLICY, UnlockPolicy } from './unlock-policy';
import { SHARE_LINKS_CLOCK, ShareLinksService } from './share-links.service';
import { readShareLinksConfig, SHARE_LINKS_CONFIG } from './share-links.config';

@Module({
  // 수신자 접근 판정(LinkAccessService)이 링크와 같은 시점으로 소유 회원 상태를 읽는다(#151, A 공급 함수).
  imports: [OwnerProfileReaderModule],
  controllers: [ShareLinksController, PublicLinksController],
  providers: [
    ShareLinksService,
    { provide: SHARE_LINKS_CONFIG, useFactory: () => readShareLinksConfig() },
    { provide: SHARE_LINKS_CLOCK, useValue: () => new Date() },
    { provide: SHARE_LINK_ISSUE_LIMITER, useFactory: () => new RequestRateLimiter(PRODUCT_ISSUE_RATE_LIMIT) },
    LinkAccessService,
    { provide: LINK_GRANT_KEY, useFactory: () => readLinkGrantKey() },
    { provide: UNLOCK_POLICY, useValue: PRODUCT_UNLOCK_POLICY },
    { provide: UNLOCK_CONTROLS, inject: [UNLOCK_POLICY], useFactory: (policy: UnlockPolicy) => createUnlockControls(policy) },
  ],
  exports: [LinkAccessService],
})
export class ShareLinksModule {}
