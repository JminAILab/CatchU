# CatchU 큐 기술 검증 — api와 worker 사이 작업 전달에 BullMQ를 쓸 수 있는가

> **지위: 제안** — 단 "#121을 BullMQ로 개발한다"는 2026-10-02 팀원 1(F 담당) 결정이다. 큐 최종 선정은 팀원 1이 하며([검토초안 §5][arch5]), 채택 완료는 §5가 정한 확인 가운데 남은 둘(결과를 다시 받아도 DB에 두 번 반영하지 않음, NCP 실제 인스턴스 — 각각 배포 전 조건 1·3)을 마친 뒤 기록한다. 판정 "조건부 채택 가능", 개발 조건과 배포 전 조건, [#121이 구현할 것](CatchU_queue_requirements.md#큐가-해-주는-것과-121이-구현할-것), [E와 확인할 쟁점](CatchU_queue_requirements.md#e와-확인할-쟁점)은 제안이고, E·H에 걸린 조건은 각 담당이 확인한다. 「[결과](CatchU_queue_verification_results.md#결과)」 절의 실험 결과는 2026-10-02 재실행 기록이며 소급 수정하지 않는다. 로컬 Docker와 합성 자료로 확인했고 **NCP 실제 인스턴스는 확인하지 못했다.** 승인된 [API 명세 v1][contract]과 [worker 메시지 계약][wm]이 정본이며, 어긋나면 계약이 이긴다. 추적 이슈는 [#77][i77]이다.

이 문서의 영역 이름: **E**는 api의 분석 요청·작업 상태(팀원 2), **F**는 worker의 수집·분석 결과 생성(팀원 1), **B**는 Catch 등록·자산(팀원 4), **H**는 배포·환경([#24][i24])이다.

문서는 세 파일로 나뉜다. 이 문서는 판정·조건·한계·근거를, [결과 기록](CatchU_queue_verification_results.md)(지위 기록)은 확인 방법과 실험 결과를, [구현 요구와 쟁점](CatchU_queue_requirements.md)(지위 제안)은 #121 구현 요구·실행 불명 판단·E와 확인할 쟁점·NCP 적용 조건을 담는다.

## 결론

**판정: 조건부 채택 가능.** api(NestJS)에서 worker(Python)로 분석 요청을 보내고, worker가 진행 알림과 결과를 돌려보내는 데 BullMQ를 쓸 수 있다. 이 판정은 [#121][i121](worker 전달 연결)을 BullMQ로 **개발해도 된다**는 뜻이고, 팀원 1은 이에 따라 #121을 BullMQ로 개발하기로 2026-10-02에 정했다. 실제 E·F 연결과 운영 투입은 아래 「배포 전 조건」을 채운 뒤에 한다. 연결 자체는 문제가 없었다. Node `bullmq` 6.3.11과 Python `bullmq` 3.3.0은 Redis에서 실행하는 스크립트(Lua) 49개가 글자까지 같았고, 합성 요청·결과가 양쪽 방향으로 값 그대로 오갔다. NCP가 새로 만들 수 있는 세 엔진(Redis 7.2.11, Valkey 7.2.11, Valkey 8.1.6)에서 47개 시나리오의 판정이 모두 같았다.

다만 두 가지는 큐가 해 주지 않으므로 애플리케이션이 맡아야 한다.

1. **분석이 두 번 돌지 않게 막는 일.** BullMQ는 "최소 한 번 전달"까지만 보장한다. worker는 처리 중인 작업을 쥐고 있다는 신호(잠금)를 큐에 주기적으로 보내는데, worker가 죽어 이 신호가 끊기면 큐가 그 작업을 대기열로 돌려 다시 준다(아래에서 "정체 복구"라 부른다). 기본 설정에서 분석 중에 worker를 강제 종료하자 다시 받은 작업이 분석을 한 번 더 불렀다(2회). 정체 복구를 끄면 다시 부르지는 않았지만 작업이 조용히 실패해, 생성기를 부르기 전에 죽은 요청은 E가 종결 결과도 실행 불명(`UNCERTAIN`) 알림도 받지 못하고 "실행 중"(`RUNNING`)에 머물렀다. 정체 복구를 켠 채(개발 조건 3) worker가 시도마다 "분석 시작"과 "결과"를 큐 밖에 먼저 기록하고 다시 받은 작업을 그 기록으로 판단하게 하자, 다섯 중단 지점과 모든 중복 사례에서 분석은 1회 이하였고 지점마다 기대한 결과(다시 실행해 정상 종결, `UNCERTAIN`, 보존 결과 수락)가 나왔다.
2. **큐 자료가 사라지는 경우에 대비하는 일.** NCP의 Redis 계열 서비스는 공식 문서에서 "캐시라 데이터 무결성을 보장하지 않는다"고 하고, 상시 영속성(AOF) 설정 항목이 없다. 영속성 없는 서버를 재시작하자 대기 중 요청, 보낸 결과, 보낸 `UNCERTAIN` 알림이 사라졌다. 요청은 E의 접수 기록에서, 결과와 `UNCERTAIN`은 F의 기록에서 다시 보낼 수 있어야 한다. 실행기가 E 대신 같은 요청을 다시 넣거나 F가 주기 점검으로 다시 보내게 하자 분석이 다시 돌지 않고 회복됐고, E가 거부한 결과는 다시 보내지 않았다.

이 문서에서 **분석**은 worker의 생성기 호출 하나(dev의 `Generator.generate`: 수집·후보 판정·초안·질문 생성 전체)를 뜻한다. LLM 호출은 그 안의 일부다.

**개발 조건** — #121을 BullMQ로 개발할 때 지킬 조건이다. 하나라도 빠지면 위 판정이 성립하지 않는다.

| # | 조건 | 담당 | 근거 |
|---|---|---|---|
| 1 | worker가 시도(`attemptId`, E가 분석 시도마다 붙이는 ID)별로 요청 내용·분석 시작 표식·보존 결과·전송 기록을 큐 밖에 남기고, 다시 받은 작업은 그 기록으로 판단한다. 시작 표식은 생성기를 부르기 **전에** 디스크에 확정한다 | F([#121][i121]) | [3. worker 중단](CatchU_queue_verification_results.md#3-worker-중단과-재기동) |
| 2 | E가 요청을 큐에 넣을 때 재시도 횟수를 `attempts: 1`로 명시하고 `backoff`를 주지 않는다. 큐·Nest 모듈의 기본 작업 옵션이 이를 바꾸지 않는지 실제 적용 값을 확인한다. 연결 재시도·결과 재전달은 분석 재시도와 다르다 | E | [3. worker 중단](CatchU_queue_verification_results.md#3-worker-중단과-재기동) |
| 3 | worker의 정체 복구 허용 횟수(`maxStalledCount`)를 1 이상(기본값 1)으로 둔다. 0이면 생성기를 부르기 전에 죽은 작업이 조용히 실패한다 | F([#121][i121]) | [3. worker 중단](CatchU_queue_verification_results.md#3-worker-중단과-재기동) |
| 4 | 생성기를 별도 스레드에서 돌려, 생성이 오래 걸려도 worker가 작업을 쥐고 있다는 신호(잠금 갱신)를 큐에 계속 보내게 한다. 실제 생성기로 바꿀 때 CPU 점유·예외·취소·종료 동작을 확인하고, 앞 실행이 남아 있으면 다음 분석을 시작하지 않는다. 문제가 있으면 별도 프로세스로 나눈다 | F([#121][i121]) | [살아 있는 worker의 잠금 상실](CatchU_queue_verification_results.md#살아-있는-worker의-잠금-상실) |
| 5 | 큐에서 사라진 요청을 E가 접수 기록으로 다시 넣을 수 있다(조건과 한도는 쟁점 3) | E | [5. 큐 저장소 조건](CatchU_queue_verification_results.md#5-큐-저장소-조건) |
| 6 | Node·Python 판본을 고정하고 함께 올리며, 올릴 때마다 [재현 키트](queue-verification/README.md)를 다시 돌린다. Redis 클라이언트·Nest 모듈·이미지 판본도 고정한다 | F·E | [1. Node·Python 연결](CatchU_queue_verification_results.md#1-nodepython-연결) |

**배포 전 조건** — #121 개발과 함께 진행하되, 실제 E·F 연결과 NCP 배포 **전에** 확인한다. 이번 검증은 분석 재실행을 막을 수 있음을 보였을 뿐, 결과가 서비스에 등록된다는 것까지 보이지는 않았다.

| # | 조건 | 담당 | 근거·확인 방법 |
|---|---|---|---|
| 1 | E가 결과를 받을 때 등록 복구에 쓸 자료와 미등록 상태를 수신 기록과 같은 트랜잭션에 남기고, 큐가 결과를 다시 주지 않아도 등록을 복구한다([#116 「수신 후 반영 전 장애」](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)의 안 1). 복구에 쓸 자료는 결과 본문(1-가)이나 본문을 되찾을 영속 참조(1-나)이며, 어느 쪽이 계약에 맞는지는 #116에서 아직 판단 전이다. 지금 수신 구현은 수신 기록에 식별자·지문·수신 시각만 두고 중복 수신 때 본문을 넘기지 않으므로([E 수신 안내](../api/docs/analysis-receiver.md)) 큐 재전달만으로는 복구되지 않는다. 같은 결과를 다시 받아도(큐 재전달·F 재전송·복구 재시도) B 등록과 E 반영이 한 번만 일어나는지도 함께 확인한다. 이것이 [검토초안 §5][arch5]의 남은 확인 하나이며 [#105](https://github.com/JminAILab/CatchU/issues/105)(등록·반영) 범위와 겹친다 | E·B | 쟁점 4. 수신 뒤·등록 전 중단 시험 · 등록 중복은 미확인([결과 4](CatchU_queue_verification_results.md#4-결과-전달과-수신-확인)) |
| 2 | F가 보존 결과의 전달을 기동 때만이 아니라 주기적으로 점검해 다시 보내고, 재전송 횟수·기한을 넘으면 사람 확인으로 올린다. 기동 점검만 있으면 그 뒤 큐 자료가 사라졌을 때 다시 보낼 계기가 없다 | F([#121][i121]) | 키트에서 동작을 확인했다([5](CatchU_queue_verification_results.md#5-큐-저장소-조건)). #121 시험에서 다시 확인 |
| 3 | NCP 실제 인스턴스에서 축출 정책이 `noeviction`(메모리가 차도 지우지 않음)인지, 키트의 연결 시나리오가 도는지(허용 명령), 장애 조치 뒤 다시 연결되는지, 상시 영속성이 어떻게 설정됐는지(`INFO persistence`) 확인한다. 축출 정책이 다르면 운영을 시작하지 않는다 | H([#24][i24]) | [NCP 적용 조건](CatchU_queue_requirements.md#ncp-적용-조건) |
| 4 | 실행 불명(`UNCERTAIN`)을 사용자에게 어떻게 보일지, 그런 요청을 누가 어떤 증거로 끝낼지 정한다 | E·팀장 | 쟁점 1·2 |
| 5 | F의 실행 차단 기록이 사라지거나 만료된 뒤 같은 시도가 다시 와도 분석하지 않는 규칙을 E·F가 맞춘다 | E·F | 쟁점 3. 키트에서 한 가지 규칙을 확인([2](CatchU_queue_verification_results.md#2-중복-전달) 표의 마지막 행) |
| 6 | 배포 중에도 같은 큐를 받는 worker 실행이 하나만 돌게 한다(새 worker는 앞 worker가 끝난 뒤 시작) | H·F | [3](CatchU_queue_verification_results.md#3-worker-중단과-재기동)의 전제 |

## 판정 기준과 #77 문구와의 차이

판정 기준은 #77의 확인 항목, [#121][i121] 완료 기준, [#116 「누가 구현·검사하는가」](CatchU_collection_control_checks.md#7-누가-구현검사하는가)가 #77에 넘긴 요구 4가지(같은 메시지가 두 번 와도 다시 호출하지 않음, worker가 중단돼도 자동으로 다시 실행하지 않음, 보존한 뒤 전달하고 같은 결과를 다시 보낼 수 있음, 전달 상태를 재기동 뒤에도 알 수 있음)에서 가져왔다. 새로 만든 기준은 없다. 이 가운데 "자동으로 다시 실행하지 않음"은 생성기를 부르기 전 단계만 다시 도는 처리(진행 알림을 다시 보내는 것 등)는 재실행으로 보지 않는다고 해석했다(제안).

- 같은 요청이 다시 전달되거나 worker가 중단·재기동돼도 분석이 자동으로 다시 불리지 않는다([명세 「전이·불변 조건」][contract], [worker 규칙 BR3.5][wr]).
- 실행 여부를 모르면 실행 불명으로 남기고 성공·실패로 확정하지 않는다(명세 「전이·불변 조건」의 "실행이 확인되지 않으면 UNCERTAIN을 유지", #121의 "실행 불명과 확정 실패가 구분된다"). 그래서 E가 종결 결과도 `UNCERTAIN`도 받지 못한 채 멈추는 것도 요구를 채우지 못한 것으로 본다.
- 이미 보존한 결과를 다시 보내는 것과 분석을 다시 하는 것을 구분한다.
- 수신 확인 `ACCEPTED`는 서비스 DB 반영이나 본인 조회 가능을 뜻하지 않는다.

계약이 #77에 넘긴 두 가지에 대한 답이다.

- **"#77 이전에 큐 시간 초과로 실패 확정하는 규칙은 만들지 않는다"**([명세 「전이·불변 조건」][contract]): #77 뒤에도 만들지 않기를 제안한다. 큐의 시간 초과·정체 판정은 분석을 시작했는지조차 알려 주지 않는다([결과 3](CatchU_queue_verification_results.md#3-worker-중단과-재기동)).
- **"정량 timeout/처리 상한은 기술 검증 후 이슈로 보완"**([명세 「공통 오류·요청 안전성」][contract]): 큐 쪽에서 정할 값은 없다. 처리 상한은 [#116 「자원·시간 상한」](CatchU_collection_control_scope.md#23-자원시간-상한)의 제안값을 [#117][i117]·[#121][i121] 실측으로 확정한다.

#77 본문(9/22)과 현행 기준이 다른 곳은 현행 기준을 따랐다.

| #77 본문 | 현행 기준 | 이 문서 |
|---|---|---|
| worker → E 알림 "수신·실행 중·실패" | 진행 알림의 상태는 `RECEIVED`·`RUNNING`·`UNCERTAIN` 셋뿐이고, 실패는 종결 결과의 `FAILED`로 전한다. 처리 전 거부는 아무 메시지도 보내지 않는다([worker 메시지 계약][wm], [#113][i113]) | 계약대로 확인했다. 실패 알림을 새로 제안하지 않는다 |
| "NCP 관리형 큐" | NCP에 BullMQ용 큐 상품은 없고, 확인 대상은 Redis 계열 저장소 Cloud DB for Cache다 | 그 상품을 확인했다 |
| 결과 문서는 `docs/ai-dlc-input-mvp/` 아래 | 그 폴더는 10월 intent의 입력 자료다. 이후 기술 판단 문서([작업 동일성 판별 기준](CatchU_작업동일성_판별기준.md), [수집 통제·임시 자료](CatchU_수집통제_임시자료.md))는 `docs/`에 두었다 | `docs/`에 두고 [문서 목록](README.md)에 올렸다 |

## 무엇으로 확인했나

이 절은 [결과 기록 「무엇으로 확인했나」](CatchU_queue_verification_results.md#무엇으로-확인했나)에 있다.

## 결과

이 절은 [결과 기록 「결과」(1. Node·Python 연결, 2. 중복 전달, 3. worker 중단과 재기동, 살아 있는 worker의 잠금 상실, 4. 결과 전달과 수신 확인, 5. 큐 저장소 조건)](CatchU_queue_verification_results.md#결과)에 있다.

## 큐가 해 주는 것과 #121이 구현할 것

이 절은 [구현 요구와 쟁점 「큐가 해 주는 것과 #121이 구현할 것」](CatchU_queue_requirements.md#큐가-해-주는-것과-121이-구현할-것)에 있다.

## 진행 알림과 실행 불명 판단 — #23 Q4·Q5 제안

이 절은 [구현 요구와 쟁점 「진행 알림과 실행 불명 판단」](CatchU_queue_requirements.md#진행-알림과-실행-불명-판단--23-q4q5-제안)에 있다.

## E와 확인할 쟁점

이 절은 [구현 요구와 쟁점 「E와 확인할 쟁점」](CatchU_queue_requirements.md#e와-확인할-쟁점)에 있다.

## NCP 적용 조건

이 절은 [구현 요구와 쟁점 「NCP 적용 조건」](CatchU_queue_requirements.md#ncp-적용-조건)에 있다.

## 대안을 깊이 보지 않은 이유

현재 요구(자동 재분석 금지, 실행 불명 유지, 재전달과 재분석 구분)를 BullMQ가 못 지키는 문제는 나오지 않았다. 남은 위험 두 가지 — 큐가 "최소 한 번"만 보장하는 것과 NCP 저장소가 자료를 잃을 수 있는 것 — 는 Redis Streams를 직접 쓰는 대안([검토초안 §5][arch5])에도 똑같이 있고 같은 애플리케이션 처리가 필요하다. Streams를 직접 쓰면 Node·Python BullMQ 판본을 맞춰야 하는 부담은 줄지만, 대기 중 메시지 회수와 수신 확인을 직접 만들어야 한다. 지금 전환할 근거는 없다. BullMQ 6·Python 3에는 PostgreSQL을 큐 저장소로 쓰는 기능도 생겼지만 이번에 시험하지 않았다.

## 하지 않은 것과 한계

- NCP 자원 생성·실제 인스턴스 확인, 실제 GitHub 수집·LLM 호출, 배포는 하지 않았다.
- E·B의 저장·반영은 구현하지 않았다. E 수신 처리는 dev 코드 그대로지만 저장은 파일 대역이다. E 쪽 생산자·소비자는 `@nestjs/bullmq` 모듈이 아니라 `bullmq`를 직접 썼다.
- worker는 한 프로세스만 시험했다. 여러 대가 같은 큐를 받는 경우, 장애 조치의 DNS 전환, 부하·처리 시간은 시험하지 않았다.
- E가 큐에서 사라진 요청을 다시 넣는 구현은 없어서 실행기가 같은 요청을 다시 넣어 대신했다. E 재발행의 조건·한도(쟁점 3)는 시험하지 않았다.
- E가 결과를 받은 뒤 등록하기 전에 멈추는 경우의 복구(배포 전 조건 1)는 시험하지 않았다. 이번 검증은 분석 재실행을 막을 수 있음을 보였고, 결과가 서비스에 등록된다는 것은 보이지 않았다.
- 중단 시험은 프로세스 강제 종료(SIGKILL) 한 가지다. 전원 장애(폴더를 디스크에 확정하지 않은 결함은 여기서만 드러난다), 디스크 손상, 서버 자체 유실은 다루지 않았다.
- 재전달 횟수·기한과 주기 점검은 키트에 구현했고 주기 점검은 실행에서 거쳤지만, 횟수·기한 초과 등 일부 분기는 실행되지 않았다(「#121이 구현할 것」 7).
- 생성기는 가짜이고 스레드에서 짧게 돌았다. 실제 생성기의 CPU 점유, 예외·취소·종료 뒤 스레드가 남는지는 확인하지 않았다(개발 조건 4).
- 잠금·정체 검사 시간을 줄여(2초·1초) 시험했다. 제품 기본값(30초)에서는 돌리지 않았다.
- 키트 코드는 사람이 검토하지 않았다. 다른 AI 모델의 교차 검토(「근거」)를 거쳤지만 팀원 검토가 아니다.

## 근거

저장소 안:

- [API 명세 v1 「분석 접수·상태·재요청」·「W — worker 메시지 계약」][contract], [worker 메시지 계약][wm], [E 상태 전이 정본][espec], [worker 규칙][wr]
- [수집 통제와 임시 자료(#116)][f116]: [「수명표」](CatchU_collection_control_temp_data.md#42-수명표)·[「정리 실패·프로세스 중단」](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단)·[「재전달」](CatchU_collection_control_temp_data.md#52-재전달)·[「수신 후 반영 전 장애」](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)
- [공통 아키텍처 검토초안 §5·§6][arch5] — 검토용 입력
- dev 코드: [E 수신 처리](../api/src/analysis-receiver/analysis-receiver.service.ts)와 [E 수신 안내](../api/docs/analysis-receiver.md), [회원·분석 선행 테이블](../api/docs/member-analysis.md), [worker 처리 경계](../worker/app/processing/pipeline.py)

공식 자료(확인일 2026-10-01). NCP 가이드는 `curl`이 차단돼 브라우저로 원문을 읽었다. 인용은 원문을 다시 받아 문장 단위로 대조했고 과장된 문장은 고쳐 썼다. 이 대조는 작성 과정의 자체 확인이며 팀원 검토가 아니다. 2026-10-02에는 다른 AI 모델(Codex)에 이 문서와 키트를 보내 독립 판단, 판정 평가, 코드 검토를 받았다. 공식 자료로 다시 확인한 지적만 반영했고(판본 근거, 장애 조치 범위, 재전달 분기, 판정식 강화 등), 근거가 약한 지적 두 가지는 원문을 대조해 반영하지 않았다. 이것도 팀원 검토가 아니다.

| 내용 | 출처 |
|---|---|
| 상품명 변경·DBMS 선택·Private Subnet, 고가용성 시 백업 고정 | <https://api.ncloud-docs.com/docs/database-vcache>, <https://api.ncloud-docs.com/docs/database-vcache-createcloudcacheinstance> |
| 판본별 End of Life·판매 종료, `CONFIG` 수행 불가, 비밀번호 비활성 | <https://guide.ncloud-docs.com/docs/clouddbforcache-compliance> |
| 막힌 명령, Simple 고가용성·장애 조치 최대 3분 | <https://guide.ncloud-docs.com/docs/clouddbforcache-spec> |
| 캐시라 무결성 보장 안 함 | <https://guide.ncloud-docs.com/docs/database-database-8-5> |
| 재시작 시 데이터 손실·Simple 고가용성의 동시 재시작, 수동 백업 간격, 접속 포트 | <https://guide.ncloud-docs.com/docs/database-database-8-1> |
| 백업 보관·복원 | <https://guide.ncloud-docs.com/docs/database-database-8-3> |
| Config Group 변수 목록 | <https://guide.ncloud-docs.com/docs/database-database-8-9> |
| 장애 시 캐시 데이터 손실, 외부 직접 접속 불가·SSL VPN 경유 | <https://guide.ncloud-docs.com/docs/clouddbforcache-troubleshoot-common> |
| 판본 추가·종료 이력 | <https://guide.ncloud-docs.com/docs/clouddbforcache-releasenote> |
| 판본(npm 6.3.11, PyPI 3.3.0, Alpha) | <https://registry.npmjs.org/bullmq/latest>, <https://pypi.org/pypi/bullmq/json> |
| 당시 판본 목록과 교차 언어 처리 설명(2026-09-27) | <https://bullmq.io/news/260927/bullmq-v6-postgresql/> |
| Python 상호 운용·미지원 기능, "실험적" 표시(문서 원본 설명문) | <https://github.com/taskforcesh/bullmq/blob/master/python/README.md>, <https://docs.bullmq.io/python/introduction>, <https://github.com/taskforcesh/bullmq/blob/v6.3.11/docs/gitbook/python/introduction.md> |
| 최소 한 번 전달 | <https://docs.bullmq.io/> |
| 정체 작업 | <https://docs.bullmq.io/guide/jobs/stalled>, <https://docs.bullmq.io/guide/troubleshooting> |
| 작업 ID·중복 방지 | <https://docs.bullmq.io/guide/jobs/job-ids>, <https://docs.bullmq.io/guide/jobs/deduplication> |
| 운영 권고(`noeviction`, AOF, 재연결) | <https://docs.bullmq.io/guide/going-to-production> |
| Redis 호환 판본 | <https://docs.bullmq.io/guide/redis-tm-compatibility/> |
| v5→v6 변경 | <https://docs.bullmq.io/guide/migrations/migrate-from-v5-to-v6>, <https://github.com/taskforcesh/bullmq/blob/master/docs/gitbook/changelog.md> |
| 결과 전달 큐·이벤트 스트림 보존 | <https://docs.bullmq.io/guide/returning-job-data>, <https://docs.bullmq.io/guide/events/> |

## 결정 이력

- **2026-10-02** — #77 검증 결과로 작성했다. 판정은 "조건부 채택 가능"(#121을 BullMQ로 개발해도 된다는 뜻)이고, 조건을 개발 조건과 배포 전 조건(E 등록 복구, F 주기 전달 복구, NCP 확인 등)으로 나눠 적었다. 팀원 1은 #121을 BullMQ로 개발하기로 정했고, 채택 완료는 [검토초안 §5][arch5]의 남은 확인 뒤 기록한다. 저장소에 올리지 않은 10-01 초안을 다른 AI 모델로 교차 검토한 뒤, 보호 장치(요청 내용 대조, `UNCERTAIN` 재전송, 주기 점검, 거부 표식, 폴더 확정)와 다섯 중단 지점을 넣어 세 엔진에서 다시 돌렸다. AI가 한 번에 읽을 수 있게 판정(이 문서)·[결과 기록](CatchU_queue_verification_results.md)·[구현 요구와 쟁점](CatchU_queue_requirements.md) 세 파일로 나눴다. 구현 요구나 쟁점이 바뀌면 제안 절을 고치고, 결과 기록은 고치지 않는다.

[i77]: https://github.com/JminAILab/CatchU/issues/77
[i121]: https://github.com/JminAILab/CatchU/issues/121
[i113]: https://github.com/JminAILab/CatchU/issues/113
[i117]: https://github.com/JminAILab/CatchU/issues/117
[i24]: https://github.com/JminAILab/CatchU/issues/24
[contract]: ../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md
[wm]: ../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
[espec]: ../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#상태-전이-정본
[wr]: ../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
[f116]: CatchU_수집통제_임시자료.md
[arch5]: ai-dlc-input-mvp/CatchU_공통_아키텍처_검토초안.md#5-주요-기술-선택과-판단-근거
