import { AiInputTooLarge, type AiGenerationGate, type GatedOutput } from '../ai-generation/ai-generation.types';
import { isValidPayload, type RunStatus } from '../ai-run/ai-run-spec';
import type { AiRunHandler } from '../ai-run/ai-run';
import type { PublishedSearch } from '../published-index/published-search';
import { jdGenerationRequest, JdContractInvalid } from './jd-generation-request';
import { writeJdLog, type JdLogger } from './jd-summary-log';
import type { RequirementFailure } from './jd-summary-result.entity';
import type { JdSummaryStore, ResultWrite } from './jd-summary-store';

interface ProcessorDeps { store: JdSummaryStore; search: PublishedSearch; gate: AiGenerationGate; clock: () => Date; logger: JdLogger }
const emptyColumns = () => ({ evidenceItems: [], unconfirmedPoints: [], interviewQuestions: [] });
const failed = (failureCode: RequirementFailure): ResultWrite => ({ ...emptyColumns(), status: 'FAILED', resultKind: null, failureCode });

function completed(output: GatedOutput, noSources: boolean): ResultWrite {
  if (!output || !Array.isArray(output.items) || !Number.isInteger(output.droppedCount) || output.droppedCount < 0
    || output.items.some((item) => !item || !['CITED', 'AI_INTERPRETATION', 'SERVER_NOTICE'].includes(item.kind)
      || !['EVIDENCE', 'UNCONFIRMED', 'INTERVIEW_QUESTION'].includes(item.jdRole ?? '')
      || (item.kind === 'SERVER_NOTICE' && item.jdRole !== 'UNCONFIRMED'))) throw new JdContractInvalid();
  const result: ResultWrite = { status: 'DONE', resultKind: output.items.some((item) => item.kind !== 'SERVER_NOTICE') ? 'CONTENT' : 'EMPTY',
    failureCode: null, evidenceItems: output.items.filter((item) => item.jdRole === 'EVIDENCE'),
    unconfirmedPoints: output.items.filter((item) => item.jdRole === 'UNCONFIRMED'),
    interviewQuestions: output.items.filter((item) => item.jdRole === 'INTERVIEW_QUESTION') };
  if (noSources) result.unconfirmedPoints.push({ kind: 'SERVER_NOTICE', jdRole: 'UNCONFIRMED', citations: [],
    text: '이번에 찾은 자료가 없어 이 요구사항의 표기를 찾지 못했습니다.' });
  return result;
}

async function generate(deps: ProcessorDeps, publicationId: string, jdLine: string, runId: string): Promise<{ value: ResultWrite; droppedCount?: number } | null> {
  let searchResult;
  try { searchResult = await deps.search.search(publicationId, jdLine, 6); }
  catch { return { value: failed('SEARCH_FAILED') }; }
  if (!await deps.store.active(runId, deps.clock())) return null;
  try {
    const request = jdGenerationRequest(searchResult, jdLine);
    const output = await deps.gate.generate(request);
    return { value: completed(output, request.sources.length === 0), droppedCount: output.droppedCount };
  } catch (error) {
    // R-01: 개별 호출 시간 초과도 생성 실패다. 전체 실행 시한은 저장소에서 따로 판정한다.
    const code = error instanceof AiInputTooLarge ? 'INPUT_TOO_LARGE' : error instanceof JdContractInvalid ? 'CONTRACT_INVALID' : 'GENERATION_FAILED';
    return { value: failed(code) };
  }
}

export function createJdSummaryHandler(deps: ProcessorDeps): AiRunHandler {
  return async (job) => {
    if (!isValidPayload('JD_SUMMARY', job.payload) || job.runKey !== job.payload.runId) return;
    const runId = job.payload.runId;
    try {
      const run = await deps.store.active(runId, deps.clock());
      if (!run) return;
      writeJdLog(deps.logger, { stage: 'processing', outcome: 'PENDING', runId });
      for (const requirement of run.inputCopy.orderedRequirements) {
        if (!await deps.store.active(runId, deps.clock())) return;
        const startedAt = performance.now();
        const result = await generate(deps, run.publicationId, requirement.jdLine, runId);
        if (!result) return;
        const saved = await deps.store.write(runId, requirement.requirementIndex, result.value, deps.clock());
        writeJdLog(deps.logger, { stage: saved ? 'requirement-finished' : 'result-discarded',
          outcome: saved ? result.value.status as RunStatus : 'DISCARDED', runId, requirementIndex: requirement.requirementIndex,
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          ...(result.value.failureCode ? { failureCode: result.value.failureCode } : {}),
          ...(result.value.resultKind ? { resultKind: result.value.resultKind } : {}),
          ...(!saved ? { reason: 'SAVE_CONDITION_NOT_MET' as const } : {}), droppedCount: result.droppedCount });
      }
      await finish(deps, runId, false);
    } catch {
      // DB 쓰기가 불가능하면 이 예외도 전파된다. 재시도하지 않고 다음 조회의 시한 확정에 맡긴다.
      await finish(deps, runId, true);
    }
  };
}

async function finish(deps: ProcessorDeps, runId: string, processingFailed: boolean) {
  const value = await deps.store.finish(runId, deps.clock(), processingFailed);
  if (value) writeJdLog(deps.logger, { stage: value.status === 'DONE' ? 'completed' : 'failed', outcome: value.status, runId,
    ...(value.failureCode ? { failureCode: value.failureCode } : {}) });
}
