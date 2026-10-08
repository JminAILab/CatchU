import { Body, Controller, Delete, HttpCode, Post, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { GitHubConnectionService } from './github-connection.service';

function input(query: Record<string, unknown>, body: unknown, expected: string[] = []): Record<string, unknown> {
  const violations: { field: string; reason: string }[] = [];
  if (Object.keys(query).length) violations.push({ field: 'query', reason: 'whitelistValidation' });
  if (body === undefined && !expected.length) return violations.length ? reject(violations) : {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reject([{ field: 'body', reason: 'isObject' }]);
  const value = body as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!expected.includes(key)) violations.push({ field: 'body', reason: 'whitelistValidation' });
  for (const key of expected) {
    if (typeof value[key] !== 'string' || !(key === 'state' ? /^[a-f0-9]{64}$/ : /^[!-~]{1,512}$/).test(value[key] as string)) {
      violations.push({ field: key, reason: 'invalidFormat' });
    }
  }
  if (violations.length) return reject(violations);
  return value;
}
function reject(violations: { field: string; reason: string }[]): never {
  throw new ApiError('VALIDATION_FAILED', { details: { violations } });
}

@Controller('me/github')
export class GitHubConnectionController {
  constructor(private readonly connections: GitHubConnectionService) {}
  @Post('authorization')
  @HttpCode(200)
  authorize(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>, @Body() body: unknown) {
    input(query, body);
    return this.connections.authorize(memberId);
  }
  @Post('connection')
  @HttpCode(200)
  connect(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>, @Body() body: unknown) {
    const value = input(query, body, ['code', 'state']);
    return this.connections.connect(memberId, value.code as string, value.state as string);
  }
  @Delete('connection')
  disconnect(@CurrentMemberId() memberId: string, @Query() query: Record<string, unknown>, @Body() body: unknown) {
    input(query, body);
    return this.connections.disconnect(memberId);
  }
}
