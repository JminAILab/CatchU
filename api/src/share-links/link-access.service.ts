import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from '../common/errors';
import { issueLinkGrant, LINK_GRANT_KEY, verifyLinkGrant } from './link-grant';
import { verifyLinkPassword } from './link-password';
import { isLinkTokenFormat } from './link-token';
import { Clock } from './share-link-issuance';
import { ShareLink } from './share-link.entity';
import { isShareLinkValidAt } from './share-link-state';
import { UnlockBusyError, UnlockLimiter } from './unlock-limiter';
import { SHARE_LINKS_CLOCK } from './share-links.service';

export const UNLOCK_LIMITER = Symbol('UNLOCK_LIMITER');

function unavailable(): ApiError {
  // 없는 URL·중단·만료를 구분하지 않는다. 문구는 명세 고정값, details 없음.
  return new ApiError('LINK_UNAVAILABLE');
}

/**
 * 수신자 접근 판정(#150). 판정 순서는 계약대로 링크 존재·중단·만료 → (unlock만) 시도 제한 → 비밀번호 → 현재 자료다.
 * 회원 JWT를 쓰지 않는다. 링크·비밀번호·grant 값은 로그·오류에 넣지 않는다.
 */
@Injectable()
export class LinkAccessService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(LINK_GRANT_KEY) private readonly grantKey: Buffer,
    @Inject(UNLOCK_LIMITER) private readonly limiter: UnlockLimiter,
    @Inject(SHARE_LINKS_CLOCK) private readonly clock: Clock,
  ) {}

  /** 지금 열 수 있는 링크. 형식이 틀린 토큰·없음·중단·만료는 같은 404다. 모두 같은 조회 경로를 탄다. */
  private async usableLink(token: string, now: Date): Promise<ShareLink> {
    if (!isLinkTokenFormat(token)) throw unavailable();
    const link = await this.dataSource.getRepository(ShareLink).findOneBy({ linkTokenReference: token });
    if (!link || !isShareLinkValidAt(link, now)) throw unavailable();
    return link;
  }

  /**
   * 수신 조회(#151)가 쓰는 공통 판정. 비밀번호 링크는 이 링크의 유효한 grant가 있어야 하며, 없거나 무효·만료면 401 LINK_PASSWORD_REQUIRED다.
   * grant가 있어도 링크를 매번 다시 판정하므로 중단·만료를 우회하지 못한다. 시도 제한은 적용하지 않는다.
   */
  async assertReadable(token: string, grant: string | undefined): Promise<ShareLink> {
    const now = this.clock();
    const link = await this.usableLink(token, now);
    if (link.passwordProtectionReference !== null && !verifyLinkGrant(this.grantKey, grant, link.linkId, now)) {
      throw new ApiError('LINK_PASSWORD_REQUIRED');
    }
    return link;
  }

  /**
   * 비밀번호 확인(POST /v1/public/links/{token}/unlock). 성공하면 이 링크 한정 grant를 준다.
   * `clientAddress`는 시도 제한을 세는 주소 단위다(client-address.ts의 `clientAddressKey`, IPv4 또는 IPv6 /64).
   */
  async unlock(token: string, body: unknown, clientAddress: string): Promise<{ grant: string }> {
    const now = this.clock();
    const link = await this.usableLink(token, now);
    if (link.passwordProtectionReference === null) throw new ApiError('INVALID_REQUEST');
    const password = readPassword(body);
    const key = `${link.linkId}|${clientAddress}`;
    const verifier = link.passwordProtectionReference;
    // 이미 차단된 키는 대기열과 무관하게 실제 남은 시간으로 먼저 거절한다(대기 초과의 Retry-After: 1로 덮어쓰지 않음).
    const blockedFor = this.limiter.blockedFor(key, this.clock());
    if (blockedFor !== null) throw new ApiError('LINK_UNLOCK_LIMITED', { retryAfterSeconds: blockedFor });
    try {
      // 같은 링크·접속지는 한 번에 하나씩 "차단 확인 → 비밀번호 검사 → 기록"을 해, 동시 요청으로 한도를 넘겨 검사하지 않는다.
      return await this.limiter.runExclusive(key, async () => {
        const limit = this.limiter.check(key, this.clock());
        // 차단 중(또는 기록 자리가 없음)에는 맞는 비밀번호도 거부하고 해시를 계산하지 않는다.
        if (limit.blocked) throw new ApiError('LINK_UNLOCK_LIMITED', { retryAfterSeconds: limit.retryAfterSeconds });
        let matched: boolean;
        try {
          matched = await verifyLinkPassword(password, verifier);
        } catch (error) {
          this.limiter.release(key);
          throw error;
        }
        const at = this.clock();
        if (!matched) {
          this.limiter.recordFailure(key, at);
          throw new ApiError('LINK_PASSWORD_INVALID');
        }
        // 방어적 재확인: 검사하는 사이 차단이 걸려 있으면 늦은 성공도 429로 끝내고 grant를 주지 않는다.
        const late = this.limiter.blockedFor(key, at);
        if (late !== null) {
          this.limiter.release(key);
          throw new ApiError('LINK_UNLOCK_LIMITED', { retryAfterSeconds: late });
        }
        this.limiter.recordSuccess(key, at);
        return { grant: issueLinkGrant(this.grantKey, link.linkId, link.expiresAt, at) };
      });
    } catch (error) {
      // 같은 링크·접속지에 이미 3개(실행 중 포함)가 걸려 있으면 검사하지 않고 거절한다.
      if (error instanceof UnlockBusyError) throw new ApiError('LINK_UNLOCK_LIMITED', { retryAfterSeconds: 1 });
      throw error;
    }
  }
}

/** unlock 본문: `{ password: 비어 있지 않은 문자열 }`만 받는다. 비밀번호는 trim하지 않으며, 오류에 입력값을 담지 않는다. */
function readPassword(body: unknown): string {
  const violation = (field: string, reason: string) =>
    new ApiError('VALIDATION_FAILED', { details: { violations: [{ field, reason }] } });
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw violation('body', 'isObject');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((name) => name !== 'password')) throw violation('body', 'whitelistValidation');
  if (typeof input.password !== 'string') throw violation('password', 'isString');
  if (input.password === '') throw violation('password', 'isNotEmpty');
  return input.password;
}
