import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AUTH_CONFIG, readAuthConfig } from './auth.config';
import { DevLoginController } from './dev-login.controller';
import { DevLoginGuard } from './dev-login.guard';
import { DevMemberService } from '../member-analysis/dev-member.service';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { readSessionConfig, SESSION_CLOCK, SESSION_CONFIG } from './session.config';

@Module({
  controllers: [DevLoginController, SessionController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => readAuthConfig() },
    { provide: SESSION_CONFIG, useFactory: () => readSessionConfig() },
    { provide: SESSION_CLOCK, useValue: () => Date.now() },
    SessionService,
    AccessTokenService,
    DevLoginGuard,
    DevMemberService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
  exports: [DevMemberService, AccessTokenService, SessionService, SESSION_CONFIG],
})
export class AuthModule {}
