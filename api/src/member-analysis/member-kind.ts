import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { MemberAccount } from './member-analysis.entity';

/** 회원을 만든 로그인 경로의 identityReference 접두사. 회원 생성과 아래 구분이 같은 값을 쓴다. */
export const GOOGLE_IDENTITY_PREFIX = 'catchu:google:';
export const DEV_LOGIN_IDENTITY_PREFIX = 'catchu:dev-login:';

/** Google 로그인으로 만든 실제 회원과 개발 로그인으로 만든 개발 회원. #322 고지·#252 선정·#323 접수가 함께 쓴다. */
export type MemberKind = 'REAL' | 'DEVELOPMENT';

const KINDS = [[GOOGLE_IDENTITY_PREFIX, 'REAL'], [DEV_LOGIN_IDENTITY_PREFIX, 'DEVELOPMENT']] as const;

/**
 * 생성 출처로만 구분한다. GitHub 연결·이메일·개발 로그인 설정으로 바꾸지 않는다.
 * 지원하지 않는 출처와 접두사뿐인 값은 null이며 실제 회원으로 추정하지 않는다.
 */
export function memberKindOf(identityReference: string): MemberKind | null {
  const match = KINDS.find(([prefix]) => identityReference.length > prefix.length && identityReference.startsWith(prefix));
  return match ? match[1] : null;
}

@Injectable()
export class MemberKindService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 인증된 회원 UUID의 구분. 회원이 없거나 ACTIVE가 아니거나 출처를 지원하지 않으면 null이다.
   * 조회 오류는 그대로 던진다. 트랜잭션 manager를 넘기면 회원 행을 읽기 잠금해 커밋 전에 판정이 바뀌지 않게 한다.
   */
  async read(memberId: string, transactionManager?: EntityManager): Promise<MemberKind | null> {
    if (transactionManager && !transactionManager.queryRunner?.isTransactionActive) throw new Error('Member kind lookup requires a transaction');
    const account = await (transactionManager ?? this.dataSource.manager).findOne(MemberAccount, { where: { memberId },
      ...(transactionManager ? { lock: { mode: 'pessimistic_read' as const } } : {}) });
    return account?.accountState === 'ACTIVE' ? memberKindOf(account.identityReference) : null;
  }
}
