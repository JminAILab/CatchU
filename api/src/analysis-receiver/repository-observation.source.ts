import type { RequestContext } from './receiver.types';

/** 회원/요청에 연결된 신뢰 경로에서 공급한다. worker 결과의 주소·공개 주장을 사용하지 않는다. */
export interface RepositoryObservation {
  ownerId: string;
  repositoryId: string;
  githubRepository: { owner: string; name: string };
  confirmedSourceState: Record<string, unknown>;
  observationProvenance: Record<string, unknown>;
  observedAt: Date;
  appliedRestriction: 'NONE' | 'SOURCE_PRIVATE';
}

/** #105 등록용 내부 공급 경계. 실제 좌표는 #252의 동일 시도 기록을 사용하며 토큰은 반환하지 않는다. */
export interface RepositoryObservationSource {
  observe(context: Readonly<RequestContext>): Promise<RepositoryObservation | null>;
}
