import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { MemberProfileService } from './member-profile.service';

function assertNoQuery(query: Record<string, unknown>): void {
  if (Object.keys(query).length > 0) {
    throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'query', reason: 'whitelistValidation' }] } });
  }
}

/** 공통 Guard·현재 회원 ID·오류 처리를 재사용하고 요청 입력을 소유자로 사용하지 않는다. */
@Controller('me')
export class MemberProfileController {
  constructor(private readonly profiles: MemberProfileService) {}

  @Get()
  read(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>) {
    assertNoQuery(query);
    return this.profiles.read(memberId);
  }

  @Put('profile')
  replace(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>, @Body() body: unknown) {
    assertNoQuery(query);
    // 원본 객체를 검사해 DTO 변환 시 누락될 수 있는 추가 필드도 거부한다.
    return this.profiles.replace(memberId, body);
  }
}
