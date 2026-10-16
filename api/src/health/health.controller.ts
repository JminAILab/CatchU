import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
