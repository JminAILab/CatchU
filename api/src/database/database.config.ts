import { join } from 'node:path';
import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions';
import { SnakeNamingStrategy } from './snake-naming.strategy';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

const REQUIRED_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;

export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  // 설정 오류에도 비밀번호 값은 넣지 않는다. 기본 접속 정보는 없다.
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`DB 설정이 없습니다: ${missing.join(', ')} (api/README.md 「로컬 DB 준비」 참고)`);
  }

  const portValue = env.DB_PORT as string;
  const port = Number(portValue);
  if (!/^\d+$/.test(portValue) || port < 1 || port > 65535) {
    throw new Error('DB_PORT는 1~65535 사이의 정수여야 합니다.');
  }

  return {
    host: env.DB_HOST as string,
    port,
    username: env.DB_USER as string,
    password: env.DB_PASSWORD as string,
    database: env.DB_NAME as string,
  };
}

/** 앱(DatabaseModule)과 마이그레이션 명령(data-source.ts)이 함께 쓰는 접속·매핑 설정. */
export function buildDataSourceOptions(config: DatabaseConfig): PostgresDataSourceOptions {
  return {
    type: 'postgres',
    ...config,
    // 소스(ts-node)와 빌드(dist) 어느 쪽에서 실행해도 같은 위치를 찾는다.
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    namingStrategy: new SnakeNamingStrategy(),
    // 스키마 변경은 마이그레이션 명령으로만 한다.
    synchronize: false,
    migrationsRun: false,
    logging: false,
    connectTimeoutMS: 5000,
    // 세션 시간대를 UTC로 고정한다. timestamptz 값은 시간대와 무관하게 같은 시각이다.
    // 잠금 대기 상한(lock_timeout)은 마이그레이션도 쓰는 이 설정에 넣지 않고 앱 DB 계정에만 건다(#220, docs/lock-wait-limit.md).
    extra: { options: '-c TimeZone=UTC' },
  };
}
