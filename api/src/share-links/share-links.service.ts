import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { runIdempotentCreation } from '../member-analysis/idempotent-creation';
import { hashLinkPassword } from './link-password';
import { generateLinkToken } from './link-token';
import { validateShareCreate } from './share-create';
import {
  matchStoredShareCreate, shareCreateFingerprint, verifyPendingPassword, type PendingPasswordCheck,
} from './share-create-fingerprint';
import { Clock, issueShareLink } from './share-link-issuance';
import { ShareLink } from './share-link.entity';
import { encodeShareLinkCursor, parseShareLinkListQuery } from './share-link-list';
import { ShareLinkResponse, toShareLinkResponse } from './share-link-response';
import { SHARE_LINKS_CONFIG, ShareLinksConfig } from './share-links.config';

export const SHARE_LINKS_CLOCK = Symbol('SHARE_LINKS_CLOCK');

const MEMBER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ShareLinkPage {
  items: ShareLinkResponse[];
  page: { nextCursor: string | null };
}

const UUID_PATTERN = MEMBER_ID_PATTERN;

/** 현재 인증 Guard(#87)는 회원 UUID 형식과 회원 행 존재까지 확인하지 않는다. UUID가 아닌 토큰(#104 이전 개발 토큰)은 DB에 닿기 전에 거른다. */
function assertMemberIdFormat(memberId: string): void {
  if (!MEMBER_ID_PATTERN.test(memberId)) throw new ApiError('AUTH_INVALID');
}

/**
 * 회원 행이 없는 토큰은 외래 키 오류(500)나 거짓 빈 목록이 되기 전에 401로 끝낸다. 다른 DB 오류는 그대로 서버 오류로 둔다.
 * FOR KEY SHARE로 요청이 끝날 때까지 회원 행 삭제를 막는다.
 */
async function assertMemberExists(manager: EntityManager, memberId: string): Promise<void> {
  const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR KEY SHARE', [memberId]);
  if (member.length === 0) throw new ApiError('AUTH_INVALID');
}

export interface CreateShareLinkResult {
  /** 같은 키·같은 본문의 재요청이면 true(200), 새 발급이면 false(201) */
  replayed: boolean;
  link: ShareLinkResponse;
}

@Injectable()
export class ShareLinksService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(SHARE_LINKS_CONFIG) private readonly config: ShareLinksConfig,
    @Inject(SHARE_LINKS_CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * 링크 발급(POST /v1/share-links). 멱등 키 예약 → 발급 판정·저장 → 멱등 기록 → 응답 구성을 한 READ COMMITTED 트랜잭션에서 한다.
   * 잠금 순서는 공통 멱등 키 잠금 → 회원 단위 발급 잠금이다(api/docs/member-analysis.md 「멱등 생성 호출」).
   * 비밀번호가 있는 같은 키 재요청만 예외로, 비밀번호 비교를 트랜잭션 밖에서 한 뒤 링크를 다시 읽어 응답 상태를 구성한다.
   */
  async create(memberId: string, idempotencyKey: string | undefined, body: unknown): Promise<CreateShareLinkResult> {
    const { webBaseUrl } = this.config;
    assertMemberIdFormat(memberId);
    // 키 길이 등 나머지 형식은 공통 멱등 처리가 같은 400으로 검사한다.
    if (typeof idempotencyKey !== 'string') throw new ApiError('INVALID_REQUEST');
    const validation = validateShareCreate(body);
    if (!validation.valid) throw new ApiError('VALIDATION_FAILED', { details: { violations: validation.violations } });
    const input = validation.value;

    // 해시는 잠금 시간을 줄이려고 트랜잭션 밖에서 미리 만든다. 같은 키 재요청이면 쓰이지 않고 버려진다.
    const passwordVerifier = input.password === undefined ? null : await hashLinkPassword(input.password);
    const linkToken = generateLinkToken();

    // 같은 키 재요청의 비밀번호 비교 대상. 잠금 안에서는 해시를 계산하지 않고, 읽은 저장값만 남겨 잠금과 연결을 놓은 뒤 비교한다.
    let pendingPassword: PendingPasswordCheck | null = null;
    const { replayed, response } = await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, memberId);
      return runIdempotentCreation(manager, {
        memberId, operation: 'createShareLink', key: idempotencyKey, requestFingerprint: shareCreateFingerprint(input),
      }, {
        create: async (sameManager) => {
          const link = await issueShareLink(sameManager, {
            ownerId: memberId, title: input.title, linkToken, passwordVerifier,
          }, this.clock);
          return { requestId: null, linkId: link.linkId, responseReference: link.linkId };
        },
        isSame: async (sameManager, record) => {
          const link = await sameManager.findOneByOrFail(ShareLink, { linkId: record.linkId as string });
          const match = matchStoredShareCreate(input, {
            requestFingerprint: record.requestFingerprint,
            passwordVerifier: link.passwordProtectionReference,
          });
          if (!match.same) return false;
          // 지문과 설정 여부까지만 여기서 확정한다. 비밀번호 비교는 아래 트랜잭션 밖에서 반드시 한다.
          pendingPassword = match.passwordCheck;
          return true;
        },
        readResponse: async (sameManager, record) => {
          const link = await sameManager.findOneByOrFail(ShareLink, { linkId: record.responseReference });
          return toShareLinkResponse(link, webBaseUrl, this.clock());
        },
      });
    });
    // 비밀번호 비교가 필요한 재요청은 키 잠금·DB 연결을 놓은 뒤 비교한다. 다르면 이미 구성한 응답을 돌려주지 않고 추가 조회 없이 409로 거절한다.
    // 이 비교는 쓰기 없이 읽은 저장값을 대상으로 하므로 롤백할 것이 없고, 같은 키는 다시 보낼 수 있다.
    if (replayed && pendingPassword !== null) {
      if (!await verifyPendingPassword(pendingPassword)) throw new ApiError('IDEMPOTENCY_CONFLICT');
      // 비교하는 동안 링크가 중단·만료됐을 수 있어, 트랜잭션 안에서 만든 응답 대신 지금의 링크로 상태를 다시 구성한다.
      // 재요청의 응답은 "현재 상태"여야 하기 때문이다. 링크가 없으면 낡은 성공 응답을 돌려주지 않고 서버 오류로 처리한다.
      const current = await this.dataSource.getRepository(ShareLink).findOneBy({ linkId: response.linkId, ownerId: memberId });
      if (!current) throw new ApiError('INTERNAL_ERROR');
      return { replayed, link: toShareLinkResponse(current, webBaseUrl, this.clock()) };
    }
    // 비밀번호 없는 재요청은 비교 대기가 없어, 트랜잭션 안에서 구성한 응답을 그대로 돌려준다(커밋 직후, 목록·단건 조회와 같은 수준).
    return { replayed, link: response };
  }

  /**
   * 내 링크 목록(GET /v1/share-links). 본인 링크만 발행 시각 최신순(같으면 linkId 역순)으로 돌려준다.
   * 상태는 저장하지 않고 응답 시각으로 구한다. 0개는 정상 빈 목록(`items: []`)이다.
   */
  async list(memberId: string, query: Record<string, unknown>): Promise<ShareLinkPage> {
    assertMemberIdFormat(memberId);
    const { limit, after } = parseShareLinkListQuery(memberId, query);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, memberId);
      const qb = manager.getRepository(ShareLink).createQueryBuilder('link')
        .where('link.ownerId = :memberId', { memberId })
        .orderBy('link.issuedAt', 'DESC').addOrderBy('link.linkId', 'DESC')
        .take(limit + 1);
      if (after) {
        qb.andWhere('(link.issuedAt, link.linkId) < (:issuedAt, :linkId)', { issuedAt: after.issuedAt, linkId: after.linkId });
      }
      const rows = await qb.getMany();
      const now = this.clock();
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return {
        items: items.map((link) => toShareLinkResponse(link, this.config.webBaseUrl, now)),
        page: { nextCursor: rows.length > limit && last ? encodeShareLinkCursor(memberId, last) : null },
      };
    });
  }

  /**
   * 링크 중단(PUT /v1/share-links/{linkId}/stop). #148 9/29 팀장 결정 표를 따른다.
   * - 소유 확인을 상태 확인보다 먼저 한다. 타인·없는 링크·UUID 형식이 아닌 ID는 같은 404 RESOURCE_UNAVAILABLE이다.
   * - 유효 링크는 중단한다. 이미 중단한 링크는 처음 `stoppedAt`을 그대로 두고, 만료 링크는 중단 처리 없이 EXPIRED로 둔다. 모두 200.
   * - 링크 행만 바꾸며 Catch 내용·공개 상태는 건드리지 않는다.
   */
  async stop(memberId: string, linkId: string): Promise<ShareLinkResponse> {
    assertMemberIdFormat(memberId);
    if (!UUID_PATTERN.test(linkId)) throw new ApiError('RESOURCE_UNAVAILABLE');
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, memberId);
      const repository = manager.getRepository(ShareLink);
      // 같은 링크의 동시 중단이 서로 다른 stoppedAt을 쓰지 않도록 행을 잠근다.
      const link = await repository.createQueryBuilder('link').setLock('pessimistic_write')
        .where('link.linkId = :linkId AND link.ownerId = :memberId', { linkId, memberId }).getOne();
      if (!link) throw new ApiError('RESOURCE_UNAVAILABLE');
      const now = this.clock();
      if (link.stoppedAt === null && now.getTime() < link.expiresAt.getTime()) {
        link.stoppedAt = now;
        await repository.update({ linkId: link.linkId }, { stoppedAt: now });
      }
      return toShareLinkResponse(link, this.config.webBaseUrl, now);
    });
  }
}
