import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { GitHubConnection, MemberAccount, MemberProfile } from '../member-analysis/member-analysis.entity';
import { ProfileInput, validateProfileInput } from './profile-input';

function profileResponse(profile: MemberProfile): ProfileInput {
  return { displayName: profile.displayName, introduction: profile.introduction,
    desiredRole: profile.desiredRole, skills: [...profile.skills] };
}

@Injectable()
export class MemberProfileService {
  constructor(private readonly dataSource: DataSource) {}

  private async requireMember(manager: EntityManager, memberId: string, lock = false): Promise<void> {
    if (!isUUID(memberId)) throw new ApiError('RESOURCE_UNAVAILABLE');
    const account = await manager.findOne(MemberAccount, { where: { memberId },
      ...(lock ? { lock: { mode: 'pessimistic_read' as const } } : {}) });
    if (!account || account.accountState !== 'ACTIVE') throw new ApiError('RESOURCE_UNAVAILABLE');
  }

  async read(memberId: string) {
    return this.dataSource.transaction('REPEATABLE READ', async manager => {
      await this.requireMember(manager, memberId);
      const profile = await manager.findOneBy(MemberProfile, { memberId });
      // 제공 가능한 회원에는 필수 프로필이 있다. 불일치를 이름 미저장으로 바꾸지 않는다.
      if (!profile) throw new ApiError('INTERNAL_ERROR');
      const connection = await manager.findOneBy(GitHubConnection, { memberId });
      return { memberId, profile: profileResponse(profile), github: {
        state: connection?.connectionState ?? 'DISCONNECTED', accountLogin: connection?.accountLogin ?? null,
      } };
    });
  }

  async replace(memberId: string, body: unknown): Promise<ProfileInput> {
    const input = validateProfileInput(body);
    // transaction Promise가 성공한 뒤에만 반환한다(커밋 실패도 성공 응답이 아니다).
    return this.dataSource.transaction('READ COMMITTED', async manager => {
      await this.requireMember(manager, memberId, true);
      const profile = await manager.findOne(MemberProfile, { where: { memberId }, lock: { mode: 'pessimistic_write' } });
      if (!profile) throw new ApiError('INTERNAL_ERROR');
      // 기본 행을 새로 생성하지 않고 허용된 자가 입력 네 필드만 교체한다.
      await manager.update(MemberProfile, { profileId: profile.profileId, memberId }, input);
      return { ...input, skills: [...input.skills] };
    });
  }
}
