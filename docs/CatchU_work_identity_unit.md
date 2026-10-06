# CatchU 작업 동일성 판별 기준 — 작업 단위와 판정 입력

> [작업 동일성 판별 기준](CatchU_작업동일성_판별기준.md)의 절을 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 그대로 옮긴 파일이다. 지위와 적용 범위는 그 문서와 같고, 다른 절은 그 문서에서 찾는다. AI가 한 번에 읽을 수 있게 36 KB 미만으로 유지한다.

## 무엇을 하나의 작업으로 보는가

**작업은 한 저장소에서 회원이 기여한 변경의 묶음이다.** 근거로 작업 사실과 본인 기여를 확인할 수 있어야 한다. 묶는 출발점은 저자가 이미 묶어 둔 단위다. [레포 컨벤션 §0][conv]과 [카드생성논리 방법 A][cardA]가 이 단위를 가장 믿을 만한 작업 경계로 보았다. 그 밖의 커밋은 F가 규칙으로 묶는다([방법 B][cardB]).

| 작업 단위 | 뜻 | 값에 쓰는 식별 |
|---|---|---|
| PR | 회원이 참여한 PR 하나. 병합 여부와 병합 방식은 따지지 않는다 | PR 번호 |
| 병합 | PR 없이 브랜치를 병합 커밋으로 합친 묶음 | 병합 커밋 SHA |
| 커밋 묶음 | PR·병합에 속하지 않은 커밋을 F가 규칙으로 묶은 것(방법 B) | 커밋 SHA 집합 |
| 이슈 | 코드 변경 없이 이슈로만 기여한 것. 계약의 허용 자료 종류에 있어 형식만 정한다. 10월 동의 문구(커밋·PR·diff)에는 없다 | 이슈 번호 |

- **한 후보는 작업 단위 하나에서 나온다.** 저자가 따로 연 PR 두 개를 F가 한 후보로 합치지 않는다.
- **한 결과 안에서 같은 변경은 한 후보에만 속한다.** 같은 변경인지는 「PR 소속과 같은 변경을 확인하는 근거」로만 확정한다. 한 커밋을 파일 경로로 나눈 경우에는 같은 커밋의 같은 경로를 같은 변경으로 본다.
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

## PR 소속과 같은 변경을 확인하는 근거

**커밋이 어느 PR에 속하는가.** GitHub가 준 관계로만 정한다. 커밋 메시지·PR 제목·브랜치 이름의 글자로 정하지 않는다.

| 근거 | 쓰는 방법 |
|---|---|
| PR 커밋 목록 | PR에 담긴 커밋 SHA 목록. [PR 커밋 목록 API][gh-prc]는 최대 250개까지만 돌려주므로, 넘으면 [커밋 목록 API][gh-lc]로 전체를 받는다. 병합되지 않고 닫힌 PR의 커밋은 이 목록으로만 알 수 있다 |
| 병합된 PR의 `merge_commit_sha` | [PR API][gh-pr]가 주는 값이다. squash로 합쳤으면 대상 브랜치(PR을 병합한 브랜치)의 squash 커밋, rebase로 합쳤으면 대상 브랜치가 옮겨 간 커밋, 병합 커밋으로 합쳤으면 그 병합 커밋이다. 병합 전에는 시험용 병합 커밋이라 쓰지 않는다 |
| 커밋과 연결된 PR | [연결 PR API][gh-cpr]. 기본 브랜치에 있는 커밋이면 그 커밋을 들여온 병합 PR을 돌려준다. 기본 브랜치에 없으면 병합됐거나 열린 PR을 돌려주고, 병합되지 않고 닫힌 PR은 돌려주지 않는다 |
| 병합 커밋의 부모 | PR 없는 병합이 어느 커밋을 들였는지 정한다 |

- **한 근거로 소속이 나오고, 확인한 다른 근거와 어긋나지 않으면 소속을 확정한다.**
- **API가 원래 돌려주지 않는 관계는 어긋남이 아니다.**
  - squash·rebase로 합친 PR은 대상 브랜치에 새 SHA의 커밋을 만든다. PR 커밋 목록에는 원래 커밋만 남는다. 그래서 연결 PR API나 `merge_commit_sha`가 병합된 PR을 가리키는 커밋이 그 PR의 커밋 목록에 없는 것은 정상이다. 그 PR에 배정한다.
  - 병합되지 않고 닫힌 PR의 커밋은 연결 PR API가 돌려주지 않는다. PR 커밋 목록에 있으면 그 PR에 속한다.
- **PR 밖 확정**: 조회가 정상으로 끝났고, 연결 PR API가 빈 목록을 돌려줬고, 수집한 PR의 커밋 목록 어디에도 없으면 PR 밖이 확정된 것이다. 직접 push처럼 커밋 묶음으로 본다. 연결 PR API의 빈 목록만으로는 정하지 않는다.
- **단위 미확정**: 필요한 조회를 마쳤는데 근거끼리 서로 다른 답을 내는 경우다. 예를 들어 열린 PR #3에 대해 연결 PR API는 이 커밋에 PR #3을 돌려주는데, 같은 요청에서 받은 PR #3의 전체 커밋 목록에는 이 커밋이 없는 경우다. 두 조회 사이에 브랜치가 강제 푸시로 바뀐 경우 등이다.
- **확인 중단**: 조회를 마치지 못한 경우다(수집 상한, 조회 오류). 단위 미확정과 처리가 다르다(「판정 규칙」).

**SHA가 다른 두 커밋이 같은 변경인가.** 목적은 코드가 완전히 같은지 증명하는 것이 아니라, 같은 작업이 Catch로 두 번 등록되지 않게 하는 것이다(2026-09-30 팀장 결정, 「결정」).

1. **같은 SHA면 같은 변경이다.**
2. **SHA가 다르면 두 조건을 모두 채울 때만 같은 변경으로 확정한다.**
   - **관계 근거가 있다.** 두 변경이 같은 작업에서 비롯됐다는 근거다. 둘 중 하나여야 한다.
     - 재제출: 다음 두 가지를 모두 채워야 한다.
       - 한쪽 PR은 병합되지 않은 채 닫혔고, 다른 쪽 PR은 그보다 나중에 만들어져 그 변경을 담아 병합됐다. 한쪽 PR이 아직 열려 있거나, 둘 다 병합되지 않았거나, 병합되지 않은 PR이 병합된 PR보다 나중에 만들어졌으면 재제출로 보지 않는다. 되돌린 변경을 다시 넣으려고 연 PR일 수 있기 때문이다.
       - 뒤 PR(병합된 PR)의 제목이나 본문이 앞 PR을 번호(`#11`)나 같은 저장소의 PR 주소로 직접 가리킨다. 예를 들어 본문에 "#11을 기준 브랜치에 맞춰 다시 올립니다"라고 적은 경우다. 본문의 주소는 부르지 않고, 이미 수집한 앞 PR의 번호와 맞는지만 본다([#116 문서 2.1][d116-21]). 코드 블록·인라인 코드·HTML 주석 안의 글자, `abc#11`처럼 앞에 글자가 붙은 번호, 다른 저장소의 PR은 세지 않는다. `#11을`처럼 번호 뒤에 조사가 붙어도 센다. GitHub 화면은 이 모양에 링크를 만들지 않지만(2026-09-30 확인) 원 PR을 적은 것은 같기 때문이다. 그 문장이 '재제출'이라는 말을 쓰는지는 따지지 않는다. 앞 PR이 병합 없이 닫혔고 공백을 무시한 diff도 같아야 하기 때문이다. 그래서 뒤 PR이 앞 PR을 재제출이 아닌 뜻으로 적어도 합쳐질 수 있다(한계 L12).
     - cherry-pick 표시: 커밋 메시지의 `(cherry picked from commit <SHA>)`가 다른 쪽 커밋을 가리킨다.
     - 같은 이슈를 참고했거나, 같은 파일을 고쳤거나, 제목·설명이 비슷한 것은 관계 근거가 아니다(C24). PR 상태와 만든 순서만으로도 재제출로 보지 않는다. 앞 PR이 병합 없이 닫혔고 뒤 PR이 나중에 병합됐어도, 뒤 PR이 앞 PR을 가리키지 않으면 서로 무관한 PR일 수 있다(C30).
   - **공백을 무시한 diff가 같다.** 파일 경로와 diff에 나오는 줄에서 공백을 모두 빼고 비교하며, 줄 번호는 무시한다. diff에 나오는 줄은 더하고 뺀 줄과 그 앞뒤의 바뀌지 않은 문맥 줄이다. `git patch-id --stable`과 같은 기준이다([git 문서][git-pid]).
     - 더하고 뺀 줄만 비교하지 않고 문맥 줄도 함께 본다(`git patch-id`와 같다). 그래서 더하고 뺀 줄이 같아도 rebase로 앞뒤 문맥 줄이 바뀌었으면 값이 달라지고, 확정하지 않는다(C26, 한계 L10).
     - 변경 내용이 없거나 잘려 있으면 비교할 수 없으므로 확정하지 않는다. GitHub 커밋 API는 바이너리 파일과 변경이 큰 파일에서 `patch`를 빼고 준다. `patch`가 없는 파일을 빈 변경으로 보지 않는다.
3. **관계 근거 없이 공백을 무시한 diff만 같으면 합치지 않는다.** 이 비교는 공백을 모두 빼므로 실행 결과가 다른 두 변경을 같게 볼 수 있다. 합성 저장소에서 확인한 예는 다음과 같다(2026-09-30, git 2.54.0).
   - 같은 원본 `message = "old"`를 한 커밋은 `message = "a b"`로, 다른 커밋은 `message = "ab"`로 바꿨다. 실행 결과는 `a b`와 `ab`로 다른데 `--stable` 값은 같다(C21).
   - Python에서 `y = 2`를 조건이 거짓인 if 블록 안으로 들여 쓴 변경과, 같은 줄에 공백만 더한 변경도 `--stable` 값이 같다. 앞쪽만 프로그램 동작을 바꾼다(C22).
   - 관계 근거가 있으면 이런 차이도 같은 변경으로 본다(C25, 한계 L11). 목적이 같은 작업의 중복 등록을 막는 것이라 이 한계는 감수한다(2026-09-30 팀장 결정). 반대로 포매터로 공백만 정리해 다시 낸 변경은 이 기준으로 같은 변경이 된다(C23).
4. **확정하지 못하면 합치지 않는다.** 두 변경을 각자의 단위에 그대로 두고 두 후보를 모두 낸다. 후보를 빼지 않는다.
   - **다른 변경**: 관계 근거가 없다. 공백을 무시한 diff나 내용, 시간 순서가 재제출과 같아도 그렇다(C21·C22·C24·C30). groupingLimitations에 따로 적지 않는다.
   - **같은 변경 미확정**: 관계 근거는 있는데 공백을 무시한 diff가 다르거나, 변경 내용이 없어 비교할 수 없다(C26). 같은 작업일 수 있다는 점을 두 후보의 groupingLimitations에 적는다.
   - 어느 쪽이든 실제로는 같은 작업이 Catch 2개가 될 수 있다(한계 L10). 뒤 후보를 잘못 빼면 그 작업은 어디에도 남지 않지만, 중복은 회원이 비공개 상태에서 알아볼 수 있기 때문이다.
   - 두 후보는 저자가 따로 연 두 단위에서 나온다. 한 단위를 입증 없이 나누는 것이 아니므로, [Q7 기술 설계][q7d]의 "구별 가능성을 입증하지 못한 후보를 임의로 서로 다른 작업이라고 처리하지 않는다"와 부딪치지 않는다고 본다. 관계 근거가 없는 두 변경을 합치지 않는 것은 2026-09-30 팀장 결정이다.

## 판정 범위

| 범위 | 처리 | 이유 |
|---|---|---|
| 회원 | B의 (ownerId, workIdentity) 유일성이 구분한다. F는 회원 ID를 값에 넣지 않는다 | 같은 PR을 함께 작업한 두 회원은 같은 값을 갖지만 각자 Catch를 가진다. 다른 회원의 기여를 한 Catch에 붙이면 소유·공개 판단이 섞인다([ERD L121][e121]) |
| 저장소 | 요청의 repositoryId를 값에 넣는다. 저장소가 다르면 비교하지 않는다 | ① PR·이슈 번호는 저장소마다 새로 매겨진다. ② 초기 B 등록 코드(`e2acdfe`)는 기존 Catch를 참조할 때 새 요청의 저장소를 대조하지 않고 원 요청 저장소의 보호 판단만 봤다([조회][x-blookup], [시험][x-btest]). 그 판본에서는 값이 같으면 다른 저장소의 작업이 원 저장소 Catch에 붙어, 새 요청 저장소의 목록 필터와 보호 판단에서 빠졌다. 최신 PR #143은 저장소가 다르면 그 결과의 반영 전체를 거부한다([구현 커밋][b180impl]). 그래도 값이 같으면 다른 저장소의 정상 결과가 거부되므로 저장소를 값에 넣는다. ③ Catch의 저장소는 원 요청에서 정해지고 회원 Catch 응답과 저장소 필터에 쓰인다([ERD L125][e125]). 원본 보호(원본 저장소 상태에 따른 공개 제한)도 회원·저장소별이다([ERD L151][e151]). 그래서 포크나 옮긴 코드처럼 같은 변경이어도 저장소마다 따로 판정한다. 10월 MVP는 저장소마다 Catch가 생기는 것을 허용하고 저장소 간 중복 판별은 하지 않는다(2026-09-30 팀장 결정, 「검토 쟁점과 답」 계약2) |
| 방식 | sourceMode(MOCK/LIVE)를 값에 넣는다 | 합성 결과는 실제 작업 기록이 아니다. B는 새 입력의 방식을 그 시도와 대조한다([입력 대조][x-bmode]). 초기 판본(`e2acdfe`)은 기존 Catch를 찾을 때 (ownerId, workIdentity)만 쓰고 기존 Catch의 방식은 대조하지 않았다([조회][x-blookup]). 최신 PR #143은 방식이 다르면 그 결과의 반영 전체를 거부한다([구현 커밋][b180impl]). 지금 합성 경로는 이 함수의 값을 쓰지 않아 10월에는 이 충돌 경로가 없다. 합성 경로가 이 함수를 쓰게 될 때를 대비한 방어용이다 |

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

<!-- 이슈·PR -->
[d116-21]: https://github.com/JminAILab/CatchU/blob/6acd4a578e21547baff5028ddbd74c2ef7372e13/docs/CatchU_수집통제_임시자료.md#21-주소권한-검사
[git-pid]: https://git-scm.com/docs/git-patch-id
<!-- API 명세 v1 (contract-summary.md @a7dcc87) -->
[c92]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L92
[c155]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L155
[w35]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/entities.md#L35
<!-- ERD·기능 설계 (u2-api @a7dcc87) -->
[e119]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L119
[e121]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L121
[e125]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L125
[e151]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#L151
<!-- 결정 기록 -->
[q7d]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/domain-design/domain-design-questions.md#L202
[m189]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/ai-dlc-input-mvp/CatchU_mvp_input.md#L189
[m200]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/ai-dlc-input-mvp/CatchU_mvp_input.md#L200
[conv]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/CatchU_레포_컨벤션.md#0-왜-지금-정했나
[cardA]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/카드생성논리_상세설명.md#L58
[cardB]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/docs/카드생성논리_상세설명.md#L64
[poc-a]: https://github.com/JminAILab/CatchU/blob/a7dcc8763158afe765468e39641d3bf3dbc12ace/aidlc/spaces/default/knowledge/documents/CatchU_PoC_분석_1차_2026-09-14.md#L90
<!-- GitHub 공식 문서 (2026-09-29 확인) -->
[gh-pr]: https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request
[gh-prc]: https://docs.github.com/en/rest/pulls/pulls#list-commits-on-a-pull-request
[gh-lc]: https://docs.github.com/en/rest/commits/commits#list-commits
[gh-cpr]: https://docs.github.com/en/rest/commits/commits#list-pull-requests-associated-with-a-commit
<!-- 코드·합성 자료 -->
[x-blookup]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-service.ts#L135-L140
[x-bmode]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/src/catches/registration-service.ts#L104-L110
[x-btest]: https://github.com/JminAILab/CatchU/blob/e2acdfe5adf0e21ad70b18ea2a4ae52ed1b64964/api/test/catches/registration-postgres.test.cjs#L200-L213
[b180impl]: https://github.com/JminAILab/CatchU/commit/a5ac5dd491b5977d44efcbc7dcb2c78aeafdace8
