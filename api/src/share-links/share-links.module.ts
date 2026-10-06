import { Module } from '@nestjs/common';
import { ShareLinksController } from './share-links.controller';
import { SHARE_LINKS_CLOCK, ShareLinksService } from './share-links.service';
import { readShareLinksConfig, SHARE_LINKS_CONFIG } from './share-links.config';

@Module({
  controllers: [ShareLinksController],
  providers: [
    ShareLinksService,
    { provide: SHARE_LINKS_CONFIG, useFactory: () => readShareLinksConfig() },
    { provide: SHARE_LINKS_CLOCK, useValue: () => new Date() },
  ],
})
export class ShareLinksModule {}
