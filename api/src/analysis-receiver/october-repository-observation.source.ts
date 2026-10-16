import type { RequestContext } from './receiver.types';
import type { RepositoryObservation, RepositoryObservationSource } from './repository-observation.source';

/** #252가 보관한 해당 시도의 저장소 좌표. 결과 메시지의 근거 주소에서 추출하지 않는다. */
export interface RegistrationRepositorySnapshot extends RequestContext {
  githubRepository: { owner: string; name: string };
}

export interface RegistrationRepositorySource {
  /** 처리 종결 후에도 같은 시도의 좌표를 읽어야 한다. 진행 중 전용 worker 조회는 사용할 수 없다. */
  findForRegistration(context: Readonly<RequestContext>): Promise<RegistrationRepositorySnapshot | null>;
}

const CONTEXT_FIELDS = [
  'requestId', 'attemptId', 'memberId', 'repositoryId', 'consentId', 'scopeRevision', 'sourceMode',
] as const;

const POLICY = 'OCTOBER_2026_NOT_OBSERVED';
const DECISION = 'https://github.com/JminAILab/CatchU/issues/23#issuecomment-6189227348';

/**
 * 10/15 팀장 결정: 공개 여부를 조회하지 않았음을 명시하는 10월 정책 공급자.
 * 좌표 공급 부재/실패/맥락 불일치를 NONE으로 채우지 않는다. Catch 공개 선택과 별개다.
 * 실제 관측으로 전환할 때는 이 공급자 교체뿐 아니라 기존 정책 기록의 재확인이 필요하다.
 */
export class OctoberRepositoryObservationSource implements RepositoryObservationSource {
  constructor(private readonly repositories: RegistrationRepositorySource,
    private readonly now: () => Date = () => new Date()) {}

  async observe(input: Readonly<RequestContext>): Promise<RepositoryObservation | null> {
    const context = Object.freeze({
      requestId: input.requestId, attemptId: input.attemptId, memberId: input.memberId,
      repositoryId: input.repositoryId, consentId: input.consentId,
      scopeRevision: input.scopeRevision, sourceMode: input.sourceMode,
    });
    if (CONTEXT_FIELDS.some(field => typeof context[field] !== 'string' || context[field].length === 0) ||
      !['MOCK', 'LIVE'].includes(context.sourceMode)) return null;

    // 조회 예외는 기존 AnalysisRegistrationService가 안전하게 기록하고 반영 실패로 처리한다.
    const snapshot = await this.repositories.findForRegistration(context);
    if (!snapshot || CONTEXT_FIELDS.some(field => snapshot[field] !== context[field])) return null;
    const coordinates = snapshot.githubRepository;
    if (!coordinates || typeof coordinates.owner !== 'string' || typeof coordinates.name !== 'string' ||
      !/^[A-Za-z0-9-]+$/.test(coordinates.owner) || !/^[A-Za-z0-9_.-]+$/.test(coordinates.name) ||
      ['.', '..'].includes(coordinates.name)) return null;
    const recordedAt = this.now();
    if (!(recordedAt instanceof Date) || !Number.isFinite(recordedAt.getTime())) return null;

    // 허용 필드만 새로 만든다. 공급자의 토큰·추가 원문·관측 주장을 저장으로 넘기지 않는다.
    return {
      ownerId: context.memberId,
      repositoryId: context.repositoryId,
      githubRepository: { owner: coordinates.owner, name: coordinates.name },
      confirmedSourceState: { observation: 'NOT_OBSERVED', sourceMode: context.sourceMode },
      observationProvenance: {
        policy: POLICY,
        description: '10월 관측 안 함(9/28 결정)',
        decisionReference: DECISION,
        requestId: context.requestId,
        attemptId: context.attemptId,
      },
      // observedAt은 기존 저장 칸 이름이며, 이 정책에서는 관측 시각이 아닌 기록 시각이다.
      observedAt: new Date(recordedAt.getTime()),
      appliedRestriction: 'NONE',
    };
  }
}
