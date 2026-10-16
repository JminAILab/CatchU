import { Module } from '@nestjs/common';
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
