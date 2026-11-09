import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiConsentController } from './ai-consent.controller';
import { AiConsentGate } from './ai-consent.gate';

/** 동의 API와 AiConsentGate. 소비 Unit(U4·U10·U8)은 imports에 넣어 AiConsentGate를 주입받는다(C-04). */
@Module({ imports: [AuthModule], controllers: [AiConsentController], providers: [AiConsentGate], exports: [AiConsentGate] })
export class AiConsentModule {}
