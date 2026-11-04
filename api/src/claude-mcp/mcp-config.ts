// U6 설정(기능 설계 BR1.2~BR1.4·BR2.2, 기능 명세 「공개 주소 판정」, 비기능 NFR1.9). 기동 때 한 번 읽는다.
// 공개 주소를 요청의 Host나 전달 헤더로 만들지 않는다. 오류에는 값 대신 설정 이름만 넣는다.
import { readSessionConfig } from '../auth/session.config';
import { isDevelopmentOrTest } from '../common/node-env';

export const MCP_CONFIG = Symbol('MCP_CONFIG');

/** MCP 주소의 경로. 앞단이 이미 api로 보내는 /v1 아래에 둔다(BR1.1). */
export const MCP_PATH = '/v1/mcp';
/** 운영의 돌아갈 주소(BR2.2). Claude가 콜백을 바꾸면 이 값을 코드 PR로 고친다. */
export const CLAUDE_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
/** 접근 토큰 수명의 기본값이자 상한. 웹 로그인 세션 최대 7일과 맞춘다(BR4.2). */
export const MCP_TOKEN_MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface McpConfig {
  /** OAuth 메타데이터, MCP 주소, WWW-Authenticate에 쓰는 공개 주소(BR1.2). */
  readonly publicOrigin: string;
  /** 복사할 MCP 주소(BR1.3). */
  readonly mcpUrl: string;
  /** 승인 화면 주소. 어느 환경이든 AUTH_WEB_ORIGIN 아래다(BR1.3). */
  readonly authorizeScreenUrl: string;
  readonly accessTokenTtlSeconds: number;
  /** 정확히 일치로 비교하는 돌아갈 주소 목록(BR2.2). */
  readonly redirectUris: readonly string[];
}

class McpConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'McpConfigError'; }
}

/** 빈 값은 없는 것으로 본다(기능 명세 「공개 주소 판정」). */
function present(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

function readTokenTtl(value: string | undefined): number {
  if (value === undefined) return MCP_TOKEN_MAX_TTL_SECONDS;
  const seconds = /^[1-9]\d*$/.test(value) ? Number(value) : Number.NaN;
  if (!(seconds <= MCP_TOKEN_MAX_TTL_SECONDS)) {
    throw new McpConfigError('MCP_ACCESS_TOKEN_TTL_SECONDS는 604800 이하의 양의 정수여야 합니다.');
  }
  return seconds;
}

function readDevOrigin(value: string): string {
  const parsed = URL.canParse(value) ? new URL(value) : null;
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== value) {
    throw new McpConfigError('MCP_DEV_PUBLIC_ORIGIN은 끝 슬래시 없는 출처여야 합니다.');
  }
  return value;
}

function readDevRedirectUris(value: string): string[] {
  return value.split(',').map((raw) => {
    const uri = raw.trim();
    if (!URL.canParse(uri)) throw new McpConfigError('MCP_DEV_REDIRECT_URIS는 쉼표로 구분한 주소 목록이어야 합니다.');
    return uri;
  });
}

function defaultDevOrigin(env: NodeJS.ProcessEnv): string {
  // main.ts와 같은 기본 포트다. 값의 형식은 main.ts가 기동 때 확인한다.
  return `http://127.0.0.1:${present(env.PORT) ?? '3001'}`;
}

export function readMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const development = isDevelopmentOrTest(env);
  const webOrigin = readSessionConfig(env).allowedOrigin;
  const devOrigin = present(env.MCP_DEV_PUBLIC_ORIGIN);
  const devRedirectUris = present(env.MCP_DEV_REDIRECT_URIS);
  if (!development && devOrigin !== undefined) {
    throw new McpConfigError('MCP_DEV_PUBLIC_ORIGIN은 NODE_ENV가 development·test일 때만 쓸 수 있습니다.');
  }
  if (!development && devRedirectUris !== undefined) {
    throw new McpConfigError('MCP_DEV_REDIRECT_URIS는 NODE_ENV가 development·test일 때만 쓸 수 있습니다.');
  }
  const publicOrigin = development
    ? (devOrigin === undefined ? defaultDevOrigin(env) : readDevOrigin(devOrigin))
    : webOrigin;
  return Object.freeze({
    publicOrigin,
    mcpUrl: `${publicOrigin}${MCP_PATH}`,
    authorizeScreenUrl: `${webOrigin}/profile/claude/authorize`,
    accessTokenTtlSeconds: readTokenTtl(present(env.MCP_ACCESS_TOKEN_TTL_SECONDS)),
    redirectUris: Object.freeze([CLAUDE_REDIRECT_URI, ...(devRedirectUris === undefined ? [] : readDevRedirectUris(devRedirectUris))]),
  });
}

/**
 * 요청의 resource가 MCP 주소와 같은지(BR4.6). URL이 스킴·호스트를 소문자로 바꾸고 기본 포트를 없앤다.
 * fragment와 끝 슬래시 하나를 빼고 비교한다. 해석되지 않는 값은 다른 값이다.
 */
export function isSameResource(mcpUrl: string, resource: string): boolean {
  if (!URL.canParse(resource)) return false;
  const parsed = new URL(resource);
  parsed.hash = '';
  return parsed.href.replace(/\/$/, '') === mcpUrl;
}
