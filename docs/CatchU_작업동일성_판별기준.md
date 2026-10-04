# CatchU 작업 동일성 판별 기준

> **지위: 채택** (2026-09-30, 팀장 `ljm0850`) · F(팀원 1)가 [#111][i111]에서 2026-09-29 제안으로 작성했고, 2026-09-30 B·E 검토와 팀장 결정을 반영한 뒤 팀장이 [#118][i118]의 구현 기준으로 채택했다(「결정」). B(`leechaeah`)·E(`yeongyeon1802`)는 `5c004e4`에 일반 검토 의견을 남겼고(승인 아님), 이 수정본에 그 의견을 반영했다. E는 `8155e6d`의 처리 기준을 승인했다([E 수정본 승인][e180r]). B는 `eab0989`를 다시 확인해 B1~B5와 반영 거부 구분을 수용했고(승인 아닌 의견), 요청한 구현 설명 정정 3곳은 이 판에 반영했다([B 수정본 확인][b180r]). 팀장이 정한 것은 네 가지다(「결정」). 단위 미확정 변경의 보류(2026-09-29), SHA가 다른 두 변경을 같은 변경으로 보는 기준(2026-09-30), 확인 중단으로 보류한 변경의 집계 방식(2026-09-30), 저장소별 판정(2026-09-30)이다. 확인 중단 때 실패를 기록하고 적합 후보 유무로 PARTIAL_FAILED·FAILED를 나누는 것은 기존 규칙(worker 규칙 BR3.2·BR3.3, #116 문서 2.4)에 맞춘 보완이다. 실제 판별 코드는 이 기준으로 [#118][i118]에서 만든다. [API 명세 v1][c92]·[ERD][e119]와 어긋나면 계약이 이긴다. 이 기준은 필드·권한·상태 의미·DB 관계와 유일성을 바꾸지 않는다. B 등록의 기본 동작 인용은 [PR #143][p143]의 `e2acdfe` 기준이며, 저장소·방식 불일치 거부는 같은 PR의 `a5ac5dd` 구현을 별도로 구분한다([구현 커밋][b180impl]).
>
> 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 AI가 잘리지 않고 읽게 절 단위로 나눴다(내용 변경 없음). 나눈 파일: [작업 단위와 판정 입력](CatchU_work_identity_unit.md) · [판정 규칙과 값 만드는 법](CatchU_work_identity_rules.md) · [합성 사례·시험·한계](CatchU_work_identity_cases.md) · [결정과 검토 기록](CatchU_work_identity_records.md). 옮긴 절의 제목과 새 위치는 제자리에 남겼다.

같은 작업이 Catch로 두 번 만들어지거나, 서로 다른 작업이 한 Catch로 합쳐지지 않도록 **workIdentity**(후보가 어떤 실제 작업인지 나타내는 값)를 만드는 방법과 판정 규칙을 정한다.

## 한눈에 보기

1. **작업**은 한 저장소에서 회원이 기여한 변경의 묶음이다. 기본 단위는 저자가 묶은 것(PR 하나, 또는 PR 없이 병합한 브랜치 하나)이고, 어디에도 속하지 않은 커밋은 F가 묶는다.
2. **같은 작업인지는 그 작업을 이루는 GitHub 기록(PR 번호, 병합 커밋, 커밋과 그 diff)으로만 본다.** F가 만든 제목·설명·초안·근거 문장은 보지 않는다. PR 제목·본문은 재제출을 확인할 때 원 PR의 번호·주소를 찾는 데만 읽는다. 그래서 표현만 바뀌면 같은 값이 나오고, 근거가 일부 겹쳐도 작업 단위가 다르면 다른 값이 나온다. SHA가 다른 두 변경은 같은 작업에서 비롯됐다는 관계(원 PR을 가리키는 재제출 설명, cherry-pick 표시)가 확인되고, 공백을 무시한 diff가 같을 때만 같은 변경으로 본다(2026-09-30 팀장 결정). 관계 근거가 없으면 공백을 무시한 diff가 같아도 합치지 않는다. 같은 이슈를 참고했거나 같은 파일을 고친 것은 관계 근거가 아니고, PR 상태와 만든 순서만으로도 재제출로 보지 않는다. 관계가 확인된 두 변경 사이에서는 문자열 안 공백이나 들여쓰기만 다른 차이를 구분하지 못하며, 이 한계는 감수한다.
3. **한 결과(한 번의 분석이 낸 후보 목록) 안에서 같은 변경은 한 후보에만 속한다.** 여러 PR에 같은 변경이 들어 있으면(통합·반영용 PR, 다시 연 PR) 한 곳에만 배정한다.
4. **한 단위 안에 서로 다른 작업이 있다는 근거가 있을 때만 단위를 나눈다.** 근거가 없으면 나누지 않고 한 후보로 둔다(도메인 설계 [Q7][q7] 결정).
5. **판정 범위는 한 회원·한 저장소·한 방식(합성 MOCK 또는 실제 LIVE) 안이다.** 회원은 B가 이미 (회원, workIdentity) 조합을 하나만 허용해 구분한다. 저장소와 방식은 workIdentity 값 안에 넣는다. 초기 B 등록 코드(`e2acdfe`)는 기존 Catch를 참조할 때 저장소와 방식을 대조하지 않았고, 최신 PR #143은 다르면 그 결과의 반영 전체를 거부한다. 어느 쪽이든 저장소나 방식이 다른 작업이 같은 값을 가지면 안 되기 때문이다. 원본과 포크처럼 저장소가 다르면 같은 변경도 각각 Catch가 된다. 저장소 간 중복 판별은 10월 MVP 범위가 아니다(2026-09-30 팀장 결정).
6. **값은 `wi1:` 뒤에 SHA-256 해시를 붙인 68자 문자열이다.** 해시 입력은 규칙 판본(판별 규칙을 바꿀 때 올리는 번호, 지금 wi1)·방식·저장소·작업 단위·나눈 부분(한 단위를 둘 이상으로 나눴을 때 이 후보에 속한 커밋·파일)이다. B는 문자열이 같은지만 비교한다.
7. **어느 PR에 속하는지 확인하지 못한 변경은 후보로 내보내지 않고 보류한다(2026-09-29 팀장 결정).** 틀린 내용을 Catch에 넣지 않는 쪽을 택했고, 대신 보류한 작업은 회원에게 보이지 않는다. 보류의 기록은 두 경우로 나뉜다(「결정」).
   - 허용된 수집 범위와 수집 상한(호출 수·시간·총량) 안에서 필요한 조회를 마쳤는데도 정해지지 않으면 notProvided(내보내지 않은 후보를 사유별로 세는 칸)의 기존 사유 값 UNDETERMINED로 센다. 실패는 기록하지 않는다.
   - 수집 상한이나 조회 오류로 확인을 마치지 못했으면, 보류와 별개로 수집 실패를 기록한다. 그래서 결과는 적합 후보가 있으면 PARTIAL_FAILED, 없으면 FAILED가 된다(BR3.3·#116 문서 2.4의 기존 규칙). 이 보류는 notProvided에 세지 않는다(2026-09-30 팀장 결정). 두 경우의 보류 건수는 운영 로그에서 나눠 본다.
8. **같은 결과의 재전달과 같은 작업의 중복 등록은 다른 문제다.** 재전달은 E가 resultId와 결과 내용이 같은지(messageId만 뺀 결과 전체의 해시)로 알아본다. 중복 등록은 B가 (회원, workIdentity)로 막는다.
9. **10월에 이 값이 하는 일은 두 가지다.** ① 한 결과 안에서 후보마다 다른 값을 내, 서로 다른 작업이 한 Catch로 합쳐지지 않게 한다. ② 같은 회원의 다른 저장소 작업이 번호가 같다는 이유로 기존 Catch에 붙지 않게 한다. 같은 작업이라도 다음 분석에서 커밋 SHA가 바뀌거나(rebase) F가 커밋을 묶는 범위가 달라지면 v1은 다른 값을 내 새 Catch를 만든다. 10월 계약은 Catch를 만든 저장소를 다시 분석하지 않으므로 이 일이 생기지 않는다(「판정 규칙」). 재분석을 도입하기 전에 처리를 정하고, 그때까지 v1을 재분석에 쓰지 않는다.

## 이미 정해진 것과 이번 제안

| 구분 | 내용 | 출처 |
|---|---|---|
| 정해짐 | 제목·표현만 바꾼 같은 작업은 새 Catch로 만들지 않는다 | [명세 L86][c86] · [명세 L92][c92] · [ERD L119][e119] · [Q7][q7] |
| 정해짐 | 근거가 일부 겹쳐도 서로 다른 작업임을 확인할 수 있으면 각각 Catch가 될 수 있다 | [명세 L92][c92] · [Q7][q7] |
| 정해짐 | 구별 가능성을 입증하지 못한 후보를 임의로 서로 다른 작업이라고 처리하지 않는다 | [Q7 기술 설계][q7d] |
| 정해짐 | 커밋마다 Catch를 만드는 규칙이 아니다. 단일 커밋 작업도 제외하지 않는다 | [명세 L92][c92] · [Q6][q6] |
| 정해짐 | 후보 근거는 안정된 판본 값(sourceRevision)에 연결돼야 한다. 확인되지 않으면 근거 부족으로 내보내지 않는다 | [명세 L165][c165] · [worker 규칙 BR3.2][br32] |
| 정해짐 | 유일성은 (ownerId, workIdentity)다. 같은 회원의 검증한 동일 작업만 기존 Catch를 참조하며, 이때 기존 Catch의 본문·출처·공개 상태를 바꾸지 않는다 | [ERD L119][e119] · [ERD L205][e205] |
| 정해짐 | workIdentity는 "의미/범위 버전을 포함해" 중복을 검사한다 | [ERD L105][e105] |
| 정해짐 | 같은 resultId·같은 의미의 재전달은 같은 수신 확인이다. 같은 ID에 다른 내용이 오면 거부한다 | [명세 L86][c86] |
| 정해짐 | 새 커밋·재분석에 따른 기존 Catch의 병합·교체·보완 정책은 보류한다 | [OQ-B2][c185] · [Q7 계속 보류][q7h] |
| 정해짐 | 수집·생성 오류는 notProvided가 아니라 failures에 담는다. outcome은 후보 수와 실패 수로 정하며, 실패가 1건 이상이면 EMPTY가 아니다 | [worker 규칙 BR3.2][br32] · [BR3.3][br33] |
| 결정 | 어느 PR에 속하는지 확인하지 못한 변경은 보류한다 | 2026-09-29 팀장 결정(「결정」) |
| 결정 | SHA가 다른 두 변경은 같은 작업에서 비롯됐다는 관계가 확인되고 공백을 무시한 diff가 같을 때만 같은 변경으로 본다. 관계 근거가 없으면 합치지 않는다 | 2026-09-30 팀장 결정(「결정」) |
| 결정 | 호출·시간 상한으로 확인을 멈춰 보류한 변경은 notProvided의 UNDETERMINED에 세지 않고 수집 실패로 기록한다. UNDETERMINED는 필요한 조회를 마쳤지만 소속을 판단할 수 없을 때만 쓴다. 두 경우의 보류 건수는 운영 로그에서 나눠 본다 | 2026-09-30 팀장 결정(「결정」) |
| 결정 | 10월 MVP는 저장소별로 작업 동일성을 판정한다. 원본·포크 등 저장소가 다르면 같은 변경도 각각 Catch를 허용하고, 저장소 간 중복 판별은 하지 않는다 | 2026-09-30 팀장 결정(「결정」) |
| #116 따름 | 수집 상한이나 조회 오류로 수집이 멈추면 실패를 기록한다. 적합 후보가 있으면 PARTIAL_FAILED, 없으면 FAILED다. EMPTY는 수집을 정상으로 마쳤는데 내보낼 후보가 없을 때만이다(근거 부족·기준 미달, 또는 조회를 마친 뒤 단위 미확정으로 모두 내보내지 않은 경우) | [#116 문서 2.4][d116-24](2026-09-30 병합, [PR #166][p166]) |
| 이번 제안 | 작업의 정의, 판정 범위, 입력, 규칙, 값 만드는 법, 식별자 충돌·규칙 판본·판정 불가 처리 | 이 문서 |
| 후속(일부 구현) | 같은 값인데 기존 Catch의 원 요청 저장소·방식이 새 요청과 다르면 반영을 거부한다(B4·E4). B 검사·거부·회귀 검사는 PR #143에 구현됐고, E 실패 기록·복구와 실제 연결 검증은 남아 있다 | [#105][i105] · [구현 커밋][b180impl] |
| 결정 | 이 문서를 [#118][i118]의 구현 기준으로 채택한다(E는 `8155e6d`의 처리 기준 승인, B는 `eab0989` 수용·정정 요청 반영) | 2026-09-30 팀장 결정(「결정」) |

## 식별자가 가리키는 것

| 식별자 | 가리키는 것 | 같은 값이 다시 오면 | 막는 곳 |
|---|---|---|---|
| requestId | 회원의 분석 요청 하나. 실패 뒤 재요청은 새 요청이다 | — | E |
| attemptId | 그 요청을 처리한 시도 하나. 10월은 요청당 하나다 | 끝난 시도의 늦은 결과는 반영하지 않는다. 시도당 결과는 하나라서, 이미 결과를 받은 시도에 다른 resultId가 오면 거부한다 | E |
| resultId | 한 시도에서 F가 만든 결과 하나(후보 목록 전체) | 내용이 같으면 재전달로 보고, 다르면 거부한다 | E |
| candidateId | 결과 안의 후보 하나 | 같은 결과의 반영을 다시 실행하면 저장된 등록을 그대로 돌려준다 | B의 후보 등록 기록 |
| workIdentity | 후보가 가리키는 실제 작업 하나. 요청·시도·결과가 달라도 같은 작업이면 같다 | 같은 회원에게 이미 있으면 기존 Catch를 참조한다 | B의 (ownerId, workIdentity) 유일성 |

**같은 결과의 재전달**은 전달이 반복된 것이다. 결과 자체는 같다. E는 resultId와 내용 지문(messageId만 뺀 결과 전체의 SHA-256)으로 이를 알아보고 중복 수신으로 답한다([E 지문][x-efp], [중복 판정][x-edup]). 응답 유실이나 반영 복구로 반영을 다시 실행하면 B는 후보 등록 기록으로 같은 catchId를 돌려준다([기능 설계 L76][f76]). 이때 B는 동일성을 새로 판정하지 않는다. 다만 받은 후보의 workIdentity가 저장된 Catch의 값과 같은지 확인하고, 다르면 거부한다([B 재반영 대조][x-breapply]).

**같은 작업의 중복 등록**은 서로 다른 후보가 같은 작업을 가리키는 것이다. resultId·candidateId가 달라도 생긴다. B는 (회원, workIdentity)로 이를 알아본다.

E의 지문과 B의 재반영 대조가 모두 같은 값을 요구한다. 그래서 F는 값을 결과를 만들 때 한 번만 계산해 결과와 함께 보관하고, 재전달·반영 복구 때 다시 계산하지 않는다.

## 무엇을 하나의 작업으로 보는가

[작업 단위와 판정 입력](CatchU_work_identity_unit.md#무엇을-하나의-작업으로-보는가)에 있다.

## PR 소속과 같은 변경을 확인하는 근거

[작업 단위와 판정 입력](CatchU_work_identity_unit.md#pr-소속과-같은-변경을-확인하는-근거)에 있다.

## 판정 범위

[작업 단위와 판정 입력](CatchU_work_identity_unit.md#판정-범위)에 있다.

## 판정 입력

[작업 단위와 판정 입력](CatchU_work_identity_unit.md#판정-입력)에 있다.

## 판정 규칙

[판정 규칙과 값 만드는 법](CatchU_work_identity_rules.md#판정-규칙)에 있다.

## workIdentity 만드는 법

[판정 규칙과 값 만드는 법](CatchU_work_identity_rules.md#workidentity-만드는-법)에 있다.

## 식별자 충돌

[판정 규칙과 값 만드는 법](CatchU_work_identity_rules.md#식별자-충돌)에 있다.

## 규칙 판본 취급

[판정 규칙과 값 만드는 법](CatchU_work_identity_rules.md#규칙-판본-취급)에 있다.

## 기존 Catch 참조와 새 후보 등록

[판정 규칙과 값 만드는 법](CatchU_work_identity_rules.md#기존-catch-참조와-새-후보-등록)에 있다.

## 합성 사례와 기대 판정

[합성 사례·시험·한계](CatchU_work_identity_cases.md#합성-사례와-기대-판정)에 있다.

## #118이 지킬 것과 시험할 것

[합성 사례·시험·한계](CatchU_work_identity_cases.md#118이-지킬-것과-시험할-것)에 있다.

## 한계와 실제 구현에서 검증할 것

[합성 사례·시험·한계](CatchU_work_identity_cases.md#한계와-실제-구현에서-검증할-것)에 있다.

## 결정

[결정과 검토 기록](CatchU_work_identity_records.md#결정)에 있다.

## 검토 쟁점과 답

[결정과 검토 기록](CatchU_work_identity_records.md#검토-쟁점과-답)에 있다.

## 검토 기록

[결정과 검토 기록](CatchU_work_identity_records.md#검토-기록)에 있다.

<!-- 이슈·PR -->
[i105]: https://github.com/JminAILab/CatchU/issues/105
[i111]: https://github.com/JminAILab/CatchU/issues/111
[i118]: https://github.com/JminAILab/CatchU/issues/118
[p143]: https://github.com/JminAILab/CatchU/pull/143
[p166]: https://github.com/JminAILab/CatchU/pull/166
[d116-24]: https://github.com/JminAILab/CatchU/blob/6acd4a578e21547baff5028ddbd74c2ef7372e13/docs/CatchU_수집통제_임시자료.md#24-상한을-넘거나-실패했을-때
[br33]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md#L25-L32
<!-- API 명세 v1 (contract-summary.md @a7dcc87) -->
[c86]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L86
[c92]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L92
[c165]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L165
[c185]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L185
[br32]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md#L17-L24
<!-- ERD·기능 설계 (u2-api @a7dcc87) -->
[e105]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L105
[e119]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L119
[e205]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L205
[f76]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L76
<!-- 결정 기록 -->
[q6]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L162
[q7]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L184
[q7d]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L202
[q7h]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L217
<!-- 코드·합성 자료 -->
[x-efp]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/api/src/analysis-receiver/analysis-receiver.service.ts#L23-L27
[x-edup]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/api/src/analysis-receiver/analysis-receiver.service.ts#L63-L69
[x-breapply]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-service.ts#L116-L133
[e180r]: https://github.com/JminAILab/CatchU/pull/180#pullrequestreview-5361578826
[b180r]: https://github.com/JminAILab/CatchU/pull/180#pullrequestreview-5362542152
[b180impl]: https://github.com/JminAILab/CatchU/commit/a5ac5dd491b5977d44efcbc7dcb2c78aeafdace8
