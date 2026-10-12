# 연결 PR 묶음 조회 — #267

> [관계 조회](relation-collection.md)의 4단계(연결 PR 조회)를 [#267](https://github.com/JminAILab/CatchU/issues/267)에서 GitHub GraphQL 묶음 조회로 바꾸며 그 방식·상한·근거를 따로 적었다. 이 문서에서 「관계 문서」는 그 문서를 가리킨다.

관계 조회는 PR 커밋 목록과 `merge_commit_sha`로 설명되지 않은 본인 커밋과, 그 결과로 고른 PR 없는 병합에 대해 "이 커밋을 담은 PR이 있는가"(연결 PR)를 묻는다. #118에서는 커밋 하나마다 REST 호출 1회였다. 그래서 직접 push가 많은 저장소는 이 조회만으로 요청당 호출 상한(300회)에 걸려 변경 내용을 받기 전에 멈췄고, 결과는 Catch 0개·`FAILED`였다(작업 동일성 사례 C27·C29). 이제 커밋을 최대 100개씩 묶어 GraphQL 요청 하나로 묻는다. 어떤 커밋을 어떤 순서로 묻는지, 결과 상태의 뜻, 후보 판정은 그대로다.

이 문서에서 쓰는 말:

- **묶음**: 한 번의 GraphQL 요청에 넣는 커밋들. 묶음 크기는 그 커밋 수다.
- **점수(cost)**: GitHub가 GraphQL 요청마다 매기는 값. 시간당 한도를 이 점수로 센다. 응답의 `rateLimit.cost`로 알 수 있다.
- **호출 수**: 실제로 보낸 HTTP 요청 수. REST 요청 1회와 GraphQL 묶음 요청 1회가 각각 1회다.

## 결정

- **2026-10-10 팀장 결정**: 연결 PR 조회의 호출 수를 줄이는 GraphQL 묶음 조회와 요청당 호출 상한 재검토를 #121 실측 뒤로 미루지 않고 #267에서 #121 실제 연결 전에 한다([입력 문서 변경 기록](../../docs/ai-dlc-input-mvp/2026-10-08_catch-decisions.md#변경-기록)). 연결 PR 조회 밖의 호출(목록, PR 커밋 목록, 250건 경로의 PR API·비교, 경계 비교, 변경 내용, 파일 모드)은 REST로 남는다.
- **2026-10-12 팀장 결정**: 요청당 호출 상한은 실제 HTTP 요청 수로 센다. REST 요청 1회와 GraphQL 묶음 요청 1회를 각각 1회로 더하고, GraphQL 점수는 이 수에 더하지 않고 따로 기록한다. 커밋 100개를 담은 묶음도 요청 하나면 1회다. 실패한 호출도 쓴 호출로 세는 것은 기존 규칙 그대로다.

## 부르는 법

- 주소는 `POST https://api.github.com/graphql` 하나다. 호스트·우회 이동 금지·응답 크기·대기 시간·자격정보 만료 검사는 REST 호출과 같은 전송·게이트웨이를 지난다(`app/collection/transport.py`·`gateway.py`). 토큰은 `Authorization` 머리글에만 싣고, REST 판본 머리글(`X-GitHub-Api-Version`)은 GraphQL에 보내지 않는다.
- 쿼리 문은 F가 가진 틀 하나로만 만든다(`app/collection/graphql.py`). 바뀌는 것은 묶음의 커밋 수뿐이다. 검사를 통과한 저장소 좌표와 SHA는 쿼리 문에 넣지 않고 변수(`owner`·`name`·`s0`…)로만 넘긴다. 바깥에서 받은 쿼리나 쓰기(mutation)는 없다. 본문 크기는 64 KB를 넘지 않는다(100개 묶음이 약 12 KB).
- 저장소는 `repository(owner, name, followRenames: false)`로 묻는다. 이름이 바뀌었거나 옮겨진 저장소를 따라가지 않으므로 옛 이름에는 GitHub가 오류를 준다(수집 실패). 응답의 저장소 이름(`nameWithOwner`)이 검사한 좌표와 다르면(대소문자만 다른 것은 같다) 정상 관측이나 `EMPTY`로 쓰지 않고 `SCOPE_INCONSISTENT`로 멈춘다. 이것은 연결 PR 가운데 다른 저장소를 기준으로 연 PR을 버리는 규칙(아래 「응답 대응」)과 다르다.
- 커밋마다 `associatedPullRequests(first: 100)`로 연결 PR 첫 100개와 다음 쪽이 있는지(`hasNextPage`)만 받는다. 다음 쪽 cursor를 받지 않고 다음 쪽을 부르지 않는다. 묶음 크기(최대 100)와 커밋당 100개는 별개의 상한이다.
- 응답의 주소·cursor·PR 제목·본문은 다음 요청에 쓰지 않는다. 오류 판정에도 `data` 안의 글은 보지 않는다.

## 두 단계와 묶음

1. 본인 커밋: 관계 문서의 「연결 PR을 조회할 커밋」을 기본 브랜치 목록 순서대로 `max_lookup_batch`(100)개씩 묶어 차례로 묻는다.
2. PR 없는 병합: 1단계를 모두 받은 뒤 그 결과로 후보를 고르고 같은 방식으로 묻는다. 1단계에서 새로 알게 된 PR의 `merge_commit_sha`도 후보에서 빼는 데 쓰인다. 그래서 두 단계를 한 묶음으로 합치지 않는다. 1단계에서 멈췄으면 멈춘 때까지의 결과로 후보만 계획하고 묻지 않는다(`NOT_REACHED`).

묶음은 하나씩 차례로 보내고 동시에 보내거나 미리 보내지 않는다. 대상이 없으면 요청도 없다. 같은 단계에서 같은 SHA를 두 번 묻지 않는다. 커밋 조회와 PR 조회가 모두 허용된 요청에서만 부른다. 그 뒤의 경계 비교(첫 부모...병합)는 REST 그대로다.

## 응답 대응

응답은 요청 때 정한 별칭(`c0`…)과 그 별칭에 묶은 SHA로 커밋에 붙인다. JSON 필드 순서는 쓰지 않는다. 별칭이 빠졌거나 남거나, 커밋이 아니거나, 커밋 SHA가 요청과 다르거나, 필드 타입이 틀리면 그 묶음의 결과를 하나도 쓰지 않고 `COLLECTION_FETCH_FAILED`로 멈춘다. PR은 REST 연결 PR API를 정규화하던 `PullRequestRecord`와 같은 뜻으로 만든다.

| `PullRequestRecord` | GraphQL 필드 | REST 연결 PR API 필드 |
|---|---|---|
| `number`·`title`·`created_at`·`closed_at`·`merged_at` | `number`·`title`·`createdAt`·`closedAt`·`mergedAt` | `number`·`title`·`created_at`·`closed_at`·`merged_at` |
| `body` | `body` | `body`(null이면 빈 글) |
| `state` | `state`: `OPEN`→open, `CLOSED`·`MERGED`→closed. `MERGED`인데 `mergedAt`이 없거나 그 반대면 모양 오류 | `state` |
| `merge_commit_sha` | 병합된 PR의 `mergeCommit.oid` | 병합된 PR의 `merge_commit_sha` |
| `head_sha`·`head_ref`·`base_ref`·`base_sha` | `headRefOid`·`headRefName`·`baseRefName`·`baseRefOid` | `head.sha`·`head.ref`·`base.ref`·`base.sha` |
| `from_fork` | `headRepository`가 null이거나 다른 저장소 | `head.repo`가 null이거나 다른 저장소 |
| 기준 저장소 | `baseRepository.nameWithOwner`. null이면 기준 저장소 불명 | `base.repo.full_name`. 없거나 null이면 불명 |
| `author` | `author`의 `login`과 숫자 ID(`databaseId`, 사용자·봇·Mannequin·조직 유형) | `user.login`·`user.id` |

작성자 숫자 ID는 REST `user.id`와 같은 계정을 가리킨다고 보고 같은 칸에 넣는다. 같은 계정인지는 이 숫자로만 본다. `author`가 명시적으로 null이면 작성자 없음이다. 작성자가 있는데 숫자 ID를 얻지 못하면(숫자 ID가 없는 유형 포함) 작성자 없음으로 바꾸지 않고 모양 오류로 멈춘다. 필드가 응답에 없으면(값이 null인 것과 달리) 모양 오류다. 봇의 로그인은 GraphQL이 `[bot]` 없이 준다(아래 실측). 로그인은 지금 판정·결과 문장에 쓰지 않아 영향이 없다. 삭제된 계정이 연 PR은 REST가 ghost 계정을, GraphQL이 `author` null을 줄 수 있다(미실측). 그러면 연결 PR 조회로만 안 그 PR은 「다른 계정이 연 PR」 대신 작성자를 확인하지 못한 PR(한계 문구 포함)이 된다.

## 결과와 실패

| 관측 | 결과 |
|---|---|
| 다음 쪽 없이 이 저장소를 기준으로 연 PR이 있음 | 그 커밋 `FOUND` |
| 다음 쪽 없이 이 저장소 PR이 없음(다른 저장소 PR만 있음 포함) | 그 커밋 `EMPTY` |
| 다음 쪽이 있거나 기준 저장소를 알 수 없는 PR이 있음 | 그 커밋 `LIMITED`. 받은 이 저장소 PR은 남긴다 |
| 응답이 단일 응답 크기(10 MB)를 넘음 | 그 묶음의 커밋 모두 `LIMITED`. 나눠 다시 부르지 않고 다음 묶음으로 간다 |
| HTTP 401 | `CREDENTIAL_REJECTED` |
| 한도와 무관한 HTTP 403, HTTP 404 | `REPOSITORY_UNREACHABLE` |
| HTTP 429, HTTP 200·403의 한도 오류 | `RATE_LIMITED` |
| 우회 이동(3xx)·5xx(GitHub의 10초 처리 시간 초과 502·504 포함)·응답 대기 초과·연결 오류 | `COLLECTION_FETCH_FAILED`(대기 초과가 수집 시간 마감 때문이면 `TIME_LIMIT_EXCEEDED`) |
| 공통 분류를 통과한 HTTP 200의 한도 밖 `errors`, null 커밋, 모양 오류 | `COLLECTION_FETCH_FAILED` |
| 저장소 이름이 검사한 좌표와 다름 | `SCOPE_INCONSISTENT` |
| 요청 전체의 호출 수·총량·시간 상한 | `BUDGET_EXCEEDED`·`TIME_LIMIT_EXCEEDED`. 총량 상한과 단일 응답 상한이 함께 걸리면 총량 상한이 먼저다 |

HTTP 200도 `errors`가 있으면 성공이 아니다. `errors`와 일부 `data`가 함께 와도 묶음 전체를 쓰지 않는다. 실패하면 그 묶음에서 얻은 관계 상태와 PR 기록을 하나도 남기지 않고, 그 묶음과 뒤에 계획한 커밋은 `NOT_REACHED`로 남는다. 앞서 끝낸 묶음의 결과는 그대로 둔다. 실패를 커밋 수만큼 늘려 적지 않는다. 다시 부르지 않고, 실패한 묶음을 나눠 부르거나 REST로 대신 부르지 않는다.

한도 오류는 HTTP 403 응답과 `errors`가 있는 HTTP 200 응답에서 머리글(`x-ratelimit-remaining: 0`, `retry-after`)과 최상위 `message`·`errors`의 오류 문구(`rate limit`, `abuse detection`)·종류(`RATE_LIMITED`)로 가린다. GitHub 문서상 1차 한도 초과는 HTTP 200에 오류와 `x-ratelimit-remaining: 0`이 함께 오는 응답이라, 그때는 오류 문구와 상관없이 한도 오류로 둔다. `errors`가 없는 HTTP 200의 남은 점수 0은 정상 응답이다. GitHub 문서에 정의되지 않은 종류 값 하나에만 기대지 않으며, 종류·머리글 없이 2차 한도 문구만 있어도 한도 오류다. 한도 오류와 다른 오류가 섞이면 한도 오류로 둔다. 403의 본문이 JSON이 아니면 REST 403처럼 본문에서 `rate limit`을 찾는다. PR 제목·본문 같은 `data` 안의 글은 보지 않는다.

**REST와 실패 코드가 다를 수 있는 곳.** 없는 SHA를 물으면 GraphQL은 오류 없이 그 커밋을 null로 준다(2026-10-12 실측). REST는 422(`COLLECTION_FETCH_FAILED`)를 준다(#267 이슈의 2026-10-10 읽기 조회). 둘 다 `COLLECTION_FETCH_FAILED`다. 다만 저장소에 접근하지 못할 때 REST는 404(`REPOSITORY_UNREACHABLE`)를 주는데, GraphQL은 HTTP 200에 오류를 담아 줄 수 있고 그러면 `COLLECTION_FETCH_FAILED`가 된다. 이 경우는 실측하지 않았다. 저장소 접근은 수집 첫 호출(REST 저장소 확인)에서 먼저 확인하므로, 이 차이는 수집 도중 접근이 바뀐 경우에만 나타난다. **이 차이는 2026-10-12 팀장 결정으로 받아들였다.** GraphQL 오류의 종류 값(`NOT_FOUND`)으로 `REPOSITORY_UNREACHABLE`을 가려내지 않는 것은 GitHub 문서에 정의되지 않은 값에 기대지 않기 위해서다. 어느 코드든 다시 부르지 않고 그 묶음을 쓰지 않은 채 멈추는 처리는 같다.

## 호출 수와 점수

호출 수는 `REST 요청 수 + GraphQL 요청 수`이고 요청 전체 상한(`max_calls`)에 같이 든다. 수집 결과의 `calls`가 이 합이고, `graphql`에 GraphQL 요청 수·확인한 점수의 합·점수를 알 수 없었던 요청 수를 따로 담는다. 수집 종료 로그도 `graphqlCalls`·`graphqlCost`·`graphqlCostUnobserved`를 남긴다(SHA·토큰·응답 원문은 남기지 않는다).

- 점수는 같은 응답의 `rateLimit`으로만 확인하고, 확인용 요청을 따로 보내지 않는다. 보낸 뒤 실패한 요청(대기 초과·연결 오류, HTTP 오류, 최상위 `errors`가 있는 응답), 크기 초과 응답, `rateLimit`이 없거나 null인 응답은 점수를 모르는 요청으로 센다. 0점으로 세지 않는다. 오류 없이 받은 응답이 뒤의 모양 검사(null 커밋·모양 오류·저장소 불일치)에서 실패하면 그 응답이 알린 점수는 확인한 점수로 센다.
- 다른 오류가 없는 정상 응답에서 `rateLimit`이 없거나 null이면 관계 자료는 그대로 쓴다. 그 이유만으로 실패나 `LIMITED`로 바꾸지 않는다.
- 정상 응답이 남은 점수 0을 알렸고 그 점수가 다시 차는 시각 전이면, 남은 묶음을 보내지 않고 `RATE_LIMITED`로 멈춘다. 보내지 않은 요청은 세지 않는다. 그 응답 자체는 쓴다. 마지막 묶음이 점수를 다 썼으면 GraphQL 조회가 끝났으므로 뒤의 REST 조회는 막지 않는다. REST와 GraphQL의 시간당 한도는 따로 센다.

## 제안 상한과 근거

| 상한 | 제안값 | 고른 이유 |
|---|---|---|
| 묶음 크기 `max_lookup_batch` | 100(최대 100) | 아래 실측에서 100개 묶음이 1점이었다. 50개도 1점이라 줄이면 요청 수만 늘고 점수는 줄지 않는다. 100개 묶음은 1.4~2.1초에 끝나 GitHub의 처리 시간 한도(10초)보다 짧다 |
| 요청당 호출 수 `max_calls` | 300회 유지 | 아래 비교에서 본인 커밋 500건·PR 0건 저장소가 216회로 수집을 마치고 후보 판정까지 간다(전에는 300회에서 수집 실패). 관계 조회를 하지 않는 기본 경로의 최악 298회도 그대로 들어간다. 판정에 꼭 필요한 호출은 비교한 모양 모두 114회 이하이고, 남는 호출은 선택 변경 내용이 쓴다 |

**같은 합성 저장소의 호출 수 비교.** 같은 사례(`tests/call_budget_shapes.py`)를 기준 판본 `e09a633`(커밋마다 REST)과 이번 판본(묶음 조회)에서 운영 제안 상한으로 돌렸다. 개수는 #267 「왜」 표의 공개 저장소 모양을 본떴고, 실제 저장소를 부르지 않았다. 변경 내용은 커밋마다 파일 하나를 고친 응답이다. 칸은 목록·PR 커밋 목록·연결 PR 조회·경계 비교·변경 내용 순이다. 파일 모드 확인(diff 형식 조회)은 관계 근거(재제출·cherry-pick 표시)가 있고 모드를 뺀 변경이 같은 쌍에만 생기는데, 여섯 모양에는 그런 쌍이 없어 두 판본 모두 0회라 칸에서 뺐다. 그런 쌍이 있으면 그 커밋마다 REST 1회가 더 든다(두 판본 같음).

| 모양(창 안) | 기준 판본(REST) | 이번 판본(GraphQL) |
|---|---|---|
| 본인 500(병합 2)·PR 0, 경계 열림 2 | 300회 = 8·0·292·0·0, 수집 실패 `BUDGET_EXCEEDED`, 후보 0 | 216회 = 8·0·6·2·200, 후보 199 |
| algo-problem 모양: 조회 499(커밋 496+병합 3) | 300회 = 8·0·292·0·0, 수집 실패, 후보 0 | 217회 = 8·0·6·3·200, 후보 199 |
| Goose 모양: 조회 146(85+61) | 300회 = 8·0·146·61·85 | 156회 = 8·0·2·61·85 |
| BEASTA-ZOO 모양: 조회 106(58+48) | 220회 = 8·0·106·48·58 | 116회 = 8·0·2·48·58 |
| TheMe 모양(모든 이력 484건, PR 2): 조회 168(119+49) | 300회 = 8·2·168·0·122(변경 내용 2건 못 받음) | 137회 = 8·2·3·0·124 |
| PR 중심(PR 100): 조회 19(15+4) | 300회 = 8·100·19·4·169 | 300회 = 8·100·2·4·186 |

호출 상한이 충분하면(5,000회로 비교할 때만) 기준 판본은 710·710·300·220·302·331회, 이번 판본은 216·217·156·116·137·314회를 쓰고 여섯 모양 모두 결과 메시지가 같았다. 상한 300회에서는 이번 판본이 아낀 호출만큼 변경 내용을 더 받아, TheMe 모양처럼 결과가 기준 판본과 다를 수 있다. 이 차이는 확인 범위가 넓어진 것이다.

**실측(2026-10-12).** #267이 허용한 범위(이슈 「왜」 표의 공개 저장소, 담당자 본인 토큰, 읽기 쿼리)에서 이번 구현의 쿼리 틀·전송·응답 검사를 그대로 써서 GraphQL 6회·REST 5회를 불렀다. 쿼리 판본은 측정 때의 `app/collection/graphql.py`(git blob `c30156735d1d`)이고, 100개 묶음의 요청 본문은 12,061 B다. 이 틀이 바뀌면 다시 재거나 차이를 여기에 적는다. 토큰은 GitHub CLI의 OAuth 토큰이고 권한 범위는 `gist`·`project`·`read:org`·`repo`·`workflow`다(값은 남기지 않음). 시간은 이 프로그램 안에서 잰 요청 왕복(연결·TLS 포함, 프로그램 기동 제외)이다.

| 대상과 판본 | 묶음 | 점수 | 시간 | 응답 크기 | 응답 검사 |
|---|---|---|---|---|---|
| `ljm0850/algo-problem` 최근 커밋 100건(머리 `f121172`) | 100 ×3회 | 1·1·1 | 2.06·1.37·1.67초 | 15,127 B | 통과, PR 0 |
| 같은 저장소 | 50 | 1 | 0.76초 | 7,627 B | 통과 |
| 같은 저장소, 실제 커밋 1개와 없는 SHA 1개 | 2 | 1 | 0.43초 | 296 B | 없는 SHA가 오류 없이 null → 모양 오류로 멈춤(`COLLECTION_FETCH_FAILED`) |
| `ljm0850/TheMe` PR 커밋 포함 100건(머리 `694b343`) | 100 | 1 | 1.93초 | 28,387 B | 통과, PR 2건 |

**PR이 많은 묶음의 크기.** PR 한 건의 응답은 본문 없이 약 0.7 KB이고 본문만큼 커진다(TheMe의 PR 2건은 합쳐 약 13 KB). 커밋 100개가 PR을 하나씩 가지면 본문 2,000자일 때 약 0.3 MB(한글이면 0.7 MB), 10,000자 한글이면 약 3 MB로 10 MB 안이다. GitHub 본문 최대 길이(65,536자)의 한글 본문 PR이 한 묶음에 53건쯤 모이면 10 MB를 넘어 그 묶음 전체가 `LIMITED`가 된다. 이 크기는 합성 계산이고, PR이 많은 묶음의 처리 시간 여유는 실측하지 않았다(미검증).

**자격정보 전제.** 일반 사용자 토큰의 기본 한도는 REST 시간당 5,000회, GraphQL 시간당 5,000점이고 둘은 따로 센다. GitHub App 설치 토큰은 저장소·사용자 수에 따라 5,000에서 12,500까지다([REST 한도](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [GraphQL 한도](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api), 2026-10-12 확인). 요청 하나는 REST 한도의 최대 6%(300회)와 GraphQL 점수 10점 안팎(본인 커밋 500건이면 5~6점)을 쓴다. 분 단위 2차 한도는 GraphQL 분당 2,000점, 동시 요청 100건이고 지금은 분석을 한 번에 하나만 한다. A가 줄 토큰([PR #254](https://github.com/JminAILab/CatchU/pull/254), 추가 권한 없는 만료형 사용자 토큰 방향)이 사용자 토큰이 아니거나 이 쿼리를 실행할 수 없거나 한도가 다르면 이 계산을 다시 본다. 담당자 측정용 토큰의 성공은 A가 줄 토큰으로 된다는 증거가 아니다.

## 한계

- 연결 PR 조회는 줄었지만 다른 필수 호출은 그대로 상한에 걸릴 수 있다. PR 100건이 모두 250건 가까운 커밋을 가지면 PR 커밋 목록만 300회이고, 경계가 열린 병합마다 비교가 1~10회다. 이때는 전처럼 `BUDGET_EXCEEDED`로 멈춘다.
- 묶음 하나가 실패하면 그 묶음의 앞쪽 커밋까지 `NOT_REACHED`가 된다(커밋마다 부를 때는 실패한 커밋부터였다). 결과는 어느 쪽이든 수집 실패이고 후보 처리는 확인 중단으로 다룬다.
- 단일 응답 크기를 넘으면 묶음의 모든 커밋이 `LIMITED`다(커밋마다 부를 때는 그 커밋만이었다).
- 커밋 하나에 연결 PR이 여러 개면 GraphQL은 기본으로 만든 순서대로 준다. REST의 순서는 문서에 없어 PR 번호의 순서가 다를 수 있다. 판정은 번호의 순서를 쓰지 않는다.

## 검사와 실제 연결 전 확인할 것

합성 검사(실제 GitHub 없음): `tests/test_collection_graphql.py`(쿼리 틀·변수, 응답 대응, 실패 분류, 점수 기록), `tests/test_collection_lookup_batches.py`(묶음 경계·순서, 앞 묶음 보존, 점수 소진), `tests/test_lookup_call_budget.py`(위 비교의 이번 판본 호출 수와 후보 판정 도달), `tests/test_collection_relations.py`·`test_candidate_cases.py`(기존 관계·후보 사례를 묶음 조회로). 시험용 전송 대역은 GraphQL 요청 본문을 수집 코드와 따로 검사하고, 사례가 정하지 않은 SHA를 빈 목록이 아니라 시험 실패로 둔다. 부르지 않았다는 확인은 요청 본문의 SHA로 한다. 실제 POST 전송(방식·본문·머리글 전달, 고정 호스트, 우회 이동, 크기, 대기, 비밀값)은 `tests/test_collection_transport.py`가 가짜 연결과 이 컴퓨터 안의 시험 서버로 확인한다(TLS·api.github.com 제외).

실측으로 확인한 것과 아직 아닌 것:

- **확인함(2026-10-12, TheMe PR 2건)**: 같은 PR을 REST PR 목록(`GET /repos/{owner}/{repo}/pulls`, 연결 PR API와 같은 PR 요약 모양)과 대조했다. 봇 작성자의 숫자 ID가 REST `user.id`와 같다. 머리·기준 커밋, 두 브랜치 이름, 열린 상태(`OPEN`→open), 만든 시각, 제목, 본문, 포크 여부가 같다. 두 PR 모두 열려 있어 닫은·병합 시각은 둘 다 null인 것만 확인했다. 로그인은 GraphQL `dependabot`, REST `dependabot[bot]`으로 다르다. 100개 묶음이 1점이고 없는 SHA는 null로 온다.
- **확인하지 못함**: 사용자·Mannequin·조직 작성자의 숫자 ID(두 PR 모두 봇), 삭제된 계정 작성자(REST ghost, GraphQL null), 닫히거나 병합된 PR의 상태(`CLOSED`·`MERGED`→closed)와 `closedAt`·`mergedAt` 값, 병합된 PR의 `mergeCommit.oid`와 `merge_commit_sha`, 저장소 접근이 막혔을 때의 응답 모양, PR이 많은 묶음의 처리 시간.
- **[#121](https://github.com/JminAILab/CatchU/issues/121) 실제 연결에서 함께 대조할 것(제안)**: A가 줄 토큰으로 이 쿼리가 실행되는지와 그 한도, PR 번호와 함께 작성자 숫자 ID·병합 커밋 SHA·병합 시각이 REST와 같은지, 요청 하나의 실제 호출 수·점수·시간. #121의 완료 기준을 이 문서가 바꾸지는 않는다.

기준 판본 `e09a633`의 REST 연결 PR 조회 코드는 이번 판본에서 지웠고, 비교용 REST 경로를 운영 코드에 남기지 않았다. 다시 대조하려면 `e09a633`을 꺼낸 작업 폴더의 `worker/tests/`에 이 판본의 `tests/call_budget_shapes.py`를 복사하고, 모양마다 `build(shape).scenario`를 `run_case(..., limits=PROPOSED_LIMITS)`로 돌려 호출 경로를 종류별로 센다. 그 판본의 연결 PR 조회는 REST 경로 `/commits/{sha}/pulls?`이다.
