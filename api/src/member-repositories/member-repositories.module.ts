import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GitHubConnectionModule } from '../github-connection/github-connection.module';
import { MemberRepositoriesController } from './member-repositories.controller';
import { MemberRepositoriesService } from './member-repositories.service';
import { RepositorySelectionService } from './repository-selection.source';
import { SelectedRepositoryCatalog } from './selected-repository-catalog';

@Module({
  imports: [AuthModule, GitHubConnectionModule],
  controllers: [MemberRepositoriesController],
  // 목록과 #323 접수가 같은 선정 공급·좌표 카탈로그를 쓴다. #323은 이 모듈을 가져와 접수 재확인에 쓴다.
  providers: [MemberRepositoriesService, RepositorySelectionService,
    { provide: SelectedRepositoryCatalog, useFactory: () => new SelectedRepositoryCatalog() }],
  exports: [RepositorySelectionService],
})
export class MemberRepositoriesModule {}
