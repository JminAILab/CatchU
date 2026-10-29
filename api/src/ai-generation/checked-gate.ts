// U2 AI 생성 게이트(계약 C-01 AiGenerationGate 전체, U2 기능 설계 W3·W4·BR3.1~BR3.9, 비기능 NFR2.1~2.3·NFR3.1·NFR4.2·NFR4.5).
// U1의 줄 나누기·호출·항목 묶기·위치 계산(U1 BR1~BR5)을 그대로 쓰고, 입구 검사·공통 지시·기계 대조·스트림을 더한다.
// 소비 Unit(U5·U10)은 이 게이트만 쓴다(ai-generation.module.ts의 AI_GENERATION_GATE).
import { Logger } from '@nestjs/common';
import {
  type AiGenerationGate, type AiGenerationRequest, AiInputTooLarge, AiProviderError, type GatedItem, type GatedOutput,
} from './ai-generation.types';
import { type AiGenerationGateConfig, createCitationClient, describeFailure, toCallFailed } from './ai-generation.gate';
import { buildCitationRequest, type CitationRequestPlan } from './citation-request';
import type { ClaudeCitationClient, ProviderResponse, ProviderStreamEvent, ResponseFragment } from './claude-citation-client';
import { type CheckTokens, passesFactCheck, publicationTokens } from './fact-check';
import { assertGenerationRequest, COMMON_GUARD_INSTRUCTION } from './gate-policy';
import { checkJdItems, JD_FORMAT_INSTRUCTION, JD_HEADINGS, serverNotices } from './jd-checks';
import {
  addReading, assertUsableStop, collectResponseItems, ensureItems, joinResponseLines, type LineReading, readResponseLine,
  type ResponseItems,
} from './response-items';

/** 버린 이유별 수(관측 설계 ai_gate_result). truncated·location은 U1 묶기, 나머지는 U2 검사. */
export interface DropReasons {
  truncated: number;
  location: number;
  fact: number;
  role: number;
  outside_heading: number;
}

/** 호출 로그 한 줄. 항목 글·근거 글·질문·JD 줄·키는 넣지 않는다(관측 설계 NFR3.1·NFR6.9). */
interface GateLog {
  feature: AiGenerationRequest['feature'];
  mode: 'GENERATE' | 'STREAM';
  itemCount: number;
  droppedCount: number;
  dropReasons: DropReasons;
  nonItemLineCount: number;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  requestId: string | null;
}

type CallPlan = Extract<CitationRequestPlan, { kind: 'CALL' }>;

export class CheckedAiGenerationGate implements AiGenerationGate {
  private readonly logger = new Logger('AiGenerationGate');

  /** client가 null이면 키가 없는 상태다. 근거가 없는 요청은 그대로 빈 결과이고, 부를 일이 생기면 NOT_CONFIGURED로 끝난다. */
  constructor(private readonly client: ClaudeCitationClient | null) {}

  /** W3: 입구 검사 → 지시 구성 → U1 호출·묶기 → 기계 대조. 다시 부르지 않는다. */
  async generate(request: AiGenerationRequest): Promise<GatedOutput> {
    const startedAt = Date.now();
    const log = emptyLog(request.feature, 'GENERATE');
    try {
      assertGenerationRequest(request);
      const isJd = request.feature === 'JD_SUMMARY';
      const plan = buildCitationRequest(request, planOptions(request));
      if (plan.kind === 'SKIP') return this.finish(log, startedAt, { items: [], droppedCount: 0 });
      const response = await this.callOnce(plan, request.model);
      Object.assign(log, responseFields(response));
      const collected = collectResponseItems(response, request, plan.documents, isJd ? JD_HEADINGS : undefined);
      recordCollected(log, collected);
      ensureItems(collected, response.requestId);
      if (isJd) {
        const checked = checkJdItems(collected.items, request);
        Object.assign(log.dropReasons, checked.dropped);
        const droppedCount = collected.droppedCount + checked.dropped.fact + checked.dropped.role + checked.dropped.outside_heading;
        // "찾지 못함" 서버 안내는 대조·버림 수 대상이 아니고 결과 끝에 붙는다(BR4.7).
        return this.finish(log, startedAt, { items: [...checked.items, ...serverNotices(request)], droppedCount });
      }
      const checker = new ItemChecker(request);
      const items = collected.items.filter((item) => checker.keep(item)).map(withoutJdRole);
      log.dropReasons.fact += checker.factDropped;
      return this.finish(log, startedAt, { items, droppedCount: collected.droppedCount + checker.factDropped });
    } catch (error) {
      this.fail(log, startedAt, error);
      throw error;
    }
  }

  /**
   * W4(QNA): 글 블록이 끝날 때마다 끝난 줄을 U1 규칙으로 항목으로 만들고 대조해 통과한 항목만 하나씩 내보낸다(BR3.8).
   * 출력 상한에서 끝나면 끝나지 않은 마지막 항목은 내보내지 않는다. 거절·예상 밖 중단은 이미 내보낸 항목 뒤에 AiProviderError로 끝난다.
   */
  async *generateStream(request: AiGenerationRequest): AsyncGenerator<GatedItem> {
    const startedAt = Date.now();
    const log = emptyLog(request.feature, 'STREAM');
    let events: AsyncGenerator<ProviderStreamEvent> | null = null;
    try {
      if (request.feature === 'JD_SUMMARY') throw new TypeError('JD_SUMMARY는 generateStream으로 부르지 않습니다.');
      assertGenerationRequest(request);
      const plan = buildCitationRequest(request, planOptions(request));
      if (plan.kind === 'SKIP') {
        this.finish(log, startedAt, { items: [], droppedCount: 0 });
        return;
      }
      const stream = new StreamItems(request, plan, log);
      events = this.requireClient().stream({ model: request.model, system: plan.system, userContent: plan.userContent });
      for (;;) {
        const event = await nextEvent(events);
        if (event === null) break;
        for (const item of stream.accept(event)) yield item;
      }
      for (const item of stream.end()) yield item;
      this.finish(log, startedAt, { items: [], droppedCount: log.droppedCount }, log.itemCount);
    } catch (error) {
      this.fail(log, startedAt, error);
      throw error;
    } finally {
      // 받는 쪽이 중간에 그만두면(연결 끊김 등) 제공자 스트림도 닫는다.
      await events?.return(undefined).catch(() => undefined);
    }
  }

  private requireClient(): ClaudeCitationClient {
    if (this.client === null) throw new AiProviderError('CALL_FAILED', { failure: 'NOT_CONFIGURED' });
    return this.client;
  }

  private async callOnce(plan: CallPlan, model: AiGenerationRequest['model']): Promise<ProviderResponse> {
    const client = this.requireClient();
    try {
      return await client.call({ model, system: plan.system, userContent: plan.userContent });
    } catch (error) {
      throw toCallFailed(error);
    }
  }

  private finish(log: GateLog, startedAt: number, output: GatedOutput, itemCount = output.items.length): GatedOutput {
    log.itemCount = itemCount;
    log.droppedCount = output.droppedCount;
    log.durationMs = Date.now() - startedAt;
    this.logger.log({ event: 'ai_gate_result', ...log });
    return output;
  }

  private fail(log: GateLog, startedAt: number, error: unknown): void {
    log.durationMs = Date.now() - startedAt;
    if (log.requestId === null && error instanceof AiProviderError) log.requestId = error.requestId;
    this.logger.warn({ event: 'ai_gate_failed', feature: log.feature, mode: log.mode, failure: failureName(error),
      itemCount: log.itemCount, droppedCount: log.droppedCount, requestId: log.requestId, durationMs: log.durationMs });
  }
}

/** 기능 지시 뒤에 공통 문구를 붙이고(BR3.2), JD_SUMMARY만 형식 지시를 JD용으로 바꾼다(BR4.1). */
function planOptions(request: AiGenerationRequest) {
  return request.feature === 'JD_SUMMARY'
    ? { formatInstruction: JD_FORMAT_INSTRUCTION, guardInstruction: COMMON_GUARD_INSTRUCTION }
    : { guardInstruction: COMMON_GUARD_INSTRUCTION };
}

/** BASE_SUMMARY·QNA 항목은 역할 칸이 없다(null, BR4.8). */
function withoutJdRole(item: GatedItem): GatedItem {
  return { ...item, jdRole: null };
}

/** BR3.4·BR3.5 항목 판정기. 발행본 글 낱말은 한 번만 뽑는다. */
class ItemChecker {
  factDropped = 0;
  private readonly publication: CheckTokens;

  constructor(private readonly request: AiGenerationRequest) {
    this.publication = publicationTokens(request);
  }

  keep(item: GatedItem): boolean {
    if (passesFactCheck(item, this.request, this.publication)) return true;
    this.factDropped += 1;
    return false;
  }
}

/** 스트림 묶개: 끝난 조각을 모아 끝난 줄만 판정한다. 조각의 인용은 그 조각의 첫 글자 줄에 붙으므로 끝난 줄에 늦게 붙지 않는다. */
class StreamItems {
  private readonly fragments: ResponseFragment[] = [];
  private readonly checker: ItemChecker;
  private readonly counts: ResponseItems = { items: [], droppedCount: 0, nonItemLineCount: 0, truncatedCount: 0, unlocatedCount: 0 };
  private judgedLines = 0;
  private modelItems = 0;
  private endResponse: Omit<ProviderResponse, 'fragments'> | null = null;

  constructor(private readonly request: AiGenerationRequest, private readonly plan: CallPlan, private readonly log: GateLog) {
    this.checker = new ItemChecker(request);
  }

  accept(event: ProviderStreamEvent): GatedItem[] {
    if (event.kind === 'END') {
      this.endResponse = event.response;
      return [];
    }
    this.fragments.push(event.fragment);
    const lines = joinResponseLines({ fragments: this.fragments });
    const ready: GatedItem[] = [];
    // 마지막 줄은 다음 조각에서 이어질 수 있어 아직 판정하지 않는다.
    for (; this.judgedLines < lines.length - 1; this.judgedLines += 1) {
      this.judge(readResponseLine(lines[this.judgedLines], false, this.request, this.plan.documents), ready);
    }
    return ready;
  }

  /** 응답 끝: 중단 이유를 보고 마지막 줄을 판정한다. 모델이 낸 항목이 0개면 NO_ITEMS(U1 BR5.3). */
  end(): GatedItem[] {
    const response = this.endResponse;
    if (response === null) throw new AiProviderError('CALL_FAILED', { failure: 'INVALID_RESPONSE' });
    Object.assign(this.log, responseFields({ ...response, fragments: [] }));
    assertUsableStop({ ...response, fragments: this.fragments });
    const lines = joinResponseLines({ fragments: this.fragments });
    const ready: GatedItem[] = [];
    for (; this.judgedLines < lines.length; this.judgedLines += 1) {
      const isLast = this.judgedLines === lines.length - 1;
      this.judge(readResponseLine(lines[this.judgedLines], isLast && response.stopReason === 'MAX_TOKENS', this.request,
        this.plan.documents), ready);
    }
    if (this.modelItems === 0) throw new AiProviderError('NO_ITEMS', { requestId: response.requestId });
    return ready;
  }

  private judge(reading: LineReading, ready: GatedItem[]): void {
    addReading(this.counts, reading);
    if (reading.kind === 'ITEM') {
      this.counts.items.length = 0; // 낸 항목은 쥐고 있지 않는다(NFR4.5)
      this.modelItems += 1;
      if (this.checker.keep(reading.item)) {
        this.log.itemCount += 1;
        ready.push(withoutJdRole(reading.item));
      }
    }
    this.log.dropReasons.fact = this.checker.factDropped;
    recordCollected(this.log, this.counts);
  }
}

/** 스트림의 다음 사건. 제공자·전송 오류는 AiProviderError로 바꾼다. 끝이면 null. */
async function nextEvent(events: AsyncGenerator<ProviderStreamEvent>): Promise<ProviderStreamEvent | null> {
  try {
    const next = await events.next();
    return next.done ? null : next.value;
  } catch (error) {
    throw toCallFailed(error);
  }
}

function emptyLog(feature: AiGenerationRequest['feature'], mode: GateLog['mode']): GateLog {
  return {
    feature, mode, itemCount: 0, droppedCount: 0,
    dropReasons: { truncated: 0, location: 0, fact: 0, role: 0, outside_heading: 0 },
    nonItemLineCount: 0, stopReason: null, inputTokens: null, outputTokens: null, durationMs: 0, requestId: null,
  };
}

function responseFields(response: ProviderResponse): Partial<GateLog> {
  return { stopReason: response.rawStopReason, inputTokens: response.inputTokens, outputTokens: response.outputTokens, requestId: response.requestId };
}

function recordCollected(log: GateLog, collected: ResponseItems): void {
  log.nonItemLineCount = collected.nonItemLineCount;
  log.dropReasons.truncated = collected.truncatedCount;
  log.dropReasons.location = collected.unlocatedCount;
  log.droppedCount = collected.droppedCount + log.dropReasons.fact + log.dropReasons.role + log.dropReasons.outside_heading;
}

function failureName(error: unknown): string {
  if (error instanceof AiInputTooLarge) return 'INPUT_TOO_LARGE';
  if (error instanceof AiProviderError) return describeFailure(error);
  if (error instanceof TypeError) return 'INVALID_REQUEST';
  return 'UNEXPECTED_ERROR';
}

/** 키를 받아 U2 게이트를 만든다. 키가 비었으면 부를 때마다 NOT_CONFIGURED로 끝나는 게이트(api 기동은 막지 않는다). */
export function createCheckedAiGenerationGate(config: AiGenerationGateConfig): CheckedAiGenerationGate {
  const hasKey = typeof config.apiKey === 'string' && config.apiKey.trim() !== '';
  return new CheckedAiGenerationGate(hasKey ? createCitationClient(config) : null);
}
