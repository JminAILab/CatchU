// 회원당 도구 호출 빈도(U6 기능 설계 BR6.1~BR6.4, 비기능 설계 reliability-design 「빈도 집계의 실패」, scalability-design NFR4.8).
// 큐와 같은 Redis 주소에 전용 연결을 하나 연다. 주소가 없거나 셀 수 없으면 통과시키고 로그만 남긴다. 횟수를 DB·로그에 쌓지 않는다.
import { OnApplicationShutdown } from '@nestjs/common';
import IORedis from 'ioredis';
import type { AnalysisQueueConfig } from '../analysis-queue/analysis-queue.config';
import { errorName } from '../ai-run/ai-run-spec';
import { MCP_RATE_COMMAND_TIMEOUT_MS, MCP_RATE_KEY_TTL_SECONDS, MCP_RATE_LIMIT_PER_WINDOW, MCP_RATE_WINDOW_MS } from './mcp-limits';
import { createMcpLogger, McpLogger, writeMcpLog } from './mcp-log';

/** 두 명령 사이에서 멈춰 만료 없는 키가 남지 않게 한 번에 보낸다. */
const COUNT_SCRIPT = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count`;

export class McpRateLimiter implements OnApplicationShutdown {
  private readonly redis: IORedis | null = null;

  constructor(private readonly config: AnalysisQueueConfig | null, private readonly logger: McpLogger = createMcpLogger()) {
    if (config === null) {
      writeMcpLog(logger, { event: 'mcp_rate_limit_off', message: 'MCP 빈도 제한 꺼짐' });
      return;
    }
    // 끊긴 동안에는 명령을 쌓지 않고 바로 실패시키고, 멈춘 Redis에는 1초 뒤 실패한다(BR6.3).
    this.redis = this.watch(new IORedis(config.redisUrl, {
      enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: MCP_RATE_COMMAND_TIMEOUT_MS,
    }));
  }

  /** 이번 호출을 세고 통과 여부를 돌려준다. 61번째부터 false다. 예외를 던지지 않는다. now는 다음 창 시험에서만 넘긴다. */
  async allow(memberId: string, now: number = Date.now()): Promise<boolean> {
    if (this.redis === null || this.config === null) return true;
    const key = `${this.config.prefix}:mcp-rate:${memberId}:${Math.floor(now / MCP_RATE_WINDOW_MS)}`;
    try {
      const count = await this.redis.eval(COUNT_SCRIPT, 1, key, String(MCP_RATE_KEY_TTL_SECONDS));
      return Number(count) <= MCP_RATE_LIMIT_PER_WINDOW;
    } catch (error) {
      writeMcpLog(this.logger, { event: 'mcp_rate_limit_error', error: errorName(error) });
      return true;
    }
  }

  onApplicationShutdown(): void {
    this.redis?.disconnect();
  }

  /** 연결 오류를 처리되지 않은 사건으로 두지 않는다. 같은 끊김이 이어지면 첫 오류만 남긴다(AiRun.watch와 같은 방식). */
  private watch(connection: IORedis): IORedis {
    let reported = false;
    connection.on('ready', () => { reported = false; });
    connection.on('error', (error: Error) => {
      if (reported) return;
      reported = true;
      writeMcpLog(this.logger, { event: 'mcp_rate_limit_error', error: errorName(error) });
    });
    return connection;
  }
}
