import { createHash } from 'node:crypto';
import { ApiError } from '../common/errors';

export interface AnalysisInput {
  repositoryId: string;
  consent: { accepted: true; noticeRevision: string; scopeRevision: string };
  retryOfRequestId?: string;
}
const invalid = (field: string, reason: string) =>
  new ApiError('VALIDATION_FAILED', { details: { violations: [{ field, reason }] } });
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(field, 'isObject');
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(field, 'isNotEmpty');
  return value;
}
export function parseAnalysisInput(raw: unknown): AnalysisInput {
  const body = object(raw, 'body');
  if (Object.keys(body).some(k => !['repositoryId', 'consent', 'retryOfRequestId'].includes(k))) throw invalid('body', 'whitelistValidation');
  const repositoryId = text(body.repositoryId, 'repositoryId');
  const consent = object(body.consent, 'consent');
  if (Object.keys(consent).some(k => !['accepted', 'noticeRevision', 'scopeRevision'].includes(k))) throw invalid('consent', 'whitelistValidation');
  if (typeof consent.accepted !== 'boolean') throw invalid('consent.accepted', 'isBoolean');
  if (!consent.accepted) throw new ApiError('CONSENT_REQUIRED');
  return {
    repositoryId,
    consent: { accepted: true, noticeRevision: text(consent.noticeRevision, 'consent.noticeRevision'),
      scopeRevision: text(consent.scopeRevision, 'consent.scopeRevision') },
    ...(Object.hasOwn(body, 'retryOfRequestId') ? { retryOfRequestId: text(body.retryOfRequestId, 'retryOfRequestId') } : {}),
  };
}
/** 전체 입력을 고정 순서 tuple로 만든다. 토큰·외부 본문을 포함하지 않는다. */
export function analysisFingerprint(input: AnalysisInput): string {
  return createHash('sha256').update(JSON.stringify([input.repositoryId, input.consent.accepted,
    input.consent.noticeRevision, input.consent.scopeRevision, input.retryOfRequestId ?? null])).digest('hex');
}
