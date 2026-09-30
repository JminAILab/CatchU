import { EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { CreationOperation, IdempotencyRecord } from './member-analysis.entity';
import { requireCreationTransaction } from './transaction';

export interface CreationKey {
  memberId: string;
  operation: CreationOperation;
  key: string;
  /** 작업별 정규화 값의 SHA-256 소문자 hex. 비밀번호 원문·해시는 넣지 않는다. */
  requestFingerprint: string;
}
export interface CreationReference {
  requestId: string | null;
  linkId: string | null;
  /** 응답을 다시 구성할 자원의 안전한 참조. 응답 원문·토큰·비밀번호를 저장하지 않는다. */
  responseReference: string;
}
export interface CreationCallbacks<T> {
  create(manager: EntityManager): Promise<CreationReference>;
  /** 지문이 같아도 반드시 실행. C는 링크를 읽어 isSameShareCreate를 호출한다. */
  isSame(manager: EntityManager, record: Readonly<IdempotencyRecord>): Promise<boolean>;
  /** 신규·재요청 모두 같은 트랜잭션에서 응답 구성. 조회 실패도 전체 롤백한다. */
  readResponse(manager: EntityManager, record: Readonly<IdempotencyRecord>): Promise<T>;
}

function assertReference(record: CreationKey & CreationReference): void {
  const analysis = record.operation === 'createAnalysisRequest';
  if ((analysis && (!record.requestId || record.linkId !== null)) ||
      (!analysis && (!record.linkId || record.requestId !== null)) ||
      typeof record.responseReference !== 'string' || record.responseReference.length === 0) {
    throw new Error('Creation reference is inconsistent');
  }
}

async function assertOwner(manager: EntityManager, record: CreationKey & CreationReference): Promise<void> {
  assertReference(record);
  // 이 고정 분기만 SQL에 쓰며 외부 입력을 식별자에 삽입하지 않는다.
  const rows: { owner: string }[] = record.operation === 'createAnalysisRequest'
    ? await manager.query('SELECT member_id AS owner FROM analysis_request WHERE request_id = $1 FOR KEY SHARE', [record.requestId])
    : await manager.query('SELECT owner_id AS owner FROM share_link WHERE link_id = $1 FOR KEY SHARE', [record.linkId]);
  if (rows.length !== 1 || rows[0].owner !== record.memberId) throw new Error('Creation owner reference is inconsistent');
}

/**
 * 키 예약(트랜잭션 advisory lock) → 자원 생성 → 멱등 기록·응답 구성을 동일 manager로 처리.
 * DB 유일성은 최종 방어다. 예외를 삼키지 말고 트랜잭션 밖으로 전달해야 한다.
 * 반환 뒤에도 바깥 트랜잭션 커밋을 기다린 다음 HTTP 응답을 보낸다.
 */
export async function runIdempotentCreation<T>(
  manager: EntityManager, input: CreationKey, callbacks: CreationCallbacks<T>,
): Promise<{ replayed: boolean; response: T }> {
  await requireCreationTransaction(manager);
  if (typeof input.key !== 'string' || [...input.key].length < 1 || [...input.key].length > 128) {
    throw new ApiError('INVALID_REQUEST');
  }
  // operation과 지문은 서버 내부 값이다. 원문을 오류 메시지에 포함하지 않는다.
  if (!['createAnalysisRequest', 'createShareLink'].includes(input.operation) ||
      typeof input.requestFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(input.requestFingerprint)) {
    throw new ApiError('INTERNAL_ERROR');
  }
  // JSON tuple로 키 경계 충돌을 피한다. 해시 충돌은 추가 대기만 만들며 자료를 합치지 않는다.
  const lock = JSON.stringify(['catchu:idempotency', input.memberId, input.operation, input.key]);
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lock]);
  const repository = manager.getRepository(IdempotencyRecord);
  const existing = await repository.findOneBy({ memberId: input.memberId, operation: input.operation, key: input.key });
  if (existing) {
    await assertOwner(manager, existing);
    if (existing.requestFingerprint !== input.requestFingerprint) throw new ApiError('IDEMPOTENCY_CONFLICT');
    // DB 오류·기록 불일치는 409로 감싸지 않는다.
    if (!await callbacks.isSame(manager, existing)) throw new ApiError('IDEMPOTENCY_CONFLICT');
    return { replayed: true, response: await callbacks.readResponse(manager, existing) };
  }
  const reference = await callbacks.create(manager);
  const record = Object.assign(new IdempotencyRecord(), input, reference);
  await assertOwner(manager, record);
  await repository.insert(record);
  return { replayed: false, response: await callbacks.readResponse(manager, record) };
}
