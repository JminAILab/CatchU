// BASE_SUMMARY 처리기(계약 C-02, 기능 설계 W3, BR5.1~BR5.5, reliability-design NFR5.2·NFR5.3·NFR5.5, observability-design NFR6.2).
// 하루 횟수를 세지 않고 작업 출처를 보지 않으며 base_summary 행만 보고 생성 여부를 정한다(BR5.3). 시도는 1회다.
// 생성 실패(사본 읽기·근거 모양·게이트 예외)는 조건부 FAILED로 쓰고 정상 반환하며, DB 오류는 로그 뒤 다시 던진다(AiRun이 실패로 기록).
// AI 호출 중에는 트랜잭션을 열어 두지 않는다(logical-components 「공유 자원」).
import { DataSource, type EntityManager } from 'typeorm';
import type { AiGenerationGate, GatedOutput } from '../ai-generation/ai-generation.types';
import type { AiRunHandler } from '../ai-run/ai-run';
import { errorName } from '../ai-run/ai-run-spec';
import { NotFound, type PublicationAccess, type PublishedSnapshot } from '../publications/publication-access';
import {
  createPendingIfAbsent, isWorkable, lockSummaryRow, readSummaryRow, saveDone, saveFailed, summaryDeadline,
} from './base-summary-store';
import { BASE_SUMMARY_INSTRUCTION } from './rag-answer-config';
import {
  type BaseSummaryHandled, type BaseSummaryOutcome, createRagAnswerLogger, elapsedMs, type RagAnswerLogger, writeRagAnswerLog,
} from './rag-answer-log';
import { buildSummarySources } from './summary-sources';

export interface BaseSummaryHandlerDeps {
  dataSource: DataSource;
  publicationAccess: PublicationAccess;
  gate: AiGenerationGate;
  /** 판정 시각. 기본은 지금. 시험만 넘긴다. */
  clock?: () => Date;
  logger?: RagAnswerLogger;
}

type Progress = Omit<BaseSummaryHandled, 'event' | 'durationMs' | 'outcome'>;

const isForeignKeyViolation = (error: unknown): boolean => {
  const record = error as { code?: unknown; driverError?: { code?: unknown } } | null;
  return record?.code === '23503' || record?.driverError?.code === '23503';
};

/** 생성 단계의 실패. DB 오류와 구분해 FAILED로 쓴다(BR5.5). */
class GenerationStepFailed extends Error {
  constructor(readonly original: unknown) {
    super('기본 요약 생성 단계가 실패했습니다.');
  }
}

/** 사본에 근거로 쓸 글이 하나도 없다. 로그의 failure 이름으로만 쓴다. */
class NoSummarySources extends Error {
  override readonly name = 'NoSummarySources';
}

async function step<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new GenerationStepFailed(error);
  }
}

export function createBaseSummaryHandler(deps: BaseSummaryHandlerDeps): AiRunHandler {
  const { dataSource, publicationAccess, gate } = deps;
  const clock = deps.clock ?? (() => new Date());
  const logger = deps.logger ?? createRagAnswerLogger();
  const manager = () => dataSource.manager;

  /**
   * 짧은 트랜잭션 하나: 행을 잠근 뒤 시각을 읽고 조건부로 쓴다. 잠금을 기다리는 사이 마감이 지나면 버려야 하기 때문이다
   * (C-02 late-result, BR5.4). 바뀐 행이 없으면 늦은 결과라 버린다(FR14.10).
   */
  function save(publicationId: string, write: (lockedManager: EntityManager, now: Date) => Promise<boolean>): Promise<boolean> {
    return dataSource.transaction(async (lockedManager) => {
      await lockSummaryRow(lockedManager, publicationId);
      return write(lockedManager, clock());
    });
  }

  async function finish(progress: Progress, output: GatedOutput): Promise<BaseSummaryOutcome> {
    progress.itemCount = output.items.length;
    progress.droppedCount = output.droppedCount;
    const { publicationId } = progress;
    if (output.items.length === 0) {
      return await save(publicationId, (lockedManager, now) => saveFailed(lockedManager, publicationId, now)) ? 'FAILED' : 'DISCARDED';
    }
    return await save(publicationId, (lockedManager, now) => saveDone(lockedManager, publicationId, output.items, now)) ? 'DONE' : 'DISCARDED';
  }

  async function failed(progress: Progress, error: unknown): Promise<BaseSummaryOutcome> {
    progress.failure = errorName(error);
    const { publicationId } = progress;
    return await save(publicationId, (lockedManager, now) => saveFailed(lockedManager, publicationId, now)) ? 'FAILED' : 'DISCARDED';
  }

  /** 행 판정(BR5.3). 일해도 되면 그 사본, 아니면 null(SKIPPED). 행이 없고 시한 전이면 PENDING 행을 만든다. */
  async function claim(progress: Progress): Promise<PublishedSnapshot | null> {
    const now = clock();
    const row = await readSummaryRow(manager(), progress.publicationId);
    if (row !== null && !isWorkable(row, now)) return null;
    let snapshot: PublishedSnapshot;
    try {
      snapshot = await step(() => publicationAccess.readSnapshot(progress.publicationId));
    } catch (error) {
      if (error instanceof GenerationStepFailed && error.original instanceof NotFound) return null; // 발행본 없음: 끝낸다
      throw error;
    }
    if (row !== null) return snapshot;
    const deadline = summaryDeadline(snapshot.publishedAt);
    if (now.getTime() >= deadline.getTime()) return null; // 시한 지난 행 없음: 늦은 작업은 버린다
    try {
      await createPendingIfAbsent(manager(), progress.publicationId, deadline, now);
    } catch (error) {
      if (isForeignKeyViolation(error)) return null; // 그사이 발행본이 지워졌다
      throw error;
    }
    return isWorkable(await readSummaryRow(manager(), progress.publicationId), clock()) ? snapshot : null;
  }

  async function run(progress: Progress): Promise<BaseSummaryOutcome> {
    let snapshot: PublishedSnapshot | null;
    try {
      snapshot = await claim(progress);
    } catch (error) {
      if (error instanceof GenerationStepFailed) return failed(progress, error.original);
      throw error;
    }
    if (snapshot === null) return 'SKIPPED';
    let output: GatedOutput;
    try {
      const sources = await step(() => buildSummarySources(snapshot));
      if (sources.length === 0) return failed(progress, new NoSummarySources()); // 근거 0개 = 0개 처리(BR5.1)
      output = await step(() => gate.generate({
        feature: 'BASE_SUMMARY', instruction: BASE_SUMMARY_INSTRUCTION, sources, userText: null, publicationText: null, model: 'HAIKU',
      }));
    } catch (error) {
      if (error instanceof GenerationStepFailed) return failed(progress, error.original);
      throw error;
    }
    return finish(progress, output);
  }

  return async (job) => {
    const startedAt = performance.now();
    const publicationId = job.payload.publicationId;
    const progress: Progress = { publicationId: String(publicationId), failure: null, itemCount: 0, droppedCount: 0 };
    try {
      if (typeof publicationId !== 'string') throw new TypeError('BASE_SUMMARY 작업에 publicationId가 없습니다.');
      const outcome = await run(progress);
      writeRagAnswerLog(logger, { event: 'base-summary.handled', ...progress, outcome, durationMs: elapsedMs(startedAt) });
    } catch (error) {
      // 발행본 ID와 오류 이름만 남기고 던진다. AiRun이 실패로 기록하며 다시 돌리지 않는다(상태는 시한으로 FAILED, NFR5.5).
      writeRagAnswerLog(logger, { event: 'base-summary.handled', ...progress, outcome: 'ERROR', failure: errorName(error),
        durationMs: elapsedMs(startedAt) });
      throw error;
    }
  };
}
