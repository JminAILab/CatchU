# CatchU 큐 기술 검증 — api와 worker 사이 작업 전달에 BullMQ를 쓸 수 있는가

> **지위: 제안** — 단 "#121을 BullMQ로 개발한다"는 2026-10-02 팀원 1(F 담당) 결정이고, 개발 조건·배포 전 조건에서 "10/6 결정"이라고 적은 칸은 [2026-10-06 팀장 결정][d1006]을 옮긴 것이다. 큐 최종 선정은 팀원 1이 하며([검토초안 §5][arch5]), 채택 완료는 §5가 정한 확인 가운데 남은 하나(배포 서버 확인 — 배포 전 조건 3)를 마친 뒤 기록한다. §5의 "결과 재전달 시 DB에 중복 반영하지 않는지"는 2026-10-06 팀장이 채택 완료 조건에서 빼고 [#233][i233] 완료 기준(같은 결과가 두 번 와도 수신 기록은 하나다)으로 옮겼다. 판정 "조건부 채택 가능", 나머지 개발 조건과 배포 전 조건, [#121이 구현할 것](CatchU_queue_requirements.md#큐가-해-주는-것과-121이-구현할-것), [E와 확인할 쟁점](CatchU_queue_requirements.md#e와-확인할-쟁점)은 제안이고, E·H에 걸린 조건은 각 담당이 확인한다. 「[결과](CatchU_queue_verification_results.md#결과)」 절의 실험 결과는 2026-10-02 재실행 기록이며 소급 수정하지 않는다. 로컬 Docker와 합성 자료로 확인했고 **배포 서버(AWS, 큐 서버로 쓸 서비스는 미정)에서는 확인하지 못했다.** 승인된 [API 명세 v1][contract]과 [worker 메시지 계약][wm]이 정본이며, 어긋나면 계약이 이긴다. 10/6 결정 가운데 지금 계약과 다른 것(처리 시한으로 실패 닫기 등)은 처리 시한 계약 PR이 병합된 뒤 적용한다. 추적 이슈는 [#77][i77]이다.

이 문서의 영역 이름: **E**는 api의 분석 요청·작업 상태(팀원 2), **F**는 worker의 수집·분석 결과 생성(팀원 1), **B**는 Catch 등록·자산(팀원 4), **H**는 배포·환경([#24][i24])이다.

문서는 세 파일로 나뉜다. 이 문서는 판정·조건·한계·근거를, [결과 기록](CatchU_queue_verification_results.md)(지위 기록)은 확인 방법과 실험 결과를, [구현 요구와 쟁점](CatchU_queue_requirements.md)(지위 제안)은 #121 구현 요구·실행 불명 판단·E와 확인할 쟁점·배포 서버 적용 조건을 담는다.

## 결론

**판정: 조건부 채택 가능.** api(NestJS)에서 worker(Python)로 분석 요청을 보내고, worker가 진행 알림과 결과를 돌려보내는 데 BullMQ를 쓸 수 있다. 이 판정은 [#121][i121](worker 전달 연결)을 BullMQ로 **개발해도 된다**는 뜻이고, 팀원 1은 이에 따라 #121을 BullMQ로 개발하기로 2026-10-02에 정했다. 실제 E·F 연결과 운영 투입은 아래 「배포 전 조건」을 채운 뒤에 한다. 연결 자체는 문제가 없었다. Node `bullmq` 6.3.11과 Python `bullmq` 3.3.0은 Redis에서 실행하는 스크립트(Lua) 49개가 글자까지 같았고, 합성 요청·결과가 양쪽 방향으로 값 그대로 오갔다. 2026-10-02 당시 배포 대상이던 NCP가 새로 만들 수 있던 세 엔진(Redis 7.2.11, Valkey 7.2.11, Valkey 8.1.6)에서 47개 시나리오의 판정이 모두 같았다.

다만 두 가지는 큐가 해 주지 않는다. [10/6 팀장 결정][d1006]에 따라 앱 안에 복구 장치를 따로 두지 않고 아래처럼 다룬다.

1. **분석이 두 번 돌지 않게 막는 일.** BullMQ는 "최소 한 번 전달"까지만 보장한다. worker는 처리 중인 작업을 쥐고 있다는 신호(잠금)를 큐에 주기적으로 보내는데, worker가 죽어 이 신호가 끊기면 큐가 그 작업을 대기열로 돌려 다시 준다(아래에서 "정체 복구"라 부른다). 기본 설정(정체 복구 1회)에서 분석 중에 worker를 강제 종료하자 다시 받은 작업이 분석을 한 번 더 불렀다(2회). 정체 복구를 끄자 분석은 다시 불리지 않았고, 작업은 조용히 실패해 E가 "실행 중"(`RUNNING`)에 머물렀다. 그래서 큐 설정으로 막는다. 요청 작업은 `attempts: 1`(재시도 없음), 정체 복구는 0회(`maxStalledCount: 0`)다(개발 조건 2·3). 머문 요청은 아래 2의 처리 시한이 닫는다. 큐 자료가 사라지면 같은 시도가 한 번 더 실행될 수 있지만, 드물고 분석 비용만 더 드는 일이라 받아들인다. 키트에서는 worker가 시도마다 "분석 시작"과 "결과"를 큐 밖에 기록하고 다시 받은 작업을 그 기록으로 판단하게 해(보호 F) 정체 복구를 켠 채 분석을 1회 이하로 막았다. 이 장치는 실험 근거로만 남기고 채택하지 않는다.
2. **큐 자료가 사라지거나 끝나지 않은 요청.** 영속성 없는 서버를 재시작하자 대기 중 요청, 보낸 결과, 보낸 `UNCERTAIN` 알림이 사라졌다. 2026-10-02 조사 당시 배포 대상이던 NCP의 Redis 계열 서비스는 공식 문서에서 "캐시라 데이터 무결성을 보장하지 않는다"고 했고, 상시 영속성(AOF) 설정 항목이 없었다. 키트에서는 같은 요청을 다시 넣거나 F가 큐 밖 기록으로 다시 보내 회복했지만, 이것도 채택하지 않는다. 앱은 사라진 요청·결과·알림을 다시 보내지 않는다. 끝나지 않은 요청은 E가 접수 후 60분이 지나면 실패로 닫고, 사용자가 다시 요청한다(처리 시한, 계약 PR 병합 뒤 적용, 구현 [#237][i237]). 배포 대상은 AWS로 바뀌었고([레포 컨벤션 §1](CatchU_레포_컨벤션.md#1-레포-구조)) 큐 서버로 쓸 서비스는 정하지 않았다.

이 문서에서 **분석**은 worker의 생성기 호출 하나(dev의 `Generator.generate`: 수집·후보 판정·초안·질문 생성 전체)를 뜻한다. LLM 호출은 그 안의 일부다.

**개발 조건** — #121을 BullMQ로 개발할 때 지킬 조건이다. "두지 않는다"로 적은 칸을 뺀 나머지 가운데 하나라도 빠지면 위 판정이 성립하지 않는다.

| # | 조건 | 담당 | 근거 |
|---|---|---|---|
| 1 | 두지 않는다 — 10/6 결정. worker는 시도별 기록·분석 시작 표식을 남기지 않고, 다시 받은 작업을 기록으로 판정하지 않는다. 같은 작업을 다시 받지 않게 하는 것은 조건 2·3이다 | — | [10/6 결정][d1006] |
| 2 | E가 요청을 큐에 넣을 때 `attempts: 1`(재시도 없음)을 명시하고 `backoff`를 주지 않는다. 큐·Nest 모듈의 기본 작업 옵션이 이를 바꾸지 않는지 실제 적용 값을 확인한다. 연결 재시도는 분석 재시도와 다르다 | [#233][i233](E 리뷰) | [3. worker 중단](CatchU_queue_verification_results.md#3-worker-중단과-재기동) |
| 3 | worker의 정체 복구 허용 횟수(`maxStalledCount`)를 0으로 둔다 — 10/6 결정. 잠금이 끊긴 작업은 큐에서 실패로 끝나고 다시 실행되지 않는다. 그 요청은 E의 처리 시한이 닫는다 | F([#121][i121]) | [3. worker 중단](CatchU_queue_verification_results.md#3-worker-중단과-재기동)의 "정체 복구 끔" 열 |
| 4 | 생성기를 별도 스레드에서 돌려, 생성이 오래 걸려도 worker가 작업을 쥐고 있다는 신호(잠금 갱신)를 큐에 계속 보내게 한다. 정체 복구가 0회라 잠금이 끊기면 정상 작업도 실패로 끝난다. 실제 생성기로 바꿀 때 CPU 점유·예외·취소·종료 동작을 확인하고, 문제가 있으면 별도 프로세스로 나눈다. 요청당 총 처리 상한(제안 20분)을 두고, 넘으면 결과 없이 그 작업을 끝내고 다음 작업을 받는다. 상한을 넘긴 스레드는 밖에서 멈출 수 없으므로, 그 스레드를 둔 채 다음 작업을 받을지 별도 프로세스로 나눌지는 #121에서 정한다 | F([#121][i121]) | [살아 있는 worker의 잠금 상실](CatchU_queue_verification_results.md#살아-있는-worker의-잠금-상실) · 상한 값은 [#116 「자원·시간 상한」](CatchU_collection_control_scope.md#23-자원시간-상한) |
| 5 | 두지 않는다 — 10/6 결정. E는 큐에서 사라진 요청을 찾아 다시 넣는 판단·한도를 두지 않고, 대기 시도를 같은 작업 ID(`attemptId`)로 넣기만 한다([#233][i233]). 사라진 요청은 처리 시한이 닫는다 | — | [10/6 결정][d1006] |
| 6 | Node·Python 판본을 고정하고 함께 올리며, 올릴 때마다 [재현 키트](queue-verification/README.md)를 다시 돌린다. Redis 클라이언트·Nest 모듈·이미지 판본도 고정한다 | F·E | [1. Node·Python 연결](CatchU_queue_verification_results.md#1-nodepython-연결) |

**배포 전 조건** — #121 개발과 함께 진행하되, 실제 E·F 연결과 배포 **전에** 확인한다. 배포 대상은 AWS다([레포 컨벤션 §1](CatchU_레포_컨벤션.md#1-레포-구조)).

| # | 조건 | 담당 | 근거·확인 방법 |
|---|---|---|---|
| 1 | 두지 않는다 — 10/6 결정. 결과를 받은 뒤 등록 전에 멈춘 요청을 앱이 복구하지 않는다(결과 복구 1-가·1-나 모두). 반영 실패는 바로, 반영 대기는 처리 시한에 닫히고 사용자가 다시 요청한다(계약 PR 병합 뒤 적용, 구현 [#237][i237]). 같은 결과를 두 번 반영하지 않는지는 [#233][i233] 완료 기준(같은 결과가 두 번 와도 수신 기록은 하나다)이 확인한다 | — | [10/6 결정][d1006] |
| 2 | 두지 않는다 — 10/6 결정. F는 결과와 `UNCERTAIN` 알림을 보내면 끝이다. 결과 보존·주기 점검·재전송을 두지 않고, E가 거부한 결과(`REJECTED`)는 기록만 남긴다 | — | [10/6 결정][d1006] · 9/29 결과 보존 14일 결정 철회 |
| 3 | AWS 실제 서버에서 확인한다(큐 서버로 쓸 서비스는 미정). 축출 정책이 `noeviction`(메모리가 차도 지우지 않음)인지, 키트의 연결 시나리오가 도는지(허용 명령), 서버 재시작·장애 조치 뒤 다시 연결되는지 본다. 축출 정책이 다르면 운영을 시작하지 않는다. 상시 영속성 설정(`INFO persistence`)은 참고로 기록만 한다. 큐 자료 유실은 처리 시한으로 받아들이므로 관문이 아니다 | H([#24][i24]) | [배포 서버 적용 조건](CatchU_queue_requirements.md#배포-서버-적용-조건) |
| 4 | 결정됨 — 10/6 결정. 실행 중 → 실행 불명 전이(`RUNNING → UNCERTAIN`)는 더하지 않는다. 화면에는 "실행 중"으로 보이다가, 접수 후 60분 안에 끝나지 않으면 E가 실패로 닫는다(계약 PR 병합 뒤 적용, 구현 [#237][i237]) | [#237][i237](E 리뷰) | 쟁점 1·2 |
| 5 | 두지 않는다 — 10/6 결정. F에 실행 차단 기록이 없다. 닫힌 뒤 큐에서 꺼낸 오래된 작업은 worker가 요청 정보를 조회할 때([#232][i232]) 끝난 시도라 "모름"을 받아 분석하지 않는다(시간 초과로 닫힌 시도도 여기에 들도록 #232에서 맞춘다) | — | [10/6 결정][d1006] |
| 6 | 배포 중에도 같은 큐를 받는 worker 실행이 하나만 돌게 한다(새 worker는 앞 worker가 끝난 뒤 시작). Kubernetes로 배포하면 배포 방식을 Recreate로 둬 앞 worker pod가 완전히 내려간 뒤 새 pod가 뜨게 한다(롤링 업데이트는 maxSurge 0이어도 종료 중인 pod와 겹칠 수 있다) | H·F | 시험한 범위가 worker 한 프로세스다(「[하지 않은 것과 한계](#하지-않은-것과-한계)」) |

## 판정 기준과 #77 문구와의 차이

판정 기준은 #77의 확인 항목, [#121][i121] 완료 기준, [#116 「누가 구현·검사하는가」](CatchU_collection_control_checks.md#7-누가-구현검사하는가)가 #77에 넘긴 요구 4가지(같은 메시지가 두 번 와도 다시 호출하지 않음, worker가 중단돼도 자동으로 다시 실행하지 않음, 보존한 뒤 전달하고 같은 결과를 다시 보낼 수 있음, 전달 상태를 재기동 뒤에도 알 수 있음)에서 가져왔다. 새로 만든 기준은 없다. 이 가운데 뒤의 둘(보존한 뒤 전달·재전달, 재기동 뒤 전달 상태)은 10/6 결정으로 요구에서 빠졌다. "자동으로 다시 실행하지 않음"은 생성기를 부르기 전 단계만 다시 도는 처리(진행 알림을 다시 보내는 것 등)는 재실행으로 보지 않는다고 해석했다(제안).

- 같은 요청이 다시 전달되거나 worker가 중단·재기동돼도 분석이 자동으로 다시 불리지 않는다([명세 「전이·불변 조건」][contract], [worker 규칙 BR3.5][wr]).
- 실행 여부를 모르면 F는 실행 불명(`UNCERTAIN`)을 알리고 실패로 추정하지 않는다(명세 「전이·불변 조건」의 "실행이 확인되지 않으면 UNCERTAIN을 유지", [#121][i121]의 "생성기가 실행 여부를 확인하지 못하면 UNCERTAIN을 알리고 FAILED로 보내지 않는다"). 그런 요청과 E가 아무것도 받지 못해 멈춘 요청은 접수 후 60분이 지나면 E가 실패로 닫는다(10/6 결정, 계약 PR 병합 뒤 적용, 구현 [#237][i237]).
- 같은 결과가 다시 전달되는 것(큐 재전달)과 분석을 다시 하는 것을 구분한다.
- 수신 확인 `ACCEPTED`는 서비스 DB 반영이나 본인 조회 가능을 뜻하지 않는다.

계약이 #77에 넘긴 두 가지에 대한 답이다.

- **"#77 이전에 큐 시간 초과로 실패 확정하는 규칙은 만들지 않는다"**([명세 「전이·불변 조건」][contract]): 큐의 시간 초과·정체 판정으로 실패를 확정하는 규칙은 #77 뒤에도 만들지 않는다. 큐의 판정은 분석을 시작했는지조차 알려 주지 않는다([결과 3](CatchU_queue_verification_results.md#3-worker-중단과-재기동)). 대신 10/6 결정에 따라 E가 접수 시각부터 재는 처리 시한(60분)을 넘긴 요청을 실패로 닫는다. 이 시계는 큐와 무관하고, 실행이 멈췄다는 증거를 요구하지 않는다. 지금 계약은 시간 경과로 실패를 확정하는 것을 막고 있어, 처리 시한 계약 PR이 병합된 뒤 적용한다(구현 [#237][i237]).
- **"정량 timeout/처리 상한은 기술 검증 후 이슈로 보완"**([명세 「공통 오류·요청 안전성」][contract]): 큐 쪽에서 정할 값은 없다. 요청당 총 처리 상한은 [#116 「자원·시간 상한」](CatchU_collection_control_scope.md#23-자원시간-상한)의 제안값(20분)을 [#117][i117]·[#121][i121] 실측으로 확정한다. E의 처리 시한(60분)은 이 상한보다 넉넉하게 잡은 값이고 계약 PR에서 정한다.

#77 본문(9/22)과 현행 기준이 다른 곳은 현행 기준을 따랐다.

| #77 본문 | 현행 기준 | 이 문서 |
|---|---|---|
| worker → E 알림 "수신·실행 중·실패" | 진행 알림의 상태는 `RECEIVED`·`RUNNING`·`UNCERTAIN` 셋뿐이고, 실패는 종결 결과의 `FAILED`로 전한다. 처리 전 거부는 아무 메시지도 보내지 않는다([worker 메시지 계약][wm], [#113][i113]) | 계약대로 확인했다. 실패 알림을 새로 제안하지 않는다 |
| "NCP 관리형 큐" | 배포 대상은 AWS로 바뀌었고([레포 컨벤션 §1](CatchU_레포_컨벤션.md#1-레포-구조)) 큐 서버로 쓸 서비스는 정하지 않았다. 2026-10-02 조사 당시 배포 대상이던 NCP에는 BullMQ용 큐 상품이 없었고, 확인 대상은 Redis 계열 저장소 Cloud DB for Cache였다 | NCP 상품은 공식 문서로 확인했다(지난 기록). AWS 실제 서버 확인은 배포 전 조건 3이다 |
| 결과 문서는 `docs/ai-dlc-input-mvp/` 아래 | 그 폴더는 10월 intent의 입력 자료다. 이후 기술 판단 문서([작업 동일성 판별 기준](CatchU_작업동일성_판별기준.md), [수집 통제·임시 자료](CatchU_수집통제_임시자료.md))는 `docs/`에 두었다 | `docs/`에 두고 [문서 목록](README.md)에 올렸다 |

## 무엇으로 확인했나

이 절은 [결과 기록 「무엇으로 확인했나」](CatchU_queue_verification_results.md#무엇으로-확인했나)에 있다.

## 결과

이 절은 [결과 기록 「결과」(1. Node·Python 연결, 2. 중복 전달, 3. worker 중단과 재기동, 살아 있는 worker의 잠금 상실, 4. 결과 전달과 수신 확인, 5. 큐 저장소 조건)](CatchU_queue_verification_results.md#결과)에 있다.

## 큐가 해 주는 것과 #121이 구현할 것

이 절은 [구현 요구와 쟁점 「큐가 해 주는 것과 #121이 구현할 것」](CatchU_queue_requirements.md#큐가-해-주는-것과-121이-구현할-것)에 있다.

## 진행 알림과 실행 불명 판단 — #23 Q4·Q5 결정

이 절은 [구현 요구와 쟁점 「진행 알림과 실행 불명 판단」](CatchU_queue_requirements.md#진행-알림과-실행-불명-판단--23-q4q5-결정)에 있다.

## E와 확인할 쟁점

이 절은 [구현 요구와 쟁점 「E와 확인할 쟁점」](CatchU_queue_requirements.md#e와-확인할-쟁점)에 있다.

## 배포 서버 적용 조건

이 절은 [구현 요구와 쟁점 「배포 서버 적용 조건」](CatchU_queue_requirements.md#배포-서버-적용-조건)에 있다.

## 대안을 깊이 보지 않은 이유

현재 요구(자동 재분석 금지, 실행 불명을 실패로 추정하지 않음, 재전달과 재분석 구분)를 BullMQ가 못 지키는 문제는 나오지 않았다. 남은 위험 두 가지 — 큐가 "최소 한 번"만 보장하는 것과 큐 서버가 자료를 잃을 수 있는 것(2026-10-02 조사 당시 배포 대상이던 NCP의 저장소가 그랬다) — 는 Redis Streams를 직접 쓰는 대안([검토초안 §5][arch5])에도 똑같이 있고, 같은 방식(큐 설정과 처리 시한)으로 다뤄야 한다. Streams를 직접 쓰면 Node·Python BullMQ 판본을 맞춰야 하는 부담은 줄지만, 대기 중 메시지 회수와 수신 확인을 직접 만들어야 한다. 지금 전환할 근거는 없다. BullMQ 6·Python 3에는 PostgreSQL을 큐 저장소로 쓰는 기능도 생겼지만 이번에 시험하지 않았다.

## 하지 않은 것과 한계

- 실제 GitHub 수집·LLM 호출, 배포는 하지 않았다. 2026-10-02 당시 배포 대상이던 NCP의 자원도 만들지 않았고, AWS 실제 서버 확인도 하지 않았다(배포 전 조건 3).
- E·B의 저장·반영은 구현하지 않았다. E 수신 처리는 dev 코드 그대로지만 저장은 파일 대역이다. E 쪽 생산자·소비자는 `@nestjs/bullmq` 모듈이 아니라 `bullmq`를 직접 썼다. 이번 검증은 분석 재실행을 막을 수 있음을 보였고, 결과가 서비스에 등록된다는 것은 보이지 않았다.
- worker는 한 프로세스만 시험했다. 여러 대가 같은 큐를 받는 경우, 장애 조치의 DNS 전환, 부하·처리 시간은 시험하지 않았다.
- E 쪽 큐 보내기([#233][i233])는 구현이 없어서 실행기가 요청을 넣었다.
- 중단 시험은 프로세스 강제 종료(SIGKILL) 한 가지다. 전원 장애, 디스크 손상, 서버 자체 유실은 다루지 않았다.
- 키트의 보호 worker(시도별 기록·재전달·주기 점검)는 10/6 결정으로 채택하지 않았다. 그 가운데 재전달 횟수·기한 초과 분기는 실행되지 않았다.
- 생성기는 가짜이고 스레드에서 짧게 돌았다. 실제 생성기의 CPU 점유, 예외·취소·종료 뒤 스레드가 남는지는 확인하지 않았다(개발 조건 4). 요청당 총 처리 상한은 키트에 없다.
- 잠금·정체 검사 시간을 줄여(2초·1초) 시험했다. 제품 기본값(30초)에서는 돌리지 않았다.
- 키트 코드는 사람이 검토하지 않았다. 다른 AI 모델의 교차 검토(「근거」)를 거쳤지만 팀원 검토가 아니다.

## 근거

저장소 안:

- [API 명세 v1 「분석 접수·상태·재요청」·「W — worker 메시지 계약」][contract], [worker 메시지 계약][wm], [E 상태 전이 정본][espec], [worker 규칙][wr]
- [수집 통제와 임시 자료(#116)][f116]: [「수명표」](CatchU_collection_control_temp_data.md#42-수명표)·[「정리 실패·프로세스 중단」](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단)·[「재전달」](CatchU_collection_control_temp_data.md#52-재전달)·[「수신 후 반영 전 장애」](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)
- [공통 아키텍처 검토초안 §5·§6][arch5] — 검토용 입력
- dev 코드: [E 수신 처리](../api/src/analysis-receiver/analysis-receiver.service.ts)와 [E 수신 안내](../api/docs/analysis-receiver.md), [회원·분석 선행 테이블](../api/docs/member-analysis.md), [worker 처리 경계](../worker/app/processing/pipeline.py)
- [레포 컨벤션 §1](CatchU_레포_컨벤션.md#1-레포-구조): 배포 대상

저장소 밖: [10/6 팀장 결정(#23)][d1006] — 서버·worker·큐가 끊기는 장애는 앱에서 복구하지 않는다. 접수 후 60분 안에 끝나지 않은 요청은 실패로 닫고, 반영 실패는 바로 닫으며, 닫힌 요청은 다시 요청할 수 있다. 실행 중 → 실행 불명 전이는 더하지 않는다. 큐 재발행·worker 실행 차단 기록·결과 보존 14일을 두지 않고 정체 복구는 0회로 한다. 지금 계약과 다른 부분은 계약 PR 병합 뒤 적용한다.

공식 자료(확인일 2026-10-01). NCP 행은 2026-10-02 당시 배포 대상이던 NCP를 조사한 기록이다. NCP 가이드는 `curl`이 차단돼 브라우저로 원문을 읽었다. 인용은 원문을 다시 받아 문장 단위로 대조했고 과장된 문장은 고쳐 썼다. 이 대조는 작성 과정의 자체 확인이며 팀원 검토가 아니다. 2026-10-02에는 다른 AI 모델(Codex)에 이 문서와 키트를 보내 독립 판단, 판정 평가, 코드 검토를 받았다. 공식 자료로 다시 확인한 지적만 반영했고(판본 근거, 장애 조치 범위, 재전달 분기, 판정식 강화 등), 근거가 약한 지적 두 가지는 원문을 대조해 반영하지 않았다. 이것도 팀원 검토가 아니다.

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
- **2026-10-06** — 리뷰 반영(PR #207). E가 처리하다 실패로 남은 `UNCERTAIN` 알림은 같은 고정 ID로 다시 넣어도 큐가 무시한다. 그래서 구현 요구 3·4·5·쟁점 5, 진행 알림 표(#23 Q4 제안), 배포 전 조건 2를 "E에 닿을 때까지 점검해 다시 보낸다"로 고쳤다. 키트의 보호 worker는 10-02 결과 기록과 맞추려고 고치지 않고 한계로 적었다. 실험 컨테이너 정리는 키트가 자기가 띄운 컨테이너만 지우게 고쳤다(결과 영향 없음). 리뷰와 별개로 팀장 요청에 따라 배포 전 조건 6에 Kubernetes 배포 방식(Recreate)을 더했다.
- **2026-10-06** — [10/6 팀장 결정(#23)][d1006]에 맞춰 조건을 고쳤다. 앱 안 복구를 두지 않으므로 개발 조건 1·5와 배포 전 조건 1·2·5를 "두지 않는다"로 바꿨다. 앞 항목에서 더한 `UNCERTAIN` 재전송 요구도 함께 없어졌다. 개발 조건 3은 정체 복구 1회 이상에서 0회로 뒤집었다. 개발 조건 4에는 요청당 총 처리 상한(제안 20분)을 더하고, 상한과 부딪히는 "앞 실행이 남아 있으면 다음 분석을 시작하지 않는다"는 #121의 미결로 넘겼다. 배포 전 조건 4는 전이를 더하지 않고 접수 후 60분 처리 시한으로 닫는 것으로 정했다(계약 PR 병합 뒤 적용, 구현 #237). 「결론」의 두 가지와 판정 기준의 실행 불명·시간 초과 문장도 이에 맞췄다. 키트의 보호 F 결과는 실험 근거로만 남긴다. 같은 날 팀장 결정으로 배포 대상이 NCP에서 AWS로 바뀌어([레포 컨벤션 §1](CatchU_레포_컨벤션.md#1-레포-구조)) 배포 전 조건 3을 AWS 실제 서버 확인(서비스 미정)으로 바꾸고, NCP 조사 내용은 지난 기록으로 표시했다. 채택 완료 조건도 배포 전 조건 3 하나로 줄였다. "결과를 다시 받아도 DB에 두 번 반영하지 않음"은 #233 완료 기준으로 옮겼고, 영속성 설정은 관문에서 참고 기록으로 바꿨다. 배포 전 조건 6의 근거는 없어진 장치 대신 시험 범위(worker 한 프로세스)로 바꿨다.

[d1006]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296
[i77]: https://github.com/JminAILab/CatchU/issues/77
[i121]: https://github.com/JminAILab/CatchU/issues/121
[i232]: https://github.com/JminAILab/CatchU/issues/232
[i233]: https://github.com/JminAILab/CatchU/issues/233
[i237]: https://github.com/JminAILab/CatchU/issues/237
[i113]: https://github.com/JminAILab/CatchU/issues/113
[i117]: https://github.com/JminAILab/CatchU/issues/117
[i24]: https://github.com/JminAILab/CatchU/issues/24
[contract]: ../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md
[wm]: ../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
[espec]: ../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#상태-전이-정본
[wr]: ../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
[f116]: CatchU_수집통제_임시자료.md
[arch5]: ai-dlc-input-mvp/CatchU_공통_아키텍처_검토초안.md#5-주요-기술-선택과-판단-근거
