import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MemberRepositoriesController } from './member-repositories.controller';
import { MemberRepositoriesService } from './member-repositories.service';

@Module({
  imports: [AuthModule],
  controllers: [MemberRepositoriesController],
  providers: [MemberRepositoriesService],
})
export class MemberRepositoriesModule {}
