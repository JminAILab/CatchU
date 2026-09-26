import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';

export const PUBLIC_ROUTE = Symbol('PUBLIC_ROUTE');
export const AUTHENTICATED_MEMBER = Symbol('AUTHENTICATED_MEMBER');

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  [AUTHENTICATED_MEMBER]?: { memberId: string };
}

/** 인증 없이 접근을 허용할 경로에만 명시한다. */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

/** 요청 입력이 아닌 공통 Guard가 검증한 회원 ID만 반환한다. */
export const CurrentMemberId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const member = request[AUTHENTICATED_MEMBER];
    if (!member) throw new UnauthorizedException();
    return member.memberId;
  },
);
