import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../common/errors';
import { AccessTokenService } from './access-token.service';
import { AUTHENTICATED_MEMBER, AuthenticatedRequest, PUBLIC_ROUTE } from './auth.decorators';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tokens: AccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (authorization === undefined) throw new ApiError('AUTH_REQUIRED');
    const match = typeof authorization === 'string' ? /^Bearer ([^\s,]+)$/i.exec(authorization) : null;
    if (!match) throw new ApiError('AUTH_INVALID');

    const memberId = await this.tokens.verify(match[1]);
    request[AUTHENTICATED_MEMBER] = { memberId };
    return true;
  }
}
