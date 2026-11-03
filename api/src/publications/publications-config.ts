// U4 발행본 모듈의 주입 토큰과 검증 상한(U4 기능 설계 BR4.1·BR4.5·BR4.8, 성능 설계 「판정 위치와 순서」). 값은 이 파일 한곳에 둔다.
import { RateLimitOptions } from '../share-links/request-rate-limiter';

/**
 * C-10 `PublicationAccess`의 DB 구현 주입 토큰(U4 제공). `PublicationsModule`이 내보내며 U5·U10·U9가
 * `@Inject(PUBLICATION_ACCESS)`로 받는다(예: `RagAnswerModule.register({ publicationAccess: PUBLICATION_ACCESS, imports: [PublicationsModule] })`,
 * docs/rag-answer.md). 시험용 메모리 가짜(in-memory-publication-access.ts)는 이 토큰에 묶지 않는다.
 */
export const PUBLICATION_ACCESS = Symbol('PUBLICATION_ACCESS');

/** U4 자기 시계. 시험에서 만료·빈도를 기다리지 않도록 바꾼다. share-links.service의 시계 토큰을 쓰지 않는다(보안 설계 R-01). */
export const PUBLICATIONS_CLOCK = Symbol('PUBLICATIONS_CLOCK');
export type Clock = () => Date;

/** 회원별 발행 빈도 제한기(RequestRateLimiter). 10월 발급 제한기(SHARE_LINK_ISSUE_LIMITER)와 다른 인스턴스다. */
export const PUBLISH_RATE_LIMITER = Symbol('PUBLISH_RATE_LIMITER');

/**
 * 회원별 발행 요청 빈도 1분 10회 — **임시값**(BR4.8, OQ-U4-2). 회의에서 유지 여부를 정하면 이 값만 바꾼다.
 * 기록 상한은 다른 시도 제한 기록과 같은 1만 개다.
 */
export const PUBLISH_RATE_LIMIT: RateLimitOptions = Object.freeze({ maxRequests: 10, windowMs: 60 * 1000, maxKeys: 10_000 });

/**
 * 발행본 전체 글(SnapshotTextTotal, 조각 나누기 대상 필드의 코드 포인트 합) 상한 60,000자 — **임시값**(BR4.5, OQ-U4-4).
 * AI 입력 한도(U2·U5)에 맞춰 조정한다. 검증된 값이 아니다.
 */
export const SNAPSHOT_TEXT_TOTAL_MAX = 60_000;

/** 발행 요청 검증 상한(BR4.1·BR4.5, 10월 링크 제목·비밀번호 규칙 그대로). 길이는 유니코드 코드 포인트로 센다. */
export const PUBLICATION_LIMITS = Object.freeze({
  titleMax: 50, passwordMin: 8, passwordMax: 64, itemsMin: 1, itemsMax: 20,
});

/** 작성자 목록 쪽 크기(10월 목록 규칙, NFR4.11). */
export const PUBLICATION_PAGE = Object.freeze({ defaultLimit: 20, maxLimit: 100 });

/** Catch 제목이 없을 때의 사본 제목(BR5.3, 10월 화면 표기). */
export const UNTITLED_CATCH_TITLE = '제목 없는 Catch';
