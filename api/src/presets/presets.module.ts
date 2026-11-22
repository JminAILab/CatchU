// 발행 프리셋 모듈 PresetLibrary(발행 프리셋 intent U1, 구성 요소 components.md PresetLibrary, NFR 설계 logical-components).
// 프리셋 저장·목록·상세·세기 경로(/v1/presets)와, 발행 모듈이 쓰는 프리셋 펴기(PresetStore.expand)를 둔다.
// 글자 수와 발행할 수 없는 이유는 발행과 같은 규칙(src/publishable-source/)으로 읽을 때 센다(ADR-005). 저장하지 않는다.
// TypeORM 엔티티(preset·preset_item)는 앱의 DataSource가 `*.entity.ts`를 찾는다. 실패해도 발행본 열람·질의응답은 그대로다(고장 범위).
import { Module } from '@nestjs/common';
import { PresetStore } from './preset-store';
import { PresetsController } from './presets.controller';
import { PresetsLog } from './presets-log';

@Module({
  controllers: [PresetsController],
  providers: [PresetStore, PresetsLog],
  exports: [PresetStore],
})
export class PresetsModule {}
