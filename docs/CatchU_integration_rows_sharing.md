# CatchU 통합 검증표 — 통합 검증 행 마~사(확인·공개·링크·원본 보호)

> [통합 검증표](CatchU_통합검증표.md)의 절을 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 그대로 옮긴 파일이다. 지위와 적용 범위는 그 문서와 같고, 다른 절은 그 문서에서 찾는다. AI가 한 번에 읽을 수 있게 36 KB 미만으로 유지한다.

### 마. 확인·공개·숨김

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-25 | 최초 비공개 | 등록 직후 Catch → 비공개다. 본인만 보고 링크 수신자에게는 보이지 않는다 | [FR3.5][r76] · [FR4.1][r84] · [명세 L87][c87] · [api 상태 전이][f58] | B(팀원 4) / C(팀원 3) | [#105][i105] · [#130][i130] · [#151][i151] · [#152][i152] · 미등록 2 | M1-화면 · 합성 | 미실행 |
| IV-26 | 확인만으로 공개 안 됨 | 근거·기여를 확인했다고 표시 → 여전히 비공개다. 불일치 표시도 공개 여부를 바꾸지 않는다 | [FR2.2][r67] · [FR3.5][r76] · [FR4.1][r84] · [명세 L87][c87] · [api F5][f40] | B(팀원 4) / C·D(팀원 3) | [#131][i131] · [#151][i151] · [#152][i152] · 미등록 2 | M1-화면 · 합성 | 미실행 |
| IV-27 | 별도 공개 | 확인한 Catch를 따로 공개 → 그때 조건을 다시 검사해 공개하고, 다음 요청부터 수신자에게 보인다. 초안이 없어도 공개할 수 있다. 확인하지 않은 Catch는 공개가 거절된다 | [FR4.1][r84] · [명세 L87][c87] · [명세 오류 표][c129] · [api 동시성][f79] | B(팀원 4) / C(팀원 3) | [#131][i131] · [#151][i151] · [#165][i165] · 미등록 2 | M1-화면 · 합성 | 미실행 |
| IV-28 | 숨김 뒤 다음 요청 거부 | 공개 Catch를 다시 비공개로 → 기존 링크의 다음 요청부터 보이지 않는다(숨기기 전에 받아 둔 다음 페이지로 요청해도 마찬가지). 이미 열린 화면을 실시간으로 지우지는 않는다 | [FR4.1][r84] · [NFR1][r116] · [명세 목록 규칙][c51] · [명세 L87][c87] · [명세 L114][c114] · [명세 L116][c116] · [api 동시성][f78] | B(팀원 4) / C(팀원 3) | [#151][i151] · [#152][i152] · [#165][i165] · 미등록 2 | M1-화면 · 합성 | 미실행 |

### 바. 링크와 수신자

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-29 | 링크 발급 | 공개한 Catch가 없어도 링크를 만들 수 있고, 만든 때부터 30일 뒤 만료된다. 같은 제목의 유효 링크가 있거나 유효 링크가 이미 5개면 거절되며, 동시에 만들어도 이 한도를 넘지 않는다. 같은 요청 키로 같은 내용을 다시 보내면 기존 링크를 돌려주고, 같은 키로 내용이 다르면 거절한다 | [FR4.2][r85] · [FR4.5][r88] · [명세 L117][c117] · [명세 중복 요청][c135] · [발급 200 응답][ym306] · [api F6][f41] · [api 동시성][f77] | C(팀원 3) / B(팀원 4) | [#147][i147] · [#148][i148] · [#149][i149] | M1-화면(발급) · 전체 MVP(제목·한도·동시 발급) · 합성 | 미실행 |
| IV-30 | 발급 오류 판정 순서 | 요청 키가 다른 재요청에서 제목 중복과 5개 초과가 동시에 해당 → 제목 중복으로 거절한다. 중단·만료 링크는 제목 비교와 5개 한도 모두에서 뺀다. 같은 키·같은 본문의 재요청은 처음 응답을 돌려줘 오류가 나지 않는다 | [명세 L117][c117] · [명세 L130][c130] · [명세 중복 요청][c135] · [#23 기록][i23c0928] | C(팀원 3) / 팀장 | [#147][i147] | 전체 MVP · 합성, 팀장 결정(9/28) | 미실행 |
| IV-31 | 수신자 현재 공개 목록·상세 | 링크를 연 사람(비밀번호 링크는 비밀번호 확인 뒤) → 지금 공개 중이고 원본 보호에 걸리지 않은 Catch만 본다. 공개한 게 없으면 '없음', 불러오지 못하면 '오류'로 구분된다. 숨겼거나 다른 사람 것이거나 없는 Catch는 모두 같은 '볼 수 없음' | [FR3.2][r74] · [FR4.2][r85] · [명세 L113-114][c113] · [api F7][f42] · [web 수신자 0건][w66] | C(팀원 3) / B(팀원 4)·A(팀원 2) | [#135][i135] · [#150][i150] · [#151][i151] · [#152][i152] · [#165][i165] | M1-화면 · 합성, 공개 프로필에 보일 항목은 미결 8 | 미실행 |
| IV-32 | 수신자에게 나가지 않는 정보 | 수신자 화면·응답 → 제목·근거·기여·설명 초안만 보인다. 본인용 질문, 확인·불일치 표시, 내부 번호, 링크 제목은 없다. 초안이 없으면 없다고 보이고, 응답은 브라우저나 중간 서버에 저장되지 않는다 | [NFR1][r116] · [명세 L115-116][c115] · [api 수신자 응답][f88] · [web 공개 자료][w75] | C(팀원 3) / B(팀원 4) | [#151][i151] · [#152][i152] | M1-화면 · 합성 | 미실행 |
| IV-33 | 링크 없음·중단·만료 | 없는 링크·중단한 링크·만료된 링크 → 셋 다 똑같은 '열람할 수 없음' 안내이고, 비밀번호를 묻기 전에 막는다. 링크를 중단해도 Catch 공개 여부는 그대로다. 만료는 시각을 조작해 재현한다. 발행자가 중단을 요청할 때의 답은 IV-40이다 | [FR4.3][r86] · [FR4.5][r88] · [명세 L110][c110] · [명세 L117][c117] · [api 상태 전이][f59] | C(팀원 3) / B(팀원 4) | [#148][i148] · [#150][i150] · [#152][i152] | 전체 MVP · 합성, 시각 제어 | 미실행 |
| IV-34 | 비밀번호와 열람 증표 | 비밀번호 링크 → 입력 전이거나 틀리면 비밀번호를 다시 묻고, 맞으면 그 링크에서만 쓰는 열람 증표를 준다. 증표가 있어도 중단·만료된 링크나 다른 링크는 못 연다. 비밀번호 확인 전에는 Catch가 있는지도 알리지 않고, 로그인 화면으로 보내지 않는다 | [FR4.4][r87] · [NFR1][r116] · [명세 L111-112][c111] · [명세 L114][c114] · [명세 비밀번호 오류][c125] · [web 수신 접근][w64] | C(팀원 3) / A(팀원 2) | [#106][i106] · [#150][i150] · [#152][i152] | 전체 MVP · 합성, grant 수명·시도 제한은 미결 3 | 미실행 |
| IV-40 | 링크 중단 요청의 답 | 본인 유효 링크를 중단 → 중단 상태가 된다. 같은 링크를 다시 중단해도 오류가 아니고 중단 상태 그대로이며, 만료 시각이 지나도 중단으로 남는다. 본인 만료 링크를 중단하면 중단 처리를 더하지 않고 만료 상태로 답한다. 다른 사람 링크·없는 링크는 똑같이 '볼 수 없음'으로 답하고, 상태보다 소유를 먼저 본다. 중단은 Catch 내용·공개 여부를 바꾸지 않는다 | [FR4.5][r88] · [명세 L48][c48] · [명세 L117][c117] · [중단 PUT][ym319] · [api 상태 전이][f59] · [api 규칙 BR2.12][br97] · [ERD 중단 반복][e167] · [#148 결정][i148c0929] | C(팀원 3) / B(팀원 4) | [#148][i148] | 전체 MVP · 합성, 시각 제어. 발행자 중단은 수신자 열람 판정(IV-33)과 다른 규칙이며, 권한·충돌 오류를 쓰지 않는다(팀장 결정 9/29, 계약 세 파일 수정 전이라 미결 10) | 미실행 |

### 사. 원본 보호와 전체 MVP 후속

| ID | 사례 | 입력 → 기대 결과 | 근거 | 담당 / 확인 상대 | 선행 | 구간·경계 | 실행 결과·증거·결함 |
|---|---|---|---|---|---|---|---|
| IV-35 | 원본 보호(합성 상태) | 원본 저장소의 비공개 전환이 확인된 상태(합성) → 관련 Catch는 수신자에게 안 보이고 공개도 거절되며, 본인 화면에는 보호 중으로 보인다. 일시적인 조회 실패는 비공개로 치지 않고, 상관없는 Catch·링크는 멈추지 않는다. 소유자에게 보일 안내 문구·방식은 이 문서에서 정하지 않는다 | [FR1.5][r58] · [명세 L88][c88] · [명세 오류 표][c129] · [Catch 보호 필드][yc189] · [ERD 보호][e151] | B(팀원 4) / C(팀원 3)·F(팀원 1) | [#151][i151] · [#165][i165] | 전체 MVP · 규칙은 계약대로 유지하지만 10월에는 이 상태를 만드는 경로가 없어 미실행으로 남는다(팀장 결정 9/28, [#23 기록][i23c0928]) | 미실행 |
| IV-36 | 원본 상태 실제 관측 | 실제 저장소의 비공개 전환·일시 장애 → 확인된 전환만 보호로 반영한다. 10월에는 관측을 실행하지 않으며, 누가 어떻게 관측할지는 12월 범위나 배포 재개 때 정한다(미결 1) | [FR1.5][r58] · [명세 OQ-B3][c186] · [#23 기록][i23c0928] | 미배정(계약상 A/B/F/H) / 팀장 | 미등록 3 · 미등록 8 | 전체 MVP · 10월 실행 없음 | 미실행 |
| IV-37 | 실제 로그인·GitHub 연동 | 실제 Google 로그인·GitHub 연동으로 IV-01을 다시 → 로그인·연동 방식이 정해진 뒤 채운다(미결 7) | [FR11.1~11.3][r108] · [명세 OQ-A1][c180] | A(팀원 2) / C·D(팀원 3) | 미등록 6 | 전체 MVP · 미결 7 | 미실행 |
| IV-38 | 실제 분석 전체 흐름 | 실제 저장소 분석 결과 → 등록 → 본인 확인 → 공개 → 로그인 없는 열람까지, 실패·보호·결함 재시험 포함 | [주요 시나리오][r127] · [첫 연결 순서][b13] | 각 영역 담당 / 팀원 1(I 취합) | [#124][i124] · [#77][i77] · 미등록 4 · [#233][i233] | 전체 MVP · 실제 자료, 미결 4·5·6 | 미실행 |
| IV-39 | 배포 환경 자료 유지·백업 설정 | 실제 주소에서 서버를 재시작·재배포 → DB 자료와 공개·숨김·링크 상태가 그대로다. 관리형 DB 자동 백업이 켜져 있는지와 보관 기간을 설정 화면으로 확인해 증거로 남긴다. 백업에서 복원하는 시험은 12월로 넘긴다. H 재개 때 확인한다 | [NFR4][r119] · [NFR8][r123] · [주요 시나리오 NCP][r138] · [#24 결정][i24c1006] | H(팀원 1) / 각 영역 담당 | 미등록 7 | 전체 MVP · 배포 환경. 서버는 컨테이너 재시작 설정으로 다시 띄우고, 서버·큐 장애를 앱 안에서 복구하는 동작은 없어 확인하지 않는다([#23 결정][i23c1006]) | 미실행 |

[i23c0928]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-5869226609
[i23c1006]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296
[i24c1006]: https://github.com/JminAILab/CatchU/issues/24#issuecomment-6012203241
[i77]: https://github.com/JminAILab/CatchU/issues/77
[i105]: https://github.com/JminAILab/CatchU/issues/105
[i106]: https://github.com/JminAILab/CatchU/issues/106
[i124]: https://github.com/JminAILab/CatchU/issues/124
[i130]: https://github.com/JminAILab/CatchU/issues/130
[i131]: https://github.com/JminAILab/CatchU/issues/131
[i135]: https://github.com/JminAILab/CatchU/issues/135
[i147]: https://github.com/JminAILab/CatchU/issues/147
[i148]: https://github.com/JminAILab/CatchU/issues/148
[i148c0929]: https://github.com/JminAILab/CatchU/issues/148#issuecomment-5882528372
[i149]: https://github.com/JminAILab/CatchU/issues/149
[i150]: https://github.com/JminAILab/CatchU/issues/150
[i151]: https://github.com/JminAILab/CatchU/issues/151
[i152]: https://github.com/JminAILab/CatchU/issues/152
[i165]: https://github.com/JminAILab/CatchU/issues/165
[i233]: https://github.com/JminAILab/CatchU/issues/233
[c48]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L48
[c51]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L51
[c87]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L87
[c88]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L88
[c110]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L110
[c111]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L111-L112
[c113]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L113-L114
[c114]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L114
[c115]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L115-L116
[c116]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L116
[c117]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L117
[c129]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L129
[c130]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L130
[c135]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L135
[c180]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L180
[c186]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L186
[c125]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L125
[ym306]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml#L306
[ym319]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml#L319-L334
[yc189]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml#L189
[f40]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L40
[f41]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L41
[f42]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L42
[f58]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L58
[f59]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L59
[f77]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L77
[f78]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L78
[f79]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L79
[f88]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L88-L89
[e151]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L151
[e167]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L167
[br97]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md#L97-L104
[w64]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L64
[w66]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L66
[w75]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md#L75
[r58]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L58
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
[b13]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/bolt-plan.md#L13
