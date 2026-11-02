import { parseRepositoryAddress, RepositoryCoordinates } from './repository-address';

export interface RegistrationScope {
  revision: string;
  repositoryId: string;
  allowedResourceTypes: string[];
  selectionReference: string;
  registrationId: string;
  repository: RepositoryCoordinates;
}

/** DB 사본만의 검사. 큐에는 좌표·등록 사본을 싣지 않고 attemptId 참조를 쓴다. */
export function readRegistrationScope(value: unknown): RegistrationScope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join(',') !== 'allowedResourceTypes,registrationId,repository,repositoryId,revision,selectionReference' ||
      typeof data.registrationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.registrationId) ||
      data.selectionReference !== data.registrationId || typeof data.repositoryId !== 'string' || !data.repositoryId ||
      typeof data.revision !== 'string' || !data.revision || !Array.isArray(data.allowedResourceTypes) ||
      data.allowedResourceTypes.length === 0 || new Set(data.allowedResourceTypes).size !== data.allowedResourceTypes.length ||
      data.allowedResourceTypes.some(type => !['COMMIT', 'PULL_REQUEST', 'ISSUE'].includes(type as string))) return null;
  const repository = data.repository as Record<string, unknown> | null;
  if (!repository || Object.keys(repository).sort().join(',') !== 'name,owner,url') return null;
  try {
    const coordinates = parseRepositoryAddress(repository.url);
    if (coordinates.owner !== repository.owner || coordinates.name !== repository.name || coordinates.url !== repository.url) return null;
    return { revision: data.revision, repositoryId: data.repositoryId, registrationId: data.registrationId,
      selectionReference: data.registrationId, allowedResourceTypes: [...data.allowedResourceTypes as string[]], repository: coordinates };
  } catch { return null; }
}
