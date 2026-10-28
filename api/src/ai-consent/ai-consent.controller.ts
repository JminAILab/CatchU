// GET/POST /v1/ai-consent(계약 C-04 http). 공통 Guard가 확인한 회원만 쓰고 본문의 회원 ID는 받지 않는다.
// POST는 기록을 바꾸므로 세션 경로와 같은 허용 출처(AUTH_WEB_ORIGIN) 검사를 더한다.
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { SESSION_CONFIG, SessionConfig } from '../auth/session.config';
import { assertSessionOrigin, SessionRequest } from '../auth/session-http';
import { ApiError } from '../common/errors';
import { AI_NOTICE_VERSION, AiConsentGate } from './ai-consent.gate';

function violation(field: string, reason: string): never {
  throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field, reason }] } });
}

/** 본문은 { noticeVersion: string } 하나만 받는다. 그 밖의 필드·쿼리는 거부한다. */
export function parseConsentBody(body: unknown, query: Record<string, unknown>): string {
  if (Object.keys(query).length > 0) violation('query', 'whitelistValidation');
  if (!body || typeof body !== 'object' || Array.isArray(body)) violation('body', 'isObject');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'noticeVersion')) violation('body', 'whitelistValidation');
  const { noticeVersion } = input;
  if (typeof noticeVersion !== 'string' || noticeVersion.length === 0 || noticeVersion.length > 64) violation('noticeVersion', 'format');
  return noticeVersion;
}

@Controller('ai-consent')
export class AiConsentController {
  constructor(private readonly gate: AiConsentGate, @Inject(SESSION_CONFIG) private readonly session: SessionConfig) {}

  @Get()
  async read(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length > 0) violation('query', 'whitelistValidation');
    return { consented: await this.gate.hasConsented(memberId), noticeVersion: AI_NOTICE_VERSION };
  }

  @Post()
  @HttpCode(204)
  async record(@CurrentMemberId() memberId: string, @Req() request: SessionRequest,
    @Body() body: unknown, @Query() query: Record<string, unknown>): Promise<void> {
    assertSessionOrigin(request, this.session);
    await this.gate.record(memberId, parseConsentBody(body, query), new Date());
  }
}
