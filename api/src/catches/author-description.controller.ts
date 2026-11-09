import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { AuthorDescriptionStore } from './author-description-store';
import { emptyCatchQuery } from './owner-catch-input';

/**
 * Catch 작성자 설명 API(U4 W1, 계약 C-14). 인증은 전역 Guard, /v1·오류 형식·no-store는 공통 bootstrap을 쓴다.
 * 클래스·메서드에 `@Public()`을 붙이지 않는다(NFR1.1).
 */
@Controller('catches')
export class AuthorDescriptionController {
  constructor(private readonly descriptions: AuthorDescriptionStore) {}

  /** 편집 화면이 현재 설명을 불러오는 읽기. 응답 모양은 저장 응답과 같다. */
  @Get(':catchId/description')
  read(@CurrentMemberId() memberId: string, @Param('catchId') catchId: string, @Query() query: unknown) {
    emptyCatchQuery(query);
    return this.descriptions.read(memberId, catchId);
  }

  @Put(':catchId/description')
  save(@CurrentMemberId() memberId: string, @Param('catchId') catchId: string, @Body() body: unknown, @Query() query: unknown) {
    emptyCatchQuery(query);
    return this.descriptions.save(memberId, catchId, body);
  }
}
