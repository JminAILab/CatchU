// 한국 시간 날짜·다음 자정 계산과 질문 횟수 키(기능 설계 BR3.1, scalability-design NFR4.7). 순수 함수다.
// 날짜 문자열은 하루 실행 제한(C-03)과 같은 함수(koreanUsageDate)를 쓴다.
import { koreanUsageDate } from '../daily-run-limit/daily-run-limit';

/** 한국 시간(UTC+9, 서머타임 없음). */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export { koreanUsageDate };

/** now 다음에 오는 한국 시간 자정(유닉스 초). 질문 횟수 키의 EXPIREAT 값이다. 정각 자정이면 그 다음 날 자정이다. */
export function nextKoreanMidnightSeconds(now: Date): number {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('now는 유효한 Date여야 합니다.');
  const kstMs = now.getTime() + KST_OFFSET_MS;
  const nextKstMidnightMs = (Math.floor(kstMs / DAY_MS) + 1) * DAY_MS;
  return (nextKstMidnightMs - KST_OFFSET_MS) / 1000;
}

/** 질문 횟수 Redis 키 `{prefix}:qna-question-count:{publicationId}:{YYYY-MM-DD}`(한국 시간 날짜, BR3.1·BR3.3). */
export function questionCountKey(prefix: string, publicationId: string, now: Date): string {
  return `${prefix}:qna-question-count:${publicationId}:${koreanUsageDate(now)}`;
}
