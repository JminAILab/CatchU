# U3 발행본 색인·검색 — 보안 설계

## Sources

작성일: 2026-10-28. 입력: [보안 요구사항](../nfr-requirements/security-requirements.md)(security-requirements)의 NFR1.1~NFR1.3·NFR2.1~NFR2.4, [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W1·W2·W5와 BR6, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-07·C-09·C-10, [비기능 설계 질문·답변](nfr-design-questions.md) Q1, api 현재 코드(`api/src/ai-generation/guarded-fetch.ts`, `api/src/common/node-env.ts`, `api/.env.example`).

## 범위

U3에는 HTTP 경로가 없고 회원 요청을 직접 받지 않는다. 인증·링크 조건 판정은 호출 Unit이 C-10으로 먼저 하므로, U3의 보안 설계는 검색 범위, 색인에 넣는 자료, 키, Voyage 외부 호출, 오류·로그 다섯 가지다. 인증 흐름·CSRF·보안 헤더는 U3에 해당하지 않는다.

## 검색 범위와 색인 자료

| 요구사항 | 설계 |
|---|---|
| NFR1.1 발행본 하나만 검색 | 검색 쿼리는 `WHERE publication_id = $1` 하나로 범위를 정한다. `search`에는 범위를 넓히거나 빼는 인자가 없다. `PublishedSearch` 공개 함수 설명에 "호출자는 C-10 판정을 통과한 뒤에만 부른다"를 적는다. 발행본 두 개로 섞이지 않음을 S8로 확인한다 |
| NFR1.2 화면과 같은 범위 | 조각 나누개가 C-07 필드 목록(BR1.1)만 고른다. `aiDraft`·제목은 고르는 목록에 없다. 조각은 `published_chunk` 한 곳에만 있고 `publication_id`를 따라 연쇄 삭제된다(reliability-design) |
| NFR2.3 Voyage에 보내는 것 | Voyage 요청 본문의 `input`에는 조각 글 배열(문서용) 또는 질문 글 하나(질문용)만 들어간다. 요청을 만드는 함수가 받는 인자도 그 글 배열과 입력 종류뿐이라, 다른 회원 자료·비밀값이 들어갈 자리가 없다 |

## 키와 합성 제공자 (NFR1.3)

- `readEmbeddingConfig(env)`는 `env.CATCHU_EMBEDDING_API_KEY`만 읽는다. `VOYAGE_API_KEY`는 읽지 않고, SDK도 쓰지 않으므로 그 이름이 저절로 읽히는 일도 없다.
- 제공자 만들기 함수의 판정 순서는 다음과 같다.

  | 키 | `NODE_ENV` | 결과 |
  |---|---|---|
  | 있음 | 무엇이든 | Voyage 제공자 |
  | 없음(빈 값·공백 포함) | 정확히 `development`·`test` | 합성 제공자. 만들 때 경고 로그 한 줄(기능 설계 BR6.1, observability-design) |
  | 없음 | 그 밖(미지정 포함) | `CATCHU_EMBEDDING_API_KEY가 비어 있어 임베딩 제공자를 만들 수 없습니다.` 오류. 키 값은 넣지 않는다 |

- 개발·시험 판정은 기존 `isDevelopmentOrTest`(`api/src/common/node-env.ts`)를 쓴다. 다른 설정과 같은 기준이다.
- 키는 Voyage 요청의 `Authorization: Bearer` 머리글에만 쓴다. 제공자 객체는 키를 내보내는 속성·`toString`을 두지 않고, 로그 칸에 키가 들어갈 자리가 없다.
- U3 코드 PR에서는 앱에 등록하지 않는다(Q1). 이 판정은 시험으로 확인하고, 통합 PR에서 api 기동 경로에 들어간다(logical-components 「통합 때 할 일」).

## Voyage 외부 호출 (NFR2.1·NFR2.2)

```text
// 설명용 모양(코드 생성에서 완성, 의사 코드)
const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings'; // 코드 상수, 환경변수로 바꾸지 않음
const fetchWithLimits = createGuardedFetch(baseFetch, 8 * 1024 * 1024);  // 8 MiB를 반드시 넘김(기본은 256 KiB)
const response = await fetchWithLimits(VOYAGE_EMBEDDINGS_URL, {
  method: 'POST', headers, body,
  signal: AbortSignal.timeout(inputType === 'document' ? 30_000 : 10_000),
});
if (!response.ok) { await response.body?.cancel(); throw new EmbeddingProviderError('API_STATUS', response.status); }
const parsed = parseEmbeddingResponse(await response.text(), expectedCount);  // 같은 signal 아래에서 읽음
```

| 상한 | 설계 |
|---|---|
| ① 주소 | `VOYAGE_EMBEDDINGS_URL` 상수 하나. 설정·환경변수·인자로 바꾸는 길이 없다. 시험용 fetch가 받은 주소가 이 상수와 같은지 확인한다 |
| ② redirect | U1 `createGuardedFetch`가 `redirect: 'manual'`로 보내고 3xx면 `GuardedFetchError('REDIRECT_REJECTED')`를 낸다. U3이 이를 `EmbeddingProviderError('REDIRECT_REJECTED')`로 바꾼다 |
| ③ 본문 8 MiB | `createGuardedFetch(baseFetch, 8 MiB)`로 부른다. 넘으면 `RESPONSE_TOO_LARGE`. 상한 상수를 U3 쪽에 두고, 256 KiB를 넘고 8 MiB 이하인 응답을 받는 시험으로 인자를 넘겼는지 확인한다 |
| ④ 시간 제한 | `createGuardedFetch`는 시간 제한을 하지 않으므로 U3 호출부가 `AbortSignal.timeout`을 `init.signal`로 넘긴다. 응답 본문 읽기(`response.text()`)도 같은 신호 아래에서 끝나므로, 본문을 읽는 도중 시간이 지나면 읽기가 중단되고 `TIMEOUT` 제공자 오류가 된다. 이때 나는 오류 이름은 `TimeoutError`다. 본문을 천천히 흘리는 시험용 fetch로 확인한다 |
| 재시도 0 | 제공자는 한 번만 보낸다. 처리기·검색도 다시 부르지 않는다(reliability-design) |
| 의존성 | SDK·HTTP 클라이언트를 더하지 않는다. 전역 `fetch`와 U1 파일만 쓰고 U1 파일은 고치지 않는다(tech-stack-decisions) |

**오류 분류.** 요청 보내기(`fetchWithLimits(...)`)부터 본문 읽기(`response.text()`)와 응답 검사까지를 try/catch 하나로 묶는다. 8 MiB 초과는 본문을 읽는 도중에 스트림 오류로 나오고, 시간 초과도 본문 읽기 중에 날 수 있기 때문이다. 잡은 오류는 아래 표대로 바꾸며, 원래 오류의 메시지는 옮기지 않는다.

| 잡은 오류 | `EmbeddingProviderError` 종류 |
|---|---|
| `GuardedFetchError('REDIRECT_REJECTED')` | `REDIRECT_REJECTED` |
| `GuardedFetchError('RESPONSE_TOO_LARGE')`(본문 읽기 도중) | `RESPONSE_TOO_LARGE` |
| 이름이 `TimeoutError`인 오류, 또는 넘긴 `signal.aborted`가 참일 때의 오류 | `TIMEOUT` |
| 2xx가 아닌 응답(본문은 읽지 않고 취소) | `API_STATUS`(HTTP 상태 함께) |
| 응답 JSON 해석 실패, 개수·차원·숫자 검사 불일치 | `INVALID_RESPONSE` |
| 그 밖의 전송 오류(`TypeError` 등) | `CONNECTION_FAILED` |

이미 `EmbeddingProviderError`인 오류는 그대로 다시 던진다. 시험 목록에는 시간 초과·redirect·오류 응답과 함께 "본문을 읽는 도중 8 MiB를 넘는 응답(머리글은 정상이고 본문만 큼)"을 넣어 `RESPONSE_TOO_LARGE`로 분류되는지 확인한다.

요청 본문은 `{ input, model: 'voyage-4-lite', input_type: 'document' | 'query', output_dimension: 1024 }` 모양으로 본다. 칸 이름·값은 코드 착수 첫 단계에서 Voyage 공식 문서로 확인한다(NFR2.1). 응답은 `data[].embedding`·`data[].index`·`usage.total_tokens`를 읽는다고 보고, 개수가 보낸 글 수와 다르거나 벡터 길이가 1024가 아니거나 유한한 숫자가 아니면 `INVALID_RESPONSE`로 낸다(BR2.3).

## 호출 횟수 상한 (NFR2.4)

- 문서 임베딩: 처리기가 조각을 128개씩 묶어 차례로 보낸다. 한 작업의 호출 수는 `ceil(조각 수 / 128)`이고, 하나가 실패하면 남은 묶음은 보내지 않는다.
- [검색 다시 준비]: `requestReindex`가 조건부 UPDATE(`status = 'FAILED'`)에 성공했을 때만 작업을 등록한다.
- 질문 임베딩: `search` 한 번에 `embedQuery` 한 번. 색인이 `DONE`이 아니거나 질문이 비었거나 `limit`가 범위 밖이면 부르지 않는다(W5 1·2·4단계가 5단계보다 먼저).
- 질문 횟수 상한은 호출 Unit이 지킨다(U5 링크당 하루 제한, JD 요약 경로는 FR6.6 계정당 하루 제한). U3은 횟수를 세지 않는다.

## 입력 검증

- `search`의 `limit`는 1~50의 정수가 아니면 인자 오류(BR5.5). `query`는 문자열이며 비었거나 공백뿐이면 빈 결과(BR5.6). 질문 길이 상한은 요구사항에 없어 두지 않는다. 질문 글은 SQL에 넣지 않고 Voyage에만 보낸다.
- DB 쿼리는 모두 매개변수 자리(`$1`…)로 값을 넘긴다. 벡터는 숫자 배열을 `'[...]'` 문자열로 만들어 `$n::vector`로 넘긴다. 숫자는 Voyage 응답에서 검사를 통과한 유한한 값만 쓴다.
- 조각 나누개는 사본 모양이 C-07과 다르면 예외를 던진다(BR1.7). 사본은 U4가 쓴 값이지만 형태를 믿지 않고 검사한다.
- 임베딩은 생성 모델이 아니라 숨긴 지시가 실행될 자리가 없다. 조각 글에 지시문이 있어도 벡터만 만든다.

## 오류와 로그에 넣지 않는 것 (NFR6.3과 함께)

- `EmbeddingProviderError`는 실패 종류(`REDIRECT_REJECTED`·`RESPONSE_TOO_LARGE`·`TIMEOUT`·`CONNECTION_FAILED`·`API_STATUS`·`INVALID_RESPONSE`)와 HTTP 상태만 갖는다. 메시지는 종류별 고정 문구다.
- 2xx가 아닌 응답은 본문을 읽지 않고 취소한다. 그래서 Voyage가 오류 본문에 보낸 글을 되돌려 줘도 오류 메시지·로그로 옮겨질 길이 없다. 보낸 글을 담은 합성 오류 응답으로 확인한다.
- 전송 오류(`TypeError`)와 시간 초과(`TimeoutError`)도 원문 메시지를 옮기지 않고 종류만 남긴다(「오류 분류」 표).
- 키·조각 글·질문 글·사본 내용·요청 본문은 로그 칸에 없다(observability-design의 칸 목록이 전부다).

## 위협과 대응

| 위협 | 대응 |
|---|---|
| 다른 발행본·넣지 않은 자료가 검색됨 | `publication_id` 하나로 범위를 정한 쿼리, 조각 나누개의 필드 목록, 호출자의 C-10 판정 |
| 지운 발행본의 조각이 남음 | 연쇄 삭제와 늦은 결과 버림(reliability-design) |
| 키 노출, 배포 환경에서 합성 결과를 실제처럼 씀 | 키는 머리글에만, 개발·시험 밖 키 없음은 오류, 합성 제공자 경고 로그 |
| 설정으로 호출 주소를 바꿔 자료를 다른 곳으로 보냄 | 주소 상수 |
| redirect·큰 응답·느린 응답 | 지키는 fetch(8 MiB)와 본문 읽기까지 덮는 시간 제한 |
| 반복 다시 준비·빈 질문으로 비용 소모 | 조건부 UPDATE 뒤에만 등록, 호출 전 검사 순서 |
| 오류 본문·전송 오류 메시지로 글이 로그에 남음 | 오류 본문을 읽지 않음, 고정 문구 메시지 |

## 두지 않는 것

앱 수준 암호화, 별도 비밀값 저장소 연동 코드, 질문 길이 상한, 회원 단위 호출 횟수 세기는 두지 않는다. 배포 환경 키는 팀장이 SSM으로 넣는 기존 방식이고, 나머지는 요구사항에 근거가 없다.
