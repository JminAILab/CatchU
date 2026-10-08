import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GOOGLE_CONFIG, readGoogleConfig, GoogleConfig } from './google.config';
import { GOOGLE_PROVIDER, HttpGoogleProvider } from './google-provider';
import { GoogleLoginService } from './google-login.service';
import { GoogleLoginController } from './google-login.controller';

@Module({
  imports: [AuthModule],
  controllers: [GoogleLoginController],
  providers: [
    { provide: GOOGLE_CONFIG, useFactory: () => readGoogleConfig() },
    { provide: GOOGLE_PROVIDER, inject: [GOOGLE_CONFIG], useFactory: (config: GoogleConfig) => new HttpGoogleProvider(config) },
    GoogleLoginService,
  ],
})
export class GoogleLoginModule {}
