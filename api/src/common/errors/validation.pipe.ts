import { ValidationError, ValidationPipe } from '@nestjs/common';
import { ApiError } from './api-error';

/**
 * 요청 DTO(class-validator 데코레이터를 붙인 클래스)를 검증한다.
 * - 명세의 요청 객체는 알 수 없는 필드를 거부하므로 선언되지 않은 필드도 위반으로 본다.
 * - 실패하면 400 VALIDATION_FAILED, details.violations = [{ field, reason }].
 *   reason은 위반한 규칙 이름(예: isNotEmpty)이며, 입력값·class-validator 문구는 담지 않는다.
 * - @Body() body: unknown 처럼 DTO 클래스가 아닌 인자는 검증하지 않는다.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors: ValidationError[]) =>
      new ApiError('VALIDATION_FAILED', { details: { violations: toViolations(errors) } }),
  });
}

function toViolations(errors: ValidationError[], parent = ''): { field: string; reason: string }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.keys(error.constraints ?? {}).map((reason) => ({ field, reason }));
    return [...own, ...toViolations(error.children ?? [], field)];
  });
}
