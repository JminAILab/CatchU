import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { OwnerProfileReader, OwnerState } from '../member-profile/owner-profile-reader';
import { issueLinkGrant, LINK_GRANT_KEY, verifyLinkGrant } from './link-grant';
import { verifyLinkPassword } from './link-password';
import { isLinkTokenFormat } from './link-token';
import { Clock } from './share-link-issuance';
import { ShareLink } from './share-link.entity';
import { isShareLinkValidAt } from './share-link-state';
import { HashTicket, UnlockSaturatedError } from './hash-gate';
import { UnlockBusyError } from './unlock-limiter';
import { UNLOCK_CONTROLS, UnlockControls } from './unlock-policy';
import { SHARE_LINKS_CLOCK } from './share-links.service';

function unavailable(): ApiError {
  // 없는 URL·중단·만료·소유 회원 비활성을 구분하지 않는다. 문구는 명세 고정값, details 없음.
  return new ApiError('LINK_UNAVAILABLE');
}

/** 같은 판정 시점에 유효한 링크가 있는데 소유 회원 행이 없다(데이터 불일치). 응답은 500 INTERNAL_ERROR이며 링크 값을 담지 않는다. */
export class LinkOwnerMissingError extends Error {
  constructor() {
    super('Valid share link has no owner member');
    this.name = 'LinkOwnerMissingError';
  }
}

/**
 * 소유 회원 상태를 수신자 응답으로 바꾼다(계약 「P — 수신자 API」). 비활성은 다른 링크 불가 사유와 같은 404,
 * 회원 없음은 이 함수를 같은 판정 시점의 결과에만 쓰므로 데이터 불일치 500이다.
 */
export function assertOwnerAvailable(state: OwnerState): void {
  if (state === 'INACTIVE') throw unavailable();
  if (state === 'NO_MEMBER') throw new LinkOwnerMissingError();
}

/**
 * 수신자 접근 판정(#150·#151). 판정 순서는 계약대로 링크 존재·중단·만료 → 소유 회원 상태 → (unlock만) 시도 제한 → 비밀번호 → 현재 자료다.
 * 링크와 소유 회원 상태는 같은 시점으로 읽는다(`withLinkSnapshot`). 회원 JWT를 쓰지 않는다. 링크·비밀번호·grant 값은 로그·오류에 넣지 않는다.
 */
@Injectable()
export class LinkAccessService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(LINK_GRANT_KEY) private readonly grantKey: Buffer,
    @Inject(UNLOCK_CONTROLS) private readonly controls: UnlockControls,
    @Inject(SHARE_LINKS_CLOCK) private readonly clock: Clock,
    private readonly owners: OwnerProfileReader,
  ) {}

  /**
   * 링크(토큰 형식·존재·중단·만료)를 읽기 전용 REPEATABLE READ 트랜잭션에서 판정하고, 같은 시점의 manager로 `read`를 실행한다.
   * 형식이 틀린 토큰·없음·중단·만료는 같은 404이며 형식 오류 외에는 같은 조회 경로를 탄다. 소유 회원 해석은 `read`가 정한다.
   *
   * - REPEATABLE READ에서는 첫 조회 문장(링크 조회)의 스냅샷을 뒤의 문장이 함께 쓴다. 행 잠금은 잡지 않는다.
   * - 트랜잭션은 이 함수가 끝나기 전에 닫힌다. manager는 `read` 안에서만 쓰고 밖으로 돌려주지 않는다(닫힌 트랜잭션의 manager를 다시 쓰지 않게).
   * - grant는 검사하지 않는다. 판정 안에서 grant를 함께 보는 것은 `assertReadable`이고, 이 함수를 직접 쓰는 것은 같은 요청에서 이미 grant를
   *   확인한 뒤의 한 번 재판정(목록의 분리된 프로필 조회, recipient.service.ts)뿐이다.
   */
  async withLinkSnapshot<T>(token: string, read: (link: ShareLink, manager: EntityManager) => Promise<T>, now = this.clock()): Promise<T> {
    if (!isLinkTokenFormat(token)) throw unavailable();
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      const link = await manager.getRepository(ShareLink).findOneBy({ linkTokenReference: token });
      if (!link || !isShareLinkValidAt(link, now)) throw unavailable();
      return read(link, manager);
    });
  }

  /** 지금 열 수 있는 링크. 링크 판정(404)과 같은 시점의 소유 회원 상태(비활성 404, 회원 없음 500)를 함께 본다. */
  private usableLink(token: string, now: Date): Promise<ShareLink> {
    return this.withLinkSnapshot(token, async (link, manager) => {
      assertOwnerAvailable(await this.owners.readOwnerState(link.ownerId, manager));
      return link;
    }, now);
  }

  /**
   * 수신 조회(#151)가 쓰는 공통 판정. 링크·소유 회원 판정 뒤, 비밀번호 링크는 이 링크의 유효한 grant가 있어야 하며 없거나 무효·만료면
   * 401 LINK_PASSWORD_REQUIRED다. grant가 있어도 링크와 소유 회원을 매번 다시 판정하므로 중단·만료·비활성을 우회하지 못한다. 시도 제한은 적용하지 않는다.
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
   *
   * 판정 순서: 링크(404) → 소유 회원(비활성 404, 회원 없음 500) → 비밀번호 없는 링크(400) → 본문(400) → 주소·링크 차단(429, 남은 초) →
   * 같은 링크·주소 요청 빈도(429, 창이 빌 때까지) → 진행 중 상한·같은 주소 대기 상한(429, 1초) → 차례가 오면 주소·링크 자리 예약 → 해시 차례 대기 →
   * 해시 직전 재확인(중단·만료·소유 회원 비활성 404, 차단 429) → 비밀번호(401·200). 어떤 결과로 끝나도 잡은 자리는 모두 돌려준다.
   * 링크·소유 회원 판정 트랜잭션은 두 번 모두 비밀번호 계산 전에 닫힌다.
   */
  async unlock(token: string, body: unknown, clientAddress: string): Promise<{ grant: string }> {
    const now = this.clock();
    const link = await this.usableLink(token, now);
    const verifier = link.passwordProtectionReference;
    if (verifier === null) throw new ApiError('INVALID_REQUEST');
    const password = readPassword(body);
    const addressKey = `${link.linkId}|${clientAddress}`;
    // 이미 차단된 주소·링크는 대기열과 무관하게 실제 남은 시간으로 먼저 거절한다(대기 초과의 Retry-After: 1로 덮어쓰지 않음).
    this.assertNotBlocked(addressKey, link.linkId, now);
    // 같은 링크·주소의 요청 빈도(#219). 실패 기록은 성공하면 지워지므로, 맞는 비밀번호를 되풀이해 해시 자원을 차지하지 못하게
    // 해시 차례를 잡기 전에 센다. 여기서 거부한 요청은 세지 않고, 통과한 뒤 포화·차단·중단으로 거절된 요청은 이미 센 것이다.
    const rate = this.controls.rates.take(addressKey, now);
    if (!rate.allowed) throw limited(rate.retryAfterSeconds);
    let ticket;
    try {
      ticket = this.controls.hashes.enter();
    } catch (error) {
      if (error instanceof UnlockSaturatedError) throw limited(1);
      throw error;
    }
    try {
      // 같은 링크·주소는 한 번에 하나씩 "예약 → 해시 → 기록"을 해, 동시 요청으로 주소별 한도를 넘겨 검사하지 않는다.
      return await this.controls.addresses.runExclusive(addressKey, () =>
        this.attempt(token, link.linkId, addressKey, verifier, password, ticket));
    } catch (error) {
      // 같은 링크·주소에 이미 3개(실행 중 포함)가 걸려 있으면 검사하지 않고 거절한다.
      if (error instanceof UnlockBusyError) throw limited(1);
      throw error;
    } finally {
      ticket.leave();
    }
  }

  /** 차례가 온 요청 하나의 검사. 주소·링크 자리를 예약하고, 기록하지 못한 예약은 finally에서 푼다. */
  private async attempt(
    token: string, linkId: string, addressKey: string, verifier: string, password: string, ticket: HashTicket,
  ): Promise<{ grant: string }> {
    const { addresses, links } = this.controls;
    const at = this.clock();
    const address = addresses.check(addressKey, at);
    if (address.blocked) {
      if (address.reason === 'limit') this.assertNotBlocked(addressKey, linkId, at);
      throw limited(address.retryAfterSeconds);
    }
    const reservation = links.reserve(linkId, at);
    if (!reservation.ok) {
      addresses.release(addressKey);
      if (reservation.reason === 'limit') this.assertNotBlocked(addressKey, linkId, at);
      throw limited(reservation.retryAfterSeconds);
    }
    let settled = false;
    try {
      return await ticket.runHash(async () => {
        // 해시 직전 재확인: 기다리는 동안 링크가 중단·만료되거나 소유 회원이 비활성이 됐거나 주소·링크가 차단됐으면 해시를 계산하지 않는다.
        // 링크·소유 회원은 새 트랜잭션에서 같은 시점으로 다시 읽고, 그 트랜잭션은 해시 전에 닫힌다.
        const before = this.clock();
        const current = await this.usableLink(token, before);
        this.assertNotBlocked(addressKey, linkId, before);
        const matched = await verifyLinkPassword(password, verifier);
        const done = this.clock();
        if (!matched) {
          addresses.recordFailure(addressKey, done);
          links.recordFailure(linkId, done);
          settled = true;
          throw new ApiError('LINK_PASSWORD_INVALID');
        }
        // 방어적 재확인: 검사하는 사이 차단이 걸려 있으면 늦은 성공도 429로 끝내고 grant를 주지 않는다.
        this.assertNotBlocked(addressKey, linkId, done);
        addresses.recordSuccess(addressKey, done);
        links.recordSuccess(linkId);
        settled = true;
        return { grant: issueLinkGrant(this.grantKey, linkId, current.expiresAt, done) };
      });
    } finally {
      if (!settled) {
        addresses.release(addressKey);
        links.release(linkId);
      }
    }
  }

  /** 주소·링크 중 하나라도 차단 중이면 429. 둘 다면 늦게 끝나는 쪽의 남은 초를 준다(그 전에 다시 와도 막히므로). */
  private assertNotBlocked(addressKey: string, linkId: string, now: Date): void {
    const address = this.controls.addresses.blockedFor(addressKey, now);
    const link = this.controls.links.blockedFor(linkId, now);
    if (address !== null || link !== null) throw limited(Math.max(address ?? 0, link ?? 0));
  }
}

function limited(retryAfterSeconds: number): ApiError {
  return new ApiError('LINK_UNLOCK_LIMITED', { retryAfterSeconds });
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
