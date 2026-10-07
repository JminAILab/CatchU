# CatchU 수집 통제와 임시 자료 — 임시 자료와 전달(4~5절)

> [수집 통제와 임시 자료](CatchU_수집통제_임시자료.md)의 절을 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 그대로 옮긴 파일이다. 지위와 적용 범위는 그 문서와 같고, 다른 절은 그 문서에서 찾는다. AI가 한 번에 읽을 수 있게 36 KB 미만으로 유지한다.

## 4. 임시 자료의 위치·수명·삭제

### 4.1 두 종류

F가 만드는 임시 자료는 두 종류다.

| 종류 | 무엇 | 언제까지 두는가 |
|---|---|---|
| **임시 입력** | GitHub 응답 원문, 정규화 전 중간 자료, 생성 단계에 넣고 받은 원문 | 그 시도의 처리가 끝날 때까지 |
| **생성 결과** | E로 보내는 완성된 결과 메시지 | E에 보낼 때까지. 보낸 뒤 남기지 않는다 |

**둘 다 처리가 끝나면 남기지 않는다.** worker는 결과를 E에 보내면 끝이고, 결과를 보존하거나 다시 보내지 않는다([2026-10-06 팀장 결정][d23], [4.2](#42-수명표)). 원문을 오래 들고 있을 이유도 없다([요구사항 NFR7][r122]).

두 종류 모두 **서비스 DB에 넣지 않는다.** 계약이 "등록되지 않은 F 결과·후보·근거·초안의 저장 위치/수명은 OQ-F1이며 서비스 DB의 F 테이블로 옮기지 않는다"고 정했고([명세 W 메시지][c162]), B는 등록 후 필요한 것을 자기 정본으로 복사해 F 저장소에 영구 의존하지 않는다.

### 4.2 수명표

| 자료 | 위치 | 수명 | 지우는 시점 | 결정 상태 |
|---|---|---|---|---|
| 임시 입력 | worker 프로세스 메모리. 메모리에 다 담기 어려운 것만 요청별 임시 디렉터리(예 `<임시경로>/catchu-worker/<attemptId>/`, 소유자만 읽고 쓰게) | 그 시도(attempt)의 처리가 끝날 때까지 | 처리가 끝날 때. 성공·실패 모두 같다. 남은 파일은 worker 기동 때 지운다([4.3](#43-정리-실패프로세스-중단)) | **제안** |
| 생성 결과 | worker 프로세스 메모리 | E에 보낼 때까지 | 보낸 뒤. 보존하지 않는다 | **결정**(2026-10-06, [#23][d23]) |
| 거부 기록(요청 거부, E가 거부한 결과) | 운영 로그. 코드와 식별자만 | 운영 로그 보존 정책을 따른다 | — | **미정**([#24][i24] H 범위) |

**결과는 보존하지 않는다 — 결정(2026-10-06, 팀장).** 결과를 보낸 뒤 전달이 끊기거나 E가 반영하지 못하면, 그 요청은 처리 시한(접수 후 60분)이 지나 실패로 닫히고 회원이 다시 요청한다. 반영 실패는 시한을 기다리지 않고 닫는다. 이 동작은 처리 시한 계약 PR이 병합된 뒤 적용되며 구현은 [#237][i237]이다. 분석을 자동으로 다시 돌리지 않는다는 계약은 그대로다([명세 전이·불변 조건][c78]).

**결정 변경 기록.** 2026-09-29 팀장은 worker 밖에 보존한 결과의 보존 기간을 14일로 정했다([#116 결정][d116]). 그때 근거는, 결과가 만들어졌는데 전달만 실패하면 실패 확정이 아니어서 재전달도 재분석도 못 하고 막힌다는 것이었다. 2026-10-06 [#23 결정][d23]이 이를 대체했다. 처리 시한으로 닫고 닫힌 요청의 재요청을 허용하면 이 전제가 없어지기 때문이다. 그래서 전달 상태 표식과 worker 밖 결과 저장소([#24][i24] H에서 준비하려던 것)도 두지 않는다. 검토초안이 적은 비공개 Object Storage(당시 배포 대상 NCP, [검토초안 §5][arch5])도 쓰지 않는다.

### 4.3 정리 실패·프로세스 중단

앱은 중단 뒤 결과를 되살리거나 다시 보내지 않는다([10/6 결정][d23]). 큐는 중단된 작업을 다시 주지 않는다(정체 복구 0회, `maxStalledCount: 0`, [#121][i121]).

| 상황 | 하는 일 |
|---|---|
| 처리 끝, 임시 입력 삭제 실패 | **결과 전달을 멈추지 않는다.** 실패를 운영 기록으로 남기고, 남은 파일은 다음 기동 때 지운다 |
| 청소 방법 | ① 처리가 끝날 때 그 시도의 임시 입력을 지운다. ② 남은 것은 worker 기동 때 자기 작업 디렉터리에서 전부 지운다. 주기 청소는 두지 않는다 |
| 수집·생성 중 프로세스 중단 | 임시 입력만 남고 결과는 없다. ②가 지운다. **자동으로 다시 실행하지 않는다** |
| 결과 완성 뒤·전달 전 중단 | 결과가 사라진다. 다시 만들지도 보내지도 않는다 |
| 전달 뒤·수신 확인 전 중단 | 다시 보내지 않는다. E가 받았으면 E가 그대로 처리한다 |

어느 경우든 E가 종결 결과를 받지 못한 요청은 처리 시한(접수 후 60분)이 지나면 실패로 닫히고, 회원이 다시 요청할 수 있다(처리 시한 계약 PR 병합 뒤 적용, 구현 [#237][i237]). 닫히기 전까지 E는 마지막으로 받은 진행 알림 기준의 상태로 남는다.

**받아들인 위험**([10/6 결정][d23]): 큐 자료가 사라지면 같은 시도가 한 번 더 실행될 수 있다. worker가 총 처리 상한([2.3](CatchU_collection_control_scope.md#23-자원시간-상한))을 넘겨 멈춘 사이 재요청이 들어오면 분석이 두 번 돌 수 있다. 둘 다 드물고 분석 비용만 더 드는 일이다.

---

## 5. 전달과 수신·등록의 구분

### 5.1 세 단계

| 단계 | 누가 | 뜻하는 것 | 뜻하지 않는 것 |
|---|---|---|---|
| 결과 전달 | F | 보내려고 시도했다 | 도착·수신 아님 |
| 수신 확인 `ACCEPTED` | E | 형식·맥락 검사를 통과했고 E가 수신 기록을 저장했다 | **DB 등록·Catch 생성 아님**([명세 W 메시지][c150]) |
| 등록 완료 `APPLIED` | E·B | B 등록과 E 반영 기록이 한 트랜잭션으로 저장됐다(2026-09-24 팀장 결정, [명세 OQ-B1][c184]) | — |

**F는 등록 완료를 볼 수 없다.** 계약이 F에게 주는 메시지는 수신 확인뿐이고, 등록 완료는 회원 API의 상태(`application`)로만 드러난다. F는 결과를 보낸 뒤 남기지 않으므로([4.2](#42-수명표)) 수신 확인을 기다려 지울 것도 없다. 등록이 끝나지 않은 요청을 닫는 것은 E 쪽이다([5.3](#53-수신-후-반영-전-장애--지금-막히는-곳)).

### 5.2 재전달

**재전달하지 않는다 — 결정(2026-10-06, 팀장).** worker는 결과를 한 번 보내면 끝이다([#23 결정][d23]). 보존한 결과가 없으므로 다시 보낼 것도 없다([4.2](#42-수명표)). 수신 확인이 늦거나 오지 않아도 **분석·생성을 다시 호출하지 않는다**([worker 규칙 BR3.5][wr]). 그 요청은 처리 시한에 닫힌다(계약 PR 뒤, [4.3](#43-정리-실패프로세스-중단)).

E가 거부한 결과는 기록만 남긴다.

| 받은 것 | F가 하는 일 |
|---|---|
| `REJECTED`(`SCHEMA_INVALID`·`CONTEXT_MISMATCH`·`STALE_ATTEMPT`·`PAYLOAD_CONFLICT`) | 다시 보내지 않고 사유 코드와 식별자만 기록한다. `SCHEMA_INVALID`는 F 결함이다 |

### 5.3 수신 후 반영 전 장애 — 지금 막히는 곳

E의 수신 구현([PR #164][p164], `aeb81f8`)은 수신 기록에 식별자·지문·시각만 저장하고 결과 본문은 저장하지 않는다. 그래서 E가 수신 기록을 저장한 뒤(반영 상태 `PENDING`) B 등록 전에 api가 멈추면 그 결과로 등록을 이어 갈 수 없고, 지금은 요청이 진행 중으로 남는다. 반영이 실패한 요청(`APPLY_FAILED`, 입력·맥락 거부 같은 업무 거부 포함)도 같다. [2026-10-06 결정][d23]으로 이 구간은 앱에서 복구하지 않는다. 결과를 받았지만 반영이 끝나지 않은 요청은 처리 시한(접수 후 60분)에, 반영 실패는 시한을 기다리지 않고 실패로 닫으며, 등록된 Catch가 0건이면 회원이 다시 요청할 수 있다(처리 시한 계약 PR 병합 뒤 적용, 구현 [#237][i237]). 받은 결과는 버리고 재요청 때 새로 분석한다. 그래서 E가 복구에 쓸 자료(결과 본문 1-가, 영속 참조 1-나)를 남기거나 중복 수신 때 본문을 다시 넘기는 안(안 2)은 두지 않으며, [#234][i234]에서 정한 결과 복구 방식(1-나)도 거뒀다.

[d23]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296
[d116]: https://github.com/JminAILab/CatchU/issues/116#issuecomment-5883818220
[i24]: https://github.com/JminAILab/CatchU/issues/24
[i121]: https://github.com/JminAILab/CatchU/issues/121
[i234]: https://github.com/JminAILab/CatchU/issues/234
[i237]: https://github.com/JminAILab/CatchU/issues/237
[p164]: https://github.com/JminAILab/CatchU/pull/164
[c78]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L66-L77
[c150]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L153-L159
[c162]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L161-L165
[c184]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L184
[wr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
[r122]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L122
[arch5]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/docs/ai-dlc-input-mvp/CatchU_%EA%B3%B5%ED%86%B5_%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98_%EA%B2%80%ED%86%A0%EC%B4%88%EC%95%88.md#5-%EC%A3%BC%EC%9A%94-%EA%B8%B0%EC%88%A0-%EC%84%A0%ED%83%9D%EA%B3%BC-%ED%8C%90%EB%8B%A8-%EA%B7%BC%EA%B1%B0
