import { DynamicModule, Module } from '@nestjs/common';
import { CatchesModule } from '../catches/catches.module';
import { ShareLinksModule } from '../share-links/share-links.module';
import { PUBLIC_PROFILE_SOURCE, PublicProfileSource } from './public-profile-source';
import { RecipientController } from './recipient.controller';
import { RecipientService } from './recipient.service';

/**
 * 수신자 조회 모듈(#151). 공개 프로필 공급자를 받아야만 조립된다.
 *
 * A의 실제 공급자가 정해지기 전이라 기본 앱(`AppModule`)에는 등록하지 않는다. 시험의 대역 공급자가 제품 경로에서
 * 쓰이지 않게 하기 위해서다. 실제 공급자가 생기면 `AppModule`에서 `RecipientModule.register({ profileSource })`로 연결한다.
 */
@Module({})
export class RecipientModule {
  static register(options: { profileSource: PublicProfileSource }): DynamicModule {
    if (!options?.profileSource || typeof options.profileSource.read !== 'function') {
      throw new Error('RecipientModule requires a public profile source');
    }
    return {
      module: RecipientModule,
      imports: [ShareLinksModule, CatchesModule],
      controllers: [RecipientController],
      providers: [RecipientService, { provide: PUBLIC_PROFILE_SOURCE, useValue: options.profileSource }],
    };
  }
}
