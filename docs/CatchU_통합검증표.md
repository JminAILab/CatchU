# CatchU 통합 검증표 — 첫 연결과 전체 MVP

> **지위: 초안** · 승인된 API 명세 v1(`9093d2e`)의 파생 검증 기준. 계약과 어긋나면 계약이 이기고 [#23][i23]에 올린다. 담당 확인 범위는 「담당별 확인 기록」 절에 있다.
>
> 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 AI가 잘리지 않고 읽게 절 단위로 나눴다(내용 변경 없음). 나눈 파일: [통합 검증 행 가~라(접수·수신·등록·조회)](CatchU_integration_rows_intake.md) · [통합 검증 행 마~사(확인·공개·링크·원본 보호)](CatchU_integration_rows_sharing.md). 옮긴 절의 제목과 새 위치는 제자리에 남겼다.

담당 영역이 만나는 연결마다 시나리오·기대 결과·담당·선행 구현·실제/합성 경계·실행 증거 칸을 한 표에 모은다. 추적 이슈는 [#112][i112]이고, 상위 기준은 [#24][i24]의 통합 검증 항목이다.

## 한눈에 보기

파트가 이어질 때 꼭 지켜야 할 약속 10가지다. 자세한 조건은 괄호 안의 행과 그 행의 계약 링크에 있다.

1. 분석은 한 사람당 한 번에 하나만 진행된다. 같은 저장소를 다시 요청하면 진행 중인 작업을 돌려주고, 동시에 눌러도 새로 생기지 않는다(IV-01~IV-03).
2. '결과를 받았다'와 'Catch 등록이 끝났다'는 다르다. 본인 결과 화면은 등록된 Catch가 준비됐을 때만 열린다(IV-04, IV-14, IV-20, IV-24).
3. 불러오지 못한 것은 '0건'도 '분석 실패'도 아니다. 오류로 보여 주고 새 분석을 자동으로 요청하지 않는다(IV-05, IV-21, IV-31).
4. 같은 결과가 두 번 와도, 같은 작업의 후보가 둘이어도 Catch는 하나다. 번호가 같은데 내용이 다르면 거절한다(IV-12, IV-13, IV-15).
5. 번호가 없거나 맞지 않는 결과, 늦게 온 진행 알림은 기존 상태를 바꾸지 못한다(IV-08~IV-11).
6. 등록 저장이 실패하면 일부만 남지 않고, 분석을 자동으로 다시 돌리지 않는다. 응답만 잃었으면 같은 Catch를 돌려준다. 처리 시한(접수 후 60분)을 넘긴 요청과 반영에 실패한 요청은 서버가 닫고, 사용자가 다시 요청한다(계약 PR 병합 뒤 적용, [#237][i237])(IV-10, IV-17~IV-19).
7. Catch는 처음에 비공개다. 확인만으로는 공개되지 않고, 따로 공개해야 한다(IV-25~IV-27).
8. 숨기면 이미 보낸 링크에서도 다음 요청부터 보이지 않는다(IV-28).
9. 링크 수신자는 지금 공개 중인 Catch만 보고, 본인용 질문이나 내부 번호는 보지 못한다(IV-31, IV-32).
10. 다른 사람 것과 없는 것은 같은 '볼 수 없음'으로, 없는·중단한·만료된 링크는 같은 '열람할 수 없음'으로 답해 있는지조차 숨긴다(IV-23, IV-33). 다만 발행자가 자기 링크를 중단할 때는 이미 중단·만료된 링크라도 오류가 아니다(IV-40).

**먼저 확인할 행.** [#114][i114]의 첫 확인(요청 1건 → 합성 결과 반영 → 본인 Catch 조회)에는 IV-01·IV-04·IV-12·IV-14·IV-22 행과 IV-23 중 타인 Catch 조회 거부만 필요하다. 이 확인에는 해당 행 선행 칸의 [#136][i136](요청은 합성 연동 대역의 저장소로 바로 보낸다)·[#131][i131]·[#140][i140]·[#165][i165]가 필요 없다. 표 전체 검토를 기다리지 않고, 각 담당은 쓰는 행만 확인하며 같은 기대 결과를 구현 PR에서 확인했으면 그 링크로 갈음한다. 확인 상대(팀원 1 F, 팀원 3 C/D)는 합성 사례나 결과·화면 의미가 바뀔 때만 확인한다.

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
- 행 ID는 한 번 붙이면 바꾸지 않는다. 나중에 더한 행은 뒤 번호를 받으므로 절 안에서 번호가 이어지지 않을 수 있다.
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
- 팀장 결정(9/28): 후보 중 하나라도 저장할 수 없으면 전체를 저장하지 않고 실패로 기록한다([PR #143 팀장 댓글][p143c]). 같은 결과로 다시 저장해도 계속 실패하는 경우(미결 9)는 아래 10/6 결정으로 정했다.
- 팀장 결정(9/28): 링크 발행에서 제목 중복과 5개 한도 초과가 겹치면 제목 중복을 먼저 돌려준다. 원본 저장소의 비공개 전환 관측은 10월에 실행하지 않고, 실행 책임은 12월 범위나 배포 재개 때 정한다([#23 기록][i23c0928]).
- 팀장 결정(9/29): 링크 중단 요청의 답을 확정했다. 본인 유효 링크 중단, 반복 중단, 본인 만료 링크 중단은 모두 성공으로 답하고(만료 링크는 만료 그대로 둔다), 타인·없는 링크는 회원 공통 '볼 수 없음'이다. 소유 확인을 상태 확인보다 먼저 한다. 회원 API·계약 요약·규칙 세 파일 수정은 팀장이 별도 PR로 한다([#148 기록][i148c0929]).
- 팀장 결정(9/28): '다른 작업의 근거 일부 중첩' 사례는 #103 공용 세트에 넣지 않고 B가 자체 테스트로 확인한다. B의 테스트는 [PR #143 연결안의 사례 표][p143doc]와 [묶음 준비 검사][p143test]에 있다.
- 팀장 결정(10/6): 서버·worker·큐·DB가 끊기는 장애는 앱에서 복구하지 않는다. 접수 후 60분 안에 끝나지 않은 요청은 서버가 실패로 닫고, 반영에 실패한 요청은 시한을 기다리지 않고 닫는다. 시간 초과로 닫힌 요청과, 반영 실패로 닫혀 등록된 Catch가 0건인 요청은 새 동의·새 요청으로 다시 요청할 수 있다. '실행 중'인 요청을 '실행 여부 모름'으로 바꾸는 전이는 더하지 않고, worker 결과 보존(9/29 결정, 14일)은 철회했다. 지금 계약은 이 동작을 막고 있어 계약 PR 병합 뒤 적용하며, 구현은 [#237][i237]이다([#23 결정][i23c1006]).
- 팀장 결정(10/6): 10월 배포에서는 재시작·재배포 뒤 DB 자료와 공개·숨김·링크 상태 유지, 관리형 DB 자동 백업이 켜져 있는지와 보관 기간만 확인한다. 백업에서 복원하는 시험은 12월로 넘긴다([#24 결정][i24c1006]).

## 범위 구분 — 첫 연결과 전체 MVP

| 구간 | 연결 | 쓰는 자료·대역 | 이 구간에서 확인했다고 하지 않는 것 | 실행 이슈 |
|---|---|---|---|---|
| M1-API | 합성 접수·동의 → 결과 수신 → B 비공개 등록 → 상태·본인 Catch 조회 ([첫 연결 2][b13]) | 개발용 로그인, 합성 연동 대역, #103 합성 결과의 api 안 주입, 테스트 DB | worker 실행·큐·GitHub·LLM·web·AWS 배포, 실제 전송 신뢰성 | [#114][i114] |
| M1-화면 | 결과 진입 → 근거·기여 확인 → 별도 공개 → 링크 수신자 열람, 숨김 뒤 다음 요청 거부 ([첫 연결 3][b14]) | M1-API 구간과 web 화면. 준비 단계의 API 응답 대역은 행마다 대역 구간을 적는다 | 대역만 통과한 검사를 실제 화면·API 연결 통과로 세는 것 | [#123][i123] |
| 전체 MVP | 실제 분석 → 본인 확인 → 공개 → 비로그인 열람, 비밀번호·중단·만료, 원본 보호, 실제 로그인·연동, 배포 환경 자료 유지·백업 설정 | 실제 GitHub 수집·서비스 LLM·실제 전송·배포 환경 | 합성 자료·가짜 생성기 연결로 실제 자료 통제를 검증했다는 것([#37][i37] 「C04 수집 통제의 실행 추적」) | [#124][i124] |

- M1은 담당별 결과를 모아 팀장이 한 번 승인한다([첫 연결 M1][b15]). M1 성공은 첫 MVP 완료가 아니며 비밀번호·중단·만료, 공개 조건·현재 권한, 실패 상태·재요청, 실제 보호·배포 기준은 그대로 남는다([마일스톤][b22]).
- 배포 환경(H)의 확인과 최종 통합 연결은 전체 MVP 후속 행(IV-39)으로만 두고 H 재개 때 확인한다. 확인 범위는 재시작·재배포 뒤 DB 자료 유지와 자동 백업 설정([#24 결정][i24c1006]), 그리고 서버를 다시 띄우는 컨테이너 재시작 설정이다([#23 결정][i23c1006]). 백업 복원 시험은 12월로 넘겼고, 서버·큐 장애를 앱 안에서 복구하는 동작은 두지 않으므로 확인하지 않는다.

## 통합 검증 행

칸: **ID** · **사례** · **입력 → 기대 결과** · **근거**(FR/NFR·계약) · **담당 / 확인 상대** · **선행** · **구간·경계** · **실행 결과·증거·결함**.

### 가. 분석 접수

[통합 검증 행 가~라(접수·수신·등록·조회)](CatchU_integration_rows_intake.md#가-분석-접수)에 있다.

### 나. 결과 수신과 처리 상태

[통합 검증 행 가~라(접수·수신·등록·조회)](CatchU_integration_rows_intake.md#나-결과-수신과-처리-상태)에 있다.

### 다. 등록과 반영

[통합 검증 행 가~라(접수·수신·등록·조회)](CatchU_integration_rows_intake.md#다-등록과-반영)에 있다.

### 라. 상태와 본인 조회

[통합 검증 행 가~라(접수·수신·등록·조회)](CatchU_integration_rows_intake.md#라-상태와-본인-조회)에 있다.

### 마. 확인·공개·숨김

[통합 검증 행 마~사(확인·공개·링크·원본 보호)](CatchU_integration_rows_sharing.md#마-확인공개숨김)에 있다.

### 바. 링크와 수신자

[통합 검증 행 마~사(확인·공개·링크·원본 보호)](CatchU_integration_rows_sharing.md#바-링크와-수신자)에 있다.

### 사. 원본 보호와 전체 MVP 후속

[통합 검증 행 마~사(확인·공개·링크·원본 보호)](CatchU_integration_rows_sharing.md#사-원본-보호와-전체-mvp-후속)에 있다.

## 미등록 선행

이슈가 없는 기능 선행이다(2026-09-29 확인). [#24][i24] 「남은 외부 선행과 완료 판정」은 이 표를 가리키며, C·D 기능은 [#145][i145]·[#146][i146] 하위 이슈로 등록돼 이 표에 없다. 이 문서는 담당을 새로 배정하지 않으며 I에 자동 배정하지 않는다. 담당이 이슈를 만들면 해당 행의 선행 칸을 이슈 링크로 바꾸고 이 표에서 뺀다. 빠진 번호는 다시 매기지 않는다. 2026-09-29: 미등록 1(Catch 공개·숨김과 C에 제공할 현재 공개 자료)이 [#165][i165]([PR #167][p167])로 등록돼 IV-23·IV-27·IV-28·IV-31·IV-35의 선행 칸을 바꿨다. 2026-10-06: 미등록 5(E의 실제 전송 연결)는 api 쪽 큐 연결 [#233][i233]으로 등록돼 뺐다. 2026-10-15: 미등록 6(실제 Google 로그인·GitHub 연동)은 [#249][i249]·[#231][i231]·[#250][i250]으로 등록돼 IV-37의 선행 칸을 바꾸고 뺐다. 같은 날 IV-37에 필요한 실제 자료용 고지 반영과 실제 회원 요청을 받는 접수 연결은 이슈가 없어 미등록 9로 더했고, 같은 접수가 필요한 IV-38의 선행 칸에도 [#252][i252]와 함께 넣었다. 2026-10-17: 미등록 9는 실제 자료용 고지 반영 [#322][i322]과 실제 회원 분석 접수 전환 [#323][i323]으로 나뉘어 등록돼 IV-37·IV-38의 선행 칸을 바꾸고 뺐다.

| 번호 | 필요한 기능 | 영역 | 쓰는 행 | 현재 기록 |
|---|---|---|---|---|
| 미등록 2 | 내 자산 Catch 목록·필터 화면, Catch 상세·확인·공개 화면 | B(팀원 4) | IV-24~IV-28 | [#129][i129] 계획표 B05·B06 '등록 전' |
| 미등록 3 | 원본 보호 상태 입력 연결 | B(팀원 4), 관측 제공은 미배정 | IV-36 | [#129][i129] 계획표 B08 '등록 전' |
| 미등록 4 | 실제 작업 식별 기준과 B 등록 연결 | B(팀원 4) | IV-38 | [#129][i129] 계획표 B07 '등록 전' |
| 미등록 7 | 배포 환경 배포, 컨테이너 재시작 설정, 재시작·재배포 뒤 DB 자료 유지와 자동 백업 설정 확인 | H(팀원 1) | IV-39 | H 재개 때 등록([#24][i24]). 백업 복원 시험은 12월([#24 결정][i24c1006]) |
| 미등록 8 | 원본 상태 관측의 실행 책임 | 미배정(계약상 A/B/F/H) | IV-36 | 12월 범위나 배포 재개 때 정한다([#23 기록][i23c0928]), 그때까지 [#24][i24]의 미배정 책임 |

## 미결

계약에 없는 판정이다. 이 문서는 새로 정하지 않고 결정 기록에 연결한다. 결정이 난 것은 결정 기록 칸에 그 뜻과 링크를 적는다.

| 번호 | 미결 | 계약·출처 | 쓰는 행 | 결정 기록 |
|---|---|---|---|---|
| 미결 1 | 원본 상태 관측 경로·주기·오류 처리와 실행 책임(OQ-B3). 실행 책임은 미배정 | [명세 OQ-B3][c186] | IV-35, IV-36 | 팀장 결정(9/28): 10월에는 관측을 실행하지 않고, 이미 비공개로 확인된 자료를 막는 규칙만 유지한다. 실행 책임은 12월 범위나 배포 재개 때 정한다([#23 기록][i23c0928]) · [#24][i24] |
| 미결 2 | 링크 발급에서 제목 중복과 한도 초과가 겹칠 때의 판정 순서. 계약은 두 코드만 나열한다 | [명세 L130][c130] · [#23 9/15 제안(이미 있음 먼저)][i23c0915] | IV-30 | 팀장 결정(9/28): 제목 중복을 먼저 돌려준다. 중단·만료 링크는 양쪽 검사에서 뺀다([#23 기록][i23c0928]) |
| 미결 3 | 열람 증표(grant)의 수명·브라우저 저장과 비밀번호 시도 제한(OQ-C1) | [명세 OQ-C1][c187] | IV-34 | [#150][i150] |
| 미결 4 | F 임시 결과 보존 위치·수명과 손실 없는 전달(OQ-F1) | [명세 OQ-F1][c182] | IV-38 | 팀장 결정(10/6): 앱에서 다루지 않는다. worker는 결과를 보내면 끝이고 보존·재전달을 두지 않으며, 9/29 결과 보존 14일 결정은 철회했다. 전달되지 않은 요청은 처리 시한이 닫는다(계약 PR 병합 뒤 적용, [#237][i237]). 계약 OQ-F1의 보존·전송 부분은 계약 PR에서 고친다([#23 결정][i23c1006]) |
| 미결 5 | 작업 동일성 판별 함수와 충돌 검증(OQ-F2) | [명세 OQ-F2][c183] | IV-15, IV-38 | [#111][i111] · [#118][i118] |
| 미결 6 | 서비스 LLM 제공자·모델·조건(OQ-L) | [명세 OQ-L][c188] | IV-38 | [#119][i119] |
| 미결 7 | 실제 로그인·연동 경로와 수명(OQ-A1) | [명세 OQ-A1][c180] | IV-37 | 2026-10-14 명세에 반영해 정했다([PR #297][p297] · [명세 OQ-A1 결정][c1014oq]). 로그인·GitHub 연결·세션 갱신·로그아웃의 경로, 쿠키·요청 출처 검사, 세션 수명은 [명세 「M — 회원 API」의 인증 규칙][c1014auth]을 따른다. 운영 도메인·AWS 앞단 설정만 [#212][i212]에 남았다 |
| 미결 8 | 수신자에게 보일 공개 프로필 항목(OQ-A2) | [명세 OQ-A2][c181] | IV-31 | [#151][i151] |
| 미결 9 | 같은 결과로 다시 반영해도 계속 실패하는 경우의 처리. 계약상 반영 실패 동안 그 요청은 진행 중으로 남으므로([명세 L69][c69]), 해결 전에는 그 회원이 다른 저장소 분석을 요청하면 거절된다([명세 L73][c73]) | [PR #143 팀장 댓글][p143c] | IV-17, IV-18 | 팀장 결정(10/6): 반영을 다시 시도하는 복구는 두지 않는다. 반영에 실패한 요청은 처리 시한을 기다리지 않고 닫히고, 등록된 Catch가 0건이면 새 동의·새 요청으로 다시 요청할 수 있다. 계약 PR 병합 뒤 적용하며 구현은 [#237][i237]이다([#23 결정][i23c1006]) |
| 미결 10 | 링크 중단 요청의 답. 회원 경로의 공통 '볼 수 없음'과 수신자 공통 안내 규칙(BR2.13)이 중단 요청에 함께 걸려 문서끼리 갈리고, 본인 만료 링크의 중단은 계약에 없다 | [명세 L48][c48] · [api 규칙 BR2.13][br105] | IV-40 | 팀장 결정(9/29): 위 「기준 판본」의 결정대로 답하고, 계약 세 파일 수정은 팀장이 별도 PR로 한다([#148 기록][i148c0929]) |

## 담당별 확인 기록

[PR #160](https://github.com/JminAILab/CatchU/pull/160) 리뷰, 해당 구현 PR 리뷰나 [#112][i112] 댓글에서 각 담당이 자기 행의 기대 결과와 경계를 확인한 기록이다. 확인한 행과 판본을 밝힌 댓글만 확인으로 적는다. Approve만 있으면 확인으로 적지 않는다. 작성자(팀원 1)의 F 행 작성은 다른 담당의 확인을 대신하지 않는다.

| 담당 | 확인할 행 | 확인 판본 | 확인 기록 | 미확인일 때 영향과 다음 행동 |
|---|---|---|---|---|
| 팀원 2 A/E (`yeongyeon1802`) | IV-01~IV-15, IV-17~IV-21, IV-23, IV-24, IV-31, IV-34, IV-37 | `2430ba8` | IV-01·IV-04·IV-12 확인([댓글][i112c1019]). 기대 결과·합성 경계가 구현·시험 근거와 맞아 문구는 그대로 둔다 | 나머지 행(IV-02, IV-03, IV-05~IV-11, IV-13~IV-15, IV-17~IV-21, IV-23, IV-24, IV-31, IV-34, IV-37)은 미확인이다. 접수·수신·상태 행이 E 구현([#138][i138]~[#140][i140])과 어긋날 수 있어 [#123][i123]·[#124][i124]에서 쓰기 전에 확인한다 |
| 팀원 4 B (`leechaeah`) | IV-06, IV-12~IV-29, IV-31~IV-33, IV-35, IV-40 | `13ec15d` | IV-14·IV-22 확인, IV-23은 타인·없는 Catch 조회 거부만 확인([댓글][i112c1019b]). 기대 결과·합성 경계가 코드·시험 근거와 맞아 문구는 그대로 둔다(시험 재실행 없이 근거 대조) | 나머지 행(IV-06, IV-12, IV-13, IV-15~IV-21, IV-24~IV-29, IV-31~IV-33, IV-35, IV-40)과 IV-23의 변경·인증 경로는 미확인이다. 이 중 IV-12는 [#114][i114] 첫 확인에 쓰므로 그 실행 전에 확인한다. 나머지는 등록·반영·공개 행이 B 구현([#105][i105]·[#130][i130]·[#131][i131])과 어긋날 수 있어 [#123][i123]·[#124][i124]에서 쓰기 전에 확인한다 |
| 팀원 3 C/D (`csyg0616`) | IV-05~IV-07, IV-20~IV-35, IV-37, IV-40 | `145d7a6` | IV-24·IV-29~IV-34 확인([리뷰][rv3]). 보완 요청 4건은 이 PR에 반영했고, 그 반영으로 새로 만든 IV-40은 확인 전이다 | 나머지 행(IV-05~IV-07, IV-20~IV-23, IV-25~IV-28, IV-35, IV-37, IV-40)은 미확인이다. 결과 진입·수신자 행이 C/D 구현([#145][i145]·[#146][i146] 하위)과 어긋날 수 있어 [#123][i123]에서 쓰는 행만 실행 전에 확인한다 |

## 실행 결과를 채울 때

- 실행 이슈([#114][i114] API, [#123][i123] 화면, [#124][i124] 전체)의 PR이 행 ID를 인용하고, 그 PR에 기준 커밋·환경·명령·기대/실제 결과·합성/실제 경계를 적는다.
- 이 문서의 실행 결과 칸에는 `미실행` 뒤에 실행 PR·결함 이슈 링크만 덧붙인다. 불일치가 남았거나 대역으로만 확인한 행은 통과로 적지 않는다.
- 결함은 해당 기능 담당의 수정 이슈로 연결하고 재시험 PR을 같은 칸에 덧붙인다.
- 행을 추가하거나 기대 결과를 바꿀 때는 PR로 하고 그 행의 담당에게 확인받는다. 계약과 어긋나면 이 문서를 고치지 말고 [#23][i23]에 올린다.

[i23]: https://github.com/JminAILab/CatchU/issues/23
[i23c0915]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-5673635807
[i23c0928]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-5869226609
[i23c1006]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296
[i24]: https://github.com/JminAILab/CatchU/issues/24
[i24c1006]: https://github.com/JminAILab/CatchU/issues/24#issuecomment-6012203241
[i37]: https://github.com/JminAILab/CatchU/issues/37
[i103]: https://github.com/JminAILab/CatchU/issues/103
[i105]: https://github.com/JminAILab/CatchU/issues/105
[i111]: https://github.com/JminAILab/CatchU/issues/111
[i112]: https://github.com/JminAILab/CatchU/issues/112
[i112c1019]: https://github.com/JminAILab/CatchU/issues/112#issuecomment-6252128495
[i112c1019b]: https://github.com/JminAILab/CatchU/issues/112#issuecomment-6258098434
[i114]: https://github.com/JminAILab/CatchU/issues/114
[i118]: https://github.com/JminAILab/CatchU/issues/118
[i119]: https://github.com/JminAILab/CatchU/issues/119
[i123]: https://github.com/JminAILab/CatchU/issues/123
[i124]: https://github.com/JminAILab/CatchU/issues/124
[i129]: https://github.com/JminAILab/CatchU/issues/129
[i130]: https://github.com/JminAILab/CatchU/issues/130
[i131]: https://github.com/JminAILab/CatchU/issues/131
[i136]: https://github.com/JminAILab/CatchU/issues/136
[i138]: https://github.com/JminAILab/CatchU/issues/138
[i140]: https://github.com/JminAILab/CatchU/issues/140
[i145]: https://github.com/JminAILab/CatchU/issues/145
[i146]: https://github.com/JminAILab/CatchU/issues/146
[i148c0929]: https://github.com/JminAILab/CatchU/issues/148#issuecomment-5882528372
[i150]: https://github.com/JminAILab/CatchU/issues/150
[i151]: https://github.com/JminAILab/CatchU/issues/151
[i165]: https://github.com/JminAILab/CatchU/issues/165
[i212]: https://github.com/JminAILab/CatchU/issues/212
[i231]: https://github.com/JminAILab/CatchU/issues/231
[i233]: https://github.com/JminAILab/CatchU/issues/233
[i237]: https://github.com/JminAILab/CatchU/issues/237
[i249]: https://github.com/JminAILab/CatchU/issues/249
[i250]: https://github.com/JminAILab/CatchU/issues/250
[i252]: https://github.com/JminAILab/CatchU/issues/252
[i322]: https://github.com/JminAILab/CatchU/issues/322
[i323]: https://github.com/JminAILab/CatchU/issues/323
[p143c]: https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865277945
[p158]: https://github.com/JminAILab/CatchU/pull/158
[p167]: https://github.com/JminAILab/CatchU/pull/167
[p297]: https://github.com/JminAILab/CatchU/pull/297
[rv3]: https://github.com/JminAILab/CatchU/pull/160#pullrequestreview-5347129835
[p143doc]: https://github.com/JminAILab/CatchU/blob/a56bf14181fd812d686cbc2d7ce6b0ee6ccb46db/api/docs/catch-registration-proposal.md#L151
[p143test]: https://github.com/JminAILab/CatchU/blob/a56bf14181fd812d686cbc2d7ce6b0ee6ccb46db/api/test/catches/registration-batch.test.cjs#L65
[k0]: https://github.com/JminAILab/CatchU/blob/2071d2a1a7f36a5150b7e59da99cdef8a86f367c/worker/fixtures/m1-synthetic/cases.json
[명세]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md
[ym]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml
[yr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/recipient-api.yaml
[yc]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml
[yw]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
[c48]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L48
[c69]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L69
[c73]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L73
[c130]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L130
[c180]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L180
[c181]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L181
[c182]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L182
[c183]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L183
[c184]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L184
[c186]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L186
[c187]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L187
[c188]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L188
[c1014auth]: https://github.com/JminAILab/CatchU/blob/c0104009af94c554a013b814746c239c8fc04d9d/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L54-L64
[c1014oq]: https://github.com/JminAILab/CatchU/blob/c0104009af94c554a013b814746c239c8fc04d9d/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L199
[fs]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md
[en]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md
[br105]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md#L105-L112
[ws]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md
[wk]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md#L29-L36
[rq]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md
[bp]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md
[b13]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md#L13
[b14]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md#L14
[b15]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md#L15
[b22]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md#L22
[t]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/team-allocation.md#L3-L10
