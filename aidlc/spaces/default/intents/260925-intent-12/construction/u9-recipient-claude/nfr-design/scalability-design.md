# U9 받은 사람의 Claude 연결 — 규모 설계

## Sources

작성일: 2026-11-09. 입력:
- U9 비기능 요구사항: [규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관찰](../nfr-requirements/observability-requirements.md)(observability-requirements)·[기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions)
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)와 [업무 규칙](../functional-design/rules.md)의 BR1.1·BR4.4·BR5.1
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-15 common-errors
- [비기능 설계 질문·답변](nfr-design-questions.md)의 요약 확인

코드: `api/src/claude-mcp/mcp-tools.ts`, `api/src/claude-mcp/mcp-rate-limiter.ts`, `api/src/claude-mcp/mcp-limits.ts`.

## 범위

U9는 시연 규모다. 동시 사용자·처리량·자동 확장 기준은 새로 두지 않는다(scalability-requirements 「범위」). 저장하는 자료가 없어 나눠 담기도 없다.

## 상태 없음 (NFR4.6)

- U6처럼 요청마다 `McpTools.forMember(memberId)`가 새 `McpServer`와 전송 객체를 만든다. 세션이 없다.
- 다음 쪽의 자리는 응답의 `nextCursor`에만 있다. 서버는 쪽 사이에 아무것도 들고 있지 않는다.
- 그래서 api가 여러 개여도 같은 호출은 같은 결과다. 앞단에서 같은 api로 붙일 필요가 없다.

## 빈도 제한 (NFR4.5)

- U6 `McpRateLimiter`를 그대로 쓴다. 키는 회원 하나이고, 1분 창에서 61번째부터 거부한다(`MCP_RATE_LIMIT_PER_WINDOW` 60, `MCP_RATE_WINDOW_MS` 60,000).
- `list_my_catches`·`list_my_text_materials`·`read_shared_publication` 세 도구가 같은 키를 쓴다. 쪽 하나가 호출 하나다.
- 순서는 입력 모양 다음, 토큰 꺼내기 앞이다. 그래서 거부된 호출은 DB를 읽지 않는다.
- 이 제한은 큐 연결(Redis)이 있을 때만 걸린다. 큐 주소가 없거나 오류이면 U6처럼 통과시킨다. 이 상태는 알려진 한계이고, S23 때 개발 서버의 큐 연결 여부를 확인 표에 적는다([관찰 설계](observability-design.md) 「확인 증거」).

## 부담의 크기

- 회원 하나의 가장 큰 부담은 분당 60번의 사본 전체 읽기다. PDF 밖 글은 합계 60,000자(임시값)로 묶이지만, PDF 글은 길이 상한이 없다([성능 설계](performance-design.md) 「글로 펴기와 메모리」).
- 여러 받은 사람이 같은 긴 발행본을 동시에 끝까지 읽으면 DB 일이 사람 수 × 쪽 수만큼 는다. 시연 규모에서 받아들인다.

## 알려진 한계

- 큐 연결 전의 개발 서버와 EKS에서는 받은 링크 읽기에도 빈도 제한이 없다.
- 쪽마다 사본 전체를 다시 읽는다(performance-requirements NFR4.3).
- PDF 글은 길이 상한이 없다. 50쪽과 파일 20 MB 상한만 있어, PDF가 든 발행본을 읽는 호출 하나의 메모리와 글로 펴는 일에 경계가 없다. 큐 연결이 없으면 빈도 제한도 없어 이 부담을 막는 것이 없다.

## 채택하지 않은 것

- **받은 링크 읽기만의 한도, 링크별·발행본별 한도:** scalability-requirements 「채택하지 않은 것」.
- **쪽 사이 공유 캐시(Redis 등):** 쪽마다 판정을 다시 해야 하고, 무효화와 저장 위치가 는다.
