import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { isUUID } from 'class-validator';
import { ApiError } from '../common/errors';
import { AUTH_CONFIG, AuthConfig } from './auth.config';

// #87 내부 토큰 형식. 기능 코드는 이 값이나 JWT claim에 의존하지 않는다.
const ISSUER = 'catchu-api';
const AUDIENCE = 'catchu-member-api';

export function isMemberId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

@Injectable()
export class AccessTokenService {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  async issue(memberId: string, sessionId: string) {
    if (!isSessionId(memberId) || !isSessionId(sessionId)) throw new ApiError('AUTH_INVALID');
    const issuedAt = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(memberId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.config.accessTokenTtlSeconds)
      .sign(this.config.signingKey);
    return { accessToken, tokenType: 'Bearer', expiresIn: this.config.accessTokenTtlSeconds };
  }

  async verify(token: string): Promise<{ memberId: string; sessionId: string }> {
    try {
      const { payload } = await jwtVerify(token, this.config.signingKey, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        typ: 'JWT',
        requiredClaims: ['sub', 'sid', 'exp', 'iat'],
      });
      if (!isSessionId(payload.sub) || !isSessionId(payload.sid) || !Number.isSafeInteger(payload.iat) ||
          !Number.isSafeInteger(payload.exp) || payload.iat! > Math.floor(Date.now() / 1000) ||
          payload.exp! <= payload.iat!) {
        throw new ApiError('AUTH_INVALID');
      }
      return { memberId: payload.sub, sessionId: payload.sid };
    } catch {
      // 라이브러리 오류, 헤더, 토큰을 응답이나 로그에 전달하지 않는다.
      throw new ApiError('AUTH_INVALID');
    }
  }
}

export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && isUUID(value);
}
