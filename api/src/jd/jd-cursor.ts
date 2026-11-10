import { ApiError } from '../common/errors';

export interface JdCursor { at: string; id: string }
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString('base64url');
}
export function decodeCursor(value: unknown): JdCursor | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new ApiError('INVALID_INPUT');
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object' && 'at' in parsed && 'id' in parsed
      && typeof parsed.at === 'string' && new Date(parsed.at).toISOString() === parsed.at
      && typeof parsed.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id)) return { at: parsed.at, id: parsed.id };
  } catch { /* 원문·cursor를 오류에 싣지 않는다. */ }
  throw new ApiError('INVALID_INPUT');
}
