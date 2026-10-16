import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { CatchRegistrationInputError } from '../catches/registration-input-error';
import { CatchRegistrationContextError, registerCandidates } from '../catches/registration-service';
import { RepositoryProtectionEntity } from '../catches/entities/repository-protection.entity';
import { RegistrationInput, RegistrationPort } from '../result-application/registration.port';
import { RepositoryObservation } from './repository-observation.source';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 최초 관측을 B와 같은 manager로 저장한다. 공급 부재·실패를 NONE으로 보정하지 않는다. */
export class RepositoryRegistrationPort implements RegistrationPort {
  constructor(private readonly observation: RepositoryObservation | null,
    private readonly repositoryId: string) {}

  async register(manager: EntityManager, input: RegistrationInput) {
    // 정상 0건/후보 없는 실패에는 보호 관측이 없어도 기존 B의 0건 반영을 실행한다.
    if (input.candidates.length > 0) {
      const observation = this.observation;
      if (!observation || observation.ownerId !== input.ownerId || observation.repositoryId !== this.repositoryId ||
        !object(observation.confirmedSourceState) || !object(observation.observationProvenance) ||
        !(observation.observedAt instanceof Date) || !Number.isFinite(observation.observedAt.getTime()) ||
        !['NONE', 'SOURCE_PRIVATE'].includes(observation.appliedRestriction)) {
        throw new CatchRegistrationContextError('CATCH_NOT_READY');
      }
      if (input.sourceMode === 'LIVE') this.assertEvidence(input, observation);
      // 요청/시도 잠금 이후 동일 회원·저장소의 최초 공급도 직렬화한다.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [JSON.stringify(['repository-observation', input.ownerId, this.repositoryId])]);
      const previous = await manager.findOne(RepositoryProtectionEntity, {
        where: { ownerId: input.ownerId, repositoryId: this.repositoryId }, lock: { mode: 'pessimistic_write' },
      });
      const values = {
        confirmedSourceState: observation.confirmedSourceState,
        observationProvenance: observation.observationProvenance,
        observedAt: observation.observedAt, observationFailure: () => 'NULL',
        // 원본 재공개 후 자동 보호 해제는 보류다. 새 관측으로 기존 제한을 풀지 않는다.
        appliedRestriction: previous?.appliedRestriction === 'SOURCE_PRIVATE' ? 'SOURCE_PRIVATE' as const : observation.appliedRestriction,
      };
      if (previous) await manager.update(RepositoryProtectionEntity, { protectionId: previous.protectionId }, values);
      else await manager.insert(RepositoryProtectionEntity, {
        protectionId: randomUUID(), ownerId: input.ownerId, repositoryId: this.repositoryId, ...values,
      });
    }
    return registerCandidates(manager, input);
  }

  classifyError(error: unknown) {
    return error instanceof CatchRegistrationInputError || error instanceof CatchRegistrationContextError
      ? error.reason : undefined;
  }

  private assertEvidence(input: RegistrationInput, observation: RepositoryObservation): void {
    const coordinates = observation.githubRepository;
    // 좌표는 조회된 저장소에서 온 값이다. 경로·userinfo·쿼리를 좌표로 받아들이지 않는다.
    if (!coordinates || !/^[A-Za-z0-9-]+$/.test(coordinates.owner) ||
      !/^[A-Za-z0-9_.-]+$/.test(coordinates.name) || ['.', '..'].includes(coordinates.name)) {
      throw new CatchRegistrationContextError('CONTEXT_MISMATCH');
    }
    // 같은 저장소 좌표의 대소문자만 정규화해 대조하고 근거 URL 원문은 보존한다.
    const repositoryPath = `/${coordinates.owner}/${coordinates.name}/`.toLowerCase();
    const prefix = `https://github.com${repositoryPath}`;
    for (const candidate of input.candidates) for (const evidence of candidate.evidence) {
      const url = URL.canParse(evidence.sourceUrl) ? new URL(evidence.sourceUrl) : null;
      if (!evidence.sourceUrl.toLowerCase().startsWith(prefix) || !url || url.origin !== 'https://github.com' ||
        url.username || url.password || !url.pathname.toLowerCase().startsWith(repositoryPath)) {
        throw new CatchRegistrationInputError('INVALID_INPUT', 'evidence.sourceUrl');
      }
    }
  }
}
