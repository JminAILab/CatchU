// /v1/mcp(U6 기능 설계 BR4.8·BR5.6, 비기능 설계 security-design 「/v1/mcp 요청이 지나는 순서」, NFR1.1·NFR1.6). 세션 없는 Streamable HTTP다.
// 전역 Guard는 회원 Access 토큰을 보므로 이 세 메서드만 @Public()으로 빼고 토큰은 SDK requireBearerAuth와 저장 단계가 확인한다.
// 처리기 안에서 부르므로 NoStoreInterceptor가 먼저 돌아 SDK가 쓴 401·500에도 no-store가 붙는다(NFR1.10).
import { Controller, Delete, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { Request, RequestHandler, Response } from 'express';
import { errorName } from '../ai-run/ai-run-spec';
import { Public } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { MCP_CONFIG, McpConfig } from './mcp-config';
import { createMcpLogger, McpLogger, writeMcpLog } from './mcp-log';
import { McpOAuthProvider } from './mcp-oauth.provider';
import { McpTools } from './mcp-tools';

@Controller('mcp')
export class McpController {
  private readonly logger: McpLogger = createMcpLogger();
  private readonly bearer: RequestHandler;

  constructor(provider: McpOAuthProvider, private readonly tools: McpTools, @Inject(MCP_CONFIG) private readonly config: McpConfig) {
    // requiredScopes·expectedResource는 넘기지 않는다. 권한 범위가 없고 토큰은 이 MCP 주소 하나에만 쓰인다(security-design).
    this.bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(config.mcpUrl)) });
  }

  @Public()
  @Post()
  async post(@Req() request: Request, @Res() response: Response): Promise<void> {
    this.rejectForeignOrigin(request);
    let passed = false;
    await this.bearer(request, response, () => { passed = true; });
    if (!passed) return; // SDK가 401 또는 500을 이미 썼다.
    const { server, transport } = this.tools.forMember(request.auth?.extra?.memberId as string);
    response.on('close', () => {
      // 닫기 실패가 처리되지 않은 거부로 프로세스를 멈추지 않게 하고, 이름만 남긴다.
      Promise.all([transport.close(), server.close()]).catch((error: unknown) => {
        writeMcpLog(this.logger, { event: 'mcp_transport_close_failed', error: errorName(error) });
      });
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  }

  @Public()
  @Get()
  get(@Req() request: Request, @Res() response: Response): void {
    this.methodNotAllowed(request, response);
  }

  @Public()
  @Delete()
  delete(@Req() request: Request, @Res() response: Response): void {
    this.methodNotAllowed(request, response);
  }

  /** 세션이 없어 GET 스트림과 세션 종료 DELETE를 두지 않는다(BR5.6). */
  private methodNotAllowed(request: Request, response: Response): void {
    this.rejectForeignOrigin(request);
    response.set('Allow', 'POST').status(405).end();
  }

  /**
   * 토큰 확인보다 먼저 본다(NFR1.6). 비교 값은 설정의 공개 주소이고 요청의 Host로 만들지 않는다.
   * 기존 필터는 이 코드를 남기지 않으므로 로그는 여기서 남긴다. Origin 값은 로그에 넣지 않는다.
   */
  private rejectForeignOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (origin === undefined || origin === this.config.publicOrigin) return;
    writeMcpLog(this.logger, { event: 'mcp_origin_rejected' });
    throw new ApiError('AUTH_ORIGIN_FORBIDDEN');
  }
}
