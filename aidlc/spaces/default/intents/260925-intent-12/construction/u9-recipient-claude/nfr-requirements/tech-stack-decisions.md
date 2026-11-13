# U9 받은 사람의 Claude 연결 — 기술 선택

## Sources

작성일: 2026-11-09. 입력:
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 「다른 Unit에 넘기는 것」
- [U9 업무 규칙](../functional-design/rules.md)(rules)
- [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR13.3
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-10·C-11·C-15
- [U6 기술 선택](../../u6-claude-mcp/nfr-requirements/tech-stack-decisions.md)
- [비기능 질문·답변](nfr-requirements-questions.md)의 요약 확인

코드: `api/src/claude-mcp/claude-mcp.module.ts`, `api/src/publications/publications.module.ts`, `web/src/lib/copy-text.ts`, `web/src/lib/routes.ts`.

## 선택

새 의존성, 새 설정 값, 새 표·마이그레이션은 없다. 모두 저장소에 이미 있는 것을 쓴다.

| 자리 | 선택 | 이유 |
|---|---|---|
| api 도구 | U6의 `@modelcontextprotocol/sdk` 1.32.2와 `zod` 4.6.7, 같은 `/v1/mcp`와 `McpTools.forMember` | U6이 고정한 판본이다. 같은 연결에 도구 하나를 더한다(rules BR1.1) |
| 링크 판정·사본 | U4의 C-10 `PublicationAccess`를 `PUBLICATION_ACCESS` 토큰으로 받는다. `ClaudeMcpModule`이 `PublicationsModule`을 가져온다 | 계약 C-10의 소비 방법이다. 발행본 표를 직접 쿼리하지 않는다 |
| 토큰 모양 | `api/src/share-links/link-token.ts`의 `isLinkTokenFormat` | 웹 받은 사람 경로와 같은 검사다(rules BR1.3) |
| cursor·쪽 상한·빈도 | U6 `mcp-page.ts`의 `encodeCursor`·`decodeCursor`(내보내도록 바꿈), `mcp-limits.ts`의 `MCP_PAGE_CHARS`·`MCP_CURSOR_MAX_LENGTH`, `McpRateLimiter` | 같은 연결의 도구끼리 모양과 상한을 맞춘다(rules BR4.1·BR4.5·BR5.1) |
| 로그 | U6 `mcp-log.ts`의 `writeMcpLog`에 `mcp_link_denied` 사건을 정보(`log`) 수준으로 더하고, `McpLogger`에 `log`를 더한다 | Q1, observability-requirements NFR6.1 |
| web 버튼 | 기존 `copyText`, `routes.profileClaude`, U2 `RecipientGuide`의 `showClaudeConnect` | 복사·안내·링크가 이미 있다(rules BR6.3·BR6.4·BR6.6) |
| 시험 | api·web의 기존 시험 묶음과 `test:coverage`, U6 합성 MCP 클라이언트 도우미 | team.md Testing Posture. 측정 도구를 따로 들이지 않는다 |

## 채택하지 않은 것

- **받은 사람 전용 MCP 서버나 주소:** 받은 사람도 같은 방식으로 연결한다(FR13.3). U6 연결과 OAuth를 그대로 쓴다.
- **`DbPublicationAccess`의 트랜잭션 내부 함수 직접 사용:** 계약 C-10 밖이다([신뢰성 요구사항](reliability-requirements.md) 「채택하지 않은 것」).
- **새 복사·알림 라이브러리:** `copyText`와 aria-live 상태 영역으로 충분하다.

## Assumptions & Open Questions

- [assumption] U6 파일의 모양 변경은 U6 동작을 바꾸지 않는다. 변경 내용은 `encodeCursor`·`decodeCursor` 내보내기, 도구 이름·오류 코드·로그 사건 타입 확장, `McpLogger`에 `log` 수준 더하기, `call()` 오류 대응 확장이다. U6의 기존 시험을 고치지 않고 통과하는 것으로 확인한다(functional-spec 「다른 Unit에 넘기는 것」).
- [assumption] U4 `PublicationsModule`은 지금처럼 `PUBLICATION_ACCESS`를 내보낸다. 바뀌면 U4 담당과 맞춘다.
