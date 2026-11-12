// PDF 글 추출 요청 발송(계약 C-16 `PdfExtract`, U8 기능 명세 W1-A 6단계, 업무 규칙 BR2.4, 신뢰성 설계 §6, 관측 설계 §1).
// 큐는 10월과 같은 Redis(CATCHU_QUEUE_REDIS_URL·CATCHU_QUEUE_PREFIX)의 `pdf-extraction-requests`다. 큐 주소가 없으면 연결하지 않고
// 발송은 QUEUE_NOT_CONFIGURED로 끝나며, 자료는 시한 판정(BR2.2)으로 FAILED가 된다(새 환경변수를 두지 않는다. AiRun과 같은 규칙).
import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { errorName } from '../ai-run/ai-run-spec';
import type { AnalysisQueueConfig } from '../analysis-queue/analysis-queue.config';
import { watchRedisErrors } from '../common/redis-connection-errors';
import {
  PDF_EXTRACT_CLOSE_TIMEOUT_MS, PDF_EXTRACT_ENQUEUE_TIMEOUT_MS, PDF_EXTRACT_JOB_NAME, PDF_EXTRACTION_REQUEST_QUEUE,
  isValidPdfExtractMessage, pdfExtractJobOptions, type PdfExtractMessage,
} from './pdf-extraction-spec';

/** 발송기 주입 토큰. 시험은 이 토큰의 인스턴스를 가짜로 바꿔 끼운다. */
export const PDF_EXTRACT_DISPATCHER = Symbol('PDF_EXTRACT_DISPATCHER');
/** 큐 설정(`readAnalysisQueueConfig()` 결과 또는 null) 주입 토큰. */
export const PDF_EXTRACT_QUEUE_CONFIG = Symbol('PDF_EXTRACT_QUEUE_CONFIG');

export type PdfExtractDispatchResult = { outcome: 'ENQUEUED' } | { outcome: 'ENQUEUE_FAILED'; error: string };

/** 업로드 커밋 뒤 추출 요청을 보낸다. 예외를 던지지 않고 결과로 알리며, 실패해도 호출자의 201 응답은 바뀌지 않는다(BR2.4). */
export interface PdfExtractDispatcher {
  dispatchAfterCommit(message: PdfExtractMessage): Promise<PdfExtractDispatchResult>;
}

@Injectable()
export class QueuePdfExtractDispatcher implements PdfExtractDispatcher, OnApplicationShutdown {
  private readonly logger = new Logger('PdfExtractDispatcher');
  private connection: IORedis | null = null;
  private queue: Queue | null = null;
  private closing: Promise<void> | null = null;

  constructor(@Inject(PDF_EXTRACT_QUEUE_CONFIG) private readonly config: AnalysisQueueConfig | null) {}

  /**
   * 반드시 DB 커밋 뒤에 부른다. 작업 ID = pdfMaterialId라 큐에 남아 있는 동안 같은 자료의 두 번째 등록은 무시되고 ENQUEUED다.
   * 실패 이유는 오류 이름만 돌려주고(payload·키 없음) 로그는 호출자(업로드)가 `PDF_EXTRACT_ENQUEUE_FAILED`로 남긴다.
   */
  async dispatchAfterCommit(message: PdfExtractMessage): Promise<PdfExtractDispatchResult> {
    if (!isValidPdfExtractMessage(message)) return { outcome: 'ENQUEUE_FAILED', error: 'INVALID_MESSAGE' };
    const queue = this.openQueue();
    if (queue === null) return { outcome: 'ENQUEUE_FAILED', error: 'QUEUE_NOT_CONFIGURED' };
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('enqueue timeout'), { name: 'EnqueueTimeout' })), PDF_EXTRACT_ENQUEUE_TIMEOUT_MS);
      });
      await Promise.race([queue.add(PDF_EXTRACT_JOB_NAME, message, pdfExtractJobOptions(message.pdfMaterialId)), timeout]);
      return { outcome: 'ENQUEUED' };
    } catch (error) {
      return { outcome: 'ENQUEUE_FAILED', error: errorName(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  /** 큐와 연결을 닫는다. 여러 번 불러도 한 번만 닫는다. */
  close(): Promise<void> {
    this.closing ??= this.closeAll();
    return this.closing;
  }

  private openQueue(): Queue | null {
    if (this.config === null || this.closing !== null) return null;
    if (this.queue === null) {
      // 끊긴 동안 명령을 쌓지 않고 바로 실패시킨다(등록 실패 → 시한으로 FAILED). 주소는 비밀값이라 로그에 내지 않는다.
      this.connection = watchRedisErrors(new IORedis(this.config.redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 1 }),
        (error) => this.logger.warn({ event: 'pdf_extract_connection_error', error: errorName(error) }));
      this.queue = new Queue(PDF_EXTRACTION_REQUEST_QUEUE, { connection: this.connection, prefix: this.config.prefix });
      this.queue.on('error', (error: Error) => this.logger.warn({ event: 'pdf_extract_queue_error', error: errorName(error) }));
    }
    return this.queue;
  }

  private async closeAll(): Promise<void> {
    try {
      if (this.queue) {
        let timer: NodeJS.Timeout | undefined;
        const finished = await Promise.race([
          this.queue.close().then(() => true, (error: unknown) => {
            this.logger.warn({ event: 'pdf_extract_close_error', error: errorName(error) });
            return true;
          }),
          new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), PDF_EXTRACT_CLOSE_TIMEOUT_MS); }),
        ]);
        clearTimeout(timer);
        if (!finished) this.logger.error({ event: 'pdf_extract_close_timeout' });
      }
    } finally {
      if (this.connection && this.connection.status !== 'end') this.connection.disconnect();
    }
  }
}
