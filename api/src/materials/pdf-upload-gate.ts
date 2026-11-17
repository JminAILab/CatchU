import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/errors';
import { RateLimitOptions, RequestRateLimiter } from '../share-links/request-rate-limiter';

/**
 * 회원별 PDF 업로드 횟수 10분 5건(#574, 팀장 결정 2026-11-16). 창 10분은 추출 시한(큐 대기 포함 10분)과 같은 길이로,
 * 한 회원이 그 시한 동안 추출 줄에 넣을 수 있는 양을 묶는다. 기록 상한은 다른 빈도 제한 기록과 같은 1만 개다.
 */
export const PDF_UPLOAD_RATE_LIMIT: RateLimitOptions = Object.freeze({ maxRequests: 5, windowMs: 10 * 60 * 1000, maxKeys: 10_000 });

/**
 * 진행 중 업로드 수 상한(#574). 업로드는 파일을 api 메모리에 받으므로(파일당 최대 20 MB) 전체 8건이면 받는 버퍼는 최대 160 MB다
 * (multer가 받은 조각을 한 덩이로 합치는 순간에는 그 건만 잠깐 두 배).
 * 회원당 2건은 화면이 한 번에 하나씩 보내는 평소 사용(탭 두 개까지)을 막지 않는 값이다.
 */
export const PDF_UPLOAD_SLOTS = Object.freeze({ total: 8, perMember: 2 });

/**
 * PDF 업로드 본문을 받기 전의 관문(#574). 진행 중 업로드 수(전체·회원당)와 회원별 횟수를 본다.
 *
 * - 넘으면 `429 RATE_LIMITED`다. 횟수 초과에는 `Retry-After`가 붙고, 진행 중 수 초과에는 붙지 않는다(언제 비는지 알 수 없다).
 * - 진행 중 수를 먼저 보고 그다음 횟수를 센다. 자리가 없어 거부된 요청은 횟수를 쓰지 않는다.
 * - 받은 요청은 본문 검사에서 떨어져도 횟수에 든다(발행의 「빈도 → 입력」과 같은 순서).
 * - 기록은 프로세스 메모리다(api 프로세스 1개 전제, `RequestRateLimiter`와 같다). 재시작하면 지워지고, 프로세스가 늘면 헐거워진다.
 * - 회원 ID는 로그·응답에 내보내지 않는다.
 */
@Injectable()
export class PdfUploadGate {
  private readonly rate = new RequestRateLimiter(PDF_UPLOAD_RATE_LIMIT);
  private readonly inFlight = new Map<string, number>();
  private total = 0;

  /**
   * 업로드 하나를 받을지 정한다. 받으면 자리를 하나 잡고, 그 자리를 돌려주는 함수를 준다.
   * 호출자는 본문을 읽기 직전에 부르고, 요청 처리가 어떻게 끝나든(성공·거부·연결 끊김) 돌려주는 함수를 한 번 부른다.
   */
  enter(memberId: string): () => void {
    const mine = this.inFlight.get(memberId) ?? 0;
    if (this.total >= PDF_UPLOAD_SLOTS.total || mine >= PDF_UPLOAD_SLOTS.perMember) throw new ApiError('RATE_LIMITED');
    const rate = this.rate.take(memberId, this.now());
    if (!rate.allowed) throw new ApiError('RATE_LIMITED', { retryAfterSeconds: rate.retryAfterSeconds });
    this.total += 1;
    this.inFlight.set(memberId, mine + 1);
    let left = false;
    return () => {
      if (left) return;
      left = true;
      this.total -= 1;
      const remaining = (this.inFlight.get(memberId) ?? 1) - 1;
      if (remaining <= 0) this.inFlight.delete(memberId);
      else this.inFlight.set(memberId, remaining);
    };
  }

  /** 지금 진행 중인 업로드 수(시험·진단용). */
  get active(): number {
    return this.total;
  }

  /** 횟수 창의 기준 시각. 시험이 창을 기다리지 않도록 바꿔 넣는다. */
  now(): Date {
    return new Date();
  }
}
