# U9 받은 사람의 Claude 연결 — 신뢰성 설계

## Sources

작성일: 2026-11-09. 입력:
- U9 비기능 요구사항: [신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[관찰](../nfr-requirements/observability-requirements.md)(observability-requirements)·[기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions)
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W3~W5·처리 순서와 [업무 규칙](../functional-design/rules.md)의 BR2·BR5.2·BR6.3
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-10 post-judgment-rule·deletion-rule, C-15 common-errors
- [비기능 설계 질문·답변](nfr-design-questions.md)의 요약 확인

코드: `api/src/claude-mcp/mcp-tools.ts`, `api/src/publications/publication-access.ts`, `api/src/publications/db-publication-access.ts`, `web/src/lib/copy-text.ts`.

## 범위

실패가 어디서 나서 어떤 결과가 되는지, 링크가 바뀔 때 언제 막히는지, 받은 사람이 결과를 어떻게 알아보는지를 정한다. 가용성·복구 수치는 새로 두지 않는다. U9는 저장하는 자료가 없어 백업·복구 대상이 없다(NFR5.1). 작성자가 발행본을 지우거나 탈퇴하면 사본이 연쇄 삭제되어 판정이나 사본 읽기에서 `LINK_UNAVAILABLE`로 막히고, 읽는 회원이 탈퇴하면 U6 토큰 확인이 막는다. 그래서 C-06 탈퇴 삭제 표에 더할 행이 없다.

## 실패와 결과 (NFR4.7)

받은 링크 읽개는 링크 거부를 `McpLinkDenied`(오류 코드를 담은 이름 붙은 오류)로 던진다. U6 `call()`이 이것을 받아 기록하고 오류 응답으로 바꾼다. 그 밖의 예외는 삼키지 않고 `call()`의 지금 길로 간다.

| 실패 | 던지는 것 | 응답 | 로그 |
|---|---|---|---|
| 입력 모양 틀림 | SDK | SDK 입력 오류 | 없음 |
| 빈도 초과 | `call()` | `RATE_LIMITED` | `mcp_rate_limited`(warn, U6) |
| Redis 없음·오류 | `McpRateLimiter` | 통과 | U6 그대로 |
| 토큰을 못 꺼냄 | `McpLinkDenied('LINK_UNAVAILABLE')` | `LINK_UNAVAILABLE` | `mcp_link_denied`(log) |
| cursor 모양·범위 틀림 | U6 `InvalidCursorError` | `INVALID_CURSOR` | 없음 |
| `LinkUnavailable` | `McpLinkDenied('LINK_UNAVAILABLE')` | `LINK_UNAVAILABLE` | `mcp_link_denied`(log) |
| `LinkPasswordRequired` | `McpLinkDenied('LINK_PASSWORD_REQUIRED')` | `LINK_PASSWORD_REQUIRED` | `mcp_link_denied`(log) |
| 판정 뒤 `readSnapshot`의 `NotFound` | `McpLinkDenied('LINK_UNAVAILABLE')` | `LINK_UNAVAILABLE` | `mcp_link_denied`(log) |
| `PublicationOwnerMissing`, 두 트랜잭션의 DB 실패, 그 밖의 예외 | 그대로 | `INTERNAL_ERROR` | `mcp_tool_failed`(error, 오류 이름) |

- 다시 시도하지 않는다. 읽기 전용 도구라 다시 부를지는 Claude와 받은 사람이 정한다.
- 회로 차단기·대체 응답은 두지 않는다. 의존은 같은 api의 PostgreSQL 하나이고, 실패는 그 호출의 도구 오류로 끝난다. 요청마다 서버 객체가 새로 만들어져 다른 요청에 번지지 않는다.
- 판정 전의 DB 실패도 판정 뒤의 DB 실패도 같은 `INTERNAL_ERROR`다. 삭제로 확인된 것(`NotFound`)만 `LINK_UNAVAILABLE`이다(C-10 deletion-rule).

## 다음 쪽에서 막기 (NFR1.8)

- 쪽마다 판정을 처음부터 다시 한다. 첫 쪽을 읽은 뒤 작성자가 링크를 중지하면, 그 cursor로 부른 다음 쪽은 판정에서 `LINK_UNAVAILABLE`이다.
- 확인은 기능 명세 S10(시험 묶음)과 S23(개발 서버)이다. 이것이 FR19.1 「링크 중지 뒤 MCP 차단」의 U9 쪽 확인이다.

## 판정 뒤 (NFR1.9)

- 판정과 사본 읽기는 `PublicationAccess`가 여는 두 트랜잭션이다. 그 사이에 커밋된 중지·만료·작성자 비활성은 그 호출에 보이지 않고, 그 호출을 취소하지 않는다(C-10 post-judgment-rule).
- U9는 쓰는 것이 없어 되돌릴 저장·차감이 없다.

## 받은 사람이 결과를 구분하기 (NFR7.1)

- PDF의 읽을 수 없는 쪽은 `[n쪽] 읽을 수 없음`으로 쓰고 빈 글로 채우지 않는다.
- Catch 글은 기록에서 확인한 내용과 작성자 설명을 다른 머리말로 나눈다. AI 설명 초안은 넣지 않는다.
- 비밀번호 링크와 링크 불가는 서로 다른 오류 코드와 문구다.

## 복사 실패 (NFR7.2)

- 버튼은 `copyText(navigator.clipboard, 요청 문장)`의 결과를 본다. 이 함수는 클립보드가 없거나 쓰기가 실패하면 예외 대신 false를 돌려준다.
- true면 "복사했습니다", false면 "복사하지 못했습니다. 아래 문장을 직접 선택해 복사해 주세요"를 상태 영역에 보인다. 펼친 안내에는 요청 문장을 언제나 글로 보인다.

## 알려진 한계

- 실제 Claude에서 읽기와 중지 뒤 차단은 U9가 `main`에 오른 뒤 개발 서버에서만 확인할 수 있다(S23). 통합 브랜치에 합칠 때는 S1~S22만 통과한 상태다.

## 채택하지 않은 것

- **서버의 재시도·회로 차단기:** 위 「실패와 결과」의 이유.
- **판정과 사본 읽기를 한 트랜잭션으로 묶기:** C-10이 소비 Unit에 요구하지 않는다. 묶으려면 계약 밖의 `DbPublicationAccess` 내부 함수에 기대야 한다.
