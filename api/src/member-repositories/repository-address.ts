import { ApiError } from '../common/errors';

export interface RepositoryCoordinates { owner: string; name: string; url: string }

/** URL 정규화 전에 금지 문법을 거른다. WHATWG URL은 포트 443·dot segment를 지워 버린다. */
export function parseRepositoryAddress(value: unknown): RepositoryCoordinates {
  if (typeof value !== 'string' || value.length > 512) throw new ApiError('REPOSITORY_URL_INVALID');
  const match = /^https:\/\/github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\/([a-zA-Z0-9_.-]{1,104})\/?$/i.exec(value.trim());
  if (!match) throw new ApiError('REPOSITORY_URL_INVALID');
  const owner = match[1];
  const name = match[2].replace(/\.git$/i, '');
  if (!name || name.length > 100 || name === '.' || name === '..') throw new ApiError('REPOSITORY_URL_INVALID');
  return { owner, name, url: `https://github.com/${owner}/${name}` };
}
