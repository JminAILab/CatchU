import { Module } from '@nestjs/common';
import { LinkAccessService } from './link-access.service';
import { LINK_GRANT_KEY, readLinkGrantKey } from './link-grant';
import { PublicLinksController } from './public-links.controller';
import { ShareLinksController } from './share-links.controller';
import {
  createUnlockControls, PRODUCT_UNLOCK_POLICY, UNLOCK_CONTROLS, UNLOCK_POLICY, unlimitedLinkAllowedForTests, UnlockPolicy,
} from './unlock-policy';
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
    { provide: UNLOCK_POLICY, useValue: PRODUCT_UNLOCK_POLICY },
    {
      provide: UNLOCK_CONTROLS,
      inject: [UNLOCK_POLICY],
      // 링크 전체 실패 상한이 null이면 기동을 거부한다. 시험 실행기가 명시적으로 허용한 경우만 예외다.
      useFactory: (policy: UnlockPolicy) => createUnlockControls(policy, { allowUnlimitedLink: unlimitedLinkAllowedForTests() }),
    },
  ],
  exports: [LinkAccessService],
})
export class ShareLinksModule {}
