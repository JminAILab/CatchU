import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * 성공 응답에도 Cache-Control: no-store를 붙인다(명세: 회원·수신자의 모든 응답).
 * 오류 응답은 ApiExceptionFilter가 붙인다. 처리기 실행 전에 설정하므로 처리기가 다른 값을 지정하면 그 값이 우선한다.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>().setHeader('Cache-Control', 'no-store');
    }
    return next.handle();
  }
}
