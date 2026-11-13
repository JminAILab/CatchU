import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { AiConsentGate } from '../ai-consent/ai-consent.gate';
import { AiRun } from '../ai-run/ai-run';
import { ApiError } from '../common/errors';
import { DailyRunLimit } from '../daily-run-limit/daily-run-limit';
import { findOwnJd } from '../jd/jd.service';
import { splitRequirements } from '../jd/jd-input';
import { LinkPasswordRequired, LinkUnavailable, type PublicationAccess } from '../publications/publication-access';
import { PUBLISHED_SEARCH } from '../published-index/published-index.module';
import type { PublishedSearch } from '../published-index/published-search';
import { writeJdLog } from './jd-summary-log';
import { JdSummaryResult } from './jd-summary-result.entity';
import { JdSummaryRun } from './jd-summary-run.entity';
import { JdSummaryStore } from './jd-summary-store';
import { JD_PUBLICATION_ACCESS, JD_SUMMARY_OPTIONS, type JdSummaryOptions } from './jd-summary-tokens';

/** #474: SQL·메시지나 다른 FK를 해석하지 않고 PostgreSQL의 정확한 오류 필드만 확인한다. */
function isDeletedPublication(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: unknown = error.driverError;
  return typeof driverError === 'object' && driverError !== null
    && 'code' in driverError && driverError.code === '23503'
    && 'constraint' in driverError && driverError.constraint === 'fk_jd_summary_run_publication_id';
}

@Injectable()
export class JdSummaryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly store: JdSummaryStore,
    @Inject(JD_PUBLICATION_ACCESS) private readonly access: PublicationAccess,
    private readonly consent: AiConsentGate,
    private readonly limit: DailyRunLimit,
    private readonly aiRun: AiRun,
    @Inject(PUBLISHED_SEARCH) private readonly search: PublishedSearch,
    @Inject(JD_SUMMARY_OPTIONS) private readonly options: JdSummaryOptions,
  ) {}

  private async publication(token: string, grant: string | undefined): Promise<string> {
    try {
      return (await this.access.resolveForRecipient(token, grant || null, this.options.clock())).publicationId;
    } catch (error) {
      if (error instanceof LinkUnavailable) throw new ApiError('LINK_UNAVAILABLE');
      if (error instanceof LinkPasswordRequired) throw new ApiError('LINK_PASSWORD_REQUIRED');
      throw error;
    }
  }

  async accept(memberId: string, token: string, grant: string | undefined, body: unknown) {
    const publicationId = await this.publication(token, grant);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
      || !('jdId' in body) || typeof body.jdId !== 'string') throw new ApiError('INVALID_INPUT');
    const jdId = body.jdId;
    splitRequirements(await findOwnJd(this.dataSource.manager, memberId, jdId));
    await this.consent.require(memberId);
    if (await this.search.getIndexState(publicationId, this.options.clock()) !== 'DONE') throw new ApiError('INDEX_NOT_READY');
    const run = await this.createRun({ memberId, jdId, publicationId });
    writeJdLog(this.options.logger, { stage: 'accepted', outcome: 'PENDING', runId: run.runId });
    const outcome = await this.aiRun.enqueueAfterCommit('JD_SUMMARY', run.runId, { runId: run.runId });
    writeJdLog(this.options.logger, { stage: 'enqueue', outcome, runId: run.runId });
    return { runId: run.runId };
  }

  private async createRun(ids: { memberId: string; jdId: string; publicationId: string }): Promise<JdSummaryRun> {
    const runId = randomUUID();
    try { return await this.dataSource.transaction(async (manager) => {
      const jd = await findOwnJd(manager, ids.memberId, ids.jdId, true);
      const orderedRequirements = splitRequirements(jd);
      const now = this.options.clock();
      if (await this.limit.consume(ids.memberId, 'JD_SUMMARY', now, manager) === 'LIMIT_REACHED') throw new ApiError('DAILY_LIMIT_REACHED');
      const run = manager.create(JdSummaryRun, { ...ids, runId, createdAt: now, deadlineAt: new Date(now.getTime() + 20 * 60_000),
        inputCopy: { title: jd.title, body: jd.body, jdUpdatedAt: jd.updatedAt.toISOString(), orderedRequirements } });
      await manager.insert(JdSummaryRun, run);
      await manager.insert(JdSummaryResult, orderedRequirements.map((requirement) => manager.create(JdSummaryResult, { ...requirement, runId: run.runId })));
      return run;
    }); } catch (error) {
      if (!(error instanceof ApiError)) writeJdLog(this.options.logger, { stage: 'persistence-failed', outcome: 'FAILED', runId, reason: 'PERSISTENCE_FAILED' });
      // transaction이 전체 롤백을 마친 뒤에만 변환한다. 중지·만료는 다음 요청의 C-10 판정에 맡긴다.
      if (isDeletedPublication(error)) throw new ApiError('LINK_UNAVAILABLE');
      throw error;
    }
  }

  async list(memberId: string, token: string, grant: string | undefined, cursor: unknown) {
    return this.store.list(memberId, await this.publication(token, grant), cursor, this.options.clock());
  }
  async detail(memberId: string, token: string, grant: string | undefined, runId: string) {
    return this.store.detail(memberId, await this.publication(token, grant), runId, this.options.clock());
  }
}
