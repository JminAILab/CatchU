// 발행본 로그(U4 관측 설계 「로그 줄」, NFR6.2·NFR6.3·NFR6.5·NFR6.6, BR10.2).
// Nest Logger('Publications')로 사건마다 객체 한 줄을 남긴다. 토큰·grant·비밀번호·제목·본문·SQL·stack은 어떤 줄에도 넣지 않는다.
import { Injectable, Logger } from '@nestjs/common';
import type { EnqueueResult } from '../ai-run/ai-run';
import type { AiRunKind } from '../ai-run/ai-run-spec';

/**
 * 결과 분류. 값 표기는 **임시**이며(NFR6.3) 항목 범위(발행 성공·실패, 작업 등록 결과, 접두어 삭제 실패)는 관측 설계 그대로다.
 * 작업 등록 실패(응답 201)와 접두어 삭제 실패(응답 500)는 다른 분류다(NFR6.5).
 */
export type PublicationLogEvent = 'PUBLISH_SUCCEEDED' | 'PUBLISH_FAILED' | 'ENQUEUE_RESULT' | 'PREFIX_DELETE_FAILED';

/** 로그 한 줄의 칸. 이름은 **임시**다(NFR6.3). 해당 없는 칸은 null로 둬 줄마다 같은 모양을 유지한다. */
export interface PublicationLogEntry {
  event: PublicationLogEvent;
  publicationId: string | null;
  memberId: string | null;
  errorCode: string | null;
  jobKind: AiRunKind | null;
  enqueue: EnqueueResult | null;
}

@Injectable()
export class PublicationsLog {
  private readonly logger = new Logger('Publications');

  publishSucceeded(publicationId: string, memberId: string): void {
    this.logger.log(entry({ event: 'PUBLISH_SUCCEEDED', publicationId, memberId }));
  }

  /** 발행본 ID는 롤백돼 없다. 오류 코드는 응답 코드(4xx 업무 코드 또는 INTERNAL_ERROR)다. */
  publishFailed(memberId: string | null, errorCode: string): void {
    this.logger.warn(entry({ event: 'PUBLISH_FAILED', memberId, errorCode }));
  }

  enqueueResult(publicationId: string, jobKind: AiRunKind, enqueue: EnqueueResult): void {
    const line = entry({ event: 'ENQUEUE_RESULT', publicationId, jobKind, enqueue });
    if (enqueue === 'ENQUEUED') this.logger.log(line);
    else this.logger.warn(line);
  }

  prefixDeleteFailed(publicationId: string, memberId: string): void {
    this.logger.error(entry({ event: 'PREFIX_DELETE_FAILED', publicationId, memberId, errorCode: 'INTERNAL_ERROR' }));
  }
}

function entry(values: Partial<PublicationLogEntry> & { event: PublicationLogEvent }): PublicationLogEntry {
  return { publicationId: null, memberId: null, errorCode: null, jobKind: null, enqueue: null, ...values };
}
