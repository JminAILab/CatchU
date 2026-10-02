# CatchU 작업 동일성 판별 기준 — 판정 규칙과 값 만드는 법

> [작업 동일성 판별 기준](CatchU_작업동일성_판별기준.md)의 절을 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 그대로 옮긴 파일이다. 지위와 적용 범위는 그 문서와 같고, 다른 절은 그 문서에서 찾는다. AI가 한 번에 읽을 수 있게 36 KB 미만으로 유지한다.

## 판정 규칙

F는 먼저 「무엇을 하나의 작업으로 보는가」의 조건대로 한 결과의 후보를 묶는다(같은 변경은 한 후보에만, 근거가 있을 때만 나누기). 그다음 후보마다 값을 만든다.

- **동일 작업**: 방식·저장소·작업 단위·나눈 부분이 모두 같다. 회원이 같은지는 B가 본다.
- **다른 작업**: 넷 중 하나가 다르고, 그 차이가 근거로 보인다. 저자가 따로 연 단위이거나, 근거로 구별돼 나눈 부분인 경우다. 근거(이슈·파일·리뷰·판본 값)가 겹쳐도 작업 단위나 나눈 부분이 다르면 다른 작업이다.
- **판정 불가**: 같은지 다른지 보일 수 없거나 확인을 마치지 못한 경우다. 아래 다섯 가지로 나눠 처리한다.

| 판정 불가 상황 | 처리 |
|---|---|
| **구별 불가**: 한 결과 안에서 한 단위의 두 변경이 서로 다른 작업인지 근거로 보일 수 없다 | 나누지 않고 한 후보로 내보낸다. 묶음의 한계는 groupingLimitations에 적는다([Q7 기술 설계][q7d]). notProvided에 세지 않는다 |
| **단위 미확정**: 근거·작업 사실·본인 기여는 확인됐다. 허용된 범위와 상한 안에서 필요한 조회도 마쳤다. 그런데 근거끼리 답이 어긋나 변경이 어느 단위에 속하는지 정할 수 없다(「PR 소속과 같은 변경을 확인하는 근거」). PR 조회가 허용되지 않은 요청은 여기에 들지 않는다(「무엇을 하나의 작업으로 보는가」) | 보류한다: 후보로 내보내지 않고 notProvided에 UNDETERMINED로 센다(「결정」). 수집은 정상으로 끝났으므로 실패는 기록하지 않는다 |
| **확인 중단**: 수집 상한(호출 수·수집 시간·총 처리 시간·수집 총량)에 걸렸거나 조회가 오류(429·5xx 등)로 끝나 소속 확인을 마치지 못했다 | 보류한다: 확인하지 못한 변경은 후보로 내보내지 않는다(「결정」). 이와 별개로 수집 실패를 failures에 기록한다(`stage: COLLECTION`, 코드는 [#116 문서 2.4][d116-24]의 제안 이름: `BUDGET_EXCEEDED`·`TIME_LIMIT_EXCEEDED`·`RATE_LIMITED` 등). 다시 부르지 않는다. 판단한 것이 아니므로 notProvided에는 세지 않는다. 결과는 적합 후보가 있으면 PARTIAL_FAILED, 없으면 FAILED다 |
| **같은 변경 미확정**: SHA가 다른 두 변경에 관계 근거(재제출·cherry-pick 표시)는 있는데, 공백을 무시한 diff가 다르거나 변경 내용이 없어 비교할 수 없다(C26). 관계 근거가 없으면 diff가 같아도 여기에 들지 않고 다른 변경이다(C21·C22·C24·C30) | 합치지 않고 두 후보를 모두 낸다. 같은 작업일 수 있다는 점은 두 후보의 groupingLimitations에 적는다. 후보를 빼지 않는다 |
| **결과 사이 변화**: 다른 결과에서 같은 작업의 단위나 부분이 바뀌었다. rebase, 묶음 경계 변화, 나누기 결정 변화가 예다 | v1은 다른 값을 낸다. 이는 [Q7 기술 설계][q7d]와 [MVP 입력 L189][m189]에 맞지 않는다. 그래서 재분석을 도입하기 전에 처리를 정하고, v1을 그대로 쓰지 않는다. 10월에는 이 경로가 없다(아래) |

근거의 판본을 확정할 수 없는 후보(짧은 SHA만 있고 원본에서 확정하지 못함 등)는 판정 이전의 문제다. 근거 요건([명세 L165][c165])을 채우지 못했으므로 기존 규칙대로 INSUFFICIENT_EVIDENCE(근거 부족)로 센다. UNDETERMINED는 근거 요건을 채우고 필요한 조회도 마친 뒤 단위만 정할 수 없을 때 쓴다.

**"끝까지 확인"의 뜻.** 요청의 허용 자료 종류와 [#116 문서 2.3][d116-23]의 수집 범위, 그리고 수집 상한 안에서 필요한 조회를 시도한다는 뜻이다. 상한을 넘는 추가 호출이나 자동 재시도는 하지 않는다. 이 문서에서 **수집 상한**은 #116의 호출 수·수집 시간·총 처리 시간·수집 총량 상한을 함께 가리킨다. 수집 상한에 걸려 멈추거나 조회가 오류로 끝났으면 수집 실패다. 반면 #116의 조회 개수 범위(최근 커밋·PR 개수) 밖이라 보지 못한 자료와, 단일 응답 크기 상한을 넘어 그 항목만 버린 자료는 수집 실패가 아니다. 근거의 한계(coverageLimits)로 남긴다. 이 구분은 [#116 문서 2.3·2.4][d116-24]를 따른다.

**10월의 결과 사이 경로.** 10월 계약에서는 같은 회원·저장소에서 Catch를 만든 결과 뒤에 또 결과가 오지 않는다. 실패 뒤 재요청은 앞 요청이 Catch를 하나도 만들지 않았을 때만 허용된다([명세 L74][c74]). 정상 완료(EMPTY 포함)나 유효 결과가 있는 부분 실패 뒤의 재분석은 거부된다([명세 L75][c75]). 그래서 다른 결과의 후보가 같은 저장소의 기존 Catch를 참조하는 경로가 없다.

제목·설명의 글자 유사도로 판정을 대신하지 않는다. 표현이 비슷한 다른 작업은 합쳐지고, 표현이 다른 같은 작업은 나뉘기 때문이다.

## workIdentity 만드는 법

```text
work_identity(방식, 저장소, 작업 단위, 나눈 부분):
  단위 =
    PR        → {"type": "PULL_REQUEST", "number": PR 번호}
    병합       → {"type": "MERGE", "commit": 병합 커밋 SHA}
    커밋 묶음   → {"type": "COMMITS", "commits": 정렬한 SHA 목록}
    이슈       → {"type": "ISSUE", "number": 이슈 번호}
    정할 수 없음 → 값을 만들지 않는다(단위 미확정: 후보를 내보내지 않음)
  부분 = 나눴으면 정렬한 [{"commit": SHA} 또는 {"commit": SHA, "path": 경로}], 아니면 []
  글 = 정규 JSON({"version": "wi1", "sourceMode": 방식, "repositoryId": 저장소,
                  "unit": 단위, "part": 부분})
  반환 "wi1:" + SHA-256(글의 UTF-8 바이트)의 소문자 16진수   # 68자
```

- **정규 JSON**: 키를 이름순으로 정렬하고 공백 없이 쓴다(`,` `:`). UTF-8로 쓰고 한글 등을 이스케이프하지 않으며, 숫자는 정수로 쓴다. Python으로는 `json.dumps(값, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`다.
- **정규화**
  - 저장소 값은 요청 값을 그대로 쓴다. 불투명한 문자열이라 대소문자나 공백을 바꾸지 않는다.
  - PR·이슈 번호는 GitHub가 준 1 이상의 정수를 쓴다.
  - SHA는 전체 길이 16진수를 소문자로 쓴다. 보통 40자이고, SHA-256 저장소면 64자다.
  - 파일 경로는 그 커밋에서 GitHub가 준 저장소 기준 경로를 그대로 쓴다. 대소문자를 구분하고 유니코드 정규화를 하지 않는다.
  - 커밋 목록은 중복을 없애고 정렬한다. 커밋이 하나도 없는 커밋 묶음은 만들지 않는다. 그런 입력은 F의 결함이므로 값을 만들지 않고, 단위 미확정(UNDETERMINED)으로도 세지 않는다.
- **부분의 정규화**
  - 단위 전체가 한 후보면 부분을 비운다. 모든 커밋을 부분으로 나열하지 않는다.
  - 한 커밋은 한 가지로만 적는다. 커밋 전체가 이 후보에 속하면 `{"commit"}`만 쓰고, 그 커밋의 모든 경로가 이 후보에 속해도 `{"commit"}`으로 줄인다. 경로로 나눈 커밋만 `{"commit", "path"}`로 적는다.
  - 항목은 (커밋 SHA, 경로) 순으로 정렬하고, 경로가 없는 항목을 앞에 둔다. 문자열은 유니코드 코드 포인트 순으로 비교한다(Python 기본 비교).
- **해시를 쓰는 이유**
  - 커밋 묶음과 부분은 길이 제한이 없다. B의 유일성 색인에 넣을 값은 짧고 길이가 일정해야 한다.
  - 저장소 값은 불투명 문자열이라 `:` 같은 구분자가 들어갈 수 있다. 문자열을 이어 붙이면 서로 다른 입력이 같은 문자열이 될 수 있다. 그래서 정규 JSON으로 경계를 분명히 한 뒤 해시한다.
  - B는 값을 해석하지 않고 같은지만 본다. PR #143 코드 그대로다([B 묶기][x-bbatch]).
- **SHA-256을 고른 이유**
  - Python과 Node 표준 라이브러리에 있다.
  - E가 결과 지문에 이미 같은 함수를 쓴다.
  - 서로 다른 입력이 같은 값이 될 가능성은 실무에서 무시할 수 있다.
  - 비밀을 숨기려는 용도가 아니다. 입력(저장소 값·PR 번호)은 비밀이 아니고, 값은 회원·수신자 응답에 나가지 않는다.

## 식별자 충돌

| 충돌 | 처리 |
|---|---|
| 저장소가 다른데 PR 번호가 같다 | 저장소를 값에 넣어 구분한다 |
| 합성 결과와 실제 결과의 저장소 값·번호가 같다 | 방식을 값에 넣어 구분한다 |
| 이슈와 PR 번호가 같다 | 이슈와 PR은 한 저장소에서 번호를 함께 쓴다. 이 저장소의 이슈 API로 #143을 조회하면 PR이 나온다. 그래서 번호가 같으면 같은 대상이다. 이슈 API가 준 항목이 PR이면(`pull_request`가 있으면) PR 단위로 적고 이슈 단위로 적지 않는다 |
| 같은 SHA를 병합 단위와 커밋 묶음으로 봤다 | 한 결과 안에서는 같은 변경이 한 후보에만 속하므로 생기지 않아야 한다. 단위 종류가 값에 들어가 구분된다 |
| 서로 다른 작업의 근거 판본 값(sourceRevision)이 같다 | 판본 값을 입력으로 쓰지 않는다 |
| SHA가 다른 두 변경의 공백을 무시한 해시가 같다(문자열 안의 공백·들여쓰기만 다름) | 관계 근거가 없으면 합치지 않는다. 다른 변경이다(C21·C22·C30). 관계 근거가 있으면 같은 변경으로 본다. 이때 실행 결과가 달라지는 공백 차이도 구분하지 못한다(C25, 한계 L11). 2026-09-30 팀장 결정으로 감수한다 |
| 짧은 SHA가 여러 커밋에 들어맞는다 | 짧은 SHA를 쓰지 않는다. 원본에서 확정할 수 없으면 근거 부족이다 |
| 규칙 판본이 다르다 | 접두사와 해시 입력의 판본이 달라 값이 같을 수 없다 |
| 한 결과 안에서 두 후보의 값이 같다 | 이 제안에서는 F가 지킬 조건의 위반이다. 계약과 B는 이 경우를 받아들여 한 Catch로 모은다([기능 설계 L74][f74], [B 시험][x-bsame]). 두 번째 후보의 내용은 저장되지 않으므로 F가 내보내기 전에 한 후보로 합친다. B 동작은 바꾸지 않는다 |
| SHA-256 해시 충돌 | 무시할 수 있는 확률이다. 같은 값인데 기존 Catch의 원 요청 저장소·방식이 새 요청과 다르면 반영을 거부하는 후속 보완에 B·E가 동의했다(B4·E4). B의 검사·거부는 [PR #143 구현][b180impl]에 있고, E 실패 기록·복구와 실제 연결 검증은 [#105][i105]에 남아 있다 |
| 합성 값(`synthetic-work-…`)과 실제 값(`wi1:…`) | 접두사가 달라 겹치지 않는다 |

## 규칙 판본 취급

- 규칙 판본은 값 앞의 `wi1:`로 보이고, 해시 입력에도 들어간다.
- **판본을 올리는 변경**: 작업 단위·부분·배정의 정의, 입력 목록, 정규화, 직렬화, 해시 함수가 바뀔 때다. 제목·초안 생성, 근거 선택, 코드 정리는 판본을 올리지 않는다.
- B는 문자열 전체를 비교한다. 그래서 판본이 다른 값끼리는 같은 작업으로 판정되지 않고, 잘못 합쳐지지 않는다. 대신 판본을 바꾸면 같은 작업도 새 Catch가 될 수 있다. 10월에는 wi1만 쓰므로 판본이 섞이지 않는다. 판본을 바꾸거나 재분석을 도입할 때 기존 값과 잇는 방법(옮기기·대응표)을 함께 정한다.
- [ERD L105][e105]의 "의미/범위 버전을 포함해 중복 검사"는 **이 규칙 판본**으로 해석했다. 작업의 뜻과 판정 범위를 정하는 규칙의 판본이라는 뜻이다. 동의 범위 판본(scopeRevision)을 뜻한다면 「판정 범위」의 이유로 문제가 생긴다(「검토 쟁점과 답」 계약1).
- 한 번 만든 값은 결과와 함께 보관하고, 재전달·반영 복구 때 다시 계산하지 않는다. 판본이 바뀐 뒤 옛 결과를 재전달해도 옛 값을 그대로 보낸다.

## 기존 Catch 참조와 새 후보 등록

- **이 문서는 B·E 코드와 계약 필드를 바꾸지 않는다.** B는 (ownerId, workIdentity) 유일성과 문자열 같음 비교를 그대로 쓴다([조회][x-blookup]). workIdentity의 형식을 검사하지 않는다. 합성 값과 실제 값이 함께 쓰이기 때문이다(B3).
- **저장소·방식이 다른 기존 Catch에 같은 값이 오면 반영을 거부한다(B4·E4).** 초기 인용 판본 `e2acdfe`는 새 입력과 현재 시도의 방식만 대조했다([입력 대조][x-bmode]). 이후 [PR #143의 `a5ac5dd`][b180impl]에 기존 Catch와 새 요청의 저장소·방식 검사·거부 및 회귀 검사가 추가됐다. 2026-09-30 확인 시 B 구현은 PR에 반영됐고 아직 병합 전이며, E의 실패 기록·복구와 실제 연결 검증은 [#105][i105]에 남아 있다. B·E가 합의한 처리 경계는 다음과 같다.
  - 같은 트랜잭션에서 기존 Catch의 원 요청 저장소·sourceMode를 새 요청과 대조한다. 다르면 정상 기존 참조나 후보 0건으로 처리하지 않고 그 결과의 반영을 거부한다.
  - 거부하면 이번 반영의 신규 Catch·근거·후보 연결과 E 반영 완료 기록을 함께 되돌리고, 기존 Catch와 수신 결과는 보존한다. E의 반영 실패 기록은 되돌린 뒤 따로 처리한다.
  - B가 추가한 불일치 거부·전체 되돌림 회귀 검사와, 아직 남은 E 실패 기록·복구·실제 연결 검증을 구분한다. 내부 오류 형식의 연결과 실제 재반영 경로는 [#105][i105]에서 B `leechaeah`·E `yeongyeon1802`가 맞춘다.
- **기존 Catch를 참조할 때는 본문·근거·출처·확인·불일치·공개 상태를 바꾸지 않고, 새 후보의 내용도 더하지 않는다.** 기존 규칙을 유지한다([ERD L205][e205], [B 시험][x-bkeep], B2). 그래서 잘못 합치면 뒤 작업의 내용이 어디에도 저장되지 않는다. F가 한 결과 안의 값을 후보마다 다르게 내고, 저장소를 값에 넣어야 하는 이유다.
- **처리 결과(outcome).** outcome은 F가 적는다. E는 그 값이 후보 수·실패 수와 맞는지 검사하고, 맞지 않으면 결과 전체를 거부한다([E 대조][x-eoutcome]). 보류한 변경은 어느 경우든 후보 수에 들어가지 않는다. 실패가 기록되는지는 아래 표처럼 경우마다 다르다.

| 상황 | 보류한 변경 | failures | 결과(적합 후보 있음 / 없음) |
|---|---|---|---|
| 단위 미확정(조회 완료) | 내보내지 않고 UNDETERMINED로 셈 | 없음 | SUCCEEDED / EMPTY |
| 확인 중단(수집 상한, 조회 오류) | 내보내지 않음. notProvided에 세지 않음 | 수집 실패 1건 이상 | PARTIAL_FAILED / FAILED |

- 이 구분은 [#116 문서 2.4][d116-24]의 표와 같다. 멈춘 것을 정상 0건(EMPTY)으로 바꾸지 않는다([BR3.3][br33]).
- EMPTY는 정상 완료다. 10월에는 그 저장소를 다시 요청할 수 없다([명세 L74][c74], [L75][c75]). PARTIAL_FAILED도 유효 결과가 있어 재분석할 수 없다. FAILED는 계약의 재요청 조건(등록 Catch 0건 등)을 따진다.
- 상한에 걸리면 보류한 변경이 없어도 수집 실패를 기록한다. 보류 여부와 실패 기록은 따로 정해진다.
- 실패 기록과 PARTIAL_FAILED·FAILED 구분은 이 문서가 새로 정하는 재분석 정책이 아니다. 기존 규칙([BR3.2][br32]·[BR3.3][br33], [#116 문서 2.4][d116-24], [명세 L74][c74]·[L75][c75])을 확인 중단에 적용한 것이다.
- **#103·#113 합성 자료에는 이 함수를 쓰지 않는다.** [#103 합성 결과 세트][x103]와 [#113][i113] 가짜 생성기는 주어진 합성 값을 그대로 쓴다. 이 함수로 다시 계산하면 여러 사례가 같은 합성 PR(`pull/1`)을 가리켜 하나로 합쳐진다.
  - 합성 값에는 저장소가 들어 있지 않다. 개발 환경에서 같은 회원이 같은 합성 사례를 두 저장소 요청에 주입하면, 초기 판본(`e2acdfe`)에서는 두 번째 저장소의 후보가 첫 저장소의 합성 Catch를 참조했다. 최신 PR #143에서는 저장소가 달라 `CONTEXT_MISMATCH`로 그 결과의 반영 전체가 거부된다. 합성 자료는 바꾸지 않으므로 개발 시험에서 이 조합을 피한다.
  - [`two-candidates-same-work`][x2c]는 B가 같은 값의 두 후보를 한 Catch로 모으는지 시험하는 사례로 계속 쓴다.
  - 이 문서 기준으로 보면, 그 두 번째 후보는 PR과의 연결을 확인하지 않은 커밋이다. PR에 속하면 F가 처음부터 한 후보로 묶고, 속하지 않음이 확인되면 다른 작업이다. 확인할 수 없으면 단위 미확정이라 따로 후보로 내지 않는다.
  - 이 차이 때문에 세트를 고치지 않는다. 세트의 값은 판별 알고리즘의 정답이 아니다.

<!-- 이슈·PR -->
[i105]: https://github.com/JminAILab/CatchU/issues/105
[i113]: https://github.com/JminAILab/CatchU/issues/113
[d116-23]: https://github.com/JminAILab/CatchU/blob/6acd4a578e21547baff5028ddbd74c2ef7372e13/docs/CatchU_수집통제_임시자료.md#23-자원시간-상한
[d116-24]: https://github.com/JminAILab/CatchU/blob/6acd4a578e21547baff5028ddbd74c2ef7372e13/docs/CatchU_수집통제_임시자료.md#24-상한을-넘거나-실패했을-때
[br33]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md#L25-L32
<!-- API 명세 v1 (contract-summary.md @a7dcc87) -->
[c74]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L74
[c75]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L75
[c165]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L165
[br32]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md#L17-L24
<!-- ERD·기능 설계 (u2-api @a7dcc87) -->
[e105]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L105
[e205]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L205
[f74]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L74
<!-- 결정 기록 -->
[q7d]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L202
[m189]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/ai-dlc-input-mvp/CatchU_mvp_input.md#L189
<!-- 코드·합성 자료 -->
[x-eoutcome]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/api/src/analysis-receiver/analysis-receiver.service.ts#L29-L53
[x-blookup]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-service.ts#L135-L140
[x-bmode]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-service.ts#L104-L110
[x-bsame]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/test/catches/registration-postgres.test.cjs#L171-L177
[x-bkeep]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/test/catches/registration-postgres.test.cjs#L230-L248
[x-bbatch]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-batch.ts#L94-L97
[x103]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/worker/fixtures/m1-synthetic/README.md#id-채우기
[x2c]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/worker/fixtures/m1-synthetic/results/two-candidates-same-work.json
[b180impl]: https://github.com/JminAILab/CatchU/commit/a5ac5dd491b5977d44efcbc7dcb2c78aeafdace8
