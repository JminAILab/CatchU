# CatchU 작업 동일성 판별 기준 (제안)

> **지위: 제안** (2026-09-29) · F(팀원 1)가 [#111][i111]에서 작성했다. B(`leechaeah`)·E(`yeongyeon1802`) 검토 전이며 채택된 기준이 아니다. 실제 판별 코드는 채택 뒤 [#118][i118]에서 만든다. [API 명세 v1][c92]·[ERD][e119]와 어긋나면 계약이 이긴다. 이 제안은 필드·권한·상태 의미·DB 관계와 유일성을 바꾸지 않는다. B 등록 코드 인용은 병합 전 [PR #143][p143]의 `e2acdfe` 기준이다.

같은 작업이 Catch로 두 번 만들어지거나, 서로 다른 작업이 한 Catch로 합쳐지지 않도록 **workIdentity**(후보가 어떤 실제 작업인지 나타내는 값)를 만드는 방법과 판정 규칙을 정한다.

## 한눈에 보기

1. **작업**은 한 저장소에서 회원이 기여한 변경의 묶음이다. 기본 단위는 저자가 묶은 것(PR 하나, 또는 PR 없이 병합한 브랜치 하나)이고, 어디에도 속하지 않은 커밋은 F가 묶는다.
2. **같은 작업인지는 그 작업을 이루는 GitHub 기록(PR 번호, 병합 커밋, 커밋과 그 diff)으로만 본다.** 제목·설명·초안·근거 문장은 보지 않는다. SHA가 달라도 diff가 같은 변경(rebase, 다시 연 PR)은 같은 변경으로 본다. 그래서 표현만 바뀌면 같은 값이 나오고, 근거가 일부 겹쳐도 작업 단위가 다르면 다른 값이 나온다.
3. **한 결과(한 번의 분석이 낸 후보 목록) 안에서 같은 변경은 한 후보에만 속한다.** 여러 PR에 같은 변경이 들어 있으면(통합·반영용 PR, 다시 연 PR) 한 곳에만 배정한다.
4. **한 단위 안에 서로 다른 작업이 있다는 근거가 있을 때만 단위를 나눈다.** 근거가 없으면 나누지 않고 한 후보로 둔다(도메인 설계 [Q7][q7] 결정).
5. **판정 범위는 한 회원·한 저장소·한 방식(합성 MOCK 또는 실제 LIVE) 안이다.** 회원은 B가 이미 (회원, workIdentity) 조합을 하나만 허용해 구분한다. 저장소와 방식은 workIdentity 값 안에 넣는다. B가 기존 Catch를 참조할 때 저장소와 방식을 대조하지 않기 때문이다.
6. **값은 `wi1:` 뒤에 SHA-256 해시를 붙인 68자 문자열이다.** 해시 입력은 규칙 판본(판별 규칙을 바꿀 때 올리는 번호, 지금 wi1)·방식·저장소·작업 단위·나눈 부분(한 단위를 둘 이상으로 나눴을 때 이 후보에 속한 커밋·파일)이다. B는 문자열이 같은지만 비교한다.
7. **어느 단위에 속하는지 정할 수 없는 후보는 내보내지 않는 안을 제안한다.** notProvided(내보내지 않은 후보를 사유별로 세는 칸)의 기존 사유 값 UNDETERMINED로 센다. 모두 이렇게 되면 결과가 EMPTY(후보 없는 정상 완료)로 끝나 10월에는 다시 요청할 수 없으므로 팀장 확인이 필요하다.
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
| 이번 제안 | 작업의 정의, 판정 범위, 입력, 규칙, 값 만드는 법, 식별자 충돌·규칙 판본·판정 불가 처리 | 이 문서 |
| 미결 | 계약 문구 해석 4건, 팀장 확인 1건, B/E 검토 | 「남은 쟁점」 |

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

**작업은 한 저장소에서 회원이 기여한 변경의 묶음이다.** 근거로 작업 사실과 본인 기여를 확인할 수 있어야 한다. 묶는 출발점은 저자가 이미 묶어 둔 단위다. [레포 컨벤션 §0][conv]과 [카드생성논리 방법 A][cardA]가 이 단위를 가장 믿을 만한 작업 경계로 보았다. 그 밖의 커밋은 F가 규칙으로 묶는다([방법 B][cardB]).

| 작업 단위 | 뜻 | 값에 쓰는 식별 |
|---|---|---|
| PR | 회원이 참여한 PR 하나. 병합 여부와 병합 방식은 따지지 않는다 | PR 번호 |
| 병합 | PR 없이 브랜치를 병합 커밋으로 합친 묶음 | 병합 커밋 SHA |
| 커밋 묶음 | PR·병합에 속하지 않은 커밋을 F가 규칙으로 묶은 것(방법 B) | 커밋 SHA 집합 |
| 이슈 | 코드 변경 없이 이슈로만 기여한 것. 계약의 허용 자료 종류에 있어 형식만 정한다. 10월 동의 문구(커밋·PR·diff)에는 없다 | 이슈 번호 |

- **한 후보는 작업 단위 하나에서 나온다.** 저자가 따로 연 PR 두 개를 F가 한 후보로 합치지 않는다.
- **한 결과 안에서 같은 변경은 한 후보에만 속한다.** 같은 변경은 같은 커밋(SHA)을 뜻한다. 한 커밋을 파일 경로로 나눈 경우에는 같은 커밋의 같은 경로를 같은 변경으로 본다. SHA가 달라도 rebase·cherry-pick처럼 내용이 같으면 같은 변경으로 본다. 내용이 같은지는 줄 번호·공백을 뺀 diff의 해시(예: `git patch-id --stable`)로 판단한다.
- **병합 커밋은 변경으로 세지 않는다.** 부모가 둘 이상인 병합 커밋은 단위의 경계를 정하는 데만 쓴다([PoC 경계 A][poc-a]도 병합 커밋을 내용에서 뺐다). PR을 합친 병합 커밋과 기준 브랜치를 받아온 병합 커밋이 모두 그렇다. 단위를 나눌 때도 병합 커밋은 어느 부분에도 넣지 않는다.
- **여러 단위에 들어 있는 변경의 배정.** 변경이 여러 단위에 들어 있으면 한 단위에만 배정한다.
  - PR에 속한 커밋과, PR을 squash·rebase로 합친 커밋은 PR에 배정한다.
  - 여러 PR에 들어 있으면 가장 먼저 병합된 PR에 배정한다. 병합된 PR이 없으면 번호가 가장 작은 PR에 배정한다. 쌓아 올린 PR(뒤 PR이 앞 PR의 커밋을 담음)에서는 공유 커밋이 먼저 병합된 앞 PR로 가고, 뒤 PR은 자기 커밋만 갖는다.
  - PR 없는 병합끼리 겹치면 그 변경을 처음 들인 가장 안쪽 병합에 배정한다([PoC 경계 A][poc-a]).
  - 기준 브랜치(기본 브랜치나 통합 브랜치)를 작업 브랜치로 받아온 병합은 작업 단위로 쓰지 않는다. 그 병합이 들여온 커밋은 원래 들어온 단위에 속하고, 어디에도 속하지 않은 직접 커밋은 커밋 묶음으로 본다. 어느 브랜치를 기준 브랜치로 볼지는 #118에서 정한다(PoC는 저장소별 목록을 썼다).
- **배정 뒤 배정받은 변경이 하나도 없는 단위는 후보를 만들지 않는다.** 이미 들여온 변경만 옮긴 통합·반영용 PR, 같은 변경으로 다시 연 PR 중 배정받지 못한 쪽이 그 예다. 배정받은 변경만으로 작업 사실과 본인 기여가 확인되는 단위만 후보가 된다. 값은 그 단위로 만들고, 다른 단위에 배정된 변경을 부분으로 적지 않는다.
- **PR 조회가 허용되지 않은 요청.** 요청의 허용 자료 종류에 PULL_REQUEST가 없으면([명세 L155][c155]) 그 결과에서는 PR 단위를 쓰지 않는다. 병합·커밋 묶음 단위로만 묶으며, 이는 단위 미확정이 아니다. 다른 결과에서 PR을 볼 수 있게 되면 값이 달라진다(한계 L2).
- **단위 나누기(Q7).** 한 단위 안에 서로 다른 작업이 있으면 나눌 수 있다. 세 조건을 모두 채워야 한다.
  - 작업 사실과 본인 기여가 따로 확인된다.
  - 부분끼리 변경이 겹치지 않는다.
  - 단위에 배정된 모든 변경(다른 단위에 배정된 변경은 빼고)이 어느 한 부분에 속한다.
  - 하나라도 못 채우면 나누지 않는다. 속할 곳을 보일 수 없는 변경을 임의로 한 부분에 붙이거나 따로 후보로 내지 않는다.
- **부분은 PR·병합 단위를 커밋으로 나누거나, 한 커밋 안을 파일 경로로 나눌 때만 쓴다.** F가 묶은 커밋 묶음은 커밋 경계로 나누지 않고 별도 커밋 묶음 단위로 만든다.
- 어떤 커밋을 어느 커밋 묶음으로 묶는지(방법 B의 기준)와 본인 기여를 어떻게 가리는지는 #118의 범위다. 이 문서는 묶은 결과에서 값을 만드는 방법과, 묶을 때 지킬 조건만 정한다.

## 판정 범위

| 범위 | 처리 | 이유 |
|---|---|---|
| 회원 | B의 (ownerId, workIdentity) 유일성이 구분한다. F는 회원 ID를 값에 넣지 않는다 | 같은 PR을 함께 작업한 두 회원은 같은 값을 갖지만 각자 Catch를 가진다. 다른 회원의 기여를 한 Catch에 붙이면 소유·공개 판단이 섞인다([ERD L121][e121]) |
| 저장소 | 요청의 repositoryId를 값에 넣는다. 저장소가 다르면 비교하지 않는다 | ① PR·이슈 번호는 저장소마다 새로 매겨진다. ② B는 기존 Catch를 참조할 때 새 요청의 저장소를 대조하지 않고, 원 요청 저장소의 보호 판단만 본다([조회][x-blookup], [시험][x-btest]). 값이 같으면 다른 저장소의 작업이 원 저장소 Catch에 붙어, 새 요청 저장소의 목록 필터와 보호 판단에서 빠진다. ③ Catch의 저장소는 원 요청에서 정해지고 회원 Catch 응답과 저장소 필터에 쓰인다([ERD L125][e125]). 원본 보호(원본 저장소 상태에 따른 공개 제한)도 회원·저장소별이다([ERD L151][e151]). 그래서 포크나 옮긴 코드처럼 같은 변경이어도 저장소마다 따로 판정하기로 제안한다. 계약이 강제하는 것은 아니다(「남은 쟁점」 계약2) |
| 방식 | sourceMode(MOCK/LIVE)를 값에 넣는다 | 합성 결과는 실제 작업 기록이 아니다. B는 새 입력의 방식을 그 시도와 대조하지만([입력 대조][x-bmode]), 기존 Catch를 찾을 때는 (ownerId, workIdentity)만 쓰고 기존 Catch의 방식은 대조하지 않는다([조회][x-blookup]). 지금 합성 경로는 이 함수의 값을 쓰지 않아 10월에는 이 충돌 경로가 없다. 합성 경로가 이 함수를 쓰게 될 때를 대비한 방어용이다 |

값에 넣지 않는 범위도 있다. 동의 범위 판본(scopeRevision)과 분석 시점의 저장소 커밋이다. 넣으면 동의 범위가 바뀌거나 새 커밋이 생길 때마다 같은 작업이 새 Catch가 된다. 이는 2026-09-13 팀장 답변 "실패 후 다시 요청해도 같은 작업의 카드가 중복으로 쌓이지 않게 한다"([MVP 입력 L189][m189])와 맞지 않는다. 어느 시점의 저장소를 분석했는지 기록하는 방법과, 새 커밋이 생긴 뒤 다시 분석할 때의 처리([MVP 입력 L200][m200])는 재분석 정책을 정할 때 함께 정한다.

## 판정 입력

| 입력 | 뜻 | 출처 |
|---|---|---|
| 규칙 판본 | 판별 규칙의 판본. 지금은 `wi1` | 상수 |
| 방식 | MOCK 또는 LIVE | 요청의 sourceMode |
| 저장소 | 분석 대상 저장소 | E가 접수한 요청의 repositoryId. 결과의 repositoryId와 같다 |
| 작업 단위 | PR 번호, 병합 커밋 SHA, 커밋 SHA 집합, 이슈 번호 중 하나 | F가 수집한 GitHub 기록이 준 번호·SHA. 제목·본문 글자에서 뽑지 않는다 |
| 나눈 부분 | 단위를 나눴을 때만: 이 작업에 속한 커밋, 한 커밋 안을 나눴으면 커밋과 파일 경로 | F의 묶음 결과. 나누지 않았으면 비운다 |

다음은 바뀌어도 값이 같아야 하므로 입력으로 쓰지 않는다.

| 쓰지 않는 입력 | 이유 |
|---|---|
| 제목, 작업 사실, 기여 설명, 초안, 최소 질문, 묶음 설명 | F가 만드는 문장이라 실행마다 달라질 수 있다. 표현만 바뀐 같은 작업이 같은 값이어야 한다([명세 L92][c92], [ERD L119][e119]) |
| 근거 문장, 근거 목록의 구성, evidenceId | 같은 작업이라도 근거를 더 보거나 덜 볼 수 있다. 근거가 겹친다고 같은 작업도 아니다([worker 모델 L35][w35]) |
| candidateId, resultId, attemptId, requestId, consentId, messageId, finishedAt | 전달·처리 번호일 뿐 작업을 가리키지 않는다 |
| PR 제목·본문 수정, PR에 추가된 커밋, 근거의 판본 값(sourceRevision) | 나누지 않은 PR은 PR 전체가 하나의 작업이라 커밋이 늘어도 같은 작업이다. 판본 값은 다른 작업끼리 같을 수도 있다(합성 자료의 `synthetic-revision-11`이 세 작업에 쓰였다) |
| 목록 순서, SHA 대소문자 | 정규화로 없앤다 |
| 회원 ID | B가 범위로 적용한다 |
| 동의 범위 판본, 분석 시점의 저장소 커밋 | 「판정 범위」의 이유 |

## 판정 규칙

F는 먼저 「무엇을 하나의 작업으로 보는가」의 조건대로 한 결과의 후보를 묶는다(같은 변경은 한 후보에만, 근거가 있을 때만 나누기). 그다음 후보마다 값을 만든다.

- **동일 작업**: 방식·저장소·작업 단위·나눈 부분이 모두 같다. 회원이 같은지는 B가 본다.
- **다른 작업**: 넷 중 하나가 다르고, 그 차이가 근거로 보인다. 저자가 따로 연 단위이거나, 근거로 구별돼 나눈 부분인 경우다. 근거(이슈·파일·리뷰·판본 값)가 겹쳐도 작업 단위나 나눈 부분이 다르면 다른 작업이다.
- **판정 불가**: 같은지 다른지 보일 수 없는 경우다. 세 가지로 나눠 처리한다.

| 판정 불가 상황 | 처리 |
|---|---|
| **구별 불가**: 한 결과 안에서 한 단위의 두 변경이 서로 다른 작업인지 근거로 보일 수 없다 | 나누지 않고 한 후보로 내보낸다. 묶음의 한계는 groupingLimitations에 적는다([Q7 기술 설계][q7d]). notProvided에 세지 않는다 |
| **단위 미확정**: 근거·작업 사실·본인 기여는 확인됐지만, 변경이 어느 단위에 속하는지 정할 수 없다. 예를 들어 PR을 조회할 수 있는데 PR의 커밋 목록을 끝까지 받지 못해 이 커밋이 그 PR에 속하는지 모르는 경우다. PR 조회가 허용되지 않은 요청은 여기에 들지 않는다(「무엇을 하나의 작업으로 보는가」) | 따로 후보로 내보내지 않는다(Q7). notProvided에 UNDETERMINED로 센다(제안, 「남은 쟁점」 팀장1). GitHub 조회 오류가 원인이면 처리 오류(failures)로 구분한다 |
| **결과 사이 변화**: 다른 결과에서 같은 작업의 단위나 부분이 바뀌었다. rebase, 묶음 경계 변화, 나누기 결정 변화가 예다 | v1은 다른 값을 낸다. 이는 [Q7 기술 설계][q7d]와 [MVP 입력 L189][m189]에 맞지 않는다. 그래서 재분석을 도입하기 전에 처리를 정하고, v1을 그대로 쓰지 않는다. 10월에는 이 경로가 없다(아래) |

근거의 판본을 확정할 수 없는 후보(짧은 SHA만 있고 원본에서 확정하지 못함 등)는 판정 이전의 문제다. 근거 요건([명세 L165][c165])을 채우지 못했으므로 기존 규칙대로 INSUFFICIENT_EVIDENCE(근거 부족)로 센다. UNDETERMINED는 근거 요건을 채운 뒤 단위만 정할 수 없을 때 쓴다.

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
| 짧은 SHA가 여러 커밋에 들어맞는다 | 짧은 SHA를 쓰지 않는다. 원본에서 확정할 수 없으면 근거 부족이다 |
| 규칙 판본이 다르다 | 접두사와 해시 입력의 판본이 달라 값이 같을 수 없다 |
| 한 결과 안에서 두 후보의 값이 같다 | 이 제안에서는 F가 지킬 조건의 위반이다. 계약과 B는 이 경우를 받아들여 한 Catch로 모은다([기능 설계 L74][f74], [B 시험][x-bsame]). 두 번째 후보의 내용은 저장되지 않으므로 F가 내보내기 전에 한 후보로 합친다. B 동작은 바꾸지 않는다 |
| SHA-256 해시 충돌 | 무시할 수 있는 확률이다. B가 원 요청의 저장소·방식을 한 번 더 대조할지는 「남은 쟁점」 B4에서 다룬다 |
| 합성 값(`synthetic-work-…`)과 실제 값(`wi1:…`) | 접두사가 달라 겹치지 않는다 |

## 규칙 판본 취급

- 규칙 판본은 값 앞의 `wi1:`로 보이고, 해시 입력에도 들어간다.
- **판본을 올리는 변경**: 작업 단위·부분·배정의 정의, 입력 목록, 정규화, 직렬화, 해시 함수가 바뀔 때다. 제목·초안 생성, 근거 선택, 코드 정리는 판본을 올리지 않는다.
- B는 문자열 전체를 비교한다. 그래서 판본이 다른 값끼리는 같은 작업으로 판정되지 않고, 잘못 합쳐지지 않는다. 대신 판본을 바꾸면 같은 작업도 새 Catch가 될 수 있다. 10월에는 wi1만 쓰므로 판본이 섞이지 않는다. 판본을 바꾸거나 재분석을 도입할 때 기존 값과 잇는 방법(옮기기·대응표)을 함께 정한다.
- [ERD L105][e105]의 "의미/범위 버전을 포함해 중복 검사"는 **이 규칙 판본**으로 해석했다. 작업의 뜻과 판정 범위를 정하는 규칙의 판본이라는 뜻이다. 동의 범위 판본(scopeRevision)을 뜻한다면 「판정 범위」의 이유로 문제가 생긴다(「남은 쟁점」 계약1).
- 한 번 만든 값은 결과와 함께 보관하고, 재전달·반영 복구 때 다시 계산하지 않는다. 판본이 바뀐 뒤 옛 결과를 재전달해도 옛 값을 그대로 보낸다.

## 기존 Catch 참조와 새 후보 등록

- **B·E 코드와 계약 필드는 바꾸지 않는다.** B는 (ownerId, workIdentity) 유일성과 문자열 같음 비교를 그대로 쓴다([조회][x-blookup]). workIdentity의 형식을 검사하지 않는다. 합성 값과 실제 값이 함께 쓰이기 때문이다.
- **기존 Catch를 참조할 때는 본문·근거·출처·확인·공개 상태를 바꾸지 않고, 새 후보의 내용도 더하지 않는다.** 기존 규칙을 유지한다([ERD L205][e205], [B 시험][x-bkeep]). 그래서 잘못 합치면 뒤 작업의 내용이 어디에도 저장되지 않는다. F가 한 결과 안의 값을 후보마다 다르게 내고, 저장소를 값에 넣어야 하는 이유다.
- **처리 결과(outcome).** outcome은 F가 적는다. E는 그 값이 후보 수·실패 수와 맞는지 검사하고, 맞지 않으면 결과 전체를 거부한다([E 대조][x-eoutcome]).
  - 단위 미확정 후보는 notProvided에만 세므로 후보 수에 들어가지 않는다. 그래서 후보를 빼면 outcome이 바뀔 수 있다(SUCCEEDED→EMPTY, PARTIAL_FAILED→FAILED).
  - 모두 빠지고 실패가 없으면 F는 EMPTY로 적는다. EMPTY는 정상 완료라 10월에는 그 저장소를 다시 요청할 수 없다([명세 L74][c74], [L75][c75]).
  - 조회 오류는 failures로 간다. 후보가 없으면 FAILED가 되고, 재요청 조건을 따진다.
  - 근거 부족으로 내보내지 않는 기존 동작과 같은 방식이다.
- **#103·#113 합성 자료에는 이 함수를 쓰지 않는다.** [#103 합성 결과 세트][x103]와 [#113][i113] 가짜 생성기는 주어진 합성 값을 그대로 쓴다. 이 함수로 다시 계산하면 여러 사례가 같은 합성 PR(`pull/1`)을 가리켜 하나로 합쳐진다.
  - 합성 값에는 저장소가 들어 있지 않다. 개발 환경에서 같은 회원이 같은 합성 사례를 두 저장소 요청에 주입하면, 두 번째 저장소의 후보가 첫 저장소의 합성 Catch를 참조한다. 합성 자료는 바꾸지 않으므로 개발 시험에서 이 조합을 피한다.
  - [`two-candidates-same-work`][x2c]는 B가 같은 값의 두 후보를 한 Catch로 모으는지 시험하는 사례로 계속 쓴다.
  - 이 문서 기준으로 보면, 그 두 번째 후보는 PR과의 연결을 확인하지 않은 커밋이다. PR에 속하면 F가 처음부터 한 후보로 묶고, 속하지 않음이 확인되면 다른 작업이다. 확인할 수 없으면 단위 미확정이라 따로 후보로 내지 않는다.
  - 이 차이 때문에 세트를 고치지 않는다. 세트의 값은 판별 알고리즘의 정답이 아니다.

## 합성 사례와 기대 판정

사례의 값은 모두 설명용 합성 값이다. 실제 저장소 자료나 과거 실험 자료가 아니다.
- **기본 후보**: 회원 M1, 저장소 `synthetic-repo-0001`(R1), 방식 LIVE, 나누지 않은 PR #3 전체를 한 후보로 본 결과, 제목 "알림 목록 페이지 나누기".
- LIVE는 실제 결과였다면 어떻게 판정되는지 보이려는 가정이다.
- SHA는 `aaaa…`처럼 같은 글자 40개로 적는다.
- **기대 판정**은 계약과 작업의 뜻에서 정했다.
  - **판정 범위 밖**은 작업 의미로는 같을 수 있지만 회원이나 저장소가 달라 서로 비교하지 않는 경우다. C10은 값이 같고, C11은 저장소가 달라 값이 다르다.
  - 범위도 다르고 작업도 다르면 '다른'으로 적는다(C12·C13).
  - **비교 대상 아님**은 재전달과 중복 등록을 구분하려고 넣은 대조 사례다.
- **Catch 영향**은 B가 받은 값으로 등록했을 때의 결과다.

| # | 합성 입력과 달라진 부분 | 기대 판정 | 이유 | Catch 영향 |
|---|---|---|---|---|
| C1 | 제목만 "알림 페이지네이션 추가". 결과·후보 ID도 다르다 | 동일 | 제목은 생성 문장이고 작업 단위(PR #3)가 같다 | 기존 Catch 참조. 제목·본문·공개 상태 유지 |
| C2 | 작업 사실·기여 설명 문장이 다르고 초안이 없다 | 동일 | 설명 문장은 입력이 아니다 | 기존 Catch 참조. 초안이 없어도 빠지지 않는다 |
| C3 | 근거의 판본 값(sourceRevision)이 PR에 나중에 추가된 커밋을 가리킨다 | 동일 | 나누지 않은 PR은 PR 전체가 한 작업이다 | 기존 Catch 참조. 첫 내용을 유지하며, 갱신은 재분석 정책에서 정한다 |
| C4 | 같은 PR의 리뷰 댓글 근거가 추가됐다 | 동일 | 근거 목록은 입력이 아니다 | 기존 Catch 참조. 새 근거는 더하지 않는다 |
| C5 | 커밋 묶음 단위에서 SHA 순서·대소문자만 다르다 | 동일 | 정규화 뒤 같은 집합이다 | 기존 Catch 참조 |
| C6 | PR #7(로그인 요청 횟수 제한)과 PR #9(회원가입 요청 횟수 제한)가 같은 이슈 #5와 같은 파일을 근거로 공유한다 | 다른 | 작업 단위가 다르다. 겹친 것은 근거지 작업 단위가 아니다([명세 L92][c92], [Q7][q7]) | Catch 2개. 이슈 근거는 두 Catch에 각각 저장한다([ERD L138][e138]) |
| C7 | 한 PR #20 안에서 커밋 `cccc…`·`dddd…`는 로그인 오류 수정, `eeee…`는 설치 안내 보완이다. 사실·기여가 따로 확인되고 모든 커밋이 둘 중 하나에 속한다 | 다른 | 나누기 세 조건을 채운다(Q7) | F가 PR #20을 두 후보로 나눈다. 부분이 달라 Catch 2개. PR 근거는 둘 다에 있다 |
| C8 | PR #10(로그인 요청 제한)과 #11(가입 화면)을 통합 브랜치로 병합한 뒤, 둘을 담은 최종 PR #12를 병합했다 | 다른(#10·#11), #12는 후보 아님 | 같은 변경은 먼저 병합된 #10·#11에 배정된다. #12에는 병합 커밋만 남는데, 병합 커밋은 변경으로 세지 않으므로 배정받은 변경이 없다 | Catch 2개(#10·#11). #12는 후보 없음 |
| C9 | PR #1과 PR #3 근거의 판본 값이 같다(#103 세트의 `synthetic-revision-11` 재사용과 같은 모양) | 다른 | 판본 값은 작업 단위가 아니다 | Catch 2개 |
| C10 | 회원 M2가 같은 PR #3에 리뷰 반영 커밋을 올렸다 | 판정 범위 밖(작업은 같고 값도 같다) | 판정은 회원 안에서만 한다 | B의 (ownerId, workIdentity) 유일성으로 M1·M2가 각자 Catch를 가진다 |
| C11 | 원 저장소 R1에서 PR 없이 병합한 병합 커밋 `1111…`이, R1을 받아온 포크 R2에도 그대로 있다. 두 요청 모두 이 병합을 병합 단위로 본다 | 판정 범위 밖(작업 의미로는 같은 변경) | 저장소마다 따로 판정하기로 제안한다(「판정 범위」 ③). 저장소를 값에서 빼면 한 Catch가 된다 | 저장소마다 Catch. 같은 회원에게 같은 변경이 두 번 보일 수 있다 |
| C12 | R1 PR #3(알림 목록)과 R2 PR #3(결제 오류 수정) | 다른 | 번호는 저장소마다 새로 매겨진다. 저장소가 없으면 두 작업이 합쳐진다 | Catch 2개. R2 작업이 R1 Catch에 붙지 않는다 |
| C13 | 같은 저장소 값의 PR #3인데, 앞 결과는 합성(MOCK)이다 | 다른 | 합성 결과는 실제 작업 기록이 아니다(방어용 사례) | 실제 결과는 새 Catch. 합성 Catch에 붙지 않는다 |
| C14 | PR #11을 닫고 같은 변경을 rebase해 PR #12로 다시 열어 병합했다. SHA는 다르고 diff 해시는 같다 | 동일 | 제출만 다시 한 같은 작업이다. 구별할 근거가 없다(Q7) | 변경은 병합된 #12에 배정된다. 한 후보(#12), Catch 1개 |
| C15 | 한 PR #20 안의 두 변경이 같은 파일을 번갈아 고쳤고, 기여를 나눠 확인할 수 없다(정보 부족) | 판정 불가(구별 불가) | 구별 근거가 없다. 임의로 다른 작업으로 나누지 않는다(Q7) | 나누지 않고 한 후보, Catch 1개. 한계는 groupingLimitations에 적고 notProvided에 세지 않는다 |
| C16 | 커밋 `ffff…`의 사실·기여는 확인됐지만, PR #3의 커밋 목록을 끝까지 받지 못해 이 커밋이 PR #3에 속하는지 모른다(정보 부족) | 판정 불가(단위 미확정) | PR #3에 붙이면 잘못 합칠 수 있고, 따로 내면 입증 없이 다른 작업이 된다 | 이 변경은 후보로 내보내지 않는다. notProvided UNDETERMINED 1(제안). PR #3 후보는 그대로 |
| C17 | 근거에 PR 번호·병합 커밋·전체 SHA가 없고 짧은 SHA(`aaaaaaa`)만 있다. 원본에서 확정할 수 없다(정보 부족) | 판정 이전(근거 부족) | 안정된 판본에 연결되지 않아 근거 요건을 채우지 못한다([명세 L165][c165]) | 후보로 내보내지 않는다. notProvided INSUFFICIENT_EVIDENCE 1(기존 규칙). 조회 오류가 원인이면 failures |
| C18 | 같은 resultId·같은 내용을 다시 받았다. messageId만 새 값이다 | 비교 대상 아님 | 재전달이다. 값은 저장된 결과 그대로다 | E가 중복 수신으로 처리한다. 새 Catch 없음. 반영을 다시 실행해도 B는 같은 catchId를 돌려준다 |
| C19 | 같은 resultId인데 제목만 바꿔 결과를 다시 만들었다 | 비교 대상 아님 | 같은 번호에 다른 내용이 온 결과 충돌이다. 작업 동일성과 섞지 않는다 | E가 거부한다. 첫 Catch 유지 |

C1~C5의 "기존 Catch 참조"는 다른 결과에서 같은 작업이 다시 왔다고 가정한 것이다. 10월에는 이 경로가 없다(「판정 규칙」 10월의 결과 사이 경로). 한 결과 안에서는 F가 같은 변경을 한 후보로 두므로 B까지 가지 않는다(C8·C14).

**한계 사례.** v1이 작업 의미와 다르게 나오거나 한 작업이 따로 드러나지 않는 경우다.

| # | 상황 | 생기는 곳 | 작업 의미 | v1 결과 |
|---|---|---|---|---|
| L1 | 직접 커밋을 rebase·강제 푸시해 SHA가 바뀌었다 | 결과 사이 | 동일 | 다른 값 → 새 Catch(중복) |
| L2 | 한 번은 PR 조회가 허용되지 않아 병합·커밋 묶음으로, 다음엔 PR로 봤다 | 결과 사이 | 판정 불가 | 다른 값 → 새 Catch. Q7과 맞지 않는다 |
| L3 | 새 커밋·임계값 변경으로 방법 B의 묶음 경계가 옮겨 커밋 집합이 일부만 겹친다 | 결과 사이 | 판정 불가 | 다른 값 → 새 Catch. Q7과 맞지 않는다 |
| L4 | 규칙 판본이 wi1에서 wi2로 바뀌었다 | 결과 사이 | 동일 | 다른 문자열 → 새 Catch. 잇는 방법은 판본을 바꿀 때 정한다 |
| L5 | 한 결과에서는 PR을 한 후보로 두고, 다음 결과에서는 근거가 더 생겨 둘로 나눴다(또는 반대) | 결과 사이 | 동일(나눈 부분은 원 작업의 일부) | 부분이 달라 모든 값이 새로 생긴다 → 새 Catch |
| L6 | 같은 변경을 담은 PR #11·#12가 모두 열려 있어 번호가 작은 #11에 배정했는데, 다음 분석 때는 #12가 먼저 병합돼 #12에 배정됐다 | 결과 사이 | 동일 | 배정받는 단위가 바뀌어 다른 값 → 새 Catch |
| L7 | 한 기능이 기능 PR과 후속 수정 PR에 걸쳐 있다 | 한 결과 안 | 판단이 갈린다 | PR마다 Catch. 저자가 나눈 단위를 따른다 |
| L8 | 한 커밋의 같은 파일 안에 구별되는 두 작업이 있다 | 한 결과 안 | 다른 | 부분의 최소 단위가 커밋과 파일 경로라 한 후보로 남는다. Q7은 따로 등록을 허용할 뿐 요구하지 않는다 |
| L9 | 포크와 원 저장소에 같은 변경이 있다(C11) | 저장소가 다른 두 결과(10월에도 생긴다) | 같은 변경 | 저장소마다 Catch |

같은 저장소의 결과 사이 한계(L1~L6)는 10월에 경로가 없다. L9는 저장소가 다른 요청이라 10월에도 생긴다. 재분석을 도입하기 전에 보류·확인 같은 처리를 정한다. L2·L3처럼 입증하지 못한 후보를 다른 작업으로 만드는 경우가 있으므로 v1을 그대로 쓰지 않는다.

## #118이 지킬 것과 시험할 것

1. 값은 이 문서의 함수로만 만든다. 제목·문장·전달 번호를 넣지 않는다.
2. 한 결과 안에서 같은 변경(같은 SHA 또는 같은 diff 해시, 경로로 나눈 커밋은 같은 커밋·같은 경로)은 한 후보에만 속한다. 병합 커밋은 변경으로 세지 않는다. 여러 단위에 들어 있는 변경은 「무엇을 하나의 작업으로 보는가」의 배정 규칙을 따른다. 배정받은 변경이 없는 단위는 후보를 만들지 않는다. 그래서 후보끼리 값이 모두 다르다.
3. 단위는 나누기 세 조건(따로 확인, 겹치지 않음, 배정된 모든 변경이 한 부분에 속함)을 채울 때만 나눈다. 못 채우면 한 후보로 둔다.
4. 이슈 API가 준 PR은 PR 단위로 적는다. PR 조회가 허용되지 않은 요청에서는 PR 단위를 쓰지 않는다.
5. 근거의 판본을 확정할 수 없으면 기존 규칙대로 INSUFFICIENT_EVIDENCE다. 근거 요건은 채웠지만 단위만 정할 수 없는 변경은 「남은 쟁점」 팀장1의 결정을 따른다. 보류안으로 정해지면 후보로 내보내지 않고 UNDETERMINED로 센다. 조회 오류는 failures로 구분한다.
6. outcome은 내보낸 후보 수와 failures 수로 계산한다.
7. 값은 결과와 함께 보관하고, 재전달·반영 복구 때 다시 계산하지 않는다.
8. 단위의 식별(PR 번호·병합 커밋·SHA)을 그 후보의 근거에서 찾을 수 있게 한다. 커밋이 많을 때 대표 근거만 둘지는 #118에서 정한다.
9. 합성(MOCK) 경로는 알려진 합성 값을 계속 써도 된다. #103·#113 시험의 기대값을 이 함수로 바꾸지 않는다.
10. 시험: C1~C17과 쌓아 올린 PR 사례(공유 커밋은 먼저 병합된 앞 PR로, 뒤 PR은 자기 커밋만으로 후보가 됨)를 함수·묶음 단위 시험으로 옮긴다(C18·C19는 E 수신 시험의 몫이다). 다음을 함께 확인한다.
    - 불변성: 쓰지 않는 입력이 바뀌어도 값이 같다. C10은 두 회원의 값이 같아야 한다.
    - 민감도: 저장소·방식·단위·부분이 바뀌면 값이 다르다.
    - 형식: `wi1:` 뒤에 16진수 64자가 붙는다.
    - 부분: 정렬 순서와, 한 커밋을 한 가지로만 적는 규칙.

## 한계와 실제 구현에서 검증할 것

- 위 한계 사례 L1~L9.
- **repositoryId의 실제 형식이 정해지지 않았다.** 다음을 확인한다.
  - 이름 변경·이전 뒤에도 같은 값인가.
  - 저장소를 지우고 같은 이름으로 새로 만들었을 때 옛 값을 다시 받지 않는가.
  - 한 회원이 같은 GitHub 저장소를 두 값으로 갖지 않는가.
  - 값이 바뀌면 같은 작업이 나뉘고(중복), 재사용되면 다른 작업이 합쳐질 수 있다. A 담당과 함께 [#116][i116]의 저장소 식별 정보 전달에서 확인한다.
- **GitHub 사실.** 이슈·PR이 번호를 함께 쓴다는 것은 확인했다(「식별자 충돌」). 다음은 공식 문서·API로 확인해야 한다.
  - PR 번호가 저장소 안에서 다시 쓰이지 않는가.
  - 병합 커밋·squash·rebase 방식별로 커밋을 API로 PR에 확정할 수 있는가.
  - PR 커밋 목록을 끝까지 받을 수 있는가(C16).
  - PR 조회가 허용 범위에 없을 때 단위가 어떻게 달라지는가(L2).
- **diff 해시로 같은 변경을 찾는 방법을 확인한다.** API 자료만으로 계산할 수 있는지, squash·충돌 해결로 해시가 달라지는 경우가 있는지 본다(C14).
- **충돌 해결로 병합 커밋에만 생긴 변경**을 어느 단위의 변경으로 볼지 확인한다. 이 제안은 병합 커밋을 변경으로 세지 않는다.
- **결정성을 확인한다.** 방법 B의 묶음과 나누기 결정이 같은 입력에서 항상 같아야 한다(L3·L5).
- 64자 SHA 저장소와, 파일 이름이 바뀐 커밋에서 부분 경로를 무엇으로 쓸지 확인한다.
- 동시에 등록해도 한 Catch로 모이는지는 [PR #143][p143]의 시험을 재사용한다.
- 실제 자료에서 잘못 합침·잘못 나눔을 세는 검수는 [#122][i122]에서 한다. 실제 자료 사용 조건([#37][i37]) 안에서만 한다.
- 원본 비공개 관측 책임([OQ-B3][c186])은 이 문서의 범위가 아니다. F에 배정하지 않는다.

## 남은 쟁점

**계약 문구 해석**
계약을 바꾸자는 것이 아니다. 해석이 맞는지 확인하고, 다르면 계약 변경 절차로 보낸다.

- **계약1.** [ERD L105][e105]의 "의미/범위 버전"을 규칙 판본(wi1)으로 해석했다. 동의 범위 판본을 뜻한다면 같은 작업이 동의가 바뀔 때마다 새 Catch가 된다.
- **계약2.** 저장소마다 따로 판정하는 것은 [ERD L119][e119]의 "동일 작업 재등록 금지"를 저장소 안으로 좁히는 해석이다. 포크·옮긴 코드의 같은 변경이 저장소마다 Catch가 된다(C11). B·팀장 확인이 필요하다.
- **계약3.** notProvided의 UNDETERMINED는 계약에 뜻이 적혀 있지 않다([worker 메시지 L106][w106]). 이 제안은 "근거 요건은 채웠지만 단위를 정할 수 없어 내보내지 않은 후보"로 쓴다. 근거 부족(INSUFFICIENT_EVIDENCE)과 겹치지 않게 범위를 좁혔다. 이 값은 회원 상태 응답에 나가지 않는다.
- **계약4.** repositoryId의 형식·불변성이 정해지지 않았다. 불변 값이 아니라면 저장소 식별을 보완해야 하고, 이는 계약 보완 대상이다.

**팀장 확인**

- **팀장1.** 단위 미확정 후보를 보류한다(내보내지 않음). [Q7][q7d]은 등록 보류·선별이 필요하면 그 쟁점을 따로 확인하라고 했다.
  - 모두 보류되고 실패가 없으면 결과는 EMPTY로 끝난다. 10월에는 그 저장소를 다시 요청할 수 없어 보류한 작업을 다시 등록할 경로가 없다.
  - 대안은 가장 가까운 단위의 후보에 넣고 한계로 적는 것이다. 이 대안은 잘못 합칠 위험이 있다.
  - PR을 조회할 수 있는데 PR의 커밋 목록을 끝까지 받지 못하거나, 커밋이 어느 PR에 속하는지 GitHub API로 확정하지 못할 때 생긴다. 얼마나 자주 생기는지는 아직 확인하지 않았다(「한계와 실제 구현에서 검증할 것」의 GitHub 사실).

**B 검토 (`leechaeah`): 등록·유일성·기존 Catch 참조 경계**

- **B1.** 회원은 B의 (ownerId, workIdentity)가, 저장소·방식은 값이 구분한다. 이 분담에 동의하는가. 저장소별 판정(계약2)이 "동일 작업 재등록 금지"와 맞는가.
- **B2.** 기존 Catch를 참조할 때 본문·근거·출처·공개 상태를 바꾸지 않고 새 후보 내용도 더하지 않는 현재 동작을 유지하는가. 이 동작 때문에 잘못 합치면 뒤 작업의 내용이 저장되지 않는다. 그래서 한 결과 안에서는 후보마다 값이 달라야 한다. 결과 사이의 모호한 경우는 v1이 정하지 않는다(재분석 정책).
- **B3.** 68자 `wi1:` 값을 PR #143의 칼럼(`text`, 1자 이상)에 그대로 저장하고 형식 검사를 더하지 않아도 되는가.
- **B4.** 같은 값인데 기존 Catch의 원 요청 저장소나 방식이 새 요청과 다를 때(해시 충돌이나 F 결함) 참조할지, 반영을 멈출지. [ERD L121][e121]의 "sourceMode와 결과/후보 맥락 일치"가 기존 Catch 참조에도 적용된다고 보는가.
- **B5.** `two-candidates-same-work` 사례를, 같은 값의 두 후보가 한 Catch로 모이는지 보는 B 시험으로 계속 쓰고, 이 문서 기준의 판정과 다르다는 점만 기록해도 되는가.

**E 검토 (`yeongyeon1802`): 결과 재전달·시도 구분 경계**

- **E1.** E는 workIdentity를 판정하지 않고 결과 지문의 일부로만 다룬다. F는 값을 결과와 함께 보관해 재전달·반영 복구 때 다시 계산하지 않는다. 반영 복구 때 B도 저장된 값과 대조한다. 이 경계가 맞는가.
- **E2.** 같은 결과의 재전달(resultId·지문, 시도당 결과 하나)과 같은 작업의 중복 등록((회원, workIdentity))을 「식별자가 가리키는 것」처럼 나눈 것이 E의 수신 판정과 맞는가.
- **E3.** 단위 미확정 후보를 빼고 outcome을 계산하면, 모두 미확정이고 실패가 없는 결과는 EMPTY(재요청 불가)로 끝난다. 조회 오류가 있고 내보낸 후보가 없으면 FAILED(재요청 조건을 따짐), 내보낸 후보가 있으면 PARTIAL_FAILED(재분석 불가)가 된다. 이 구분이 E의 종결·재요청 판정과 맞는가.

## 검토 기록

| 검토 | 상대 | 상태 | 재사용한 기존 기록 |
|---|---|---|---|
| 등록·유일성·기존 Catch 참조 경계 | B `leechaeah` | 대기 | [#105 댓글][b105a]은 같은 작업 키를 전달된 문자열 그대로 묶는 저장 전 분류를 합성 값으로 확인했다. 실제 동일성 판별과 DB 참조는 검증하지 않았다고 밝혔다. [#105 후속 댓글][b105b]과 [PR #177 리뷰][b177]는 PR #143에서 알려진 합성 값으로 같은 작업 후보의 Catch 공유와 재반영 때 ID·본문·근거 보존을 확인했다. 모두 이 제안의 검토는 아니다 |
| 결과 재전달·시도 구분 경계 | E `yeongyeon1802` | 대기 | [PR #166 리뷰][e166]의 지문 설명(messageId만 빼고 나머지 결과 내용 유지)을 「식별자가 가리키는 것」에 재사용했다 |

AI의 자체 대조는 B/E 검토나 기준 채택으로 세지 않는다. 채택 여부와 반영 결과는 이 표와 [#111][i111]에 남긴다.

<!-- 이슈·PR -->
[i37]: https://github.com/JminAILab/CatchU/issues/37
[i111]: https://github.com/JminAILab/CatchU/issues/111
[i113]: https://github.com/JminAILab/CatchU/issues/113
[i116]: https://github.com/JminAILab/CatchU/issues/116
[i118]: https://github.com/JminAILab/CatchU/issues/118
[i122]: https://github.com/JminAILab/CatchU/issues/122
[p143]: https://github.com/JminAILab/CatchU/pull/143
[b105a]: https://github.com/JminAILab/CatchU/issues/105#issuecomment-5864509944
[b105b]: https://github.com/JminAILab/CatchU/issues/105#issuecomment-5885698884
[b177]: https://github.com/JminAILab/CatchU/pull/177#pullrequestreview-5349314936
[e166]: https://github.com/JminAILab/CatchU/pull/166#pullrequestreview-5349158273
<!-- API 명세 v1 (contract-summary.md @a7dcc87) -->
[c74]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L74
[c75]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L75
[c86]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L86
[c92]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L92
[c155]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L155
[c165]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L165
[c185]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L185
[c186]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L186
[w35]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/entities.md#L35
[w106]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml#L106
[br32]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md#L17-L24
<!-- ERD·기능 설계 (u2-api @a7dcc87) -->
[e105]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L105
[e119]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L119
[e121]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L121
[e125]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L125
[e138]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L138
[e151]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L151
[e205]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L205
[f74]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L74
[f76]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#L76
<!-- 결정 기록 -->
[q6]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L162
[q7]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L184
[q7d]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L202
[q7h]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L217
[m189]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/ai-dlc-input-mvp/CatchU_mvp_input.md#L189
[m200]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/ai-dlc-input-mvp/CatchU_mvp_input.md#L200
[conv]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/CatchU_레포_컨벤션.md#0-왜-지금-정했나
[cardA]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/카드생성논리_상세설명.md#L58
[cardB]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/카드생성논리_상세설명.md#L64
[poc-a]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/knowledge/documents/CatchU_PoC_분석_1차_2026-09-14.md#L90
<!-- 코드·합성 자료 -->
[x-efp]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/api/src/analysis-receiver/analysis-receiver.service.ts#L23-L27
[x-eoutcome]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/api/src/analysis-receiver/analysis-receiver.service.ts#L29-L53
[x-edup]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/api/src/analysis-receiver/analysis-receiver.service.ts#L63-L69
[x-blookup]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-service.ts#L135-L140
[x-breapply]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-service.ts#L116-L133
[x-bmode]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-service.ts#L104-L110
[x-bsame]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/test/catches/registration-postgres.test.cjs#L171-L177
[x-btest]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/test/catches/registration-postgres.test.cjs#L200-L213
[x-bkeep]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/test/catches/registration-postgres.test.cjs#L230-L248
[x-bbatch]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-batch.ts#L94-L97
[x103]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/worker/fixtures/m1-synthetic/README.md#id-채우기
[x2c]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/worker/fixtures/m1-synthetic/results/two-candidates-same-work.json
