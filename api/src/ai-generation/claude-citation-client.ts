// Claude 호출기: 공식 SDK로 인용 호출을 한 번 보내고 응답을 U1이 읽는 모양(ProviderResponse)으로 옮긴다
// (U1 기능 설계 BR2.2, 비기능 NFR1.1·NFR2.1·NFR2.2 ①④·NFR4.1·NFR4.2·NFR4.4).
import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam, ThinkingConfigParam } from '@anthropic-ai/sdk/resources/messages';
import type { AiModel } from './ai-generation.types';
import type { FetchLike } from './guarded-fetch';

/** Claude API 주소. 환경변수(ANTHROPIC_BASE_URL 등)로 바뀌지 않게 코드의 상수로 넘긴다(NFR2.2 ①). */
export const CLAUDE_API_BASE_URL = 'https://api.anthropic.com';

/** 처리 위치는 미국으로 고정한다(NFR2.1, 10월 worker와 같은 #119 결정). */
export const INFERENCE_GEO = 'us';

export const CLAUDE_MODEL_IDS: Record<AiModel, string> = {
  HAIKU: 'claude-haiku-5-5',
  SONNET: 'claude-sonnet-5-5',
};

/**
 * 생각 출력을 끄는 설정(BR2.2). Haiku 5.5는 disabled를 받지만 Sonnet 5.5는 disabled에 400을 내고
 * between_tools를 가장 낮은 생각 설정으로 받는다. 도구를 쓰지 않는 이 호출에서 between_tools는 생각 없이 답한다.
 */
export const THINKING_OFF: Record<AiModel, ThinkingConfigParam> = {
  HAIKU: { type: 'disabled' },
  SONNET: { type: 'between_tools' },
};

export type ProviderStopReason = 'END_TURN' | 'MAX_TOKENS' | 'REFUSAL' | 'OTHER';

export interface ProviderCitation {
  locationKind: 'BLOCK_RANGE' | 'OTHER';
  documentIndex: number | null;
  /** 포함. */
  startBlockIndex: number | null;
  /** 제외. */
  endBlockIndex: number | null;
  /** 인용 기능이 돌려준 인용 글. quote로 쓰지 않고 실제 호출 시험의 대조에만 쓴다. */
  citedText: string | null;
}

export interface ResponseFragment {
  text: string;
  citations: ProviderCitation[];
}

export interface ProviderResponse {
  fragments: ResponseFragment[];
  stopReason: ProviderStopReason;
  /** 로그용 원래 중단 이유. 영문 소문자·밑줄 모양이 아니면 null로 둔다. */
  rawStopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  requestId: string | null;
}

export interface ClaudeCitationCall {
  model: AiModel;
  system: string;
  userContent: ContentBlockParam[];
}

export interface ClaudeCitationClientOptions {
  apiKey: string;
  maxOutputTokens: number;
  timeoutMs: number;
  /** 지키는 fetch로 감싼 fetch. */
  fetch: FetchLike;
}

/** 응답이 Messages API 모양이 아닐 때 낸다. 메시지에 응답 원문을 넣지 않는다. */
export class ProviderResponseShapeError extends Error {
  override readonly name = 'ProviderResponseShapeError';

  constructor() {
    super('Claude 응답 모양이 맞지 않습니다.');
  }
}

export class ClaudeCitationClient {
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeCitationClientOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey, // 키를 늘 명시해 SDK가 환경변수에서 키를 스스로 읽지 않게 한다(NFR1.1).
      authToken: null, // ANTHROPIC_AUTH_TOKEN이 있어도 Authorization 머리글을 붙이지 않는다.
      baseURL: CLAUDE_API_BASE_URL,
      maxRetries: 0, // SDK 기본 2회를 끈다(NFR4.4).
      timeout: options.timeoutMs,
      fetch: options.fetch,
      logLevel: 'warn', // ANTHROPIC_LOG=debug가 요청·응답 본문을 남기지 못하게 고정한다(NFR6.3).
    });
  }

  /** 한 번만 부른다. 실패는 SDK 오류 그대로 던지고, 게이트가 AiProviderError로 바꾼다. */
  async call(request: ClaudeCitationCall): Promise<ProviderResponse> {
    const message = await this.client.messages.create({
      model: CLAUDE_MODEL_IDS[request.model],
      max_tokens: this.options.maxOutputTokens,
      thinking: THINKING_OFF[request.model],
      inference_geo: INFERENCE_GEO,
      system: request.system,
      messages: [{ role: 'user', content: request.userContent }],
    });
    return toProviderResponse(message);
  }

  /**
   * 스트림으로 한 번 부른다(U2 generateStream, BR3.8). 글 블록이 끝날 때마다 조각 하나를 내보내고,
   * 마지막에 중단 이유·사용량을 담은 끝 사건을 내보낸다. 같은 설정(주소·재시도 0·지키는 fetch)을 쓴다.
   */
  async *stream(request: ClaudeCitationCall): AsyncGenerator<ProviderStreamEvent> {
    const { data, request_id: requestId } = await this.client.messages.create({
      model: CLAUDE_MODEL_IDS[request.model],
      max_tokens: this.options.maxOutputTokens,
      thinking: THINKING_OFF[request.model],
      inference_geo: INFERENCE_GEO,
      system: request.system,
      messages: [{ role: 'user', content: request.userContent }],
      stream: true,
    }).withResponse();
    const assembler = new StreamAssembler(typeof requestId === 'string' && /^[\w-]{1,128}$/.test(requestId) ? requestId : null);
    for await (const event of data) {
      const fragment = assembler.accept(event);
      if (fragment !== null) yield { kind: 'FRAGMENT', fragment };
    }
    yield assembler.finish();
  }
}

/** 스트림 사건. 조각은 글 블록 하나가 끝난 뒤에만 나온다(인용이 다 붙은 뒤). */
export type ProviderStreamEvent =
  | { kind: 'FRAGMENT'; fragment: ResponseFragment }
  | { kind: 'END'; response: Omit<ProviderResponse, 'fragments'> };

/** 스트림 원시 사건을 밖에서 온 값으로 보고 검사하며 글 블록을 모은다. 모양이 틀리면 ProviderResponseShapeError. */
export class StreamAssembler {
  private readonly blocks = new Map<number, ResponseFragment>();
  private rawStopReason: string | null = null;
  private inputTokens: number | null = null;
  private outputTokens: number | null = null;
  private ended = false;

  constructor(private readonly requestId: string | null) {}

  accept(event: unknown): ResponseFragment | null {
    if (!isRecord(event) || typeof event.type !== 'string') throw new ProviderResponseShapeError();
    switch (event.type) {
      case 'message_start':
        this.readUsage(isRecord(event.message) ? event.message.usage : undefined);
        return null;
      case 'content_block_start':
        return this.startBlock(event);
      case 'content_block_delta':
        return this.applyDelta(event);
      case 'content_block_stop':
        return this.stopBlock(event);
      case 'message_delta':
        if (isRecord(event.delta) && typeof event.delta.stop_reason === 'string' && /^[a-z_]{1,40}$/.test(event.delta.stop_reason)) {
          this.rawStopReason = event.delta.stop_reason;
        }
        this.readUsage(event.usage);
        return null;
      case 'message_stop':
        this.ended = true;
        return null;
      default:
        return null; // ping 등 내용 없는 사건
    }
  }

  /** 스트림이 끝난 뒤의 중단 이유·사용량. message_stop 없이 끝났으면 모양 오류다. */
  finish(): ProviderStreamEvent {
    if (!this.ended) throw new ProviderResponseShapeError();
    return { kind: 'END', response: { stopReason: toStopReason(this.rawStopReason), rawStopReason: this.rawStopReason,
      inputTokens: this.inputTokens, outputTokens: this.outputTokens, requestId: this.requestId } };
  }

  private startBlock(event: Record<string, unknown>): null {
    const index = toIndex(event.index);
    if (index === null || !isRecord(event.content_block)) throw new ProviderResponseShapeError();
    const block = event.content_block;
    if (block.type !== 'text') return null; // 생각 블록 등은 버린다
    if (typeof block.text !== 'string') throw new ProviderResponseShapeError();
    this.blocks.set(index, { text: block.text, citations: toCitations(block.citations) });
    return null;
  }

  private applyDelta(event: Record<string, unknown>): null {
    const index = toIndex(event.index);
    if (index === null || !isRecord(event.delta)) throw new ProviderResponseShapeError();
    const block = this.blocks.get(index);
    if (block === undefined) return null; // 글 블록이 아닌 블록의 조각
    const { delta } = event;
    if (delta.type === 'text_delta') {
      if (typeof delta.text !== 'string') throw new ProviderResponseShapeError();
      block.text += delta.text;
    } else if (delta.type === 'citations_delta') {
      block.citations.push(...toCitations([delta.citation]));
    }
    return null;
  }

  private stopBlock(event: Record<string, unknown>): ResponseFragment | null {
    const index = toIndex(event.index);
    if (index === null) throw new ProviderResponseShapeError();
    const block = this.blocks.get(index) ?? null;
    this.blocks.delete(index);
    return block;
  }

  private readUsage(usage: unknown): void {
    if (!isRecord(usage)) return;
    this.inputTokens = toCount(usage.input_tokens) ?? this.inputTokens;
    this.outputTokens = toCount(usage.output_tokens) ?? this.outputTokens;
  }
}

/** SDK가 돌려준 값을 밖에서 온 값으로 보고 검사한 뒤 옮긴다. 생각 블록 등 글 블록이 아닌 것은 버린다. */
export function toProviderResponse(message: unknown): ProviderResponse {
  if (!isRecord(message) || !Array.isArray(message.content)) throw new ProviderResponseShapeError();
  const fragments: ResponseFragment[] = [];
  for (const block of message.content) {
    if (!isRecord(block) || typeof block.type !== 'string') throw new ProviderResponseShapeError();
    if (block.type !== 'text') continue;
    if (typeof block.text !== 'string') throw new ProviderResponseShapeError();
    fragments.push({ text: block.text, citations: toCitations(block.citations) });
  }
  const usage = isRecord(message.usage) ? message.usage : {};
  const rawStopReason = typeof message.stop_reason === 'string' && /^[a-z_]{1,40}$/.test(message.stop_reason)
    ? message.stop_reason
    : null;
  return {
    fragments,
    stopReason: toStopReason(rawStopReason),
    rawStopReason,
    inputTokens: toCount(usage.input_tokens),
    outputTokens: toCount(usage.output_tokens),
    requestId: readRequestId(message),
  };
}

function toCitations(value: unknown): ProviderCitation[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new ProviderResponseShapeError();
  return value.map((citation): ProviderCitation => {
    if (!isRecord(citation)) throw new ProviderResponseShapeError();
    const isBlockRange = citation.type === 'content_block_location';
    return {
      locationKind: isBlockRange ? 'BLOCK_RANGE' : 'OTHER',
      documentIndex: toIndex(citation.document_index),
      startBlockIndex: isBlockRange ? toIndex(citation.start_block_index) : null,
      endBlockIndex: isBlockRange ? toIndex(citation.end_block_index) : null,
      citedText: typeof citation.cited_text === 'string' ? citation.cited_text : null,
    };
  });
}

function toStopReason(value: string | null): ProviderStopReason {
  switch (value) {
    case 'end_turn':
      return 'END_TURN';
    case 'max_tokens':
      return 'MAX_TOKENS';
    case 'refusal':
      return 'REFUSAL';
    default:
      return 'OTHER';
  }
}

/** 응답 머리글 request-id. SDK가 열거되지 않는 속성 _request_id로 붙인다. */
function readRequestId(message: Record<string, unknown>): string | null {
  const requestId = message._request_id;
  return typeof requestId === 'string' && /^[\w-]{1,128}$/.test(requestId) ? requestId : null;
}

const toIndex = (value: unknown): number | null => (Number.isSafeInteger(value) ? (value as number) : null);
const toCount = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
