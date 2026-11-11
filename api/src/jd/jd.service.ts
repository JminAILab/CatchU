import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { decodeCursor, encodeCursor } from './jd-cursor';
import { assertJdId, parseJdInput } from './jd-input';
import { Jd } from './jd.entity';

/** 소유 조건은 cursor에 의존하지 않고 모든 조회에 적용한다. */
export async function findOwnJd(manager: EntityManager, memberId: string, jdId: string, lock = false): Promise<Jd> {
  assertJdId(jdId);
  const jd = await manager.getRepository(Jd).findOne({ where: { memberId, jdId },
    ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
  if (!jd) throw new ApiError('RESOURCE_UNAVAILABLE');
  return jd;
}

@Injectable()
export class JdService {
  constructor(private readonly dataSource: DataSource) {}

  async list(memberId: string, cursor: unknown) {
    const after = decodeCursor(cursor);
    const query = this.dataSource.getRepository(Jd).createQueryBuilder('jd')
      .select(['jd.jdId', 'jd.title', 'jd.updatedAt']).where('jd.memberId = :memberId', { memberId });
    if (after) query.andWhere('(jd.updatedAt, jd.jdId) < (:at, :id)', after);
    const rows = await query.orderBy('jd.updatedAt', 'DESC').addOrderBy('jd.jdId', 'DESC').take(21).getMany();
    const items = rows.slice(0, 20);
    const last = items.at(-1);
    return { items: items.map(({ jdId, title, updatedAt }) => ({ jdId, title, updatedAt })),
      nextCursor: rows.length > 20 && last ? encodeCursor(last.updatedAt, last.jdId) : null };
  }

  async detail(memberId: string, jdId: string) {
    const { title, body, createdAt, updatedAt } = await findOwnJd(this.dataSource.manager, memberId, jdId);
    return { jdId, title, body, createdAt, updatedAt };
  }

  async create(memberId: string, body: unknown) {
    const input = parseJdInput(body);
    const now = new Date();
    const jd = this.dataSource.getRepository(Jd).create({ ...input, memberId, createdAt: now, updatedAt: now });
    await this.dataSource.manager.insert(Jd, jd);
    return this.detail(memberId, jd.jdId);
  }

  async update(memberId: string, jdId: string, body: unknown) {
    assertJdId(jdId);
    const input = parseJdInput(body);
    const result = await this.dataSource.manager.update(Jd, { memberId, jdId }, { ...input, updatedAt: new Date() });
    if (!result.affected) throw new ApiError('RESOURCE_UNAVAILABLE');
    return this.detail(memberId, jdId);
  }

  async delete(memberId: string, jdId: string): Promise<void> {
    assertJdId(jdId);
    const result = await this.dataSource.manager.delete(Jd, { memberId, jdId });
    if (!result.affected) throw new ApiError('RESOURCE_UNAVAILABLE');
  }
}
