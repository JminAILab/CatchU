# 분석 요청 처리 시한 닫기 — #237

접수 후 처리 시한 안에 끝나지 않은 분석 요청과 반영에 실패한 요청을 api가 주기적으로 실패로 닫는다. 닫힌 요청의 회원은 진행 중 요청에 막히지 않고 새 동의로 다시 요청할 수 있다. 근거는 [2026-10-06 팀장 결정(#23)](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)과 이를 반영한 [계약 「분석 접수·상태·재요청」](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#분석-접수상태재요청)·[「공통 오류·요청 안전성」](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#공통-오류요청-안전성)([PR #292](https://github.com/JminAILab/CatchU/pull/292))이다. 서버·worker·큐·DB 장애는 앱에서 복구하지 않고 이 닫기 하나로 "진행 중에 갇히지 않기"를 지킨다.

## 시한·주기

| 값 | 기준 | 위치 |
|---|---|---|
| 처리 시한 | 접수 시각(`submittedAt`) 후 60분. 60분이 되는 순간부터 닫는다 | `ANALYSIS_PROCESSING_DEADLINE_MS`(계약 값) |
| 판정 주기 | 한 번의 판정이 끝나고 1분 뒤에 다음 판정을 한다. 반영 실패는 시한을 기다리지 않고 다음 판정에서 닫힌다. 닫을 요청이 100개를 넘거나 판정 때 수신·반영이 그 요청을 잡고 있으면 다음 판정으로 넘어간다 | `ANALYSIS_DEADLINE_CHECK_INTERVAL_MS` |
| 한 번에 다루는 요청 | 아래 표에서 닫을 수 있는 상태인 요청 100개(접수 시각 순). 남은 요청은 다음 판정에서 닫는다 | `analysis-deadline.service.ts` |

환경변수는 없다. 시간 판단에는 api 서버 시계를 쓰며 worker가 보낸 관측 시각은 쓰지 않는다.

## 닫는 규칙

`lifecycle=ACTIVE`인 요청만 본다. 실행이 멈췄다는 증거는 요구하지 않는다.

| 요청의 현재 시도 | 조건 | 바뀌는 값 |
|---|---|---|
| 처리 중(`QUEUED`·`RUNNING`·`UNCERTAIN`, 반영 `NOT_READY`) | 시한 지남 | `FAILED`/`APPLIED`/`CLOSED`. `failures`에 `{stage: DISPATCH, code: PROCESSING_DEADLINE_EXCEEDED, message: "정해진 시간 안에 분석을 마치지 못했습니다."}`를 더하고 `failureConfirmationReference`에 같은 code |
| 결과를 받고 반영 대기(`PENDING`) | 시한 지남 | 처리 결과·적합 후보 수는 그대로, `APPLY_FAILED`/`CLOSED`. `failures`에 `{stage: APPLICATION, code: PROCESSING_DEADLINE_EXCEEDED, message: "정해진 시간 안에 결과를 반영하지 못했습니다."}` |
| 반영 실패(`APPLY_FAILED`, B의 입력·맥락 거부 포함) | 시한과 무관 | `CLOSED`만. 반영 실패 기록은 그대로 |
| 그 밖의 조합(예: `APPLIED`인데 `ACTIVE`) | 시한 지남 | 판정 대상으로 고르지 않으므로 이런 행이 쌓여도 다른 요청이 밀리지 않는다. 잠근 뒤 다시 읽었을 때 이런 조합이면 바꾸지 않고 경고 로그만 남긴다. 지금 코드로는 생기지 않는 저장 상태다 |

닫힌 뒤에는 기존 수신 코드가 늦은 결과를 `PAYLOAD_CONFLICT`로 거부하고 진행 알림은 상태를 바꾸지 않는다(`TERMINAL_UNCHANGED`). 반영 대기에서 닫힌 결과를 다시 보내면 `ALREADY_RECEIVED`이며 반영하지 않는다. 처리 시한으로 닫힌 요청은 계약의 재요청 ①(실패 확정), 반영 실패로 닫힌 요청은 재요청 ②의 저장 조건을 갖춘다. 재요청 허용 판정과 접수 API는 E 영역([PR #284](https://github.com/JminAILab/CatchU/pull/284))이다.

## 잠금과 경합

요청 하나마다 한 트랜잭션(READ COMMITTED)에서 E 공통 순서인 요청 → 현재 시도로 잠그고 상태를 다시 읽은 뒤 바꾼다. 후보 조회는 잠그지 않으며 실제 판단은 잠근 뒤 한다. 잠금은 `FOR NO KEY UPDATE`라 멱등 소유 확인의 `FOR KEY SHARE`와는 겹치지 않고, 결과 수신·반영의 잠금과는 직렬화된다. 요청 잠금은 `SKIP LOCKED`로 잡아, 다른 작업이 잡고 있는 요청은 기다리지 않고 건너뛰고 다음 판정에서 다시 본다. 한 요청이 오래 잠겨 있어도 다른 요청 닫기와 판정 종료(서버 종료 포함)가 막히지 않는다. 시도를 잠그는 경로는 모두 요청을 먼저 잠그므로, 요청을 잡은 뒤의 시도 잠금은 기다린다.

- 닫기가 먼저 잠그면: 그 뒤 온 결과는 `PAYLOAD_CONFLICT`, 이미 받아 반영을 기다리던 결과는 반영 서비스가 `CONTEXT_MISMATCH`로 거부해 Catch가 생기지 않는다.
- 수신·반영이 먼저 잠그면: 닫기는 그 요청을 건너뛰고 다음 판정에서 바뀐 상태로 다시 판단한다. 반영이 끝나 `CLOSED`면 바꾸지 않고, 수신만 끝나 `PENDING`이면 반영 실패로 닫는다.
- api가 여러 대여서 같은 요청을 동시에 판정해도 한 번만 닫힌다.

## 주기 실행 장치

`src/common/periodic-task.ts`의 `PeriodicTask`가 api 안의 주기 작업을 돌린다. 한 번이 끝난 뒤 다음 실행을 예약하므로 실행이 겹치지 않고, 실행이 예외로 끝나도 오류 이름만 기록하고 다음 주기를 계속한다. 기록 함수까지 실패하면 표준 오류에 한 줄만 남기고 계속한다. `stop()`은 진행 중인 실행이 끝날 때까지 기다리며, 멈추는 중에 다시 시작해도 실행이 겹치지 않는다. 첫 실행은 시작 후 한 주기 뒤다.

- 시작은 실제 서버 진입점(`src/main.ts`)이 `listen` 뒤에 한다. `AppModule`을 띄우는 테스트는 시작하지 않으므로 주기 작업이 테스트 자료를 바꾸지 않는다.
- 앱이 종료되면 `onModuleDestroy`에서 멈춰, DB 연결이 닫히기 전에 진행 중인 판정을 끝낸다.
- 새 주기 작업(예: #233의 대기 시도 보내기)은 기능 모듈에 `PeriodicTask`를 감싼 스케줄러를 두고 `main.ts`에서 `start()`를 부른다. 예시는 `src/analysis-deadline/analysis-deadline.module.ts`의 `AnalysisDeadlineScheduler`다.

```typescript
const task = new PeriodicTask({
  name: 'queued-dispatch', intervalMs: 60_000,
  run: async () => { await service.sendQueued(); },
  failed: (name, errorName) => logger.error({ event: 'PERIODIC_TASK_FAILED', task: name, error: errorName }),
});
task.start();       // main.ts에서만
await task.stop();  // 종료 훅에서
```

## 로그

`AnalysisDeadline` 문맥으로 남기며 요청 원문·SQL·오류 원문 메시지는 넣지 않는다.

| event | 수준 | 내용 |
|---|---|---|
| `ANALYSIS_REQUEST_CLOSED` | log | 커밋 뒤. `requestId`·`attemptId`·`decision`(`PROCESSING_DEADLINE`·`APPLICATION_DEADLINE`·`APPLICATION_FAILED`) |
| `ANALYSIS_DEADLINE_UNEXPECTED_STATE` | warn | 잠근 뒤 다시 읽은 상태가 위 표의 그 밖의 조합일 때. `requestId`·`processing`·`application` |
| `ANALYSIS_DEADLINE_CLOSE_FAILED` | error | 요청 하나의 닫기 실패. `requestId`·오류 이름(DB 오류는 `QueryFailedError:<SQLSTATE>`). 다음 요청과 다음 판정은 계속한다 |
| `PERIODIC_TASK_FAILED` | error | 판정 한 번 전체의 실패(예: 후보 조회 DB 오류). 작업 이름·오류 이름 |

## 검사

- `test/analysis/deadline-decision.test.cjs`: 시한 경계(60분 직전·정각)와 상태 조합별 판단. DB 없음.
- `test/periodic-task.test.cjs`: 실행이 겹치지 않음, 실패 뒤 계속(기록 함수 실패 포함), `stop()` 대기, 멈추는 중 재시작. DB 없음.
- `test/integration/analysis-deadline.test.cjs`: 실제 테스트 DB와 실제 수신·B 등록·반영 코드로 닫기 규칙, 늦은 결과·진행 알림, 닫기와 수신·반영 경합(시도 행을 잡아 두고 누가 요청을 먼저 잡았는지 정한 두 순서), 오래 잠긴 요청 건너뛰기, 같은 후보를 고른 두 판정, 닫을 수 없는 행 100건 적체, 요청 하나의 닫기 실패와 되돌림, 닫힌 뒤 같은 회원의 새 요청 저장을 확인한다. GitHub 관측은 시험 대역이다.

## 하지 않는 것

자동 분석 재시도, 반영 복구·재반영 호출, 실행 불명 요청을 따로 끝내는 절차는 두지 않는다. 기존 반영 서비스의 명시적 재반영 분기(`APPLY_FAILED` → `RECOVERING`)는 호출하는 곳이 없으며 E 영역에서 계약에 맞춰 정리한다.
