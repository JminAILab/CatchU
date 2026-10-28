import { Module } from '@nestjs/common';
import { CredentialVault } from './credential-vault';
import { GitHubClient } from './github.client';
import { GITHUB_CONFIG, readGitHubConfig } from './github.config';
import { GitHubConnectionController } from './github-connection.controller';
import { GitHubConnectionService } from './github-connection.service';

@Module({
  controllers: [GitHubConnectionController],
  providers: [{ provide: GITHUB_CONFIG, useFactory: () => readGitHubConfig() }, CredentialVault, GitHubClient, GitHubConnectionService],
  // CredentialVault: 12월 intent U2 탈퇴 3단계가 자격정보 파일을 지울 때 쓴다(C-06 withdrawal-order 3).
  exports: [GitHubConnectionService, CredentialVault],
})
export class GitHubConnectionModule {}
