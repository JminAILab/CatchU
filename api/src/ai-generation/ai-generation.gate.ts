// AI 생성 관문(C-01 AiGenerationGate)의 U1 최소 경로와 그것을 만드는 함수.
// U1 시험과 실제 호출 시험(S8)만 쓴다. 소비 Unit은 U2가 방어 문구·입력 상한·기계 대조·스트림을 더해
// Nest에 등록한 CheckedAiGenerationGate(checked-gate.ts, ai-generation.module.ts)를 쓴다.
import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  type AiGenerationGate,
  type AiGenerationRequest,
  AiProviderError,
  type GatedOutput,
} from './ai-generation.types';
import { buildCitationRequest } from './citation-request';
import { ClaudeCitationClient, type ProviderResponse, ProviderResponseShapeError } from './claude-citation-client';
import { createGuardedFetch, type FetchLike, GuardedFetchError } from './guarded-fetch';
import { collectResponseItems, ensureItems, type ResponseItems } from './response-items';

export const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
export const DEFAULT_TIMEOUT_MS = 45_000;

export interface AiGenerationGateConfig {
  /** 호출하는 쪽이 CATCHU_GENERATION_API_KEY에서 읽어 넘긴다. 비었으면 게이트를 만들지 않는다. */
  apiKey: string | undefined | null;
  /** 출력 상한(토큰). 기본 4,000. 실제 호출 시험(S8)은 시험 상수를 넘긴다. */
  maxOutputTokens?: number;
  /** 호출 시간 제한(밀리초). 기본 45초. */
  timeoutMs?: number;
  /** 실제 전송에 쓸 fetch(기본 전역 fetch). 무엇을 넘겨도 지키는 fetch로 감싼다. */
  fetch?: FetchLike;
}

/** 설정을 검사해 게이트를 만든다. 키가 비었거나 값이 잘못되면 만들지 않고 멈춘다(오류에 키 값을 넣지 않는다). */
export function createAiGenerationGate(config: AiGenerationGateConfig): ClaudeAiGenerationGate {
  return new ClaudeAiGenerationGate(createCitationClient(config));
}

/** 설정을 검사해 Claude 호출기를 만든다. U1 게이트와 U2 게이트가 같은 검사·호출기를 쓴다. */
export function createCitationClient(config: AiGenerationGateConfig): ClaudeCitationClient {
  if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
    throw new Error('CATCHU_GENERATION_API_KEY가 비어 있어 AI 생성 관문을 만들 수 없습니다.');
  }
  const maxOutputTokens = config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) {
    throw new Error('AI 생성 출력 상한은 1 이상의 정수여야 합니다.');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('AI 생성 시간 제한은 1 이상의 정수(밀리초)여야 합니다.');
  }
  return new ClaudeCitationClient({
    apiKey: config.apiKey,
    maxOutputTokens,
    timeoutMs,
    fetch: createGuardedFetch(config.fetch ?? globalThis.fetch),
  });
}

/** 호출 로그 한 줄의 칸(관측 설계 NFR6.2). 근거 글·인용문·userText·키는 넣지 않는다. */
interface GenerationLog {
  feature: AiGenerationRequest['feature'];
  stopReason: string | null;
  failure: string | null;
  itemCount: number;
  droppedCount: number;
  nonItemLineCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  requestId: string | null;
}

export class ClaudeAiGenerationGate implements Pick<AiGenerationGate, 'generate'> {
  private readonly logger = new Logger(ClaudeAiGenerationGate.name);

  constructor(private readonly client: ClaudeCitationClient) {}

  /** 기능 설계 W1 순서로 한 번 부른다. 다시 부르지 않는다(BR2.4). */
  async generate(request: AiGenerationRequest): Promise<GatedOutput> {
    const startedAt = Date.now();
    const log = emptyLog(request.feature);
    try {
      const plan = buildCitationRequest(request);
      if (plan.kind === 'SKIP') return this.finish(log, startedAt, { items: [], droppedCount: 0 });

      const response = await this.callOnce(plan.system, plan.userContent, request.model);
      Object.assign(log, responseFields(response));
      const collected = collectResponseItems(response, request, plan.documents);
      Object.assign(log, countFields(collected));
      const items = ensureItems(collected, response.requestId);
      return this.finish(log, startedAt, { items, droppedCount: collected.droppedCount });
    } catch (error) {
      log.failure = describeFailure(error);
      if (log.requestId === null && error instanceof AiProviderError) log.requestId = error.requestId;
      log.durationMs = Date.now() - startedAt;
      this.logger.warn({ event: 'AI_GENERATION_FAILED', ...log });
      throw error;
    }
  }

  private async callOnce(
    system: string,
    userContent: Parameters<ClaudeCitationClient['call']>[0]['userContent'],
    model: AiGenerationRequest['model'],
  ): Promise<ProviderResponse> {
    try {
      return await this.client.call({ model, system, userContent });
    } catch (error) {
      throw toCallFailed(error);
    }
  }

  private finish(log: GenerationLog, startedAt: number, output: GatedOutput): GatedOutput {
    log.itemCount = output.items.length;
    log.droppedCount = output.droppedCount;
    log.durationMs = Date.now() - startedAt;
    if (output.droppedCount > 0) this.logger.warn({ event: 'AI_GENERATION_DROPPED', ...log });
    else this.logger.log({ event: 'AI_GENERATION_COMPLETED', ...log });
    return output;
  }
}

function emptyLog(feature: AiGenerationRequest['feature']): GenerationLog {
  return {
    feature, stopReason: null, failure: null, itemCount: 0, droppedCount: 0, nonItemLineCount: 0,
    inputTokens: null, outputTokens: null, durationMs: 0, requestId: null,
  };
}

function responseFields(response: ProviderResponse): Partial<GenerationLog> {
  return {
    stopReason: response.rawStopReason,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    requestId: response.requestId,
  };
}

function countFields(collected: ResponseItems): Partial<GenerationLog> {
  return { itemCount: collected.items.length, droppedCount: collected.droppedCount, nonItemLineCount: collected.nonItemLineCount };
}

export function describeFailure(error: unknown): string {
  if (!(error instanceof AiProviderError)) return 'UNEXPECTED_ERROR';
  const status = error.status === null ? '' : `:${error.status}`;
  return error.failure === null ? error.reason : `${error.reason}/${error.failure}${status}`;
}

/** SDK·전송 오류를 원문 메시지 없이 고정 원인 이름과 상태 코드만 옮겨 CALL_FAILED로 바꾼다. */
export function toCallFailed(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  const guarded = findGuardedFetchError(error);
  if (guarded !== null) return new AiProviderError('CALL_FAILED', { failure: guarded.failure });
  if (error instanceof ProviderResponseShapeError || error instanceof SyntaxError) {
    return new AiProviderError('CALL_FAILED', { failure: 'INVALID_RESPONSE' });
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiProviderError('CALL_FAILED', { failure: 'CONNECTION_TIMEOUT' });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiProviderError('CALL_FAILED', { failure: 'CONNECTION_FAILED' });
  }
  if (error instanceof Anthropic.APIError) {
    const requestId = typeof error.requestID === 'string' ? error.requestID : null;
    return new AiProviderError('CALL_FAILED', { failure: 'API_STATUS', status: error.status ?? null, requestId });
  }
  return new AiProviderError('CALL_FAILED', { failure: 'UNKNOWN' });
}

/** 지키는 fetch의 실패는 SDK가 연결 오류로 감싸므로 cause 사슬에서 찾는다. */
function findGuardedFetchError(error: unknown): GuardedFetchError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current instanceof GuardedFetchError) return current;
    current = current.cause;
  }
  return null;
}
