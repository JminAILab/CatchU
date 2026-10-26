import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';

/**
 * 링크 소유 회원의 상태(#151, 계약 「P — 수신자 API」의 소유 회원 판정).
 * AVAILABLE은 회원 행이 있고 ACTIVE, INACTIVE는 회원 행이 있고 ACTIVE가 아님, NO_MEMBER는 조회 시점에 회원 행이 없음이다.
 * 결과를 수신자 응답(404·500·재판정)으로 바꾸는 것은 호출자가 정한다.
 */
export type OwnerState = 'AVAILABLE' | 'INACTIVE' | 'NO_MEMBER';

/** 공개 프로필 공급 값. 계약 PublicProfile에서 fieldSource를 뺀 다섯 항목만 담는다. */
export interface OwnerPublicProfile {
  displayName: string;
  introduction: string;
  desiredRole: string;
  skills: string[];
  /** GitHub 연결이 CONNECTED일 때만 저장된 계정명. REAUTH_REQUIRED·DISCONNECTED·연결 기록 없음은 null이다. */
  githubAccountLogin: string | null;
}

/** 비활성·회원 없음에는 프로필을 담지 않는다. */
export type OwnerProfileRead =
  | { ownerState: 'AVAILABLE'; profile: OwnerPublicProfile }
  | { ownerState: 'INACTIVE' | 'NO_MEMBER' };

/** ACTIVE 회원에 필수 프로필 행이 없다(데이터 불일치). 빈 프로필로 바꾸지 않고 호출자에게 실패로 넘긴다. */
export class OwnerProfileMissingError extends Error {
  constructor() {
    super('Active member has no profile row');
    this.name = 'OwnerProfileMissingError';
  }
}

interface StateRow { accountState: string }
interface ProfileRow extends StateRow {
  profileId: string | null;
  displayName: string;
  introduction: string;
  desiredRole: string;
  skills: string[];
  connectionState: 'CONNECTED' | 'DISCONNECTED' | 'REAUTH_REQUIRED' | null;
  accountLogin: string | null;
}

const STATE_SQL = 'SELECT a.account_state AS "accountState" FROM member_account a WHERE a.member_id = $1';
// 회원·프로필·GitHub 연결을 한 문장으로 읽어 세 값이 같은 스냅샷이 되게 한다. 잠금을 걸지 않는다.
const PROFILE_SQL = `SELECT a.account_state AS "accountState", p.profile_id AS "profileId",
  p.display_name AS "displayName", p.introduction, p.desired_role AS "desiredRole", p.skills,
  g.connection_state AS "connectionState", g.account_login AS "accountLogin"
  FROM member_account a
  LEFT JOIN member_profile p ON p.member_id = a.member_id
  LEFT JOIN github_connection g ON g.member_id = a.member_id
  WHERE a.member_id = $1`;

function stateOf(row: StateRow | undefined): OwnerState {
  if (!row) return 'NO_MEMBER';
  return row.accountState === 'ACTIVE' ? 'AVAILABLE' : 'INACTIVE';
}

/**
 * 넘겨받은 manager의 조회는 호출자의 앞뒤 조회(링크 판정)와 같은 스냅샷이어야 한다.
 * PostgreSQL READ COMMITTED는 같은 트랜잭션에서도 문장마다 새 스냅샷을 찍으므로 REPEATABLE READ·SERIALIZABLE만 받는다.
 * SHOW는 스냅샷을 찍지 않는다.
 */
async function requireSnapshotTransaction(manager: EntityManager): Promise<void> {
  if (!manager.queryRunner?.isTransactionActive) throw new Error('Owner profile reads with a manager require an active transaction');
  const [{ transaction_isolation: isolation }] = await manager.query('SHOW transaction_isolation');
  if (isolation !== 'repeatable read' && isolation !== 'serializable') {
    throw new Error('Owner profile reads with a manager require REPEATABLE READ or SERIALIZABLE isolation');
  }
}

/**
 * 수신자 조회(#151)에 링크 소유 회원의 상태와 공개 프로필을 주는 읽기 전용 함수(A).
 *
 * - 링크 판정을 통과한 링크의 소유자 ID로만 부른다. 수신자 입력으로 회원을 고르지 않는다.
 * - 각 함수는 SELECT 한 문장만 실행한다. 쓰기·행 잠금을 하지 않고, GitHub 연결 상태를 갱신하지 않으며
 *   GitHub·자격정보 보관소를 부르지 않는다. 그래서 refreshStatus()를 부르는 본인 조회(MemberProfileService.read)를 쓰지 않는다.
 * - manager를 넘기면 그 manager로만 실행하고 트랜잭션을 새로 열거나 끝내지 않는다(활성 REPEATABLE READ 이상만).
 *   넘기지 않으면 트랜잭션 없이 그 한 문장만 실행한다.
 * - DB 오류는 그대로 던지고, ACTIVE 회원의 필수 프로필 누락은 OwnerProfileMissingError다. 정상 결과로 바꾸지 않는다.
 */
@Injectable()
export class OwnerProfileReader {
  constructor(private readonly dataSource: DataSource) {}

  async readOwnerState(ownerId: string, manager?: EntityManager): Promise<OwnerState> {
    const rows = await this.select<StateRow>(STATE_SQL, ownerId, manager);
    return stateOf(rows[0]);
  }

  async readPublicProfile(ownerId: string, manager?: EntityManager): Promise<OwnerProfileRead> {
    const [row] = await this.select<ProfileRow>(PROFILE_SQL, ownerId, manager);
    const ownerState = stateOf(row);
    if (ownerState !== 'AVAILABLE') return { ownerState };
    if (row.profileId === null) throw new OwnerProfileMissingError();
    return { ownerState, profile: {
      displayName: row.displayName, introduction: row.introduction, desiredRole: row.desiredRole, skills: [...row.skills],
      // REAUTH_REQUIRED도 최근 계정명을 남기므로 저장값이 아니라 상태로 거른다.
      githubAccountLogin: row.connectionState === 'CONNECTED' ? row.accountLogin : null,
    } };
  }

  private async select<T>(sql: string, ownerId: string, manager?: EntityManager): Promise<T[]> {
    // 링크의 소유자 ID(uuid 칼럼)만 받는다. 형식 오류로 호출자의 트랜잭션을 실패 상태로 만들지 않게 조회 전에 거른다.
    if (!isUUID(ownerId)) throw new TypeError('Owner id must be a UUID');
    if (!manager) return this.dataSource.query(sql, [ownerId]);
    await requireSnapshotTransaction(manager);
    return manager.query(sql, [ownerId]);
  }
}
