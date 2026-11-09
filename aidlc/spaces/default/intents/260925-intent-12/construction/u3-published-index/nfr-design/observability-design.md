# U3 발행본 색인·검색 — 관측 설계

## Sources

작성일: 2026-10-28. 입력: [관측 요구사항](../nfr-requirements/observability-requirements.md)(observability-requirements)의 NFR6.1~NFR6.3, [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 「주요 시나리오와 확인」 S12와 BR6.2, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 「에러 대응 최소선」, [비기능 설계 질문·답변](nfr-design-questions.md), api 현재 코드(`api/src/ai-generation/ai-generation.gate.ts`의 로그 방식).

## 범위

NFR6은 별도 관제 화면을 만들지 않는다. U3의 관측은 api 로그 몇 줄과, 실제 Voyage 연결 확인을 합성 결과와 구분해 보고하는 것이다. NFR4가 새 수치를 막으므로 SLI·SLO·경보 기준은 두지 않는다.

## 로그 방식

U1과 같이 Nest `Logger`에 객체 하나를 넘긴다(`logger.log({ event, ... })`). 칸은 아래 표가 전부이며, 각 칸의 값은 ID·개수·상태 이름·실패 종류·숫자뿐이다. 로그 객체는 이 칸만 가진 타입으로 만들어, 조각 글·질문 글·키·응답 본문이 들어갈 자리가 없게 한다(NFR6.3).

| 사건 `event` | 수준 | 칸 | 언제 |
|---|---|---|---|
| `EMBED_PUBLICATION_COMPLETED` | log | publicationId, chunkCount, batchCount, result(`DONE`), totalTokens, durationMs | 저장 성공(조각 0개면 batchCount 0, totalTokens 0) |
| `EMBED_PUBLICATION_FAILED` | warn | 위 칸 + result(`FAILED`), failure(실패 종류), httpStatus(없으면 null) | 제공자 실패로 `FAILED` 저장 |
| `EMBED_PUBLICATION_DISCARDED` | log | publicationId, chunkCount(읽기 전이면 null), result(`DISCARDED`), reason(`NO_INDEX`·`NOT_PENDING`·`DEADLINE_PASSED`·`PARENT_GONE`), durationMs | 시작·저장 때 조건이 맞지 않아 버림 |
| `EMBED_PUBLICATION_ERROR` | error | publicationId, failure(`UNEXPECTED_ERROR`), durationMs | 예기치 못한 오류. 남긴 뒤 던진다 |
| `PUBLISHED_SEARCH_FAILED` | warn | publicationId, failure, httpStatus, durationMs | 검색의 질문 임베딩 실패. 정상 검색은 남기지 않는다 |
| `PUBLISHED_REINDEX` | log(등록 실패면 warn) | publicationId, result(`REQUEUED`·`NOT_FAILED`), enqueueFailed(boolean) | `requestReindex` 끝 |
| `EMBEDDING_PROVIDER_SYNTHETIC` | warn | (칸 없음) | 키 없이 개발·시험에서 합성 제공자를 만들 때 한 번. 근거는 기능 설계 BR6.1("개발·시험이고 키가 비었으면 합성 제공자를 쓰고 기동 로그에 한 줄 알린다")이다 |

- `totalTokens`는 묶음마다 Voyage 응답의 토큰 수(`usage.total_tokens`로 보고 코드 착수 때 확인)를 더한 값이다. 합성 제공자는 0을 돌려준다.
- `failure` 값은 security-design 「오류 분류」의 `EmbeddingProviderError` 종류(`REDIRECT_REJECTED`·`RESPONSE_TOO_LARGE`·`TIMEOUT`·`CONNECTION_FAILED`·`API_STATUS`·`INVALID_RESPONSE`)다. 오류 응답 본문은 읽지 않으므로 로그에 옮겨질 수 없다.
- 로그 한 줄로 한 작업·한 검색을 알 수 있어 별도 상관 ID는 두지 않는다. 작업은 `publicationId`로 이어 본다.

## 실제 연결 확인 (NFR6.1)

- S12는 `api/test/published-index/live-embedding.test.cjs` 같은 시험 파일 하나로 두고, `process.env.CATCHU_EMBEDDING_API_KEY`가 없으면 `skip`으로 건너뛴다. U1의 S8 시험(`api/test/ai-generation/live-citation.test.cjs`)과 같은 방식이다.
- PR 검사 보고에는 S12를 "통과"·"미실행(키 없음)" 가운데 하나로 따로 적는다. S1~S11 통과는 합성 제공자 결과로 적고, 실제 임베딩 성공으로 적지 않는다.
- S12 출력에는 상태·조각 개수·맞은 조각의 위치(`fieldPath`·`charStart`·`charEnd`)만 남기고 조각 글·키는 남기지 않는다. 이 결과를 '최소 연결 첫 결과' 승인 자료로 쓴다(team.md Walking Skeleton).

## 시험으로 확인하는 것

- 로그 내용 확인 시험: 각 사건에서 남긴 객체의 칸 이름이 표와 같고, 시험에 쓴 조각 글·질문 글·키 문자열이 로그 출력 어디에도 없다(S10 포함).
- 보낸 글을 담은 합성 오류 응답(HTTP 400)으로 검색과 임베딩 작업을 실패시킨 뒤, 그 글이 로그·오류 메시지에 없는지 확인한다(security-design 「오류와 로그에 넣지 않는 것」).

## 두지 않는 것

지표 수집, 경보, 대시보드, 분산 추적, 정상 검색마다 남기는 기록은 두지 않는다(observability-requirements 「채택하지 않은 것」).
