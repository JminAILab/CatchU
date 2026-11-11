# U9 받은 사람의 Claude 연결 — 관찰 설계

## Sources

작성일: 2026-11-09. 입력:
- U9 비기능 요구사항: [관찰](../nfr-requirements/observability-requirements.md)(observability-requirements)·[성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions)
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 「주요 시나리오와 확인」과 [업무 규칙](../functional-design/rules.md)의 BR5.3
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-15 common-errors
- [비기능 설계 질문·답변](nfr-design-questions.md)의 요약 확인

코드: `api/src/claude-mcp/mcp-log.ts`, `api/src/claude-mcp/mcp-tools.ts`, `api/src/rag-answer/rag-answer-log.ts`.

## 범위

서버 로그에 무엇을 어떤 수준으로 남기는지와, 확인 결과를 어떻게 남기는지를 정한다. 지표·추적·알림·관제 화면·SLI/SLO는 만들지 않는다(observability-requirements NFR6.4, performance-requirements NFR4.4).

## 기록 항목 (NFR6.1)

| 사건 | 언제 | 수준 | 칸 |
|---|---|---|---|
| `mcp_rate_limited` | 회원당 1분 60회를 넘었을 때 | warn(U6 그대로) | `event`, `tool` |
| `mcp_tool_failed` | DB 실패, 작성자 회원 행 없음, 그 밖의 예외 | error(U6 그대로) | `event`, `tool`, `error`(오류 이름) |
| `mcp_link_denied` | `LINK_UNAVAILABLE`·`LINK_PASSWORD_REQUIRED`를 돌려줄 때. 토큰을 못 꺼낸 때도 든다 | log | `event`, `tool`, `error`(그 오류 코드) |

- 세 사건 모두 `tool`은 `read_shared_publication`이다. Nest `Logger`의 `ClaudeMcp` 문맥으로 객체 하나를 남긴다(U6 `createMcpLogger`).
- `mcp_link_denied`를 log 수준으로 두는 것은 거부가 중지·만료 같은 정상 결과이기 때문이다. U5 `qna.rejected`와 같은 수준이다.
- 만드는 법:
  - `McpLogEntry`에 `{ event: 'mcp_link_denied'; tool: McpToolName; error: 'LINK_UNAVAILABLE' | 'LINK_PASSWORD_REQUIRED' }`를 더한다.
  - 지금 `warn`·`error`만 있는 `McpLogger`에 `log`를 더한다.
  - `writeMcpLog`는 `mcp_link_denied`만 `log`로 보내고, 다른 사건의 수준은 그대로 둔다.
  - U6 시험의 기록용 logger는 `warn`·`error`만 갖지만 링크 거부를 부르지 않으므로 고치지 않는다. Nest `Logger`에는 `log`가 이미 있다.

## 남기지 않는 것 (NFR6.2)

- 정상 호출과 쪽 수, 입력 모양 오류, `INVALID_CURSOR`.
- 링크·토큰·발행본 ID·발행본 글·cursor·입력 원문·회원 ID·SQL·오류 메시지·stack.
- 링크 불가의 이유(없음·중지·만료 등).
- 사건 타입이 칸을 이름·코드로만 가지므로, 이 값들이 들어갈 자리가 없다.

## 확인 증거 (NFR6.3)

- **시험 묶음:**
  - 기능 명세 S1~S22를 api·web의 기존 시험과 `test:coverage`로 돌린다.
  - 여기에 링크 거부 로그의 모양과 수준(log)을 보는 시험을 더한다. 기록용 logger에 `log`를 둔다.
  - 코드 PR은 U6의 기존 시험을 고치지 않고 통과해야 한다.
- **실제 Claude(S23):**
  - U9가 `main`에 오른 뒤 개발 서버에서 한다. 결과는 FR19 확인 표에 실제 결과·실패·미실행으로 나눠 적는다.
  - 표에 함께 적을 것은 둘이다. 링크 중지 뒤 다음 쪽이 막혔을 때 개발 서버 로그의 `mcp_link_denied`, 그리고 그때 개발 서버의 큐 연결 여부(빈도 제한이 켜졌는지)다.
- 합성 MCP 클라이언트 시험의 통과를 실제 Claude 연결 성공으로 보고하지 않는다.

## 두지 않는 것 (NFR6.4)

- 지표, 분산 추적, 상관 ID, 알림 규칙, 관제 화면, 기간별 사용 횟수 기록, SLI/SLO.
- 이유: 요구사항이 새 수치·관제를 두지 않는다(NFR6, FR13.6). 확인은 위 「확인 증거」로 한다.
