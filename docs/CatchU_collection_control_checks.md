# CatchU 수집 통제와 임시 자료 — 검증 사례와 구현·검사 담당(6~7절)

> [수집 통제와 임시 자료](CatchU_수집통제_임시자료.md)의 절을 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 그대로 옮긴 파일이다. 지위와 적용 범위는 그 문서와 같고, 다른 절은 그 문서에서 찾는다. AI가 한 번에 읽을 수 있게 36 KB 미만으로 유지한다.

## 6. 검증 사례

각 행은 [#117][i117]·[#121][i121]의 검사 항목이 된다. **합성**은 대역·합성 자료로 확인할 수 있는 것, **실제**는 실제 환경에서만 확인되는 것이다([#37][i37] C05).

| # | 사례 | 입력 → 기대 결과 | 계약 근거 | 확인 방법 | 구현 |
|---|---|---|---|---|---|
| V-01 | 정상 수집 | 허용 범위·자격정보가 모두 맞음 → 범위 안에서만 호출하고, 근거에 출처 판본·관측 사실·기여 범위·한계가 남는다 | [Evidence][yw] · [BR3.2][wr] | 합성 → 실제 | #117 |
| V-02 | 저장소가 두 곳에서 다름 | `repositoryId` ≠ `allowedScope.repositoryId` → **호출 0회**, 진행 알림·결과 없이 거부. E는 기존 상태 유지 | [1.2](CatchU_collection_control_scope.md#12-요청의-허용-범위를-적용하는-순서) | 합성 | [#113][i113](구현됨) |
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
| V-15 | 보존 뒤 전달 | 결과가 저장된 뒤에 전달된다. 순서가 뒤집히면 실패 | [4.2](CatchU_collection_control_temp_data.md#42-수명표) | 합성 | #121 |
| V-16 | 전달 실패·재전달 | 응답 없음 → 같은 `resultId`·같은 본문(`finishedAt` 포함)으로 다시 보내고 `messageId`만 다르다. 새 분석·새 생성 호출이 없어야 한다 | [BR3.5][wr] | 합성 | #121 |
| V-17 | 재전달의 중복 처리 | 두 번째 전달 → 중복 수신 확인. Catch가 두 개 생기면 실패 | [명세 B 등록·공개 경계][c93] | 합성(E와 함께) | #121 · E |
| V-18 | 거부 수신 확인 | 맥락 불일치·이전 시도·내용 충돌 → 다시 보내지 않고 기존 결과를 보존한다 | [5.2](CatchU_collection_control_temp_data.md#52-재전달) | 합성 | #121 |
| V-19 | 전달 전 프로세스 중단 | 죽였다 살림 → 전달 표식이 없는 결과를 다시 보낸다. 분석은 다시 돌지 않는다 | [4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단) | 합성 | #121 |
| V-20 | 보존 전 프로세스 중단 | 결과가 사라진다. F는 새 분석이나 지어낸 종결 결과를 보내지 않고, E 상태는 F 중단만으로 바뀌지 않는다(실행 불명 판단은 [#77][i77]). **자동 재분석이 일어나면 실패** | [4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단) | 합성 | #121 |
| V-21 | 수신 후 반영 전 장애 | E 수신 뒤 등록 전에 중단 → 결과가 되살아나 등록이 끝나야 한다. **F 보존·재전달만으로는 통과하지 못한다** | [5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳) | 합성(E와 함께) | **E** — 안 1 방향, 저장·복구 방식은 E 후속 구현 |
| V-22 | 기록에 비밀값 없음 | 모든 실패·거부 경로의 로그·결과·근거에 토큰·원문 조각이 없다 | [명세 W 메시지][c162] | 합성 | #117·#121 |
| V-23 | 보존 기간 만료 | 기간이 지난 결과가 지워지고, 그 뒤 재전달이 요구되지 않는다 | [4.2](CatchU_collection_control_temp_data.md#42-수명표) | 합성(시각 대역) | #121 |

**[#116][i116] 완료 기준과 대조**

| 완료 기준 | 이 문서 | 상태 |
|---|---|---|
| 수집 방식마다 주소/권한·외부 실행/네트워크·자원/시간·실패 정리 통제와 검증 방법 | [1](CatchU_collection_control_scope.md#1-무엇을-어떻게-가져오는가)·[2](CatchU_collection_control_scope.md#2-수집할-때-막는-것)·[6](#6-검증-사례) | **충족** |
| 수집 구현 전 통제 설계와 실행/검토 책임 | [2](CatchU_collection_control_scope.md#2-수집할-때-막는-것)·[7](#7-누가-구현검사하는가)·[7.1](#71-검토자가-없을-때) | **충족**. 실행 담당은 팀원 1로 **확정**(2026-09-29)했고, 작성자 외 검토자가 없다는 사실과 대체 수단을 명시해 [8](CatchU_수집통제_임시자료.md#8-37-조건-대조--적용충족미확인)에 미충족으로 남겼다 |
| 자격정보가 잘못·만료·범위 불일치일 때의 인계와 거부 경계를 A/E가 검토 | [3](CatchU_collection_control_scope.md#3-af-자격정보-인계) | **충족**. A/E가 검토했다([A/E 리뷰][rv166]) — 회원·저장소·허용 범위 판본·만료 대조와 불일치 시 수집하지 않는 방향에 동의. 제공 구현은 [#133][i133] 후속 |
| 임시 입력/결과의 생성·보존·전달·정리 조건과 검증 책임 | [4](CatchU_collection_control_temp_data.md#4-임시-자료의-위치수명삭제)·[6](#6-검증-사례) | **충족**. 보존 14일은 **결정**, 저장 위치는 **미정**, 자원·시간 상한만 제안이다 |
| 수신 확인과 등록 완료를 구분하고 반영 전 장애의 손실 위험 대조 | [5](CatchU_collection_control_temp_data.md#5-전달과-수신등록의-구분) | **충족**. 구멍 하나를 찾아 권고안과 함께 E에 넘겼다. **E의 방식 선택은 미완료** |
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
| 자격정보 참조 발급·수명·권한 최소화 | A(팀원 2), [#133][i133]의 실제 GitHub 연동 후속 | A의 PR | [명세 OQ-A1][c180] 확정 후 |
| 자격정보 맥락 검사·거부 | [#117][i117] F | 같은 PR | — |
| 임시 입력 정리 | [#117][i117]·[#121][i121] F | 같은 PR | — |
| 결과 보존·재전달·전달 표식 | [#121][i121] F | 같은 PR | 저장 위치는 [#24][i24] |
| 수신 확인 판정·중복 처리 | E(팀원 2), [#139][i139] | [PR #164][p164] | — |
| 반영 전 장애 복구 | **E(팀원 2)** — [5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)의 안 1 방향(1-가 또는 1-나 + 재기동 뒤 미반영 작업 처리). 방식은 E 후속 구현에서 확정 | E의 PR | — |
| 결과 저장소 준비 | H(팀원 1) | 자동 검사 + 실제 환경 확인. **작성자 외 검토자 없음**([7.1](#71-검토자가-없을-때)) | 저장 위치 확정은 [#24][i24] |

**[#117][i117]로 넘기는 것**: [1.2](CatchU_collection_control_scope.md#12-요청의-허용-범위를-적용하는-순서) 검사 순서, [2](CatchU_collection_control_scope.md#2-수집할-때-막는-것) 전체, [3.3](CatchU_collection_control_scope.md#33-f의-검사-순서와-거부) 검사 순서와 거부 코드, [4.2](CatchU_collection_control_temp_data.md#42-수명표)의 임시 입력 정리, 검증 사례 V-01~V-13·V-22.

**[#121][i121]로 넘기는 것**: [4.2](CatchU_collection_control_temp_data.md#42-수명표)의 결과 보존과 전달 순서, [4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단) 청소·중단 처리, [5.2](CatchU_collection_control_temp_data.md#52-재전달) 재전달 규칙, 검증 사례 V-13~V-20·V-22·V-23.

**[#77][i77]에 넘기는 요구**(전송 방식이 무엇이든 만족해야 하는 것):

1. 같은 메시지가 두 번 와도 분석·생성을 다시 호출하지 않는다.
2. worker가 중단돼도 그 작업이 자동으로 다시 실행되지 않는다.
3. 결과를 보존한 뒤 전달하고, 전달 실패 시 같은 결과를 다시 보낼 수 있다.
4. 전달 상태(보냄·확인받음)를 재기동 뒤에도 알 수 있다.

이 넷은 전송 방식을 고르기 전에 정할 수 있다. 반대로 **큐 선택·재시도 설정·NCP 제약**은 [#77][i77]이 확인한 뒤에야 적용된다.

### 7.1 검토자가 없을 때

**실행은 팀원 1(H)로 확정했다(2026-09-29, 팀장).** 다만 팀에 H 영역을 검토할 사람이 없어 **작성자 외 검토자가 없다.** 이 칸을 억지로 채우지 않고 아래 두 가지로 대신하며, 검토 없음은 [8](CatchU_수집통제_임시자료.md#8-37-조건-대조--적용충족미확인)에 **미충족**으로 남긴다.

| 대체 수단 | 내용 |
|---|---|
| 판단을 검사로 바꾼다 | "허용 목록 밖 호스트를 부르면 막히는가", "worker를 죽였다 살리면 전달 안 된 결과를 다시 보내는가"는 사람이 봐야 아는 것이 아니라 검사가 통과·실패로 답한다. 검토자 부재로 약해지는 부분을 여기서 메운다([6](#6-검증-사례)의 V-12·V-19) |
| 재현 가능하게 남긴다 | 수행한 사람·환경·판본·명령·기대 결과·실제 결과를 PR에 적어 나중에 누구든 다시 돌려볼 수 있게 한다. 작업관리가 이미 요구하는 것이며, 작성자만 성공한 것을 팀 전체의 준비 완료로 보고하지 않는다 |

[#37][i37]의 C05가 요구하는 것은 "다른 사람이 봤다"가 아니라 **"실제 환경에서 검사했다"**이다. 검토자 부재와 C05 충족은 별개이며, C05는 그대로 실제 환경 검사로 판정한다.

### 계약을 바꿔야 하는 것과 아닌 것

| 항목 | 계약 변경인가 | 이유 |
|---|---|---|
| 실패 코드 이름([2.4](CatchU_collection_control_scope.md#24-상한을-넘거나-실패했을-때)) | **아니다** | `Failure.code`가 자유 문자열이다 |
| 자격정보 인계 내용·경로([3.2](CatchU_collection_control_scope.md#32-인계-내용--a가-주는-것)) | **아니다** | [명세 OQ-F1][c182]이 "A/F 자격정보 제공의 상세"로 남긴 미결이고, 메시지 필드는 그대로다 |
| 임시 자료 위치·수명([4](CatchU_collection_control_temp_data.md#4-임시-자료의-위치수명삭제)) | **아니다** | 같은 OQ-F1의 "F 임시 결과 보존 위치/수명"이다 |
| 재전달의 `messageId` 발급([5.2](CatchU_collection_control_temp_data.md#52-재전달)) | **아니다** | 중복 판정 기준이 이미 `resultId`로 정해져 있다 |
| E가 결과 본문을 서비스 DB에 저장(안 1-가, [5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)) | **판단 전** | 미등록 F 결과를 서비스 DB에 두지 않는다는 계약 문장([명세][c85], [명세][c162])과의 관계를 E 후속 구현에서 확인한다. 넘으면 계약 수정 |
| E가 영속 참조를 저장(안 1-나) | **판단 전** | 참조 대상의 위치(미정)·보존·접근 조건에 따라 달라진다 |
| E가 중복 수신 때 본문을 등록 경로로 다시 넘김(안 2) | **아니다** | 메시지 필드·수신 확인 값·상태 의미가 그대로인 E 내부 처리다. 재전달을 다시 일으키는 수단은 따로 필요하다(아래 행) |
| F의 "요청 거부" 알림 메시지([2.4](CatchU_collection_control_scope.md#24-상한을-넘거나-실패했을-때)) | **그렇다** | 새 메시지가 필요하다. **이번에 제안하지 않는다** |
| E가 F에게 재전달을 요청하는 경로([5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)) | **그렇다** | 새 메시지가 필요하다. 안 1이면 필요 없다 |

[i24]: https://github.com/JminAILab/CatchU/issues/24
[i37]: https://github.com/JminAILab/CatchU/issues/37
[i77]: https://github.com/JminAILab/CatchU/issues/77
[i113]: https://github.com/JminAILab/CatchU/issues/113
[i116]: https://github.com/JminAILab/CatchU/issues/116
[i117]: https://github.com/JminAILab/CatchU/issues/117
[i120]: https://github.com/JminAILab/CatchU/issues/120
[i121]: https://github.com/JminAILab/CatchU/issues/121
[i133]: https://github.com/JminAILab/CatchU/issues/133
[i139]: https://github.com/JminAILab/CatchU/issues/139
[p164]: https://github.com/JminAILab/CatchU/pull/164
[c93]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L86
[c85]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L85
[rv166]: https://github.com/JminAILab/CatchU/pull/166#pullrequestreview-5349158273
[c150]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L153-L159
[c137]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L137
[c162]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L161-L165
[c180]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L180
[c182]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L182
[yw]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
[wr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
