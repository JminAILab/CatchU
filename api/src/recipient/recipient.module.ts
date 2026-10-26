import { Module } from '@nestjs/common';
import { CatchesModule } from '../catches/catches.module';
import { OwnerProfileReaderModule } from '../member-profile/owner-profile-reader.module';
import { ShareLinksModule } from '../share-links/share-links.module';
import { RecipientController } from './recipient.controller';
import { RecipientService } from './recipient.service';

/**
 * 수신자 조회 모듈(#151). 기본 앱(`AppModule`)에 등록한다.
 * 링크·소유 회원 판정은 ShareLinksModule(#150), 공개 Catch는 CatchesModule(B), 소유 회원 상태·공개 프로필은
 * OwnerProfileReaderModule(A)의 실제 구현을 쓴다. 시험 대역을 주입받는 조립 경로는 두지 않는다.
 */
@Module({
  imports: [ShareLinksModule, CatchesModule, OwnerProfileReaderModule],
  controllers: [RecipientController],
  providers: [RecipientService],
})
export class RecipientModule {}
