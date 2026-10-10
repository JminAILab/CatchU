import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccessTokenService } from '../auth/access-token.service';
import { ApiError } from '../common/errors';
import { MemberAccount, MemberProfile } from '../member-analysis/member-analysis.entity';
import { GOOGLE_CONFIG, GoogleConfig } from './google.config';
import { GOOGLE_PROVIDER, GoogleProvider } from './google-provider';
import { LoginAttempts } from './login-attempts';

export interface GoogleLoginInput { state: string; loginAttemptToken: string; code?: string; error?: 'access_denied' }

@Injectable()
export class GoogleLoginService {
  private readonly attempts = new LoginAttempts();

  constructor(
    @Inject(GOOGLE_CONFIG) private readonly config: GoogleConfig,
    @Inject(GOOGLE_PROVIDER) private readonly provider: GoogleProvider,
    private readonly dataSource: DataSource,
    private readonly tokens: AccessTokenService,
  ) {}

  private assertEnabled() {
    if (!this.config.enabled) throw new ApiError('RESOURCE_UNAVAILABLE');
  }

  start() {
    this.assertEnabled();
    const attempt = this.attempts.create();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri,
      response_type: 'code', scope: 'openid profile', state: attempt.state, nonce: attempt.nonce,
      code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url'),
      code_challenge_method: 'S256', access_type: 'online' }).toString();
    return { authorizationUrl: url.href, loginAttemptToken: attempt.loginAttemptToken, expiresIn: attempt.expiresIn };
  }

  async login(input: GoogleLoginInput) {
    this.assertEnabled();
    const attempt = this.attempts.consume(input.state, input.loginAttemptToken);
    if (input.error === 'access_denied') return { cancelled: true as const };
    const identity = await this.provider.exchange(input.code!, attempt.verifier, attempt.nonce);
    // 제공자가 검증한 sub만 사용한다. 이메일·개발 회원과 자동 연결하지 않는다.
    const identityReference = 'catchu:google:' + identity.subject;
    return this.dataSource.transaction('READ COMMITTED', async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identityReference]);
      let account = await manager.findOneBy(MemberAccount, { identityReference });
      let profile: MemberProfile;
      if (!account) {
        account = Object.assign(new MemberAccount(), { identityReference, accountState: 'ACTIVE' });
        profile = Object.assign(new MemberProfile(), { memberId: account.memberId });
        await manager.insert(MemberAccount, account);
        await manager.insert(MemberProfile, profile);
      } else {
        if (account.accountState !== 'ACTIVE') throw new ApiError('AUTH_INVALID');
        const stored = await manager.findOneBy(MemberProfile, { memberId: account.memberId });
        if (!stored) throw new ApiError('INTERNAL_ERROR');
        profile = stored;
      }
      // 기존 #87 발급만 재사용. #250 세션 저장·갱신·폐기는 별도 접점이다.
      const issued = await this.tokens.issue(account.memberId);
      return { ...issued, suggestedDisplayName: profile.displayName === '' ? identity.name : null };
    }); // 최종 커밋 성공 이후에만 호출자에게 토큰을 반환한다.
  }
}
