// U6 로그 사건(비기능 설계 observability-design 「기록 항목」, NFR6.2·NFR6.3, 기능 설계 BR8.1).
// 사건마다 표의 칸만 가진 타입으로 만들어 토큰·코드·해시·state·자료 글·cursor·회원 ID가 들어갈 자리를 두지 않는다.
// U9 받은 링크 읽기가 링크 거부 사건 mcp_link_denied와 도구 이름 read_shared_publication을 더한다(U9 비기능 설계 observability-design 「기록 항목」, NFR6.1).
import { Logger } from '@nestjs/common';

/** Nest Logger와 같은 모양. 시험은 기록용 logger를 넘긴다. */
export interface McpLogger {
  log(message: unknown): void;
  warn(message: unknown): void;
  error(message: unknown): void;
}

export type McpToolName = 'list_my_catches' | 'list_my_text_materials' | 'read_shared_publication';

/** getClient는 /authorize와 /token이 함께 부르므로 client로 묶는다. token은 코드 challenge 읽기와 코드 교환이다. */
export type McpOAuthStep = 'register' | 'client' | 'token';

export type McpExchangeRefusal = 'code_missing' | 'code_expired' | 'code_used' | 'redirect_uri' | 'client' | 'resource';

export type McpLogEntry =
  | { event: 'mcp_rate_limit_off'; message: string }
  | { event: 'mcp_rate_limit_error'; error: string }
  | { event: 'mcp_rate_limited'; tool: McpToolName }
  | { event: 'mcp_tool_failed'; tool: McpToolName; error: string }
  | { event: 'mcp_link_denied'; tool: McpToolName; error: 'LINK_UNAVAILABLE' | 'LINK_PASSWORD_REQUIRED' }
  | { event: 'mcp_token_check_failed'; error: string }
  | { event: 'mcp_origin_rejected' }
  | { event: 'mcp_token_exchange_refused'; reason: McpExchangeRefusal }
  | { event: 'mcp_oauth_failed'; step: McpOAuthStep; error: string }
  | { event: 'mcp_transport_close_failed'; error: string };

export function createMcpLogger(): McpLogger {
  return new Logger('ClaudeMcp');
}

/**
 * 사건 하나를 객체 하나로 남긴다. 수준: 처리 실패는 error, 받은 링크 거부(mcp_link_denied)는 중지·만료 같은 정상 결과라 log,
 * 그 밖의 거부와 빈도 제한 상태는 warn.
 */
export function writeMcpLog(logger: McpLogger, entry: McpLogEntry): void {
  switch (entry.event) {
    case 'mcp_link_denied':
      logger.log(entry);
      return;
    case 'mcp_tool_failed':
    case 'mcp_token_check_failed':
    case 'mcp_oauth_failed':
    case 'mcp_transport_close_failed':
      logger.error(entry);
      return;
    default:
      logger.warn(entry);
  }
}
