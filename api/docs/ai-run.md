# 백그라운드 AI 실행 AiRun — 12월 intent U2

임베딩·기본 요약·JD 요약을 api 안 큐로 돌리는 공용 장치(`src/ai-run/`)다. 처리기를 가진 Unit(U3·U5·U10)과 작업을 등록하는 Unit(U4·U5·U10)이 쓴다.

기준 문서: [계약 C-02](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md), [U2 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/functional-spec.md) W5·[업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md) BR5, [U2 비기능 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/nfr-design/). 규칙 ID는 그 문서의 것이다.

## 쓰는 법

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { AiRunModule } from '../ai-run/ai-run.module';
import { AiRun } from '../ai-run/ai-run';

@Module({ imports: [AiRunModule], providers: [MySummaryHandler] })
export class MyModule {}

// 처리기 등록: 종류마다 하나, 모듈 초기화에서 한 번. 두 번 등록하면 기동이 멈춘다(BR5.1).
export class MySummaryHandler implements OnModuleInit {
  constructor(private readonly aiRun: AiRun) {}
  onModuleInit() { this.aiRun.registerHandler('BASE_SUMMARY', (job) => this.handle(job)); }
}

// 접수: 상태 행(PENDING, deadline_at)을 커밋한 **뒤에** 등록한다. 실패해도 예외가 없다(BR5.2).
const result = await aiRun.enqueueAfterCommit('BASE_SUMMARY', `BASE_SUMMARY-${publicationId}`, { publicationId });
// result === 'ENQUEUE_FAILED'여도 접수 응답은 그대로다. 상태는 처리 시한이 지나면 FAILED가 된다.
```

- 소비 Unit 순서(동의가 필요한 기능): `AiConsentGate.require` → `DailyRunLimit.consume` → 상태 행 커밋 → `enqueueAfterCommit`(비기능 NFR2.4).
- `runKey`: 자동 작업은 `"{종류}-{publicationId}"`, 나머지는 접수 때 새 UUID. 영문·숫자·`_`·`.`·`-` 1~128자만 받는다(콜론·빈 값·공백은 `ENQUEUE_FAILED`, BR5.3).
- `payload`: `EMBED_PUBLICATION`·`BASE_SUMMARY`는 `{ publicationId }`, `JD_SUMMARY`는 `{ runId }`(UUID) 하나뿐이다. 그 밖의 칸이 있으면 `ENQUEUE_FAILED`. 처리기는 DB에서 다시 읽는다(NFR5.3).

## 상태 판정과 늦은 결과 (`ai-run-spec.ts`, `run-status-store.ts`)

| 함수 | 하는 일 | 규칙 |
|---|---|---|
| `readStatus(row, now)` | 순수 함수. `PENDING`이고 `now >= deadlineAt`이면 `FAILED`, 그 밖에는 저장된 값 | BR5.4 |
| `persistDeadlineFailure(manager, { table, key }, now)` | 상태를 읽는 자리에서 `status='PENDING' AND deadline_at <= now`인 행만 `FAILED`로 저장. `DONE`·`FAILED`는 덮지 않는다. 바꿨으면 `true` | BR5.5 |
| `saveRunResult({ kind, runKey, now, readParent, save })` | 부모가 없거나 `PENDING`이 아니거나 시한이 지났으면 저장하지 않고 `DISCARDED`. 저장 중 외래 키 위반(23503)도 `DISCARDED`(다시 시도하지 않음). 그 밖의 저장 오류는 던진다 | BR5.7, NFR5.4 |

표·칼럼 이름은 호출 Unit이 넘기며 `^[a-z][a-z0-9_]{0,62}$`만 받는다.

## 큐 규격

| 항목 | 값 | 근거 |
|---|---|---|
| 큐 | `ai-run` 하나(모든 api가 공유) | NFR4.8 |
| 연결 | 10월 분석 큐와 같은 `CATCHU_QUEUE_REDIS_URL`·`CATCHU_QUEUE_PREFIX`([환경변수](environment.md)). 새 이름 없음 | 기술 선택 |
| 작업 | 작업 이름 = 종류, 작업 ID = runKey, `attempts: 1`, backoff 없음, `stackTraceLimit: 0` | BR5.2, NFR6.2 |
| 보관 | 완료·실패 `AI_RUN_JOB_RETENTION_SECONDS = 7200`(2시간). 그동안 같은 runKey 등록은 무시된다 | NFR4.9 |
| 소비 | api마다 Worker 하나, `concurrency: 1`, `maxStalledCount: 0` | NFR4.4, NFR6.2 |
| 등록 상한 | `AI_RUN_ENQUEUE_TIMEOUT_MS = 5000`. 큐에 닿지 않으면 이 시간 안에 `ENQUEUE_FAILED` | NFR6.1 |

**처리 시한을 2시간보다 길게 정하는 Unit은 `AI_RUN_JOB_RETENTION_SECONDS`를 그 시한 이상으로 함께 올린다.** 보관이 시한보다 짧으면 같은 runKey가 시한 안에 다시 실행될 수 있다(비기능 확장성 설계 NFR4.9).

## 조립과 수명

- `AiRunModule`은 기본 앱(`AppModule`)에 넣지 않는다. 쓰는 Unit의 모듈이 `imports`에 넣으면 같은 AiRun 하나를 함께 쓴다.
- 큐 주소가 없으면 연결하지 않는다. 등록은 모두 `ENQUEUE_FAILED`(`QUEUE_NOT_CONFIGURED`)이고, 상태는 처리 시한으로 FAILED가 된다. 주소가 틀리면 기동이 멈춘다(10월 판정 그대로).
- 큐 주소가 있으면 앱 기동이 끝난 뒤(모든 모듈의 처리기 등록 뒤) 소비를 시작하고, 앱 종료 때 처리 중 작업을 15초까지 기다린 뒤 연결을 닫는다.
- **개발 서버(EC2)에는 지금 큐 주소가 없다**([분석 큐 「어디서 켜는가」](analysis-queue.md)). 그대로면 U3·U5·U10의 백그라운드 실행은 개발 서버에서 모두 처리 시한으로 FAILED가 된다. 개발 서버에 큐를 연결하는 일은 팀장 공용 기반 작업이다.

## 로그

| 사건 | 칸 | 남기지 않는 것 |
|---|---|---|
| `ai_run_enqueue_failed` | kind, runKey(형식이 틀리면 null), error(`INVALID_JOB`·`QUEUE_NOT_CONFIGURED`·오류 이름) | payload, 큐 주소 |
| `ai_run_handler_failed` | kind, runKey, error(오류 이름) | payload, 오류 메시지 |
| `ai_run_unknown_kind` | kind, runKey | payload |
| `ai_run_result_discarded` | kind, runKey, reason(`PARENT_MISSING`·`PARENT_NOT_PENDING`·`PARENT_DELETED`) | 결과 내용 |

## 시험

`test/u2/ai-run.test.cjs`. 실제 큐 시험은 셸 환경변수 `CATCHU_TEST_REDIS_URL`이 있을 때만 돈다(있으면 닿지 않을 때 실패, 없으면 큐가 필요한 시험만 건너뜀). 준비는 [분석 큐 「시험」](analysis-queue.md#시험)과 같다. DB 도우미 시험은 시험 안에서 확인용 표를 만들고 지운다.

```bash
CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6380 npm test -- test/u2/ai-run.test.cjs
```

## 한계

- 큐에 닿지 않을 때 등록 하나가 상한(5초)까지 기다린다. 그 동안 접수 응답이 늦어진다.
- 상한을 넘겨 `ENQUEUE_FAILED`로 끝낸 등록이 나중에 큐에 들어가면 처리기가 돌 수 있다. 처리기는 `saveRunResult`로 부모 상태를 보므로 시한이 지난 결과는 버린다.
- 처리 중 api가 죽으면 그 작업은 다시 처리하지 않는다(정체 복구 0회). 상태는 처리 시한으로 FAILED가 된다.
