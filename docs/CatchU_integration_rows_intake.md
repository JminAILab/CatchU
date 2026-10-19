# CatchU 통합 검증표 — 통합 검증 행 가~라(접수·수신·등록·조회)

> [통합 검증표](CatchU_통합검증표.md)의 절을 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 그대로 옮긴 파일이다. 지위와 적용 범위는 그 문서와 같고, 다른 절은 그 문서에서 찾는다. AI가 한 번에 읽을 수 있게 36 KB 미만으로 유지한다.

### 가. 분석 접수

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-01 | 새 분석 접수 | 로그인한 회원이 선정 저장소를 고르고 동의해 분석을 요청 → 접수됐다는 응답을 받고, 요청과 동의가 함께 저장된다. 저장에 실패하면 접수 성공이라고 답하지 않는다 | [FR1.1][r56] · [명세 상태 표][c53] · [api F2][f36] | A/E(팀원 2) / F(팀원 1) | [#87][i87] · [#104][i104] · [#136][i136] · [#138][i138] | M1-API · 합성 연동 대역, 실제 GitHub 연동 아님 | 미실행 · [#345 첫 확인][p345] |
| IV-02 | 중복·동시 접수 | 같은 저장소를 다시 요청 → 새로 만들지 않고 진행 중인 작업을 돌려준다. 다른 저장소를 요청 → 진행 중인 작업이 있다며 거절한다. 동시에 두 번 보내거나 응답을 못 받아 다시 보내도 요청은 하나만 생긴다 | [FR1.4][r57] · [NFR4][r119] · [명세 L73][c73] · [명세 중복 요청][c135] · [api 동시성][f71] · [접수 200 응답][ym123] | E(팀원 2) / A(팀원 2) | [#104][i104] · [#138][i138] | M1-API · 합성 | 미실행 |
| IV-03 | 연동·동의·대상 조건 미충족 | GitHub 미연동, 동의 없음, 선정 밖 저장소로 요청 → 거절하고 요청을 만들지 않는다 | [FR1.1][r56] · [명세 오류 표][c126] | E(팀원 2) / A(팀원 2) | [#136][i136] · [#138][i138] | M1-API · 합성 연동 대역 | 미실행 |

### 나. 결과 수신과 처리 상태

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-04 | 적합 후보 1건 수신 · [`succeeded-one-candidate`][k11] | 분석 결과가 도착 → E가 받았다고 기록한 뒤 수신 확인을 보낸다. 기록에 실패하면 받았다고 답하지 않는다. 수신 확인은 'Catch 등록 완료'가 아니다 | [FR2.1][r66] · [명세 W 메시지][c158] · [api F3][f37] · [#139 완료 기준][i139] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] | M1-API · `sourceMode=MOCK` 유지, 실제 분석 성공 아님 | 미실행 · [#345 첫 확인][p345] |
| IV-05 | 정상 0건 · [`empty`][k30] | 오류 없이 후보가 0개인 결과 → '정상 완료, 새 Catch 없음'으로 끝난다. 근거가 부족해 빠진 후보는 실패로 세지 않는다. 이 요청은 다시 분석할 수 없다 | [FR1.4][r57] · [FR2.1][r66] · [명세 L70-71][c70] · [명세 L75][c75] | E(팀원 2) / F(팀원 1)·D(팀원 3) | [#103][i103] · [#139][i139] · [#105][i105] · [#140][i140] | M1-API · 합성 | 미실행 |
| IV-06 | 부분 실패 · [`partial-failed`][k49] | 쓸 수 있는 후보와 실패가 섞인 결과 → 쓸 수 있는 후보만 등록하고 실패는 따로 알린다. 등록된 것만 본인 결과로 열 수 있고, 재요청 대상이 아니다 | [FR1.4][r57] · [명세 L70-71][c70] · [명세 L74][c74] · [web 상태 전이][w57] | E(팀원 2)·B(팀원 4) / F(팀원 1)·D(팀원 3) | [#103][i103] · [#139][i139] · [#105][i105] · [#140][i140] | M1-API · 합성 | 미실행 |
| IV-07 | 실패와 사용자 재요청 · [`failed`][k68] | 쓸 수 있는 후보 없이 실패한 결과 → 실패로 끝나고, 서버가 허용할 때만 사용자가 다시 요청할 수 있다. 다시 요청하면 새 동의로 새 요청을 만들고 기존 자료·링크는 그대로다. 허용되지 않는 재요청은 원래 요청 번호를 빼고 보내도 거절된다 | [FR1.4][r57] · [명세 L74-75][c74] · [api F8][f43] | E(팀원 2) / F(팀원 1)·D(팀원 3) | [#103][i103] · [#138][i138] · [#139][i139] · [#140][i140] | M1-API · 합성 | 미실행 |
| IV-08 | 식별 불가 · [`unidentifiable`][k87] | 결과·요청·시도 번호 중 하나라도 없거나 비어 있는 결과 → 수신 확인 없이 거절만 기록한다. 번호를 추정해 채우지 않고 기존 요청은 그대로다 | [명세 L161][c161] · [api F3][f37] · [worker 연결 확인][wk] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] | M1-API · 합성 | 미실행 |
| IV-09 | 형식·맥락·시도 불일치 | 번호는 있지만 형식이 틀렸거나, 다른 회원·저장소·동의의 결과이거나, 이미 끝난 시도의 결과 → 거절하고 기존 자료를 지킨다. 입력은 #103 세트에 파일이 없어 [#103 안내][k74]대로 만든다 | [명세 L90][c90] · [명세 L161][c161] · [Receipt 스키마][wm142] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] | M1-API · 합성 | 미실행 |
| IV-10 | 진행 알림과 처리 시한 · [`progress-events`][k187] | '실행 중'·'실행 여부 모름' 알림 → 진행 상태만 바뀌고, 끝난 것으로 처리되지 않는다. 이미 '실행 중'이면 '실행 여부 모름'이 와도 '실행 중'으로 남는다. 접수 후 처리 시한(60분)이 지나도 끝나지 않으면 서버가 실패로 닫고, 사용자는 다시 요청할 수 있다(계약 PR 병합 뒤 적용, [#237][i237]) | [FR1.4][r57] · [명세 L60][c60] · [명세 L68][c68] · [api F3-P][f38] · [api 상태 전이][f52] · [api 종료 조건][f57] · [#23 결정][i23c1006] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] · [#237][i237] | M1-API · 합성, 시한 닫기는 시각 제어. 지금 계약(명세 L60·L68)은 시간 경과로 실패를 확정하지 않아 계약 PR이 먼저다 | 미실행 |
| IV-11 | 늦은 진행 이벤트 | 결과가 끝난 뒤에 '실행 중' 알림이 늦게 도착 → 끝난 상태가 되돌아가지 않는다. 결과가 알림보다 먼저 와도 받는다. 입력은 #103 세트에 파일이 없어 [#103 안내][k74]대로 만든다 | [NFR4][r119] · [명세 L156][c156] · [api 상태 전이][f52] | E(팀원 2) / F(팀원 1) | [#103][i103] · [#139][i139] | M1-API · 합성 | 미실행 |
| IV-12 | 같은 결과 재전달 · [`redelivery`][k106] | 같은 결과가 한 번 더 도착 → '이미 받음'으로 답하고 Catch가 늘거나 바뀌지 않는다 | [FR1.4][r57] · [NFR4][r119] · [명세 L86][c86] · [api 동시성][f73] | E(팀원 2)·B(팀원 4) / F(팀원 1) | [#103][i103] · [#139][i139] · [#105][i105] | M1-API · 합성 | 미실행 · [#345 첫 확인][p345] |
| IV-13 | 같은 ID의 다른 내용 · [`same-id-different-content`][k137] | 같은 번호인데 내용이 다른 결과 → 거절하고 기존 결과·Catch를 지킨다 | [NFR4][r119] · [명세 L86][c86] · [명세 L90][c90] · [ERD 수신 기록][e194] | E(팀원 2) / F(팀원 1)·B(팀원 4) | [#103][i103] · [#139][i139] | M1-API · 합성 | 미실행 |

### 다. 등록과 반영

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-14 | 정상 등록과 반영 완료 | IV-04의 결과 → 비공개 Catch·근거 등록과 '반영 완료·본인 열람 준비' 기록이 한꺼번에 저장되고, 본인이 조회할 수 있다 | [FR2.1][r66] · [FR2.2][r67] · [FR3.5][r76] · [명세 E↔B][c82] · [api F4][f39] | B(팀원 4)·E(팀원 2) / F(팀원 1) | [#86][i86] · [#103][i103] · [#104][i104] · [#105][i105] · [#130][i130] · [#139][i139] | M1-API · 합성, 테스트 DB 실제 저장 | 미실행 · [#345 첫 확인][p345] |
| IV-15 | 두 후보가 같은 작업 · [`two-candidates-same-work`][k168] | 같은 작업으로 판정된 두 후보 → Catch는 하나만 생기고 두 후보가 모두 그 Catch를 가리킨다. 기존 Catch 내용·공개 여부는 바뀌지 않는다. 초안이 없는 후보도 그 이유로 빠지지 않는다 | [NFR4][r119] · [명세 L72][c72] · [명세 L86][c86] · [명세 L92][c92] · [api 동시성][f74] · [api 등록 목록][f61] · [ERD 유일성][e119] | B(팀원 4) / E(팀원 2)·F(팀원 1) | [#103][i103] · [#105][i105] | M1-API · 알려진 합성 작업 식별값으로 대신함. 실제 판별은 [#111][i111]·[#118][i118] | 미실행 |
| IV-16 | 다른 작업의 근거 일부 중첩 | 근거 일부가 겹치지만 다른 작업인 두 후보 → Catch가 따로 둘 생긴다 | [명세 L92][c92] · [api 동시성][f74] · [ERD 근거][e138] | B(팀원 4) / F(팀원 1) | [#105][i105] · [PR #143][p143] | M1-API · B 자체 테스트 값(#103 공용 세트 밖, [PR #143 검사][p143test]) | 미실행 |
| IV-17 | 반영 실패 | 등록 저장 중 실패 → Catch·근거가 일부만 남지 않고 '반영 실패'로 기록되며, 받은 결과 기록은 남는다. 새 분석은 돌지 않는다. 후보 하나라도 저장할 수 없으면 전체를 저장하지 않는다. 반영에 실패한 요청은 처리 시한을 기다리지 않고 닫힌다(계약 PR 병합 뒤 적용, [#237][i237]). 닫힌 뒤 재요청은 IV-18 | [NFR4][r119] · [명세 L69][c69] · [api F4][f39] · [api 동시성][f75] · [PR #143 팀장 댓글][p143c] · [#23 결정][i23c1006] | B(팀원 4)·E(팀원 2) / F(팀원 1) | [#105][i105] · [#139][i139] · [PR #143][p143] · [#237][i237] | M1-API · 합성, 실패는 테스트에서 강제 | 미실행 |
| IV-18 | 반영 실패로 닫힌 뒤 재요청 | 반영 실패로 닫혀 등록된 Catch가 0건인 요청에서 다시 요청 → 새 동의·새 요청으로 접수되고, 기존 자료·링크는 그대로다. 같은 결과로 반영을 다시 시도하는 복구는 없다(미결 9, 계약 PR 병합 뒤 적용, [#237][i237]) | [FR1.4][r57] · [명세 L74-75][c74] · [api F8][f43] · [#23 결정][i23c1006] | E(팀원 2) / B(팀원 4) | [#105][i105] · [#138][i138] · [#140][i140] · [#237][i237] | M1-API · 합성, 반영 실패는 테스트에서 강제. 지금 계약(명세 L74-75)은 이 재요청을 막아 계약 PR이 먼저다 | 미실행 |
| IV-19 | 커밋 뒤 응답·확인 유실 | 등록은 저장됐는데 응답을 잃어 다시 시도 → 새로 만들지 않고 같은 Catch를 돌려준다 | [api F4][f39] · [api 동시성][f76] · [ERD 등록 연결][e205] | B(팀원 4)·E(팀원 2) / F(팀원 1) | [#105][i105] · [#139][i139] | M1-API · 합성 | 미실행 |

### 라. 상태와 본인 조회

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-20 | 상태 값의 구분 | 결과 도착부터 등록까지 상태를 조회 → '분석 끝남', '결과 받음', '반영 완료', '본인 열람 준비'가 따로 표시된다. 후보가 있거나 분석이 끝났다는 것만으로 열람 준비가 되지 않고, 모든 후보를 반영하기 전에는 완료로 표시하지 않는다 | [FR1.4][r57] · [명세 L62-63][c62] · [명세 L76][c76] · [api F4][f39] · [api 반영 전이][f55] · [api 열람 준비][f61] | E(팀원 2) / B(팀원 4)·D(팀원 3) | [#105][i105] · [#139][i139] · [#140][i140] | M1-API · 합성 | 미실행 |
| IV-21 | 조회 오류와 정상 0건 | 상태나 Catch를 불러오지 못함 → '오류'로 보이고 '0건'이나 '분석 실패'로 바뀌지 않으며, 새 분석을 자동으로 요청하지 않는다. 진짜 0건은 '없음'으로 보인다 | [FR1.4][r57] · [FR2.1][r66] · [명세 L76][c76] · [명세 오류 해석][c133] · [web 상태 전이][w55] | E(팀원 2)·B(팀원 4) / D(팀원 3) | [#88][i88] · [#130][i130] · [#140][i140] | M1-API·M1-화면 · 조회 실패는 테스트에서 강제 | 미실행 |
| IV-22 | 본인 Catch 목록·상세 | 본인 → 자기 Catch만 보인다. 저장소와 요청으로 함께 거르면 둘 다 맞는 것만 보이고, 다음 페이지도 그때의 권한으로 다시 판단한다 | [FR3.5][r76] · [명세 경로 표][c45] · [명세 목록 규칙][c51] | B(팀원 4) / D(팀원 3) | [#130][i130] | M1-API · 합성 | 미실행 · [#345 첫 확인][p345] |
| IV-23 | 타인·없는 자원과 인증 오류 | 다른 사람 것이나 없는 것을 보거나 바꾸려 함 → 둘 다 똑같이 '볼 수 없음'으로 답해 있는지조차 숨기고, 아무것도 바꾸지 않는다. 로그인이 없거나 만료되면 로그인 오류로 답한다 | [FR3.5][r76] · [NFR1][r116] · [명세 L48][c48] · [명세 인증 오류][c124] · [명세 오류 표][c127] | E(팀원 2)·B(팀원 4) / C·D(팀원 3) | [#87][i87] · [#88][i88] · [#130][i130] · [#131][i131] · [#140][i140] · [#165][i165] | M1-API·M1-화면 · 합성 | 미실행 · [#345 첫 확인(타인 Catch 조회 거부만)][p345] |
| IV-24 | 본인 결과 진입 화면 | 분석 상태 화면 → 등록된 Catch가 준비됐을 때만 결과로 들어간다. 분석이 끝났다는 것만으로 결과 버튼을 열지 않고, 반영 실패를 분석 실패로 안내하지 않으며, 서버가 허용할 때만 재요청 버튼을 보인다 | [FR1.4][r57] · [명세 L63-64][c63] · [web W3][w13] · [web 상태 전이][w57] | D(팀원 3)·B(팀원 4) / E(팀원 2) | [#106][i106] · [#140][i140] · [#153][i153] · [#154][i154] · [#168][i168] · [#169][i169] | M1-화면 · 합성, 초기 준비는 API 응답 대역 가능 | 미실행 |

[i23c1006]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296
[i86]: https://github.com/JminAILab/CatchU/issues/86
[i87]: https://github.com/JminAILab/CatchU/issues/87
[i88]: https://github.com/JminAILab/CatchU/issues/88
[i103]: https://github.com/JminAILab/CatchU/issues/103
[i104]: https://github.com/JminAILab/CatchU/issues/104
[i105]: https://github.com/JminAILab/CatchU/issues/105
[i106]: https://github.com/JminAILab/CatchU/issues/106
[i111]: https://github.com/JminAILab/CatchU/issues/111
[i118]: https://github.com/JminAILab/CatchU/issues/118
[i130]: https://github.com/JminAILab/CatchU/issues/130
[i131]: https://github.com/JminAILab/CatchU/issues/131
[i136]: https://github.com/JminAILab/CatchU/issues/136
[i138]: https://github.com/JminAILab/CatchU/issues/138
[i139]: https://github.com/JminAILab/CatchU/issues/139
[i140]: https://github.com/JminAILab/CatchU/issues/140
[i153]: https://github.com/JminAILab/CatchU/issues/153
[i154]: https://github.com/JminAILab/CatchU/issues/154
[i165]: https://github.com/JminAILab/CatchU/issues/165
[i168]: https://github.com/JminAILab/CatchU/issues/168
[i169]: https://github.com/JminAILab/CatchU/issues/169
[i237]: https://github.com/JminAILab/CatchU/issues/237
[p143]: https://github.com/JminAILab/CatchU/pull/143
[p143c]: https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865277945
[p143test]: https://github.com/JminAILab/CatchU/blob/a56bf14181fd812d686cbc2d7ce6b0ee6ccb46db/api/test/catches/registration-batch.test.cjs#L65
[p345]: https://github.com/JminAILab/CatchU/pull/345
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
[c90]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L90
[c92]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L92
[c126]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L126
[c127]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L127
[c133]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L133
[c135]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L135
[c156]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L156
[c158]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L158-L159
[c161]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L161
[c72]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L72
[c124]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L124
[ym123]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml#L123
[f55]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L55
[f57]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L57
[f36]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L36
[f37]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L37
[f38]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L38
[f39]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L39
[f43]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L43
[f52]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L52-L54
[f61]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L61-L63
[f71]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L71-L72
[f73]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L73
[f74]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L74
[f75]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L75
[f76]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L76
[e119]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L119-L120
[e138]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L138
[e194]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L194
[e205]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L205
[w13]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L13
[w55]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L55-L56
[w57]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L57-L62
[wk]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md#L29-L36
[r56]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L56
[r57]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L57
[r66]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L66
[r67]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L67
[r76]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L76
[r116]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L116
[r119]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L119
