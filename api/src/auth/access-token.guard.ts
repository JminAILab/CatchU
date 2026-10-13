import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../common/errors';
import { WORKER_CONTEXT_AUTH_CONFIG, WorkerContextAuthConfig, requireWorkerContextKey } from './worker-context-auth';
import { AccessTokenService } from './access-token.service';
import { AUTHENTICATED_MEMBER, AuthenticatedRequest, PUBLIC_ROUTE, WORKER_CONTEXT_ROUTE } from './auth.decorators';
import { SessionService } from './session.service';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tokens: AccessTokenService,
    private readonly sessions: SessionService,
    @Inject(WORKER_CONTEXT_AUTH_CONFIG) private readonly worker: WorkerContextAuthConfig) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.get<boolean>(WORKER_CONTEXT_ROUTE, context.getHandler())) {
      requireWorkerContextKey(this.worker, context.switchToHttp().getRequest<AuthenticatedRequest>().headers);
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (authorization === undefined) throw new ApiError('AUTH_REQUIRED');
    const match = typeof authorization === 'string' ? /^Bearer ([^\s,]+)$/i.exec(authorization) : null;
    if (!match) throw new ApiError('AUTH_INVALID');

    const { memberId, sessionId } = await this.tokens.verify(match[1]);
    await this.sessions.assertAccess(memberId, sessionId);
    request[AUTHENTICATED_MEMBER] = { memberId };
    return true;
  }
}
