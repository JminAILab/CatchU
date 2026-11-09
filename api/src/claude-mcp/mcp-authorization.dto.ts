import { IsBoolean, IsIn, IsNotEmpty, IsString, Matches, ValidateIf } from 'class-validator';

export const MCP_AUTHORIZATION_DECISIONS = ['APPROVE', 'DENY'] as const;
export type McpAuthorizationDecision = (typeof MCP_AUTHORIZATION_DECISIONS)[number];

/** 없는 필드만 건너뛴다. null은 값으로 보고 형식 오류로 거부한다(IsOptional은 null도 건너뛴다). */
const whenPresent = (_dto: object, value: unknown): boolean => value !== undefined;

/** DB에 닿는 칸의 NUL은 형식 오류다. 그대로 두면 text 칸의 DB 오류가 되어 500으로 끝난다. */
const WITHOUT_NUL = /^[^\0]*$/;

/**
 * POST /v1/me/mcp-connection/authorizations 본문(U6 기능 설계 BR3.2). 정의하지 않은 필드는 전역 검증 파이프가 거부한다.
 * 회원은 Access 토큰에서만 정한다. web이 /authorize의 쿼리 값을 그대로 옮겨 보내고 api가 다시 확인한다.
 */
export class McpAuthorizationDto {
  @IsString()
  @IsNotEmpty()
  @Matches(WITHOUT_NUL)
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  redirectUri!: string;

  @ValidateIf(whenPresent)
  @IsString()
  state?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(WITHOUT_NUL)
  codeChallenge!: string;

  @ValidateIf(whenPresent)
  @IsString()
  @Matches(WITHOUT_NUL)
  resource?: string;

  @IsIn(MCP_AUTHORIZATION_DECISIONS)
  decision!: McpAuthorizationDecision;

  @ValidateIf(whenPresent)
  @IsBoolean()
  consent?: boolean;
}
