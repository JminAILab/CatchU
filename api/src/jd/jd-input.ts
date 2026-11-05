import { ApiError } from '../common/errors';

export interface JdInput { title: string; body: string }
export interface JdRequirement { requirementIndex: number; sourceLineNumber: number; jdLine: string }

export function assertJdId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError('RESOURCE_UNAVAILABLE');
  }
}

export function parseJdInput(value: unknown): JdInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('INVALID_INPUT');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'title' && key !== 'body')
    || typeof input.title !== 'string' || typeof input.body !== 'string'
    || input.title.trim() === '' || input.body.trim() === '') throw new ApiError('INVALID_INPUT');
  if (input.title.length > 200 || input.body.length > 20_000) throw new ApiError('INPUT_TOO_LARGE');
  return { title: input.title, body: input.body };
}

/** 공백과 불릿은 원문 그대로 둔다. 빈 줄만 제외하고 실제 원문 줄 번호를 보존한다. */
export function splitRequirements(input: JdInput): JdRequirement[] {
  parseJdInput({ title: input.title, body: input.body });
  const requirements: JdRequirement[] = [];
  input.body.split(/\r\n|\n/).forEach((jdLine, index) => {
    if (jdLine.trim() !== '') requirements.push({ requirementIndex: requirements.length, sourceLineNumber: index + 1, jdLine });
  });
  if (requirements.length < 1) throw new ApiError('INVALID_INPUT');
  if (requirements.length > 20 || requirements.some(({ jdLine }) => jdLine.length > 2_000)) {
    throw new ApiError('INPUT_TOO_LARGE');
  }
  return requirements;
}
