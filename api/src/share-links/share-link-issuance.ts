import { EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { isLinkTokenFormat } from './link-token';
import { shareLinkExpiresAt } from './share-create';
import { ShareLink } from './share-link.entity';

/** 회원별 유효 링크 최대 개수(ERD ShareLink, 회원 API 409 LINK_LIMIT_REACHED). */
export const MAX_VALID_SHARE_LINKS = 5;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// 다른 기능의 advisory lock과 키가 겹치지 않도록 이름을 붙여 해시한다.
const LOCK_NAMESPACE = 'catchu:share-link-issue:';

export interface IssueShareLinkCommand {
  /** 인증된 회원 ID(소문자 uuid). 요청 본문에서 받지 않는다. */
  ownerId: string;
  /** validateShareCreate를 거친 trim 제목 */
  title: string;
  /** generateLinkToken()으로 만든 토큰 */
  linkToken: string;
  /** hashLinkPassword() 결과. 비밀번호 없는 링크는 null. 해시는 잠금 시간을 줄이려고 트랜잭션 밖에서 미리 계산한다 */
  passwordVerifier: string | null;
}

/** 현재 시각. 테스트에서 시각을 고정·이동할 때만 바꾼다. */
export type Clock = () => Date;
const systemClock: Clock = () => new Date();

function assertCommand(command: IssueShareLinkCommand): void {
  // 값 자체는 오류에 넣지 않는다. 여기서 걸리면 호출 코드의 잘못이다.
  if (typeof command.ownerId !== 'string' || !UUID_PATTERN.test(command.ownerId)) throw new TypeError('ownerId must be a lowercase uuid');
  if (typeof command.title !== 'string' || command.title.length === 0 || command.title !== command.title.trim()) {
    throw new TypeError('title must be the validated, trimmed title');
  }
  if (!isLinkTokenFormat(command.linkToken)) throw new TypeError('linkToken has an invalid format');
  if (command.passwordVerifier !== null && typeof command.passwordVerifier !== 'string') {
    throw new TypeError('passwordVerifier must be a string or null');
  }
}

/**
 * 링크를 발급한다. 호출하는 쪽이 연 트랜잭션의 manager로만 DB를 쓴다(api/CONVENTIONS.md 「트랜잭션 규약」).
 *
 * 1. 같은 회원의 발급을 트랜잭션 끝까지 직렬화한다(PostgreSQL 트랜잭션 advisory lock). 다른 회원은 막지 않는다.
 * 2. 잠금을 얻은 **뒤에** 발급 시각을 정한다. 잠금을 기다리는 동안 만료된 링크를 유효로 잘못 세지 않고,
 *    만료도 실제 저장 시점부터 30일이 되게 하기 위해서다.
 *    그 시각 기준 유효 링크(중단 안 됨, 만료 전)만 모아 판정한다. 중단·만료 링크는 제목 비교와 개수 모두에서 뺀다.
 * 3. 같은 제목이 있으면 LINK_TITLE_CONFLICT를 한도보다 먼저 돌려준다(#23 9/28 팀장 결정).
 * 4. 유효 링크가 이미 5개면 LINK_LIMIT_REACHED.
 * 5. 통과하면 저장한다. 커밋·롤백은 호출하는 쪽 트랜잭션을 따른다.
 *
 * 격리 수준은 READ COMMITTED여야 한다. 더 높은 격리 수준은 잠금을 얻기 전에 찍힌 스냅샷으로 판정해
 * 먼저 커밋한 발급을 놓칠 수 있으므로 거부한다.
 */
export async function issueShareLink(
  manager: EntityManager, command: IssueShareLinkCommand, clock: Clock = systemClock,
): Promise<ShareLink> {
  assertCommand(command);
  if (!manager.queryRunner?.isTransactionActive) {
    throw new Error('issueShareLink must run inside a transaction');
  }
  const [{ transaction_isolation: isolation }] = await manager.query('SHOW transaction_isolation');
  if (isolation !== 'read committed') {
    throw new Error('issueShareLink requires READ COMMITTED isolation');
  }

  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [LOCK_NAMESPACE + command.ownerId]);
  const issuedAt = clock();
  if (!(issuedAt instanceof Date) || !Number.isFinite(issuedAt.getTime())) throw new TypeError('clock must return a valid Date');

  const validTitles: { title: string }[] = await manager.query(
    `SELECT title FROM share_link
      WHERE owner_id = $1 AND stopped_at IS NULL AND expires_at > $2`,
    [command.ownerId, issuedAt],
  );
  if (validTitles.some(({ title }) => title === command.title)) throw new ApiError('LINK_TITLE_CONFLICT');
  if (validTitles.length >= MAX_VALID_SHARE_LINKS) throw new ApiError('LINK_LIMIT_REACHED');

  const link = new ShareLink();
  link.ownerId = command.ownerId;
  link.title = command.title;
  link.linkTokenReference = command.linkToken;
  link.passwordProtectionReference = command.passwordVerifier;
  link.issuedAt = issuedAt;
  link.expiresAt = shareLinkExpiresAt(issuedAt);
  link.stoppedAt = null;
  await manager.getRepository(ShareLink).insert(link);
  return link;
}
