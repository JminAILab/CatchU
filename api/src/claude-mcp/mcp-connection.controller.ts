// /v1/me/mcp-connection(U6 기능 설계 BR3.2·BR7.1·BR7.2, 비기능 NFR1.1·NFR1.7). 전역 Guard가 확인한 회원만 쓴다.
// 기록을 바꾸는 둘은 U2 POST /v1/ai-consent와 같은 허용 출처 검사를 첫 줄에서 한다. 트랜잭션보다 앞이라 거부되면 행이 그대로다.
import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { SESSION_CONFIG, SessionConfig } from '../auth/session.config';
import { assertSessionOrigin, SessionRequest } from '../auth/session-http';
import { assertEmptyInput } from '../google-login/google-input';
import { McpAuthorizationDto } from './mcp-authorization.dto';
import { McpConnectionService, McpConnectionStatus } from './mcp-connection.service';

@Controller('me/mcp-connection')
export class McpConnectionController {
  constructor(private readonly connections: McpConnectionService, @Inject(SESSION_CONFIG) private readonly session: SessionConfig) {}

  @Get()
  read(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>): Promise<McpConnectionStatus> {
    assertEmptyInput(undefined, query);
    return this.connections.status(memberId);
  }

  /** 응답은 302가 아니라 JSON이다. web이 fetch 뒤 이 값으로만 이동한다(BR3.2). */
  @Post('authorizations')
  @HttpCode(200)
  authorize(@CurrentMemberId() memberId: string, @Req() request: SessionRequest,
    @Body() body: McpAuthorizationDto, @Query() query: Record<string, unknown>): Promise<{ redirectTo: string }> {
    assertSessionOrigin(request, this.session);
    assertEmptyInput(undefined, query);
    return this.connections.authorize(memberId, body);
  }

  /** 전체 해제. 반복해도 204다(BR7.2). */
  @Delete()
  @HttpCode(204)
  async disconnect(@CurrentMemberId() memberId: string, @Req() request: SessionRequest,
    @Body() body: unknown, @Query() query: Record<string, unknown>): Promise<void> {
    assertSessionOrigin(request, this.session);
    assertEmptyInput(body, query);
    await this.connections.disconnectAll(memberId);
  }
}
