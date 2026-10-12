import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/errors';
import { DevMemberService } from '../member-analysis/dev-member.service';
import { parseRepositoryQuery, repositoryPage } from './repository-page';

@Injectable()
export class MemberRepositoriesService {
  constructor(private readonly connections: DevMemberService) {}

  async list(memberId: string, rawQuery: Record<string, unknown>) {
    // #104 이전 문자열 토큰을 PostgreSQL UUID 조회에 넘기지 않는다.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(memberId)) {
      throw new ApiError('AUTH_INVALID');
    }
    const query = parseRepositoryQuery(rawQuery);
    // #104의 공급자를 그대로 재사용한다. 조회 예외를 성공 빈 목록으로 바꾸지 않는다.
    const connection = await this.connections.readConnection(memberId);
    if (connection.connectionState === 'DISCONNECTED' || connection.connectionState === 'REAUTH_REQUIRED') {
      throw new ApiError('GITHUB_CONNECTION_REQUIRED');
    }
    if (connection.connectionState !== 'CONNECTED') throw new Error('Invalid connection state');
    return repositoryPage(memberId, connection.repositories, query);
  }
}
