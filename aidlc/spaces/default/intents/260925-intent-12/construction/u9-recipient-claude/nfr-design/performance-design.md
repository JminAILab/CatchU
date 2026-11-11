# U9 받은 사람의 Claude 연결 — 성능 설계

## Sources

작성일: 2026-11-09. 입력:
- U9 비기능 요구사항: [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관찰](../nfr-requirements/observability-requirements.md)(observability-requirements)·[기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions)
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 처리 순서·쪽 나누기 예·S12와 [업무 규칙](../functional-design/rules.md)의 BR3.5·BR4.1~BR4.5
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-10·C-15
- [비기능 설계 질문·답변](nfr-design-questions.md)의 요약 확인

코드: `api/src/claude-mcp/mcp-page.ts`, `api/src/claude-mcp/mcp-limits.ts`, `api/src/publications/publication-access.ts`, `api/src/publications/published-snapshot.ts`.

## 범위

도구 호출 한 번이 하는 일의 모양을 정한다. DB 읽기, 글로 펴기, 쪽 만들기다. 응답 시간·처리량 목표는 두지 않는다(performance-requirements NFR4.4). web 버튼과 안내는 API를 부르지 않으므로 성능 설계가 없다.

## 호출 한 번

순서는 기능 명세 「처리 순서와 결과」 그대로다. 캐시는 없고, 쪽마다 아래를 처음부터 다시 한다.

| 순서 | 일 | 비용 | 요구사항 |
|---|---|---|---|
| 1 | SDK 입력 모양 확인 | DB 없음 | NFR4.2 |
| 2 | U6 빈도 확인 | Redis `EVAL` 한 번 | NFR4.5 |
| 3 | link에서 토큰 꺼내기, cursor 모양 확인 | DB 없음. 2,048자·1,024자 안 | NFR4.2 |
| 4 | `resolveForRecipient(token, null, now)` | 읽기 전용 REPEATABLE READ 트랜잭션 하나 | NFR4.3 |
| 5 | `readSnapshot(publicationId)` | 읽기 전용 트랜잭션 하나. 사본 전체를 읽는다 | NFR4.3 |
| 6 | 모든 항목을 글로 펴기 | 사본 크기에 비례 | NFR4.3 |
| 7 | cursor 범위 확인, 쪽 만들기 | 아래 「쪽 만들기」 | NFR4.1 |

## 쪽 만들기 (NFR4.1)

- **칸 순서:** 응답 객체는 `notice`, `title`, `publishedAt`, `expiresAt`, `items`, `nextCursor` 순서로 만든다. 시각은 ISO 문자열이다. 그래서 `notice`가 언제나 첫 칸이다.
- **길이 재기:** 후보 쪽 전체를 `JSON.stringify`한 길이를 잰다. 채우는 동안 `nextCursor` 칸에는 1,024자(`MCP_CURSOR_MAX_LENGTH`) 문자열을 넣어 둔다. 실제 cursor는 U6 `encodeCursor`가 만든 base64url이다. 이스케이프되지 않고 1,024자 이하이므로, 실제 응답은 잰 길이보다 길지 않다.
- **조각 채우기:** cursor의 (position, offset)부터 항목 순서대로 조각을 하나씩 채운다.
  - **남은 자리:** 쪽 상한 40,000자에서, 이 조각의 content를 빈 글로 둔 후보 쪽의 직렬화 길이를 뺀 값이다. 글자 하나는 직렬화해도 한 글자 이상이므로, 남은 자리보다 긴 글은 들 수 없다.
  - 남은 글 길이가 남은 자리 이하이면 남은 글 전체를 한 조각으로 넣어 본다. 들면 넣고 다음 항목으로 간다.
  - 남은 글이 남은 자리보다 길면 넣어 보지 않고 바로 탐색한다. 넣어 본 조각이 안 들 때도 탐색한다. 탐색은 그 조각의 content를 코드 포인트 경계 위에서 이분 탐색해, 상한 안에 드는 가장 긴 앞부분을 찾는다. 앞부분이 길수록 직렬화 길이도 길어지므로 이분 탐색이 맞다.
  - 탐색 범위의 위 끝은 남은 글 길이와 남은 자리 중 작은 값이다. 탐색 후보에서 상위 서로게이트 바로 뒤 자리는 뺀다.
  - 앞부분에 코드 포인트가 하나도 안 들거나 빈 항목의 머리 칸조차 안 들 때, 쪽에 조각이 있으면 쪽을 닫는다. nextCursor는 {그 position, 0}이다. 쪽이 비어 있으면 코드 포인트 하나(빈 항목이면 빈 조각)를 넣는다(최소 진행).
  - 쪽을 닫을 때 nextCursor를 실제 자른 자리로 만든다. 마지막 항목까지 다 넣었으면 null이다.
- **비용:**
  - 한 번에 재는 후보 쪽에서 조각 글은 남은 자리 이하다. 그래서 재는 길이는 쪽 상한의 몇 배 안이다. 이스케이프로 늘어나도 한 글자가 6자를 넘지 않는다. 남은 글이 아무리 길어도 그 전체를 직렬화하지 않는다.
  - 자를 때 `JSON.stringify`를 남은 자리 글자 수의 log₂번쯤(40,000자면 16번쯤) 부른다. 항목은 20개 이하라 쪽 하나를 만드는 데 드는 일은 몇백만 글자 처리 안이다.
  - 확인은 기능 명세 S12의 P7(쪽별 글이 긴 PDF)이다.
- **긴 Catch 제목:**
  - 이어지는 조각마다 제목을 되풀이하므로, 제목이 길수록 한 쪽에 드는 글이 준다.
  - 제목만으로 자리가 없으면 쪽마다 코드 포인트 하나씩 나아가고, 그 쪽은 40,000자를 넘을 수 있다(performance-requirements NFR4.1).
  - 따로 막는 장치는 두지 않는다. 확인은 기능 명세 S12의 긴 Catch 제목 사례다.

## 글로 펴기와 메모리 (NFR4.3)

- 사본을 읽은 뒤 모든 항목을 한 번에 글로 편다. 같은 사본이면 같은 글이다(rules BR3.5). 쪽 만들기는 편 글의 배열과 항목 머리 칸(position·itemKind·title)만 본다.
- 호출 하나가 사본 전체와 편 글을 함께 메모리에 든다. 그 크기는 이렇다.
  - PDF 밖 글: 합계 60,000자(임시값)가 경계다. 제목·근거 주소·판본은 이 합계에 들지 않는다.
  - PDF 글: 길이 상한이 없다. 50쪽(`PDF_PAGE_LIMIT`)과 파일 20 MB 상한만 있고, 20 MB는 파일 크기라 뽑아낸 글의 길이를 묶지 않는다(rules BR3.5).
- 그래서 PDF가 든 발행본에서는 호출 하나의 메모리와 글로 펴는 일에 경계가 없다. 이것은 알려진 한계로 받아들인다([규모 설계](scalability-design.md) 「알려진 한계」).
- 호출이 끝나면 들고 있던 것은 버린다. 다음 쪽은 처음부터 다시 읽는다.

## 입력 상한 (NFR4.2)

- `link`는 앞뒤 공백을 뗀 뒤 2,048자를 넘으면 DB 앞에서 `LINK_UNAVAILABLE`이다.
- cursor는 U6 `decodeCursor`가 1,024자를 넘거나 모양이 틀리면 거부하고, DB 앞에서 `INVALID_CURSOR`가 된다.

## 채택하지 않은 것

- **글자마다 이스케이프 길이를 더해 가기:** 한 번에 끝나지만 `JSON.stringify`의 이스케이프 규칙(따옴표·역슬래시·제어 문자)을 따로 옮겨 적어야 해서 어긋날 위험이 있다.
- **조각마다 따로 재서 더하기:** 시연 규모에서 아끼는 시간이 작다. 기능 명세가 응답 전체의 직렬화 길이를 재기로 했다(functional-spec 「다른 Unit에 넘기는 것」의 `sizeOf` 줄).
- **cursor 자리부터만 글로 펴기:** DB는 어차피 사본 전체를 읽으므로 줄어드는 비용이 작다.
- **쪽 사이 캐시, 응답 시간 목표·성능 시험:** performance-requirements 「채택하지 않은 것」과 NFR4.4.
