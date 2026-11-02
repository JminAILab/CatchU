// 질문 다시 쓰기 QuestionRewriter(기능 설계 W2·BR1.3·BR4.1, security-design NFR2.2~NFR2.4).
// U5 모듈 안의 인터페이스다. 게이트(C-01)와 U1·U2 내부 클라이언트(ClaudeCitationClient)는 쓰지도 고치지도 않고,
// 같은 키(CATCHU_GENERATION_API_KEY)와 같은 SDK·지키는 fetch·모델 상수만 함께 쓴다. 출력은 화면에 보이지 않고 검색어·userText로만 쓰인다.
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_API_BASE_URL, CLAUDE_MODEL_IDS, INFERENCE_GEO, THINKING_OFF } from '../ai-generation/claude-citation-client';
import { createGuardedFetch, type FetchLike, GuardedFetchError } from '../ai-generation/guarded-fetch';
import type { HistoryMessage } from './question-input';
import { QNA_MODEL, QUESTION_MAX_LENGTH, REWRITE_INSTRUCTION, REWRITE_MAX_TOKENS, REWRITE_TIMEOUT_MS } from './rag-answer-config';

/** Nest 주입 토큰. 시험은 이 자리에 합성 구현을 넣는다(security-design NFR2.3). */
export const QUESTION_REWRITER = Symbol('QUESTION_REWRITER');

export interface RewriteInput {
  /** BR1.2로 줄인 앞 대화(1개 이상). 신뢰하지 않는 자료다. */
  history: HistoryMessage[];
  question: string;
}

export interface RewriteResult {
  /** 앞뒤 공백을 떼고 앞 500자만 남긴 한 문장(BR4.1). 비지 않는다. */
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface QuestionRewriter {
  rewrite(input: RewriteInput): Promise<RewriteResult>;
}

export type QuestionRewriteFailure =
  | 'NOT_CONFIGURED' | 'TIMEOUT' | 'CONNECTION_FAILED' | 'API_STATUS' | 'REDIRECT_REJECTED' | 'RESPONSE_TOO_LARGE'
  | 'EMPTY_RESPONSE' | 'UNKNOWN';

/** 다시 쓰기의 모든 실패를 하나로 묶는다(W2 3단계). 메시지에는 종류만 넣고 질문·앞 대화·제공자 원문을 넣지 않는다. */
export class QuestionRewriteFailed extends Error {
  override readonly name = 'QuestionRewriteFailed';

  constructor(readonly failure: QuestionRewriteFailure, readonly status: number | null = null) {
    super(`질문 다시 쓰기에 실패했습니다(${failure}).`);
  }
}

export interface QuestionRewriterConfig {
  /** 만들기 함수를 부르는 쪽이 CATCHU_GENERATION_API_KEY에서 읽어 넘긴다. 비면 SDK 클라이언트를 만들지 않는다. */
  apiKey: string | undefined | null;
  /** 실제 전송에 쓸 fetch(기본 전역 fetch). 무엇을 넘겨도 지키는 fetch로 감싼다. */
  fetch?: FetchLike;
  /** 시간 제한(밀리초). 기본 10초. 시험만 짧게 넘긴다. */
  timeoutMs?: number;
}

/** 사용자 글의 &·<·>를 바꿔 꼬리표 경계(</conversation> 등)를 넘지 못하게 한다. &를 먼저 바꾼다. */
export function escapeTagText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 앞 대화와 질문을 꼬리표 자료로 담은 user 메시지(NFR2.4). 지시는 system에만 두고, 사용자 글은 escapeTagText로 감싼다. */
export function buildRewriteUserText(input: RewriteInput): string {
  const lines = input.history.map((message) => `<message role="${message.role}">${escapeTagText(message.text)}</message>`);
  return ['<conversation>', ...lines, '</conversation>', `<question>${escapeTagText(input.question)}</question>`].join('\n');
}

/** 결과 앞뒤 공백을 떼고 앞 500자만 쓴다. 비면 실패다(BR4.1). */
export function normalizeRewrite(text: string): string {
  const trimmed = text.trim().slice(0, QUESTION_MAX_LENGTH).trim();
  if (trimmed.length === 0) throw new QuestionRewriteFailed('EMPTY_RESPONSE');
  return trimmed;
}

class NotConfiguredQuestionRewriter implements QuestionRewriter {
  async rewrite(): Promise<RewriteResult> {
    throw new QuestionRewriteFailed('NOT_CONFIGURED');
  }
}

class ClaudeQuestionRewriter implements QuestionRewriter {
  constructor(private readonly client: Anthropic) {}

  /** 한 번만 부른다. 다시 시도하지 않는다(BR4.1). 인용 기능은 쓰지 않는다. */
  async rewrite(input: RewriteInput): Promise<RewriteResult> {
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create({
        model: CLAUDE_MODEL_IDS[QNA_MODEL],
        max_tokens: REWRITE_MAX_TOKENS,
        thinking: THINKING_OFF[QNA_MODEL],
        inference_geo: INFERENCE_GEO,
        system: REWRITE_INSTRUCTION,
        messages: [{ role: 'user', content: buildRewriteUserText(input) }],
      });
    } catch (error) {
      throw toRewriteFailed(error);
    }
    const blocks = Array.isArray(message?.content) ? message.content : [];
    const text = blocks.map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('');
    return {
      text: normalizeRewrite(text),
      inputTokens: numberOrNull(message?.usage?.input_tokens),
      outputTokens: numberOrNull(message?.usage?.output_tokens),
    };
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

/** SDK·전송 오류를 원문 메시지 없이 종류 하나로 바꾼다(NFR2.2). */
export function toRewriteFailed(error: unknown): QuestionRewriteFailed {
  if (error instanceof QuestionRewriteFailed) return error;
  const guarded = findGuardedFetchError(error);
  if (guarded !== null) return new QuestionRewriteFailed(guarded.failure);
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new QuestionRewriteFailed('TIMEOUT');
  if (error instanceof Anthropic.APIConnectionError) return new QuestionRewriteFailed('CONNECTION_FAILED');
  if (error instanceof Anthropic.APIError) return new QuestionRewriteFailed('API_STATUS', error.status ?? null);
  return new QuestionRewriteFailed('UNKNOWN');
}

/**
 * 키를 받아 다시 쓰기 구현을 만든다(NFR2.3). 키가 비면 클라이언트를 만들지 않고 부를 때마다 NOT_CONFIGURED로 끝난다(기동은 막지 않는다).
 * 주소는 코드 상수로 고정하고(환경변수로 바뀌지 않게), 재시도 0·10초·지키는 fetch(redirect 거부·응답 256 KiB 상한)로 부른다.
 */
export function createQuestionRewriter(config: QuestionRewriterConfig): QuestionRewriter {
  if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') return new NotConfiguredQuestionRewriter();
  const timeoutMs = config.timeoutMs ?? REWRITE_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('질문 다시 쓰기 시간 제한은 1 이상의 정수(밀리초)여야 합니다.');
  return new ClaudeQuestionRewriter(new Anthropic({
    apiKey: config.apiKey, // 키를 늘 명시해 SDK가 환경변수에서 키를 스스로 읽지 않게 한다.
    authToken: null,
    baseURL: CLAUDE_API_BASE_URL,
    maxRetries: 0,
    timeout: timeoutMs,
    fetch: createGuardedFetch(config.fetch ?? globalThis.fetch),
    logLevel: 'warn', // 요청·응답 본문이 SDK 로그에 남지 않게 고정한다.
  }));
}

/**
 * 시험·평가 스크립트 전용 합성 구현. 마지막 사용자 질문과 이번 질문을 이은 결정적 문장을 돌려준다. 앱 모듈에는 넣지 않는다.
 */
export function createSyntheticQuestionRewriter(): QuestionRewriter {
  return {
    async rewrite(input) {
      const lastUser = [...input.history].reverse().find((message) => message.role === 'USER');
      const text = normalizeRewrite([lastUser?.text ?? '', input.question].filter((part) => part.trim() !== '').join(' / '));
      return { text, inputTokens: null, outputTokens: null };
    },
  };
}
