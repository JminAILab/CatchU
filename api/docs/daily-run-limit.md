# 계정당 하루 실행 제한·첫 이용 동의 — 12월 intent U2

분석·기본 요약 생성/다시 만들기·JD 요약을 계정당 하루 횟수 하나로 세는 `DailyRunLimit`(`src/daily-run-limit/`)과, 외부 AI 전송 첫 이용 동의 `AiConsentGate`·`GET/POST /v1/ai-consent`(`src/ai-consent/`)다.

기준 문서: [계약 C-03·C-04](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md), [U2 업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md) BR1·BR2, [U2 성능 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/nfr-design/performance-design.md) NFR4.3.

## DailyRunLimit

```typescript
// 모듈 imports에 DailyRunLimitModule. 동의가 필요한 기능은 AiConsentGate.require를 먼저 부른다(BR2.2).
const decision = await dailyRunLimit.consume(memberId, 'JD_SUMMARY', new Date(), manager /* 선택 */);
if (decision === 'LIMIT_REACHED') throw new ApiError('DAILY_LIMIT_REACHED'); // 429 "오늘 한도에 도달했습니다"
```

- 한도는 코드 상수 `DAILY_RUN_LIMIT = 30` 하나다. 바꾸려면 코드 PR로 바꾼다(BR1.7).
- 날짜는 한국 시간(UTC+9) 날짜다(BR1.2). 표 `daily_execution_count`의 (회원, 날짜) 행 하나에 세 종류를 합산한다.
- 판정은 조건부 쓰기 한 문장(`INSERT … ON CONFLICT … DO UPDATE SET count = count + 1 WHERE count < 30 RETURNING count`)이다. 행이 돌아오면 `ALLOWED`. 동시에 부른 둘이 남은 1회를 함께 쓰지 않고, api가 여러 개여도 맞다(BR1.3, NFR4.3·NFR4.7).
- `manager`를 넘기면 그 트랜잭션 안에서 쓴다. 호출자가 되돌리면 횟수도 되돌아간다(발행, C-03). 실행이 나중에 실패해도 줄이지 않는다.
- 질의응답·[검색 다시 준비]·열람은 `consume`을 부르지 않는다(BR1.1·BR1.5). 모르는 종류는 `TypeError`, DB 오류(없는 회원 포함)는 그대로 던진다.
- 어떤 응답에도 횟수·남은 횟수·한도 값을 넣지 않는다(BR1.4). 429에 `Retry-After`도 없다.

## AiConsentGate와 동의 API

| 경로 | 응답 |
|---|---|
| `GET /v1/ai-consent` | `{ consented, noticeVersion }`(현재 판본 기준) |
| `POST /v1/ai-consent` `{ noticeVersion }` | 현재 판본이면 기록하고 204(이미 있으면 그대로 204). 다른 판본·추가 필드·쿼리는 400 `VALIDATION_FAILED`. 기록을 바꾸므로 허용 출처(`AUTH_WEB_ORIGIN`) 검사를 한다(다르면 403 `AUTH_ORIGIN_FORBIDDEN`) |

- `require(memberId)`: 현재 판본 동의가 없으면 `AiConsentRequired`를 던진다. 그대로 두면 공통 필터가 403 `AI_CONSENT_REQUIRED`로 응답한다. 소비 Unit은 하루 횟수보다 먼저 부른다(동의 없으면 횟수를 쓰지 않음).
- 현재 판본은 `AI_NOTICE_VERSION`(api `src/ai-consent/ai-consent.gate.ts`)이며 web 동의 창(`web/src/components/ai-consent/ai-consent-notice.ts`)의 같은 상수와 같아야 한다(web 시험 `u2-consent`가 둘을 대조한다). 고지 문구를 바꾸면 두 값을 함께 올리고, 올리면 모든 회원이 다시 동의한다(BR2.1).
- 분석은 10월 요청별 동의(`analysis_consent`)를 그대로 쓰며 이 동의를 요구하지 않는다(BR2.6).
- 두 표(`daily_execution_count`, `ai_consent`)는 회원을 따라 지워진다([탈퇴 연쇄 삭제](member-withdrawal-deletion.md)).

## 시험

`test/u2/daily-run-limit.test.cjs`(6개: S1~S4, 트랜잭션 되돌림, 잘못된 호출), `test/u2/ai-consent.test.cjs`(6개: S5·S6, 재전송, 인증·출처 거부, 판본 올림), `test/db/member-cascade-delete.test.cjs`(두 표의 연쇄 삭제).
