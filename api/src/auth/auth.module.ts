import { WORKER_CONTEXT_AUTH_CONFIG, readWorkerContextAuthConfig } from './worker-context-auth';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AUTH_CONFIG, readAuthConfig } from './auth.config';
import { DevLoginController } from './dev-login.controller';
import { DevLoginGuard } from './dev-login.guard';
import { DevMemberService } from '../member-analysis/dev-member.service';
import { MemberKindService } from '../member-analysis/member-kind';
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
    { provide: WORKER_CONTEXT_AUTH_CONFIG, useFactory: () => readWorkerContextAuthConfig() },
    AccessTokenService,
    DevLoginGuard,
    DevMemberService,
    MemberKindService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
  exports: [DevMemberService, MemberKindService, AccessTokenService, SessionService, SESSION_CONFIG],
})
export class AuthModule {}
