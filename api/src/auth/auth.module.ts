import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AUTH_CONFIG, readAuthConfig } from './auth.config';
import { DevLoginController } from './dev-login.controller';
import { DevLoginGuard } from './dev-login.guard';
import { DevMemberService } from '../member-analysis/dev-member.service';

@Module({
  controllers: [DevLoginController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => readAuthConfig() },
    AccessTokenService,
    DevLoginGuard,
    DevMemberService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
  exports: [DevMemberService],
})
export class AuthModule {}
