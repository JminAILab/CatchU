import { Controller, Get, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { MemberRepositoriesService } from './member-repositories.service';

@Controller('me/repositories')
export class MemberRepositoriesController {
  constructor(private readonly repositories: MemberRepositoriesService) {}

  @Get()
  list(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>) {
    return this.repositories.list(memberId, query);
  }
}
