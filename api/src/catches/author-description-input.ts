import { ApiError } from '../common/errors';

/** Catch 작성자 설명 상한(U4 기능 설계 Q5 초기 설계값, NFR4.2). 길이는 유니코드 코드 포인트로 센다. */
export const AUTHOR_DESCRIPTION_MAX_LENGTH = 4000;

// u 모드는 올바른 서로게이트 쌍을 하나의 코드 포인트로 읽으므로 고립된 코드 단위만 잡는다(10월 프로필 입력과 같은 기준).
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

const invalid = (field: string, reason: string) =>
  new ApiError('VALIDATION_FAILED', { details: { violations: [{ field, reason }] } });

/**
 * `PUT /catches/{catchId}/description` 본문 `{ description }`을 검사한다(BR1.1·BR1.2, NFR1.8).
 * - 정의하지 않은 필드·문자열이 아닌 값은 거부한다.
 * - 앞뒤 공백을 지운 뒤 0자면 설명을 지운 것으로 보고 null을 돌려준다. 그 밖에는 쓴 그대로 돌려준다(공백 제거는 판정에만).
 * - 4,000자를 넘으면 400 VALIDATION_FAILED. 값은 오류 응답에 담지 않는다.
 */
export function authorDescriptionInput(body: unknown): string | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw invalid('body', 'isObject');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'description')) throw invalid('body', 'whitelistValidation');
  const value = input.description;
  if (!Object.hasOwn(input, 'description') || typeof value !== 'string') throw invalid('description', 'isString');
  if (value.includes('\u0000')) throw invalid('description', 'noNul');
  if (LONE_SURROGATE.test(value)) throw invalid('description', 'isWellFormed');
  if (Array.from(value).length > AUTHOR_DESCRIPTION_MAX_LENGTH) throw invalid('description', 'maxLength');
  return value.trim().length === 0 ? null : value;
}
