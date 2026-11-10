import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { readAnalysisQueueConfig } from '../analysis-queue/analysis-queue.config';
import { AuthModule } from '../auth/auth.module';
import { PublicationsModule } from '../publications/publications.module';
import { MCP_CONFIG, McpConfig, readMcpConfig } from './mcp-config';
import { McpConnectionController } from './mcp-connection.controller';
import { McpConnectionService } from './mcp-connection.service';
import { McpController } from './mcp.controller';
import { McpMaterialReader } from './mcp-material-reader';
import { McpOAuthProvider } from './mcp-oauth.provider';
import { McpRateLimiter } from './mcp-rate-limiter';
import { McpSharedPublicationReader } from './mcp-shared-publication-reader';
import { McpTools } from './mcp-tools';

/**
 * Claude 본인 연결(12월 intent U6, 계약 C-15, ADR-009, docs/claude-mcp.md). OAuth 규칙은 공식 SDK 인증 도구가 맡는다.
 * SDK 라우터는 앱 루트에 건다(BR1.1). Nest 경로가 아니라 전역 Guard를 거치지 않고, Nest 경로와 끝처리보다 앞에 놓인다.
 * U9 받은 링크 읽개는 U4 PublicationsModule이 내보낸 PUBLICATION_ACCESS(C-10)를 받는다(U9 비기능 설계 logical-components 「U6 파일의 모양 변경」).
 */
@Module({
  imports: [AuthModule, PublicationsModule],
  controllers: [McpController, McpConnectionController],
  providers: [
    { provide: MCP_CONFIG, useFactory: () => readMcpConfig() },
    { provide: McpRateLimiter, useFactory: () => new McpRateLimiter(readAnalysisQueueConfig()) },
    McpOAuthProvider,
    McpMaterialReader,
    McpSharedPublicationReader,
    McpTools,
    McpConnectionService,
  ],
})
export class ClaudeMcpModule implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly provider: McpOAuthProvider,
    @Inject(MCP_CONFIG) private readonly config: McpConfig,
  ) {}

  onModuleInit(): void {
    this.adapterHost.httpAdapter.getInstance<{ use(handler: unknown): void }>().use(mcpAuthRouter({
      provider: this.provider,
      issuerUrl: new URL(this.config.publicOrigin),
      resourceServerUrl: new URL(this.config.mcpUrl),
    }));
  }
}
