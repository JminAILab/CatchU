import { Module } from '@nestjs/common';
import { LinkAccessService, UNLOCK_LIMITER } from './link-access.service';
import { LINK_GRANT_KEY, readLinkGrantKey } from './link-grant';
import { PublicLinksController } from './public-links.controller';
import { ShareLinksController } from './share-links.controller';
import { UnlockLimiter } from './unlock-limiter';
import { SHARE_LINKS_CLOCK, ShareLinksService } from './share-links.service';
import { readShareLinksConfig, SHARE_LINKS_CONFIG } from './share-links.config';

@Module({
  controllers: [ShareLinksController, PublicLinksController],
  providers: [
    ShareLinksService,
    { provide: SHARE_LINKS_CONFIG, useFactory: () => readShareLinksConfig() },
    { provide: SHARE_LINKS_CLOCK, useValue: () => new Date() },
    LinkAccessService,
    { provide: LINK_GRANT_KEY, useFactory: () => readLinkGrantKey() },
    { provide: UNLOCK_LIMITER, useFactory: () => new UnlockLimiter() },
  ],
  exports: [LinkAccessService],
})
export class ShareLinksModule {}
