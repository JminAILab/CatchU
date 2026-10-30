// 받은 사람 질의응답 `POST /v1/public/links/:token/questions`(계약 C-12, 기능 설계 W1, BR1·BR2·BR3·BR4,
// performance-design NFR4.1·NFR4.3, security-design NFR1.1·NFR1.4, observability-design NFR6.1).
// 검증·링크·색인·횟수 확인은 스트림을 열기 전에 HTTP 오류로 답하고(공통 예외 필터), 모두 통과해야 SSE를 연다(BR2.3).
// 큐에 넣지 않고 이 요청 안에서 처리한다. 질문·앞 대화·답·링크 토큰·grant는 로그에 남기지 않는다(BR1.4).
import type { ServerResponse } from 'node:http';
import { Body, Controller, Headers, Inject, Param, Post, Res } from '@nestjs/common';
import { AI_GENERATION_GATE } from '../ai-generation/ai-generation.module';
import type { AiGenerationGate, GatedItem } from '../ai-generation/ai-generation.types';
import { errorName } from '../ai-run/ai-run-spec';
import { Public } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import type { PublicationAccess } from '../publications/publication-access';
import { PUBLISHED_SEARCH } from '../published-index/published-index.module';
import type { PublishedSearch } from '../published-index/published-search';
import { recipientAccessCode, rethrowAccessError } from './link-access-errors';
import { answerQuestion, type QnaRunResult } from './qna-service';
import { QUESTION_COUNTER, type QuestionCounter } from './question-counter';
import { parseQuestionInput, type QuestionInput } from './question-input';
import { QUESTION_REWRITER, type QuestionRewriter } from './question-rewriter';
import { type QnaCompleted, type QnaRejectOutcome, writeRagAnswerLog } from './rag-answer-log';
import { PUBLICATION_ACCESS, RAG_ANSWER_OPTIONS, type RagAnswerOptions } from './rag-answer-tokens';

/** SSE 응답 머리(NFR4.3). 공통 no-store 대신 no-cache를 쓴다. */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
} as const;

/** SSE 덩어리 하나. data는 JSON 한 줄이라 줄바꿈이 섞이지 않는다. */
export function sseEvent(event: 'item' | 'done' | 'error', data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const SSE_KEEP_ALIVE_COMMENT = ': keep-alive\n\n';

/** qna.completed 한 줄. 결과의 칸만 옮기고 글은 없다(observability-design NFR6.1). */
function completedEntry(publicationId: string, result: QnaRunResult): QnaCompleted {
  return {
    event: 'qna.completed', publicationId, stage: result.stage, outcome: result.outcome, failure: result.failure,
    rewritten: result.rewritten, rewriteMs: result.rewriteMs, rewriteInputTokens: result.rewriteInputTokens,
    rewriteOutputTokens: result.rewriteOutputTokens, searchMs: result.searchMs, chunkCount: result.chunkCount,
    generateMs: result.generateMs, itemCount: result.itemCount,
  };
}

@Controller('public/links')
export class QnaController {
  constructor(
    @Inject(PUBLICATION_ACCESS) private readonly access: PublicationAccess,
    @Inject(PUBLISHED_SEARCH) private readonly search: PublishedSearch,
    @Inject(QUESTION_COUNTER) private readonly counter: QuestionCounter,
    @Inject(QUESTION_REWRITER) private readonly rewriter: QuestionRewriter,
    @Inject(AI_GENERATION_GATE) private readonly gate: AiGenerationGate,
    @Inject(RAG_ANSWER_OPTIONS) private readonly options: RagAnswerOptions,
  ) {}

  @Public()
  @Post(':token/questions')
  async ask(
    @Param('token') token: string,
    @Headers('x-link-grant') grant: string | undefined,
    @Body() body: unknown,
    @Res() response: ServerResponse,
  ): Promise<void> {
    const { input, publicationId } = await this.admit(token, grant, body);
    await this.stream(response, publicationId, input);
  }

  /** 스트림 전 확인 넷(BR1.1·BR1.2 → BR2.1 → BR2.2 → BR3.1). 하나라도 거부면 ApiError를 던지고 횟수는 마지막에만 센다. */
  private async admit(token: string, grant: string | undefined, body: unknown): Promise<{ input: QuestionInput; publicationId: string }> {
    let input: QuestionInput;
    try {
      input = parseQuestionInput(body);
    } catch (error) {
      this.rejected('VALIDATION_FAILED', null);
      throw error;
    }
    const now = this.options.clock();
    let publicationId: string;
    try {
      ({ publicationId } = await this.access.resolveForRecipient(token, typeof grant === 'string' && grant !== '' ? grant : null, now));
    } catch (error) {
      const code = recipientAccessCode(error);
      if (code === 'LINK_UNAVAILABLE' || code === 'LINK_PASSWORD_REQUIRED') this.rejected(code, null);
      rethrowAccessError(error, recipientAccessCode);
    }
    if (await this.search.getIndexState(publicationId, now) !== 'DONE') {
      this.rejected('INDEX_NOT_READY', publicationId);
      throw new ApiError('INDEX_NOT_READY');
    }
    if ((await this.counter.count(publicationId, now)).decision === 'LIMIT_REACHED') {
      this.rejected('QUESTION_LIMIT_REACHED', publicationId);
      throw new ApiError('QUESTION_LIMIT_REACHED');
    }
    return { input, publicationId };
  }

  /**
   * 200 text/event-stream을 열고 항목마다 바로 쓴다(NFR4.1). keep-alive 타이머는 응답 close와 finally 두 곳에서 지운다.
   * 응답 close가 끝나기 전에 오면 받은 사람이 끊은 것이라 끊김 깃발을 세운다(BR4.8). 이미 센 횟수는 돌려주지 않는다.
   */
  private async stream(response: ServerResponse, publicationId: string, input: QuestionInput): Promise<void> {
    let aborted = false;
    const write = (chunk: string): void => {
      if (!aborted && !response.writableEnded && !response.destroyed) response.write(chunk);
    };
    response.writeHead(200, SSE_HEADERS);
    response.flushHeaders();
    const keepAlive = setInterval(() => write(SSE_KEEP_ALIVE_COMMENT), this.options.keepAliveMs);
    response.on('close', () => {
      clearInterval(keepAlive);
      if (!response.writableFinished) aborted = true;
    });
    let result: QnaRunResult | null = null;
    try {
      result = await answerQuestion({ rewriter: this.rewriter, search: this.search, gate: this.gate }, {
        publicationId, question: input.question, history: input.history,
        isAborted: () => aborted,
        onItem: (item: GatedItem) => write(sseEvent('item', item)),
      });
      if (result.outcome === 'OK') write(sseEvent('done', {}));
      else if (result.errorCode !== null) write(sseEvent('error', { code: result.errorCode }));
    } catch (error) {
      // 머리를 보낸 뒤라 HTTP 오류로 바꿀 수 없다. SSE error로 알리고 오류 이름만 남긴 뒤 아래 finally에서 닫는다(수정 요청 R-03).
      write(sseEvent('error', { code: 'ANSWER_FAILED' }));
      writeRagAnswerLog(this.options.logger, { event: 'qna.stream-failed', publicationId, error: errorName(error) });
    } finally {
      clearInterval(keepAlive);
      if (!response.writableEnded) response.end();
      if (result !== null) writeRagAnswerLog(this.options.logger, completedEntry(publicationId, result));
    }
  }

  private rejected(outcome: QnaRejectOutcome, publicationId: string | null): void {
    writeRagAnswerLog(this.options.logger, { event: 'qna.rejected', outcome, publicationId });
  }
}
