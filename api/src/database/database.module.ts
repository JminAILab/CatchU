import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { buildDataSourceOptions, readDatabaseConfig } from './database.config';

async function connect(options?: DataSourceOptions): Promise<DataSource> {
  if (!options || options.type !== 'postgres') throw new Error('PostgreSQL 설정이 필요합니다.');
  try {
    return await new DataSource(options).initialize();
  } catch (error) {
    // 접속 대상만 알리고 비밀번호는 넣지 않는다.
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`DB에 접속하지 못했습니다(${options.host}:${options.port}/${options.database}): ${reason}. `
      + 'DB 실행 상태와 DB_* 설정을 확인하세요(api/README.md 「로컬 DB 준비」).', { cause: error });
  }
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...buildDataSourceOptions(readDatabaseConfig()),
        // DB가 꺼져 있으면 오래 기다리지 않고 기동을 멈춘다(기본값은 9회×3초).
        retryAttempts: 2,
        retryDelay: 1000,
      }),
      dataSourceFactory: connect,
    }),
  ],
})
export class DatabaseModule {}
