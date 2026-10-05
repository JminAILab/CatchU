import { INestApplication } from '@nestjs/common';
import { isDevelopmentOrTest } from './common/node-env';

/**
 * 개발용 CORS(#106). web이 다른 출처에서 api를 부를 때만 켠다.
 *
 * - `CORS_ALLOWED_ORIGINS`: 쉼표로 구분한 출처 목록. 비어 있거나 없으면 CORS를 켜지 않는다(교차 출처 요청 차단).
 * - 출처는 `http(s)://호스트[:포트]` 형태와 정확히 같아야 한다. `*`·경로·끝 슬래시·쿼리는 받지 않는다.
 * - http 출처는 NODE_ENV가 development·test일 때만 받는다. 그 밖(production·미지정 포함)에서 하나라도 있으면 기동을 멈춘다(#218).
 * - 쿠키를 쓰지 않으므로(토큰은 Authorization 헤더) credentials를 허용하지 않는다.
 * - 운영 값과 쿠키·CSRF 정책은 OQ-A1에서 정한다.
 */
export const CORS_ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Link-Grant'] as const;
/** 수신자 비밀번호 시도 제한의 남은 시간(#150, #173 계약). 교차 출처에서는 노출해야 web이 읽는다. */
export const CORS_EXPOSED_HEADERS = ['Retry-After'] as const;

export function readCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const value = env.CORS_ALLOWED_ORIGINS;
  if (value === undefined || value.trim() === '') return [];
  const allowHttp = isDevelopmentOrTest(env);
  return value.split(',').map((raw) => {
    const origin = raw.trim();
    const parsed = URL.canParse(origin) ? new URL(origin) : null;
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin) {
      // 값 자체는 오류에 넣지 않는다.
      throw new Error('CORS_ALLOWED_ORIGINS는 쉼표로 구분한 출처(예: http://localhost:3000)여야 합니다.');
    }
    if (!allowHttp && parsed.protocol !== 'https:') {
      throw new Error('CORS_ALLOWED_ORIGINS는 NODE_ENV가 development·test가 아니면 https 출처만 받습니다.');
    }
    return origin;
  });
}

/** app.init() 전에 불러야 라우터보다 앞에서 동작한다. */
export function applyCors(app: INestApplication, env: NodeJS.ProcessEnv = process.env): void {
  const origins = readCorsOrigins(env);
  if (origins.length === 0) return;
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
    exposedHeaders: [...CORS_EXPOSED_HEADERS],
    credentials: false,
    maxAge: 600,
  });
}
