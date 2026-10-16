import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { ApiError } from '../common/errors';

export const PUBLIC_ROUTE = Symbol('PUBLIC_ROUTE');
export const WORKER_CONTEXT_ROUTE = Symbol('WORKER_CONTEXT_ROUTE');
export const AUTHENTICATED_MEMBER = Symbol('AUTHENTICATED_MEMBER');

export interface AuthenticatedRequest {
  headers: { authorization?: string; 'x-worker-key'?: string | string[] };
  [AUTHENTICATED_MEMBER]?: { memberId: string };
}

/** 인증 없이 접근을 허용할 경로에만 명시한다. */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

/** 메서드 단위의 worker 서비스 인증. Public 제외와 별개이며 우선 적용된다. */
export const WorkerContextOnly = () => SetMetadata(WORKER_CONTEXT_ROUTE, true);

/** 요청 입력이 아닌 공통 Guard가 검증한 회원 ID만 반환한다. */
export const CurrentMemberId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const member = request[AUTHENTICATED_MEMBER];
    if (!member) throw new ApiError('AUTH_REQUIRED');
    return member.memberId;
  },
);
