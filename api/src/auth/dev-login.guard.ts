import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/errors';
import { AUTH_CONFIG, AuthConfig } from './auth.config';

/** DTO 검증보다 먼저 개발 로그인 비활성·운영 차단 조건을 확인한다. */
@Injectable()
export class DevLoginGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    // 전용 거부 코드는 미결이다. #88의 기존 코드 없는 403 처리를 유지한다.
    if (!this.config.devLoginEnabled) throw new ForbiddenException();
    // ValidationPipe/class-transformer가 조용히 제거하는 키도 기존 추가 필드 거부 조건을 지킨다.
    // 나머지 필드·회원 ID 검증은 전역 ValidationPipe가 처리한다.
    const { body } = context.switchToHttp().getRequest<{ body?: unknown }>();
    if (body !== null && typeof body === 'object') {
      const violations = ['constructor', '__proto__']
        .filter((field) => Object.hasOwn(body, field))
        .map((field) => ({ field, reason: 'whitelistValidation' }));
      if (violations.length > 0) throw new ApiError('VALIDATION_FAILED', { details: { violations } });
    }
    return true;
  }
}
