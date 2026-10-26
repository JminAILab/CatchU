import { EntityManager } from 'typeorm';

export interface AcceptedWorkerContext {
  attemptId: string;
  requestId: string;
  memberId: string;
  repositoryId: string;
  consentId: string;
  noticeRevision: string;
  scopeRevision: string;
  consentedScope: Record<string, unknown>;
  // 접수 조회가 LIVE 시도만 받으므로 늘 LIVE다. 시도 행의 값을 그대로 옮긴다.
  sourceMode: 'LIVE';
}

/**
 * 404 RESOURCE_UNAVAILABLE의 이유(#121, 2026-10-15 팀장 결정). worker가 회원 실패 문구를 고르는 데만 쓰고
 * 허용 판정을 나누지 않는다. 공통 오류 필터가 복사하는 `details.violations[0] = { field: 'attemptId', reason }`에 싣는다.
 */
export const WORKER_CONTEXT_UNAVAILABLE_REASONS = ['ATTEMPT_NOT_ACTIVE', 'MEMBER_INACTIVE', 'SCOPE_UNVERIFIED',
  'GITHUB_NOT_CONNECTED', 'GITHUB_REAUTH_REQUIRED'] as const;
export type WorkerContextUnavailableReason = (typeof WORKER_CONTEXT_UNAVAILABLE_REASONS)[number];

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
 * #252의 실제 선정 목록/동의 범위를 해석하는 명시적 접점. 실제 공급자는 DatabaseRepositorySelectionSource
 * (member-repositories/repository-selection.source.ts)이며 기본/합성 공급자는 없다.
 * 제공받은 manager만 사용해 현재 선정·저장소 좌표·동의 범위를 확인한다.
 * 알 수 없는 범위, 부분 선정, 철회 또는 판본 불일치는 null. 장애는 예외로 전달한다.
 * 이 함수 안에서 외부 통신을 하지 않는다. 자격정보 조회 전후 각각 호출된다.
 * lock이 pessimistic_read이면 같은 manager의 활성 트랜잭션에서 선정 판정의 모든 근거 행을
 * 읽기 잠금하고, 잠금 뒤 최신 자료로 판정한다. 잠금은 트랜잭션 종료까지 유지한다.
 * 여러 근거 행은 일관된 순서로 잠근다. null은 자격정보 조회 전의 예비 확인이다.
 */
export interface WorkerRepositorySelectionSource {
  resolve(manager: EntityManager, context: Readonly<AcceptedWorkerContext>,
    options: Readonly<{ lock: 'pessimistic_read' | null }>): Promise<WorkerRepositorySelection | null>;
}
export const WORKER_REPOSITORY_SELECTION_SOURCE = Symbol('WORKER_REPOSITORY_SELECTION_SOURCE');
