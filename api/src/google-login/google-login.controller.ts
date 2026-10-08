import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { GoogleLoginService } from './google-login.service';
import { assertEmptyInput, parseGoogleLogin } from './google-input';

@Controller('auth/google')
export class GoogleLoginController {
  constructor(private readonly google: GoogleLoginService) {}

  @Public()
  @Post('authorization')
  @HttpCode(200)
  start(@Body() body: unknown, @Query() query: Record<string, unknown>) {
    assertEmptyInput(body, query);
    return this.google.start();
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown, @Query() query: Record<string, unknown>) {
    return this.google.login(parseGoogleLogin(body, query));
  }
}
