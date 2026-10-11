import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { isDevelopmentOrTest } from '../common/node-env';
import { AnalysisReceiver, ReceiverStorageError } from './analysis-receiver.service';
import { ReceiverStore, RequestContext } from './receiver.types';

export interface DevInjectionConfig { enabled: boolean }

export function readDevInjectionConfig(env: NodeJS.ProcessEnv = process.env): DevInjectionConfig {
  return {
    enabled: env.DEV_ANALYSIS_INJECTION_ENABLED === 'true' && isDevelopmentOrTest(env),
  };
}

function fill(value: unknown, context: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((entry) => fill(entry, context));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fill(entry, context)]));
  }
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, name: string) => {
    if (!Object.hasOwn(context, name)) throw new Error('Unknown synthetic fixture placeholder');
    return context[name];
  });
}

/** 네트워크에 공개하지 않는 개발용 내부 주입. memberId는 #87의 CurrentMemberId에서 전달한다. */
export class DevAnalysisInjection {
  constructor(
    private readonly store: ReceiverStore,
    private readonly receiver: AnalysisReceiver,
    private readonly config: DevInjectionConfig,
  ) {}

  async inject(memberId: string, requestId: string, kind: 'Result' | 'ProcessingEvent', template: unknown, caseId: string) {
    if (!this.config.enabled) throw new ForbiddenException();
    if (!memberId || !requestId || !caseId || !['Result', 'ProcessingEvent'].includes(kind)) {
      throw new ForbiddenException();
    }
    let context: RequestContext | null;
    try {
      context = await this.store.withRequest(requestId, async (tx) =>
        tx.snapshot ? structuredClone(tx.snapshot.context) : null);
    } catch {
      throw new ReceiverStorageError();
    }
    if (!context || context.memberId !== memberId) throw new NotFoundException();
    if (context.sourceMode !== 'MOCK') throw new ForbiddenException();
    // 누락된 식별자는 생성하지 않는다. #103 템플릿에 존재하는 자리표시자만 채운다.
    const message = fill(template, { ...context, caseId });
    if (message && typeof message === 'object') {
      // 템플릿의 고정 값으로 인증한 회원/선택한 요청을 우회할 수 없다.
      const fields = message as Record<string, unknown>;
      for (const key of ['requestId', 'memberId'] as const) {
        if (typeof fields[key] === 'string' && fields[key] !== '' && fields[key] !== context[key]) throw new ForbiddenException();
      }
    }
    if (kind === 'Result') {
      if (message && typeof message === 'object' && 'sourceMode' in message && message.sourceMode !== 'MOCK') {
        throw new ForbiddenException();
      }
      return this.receiver.receiveResult(message);
    }
    return this.receiver.receiveProgress(message);
  }
}
