import { EntityManager } from 'typeorm';

export interface AcceptedWorkerContext {
  attemptId: string;
  requestId: string;
  memberId: string;
  repositoryId: string;
  scopeRevision: string;
  consentedScope: Record<string, unknown>;
}

export interface WorkerRepositorySelection {
  attemptId: string;
  requestId: string;
  memberId: string;
  repositoryId: string;
  scopeRevision: string;
  repository: { owner: string; name: string };
  wholeRepository: true;
}

/**
 * #252의 실제 선정 목록/동의 범위를 해석하는 명시적 접점. 기본/합성 공급자는 없다.
 * 제공받은 manager만 사용해 현재 선정·저장소 좌표·동의 범위를 확인한다.
 * 알 수 없는 범위, 부분 선정, 철회 또는 판본 불일치는 null. 장애는 예외로 전달한다.
 * 이 함수 안에서 외부 통신을 하지 않는다. 자격정보 조회 전후 각각 호출된다.
 */
export interface WorkerRepositorySelectionSource {
  resolve(manager: EntityManager, context: Readonly<AcceptedWorkerContext>): Promise<WorkerRepositorySelection | null>;
}
export const WORKER_REPOSITORY_SELECTION_SOURCE = Symbol('WORKER_REPOSITORY_SELECTION_SOURCE');
