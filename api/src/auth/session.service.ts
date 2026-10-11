import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { MemberAccount } from '../member-analysis/member-analysis.entity';
import { AccessTokenService } from './access-token.service';
import { SESSION_CLOCK, SESSION_IDLE_MS, SESSION_MAX_MS } from './session.config';
import { AuthSession, SessionRefreshToken } from './session.entity';

export const refreshHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const validRefresh = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

@Injectable()
export class SessionService {
  constructor(private readonly dataSource: DataSource, private readonly tokens: AccessTokenService,
    @Inject(SESSION_CLOCK) private readonly clock: () => number) {}

  private active(session: AuthSession, now: number) {
    return session.revokedAt === null && now < session.expiresAt.getTime() &&
      now < session.lastRefreshedAt.getTime() + SESSION_IDLE_MS;
  }

  private async issue(manager: EntityManager, session: AuthSession, now: number) {
    const refreshToken = randomBytes(32).toString('base64url');
    await manager.insert(SessionRefreshToken, Object.assign(new SessionRefreshToken(), {
      sessionId: session.sessionId, tokenHash: refreshHash(refreshToken), createdAt: new Date(now),
    }));
    const access = await this.tokens.issue(session.memberId, session.sessionId);
    return { access, refreshToken,
      cookieExpiresAt: new Date(Math.min(session.expiresAt.getTime(), now + SESSION_IDLE_MS)) };
  }

  /** 호출자의 회원 연결과 같은 manager로 저장. 호출자는 커밋 성공 후에만 응답한다. */
  async create(manager: EntityManager, memberId: string) {
    const account = await manager.findOneBy(MemberAccount, { memberId });
    if (!account || account.accountState !== 'ACTIVE') throw new ApiError('AUTH_INVALID');
    const now = this.clock();
    const session = Object.assign(new AuthSession(), { memberId, createdAt: new Date(now),
      lastRefreshedAt: new Date(now), expiresAt: new Date(now + SESSION_MAX_MS) });
    await manager.insert(AuthSession, session);
    return this.issue(manager, session, now);
  }

  async assertAccess(memberId: string, sessionId: string): Promise<void> {
    // DB 오류는 그대로 공통 500 처리로 넘긴다. 토큰 검증의 catch 안에 넣지 않는다.
    const session = await this.dataSource.manager.findOneBy(AuthSession, { sessionId, memberId });
    const account = await this.dataSource.manager.findOneBy(MemberAccount, { memberId });
    if (!session || !this.active(session, this.clock()) || account?.accountState !== 'ACTIVE') {
      throw new ApiError('AUTH_INVALID');
    }
  }

  private async locked(manager: EntityManager, token: string) {
    const receipt = await manager.findOneBy(SessionRefreshToken, { tokenHash: refreshHash(token) });
    if (!receipt) return null;
    // 토큰이 교체돼도 같은 세션 행을 잠근 후 토큰 상태를 다시 읽는다.
    const session = await manager.findOne(AuthSession, { where: { sessionId: receipt.sessionId },
      lock: { mode: 'pessimistic_write' } });
    if (!session) return null;
    const current = await manager.findOneByOrFail(SessionRefreshToken, { refreshId: receipt.refreshId });
    return { session, current };
  }

  async refresh(token: string | undefined) {
    if (!validRefresh(token)) throw new ApiError('AUTH_INVALID');
    const result = await this.dataSource.transaction('READ COMMITTED', async manager => {
      const locked = await this.locked(manager, token);
      if (!locked) return null;
      const { session, current } = locked;
      const now = this.clock();
      const account = await manager.findOneBy(MemberAccount, { memberId: session.memberId });
      if (!this.active(session, now) || account?.accountState !== 'ACTIVE' || current.usedAt !== null) {
        // 사용된 토큰의 재사용은 세션 전체 폐기. 오류를 transaction 안에서 던져 폐기를 롤백하지 않는다.
        if (session.revokedAt === null) await manager.update(AuthSession, { sessionId: session.sessionId }, { revokedAt: new Date(now) });
        return null;
      }
      await manager.update(SessionRefreshToken, { refreshId: current.refreshId }, { usedAt: new Date(now) });
      session.lastRefreshedAt = new Date(now);
      await manager.update(AuthSession, { sessionId: session.sessionId }, { lastRefreshedAt: session.lastRefreshedAt });
      return this.issue(manager, session, now);
    });
    if (!result) throw new ApiError('AUTH_INVALID');
    return result;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!validRefresh(token)) return;
    await this.dataSource.transaction('READ COMMITTED', async manager => {
      const locked = await this.locked(manager, token);
      if (locked && locked.session.revokedAt === null) {
        await manager.update(AuthSession, { sessionId: locked.session.sessionId }, { revokedAt: new Date(this.clock()) });
      }
    });
  }
}
