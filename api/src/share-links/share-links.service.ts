import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from '../common/errors';
import { runIdempotentCreation } from '../member-analysis/idempotent-creation';
import { hashLinkPassword } from './link-password';
import { generateLinkToken } from './link-token';
import { validateShareCreate } from './share-create';
import { isSameShareCreate, shareCreateFingerprint } from './share-create-fingerprint';
import { Clock, issueShareLink } from './share-link-issuance';
import { ShareLink } from './share-link.entity';
import { ShareLinkResponse, toShareLinkResponse } from './share-link-response';
import { SHARE_LINKS_CONFIG, ShareLinksConfig } from './share-links.config';

export const SHARE_LINKS_CLOCK = Symbol('SHARE_LINKS_CLOCK');

const MEMBER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
   */
  async create(memberId: string, idempotencyKey: string | undefined, body: unknown): Promise<CreateShareLinkResult> {
    const { webBaseUrl } = this.config;
    // 현재 인증 Guard(#87)는 회원 UUID 형식과 회원 행 존재까지 확인하지 않는다. UUID가 아닌 토큰(#104 이전 개발 토큰)은 DB에 닿기 전에 거른다.
    if (!MEMBER_ID_PATTERN.test(memberId)) throw new ApiError('AUTH_INVALID');
    // 키 길이 등 나머지 형식은 공통 멱등 처리가 같은 400으로 검사한다.
    if (typeof idempotencyKey !== 'string') throw new ApiError('INVALID_REQUEST');
    const validation = validateShareCreate(body);
    if (!validation.valid) throw new ApiError('VALIDATION_FAILED', { details: { violations: validation.violations } });
    const input = validation.value;

    // 해시는 잠금 시간을 줄이려고 트랜잭션 밖에서 미리 만든다. 같은 키 재요청이면 쓰이지 않고 버려진다.
    const passwordVerifier = input.password === undefined ? null : await hashLinkPassword(input.password);
    const linkToken = generateLinkToken();

    const { replayed, response } = await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 회원 행이 없는 토큰은 외래 키 오류(500)가 되기 전에 401로 끝낸다. 다른 DB 오류는 그대로 서버 오류로 둔다.
      // FOR KEY SHARE로 발급이 끝날 때까지 회원 행 삭제를 막는다.
      const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR KEY SHARE', [memberId]);
      if (member.length === 0) throw new ApiError('AUTH_INVALID');
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
          return isSameShareCreate(input, {
            requestFingerprint: record.requestFingerprint,
            passwordVerifier: link.passwordProtectionReference,
          });
        },
        readResponse: async (sameManager, record) => {
          const link = await sameManager.findOneByOrFail(ShareLink, { linkId: record.responseReference });
          return toShareLinkResponse(link, webBaseUrl, this.clock());
        },
      });
    });
    return { replayed, link: response };
  }
}
