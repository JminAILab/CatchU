import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { readStatus } from '../ai-run/ai-run-spec';
import { ApiError } from '../common/errors';
import { decodeCursor, encodeCursor } from '../jd/jd-cursor';
import { assertJdId } from '../jd/jd-input';
import { JdSummaryResult } from './jd-summary-result.entity';
import { JdSummaryRun, type RunFailure } from './jd-summary-run.entity';
import { createJdLogger, writeJdLog } from './jd-summary-log';
import { JD_SUMMARY_OPTIONS, type JdSummaryOptions } from './jd-summary-tokens';

export type ResultWrite = Pick<JdSummaryResult, 'status' | 'resultKind' | 'failureCode' | 'evidenceItems' | 'unconfirmedPoints' | 'interviewQuestions'>;

/** 시한·결과·집계 모두 같은 실행 행 잠금을 쓴다. 외부 호출 중에는 이 잠금을 유지하지 않는다. */
async function failPending(manager: EntityManager, run: JdSummaryRun, code: 'DEADLINE_EXCEEDED' | 'PROCESSING_FAILED') {
  await manager.update(JdSummaryResult, { runId: run.runId, status: 'PENDING' }, { status: 'FAILED', failureCode: code });
  await manager.update(JdSummaryRun, { runId: run.runId, status: 'PENDING' }, { status: 'FAILED', failureCode: code });
  run.status = 'FAILED';
  run.failureCode = code;
}

function requirementView(row: JdSummaryResult) {
  const { requirementIndex, sourceLineNumber, jdLine, status, resultKind, evidenceItems, unconfirmedPoints, interviewQuestions, failureCode } = row;
  return { requirementIndex, sourceLineNumber, jdLine, status, resultKind, evidenceItems, unconfirmedPoints, interviewQuestions, failureCode };
}

@Injectable()
export class JdSummaryStore {
  private readonly logger;
  private readonly clock?: () => Date;
  constructor(private readonly dataSource: DataSource,
    @Optional() @Inject(JD_SUMMARY_OPTIONS) options?: JdSummaryOptions) {
    this.logger = options?.logger ?? createJdLogger();
    this.clock = options?.clock;
  }

  private async withRun<T>(key: { runId: string; now: Date; memberId?: string; publicationId?: string },
    work: (manager: EntityManager, run: JdSummaryRun | null) => Promise<T>): Promise<T> {
    let expired = false;
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const { now, ...where } = key;
        const run = await manager.findOne(JdSummaryRun, { where, lock: { mode: 'pessimistic_write' } });
        // 잠금을 기다리는 동안 시한을 넘을 수도 있어 취득 뒤의 시각으로 다시 판정한다.
        if (run?.status === 'PENDING' && readStatus(run, this.clock?.() ?? now) === 'FAILED') {
          await failPending(manager, run, 'DEADLINE_EXCEEDED'); expired = true;
        }
        return work(manager, run);
      });
      // 트랜잭션이 실제 커밋한 전이에만 한 번 기록한다. 재열람마다 반복하지 않는다.
      if (expired) writeJdLog(this.logger, { stage: 'deadline-finalized', outcome: 'FAILED', runId: key.runId, failureCode: 'DEADLINE_EXCEEDED' });
      return result;
    } catch (error) {
      if (!(error instanceof ApiError)) writeJdLog(this.logger, { stage: 'persistence-failed', outcome: 'FAILED', runId: key.runId, reason: 'PERSISTENCE_FAILED' });
      throw error;
    }
  }

  async active(runId: string, now: Date): Promise<JdSummaryRun | null> {
    return this.withRun({ runId, now }, async (_manager, run) => {
      return run?.status === 'PENDING' ? run : null;
    });
  }

  /** 부모 삭제와 연쇄 삭제가 경합해도 기존 PENDING 행만 갱신하며 새 행을 만들지 않는다. */
  async write(runId: string, index: number, value: ResultWrite, now: Date): Promise<boolean> {
    return this.withRun({ runId, now }, async (manager, run) => {
      if (!run || run.status !== 'PENDING') return false;
      const result = await manager.update(JdSummaryResult, { runId, requirementIndex: index, status: 'PENDING' }, value);
      return !!result.affected;
    });
  }

  async finish(runId: string, now: Date, processingFailed = false): Promise<{ status: 'DONE' | 'FAILED'; failureCode: RunFailure | null } | null> {
    return this.withRun({ runId, now }, async (manager, run) => {
      if (!run || run.status !== 'PENDING') return null;
      if (processingFailed) {
        await failPending(manager, run, 'PROCESSING_FAILED');
        return { status: 'FAILED', failureCode: 'PROCESSING_FAILED' };
      }
      const rows = await manager.find(JdSummaryResult, { where: { runId } });
      if (rows.some((row) => row.status === 'PENDING')) return null;
      const value = rows.some((row) => row.status === 'DONE')
        ? { status: 'DONE' as const, failureCode: null }
        : { status: 'FAILED' as const, failureCode: 'ALL_REQUIREMENTS_FAILED' as const };
      await manager.update(JdSummaryRun, { runId, status: 'PENDING' }, value);
      return value;
    });
  }

  async detail(memberId: string, publicationId: string, runId: string, now: Date) {
    assertJdId(runId);
    // 소유·발행본 조건까지 잠금 조회에 포함한다. 타인 runId로는 시한 확정도 하지 않는다.
    return this.withRun({ runId, memberId, publicationId, now }, async (manager, run) => {
      if (!run) throw new ApiError('RESOURCE_UNAVAILABLE');
      const rows = await manager.find(JdSummaryResult, { where: { runId }, order: { requirementIndex: 'ASC' } });
      return { status: run.status, failureCode: run.failureCode, requirements: rows.map(requirementView) };
    });
  }

  async list(memberId: string, publicationId: string, cursor: unknown, now: Date) {
    const after = decodeCursor(cursor);
    const query = this.dataSource.getRepository(JdSummaryRun).createQueryBuilder('run')
      .select(['run.runId', 'run.createdAt']).where('run.memberId = :memberId AND run.publicationId = :publicationId', { memberId, publicationId });
    if (after) query.andWhere('(run.createdAt, run.runId) < (:at, :id)', after);
    const rows = await query.orderBy('run.createdAt', 'DESC').addOrderBy('run.runId', 'DESC').take(21).getMany();
    const items = [];
    for (const row of rows.slice(0, 20)) {
      const item = await this.listItem(row.runId, now);
      if (item) items.push(item);
    }
    const last = rows.slice(0, 20).at(-1);
    return { items, nextCursor: rows.length > 20 && last ? encodeCursor(last.createdAt, last.runId) : null };
  }

  private listItem(runId: string, now: Date) {
    return this.withRun({ runId, now }, async (manager, run) => {
      if (!run) return null;
      const rows = await manager.find(JdSummaryResult, { where: { runId }, select: { status: true, resultKind: true } });
      return { runId, title: run.inputCopy.title, createdAt: run.createdAt, status: run.status,
        requirementCount: rows.length, emptyCount: rows.filter((row) => row.resultKind === 'EMPTY').length,
        failedCount: rows.filter((row) => row.status === 'FAILED').length };
    });
  }
}
