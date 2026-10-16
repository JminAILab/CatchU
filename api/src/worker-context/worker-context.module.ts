import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { GitHubConnectionModule } from '../github-connection/github-connection.module';
import { WorkerContextController } from './worker-context.controller';
import { WorkerContextService } from './worker-context.service';
import { WORKER_REPOSITORY_SELECTION_SOURCE, WorkerRepositorySelectionSource } from './worker-context.types';

@Module({})
export class WorkerContextModule {
  static register(options: { selectionSource: WorkerRepositorySelectionSource }): DynamicModule {
    if (!options?.selectionSource || typeof options.selectionSource.resolve !== 'function') {
      throw new Error('WorkerContextModule requires a repository selection source');
    }
    return {
      module: WorkerContextModule,
      imports: [AuthModule, DatabaseModule, GitHubConnectionModule],
      controllers: [WorkerContextController],
      providers: [WorkerContextService,
        { provide: WORKER_REPOSITORY_SELECTION_SOURCE, useValue: options.selectionSource }],
    };
  }
}
