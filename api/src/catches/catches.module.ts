import { Module } from '@nestjs/common';
import { PublicCatchStore } from './public-catch-store';
import { OwnerCatchStore } from './owner-catch-store';
import { OwnerCatchesController } from './owner-catches.controller';

/** DataSource는 공통 DB 모듈 또는 테스트 모듈이 공급한다. */
@Module({ controllers: [OwnerCatchesController], providers: [OwnerCatchStore, PublicCatchStore], exports: [OwnerCatchStore, PublicCatchStore] })
export class CatchesModule {}
