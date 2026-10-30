// 기본 요약 읽기와 [다시 만들기](계약 C-12·C-11 owner-summary, 기능 설계 W4~W6, BR6·BR7,
// security-design NFR1.1·NFR1.2, reliability-design NFR5.4, observability-design NFR6.2).
// 받은 사람 경로는 링크 판정을 통과한 뒤에만 요약을 읽는다. 작성자 경로는 전역 회원 인증 Guard를 거친 회원 ID로
// resolveForOwner를 먼저 부르고, 남의 발행본·없는 발행본은 같은 404다. 동의는 다시 확인하지 않는다(BR7.5).
import { randomUUID } from 'node:crypto';
import { Controller, Get, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { GatedItem } from '../ai-generation/ai-generation.types';
import { AiRun } from '../ai-run/ai-run';
import type { RunStatus } from '../ai-run/ai-run-spec';
import { CurrentMemberId, Public } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { DailyRunLimit } from '../daily-run-limit/daily-run-limit';
import type { PublicationAccess } from '../publications/publication-access';
import { markRegenerating, readSummaryView, type SummaryView } from './base-summary-store';
import {
  assertPublicationId, type ErrorCodeOf, ownerAccessCode, recipientAccessCode, rethrowAccessError,
} from './link-access-errors';
import { writeRagAnswerLog } from './rag-answer-log';
import { PUBLICATION_ACCESS, RAG_ANSWER_OPTIONS, type RagAnswerOptions } from './rag-answer-tokens';

export interface RecipientSummaryResponse {
  status: RunStatus;
  items: GatedItem[];
}

export interface OwnerSummaryResponse extends RecipientSummaryResponse {
  canRegenerate: boolean;
}

@Controller()
export class SummaryController {
  constructor(
    @Inject(PUBLICATION_ACCESS) private readonly access: PublicationAccess,
    private readonly dataSource: DataSource,
    private readonly dailyRunLimit: DailyRunLimit,
    private readonly aiRun: AiRun,
    @Inject(RAG_ANSWER_OPTIONS) private readonly options: RagAnswerOptions,
  ) {}

  /** W4: 링크 판정(404·401) → 시한 판정 읽기 → DONE만 항목(BR6.1~BR6.3). 로그인 여부는 보지 않는다. */
  @Public()
  @Get('public/links/:token/summary')
  async recipientSummary(
    @Param('token') token: string, @Headers('x-link-grant') grant: string | undefined,
  ): Promise<RecipientSummaryResponse> {
    const now = this.options.clock();
    let publicationId: string;
    try {
      ({ publicationId } = await this.access.resolveForRecipient(token, typeof grant === 'string' && grant !== '' ? grant : null, now));
    } catch (error) {
      rethrowAccessError(error, recipientAccessCode);
    }
    const view = await this.view(publicationId, now, recipientAccessCode);
    return { status: view.status, items: view.items };
  }

  /** W5: 작성자는 링크 중지·만료 뒤에도 본다. canRegenerate = status != PENDING(BR6.4). */
  @Get('publications/:publicationId/summary')
  async ownerSummary(
    @CurrentMemberId() memberId: string, @Param('publicationId') publicationId: string,
  ): Promise<OwnerSummaryResponse> {
    await this.resolveOwner(memberId, publicationId);
    const view = await this.view(publicationId, this.options.clock(), ownerAccessCode);
    return { status: view.status, items: view.items, canRegenerate: view.status !== 'PENDING' };
  }

  /**
   * W6: 작성자 확인 → 한 트랜잭션(하루 횟수 소비 + 행 PENDING) → 커밋 뒤 새 runKey로 등록 → 202(BR7.1~BR7.4).
   * 202는 접수다. 등록이 실패해도 202이고 경고 로그만 남긴다(상태는 시한으로 FAILED, BR7.3).
   */
  @Post('publications/:publicationId/summary/regenerate')
  @HttpCode(202)
  async regenerate(
    @CurrentMemberId() memberId: string, @Param('publicationId') publicationId: string,
  ): Promise<Record<string, never>> {
    await this.resolveOwner(memberId, publicationId);
    const now = this.options.clock();
    await this.dataSource.transaction(async (manager) => {
      if (await this.dailyRunLimit.consume(memberId, 'BASE_SUMMARY', now, manager) === 'LIMIT_REACHED') {
        throw new ApiError('DAILY_LIMIT_REACHED'); // 트랜잭션을 되돌리고 행은 그대로 둔다
      }
      await markRegenerating(manager, publicationId, now);
    });
    const enqueue = await this.aiRun.enqueueAfterCommit('BASE_SUMMARY', `BASE_SUMMARY-${publicationId}-${randomUUID()}`, { publicationId });
    writeRagAnswerLog(this.options.logger, { event: 'base-summary.regenerate-accepted', publicationId, enqueue });
    return {};
  }

  private async resolveOwner(memberId: string, publicationId: string): Promise<void> {
    assertPublicationId(publicationId);
    try {
      await this.access.resolveForOwner(memberId, publicationId);
    } catch (error) {
      rethrowAccessError(error, ownerAccessCode);
    }
  }

  /** 행이 없을 때만 사본의 발행 시각을 읽는다. 그사이 발행본이 지워졌으면 그 경로의 404로 바꾼다. */
  private view(publicationId: string, now: Date, codeOf: ErrorCodeOf): Promise<SummaryView> {
    return readSummaryView(this.dataSource.manager, publicationId, now, async () => {
      try {
        return (await this.access.readSnapshot(publicationId)).publishedAt;
      } catch (error) {
        rethrowAccessError(error, codeOf);
      }
    });
  }
}
