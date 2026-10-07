import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { OwnerCatchStore } from './owner-catch-store';
import { emptyCatchQuery } from './owner-catch-input';

/** 인증은 전역 Guard, /v1·오류 형식·no-store는 공통 bootstrap을 사용한다. */
@Controller('catches')
export class OwnerCatchesController {
  constructor(private readonly catches: OwnerCatchStore) {}

  @Get()
  list(@CurrentMemberId() memberId: string, @Query() query: unknown) {
    return this.catches.list(memberId, query);
  }

  @Get(':catchId')
  get(@CurrentMemberId() memberId: string, @Param('catchId') catchId: string, @Query() query: unknown) {
    emptyCatchQuery(query);
    return this.catches.get(memberId, catchId);
  }

  @Put(':catchId/confirmation')
  confirm(@CurrentMemberId() memberId: string, @Param('catchId') catchId: string, @Body() body: unknown, @Query() query: unknown) {
    emptyCatchQuery(query);
    return this.catches.confirm(memberId, catchId, body);
  }

  @Put(':catchId/mismatch')
  mismatch(@CurrentMemberId() memberId: string, @Param('catchId') catchId: string, @Body() body: unknown, @Query() query: unknown) {
    emptyCatchQuery(query);
    return this.catches.setMismatch(memberId, catchId, body);
  }
}
