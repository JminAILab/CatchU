import { Controller, Get, Param, Req } from '@nestjs/common';
import { WorkerContextOnly } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { WorkerContextService } from './worker-context.service';

@Controller('internal/analysis-attempts')
export class WorkerContextController {
  constructor(private readonly contexts: WorkerContextService) {}

  @WorkerContextOnly()
  @Get(':attemptId/context')
  read(@Param('attemptId') attemptId: string, @Req() request: {
    query: Record<string, unknown>; body?: unknown; headers: Record<string, string | string[] | undefined>;
  }) {
    // GET 본문도 받지 않는다. body parser가 처리하지 않는 media type까지 길이로 거부한다.
    if (Object.keys(request.query).length !== 0 || request.body !== undefined ||
        request.headers['transfer-encoding'] !== undefined ||
        (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) {
      throw new ApiError('INVALID_REQUEST');
    }
    return this.contexts.read(attemptId);
  }
}
