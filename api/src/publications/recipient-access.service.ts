// 받은 사람 열람·비밀번호 통과(U4 제출 3 W4, 기능 명세 W4, 보안 설계 「판정과 읽기의 시점 (R-04)」·「비밀번호 통과 (unlock)」, BR6.1~BR6.4, C-10·C-12,
// NFR1.2·NFR1.3·NFR1.6·NFR1.7·NFR1.12). 10월 `link-access.service.ts`의 순서를 발행본(publication)으로 옮긴 것이며 제한 키의 링크 단위는 publicationId다.
// 토큰·grant·비밀번호·검증값은 로그·오류에 넣지 않는다(NFR1.9).
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from '../common/errors';
import { HashTicket, UnlockSaturatedError } from '../share-links/hash-gate';
import { issueLinkGrant, LINK_GRANT_KEY } from '../share-links/link-grant';
import { verifyLinkPassword } from '../share-links/link-password';
import { isLinkTokenFormat } from '../share-links/link-token';
import { UnlockBusyError } from '../share-links/unlock-limiter';
import { UNLOCK_CONTROLS, UnlockControls } from '../share-links/unlock-policy';
import { DbPublicationAccess, UnlockJudgement } from './db-publication-access';
import { LinkPasswordRequired, LinkUnavailable, NotFound } from './publication-access';
import { Clock, PUBLICATIONS_CLOCK } from './publications-config';
import { PublishedSnapshot } from './published-snapshot';

/** 없음·삭제·중지·만료·작성자 비활성을 구분하지 않는다. 문구는 공통 기본값, details 없음. */
function unavailable(): ApiError {
  return new ApiError('LINK_UNAVAILABLE');
}

/**
 * C-10 판정 실패를 받은 사람 응답으로 바꾼다. 판정 뒤 만난 `NotFound`(발행본 삭제)는 BR6.1대로 404다(#416 OQ-U4-NFR-5 결정 A).
 * `PublicationOwnerMissing`(회원 행 없음)과 그 밖의 오류는 그대로 두어 공통 필터가 500 INTERNAL_ERROR로 끝낸다.
 */
function toApiError(error: unknown): unknown {
  if (error instanceof LinkUnavailable || error instanceof NotFound) return unavailable();
  if (error instanceof LinkPasswordRequired) return new ApiError('LINK_PASSWORD_REQUIRED');
  return error;
}

function limited(retryAfterSeconds: number): ApiError {
  return new ApiError('LINK_UNLOCK_LIMITED', { retryAfterSeconds });
}

@Injectable()
export class RecipientAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: DbPublicationAccess,
    @Inject(LINK_GRANT_KEY) private readonly grantKey: Buffer,
    @Inject(UNLOCK_CONTROLS) private readonly controls: UnlockControls,
    @Inject(PUBLICATIONS_CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * 열람(GET /v1/public/links/{token}). 판정(`resolveForRecipientIn`)과 사본 읽기(`readSnapshotIn`)를 읽기 전용 REPEATABLE READ 트랜잭션
   * 하나에서 해 같은 스냅샷을 읽는다(R-04). 판정 뒤 커밋된 중지·만료·삭제·작성자 비활성은 이 요청에 보이지 않고 다음 요청의 재판정이 막는다.
   * 행 잠금은 잡지 않는다. 형식이 틀린 토큰은 트랜잭션을 열지 않고 404다.
   */
  async read(token: string, grant: string | undefined): Promise<PublishedSnapshot> {
    if (!isLinkTokenFormat(token)) throw unavailable();
    const now = this.clock();
    try {
      return await this.dataSource.transaction('REPEATABLE READ', async (manager) => {
        await manager.query('SET TRANSACTION READ ONLY');
        const access = await this.access.resolveForRecipientIn(manager, token, grant ?? null, now);
        return this.access.readSnapshotIn(manager, access.publicationId);
      });
    } catch (error) {
      throw toApiError(error);
    }
  }

  /**
   * 비밀번호 통과(POST /v1/public/links/{token}/unlock, BR6.3). 성공하면 이 발행본에 묶인 grant를 준다.
   * `clientAddress`는 시도 제한을 세는 주소 단위다(client-address.ts의 `clientAddressKey`, IPv4 또는 IPv6 /64).
   *
   * 판정 순서(10월 그대로, NFR1.7): 발행본(404: 없음·중지·만료·작성자 비활성, 500: 회원 행 없음) → 비밀번호 없는 발행본(400 INVALID_REQUEST) →
   * 본문(400 VALIDATION_FAILED) → 주소·발행본 차단(429, 남은 초) → 같은 발행본·주소 요청 빈도(429) → 진행 중 상한·같은 주소 대기 상한(429, 1초) →
   * 차례가 오면 주소·발행본 자리 예약 → 해시 차례 대기 → 해시 직전 재판정(중지·만료·비활성 404, 차단 429) → 비밀번호(401·200).
   * 어떤 결과로 끝나도 잡은 자리는 모두 돌려준다. 판정 트랜잭션은 두 번 모두 비밀번호 계산 전에 닫힌다.
   */
  async unlock(token: string, body: unknown, clientAddress: string): Promise<{ grant: string }> {
    const now = this.clock();
    const publication = await this.judge(token, now);
    const verifier = publication.passwordVerifier;
    if (verifier === null) throw new ApiError('INVALID_REQUEST');
    const password = readPassword(body);
    const linkId = publication.publicationId;
    const addressKey = `${linkId}|${clientAddress}`;
    // 이미 차단된 주소·발행본은 대기열과 무관하게 실제 남은 시간으로 먼저 거절한다(대기 초과의 Retry-After: 1로 덮어쓰지 않음).
    this.assertNotBlocked(addressKey, linkId, now);
    // 같은 발행본·주소의 요청 빈도(#219). 실패 기록은 성공하면 지워지므로, 맞는 비밀번호를 되풀이해 해시 자원을 차지하지 못하게
    // 해시 차례를 잡기 전에 센다. 여기서 거부한 요청은 세지 않고, 통과한 뒤 포화·차단·중지로 거절된 요청은 이미 센 것이다.
    const rate = this.controls.rates.take(addressKey, now);
    if (!rate.allowed) throw limited(rate.retryAfterSeconds);
    let ticket: HashTicket;
    try {
      ticket = this.controls.hashes.enter();
    } catch (error) {
      if (error instanceof UnlockSaturatedError) throw limited(1);
      throw error;
    }
    try {
      // 같은 발행본·주소는 한 번에 하나씩 "예약 → 해시 → 기록"을 해, 동시 요청으로 주소별 한도를 넘겨 검사하지 않는다.
      return await this.controls.addresses.runExclusive(addressKey, () =>
        this.attempt(token, linkId, addressKey, verifier, password, ticket));
    } catch (error) {
      // 같은 발행본·주소에 이미 3개(실행 중 포함)가 걸려 있으면 검사하지 않고 거절한다.
      if (error instanceof UnlockBusyError) throw limited(1);
      throw error;
    } finally {
      ticket.leave();
    }
  }

  /** 발행본·소유 회원 판정을 받은 사람 응답 코드로 바꾼다(404·500). */
  private async judge(token: string, now: Date): Promise<UnlockJudgement> {
    try {
      return await this.access.resolveForUnlock(token, now);
    } catch (error) {
      throw toApiError(error);
    }
  }

  /** 차례가 온 요청 하나의 검사. 주소·발행본 자리를 예약하고, 기록하지 못한 예약은 finally에서 푼다. */
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
        // 해시 직전 재확인: 기다리는 동안 발행본이 중지·만료되거나 작성자가 비활성이 됐거나 주소·발행본이 차단됐으면 해시를 계산하지 않는다.
        // 발행본·소유 회원은 새 트랜잭션에서 같은 시점으로 다시 읽고, 그 트랜잭션은 해시 전에 닫힌다.
        const before = this.clock();
        const current = await this.judge(token, before);
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
        // grant는 publicationId에 묶이고 수명 2시간, 발행본 만료를 넘지 않는다(BR6.2, NFR1.6).
        return { grant: issueLinkGrant(this.grantKey, linkId, current.expiresAt, done) };
      });
    } finally {
      if (!settled) {
        addresses.release(addressKey);
        links.release(linkId);
      }
    }
  }

  /** 주소·발행본 중 하나라도 차단 중이면 429. 둘 다면 늦게 끝나는 쪽의 남은 초를 준다(그 전에 다시 와도 막히므로). */
  private assertNotBlocked(addressKey: string, linkId: string, now: Date): void {
    const address = this.controls.addresses.blockedFor(addressKey, now);
    const link = this.controls.links.blockedFor(linkId, now);
    if (address !== null || link !== null) throw limited(Math.max(address ?? 0, link ?? 0));
  }
}

/** unlock 본문: `{ password: 비어 있지 않은 문자열 }`만 받는다(10월 그대로). 비밀번호는 trim하지 않으며, 오류에 입력값을 담지 않는다. */
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
