import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { emptyQuery } from './text-material-input';
import { TextMaterialStore } from './text-material-store';

/**
 * 텍스트 자료 API(U4 W2, 계약 C-13). 인증은 전역 Guard, /v1·오류 형식·no-store는 공통 bootstrap을 쓴다.
 * 클래스·메서드에 `@Public()`을 붙이지 않는다(NFR1.1).
 */
@Controller('text-materials')
export class TextMaterialsController {
  constructor(private readonly materials: TextMaterialStore) {}

  @Get()
  list(@CurrentMemberId() memberId: string, @Query() query: unknown) {
    return this.materials.list(memberId, query);
  }

  @Post()
  create(@CurrentMemberId() memberId: string, @Body() body: unknown, @Query() query: unknown) {
    emptyQuery(query);
    return this.materials.create(memberId, body);
  }

  @Get(':textMaterialId')
  get(@CurrentMemberId() memberId: string, @Param('textMaterialId') id: string, @Query() query: unknown) {
    emptyQuery(query);
    return this.materials.get(memberId, id);
  }

  @Put(':textMaterialId')
  update(@CurrentMemberId() memberId: string, @Param('textMaterialId') id: string, @Body() body: unknown, @Query() query: unknown) {
    emptyQuery(query);
    return this.materials.update(memberId, id, body);
  }

  @Delete(':textMaterialId')
  @HttpCode(204)
  async remove(@CurrentMemberId() memberId: string, @Param('textMaterialId') id: string, @Query() query: unknown): Promise<void> {
    emptyQuery(query);
    await this.materials.remove(memberId, id);
  }
}
