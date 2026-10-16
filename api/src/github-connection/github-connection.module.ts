import { Module } from '@nestjs/common';
import { CredentialVault } from './credential-vault';
import { GitHubClient } from './github.client';
import { GITHUB_CONFIG, readGitHubConfig } from './github.config';
import { GitHubConnectionController } from './github-connection.controller';
import { GitHubConnectionService } from './github-connection.service';

@Module({
  controllers: [GitHubConnectionController],
  providers: [{ provide: GITHUB_CONFIG, useFactory: () => readGitHubConfig() }, CredentialVault, GitHubClient, GitHubConnectionService],
  exports: [GitHubConnectionService],
})
export class GitHubConnectionModule {}
