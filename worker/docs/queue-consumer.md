# 분석 요청 큐 소비자

현행 네 메시지 종류는 [U7 v2](repository-analysis-u7.md)이며 v1 혼입을 거부한다. 수신 확인과 Catch 반영 완료는 별개이고, 결과에는 본인 커밋 관측과 수집 한계를 필수로 보낸다. 기존 큐 이름·동시 실행 1·재시도 정책은 유지한다.

[#121](https://github.com/JminAILab/CatchU/issues/121)의 큐 연결이다. api가 넣은 분석 요청을 큐에서 꺼내 처리하고, 진행 알림과 결과를 api로 가는 큐에 넣는다. LIVE 요청은 요청 정보 조회([요청 정보 조회](request-context.md)) 뒤 실제 수집·후보·생성으로, MOCK 요청은 개발·시험 설정에서만 가짜 생성기로 처리한다. LIVE는 합성 GitHub·합성 제공자·합성 조회 API로만 검사했고 실제 api·GitHub·Claude 연결 확인은 남았다. api 쪽 큐 연결은 [#233](https://github.com/JminAILab/CatchU/issues/233)이다. 보장하지 않는 범위는 [worker README](../README.md#보장하지-않는-범위)에 있다.

## 구조

- **부모 프로세스**(`python -m app.consumer`)가 BullMQ로 `analysis-requests` 큐에서 요청을 꺼낸다. 작업마다 자식 프로세스 하나를 새로 띄우고(`multiprocessing`의 spawn), 자식이 파이프로 보낸 진행 알림·결과를 `worker-messages` 큐에 넣는다. 같은 포트(8000)로 상태 확인 `GET /health`만 연다. 상태 확인 외 HTTP 기능은 이 프로세스에 넣지 않는다.
- **자식 프로세스**는 작업 하나를 처리하고 끝난다. 부모에게서 작업 ID, 작업 데이터(JSON), 꺼낸 시각, 큐 접속 정보 없는 설정(LIVE 키는 이 설정 객체로만)을 받고 BullMQ·Redis·FastAPI를 불러오지 않는다. 그래서 생성 제공자·자격정보·임시 자료의 수명이 자식 프로세스의 수명과 같다.
- **부모는 스스로 진행 알림을 만들지 않는다.** 상한 초과·자식 비정상 종료·종료 신호 때도 "실행 불명"을 보내지 않는다. 생성기가 실행 여부를 확인하지 못하면 자식이 기존 규칙대로 `UNCERTAIN`을 알린다([README 「요청 검사와 합성 결과 생성」](../README.md#요청-검사와-합성-결과-생성)).

자식 안의 순서는 다음과 같다.

1. **조회 전 자체 검사**: 메시지 스키마 v2, 요청·시도 ID가 uuid인지, 큐 작업 ID가 시도 ID와 같은지, 두 참조(`credentialContextReference`, `allowedScope.selectionReference`)가 시도 ID와 같은지, 허용 범위의 저장소 ID가 요청의 저장소 ID와 같은지 본다. 어긋나면 진행 알림도 결과도 없이 거부한다.
2. **LIVE**: 요청 정보를 한 번 조회한다([요청 정보 조회](request-context.md)).
   - 찾음: 응답의 접수 기록으로 요청의 열 개 항목을 대조한다(`check_request`). 다르면 진행 알림도 결과도 없이 거부한다. 같으면 `RECEIVED`·`RUNNING`을 알리고 `LiveGenerator`가 수집(`collect`, 시계와 수집 30분은 꺼낸 시각부터, 관계 조회 포함) → 후보 판정(`build_candidates`) → 생성(`run_generation`, 마감 = 꺼낸 시각 + 60분 − 60초)을 한 번씩 부른다. 생성 제공자(Claude API)는 후보가 있을 때 자식 안에서 한 번 만든다. 요청 전체의 실행 여부를 모르면 `UNCERTAIN`만 알린다.
   - 모름·실패: 수집 없이, 진행 알림 없이 FAILED 결과 하나(`stage: COLLECTION`, 이유 코드와 회원 문구)를 보낸다. 판정은 E가 한다.
   - LIVE 설정이 없는 개발·시험 실행이면 처리 전에 거부한다(`LIVE_NOT_CONFIGURED`). 운영은 설정이 없으면 기동하지 않는다.
3. **MOCK**: 개발·시험 설정에서만 요청 정보를 조회하지 않고 메시지 값으로 맥락을 만들어 기존 처리 순서(`process_request`)와 가짜 생성기로 처리한다. 운영 설정은 처리 전에 거부한다. 결과의 맥락은 E가 접수 기록과 다시 대조한다.

추가 기준 브랜치(통합 브랜치)는 넘길 공급원이 없어 기본값(없음)이다. 그래서 통합 브랜치를 쓰는 저장소는 기본 브랜치만 기준으로 판정한다([관계 조회 「추가 기준 브랜치」](relation-collection.md#추가-기준-브랜치)).

## 실행

`worker/`에서 실행한다. 로컬 큐 서버는 큐 검증 키트와 같은 Valkey 8.1.6을 쓴다.

```sh
docker run -d --name catchu-local-queue -p 127.0.0.1:6379:6379 valkey/valkey:8.1.6-alpine
NODE_ENV=development CATCHU_QUEUE_REDIS_URL=redis://127.0.0.1:6379 uv run --locked python -m app.consumer --host 127.0.0.1 --port 8000
```

- `curl -i http://127.0.0.1:8000/health`가 200 `{"status":"ok","consumer":"running"}`이면 큐에 붙어 기다리는 중이다. 큐 주소 없이 띄우면(개발·시험만) 소비자를 끄고 `consumer`가 `disabled`다.
- 끝낼 때는 실행한 터미널에서 `Ctrl+C`를 누른다(SIGINT·SIGTERM을 같은 종료 순서로 처리한다). 컨테이너는 `docker rm -f catchu-local-queue`로 지운다.
- 운영 이미지의 기본 명령이 이 실행이다([배포 안내](../../deploy/README.md)). 단일 호스트 실행은 운영 모드를 고정하고 `worker.env`로 설정을 넣는다.

## 설정

| 이름 | 필수 | 뜻 |
|---|---|---|
| `NODE_ENV` | 선택(기본 production) | `development`·`test`만 개발 동작(평문 큐 주소, MOCK 처리, 큐 주소 없이 기동)을 연다. 그 밖의 값은 모두 운영으로 본다 |
| `CATCHU_QUEUE_REDIS_URL` | 운영 필수 | 큐 서버 주소. 운영은 `rediss://`(TLS)만, 개발·시험은 `redis://`도 받는다. 질의 문자열(`?…`)은 TLS 검증을 끄는 연결 옵션이 될 수 있어 받지 않는다. 주소에 비밀번호가 들어가므로 주소 전체를 비밀값으로 다루고 로그·오류에 내지 않는다 |
| `CATCHU_QUEUE_PREFIX` | 선택(기본 `catchu`) | 큐 키 접두사. api와 같아야 한다. 영문·숫자·`_`·`-` 64자 이하 |
| `CATCHU_WORKER_CONCURRENCY` | 선택(기본 1) | 이 프로세스의 동시 분석 수. 지금은 1만 받고 2 이상이면 기동하지 않는다(아래 「배포에서 지킬 것」). 소비자를 여러 개 띄우면 전체 동시 수는 그 합이다 |
| `CATCHU_WORKER_MOCK` | 선택 | `true`·`false`. 개발·시험 기본 켬, 운영 기본 끔. 운영에서 `true`면 기동하지 않는다 |
| `WORKER_CONTEXT_API_URL`·`WORKER_CONTEXT_API_KEY` | 운영 필수 | 요청 정보 조회의 api 주소와 worker 전용 키([요청 정보 조회 「설정」](request-context.md#설정)) |
| `WORKER_CONTEXT_API_ALLOW_CLUSTER_HTTP` | 선택 | `true`면 클러스터 안 서비스 이름(`*.svc.cluster.local`)에 한해 운영에서도 http 조회 주소를 받는다. 그 밖의 http는 거부한다 |
| `CATCHU_GENERATION_API_KEY` | 운영 필수 | 생성 제공자(Claude API) 키. SDK 환경변수(`ANTHROPIC_API_KEY`)는 쓰지 않는다([생성의 실제 제공자](generation-provider.md#만들-때-넘길-것)) |
| `CATCHU_JUDGEMENT_PROVIDER` | 선택(기본 `openai`) | 판정 공급자(CR3) `openai`·`claude`. 그 밖의 값이면 개발·시험에서도 기동하지 않는다. `claude`면 생성 키로 AI 쪽이 켜진다. 고지 v3가 배포된 뒤에만 `claude`를 넣는다([판정 「켜고 끄기」](generation-judgement.md#켜고-끄기)) |
| `CATCHU_JUDGEMENT_API_KEY` | 선택 | OpenAI 판정 키(CR3). 공급자가 `openai`이고 이 키가 있을 때만 AI 쪽이 켜진다. 운영 필수 셋에 들지 않아 없으면 AI 쪽이 꺼진 채 기동한다. SDK 환경변수(`OPENAI_API_KEY`)는 쓰지 않는다. 고지 v3가 배포된 뒤에만 넣는다 |

운영에서 큐 주소나 LIVE 설정(조회 주소·키, 생성 키)이 없거나 위 값이 틀리면 설정 이름만 로그에 남기고 종료 코드 2로 끝난다. 개발·시험에서는 LIVE 설정 셋을 모두 비우면 LIVE를 끄고(판정 키만 있어도 같다), 일부만 넣으면 기동하지 않는다. 기동 로그에는 판정 공급자 이름과 AI 쪽 켜짐 여부(`judgementProvider=`·`aiSide=`)만 남긴다. 실행 명령은 설정을 읽은 뒤 비밀값(큐 주소, 조회 키, 생성 키, 판정 키)을 환경변수에서 지운다. 분석 자식(spawn)은 부모의 환경변수를 물려받으므로, 큐 비밀번호는 자식에 넘어가지 않고 LIVE 키는 자식용 설정 객체로만 넘어가게 하기 위해서다. 운영 큐 TLS는 시스템 CA로 검증한다. 시간 상한은 환경변수로 열지 않는다(아래 「시간 상한」).

## 상태 확인

| 상태 | 응답 |
|---|---|
| 소비자 꺼짐(개발·시험에서 큐 주소 없음) | 200 `{"status":"ok","consumer":"disabled"}` |
| 큐 서버에 처음 붙기 전 | 503 `{"status":"unavailable","consumer":"starting"}` |
| 실행 중(한 번 붙은 뒤 큐 서버에 잠시 못 붙어 다시 시도하는 동안 포함) | 200 `{"status":"ok","consumer":"running"}` |
| 소비 실행 작업이 끝났거나 예외로 멈춤, 닫힘 | 503 `consumer: stopped`(곧 아래처럼 프로세스가 끝난다) |
| 종료 중 | 503 `consumer: stopping` |

판정은 앱이 쥔 소비 실행 작업과 BullMQ Worker의 상태로 하며 Redis 명령을 기다리지 않는다. 소비 실행 작업이 예상 밖으로 끝나면(첫 연결 재시도가 다 떨어짐, 다시 시도하지 않는 오류 등) 종료 순서를 밟아 종료 코드 1로 끝난다. 상태 확인만 503으로 살아 있으면 단일 호스트 실행(`restart: unless-stopped`)이 컨테이너를 다시 띄우지 않아 소비가 멈춘 채 남기 때문이다. 다시 띄우는 것은 실행 환경(컨테이너 재시작 정책, EKS)의 몫이다. 큐 서버에 처음 붙지 못하는 동안은 `starting`이므로, EKS에서는 시작 확인 시간을 넉넉히 둔다([#275](https://github.com/JminAILab/CatchU/issues/275)).

## 큐 규격 (#233과 공동)

| 항목 | 값 |
|---|---|
| 요청 큐 | `analysis-requests`, 작업 이름 `Request`, 작업 ID = 시도 ID(`attemptId`, uuid) |
| 알림·결과 큐 | `worker-messages`, 작업 이름 `ProcessingEvent`·`Result`, 작업 ID = 메시지 ID |
| 진행 알림 ID | `event-<모드>-<attemptId>-<상태>`. 모드는 `mock`·`live`, 상태는 `received`·`running`·`uncertain` |
| 결과 ID | 메시지 ID `message-<모드>-<attemptId>-result`, 결과 ID `result-<모드>-<attemptId>` |
| 요청 작업 옵션(#233이 넣음) | `attempts: 1`, backoff 없음, `removeOnComplete`·`removeOnFail` 모두 `{age: 7200}`, `stackTraceLimit: 0`. 빠지면 소비자가 같은 보관값을 기본으로 쓰고, 실패 때 stacktrace를 남기지 않게 처리 함수가 `stackTraceLimit: 0`을 넣는다 |
| 진행 알림 옵션 | `attempts: 1`, `removeOnComplete: true`, `removeOnFail: true`, `stackTraceLimit: 0`(처리되면 바로 지운다) |
| 결과 옵션 | `attempts: 1`, `removeOnComplete`·`removeOnFail` 모두 `{age: 1800}`, `stackTraceLimit: 0` |
| 소비자 설정 | 정체 복구 0회(`maxStalledCount: 0`), 잠금 30초(만료 전에 자동 갱신), 정체 검사 30초 |

Python BullMQ는 작업 ID 형식을 검사하지 않으므로 앱이 검사한다. 요청 작업 ID는 uuid이고 작업 데이터의 시도 ID와 같아야 한다. 만드는 ID는 `:`가 없고 숫자만으로 되지 않음을 넣기 전에 확인한다. 같은 시도의 결과는 늘 같은 결과 ID·메시지 ID를 갖고, 진행 알림은 결과보다 먼저 넣으며, 알림·결과를 다시 넣지 않는다. 판본은 `bullmq==3.3.0`·`redis==7.4.1`이고 큐 검증 키트와 같아야 한다(시험이 확인한다). 올릴 때는 api(Node `bullmq`·`ioredis`)와 함께 올리고 키트를 세 엔진으로 다시 돌려 PR에 결과를 붙인다.

## 처리 결과와 큐 완료·실패

자식이 정상적으로 끝낸 경우는 요청 작업을 완료로, 부모가 이상을 본 경우는 실패로 끝낸다. 어느 쪽이든 `attempts: 1`이라 다시 돌지 않는다. 반환값과 실패 사유에는 고정 코드만 담는다(회원 ID·본문·문구 없음).

| 처리 결과 | 큐에 넣는 것 | 요청 작업 | 반환값·실패 사유 |
|---|---|---|---|
| 작업 봉투 이상(이름, 작업 ID ≠ 시도 ID, ID 형식) | 없음 | 실패 | `REQUEST_JOB_INVALID` |
| 처리 전 거부(스키마, 자체 검사, 조회한 접수 기록과 다름, 지난 시도, 받지 않는 MOCK, LIVE 설정 없음) | 없음 | 완료 | `{"handled":"REJECTED","reason":…}`(`SCHEMA_INVALID`·`SELF_CHECK_FAILED`·`CONTEXT_MISMATCH`·`STALE_ATTEMPT`·`MOCK_NOT_ACCEPTED`·`LIVE_NOT_CONFIGURED`) |
| 요청 정보 조회 모름·실패 | FAILED 결과(진행 알림 없음) | 완료 | `{"handled":"RESULT_SENT","outcome":"FAILED"}` |
| 정상 종결 | RECEIVED·RUNNING·결과 | 완료 | `{"handled":"RESULT_SENT","outcome":…}` |
| 자식 안의 실행 불명 | RECEIVED·RUNNING·UNCERTAIN | 완료 | `{"handled":"UNCERTAIN"}` |
| 결함(자식 안 예외, 만든 메시지가 규격에 맞지 않음) | 그때까지의 알림만 | 실패 | `WORKER_DEFECT` |
| 60분 상한 초과 | 그때까지의 알림만 | 실패 | `TIME_LIMIT_EXCEEDED` |
| 자식 비정상 종료·통신 손상(16 MiB 넘는 프레임 포함) | 그때까지의 알림만 | 실패 | `CHILD_EXITED` |
| 종료 신호로 중단 | 그때까지의 알림만 | 실패 | `WORKER_STOPPING` |
| 결과 넣기 실패·시간 초과(보냈는지 모름) | 모름 | 실패 | `RESULT_DISPATCH_UNKNOWN` |
| 처리는 끝났지만 BullMQ의 완료 기록이 실패(잠금을 잃음·큐 서버 오류) | 이미 보낸 것 | 실패 | `COMPLETION_RECORD_FAILED`(BullMQ가 넘긴 오류 원문 대신) |

실패는 고정 코드 예외를 except 블록 밖에서 올려 BullMQ가 실패 사유로 저장하는 문자열과 stacktrace에 원문이 실리지 않게 한다.

## 시간 상한

시계는 부모가 작업을 받은 순간 하나다. 그때부터 60분 안에 자식 띄우기, 요청 정보 조회, 처리, 진행 알림 전송, 종결 프레임 전달이 끝나야 한다. LIVE의 수집 시간 상한(30분)도 이 시각부터 재고, 생성 마감은 이 시각 + 60분 − 60초다(60초는 결과 조합·검사·프레임 전달 여유). 자식 띄우기가 상한을 넘거나 그 사이 종료 신호가 오면 띄우기를 기다리지 않고, 늦게 뜬 자식은 뜨는 즉시 끝내 회수한다. 종결 프레임을 받으면 총 상한 감시를 멈추므로, 그 뒤에 상한이나 종료 신호가 와도 결과를 "결과 없음"으로 바꾸지 않는다. 자식도 꺼낸 시각 + 60분 30초가 되면 스스로 끝내고, 1초마다 부모 프로세스가 바뀌었는지(부모가 죽음) 보고 바뀌면 끝낸다.

이번 [#424 후속 결정](repository-analysis-u7.md) 적용에서 코드에 남아 있던 전체 20분을 60분으로 맞췄다. API는 접수(`submittedAt`)부터 60분을 재므로 두 시계의 시작점은 다르다. `child.live_assembly`와 `LiveGenerator`는 API 마감의 남은 시간을 읽거나 보정하지 않고 꺼낸 시각과 worker 상한만 쓴다. API가 먼저 닫은 요청의 늦은 결과를 거부하는 기존 계약은 유지한다.

| 대기 | 상한 | 넘으면 |
|---|---|---|
| 진행 알림 넣기(한 건) | 5초(총 상한까지 남은 시간이 더 짧으면 그만큼) | 보냈는지 모름으로 기록하고 분석을 계속한다. 다시 넣지 않는다 |
| 결과 넣기 | 10초 | `RESULT_DISPATCH_UNKNOWN`. 다시 넣지 않고 수신 확인 조회는 한다 |
| 종결 프레임 뒤 자식 종료 대기 | 5초 | SIGTERM → 5초 → SIGKILL → 5초 회수. 회수 실패는 기록만 한다 |
| 수신 확인 조회 | 5초 간격으로 5분, 한 번에 3초 | 미관측으로 기록만 한다 |
| 종료 신호 전체 | 25초 | 남은 자식을 SIGKILL하고 프로세스도 스스로 SIGKILL로 끝낸다(종료 코드 137) |

모든 큐 명령은 상한으로 감싼다. Redis 클라이언트의 기본 재시도는 명령마다 몇 분이 걸릴 수 있기 때문이다. 상한에 걸려 끊긴 명령은 이미 실행됐을 수 있으므로 "모름"으로만 다룬다. 시험은 이 값들을 생성자 인자로 짧게 바꾼다.

## 종료 순서

SIGTERM·SIGINT를 앱이 직접 받는다(uvicorn은 신호를 가로채지 않는다). 종료 표시(`/health` 503) → 새 작업 멈춤(`pause`, 2초) → 처리 함수 입구는 새 자식을 띄우지 않음 → 분석 중인 자식을 끝내고 회수 → 그 작업을 `WORKER_STOPPING`으로 실패 기록 → 결과를 넣는 중이면 그 상한까지 기다림 → 멈추기 직전에 꺼낸 작업까지 BullMQ의 처리·실패 기록이 끝나기를 기다림(`close()`는 부른 순간의 작업만 기다리므로) → 수신 확인 조회 취소(미관측 기록) → 정상 `close()` → 상태 확인 서버 종료. 전체 25초를 넘으면 남은 자식을 SIGKILL하고 프로세스도 스스로 SIGKILL로 끝낸다. 종료 코드가 정지 유예를 넘긴 강제 종료와 같은 137이라, 단일 호스트 교체 절차는 이를 정상 종료로 보지 않고 멈춘다. `close(force=True)`는 실패 기록을 건너뛰므로 쓰지 않는다. 단일 호스트 실행의 정지 유예는 30초다.

## 수신 확인

결과를 넣은 뒤 그 결과 작업을 메시지 ID로 5분 동안 다시 읽는다. E 소비자(#233)가 결과 작업을 마치며 돌려준 `ResultReceipt`가 보이면 종류(`ACCEPTED`·`DUPLICATE`·`REJECTED`)와 사유 코드를 기록하고, 세 식별자(결과·요청·시도 ID)가 보낸 결과와 같은지 본다. 반환값이 없거나(E가 식별할 수 없다고 판정) 형식이 틀리거나 식별자가 다르거나 결과 작업이 실패했으면 그 사실만 기록한다. 읽은 뒤에는 결과 작업을 지운다. 5분 안에 E가 처리하지 않았거나 지우기가 실패한 결과 작업은 큐에 남는다. 큐의 보관 정리(`{age: 1800}`)는 시간 상한이 아니라, 같은 큐에서 다른 작업이 완료·실패로 끝날 때 30분 넘은 완료·실패 작업을 지우는 방식이다. E가 꺼져 있어 처리되지 않은 결과 작업은 E가 처리할 때까지 남는다. 어느 경우에도 결과를 다시 보내거나 분석을 다시 하지 않는다. `ACCEPTED`는 E가 받았다는 뜻이지 회원 화면에 반영됐다는 뜻이 아니다(반영은 E/B가 판단).

## 로그

작업 ID·시도 ID·처리 결과 코드·상태와 요청 정보 조회의 이유·원인 코드만 남기고 메시지 본문·회원 값·토큰·조회 응답·예외 원문은 남기지 않는다. 자식의 모든 로그 줄에는 `attemptId=`가 붙어, 생성 제공자의 호출별 줄도 요청과 이을 수 있다. 예외는 종류 이름만 남긴다.

## 검사

[README 「변경 후 검사」](../README.md#변경-후-검사)의 명령이 큐 소비자 시험(`tests/test_consumer_*.py`)과 LIVE 처리 시험(`tests/test_live_processing.py`)도 돈다. LIVE는 loopback 합성 조회 API·합성 GitHub·합성 제공자로 조회 1회·요청 대조·수집부터 생성까지·생성 마감·조회 모름과 실패·자격정보 해제를 보고, 실제 자식 프로세스로도 한 번씩 돈다. 실제 Redis가 필요한 시험(종료 신호 경쟁, 정체 0회, 잠금 갱신, Node가 넣은 요청 옵션, 보관 정리, 상태 확인, 실패 사유)은 `CATCHU_TEST_REDIS_URL`이 있을 때만 돈다. CI는 Valkey 8.1.6 서비스 컨테이너로 이 값을 주므로 건너뛰지 않는다. 로컬에서는 위 「실행」의 컨테이너를 띄운 뒤 다음처럼 돌린다.

```sh
CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6379 uv run --locked pytest tests/test_consumer_redis.py
```

Node가 넣은 요청 옵션 시험은 큐 검증 키트의 Node BullMQ를 쓰므로 `docs/queue-verification`에서 `npm ci`를 먼저 한다(없으면 건너뛰고, `CATCHU_TEST_REQUIRE_NODE=1`이면 실패한다). 시험은 접두사를 시험마다 새로 만들고 끝나면 그 키를 지운다.

## 배포에서 지킬 것

- 같은 큐에 소비자를 둘 이상 띄우면 전체 동시 분석 수가 1이 아니다. 교체할 때는 새 worker가 뜨기 전에 옛 worker가 내려가야 한다(EKS 실행 파일의 업데이트 방식은 [#275](https://github.com/JminAILab/CatchU/issues/275)에서 정한다).
- 컨테이너 PID 1이 부모 프로세스이고, 부모가 자식을 직접 회수한다. 첫 분석 뒤에는 spawn이 띄우는 자원 추적 프로세스가 하나 더 남는다.
- 동시 수는 지금 1만 받는다(10/15 팀장 결정). 2 이상이면 멈추기 직전에 꺼낸 작업 하나가 실패 기록 없이 active로 남을 수 있고(BullMQ가 멈춘 동안 가져온 작업을 닫을 때에야 처리한다), 분석과 LLM 호출이 겹친다. 올릴 때는 상한(`MAX_CONCURRENCY`)과 함께 이 틈을 고치고 시험한다. 동시 수 1에서는 이 틈이 생기지 않는다(시험으로 확인).
