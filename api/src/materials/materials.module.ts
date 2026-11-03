import { Module } from '@nestjs/common';
import { TextMaterialStore } from './text-material-store';
import { TextMaterialsController } from './text-materials.controller';

/**
 * 텍스트 자료(U4 W2, 계약 C-13). DataSource는 공통 DB 모듈 또는 시험 모듈이 공급한다.
 * `publications`를 import하지 않는다(U4 비기능 설계 「의존 방향」). U6은 이 모듈이 아니라 표를 member_id로 걸러 읽는다.
 */
@Module({ controllers: [TextMaterialsController], providers: [TextMaterialStore] })
export class MaterialsModule {}
