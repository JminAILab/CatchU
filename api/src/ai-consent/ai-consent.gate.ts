// 첫 이용 동의(계약 C-04 AiConsentGate, U2 기능 설계 W2·BR2.1~BR2.3, 비기능 NFR2.4).
// 소비 Unit 처리 순서: require → DailyRunLimit.consume → 상태 행 커밋 → AiRun.enqueueAfterCommit.
// 동의가 없으면 require가 403 AI_CONSENT_REQUIRED로 끝내므로 하루 횟수를 쓰지 않는다(BR2.2).
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from '../common/errors';

/**
 * 현재 고지 판본. 동의 창 문구(web `src/components/ai-consent/ai-consent-notice.ts`의 같은 이름 상수)를 바꾸면
 * 두 값을 함께 올린다. 올리면 모든 회원이 다시 동의한다(BR2.1).
 */
export const AI_NOTICE_VERSION = '2026-11-v1';

/** 동의 없음(C-04 AiConsentRequired). 그대로 던지면 공통 필터가 403 AI_CONSENT_REQUIRED로 응답한다. */
export class AiConsentRequired extends ApiError {
  constructor() {
    super('AI_CONSENT_REQUIRED');
  }
}

const RECORD_SQL = `INSERT INTO ai_consent (consent_id, member_id, notice_version, consented_at)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (member_id, notice_version) DO NOTHING`;

@Injectable()
export class AiConsentGate {
  constructor(private readonly dataSource: DataSource) {}

  /** 현재 판본 기준 동의 여부(BR2.1). */
  async hasConsented(memberId: string): Promise<boolean> {
    const rows: unknown = await this.dataSource.query(
      'SELECT 1 FROM ai_consent WHERE member_id = $1 AND notice_version = $2', [memberId, AI_NOTICE_VERSION]);
    return Array.isArray(rows) && rows.length > 0;
  }

  /** 동의가 없으면 AiConsentRequired(403). 실행 접수에서 하루 횟수보다 먼저 부른다(BR2.2). */
  async require(memberId: string): Promise<void> {
    if (!(await this.hasConsented(memberId))) throw new AiConsentRequired();
  }

  /**
   * 현재 판본만 기록한다. 이미 있으면 새로 만들지 않고 성공이다(BR2.3).
   * 판본이 다르면 400 VALIDATION_FAILED로 끝내고 기록하지 않는다.
   */
  async record(memberId: string, noticeVersion: string, now: Date): Promise<void> {
    if (noticeVersion !== AI_NOTICE_VERSION) {
      throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'noticeVersion', reason: 'currentNoticeVersion' }] } });
    }
    await this.dataSource.query(RECORD_SQL, [randomUUID(), memberId, noticeVersion, now]);
  }
}
