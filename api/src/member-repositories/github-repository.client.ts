import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/errors';
import { GitHubAccessToken } from '../github-connection/github.client';
import { parseRepositoryAddress, RepositoryCoordinates } from './repository-address';

export interface VerifiedRepository extends RepositoryCoordinates { repositoryId: string }

@Injectable()
export class GitHubRepositoryClient {
  /** 고정 호스트·재시도 없음. 토큰/응답 원문은 반환·로그·오류에 포함하지 않는다. */
  async verify(coordinates: RepositoryCoordinates, token: GitHubAccessToken): Promise<VerifiedRepository> {
    const checked = parseRepositoryAddress(coordinates.url);
    if (checked.owner !== coordinates.owner || checked.name !== coordinates.name) throw new ApiError('REPOSITORY_URL_INVALID');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response: Response | undefined;
    try {
      response = await fetch(`https://api.github.com/repos/${checked.owner}/${checked.name}`, {
        redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${token.reveal()}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28' },
      });
      if (!response.ok) throw new ApiError('REPOSITORY_UNVERIFIED');
      const reader = response.body?.getReader();
      if (!reader) throw new ApiError('REPOSITORY_UNVERIFIED');
      const parts: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.length;
          if (length > 65536) throw new ApiError('REPOSITORY_UNVERIFIED');
          parts.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      return verifiedMetadata(JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('REPOSITORY_UNVERIFIED');
    } finally {
      clearTimeout(timer);
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
    }
  }
}

export function verifiedMetadata(value: unknown): VerifiedRepository {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('REPOSITORY_UNVERIFIED');
  const data = value as Record<string, unknown>;
  if (!Number.isSafeInteger(data.id) || (data.id as number) <= 0 || typeof data.private !== 'boolean') {
    throw new ApiError('REPOSITORY_UNVERIFIED');
  }
  if (data.private) throw new ApiError('REPOSITORY_PRIVATE');
  if (data.disabled === true) throw new ApiError('REPOSITORY_UNSUPPORTED');
  const owner = data.owner as Record<string, unknown> | undefined;
  if (typeof owner?.login !== 'string' || typeof data.name !== 'string') throw new ApiError('REPOSITORY_UNVERIFIED');
  let coordinates: RepositoryCoordinates;
  try { coordinates = parseRepositoryAddress(`https://github.com/${owner.login}/${data.name}`); }
  catch { throw new ApiError('REPOSITORY_UNVERIFIED'); }
  if (coordinates.name !== data.name) throw new ApiError('REPOSITORY_UNVERIFIED');
  return { ...coordinates, repositoryId: String(data.id) };
}
