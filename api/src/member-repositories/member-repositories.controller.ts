import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { MemberRepositoriesService } from './member-repositories.service';
import { RepositoryRegistrationService } from './repository-registration.service';

@Controller('me/repositories')
export class MemberRepositoriesController {
  constructor(private readonly repositories: MemberRepositoriesService, private readonly registrations: RepositoryRegistrationService) {}

  @Post()
  register(@CurrentMemberId() memberId: string, @Body() body: unknown, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new ApiError('VALIDATION_FAILED');
    return this.registrations.register(memberId, body);
  }

  @Get()
  list(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>) {
    return this.repositories.list(memberId, query);
  }
}
