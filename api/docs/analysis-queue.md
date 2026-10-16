# 분석 요청 보내기와 알림·결과 받기(큐 연결) — #233

api가 대기 중인 분석 시도를 큐(BullMQ)로 worker에 보내고, worker가 보낸 진행 알림과 결과를 큐에서 받아 기존 E 수신 경로로 넘긴다. worker 쪽은 [#121](https://github.com/JminAILab/CatchU/issues/121)의 [분석 요청 큐 소비자](../../worker/docs/queue-consumer.md)다. 코드는 `src/analysis-queue/`에 있다.

## 지금 상태: 모듈은 있고 실제 서버에서는 아직 켜지 않았다

`AnalysisQueueModule.register({ queue, observations, contractDirectory })`로 조립한다. DB가 필요한 공급자는 `observations` 대신 `observationsFactory(db)`를 넘긴다. 두 방식 중 하나와 큐 설정·계약 경로가 필요하다. 보호 관측 공급자(`observations`)의 가짜 기본값은 없다(2026-10-15 팀장 결정).

- `queue`: `readAnalysisQueueConfig()`가 읽은 큐 설정(아래 「설정」). 큐 주소가 없으면 `null`이므로 조립하지 않는다.
- `observations`: 수신 뒤 반영이 쓰는 보호 관측 공급자(`RepositoryObservationSource`, [수신 연결 안내](receiver-registration.md)). 10월에는 [#314](https://github.com/JminAILab/CatchU/pull/314)의 `OctoberRepositoryObservationSource`를 여기에 넘긴다. 그 안내의 `registerDatabase` 직접 호출 예시는 큐 없이 조립할 때의 방법이며, 큐를 쓸 때는 이 모듈에만 넘긴다.
- `contractDirectory`: `worker-messages.yaml`·`common.yaml`이 있는 절대 경로.

모듈은 안에서 실제 수신·등록 조립(`AnalysisReceiverModule.registerDatabase`)을 한 번 불러온다. 같은 앱에서 그 조립을 따로 또 부르지 않는다.

**`AppModule`에는 등록하지 않았다.** 10월에는 ‘관측 안 함’을 명시하는 공급자를 쓴다.
기존 비공개 근거 보존·주소 대조는 PR #317로 반영됐고, DB 기반 좌표 공급은 [선정 저장소 좌표 연결](selected-repository-coordinates.md)을 따른다.
#252의 실제 목록·접수 연결과 실제 동의 범위가 준비된 뒤 별도 작업에서 앱 등록, `listen` 뒤
`app.get(AnalysisQueueRunner).start(onFailure)` 호출, 배포 큐 주소를 연결한다.
`onFailure`는 앱을 닫고 종료 코드 1로 끝내며 아래 수명주기를 따른다.
이때 개발 주입 제공자가 함께 들어오므로 기존 ‘제품 AppModule에 주입 제공자 없음’ 검사도 함께 대조한다.

연결은 `start()`에서 연다. 조립과 Nest 초기화만으로는 큐 서버에 붙지 않는다.

## worker 문서와의 대조

정본은 [worker 「큐 규격 (#233과 공동)」](../../worker/docs/queue-consumer.md#큐-규격-233과-공동)이다. api 쪽 값은 `src/analysis-queue/queue-spec.ts`에 한곳으로 모았다.

| 항목 | worker 문서 | api |
|---|---|---|
| 요청 큐·작업 이름·작업 ID | `analysis-requests`, `Request`, 시도 ID | 같음 |
| 요청 작업 옵션 | `attempts: 1`, backoff 없음, 완료·실패 보관 `{age: 7200}`, `stackTraceLimit: 0` | 같음(작업마다 넣음, Queue 기본 옵션은 비움) |
| 요청 메시지 ID | 합성 요청은 `request-<attemptId>` | 같은 규칙 |
| 두 참조(`credentialContextReference`, `allowedScope.selectionReference`) | 시도 ID와 같아야 함 | 시도 ID |
| 알림·결과 큐·작업 이름·작업 ID | `worker-messages`, `ProcessingEvent`·`Result`, 메시지 ID | 같음. 작업 ID ≠ 메시지 ID면 처리하지 않음 |
| 소비자 설정 | 정체 복구 0회, 잠금 30초, 정체 검사 30초 | 같음, 동시 1 |
| 결과 작업 보관 | worker가 `{age: 1800}`을 넣음 | api 소비자에 보관값을 따로 주지 않음(작업의 값을 따름) |
| 수신 확인 | 결과 작업 반환값을 5분 동안 다시 읽음 | 수신 확인 객체를 반환값으로 돌려줌(문자열로 바꾸지 않음) |
| 접두사·주소 | `CATCHU_QUEUE_PREFIX`(기본 `catchu`), `CATCHU_QUEUE_REDIS_URL` | 같은 이름. 주소 판정은 api가 더 엄격하다(운영 비밀번호 필수, 대문자 접두사·풀리지 않는 퍼센트 인코딩 거부) |
| 판본 | Python `bullmq==3.3.0`·`redis==7.4.1` | Node `bullmq` 6.3.11·`ioredis` 6.0.0(키트와 같음, 판본 시험) |

## 보내기

이전 보내기가 끝나고 5초 뒤 다음 보내기를 한다(`PeriodicTask`, 실행이 겹치지 않음). 한 번에 100건을 읽는다.

1. **대상 조회**: 요청 `ACTIVE`, 요청의 현재 시도가 `QUEUED`·`NOT_READY`, 접수 후 60분(처리 시한) 안. DB를 잠그지도 쓰지도 않는다(10/15 팀장 결정). 잠근 채 큐를 기다리면 수신·상태 조회가 막히기 때문이다.
2. **이어 읽기**: 요청 ID 순서로 100건씩 읽고 마지막 위치를 메모리에 둔다. 100건보다 적게 나오면 다음 회차는 처음부터 읽는다. 앞쪽 시도가 모두 이미 큐에 있거나 검사에 걸려도 뒤쪽 시도가 밀리지 않는다. 위치는 서버를 다시 띄우면 처음부터다.
3. **넣기 전 검사**(어긋나면 그 시도만 건너뛰고 고정 코드를 시도마다 한 번 남김): 동의 범위가 키 네 개의 객체인지(`CONSENT_SCOPE_INVALID`) → 범위의 저장소 ID·판본이 동의 행과 같은지(`CONSENT_SCOPE_MISMATCH`, worker는 저장소 ID가 다르면 알림 없이 거부하고 E는 판본이 다르면 결과를 거부한다) → 메시지 조립 → 계약 v1 Request 검사(`REQUEST_SCHEMA_INVALID`).
4. **메시지**: 모든 값이 DB 접수 기록이다. 두 참조만 시도 ID로 바꾼 사본을 보내며 DB의 동의 범위는 바꾸지 않는다.
5. **넣기**: 큐에 같은 작업 ID의 작업이 있으면(대기·처리 중·완료/실패 보관 중) 넣지 않고 기록도 남기지 않는다. 없으면 넣고 `ANALYSIS_REQUEST_ENQUEUED`를 남긴다(큐에 넣었다는 기록이지 분석 완료가 아니다). 확인과 넣기 사이에 같은 시도가 들어가면 큐가 같은 작업 ID를 무시하고, 이때 넣음 기록이 두 번 남을 수 있다.

MOCK·LIVE를 거르지 않는다. 받을지는 worker가 정한다(지금 worker는 개발·시험의 MOCK만 처리하고 LIVE는 처리 전에 거부한다). 보관 2시간은 처리 시한 60분보다 길고 대상 조회도 60분 안의 시도만 고르므로, **큐에 같은 작업이 남아 있는 동안은** 같은 시도를 다시 넣지 않는다. 막는 근거는 큐의 같은 작업 ID 하나뿐이다. 큐 서버가 자료 없이 다시 떠서 그 작업이 사라졌는데 시도가 아직 `QUEUED`이고 60분 안이면, 다음 회차가 같은 시도를 다시 넣고 worker가 한 번 더 분석할 수 있다. 10/6 결정이 받아들인 위험이다([worker README 「보장하지 않는 범위」](../../worker/README.md#보장하지-않는-범위)).

**큐를 쓸 수 없을 때**: 보내기 연결은 끊긴 동안 명령을 쌓지 않는다. 연결이 준비되지 않았으면 명령 없이 그 회차를 건너뛴다. 큐 명령 하나는 5초까지만 기다린다. 넘으면 명령을 취소하지 못하므로 "실행됐는지 모름"으로 보고 그 회차를 멈추며, 그 명령이 끝나기 전에는 다음 회차가 새 명령을 보내지 않는다. 멈춤·재개 기록은 이유가 바뀔 때만 남긴다. 큐에서 사라진 요청을 따로 찾거나 보관하는 장치는 없다(10/6 결정, 위 문단의 다시 넣기는 대상 조회의 결과일 뿐이다). 끝나지 않은 요청은 [처리 시한 닫기](analysis-deadline.md)가 닫는다.

**처리 시한 닫기와 겹칠 때**: 보내기가 읽은 직후 시한 닫기가 요청을 닫으면, 늦게 온 진행 알림은 상태를 바꾸지 않고 결과는 `PAYLOAD_CONFLICT`로 거부된다. 수신이 먼저 커밋됐으면 기록이 남고 그 뒤 같은 결과는 `DUPLICATE`다. MOCK worker는 DB 상태를 다시 보지 않으므로 닫힌 요청의 가짜 분석이 돌 수 있다(개발·시험의 한계, LIVE는 #232의 요청 정보 조회가 막는다).

## 받기

`worker-messages` 큐를 동시 1로 소비하고 기존 수신 뒤 등록 진입점(`AnalysisRegistrationService`)에 넘긴다. 수신 처리 자체는 바꾸지 않는다.

| 받은 작업 | 작업 결과 | 반환값·실패 사유 |
|---|---|---|
| 결과, 수신 확인 있음(`ACCEPTED`·`DUPLICATE`·`REJECTED`) | 완료 | 수신 확인 객체 그대로 |
| 결과, 수신 커밋 뒤 반영(등록)이 실패 | 완료 | 그 수신 확인 객체. 반영 실패는 반영 서비스 로그에 남고, DB는 실패 기록에 성공하면 `APPLY_FAILED`, 실패 기록까지 실패하면 `PENDING`으로 남는다. 어느 쪽이든 시한 판정이 닫는다 |
| 결과, 식별 불가 | 완료 | `null` |
| 결과, 수신 저장 자체가 실패 | 실패 | `RECEIVER_STORAGE_UNAVAILABLE` |
| 진행 알림(관측·변경 없음·거부 판정) | 완료 | 없음 |
| 진행 알림 저장 실패 | 실패 | `RECEIVER_STORAGE_UNAVAILABLE` |
| 모르는 작업 이름 / 작업 ID ≠ 메시지 ID | 실패 | `UNKNOWN_JOB_NAME` / `JOB_ID_MISMATCH`(수신 경로에 넘기지 않음) |
| 그 밖의 예상 밖 예외 | 실패 | `RESULT_HANDLING_FAILED` / `PROGRESS_HANDLING_FAILED` |

- 결과 작업을 완료로 표시하는 시점은 수신 저장과 반영 시도가 모두 끝난 뒤다. worker는 그동안 반환값을 기다린다(5분이 지나면 "보지 못함"으로 기록만 한다).
- 작업이 실패로 끝나는 경우는 위 표의 고정 코드와, BullMQ가 스스로 실패시키는 경우(아래 정체, 완료 기록 실패)다. 실패 사유와 stacktrace에 고정 코드만 들어간다는 보장은 처리 함수가 던진 오류에만 해당한다. 처리 함수가 값을 돌려준 뒤 BullMQ의 완료 기록 자체가 실패하면(잠금을 잃음·큐 서버 오류) 처리 함수가 잡지 못하고, BullMQ·Redis의 고정 문구(작업 ID 포함)가 실패 사유에 남으며 worker는 수신 확인을 보지 못한다(DB 반영은 끝났으므로 결과가 사라진 것은 아니다). worker(Python)는 같은 경우를 고정 코드로 바꾸지만 api는 BullMQ 내부를 바꿔야 해서 그렇게 하지 않는다.
- **정체 복구 0회**: 처리 중 잠금을 잃은(예: api가 처리 중 죽은) 작업은 처리 함수를 다시 부르지 않는다. 정체 검사는 실패 예정 표시만 남기고 그 작업을 대기열로 옮기며, 실패 확정은 소비자가 그 작업을 다음에 가져갈 때 처리 함수 없이 된다(실패 사유는 BullMQ의 고정 문구). 그 결과는 다시 오지 않으므로 요청은 처리 시한으로 닫힌다.

## 수명주기

- `start()`: 연결 두 개(보내기용·받기용)를 열고 5초 주기 보내기를 시작한다. 받기는 BullMQ의 주 연결과 대기용 연결이 모두 준비된 뒤 소비를 시작한다(BullMQ는 준비 전에도 주 연결로 작업을 가져올 수 있어, 먼저 시작하면 종료 판단이 틀린다). 보내기용은 끊긴 동안 명령을 쌓지 않고, 받기용은 BullMQ Worker가 요구하는 대로 명령 재시도 제한이 없다. 두 번째 호출은 아무것도 하지 않는다.
- 멈춤(앱 종료의 `onModuleDestroy`, DB 연결이 닫히기 전): 멈춤 표시 → 주기·보내기 멈춤(6초까지 기다림. 멈춤 표시 뒤에는 큐에 넣는 명령을 새로 보내지 않는다) → 받기 닫기(처리 중 작업을 15초까지 기다림) → 요청 큐 닫기(2초) → 두 연결 닫기(정상 종료를 2초까지 기다리고 넘으면 끊음, 붙어 있지 않은 연결은 바로 끊음). 합계가 정지 유예 30초 안에 든다. 상한을 넘기면 `ANALYSIS_QUEUE_SHUTDOWN_TIMEOUT`을 남기고 다음 단계로 간다.
- 받기를 시작하지 않았으면(처리 중 작업이 없음) 또는 받기 연결이 끊겨 다시 붙는 중이면(완료 기록을 남길 수 없음) 기다리지 않고 닫는다. 끊긴 연결에서 BullMQ의 일반 닫기는 끝나지 않기 때문이다.
- 상한은 기다리기를 그만둘 뿐 진행 중인 DB 조회나 처리 함수(보호 관측 조회 등)를 취소하지 않는다. 실제 서버는 종료 훅이 끝나면 Nest가 프로세스를 끝내고, 그때 처리 중이던 결과 작업은 정체 처리로 실패하며 요청은 처리 시한으로 닫힌다(10/6 결정 범위).
- 큐 서버가 끊기면 ioredis가 다시 붙는다. 다시 붙는 동안 보내기는 회차를 건너뛰고, 받기는 다시 붙은 뒤 이어서 소비한다.
- 멈추는 중이 아닌데 받기가 멈추면(첫 준비 실패, 받기 실행이 끝나거나 실패함) 받기를 다시 시작하지 않는다. `ANALYSIS_QUEUE_CONSUMER_STOPPED`를 남기고 위 멈춤 순서로 보내기까지 멈춘 뒤 `start(onFailure)`의 `onFailure`를 부른다. 받기 없이 보내기만 돌면 결과를 받지 못한 요청이 처리 시한으로 닫히기 때문이다. 상태 확인(`/health`)은 이 실행기를 보지 않으므로, 켤 때 진입점이 `onFailure`에서 앱을 닫고 종료 코드 1로 끝내 실행 환경이 다시 띄우게 한다(worker 소비자와 같은 방식, [worker 큐 소비자](../../worker/docs/queue-consumer.md)). 큐 서버에 처음 붙지 못하는 동안은 준비를 기다릴 뿐 실패로 보지 않는다.

## 설정

| 이름 | 뜻 |
|---|---|
| `CATCHU_QUEUE_REDIS_URL` | 큐 서버 주소. 없거나 비면 모듈을 조립하지 않는다. `NODE_ENV`가 development·test면 `redis://`·`rediss://`, 그 밖(운영 판정)은 비밀번호가 든 `rediss://`만 받는다. 소문자 접두사만 받고(ioredis는 소문자 `rediss://`일 때만 TLS를 켠다), 질의 문자열·`#`·풀리지 않는 퍼센트 인코딩·DB 번호(`/0`~`/99`) 밖의 경로(끝 슬래시만 있는 `…:6379/`, `/1/../0`·`/%2e/0`처럼 정규화하면 DB 번호가 되는 경로 포함, worker와 같게 원문으로 판정)는 거부한다. 주소 전체를 비밀값으로 다루며 오류·로그에 내지 않는다 |
| `CATCHU_QUEUE_PREFIX` | 큐 키 접두사. 기본 `catchu`. 영문·숫자·`_`·`-` 64자 이하(첫 글자 영문·숫자). worker와 같아야 한다 |

주기 5초·한 번 100건·명령 상한 5초·종료 상한은 환경변수로 열지 않는다(`queue-spec.ts`). 환경변수 표는 [environment.md](environment.md)에 있다.

## 로그

`AnalysisQueue` 문맥으로 남긴다. 메시지 본문·주소·오류 원문은 넣지 않는다. 작업 이름은 허용 목록일 때만, 작업 ID는 worker 형식(`event-<모드>-<시도>-<상태>`, `message-<모드>-<시도>-result`)일 때만 남기고 아니면 `UNKNOWN`·`null`이다. 오류는 이름과 고정 형식의 코드만 남긴다(예: `Error:ECONNREFUSED`).

| event | 수준 | 내용 |
|---|---|---|
| `ANALYSIS_REQUEST_ENQUEUED` | log | `requestId`·`attemptId`. 큐에 넣음(분석 완료 아님) |
| `ANALYSIS_REQUEST_SKIPPED` | warn | `requestId`·`attemptId`·`code`. 시도마다 한 번 |
| `ANALYSIS_DISPATCH_PAUSED` / `ANALYSIS_DISPATCH_RESUMED` | warn / log | `reason`(`QUEUE_NOT_READY`·`QUEUE_COMMAND_TIMEOUT`·`QUEUE_COMMAND_FAILED`·`QUEUE_COMMAND_PENDING`)·오류 이름. 바뀔 때만 |
| `WORKER_PROGRESS_RECEIVED` | log | `jobId`·`decision`(`OBSERVED`·`TERMINAL_UNCHANGED`·거부 코드) |
| `WORKER_RESULT_RECEIVED` | log | `jobId`·수신 확인의 `disposition`·`code`(식별 불가는 둘 다 `null`) |
| `RESULT_APPLICATION_FAILED` | warn | `jobId`. 수신은 됐고 반영이 실패함 |
| `WORKER_MESSAGE_FAILED` | error | `jobName`·`jobId`·`code`. 작업을 실패로 끝냄 |
| `ANALYSIS_QUEUE_ERROR` / `ANALYSIS_QUEUE_CONNECTED` | warn / log | 출처(`REQUEST_CONNECTION`·`CONSUMER_CONNECTION`·`REQUEST_QUEUE`·`CONSUMER`)·오류 이름. 같은 출처에서 같은 오류가 연달아 나면 한 번만 남긴다(다른 오류가 끼면 다시 남긴다). 원본 연결이 다시 붙으면 그 연결과 그 연결을 쓰는 큐·받기의 기록 상태를 비우고, 오류 뒤였으면 `CONNECTED`를 남긴다. 받기 내부 대기용 연결만 다시 붙을 때는 비우지 않는다 |
| `ANALYSIS_QUEUE_SHUTDOWN_TIMEOUT` / `ANALYSIS_QUEUE_CONSUMER_STOPPED` / `PERIODIC_TASK_FAILED` | error | 종료 단계 상한 초과 / 받기가 예상 밖으로 멈춤(`error`: 오류 이름, 오류 없이 끝나면 `RUN_ENDED`). 이어서 실행기 전체를 멈춘다 / 보내기 한 번 전체의 실패(예: 조회 DB 오류) |

## 시험

`npm test`에 들어 있다. 실제 큐 시험은 `CATCHU_TEST_REDIS_URL`이 있을 때만 돌고, 있으면 닿지 않을 때 실패한다(건너뛰지 않는다). CI는 Valkey 8.1.6 서비스로 이 값을 준다. **이 값은 `.env`에 적어도 시험 실행기가 넘기지 않으므로 셸 환경변수로 준다.** 로컬 예(다른 작업 폴더와 겹치지 않게 이름·포트를 바꾼다):

```sh
docker run -d --name catchu-test-queue -p 127.0.0.1:6380:6379 valkey/valkey:8.1.6-alpine
CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6380 npm test
```

| 파일 | 확인하는 것 |
|---|---|
| `test/analysis-queue/config.test.cjs` | 환경별 주소 허용·거부, 오류에 값 없음, ioredis가 같은 뜻으로 읽음(TLS·DB·비밀번호), 조립 조건 |
| `test/analysis-queue/versions.test.cjs` | api `package.json`·잠금 파일·설치본, 키트 `package.json`·잠금 파일, bullmq가 불러오는 ioredis까지 같은 판본 |
| `test/integration/analysis-queue-dispatch.test.cjs` | 실제 DB와 메모리 큐: 실제 접수 API 행과 보낸 메시지 대조·DB 불변, 넣기 전 검사, 보내지 않는 상태, 60분 경계, 101번째 시도, 연결 준비 전·명령 상한·실패, 겹침·멈춤, 멈춤 뒤 넣기 없음 |
| `test/integration/analysis-queue-consumer.test.cjs` | 실제 DB와 처리 함수: 받음·실행 중·실행 불명, 결과·수신 확인 스키마, 중복, 작업 ID 불일치, 알림 없는 실패 결과, 닫힌 요청, 반영 실패·실패 기록 실패·커밋 실패, 식별 불가, 비밀 표지 비노출 |
| `test/integration/analysis-queue-valkey.test.cjs` | 실제 Valkey: 같은 시도의 작업 하나(대기·완료·실패 보관), Redis에서 다시 읽은 옵션, 보관 정리(점수를 90분·130분 전으로 옮김), worker 형식 알림·결과 왕복과 반환값, 처리 중 종료와 종료 상한, 시작 전에 쌓인 결과를 처리하는 중의 종료, TCP 중계를 끊어 만든 재접속 중 종료, 요청 테이블 잠금으로 멎은 보내기 조회 중 종료, 받기 실행이 예상 밖으로 끝나면 보내기까지 멈추고 `onFailure` 호출, AppModule에 실행기 없음, 큐 서버 없음, 오류 기록 억제(내부 객체에 합성 사건을 보내는 배선 시험이며 실제 재접속 검증이 아님) |

worker 쪽은 시험 대역이다(요청 작업은 시험용 BullMQ Worker가 끝내고 알림·결과는 worker와 같은 이름·ID·옵션으로 직접 넣는다). 보호 관측은 합성 대역이다.

## 수동 검증

`scripts/verify-analysis-queue.cjs`는 CI에서 돌지 않는다. 테스트 DB를 비우고 worker 합성 맥락(`worker/fixtures/m1-synthetic/context.sample.json`)의 ID로 대기 시도 하나를 넣은 뒤, 모듈의 주기 보내기 → worker 처리 → 받기 → 수신·반영·수신 확인을 한 번 돌리고 증거를 JSON으로 출력한다. 수신 확인은 BullMQ가 결과 작업을 끝낼 때 내보내는 완료 기록에서 받는다(실제 worker는 읽은 뒤 결과 작업을 지운다). 자료는 모두 합성이고 보호 관측은 합성 대역이며 GitHub·LLM을 부르지 않는다. 같은 큐 주소·접두사로 worker를 먼저 띄운다. **실행마다 새 접두사를 쓴다.** 시도 ID가 고정이라 같은 접두사로 다시 돌리면 이전 요청 작업(2시간 보관)이 남아 보내기가 넣지 않고 시간 초과로 끝난다.

```sh
# 큐 검증 키트의 시험용 worker(docs/queue-verification에서 uv sync --locked 뒤)
RUN_DIR=$(mktemp -d) F_MODE=naive F_MAX_STALLED=0 F_RECHECK_SECONDS=0 Q77_PREFIX=catchu-verify-1 Q77_REDIS_URL=redis://127.0.0.1:6380 uv run --locked python py/f_worker.py
# dev의 실제 worker 소비자(worker/에서)
NODE_ENV=development CATCHU_QUEUE_REDIS_URL=redis://127.0.0.1:6380 CATCHU_QUEUE_PREFIX=catchu-verify-2 uv run --locked python -m app.consumer --host 127.0.0.1 --port 8000
# api(api/에서 npm run build 뒤)
CATCHU_QUEUE_REDIS_URL=redis://127.0.0.1:6380 CATCHU_QUEUE_PREFIX=catchu-verify-1 node scripts/verify-analysis-queue.cjs --worker kit
```

판정은 수신 확인 `ACCEPTED`·스키마 통과·세 식별자 일치, 수신 기록 1건, `APPLIED`/`CLOSED`, Catch 1건 이상이다. 키트 worker는 결과 작업을 지우지 않으므로 출력의 `kitReadReceipt` 명령으로 Python 쪽에서 수신 확인을 다시 읽을 수 있다. 실행 결과는 검증한 PR에 기록한다.

## 한계

- Redis에 쓸 수 있으면 결과를 위조할 수 있다. 요청 작업이 E가 대조하는 값 전부를 담고 2시간 남기 때문이다. 실제 경계는 큐 서버 접근 통제(TLS·비밀번호·망 분리)다.
- DB가 잠시 멈춰 수신 저장이 실패하면 결과 작업은 실패로 끝나고 다시 오지 않는다. 요청은 처리 시한으로 닫힌다.
- worker가 처리 전에 거부하면(형식·맥락 불일치, LIVE) api에 알림이 없어 회원에게는 시한 실패로 보인다.
- 보관 `{age}`는 삭제 시한이 아니다. 같은 보관 옵션을 가진 다른 작업이 같은 상태(완료 또는 실패)로 끝날 때 그 집합의 오래된 작업을 지우며, 처리되지 않은 결과 작업은 처리될 때까지 남는다.
- 큐 자료가 사라지면 같은 시도가 다시 들어가 한 번 더 분석될 수 있다(위 「보내기」, 10/6 수용 위험). 보내기 연결의 `enableOfflineQueue: false`는 끊긴 동안 새 명령을 쌓지 않을 뿐, 이미 보내고 답을 못 받은 명령을 다시 붙은 뒤 자동으로 다시 보내는 것까지 막지는 않는다(ioredis 기본값). 같은 작업 ID가 있으면 무시되므로 같은 범위의 위험이다.
- 보내기 연결이 붙은 직후 BullMQ의 첫 초기화(서버 정보 조회)가 실패하는 좁은 틈에 걸리면, 그 요청 큐는 api를 다시 띄울 때까지 명령마다 실패한다(`ANALYSIS_DISPATCH_PAUSED` `QUEUE_COMMAND_FAILED`가 계속 남는다).
- 보호 공급자나 DB가 오래 멈추면 정상 종료가 각 단계 상한까지 길어지고, 상한 뒤에도 그 처리는 프로세스가 끝날 때까지 남는다(위 「수명주기」).
- api를 여러 대 띄우면 진행 알림의 처리 순서가 보장되지 않는다([#277](https://github.com/JminAILab/CatchU/issues/277)은 한 대).
- AWS 큐(ElastiCache Valkey)의 TLS 인증서 검증·비밀번호·재접속·`noeviction`은 확인하지 않았다([#276](https://github.com/JminAILab/CatchU/issues/276)·[#277](https://github.com/JminAILab/CatchU/issues/277)).

## 하지 않는 것

큐에서 사라진 요청을 따로 찾아 다시 넣는 판단·한도, 큐 접속 실패에 대비한 별도 보존, 실행 불명 요청을 따로 끝내는 절차, 영속 발행 기록·재발행 횟수(10/6 결정). 대상 조회가 큐에 없는 대기 시도를 다시 넣는 것은 막지 않는다(「보내기」). `AnalysisIntakeService.prepareExecutionRequest`는 쓰지도 고치지도 않는다(E 접수 코드가 큐를 모르게 둔다).
