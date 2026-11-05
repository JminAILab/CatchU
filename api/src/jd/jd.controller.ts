import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { JdService } from './jd.service';

@Controller('jds')
export class JdController {
  constructor(private readonly service: JdService) {}
  @Get() list(@CurrentMemberId() memberId: string, @Query('cursor') cursor: unknown) { return this.service.list(memberId, cursor); }
  @Post() create(@CurrentMemberId() memberId: string, @Body() body: unknown) { return this.service.create(memberId, body); }
  @Get(':jdId') detail(@CurrentMemberId() memberId: string, @Param('jdId') jdId: string) { return this.service.detail(memberId, jdId); }
  @Patch(':jdId') update(@CurrentMemberId() memberId: string, @Param('jdId') jdId: string, @Body() body: unknown) {
    return this.service.update(memberId, jdId, body);
  }
  @Delete(':jdId') @HttpCode(204)
  delete(@CurrentMemberId() memberId: string, @Param('jdId') jdId: string) { return this.service.delete(memberId, jdId); }
}
