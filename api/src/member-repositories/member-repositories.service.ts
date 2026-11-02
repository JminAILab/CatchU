import { ForbiddenException, Injectable } from '@nestjs/common';
import { ApiError } from '../common/errors';
import { GitHubConnectionService } from '../github-connection/github-connection.service';
import { DevMemberService } from '../member-analysis/dev-member.service';
import { MemberKindService } from '../member-analysis/member-kind';
import { parseRepositoryQuery, repositoryPage, RepositoryQuery } from './repository-page';
import { RepositoryRegistrationService } from './repository-registration.service';

@Injectable()
export class MemberRepositoriesService {
  constructor(private readonly connections: DevMemberService, private readonly members: MemberKindService,
    private readonly github: GitHubConnectionService, private readonly selections: RepositoryRegistrationService) {}

  async list(memberId: string, rawQuery: Record<string, unknown>) {
    // #104 이전 문자열 토큰을 PostgreSQL UUID 조회에 넘기지 않는다.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(memberId)) {
      throw new ApiError('AUTH_INVALID');
    }
    const query = parseRepositoryQuery(rawQuery);
    // 회원 생성 출처로만 공급을 고른다(#322). 개발 회원은 실제 GitHub 연결이 있어도 개발 공급을 쓰고,
    // 실제 회원의 목록은 개발 로그인 설정과 관계없다. 조회 오류는 그대로 500이다.
    const kind = await this.members.read(memberId);
    if (kind === 'DEVELOPMENT') return this.development(memberId, query);
    if (kind !== 'REAL') throw new ForbiddenException();
    // GET /me와 같이 보관 자격정보의 만료·이용 불가를 #231 연결 상태에 먼저 반영한다.
    await this.github.refreshStatus(memberId);
    return repositoryPage(memberId, await this.selections.listEligible(memberId), query);
  }

  private async development(memberId: string, query: RepositoryQuery) {
    // #104의 공급자를 그대로 재사용한다. 조회 예외를 성공 빈 목록으로 바꾸지 않는다.
    const connection = await this.connections.readConnection(memberId);
    if (connection.connectionState === 'DISCONNECTED' || connection.connectionState === 'REAUTH_REQUIRED') {
      throw new ApiError('GITHUB_CONNECTION_REQUIRED');
    }
    if (connection.connectionState !== 'CONNECTED') throw new Error('Invalid connection state');
    return repositoryPage(memberId, connection.repositories, query);
  }
}
