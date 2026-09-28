# CatchU 통합 검증표 — 첫 연결과 전체 MVP

> **지위: 초안** · 승인된 API 명세 v1(`9093d2e`)의 파생 검증 기준. 계약과 어긋나면 계약이 이기고 [#23][i23]에 올린다. 담당 확인 범위는 「담당별 확인 기록」 절에 있다.

담당 영역이 만나는 연결마다 시나리오·기대 결과·담당·선행 구현·실제/합성 경계·실행 증거 칸을 한 표에 모은다. 추적 이슈는 [#112][i112]이고, 상위 기준은 [#24][i24]의 통합 검증 항목이다.

## 한눈에 보기

파트가 이어질 때 꼭 지켜야 할 약속 10가지다. 자세한 조건은 괄호 안의 행과 그 행의 계약 링크에 있다.

1. 분석은 한 사람당 한 번에 하나만 진행된다. 같은 저장소를 다시 요청하면 진행 중인 작업을 돌려주고, 동시에 눌러도 새로 생기지 않는다(IV-01~IV-03).
2. '결과를 받았다'와 'Catch 등록이 끝났다'는 다르다. 본인 결과 화면은 등록된 Catch가 준비됐을 때만 열린다(IV-04, IV-14, IV-20, IV-24).
3. 불러오지 못한 것은 '0건'도 '분석 실패'도 아니다. 오류로 보여 주고 새 분석을 자동으로 요청하지 않는다(IV-05, IV-21, IV-31).
4. 같은 결과가 두 번 와도, 같은 작업의 후보가 둘이어도 Catch는 하나다. 번호가 같은데 내용이 다르면 거절한다(IV-12, IV-13, IV-15).
5. 번호가 없거나 맞지 않는 결과, 늦게 온 진행 알림은 기존 상태를 바꾸지 못한다(IV-08~IV-11).
6. 등록 저장이 실패하면 일부만 남지 않는다. 같은 결과로 다시 반영하며 분석을 다시 돌리지 않는다(IV-17~IV-19).
7. Catch는 처음에 비공개다. 확인만으로는 공개되지 않고, 따로 공개해야 한다(IV-25~IV-27).
8. 숨기면 이미 보낸 링크에서도 다음 요청부터 보이지 않는다(IV-28).
9. 링크 수신자는 지금 공개 중인 Catch만 보고, 본인용 질문이나 내부 번호는 보지 못한다(IV-31, IV-32).
10. 다른 사람 것과 없는 것은 같은 '볼 수 없음'으로, 없는·중단한·만료된 링크는 같은 '열람할 수 없음'으로 답해 있는지조차 숨긴다(IV-23, IV-33).

**먼저 확인할 행.** [#114][i114]의 첫 확인(요청 1건 → 합성 결과 반영 → 본인 Catch 조회)에는 IV-01·IV-04·IV-12·IV-14·IV-22 행과 IV-23 중 타인 Catch 조회 거부만 필요하다. 이 확인에는 해당 행 선행 칸의 [#136][i136](요청은 합성 연동 대역의 저장소로 바로 보낸다)·[#131][i131]·[#140][i140]·미등록 1이 필요 없다. 표 전체 검토를 기다리지 않고, 각 담당은 쓰는 행만 확인하며 같은 기대 결과를 구현 PR에서 확인했으면 그 링크로 갈음한다. 확인 상대(팀원 1 F, 팀원 3 C/D)는 합성 사례나 결과·화면 의미가 바뀔 때만 확인한다.

## 읽는 법

- 용어:
  - **첫 연결**: 실제 GitHub 수집·AI 생성 없이, 미리 만든 시험용 결과로 파트들을 처음 이어 보는 단계다([첫 연결 순서][b13]). 그 결과를 팀장이 한 번 승인하는 것이 M1이며, 표의 구간 칸에는 `M1-API`·`M1-화면`으로 적는다.
  - **합성 자료**: 실제 저장소·AI 대신 미리 만들어 둔 시험용 결과다.
  - **대역**: 실제 연결(GitHub 연동, API 응답 등) 대신 쓰는 가짜다.
  - **트랜잭션**: 여러 저장을 함께 성공시키거나 함께 취소하는 한 단위다.
- **실행 결과 칸의 기본값은 `미실행`이다.** 이 문서를 작성·병합하거나 Approve해도 통합 통과·첫 연결 결과(M1) 승인·MVP 완료가 아니다.
- 실행한 뒤에는 실행 PR·결함 이슈 링크만 덧붙인다. 판본·환경·명령·기대/실제 결과는 그 PR에 적고, 실행 상태·담당·막힘은 GitHub Issue·Projects에서 관리한다([문서 작성 규칙](README.md#문서-작성-규칙)).
- 기대 결과는 쉬운 말로 적었다. 상태값·오류 코드 같은 정확한 조건은 근거 칸 링크의 계약이 정본이며, 시험을 만들 때는 그 링크를 본다. 계약에 없는 판정은 이 문서에서 정하지 않고 「미결」 표로 보낸다.
- 담당은 팀원 번호와 영역으로 적는다(팀원 1 F/H/I, 팀원 2 A/E, 팀원 3 C/D, 팀원 4 B, [담당 표][t]). 확인 상대는 그 연결의 기대 결과를 대조할 사람이다.
- 선행 칸에는 이슈·PR 링크만 둔다. 진행 상태는 링크를 열어 확인한다. `미등록 N`은 아래 「미등록 선행」 표의 번호다.
- 첫 연결(M1) 행의 입력은 합성 자료다. 전체 MVP 행은 허용된 실제 자료를 쓰되, 과거 실험 원문·발췌·응답은 어느 행에서도 쓰지 않는다([#37][i37] 「사본과 착수 조건」). 사례 ID는 [#103][i103] 결과물([PR #158][p158])의 [사례 목록 `cases.json`][k0] 판본(`2071d2a`)을 따른다.

## 기준 판본

| 대상 | 고정 링크(`9093d2e`) |
|---|---|
| API 명세 v1 | [contract-summary.md][명세] · [member-api.yaml][ym] · [recipient-api.yaml][yr] · [common.yaml][yc] · [worker-messages.yaml][yw] |
| api 기능 설계·ERD | [functional-spec.md][fs] · [entities.md][en] |
| web·worker 기능 설계 | [web functional-spec.md][ws] · [worker functional-spec.md][wk] |
| 요구사항 | [requirements.md][rq] |
| 첫 연결 순서·담당 | [bolt-plan.md][bp] · [team-allocation.md][t] |

적용한 팀장 결정:
- 팀장 결정(9/24): B 등록(Catch·근거·등록 연결)과 E 반영 완료 기록을 한 트랜잭션으로 저장하고, 수신 기록은 그 전에 E가 저장한다([명세 OQ-B1][c184]).
- 팀장 결정(9/28): 후보 중 하나라도 저장할 수 없으면 전체를 저장하지 않고 실패로 기록한다. 같은 결과로 다시 저장해도 계속 실패하는 경우의 처리는 팀원 2·4가 상의하는 미결이다([PR #143 팀장 댓글][p143c]).
- 팀장 결정(9/28): 링크 발행에서 제목 중복과 5개 한도 초과가 겹치면 제목 중복을 먼저 돌려준다. 원본 저장소의 비공개 전환 관측은 10월에 실행하지 않고, 실행 책임은 12월 범위나 배포 재개 때 정한다([#23 기록][i23c0928]).
- 팀장 결정(9/28): '다른 작업의 근거 일부 중첩' 사례는 #103 공용 세트에 넣지 않고 B가 자체 테스트로 확인한다. B의 테스트는 [PR #143 연결안의 사례 표][p143doc]와 [묶음 준비 검사][p143test]에 있다.

## 범위 구분 — 첫 연결과 전체 MVP

| 구간 | 연결 | 쓰는 자료·대역 | 이 구간에서 확인했다고 하지 않는 것 | 실행 이슈 |
|---|---|---|---|---|
| M1-API | 합성 접수·동의 → 결과 수신 → B 비공개 등록 → 상태·본인 Catch 조회 ([첫 연결 2][b13]) | 개발용 로그인, 합성 연동 대역, #103 합성 결과의 api 안 주입, 테스트 DB | worker 실행·큐·GitHub·LLM·web·NCP, 실제 전송과 결과 보존 신뢰성 | [#114][i114] |
| M1-화면 | 결과 진입 → 근거·기여 확인 → 별도 공개 → 링크 수신자 열람, 숨김 뒤 다음 요청 거부 ([첫 연결 3][b14]) | M1-API 구간과 web 화면. 준비 단계의 API 응답 대역은 행마다 대역 구간을 적는다 | 대역만 통과한 검사를 실제 화면·API 연결 통과로 세는 것 | [#123][i123] |
| 전체 MVP | 실제 분석 → 본인 확인 → 공개 → 비로그인 열람, 비밀번호·중단·만료, 원본 보호, 실제 로그인·연동, 배포 환경 자료 유지·복구 | 실제 GitHub 수집·서비스 LLM·실제 전송·배포 환경 | 합성 자료·가짜 생성기 연결로 실제 자료 통제를 검증했다는 것([#37][i37] 「C04 수집 통제의 실행 추적」) | [#124][i124] |

- M1은 담당별 결과를 모아 팀장이 한 번 승인한다([첫 연결 M1][b15]). M1 성공은 첫 MVP 완료가 아니며 비밀번호·중단·만료, 공개 조건·현재 권한, 실패 상태·재요청, 실제 보호·배포 기준은 그대로 남는다([마일스톤][b22]).
- 배포 환경(H)의 자료 유지·복구와 최종 통합 연결은 전체 MVP 후속 행(IV-39)으로만 두고 H 재개 때 확인한다.

## 통합 검증 행

칸: **ID** · **사례** · **입력 → 기대 결과** · **근거**(FR/NFR·계약) · **담당 / 확인 상대** · **선행** · **구간·경계** · **실행 결과·증거·결함**.

### 가. 분석 접수

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-01 | 새 분석 접수 | 로그인한 회원이 선정 저장소를 고르고 동의해 분석을 요청 → 접수됐다는 응답을 받고, 요청과 동의가 함께 저장된다. 저장에 실패하면 접수 성공이라고 답하지 않는다 | [FR1.1][r56] · [명세 상태 표][c53] · [api F2][f36] | A/E(팀원 2) / F(팀원 1) | [#87][i87] · [#104][i104] · [#136][i136] · [#138][i138] | M1-API · 합성 연동 대역, 실제 GitHub 연동 아님 | 미실행 |
| IV-02 | 중복·동시 접수 | 같은 저장소를 다시 요청 → 새로 만들지 않고 진행 중인 작업을 돌려준다. 다른 저장소를 요청 → 진행 중인 작업이 있다며 거절한다. 동시에 두 번 보내거나 응답을 못 받아 다시 보내도 요청은 하나만 생긴다 | [FR1.4][r57] · [NFR4][r119] · [명세 L73][c73] · [명세 중복 요청][c135] · [api 동시성][f71] · [접수 200 응답][ym123] | E(팀원 2) / A(팀원 2) | [#104][i104] · [#138][i138] | M1-API · 합성 | 미실행 |
| IV-03 | 연동·동의·대상 조건 미충족 | GitHub 미연동, 동의 없음, 선정 밖 저장소로 요청 → 거절하고 요청을 만들지 않는다 | [FR1.1][r56] · [명세 오류 표][c126] | E(팀원 2) / A(팀원 2) | [#136][i136] · [#138][i138] | M1-API · 합성 연동 대역 | 미실행 |

### 나. 결과 수신과 처리 상태

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-04 | 적합 후보 1건 수신 · [`succeeded-one-candidate`][k11] | 분석 결과가 도착 → E가 받았다고 기록한 뒤 수신 확인을 보낸다. 기록에 실패하면 받았다고 답하지 않는다. 수신 확인은 'Catch 등록 완료'가 아니다 | [FR2.1][r66] · [명세 W 메시지][c158] · [api F3][f37] · [#139 완료 기준][i139] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] | M1-API · `sourceMode=MOCK` 유지, 실제 분석 성공 아님 | 미실행 |
| IV-05 | 정상 0건 · [`empty`][k30] | 오류 없이 후보가 0개인 결과 → '정상 완료, 새 Catch 없음'으로 끝난다. 근거가 부족해 빠진 후보는 실패로 세지 않는다. 이 요청은 다시 분석할 수 없다 | [FR1.4][r57] · [FR2.1][r66] · [명세 L70-71][c70] · [명세 L75][c75] | E(팀원 2) / F(팀원 1)·D(팀원 3) | [#103][i103] · [#139][i139] · [#105][i105] · [#140][i140] | M1-API · 합성 | 미실행 |
| IV-06 | 부분 실패 · [`partial-failed`][k49] | 쓸 수 있는 후보와 실패가 섞인 결과 → 쓸 수 있는 후보만 등록하고 실패는 따로 알린다. 등록된 것만 본인 결과로 열 수 있고, 재요청 대상이 아니다 | [FR1.4][r57] · [명세 L70-71][c70] · [명세 L74][c74] · [web 상태 전이][w57] | E(팀원 2)·B(팀원 4) / F(팀원 1)·D(팀원 3) | [#103][i103] · [#139][i139] · [#105][i105] · [#140][i140] | M1-API · 합성 | 미실행 |
| IV-07 | 실패와 사용자 재요청 · [`failed`][k68] | 쓸 수 있는 후보 없이 실패한 결과 → 실패로 끝나고, 서버가 허용할 때만 사용자가 다시 요청할 수 있다. 다시 요청하면 새 동의로 새 요청을 만들고 기존 자료·링크는 그대로다. 허용되지 않는 재요청은 원래 요청 번호를 빼고 보내도 거절된다 | [FR1.4][r57] · [명세 L74-75][c74] · [api F8][f43] | E(팀원 2) / F(팀원 1)·D(팀원 3) | [#103][i103] · [#138][i138] · [#139][i139] · [#140][i140] | M1-API · 합성 | 미실행 |
| IV-08 | 식별 불가 · [`unidentifiable`][k87] | 결과·요청·시도 번호 중 하나라도 없거나 비어 있는 결과 → 수신 확인 없이 거절만 기록한다. 번호를 추정해 채우지 않고 기존 요청은 그대로다 | [명세 L161][c161] · [api F3][f37] · [worker 연결 확인][wk] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] | M1-API · 합성 | 미실행 |
| IV-09 | 형식·맥락·시도 불일치 | 번호는 있지만 형식이 틀렸거나, 다른 회원·저장소·동의의 결과이거나, 이미 끝난 시도의 결과 → 거절하고 기존 자료를 지킨다. 입력은 #103 세트에 파일이 없어 [#103 안내][k74]대로 만든다 | [명세 L90][c90] · [명세 L161][c161] · [Receipt 스키마][wm142] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] | M1-API · 합성 | 미실행 |
| IV-10 | 진행 알림 · [`progress-events`][k187] | '실행 중'·'실행 여부 모름' 알림 → 진행 상태만 바뀐다. '실행 여부 모름'은 시간이 지나도 저절로 실패가 되지 않고, 끝난 것으로 처리되지도 않는다 | [FR1.4][r57] · [명세 L60][c60] · [명세 L68][c68] · [api F3-P][f38] · [api 상태 전이][f52] · [api 종료 조건][f57] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] | M1-API · 합성. 진행·실패 알림을 보내는 방식과 실행 여부를 모를 때의 판단은 [#77][i77] 뒤 결정([#23 기록][i23c0928]) | 미실행 |
| IV-11 | 늦은 진행 이벤트 | 결과가 끝난 뒤에 '실행 중' 알림이 늦게 도착 → 끝난 상태가 되돌아가지 않는다. 결과가 알림보다 먼저 와도 받는다. 입력은 #103 세트에 파일이 없어 [#103 안내][k74]대로 만든다 | [NFR4][r119] · [명세 L156][c156] · [api 상태 전이][f52] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] | M1-API · 합성 | 미실행 |
| IV-12 | 같은 결과 재전달 · [`redelivery`][k106] | 같은 결과가 한 번 더 도착 → '이미 받음'으로 답하고 Catch가 늘거나 바뀌지 않는다 | [FR1.4][r57] · [NFR4][r119] · [명세 L86][c86] · [api 동시성][f73] | E(팀원 2)·B(팀원 4) / F(팀원 1) | [#103][i103] · [#139][i139] · [#105][i105] | M1-API · 합성 | 미실행 |
| IV-13 | 같은 ID의 다른 내용 · [`same-id-different-content`][k137] | 같은 번호인데 내용이 다른 결과 → 거절하고 기존 결과·Catch를 지킨다 | [NFR4][r119] · [명세 L86][c86] · [명세 L90][c90] · [ERD 수신 기록][e194] | E(팀원 2) / F(팀원 1)·B(팀원 4) | [#103][i103] · [#139][i139] | M1-API · 합성 | 미실행 |

### 다. 등록과 반영

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-14 | 정상 등록과 반영 완료 | IV-04의 결과 → 비공개 Catch·근거 등록과 '반영 완료·본인 열람 준비' 기록이 한꺼번에 저장되고, 본인이 조회할 수 있다 | [FR2.1][r66] · [FR2.2][r67] · [FR3.5][r76] · [명세 E↔B][c82] · [api F4][f39] | B(팀원 4)·E(팀원 2) / F(팀원 1) | [#86][i86] · [#103][i103] · [#104][i104] · [#105][i105] · [#130][i130] · [#139][i139] | M1-API · 합성, 테스트 DB 실제 저장 | 미실행 |
| IV-15 | 두 후보가 같은 작업 · [`two-candidates-same-work`][k168] | 같은 작업으로 판정된 두 후보 → Catch는 하나만 생기고 두 후보가 모두 그 Catch를 가리킨다. 기존 Catch 내용·공개 여부는 바뀌지 않는다. 초안이 없는 후보도 그 이유로 빠지지 않는다 | [NFR4][r119] · [명세 L72][c72] · [명세 L86][c86] · [명세 L92][c92] · [api 동시성][f74] · [api 등록 목록][f61] · [ERD 유일성][e119] | B(팀원 4) / E(팀원 2)·F(팀원 1) | [#103][i103] · [#105][i105] | M1-API · 알려진 합성 작업 식별값으로 대신함. 실제 판별은 [#111][i111]·[#118][i118] | 미실행 |
| IV-16 | 다른 작업의 근거 일부 중첩 | 근거 일부가 겹치지만 다른 작업인 두 후보 → Catch가 따로 둘 생긴다 | [명세 L92][c92] · [api 동시성][f74] · [ERD 근거][e138] | B(팀원 4) / F(팀원 1) | [#105][i105] · [PR #143][p143] | M1-API · B 자체 테스트 값(#103 공용 세트 밖, [PR #143 검사][p143test]) | 미실행 |
| IV-17 | 반영 실패 | 등록 저장 중 실패 → Catch·근거가 일부만 남지 않고 '반영 실패'로 기록되며, 받은 결과 기록은 남는다. 새 분석은 돌지 않는다. 후보 하나라도 저장할 수 없으면 전체를 저장하지 않는다 | [NFR4][r119] · [명세 L69][c69] · [api F4][f39] · [api 동시성][f75] · [PR #143 팀장 댓글][p143c] | B(팀원 4)·E(팀원 2) / F(팀원 1) | [#105][i105] · [#139][i139] · [PR #143][p143] | M1-API · 합성, 실패는 테스트에서 강제 | 미실행 |
| IV-18 | 반영 복구 | 같은 결과로 반영을 다시 시도 → Catch 중복 없이 반영이 끝나고 분석을 다시 돌리지 않는다. 다시 해도 계속 실패하는 경우는 미결 9 | [NFR4][r119] · [명세 L69][c69] · [api 상태 전이][f56] · [api 동시성][f75] | E(팀원 2)·B(팀원 4) / F(팀원 1) | [#105][i105] · [#139][i139] | M1-API · 합성, 실제 결과 보존·재전달(미결 4)은 확인 안 함 | 미실행 |
| IV-19 | 커밋 뒤 응답·확인 유실 | 등록은 저장됐는데 응답을 잃어 다시 시도 → 새로 만들지 않고 같은 Catch를 돌려준다 | [api F4][f39] · [api 동시성][f76] · [ERD 등록 연결][e205] | B(팀원 4)·E(팀원 2) / F(팀원 1) | [#105][i105] · [#139][i139] | M1-API · 합성 | 미실행 |

### 라. 상태와 본인 조회

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-20 | 상태 값의 구분 | 결과 도착부터 등록까지 상태를 조회 → '분석 끝남', '결과 받음', '반영 완료', '본인 열람 준비'가 따로 표시된다. 후보가 있거나 분석이 끝났다는 것만으로 열람 준비가 되지 않고, 모든 후보를 반영하기 전에는 완료로 표시하지 않는다 | [FR1.4][r57] · [명세 L62-63][c62] · [명세 L76][c76] · [api F4][f39] · [api 반영 전이][f55] · [api 열람 준비][f61] | E(팀원 2) / B(팀원 4)·D(팀원 3) | [#105][i105] · [#139][i139] · [#140][i140] | M1-API · 합성 | 미실행 |
| IV-21 | 조회 오류와 정상 0건 | 상태나 Catch를 불러오지 못함 → '오류'로 보이고 '0건'이나 '분석 실패'로 바뀌지 않으며, 새 분석을 자동으로 요청하지 않는다. 진짜 0건은 '없음'으로 보인다 | [FR1.4][r57] · [FR2.1][r66] · [명세 L76][c76] · [명세 오류 해석][c133] · [web 상태 전이][w55] | E(팀원 2)·B(팀원 4) / D(팀원 3) | [#88][i88] · [#130][i130] · [#140][i140] | M1-API·M1-화면 · 조회 실패는 테스트에서 강제 | 미실행 |
| IV-22 | 본인 Catch 목록·상세 | 본인 → 자기 Catch만 보인다. 저장소와 요청으로 함께 거르면 둘 다 맞는 것만 보이고, 다음 페이지도 그때의 권한으로 다시 판단한다 | [FR3.5][r76] · [명세 경로 표][c45] · [명세 목록 규칙][c51] | B(팀원 4) / D(팀원 3) | [#130][i130] | M1-API · 합성 | 미실행 |
| IV-23 | 타인·없는 자원과 인증 오류 | 다른 사람 것이나 없는 것을 보거나 바꾸려 함 → 둘 다 똑같이 '볼 수 없음'으로 답해 있는지조차 숨기고, 아무것도 바꾸지 않는다. 로그인이 없거나 만료되면 로그인 오류로 답한다 | [FR3.5][r76] · [NFR1][r116] · [명세 L48][c48] · [명세 인증 오류][c124] · [명세 오류 표][c127] | E(팀원 2)·B(팀원 4) / C·D(팀원 3) | [#87][i87] · [#88][i88] · [#130][i130] · [#131][i131] · [#140][i140] · 미등록 1 | M1-API·M1-화면 · 합성 | 미실행 |
| IV-24 | 본인 결과 진입 화면 | 분석 상태 화면 → 등록된 Catch가 준비됐을 때만 결과로 들어간다. 분석이 끝났다는 것만으로 결과 버튼을 열지 않고, 반영 실패를 분석 실패로 안내하지 않으며, 서버가 허용할 때만 재요청 버튼을 보인다 | [FR1.4][r57] · [명세 L63-64][c63] · [web W3][w13] · [web 상태 전이][w57] | D(팀원 3)·B(팀원 4) / E(팀원 2) | [#106][i106] · [#140][i140] · [#153][i153] · [#154][i154] · 미등록 2 | M1-화면 · 합성, 초기 준비는 API 응답 대역 가능 | 미실행 |

### 마. 확인·공개·숨김

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-25 | 최초 비공개 | 등록 직후 Catch → 비공개다. 본인만 보고 링크 수신자에게는 보이지 않는다 | [FR3.5][r76] · [FR4.1][r84] · [명세 L87][c87] · [api 상태 전이][f58] | B(팀원 4) / C(팀원 3) | [#105][i105] · [#130][i130] · [#151][i151] · [#152][i152] · 미등록 2 | M1-화면 · 합성 | 미실행 |
| IV-26 | 확인만으로 공개 안 됨 | 근거·기여를 확인했다고 표시 → 여전히 비공개다. 불일치 표시도 공개 여부를 바꾸지 않는다 | [FR2.2][r67] · [FR3.5][r76] · [FR4.1][r84] · [명세 L87][c87] · [api F5][f40] | B(팀원 4) / C·D(팀원 3) | [#131][i131] · [#151][i151] · [#152][i152] · 미등록 2 | M1-화면 · 합성 | 미실행 |
| IV-27 | 별도 공개 | 확인한 Catch를 따로 공개 → 그때 조건을 다시 검사해 공개하고, 다음 요청부터 수신자에게 보인다. 초안이 없어도 공개할 수 있다. 확인하지 않은 Catch는 공개가 거절된다 | [FR4.1][r84] · [명세 L87][c87] · [명세 오류 표][c129] · [api 동시성][f79] | B(팀원 4) / C(팀원 3) | [#131][i131] · [#151][i151] · 미등록 1 · 미등록 2 | M1-화면 · 합성 | 미실행 |
| IV-28 | 숨김 뒤 다음 요청 거부 | 공개 Catch를 다시 비공개로 → 기존 링크의 다음 요청부터 보이지 않는다(숨기기 전에 받아 둔 다음 페이지로 요청해도 마찬가지). 이미 열린 화면을 실시간으로 지우지는 않는다 | [FR4.1][r84] · [NFR1][r116] · [명세 목록 규칙][c51] · [명세 L87][c87] · [명세 L114][c114] · [명세 L116][c116] · [api 동시성][f78] | B(팀원 4) / C(팀원 3) | [#151][i151] · [#152][i152] · 미등록 1 · 미등록 2 | M1-화면 · 합성 | 미실행 |

### 바. 링크와 수신자

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-29 | 링크 발급 | 공개한 Catch가 없어도 링크를 만들 수 있고, 만든 때부터 30일 뒤 만료된다. 같은 제목의 유효 링크가 있거나 유효 링크가 이미 5개면 거절되며, 동시에 만들어도 이 한도를 넘지 않는다. 같은 발급 요청을 다시 보내면 기존 링크를 돌려준다 | [FR4.2][r85] · [FR4.5][r88] · [명세 L117][c117] · [명세 중복 요청][c135] · [발급 200 응답][ym306] · [api F6][f41] · [api 동시성][f77] | C(팀원 3) / B(팀원 4) | [#147][i147] · [#148][i148] · [#149][i149] | M1-화면(발급) · 전체 MVP(제목·한도·동시 발급) · 합성 | 미실행 |
| IV-30 | 발급 오류 판정 순서 | 요청 키가 다른 재요청에서 제목 중복과 5개 초과가 동시에 해당 → 제목 중복으로 거절한다. 중단·만료 링크는 제목 비교와 5개 한도 모두에서 뺀다. 같은 키·같은 본문의 재요청은 처음 응답을 돌려줘 오류가 나지 않는다 | [명세 L117][c117] · [명세 L130][c130] · [명세 중복 요청][c135] · [#23 기록][i23c0928] | C(팀원 3) / 팀장 | [#147][i147] | 전체 MVP · 합성, 팀장 결정(9/28) | 미실행 |
| IV-31 | 수신자 현재 공개 목록·상세 | 링크를 연 사람(비밀번호 링크는 비밀번호 확인 뒤) → 지금 공개 중이고 원본 보호에 걸리지 않은 Catch만 본다. 공개한 게 없으면 '없음', 불러오지 못하면 '오류'로 구분된다. 숨겼거나 없는 Catch는 '볼 수 없음' | [FR3.2][r74] · [FR4.2][r85] · [명세 L113-114][c113] · [api F7][f42] · [web 수신자 0건][w66] | C(팀원 3) / B(팀원 4)·A(팀원 2) | [#135][i135] · [#150][i150] · [#151][i151] · [#152][i152] · 미등록 1 | M1-화면 · 합성, 공개 프로필에 보일 항목은 미결 8 | 미실행 |
| IV-32 | 수신자에게 나가지 않는 정보 | 수신자 화면·응답 → 제목·근거·기여·설명 초안만 보인다. 본인용 질문, 확인·불일치 표시, 내부 번호, 링크 제목은 없다. 초안이 없으면 없다고 보이고, 응답은 브라우저나 중간 서버에 저장되지 않는다 | [NFR1][r116] · [명세 L115-116][c115] · [api 수신자 응답][f88] · [web 공개 자료][w75] | C(팀원 3) / B(팀원 4) | [#151][i151] · [#152][i152] | M1-화면 · 합성 | 미실행 |
| IV-33 | 링크 없음·중단·만료 | 없는 링크·중단한 링크·만료된 링크 → 셋 다 똑같은 '열람할 수 없음' 안내이고, 비밀번호를 묻기 전에 막는다. 링크를 중단해도 Catch 공개 여부는 그대로다. 만료는 시각을 조작해 재현한다 | [FR4.3][r86] · [FR4.5][r88] · [명세 L110][c110] · [명세 L117][c117] · [api 상태 전이][f59] | C(팀원 3) / B(팀원 4) | [#148][i148] · [#150][i150] · [#152][i152] | 전체 MVP · 합성, 시각 제어 | 미실행 |
| IV-34 | 비밀번호와 열람 증표 | 비밀번호 링크 → 입력 전이거나 틀리면 비밀번호를 다시 묻고, 맞으면 그 링크에서만 쓰는 열람 증표를 준다. 증표가 있어도 중단·만료된 링크나 다른 링크는 못 연다. 비밀번호 확인 전에는 Catch가 있는지도 알리지 않고, 로그인 화면으로 보내지 않는다 | [FR4.4][r87] · [NFR1][r116] · [명세 L111-112][c111] · [명세 L114][c114] · [명세 비밀번호 오류][c125] · [web 수신 접근][w64] | C(팀원 3) / A(팀원 2) | [#106][i106] · [#150][i150] · [#152][i152] | 전체 MVP · 합성, grant 수명·시도 제한은 미결 3 | 미실행 |

### 사. 원본 보호와 전체 MVP 후속

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-35 | 원본 보호(합성 상태) | 원본 저장소의 비공개 전환이 확인된 상태(합성) → 관련 Catch는 수신자에게 안 보이고 공개도 거절되며, 본인 화면에는 보호 중으로 보인다. 일시적인 조회 실패는 비공개로 치지 않고, 상관없는 Catch·링크는 멈추지 않는다. 소유자에게 보일 안내 문구·방식은 이 문서에서 정하지 않는다 | [FR1.5][r58] · [명세 L88][c88] · [명세 오류 표][c129] · [Catch 보호 필드][yc189] · [ERD 보호][e151] | B(팀원 4) / C(팀원 3)·F(팀원 1) | [#151][i151] · 미등록 1 | 전체 MVP · 규칙은 계약대로 유지하지만 10월에는 이 상태를 만드는 경로가 없어 미실행으로 남는다(팀장 결정 9/28, [#23 기록][i23c0928]) | 미실행 |
| IV-36 | 원본 상태 실제 관측 | 실제 저장소의 비공개 전환·일시 장애 → 확인된 전환만 보호로 반영한다. 10월에는 관측을 실행하지 않으며, 누가 어떻게 관측할지는 12월 범위나 배포 재개 때 정한다(미결 1) | [FR1.5][r58] · [명세 OQ-B3][c186] · [#23 기록][i23c0928] | 미배정(계약상 A/B/F/H) / 팀장 | 미등록 3 · 미등록 8 | 전체 MVP · 10월 실행 없음 | 미실행 |
| IV-37 | 실제 로그인·GitHub 연동 | 실제 Google 로그인·GitHub 연동으로 IV-01을 다시 → 로그인·연동 방식이 정해진 뒤 채운다(미결 7) | [FR11.1~11.3][r108] · [명세 OQ-A1][c180] | A(팀원 2) / C·D(팀원 3) | 미등록 6 | 전체 MVP · 미결 7 | 미실행 |
| IV-38 | 실제 분석 전체 흐름 | 실제 저장소 분석 결과 → 등록 → 본인 확인 → 공개 → 로그인 없는 열람까지, 실패·보호·결함 재시험 포함 | [주요 시나리오][r127] · [첫 연결 순서][b13] | 각 영역 담당 / 팀원 1(I 취합) | [#124][i124] · [#77][i77] · 미등록 4 · 미등록 5 | 전체 MVP · 실제 자료, 미결 4·5·6 | 미실행 |
| IV-39 | 배포 환경 자료 유지·복구 | 실제 주소에서 재시작·재배포·복구 뒤 → 자료·권한·링크 상태가 유지된다. H 재개 때 확인한다 | [NFR4][r119] · [NFR8][r123] · [주요 시나리오 NCP][r138] | H(팀원 1) / 각 영역 담당 | 미등록 7 | 전체 MVP · 배포 환경 | 미실행 |

## 미등록 선행

이슈가 없는 기능 선행이다(2026-09-28 확인). [#24][i24] 「남은 외부 선행과 완료 판정」은 이 표를 가리키며, C·D 기능은 [#145][i145]·[#146][i146] 하위 이슈로 등록돼 이 표에 없다. 이 문서는 담당을 새로 배정하지 않으며 I에 자동 배정하지 않는다. 담당이 이슈를 만들면 해당 행의 선행 칸을 이슈 링크로 바꾼다.

| 번호 | 필요한 기능 | 영역 | 쓰는 행 | 현재 기록 |
|---|---|---|---|---|
| 미등록 1 | Catch 공개·숨김과 C에 제공할 현재 공개 자료 | B(팀원 4) | IV-23, IV-27, IV-28, IV-31, IV-35 | [#129][i129] 계획표 B04 '등록 전' |
| 미등록 2 | 내 자산 Catch 목록·필터 화면, Catch 상세·확인·공개 화면 | B(팀원 4) | IV-24~IV-28 | [#129][i129] 계획표 B05·B06 '등록 전' |
| 미등록 3 | 원본 보호 상태 입력 연결 | B(팀원 4), 관측 제공은 미배정 | IV-36 | [#129][i129] 계획표 B08 '등록 전' |
| 미등록 4 | 실제 작업 식별 기준과 B 등록 연결 | B(팀원 4) | IV-38 | [#129][i129] 계획표 B07 '등록 전' |
| 미등록 5 | E의 실제 전송 연결(worker 요청 전달) | E(팀원 2) | IV-38 | [#134][i134] 하위 [#138][i138]~[#140][i140]은 합성 대역까지. 전송 방식은 [#77][i77] 뒤에 정한다 |
| 미등록 6 | 실제 Google 로그인·GitHub 연동 | A(팀원 2) | IV-37 | [#133][i133] 하위 [#135][i135]~[#137][i137]에 없음 |
| 미등록 7 | 배포 환경 배포·자료 유지·복구 | H(팀원 1) | IV-39 | H 재개 때 등록([#24][i24]) |
| 미등록 8 | 원본 상태 관측의 실행 책임 | 미배정(계약상 A/B/F/H) | IV-36 | 12월 범위나 배포 재개 때 정한다([#23 기록][i23c0928]), 그때까지 [#24][i24]의 미배정 책임 |

## 미결

계약에 없는 판정이다. 이 문서는 새로 정하지 않고 결정 기록에 연결한다. 결정이 난 것은 결정 기록 칸에 그 뜻과 링크를 적는다.

| 번호 | 미결 | 계약·출처 | 쓰는 행 | 결정 기록 |
|---|---|---|---|---|
| 미결 1 | 원본 상태 관측 경로·주기·오류 처리와 실행 책임(OQ-B3). 실행 책임은 미배정 | [명세 OQ-B3][c186] | IV-35, IV-36 | 팀장 결정(9/28): 10월에는 관측을 실행하지 않고, 이미 비공개로 확인된 자료를 막는 규칙만 유지한다. 실행 책임은 12월 범위나 배포 재개 때 정한다([#23 기록][i23c0928]) · [#24][i24] |
| 미결 2 | 링크 발급에서 제목 중복과 한도 초과가 겹칠 때의 판정 순서. 계약은 두 코드만 나열한다 | [명세 L130][c130] · [#23 9/15 제안(이미 있음 먼저)][i23c0915] | IV-30 | 팀장 결정(9/28): 제목 중복을 먼저 돌려준다. 중단·만료 링크는 양쪽 검사에서 뺀다([#23 기록][i23c0928]) |
| 미결 3 | 열람 증표(grant)의 수명·브라우저 저장과 비밀번호 시도 제한(OQ-C1) | [명세 OQ-C1][c187] | IV-34 | [#150][i150] |
| 미결 4 | F 임시 결과 보존 위치·수명과 손실 없는 전달(OQ-F1) | [명세 OQ-F1][c182] | IV-18, IV-38 | [#116][i116] · [#77][i77] |
| 미결 5 | 작업 동일성 판별 함수와 충돌 검증(OQ-F2) | [명세 OQ-F2][c183] | IV-15, IV-38 | [#111][i111] · [#118][i118] |
| 미결 6 | 서비스 LLM 제공자·모델·조건(OQ-L) | [명세 OQ-L][c188] | IV-38 | [#119][i119] |
| 미결 7 | 실제 로그인·연동 경로와 수명(OQ-A1) | [명세 OQ-A1][c180] | IV-37 | 미등록 6 |
| 미결 8 | 수신자에게 보일 공개 프로필 항목(OQ-A2) | [명세 OQ-A2][c181] | IV-31 | [#151][i151] |
| 미결 9 | 같은 결과로 다시 반영해도 계속 실패하는 경우의 처리. 계약상 반영 실패 동안 그 요청은 진행 중으로 남으므로([명세 L69][c69]), 해결 전에는 그 회원이 다른 저장소 분석을 요청하면 거절된다([명세 L73][c73]) | [PR #143 팀장 댓글][p143c] | IV-17, IV-18 | 팀원 2·4 상의([PR #143][p143]) |

## 담당별 확인 기록

[PR #160](https://github.com/JminAILab/CatchU/pull/160) 리뷰나 해당 구현 PR 리뷰에서 각 담당이 자기 행의 기대 결과와 경계를 확인한 기록이다. 확인한 행과 판본을 밝힌 리뷰 댓글만 확인으로 적는다. Approve만 있으면 확인으로 적지 않는다. 작성자(팀원 1)의 F 행 작성은 다른 담당의 확인을 대신하지 않는다.

| 담당 | 확인할 행 | 확인 판본 | 확인 기록 | 미확인일 때 영향과 다음 행동 |
|---|---|---|---|---|
| 팀원 2 A/E (`yeongyeon1802`) | IV-01~IV-15, IV-17~IV-21, IV-23, IV-24, IV-31, IV-34, IV-37 | 미확인 | 미확인 | 접수·수신·상태 행이 E 구현([#138][i138]~[#140][i140])과 어긋날 수 있다. [#114][i114]에서 쓰는 행만 실행 전에 확인한다 |
| 팀원 4 B (`leechaeah`) | IV-06, IV-12~IV-29, IV-31~IV-33, IV-35 | 미확인 | 미확인 | 등록·반영·공개 행이 B 구현([#105][i105]·[#130][i130]·[#131][i131])과 어긋날 수 있다. [#114][i114]·[#123][i123]에서 쓰는 행만 실행 전에 확인한다 |
| 팀원 3 C/D (`csyg0616`) | IV-05~IV-07, IV-20~IV-35, IV-37 | 미확인 | 미확인 | 결과 진입·링크·수신자 행이 C/D 구현([#145][i145]·[#146][i146] 하위)과 어긋날 수 있다. [#123][i123]에서 쓰는 행만 실행 전에 확인한다 |

## 실행 결과를 채울 때

- 실행 이슈([#114][i114] API, [#123][i123] 화면, [#124][i124] 전체)의 PR이 행 ID를 인용하고, 그 PR에 기준 커밋·환경·명령·기대/실제 결과·합성/실제 경계를 적는다.
- 이 문서의 실행 결과 칸에는 `미실행` 뒤에 실행 PR·결함 이슈 링크만 덧붙인다. 불일치가 남았거나 대역으로만 확인한 행은 통과로 적지 않는다.
- 결함은 해당 기능 담당의 수정 이슈로 연결하고 재시험 PR을 같은 칸에 덧붙인다.
- 행을 추가하거나 기대 결과를 바꿀 때는 PR로 하고 그 행의 담당에게 확인받는다. 계약과 어긋나면 이 문서를 고치지 말고 [#23][i23]에 올린다.

[i23]: https://github.com/JminAILab/CatchU/issues/23
[i23c0915]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-5673635807
[i23c0928]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-5869226609
[i24]: https://github.com/JminAILab/CatchU/issues/24
[i37]: https://github.com/JminAILab/CatchU/issues/37
[i77]: https://github.com/JminAILab/CatchU/issues/77
[i86]: https://github.com/JminAILab/CatchU/issues/86
[i87]: https://github.com/JminAILab/CatchU/issues/87
[i88]: https://github.com/JminAILab/CatchU/issues/88
[i103]: https://github.com/JminAILab/CatchU/issues/103
[i104]: https://github.com/JminAILab/CatchU/issues/104
[i105]: https://github.com/JminAILab/CatchU/issues/105
[i106]: https://github.com/JminAILab/CatchU/issues/106
[i111]: https://github.com/JminAILab/CatchU/issues/111
[i112]: https://github.com/JminAILab/CatchU/issues/112
[i114]: https://github.com/JminAILab/CatchU/issues/114
[i116]: https://github.com/JminAILab/CatchU/issues/116
[i118]: https://github.com/JminAILab/CatchU/issues/118
[i119]: https://github.com/JminAILab/CatchU/issues/119
[i123]: https://github.com/JminAILab/CatchU/issues/123
[i124]: https://github.com/JminAILab/CatchU/issues/124
[i129]: https://github.com/JminAILab/CatchU/issues/129
[i130]: https://github.com/JminAILab/CatchU/issues/130
[i131]: https://github.com/JminAILab/CatchU/issues/131
[i133]: https://github.com/JminAILab/CatchU/issues/133
[i134]: https://github.com/JminAILab/CatchU/issues/134
[i135]: https://github.com/JminAILab/CatchU/issues/135
[i136]: https://github.com/JminAILab/CatchU/issues/136
[i137]: https://github.com/JminAILab/CatchU/issues/137
[i138]: https://github.com/JminAILab/CatchU/issues/138
[i139]: https://github.com/JminAILab/CatchU/issues/139
[i140]: https://github.com/JminAILab/CatchU/issues/140
[i145]: https://github.com/JminAILab/CatchU/issues/145
[i146]: https://github.com/JminAILab/CatchU/issues/146
[i147]: https://github.com/JminAILab/CatchU/issues/147
[i148]: https://github.com/JminAILab/CatchU/issues/148
[i149]: https://github.com/JminAILab/CatchU/issues/149
[i150]: https://github.com/JminAILab/CatchU/issues/150
[i151]: https://github.com/JminAILab/CatchU/issues/151
[i152]: https://github.com/JminAILab/CatchU/issues/152
[i153]: https://github.com/JminAILab/CatchU/issues/153
[i154]: https://github.com/JminAILab/CatchU/issues/154
[p143]: https://github.com/JminAILab/CatchU/pull/143
[p143c]: https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865277945
[p158]: https://github.com/JminAILab/CatchU/pull/158
[p143doc]: https://github.com/JminAILab/CatchU/blob/a56bf14181fd812d686cbc2d7ce6b0ee6ccb46db/api/docs/catch-registration-proposal.md#L151
[p143test]: https://github.com/JminAILab/CatchU/blob/a56bf14181fd812d686cbc2d7ce6b0ee6ccb46db/api/test/catches/registration-batch.test.cjs#L65
[k0]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json
[k11]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json#L11
[k30]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json#L30
[k49]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json#L49
[k68]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json#L68
[k87]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json#L87
[k106]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json#L106
[k137]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json#L137
[k168]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json#L168
[k187]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json#L187
[k74]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/README.md#L74-L79

[명세]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md
[ym]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml
[yr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/recipient-api.yaml
[yc]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml
[yw]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
[wm142]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml#L142-L160
[c45]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L45
[c48]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L48
[c51]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L51
[c53]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L53-L76
[c60]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L60
[c62]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L62-L63
[c63]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L63-L64
[c68]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L68
[c69]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L69
[c70]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L70-L71
[c73]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L73
[c74]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L74-L75
[c75]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L75
[c76]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L76
[c82]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L82-L85
[c86]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L86
[c87]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L87
[c88]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L88
[c90]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L90
[c92]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L92
[c110]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L110
[c111]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L111-L112
[c113]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L113-L114
[c114]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L114
[c115]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L115-L116
[c116]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L116
[c117]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L117
[c126]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L126
[c127]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L127
[c129]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L129
[c130]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L130
[c133]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L133
[c135]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L135
[c156]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L156
[c158]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L158-L159
[c161]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L161
[c180]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L180
[c181]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L181
[c182]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L182
[c183]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L183
[c184]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L184
[c186]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L186
[c187]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L187
[c188]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L188
[c72]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L72
[c124]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L124
[c125]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L125
[ym123]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml#L123
[ym306]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml#L306
[yc189]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml#L189
[f55]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L55
[f57]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L57
[fs]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md
[f36]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L36
[f37]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L37
[f38]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L38
[f39]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L39
[f40]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L40
[f41]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L41
[f42]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L42
[f43]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L43
[f52]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L52-L54
[f56]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L56-L57
[f58]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L58
[f59]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L59
[f61]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L61-L63
[f71]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L71-L72
[f73]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L73
[f74]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L74
[f75]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L75
[f76]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L76
[f77]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L77
[f78]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L78
[f79]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L79
[f88]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L88-L89
[en]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md
[e119]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L119-L120
[e138]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L138
[e151]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L151
[e194]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L194
[e205]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L205
[ws]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md
[w13]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L13
[w55]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L55-L56
[w57]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L57-L62
[w64]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L64
[w66]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L66
[w75]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L75
[wk]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md#L29-L36
[rq]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md
[r56]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L56
[r57]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L57
[r58]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L58
[r66]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L66
[r67]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L67
[r74]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L74
[r76]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L76
[r84]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L84
[r85]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L85
[r86]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L86
[r87]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L87
[r88]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L88
[r108]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L108-L110
[r116]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L116
[r119]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L119
[r123]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L123
[r127]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L127-L140
[r138]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L138
[bp]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md
[b13]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md#L13
[b14]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md#L14
[b15]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md#L15
[b22]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md#L22
[t]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/team-allocation.md#L3-L10
