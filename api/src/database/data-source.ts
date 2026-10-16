import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, readDatabaseConfig } from './database.config';

// 마이그레이션 명령(npm run migration:*)과 테스트 실행기가 쓴다. 앱의 DatabaseModule과 같은 설정이다.
export default new DataSource(buildDataSourceOptions(readDatabaseConfig()));
