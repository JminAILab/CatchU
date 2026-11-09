# U4 발행·링크 — 성능 설계

## Sources

작성일: 2026-10-29. 입력: [U4 비기능 요구사항](../nfr-requirements/)(performance-requirements·security-requirements·scalability-requirements·reliability-requirements·observability-requirements·tech-stack-decisions) 가운데 특히 [성능 요구사항](../nfr-requirements/performance-requirements.md)(performance-requirements) NFR4.1~NFR4.7, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec) W3·W4·W5, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) C-10, [비기능 설계 질문·답변](nfr-design-questions.md) Q1, 10월 api 문서 `api/docs/lock-wait-limit.md`·`api/docs/share-links.md`.

## 설계

응답 목표가 없으므로(NFR4.1) 성능 설계는 상한을 어디서 판정하는지와 트랜잭션을 짧게 두는 방법이다. 캐시는 두지 않는다.

### 판정 위치와 순서

발행 요청(`POST /v1/publications`)은 아래 순서로 판정해 비싼 일을 뒤로 미룬다.

| 순서 | 판정 | 실패 응답 | 요구사항 |
|---|---|---|---|
| 1 | 회원 인증(10월 전역 Guard) | 401 | security NFR1.1 |
| 2 | 회원별 발행 빈도(10월 `RequestRateLimiter`, 키는 회원 ID, 1분 10회 **임시값**) | 429 `RATE_LIMITED` + `Retry-After` | NFR4.4 |
| 3 | 본문 형식·제목·비밀번호·항목 수·중복(트랜잭션 밖) | 400 `VALIDATION_FAILED` | NFR4.2 |
| 4 | 외부 AI 동의(`AiConsentGate.require`) | 403 `AI_CONSENT_REQUIRED` | security NFR2.1 |
| 5 | 토큰 생성·비밀번호 scrypt 검증값 계산(트랜잭션 밖) | — | NFR4.6 |
| 6 | 트랜잭션(하루 횟수 → 원본 잠금·재읽기 → 전체 글 계산 → 쓰기 → 공개 전환 → 조각 나누기) | 429·404·409·400·500 | NFR4.3, NFR4.6, reliability NFR5.1 |

- 상한 값은 한곳(발행 설정 상수)에 모은다. 임시값 두 개(전체 글 60,000자, 1분 10회)는 상수 이름에 임시임을 드러내는 주석을 달고, 값만 바꾸면 되게 한다(OQ-U4-2·OQ-U4-4).
- 길이는 코드 포인트로 센다(`[...value].length`). 제목은 앞뒤 공백을 지운 뒤 센다(NFR4.2).

### 트랜잭션을 짧게

- 원본 잠금 순서: Catch를 `catch_id` 오름차순으로, 그다음 텍스트 자료를 `text_material_id` 오름차순으로 `FOR UPDATE` 잠근다. 같은 원본을 고른 두 발행이 서로 반대 순서로 잠가 교착되는 것을 막는다(NFR4.6).
- 전체 글(SnapshotTextTotal)은 잠근 뒤 다시 읽은 원본으로 트랜잭션 안에서 센다(NFR4.3).
- 잠금 대기 상한은 앱 DB 계정의 `lock_timeout = '3s'`(10월 #220)를 그대로 받는다. U4 코드에 따로 두지 않는다(NFR4.5).

### 읽기

- 받은 사람 열람은 요청마다 토큰 형식 확인 → 발행본 한 행 조회 → 판정 → 항목 읽기 순서다. 판정 결과·사본을 캐시하지 않는다(NFR4.7).
- 작성자 목록은 10월 cursor 방식(발행 시각 최신순, 같은 시각은 ID로 정렬)으로 나눠 읽는다(scalability NFR4.11).

## 하지 않는 것

- 응답 캐시·CDN·연결 풀 조정·비동기 큐 추가는 하지 않는다(NFR4.1, NFR4.7).
- 발행 응답 시간·처리량 측정은 하지 않는다.
