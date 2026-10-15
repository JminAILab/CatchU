# CatchU 수집 통제와 임시 자료 — 검증 사례와 구현·검사 담당(6~7절)

> [수집 통제와 임시 자료](CatchU_수집통제_임시자료.md)의 절을 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 그대로 옮긴 파일이다. 지위와 적용 범위는 그 문서와 같고, 다른 절은 그 문서에서 찾는다. AI가 한 번에 읽을 수 있게 36 KB 미만으로 유지한다.

## 6. 검증 사례

각 행은 구현 칸 이슈의 검사 항목이 된다. 없어진 사례도 번호를 비워 두지 않고 그 행에 "두지 않는다"로 남긴다. **합성**은 대역·합성 자료로 확인할 수 있는 것, **실제**는 실제 환경에서만 확인되는 것이다([#37][i37] C05).

| # | 사례 | 입력 → 기대 결과 | 계약 근거 | 확인 방법 | 구현 |
|---|---|---|---|---|---|
| V-01 | 정상 수집 | 허용 범위·자격정보가 모두 맞음 → 범위 안에서만 호출하고, 근거에 출처 판본·관측 사실·기여 범위·한계가 남는다 | [Evidence][yw] · [BR3.2][wr] | 합성 → 실제 | #117 |
| V-02 | 저장소가 두 곳에서 다름 | `repositoryId` ≠ `allowedScope.repositoryId` → **호출 0회**, 진행 알림·결과 없이 거부. E 요청은 처리 시한에 닫힌다(계약 PR 뒤, [#237][i237]) | [1.2](CatchU_collection_control_scope.md#12-요청의-허용-범위를-적용하는-순서) | 합성 | [#113][i113](구현됨) |
| V-03 | 허용 자료 종류 밖 | 커밋만 허용 → PR·이슈 API를 부르지 않는다 | [명세 W 메시지][c150] | 합성(호출 기록 대조) | #117 |
| V-04 | 허용 자료 종류가 빈 목록 | → **호출 0회**, 실패 결과. 정상 0건이 아니다 | [BR3.3][wr] | 합성 | #117 |
| V-05 | 자격정보 참조 해석 실패 | → **호출 0회**, 실패 결과 `CREDENTIAL_REFERENCE_UNRESOLVED`, 재시도 없음 | [BR3.1][wr] | 합성 | #117 |
| V-06 | 자격정보 만료 | 시작 전 만료 → 호출 0회·실패 결과. 수집 중 만료 → 그때까지 모은 자료로 종결, 자동 갱신 없음 | [BR3.1][wr] | 합성 | #117 |
| V-07 | 범위 불일치 | 맥락의 저장소·판본이 요청과 다름 → 어느 쪽도 수집하지 않고 거부 | [3.3](CatchU_collection_control_scope.md#33-f의-검사-순서와-거부) | 합성 | #117 |
| V-08 | 응답 안의 주소 | 응답에 다른 호스트 주소가 들어 있음 → 부르지 않는다. 우회 이동 응답도 따라가지 않는다 | [2.1](CatchU_collection_control_scope.md#21-주소권한-검사) | 합성 | #117 |
| V-09 | 자료 안의 지시문 | 이슈 본문에 지시문 → 처리 순서가 바뀌지 않고, 생성 단계에도 자료로만 넘어간다 | [2.2](CatchU_collection_control_scope.md#22-외부-실행네트워크-제한) | 합성 | #117·#120 |
| V-10 | 호출 수·시간 상한 초과 | → 멈추고 한계를 근거에 남긴다. 적합 후보가 있으면 부분 실패, 없으면 실패 | [BR3.3][wr] | 합성 | #117 |
| V-11 | 호출 한도 응답(429)·서버 오류(5xx) | → **다시 부르지 않고** 수집 오류로 기록한다. 적합 후보가 있으면 부분 실패, 없으면 실패. 0건으로 바꾸지 않는다 | [명세 공통 오류·요청 안전성][c137] · [BR3.3][wr] | 합성 → 실제 | #117 |
| V-12 | 허용 목록 밖 호스트 | 코드에서 다른 호스트 호출 시도 → 호출 전에 막힌다 | [2.2](CatchU_collection_control_scope.md#22-외부-실행네트워크-제한) | 합성(코드) · **실제**(환경) | #117 · #24 |
| V-13 | 처리 끝 정리 | 성공·실패 모두 임시 입력이 남지 않는다 | [4.2](CatchU_collection_control_temp_data.md#42-수명표) | 합성 | #117·#121 |
| V-14 | 정리 실패 | 삭제가 실패해도 결과 전달이 진행되고 기록이 남으며, 다음 기동이 지운다 | [4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단) | 합성 | #121 |
| V-15 | 보존 뒤 전달 | 두지 않는다 — 10/6 결정([#23][d23])으로 결과를 보존하지 않는다 | — | — | — |
| V-16 | 전달 실패 | 수신 확인이 오지 않음 → 같은 결과를 다시 보내지 않고, 분석·생성도 다시 부르지 않는다 | [BR3.5][wr] · [5.2](CatchU_collection_control_temp_data.md#52-재전달) | 합성 | #121 |
| V-17 | 같은 결과의 중복 수신 | 같은 결과가 E에 두 번 옴(큐의 중복 전달) → 수신 기록은 하나이고 두 번째는 중복 수신 확인이다. Catch가 두 개 생기면 실패 | [명세 B 등록·공개 경계][c93] | 합성(E와 함께) | [#233][i233] · E |
| V-18 | 거부 수신 확인 | 형식 오류·맥락 불일치·이전 시도·내용 충돌 → 다시 보내지 않고 사유 코드와 식별자만 기록한다 | [5.2](CatchU_collection_control_temp_data.md#52-재전달) | 합성 | #121 |
| V-19 | 분석 중 worker 강제 종료 | 죽였다 살림 → 그 작업은 큐에서 실패로 끝나고 다시 실행되지 않는다(정체 복구 0회, `maxStalledCount: 0`). 결과도 다시 보내지 않는다 | [4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단) · [BR3.5][wr] | 합성 | #121 |
| V-20 | 중단 뒤 E 상태 | worker 중단으로 종결 결과가 오지 않음 → F는 지어낸 종결 결과를 보내지 않는다. E 상태는 처리 시한까지 그대로이고, 시한(접수 후 60분)이 지나면 실패로 닫혀 재요청할 수 있다(계약 PR 뒤). **자동 재분석이 일어나면 실패** | [4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단) | 합성 | #121 · [#237][i237] |
| V-21 | 수신 후 반영 전 장애 | E 수신 뒤 등록 전에 중단, 또는 반영 실패 → 앱이 복구하지 않는다. 반영 대기는 처리 시한에, 반영 실패는 바로 실패로 닫히고, 등록 Catch가 0건이면 재요청할 수 있다(계약 PR 뒤) | [5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳) | 합성(E와 함께) | [#237][i237] |
| V-22 | 기록에 비밀값 없음 | 모든 실패·거부 경로의 로그·결과·근거에 토큰·원문 조각이 없다 | [명세 W 메시지][c162] | 합성 | #117·#121 |
| V-23 | 보존 기간 만료 | 두지 않는다 — 10/6 결정([#23][d23])으로 결과를 보존하지 않는다 | — | — | — |

**[#116][i116] 완료 기준과 대조**

| 완료 기준 | 이 문서 | 상태 |
|---|---|---|
| 수집 방식마다 주소/권한·외부 실행/네트워크·자원/시간·실패 정리 통제와 검증 방법 | [1](CatchU_collection_control_scope.md#1-무엇을-어떻게-가져오는가)·[2](CatchU_collection_control_scope.md#2-수집할-때-막는-것)·[6](#6-검증-사례) | **충족** |
| 수집 구현 전 통제 설계와 실행/검토 책임 | [2](CatchU_collection_control_scope.md#2-수집할-때-막는-것)·[7](#7-누가-구현검사하는가)·[7.1](#71-검토자가-없을-때) | **충족**. 실행 담당은 팀원 1로 **확정**(2026-09-29)했고, 작성자 외 검토자가 없다는 사실과 대체 수단을 명시해 [8](CatchU_수집통제_임시자료.md#8-37-조건-대조--적용충족미확인)에 미충족으로 남겼다 |
| 자격정보가 잘못·만료·범위 불일치일 때의 인계와 거부 경계를 A/E가 검토 | [3](CatchU_collection_control_scope.md#3-af-자격정보-인계) | **충족**. A/E가 검토했다([A/E 리뷰][rv166]) — 회원·저장소·허용 범위 판본·만료 대조와 불일치 시 수집하지 않는 방향에 동의. 제공 구현은 [#133][i133] 후속 |
| 임시 입력/결과의 생성·보존·전달·정리 조건과 검증 책임 | [4](CatchU_collection_control_temp_data.md#4-임시-자료의-위치수명삭제)·[6](#6-검증-사례) | **충족**. 결과는 보존하지 않는다(2026-10-06 [결정][d23]이 09-29의 14일 보존을 대체). 자원·시간 상한만 제안이다 |
| 수신 확인과 등록 완료를 구분하고 반영 전 장애의 손실 위험 대조 | [5](CatchU_collection_control_temp_data.md#5-전달과-수신등록의-구분) | **충족**. 반영 전 장애는 앱에서 복구하지 않고 처리 시한으로 닫는다(2026-10-06 [결정][d23], 계약 PR 뒤 [#237][i237]) |
| #37 조건의 적용·충족·미확인 구분 | [8](CatchU_수집통제_임시자료.md#8-37-조건-대조--적용충족미확인) | **충족** |
| 미결에 확인 상대와 막는 범위, 미정을 완료로 표시하지 않음 | [9](CatchU_수집통제_임시자료.md#9-미결과-확인-상대) | **충족** |

---

## 7. 누가 구현·검사하는가

| 통제 | 구현 | 검사 | 실제 환경 확인 |
|---|---|---|---|
| 허용 범위 적용, 주소·권한 검사 | [#117][i117] F(팀원 1) | 같은 PR의 자동 검사 | [#37][i37] C05 |
| 외부 실행 금지, 자료 안 지시문 취급 | [#117][i117] F · 생성 쪽은 [#120][i120] F | 같은 PR | — |
| 나가는 방향 제한(코드) | [#117][i117] F | 같은 PR | — |
| 나가는 방향 제한(환경) | H(팀원 1) | 자동 검사 + 실제 환경 확인. **작성자 외 검토자 없음**([7.1](#71-검토자가-없을-때)) | [#37][i37] C05 |
| 자원·시간 상한 | [#117][i117] F | 같은 PR | 실측은 실제 연결 때 |
| 자격정보 참조 발급·수명·권한 최소화 | A(팀원 2), [#133][i133]의 실제 GitHub 연동 후속 | A의 PR | GitHub 토큰의 권한·수명은 2026-10-14 명세에 정해졌다(추가 권한 없는 OAuth App·만료형 토큰, [명세 GitHub 연동 규칙][c1014gh]). 실제 확인은 구현 칸의 후속 뒤 |
| 자격정보 맥락 검사·거부 | [#117][i117] F | 같은 PR | — |
| 임시 입력 정리 | [#117][i117]·[#121][i121] F | 같은 PR | — |
| 결과 전달(한 번 보냄, 거부된 결과는 기록만) | [#121][i121] F | 같은 PR | — |
| 수신 확인 판정·중복 처리 | E(팀원 2), [#139][i139]. 큐 연결 뒤 같은 결과의 중복 수신은 [#233][i233] | [PR #164][p164] | — |
| 처리 시한 닫기(반영 전 장애·반영 실패 포함) | [#237][i237](처리 시한 계약 PR 병합 뒤) | 같은 PR, E 리뷰 | — |

**[#117][i117]로 넘기는 것**: [1.2](CatchU_collection_control_scope.md#12-요청의-허용-범위를-적용하는-순서) 검사 순서, [2](CatchU_collection_control_scope.md#2-수집할-때-막는-것) 전체, [3.3](CatchU_collection_control_scope.md#33-f의-검사-순서와-거부) 검사 순서와 거부 코드, [4.2](CatchU_collection_control_temp_data.md#42-수명표)의 임시 입력 정리, 검증 사례 V-01~V-13·V-22.

**[#121][i121]로 넘기는 것**: [4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단)의 기동 때 청소와 중단 처리, [5.2](CatchU_collection_control_temp_data.md#52-재전달)의 거부된 결과 기록, 검증 사례 V-13·V-14·V-16·V-18~V-20·V-22.

**[#233][i233]·[#237][i237]로 넘기는 것**: V-17은 #233, 처리 시한 닫기와 닫힌 요청의 재요청([5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳))과 V-20·V-21은 #237이다.

**[#77][i77]에 넘기는 요구**(전송 방식이 무엇이든 만족해야 하는 것):

1. 같은 메시지가 두 번 와도 분석·생성을 다시 호출하지 않는다.
2. worker가 중단돼도 그 작업이 자동으로 다시 실행되지 않는다.
3. 두지 않는다 — 10/6 결정([#23][d23])으로 결과를 보존·재전달하지 않는다.
4. 두지 않는다 — 10/6 결정([#23][d23])으로 재전달이 없어 전달 상태를 남기지 않는다.

1·2는 [#77 판정](CatchU_큐_기술검증.md#결론)에 따라 BullMQ의 큐 설정으로 지킨다. 작업 ID는 시도 ID이고, 요청 작업은 `attempts: 1`(재시도 없음)이며([#233][i233]), worker의 정체 복구는 0회다([#121][i121]). 큐 자료가 사라지면 같은 시도가 한 번 더 실행될 수 있다는 위험은 받아들였다([4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단)). 배포 대상은 AWS이고 큐 서버는 아직 정하지 않았다([레포 컨벤션 §1](CatchU_레포_컨벤션.md#1-레포-구조)). 배포 서버에서 확인할 것은 [「배포 서버 적용 조건」](CatchU_queue_requirements.md#배포-서버-적용-조건)에 있다.

### 7.1 검토자가 없을 때

**실행은 팀원 1(H)로 확정했다(2026-09-29, 팀장).** 다만 팀에 H 영역을 검토할 사람이 없어 **작성자 외 검토자가 없다.** 이 칸을 억지로 채우지 않고 아래 두 가지로 대신하며, 검토 없음은 [8](CatchU_수집통제_임시자료.md#8-37-조건-대조--적용충족미확인)에 **미충족**으로 남긴다.

| 대체 수단 | 내용 |
|---|---|
| 판단을 검사로 바꾼다 | "허용 목록 밖 호스트를 부르면 막히는가", "worker를 죽였다 살려도 그 작업이 다시 실행되지 않는가"는 사람이 봐야 아는 것이 아니라 검사가 통과·실패로 답한다. 검토자 부재로 약해지는 부분을 여기서 메운다([6](#6-검증-사례)의 V-12·V-19) |
| 재현 가능하게 남긴다 | 수행한 사람·환경·판본·명령·기대 결과·실제 결과를 PR에 적어 나중에 누구든 다시 돌려볼 수 있게 한다. 작업관리가 이미 요구하는 것이며, 작성자만 성공한 것을 팀 전체의 준비 완료로 보고하지 않는다 |

[#37][i37]의 C05가 요구하는 것은 "다른 사람이 봤다"가 아니라 **"실제 환경에서 검사했다"**이다. 검토자 부재와 C05 충족은 별개이며, C05는 그대로 실제 환경 검사로 판정한다.

### 계약을 바꿔야 하는 것과 아닌 것

| 항목 | 계약 변경인가 | 이유 |
|---|---|---|
| 실패 코드 이름([2.4](CatchU_collection_control_scope.md#24-상한을-넘거나-실패했을-때)) | **아니다** | `Failure.code`가 자유 문자열이다 |
| 자격정보 인계 내용·경로([3.2](CatchU_collection_control_scope.md#32-인계-내용--a가-주는-것)) | **아니다** | [명세 OQ-F1][c182]이 "A/F 자격정보 제공의 상세"로 남긴 미결이고, 메시지 필드는 그대로다 |
| 임시 자료 위치·수명([4](CatchU_collection_control_temp_data.md#4-임시-자료의-위치수명삭제)) | **아니다** | 같은 OQ-F1의 "F 임시 결과 보존 위치/수명"이다. 10/6 결정으로 결과를 보존하지 않으므로 이 미결의 보존 부분은 처리 시한 계약 PR에서 함께 고친다 |
| F의 "요청 거부" 알림 메시지([2.4](CatchU_collection_control_scope.md#24-상한을-넘거나-실패했을-때)) | **그렇다** | 새 메시지가 필요하다. **이번에 제안하지 않는다.** 거부된 요청은 처리 시한에 닫는다(아래 행) |
| 처리 시한이 지난 요청의 실패 확정, 반영 실패 요청 닫기, 닫힌 요청의 재요청([5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)) | **그렇다** | 지금 계약은 시간 경과로 실패를 확정하는 것, 반영 실패 요청을 닫는 것, 그 뒤의 재요청을 막는다. 10/6 [결정][d23]을 팀장 계약 PR로 반영한 뒤 [#237][i237]에서 구현한다 |
| 한 분석 안의 제목 고쳐 쓰기 재호출([2.3](CatchU_collection_control_scope.md#23-자원시간-상한)) | **그렇다** | 계약 요약의 재호출 금지 문장에 예외를 둔다. 문안은 [팀장 확인](ai-dlc-input-mvp/2026-10-08_catch-decisions.md#ai-dlc로-반영할-것)의 「AI-DLC로 반영할 것」(2026-10-09) |

[i37]: https://github.com/JminAILab/CatchU/issues/37
[i77]: https://github.com/JminAILab/CatchU/issues/77
[i113]: https://github.com/JminAILab/CatchU/issues/113
[i116]: https://github.com/JminAILab/CatchU/issues/116
[i117]: https://github.com/JminAILab/CatchU/issues/117
[i120]: https://github.com/JminAILab/CatchU/issues/120
[i121]: https://github.com/JminAILab/CatchU/issues/121
[i233]: https://github.com/JminAILab/CatchU/issues/233
[i237]: https://github.com/JminAILab/CatchU/issues/237
[d23]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296
[i133]: https://github.com/JminAILab/CatchU/issues/133
[i139]: https://github.com/JminAILab/CatchU/issues/139
[p164]: https://github.com/JminAILab/CatchU/pull/164
[c93]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L86
[rv166]: https://github.com/JminAILab/CatchU/pull/166#pullrequestreview-5349158273
[c150]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L153-L159
[c137]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L137
[c162]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L161-L165
[c1014gh]: https://github.com/JminAILab/CatchU/blob/c0104009af94c554a013b814746c239c8fc04d9d/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L64
[c182]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L182
[yw]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
[wr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
